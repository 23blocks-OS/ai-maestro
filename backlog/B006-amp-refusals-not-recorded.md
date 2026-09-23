# B006 — AMP signature refusals (403) leave no readable record

**Status:** Todo
**Type:** Bug
**Created:** 2026-09-22

## Description

On 2026-09-22 a server refused 28 relayed messages from 3m-hr (to pas-lola, via mac-mini) with 403, and nobody could see why until the cause was worked out from timelines (stale AMP scripts, see F005). A refusal the server issues but doesn't record is exactly what our delivery-verification standard was written against.

Current state: the route path in `services/amp-service.ts` (~931-1047) does `console.warn` for spoofed tenant, `key_revoked`, `key_conflict`, `invalid_signature` and unsigned messages. Those lines only reach pm2 stdout on whichever host refused. They aren't structured, they're rotated away, and neither the sender nor the dashboard can see them. Open question: did these 403s come from a path that doesn't log at all (for example the relay/forward leg, `/api/v1/messages/pending`, or API-key auth)? That has to be confirmed first.

Expected: every AMP refusal writes one structured record: timestamp, host, endpoint, sender, recipient, forwarding host, reason code, key fingerprint (prefix), message id.

## Why It's Needed

Refusals are signal. With no record, a 403 reads as "message lost" to the sender, and debugging has to start from zero on the wrong machine. pas-lola's estimate: a logged line would have cost hours instead of two days.

## Business Case

- Reliability and support load: cuts time-to-diagnose for cross-host delivery failures
- Security: a durable audit of rejected signatures (spoofing, revoked keys) is a security control in its own right

## Implementation Plan

- Audit every 403/401 return in `services/amp-service.ts`, `app/api/v1/**` and the relay path; route all of them through one `recordAmpRefusal(...)` helper
- Append JSONL to `~/.aimaestro/logs/amp-refusals.jsonl` (with rotation), keeping the `console.warn`
- Expose `GET /api/v1/refusals?since=` and show the recent-refusal count per host in the Hosts view
- Optional: when refusing a *relayed* message, notify the forwarding host so the sender's side learns why
- Effort: S–M
