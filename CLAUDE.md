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

## Pre-PR Checklist (MANDATORY)

**⚠️ STOP! Before creating ANY Pull Request to main, complete this checklist:**

```
□ 1. BUMP VERSION: ./scripts/bump-version.sh patch
□ 2. BUILD PASSES: yarn build
□ 3. COMMIT version bump with your changes
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

### 7. TypeScript Type System Organization

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

hooks/
  useWebSocket.ts       - WebSocket connection (reconnection, heartbeat)
  useTerminal.ts        - xterm.js lifecycle (init, fit, dispose)
  useSessions.ts        - Session list fetching + auto-refresh

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

messaging_scripts/      - CLI scripts for agent messaging system
  check-aimaestro-messages.sh     - Check unread messages (recommended)
  read-aimaestro-message.sh       - Read message and mark as read
  check-and-show-messages.sh      - Auto-display on tmux attach (legacy)
  send-aimaestro-message.sh       - Send message to another session
  reply-aimaestro-message.sh      - Reply to a message
  list-aimaestro-sent.sh          - List sent messages
  delete-aimaestro-message.sh     - Delete a message

skills/
  agent-messaging/
    SKILL.md            - Claude Code skill for natural language messaging interface

scripts/
  generate-social-logos.js        - Generate social media logos from SVG
  init-all-agents.mjs             - Initialize memory for all agents
  register-agent-from-session.mjs - Register agent(s) from tmux session(s)
  setup-tmux.sh                   - Setup tmux configuration

install-messaging.sh    - Installer for messaging system to user's environment

server.mjs              - Custom Next.js server (HTTP + WebSocket)
CLAUDE.md               - This file - guidance for Claude Code
```

## AI Maestro Messaging System

**Overview:** AI Maestro includes an inter-agent messaging system that allows Claude Code sessions to send and receive messages asynchronously. Messages are stored as JSON files and accessed via HTTP API and CLI scripts.

### Installation

Users install the messaging system with:
```bash
./install-messaging.sh
```

**Non-interactive installation** (for CI/CD, WSL, scripts):
```bash
./install-messaging.sh -y
```

The `-y` flag auto-selects option 3 (install scripts + skills) without prompts.

This installer copies:
- CLI scripts from `messaging_scripts/` → `~/.local/bin/`
- Skill file from `plugin/skills/agent-messaging/SKILL.md` → `~/.claude/skills/agent-messaging/SKILL.md`
- Creates message directories: `~/.aimaestro/messages/inbox/` and `~/.aimaestro/messages/sent/`

### Architecture

**Message Storage:**
- File-based: Messages stored as JSON in `~/.aimaestro/messages/inbox/<session>/` and `~/.aimaestro/messages/sent/<session>/`
- Each message is a separate `.json` file with unique ID
- Messages have status: `unread`, `read`, or `archived`

**API Endpoints:**
- `GET /api/messages?agent=X&box=inbox&status=unread` - List messages with filtering
- `GET /api/messages?agent=X&id=Y&box=inbox` - Get specific message
- `PATCH /api/messages?agent=X&id=Y&action=read` - Mark message as read
- `POST /api/messages` - Send new message

**Message Format:**
```typescript
{
  id: string              // msg-<timestamp>-<random>
  from: string            // sender session name
  to: string              // recipient session name
  subject: string
  timestamp: string       // ISO 8601
  priority: 'urgent' | 'high' | 'normal' | 'low'
  status: 'unread' | 'read' | 'archived'
  content: {
    type: string          // 'request', 'response', 'notification', etc.
    message: string       // main message body
    context?: any         // optional structured context
  }
  inReplyTo?: string      // message ID if this is a reply
}
```

### CLI Scripts (messaging_scripts/)

**Recommended Workflow:**
1. `check-aimaestro-messages.sh` - List unread messages
2. `read-aimaestro-message.sh <msg-id>` - Read specific message (auto-marks as read)

**All Scripts:**
- `check-aimaestro-messages.sh [--mark-read]` - Check unread messages, optionally mark all as read
- `read-aimaestro-message.sh <msg-id> [--no-mark-read]` - Read message and mark as read (unless --no-mark-read)
- `send-aimaestro-message.sh <to-session> <subject> <message> [--priority urgent|high|normal|low]` - Send message
- `reply-aimaestro-message.sh <msg-id> <message>` - Reply to a message
- `list-aimaestro-sent.sh` - List sent messages
- `delete-aimaestro-message.sh <msg-id>` - Delete a message
- `check-and-show-messages.sh` - Auto-display on tmux attach (DO NOT USE MANUALLY)

**Key Implementation Details:**

1. **Unread-Only Filtering** - Scripts use API filtering (`status=unread`) instead of listing all files
2. **Auto-Mark-as-Read** - `read-aimaestro-message.sh` automatically marks messages as read after displaying
3. **Error Handling** - All scripts validate JSON responses and provide troubleshooting hints
4. **Session Detection** - Scripts auto-detect current tmux session with `tmux display-message -p '#S'`

**Example Usage:**
```bash
# Check for unread messages
check-aimaestro-messages.sh
# Output:
# 📬 You have 2 unread message(s)
# [msg-1234...] 🔴 From: backend-api | 2025-10-29 14:30
#     Subject: Authentication endpoint ready

# Read specific message (auto-marks as read)
read-aimaestro-message.sh msg-1234...
# Displays full message content
# ✅ Message marked as read

# Check again - message is now gone
check-aimaestro-messages.sh
# Output: 📭 No unread messages
```

### Claude Code Skill Integration

The `plugin/skills/agent-messaging/SKILL.md` file provides a natural language interface for agents. When an agent says "check my messages" or "send a message to backend-api", Claude Code automatically translates this into the appropriate CLI script calls.

**Skill provides:**
- Natural language commands → CLI script mapping
- Message formatting guidelines
- Workflow examples and best practices
- Priority and context usage patterns

**After installation**, agents can use messaging naturally:
```
Agent: "Check my inbox for any urgent messages"
→ Executes: check-aimaestro-messages.sh
→ Filters for urgent priority messages
```

### Push Notifications (v0.18.10+)

Messages are delivered with **instant push notifications** via tmux. When a message is sent:

1. Message is stored in recipient's inbox (file-based)
2. Notification service looks up the recipient agent
3. If agent has an active tmux session, notification is sent via `tmux send-keys`
4. Agent sees the notification immediately in their terminal

**Key files:**
- `lib/notification-service.ts` - Push notification implementation
- `app/api/messages/route.ts` - Calls `notifyAgent()` after storing message

**Configuration (via environment variables):**
- `NOTIFICATIONS_ENABLED=false` - Disable push notifications entirely (default: enabled)
- `NOTIFICATION_FORMAT` - Customize notification message template (default: `[MESSAGE] From: {from} - {subject} - check your inbox`)
- `NOTIFICATION_SKIP_TYPES` - Comma-separated list of message types to skip (default: `system,heartbeat`)

**Note:** Push notifications replaced polling-based message checking in the subconscious. Agents no longer need to poll for messages - they receive instant notifications.

### Development Notes

- Messages are ephemeral - not backed up or persisted beyond the JSON files
- No authentication - relies on tmux session isolation and OS-level user security
- Session names must match tmux session names exactly (alphanumeric + hyphens/underscores)
- API is localhost-only (binds to 127.0.0.1)
- Message IDs are globally unique but should be verified before marking as read

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

**No automated tests yet.** Phase 1 focuses on getting the core working.

## Documentation References

- **[README.md](./README.md)** - Project overview, quick start, architecture
- **[docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md)** - Installation prerequisites
- **[docs/OPERATIONS-GUIDE.md](./docs/OPERATIONS-GUIDE.md)** - Agent management, troubleshooting

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

**Read these in order** to understand agents and data flow.

**Key UI patterns:**
- Tab-based multi-terminal architecture (v0.3.0+) - all agents mounted, visibility toggling
- Dynamic color assignment (hash-based, no hardcoding)
- Hierarchical grouping (3-level: category/subcategory/agent)
- Agent notes (per-agent localStorage)
- Avoid nested buttons (use div with cursor-pointer)
- Use visibility:hidden for inactive tabs (not display:none)
