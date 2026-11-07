# Spec: Lola's speaking side, an experiment for fast voice

When a person talks to an agent at one of its devices, a fast, streaming part of the same agent answers at once. Real work goes to the agent's main session, behind the scenes. It is an experiment behind a flag: today's path stays the default and does not change.

Status: draft, revised 2026-11-07 after the spike and Juan's decisions (section 10). Nothing is built. Backlog: F100. Related: F059 (the fast voice layer of V1 calls), F068, F092, F098, F101 (kiosk auth), `docs/SPEC-ELEVENLABS-VOICE.md`, `docs/SPEC-ELEVENLABS-HEARING.md`, the AMP-RTC drafts (agentmessaging/protocol #22 to #31).

## 1. Why

Measured with Lola at the MacBook on 2026-11-07:

| | From the person's last word to Lola's voice |
|---|---|
| First test with ElevenLabs hearing, 10:58 | 22.9 s |
| After the hook fix and the new skill, 11:42 | 5.8 s |

Of the 5.8 s, hearing is 0.8 s and her voice starting is 0.5 s. The rest, about 4.3 s, is one step of Lola's main model over about 89,000 tokens of context, and nothing is spoken until her reply is finished. The page `voice-speed-report.html` (ai-maestro agent's canvas) has the full numbers.

## 2. The idea

```
person ──speech──► device ──clip──► host: Scribe ──text──► Lola's speaking side (fast, streaming, warm)
                                                              │  speaks as it writes ──► ElevenLabs ──► device
                                                              │
                                                              └─ hand-off: the work, and who asked ──► Lola's main session
                                                                                         ◄── answer, spoken in her voice
```

**It is Lola.** The speaking side has no identity of its own: it is the part of Lola's brain that talks (Juan, 2026-11-07). The person talks to Lola and hears Lola. When something needs real work it says what Lola would say ("let me check", "I'll work on it", "give me a moment"), and the main session does the work behind the scenes. It never mentions another agent or another part of itself.

## 3. The flag

- Per agent, off by default: `experiments.speakingSide` in the registry, a switch in the profile under Voice: "Experiment: a fast speaking side answers at your devices".
- **Off means today's path, unchanged.** The flag is read in one place: where device input is delivered (`lib/device-events.ts`).
- **On** routes device input to the speaking side. If it cannot start or fails, the input goes to the main session the normal way, and the reason is logged.
- First scope: **devices only.** Companion mode (the phone app) and calls come after the numbers in section 9 are met.

## 4. The speaking side

**What it loads (its prompt), written by the host each time it starts:**

1. **The agent's own card:** its `CLAUDE.md`, whole. For Lola that is 13 KB: her identity, mandate, boundaries and how she operates. The speaking side has her personality and her limits.
2. **What it has been doing:** its last few written replies from the main session (no tool output), newest last.
3. **How to talk at a device:** one to three short sentences, no paths, IDs, links, code or long numbers; never invent; for anything that needs checking or doing, say so as itself and hand it off (section 6).

**Runtime.** An Agent SDK session in the server, built like `lib/streaming-runtime.mjs` builds streaming sessions, with this setup (checked in the spike):

| Setting | Value | Why |
|---|---|---|
| Model | Sonnet 5.5 | In the spike it spoke as Lola and said "let me check" naturally. Haiku 5.5 was not faster and leaked the machinery ("I can't look it up from this conversation") |
| Thinking | `{ type: 'between_tools' }` | How Sonnet 5.5 turns thinking off; `disabled` is refused |
| `tools` | `[]` | No built-in tools: no shell, no files, no web, no code |
| Its own tools | `hand_off` and `show`, in-process (section 5) | The only things it can do |
| `settingSources` | `[]` | Loads nothing from disk: no hooks (which cost 2 s), no allow-rules, no project files. The host passes the card itself |
| Permission | `canUseTool` refuses every tool that is not one of its own two | A second lock in case a tool slips in |
| Partial messages | on | Streaming: speak as it writes |
| `persistSession` | false | Nothing written to the agent's transcript folder |
| Working folder | an empty folder per agent | Nothing to read by accident |

**Streaming and warm are two different things, and both matter:**

- **Warm** means the session is already running. Starting one took 2.6 to 3.5 seconds in the spike. Warm saves that.
- **Streaming** means the host gets the reply word by word as the model writes it. The host speaks the first sentence as soon as it is complete, while the model is still writing the rest. In the spike, Sonnet's first sentence was ready 0.9 s before its whole reply on a longer answer (1.64 s against 2.59 s). It matters more the longer the reply.

## 5. Staying warm, only while a device is in use

Always on costs memory: about 290 MB per warm session, measured on mini-lola (4 GB, already using swap). So on mini-lola:

1. **The kiosk tells the host the moment the person taps the mic.** Today it says nothing until the recording is sent. The SDK already has the signal: `device.used`, a signed event a device can send (`DeviceConnection.used()`). The kiosk sends it when talking starts. This is a one-line change in the protocol's kiosk (`clients/linux`). The hub already accepts the event and makes the device active; AI Maestro needs to act on it too (step 2).
2. **The host starts the speaking side on that signal,** if it is not already running. The person talks for 3 to 10 seconds; starting takes about 3. By the time the words arrive, it is warm. **The person never waits for it.**
3. **It stays warm** while the device keeps being used, and stops after 10 minutes with no input from any of the agent's devices. The next tap starts it again.

On a host with memory to spare (the planned new Mac mini), the setting can keep it warm all the time: `experiments.speakingSide: 'always'`.

## 6. The hand-off: a direct channel inside the agent

When something needs real work, the speaking side says so to the person ("let me check") and calls `hand_off`. The host sends the work into the main session, straight into its prompt, through the same path the chat uses (`sendChatMessage` for a terminal agent, the stream session for a streaming one). No inbox, no file, no AMP message.

**What the main session receives**, with where it came from:

```
[SPEAKING #<id>] Work from your device MacBook.
Who: someone at your MacBook, not verified (they said it; it was transcribed).
They asked: "Can you check whether the deploy on mini-lola finished cleanly?"
You already told them: "Let me check it and I'll come back with what I find."
When done, tell them yourself: aimaestro-speech-reply.sh <id> "<what to say>"
```

- **Who asked is always there.** Today it is "someone at your MacBook, not verified", because a device cannot know who is speaking. With kiosk auth (F101) it can say "Juan, verified at your MacBook by his face, 2 minutes ago". The main session decides what to do with each, as it does today with device messages: an unverified person's words are input, not orders.
- **The answer comes back by a command,** `aimaestro-speech-reply.sh <id> "..."`. It names the request, so an answer never goes to the wrong question. The host speaks it in her voice on the device that asked, and adds it to the speaking side's context, so the next turn knows it.
- **Waiting.** The person has already heard "let me check". If the answer takes more than about 20 seconds, the speaking side says once "still on it". A later answer is spoken if the person is still at the device (it is still the active device), and shown on its screen either way.
- **Trust does not change.** The hand-off carries the same untrusted marking as a device message. The speaking side cannot give the main session orders the person could not.
- **One at a time per agent** in this version. A second one while one is open waits.

**Toward a protocol.** This is a direct, two-way, fast channel between two parts of one agent, on one host. Run it, measure it, then write a short proposal from what ran: a request with an id and an origin, an answer bound to that id, a deadline, a cancel. Between two different agents, and across hosts, it becomes the agent-to-agent channel the AMP-RTC drafts describe.

## 7. What the person hears and the chat shows

- **One voice.** The speaking side speaks in the agent's voice (`agent.voice`). The person hears Lola.
- **Speech as it streams:** the host cuts the streamed text into sentences and speaks each through `lib/speech.mjs` and `speaker.play`, as today.
- **No holes in the chat (F098).** The person's words show as a device message. What the speaking side says shows as Lola at the MacBook. Each hand-off shows as one line, and the main session's answer shows as her text.

## 8. Risks

- **Making things up.** A fast model fills gaps. The prompt forbids it, and in the spike both models said "let me check" or "I don't want to guess" for everything they could not know. The test in section 9 checks this every time.
- **Memory through a microphone.** The speaking side has no memory search in this version: only her card and recent notes. Anyone at a device already gets Lola's full access today; this does not make it larger.
- **Two answers.** The speaking side and the main session may differ. The main session's answer wins, and the speaking side repeats it.
- **Cost.** One more Sonnet session while people talk. Small context, short replies. To measure.
- **Memory on mini-lola.** About 290 MB while warm, only while devices are in use (section 5).

## 9. How the experiment is judged

The same scripted test at the MacBook, with the flag off and then on, five turns: a greeting, "what are you working on", a question only her work can answer, a request she must do, and a long answer.

| Measure | Flag off (today) | Target, flag on |
|---|---|---|
| Last word to first sound, conversation | 5.8 s | about 3 s (hearing 0.8 + first sentence about 1.6 to 2.4 + voice 0.5) |
| Last word to "let me check", work | 5.8 s | about 3 s |
| Last word to the real answer, work | 5.8 s plus the work | no worse than today |
| Invented answers | 0 | 0 |
| The person noticing two parts of Lola | n/a | never |

Under 2 seconds needs the model's first words faster than Sonnet gave in the spike. Not a goal for this version.

The log records, per turn: hearing time, speaking side started or warm, first token, first sentence spoken, hand-off sent, answer received.

**Keep it** if the targets hold with no invented answers. **Drop it** otherwise. Today's path stays either way.

## 10. Decisions (Juan, 2026-11-07)

1. **It is Lola.** No identity of its own, part of her brain. It loads her personality (her card).
2. **For real work it says "let me check", "I'll work on it"**, in her voice, never "I'll ask Lola".
3. **Warm while a device is in use** on mini-lola, started by the tap (section 5). Always warm on a host with memory to spare.
4. **The hand-off carries where the work came from**: the device, and who asked (not verified today, verified with F101).
5. **Model:** Sonnet 5.5, from the spike.

## 11. Order of work

1. **Protocol:** the kiosk sends `device.used` when talking starts (section 5). Small PR.
2. **The speaking side:** the session, the prompt from the card, warm on `device.used`, stop after 10 quiet minutes, the flag and the routing with fallback.
3. **Streaming speech** from its text.
4. **The hand-off:** `hand_off`, the message with its origin, `aimaestro-speech-reply.sh`, the waiting rules.
5. **The chat lines** (section 7) and the log lines (section 9).
6. **The test** in section 9, flag off and on.
7. Then, if kept: companion mode, calls, kiosk auth (F101), and a protocol proposal for the hand-off.

## 12. The spike (2026-11-07)

A warm session on mini-lola, no tools, nothing loaded from disk, four questions, times until the first full sentence was ready:

| Question | Haiku 5.5, generic briefing | Haiku 5.5, as Lola | Sonnet 5.5, as Lola |
|---|---|---|---|
| Small talk | 2.1 to 2.5 s | 1.2 s | 1.8 s |
| Her recent work | 1.9 to 2.7 s | 2.4 s | 1.6 s |
| Needs real work | 1.6 to 1.9 s | 3.2 s | 2.4 s |
| Not in her notes | 1.5 s | 1.5 s | 1.7 s |

Starting a session took 2.6 to 3.5 s. A warm session used about 290 MB (the Sonnet run read 565 MB, likely counting the Haiku session still closing). As Lola, Sonnet said "Let me check it and I'll come back with what I find" and "I don't want to guess. Let me look it up in my records"; Haiku said "I can't look it up from this conversation".

Not measured: how much of the 1.6 to 2.4 s is the Claude Code process the SDK runs, against the model itself. Calling the model directly needs an API key on the host; the SDK uses the host's Claude login.
