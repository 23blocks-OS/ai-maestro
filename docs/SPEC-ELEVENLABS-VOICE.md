# Spec: an agent's voice from ElevenLabs

An agent can speak with an ElevenLabs voice, the same one on its devices, in companion mode, on calls and in audio meetings. The host holds the key, makes the audio and sends it out. Nothing that plays the voice needs to know which engine made it.

Status: built (0.106.100) and in use: Lola speaks with ElevenLabs at the MacBook, the Air and the iPhone, and her cerebellum uses the same voice (about 0.26 s per sentence). Built: the engine, fallback to local speech, the voice picker, and the key in the vault. Later (Juan, 2026-11-07, "make it work first"): the daily limit, usage count, Settings → Voice, and the Doctor check. Backlog: F092 (one voice per agent). Related: F050, F059, F061, F065, F096, F097, B020.

This spec covers one direction: **agent to person**. A person's voice to the agent stays as it is, and is planned separately.

## 1. The model

Same as Kokoro today:

```
agent text ──► host ──► engine (local Kokoro, or ElevenLabs) ──► WAV, one sentence at a time
                                                                    │
              device: speaker.play  ◄───────────────────────────────┤
              companion mode, call: POST /api/agents/[id]/speech ◄───┤
              meeting: the same, one agent at a time ◄───────────────┘
```

1. **The host owns the voice.** The key lives on the host. No device, phone or browser sees it.
2. **The agent owns the choice.** `agent.voice = { engine: 'elevenlabs', voiceId }` already exists in the registry, and moves with the agent. Its validation already accepts ElevenLabs voice ids. No new field is needed.
3. **One audio format.** ElevenLabs returns `pcm_24000`, and the host adds a WAV header: 16-bit mono at 24 kHz, the format Kokoro writes. So `speaker.play`, `joinWavs`, the app's `utils/wav.ts` and the signals that follow real audio all work unchanged.
4. **One engine interface.** Every caller already uses `ready()` and `synthesize(text, voiceId)`, which yields WAV files. ElevenLabs is a second implementation of those two functions, and no caller changes shape.

## 2. What exists today

| Thing | State |
|---|---|
| `agent.voice`, engines `local` and `elevenlabs` | Done. The profile can already choose ElevenLabs, and nothing happens: every path checks `engine === 'local'` |
| Voice name in the profile | A free text box. An ElevenLabs id is a long code, so it needs a picker |
| `lib/speech-local.mjs` | Kokoro and hearing, warm while in use (0.106.98) |
| `lib/device-host.mjs` `speak`, `canSpeak` | Plays sentence by sentence with `speaker.play` |
| `services/agent-devices-service.ts` | Turns `speaker.say` into the agent's voice only for `local` |
| `services/agent-speech-service.ts` | `/speech`, for `local` only. Answers 409 `no_voice` otherwise. Next and headless routes exist |
| Secret vault, `lib/secret-vault.mjs` | Works, with `get(name)`. Server features do not read it yet (B020). mini-lola uses the `file` backend |
| Scoped provider secrets (F065) | Not built |
| App: `services/elevenlabs.ts` (F024) | **Calls ElevenLabs from the phone with a key in the iPhone Keychain, for voice calls.** The voice is picked on the phone, not on the agent. See section 8 |
| App: companion mode | Uses `/speech`, then the phone voice |
| Browser: `lib/tts.ts` | Calls ElevenLabs with a key in local storage and an old model id (B020). Left alone here |
| Audio meetings | Not built. Meetings are text today (`Meeting`, Zoom view) |

## 3. The key

- Stored in the host's vault as `ELEVENLABS_API_KEY`, with `aim-secret set ELEVENLABS_API_KEY` on that host, at a hidden prompt, so it is never pasted into a chat. `lib/speech-elevenlabs.mjs` reads it with `getBackend().get()`.
- This is the first server feature to read the vault. It is the smallest piece of F065 and of the fix for B020: a host-wide secret that AI Maestro itself uses. F065's scopes and sharing stay for later, and this code moves to `useSecret()` when they exist.
- **The key is per host, so it must be entered on every host where an agent uses ElevenLabs.** For Lola, that is mini-lola. An agent that moves to a host with no key answers `no_voice` until the key is added there, and the Doctor says so.
- The server reads the key when it first needs it and keeps it in memory for a minute, so a new key works with no restart. It is never logged, never returned by an API, and never sent to a peer.
- On a Mac, the keychain can refuse a server that was started outside the desktop session, or after a reboot with no login (`docs/SECRETS.md`). That counts as no key. It must show in the Doctor, not as silence.
- Recommended for whoever makes the key: restrict it to text to speech and reading voices, and set a credit limit on the key itself. To confirm in the ElevenLabs dashboard (section 13).

## 4. Making speech

New `lib/speech-elevenlabs.mjs`, and a small `lib/speech.mjs` that picks the engine from `agent.voice`.

Request, one per sentence:

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}?output_format=pcm_24000
xi-api-key: <key>
{ "text": "...", "model_id": "<model>", "previous_text": "<the sentence before>", "next_text": "<the sentence after>" }
```

- **Sentences.** The same split as `scripts/voice/serve.py`. `previous_text` and `next_text` keep the voice natural across separate requests.
- **Model.** One constant in the code, not a setting, so the same agent sounds the same on every host. Two candidates cost the same ($0.04 per 1,000 characters) and are about equally fast (about 100 ms by the vendor's figure): `eleven_flash_v2_5`, which the app already uses, and `eleven_v4_turbo`, which ElevenLabs now recommends for low delay. Step 1 decides by ear.
- **The 8-second rule.** `speaker.play` takes at most 384 KiB, so a long sentence is cut at 8 seconds of audio, as Kokoro's is. 8 s at 24 kHz is 384,000 bytes.
- **Overlap.** The generator asks for sentence N+1 before it yields sentence N, so the next sentence is made while one plays. It stays one ahead, never more, because a person may interrupt and unused audio is still paid for.
- **Stopping.** Closing the generator aborts the request in flight and removes the files, as Kokoro's does.
- **Limits.** 20 seconds per request. One retry on a network error, 429 or 5xx. No retry on 401 or 422. Kokoro's one-at-a-time turn does not apply: it exists for memory, and this uses none. Requests over the plan's concurrency limit wait in ElevenLabs' queue, which is not an error.
- **Voice id.** Sent with `encodeURIComponent`, on top of the registry's validation.
- **No voice chosen.** ElevenLabs has no default of ours. `engine: 'elevenlabs'` with no `voiceId` is `no_voice`.

What changes, everywhere the engine is checked:

| File | Change |
|---|---|
| `lib/speech.mjs`, `lib/speech-elevenlabs.mjs` | New |
| `lib/device-host.mjs` `canSpeak`, `speak` | Take the agent's voice, ask the engine, and stop on `{played:false}`. Device rules stay: active, `speaker.play` granted |
| `services/agent-devices-service.ts` | `engine === 'local'` becomes "this voice is ready here" |
| `services/agent-speech-service.ts` | The same. The answer does not change |
| `components/AgentProfile.tsx` | Voice picker (section 7) |
| `services/agents-core-service.ts` | Nothing: validation already fits |

`say` still sends `display.text`, and a device still only plays what it receives. **The protocol does not change, and the devices need no update.**

## 5. Where the voice goes

### Devices

`speaker.say` becomes `speaker.play` sentence by sentence, as with Kokoro. Hold to talk keeps working: while a person talks, the device plays nothing and answers `{played:false}`. **New:** `speak` must stop at that answer, so no more sentences are bought for audio nobody will hear. Today it keeps going.

### Companion mode

`/speech` stays the same: same route, same WAV, same `409 no_voice`. One small app change: fall back to the phone voice on any answer other than 200, not only 404 and 409.

### Calls

`components/Voice/VoiceCall.tsx` and `hooks/useVoiceConversation.ts` in the app make speech on the phone today. They change to the order in section 8, so that a call and companion mode sound the same. The call's signalling does not change. This is still turn by turn, as calls are today. It is not the real-time call of F059: it gives calls the right voice now, and F059 can replace the transport later.

### Audio meetings

Today a meeting is text. The one-way version:

- A person turns on "Hear this meeting" in the meeting. It is off by default, because every agent's words cost money. In a browser this tap also allows audio to play.
- Each agent's message is spoken in that agent's own voice, in the order they arrive, **one at a time**, so agents never talk over each other (`docs/SPEC-PEOPLE-CALLS-MEETINGS.md`, section 5). A tap on stop clears the queue.
- The client asks **each agent's own host** for its speech, so each host uses its own key. `/speech` already answers 409 `other_host` when asked for an agent it does not hold. CORS already allows this.
- An agent with no voice in the meeting is shown as text and skipped.
- Audio goes to the person's browser or app, not to a device. A device belongs to one agent, so it cannot be the room's speaker in this model.

This needs no media server: it is the same file-per-sentence path. The media server stays with F061, for people hearing each other.

## 6. When it fails

An agent keeps talking, in this order. The person is never left with silence and no reason.

| Case | What happens |
|---|---|
| No key, wrong key (401), quota used up, ElevenLabs down | The host uses Kokoro with its default voice if installed (Juan, 2026-11-07). With no local speech, the request fails with `speech_failed` |
| Unknown voice id | The same, and the Doctor names the agent |
| A failure in the middle of a reply | The rest of that reply uses the fallback |

A fallback voice is a different voice, which goes against F092, but it is better than silence. Each fallback is logged with the reason. The text always still arrives, so a reply is never lost.

## 7. Screens

**Settings → Voice,** per host:

- ElevenLabs key: set or not set, never shown. Add or replace it, and Remove.
- **Test**: lists voices with the key and says so. Costs nothing.
- Used this month, and the plan's limit, when ElevenLabs gives them (section 13).
- Daily limit for this host, in characters.

**Agent profile → Voice:**

- With ElevenLabs chosen, the text box becomes a list of voices from `GET /api/voice/elevenlabs/voices` **on the agent's own host**, with a play button that uses the free `preview_url`. Saved as `voiceId`; the screen shows the name.
- With no key on that host: "Add an ElevenLabs key on <host>", linked to Settings.
- The line under the option says what it costs and where text goes: "Paid. What the agent says is sent to ElevenLabs."

The voices route is a thin wrapper over `GET /v2/voices`, with `page_size=100`, returning `id`, `name`, `category`, `previewUrl`, `labels`. It needs both a Next route and a headless route. A person's cloned voices appear here because they belong to the account.

## 8. The app's own key

Today the app and the host would each make a voice, with different choices. One agent would sound like two people, which is what F092 exists to stop.

The order for calls and companion mode becomes:

1. `/speech` on the agent's host. This is the agent's own voice.
2. Only if that answers 404 or 409: the phone's ElevenLabs key, if set. This keeps calls working on older hosts, and for people who run no voice on the host.
3. The phone voice.

The Keys screen keeps its promise, because the phone's key still never leaves the phone, but it should say the key is only used when the agent has no voice of its own. The app team decides when to retire it.

## 9. Money and limits

Vendor prices read on 2026-11-07. Flash and v4 Turbo cost $0.04 per 1,000 characters past the plan.

| Plan | Per month | Characters included (Flash, v4 Turbo) | At once (Flash) |
|---|---|---|---|
| Free | $0 | 20,000 | 4 |
| Starter | $6 | 150,000 | 6 |
| Creator | $22 | 550,000 | 10 |
| Pro | $99 | 2,475,000 | 20 |

Estimates, not measured: a 300-character reply costs about $0.012 past the plan. Ten minutes of an agent talking non-stop is about 8,000 characters, or $0.32.

An agent can spend money in a loop, so:

- **Later: a daily limit per host** in characters. At the limit, section 6 applies and the Doctor says so.
- **Later:** the host counts characters per agent per day in `~/.aimaestro/voice/usage.json`, and shows them in Settings.
- `/speech` keeps its 500-byte limit per call.

## 10. Privacy and rules

- **What an agent says leaves the network.** With Kokoro it does not. Anything spoken goes to ElevenLabs, including whatever is in that sentence. The profile says this (section 7).
- **ElevenLabs keeps it.** Zero retention (`enable_logging=false`) is for enterprise customers only, so it cannot be promised here.
- The Doctor and Settings never show spoken text. Logs hold the agent, the count of characters and the error, never the text.
- **A real person's voice needs their consent.** AI Maestro only lists what the account holds. Cloning is done in ElevenLabs, under its rules, and is outside this spec.
- **The agent says it is an AI at the start of a call or meeting** (rule in F050). A natural voice makes this matter more. On calls, the first sentence is fixed text with the agent's name. To be confirmed with legal advice, which this spec does not provide.
- Same trust model as all of AI Maestro: anyone on the network can call `/speech`, so anyone on the network can spend characters. Until the daily limit exists, the plan's own allowance is the only limit.

## 11. Tests and order of work

Tests, against a fake ElevenLabs on loopback, never the real service in CI:

- PCM becomes a valid WAV that `joinWavs` and `speaker.play` accept. A 20-second answer is cut at 8 seconds.
- One sentence ahead, never more. Closing the generator aborts the request and removes the files.
- 401, 422, 429, 500 and a timeout each lead to the right retry and the right fallback.
- The key is in no answer, log line or error message, including a failed request.
- An agent on another host answers `other_host`. A host with no key answers `no_voice`. Moved agent: voice kept, Doctor finding on the new host.
- The daily limit stops a loop.
- The local engine behaves exactly as it does today.

Order, each step one PR:

0. **Calls use the agent's voice now, with Kokoro.** The order in section 8, in the app. This needs no ElevenLabs and no host change, so it does not wait for anything below. App team.
1. **Hear it (no code merged).** With Juan's key on mini-lola: the same five sentences with Flash and v4 Turbo, played on the MacBook. Juan picks the model and Lola's voice. Measure the time to a whole sentence from mini-lola, against Kokoro's 2.9 s. **The numbers here decide whether anything in section 13 changes.**
2. **Host.** Key, engine, the gates in section 4, fallback, limit, Doctor check, Settings, picker. Lola speaks on her devices and in companion mode.
3. **App.** Fall back on any answer other than 200 (section 5). App team.
4. **Meetings.** "Hear this meeting" in the browser, then the app.
5. **Streaming, only if step 1 or 3 shows a need** (section 13).

## 12. Decisions (Juan, 2026-11-07)

1. When ElevenLabs fails, the agent goes back to local speech.
2. Limits come later: make it work first.
3. Plan: Starter.
4. First test: point Lola at ElevenLabs and repeat the whole device and companion test.

## 13. Not checked yet

- Real delay from mini-lola. Every delay here is the vendor's figure, without network time.
- That `pcm_24000` is 16-bit little-endian mono with no header. Expected from the name and from common use; step 1 confirms it.
- The account usage route (`GET /v1/user/subscription`), the error body for a used-up quota, and API key limits. Not in the pages read.
- Whether the price and limits differ for `eleven_v4_turbo` on the API from what the pricing page shows.
- Spanish. Flash supports it, and work here stays English for now.
- **Streaming.** If a whole sentence takes too long, the host can use `POST /v1/text-to-speech/{voiceId}/stream` and pass audio to the app while it arrives. A device cannot use this, because `speaker.play` takes a complete file. Real-time calls (F059) would use the `multi-stream-input` WebSocket, whose contexts could suit interruptions. The docs do not say so, so that needs a test. Neither is needed while an agent's reply arrives as whole text.

Sources, read 2026-11-07: ElevenLabs docs for [text to speech streaming](https://elevenlabs.io/docs/api-reference/text-to-speech/stream), [models and concurrency](https://elevenlabs.io/docs/overview/models), [multi-context WebSocket](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-multi-stream-input), [voices](https://elevenlabs.io/docs/api-reference/voices/search) and [API pricing](https://elevenlabs.io/pricing/api).
