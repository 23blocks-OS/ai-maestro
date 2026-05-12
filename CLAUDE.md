# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code Dashboard** - A browser-based terminal dashboard for managing multiple Claude Code agents running in tmux on macOS. The application auto-discovers agents from tmux sessions and provides a unified web interface with real-time terminal streaming.

**Current Phase:** Phase 1 - Local-only, auto-discovery, no authentication
**Tech Stack:** Next.js 14 (App Router), React 18, xterm.js, WebSocket, node-pty, Tailwind CSS, lucide-react
**Platform:** macOS 12.0+, Node.js 18.17+/20.x, tmux 3.0+
**Branding:** Space Grotesk font, titled "AI Maestro"
**Port:** Application runs on port 23000 (http://localhost:23000)

## Development Commands

```bash
# Development
yarn install             # Install all dependencies
yarn dev                 # Start dev server with hot reload (http://localhost:23000)

# Production
yarn build               # Build optimized production bundle
yarn start               # Start production server (http://localhost:23000)
pm2 restart ai-maestro   # Restart production server via PM2

# Testing
yarn test                # Run unit tests (vitest)
yarn test:watch          # Run tests in watch mode

# Testing tmux sessions (for development)
tmux new-session -s test-session     # Create test session
tmux list-sessions                   # List all sessions (what the app discovers)
tmux kill-session -t test-session    # Clean up test session
```

**Port Configuration:** The application is configured to run on port 23000. This is set in the PM2 configuration.

**Health Check:** Do NOT use `/api/health` to check if the site is live (it doesn't exist). Use `/api/sessions` instead - it returns the list of agents and confirms the server is running.

## Version Management

**IMPORTANT:** When bumping the version, ALWAYS use the centralized script:

```bash
./scripts/bump-version.sh patch    # 0.17.12 -> 0.17.13
./scripts/bump-version.sh minor    # 0.17.12 -> 0.18.0
./scripts/bump-version.sh major    # 0.17.12 -> 1.0.0
./scripts/bump-version.sh 1.0.0    # Set specific version
```

This script updates ALL version references across the codebase:
- `version.json` (source of truth)
- `package.json`
- `scripts/remote-install.sh`
- `README.md` (badge)
- `docs/index.html` (schema + display)
- `docs/ai-index.html`
- `docs/BACKLOG.md`

**DO NOT manually edit version numbers in individual files.** Always use the script to ensure consistency.

**CLI Script Versioning:** The `aimaestro-agent.sh` CLI tool uses an independent semver (`v1.x.x`) separate from the app version (`0.24.x`). The CLI is distributed via the plugin repo and has its own release cadence.

## Pre-PR Checklist (MANDATORY)

**⚠️ STOP! Before creating ANY Pull Request to main, complete this checklist:**

```
□ 1. TESTS PASS: yarn test
□ 2. BUMP VERSION: ./scripts/bump-version.sh patch
□ 3. BUILD PASSES: yarn build
□ 4. COMMIT version bump with your changes
```

**This is NON-NEGOTIABLE.** Every PR to main MUST include a version bump. No exceptions.

---

## Release & Marketing Workflow

### Pull Request Protocol

**IMPORTANT:** Every time you create a Pull Request to main, also draft an X (Twitter) post to announce the release.

**PR Creation Checklist:**
1. ✅ **VERSION BUMPED** (see Pre-PR Checklist above - this should already be done)
2. Create PR with comprehensive description (summary, features, bug fixes, breaking changes)
3. Draft X post highlighting key features and improvements
4. Include release notes or link to PR in the post
5. Use relevant hashtags: #AIcoding #DevTools #OpenSource
6. Consider adding screenshots/GIFs for visual features
7. Post during peak hours (9-11am or 1-3pm EST)

**X Post Template:**
```
[Emoji] Shipping [Feature Name] today!

Key improvements:
• [Feature 1]
• [Feature 2]
• [Feature 3]

[Call to action - Star/Try/Share]
[Link to PR or GitHub]

#AIcoding #DevTools
```

**Examples:**
- Major release: "Shipping AI Maestro v0.3.3! 🚀"
- Feature addition: "New feature: SSH configuration for tmux 🔐"
- Bug fixes: "Squashed bugs and improved stability 🐛"

Keep posts concise (<280 chars when possible), engaging, and focused on user benefits rather than technical implementation.

### Marketing Content Location

**IMPORTANT:** All marketing content files MUST be created in the `marketing/` folder:

```
marketing/
  medium-article.md      # Blog posts for Medium
  linkedin-post.md       # LinkedIn content
  x-post.md              # X/Twitter posts
  findings.md            # Research notes (planning skill)
  task_plan.md           # Task tracking (planning skill)
  progress.md            # Progress logs (planning skill)
```

- The `marketing/` folder is gitignored - content is deleted after publishing
- Never create these files in the project root
- When using the planning skill for marketing tasks, set the output directory to `marketing/`

## Architecture: Critical Design Patterns

### 1. Custom Server Architecture (server.mjs)

**Why it exists:** Next.js alone doesn't support WebSocket on the same port as HTTP. The custom server combines both.

```
HTTP Requests → Next.js handlers (API routes, pages)
WebSocket Upgrades → Custom WS server (terminal streaming)
Both on port 3000
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
- `checkMessages()` - **DISABLED by default** (push notifications replace polling)

Message polling was removed in favor of push notifications. When messages arrive, agents receive instant tmux notifications instead of waiting for the next poll cycle. To re-enable polling (not recommended), set `messagePollingEnabled: true` in the subconscious config.

### 3. Session Discovery Pattern

Sessions are discovered from tmux and LINKED to agents:

```
/api/sessions → Execute `tmux ls` → Parse output → Link to registry agents → Return JSON
```

**Implementation details:**
- Agents are ephemeral - they exist only while tmux is running
- No persistent state between dashboard restarts
- Agent metadata comes from tmux directly (creation time, working directory)
- The dashboard does NOT create or manage agents (Phase 1 limitation)

When implementing agent-related features:
- Always assume agents can disappear between API calls
- Never cache agent data longer than 5-10 seconds
- Handle `tmux ls` returning empty results gracefully
- Session IDs must match tmux session names exactly (alphanumeric + hyphens/underscores only)

### 3. WebSocket-PTY Bridge

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
- WebSocket is the only communication channel (no polling)
- PTY errors (session not found, tmux crashed) must close WebSocket gracefully
- Terminal dimensions (cols/rows) must sync on window resize

### 4. Tab-Based Multi-Terminal Architecture

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

### 5. React State Management Pattern

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
- `useSessions()` - Fetches session list, auto-refreshes
- `useTerminal()` - Manages xterm.js lifecycle (init once, resize, dispose)
- `useWebSocket()` - Handles WebSocket connection, reconnection, message routing
- `useActiveSession()` - Tracks selected agent with localStorage

When adding new state:
- Keep it in the nearest component that needs it
- Use Context only if 3+ components need the same state
- Never store terminal content in React state (xterm.js manages this)
- Consider if state needs to persist across agent switches (keep in component) vs. reload (use effect with session.id dependency)

### 6. UI Enhancement Patterns

**Hierarchical Agent Organization:**

Agents are organized in a 3-level hierarchy based on their names:
```
fluidmind/agents/backend-architect  →  Level 1: "fluidmind"
                                        Level 2: "agents"
                                        Agent: "backend-architect"
```

**Dynamic Color System:**
- Colors assigned via hash function (same category = same color)
- 8-color palette in `SessionList.tsx` (easily customizable)
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

### 7. Team Meeting Architecture (v0.20.19+)

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

### 8. TypeScript Type System Organization

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

## File Structure Conventions

**DO NOT create these directories** (they don't exist yet in Phase 1):
- `tests/` - No test suite in Phase 1
- `server/` - Server logic lives in root `server.mjs`
- `public/` - No static assets currently needed
- `styles/` - Styles in `app/globals.css` + Tailwind only

**Current structure:**
```
app/
  page.tsx              - Main dashboard with footer (SessionList + TerminalView)
  layout.tsx            - Root layout, Space Grotesk font, app title "AI Maestro"
  globals.css           - Tailwind imports + terminal scrollbar styles
  api/sessions/route.ts - GET endpoint for tmux session discovery

components/
  SessionList.tsx       - Hierarchical sidebar with icons, colors, session management
  TerminalView.tsx      - Terminal display with collapsible notes area
  [Other components]    - Keep them small, single responsibility
  team-meeting/
    MeetingHeader.tsx         - Meeting header with status, controls, kanban toggle
    MeetingSidebar.tsx        - Agent list sidebar during meetings
    MeetingTerminalArea.tsx   - Terminal grid for active meeting agents
    MeetingRightPanel.tsx     - Right panel wrapper (tasks + chat tabs)
    MeetingChatPanel.tsx      - Meeting chat using AMP messages
    TaskPanel.tsx             - Task list panel with filtering and quick-add
    TaskCard.tsx              - Task card with status, assignee, dependencies
    TaskCreateForm.tsx        - Full task creation form with all fields
    TaskDetailView.tsx        - Detailed task view with edit capabilities
    TaskKanbanBoard.tsx       - Full-screen kanban overlay with 5 columns + drag-and-drop
    KanbanColumn.tsx          - Single kanban column with drop zone
    KanbanCard.tsx            - Compact draggable task card for kanban
    DependencyPicker.tsx      - Dependency selection for task relationships

hooks/
  useWebSocket.ts       - WebSocket connection (reconnection, heartbeat)
  useTerminal.ts        - xterm.js lifecycle (init, fit, dispose)
  useSessions.ts        - Session list fetching + auto-refresh
  useTasks.ts           - Task CRUD with tasksByStatus, optimistic updates, 5s polling
  useMeetingMessages.ts - Meeting chat messages via AMP with 7s polling

lib/
  api.ts                - Fetch wrappers for /api/sessions
  websocket.ts          - WebSocket message creators
  terminal.ts           - Terminal utility functions
  utils.ts              - Shared utilities (date formatting, etc.)

types/
  session.ts            - Session metadata, status enums, hierarchical structure
  terminal.ts           - xterm.js configuration, dimensions
  websocket.ts          - Message protocol, connection states

docs/
  images/               - Screenshots for README documentation
  REQUIREMENTS.md       - Installation prerequisites
  OPERATIONS-GUIDE.md   - Session management, troubleshooting

plugin/                 - Plugin submodule (git submodule from 23blocks-OS/ai-maestro-plugins)
  .claude-plugin/       - Marketplace manifest
  plugins/ai-maestro/   - The AI Maestro plugin
    scripts/            - All CLI scripts (AMP, graph, docs, memory, agent management)
    skills/             - All 6 Claude Code skills
    hooks/              - Session tracking hooks
    .claude-plugin/     - Plugin manifest

scripts/
  generate-social-logos.js        - Generate social media logos from SVG
  init-all-agents.mjs             - Initialize memory for all agents
  register-agent-from-session.mjs - Register agent(s) from tmux session(s)
  setup-tmux.sh                   - Setup tmux configuration

install-plugin.sh    - Plugin installer (skills, scripts, CLI tools)

server.mjs              - Custom Next.js server (HTTP + WebSocket)
CLAUDE.md               - This file - guidance for Claude Code
```

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

3. **NO capture-pane history on connect (v0.29.16+)** - The server does NOT send `tmux capture-pane` scrollback when a client connects. The PTY `tmux attach` already redraws the visible pane with correct ANSI content. Sending capture-pane on top caused **double-rendering** (same content at mismatched widths, overlapping text). The server sends only a `history-complete` signal after a 200ms delay to let the PTY stream the initial redraw, then the client does refit + resize + scroll-to-bottom. Scrollback is still available via tmux copy mode (Ctrl-b [) or xterm.js buffer (Shift+PageUp/Down).

4. **tmux mouse mode must be OFF per-session (v0.29.18+)** - When the user's `~/.tmux.conf` has `set -g mouse on`, tmux captures all mouse events (clicks, drags, scroll) and shows its own **yellow copy-mode selection** instead of letting xterm.js handle browser-native text selection (gray highlight, clipboard copy). The server disables mouse mode per-session via `tmux set-option -t <session> mouse off` immediately after PTY creation. **DO NOT remove this** or text selection will break. This is a recurring issue that has been fixed multiple times.

**Common Issues and Fixes:**

- **Every character creates a new line**: `convertEol` was set to `true` - must be `false` for PTY connections
- **Can't scroll back during Claude session**: Claude Code uses alternate screen buffer - use Shift+PageUp/Down to scroll xterm.js buffer, or tmux copy mode (Ctrl-b [) to access tmux's scrollback
- **Yellow text selection instead of gray (can't copy)**: tmux `mouse on` is intercepting mouse events - the server must run `tmux set-option -t <session> mouse off` after PTY creation (see point 4 above)
- **Double/overlapping text on connect**: capture-pane history was being sent on top of PTY attach redraw - removed in v0.29.16 (see point 3 above)
- **Blank terminal on agent switch**: `history-complete` was firing before PTY streamed initial redraw - added 200ms delay in v0.29.17

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

### Localhost-Only Security Model

**Phase 1 security assumptions:**
- Application binds to `localhost` (127.0.0.1) ONLY
- No authentication required (OS-level user security)
- No CORS, no origin validation
- WebSocket connections accepted from any localhost origin

**DO NOT implement:**
- User authentication (not needed for localhost)
- Agent-level permissions (all agents accessible to local user)
- HTTPS/TLS (overkill for localhost)

These are deferred to Phase 2+ if remote access is needed.

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
PORT=3000                            # Server port
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

### AMP Messaging Test Suites

Two test scripts exist for validating the Agent Messaging Protocol:

```bash
# Local routing tests (single host)
# Tests: health, registration, internal→internal, external polling, federation, acknowledgment
./scripts/test-amp-routing.sh

# Cross-host mesh tests (multi-host via Tailscale)
# Tests: host health, agent registration on each host, cross-host delivery, replies, inbox counts
./scripts/test-amp-cross-host.sh              # Auto-detect hosts from ~/.aimaestro/hosts.json
./scripts/test-amp-cross-host.sh --local-only  # Only test local→remote
./scripts/test-amp-cross-host.sh --skip-inbox  # Skip inbox verification
```

**Prerequisites:** AI Maestro running on localhost:23000, jq installed, AMP scripts installed (`./install-plugin.sh -y`).

**No other automated tests yet.** Phase 1 focuses on getting the core working.

## Documentation References

- **[README.md](./README.md)** - Project overview, quick start, architecture
- **[docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md)** - Installation prerequisites
- **[docs/OPERATIONS-GUIDE.md](./docs/OPERATIONS-GUIDE.md)** - Agent management, troubleshooting
- **[docs/CEREBELLUM.md](./docs/CEREBELLUM.md)** - Cerebellum subsystem architecture, voice pipeline, TTS providers

Refer to these when users ask about setup or usage.

## Roadmap Context

**Phase 1 (Current):** Auto-discovery, localhost-only, read-only agent interaction
**Phase 2 (Planned):** Agent creation from UI, grouping, search
**Phase 3 (Future):** Remote SSH sessions, authentication, collaboration

When implementing features:
- Check if they belong in current phase
- Don't over-engineer for future phases
- Document phase boundaries clearly

## What NOT to Do

- **Don't query tmux to get agent properties** - workingDirectory, etc. are STORED on the agent in the registry, not derived from tmux. See "Agent-First Architecture" section.
- **Don't assume agents need sessions** - Agents are the core entity; sessions are optional. An agent can exist for querying repos/docs without a tmux session.
- **Don't use sessions.json** - Sessions are auto-discovered from tmux
- **Don't implement authentication** - Phase 1 is localhost-only
- **Don't store terminal history** - xterm.js manages scrollback in-memory
- **Don't use polling** - WebSocket only for terminal I/O
- **Don't support remote SSH** - Phase 3 feature, not Phase 1
- **Don't nest interactive elements** - Causes React hydration errors (use div with onClick instead)
- **Don't hardcode category colors** - Use the hash-based dynamic color system
- **Don't use display:none for hidden terminals** - Use visibility:hidden to maintain correct dimensions and enable selection (v0.3.0+)
- **Don't add session.id to terminal initialization useEffect** - Terminals initialize once with empty dependency array in tab architecture (v0.3.0+)
- **Don't send capture-pane history on WebSocket connect** - PTY `tmux attach` already redraws the pane. Sending capture-pane on top causes double-rendering at mismatched widths (v0.29.16+)
- **Don't remove the `tmux set-option mouse off` in server.mjs** - Without it, tmux captures mouse events and shows yellow copy-mode selection instead of browser-native text selection. This has broken multiple times (v0.29.18+)

## Key Files to Understand

**Must read to understand the system:**

1. `lib/agent-registry.ts` - **File-based agent registry** (stores agents in `~/.aimaestro/agents/registry.json`) - THE source of truth for agent metadata including workingDirectory
2. `lib/agent.ts` - **In-memory Agent class** for runtime operations (database, subconscious)
3. `server.mjs` - Custom server combining HTTP and WebSocket
4. `app/page.tsx` - Main UI composition with footer (SessionList + TerminalView)
5. `components/SessionList.tsx` - Hierarchical sidebar with dynamic colors, icons, agent management
6. `components/TerminalView.tsx` - Terminal display with collapsible notes feature
7. `hooks/useWebSocket.ts` - WebSocket connection management
8. `hooks/useTerminal.ts` - xterm.js lifecycle management
9. `app/api/sessions/route.ts` - tmux session discovery logic

**Team Meeting & Kanban (v0.20.19+):**
10. `app/team-meeting/page.tsx` - Team meeting page with reducer state machine
11. `components/team-meeting/TaskKanbanBoard.tsx` - Full-screen kanban overlay with 5 columns + drag-and-drop
12. `components/team-meeting/KanbanColumn.tsx` - Single kanban column with drop zone
13. `components/team-meeting/KanbanCard.tsx` - Compact draggable task card
14. `types/task.ts` - Task types with 5 statuses: backlog, pending, in_progress, review, completed
15. `lib/task-registry.ts` - File-based CRUD for team task persistence
16. `hooks/useTasks.ts` - Task hook with tasksByStatus, optimistic updates, polling

**Read these in order** to understand agents and data flow.

**Key UI patterns:**
- Tab-based multi-terminal architecture (v0.3.0+) - all agents mounted, visibility toggling
- Dynamic color assignment (hash-based, no hardcoding)
- Hierarchical grouping (3-level: category/subcategory/agent)
- Agent notes (per-agent localStorage)
- Avoid nested buttons (use div with cursor-pointer)
- Use visibility:hidden for inactive tabs (not display:none)
