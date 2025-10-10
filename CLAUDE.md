# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code Dashboard** - A browser-based terminal dashboard for managing multiple Claude Code sessions running in tmux on macOS. The application auto-discovers tmux sessions and provides a unified web interface with real-time terminal streaming.

**Current Phase:** Phase 1 - Local-only, auto-discovery, no authentication
**Tech Stack:** Next.js 14 (App Router), React 18, xterm.js, WebSocket, node-pty, Tailwind CSS, lucide-react
**Platform:** macOS 12.0+, Node.js 18.17+/20.x, tmux 3.0+
**Branding:** Space Grotesk font, titled "AI Maestro"

## Development Commands

```bash
# Development
yarn install             # Install all dependencies
yarn dev                 # Start dev server with hot reload (http://localhost:3000)

# Production
yarn build               # Build optimized production bundle
yarn start               # Start production server

# Testing tmux sessions (for development)
tmux new-session -s test-session     # Create test session
tmux list-sessions                   # List all sessions (what the app discovers)
tmux kill-session -t test-session    # Clean up test session
```

**Port Configuration:** Use `PORT=3001 yarn dev` if port 3000 is occupied.

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

### 2. Session Auto-Discovery Pattern

**Unlike typical session management systems**, this application does NOT use a configuration file or database. Sessions are discovered in real-time:

```
/api/sessions → Execute `tmux ls` → Parse output → Return JSON
```

**Implementation details:**
- Sessions are ephemeral - they exist only while tmux is running
- No persistent state between dashboard restarts
- Session metadata comes from tmux directly (creation time, working directory)
- The dashboard does NOT create or manage sessions (Phase 1 limitation)

When implementing session-related features:
- Always assume sessions can disappear between API calls
- Never cache session data longer than 5-10 seconds
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

### 4. React State Management Pattern

**Deliberately minimal:** No Redux, Zustand, or complex state libraries.

```
App State:
- Active session ID (localStorage persistence)
- Session list (fetched from /api/sessions every 10s)
- WebSocket connection state (per session)

Component State:
- Terminal instance (xterm.js, created per session)
- Connection errors (transient, cleared on retry)
```

**Key hooks:**
- `useSessions()` - Fetches session list, auto-refreshes
- `useTerminal()` - Manages xterm.js lifecycle (init, resize, dispose)
- `useWebSocket()` - Handles WebSocket connection, reconnection, message routing
- `useActiveSession()` - Tracks selected session with localStorage

When adding new state:
- Keep it in the nearest component that needs it
- Use Context only if 3+ components need the same state
- Never store terminal content in React state (xterm.js manages this)

### 5. UI Enhancement Patterns

**Hierarchical Session Organization:**

Sessions are organized in a 3-level hierarchy based on their names:
```
fluidmind/agents/backend-architect  →  Level 1: "fluidmind"
                                        Level 2: "agents"
                                        Session: "backend-architect"
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

**Session Notes Feature:**
- Collapsible textarea below terminal for per-session notes
- Auto-saves to localStorage (`session-notes-${sessionId}`)
- Collapse state persisted (`session-notes-collapsed-${sessionId}`)
- Full copy/paste/edit support

**Session Management:**
- Rename sessions with validation (API call to backend)
- Delete sessions with confirmation modal
- Create new sessions with optional working directory
- All actions update UI optimistically with error handling

**UI Best Practices:**
- Avoid nested buttons (causes React hydration errors)
- Use `<div>` with `cursor-pointer` for clickable containers
- Always use `e.stopPropagation()` for nested interactive elements
- Keep hover states smooth with `transition-all duration-200`

### 6. TypeScript Type System Organization

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

server.mjs              - Custom Next.js server (HTTP + WebSocket)
CLAUDE.md               - This file - guidance for Claude Code
```

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
- Session-level permissions (all sessions accessible to local user)
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

### 2. WebSocket Lifecycle vs React Lifecycle

```typescript
useEffect(() => {
  const ws = new WebSocket(url)
  // ... setup handlers ...

  return () => {
    ws.close()  // CRITICAL: Clean up on unmount
  }
}, [sessionId])  // Recreate WebSocket when session changes
```

Forgetting to close the WebSocket causes connection leaks. Each session switch creates a new WebSocket.

### 3. tmux Session Name Parsing

`tmux list-sessions` output format:
```
session-name: 1 windows (created Tue Jan 10 14:23:45 2025)
```

Parsing must handle:
- Session names with hyphens/underscores
- Timestamps in various formats (locale-dependent)
- Multiple windows (number can be > 9)

Use robust regex: `/^([a-zA-Z0-9_-]+):/`

### 4. xterm.js Addon Loading Order

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
- **[docs/OPERATIONS-GUIDE.md](./docs/OPERATIONS-GUIDE.md)** - Session management, troubleshooting

Refer to these when users ask about setup or usage.

## Roadmap Context

**Phase 1 (Current):** Auto-discovery, localhost-only, read-only session interaction
**Phase 2 (Planned):** Session creation from UI, grouping, search
**Phase 3 (Future):** Remote SSH sessions, authentication, collaboration

When implementing features:
- Check if they belong in current phase
- Don't over-engineer for future phases
- Document phase boundaries clearly

## What NOT to Do

- **Don't use sessions.json** - Sessions are auto-discovered from tmux
- **Don't implement authentication** - Phase 1 is localhost-only
- **Don't store terminal history** - xterm.js manages scrollback in-memory
- **Don't use polling** - WebSocket only for terminal I/O
- **Don't support remote SSH** - Phase 3 feature, not Phase 1
- **Don't nest interactive elements** - Causes React hydration errors (use div with onClick instead)
- **Don't hardcode category colors** - Use the hash-based dynamic color system

## Key Files to Understand

**Must read to understand the system:**

1. `server.mjs` - Custom server combining HTTP and WebSocket
2. `app/page.tsx` - Main UI composition with footer (SessionList + TerminalView)
3. `components/SessionList.tsx` - Hierarchical sidebar with dynamic colors, icons, session management
4. `components/TerminalView.tsx` - Terminal display with collapsible notes feature
5. `hooks/useWebSocket.ts` - WebSocket connection management
6. `hooks/useTerminal.ts` - xterm.js lifecycle management
7. `app/api/sessions/route.ts` - tmux session discovery logic

**Read these in order** to understand the full data flow from tmux → browser.

**Key UI patterns:**
- Dynamic color assignment (hash-based, no hardcoding)
- Hierarchical grouping (3-level: category/subcategory/session)
- Session notes (per-session localStorage)
- Avoid nested buttons (use div with cursor-pointer)
