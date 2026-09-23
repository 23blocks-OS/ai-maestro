# F004 — Codex chat support (multi-provider transcript reader)

**Status:** In Progress (Phase 1 shipped v0.38.35 — history + live updates; Phase 2 live-state pending)
**Type:** Feature
**Created:** 2026-09-22

## Description

The chat panel shows "no messages" for any agent that isn't running Claude Code.
It is not a per-agent toggle and it is not that the other program has no
conversation — it is that **the chat is a Claude Code transcript viewer**, welded
to one program's data at three points:

| what chat needs | Claude Code | Codex |
|---|---|---|
| **locate** transcript | `~/.claude/projects/<enc cwd>/*.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (cwd is *inside* the file) |
| **parse** it | `{type:'assistant', message:{content:[tool_use…]}}` | `{timestamp, ordinal, type, payload}` envelope |
| **live state** (status dot, questions, permission cards) | AI Maestro hook in `~/.claude/settings.json` | codex's own `hooks.json`, different approval UX |
| **send** a message | send-keys to the pane | **already works** (program-agnostic) |

So the tab shows the empty state because the reader looked in the Claude directory
and found nothing. Codex keeps a full, well-structured transcript — the chat just
has no reader for it.

This item makes the chat multi-provider so AI Maestro genuinely works with the
two main AI coding CLIs (Claude Code + Codex), not "Claude Code with others bolted
on".

## Why It's Needed

Codex is the second-most-common agent runtime our users run (the reporter created
a codex agent and could not use the chat at all). A dashboard that advertises
multi-agent orchestration but whose primary interaction surface only works for one
vendor is half a product. The terminal tab works for codex, but the chat — with
history, message bubbles, and one-click send — is where the value is.

## Business Case

- **Positioning:** "works with Claude Code AND Codex" is a materially stronger
  claim than "works with Claude Code". It is the difference between a Claude
  tool and an agent-orchestration platform.
- **Unblocks real use:** at least one user is running codex agents today and
  cannot use the chat.
- **Cheap for the value:** codex already writes a complete JSONL transcript;
  Phase 1 is a locator + a parser mapping its events to the shape ChatView
  already renders. No UI changes.
- **Sets the pattern:** the same seam admits Gemini, Aider, etc. later — one
  adapter each.

## Implementation Plan

### Findings from eval (codex rollout schema, verified against the live corpus)

Codex session file: `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl`.
Every line: `{timestamp, ordinal, type, payload}`. Relevant `type`s and, for
`response_item`, the `payload.type`:

- `session_meta` → carries **`cwd`** (line 1) — the agent↔transcript key.
- `response_item` / `message` with `role`:
  - `user` → user message (some are injected AGENTS.md context — collapse/skip)
  - `assistant` (+ `agent_message`) → assistant message
  - `developer` → system/setup — **skip**
- `response_item` / `reasoning` → codex's thinking, but **`summary:[]` +
  `encrypted_content`** — not displayable, **skip** (a codex limitation, not ours)
- `response_item` / `custom_tool_call` (+ older `function_call`, `tool_search_call`)
  → tool call `{call_id, name, input/arguments}`
- `response_item` / `custom_tool_call_output` (+ `function_call_output`,
  `tool_search_output`) → tool result, paired to the call by `call_id`
- `event_msg` / `item_completed` → **mirrors** response_items (UserMessage /
  AgentMessage / CommandExecution) — **ignore** (use response_item as truth)
- `token_usage_record`, `token_count`, `task_started`, `task_complete`,
  `turn_context`, `world_state` → metadata (candidates for the status line later)

Content parts are `{type: input_text|output_text, text}` — concatenate the text.

### The seam (minimal-touch, both call sites unchanged)

`getChatHistory` and the incremental JSONL watcher both go through
`resolveJsonlPath(agent)` + `parseJsonlLines(lines, limit)`. So:

1. **`resolveJsonlPath(agent)`** dispatches by `agent.program`: codex →
   `resolveCodexTranscriptForDir(cwd)` (scan `~/.codex/sessions` newest-first,
   read each file's `session_meta` cwd, early-exit on match); else the existing
   Claude locator.
2. **`parseJsonlLines(lines, limit)`** detects the format **per line** (a codex
   envelope has `payload` + a codex `type`) and routes to the codex mapper; else
   the existing Claude handling. Per-line detection is required because the
   watcher passes only the delta (no `session_meta` in it) — and codex lines are
   self-identifying, so it works.

New module `lib/transcript-codex.mjs`: `isCodexLine`, `codexLineToMessages`,
`resolveCodexTranscriptForDir`. Emits the SAME message shapes ChatView already
renders (`user` / `assistant` with `content:[{type:'text'|'tool_use'}]`,
`tool_result_marker`), so **no component changes**.

### Phases

- **Phase 1 (this delivery): history + live updates.** Locator + parser + dispatch.
  The Chat tab shows codex's real conversation and updates live via the existing
  watcher. Sending already works. NO status dot / question cards for codex.
- **Phase 2 (later): live state.** A codex-side hook (codex has `hooks.json`)
  reporting status the way the Claude hook does, plus mapping codex's approval
  model to the permission-card path. Bigger lift; codex approvals ≠
  `AskUserQuestion`.

### Effort / risks
- Phase 1: **M**. Risk: `resolveCodexTranscriptForDir` scanning cost on a large
  `~/.codex/sessions` — mitigated by newest-first + early-exit + a scan cap.
- Tests: a real-schema codex rollout fixture → asserts the mapped message shapes,
  tool pairing by `call_id`, developer/reasoning skipped, `event_msg` ignored.
- Open question (Phase 2): does codex's approval prompt surface anywhere the
  hook can read it, or only in the TUI? Determines whether permission cards are
  feasible for codex at all.
