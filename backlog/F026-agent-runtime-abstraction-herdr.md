# F026 — Agent runtime abstraction (Phase 0), and a Herdr evaluation

**Status:** In Progress (Phase 0 only; Herdr phases 1–7 parked)
**Type:** Feature / refactor
**Created:** 2026-10-05
**Requested by:** Juan, 2026-10-05

## Description

Juan shared an "AI Maestro: Herdr Runtime Integration Plan": put an `AgentRuntime` abstraction between AI Maestro and tmux, add a `HerdrRuntime` beside `TmuxRuntime`, get better agent state and events, make the chat the main UX, keep xterm.js, behind a feature flag, in phases 0 to 7.

We evaluated the plan's hypotheses on 2026-10-05 (no code changed, nothing installed). Findings:

| Claim | Verdict |
|---|---|
| tmux use can sit behind a small runtime interface | Mostly true and partly done. `lib/agent-runtime.ts` already has `AgentRuntime` and `TmuxRuntime` (about 16 operations). It lacks paste-buffer injection and scroll control. `server.mjs` bypasses it with about 29 `execFile('tmux')` calls and 12 shell-string calls; plugin and `scripts/` shell scripts also call tmux. |
| Herdr gives better agent state | Not supported for Claude Code. Herdr detects Claude Code and Codex by screen-pattern matching, the same kind of guess as our pane fallback. AI Maestro already uses hooks, then transcripts, then the pane. |
| Programmatic control and events | True (JSON lines over a Unix socket, `agent_status_changed`, `pane.read`, `send_text`). |
| Sessions survive disconnects | Partly. A Herdr server restart does not keep agent processes alive. Our agents run for weeks. |
| Chat-first UX | Independent of Herdr. The chat already reads transcripts. |
| Herdr behind xterm.js | Unverified. The socket gives text snapshots, not a byte stream; it would need its attach client inside a PTY. |
| Mochi attach | Unverified. |
| Maturity | Rust daemon, v0.4.0, pre-1.0, 301 open issues; Intel macOS build unconfirmed (mac-mini). |

## Decision

Do **Phase 0 only**: finish the runtime abstraction and route the tmux calls through it, with no behavior change and no Herdr code. It is worth doing on its own: it removes the shell-string tmux calls, makes tmux behavior testable, and keeps a future runtime possible. Herdr phases wait for a spike with evidence.

## Phase 0 scope

1. Add the missing operations to `AgentRuntime` (paste-buffer injection, scroll/copy-mode control, anything else the audit finds).
2. Route `server.mjs` tmux calls through the runtime (or `lib/tmux-safe.mjs`), argv only, session names validated at one choke point.
3. Remove the 12 shell-string tmux calls.
4. Plugin and `scripts/` shell scripts that call tmux: list them; route what can go through the API, leave the rest documented.
5. Tests: the runtime contract is covered by a fake runtime.

Out of scope: any Herdr code, a feature flag for Herdr, UI changes.

## Later (parked, needs approval)

A one-day spike on a scratch host: run Claude in Herdr, compare `agent_status_changed` events with our hook state on the same session, restart the Herdr server and see what survives. Revisit only if there are agents without hooks (Codex) that need better state.

## Sources

- https://github.com/ogulcancelik/herdr
- https://herdr.dev/docs/socket-api/
- https://herdr.dev/docs/agents/
- https://herdr.dev/docs/session-state/
