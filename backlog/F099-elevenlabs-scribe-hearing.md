# F099 — Hear a device's speech with ElevenLabs Scribe

**Status:** Todo (spec: [docs/SPEC-ELEVENLABS-HEARING.md](../docs/SPEC-ELEVENLABS-HEARING.md))
**Type:** Feature
**Created:** 2026-11-07

## Description

Speech at a device is turned into text on the host by faster-whisper today (`scripts/voice/serve.py`, `hear`). With an ElevenLabs key on the host, hearing uses ElevenLabs Scribe instead, the way speaking already does (`lib/speech.mjs`): the same account and the same key (`ELEVENLABS_API_KEY`). With no key, or when Scribe fails, local faster-whisper hears it, as today.

First step, whole clips: the device already sends one finished recording per turn (a signed `audio` event, at most 640 KiB), so one request per clip:

```
POST https://api.elevenlabs.io/v1/speech-to-text
xi-api-key: <key>
multipart: model_id=scribe_v2, file=<the WAV>, language_code=en
→ { text, language_code, language_probability }
```

`language_code` is sent, never guessed (B036). Streaming as a person talks (Scribe v2 Realtime) is a later step, only if whole clips are still too slow.

## Why It's Needed

- **Speed at a device.** faster-whisper takes about 3 to 5 seconds per clip on mini-lola (3.1 s warm, 4.4 s cold). Scribe should be much faster; to measure.
- **Load on mini-lola.** faster-whisper holds about 250 MB while a person talks, on a 4 GB host that already uses swap. Scribe uses none.
- **Accuracy.** The small local model heard "Juan" as "one" and "ElevenLabs" as "11 laps".

It does not change the agent's own thinking time, about 10 to 12 seconds per turn in the test of 2026-11-07, which is most of the wait. Nor the phone: Apple hears there.

## Business Case

- A better experience at a device for the cost of a few cents a day (about $0.39 per hour of audio, figure from 2026-11-02, not re-checked).
- One vendor and one key for speaking and hearing.
- Trade-off to state in the profile: a person's voice leaves the network, and ElevenLabs keeps it (zero retention is for enterprise customers only).

## Implementation Plan

- `lib/hearing-elevenlabs.mjs`: one function, the WAV in, the text out. 20-second timeout; one retry on a network error, 429 or 5xx. The key never in a log or an error.
- `lib/speech.mjs`: `hear(audio)` picks Scribe when the host has the key, otherwise local, and falls back to local on any failure. `lib/device-host.mjs` uses it for the hub's `transcribe` in place of `speech-local.mjs`.
- Choice: per agent, not per host (spec section 3): Scribe only for an agent whose voice is ElevenLabs. It needs the device SDK to pass the agent to `transcribe`.
- Tests against a fake ElevenLabs: the request (model, language, file), the text out, fallback on 401, 429, 500 and a timeout, the key in no error.
- Real check: the same sentences at the MacBook as on 2026-11-07, timed against faster-whisper.
- Related: F092 (one voice), B036 (language), F097 (hearing on another machine: not needed for a host that uses Scribe), `docs/SPEC-ELEVENLABS-VOICE.md`. Effort: S.

Source, read 2026-11-07: [ElevenLabs speech to text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).
