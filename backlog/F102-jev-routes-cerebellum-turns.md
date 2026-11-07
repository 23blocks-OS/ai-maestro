# F102 — Jev decides if a turn is light (the cerebellum answers) or heavy (the main session works)

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-07

## Description

Today the cerebellum's own model decides, on every turn, whether to answer itself or hand the work to the agent's main session (F100). A classifier in front of it could decide first: Jev (TypeSafe's classifier, already used by the memory system) labels each turn light or heavy, with a calibrated probability. Heavy turns go to the main session at once, while the voice says "let me check". Light ones stay with the cerebellum.

Juan's idea (2026-11-07).

## Why It's Needed

- On a heavy turn the cerebellum's model first spends time deciding, then hands off: the main session starts later than it could.
- A separate decision is measurable: a threshold, and a count of how often it was right.

## Business Case

Faster answers on real work at a device, and a routing decision that can be tuned and reported on, instead of hidden in a prompt.

## Implementation Plan

- First measure Jev's time per call from mini-lola: it runs on every turn, so it must cost less than it saves (the cerebellum's first sentence is 0.9 to 1.4 s).
- Labels: light (talk, the device, the time, what is in the briefing) and heavy (anything about the agent's work, mail, systems, memory). Train or prompt from real turns in `speaking/log.jsonl`.
- In `lib/cerebellum/speaking-side.mjs`: classify the person's words before the model turn. Heavy above the threshold: say "let me check", hand off directly, and let the cerebellum only speak the answer. Otherwise as today.
- Log each decision and how the turn went, to tune the threshold.
- Related: F100, F018 (cheap models for tool work). Effort: S to M.
