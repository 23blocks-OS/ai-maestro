# Spec: hearing a device's speech with ElevenLabs Scribe

What a person says at one of an agent's devices is turned into text by ElevenLabs Scribe, for agents that already speak with ElevenLabs. Local hearing stays for everything else, and is the fallback.

Status: built in 0.106.103 (Juan took the recommendations in section 9: per agent, the kiosk line, fallback to local). First real check on mini-lola: Scribe 0.51 to 0.66 s per clip (0.47 to 0.9 s over a day of tests at the MacBook), local hearing 2.18 s warm and 5.45 s cold, the same words. Backlog: F099. Related: F092, `docs/SPEC-ELEVENLABS-VOICE.md` (speaking), B036 (language), B037 (delay), F097 (hearing on another machine).

## 1. What it changes, and what it does not

| | Today | With this |
|---|---|---|
| Who hears a person at a device | faster-whisper on the agent's host | ElevenLabs Scribe, for an agent whose voice is ElevenLabs. Local for the rest |
| Time to text, per clip | 3.1 s warm, 4.4 s cold on mini-lola | To measure. Expected well under a second plus upload time |
| Memory on the host | about 250 MB while a person talks | none, for Scribe |
| The agent's thinking time | about 10 to 12 s per turn | unchanged |
| The phone | Apple hears on the phone | unchanged |

This is the one step that makes talking at a device faster. It does not make the agent faster.

## 2. Today's path

1. A person taps the mic on the device and talks, then taps again. At most 20 seconds.
2. The device sends one signed `audio` event to the host's hub: a WAV, 16 kHz mono, at most 640 KiB (`protocol/reverse.md`). The hub acknowledges it at once.
3. `Controller.onAudio` (`lib/device-sdk/controller.mjs`) checks the device, makes it active, and calls `transcribe(audio)`.
4. `lib/speech-local.mjs` `transcribe` runs faster-whisper in the warm program, told English (B036).
5. The text becomes `device.input`: the device shows "You said …", and the agent gets it as a device message (`lib/device-events.ts`).

Only step 4 changes.

## 3. The choice: per agent, not per host

**Scribe is used only when the agent's voice is ElevenLabs** (`agent.voice.engine === 'elevenlabs'`) and the host has the key. An agent on local voice keeps local hearing, even when another agent on the same host uses ElevenLabs.

Why not "whenever the host has a key", as F099 first said: someone who chose local voice chose to keep audio on the network. A key added for a different agent must not send that agent's people's voices out.

**This needs the device SDK to say whose clip it is.** Today it calls `transcribe(audio)` with no agent. The change, in `agentmessaging/agent-device-protocol` (`packages/sdk/controller.mjs`):

```js
const text = (await options.transcribe(audio, { agent: route.agent.address, device: key })).trim()
```

It is SDK API, not the wire protocol: no device changes, and an older `transcribe(audio)` ignores the second argument. Then AI Maestro repins the SDK.

Decision for Juan in section 9. The simpler choice, per host, needs no SDK change.

## 4. The request

One request per clip, from the host:

```
POST https://api.elevenlabs.io/v1/speech-to-text
xi-api-key: <ELEVENLABS_API_KEY from the host's vault>
multipart/form-data:
  model_id       scribe_v2
  file           the WAV, as sent by the device
  language_code  en
→ 200 { text, language_code, language_probability }
```

- `language_code` is always sent, never guessed (B036). It comes from `HEARING_LANGUAGE` in `lib/speech-local.mjs` today, and from the agent when other languages come.
- No diarization, no audio-event tags, no timestamps: the agent needs the words only.
- The WAV is sent as is. The device's clip is at most 640 KiB, far under Scribe's limits.
- The key is read the same way speaking reads it (`elevenLabsKey()`, cached for a minute), never logged, never in an error.

## 5. Code

| File | Change |
|---|---|
| `lib/hearing-elevenlabs.mjs` | New. `transcribe(audio, { getKey, fetcher })` returns the text. 20-second timeout; one retry on a network error, 429 or 5xx; none on 401 or 422 |
| `lib/speech.mjs` | New `hear(audio, voice)`: Scribe when the voice is ElevenLabs and a key exists, otherwise local. Any Scribe failure falls back to local, with the reason logged |
| `lib/device-host.mjs` | The hub's `transcribe(audio, { agent })` looks up the agent's voice and calls `hear` |
| `components/AgentProfile.tsx` | The ElevenLabs line says both directions: "Paid. What the agent says, and what people say to it at its devices, is sent to ElevenLabs." |
| SDK copy, fixtures, `SOURCE` | Repin after the protocol change |

Kokoro's one-at-a-time turn does not apply to Scribe: it exists for memory, and Scribe uses none. The warm local program is not started for a Scribe clip.

**A log line for every clip:** `[Voice] Heard <device> in <ms> ms (<engine>)`. It gives the real numbers in section 8 and helps B037.

## 6. When it fails

| Case | What happens |
|---|---|
| No key, wrong key, quota used up, ElevenLabs down, timeout | Local faster-whisper hears it. Slower, but the person is heard |
| No local hearing either | As today: the clip is lost and logged (`audioFailed`). The device shows no "You said" |
| Scribe returns empty text | Nothing is sent to the agent, as with local hearing |

## 7. Privacy, cost and rules

- **A person's voice leaves the network.** It is anyone near the device, not only the owner. The microphone switch and the in-use sign on the device already show when it listens. This adds where the audio goes. Decision for Juan in section 9: should the kiosk say so?
- **ElevenLabs keeps the audio.** Zero retention (`enable_logging=false`) is for enterprise customers only.
- **Cost.** About $0.39 per hour of audio (figure from 2026-11-02, not re-checked). A 5-second clip is about $0.0005. Whether Scribe has a minimum charge per request is not checked.
- Same trust model as everything else: the network is the boundary. Hearing only runs for clips from paired devices, signed with their keys.

## 8. Tests and checks

Against a fake ElevenLabs on loopback, never the real service in CI:

- The request: model `scribe_v2`, language `en`, the WAV as the file, the key only in the header.
- The text out, trimmed. Empty text stays empty.
- 401, 422: no retry, local fallback. 429, 500, network error: one retry, then local. Timeout: local.
- The key in no error, log line or result.
- Per agent: a local-voice agent is heard locally on a host that has the key.
- The SDK change: `transcribe` gets the agent; an old `transcribe(audio)` still works.

Real check: the sentences from the test of 2026-11-07, said at the MacBook, with Lola on ElevenLabs. Compare the logged time per clip with faster-whisper's, and check names: "Juan", "ElevenLabs", "Lola".

## 9. Decisions for Juan

1. **Per agent or per host?** Recommended: per agent, as section 3. It costs one small SDK change. Per host is simpler, but sends the voices of people talking to a local-voice agent to ElevenLabs.
2. **Should the kiosk say that speech goes to ElevenLabs?** Recommended: one short line in the kiosk's settings, under Microphone, while the agent uses it. Guests in the room did not choose this.
3. **Fallback to local when Scribe fails?** Recommended: yes, like speaking.

## 10. Order of work

1. Protocol: the SDK passes the agent to `transcribe`. Small PR, its own tests. Skip if the choice is per host.
2. AI Maestro: repin, `hearing-elevenlabs.mjs`, `hear`, the profile line, the log line, tests.
3. Real check at the MacBook (section 8).
4. Kiosk line (if decided), in the protocol repo.

Later, not in this spec: **streaming**, Scribe v2 Realtime, words as the person talks. A device sends one finished clip today, and the protocol does not carry live audio from a device to the host over its own connection. That is protocol work first (F080).

## 11. Not checked yet

- Real delay from mini-lola to ElevenLabs and back, per clip.
- Whether Scribe charges a minimum per request.
- How well Scribe hears names, a Spanish accent, and a noisy room, against faster-whisper.
- The price, re-checked.

Source, read 2026-11-07: [ElevenLabs speech to text](https://elevenlabs.io/docs/api-reference/speech-to-text/convert).
