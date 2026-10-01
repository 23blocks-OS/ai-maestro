# AI Maestro architecture

Detail for working on specific subsystems. `CLAUDE.md` holds the rules every
session needs; this file holds how things work. Read the section you need.

Other deep dives: `docs/CHAT-ARCHITECTURE.md` (chat send paths and question
renderers), `docs/CEREBELLUM.md` (subsystems, voice), `docs/LONG-TERM-MEMORY.md`
(memory), `docs/SKILLS-QUALITY.md` (skills and evals),
`docs/COST-OPTIMIZATION.md` (where an agent's money goes).

## Contents

- [Architecture: Critical Design Patterns](#architecture-critical-design-patterns)
- [Agent Messaging Protocol (AMP)](#agent-messaging-protocol-amp)
- [Critical Implementation Details](#critical-implementation-details)
- [Common Gotchas](#common-gotchas)
- [Environment Variables](#environment-variables)
- [Server Modes](#server-modes)
- [Testing the Application](#testing-the-application)

## Architecture: Critical Design Patterns

### 1. Custom Server Architecture (server.mjs)

**Why it exists:** Next.js alone doesn't support WebSocket on the same port as HTTP. The custom server combines both.

```
HTTP Requests → Next.js handlers (API routes, pages)
WebSocket Upgrades → Custom WS server (terminal streaming)
Both on port 23000
```

**Key constraint:** The server must handle:
- HTTP/HTTPS for Next.js (pages, API routes)
- WebSocket upgrade requests for `/term?name=<sessionName>`
- Session discovery via `tmux ls` command execution

When modifying `server.mjs`:
- Preserve the upgrade handler that intercepts WebSocket requests
- Maintain the session pooling logic (multiple clients → one PTY)
- Never block the event loop during PTY operations

### 2. Agent-First Architecture (CRITICAL)

**AGENTS ARE THE CORE ENTITY.** Sessions are optional properties of agents.

```
Agent (core entity)
├── id (UUID)
├── name (agent identity, used as session name)
├── label (optional display override)
├── workingDirectory (stored property, NOT derived from tmux)
├── sessions[] (array of AgentSession, typically 0 or 1)
│   ├── index (0 for primary session)
│   ├── status ('online' | 'offline')
│   └── workingDirectory (optional override)
└── preferences.defaultWorkingDirectory
```

**Key principles:**
1. **Agents can exist without sessions** - An agent for querying repos/documents doesn't need a tmux session
2. **workingDirectory is STORED on the agent** - Set when agent is created or session is linked
3. **NEVER query tmux to derive agent properties** - All agent data comes from the registry
4. **Sessions are discovered and LINKED to existing agents** - Not the other way around

**Two agent systems:**
- **`lib/agent-registry.ts`** - File-based registry (`~/.aimaestro/agents/registry.json`) with full agent metadata
- **`lib/agent.ts`** - In-memory Agent class for runtime (database, subconscious)

When you need agent metadata (workingDirectory, etc.), use the file-based registry:
```typescript
import { getAgent, getAgentBySession } from '@/lib/agent-registry'
const agent = getAgent(agentId) || getAgentBySession(sessionName)
const workingDir = agent?.workingDirectory || agent?.sessions?.[0]?.workingDirectory
```

**DO NOT:**
- Query tmux to get working directories
- Derive agent properties from tmux session state
- Assume an agent always has a session
- Create runtime lookups for data that should be stored

**Subconscious runs LOCAL to the agent:**

The subconscious process runs on the **same machine where the agent lives**. This means it has direct access to:
- Local conversation files (`~/.claude/projects/`)
- The agent's CozoDB database (`~/.aimaestro/agents/<id>/`)
- The local file system (workingDirectory, repos, etc.)

The subconscious does NOT need remote API calls to access agent data - everything is local. This is why `index-delta` can read `.jsonl` files directly from disk.

**Subconscious timers (v0.18.10+):**
- `maintainMemory()` - Indexes conversations for semantic search (runs periodically)
- `triggerConsolidation()` - Long-term memory consolidation (runs periodically)
- `checkMessages()` - **ENABLED by default**, every 5 minutes

**This entry previously said polling was disabled and had been "replaced by push notifications". That was wrong, and the error mattered.** The code default is `config.messagePollingEnabled !== false` — i.e. on unless explicitly turned off — and the poll is not a legacy leftover. It is the fallback that actually delivers when a push wake reaches the pane but never submits.

Measured on a customer estate (2026-09-02): four agents that a push wake had not woken all answered 4m22s–4m31s after the message, clustered within 9 seconds of each other. That is this 5-minute poll firing, not push. Anyone reading the old note would have believed there was no safety net underneath push — and would have drawn the wrong conclusion from an agent that "eventually" woke.

Set `messagePollingEnabled: false` to turn it off. Do not, unless you have proven the push path submits on every agent in the fleet.

### 3. Session Discovery Pattern

Sessions are discovered from tmux and LINKED to agents:

```
/api/sessions → Execute `tmux ls` → Parse output → Link to registry agents → Return JSON
```

Sessions are discovered from tmux and LINKED to agents in the registry. The
agent (registry entry) is permanent; its session comes and goes. Agents are
created, renamed, hibernated, woken and deleted from the UI and the API
(`/api/agents`), and across hosts.

When working with sessions:
- A session can disappear between API calls; handle `tmux ls` returning nothing.
- Session names must match `^[a-zA-Z0-9_-]+$`; build tmux commands with
  `lib/tmux-safe.mjs` (execFile + argv), never shell strings.

### 4. WebSocket-PTY Bridge

**Critical data flow:**
```
Browser (xterm.js)
  ↕ WebSocket messages (text/binary)
Server (node-pty)
  ↕ PTY (tmux attach-session -t <name>)
tmux session
  ↕ Claude Code CLI
```

**Important constraints:**
- PTY instances are pooled: Multiple WebSocket clients can connect to the same tmux session
- PTY is created on first client connect, destroyed when last client disconnects
- Terminal resize events must be propagated: Browser → WebSocket → PTY → tmux
- Input/output is binary-safe (supports ANSI escape codes, Unicode, etc.)

When working with terminal components:
- xterm.js handles rendering only - it doesn't know about tmux
- WebSocket is the only channel for terminal I/O (no polling for terminal data)
- PTY errors (session not found, tmux crashed) must close WebSocket gracefully
- Terminal dimensions (cols/rows) must sync on window resize

### 5. Tab-Based Multi-Terminal Architecture

**Critical architectural pattern (v0.3.0+):** All agents are mounted simultaneously as "virtual tabs" with CSS visibility toggling.

**Why this architecture:**
- Eliminates complex agent-switching logic (was 85+ lines of race condition handling)
- Terminals initialize once on mount, never re-initialize on agent switch
- Instant agent switching (no unmount/remount cycle)
- Preserves terminal state, scrollback, and WebSocket connections
- Agent notes stay in memory (no localStorage reload on switch)

**Implementation:**
```tsx
// app/page.tsx - All sessions rendered, toggle visibility
{sessions.map(session => {
  const isActive = session.id === activeSessionId
  return (
    <div
      key={session.id}
      className="absolute inset-0 flex flex-col"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        pointerEvents: isActive ? 'auto' : 'none',
        zIndex: isActive ? 10 : 0
      }}
    >
      <TerminalView session={session} />
    </div>
  )
})}
```

**Why visibility:hidden instead of display:none:**
- `display: none` removes element from layout → getBoundingClientRect() returns 0 dimensions → terminal initializes with incorrect width
- `visibility: hidden` keeps element in layout → correct dimensions → proper terminal sizing
- `pointerEvents: none` prevents hidden tabs from capturing mouse events
- Text selection works immediately without agent switching

**Terminal initialization pattern:**
```typescript
// components/TerminalView.tsx
useEffect(() => {
  // Initialize ONCE on mount, never cleanup until unmount
  const init = async () => {
    cleanup = await initializeTerminal(containerElement)
    setIsReady(true)
  }
  init()

  return () => {
    if (cleanup) cleanup()
  }
}, []) // Empty deps = mount once, no session.id dependency
```

**What was removed:**
- Agent change detection (currentSessionRef, sessionChanged checks)
- Race condition handling (initializingRef, duplicate initialization prevention)
- Stale initialization cleanup verification
- Notes/logging re-sync on agent change (loaded once on mount)

### 6. React State Management Pattern

**Deliberately minimal:** No Redux, Zustand, or complex state libraries.

```
App State:
- Active agent ID (localStorage persistence, drives visibility toggle)
- Agent list (fetched from /api/sessions every 10s)
- WebSocket connection state (per agent, persistent)

Component State:
- Terminal instance (xterm.js, created once per agent)
- Connection errors (transient, cleared on retry)
- Agent notes (loaded once, persist in component state)
```

**Key hooks:**
- `useAgents()` - Agent list across hosts, auto-refreshes
- `useSessionActivity()` - THE agent status store: one WebSocket per page, `presenceOf(agent)` (see CLAUDE.md, "Agent status")
- `useTerminal()` - Manages xterm.js lifecycle (init once, resize, dispose)
- `useWebSocket()` - Handles WebSocket connection, reconnection, message routing

When adding new state:
- Keep it in the nearest component that needs it
- Use Context only if 3+ components need the same state
- Never store terminal content in React state (xterm.js manages this)
- Consider if state needs to persist across agent switches (keep in component) vs. reload (use effect with session.id dependency)

### 7. UI Enhancement Patterns

**Hierarchical Agent Organization:**

Agents are organized in a 3-level hierarchy based on their names:
```
fluidmind/agents/backend-architect  →  Level 1: "fluidmind"
                                        Level 2: "agents"
                                        Agent: "backend-architect"
```

**Dynamic Color System:**
- Colors assigned via hash function (same category = same color)
- 8-color palette in `AgentList.tsx` (easily customizable)
- Supports localStorage overrides per category
- No hardcoded category names - works with ANY category

```typescript
const getCategoryColor = (category: string) => {
  // Hash-based color assignment from COLOR_PALETTE
  const hash = category.split('').reduce((acc, char) =>
    char.charCodeAt(0) + ((acc << 5) - acc), 0)
  const colorIndex = Math.abs(hash) % COLOR_PALETTE.length
  return COLOR_PALETTE[colorIndex]
}
```

**Icon System:**
- Uses lucide-react for consistent, accessible icons
- Default icon: `Layers` (can be customized per category)
- Icons for: folders, terminals, actions (edit, delete, create)

**Agent Notes Feature:**
- Collapsible textarea below terminal for per-agent notes
- Auto-saves to localStorage (`session-notes-${sessionId}`)
- Collapse state persisted (`session-notes-collapsed-${sessionId}`)
- Full copy/paste/edit support

**Agent Management:**
- Rename agents with validation (API call to backend)
- Delete agents with confirmation modal
- Create new agents with optional working directory
- All actions update UI optimistically with error handling

**UI Best Practices:**
- Avoid nested buttons (causes React hydration errors)
- Use `<div>` with `cursor-pointer` for clickable containers
- Always use `e.stopPropagation()` for nested interactive elements
- Keep hover states smooth with `transition-all duration-200`

### 8. Team Meeting Architecture (v0.20.19+)

**State machine pattern:** Team meetings use a `useReducer` with a `TeamMeetingState` that tracks meeting phase (`idle` → `selecting` → `ringing` → `active`), selected agents, and UI state (sidebar mode, right panel, kanban open).

**Task system:**
- Tasks stored per-team in `~/.aimaestro/teams/tasks-{teamId}.json`
- 5 statuses: `backlog` → `pending` → `in_progress` → `review` → `completed`
- Dependency chains: tasks can block other tasks, auto-unblock on completion
- `useTasks` hook polls every 5s for multi-tab sync

**Kanban board:**
- Full-screen overlay (`fixed inset-0 z-40`) matching agent picker overlay pattern
- Native HTML5 drag-and-drop (same pattern as AgentList.tsx)
- `KanbanCard`: `draggable={!task.isBlocked}`, stores taskId in `dataTransfer`
- `KanbanColumn`: `onDragOver`/`onDrop` handlers update task status
- Escape key closes modals in priority order: detail view → quick-add → board
- Blocked tasks show lock icon, not draggable

### 9. TypeScript Type System Organization

**Strict separation by domain:**

```
types/session.ts    - Session metadata, status enums
types/terminal.ts   - xterm.js configuration, dimensions
types/websocket.ts  - Message protocol, connection states
```

**WebSocket message protocol:**
```typescript
{ type: 'input', data: string }           // User typed in terminal
{ type: 'output', data: string }          // Terminal output from tmux
{ type: 'resize', cols: number, rows: number }  // Terminal resized
{ type: 'ping' / 'pong' }                 // Heartbeat
{ type: 'error', error: string }          // Protocol error
```

All WebSocket messages are JSON. Raw terminal output (ANSI codes) is wrapped in `{ type: 'output', data: ... }`.

## Agent Messaging Protocol (AMP)

**Overview:** AI Maestro uses the Agent Messaging Protocol (AMP) for inter-agent communication. AMP is like email for AI agents - it works locally by default and can optionally federate with external providers.

**Key Features:**
- **Local-first**: Works immediately without external dependencies
- **Cryptographic signing**: Ed25519 signatures for message authenticity
- **Federation**: Connect to external providers (CrabMail, etc.) for global messaging
- **Provider-agnostic**: Same CLI works with any AMP provider

### Installation

The AMP plugin is bundled in the plugin submodule at `plugin/plugins/ai-maestro/`.

```bash
# Install AMP scripts and skills
./install-plugin.sh

# Non-interactive installation
./install-plugin.sh -y

# Migrate existing messages only
./install-plugin.sh --migrate
```

**What gets installed:**
- AMP scripts (`amp-*.sh`) → `~/.local/bin/`
- AMP skill → `~/.claude/skills/agent-messaging/`
- Message storage → `~/.agent-messaging/`

### Quick Start

```bash
# 1. Initialize your agent identity (first time only)
amp-init.sh --auto

# 2. Send a message
amp-send.sh alice "Hello" "How are you?"

# 3. Check your inbox
amp-inbox.sh

# 4. Read a message
amp-read.sh <message-id>
```

### Architecture

**Two Components:**

1. **AMP Plugin (Client)** - Installed on each agent machine
   - Location: `plugin/plugins/ai-maestro/` (submodule)
   - Storage: `~/.agent-messaging/`
   - Commands: `amp-init`, `amp-send`, `amp-inbox`, `amp-read`, etc.
   - Handles: Key generation, message signing, local storage

2. **AI Maestro (Provider)** - Server that routes messages
   - Endpoints: `/api/v1/register`, `/api/v1/route`, `/api/v1/messages/pending`
   - Handles: Message routing, relay queue, push notifications
   - Optional: Agents can use external providers (CrabMail) instead

**Message Storage (Client-side):**
```
~/.agent-messaging/
├── config.json           # Agent configuration
├── keys/
│   ├── private.pem       # Ed25519 private key (never shared)
│   └── public.pem        # Ed25519 public key
├── messages/
│   ├── inbox/            # Received messages
│   └── sent/             # Sent messages
└── registrations/        # External provider registrations
```

### AMP CLI Commands

| Command | Description |
|---------|-------------|
| `amp-init.sh --auto` | Initialize agent identity |
| `amp-status.sh` | Show agent status and registrations |
| `amp-inbox.sh` | Check inbox for messages |
| `amp-read.sh <id>` | Read a specific message |
| `amp-send.sh <to> <subject> <message>` | Send a message |
| `amp-reply.sh <id> <message>` | Reply to a message |
| `amp-delete.sh <id>` | Delete a message |
| `amp-register.sh --provider <url>` | Register with external provider |
| `amp-fetch.sh` | Fetch messages from external providers |

### Address Formats

**Local addresses** (work immediately):
- `alice` → `alice@default.local`
- `bob@myteam.local` → Local delivery

**External addresses** (require registration):
- `alice@acme.crabmail.ai` → Via CrabMail provider
- `backend@company.otherprovider.com` → Via other provider

### Provider API (v0.20.0+)

AI Maestro can act as an AMP provider. Agents register with AI Maestro and it handles routing.

**Endpoints:**
- `GET /api/v1/health` - Provider health status (no auth)
- `GET /api/v1/info` - Provider capabilities (no auth)
- `POST /api/v1/register` - Register agent, get API key
- `POST /api/v1/route` - Route a signed message
- `GET /api/v1/messages/pending` - Poll for offline messages
- `DELETE /api/v1/messages/pending?id=X` - Acknowledge message

**Registration flow:**
```bash
# Agent registers with local AI Maestro
amp-register.sh --provider localhost:23000 --tenant myorg
# Returns API key, stores in ~/.agent-messaging/registrations/
```

### Push Notifications

When a message is routed to a local agent, AI Maestro sends a push notification via tmux:

```
[MESSAGE] From: alice - Subject line - check your inbox
```

**Configuration (environment variables):**
- `NOTIFICATIONS_ENABLED=false` - Disable push notifications
- `NOTIFICATION_FORMAT` - Customize notification format

### Message Storage

All messages are stored in AMP per-agent directories:
```
~/.agent-messaging/agents/<agentName>/messages/inbox/
~/.agent-messaging/agents/<agentName>/messages/sent/
```

Per-agent directories are auto-created when agents first use AMP commands.
The old `~/.aimaestro/messages/` system is no longer used.

### Claude Code Skill

The AMP skill (`plugin/plugins/ai-maestro/skills/agent-messaging/SKILL.md`) provides natural language:

```
"Check my messages" → amp-inbox.sh
"Send a message to backend-api about deployment" → amp-send.sh backend-api "Deployment" "..."
"Reply to the last message" → amp-reply.sh <id> "..."
```

### Development Notes

- **Submodule**: Plugin repo is at `plugin/` - update with `git submodule update --remote`
- **Protocol spec**: https://agentmessaging.org
- **Security**: Messages are signed with Ed25519; AI Maestro verifies signatures
- **Relay queue**: Offline agents get messages via polling (`/api/v1/messages/pending`)

## Critical Implementation Details

### Terminal Rendering Performance

xterm.js uses **Canvas or WebGL** for rendering. The WebGL addon significantly improves performance for high-output scenarios (e.g., large file dumps).

```typescript
// In useTerminal hook
try {
  const webglAddon = new WebglAddon()
  terminal.loadAddon(webglAddon)
} catch (e) {
  // Fallback to canvas if WebGL unavailable
}
```

**Never** read terminal content via React state. Always use xterm.js APIs (`terminal.write()`, `terminal.onData()`).

### Critical Terminal Configuration for PTY/tmux

**IMPORTANT:** The following terminal settings are critical for proper Claude Code CLI behavior:

1. **`convertEol: false`** - PTY and tmux handle line endings correctly. Setting this to `true` causes character duplication and incorrect line breaks because xterm.js will convert `\n` to `\r\n`, but the PTY has already handled this.

2. **Alternate Screen Buffer Support** - Claude Code (like vim, less, etc.) uses tmux's alternate screen buffer. This means:
   - When Claude is active, it uses a separate screen that doesn't mix with your shell history
   - Scrollback must be captured from tmux's buffer, not just xterm.js's buffer
   - The `windowOptions: { setWinLines: true }` setting enables proper alternate buffer support

3. **Scrollback Capture Strategy** - On initial connection, capture both normal and alternate screen content:
   ```bash
   # Try to capture full history (50000 lines)
   tmux capture-pane -t <session> -p -S -50000 -e -1
   # Fallback to visible content only
   tmux capture-pane -t <session> -p
   ```

**Common Issues and Fixes:**

- **Every character creates a new line**: `convertEol` was set to `true` - must be `false` for PTY connections
- **Can't scroll back during Claude session**: Claude Code uses alternate screen buffer - use Shift+PageUp/Down to scroll xterm.js buffer, or tmux copy mode (Ctrl-b [) to access tmux's scrollback
- **Lost history after switching agents**: History capture timeout was too short or tmux session not fully initialized - increased timeout to 150ms

### WebSocket Reconnection Strategy

```typescript
const reconnect = {
  maxAttempts: 5,
  backoff: [100, 500, 1000, 2000, 5000], // Exponential backoff
  strategy: 'exponential'
}
```

After 5 failed reconnection attempts, show error to user. Do NOT retry indefinitely (would waste resources if tmux session truly ended).

### Session Naming Constraints

tmux session names are limited to: `^[a-zA-Z0-9_-]+$`

**Enforce this** in any UI that creates sessions (Phase 2+). Invalid characters will cause `tmux attach` to fail silently.

### Network and security model

- The server binds `0.0.0.0` (`HOSTNAME` overrides it) and serves the local
  network and Tailscale. There is **no app-level authentication by design**:
  the trust boundary is the network.
- That does not excuse unsafe input handling: tmux and other external commands
  go through argv (`lib/tmux-safe.mjs`), never shell strings (see
  security advisories in the git history).

## Common Gotchas

### 1. Terminal Not Fitting Container

```typescript
// After terminal.open(container), ALWAYS call:
fitAddon.fit()

// And on window resize:
window.addEventListener('resize', () => fitAddon.fit())
```

Without this, terminal dimensions won't match the container, causing ugly scrollbars.

### 2. Hidden Terminals Must Use visibility:hidden, NOT display:none

**CRITICAL (v0.3.0+):** When hiding inactive terminal tabs, use `visibility: hidden` instead of `display: none`.

```tsx
// ✅ CORRECT - Keeps element in layout
style={{
  visibility: isActive ? 'visible' : 'hidden',
  pointerEvents: isActive ? 'auto' : 'none',
  zIndex: isActive ? 10 : 0
}}

// ❌ WRONG - Removes from layout
style={{
  display: isActive ? 'flex' : 'none'
}}
```

**Why this matters:**
- `display: none` removes element from layout → `getBoundingClientRect()` returns width/height = 0
- Terminal initializes with 0 dimensions → gets minimum columns (2) instead of full width
- Hidden elements don't receive mouse events → selection/copy doesn't work
- Using `visibility: hidden` + `pointerEvents: none` keeps correct dimensions while preventing interaction

### 3. WebSocket Lifecycle vs React Lifecycle

```typescript
useEffect(() => {
  const ws = new WebSocket(url)
  // ... setup handlers ...

  return () => {
    ws.close()  // CRITICAL: Clean up on unmount
  }
}, []) // Empty deps with tab architecture - WebSocket persists across visibility changes
```

**Tab-based architecture change (v0.3.0+):** WebSocket connections are no longer recreated on agent switch. They're created once on mount and persist until component unmounts (when agent is removed from the list).

### 4. tmux Session Name Parsing

`tmux list-sessions` output format:
```
session-name: 1 windows (created Tue Jan 10 14:23:45 2025)
```

Parsing must handle:
- Session names with hyphens/underscores
- Timestamps in various formats (locale-dependent)
- Multiple windows (number can be > 9)

Use robust regex: `/^([a-zA-Z0-9_-]+):/`

### 5. xterm.js Addon Loading Order

```typescript
terminal.loadAddon(fitAddon)       // 1. Load addons first
terminal.loadAddon(webLinksAddon)
terminal.open(container)           // 2. Then open
fitAddon.fit()                     // 3. Then fit
```

Wrong order causes crashes or non-functional addons.

## Environment Variables

All optional, with sensible defaults:

```bash
PORT=23000                           # Server port
NODE_ENV=development|production      # Next.js environment
WS_RECONNECT_DELAY=3000              # WebSocket reconnect delay (ms)
WS_MAX_RECONNECT_ATTEMPTS=5          # Max reconnection attempts
TERMINAL_FONT_SIZE=14                # xterm.js font size
TERMINAL_SCROLLBACK=10000            # Terminal scrollback buffer
```

Set via `.env.local` (gitignored). Never commit `.env.local`.

## Server Modes

AI Maestro supports two server modes controlled by the `MAESTRO_MODE` environment variable:

### Full Mode (default)
```bash
yarn dev        # Development with hot reload
yarn start      # Production
```
- Uses Next.js for both UI pages and API routes
- All features available: dashboard, terminal WebSockets, API endpoints
- Startup: ~5s, Memory: ~300MB

### Headless Mode
```bash
yarn headless        # Development
yarn headless:prod   # Production
```
- API-only mode — no Next.js, no UI pages
- All ~100 API endpoints served via standalone HTTP router (`services/headless-router.ts`)
- WebSocket connections (terminal, AMP, status, companion) work identically
- Uses `tsx` for TypeScript support (resolves `@/*` paths via tsconfig.json)
- Startup: ~1s, Memory: ~100MB
- Ideal for worker nodes that only need the API surface

**Architecture:**
- `server.mjs` branches on `MAESTRO_MODE` at startup
- Full mode: `node server.mjs` → Next.js `app.prepare()` → `handle(req, res)`
- Headless mode: `tsx server.mjs` → `createHeadlessRouter()` → `router.handle(req, res)`
- All WebSocket servers, PTY handling, startup tasks, and graceful shutdown are shared between modes
- The `/api/internal/pty-sessions` endpoint is served directly from `server.mjs` in both modes

## Testing the Application

**Manual testing workflow:**

1. Start the dashboard: `npm run dev`
2. Create test tmux sessions:
   ```bash
   tmux new-session -s test1 -d
   tmux send-keys -t test1 'claude' C-m
   tmux new-session -s test2 -d
   tmux send-keys -t test2 'claude' C-m
   ```
3. Verify auto-discovery: Sessions appear in sidebar
4. Click sessions: Terminal content loads
5. Type in terminal: Input reaches Claude
6. Kill session: `tmux kill-session -t test1`
7. Verify: Session removed after refresh

### Unit Tests (CI — runs in GitHub Actions)

Unit tests use vitest and run on every push/PR via `.github/workflows/ci.yml`:

```bash
yarn test          # Run all unit tests
yarn test:watch    # Watch mode
```

Tests cover: agent utilities, session service, agents-core service, AMP auth/address/canonical-json, task registry, team registry, document registry, container utils, meeting inject, content security. All service tests mock the runtime layer — no tmux/network required.

### Integration Test Suites (Manual — requires running AI Maestro)

These scripts test end-to-end behavior against a live AI Maestro instance with tmux:

```bash
# AMP local routing tests (single host)
# Tests: health, registration, internal→internal, external polling, federation, acknowledgment
./scripts/test-amp-routing.sh

# AMP cross-host mesh tests (multi-host via Tailscale)
# Tests: host health, agent registration on each host, cross-host delivery, replies, inbox counts
./scripts/test-amp-cross-host.sh              # Auto-detect hosts from ~/.aimaestro/hosts.json
./scripts/test-amp-cross-host.sh --local-only  # Only test local→remote
./scripts/test-amp-cross-host.sh --skip-inbox  # Skip inbox verification

# Companion call session fork tests
# Tests: __call session spawn, sidebar/agent hiding, transcript routing, disconnect cleanup, multi-client
./scripts/test-call-session.sh               # Auto-picks first online agent
./scripts/test-call-session.sh <agent-id>    # Specific agent
```

**Prerequisites:** AI Maestro running on localhost:23000, jq installed, tmux installed. AMP tests also require AMP scripts (`./install-plugin.sh -y`).

