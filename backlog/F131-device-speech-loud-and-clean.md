# F131 — Device speech that is loud and clean on small speakers

**Status:** Done (0.106.265 loudness, 0.106.267 sending ahead)
**Type:** Feature
**Category:** Mobile toy (Bruce)
**Created:** 2026-11-23

## Description

Before AI Maestro sends speech to a board with `speaker.play`, it processes it for a small speaker: cut below 180 Hz, compress (threshold -30 dB, 6:1, attack 3 ms, release 60 ms, +10 dB), and limit the peaks to -1 dBFS. Optional: ask ElevenLabs for 22.05 or 24 kHz instead of 16 kHz.

## Why It's Needed

Measured on Bruce's board on 2026-11-23 (XIAO ESP32-S3 + MAX98357A on USB power). The firmware volume cannot go above 12% without distortion. ElevenLabs speech has its average 17 dB below its peaks; compressed as above, the average went from -22.5 to -14.8 dBFS, and Juan heard it "much louder" and clean at the same 12%. The hardware fixes are in ADP [F012](https://github.com/agentmessaging/agent-device-protocol/blob/main/docs/wiki/backlog/F012-louder-speaker-usb-board.md).

## Business Case

- About 8 dB louder speech with no hardware change, for every board and toy.
- A toy that is hard to hear in a room is not usable.

## Implementation Plan

- `lib/speech-elevenlabs.mjs` / `services/agent-speech-service.ts`: process the PCM for devices that declare `speaker.play` (not for the browser, which has its own volume). A small compressor and limiter in JS on 16-bit PCM avoids a new dependency such as ffmpeg.
- Keep one sentence (or one group up to 8 s) per `speaker.play`. The controller's call timeout is 15 s: a 10 s clip once arrived in 4.5 s on a busy home network and timed out while the board was still playing it.
- Send the next sentence while the current one plays, so there is no gap (the SDK allows up to 8 pending calls).
- A device setting for the sample rate (16 or 24 kHz), after a listening test.
- Effort: S to M.

## Status

- Done: `lib/speech-loudness.mjs` (low cut, RMS compressor, limiter at -1 dBFS) on every `speaker.play` from `lib/device-host.mjs`. On the clip Juan heard: peak -1.0, average -15.4 dBFS (ffmpeg: -14.8); played on Bruce's board.
- Done in 0.106.267: sending the next clip about 1 s before the current one ends (ADP PR #63 made calls play in order and the kiosk queue them). Earlier note: The Linux kiosk plays two calls at once instead of in order, so this needs an ADP rule first ("`speaker.play` calls play in the order they arrive") and a kiosk change. Until then there is a gap of about 1.7 s between clips on the board (transfer plus decoding).
