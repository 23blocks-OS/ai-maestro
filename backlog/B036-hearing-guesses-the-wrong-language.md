# B036 — Hearing on the host guesses the language, and can write English as Russian

**Status:** Done in the version in its changelog entry (hearing is told English)
**Type:** Bug
**Created:** 2026-11-07

## Description

Speech at a device is turned into text on the host by faster-whisper (`scripts/voice/serve.py`, `hear`). It is never told the language, so it guesses for each clip. On 2026-11-07 at 02:07 on the MacBook, English speech came out as Russian:

> И у вас гуд, и у вас гуд, но по-нотбаророл

Read aloud, it sounds like English: "…good, …good, but not… robotic". The clips just before and after came out in English.

Expected: English speech is written as English. Actual: on a short or unclear clip the small `base` model can pick another language, and the agent gets text in a script it should not.

The old `transcribe.py` did the same, so this was possible from the start (0.106.87). Voice work is English only for now, and that was never applied to hearing. The phone is not affected: Apple does its hearing.

## Why It's Needed

The agent gets nonsense and answers it, and the person does not know why.

## Business Case

Reliability of talking at a device, the core of agent devices.

## Implementation Plan

- Pass `language='en'` to `whisper.transcribe` in `scripts/voice/serve.py`. It also skips the guess, so each clip is a little faster.
- Later, when Spanish comes: the language becomes a setting on the agent, next to its voice (F092).
- Test: the fake worker in `tests/speech-local.test.ts` receives the language.
- Related: F092, B037 (the 15-second delay is a separate question). Effort: S.
