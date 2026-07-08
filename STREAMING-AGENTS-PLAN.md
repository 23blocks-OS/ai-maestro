# Execution Modes for Agents (Terminal ⇄ Streaming) — Implementation Plan

Status: DRAFT for review. Linchpin VERIFIED (see below). Author: 2026-07-08.

## The model (corrected)

An agent is **one persistent entity** whose state lives on disk (registry ID,
name, working directory, AMP keys, CozoDB memory, and its `.jsonl` conversation
history). **Terminal vs Streaming is not a kind of agent — it's an execution
mode chosen at wake time.** The same agent can run in terminal (tmux TUI) mode
one session and streaming (stream-json) mode the next, and keep its full
conversation, because both modes resume the same session.

> Desk: wake in **terminal** mode → tmux TUI, work for hours, hibernate.
> Phone: wake in **streaming** mode → clean chat, **same conversation**, full
> context. Switch back anytime. One agent, two ways to attach.

This vindicates the original instinct: the mode choice belongs on the **wake
dialog**, not agent creation.

## Linchpin — VERIFIED (2026-07-08)

`claude --resume <session_id>` carries full context across separate process
invocations and across modes (same binary, same `.jsonl` store):
- Streaming session stored "PURPLE-OTTER / 8899" → killed → fresh streaming
  process `--resume` → recalled both. ✓
- Resumed a real on-disk agent conversation in streaming mode → correctly
  summarized prior turns. ✓

## What this buys us for free (shared on-disk state)

Because both modes share the agent's files, most "first-class" concerns need
**no per-mode work**:
- **Conversation continuity** — `--resume` the agent's current `session_id`. ✓
- **Memory / subconscious** — the subconscious is file-based (reads `.jsonl`,
  writes CozoDB). It indexes whatever the agent writes, in *either* mode, as
  long as it's running for that agent. Mode-agnostic for free.
- **AMP identity & keys** — on disk, shared. Same in both modes.
- **Registry identity, working dir, skills, CLAUDE.md** — shared.

So the plan is much smaller than a "parallel runtime." The real work is: track
the agent's session_id, let wake pick the mode and `--resume`, teach
online-detection about the streaming process, harden the streaming runtime, and
(for AMP outbound) inject identity. Inbound AMP in streaming mode is the only
genuinely new mechanism, and it's deferred.

## Current state (PoC — shipped, v0.36.2)

- `/stream-chat` WS; persistent per-agent claude process; buffered event stream
  replayed on reconnect; continues the same live session; 15-min idle-kill.
- Headless auth via `CLAUDE_CODE_OAUTH_TOKEN`. Permissions: `acceptEdits`.
- NOT yet: `--resume` a tracked session_id, identity injection, wake-dialog mode
  choice, online-detection integration.

---

## Phases

### Phase 1 — Session-id tracking + resume (the core of the model)
- **Track each agent's current `session_id`.** After any wake (either mode),
  claude uses/creates a session_id — visible in `system:init` and as the
  `.jsonl` filename in the encoded project dir. Record it on the agent
  (registry field `currentSessionId`, updated on wake / on hibernate by reading
  the most-recent `.jsonl` for the working dir).
- **Wake resumes it.** Both the tmux launch and the streaming spawn pass
  `--resume <currentSessionId>` (or start fresh if none). Verified this works.
- Reuse the mtime-newest-`.jsonl` resolution already in `lib/chat-transcript.mjs`.

### Phase 2 — Streaming runtime hardening (on the Agent SDK)
- **Build on `@anthropic-ai/claude-agent-sdk`, not the raw CLI spawn.** The SDK
  gives the `canUseTool` callback needed for permission cards (Phase 5, now v1),
  same-subscription auth, and `--resume`. Restructure the PoC's per-agent
  session manager around the SDK's `query()`; module extracted from `server.mjs`,
  resume-aware, available in headless mode.
- Identity injection: pass `AIMAESTRO_AGENT_ID` / `_NAME` (needed for outbound
  AMP and agent-scoped skills).
- Keep idle-stop + wake-on-connect; cap concurrent processes.
- Formalize the headless-token flow (`setup-token`) with status + expiry handling.

### Phase 3 — Wake dialog + lifecycle
- **Wake dialog: mode choice** (Terminal / Streaming), the user's original ask.
- `wake(agent, mode)`:
  - terminal → tmux `claude --resume <sid>` (current behavior + resume)
  - streaming → stream-json `claude --resume <sid>` (the runtime from Phase 2)
- `hibernate` → kill the current process (either mode), persist `currentSessionId`.
- **Switch mode** = hibernate + wake in the other mode. (Only one mode live at a
  time — the two processes would fight over the session.)
- **Online detection** becomes a union: an agent is online if a tmux session
  exists OR its streaming process is alive. Track the current mode for the UI.

### Phase 4 — UX
- Status indicators show mode (terminal vs streaming) + online state.
- For an agent currently in streaming mode, the **Terminal tab** shows a
  disabled-state message ("Terminal is disabled while this agent runs in
  streaming mode"). (Activity/log view is a later enhancement, not v1.)
- Streaming chat tab (PoC) becomes the primary chat for streaming mode.

### Phase 5 — Permissions (v1 — REQUIRED; chat is unusable without it)
- Replace `acceptEdits` (auto-approve — unsafe/unusable for real work) with the
  SDK `canUseTool` flow: before each tool runs, the agent pauses and the server
  forwards the structured request to the browser; permission requests and
  `AskUserQuestion` render as interactive **cards** (exact command/file + real
  buttons); the click returns a structured decision. Cannot be accidentally
  dismissed; buttons always match real choices. (Terminal mode keeps its
  existing prompt-in-the-TUI behavior.)
- Depends on Phase 2 being built on the SDK.

### Phase 6 — AMP
- **Outbound**: with identity injected (Phase 2), `amp-send --id <uuid>` works in
  streaming mode. Verify.
- **Inbound (deferred)**: introduce a **notify-agent seam** with two impls —
  tmux-push (existing) and **stdin-inject** (inject the routed message into the
  streaming process's stdin as a synthetic turn). This is the "how agents get
  notified" problem, flagged for later.

---

## Cross-cutting
- **Testing**: session-id capture/resume, wake in each mode, mode-switch,
  online-detection union, e2e streaming reconnect.
- **Headless-mode parity** (`services/headless-router.ts`).
- **Billing**: streaming = metered credit pool if/when Anthropic un-pauses SDK
  metering; terminal mode stays on the subscription pool. Surface per-turn cost
  (`total_cost_usd`) so exposure is visible when in streaming mode.
- **Auth**: streaming mode needs the headless token (esp. phone use — the
  process runs on the Mac, serving the phone). Terminal mode auths via Keychain.

## Decisions — ALL RESOLVED (v1 fully specified)
1. **v1 scope**: Phases 1–5 (mode switch + continuity + UI + permission cards).
   Inbound AMP (6-inbound) deferred.
2. **Mode-switch UX**: EXPLICIT. To change modes the user **hibernates** the
   agent and **wakes** it again, picking the mode in the wake dialog. No
   one-click live switch.
3. **Default mode**: terminal (today's default) unless the user picks streaming
   in the wake dialog.
4. **Terminal tab in streaming mode**: show a disabled-state message
   ("Terminal is disabled while this agent runs in streaming mode" or similar) —
   not an activity/log view for v1.
5. **Session granularity**: always resume the **latest** conversation
   (most-recent `.jsonl` for the working dir). No conversation picker in v1.

## Recommended sequencing
**Phases 1 → 2 → 3 → 4 → 5 = v1**: the same agent, waked in either mode, with
full conversation continuity via `--resume`, correct UI, memory for free via the
file-based subconscious, and **real permission cards** (without which the chat
is unusable for real work). Phase 2 is built on the Agent SDK so Phase 5's
`canUseTool` cards fall out. Then **6-outbound** (AMP send). Defer **6-inbound**
behind the notify-seam design.

## Why this is small
Almost all "first-class citizen" concerns (memory, identity, history, skills)
are satisfied by shared on-disk state + `--resume`, which is verified. The net
new build is: session-id tracking, a mode switch on wake, online-detection
union, streaming-runtime hardening, identity injection. That's a feature, not a
runtime rewrite.

## Non-goals / accepted limits
- One mode live at a time (switch = hibernate + rewake).
- Streaming auth needs a headless token (power-user step; not normal-user-smooth).
- Inbound AMP in streaming mode deferred.
- Not solving cloud multi-tenant / BYO-subscription-at-scale.
