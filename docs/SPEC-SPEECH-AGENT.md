# Spec: the cerebellum, an agent's fast voice (experiment)

When a person talks to an agent at one of its devices, a fast part of the same agent answers at once, speaking as it writes. Real work goes to the agent's main session, behind the scenes. It is an experiment behind a flag: today's path stays the default and does not change.

Status: live on Lola since 0.106.105 and tested at the MacBook (2026-11-07): about 2.5 s from the last word to her voice (first sentence median 1.4 s over 6 turns), 0.75 s to "Let me check." on turns that do work, "what do you see?" in about 4.5 s with no hand-off. Fixes from the tests: 0.106.106 (her things are her own, speak before acting, the time), 0.106.107 ("I'm still on it"). The phone uses it from TestFlight 1.0.4, and a paired phone speaks as its owner (F103, 0.106.108). Built: `lib/cerebellum/speaking-side.mjs`, routing in `lib/device-events.ts`, the chat log in `lib/speaking-log.mjs`, the kiosk's tap in agentmessaging/agent-device-protocol#42, the Agent SDK upgraded to 0.3.319. The locks (one tool to one session, no outside tools) were proven with the real SDK. Not yet run end to end at a device: the test in section 9 is next. First version: Claude Code's own messaging only; for agents without it, the words go the usual way (the other rows of 6.3 come later).

**Words used here.** *SDK session*: a Claude Code session the AI Maestro server runs through the Agent SDK, with no tmux (the same machinery as AI Maestro's "streaming agents", but not one of them: it has no entry in the agent list). *Word by word*: the reply arrives as the model writes it. *Terminal agent*: Claude Code in tmux, as Lola is. Backlog: F100. Related: F059 (the fast voice layer of V1 calls), F068, F092, F098, F101 (kiosk auth), `docs/SPEC-ELEVENLABS-VOICE.md`, `docs/SPEC-ELEVENLABS-HEARING.md`, the AMP-RTC drafts (agentmessaging/protocol #22 to #31).

## 1. Why

Measured with Lola at the MacBook on 2026-11-07:

| | From the person's last word to Lola's voice |
|---|---|
| First test with ElevenLabs hearing, 10:58 | 22.9 s |
| After the hook fix and the new skill, 11:42 | 5.8 s |

Of the 5.8 s, hearing is 0.8 s and her voice starting is 0.5 s. The rest, about 4.3 s, is one step of Lola's main model over about 89,000 tokens of context, and nothing is spoken until her reply is finished. The page `voice-speed-report.html` (ai-maestro agent's canvas) has the full numbers.

## 2. The idea

```
person ──speech──► device ──clip──► host: Scribe ──text──► Lola's speaking side (SDK session, warm, word by word)
                                                              │  speaks as it writes ──► ElevenLabs ──► device
                                                              │
                                                              └─ hand-off: the work, and who asked ──► Lola's main session (tmux)
                                                                                         ◄── her answer (native Claude Code messaging, section 6)
```

**Her things are her own** (Juan, 2026-11-07): whatever the person calls "you" or "your" (her inbox, her work) is the cerebellum's own, and it never talks as if it asked someone else. **It speaks before it acts:** when the model goes straight to a tool, the voice says "Let me look." or "Let me check." the moment the tool starts. Each turn carries the host's date and time. **It is Lola.** Its session is named `<agent>-cerebellum` (`pas-lola-cerebellum`), the name her main session sees. The speaking side has no identity of its own: it is the part of Lola's brain that talks (Juan, 2026-11-07). The person talks to Lola and hears Lola. When something needs real work it says what Lola would say ("let me check", "I'll work on it", "give me a moment"), and the main session does the work behind the scenes. It never mentions another agent or another part of itself.

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

**Runtime.** An SDK session in the AI Maestro server, built the way `lib/streaming-runtime.mjs` builds sessions, with this setup (checked in the spike). In the brain design of February 2026 this is the cerebellum's voice role (section 13).

| Setting | Value | Why |
|---|---|---|
| Model | Sonnet 5.5 | In the spike it spoke as Lola and said "let me check" naturally. Haiku 5.5 was not faster and leaked the machinery ("I can't look it up from this conversation") |
| Thinking | `{ type: 'between_tools' }` | How Sonnet 5.5 turns thinking off; `disabled` is refused |
| `tools` | `['SendMessage']` | The one built-in tool: Claude Code's own cross-session message, to hand work to the main session (section 6). No shell, no files, no web, no code |
| Its own tools | `look`, `show`, `health`, `listen`, in-process, on the device it is at | Quick things at the device it does itself (Juan, 2026-11-07): handing "what do you see?" to the main session would cost a full round trip. The device's own switches still decide |
| `settingSources` | `[]` | Loads nothing from disk: no hooks (which cost 2 s), no allow-rules, no project files. The host passes the card itself |
| Permission | A `PreToolUse` hook allows `SendMessage` only to the agent's own main session, and the four device tools, and refuses everything else | `canUseTool` is not consulted for `SendMessage` (spike) |
| Partial messages | on | Word by word: speak as it writes |
| `persistSession` | false | Nothing written to the agent's transcript folder |
| Working folder | an empty folder per agent | Nothing to read by accident |

**Warm and word by word are two different things, and both matter:**

- **Warm** means the session is already running. Starting one took 2.6 to 3.5 seconds in the spike. Warm saves that.
- **Word by word** means the host gets the reply as the model writes it. The host speaks the first sentence as soon as it is complete, while the model is still writing the rest. In the spike, Sonnet's first sentence was ready 0.9 s before its whole reply on a longer answer (1.64 s against 2.59 s). It matters more the longer the reply.

## 5. Staying warm, only while a device is in use

Always on costs memory: about 290 MB per warm session, measured on mini-lola (4 GB, already using swap). So on mini-lola:

1. **The kiosk tells the host the moment the person taps the mic.** Today it says nothing until the recording is sent. The SDK already has the signal: `device.used`, a signed event a device can send (`DeviceConnection.used()`). The kiosk sends it when talking starts. This is a one-line change in the protocol's kiosk (`clients/linux`). The hub already accepts the event and makes the device active; AI Maestro needs to act on it too (step 2).
2. **The host starts the speaking side on that signal,** if it is not already running. The person talks for 3 to 10 seconds; starting takes about 3. By the time the words arrive, it is warm. **The person never waits for it.**
3. **It stays warm** while the device keeps being used, and stops after 10 minutes with no input from any of the agent's devices. The next tap starts it again.

On a host with memory to spare (the planned new Mac mini), the setting can keep it warm all the time: `experiments.speakingSide: 'always'`.

## 6. The hand-off: how it works inside

When something needs real work, the speaking side says so to the person ("let me check") and hands the work to the main session.

### 6.1 The transport: Claude Code's own cross-session messaging

Claude Code (2.1.224 and later) gives every session an inbox socket on its own machine, and the `SendMessage` tool to reach another session ([docs](https://code.claude.com/docs/en/cross-session-messaging)). Checked on mini-lola, 2026-11-07: Lola runs Claude Code 2.1.318, her session has a socket (`/run/user/1000/cc-socks/<pid>.sock`, listed in `~/.claude/sessions/<pid>.json`), and her permission mode is `auto`.

What it gives, from the docs:

- **A busy session reads a message between tool calls**, never interrupting a running tool. An idle session starts a new turn with it. Typing into tmux, by contrast, waits until her current turn ends.
- **Delivered, held or refused.** A session in a prompting mode, `auto` included, delivers messages from another prompting session. A session that bypasses permissions holds them for approval unless the sender bypasses too. `crossSessionInbound: accept` in a session's settings delivers everything.
- **Trust built in.** The receiving Claude is told the message came from another session, not from the person. It cannot approve a permission, cannot change `CLAUDE.md` or settings because of it, and commands in it are plain text.
- **Replies are native.** The receiving session answers with its own `SendMessage`, to the sender's reply address.
- Plain text only, about a million characters at most, bursts and loops throttled. Never through Anthropic servers on one machine.

### 6.2 Step by step

```
 speaking side (SDK session)          AI Maestro server                 Lola (tmux, Claude Code)
 ───────────────────────────          ─────────────────                 ─────────────────────────
 1. says "let me check" ──► device (the server speaks it as it is written)
 2. SendMessage to Lola ─────────────── Claude Code socket ───────────► 3. arrives between tool calls,
    (task, who asked, what              (canUseTool allows only            or starts a turn if idle
     it already said)                    her own main session)          4. works with all her tools
 6. new turn with her answer ◄──────── Claude Code socket ──────────── 5. SendMessage back
 7. says it, as Lola ──► device (the server speaks it)
```

1. The speaking side tells the person it will check. The server speaks that sentence as soon as it is written.
2. It calls `SendMessage`, addressed to the agent's main session by its session name. Its permission check (`canUseTool`, in the server) allows `SendMessage` to that one session and nothing else.
3. Claude Code carries it over the main session's socket. Lola sees it between tool calls, or as a new turn if she is idle.
4. She does the work as usual.
5. She answers with `SendMessage` to the speaking side's reply address. Her `agent-devices` skill says to answer this way and keep it short and spoken.
6. Her answer arrives in the speaking side as a new turn.
7. The speaking side says it, as Lola, in one to three sentences. The server speaks it on the device that asked, and shows it in the chat.

**What the message says**, written by the speaking side under its rules:

```
From your MacBook, someone not verified (spoken, transcribed): "Can you check whether the deploy on mini-lola finished cleanly?"
I told them: "Let me check it and I'll come back with what I find."
Reply to me with what to say back, short and spoken.
```

With kiosk auth (F101) the first line names the person: "From your MacBook, Juan, verified by his face 2 minutes ago". The main session decides what to do with each, as it does today with device messages: an unverified person's words are input, not orders.

**What the server tracks.** Per speaking side: which device it is serving, and the open hand-offs (when sent, the person's question). When the main session's turn ends (from the one status feed) with no answer, the speaking side tells the person she is still on it, or could not finish. After about 20 seconds without an answer, it says "still on it" once. A server restart loses open hand-offs; the next turn starts fresh.

### 6.3 Other programs, and brains made of different providers

The hand-off is defined by the host, not by Claude Code. Its fields are always the same: an id, where it came from (device, who, verified or not), the task, what was already said, and a deadline. The host picks a transport for each pair of sides, by what each program supports. Claude Code's own channel is the fastest, used when both sides have it; every other pair still works.

| Sending side | Receiving side | Transport | Reply |
|---|---|---|---|
| Claude Code 2.1.224+ | Claude Code 2.1.224+, same host | Claude Code's own messaging (`SendMessage`) | `SendMessage` back |
| Any program | A terminal agent of any program (Claude Code, Codex, Pi, Copilot CLI) | The host types it into the agent's terminal through the chat's path (`sendChatMessage`), with the id | `aimaestro-speech-reply.sh <id> "..."`, a script that posts to the host |
| Any program | An AI Maestro streaming agent (SDK session) | The host pushes it into that session's input | The same script, or a host tool in that session |
| Any program | An agent on another host | An AMP message to that agent, carrying the same fields; its host then uses one of the rows above | AMP back, bound to the id |

**What makes every row work:** the speaking side never needs to know the other side's program. When it is not Claude Code (for example a voice model from another provider, or Codex, or Pi), it does not use `SendMessage`. It calls a tool the host gives it, `hand_off`, and the host delivers by the table. The reply script needs only a shell, so any program that can run a command can answer.

**Brains of one other provider, or mixed.** A brain made only of Codex, or only of Pi, uses the second and third rows for every leg. A brain where one provider talks (say a realtime voice model) and another works (Claude Code, Codex) uses the host's `hand_off` tool on the talking side and whatever the working side supports. Codex's and Pi's own machine interfaces (Codex's JSON-RPC server, Pi's RPC mode) could replace typing into the terminal later, as adapters behind the same table: not checked yet.

**Costs of the slower rows:** typing into a terminal waits until the receiving agent's turn ends, where Claude Code's channel is read between tool calls; and a reply script depends on the agent remembering to run it, which its skill must say. The host watches for a turn that ends without an answer (6.2).

### 6.4 The spike (2026-11-07): the hand-off works

A speaking side on mini-lola (an SDK session, Sonnet 5.5, named `lola-speaking-spike`) sent Lola's main session one test message with `SendMessage`, and Lola answered with `SendMessage`. Lola was told first, by AMP. Times from both sides' logs:

| Step | Time |
|---|---|
| `SendMessage` sent → in Lola's inbox | 0.18 s |
| Inbox → Lola starts a turn with it (she was idle) | about 1.5 s |
| Lola thinks and replies with `SendMessage` | 4.1 s |
| Her reply → arrives in the speaking side as a new turn | under 0.1 s |
| The speaking side has it ready to say | 1.2 s |
| Round trip | about 5.8 s |

Lola saw it as `<cross-session-message from-name="lola-speaking-spike" from-mode="prompting">`, answered to the sender's address, and her hook added nothing. Her chat files it as "Message from another session", visible only in X-Ray.

What the spike found, to handle before building:

1. **Claude Code version.** The Agent SDK in AI Maestro (0.3.205) bundles Claude Code 2.1.205, older than 2.1.224, and its sessions have no cross-session messaging ("No agent named 'lola-f9' is reachable"; no `ListAgents`). It worked with `pathToClaudeCodeExecutable` set to the host's Claude Code 2.1.319. Fix: upgrade the SDK (0.3.319 is current) and test AI Maestro's streaming agents on it, or point the SDK at the host's install.
2. **`canUseTool` is not called for `SendMessage` or `ListAgents`.** Claude Code allows them by itself, so `canUseTool` cannot hold the "only the agent's own main session" rule. Use a check that runs before every tool call (a `PreToolUse` hook given in the SDK options) and test that it can refuse a `SendMessage` to anyone else.
3. **The Claude account's connectors appeared.** On the reply turn the session also listed the claude.ai Claude Docs tools, although nothing was loaded from disk. The speaking side must load no outside tools: test a strict, empty tool configuration.
4. **The chat (F098).** A hand-off and its answer must show in the chat, not only in X-Ray.

Still open: a stable name per agent (`--name` worked here, `lola-speaking-spike`); a busy main session (read between tool calls, not measured); the speaking side warm across many turns.

### 6.5 Toward a protocol

On one host this is Claude Code's own channel; nothing new is needed. Between different agents, other programs, or hosts, the same fields become a protocol: a request with an id and an origin (device, who, verified or not), an answer bound to that id, a deadline, a cancel. The AMP-RTC drafts and the February brain design (section 13) are the starting points. Write it from what ran.

## 7. What the person hears and the chat shows

- **One voice.** The speaking side speaks in the agent's voice (`agent.voice`). The person hears Lola.
- **Speech word by word:** the host cuts the incoming text into sentences and speaks each through `lib/speech.mjs` and `speaker.play`, as today.
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

0. **Its name is the cerebellum.** "Speaking side" undersold it once it could look and listen too. The brain name was chosen over more exact ones (thalamus) because people know it. Its session is `<agent>-cerebellum`; screens say "cerebellum (fast voice)". Internal names (`experiments.speakingSide`, `speaking_message`) stay as they are.

1. **It is Lola.** No identity of its own, part of her brain. It loads her personality (her card).
2. **For real work it says "let me check", "I'll work on it"**, in her voice, never "I'll ask Lola".
3. **Warm while a device is in use** on mini-lola, started by the tap (section 5). Always warm on a host with memory to spare.
4. **The hand-off carries where the work came from**: the device, and who asked (not verified today, verified with F101).
5. **Model:** Sonnet 5.5, from the spike.

## 11. Order of work

1. **Protocol:** the kiosk sends `device.used` when talking starts (section 5). Small PR.
2. **The speaking side:** the session, the prompt from the card, warm on `device.used`, stop after 10 quiet minutes, the flag and the routing with fallback.
3. **Speaking word by word** from its text.
4. **The hand-off:** build the transports in 6.3, starting with Claude Code's own messaging (proven in 6.4), after fixing what 6.4 found: the SDK's Claude Code version, the tool lock, the outside tools. Then the waiting rules.
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

## 13. Earlier work this builds on

Found in the code, docs and backlog on 2026-11-07:

- **The brain design, February 2026** (`marketing/agent-brain-architecture.md`, `brain-practical-goals.md`, `brain-negatives-reality-check.md`): an agent as three regions. The **cortex** is Claude Code (Lola's main session). The **cerebellum** handles voice and coordination on a fast model, always on. The **subconscious** handles memory. The speaking side is the cerebellum's voice role. The design proposed a message format, `BrainSignal` (`from`, `to`, `type` with `request` among them, `priority`, `message`, `context`, `ttl`), and a roadmap: shared files first, Unix sockets for real time, then a peer-to-peer tool across machines. Claude Code's cross-session messaging is now that real-time step, built in.
- **The brain inbox, built in 0.24.12** (`lib/cerebellum/brain-inbox.ts`, `~/.aimaestro/agents/<id>/brain/cortex-inbox.jsonl`, `GET /api/agents/[id]/brain-inbox`): the subconscious writes memory signals to it (`lib/agent.ts`), but nothing reads them today: the hook does not call it, and no inbox file exists on mini-lola. Half wired.
- **The Cerebellum and its voice subsystem** (`lib/cerebellum/`, `docs/CEREBELLUM.md`): today a fast model turns terminal output into short spoken lines for the companion page. The speaking side is the next step for the same role: it talks with a person, not about the terminal.
- **F010:** deliver AMP messages through Claude Code's own session inbox. The same channel, for mail; its spike answers several questions in 6.4.
- **F068:** an agent hands its work to subagents so it can answer a call fast. The other way to the same goal; it keeps one session.
- **F018:** keep the intelligence, give the tool work to cheap models. The same idea of models by role.
- **The AMP-RTC drafts** (agentmessaging/protocol #22 to #31): real-time sessions between agents and people, for calls. The protocol side of 6.5.

## 14. Results at the MacBook (2026-11-07)

| Turn | Hearing (Scribe) | First sentence | Last word to her voice (est.) |
|---|---|---|---|
| Conversation, 6 turns | 0.47 to 0.90 s | 0.9 to 2.0 s, median 1.4 s | about 2.5 s |
| Work handed to the main session, before 0.106.106 | | 3.6 to 3.9 s | about 4.5 s |
| Work handed to the main session, after | | 0.75 s ("Let me check.") | about 1.9 s |
| "What do you see?" (the camera, no hand-off) | 0.63 s | 3.9 s | about 4.5 s |

The voice start adds an estimated 0.5 s (ElevenLabs). Real work takes what it takes: 11 to 55 s for the time in another city and for mail, with "I'm still on it." after 20 s since 0.106.107. Before the cerebellum the same turns took 5.8 s (the morning of 2026-11-07) and 22.9 s (the evening before).

Seen in the tests and still open:
- It said "I can't verify who's speaking from here" aloud. The trust rule is for it, not for the person; the prompt should keep it silent.
- Scribe heard "Sweet potato" once for what was likely "sweet, perfect".
- F102 (Jev routes light and heavy turns) would take the model's decision out of the hand-off path.

