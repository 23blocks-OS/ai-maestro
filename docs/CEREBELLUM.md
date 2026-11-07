# Cerebellum - Agent Subsystem Coordinator

**Version:** 0.23.3, brain status updated 2026-11-07 (see *The brain today* and *Speaking side*)
**Location:** `lib/cerebellum/`

Cerebellum is AI Maestro's subsystem coordinator. It manages autonomous background processes for each agent -- currently **memory indexing** and **voice narration**. Named after the brain region that coordinates movement without conscious thought, it handles the things agents need to do automatically.

## Architecture

```
                    ┌─────────────────────────────────┐
                    │          Cerebellum              │
                    │    (per-agent orchestrator)      │
                    │                                  │
                    │  ┌────────────┐ ┌─────────────┐ │
                    │  │  Memory    │ │   Voice     │ │
                    │  │ Subsystem  │ │ Subsystem   │ │
                    │  └────────────┘ └──────┬──────┘ │
                    │                        │        │
                    └────────────────────────┼────────┘
                                             │
                                   voice:speak events
                                             │
                    ┌────────────────────────┼────────┐
                    │       server.mjs       │        │
                    │   /companion-ws        ▼        │
                    │   WebSocket ──► browser client   │
                    └─────────────────────────────────┘
                                             │
                    ┌────────────────────────┼────────┐
                    │   Companion Browser    │        │
                    │                        ▼        │
                    │  useCompanionWebSocket          │
                    │       │                         │
                    │       ▼                         │
                    │    useTTS → TTS Provider        │
                    │    (Web Speech / OpenAI /       │
                    │     ElevenLabs)                  │
                    └─────────────────────────────────┘
```

## Subsystem Interface

Every subsystem implements this interface:

```typescript
interface Subsystem {
  readonly name: string
  start(context: SubsystemContext): void
  stop(): void
  getStatus(): SubsystemStatus
  onActivityStateChange?(state: ActivityState): void
  onCompanionConnectionChange?(connected: boolean): void
  addUserMessage?(text: string): void
  repeatLast?(): void
}
```

**SubsystemContext** provides:
- `agentId` -- the UUID of the agent this subsystem belongs to
- `emit(event)` -- dispatch events to listeners (e.g., `voice:speak`)

**ActivityState**: `'active' | 'idle' | 'disconnected'`

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `types.ts` | 38 | Subsystem, event, and state type definitions |
| `cerebellum.ts` | 127 | Orchestrator: lifecycle, event routing, state propagation |
| `index.ts` | 13 | Public exports |
| `terminal-buffer.ts` | 49 | Ring buffer (8KB) for accumulating PTY output |
| `session-bridge.ts` | 41 | TypeScript bridge for terminal buffer sharing |
| `session-bridge.mjs` | 57 | ESM bridge for server.mjs (shares `globalThis._cerebellumBuffers`) |
| `memory-subsystem.ts` | 57 | Wraps AgentSubconscious for memory indexing |
| `voice-subsystem.ts` | ~500 | Voice narration: buffer, LLM summarization, speech history |
| `voice-prompts.ts` | ~200 | LLM prompt, event classification, template fallbacks |
| `brain-inbox.ts` | 65 | Signals from the cerebellum and subconscious to the cortex (`brain/cortex-inbox.jsonl`). Written to, not read: see *The brain today* |
| `speaking-side.mjs` | ~300 | The speaking side (F100, experiment): the agent talking at its devices, handing work to its main session |

## Data Flow: Terminal Output to Spoken Voice

```
1. PTY Output
   Agent's tmux session produces terminal output (code, logs, errors)
        │
        ▼
2. Terminal Buffer (session-bridge.mjs)
   getOrCreateBuffer(sessionName) creates/retrieves an 8KB ring buffer
   PTY data is piped into it continuously via server.mjs
        │
        ▼
3. Idle Detection (server.mjs → agent.ts)
   After 30s of no PTY output, host-hints broadcasts 'idle' state
   Agent.handleHostHint() → cerebellum.setActivityState('idle')
        │
        ▼
4. Event Classification (voice-prompts.ts)
   classifyTerminalEvent() runs regex patterns on buffer content:
   - error: /\berror\b/i, /\bfail/i, /TypeError/, etc.
   - completion: /tests? pass/i, /build succeeded/i, /done$/i
   - transition: /starting/i, /moving to/i, /should I/i
   - status: anything with 5+ words that isn't noise
   - noise: short text with no patterns (skipped entirely)
        │
        ▼
5. Adaptive Cooldown Check
   Each event type has its own cooldown:
   - error: 0ms (immediate)
   - completion: 10s
   - transition: 15s
   - status: 30s
   - noise: skipped (never triggers LLM)
        │
        ▼
6. LLM Summarization (voice-subsystem.ts → Claude Haiku)
   System prompt: VOICE_CONVERSATIONAL_PROMPT (4 decision rules; reply SILENT to say nothing)
   User turn:
   - Speech history ring buffer (last 5 spoken events with timestamps)
   - Recent conversation turns from JSONL (last 6 turns)
   - Last user message from companion
   - Event type hint: [Event type: error]
   - Terminal output (last 2000 chars)
   Model: claude-haiku-4-5, max_tokens: 150
        │
        ▼
7. Fallback Chain (if LLM unavailable)
   a. Template-based summary (pattern matching: "Tests are passing.", etc.)
   b. Simple ANSI-strip + truncation (last resort)
        │
        ▼
8. Speech Event Emission
   cerebellum emits { type: 'voice:speak', payload: { text } }
   Text is pushed to speech history ring buffer (max 5 entries)
        │
        ▼
9. WebSocket Delivery (server.mjs)
   /companion-ws listener sends { type: 'speech', text } to browser
        │
        ▼
10. TTS Playback (useTTS hook)
    Three provider tiers:
    - Browser: Web Speech API (free, robotic)
    - Standard: OpenAI gpt-4o-mini-tts ($15/1M chars, 10 voices)
    - Premium: ElevenLabs ($206/1M chars, voice cloning)
```

## Voice Subsystem Details

### Speech History Ring Buffer

The voice subsystem maintains a sliding window of the last 5 speech events:

```typescript
interface SpeechHistoryEntry {
  text: string              // What was spoken
  timestamp: number         // When it was spoken
  eventType: TerminalEventType  // error | completion | transition | status
}
```

This history is injected into every Haiku prompt:
```
Your recent speech history (what you already told the user):
- 2 min ago: "All files updated, running tests now."
- 5 min ago: "Starting work on the auth module. Found 3 files to update."

Do NOT repeat information the user already heard. Build on it.
```

### Content Classification (3-Tier)

The LLM prompt uses a priority-ordered decision system:

| Tier | Condition | Action |
|------|-----------|--------|
| 1. Pass Through | Agent wrote natural language | Return verbatim (trim for speech) |
| 2. Summarize | Technical output (paths, diffs, logs) | Extract outcome, quantities, decisions |
| 3. Stay Silent | Spinner frames, noise, prompts | Return empty string |

**KEEP:** counts, totals, statuses, what happened, what's next, errors vs success
**DROP:** file paths, variable names, hashes, SHAs, API keys, schema names, UUIDs, code

### Template Fallbacks

When the LLM is unavailable (no API key, rate limited, error), pattern-matched templates provide natural-sounding speech:

| Pattern | Template |
|---------|----------|
| Tests passing (with count) | "42 tests passed." |
| Error / failure | "Something went wrong. Check the terminal." |
| Build succeeded | "Build finished successfully." |
| Files created/updated | "Files have been updated." |
| Installing/fetching | "Installing dependencies." |
| Migration | "Running migrations." |
| Deploy | "Deployment in progress." |
| Commit/push | "Changes committed." |

### Rate Limiting

- **Per-hour cap:** 60 LLM calls/hour (safety net)
- **Hourly reset:** Timer resets counter every 60 minutes
- **When rate limited:** Falls through to template/simple fallback
- **Noise skip:** Events classified as `noise` never trigger LLM calls

## Voice Commands (Client-Side)

The companion input intercepts natural language voice commands **before** they reach the agent:

| Command | Keywords | Phrases | Action |
|---------|----------|---------|--------|
| repeat | `repeat` | "say again", "pardon me", "one more time" | Replay last speech |
| stop | `stop`, `silence`, `hush` | "stop talking", "be quiet" | Stop current speech |
| mute | `mute` | "mute voice", "go silent" | Mute all speech |
| unmute | `unmute` | "unmute voice", "voice on" | Unmute speech |
| louder | `louder` | "volume up", "speak louder" | +0.2 volume |
| quieter | `quieter`, `softer` | "volume down", "turn down" | -0.2 volume |
| faster | `faster` | "speed up", "talk faster" | +0.2 rate |
| slower | `slower` | "slow down", "talk slower" | -0.2 rate |

**Matching strategy:**
1. Normalize input (lowercase, strip punctuation)
2. Short-circuit if >60 chars (too long for a command)
3. Check phrases first (exact match) -> `exact` confidence
4. Check keywords if <=8 words -> `high` confidence

## TTS Providers

### Three-Tier System

| Tier | Provider | Cost/month* | Quality | Setup |
|------|----------|-------------|---------|-------|
| Free | Web Speech API | $0 | Robotic | None (built-in) |
| Standard | OpenAI gpt-4o-mini-tts | ~$0.05 | High (1,106 ELO) | `OPENAI_API_KEY` |
| Premium | ElevenLabs | ~$0.33 | Highest (1,108 ELO) | ElevenLabs API key |

*Based on heavy use: 120 events/hour, 8 hours/day, 22 days/month.

### Per-Agent Configuration

Each agent stores its voice config in localStorage:
```
companion-tts-{agentId} → {
  provider: 'web-speech' | 'openai' | 'elevenlabs',
  voiceId: string | null,
  rate: 1.0,     // 0.5 - 2.0
  pitch: 1.0,    // 0.0 - 2.0
  volume: 0.8,   // 0.0 - 1.0
  openaiApiKey?: string,
  elevenLabsApiKey?: string,
}
```

### OpenAI Voices

10 preset voices with steerable generation:

| Voice | Character |
|-------|-----------|
| Alloy | Neutral, balanced |
| Ash | Warm, conversational |
| Ballad | Gentle, soothing |
| Coral | Clear, friendly |
| Echo | Smooth, resonant |
| Fable | Expressive, storytelling |
| Nova | Bright, energetic |
| Onyx | Deep, authoritative |
| Sage | Calm, thoughtful |
| Shimmer | Light, animated |

## The brain today (2026-11-07)

The February design (`marketing/agent-brain-architecture.md`, gitignored) describes an agent as three regions: the **cortex** (Claude Code, the agent's main session), the **cerebellum** (voice and coordination, a fast model, always on) and the **subconscious** (memory). Where each part stands:

| Part | State |
|---|---|
| Cortex | The agent's main session (Claude Code in tmux, or an SDK streaming session) |
| Subconscious | Built: indexing, consolidation, memory cards, recall in the hook (`lib/agent.ts`, `lib/memory/`) |
| Cerebellum: narration | Built: this file's voice subsystem narrates terminal output for the companion page |
| Cerebellum: speaking side | Built behind a flag (F100): talks with a person at a device and hands work to the cortex. See below |
| Brain inbox (regions → cortex, files) | Half wired: the subconscious writes memory signals; nothing reads them (no hook calls `/brain-inbox`) |
| Real-time channel between regions | Claude Code's own cross-session messaging (2.1.224+): proven 2026-11-07, about 0.2 s each way on one host. It is the "Unix sockets" step of the February roadmap, built into Claude Code |
| Voice of the agent (devices, phone) | `lib/speech.mjs`: ElevenLabs or Kokoro to speak, Scribe or faster-whisper to hear, per agent (F092, F099). Lives outside this folder |

## Speaking side (F100, experiment)

Spec: `docs/SPEC-SPEECH-AGENT.md`. Off unless an agent's profile turns it on (`experiments.speakingSide`).

- **What it is:** the agent itself, in the cerebellum's voice role. An SDK session (no tmux) with the agent's own `CLAUDE.md`, its recent notes and the rules for speaking, on Sonnet 5.5. It speaks sentence by sentence as it writes, through the same device path as `say`.
- **Its one tool:** `SendMessage`, to the agent's main session only (a `PreToolUse` hook refuses everything else; no MCP servers, no claude.ai connectors, nothing loaded from disk).
- **The hand-off:** real work goes to the main session over Claude Code's cross-session messaging, with where it came from (device, not verified). The main session answers with `SendMessage`; the speaking side says it. Needs Claude Code 2.1.224+ on both sides (the Agent SDK is 0.3.319, bundling 2.1.319).
- **Warm:** started by the kiosk's tap (`device.used`) so the person never waits for it, stopped after 10 quiet minutes (`'always'` keeps it up).
- **Fallback:** when the main session has no messaging socket, or anything fails before the turn is taken, the words go to the agent the usual way.
- **The chat:** its turns are logged in `~/.aimaestro/agents/<id>/speaking/log.jsonl` and merged into the chat by time (`lib/speaking-log.mjs`), so there are no holes.

Measured on mini-lola: first sentence 1.6 to 2.4 s from a warm session; hand-off round trip 5.8 s (channel 0.2 s each way, the main session's own thinking 4.1 s).

## Memory Subsystem

Wraps the existing `AgentSubconscious` with zero changes. Provides:
- **Conversation indexing:** Periodically indexes JSONL conversations for semantic search
- **Memory consolidation:** Long-term memory consolidation on schedule
- **Activity state propagation:** Forwards idle/active state to subconscious timers

## Integration Points

### server.mjs

```javascript
// Terminal buffer piping (line ~884)
const buffer = getOrCreateBuffer(sessionName)
ptyProcess.onData((data) => buffer.append(data))

// Companion WebSocket (line ~634)
companionWss.on('connection', (ws, query) => {
  const cerebellum = agent.getCerebellum()
  cerebellum.setCompanionConnected(true)
  cerebellum.on('voice:speak', (event) => {
    ws.send(JSON.stringify({ type: 'speech', text: event.payload.text }))
  })
})
```

### agent.ts

```typescript
// Agent initialization
const cerebellum = new Cerebellum(this.id)
cerebellum.registerSubsystem(new MemorySubsystem(subconsciousFactory))
cerebellum.registerSubsystem(new VoiceSubsystem())
cerebellum.start()

// Idle detection handler
handleHostHint('idle') → cerebellum.setActivityState('idle')
```

### Companion Browser (app/companion/page.tsx)

- `useCompanionWebSocket` -- receives `{ type: 'speech', text }` events
- `useTTS` -- manages provider lifecycle, per-agent config, speak/stop/mute
- `VoiceControls` -- settings UI (provider selection, voice, sliders)
- `matchVoiceCommand` -- client-side command interception before agent

## Adding a New Subsystem

1. Create `lib/cerebellum/my-subsystem.ts` implementing `Subsystem`
2. Export from `lib/cerebellum/index.ts`
3. Register in `lib/agent.ts`:
   ```typescript
   cerebellum.registerSubsystem(new MySubsystem())
   ```
4. Listen for events in `server.mjs` if needed:
   ```javascript
   cerebellum.on('my-subsystem:event', (event) => { ... })
   ```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | No | -- | Enables LLM-powered voice summarization (falls back to templates without it) |

Client-side API keys (OpenAI, ElevenLabs) are stored in localStorage per-agent, not as environment variables.
