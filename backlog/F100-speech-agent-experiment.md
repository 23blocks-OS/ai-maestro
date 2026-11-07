# F100 — Experiment: a fast speech agent answers at an agent's devices

**Status:** Todo (spec: [docs/SPEC-SPEECH-AGENT.md](../docs/SPEC-SPEECH-AGENT.md))
**Type:** Feature
**Created:** 2026-11-07

## Description

Behind a per-agent flag, off by default, a small and fast "speech agent" talks with a person at one of the agent's devices. It speaks as it writes, answers what it can from a short briefing, and hands everything else to the real agent through a direct, two-way channel with no inbox. Today's path is the default and does not change. Juan's idea (2026-11-07).

## Why It's Needed

After hearing and speaking were made fast (0.106.100 to 0.106.104), most of the wait at a device is one step of a large model over a large context (Lola: about 89,000 tokens per step), and nothing is spoken until the reply is finished. A conversation needs one to two seconds.

## Business Case

- Talking to an agent at a device, or later on the phone or a call, feels like talking to someone.
- The hand-off is the first working agent-to-agent channel faster than AMP mail: the base for a protocol proposal (the AMP-RTC drafts).
- It is the fast voice layer that V1 calls (F059) need, tried first where we control both ends.

## Implementation Plan

See the spec, section 11: a spike to measure Haiku 5.5 and Sonnet 5.5 first, then the flag and routing, the hand-off (`ask_lola`, `aimaestro-speech-reply.sh`), streaming speech, the chat lines, and the test with the flag off and on. Decisions for Juan in section 10. Related: F059, F068, F092, F098, F099. Effort: spike S; the experiment M to L.
