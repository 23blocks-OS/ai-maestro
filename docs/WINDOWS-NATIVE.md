# AI Maestro on Windows, natively (no WSL)

AI Maestro runs on Windows 10 (1809 or later) and Windows 11 without WSL. Agents run in
[psmux](https://github.com/psmux/psmux), a native Windows tmux built on ConPTY, in PowerShell panes. The agent
tools (messaging, tasks, memory, docs, graph, the agent CLI) are the same bash scripts as on macOS and Linux and
run in Git Bash, the bash that Claude Code on Windows already uses for its own Bash tool.

The [WSL2 guide](./WINDOWS-INSTALLATION.md) still works and is unchanged: inside WSL, AI Maestro is the Linux build.

## Install

In PowerShell (no administrator needed):

```powershell
irm https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/install.ps1 | iex
```

Or from a clone: `powershell -ExecutionPolicy Bypass -File install.ps1`. Run it again to repair or update.

It installs what is missing, then builds and starts AI Maestro:

| What | Where | How |
|---|---|---|
| Git for Windows (git, and Git Bash for the agent tools) | as installed | winget, only when missing; offers an update when its OpenSSL is older than 3 (message signing needs it) |
| Node.js 22 or later | as installed, or Node.js 24 LTS in `%LOCALAPPDATA%\Programs` | an installed Node is used; a too-old one is upgraded with winget |
| psmux 3.4.0 | `%LOCALAPPDATA%\Programs\psmux` | GitHub release, SHA-256 checked |
| jq 1.8.2 | `%LOCALAPPDATA%\Programs\jq` and the wrapper `~/.local/bin/jq` | GitHub release, SHA-256 checked |
| Claude Code (optional) | `~/.local/bin` | the official installer from claude.ai, if you say yes |
| AI Maestro | `~/ai-maestro` | git clone, `yarn install`, `yarn build` |
| Agent tools, skills, Claude Code hook | `~/.local/bin`, `~/.claude` | the same installers as macOS and Linux, run in Git Bash |
| The `ai-maestro` command, a Start menu entry, the "AI Maestro" scheduled task | `~/.local/bin`, Start menu, Task Scheduler | `scripts/windows/install-launcher.ps1` |

Options: `-Dir`, `-Branch`, `-Port`, `-Yes`, `-LoginItem` / `-NoLoginItem`, `-NoClaude`, `-NoStart`, `-Force`
(installs with less than 10 GB free), `-Uninstall`. `Get-Help .\install.ps1` lists them. Yarn keeps an unpacked
copy of every package in its cache, so the install needs about 10 GB of free disk.

## Every day

```powershell
ai-maestro open      # the dashboard (starts the server if it is down)
ai-maestro start | stop | restart | status
ai-maestro logs      # the end of ~/.aimaestro/logs/server.log, followed
ai-maestro update    # update-aimaestro.sh, in Git Bash
```

The server runs hidden as the "AI Maestro" scheduled task (`scripts/windows/service.mjs`, which restarts it if it
stops, as pm2 does elsewhere). With start-at-login on, it starts when you sign in. Stopping or updating the server
never stops your agents: their sessions belong to the psmux server.

## How it works

- **Sessions**: every tmux call goes through `lib/tmux-safe.mjs` with an argv array, and psmux answers it.
  `node scripts/tmux-selfcheck.mjs` checks the 26 operations AI Maestro uses against the multiplexer on PATH.
- **Panes**: a pane runs `powershell.exe -NoLogo -ExecutionPolicy RemoteSigned` (RemoteSigned so the `.ps1` shims npm
  writes for programs like Codex can run). The lines AI Maestro types are written for that shell
  (`lib/pane-shell.ts`): `$env:A='x'` for variables, and arguments quoted where PowerShell would read them as syntax.
- **Scripts**: anything AI Maestro runs as a bash script goes to Git for Windows' bash (`lib/git-bash.mjs`), never
  to `C:\Windows\System32\bash.exe`, which starts WSL. `AIM_BASH` or Claude Code's `CLAUDE_CODE_GIT_BASH_PATH` choose
  another one.
- **Messaging identity**: on macOS and Linux the wake line runs `amp-init.sh`; a PowerShell pane cannot, so on Windows
  the server runs it in Git Bash before it starts the agent's program.
- **Credential profiles** (#65): `scripts/windows/aim-launch.mjs` does what `aim-launch.sh` does. Secrets are kept with
  Windows DPAPI: encrypted for your Windows account, so another account, or the file copied to another machine,
  cannot read them.

## WSL and native on one machine

They are two separate installs, each with its own tmux, agents and files. Both can run at once on different ports:
install the native one with `-Port 23001`. The installer stops, and says so, when the port is taken (an AI Maestro
in WSL answers on `localhost:23000` through WSL's port forwarding).

## Troubleshooting

**Messages show "Signature: UNVERIFIED", or amp-send warns it could not sign.** Git Bash has OpenSSL 1.1.1 (Git for
Windows from before 2023), which makes Ed25519 keys but cannot sign with them. Update Git for Windows
(`winget upgrade Git.Git`), or point `CLAUDE_CODE_GIT_BASH_PATH` at a newer Git's `bin\bash.exe`.

**"Port 23000 is already in use".** Another program, or an AI Maestro in WSL, has it. Stop it, or reinstall with
`-Port 23001`.

**An agent's program does not start: "...ps1 cannot be loaded because running scripts is disabled".** A pane from an
older version runs PowerShell without RemoteSigned. Restart the agent (hibernate, then wake).

**Saving a secret fails with "access denied" over ssh.** DPAPI needs your Windows password, and an ssh session that
signed in with a key has none. Use the dashboard on your desktop, or sign in to ssh with your password.

**A script misreads JSON (values with a stray `\r`), or a message is refused with `invalid_signature`.** The agent
tools need the `~/.local/bin/jq` wrapper to come first on PATH in Git Bash. It runs jq.exe with `-b` (jq.exe writes
CRLF line endings on Windows) and with Git Bash's path rewriting off: Git Bash turns any argument that starts with
`/` into a Windows path before it runs a Windows program, so a signature starting with `/` (about one message in 64)
or a message such as "/tmp is full" reached jq changed. `install.ps1` checks both and warns; run it again to repair.

**Crash restart and psmux.** psmux reports the newest process in a pane, not the foreground job as tmux does: while
Claude Code runs a Bash tool call the pane reads `bash`. AI Maestro looks at the child of the pane's shell instead
(`lib/windows-pane-child.ts`), so a working agent is not taken for one that crashed and left a shell.

**Where are the logs?** `ai-maestro logs`, or `~/.aimaestro/logs/server.log` (cut at 50 MB).

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File ~/ai-maestro/install.ps1 -Uninstall
```

It stops AI Maestro and removes the command, the Start menu entry and the scheduled task. Your agents' data
(`~/.aimaestro`, `~/.agent-messaging`), the clone and the tools stay; end the agents' sessions with `tmux kill-server`.
