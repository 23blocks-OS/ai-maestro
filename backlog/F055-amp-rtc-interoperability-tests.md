# F055 - Call interoperability and failure tests (issue #700)

**Status:** Todo (becomes real once F051 exists)
**Type:** Feature
**Created:** 2026-10-29

## Description

Issue #700 asks for tests of independent AMP providers, unreachable devices, replayed or out-of-order messages, two devices answering at once, expired invites, revoked permissions, failed push and dropped media. The draft spec (protocol#26) lists seven acceptance tests that cover the same ground.

## Why It's Needed

The failure cases are where a calling feature goes wrong in front of a person: a phone that keeps ringing after the caller gave up, an answered call with no audio, two phones both connected.

## Business Case

Cheap if written with the state machine, expensive if added after. It is also the only part of #700 that can be done now; "independent AMP providers" needs a second implementation that does not exist.

## Implementation Plan

- Not a task yet; fold into F051 as the test list. The six existing tests in #701 already cover duplicate, unauthorized actor, late accept, wrong device, cancel.
- Add: out-of-order delivery (accept before ringing), cancel and accept at the same instant, expired-while-accepted, end after connected from either side, duplicate event across calls.
- Add a phantom-call check: every call must reach a terminal state; assert it in a property-style test.
- Cross-provider, push failure and media tests wait for F052/F053.
- Compatibility matrix and metrics from the issue: later, and only if a second provider appears.
