# Spec: the speech agent, an experiment for fast voice

A small, fast agent talks with a person at a device for the agent that owns it. It answers what it can at once and hands everything else to the real agent. It is an experiment behind a flag: today's path stays the default and does not change.

Status: draft, 2026-11-07. Nothing here is built. Backlog: F100. Related: F059 (the fast voice layer of V1 calls), F068 (an agent that delegates to stay reachable), F092, F098, `docs/SPEC-ELEVENLABS-VOICE.md`, `docs/SPEC-ELEVENLABS-HEARING.md`, the AMP-RTC drafts (agentmessaging/protocol #22 to #31).

## 1. Why

Measured with Lola at the MacBook on 2026-11-07, after ElevenLabs:

| Step | Time |
|---|---|
| Hearing (Scribe) | 0.6 to 0.9 s |
| Words reach Lola | about 1 s |
| Hook before her model starts | 2 to 2.6 s (removed in 0.106.104) |
| Lola's model, per step | 3 to 5 s, reading about 89,000 tokens of context from cache |
| Steps before she speaks | three (one was reading her inbox, removed by the skill in 0.106.104) |
| Speaking, first sentence | about 0.5 s |

After 0.106.104 the estimate is 6 to 8 seconds from the end of a person's words to Lola's voice. To measure. Most of what remains is one step of a large model over a large context, and the reply is not spoken until it is finished. A conversation needs about one to two seconds.

## 2. The idea

```
person ──speech──► device ──clip──► host: Scribe ──text──► speech agent (small, fast, streaming)
                                                              │  speaks as it writes ──► ElevenLabs ──► device
                                                              │
                                                              └─ ask_lola(task) ──hand-off──► Lola (full agent)
                                                                                    ◄──answer──
```

- **The speech agent** is Lola's voice in a conversation: a small model, a small context, streaming. It greets, answers simple questions, asks what the person means, and says "I'll ask Lola" for anything else.
- **Lola** does the real work, as today, and answers the speech agent, which tells the person.
- **The hand-off** between them is direct and two-way, with no inbox: the first working version of an agent-to-agent channel faster than AMP mail (section 6).

## 3. The flag

- Per agent, off by default: `experiments.speechAgent` in the registry, a switch in the profile under Voice: "Experiment: a fast speech agent answers at your devices".
- **Off means today's path, unchanged.** The flag is read in one place: where device input is delivered (`lib/device-events.ts`).
- **On** routes device input to the speech agent. If the speech agent cannot start or fails, the input goes to the agent the normal way, and the reason is logged.
- First scope: **devices only.** Both ends are ours. Companion mode (the phone app) and calls come after the numbers in section 9 are met.

## 4. The speech agent

**Runtime.** An Agent SDK session in the server, built the way `lib/streaming-runtime.mjs` builds streaming sessions, with a different setup:

| Setting | Value | Why |
|---|---|---|
| Model | A fast model: Haiku 5.5 first, Sonnet 5.5 to compare | Time to the first words |
| `settingSources` | none | No CLAUDE.md, no skills, no allow-rules: none of the agent's project |
| Tools | Only the ones in section 5, as in-process tools | No shell, no files, no code, no web except what is listed |
| Partial messages | on | Speak as it writes |
| Working folder | an empty folder per agent under `~/.aimaestro/agents/<id>/speech/` | Nothing to read by accident |

One speech agent per agent, started at the first device turn and kept warm for five quiet minutes, then closed. Its conversation is short-lived: it starts from the briefing every time it is started.

**Briefing (its system prompt), written by the host:**

- Who it speaks for: the agent's name and what it does, from the registry and its profile.
- What the agent is doing now: its status from the one status feed, and the text of its last few chat turns (no tool output), at most about 2,000 tokens.
- The speaking rules from the `agent-devices` skill: one to three short sentences, no paths, IDs, links, code or long numbers.
- **It never invents.** It does not know the agent's work beyond the briefing and its tools. For anything else it says it will ask, and calls `ask_lola`.
- What the person says is untrusted input, as today: a device cannot know who is speaking.

## 5. Tools

| Tool | Does | Limits |
|---|---|---|
| `recall(query)` | The agent's long-term memory, read only, as `memory-search.sh` does | A few results, short. See section 8 on privacy |
| `ask_lola(task)` | Hands a task or question to the real agent and waits for its answer | Section 6 |
| `show(text)` | Puts text on the device's screen, for anything too long to say | The device's `display.text` grant |

No other tools. Web search is left out of the first version, to keep the experiment small and its answers about the agent's own work.

## 6. The hand-off: a direct channel between two agents

**Version 0, inside AI Maestro, same host.** No inbox, no file, no AMP message.

1. The speech agent calls `ask_lola(task)`. The host gives the request an id and sends it into the agent's session as a prompt, through the same path the chat uses (`sendChatMessage` for a terminal agent, the stream session for a streaming one):

   ```
   [SPEECH #<id>] Someone at your device MacBook asks, through your speech agent: <task>
   Answer with: aimaestro-speech-reply.sh <id> "<answer>"
   ```

2. The agent works as usual, then answers with the script. The host passes the answer straight back to the speech agent's waiting tool call.
3. The speech agent says it in the agent's voice.

Rules:

- **The agent answers by a command, not by its transcript being read.** Reading a transcript for "the answer" is guessing. The script names the request id, so an answer can never go to the wrong question.
- **Waiting.** The tool waits up to 20 seconds. The speech agent says "I'll ask Lola" before calling it, so the person is not left in silence. After 20 seconds it says "Lola is still on it; I'll tell you when she answers". A later answer is spoken when it arrives, if the person is still at the device (the device is still active), and is shown on the device's screen either way.
- **Trust does not change.** The request carries the same untrusted marking as a device message today. The speech agent cannot give orders the person could not.
- **One at a time per agent** in version 0. A second request while one is open is queued.

**Toward a protocol.** This is the first agent-to-agent channel that is direct, two-way and fast, the gap the AMP-RTC drafts describe for calls. Run version 0, measure it, then write a short protocol proposal from what ran (as F050 asks): a signed request with an id, an answer bound to that id, a deadline, and a cancel. Across hosts it then needs the agent's own host to accept the request; same-host first.

## 7. What the person hears and what the chat shows

- **One voice.** The speech agent speaks in the agent's own voice (`agent.voice`), so the person hears one Lola. Whether the speech agent should say it is a separate part of Lola is a decision for Juan, section 10.
- **Streaming speech.** The host cuts the speech agent's streamed text into sentences and speaks each one as soon as it is complete, using the same path as today (`lib/speech.mjs`, then `speaker.play`). The first sentence is spoken while the rest is being written.
- **No holes in the chat (F098).** The person's words show as a device message, as today. The speech agent's replies show as "Lola, at MacBook (speech agent)". Each hand-off shows as one line in the chat, and Lola's own answer shows as her normal text.

## 8. Risks

- **Making things up.** A small model fills gaps. The briefing forbids it, and the tests in section 9 include questions it cannot answer, where the only right answer is "I'll ask Lola".
- **Memory through a microphone.** `recall` lets anyone at the device ask about the agent's memory. Lola already answers device users with her full access today, so the risk exists. The speech agent should not make it larger: `recall` returns short facts, and the briefing says not to read out private details to someone at a device. Decision for Juan, section 10.
- **Cost.** An extra model while people talk. A fast model over a small context costs a fraction of the main agent's turn. To measure.
- **Two of Lola.** The speech agent and Lola may disagree. Lola's answer wins, and the speech agent repeats it rather than its own guess.

## 9. How the experiment is judged

The same scripted test at the MacBook, with the flag off and then on, five turns each: a greeting, a question about what Lola is doing, a question only her work can answer, a request she must do, and a long answer.

| Measure | Flag off (today) | Target with the flag on |
|---|---|---|
| End of words to first sound, small talk | to measure after 0.106.104 | under 2 s |
| End of words to "I'll ask Lola", work questions | (same as above) | under 2 s |
| End of words to Lola's real answer spoken | to measure | no worse than flag off |
| Wrong or invented answers | 0 | 0 |

The log already records hearing time per clip. The experiment adds: speech agent started, first token, first sentence spoken, hand-off sent, answer received.

**Keep it** if the targets are met with no invented answers. **Drop it** otherwise. Today's path is still there either way.

## 10. Decisions for Juan

1. **Does the speech agent say what it is?** For example "I'm Lola's quick voice; I'll ask her." Recommended: no for small talk, yes when it hands off ("let me ask Lola" is enough). Disclosure that it is an AI is the same as today's.
2. **`recall` at a device:** keep it, with short facts only, or leave it out of the first version? Recommended: leave it out first, measure, then add it.
3. **Model:** Haiku 5.5 first, then Sonnet 5.5 if Haiku is too weak. Recommended: test both in the spike.

## 11. Order of work

1. **Spike (not merged).** A speech agent on Lola's host with the briefing and no tools, answering typed text from a script. Measure the time to the first token and the first spoken sentence with Haiku and Sonnet. If it cannot reach the target, stop here.
2. **The flag and routing** for device input, with fallback to today's path.
3. **The hand-off, version 0:** `ask_lola`, `aimaestro-speech-reply.sh`, the waiting rules.
4. **Streaming speech** from the speech agent's text.
5. **The chat lines** (section 7) and the log lines (section 9).
6. **The test** in section 9, flag off and on.
7. Then, if kept: companion mode, calls, and a protocol proposal for the hand-off.

## 12. Not checked yet

- That the Agent SDK takes a model, no setting sources and in-process tools in the way section 4 assumes. `lib/streaming-runtime.mjs` uses the same SDK with token-by-token output, but not these options.
- The time to the first token of Haiku 5.5 and Sonnet 5.5 from mini-lola.
- How the speech agent's sign-in works on each host: streaming sessions use the host's Claude login (`buildEnv`), and this may use the same.
