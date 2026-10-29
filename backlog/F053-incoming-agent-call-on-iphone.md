# F053 - An agent's call rings a locked iPhone (issue #699, PR #707)

**Status:** Todo (decision on Apple policy and repo needed)
**Type:** Feature
**Created:** 2026-10-29

## Description

A phone registered to a person receives a push, shows the system incoming-call screen, answers or declines, and joins the audio. Issue #699 asks for the proof of concept; PR #707 adds type definitions for the bridge.

## Why It's Needed

This is the prize of the whole workstream: an agent can reach a person who is not looking at a screen. It also needs the least new server code if the audio part is postponed (F052).

## Business Case

Strong differentiation and a direct answer to "agents wait for me for hours". Risks: (1) the work is in the mobile app, which lives in a separate repo (`ai-maestro-app`), not here; (2) Apple only allows VoIP push for real calls and requires each push to show a call screen, so using it as a general alert risks rejection or revocation; (3) a call from software to a person needs consent, rate limits and a "do not disturb" model before it is safe (the spec itself says a verified agent identity is not permission to call a person).

## Implementation Plan

- Verify before anything else: does the app already receive push at all? Check the app repo. A normal high-priority notification may deliver 80 percent of the value with none of the VoIP policy risk.
- Server side in this repo: device enrolment (pairing over the trusted network, F050), a small push gateway module, the call timeout and cancel path from F051.
- #707 types: fine in shape, but `attestation` is an untyped string and nothing consumes them; hold.
- Checkpoint from the issue is right: a locked-device call including timeout and cancel. Do not start without the F050 decisions.
- Open: Apple developer account and VoIP certificate ownership; who builds the iOS side; Android equivalent.
