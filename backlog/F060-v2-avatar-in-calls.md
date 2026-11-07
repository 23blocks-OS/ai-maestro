# F060 - V2: The agent's face in a call (FaceTime with an agent)

**Status:** Todo (after V1; the face and state loops already exist)
**Type:** Feature
**Created:** 2026-11-02

Stage 2 of 5 in F050. Takes the talking part of F012 and the app's F018.

## Description

A V1 call with the agent's face on screen, moving its mouth with what it says, blinking, and showing its state (listening, thinking, working). The person may turn on their camera so the agent can see them later; that is optional and not part of the first version.

Two ways to draw the face:

| Way | How | Cost | Status |
|---|---|---|---|
| **Our face, on the device** | The call's audio drives the mouth of the face we already draw (`AgentFace.tsx`, loudness-driven jaw, about 245 calibrated rigs); the state loops (`LiveAvatar`, F012) play around it. Better: drive the mouth from visemes or phoneme timestamps that some TTS return | free, no video sent | Face and loops: done on the web. Lip-sync from call audio: not built. App: `LiveAvatar` without lip-sync |
| **Photoreal video avatar** | A provider turns the agent's audio into a video stream of a face (WebRTC out) | Simli about $0.01/min, HeyGen LiveAvatar about $0.10/min, Anam, Tavus higher | Not built |

## Why It's Needed

"FaceTime with an agent" is the most human way to work with one, and it is what people remember from a demo. A face also tells the person whether the agent is listening, thinking or working, which a voice alone does not.

## Business Case

- On-device face: no cost per minute and no new vendor, and nothing like it exists in other agent tools.
- The photoreal avatar is needed only where the agent must appear as a video someone else's software shows (V4 rooms, V5 Zoom). Behind an interface, because avatar vendors keep closing: HeyGen's first streaming product, Hedra realtime and Ready Player Me all shut down in 2026.

## Implementation Plan

1. Lip-sync the existing face from the V1 audio stream (Web Audio analyser in the browser; the same level in the app) (S). The app already reads real loudness from each WAV for companion mode's signals (`utils/wav.ts`), so this can start before V1.
2. Viseme mouth shapes when the TTS returns timestamps (ElevenLabs alignment, Azure visemes; see F050's provider table) (M).
3. State during a call: listening, thinking (the voice layer is waiting on the agent), working (the agent is busy) from the voice session events and `presenceOf(agent)` (S).
4. Optional avatar provider key (Simli first: cheap, takes our audio as PCM) behind a small interface (M).
5. Label it as AI on screen (EU AI Act Art. 50(4) for synthetic faces).

Effort: M for the free face; M more for a paid avatar.
