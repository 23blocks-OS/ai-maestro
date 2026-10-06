# F027 - Every message wakes its agent, on any host, with or without the server

**Status:** In Progress (Phase 1, the sweeper, shipped in 0.49.9 and on by default since 0.50.0; Phase 2, the doorbell, shipped in 0.50.2 with plugin 1.4.1; Phase 3 open)
**Type:** Bug fix and design change
**Created:** 2026-10-05
**Requested by:** Juan, 2026-10-05

## The problem

On 2026-10-05 `3m-counsel` (mac-mini) sat idle with an unread message from `3m-hr` for 47+ minutes. Nothing woke it.

Two separate gaps lined up:

1. **A same-host send never reaches the server.** `amp-send.sh` writes the message file straight into the recipient's inbox when the recipient is on the same machine (the "local filesystem delivery" branch, upstream `agentmessaging/claude-plugin`). No server call means no wake chain (stream, channel, pane), no delivery confirmation, no retry queue. Registration does not matter: `3m-hr` is registered, and the script still takes this branch. The mac-mini log has no `[Delivery]` line after 2026-10-05 02:25 (local time) even though many messages were sent.
2. **The only fallback is tied to a cache.** The 5-minute inbox poll (`lib/agent.ts`, `checkMessages`) runs inside the per-agent object. `AgentRegistry` keeps at most 10 of those in memory (LRU) and mac-mini has 20 live sessions. `3m-counsel` was evicted at 19:24:37, four minutes before the 19:28 message, so no poll was running for it. The log shows the cycle: `Evicting LRU agent 382627de (13/10)` at 18:24, reload at 18:27, evicted again at 19:24.

Not a regression from the AFP, status line or header work. The poll does fire when the agent is loaded (`Inbox poll wake SUBMITTED ... delivered by the 5-min poll, not by push`).

## Why the filesystem path exists (verified)

- Claude plugin commit `690fc24` (2026-03-21, PR #8): "When both sender and recipient are on the same machine, deliver directly to the recipient's filesystem inbox instead of routing through the provider API. The API claims delivery but does not actually write to the inbox, causing messages to be silently lost."
- That reason is **obsolete for AI Maestro**: `lib/message-delivery.ts` `deliver()` now writes the inbox (`writeToAMPInbox`) and then runs the wake chain.
- It is **still valid for AMP without AI Maestro**: the protocol is local-first and the plugin must work with nothing running but files. This is why the filesystem path must stay.
- Earlier, `d61d37b` (2026-02-07) removed a silent filesystem fallback because it produced fake "sent" results. Lesson: do not hide delivery failures.

What the filesystem path skips compared to the server path: signature verification, rate limiting, the wake chain, wake queue retries, WebSocket fan-out, webhooks, delivery log, and the recipient-UUID check. (The script applies content security itself.)

## Principles for the fix

1. **Storage and notification are two separate jobs.** The inbox file is storage, owned by the agent and independent of any host. Waking an idle session is notification, and needs something that knows where the session is.
2. **A message is never lost.** The file write stays the source of truth. Nothing we add may be able to block, delay or fail a send.
3. **99% of users run one host.** Single host with no extra setup must work and must not change behavior in any way a user sees, except that messages now wake the agent.
4. **No server needed for correctness.** Without AI Maestro, sends behave exactly as today.
5. **No wake storms.** Wakes cost paid turns. Every new wake path must be idempotent per message.
6. **Server-side first.** A fix that only needs a server update deploys with `update-aimaestro.sh` and works for every plugin version already installed. A plugin change needs a release chain and every host updated.

## Options considered

| Option | What it is | Verdict |
|---|---|---|
| A. Route every send through the API | Remove the filesystem branch. Server writes and wakes. | Not now. A send fails when the server is down, needs registration and an API key, depends on UUID resolution, and changes standalone behavior. It re-opens the exact March black-hole class. Worth revisiting only after B and C prove stable. |
| B. Doorbell | After the script writes the file, it makes a best-effort call: "message X landed for agent Y". Server verifies the file, runs the wake chain. | Good as the second step. Seconds of latency. Needs a plugin release. Does nothing for other writers or old plugin versions. |
| C. Server-side inbox sweeper | The server finds new unread inbox files for agents that have a live session and runs the wake chain, independent of the LRU cache. | **Do first.** Server-only, covers every writer (any script version, any tool), no coordination, safe to deploy alone. Latency is the scan interval. |
| D. Raise the 10-agent cap | Make the poll live longer. | No. Fixes the symptom on one host, costs memory (each agent holds a CozoDB), and still skips local-send push. |

Recommended order: **C, then B, then reconsider A.**

## Plan

### Phase 1 - Server-side inbox sweeper (the fix)

**Behavior.** One timer per host, not per agent. Every 60 s (configurable), for each registry agent that has a live session on this host:

1. Read unread inbox files (`local.status == "unread"` in `~/.agent-messaging/agents/<uuid>/messages/inbox/**`), using the same reader the poll uses (`/api/messages?agent=...&status=unread`, in-process).
2. Skip messages already woken: a small per-host state file (`~/.aimaestro/wake-state.json`) records `messageId -> {firstSeen, lastWake, attempts}`. A message is woken when it is new, then on backoff only if still unread (for example 5 min, 15 min, 1 h, then stop at N attempts and surface it in the UI instead of retrying forever).
3. Wake with the existing `runWakeChain` (so the idle/busy checks, pane-readback confirmation and the deferred-to-idle queue all apply). Never type into a busy pane.
4. Skip `system` and `heartbeat` types (same as `NOTIFICATION_SKIP_TYPES`).

**Not touched:** the existing per-agent 5-minute poll stays as a second net in this phase. Both paths share the wake-state file so they cannot double-fire for one message.

**Single-host safety.** Same code path as multi-host. No config needed. One timer, one directory scan per live agent per minute (cheap: stat and a small read).

**Controls.**
- `AIM_INBOX_SWEEP=off|shadow|on`. Ship as `shadow` first: it logs `[Sweep] would wake <agent> for <id>` and does nothing else.
- Hard caps: max wakes per sweep (default 5), max attempts per message (default 4), minimum gap between two wakes to the same agent (default 2 min).
- Log every decision in one format so the next incident is a grep.

**Open questions to answer while building** (not yet verified):
- Does the existing 5-minute poll re-wake the same unread message every time an agent is loaded? The log shows `3m-hr` woken by the poll at 17:24, 18:24 and 19:24, each with "1 unread". If it re-wakes the same message, that is a cost bug and the shared wake-state fixes it as a side effect.
- Mesh-forwarded agents: the sweeper only handles agents whose session is on this host, same as the poll.
- Agents with no tmux session (detached Claude sessions): out of scope here; confirm the channel route covers them.

### Phase 2 - Doorbell (lower latency, plugin release)

- New small endpoint on the server (name to decide, for example `POST /api/v1/deliveries/notify`) taking `{ recipient, messageId }`. It checks that the file exists and is unread in that recipient's inbox, then runs the wake chain through the same shared wake-state (idempotent with the sweeper).
- `amp-send.sh` calls it right after the filesystem write: backgrounded, 1 to 2 s timeout, output discarded, never changes the exit code or the printed result. No server means no call result and nothing else happens.
- Plugin release chain: claude-plugin repo, plugin builder, AI Maestro bump, then `update-aimaestro.sh` on every host.
- Old plugin versions keep working through the Phase 1 sweeper.

### Phase 3 - Decide on a single delivery path (later)

Only if Phases 1 and 2 are stable for a few weeks. Option A with the filesystem write kept as the offline fallback, and failures reported plainly (never a fake "sent"). Needs its own plan and a test with the server stopped.

## Tests (must exist before merge)

Server (vitest):
- Sweeper wakes a new unread message exactly once and records it in the wake-state file.
- No second wake inside the backoff window; wake again after it while still unread; stop after the cap.
- A read message is never woken. System/heartbeat types are skipped.
- A busy pane defers; no keystrokes are sent (use the fake runtime from F026 Phase 0 when it lands, or the existing wake-chain test doubles).
- Agent not in the LRU cache (not loaded) still gets woken. This is the incident.
- Poll and sweeper together produce one wake per message.
- `shadow` mode logs and never calls the wake chain; `off` does nothing.
- Missing or corrupt wake-state file: starts clean, no crash, no mass wake (on first run, treat messages older than a threshold as already seen to avoid waking every old unread message).

Plugin (bats, Phase 2):
- Send with the server unreachable: exit 0, identical output to today.
- Send with the server slow (simulate a 10 s hang): send returns within about 2 s.
- Notify failure never changes the printed result.

## Rollout and rollback

1. Build on a branch, version bump, CHANGELOG, tests green.
2. Deploy to this Mac first in `shadow`, read the log for a day with real traffic, check that "would wake" lines match what an operator would expect.
3. Switch to `on` locally, then mini-lola, then mac-mini (the host with 20 sessions and the incident).
4. Rollback: `AIM_INBOX_SWEEP=off` and restart, or revert the PR. No data migration; the only new file is `wake-state.json`, safe to delete.

First-run guard: on the first run with no state file, mark every currently unread message as seen without waking, so enabling the sweeper cannot wake dozens of agents at once. (mac-mini has old unread messages dating back to March.)

## Risks

- **Wake storms and cost.** Mitigated by per-message state, backoff, caps, the first-run guard, and shadow mode.
- **Agent-to-agent loops.** A wake can cause a reply that causes a wake. The existing rule (no wake for acknowledgements, see the comment in `lib/message-delivery.ts`) must apply to the sweeper's wakes too. Note the incident itself involved a long exchange between `3m-hr` and `3m-counsel`.
- **Stale unread flags.** If the unread flag is not cleared when an agent reads a message by other means, the sweeper retries until the cap. The cap bounds it; surface "unread and unanswered" in the UI rather than retrying.
- **Scan cost with many agents.** About 40 agents on mac-mini, only those with live sessions are scanned. Measure in shadow mode.
- **Mixed plugin versions across hosts.** Phase 1 is independent of plugin versions by design.

## Out of scope

- Raising the LRU cap, any change to memory/CozoDB loading.
- Removing the filesystem delivery branch (Phase 3, separate decision).
- Cross-host wake: the host that owns the session wakes it.

## Related

- F026 (runtime abstraction): the sweeper's tests are easier once the runtime is behind an interface.
- Memory notes: three notification paths (stream, channel, pane) and the "prove it or don't claim it" delivery rule. Do not claim delivery without confirmation.
