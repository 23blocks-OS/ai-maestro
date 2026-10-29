# F051 - Call lifecycle and coordinator (issue #697, PRs #701 and #709)

**Status:** Todo
**Type:** Feature
**Created:** 2026-10-29

## Description

A pure state machine for one call (`lib/amp-rtc.ts`, PR #701), a durable store that arbitrates "first device to answer wins" (PR #709), and the issue (#697) that asks to wire both to AMP messages behind a feature flag. Part of F050.

## Why It's Needed

Whatever carries the audio later, something must decide whether a call is ringing, answered, or dead, exactly once, even when two phones answer at the same moment or a message arrives twice. That logic is small and has no dependencies, so it is the right first brick.

## Business Case

Cheapest piece, lowest risk, unblocks everything else, and it is testable without any media. It also fixes a lie we ship today (B019).

## Implementation Plan

**Review of #701 (accurate, valuable; merge after two fixes).**
- Accurate: the code does what the PR says. The six tests pass in CI (215 files, 3553 tests green), although the PR text says "tests not executed".
- Fix 1: the wrong-device check on `rtc:connected` only runs when the event carries a `deviceId`. Sending `connected` without one skips it. Require a device id on connected and compare it with the accepted one.
- Fix 2: only `inviting` and `ringing` expire. A call stuck in `accepted` (the phone answered, media never came up) lives forever. Add a short accepted-to-connected timeout.
- Note: the list of seen event ids grows with the call; fine for a call, but store it bounded.
- Note: event ids are only checked inside one call. That matches the spec.

**Review of #709 (valuable idea, wrong implementation for us).**
- AI Maestro stores its data in files and CozoDB and needs nothing else running. `pg` is in the repo only to introspect a user's database (`lib/rag/pg-introspector.ts`), not as our storage. Requiring Postgres for calls breaks the zero-infrastructure promise.
- First-answer-wins is easy on one host (one process, one lock per call); the recipient's own provider is the authority, per the spec. A database is needed only if several servers share one recipient, which we do not do.
- Concrete bug: `call_id` and `event_id` are `UUID` columns, but the spec's examples use opaque strings (`call_opaque_random`, `evt_opaque_random`) and #701's tests use `'rtc:ringing'` as an event id. Real events would be rejected by the database. `event_id` is also unique across all calls, so one call's id can collide with another's.
- No test file at all, and CI did not run (the PR is stacked on another branch, not main).
- Ask: put a small store interface in front (`get`, `applyEvent`, `expire`), ship a file-backed implementation first, keep Postgres as an optional adapter for anyone who wants it.

**Issue #697.** Scope is right (flag, simulated call as checkpoint, rollback = flag off). Add: where signed `rtc:*` messages enter (AMP inbox writer already carries `payload.type`), and how the coordinator tells the phone (see F053).

Open question for the spec: calls are addressed to a principal; who is a human principal, and which device? (F050.)
