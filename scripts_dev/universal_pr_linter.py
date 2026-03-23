#!/usr/bin/env python3
"""universal_pr_linter.py

One script to lint *any* repository/folder/PR you point it to, headlessly, using
MegaLinter inside Docker.

What it does
------------
- Accepts many kinds of inputs:
  * Local folder
  * Local git repo / worktree
  * Remote git URL (https/ssh)
  * GitHub repo URL
  * GitHub PR URL
  * Shorthand: ORG/REPO#123
- Materializes the target into a temporary *workspace copy* (read-only guarantee).
- Computes PR changed files when possible and lints only those; otherwise lints
  the whole codebase.
- Runs MegaLinter in Docker (so it brings all linters and dependencies).
- Writes a report folder (HTML/logs/artifacts produced by MegaLinter).

Read-only guarantee
-------------------
This script never writes to your source tree. It always lints a temporary copy.
It also runs MegaLinter with APPLY_FIXES=none and mounts the workspace as
read-only into the container.

Requirements
------------
- Python 3.8+
- git
- docker (Docker Desktop / Engine). The script emits actionable help if missing.

MegaLinter configuration reference
----------------------------------
https://megalinter.io/beta/configuration/
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, NoReturn, Optional, Tuple


MEGALINTER_IMAGE_DEFAULT = "oxsecurity/megalinter:v9"  # stable major tag
REPORT_DIRNAME_DEFAULT = "megalinter-reports"


class CmdError(RuntimeError):
    """A user-facing error with actionable context."""


def _is_windows() -> bool:
    return os.name == "nt"


def _fmt_cmd(cmd: List[str]) -> str:
    """Readable, copy/paste friendly command string."""
    if _is_windows():
        return subprocess.list2cmdline(cmd)

    # POSIX: quote args safely
    import shlex

    return " ".join(shlex.quote(c) for c in cmd)


def _die(msg: str, code: int = 2) -> NoReturn:
    print(msg.rstrip() + "\n", file=sys.stderr)
    raise SystemExit(code)


def _run(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    check: bool = True,
) -> subprocess.CompletedProcess:
    p = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    if check and p.returncode != 0:
        raise CmdError(
            "Command failed.\n"
            f"  Exit code: {p.returncode}\n"
            f"  Command:   {_fmt_cmd(cmd)}\n\n"
            "Output:\n"
            f"{p.stdout.strip()}"
        )
    return p


def _which(prog: str) -> Optional[str]:
    return shutil.which(prog)


def _ensure_tools() -> None:
    missing = [tool for tool in ("git", "docker") if _which(tool) is None]
    if missing:
        lines = ["Missing required tools: " + ", ".join(missing), ""]
        if "git" in missing:
            lines += [
                "Install Git and ensure it is on your PATH.",
                "- macOS (Homebrew): brew install git",
                "- Ubuntu/Debian:    sudo apt-get install git",
                "- Windows:          https://git-scm.com/download/win",
                "",
            ]
        if "docker" in missing:
            lines += [
                "Install Docker and ensure the `docker` CLI is on PATH.",
                "- macOS/Windows: Docker Desktop",
                "- Linux: Docker Engine (or compatible)",
                "Then start the Docker daemon.",
                "",
            ]
        raise CmdError("\n".join(lines))

    # Docker installed but daemon not running / not accessible.
    p = _run(["docker", "info"], check=False)
    if p.returncode != 0:
        hints = [
            "Docker is installed but not usable (daemon stopped, or permission denied).",
            "",
            "How to fix:",
        ]
        if _is_windows():
            hints += [
                "- Start Docker Desktop and wait until it shows 'Running'.",
                "- If using WSL, enable Docker Desktop integration for your distro.",
                "- If you see mount errors, ensure the workspace directory is shared with Docker Desktop.",
            ]
        else:
            hints += [
                "- Start the Docker daemon (e.g. `sudo systemctl start docker`).",
                "- Verify with `docker info`.",
                "- On Linux, you may need docker group access:",
                "    sudo usermod -aG docker $USER  (then log out/in)",
            ]
        hints += ["", "Docker output:", p.stdout.strip()]
        raise CmdError("\n".join(hints))


def _parse_source(source: str) -> Tuple[str, Optional[str], Optional[int]]:
    """Return (kind, repo_url_or_path, pr_number)

    kind in {"local_path", "git_url", "github_pr"}
    """

    s = source.strip()

    # owner/repo#123 shorthand
    m = re.fullmatch(r"([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)#(\d+)", s)
    if m:
        owner, repo, pr = m.group(1), m.group(2), int(m.group(3))
        return "github_pr", f"https://github.com/{owner}/{repo}.git", pr

    # GitHub PR URL: https://github.com/OWNER/REPO/pull/123
    m = re.match(r"^https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)(?:/.*)?$", s)
    if m:
        owner, repo, pr = m.group(1), m.group(2), int(m.group(3))
        return "github_pr", f"https://github.com/{owner}/{repo}.git", pr

    p = Path(os.path.expanduser(s))
    if p.exists():
        return "local_path", str(p.resolve()), None

    # git URL (https/ssh)
    if re.match(r"^(https?|ssh)://", s) or re.match(r"^git@[^:]+:.+\.git$", s) or s.endswith(".git"):
        return "git_url", s, None

    # github repo without .git
    m = re.fullmatch(r"https?://github\.com/([^/]+)/([^/]+)(?:/)?", s)
    if m:
        owner, repo = m.group(1), m.group(2)
        return "git_url", f"https://github.com/{owner}/{repo}.git", None

    raise CmdError(
        "Unrecognized source. Provide one of:\n"
        "- local path (repo or folder)\n"
        "- git url (https/ssh)\n"
        "- GitHub PR url (https://github.com/ORG/REPO/pull/123)\n"
        "- shorthand ORG/REPO#123\n"
    )


def _is_git_repo(path: Path) -> bool:
    try:
        _run(["git", "rev-parse", "--is-inside-work-tree"], cwd=path, check=True)
        return True
    except CmdError:
        return False


def _copy_tree_readonly(src: Path, dst: Path) -> None:
    """Copy files into dst. This is our "read-only guarantee": we never touch src."""

    if dst.exists():
        shutil.rmtree(dst)

    # Windows often blocks symlink creation; try symlinks=True, fall back on Windows.
    try:
        shutil.copytree(src, dst, symlinks=True)
    except (OSError, NotImplementedError):
        if _is_windows():
            shutil.copytree(src, dst, symlinks=False)
        else:
            raise


def _clone_repo(repo_url: str, dst: Path, token: Optional[str]) -> None:
    """Clone remote repo into dst.

    IMPORTANT: avoid printing tokens. We intentionally do NOT include the clone
    command in raised errors.
    """

    if dst.exists():
        shutil.rmtree(dst)

    cmd: List[str]
    env = os.environ.copy()

    # For GitHub HTTPS + token, use extraheader rather than embedding in URL.
    # NOTE: the token may still appear in process listings on some OSes.
    # We mitigate by never printing the full command line on errors.
    if token and repo_url.startswith("https://github.com/"):
        cmd = [
            "git",
            "-c",
            f"http.extraheader=AUTHORIZATION: bearer {token}",
            "clone",
            "--no-tags",
            "--filter=blob:none",
            repo_url,
            str(dst),
        ]
    else:
        cmd = ["git", "clone", "--no-tags", "--filter=blob:none", repo_url, str(dst)]

    p = subprocess.run(
        cmd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    if p.returncode != 0:
        help_lines = [
            "Failed to clone the repository.",
            "",
            "Actionable fixes:",
            "- Check the URL is correct and reachable.",
            "- For private GitHub repos, export a token and rerun:",
            "    macOS/Linux:  export GITHUB_TOKEN=...",
            "    Windows PS:   setx GITHUB_TOKEN ...   (open a new terminal after)",
            "- If using SSH URLs (git@...), ensure your SSH key is loaded and has access.",
            "",
            "Clone output:",
            p.stdout.strip(),
        ]
        raise CmdError("\n".join(help_lines))


def _git_default_branch(repo_dir: Path) -> str:
    # Most reliable: origin/HEAD symbolic ref
    p = _run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], cwd=repo_dir, check=False)
    if p.returncode == 0:
        ref = p.stdout.strip()
        if ref.startswith("refs/remotes/origin/"):
            return ref.split("refs/remotes/origin/", 1)[1]

    # fallback: parse remote show
    p = _run(["git", "remote", "show", "origin"], cwd=repo_dir, check=False)
    m = re.search(r"HEAD branch:\s*(\S+)", p.stdout)
    if m:
        return m.group(1)

    return "main"


def _fetch_pr(repo_dir: Path, pr_number: int) -> str:
    """Fetch GitHub PR head into local branch pr/<n> and check it out."""

    branch = f"pr/{pr_number}"
    try:
        _run(["git", "fetch", "origin", f"pull/{pr_number}/head:{branch}"], cwd=repo_dir, check=True)
        _run(["git", "checkout", "--force", branch], cwd=repo_dir, check=True)
    except CmdError as e:
        raise CmdError(
            "Failed to fetch/check out the PR head ref from origin.\n"
            "This PR-fetch method uses GitHub's `pull/<n>/head` ref.\n\n"
            "Actionable fixes:\n"
            "- If this is NOT GitHub, use --ref instead (e.g. the MR branch).\n"
            "- Ensure the remote is `origin` and points to the hosting service.\n"
            "- For private repos, ensure your token/SSH access is valid.\n\n"
            + str(e)
        )

    return branch


def _checkout_ref(repo_dir: Path, ref: str) -> None:
    _run(["git", "fetch", "--all", "--prune"], cwd=repo_dir, check=False)
    # Try ref as-is; if that fails, try origin/<ref>.
    try:
        _run(["git", "checkout", "--force", ref], cwd=repo_dir, check=True)
    except CmdError:
        _run(["git", "checkout", "--force", f"origin/{ref}"], cwd=repo_dir, check=True)


def _changed_files(repo_dir: Path, base_ref: str, head_ref: str) -> List[str]:
    """Return changed file paths relative to repo root (POSIX-style)."""

    _run(["git", "fetch", "origin", base_ref], cwd=repo_dir, check=False)

    mb = _run(["git", "merge-base", head_ref, f"origin/{base_ref}"], cwd=repo_dir, check=True).stdout.strip()
    diff = _run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRTUXB", mb, head_ref],
        cwd=repo_dir,
        check=True,
    ).stdout

    files = [line.strip() for line in diff.splitlines() if line.strip()]
    return [Path(f).as_posix() for f in files]


def _zip_dir(src_dir: Path, zip_path: Path) -> None:
    import zipfile

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in src_dir.rglob("*"):
            if p.is_file():
                z.write(p, p.relative_to(src_dir))


def _docker_pull(image: str) -> None:
    try:
        _run(["docker", "pull", image], check=True)
    except CmdError as e:
        raise CmdError(
            "Failed to pull the MegaLinter Docker image.\n\n"
            "Actionable fixes:\n"
            "- Verify network connectivity and that Docker can reach registries.\n"
            "- If behind a proxy, configure Docker proxy settings.\n"
            "- If using a custom image, verify the name/tag is correct.\n\n"
            + str(e)
        )


def _run_megalinter_docker(
    repo_dir: Path,
    report_dir: Path,
    image: str,
    files_to_lint: Optional[List[str]],
    validate_all_codebase: bool,
    extra_env: List[str],
    dry_run: bool,
) -> int:
    """Run MegaLinter in Docker. Return its exit code."""

    report_dir.mkdir(parents=True, exist_ok=True)

    container_workspace = "/tmp/lint"
    container_reports = "/tmp/reports"

    env_args = [
        "-e",
        f"DEFAULT_WORKSPACE={container_workspace}",
        "-e",
        f"REPORT_OUTPUT_FOLDER={container_reports}",
        "-e",
        "APPLY_FIXES=none",  # hard-disable fixes (read-only)
        "-e",
        f"VALIDATE_ALL_CODEBASE={'true' if validate_all_codebase else 'false'}",
        "-e",
        "LOG_LEVEL=INFO",
        "-e",
        "PRINT_ALPACA=false",
        "-e",
        "CLEAR_REPORT_FOLDER=true",
    ]

    if files_to_lint:
        joined = ",".join(files_to_lint)
        env_args += ["-e", f"MEGALINTER_FILES_TO_LINT={joined}"]

    for kv in extra_env:
        if "=" not in kv:
            raise CmdError(f"Invalid --env value (expected KEY=VALUE): {kv}")
        env_args += ["-e", kv]

    # Use --mount (more reliable than -v on Windows and with spaces).
    repo_mount = f"type=bind,source={str(repo_dir)},target={container_workspace},readonly"
    reports_mount = f"type=bind,source={str(report_dir)},target={container_reports}"

    full_cmd = [
        "docker",
        "run",
        "--rm",
        "--mount",
        repo_mount,
        "--mount",
        reports_mount,
        *env_args,
        image,
    ]

    if dry_run:
        print("[dry-run] Would run:\n  " + _fmt_cmd(full_cmd))
        return 0

    # Stream MegaLinter output directly.
    p = subprocess.run(full_cmd)
    return int(p.returncode)


def _ensure_writable_dir(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
        test = path / ".__write_test__"
        test.write_text("ok", encoding="utf-8")
        test.unlink(missing_ok=True)
    except Exception as e:
        raise CmdError(
            "Cannot write to the report directory.\n"
            f"  Path: {path}\n\n"
            "Actionable fixes:\n"
            "- Choose a different --report-dir (e.g. inside your home directory).\n"
            "- Fix permissions of the target folder.\n\n"
            f"Underlying error: {e}"
        )


def _make_workspace_root(args_workspace_dir: Optional[str]) -> Path:
    """Pick where the temporary workspace should live.

    If --workspace-dir is provided, create a unique subdirectory inside it.
    Otherwise, use the OS temp directory.
    """

    if not args_workspace_dir:
        return Path(tempfile.gettempdir())

    root = Path(os.path.expanduser(args_workspace_dir)).resolve()

    # Ensure it exists and is writable.
    try:
        root.mkdir(parents=True, exist_ok=True)
        test = root / ".__workspace_write_test__"
        test.write_text("ok", encoding="utf-8")
        test.unlink(missing_ok=True)
    except Exception as e:
        raise CmdError(
            "Cannot use --workspace-dir (not writable or cannot be created).\n"
            f"  Path: {root}\n\n"
            "Actionable fixes:\n"
            "- Pick a directory you can write to (e.g. inside your home folder).\n"
            "- Fix permissions for that directory.\n\n"
            f"Underlying error: {e}"
        )

    return root


def main(argv: Optional[List[str]] = None) -> int:
    epilog = r"""
Examples (common)
-----------------

GitHub PR URL:
  python3 universal_pr_linter.py https://github.com/ORG/REPO/pull/123

Shorthand:
  python3 universal_pr_linter.py ORG/REPO#123

Repo URL + PR number:
  python3 universal_pr_linter.py https://github.com/ORG/REPO.git --pr 123

Local repo (including worktrees):
  python3 universal_pr_linter.py /path/to/repo --pr 123

Lint a specific ref (branch/tag/commit):
  python3 universal_pr_linter.py https://github.com/ORG/REPO.git --ref feature-branch

Non-git folder (lints everything):
  python3 universal_pr_linter.py /path/to/folder

Force full lint (ignore PR diff):
  python3 universal_pr_linter.py ORG/REPO#123 --all

Use a Docker-shared workspace directory (recommended on macOS/Windows if mounts fail):
  python3 universal_pr_linter.py ORG/REPO#123 --workspace-dir ~/lint-workspaces

Write reports somewhere specific:
  python3 universal_pr_linter.py ORG/REPO#123 --report-dir ./reports --zip

Extra MegaLinter env vars:
  python3 universal_pr_linter.py ORG/REPO#123 --env LOG_LEVEL=DEBUG --env PARALLEL=true

Dry run:
  python3 universal_pr_linter.py ORG/REPO#123 --dry-run
"""

    ap = argparse.ArgumentParser(
        description="Universal, read-only PR linter runner using MegaLinter (Docker).",
        epilog=epilog,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    ap.add_argument(
        "source",
        help="Local path, git URL, GitHub PR URL, or ORG/REPO#PR.",
    )
    ap.add_argument(
        "--pr",
        type=int,
        default=None,
        help="PR number (if source is a repo URL/path).",
    )
    ap.add_argument(
        "--ref",
        default=None,
        help="Git ref/branch/commit to lint (overrides --pr).",
    )
    ap.add_argument(
        "--base",
        default=None,
        help="Base branch for PR diff (default: repo default branch).",
    )
    ap.add_argument(
        "--all",
        action="store_true",
        help="Lint the whole codebase (ignore PR diff).",
    )
    ap.add_argument(
        "--image",
        default=MEGALINTER_IMAGE_DEFAULT,
        help=f"MegaLinter docker image (default: {MEGALINTER_IMAGE_DEFAULT}).",
    )
    ap.add_argument(
        "--report-dir",
        default=None,
        help="Output folder for reports (default: ./megalinter-reports-<timestamp>).",
    )
    ap.add_argument(
        "--zip",
        action="store_true",
        help="Also create a zip archive of the report folder.",
    )
    ap.add_argument(
        "--no-pull",
        action="store_true",
        help="Do not docker pull the image (use local cached image).",
    )
    ap.add_argument(
        "--env",
        action="append",
        default=[],
        help="Extra env var for MegaLinter (KEY=VALUE). Can be repeated.",
    )
    ap.add_argument(
        "--token-env",
        default="GITHUB_TOKEN",
        help="Env var name to read GitHub token from for private repos.",
    )
    ap.add_argument(
        "--workspace-dir",
        default=None,
        help=(
            "Directory in which to create the temporary workspace copy. "
            "Useful on macOS/Windows if Docker cannot mount the system temp directory."
        ),
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without running docker.",
    )

    args = ap.parse_args(argv)

    _ensure_tools()

    token = os.environ.get(args.token_env)

    kind, repo_or_path, pr_from_source = _parse_source(args.source)
    pr_number = args.pr if args.pr is not None else pr_from_source

    ts = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    report_dir = Path(args.report_dir) if args.report_dir else Path.cwd() / f"{REPORT_DIRNAME_DEFAULT}-{ts}"
    report_dir = report_dir.resolve()
    _ensure_writable_dir(report_dir)

    workspace_root = _make_workspace_root(args.workspace_dir)

    # Create a unique temp workspace under workspace_root.
    try:
        with tempfile.TemporaryDirectory(prefix="universal-pr-lint-", dir=str(workspace_root)) as tmp:
            tmpdir = Path(tmp)
            workspace = tmpdir / "workspace"

            if args.dry_run:
                print(f"[dry-run] Workspace root: {workspace_root}")
                print(f"[dry-run] Workspace path: {workspace}")

            if kind == "local_path":
                src = Path(repo_or_path)  # type: ignore[arg-type]
                if _is_git_repo(src):
                    # clone local repo without hardlinks to avoid accidental mutations affecting source
                    _run(["git", "clone", "--no-hardlinks", str(src), str(workspace)], check=True)
                else:
                    _copy_tree_readonly(src, workspace)
            else:
                _clone_repo(repo_or_path or "", workspace, token=token)

            files_to_lint: Optional[List[str]] = None
            validate_all = True

            if _is_git_repo(workspace):
                if args.ref:
                    _checkout_ref(workspace, args.ref)
                elif pr_number is not None:
                    _fetch_pr(workspace, pr_number)

                if not args.all:
                    base_branch = args.base or _git_default_branch(workspace)
                    validate_all = False
                    try:
                        files_to_lint = _changed_files(workspace, base_branch, "HEAD")
                    except CmdError as e:
                        print(
                            "Warning: could not compute changed files; falling back to full repo lint.\n" + str(e),
                            file=sys.stderr,
                        )
                        files_to_lint = None
                        validate_all = True
                else:
                    validate_all = True
            else:
                validate_all = True

            if files_to_lint is not None and len(files_to_lint) == 0 and not validate_all:
                print("No changed files detected in diff; running full lint to generate a report.")
                files_to_lint = None
                validate_all = True

            if not args.no_pull:
                if args.dry_run:
                    print(f"[dry-run] Would pull docker image: {args.image}")
                else:
                    _docker_pull(args.image)

            rc = _run_megalinter_docker(
                repo_dir=workspace,
                report_dir=report_dir,
                image=args.image,
                files_to_lint=files_to_lint,
                validate_all_codebase=validate_all,
                extra_env=args.env,
                dry_run=args.dry_run,
            )

            if args.zip and not args.dry_run:
                zip_path = Path(str(report_dir) + ".zip")
                _zip_dir(report_dir, zip_path)
                print(f"Report zip: {zip_path}")

            print(f"Report folder: {report_dir}")
            html = report_dir / "megalinter-report.html"
            if html.exists():
                print(f"HTML report: {html}")

            if _is_windows() and args.workspace_dir:
                # A friendly hint: Docker Desktop shares only specific folders by default.
                print(
                    "Note (Windows/macOS): if you see Docker mount errors, ensure the --workspace-dir folder is shared "
                    "with Docker Desktop (Settings → Resources → File Sharing)."
                )

            return rc

    except FileNotFoundError as e:
        raise CmdError(
            "I/O error while preparing workspace/report folders.\n\n"
            "Actionable fixes:\n"
            "- Ensure the paths exist and are accessible.\n"
            "- Try --workspace-dir inside your home directory.\n"
            "- On Windows/macOS, ensure Docker Desktop can access that directory.\n\n"
            f"Underlying error: {e}"
        )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CmdError as e:
        print(str(e), file=sys.stderr)
        raise SystemExit(2)
