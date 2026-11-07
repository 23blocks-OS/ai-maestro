# F059 - V1: A voice call with an agent

**Status:** In Progress (signalling and the turn-by-turn voice mode exist; the agent's own voice, Scribe hearing and the cerebellum are built and measured for devices, about 2.5 s a turn; live audio both ways is what a call still needs)
**Type:** Feature
**Created:** 2026-11-02

Stage 1 of 5 in F050. Replaces F051, F052, F053 and B019's follow-up.

## Description

A person calls an agent, or an agent calls a person, from the iPhone app or the browser, and they talk like on a phone call: the person can interrupt, the agent answers in under a second, and long work continues after the call ends. No video.

The design, in one line: **a fast voice model talks with the person and hands the work to the slow agent.** The agent (Claude Code, Codex, any CLI) does the real work in seconds or minutes; the voice layer says "on it", keeps talking, and reads out the result. A job that outlives the call comes back as a person message and a push (AMP spec 13, shipped 0.106.54).

The five steps of a call and where each one is (the canvas `voice-business-models.html` draws them):

| Step | Protocol | Options (user brings the key) | Status |
|---|---|---|---|
| 0. Ring and answer (signalling) | HTTPS `/api/calls` + Expo push `call` | ours | Done: call state machine (`lib/amp-rtc.ts`, 0.106.18), call API and push (0.106.4x), the app's incoming-call screen |
| 1. Audio from the person | WebRTC (Opus) to the provider; or none when speech is turned to text on the device | provider SDK | Not built (the app has no WebRTC client; needs an Expo dev build) |
| 2. Speech to text | inside a speech-to-speech model, or streaming STT over WebSocket | on device (Apple, free), Deepgram, AssemblyAI, ElevenLabs Scribe, OpenAI, Gemini | On device: done in the app (turn by turn). Cloud: not built |
| 3. Text to the agent | voice layer tool call, then AI Maestro `chat:send` (terminal agents) or the stream session (streaming agents); AMP for results that outlive the call | OpenAI GPT-Live / gpt-realtime, Gemini Live, or a cascade with any LLM (Claude included) | Agent paths exist; the hand-off from a voice model does not |
| 4. Text to speech | inside the speech-to-speech model, or streaming TTS over WebSocket | on device (Apple, free), ElevenLabs, Cartesia, Deepgram Aura, OpenAI | On device and ElevenLabs: done in the app; Web Speech, OpenAI, ElevenLabs: done in the browser |
| 5. Audio to the person | the same WebRTC session; or played on the device | provider SDK | Played on the device: done. Real-time: not built |

## Why It's Needed

An agent that needs a person can only write to an inbox today, and the person may not look for hours. A call is the strongest signal there is, and talking is the fastest way to give an agent a task from a car or a walk. The app already rings and answers; what is missing is a conversation that feels like a call instead of a walkie-talkie.

## Business Case

- No other agent dashboard lets you call your agents. It is the headline feature of the mobile app.
- Bring your own keys keeps our cost at zero: about $0.12 to $0.50 for a 10-minute call on the user's account, depending on the provider (F050 has the table).
- The pieces built here (key store, voice session endpoint, hand-off to the agent) are reused by V2 to V5.

## What the device work gives V1 (2026-11-07)

Built and measured at the MacBook for devices, and reusable for a call:

| Step | Built | Measured |
|---|---|---|
| Hearing | ElevenLabs Scribe, one clip per turn, local faster-whisper as fallback (F099) | 0.47 to 0.9 s per clip |
| A fast brain | The cerebellum: a warm Sonnet 5.5 session per agent with its own card; hands real work to the agent's main session over Claude Code's messaging (F100) | first sentence 0.9 to 2.0 s, median 1.4 s |
| The agent's own voice | ElevenLabs on the host, Kokoro as fallback, one voice per agent (F092) | about 0.26 s per sentence |
| The whole turn | | about 2.5 s from the last word to the voice (22.9 s on 6 November) |
| Who is talking | A paired device can speak as its owner (F103) | |

The phone app (TestFlight 1.0.4) already sends the person's words as device input to the cerebellum when its switch is on, and plays the answer.

**What a call still needs that devices do not have:** live audio both ways. A device sends one finished clip per turn (tap, talk, tap), so there is no listening while the agent talks except the tap that stops it, and no streaming hearing. That is protocol work (F080) or a provider's real-time session.

**A choice this opens for V1 (Juan's to make):**
- **A. The cascade we have** (Scribe, the cerebellum, ElevenLabs), with live audio added. The agent's own voice and its own card on every call, so F092 holds. About 2.5 s a turn today; streaming hearing (Scribe v2 Realtime) would take most of the hearing time off.
- **B. A speech-to-speech model** (the plan above, step 1). Faster turn-taking, but its own voice, against F092, and its hand-off to the agent is less proven than the cerebellum's.

Recommended: run the step 1 spike against A, with the same questions and numbers, before choosing.

## Implementation Plan

0. **The agent's own voice on turn-by-turn calls (S, next, needs no ElevenLabs).** Calls use `/speech` on the agent's host, like companion mode, in place of a voice chosen on the phone. Today `useVoiceConversation.ts` never calls it: `docs/SPEC-ELEVENLABS-VOICE.md`, section 8. App team. The filler lines ("On it") were removed from the app in November.
1. **Spike (S, throwaway, not merged).** On localhost (the browser allows the microphone there): one speech-to-speech session with one tool, `ask_agent`, wired to one streaming agent. Measure first-word latency, the hand-off round trip and cost per minute, with OpenAI and with Gemini. Decide the default from the numbers.
2. **Provider keys on the host.** The ElevenLabs work reads one host-wide key from the vault first, the smallest slice of this step. Then F065 phase 1: provider secrets with host or org scope, Settings > Voice providers with a Test button, and `useSecret()` so the server on any host can use a key entered once. Keys never go to a browser or phone.
3. **Voice session endpoint (S).** `POST /api/voice/sessions` returns a short-lived provider token (OpenAI ephemeral key, Gemini ephemeral token) for one agent and one call, so the phone talks to the provider directly and the host never relays audio. Minute cap per call.
4. **The hand-off (M).** `ask_agent` from the voice model reaches the agent: streaming agents through the stream session, terminal agents through `chat:send`; the reply text goes back to the voice model. Work that outlives the call: the agent replies by AMP to the person.
5. **Signed call start (S).** A call that can instruct an agent starts from a request signed with the person's approved device key; only agents the person manages take orders (same rule as person messages). Optional `reason` on `POST /api/calls` (asked by the app team) so the ring screen and the agent's first words say why.
6. **Clients.** App: WebRTC client to the provider (app team, needs a dev build). Browser: the same, over HTTPS (`tailscale serve`, `docs/NETWORK-ACCESS.md` option E).
7. **Ring a locked iPhone (from F053).** CallKit with PushKit is the native experience; a time-sensitive push (what ships today) is the fallback. Apple requires every VoIP push to show a call screen, so only real calls use it.
8. **Tests (from F055).** Call state: out of order, cancel and accept at once, accepted but never connected, every call reaches an end state. Voice: a call with no key falls back to the on-device mode.

Risks: a speech-to-speech model has its own voice, which goes against F092: the spike must answer this too. GPT-Live's hand-off to an outside agent is not fully documented (the spike answers it; fallback is gpt-realtime with a tool). A voice call injects instructions, so step 5 is not optional. EU AI Act Art. 50: the agent says it is an AI at the start of a call.

Effort: spike S, then about one 6-day cycle with the app team.
