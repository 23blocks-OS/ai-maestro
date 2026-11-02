# F050 - Voice and video with agents: the five stages, the pipeline and the providers

**Status:** In Progress (plan of record 2026-11-02; V1 is next)
**Type:** Feature
**Created:** 2026-10-29 (rewritten 2026-11-02)

## Description

People and agents talk by voice and video: a call, a "FaceTime", a conference call, a meeting in AI Maestro, and later an agent inside a real Zoom, Meet or Teams meeting. Users bring their own provider keys; AI Maestro holds them and connects the pieces.

**The five stages** (one backlog item each; each stage reuses the one before):

| Stage | Item | What the person gets | Status |
|---|---|---|---|
| V1 | F059 | Call an agent, or the agent calls you; voice only, real time | In progress: ringing and turn-by-turn voice exist |
| V2 | F060 | FaceTime with an agent: its face moves with its voice | Face and state loops exist; lip-sync from a call does not |
| V3 | F061 | Conference call (audio) with several people and agents | Not built |
| V4 | F062 | Video meetings in AI Maestro (our own Zoom view with real video) | Not built |
| V5 | F063 | Agents join real Zoom, Meet, Teams: by phone dial-in, a bot service, or an app integration | Backlog |

The animated explanation, with every step clickable, is the canvas page `voice-business-models.html` of the ai-maestro agent.

## The pipeline: five steps in every call

Every voice product does the same five things. What changes is where each step runs and who provides it.

```
person ──1 audio in──► 2 speech to text ──► 3 the brain (voice layer + agent) ──► 4 text to speech ──5 audio out──► person
          (0: ring and answer happens before, on a separate control path)
```

| Step | Protocols | Options | In AI Maestro today |
|---|---|---|---|
| 0 Ring, answer, hang up | HTTPS + Expo push | ours | Done: `/api/calls`, `lib/amp-rtc.ts`, push `call`, the app's incoming-call screen |
| 1 and 5 Audio transport | **WebRTC** (Opus, DTLS/SRTP, ICE/STUN/TURN) for app and browser; **WebSocket** PCM between servers; **SIP/RTP** (G.711, 8 kHz) only for phone numbers | provider SDKs, LiveKit, Twilio/Telnyx for phones | Not built. Today audio never leaves the phone: it does steps 2 and 4 itself and sends text |
| 2 Speech to text | streaming over WebSocket, or inside a speech-to-speech model | Apple on device; Deepgram Flux; AssemblyAI Universal-Streaming; ElevenLabs Scribe v2 Realtime; Speechmatics; Gladia; OpenAI; local Parakeet | Apple on device: done in the app |
| 3 The brain | the voice model's tool call `ask_agent` → AI Maestro → the agent (`chat:send` or stream session); AMP person messages for long jobs | GPT-Live / gpt-realtime, Gemini Live, a voice platform with a custom LLM URL, or a cascade with any LLM (the only way to use Claude by voice) | Agent paths and person messages: done. Hand-off from a voice model: not built |
| 4 Text to speech | streaming over WebSocket, or inside the speech-to-speech model | Apple on device; ElevenLabs Flash; Cartesia Sonic; Deepgram Aura-2; Azure; Inworld; local Kokoro | Apple and ElevenLabs: done in the app; Web Speech, OpenAI, ElevenLabs: done in the browser |

**Where SIP fits.** SIP is the phone network's protocol. The app and the browser use WebRTC: wideband, encrypted, built for the internet. SIP appears only when a real phone number is involved: "call my agent from any phone", and an agent dialing into a Zoom, Meet or Teams meeting (V5 way A). OpenAI Realtime, LiveKit, Twilio, Telnyx, ElevenLabs, Vapi and Retell all accept SIP.

## Three architectures for the brain

1. **Speech-to-speech model** (V1 default candidate). One model hears, talks and is interruptible; it calls `ask_agent` for real work. OpenAI GPT-Live 1 ($0.05/min, built to delegate to a backend agent) or Gemini Live (cheapest). The phone talks to the provider directly with a short-lived token minted by the host; no media server, the key never leaves the host.
2. **Voice agent platform with a custom LLM.** ElevenLabs Agents ($0.08/min + LLM) calls any OpenAI-compatible `/v1/chat/completions` endpoint with streaming and tools, so AI Maestro itself could be that endpoint. Deepgram Voice Agent ($0.065/min with your LLM), Vapi ($0.05/min + your keys), Retell ($0.055/min, own WebSocket protocol) are similar. Fastest to a working call; one more vendor in the middle.
3. **Cascade** on the host (Pipecat or LiveKit Agents): STT + any LLM + TTS, each swappable, local options for free. Cheapest per minute, about 300-500 ms slower, more to build and tune.

## Bring your own keys: what works with which key

| The user brings | Result |
|---|---|
| An OpenAI key | Architecture 1 (GPT-Live or gpt-realtime), also SIP |
| A Gemini key | Architecture 1 (Gemini Live) |
| An ElevenLabs key | Architecture 2 (ElevenLabs Agents with AI Maestro as the LLM), or STT + TTS in a cascade |
| Deepgram or AssemblyAI + a TTS key + any LLM key | Architecture 3 |
| Only an Anthropic key | Not enough alone: Anthropic has no voice API. Claude is the brain in a cascade or behind a custom LLM endpoint |
| No key | Today's on-device mode: free, private, turn by turn |
| A Twilio or Telnyx key | Adds phone numbers and dial-in to meetings (V5 way A) |

What has to exist for "bring a key and it works" (all in F059): provider keys on the host (Settings, secret vault), a session-token endpoint, the `ask_agent` hand-off, a signed call start, and a WebRTC client in the app (dev build) and the browser (HTTPS).

## Cost for the user, 10-minute call (vendor prices, 2026-11-02, not measured)

| Stack | About |
|---|---|
| Gemini Live | $0.12-0.30 |
| GPT-Live 1 | $0.50 |
| ElevenLabs Agents | $0.80 + LLM |
| Cascade (Deepgram Flux $0.08 + small LLM + ElevenLabs Flash or Cartesia) | $0.20-0.40 |
| Local cascade | $0 |
| Add a photoreal face (V2) | + $0.10 (Simli) to $1 (HeyGen) |
| Dial into Zoom by phone (V5 A) | + $0.14 (Twilio outbound) |

The agent's own work is billed as today.

## Vendors that closed or changed (check before relying on one)

Hume EVI and Octave shut down on 2026-11-13. PlayHT closed on 2025-12-31 (Meta). Inworld bought Ultravox (October 2026). AssemblyAI is retiring its Voice Agent API. OpenAI marks the first gpt-realtime model as deprecated. HeyGen's first streaming avatar, Hedra realtime and Ready Player Me closed in 2026. Google's Meet Media API closes 2027-01-15. Every provider sits behind a small interface so it can be swapped.

## Lip-sync sources (V2)

Azure (22 visemes and 55 face blend shapes at 60 fps) is the richest; Cartesia gives word and phoneme timestamps; ElevenLabs gives per-character timings; Amazon Polly gives viseme marks in a separate call; Deepgram Aura and OpenAI TTS give none. The free fallback is loudness, which `AgentFace` already uses (Web Speech exposes no audio stream, so it cannot drive lip-sync).

## Rules for every stage

- A call that can instruct an agent starts from a request signed by the person's device key; only agents the person manages take orders (AMP spec 13 rule).
- The agent says it is an AI at the start of every call and meeting (EU AI Act Art. 50, from 2026-08-02). No recording without everyone's consent.
- A minute cap per call; the voice session closes while the agent works.
- Issues #697-#700 are still open on GitHub; close them pointing here once this plan is approved.

## Not checked yet

Spanish support in Deepgram Flux; mobile SDKs per platform; Google Chirp 3 and Azure STT prices; whether GPT-Live's hand-off to an outside agent works as described (V1 spike). Prices from third parties only: Inworld, Rime, Bland, Telnyx, LiveKit SIP.

---

## History: the review of the AMP-RTC proposals (2026-10-29)


### Description

Another team opened a workstream, "AMP-RTC", so an agent can place a voice call to a person's phone (the stated first goal: "Lola calls an iPhone without PSTN"), a person can call an agent from Companion, and later several people and agents can share a voice room. It is four issues (#697-#700) and seven draft PRs (#701, #702, #703, #705, #707, #709, #710), plus a draft protocol spec (agentmessaging/protocol#26). This item holds the review of all of it. Each part has its own item: F051 (call lifecycle), F052 (media and browser audio), F053 (iPhone incoming call), F054 (voice rooms), F055 (interoperability tests), F056 (the matching protocol drafts in agentmessaging/protocol), and B019 (the fake "connected" timer that exists today).

The combined specification is in `docs/SPEC-PEOPLE-CALLS-MEETINGS.md`.

### Why It's Needed

The idea that matters: **an agent that needs a person today can only write to an inbox, a chat, or a tmux pane, and the person may not look for hours.** (See the AMP notification work: three paths, none of which rings a person.) A call that rings a locked phone is the strongest "needs you" signal an agent could have. That is the product reason, and it is a good one. It is also the reason to be careful: it is the most expensive way to solve it.

### Business Case

- Positioning: "your agents can ring you" is memorable and no other agent dashboard we know of does it. It fits the mobile app and Companion we already ship.
- Risk: the full scope (media server, TURN, speech in and out, push, native iOS, rooms, federation) is a product of its own. Seven PRs have been opened, none runs a call, and only one (#701) has CI-run tests.
- Recommendation: **do the cheap slice first and prove the value before building media.** Stage 1 is the call state machine and a simulated call (F051). Stage 2 is a spike that does not need WebRTC at all: let an agent trigger an incoming-call screen on the phone for the voice path we already have (on-device speech to text over `/companion-ws`, speech events back; see closed #357/#358). If people use that, then build real audio. If they do not, we saved the media work.

### Implementation Plan

Verdict per item (details in F051-F055):

| Item | Verdict | One line |
|---|---|---|
| #697 coordinator issue | Keep, scope to F051 | Right first step, behind a flag |
| #701 state machine | Merge after two fixes | Pure, small, 6 tests pass in CI |
| #709 Postgres store | Do not merge as is | We have no Postgres in the product; IDs conflict with the spec; no tests |
| #698 media adapter issue | Defer | Depends on stage-1 result; LiveKit is a heavy dependency |
| #705 media interfaces | Hold | Types with no user yet |
| #710 browser audio | Hold, fix list in F052 | Browser microphone needs HTTPS; ICE ordering bug |
| #699 iPhone call issue | Keep as the real prize, other repo | Needs the app repo; Apple VoIP-push rules are a risk |
| #707 native bridge types | Hold | Types with no user yet |
| #700 interop tests | Keep as acceptance criteria | Not a task yet |
| #702 integration design | Merge as a doc after edits | Its claims about current code check out |
| #703 rooms design | Defer | Premature; keep as notes |

**Protocol side (F056):** the AMP protocol repo has six matching draft PRs and three issues. Same verdict: nothing there is a standard yet; it lacks a wire format and a human-identity answer, and it should follow a working prototype, not lead it.

Decisions Juan needs to make: (1) go or no-go on the idea at the cheap-slice scope; (2) the shape of the directory (F057); (3) where native iOS code lives (the mobile app is a separate repo, `ai-maestro-app`); (4) whether we accept Apple's VoIP push policy risk.

**The identity problem, answered (Juan, 29 Oct).** Humans are people the operator adds to a directory (F057); each runs their own AI Maestro app, which pairs with the instance. No authentication: the network is the trust boundary, and syncing the directory from AD or corporate directories is a later paid feature. Humans are not on a host: a directory entry is visible from every host (other hosts ask peers, as for agents), and a person is reachable through whichever hosts their app is connected to. Calls are therefore app to app inside the system, not an agent ringing an outside phone. Real phone numbers come later as one more media adapter, with a phone number field kept in the directory now; calling arbitrary people from agent numbers brings consent, AI-caller disclosure and robocall rules that differ by country, to settle before launch.

Order of work: **F057 (directory) first**, then one-to-one calls (F051, F052; start in the browser, which needs HTTPS for the microphone), then rooms (F054), then iPhone native (F053). The hard part of a natural call is the agent's reply time, not the audio: design a fast voice layer that talks with the person and hands work to the working agent.

Effort for the cheap slice: M. For everything: several L cycles and a decision on infrastructure.
