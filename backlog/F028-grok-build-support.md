# F028 - Grok Build agents, and approval cards for Grok and Codex

**Status:** Done (0.60.0)
**Type:** Feature
**Created:** 2026-10-06
**Requested by:** Juan, 2026-10-06

## Description

xAI's Grok Build (`grok`, Apache 2.0, v1.0 on 2026-08-07) is a terminal coding agent used like Claude Code and Codex. Juan asked for it to run as a first-class agent, and for Codex to be finished (approval cards were deferred in F004 for lack of a real prompt sample).

## What the docs and a live session showed

- Grok reads `~/.claude/settings.json` hooks by default, so the AI Maestro hook already fires. Payloads carry both snake_case and camelCase keys, except `stopHookActive` and `notificationType`, which are camelCase only.
- Grok has no `PermissionRequest` event; it sends `Notification` with type `permission_prompt`.
- Its Stop block contract is Claude-compatible. It discards hook output on SessionStart, UserPromptSubmit and Notification.
- Sessions: `~/.grok/sessions/<url-encoded-cwd>/<id>/{summary.json,updates.jsonl,...}`.
- Default mode never prompts for `touch`, `rm` or file writes; an `ask` rule in `.grok/config.toml` forces the menu (five numbered options, digit keys).

## Shipped

Launch flags, chat reader, hook detection and Stop delivery, approval-card parsers for Grok and Codex (`lib/pane-approval.mjs`). See CHANGELOG 0.60.0.

## Open

- Codex "needs you" status in the sidebar (needs a cheap source; no hook, no transcript event).
- Codex edit and permission-request prompts (not captured).
- A Grok Stop-block continuation can show a false idle.
- Cloud and Docker agents: no Grok image (`mapProgramToTool` maps grok to claude).
- Live end-to-end run of the chat UI with a Grok agent on a deployed host.
