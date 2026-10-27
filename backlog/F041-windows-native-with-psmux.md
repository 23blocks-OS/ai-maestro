# F041 - Windows without WSL: can psmux stand in for tmux?

**Status:** Todo (research done from documentation only; nothing run on Windows)
**Type:** Feature / platform support
**Created:** 2026-10-27
**Requested by:** a user comment on GitHub: "I used psmux and that way I can run native in windows without using WSL." Juan asked whether it is real and what it would take.

## What psmux is

A native Windows terminal multiplexer written in Rust (MIT), built on Windows ConPTY. It runs in PowerShell, cmd.exe and Windows Terminal, with no WSL, Cygwin or MSYS2. It installs as `psmux`, `pmux` and `tmux`, so a program that calls `tmux` finds it. It reads `.tmux.conf`. Install: winget, Cargo, Scoop, Chocolatey. Repository https://github.com/psmux/psmux: about 3.8k stars, 2,395 commits, 34 open issues, 8 open pull requests (read 2026-10-27). The page shows no releases or tags; several mirrors and forks exist under other users, so check which repository is meant. A Claude Code issue (anthropics/claude-code#34150) proposes psmux for agent teams on Windows; that is a request, not a working integration.

Today the README says Windows works through WSL2 only (`docs/WINDOWS-INSTALLATION.md`). Nothing in the repo or the issues mentions psmux.

## Our tmux calls against psmux's documented flags

Sources: `docs/compatibility.md` and `docs/tmux_args_reference.md` in the psmux repository. Not read: the Rust source (the `src` listing did not load). Nothing was run.

| We call | psmux documents |
|---|---|
| `new-session -d -s` (and `-c`) | `-d`, `-s`, `-c` (start directory), `-x`, `-y`, `-e` parsed |
| `capture-pane -p -e` (pane readback) | `-p`, `-e`, `-J`, `-S`, `-E`, `-t` parsed; `-N` not accepted |
| `send-keys -t`, `-l`, `-H` | supported |
| `has-session -t` | parsed; a leading `=` is stripped |
| `display-message -p -t` | parsed. The flag table lists `-F` as a boolean, unlike tmux, where it takes a format. We only use `-p` |
| `list-sessions -F` | `-F` passed through verbatim. `#{pane_current_path}` is documented; the other variables in our format string are not |
| `kill-session -t` | supported; kills the pane's whole process tree |
| `rename-session -t old new` | listed as taking no flags, the first positional argument being the new name. Our `-t` form is a likely break |
| `set-environment` (5 call sites) | not mentioned on either page |
| `load-buffer`, `paste-buffer`, `copy-mode` | `load-buffer -b` and `paste-buffer` documented; `copy-mode` not mentioned |

## Gaps and risks

- `rename-session -t` and `set-environment`, above.
- `TMUX_TMPDIR` is not listed; we rely on it for a private socket directory, and our tmux safety canary depends on it. psmux has `-L` (namespaces) and `-S`.
- `kill-server` without `-L` ends only the default namespace. Safer than tmux, but different.
- When a pane's shell exits, psmux kills leftover child processes by default (Windows has no hangup signal). A long-running agent started in the background would die with its pane. `@kill-descendants off` opts out.
- `pane_pid` is "partial"; `pane_start_command` is empty for the default shell; keep `default-terminal` at `xterm-256color` on Windows.
- Commands in a `;` chain run before an unknown command is reported.
- One call starts a session with `bash <script>`; Windows needs bash or a replacement.

## Outside tmux (untested)

The `.sh` plugin scripts (`amp-send.sh`, `amp-read.sh`, the rest), `update-aimaestro.sh` and the installers assume a POSIX shell. `server.mjs` and path handling (`\` vs `/`, `os.homedir()`, the `~/.aimaestro` and `~/.agent-messaging` layouts) need a Windows run. `node-pty` supports Windows, but our terminal paths have not been tried with it. Agent CLIs (Claude Code and others) each have their own Windows story.

## Plan

1. **Ask the commenting user** what they ran: the psmux version, the AI Maestro version, whether agents woke, whether the chat sent and read, and what broke.
2. **A probe script** that runs our exact tmux calls (the table above) against a given `tmux` binary and prints pass or fail with the output. Read-only apart from its own throw-away session; uses `-L` so it can never touch another server. Someone with a Windows machine runs it under psmux and posts the output. No app changes.
3. **Decide from the output.** If the gaps are only `rename-session` and `set-environment`, adapt the calls (positional rename; set the environment through `new-session -e`) behind `lib/tmux-safe.mjs`, which already is the single choke point. If larger, report upstream to psmux or stay on WSL2.
4. **Then the rest of the stack** (scripts, installer, paths) on a Windows machine, as its own item once step 3 says go.

## Decisions to make

- Whether Windows native is a goal, or WSL2 stays the supported path and psmux is documented as "works for some users".
- Who has a Windows machine to run the probe.

## Not done

No code changes. No claim in the README until a real run exists.
