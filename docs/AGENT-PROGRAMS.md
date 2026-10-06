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

## Anything else

Any terminal agent works in the terminal tab, and messages wake it by typing into the pane. Chat history, status and approval cards need a reader for that program's files; Aider, Cursor, Gemini CLI and others do not have one yet.
