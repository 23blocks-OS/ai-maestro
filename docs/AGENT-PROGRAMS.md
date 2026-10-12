# Agent programs: what each one supports

An AI Maestro agent runs a coding CLI in a tmux session. This page says what works for each CLI, so you know what to expect before you create an agent. The program is set when you create or wake an agent (**Wake** dialog) or by the agent's `program` value.

| | Claude Code | Codex CLI | Grok Build |
|---|---|---|---|
| Launch from the dashboard | yes | yes | yes (since 0.60.0) |
| Terminal tab | yes | yes | yes |
| Chat history and live updates | yes | yes (since 0.38.35) | yes (since 0.60.0) |
| Working / idle status | hook | read from the transcript | hook |
| "Needs you" status | hook | no (sidebar shows working or idle) | hook |
| Approval cards in the chat | from the hook and the pane | from the pane (since 0.60.0) | from the pane (since 0.60.0) |
| Messages (AMP) wake the agent | yes | yes | yes |
| Messages delivered by the Stop hook | yes | no | yes |
| Claude Code mods (`docs/CLAUDE-CODE-MODS.md`) | yes | no | no |

"From the pane" means AI Maestro reads the approval prompt off the terminal screen and shows it as a card. Clicking an option sends the same key you would press in the terminal.

## Grok Build

Grok Build is xAI's terminal coding agent (`grok`, open source, Apache 2.0). It needs a SuperGrok or X Premium+ subscription.

**Install and log in on every host that runs Grok agents.** The login is per machine and interactive, so AI Maestro cannot do it for you:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

Then pick **Grok Build** in the Wake dialog, or set the agent's program to `grok`.

**Permission modes.** The agent's permission setting maps to Grok's flags:

| AI Maestro | Grok flag |
|---|---|
| supervised | none (Grok asks) |
| full autonomy | `--always-approve` |
| plan, accept edits, auto | `--permission-mode plan`, `acceptEdits`, `auto` |

Grok's default mode does not ask before running ordinary shell commands or editing files in the project. Prompts appear for calls its safety rules flag, or when you add `ask` rules in `.grok/config.toml` (`[permission] ask = ["Bash(touch *)"]`).

**How it works.** Grok reads Claude Code's hook settings (`~/.claude/settings.json`), so the AI Maestro hook receives its events: that gives live status and "needs you". The hook recognises Grok's camelCase payloads. Unread messages reach a Grok agent through its Stop hook; Grok discards hook output on session start, prompt submit and notification, so there is no injection at those points. Chat history is read from `~/.grok/sessions/<encoded-cwd>/<session-id>/updates.jsonl` (`GROK_HOME` overrides `~/.grok`).

**Known limits.** A Stop-hook continuation can show a brief false "idle". Cloud and Docker agents have no Grok image yet. Grok asks once whether to share coding data; AI Maestro leaves that choice to you.

## Codex CLI

Chat history and the working indicator are read from Codex's own transcript (`~/.codex/sessions`). There is no AI Maestro hook for Codex, so there is no "needs you" in the sidebar. Approval prompts are read from the pane and shown as cards (since 0.60.0); the exact formats were captured from codex-cli 0.153.4. Prompts for file edits and permission requests parse generically but have not been captured from a real session.

## Pi

[Pi](https://pi.dev) is a minimal terminal coding agent (`pi`, MIT license, npm package `@earendil-works/pi-coding-agent`). Since 0.67.4 it is a recognised program: pick **Pi** in the Wake dialog, or set the agent's program to `pi`, `pi-agent` or `pi-coding-agent`.

What was checked (Pi 1.1.0, 2026-10-12, on this Mac and on mac-mini through AI Maestro): it starts in the agent's tmux session, text typed into its input box lands there, Enter runs slash commands, and it exits cleanly. Its sessions are JSONL files under `~/.pi/agent/sessions/`. It does not ask for approval before tool calls, so it has no approval cards to show. Not checked yet: a full conversation turn (it needs a model login), so message delivery and replies are unconfirmed.

**Node version.** Pi 1.x needs **Node 22.19 or newer in the 22 line, or Node 24+**: it uses `zlib.createZstdDecompress`, which Node 23.x only has from 23.8. Node 23.5 passes Pi's version check and then crashes at startup with `createZstdDecompress is not a function` (seen on mac-mini, 2026-10-12). On Node 20 the package manager installs the older `legacy-node20` build instead. Install a current Node 22 beside the others (for example `nvm install 22`) or use Pi's own installer (`curl -fsSL https://pi.dev/install.sh | sh`), which can set up a private Node for Pi, so the host's default Node does not have to change. Run `pi` once and `/login` on every host that runs Pi agents.

**Today:** launch, terminal tab and wake by typing into the pane. **Not yet:** chat history, working/idle status and "needs you". Pi has a JSON event mode and an RPC mode that could feed them later.

## GitHub Copilot CLI

[GitHub Copilot CLI](https://github.com/github/copilot-cli) is GitHub's terminal coding agent (`copilot`; install with `npm install -g @github/copilot`, `brew install copilot-cli` or `curl -fsSL https://gh.io/copilot-install | bash`). It needs a GitHub Copilot subscription. Since 0.68.1 it is a recognised program: pick **GitHub Copilot CLI** in the Wake dialog, or set the agent's program to `copilot`, `copilot-cli`, `github-copilot` or `github-copilot-cli`. (The older `gh copilot` extension only suggests and explains commands; it is not an agent and is not what this means.)

What was checked (Copilot CLI 1.0.96, 2026-10-12, in a tmux session): it starts, draws its screen, and exits cleanly with Ctrl+C.

**Log in once on every host that runs Copilot agents.** Run `copilot`, then `/login`, or put a token in `COPILOT_GITHUB_TOKEN`. AI Maestro cannot do this for you.

**The first launch in a new folder asks "Do you trust the files in this folder?"** with three choices (1 Yes, 2 Yes and remember this folder, 3 No). Since 0.69.1 it appears as a **card in the chat** with a button per choice (or answer it in the Terminal tab); choose "remember" once per agent folder. Until it is answered, a message typed into the pane would land on that question, so answer it before you send the agent anything. The same kind of card appears for the two questions after `/login`: "What account do you want to log into?" and "How do you want to sign in?". AI Maestro does not handle the login itself; it only shows what Copilot asks.

**Permission modes.** Supervised adds nothing: Copilot asks before it runs a tool. Full autonomy starts it with `--allow-all-tools`, which stops the per-tool questions but keeps Copilot's own path and URL checks. The other modes (plan, accept edits, auto) have no Copilot equivalent and add nothing. The agent's model setting is passed as `--model`.

**Today:** launch, terminal tab, wake by typing into the pane, and cards in the chat for the questions Copilot asks by itself (trust the folder, which account, how to sign in). **Not yet:** chat history, working/idle status, "needs you", and the card for Copilot's "may I run this command?" question, which only appears in a real conversation (needs a login) and has not been seen yet. Copilot keeps sessions as JSONL under `~/.copilot/session-state/<id>/events.jsonl` (resume with `--continue` or `--resume`) and supports hooks (`~/.copilot/hooks`, `~/.copilot/settings.json`, `.github/hooks`); both could feed those later (F038). **Not checked:** a full conversation turn (needs a login and a subscription), so message delivery and replies are unconfirmed.

## OpenClaw

OpenClaw is recognised as a program (`openclaw`), and AI Maestro discovers OpenClaw's tmux sessions on its own socket (`OPENCLAW_TMUX_SOCKET_DIR`) and registers them as agents. It has no chat reader, status feed or approval cards yet, and we have not run an end-to-end check on it.

## Anything else

Any terminal agent works in the terminal tab, and messages wake it by typing into the pane. Chat history, status and approval cards need a reader for that program's files; Pi, OpenClaw, GitHub Copilot CLI, Cursor, Gemini CLI, OpenCode and others do not have one yet. Aider is deprecated: it is no longer listed, and agents that already run it keep launching.
