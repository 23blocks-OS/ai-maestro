# F035 - Agents only write their own area: an outbox, and the server as the mailroom

**Status:** Todo (design note written, awaiting review)
**Type:** Design change (AMP delivery) and bug fix
**Created:** 2026-10-10
**Requested by:** Juan, 2026-10-10 (from issue #555, reported by brunopiccoli)

## Why

Issue #555: a Codex agent in `workspace-write` mode cannot send AMP messages to another local agent, because the sender script writes straight into the recipient's inbox, outside Codex's writable folders. Looking into it showed that "the sender writes into the recipient's folder" causes more than that one failure: forgeable senders, locked-down agents unable to send, "sent" without delivery, no wake-up, and two different delivery paths.

## Design

`docs/AMP-OUTBOX-DESIGN.md`. In short: an agent only writes its own outbox; AI Maestro validates, delivers (the same code as every other message), wakes the recipient and records `delivered` or `failed` in `sent`. The send command reports honestly: delivered, queued, or failed.

## Work (in order)

0. Honest failure now: explicit checks around the write in `amp-send.sh` (both branches), `save_to_sent` only after delivery, success printed only after the file is verified. Upstream: `agentmessaging/claude-plugin`, then the plugin builder, then AI Maestro.
1. Server outbox watcher and sweep, with tests (forged sender, bad signature, size limit, unknown recipient, duplicate id, restart mid-delivery, crash between delivery and move).
2. New `amp-send.sh` behavior and its evals.
3. Check whether a sandboxed Codex agent can write its own agent folder; if not, launch Codex with that one folder as an extra writable root.
4. Later: switch off cross-inbox writes by default.

## Related

F027 (reliable message wake; Phase 3 is the same question), issue #555 (this), issue #556 (unrelated iPhone scroll bug).
