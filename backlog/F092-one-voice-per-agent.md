# F092 — One voice per agent, on every device and call

**Status:** In Progress (setting in 0.106.80; speech on devices with Kokoro in 0.106.82)
**Type:** Feature
**Created:** 2026-11-06

## Description

An agent has one voice, the same on any host and any device. It is a property of the agent (`voice` in the registry: `engine` and `voiceId`), so it moves with the agent. The profile has a Voice section where the operator picks the engine:

- **Local models on the host:** free, stays on the network (F050 architecture 3, the cascade).
- **ElevenLabs:** paid, for people who want a better voice (F050 architecture 2).

Keys never go in the agent. They belong to the host, as F059 plans.

Still to build, in order:

1. Done: heard on the MacBook, Kokoro chosen over Piper (Juan, 2026-11-06). For 7 s of speech on mini-lola: Kokoro 6.5 s and 421 MB, Piper 0.7 s and 235 MB.
2. Done in 0.106.82: the host makes speech from the agent's `voice`, one sentence at a time.
3. Done: the device only plays it, with `speaker.play` and its own grant (protocol #28). The MacBook is a Core 2 Duo without AVX, so neural speech on the device is unlikely to run, and a voice made on the device would differ from home to home.
4. Still to do: ElevenLabs, voice notes in messages, then calls (F059), with streaming and interruption. On mini-lola the first sentence is ready after 3.6 s, and a pause can follow a short first sentence.

The other direction, hearing, is a separate question: Lola already transcribes audio messages with a script of her own. Study it and see what belongs in a protocol.

## Why It's Needed

`espeak-ng` works on the MacBook but sounds robotic (Juan, 2026-11-06). Worse, each channel would pick its own voice: the device one thing, the call provider another, so one agent would sound like several.

## Business Case

- Positioning: an agent is one presence, recognisable wherever it speaks, in line with agents owning devices.
- Choice: free and private by default, paid quality for those who want it.

## Implementation Plan

- Done: `AgentVoice` in `types/agent.ts`, checked in `updateAgentById`, Voice section in `components/AgentProfile.tsx`. Export and import copy it with the agent.
- Next: the test in step 1 decides the local engine and whether cascade becomes F050's V1 default.
- Protocol first for `speaker.play`, then repin the SDK, bridge, AI Maestro. Piper's maintained version is GPL: run it as a program, do not bundle it.
- Related: F050, F059, F078. Effort: the setting S; speech on devices M; calls are F059.
