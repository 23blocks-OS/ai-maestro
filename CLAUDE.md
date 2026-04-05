# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Claude Code Dashboard** - A browser-based terminal dashboard for managing multiple Claude Code agents running in tmux on macOS. The application auto-discovers agents from tmux sessions and provides a unified web interface with real-time terminal streaming.

**Current Phase:** Phase 1 - Local-only, auto-discovery, no authentication
**Tech Stack:** Next.js 14 (App Router), React 18, xterm.js, WebSocket, node-pty, Tailwind CSS, lucide-react
**Platform:** macOS 12.0+, Node.js 20+, tmux 3.0+
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

**Settings Page (`/settings`):**
- Sidebar labels: Hosts, Domains, Webhooks, Skills Explorer, Plugins Explorer, Experiments, Onboarding, Help, About
- "Skills Explorer" (`marketplace` tab) — marketplace skill browser for agent installation
- "Plugins Explorer" (`global-elements` tab) — plugin toggles, element listing, marketplace management

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

### 9. Session Control Architecture (v0.27.1+)

**5-state agent status model** based on hook notifications and tmux pane detection:

| State | Color | Pulse | Source | Meaning |
|-------|-------|-------|--------|---------|
| Exited | gray-400 | no | `programRunning === false` | Claude process ended, shell prompt visible |
| Permission | orange-500 | yes | `notificationType === 'permission_prompt'` | Claude is blocked waiting for tool approval |
| Waiting | amber-500 | yes | `notificationType === 'idle_prompt'` | Claude finished, waiting for user input (safe state) |
| Active | green-500 | yes | `activityStatus === 'active'` | Claude is processing/generating |
| Idle | green-500 | no | Default when online | Between turns, no recent activity |

**Safe-state gate:** All control operations (Stop, Restart, Approve) require `idle_prompt` state. This is the only state where Claude has no subagents running, no permission prompts pending, and is genuinely waiting for input.

**Session control buttons (AgentProfile.tsx):**
- **Stop** (red): sends 3-command sequence: `C-c` (clear partial input) → `-l '/exit'` (literal text) → `Enter`. Enabled only at `idle_prompt`.
- **Restart** (orange): calls `POST /api/sessions/{name}/restart` — sends same 3-command stop sequence, polls `tmux display-message` until shell detected (max 15s), waits 1s, relaunches with same program args + `--name` persona injection.
- **Approve** (green): sends `y` to terminal. Visible only during `permission_prompt`.

**Auto-restart queue (`useRestartQueue` hook):** After plugin/skill changes, agents are queued for restart. The queue polls agent activity every 1s (polling chosen over reactive deps to avoid effect churn from `getSessionActivity` identity changes — SF-044). When a queued agent reaches `idle_prompt`, it fires the restart API automatically.

**API endpoints:**
- `POST /api/sessions/{name}/stop` — sends `C-c` + `/exit` + `Enter` to tmux session
- `POST /api/sessions/{name}/restart` — full restart cycle (exit → poll → wait → relaunch)

**Data flow:** Hook (`ai-maestro-hook.cjs`) → state file (`~/.aimaestro/chat-state/`) → WebSocket broadcast → `useSessionActivity` → `AgentBadge`/`AgentProfile`

### 10. Manager-Gated Team Governance (v0.27.3+)

**MANAGER is required for teams to function.** Without a MANAGER on the host, all teams are blocked and team agents are hibernated.

**Blocking cascade (triggered when MANAGER removed or missing at startup):**
1. All teams get `blocked: true` in teams.json
2. All agents belonging to those teams have their tmux sessions killed (hibernated)
3. AUTONOMOUS agents are unaffected
4. Team creation, agent add/remove on teams are rejected with HTTP 400

**Unblocking (triggered when MANAGER assigned):**
1. All teams get `blocked: false`
2. Agents remain hibernated — user or MANAGER must wake them manually

**Agent lifecycle governance (wake/hibernate/restart):**

| Caller | Scope | Enforced at |
|--------|-------|-------------|
| User (web UI) | Any agent | Always allowed |
| MANAGER | Any agent | `auth.agentId === managerId` |
| CHIEF-OF-STAFF | Own team agents only | `team.chiefOfStaffId === auth.agentId && team.agentIds.includes(targetId)` |
| Any other agent | Denied | HTTP 403 |

Team agents cannot be woken when no MANAGER exists (even by the user — assign MANAGER first).

**Key files:**
- `lib/team-registry.ts` — `blockAllTeams()`, `unblockAllTeams()`, `isAgentInAnyTeam()`
- `services/element-management-service.ts` — ChangeTitle Gate 10 (block on manager removal), Gate 13 (unblock on manager assignment)
- `server.mjs` — Startup manager check
- `app/api/agents/[id]/wake/route.ts` — Auth + manager gate
- `app/api/agents/[id]/hibernate/route.ts` — Auth + manager gate
- `docs_dev/governance-design-rules.md` — Full governance rules (R9, R10, R11)

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
  useGovernance.ts      - Governance state (agentTitle, team membership, permissions)
  useTasks.ts           - Task CRUD with tasksByStatus, optimistic updates, 5s polling
  useMeetingMessages.ts - Meeting chat messages via AMP with 7s polling
  useSessionActivity.ts - Agent activity status via WebSocket (5-state model)
  useRestartQueue.ts    - Auto-restart queue triggered by element changes

lib/
  api.ts                - Fetch wrappers for /api/sessions
  websocket.ts          - WebSocket message creators
  terminal.ts           - Terminal utility functions
  utils.ts              - Shared utilities (date formatting, etc.)
  group-registry.ts     - File-based CRUD for groups (~/.aimaestro/teams/groups.json)
  ecosystem-constants.ts - Single source of truth for marketplace repos, plugin names, ecosystem IDs (TS)

types/
  session.ts            - Session metadata, status enums, hierarchical structure
  terminal.ts           - xterm.js configuration, dimensions
  websocket.ts          - Message protocol, connection states
  group.ts              - Group types (Group, GroupsFile)
  governance.ts         - GovernanceTitle, GovernanceConfig, transfer types

docs/
  images/               - Screenshots for README documentation
  REQUIREMENTS.md       - Installation prerequisites
  OPERATIONS-GUIDE.md   - Session management, troubleshooting

scripts/            - CLI scripts installed to ~/.local/bin/ (AMP, graph, docs, memory, agent management)

scripts/
  ecosystem-config.sh             - Single source of truth for marketplace repos, plugin names (shell)
  generate-social-logos.js        - Generate social media logos from SVG
  init-all-agents.mjs             - Initialize memory for all agents
  register-agent-from-session.mjs - Register agent(s) from tmux session(s)
  setup-tmux.sh                   - Setup tmux configuration

services/
  groups-service.ts             - Groups business logic (CRUD, subscribe, notify)
  role-plugin-service.ts        - Role-plugin install/uninstall via Claude CLI
  governance-service.ts         - Team governance (manager, COS, transfers)
  headless-router.ts            - Standalone HTTP router for headless mode

install-messaging.sh    - Installer for messaging system to user's environment

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
- **Title-based communication graph**: Directed graph enforcing which governance titles can message which (see below)

### Communication Rules

AMP messaging is governed by a title-based directed communication graph. Each governance title defines which other titles the agent can message. Missing connections are blocked with HTTP 403 and a routing suggestion.

**Adjacency matrix** (Y = allowed, empty = forbidden):

| Sender \ Recipient | MANAGER | COS | ORCHESTRATOR | ARCHITECT | INTEGRATOR | MEMBER | AUTONOMOUS |
|---------------------|:-------:|:---:|:------------:|:---------:|:----------:|:------:|:----------:|
| **MANAGER**         |    Y    |  Y  |      Y       |     Y     |     Y      |   Y    |     Y      |
| **CHIEF-OF-STAFF**  |    Y    |  Y  |      Y       |     Y     |     Y      |   Y    |     Y      |
| **ORCHESTRATOR**    |         |  Y  |              |     Y     |     Y      |   Y    |            |
| **ARCHITECT**       |         |  Y  |      Y       |           |            |        |            |
| **INTEGRATOR**      |         |  Y  |      Y       |           |            |        |            |
| **MEMBER**          |         |  Y  |      Y       |           |            |        |            |
| **AUTONOMOUS**      |    Y    |  Y  |              |           |            |        |     Y      |

**Three layers of enforcement:**
1. **API (server-side)**: `lib/communication-graph.ts` → `validateMessageRoute()` checks sender/recipient titles before delivery. Returns `403 title_communication_forbidden` with routing suggestion.
2. **Agent prompts (client-side)**: Each role-plugin's main-agent .md file lists allowed/forbidden recipients. Skills (`agent-messaging`, `team-governance`) include the full graph.
3. **Subagents**: Sub-agent .md files explicitly forbid AMP messaging. Subagents have no AMP identity and cannot authenticate.

**The user** is exempt from the graph — can message any agent and receive responses from all. Agents are discouraged from initiating messages to the user (only respond when contacted). The user must still be authenticated to prevent agents from sending messages on the user's behalf.

See `docs_dev/2026-04-03-communication-graph.md` for the full spec with graph definition, routing suggestions, and design rationale.

### Installation

The AI Maestro plugins are installed from the marketplace `Emasoft/ai-maestro-plugins`.

```bash
# Install AMP scripts and skills
./install-messaging.sh

# Non-interactive installation
./install-messaging.sh -y

# Migrate existing messages only
./install-messaging.sh --migrate
```

**What gets installed:**
- AMP scripts (`amp-*.sh`) → `~/.local/bin/` (CLI tools on PATH)
- Deprecated `23blocks-OS/ai-maestro-plugins` marketplace removed (if present)
- `ai-maestro-plugin` → from marketplace `Emasoft/ai-maestro-plugins` (`--scope user`)
  - 11 skills: agent-messaging, agent-identity, ai-maestro-agents-management, graph-query, memory-search, docs-search, planning, team-governance, team-kanban, debug-hooks, mcp-discovery
  - 12 AMP slash commands: `/amp-send`, `/amp-inbox`, `/amp-read`, etc.
  - Hooks: session tracking + message notifications
- Local role-plugins marketplace → `~/agents/role-plugins/`
  - Creates `.claude-plugin/marketplace.json` (preserves existing plugins on reinstall)
  - Registers with Claude CLI: `claude plugin marketplace add ~/agents/role-plugins/`
  - Updates: `claude plugin marketplace update ai-maestro-local-roles-marketplace`
  - Marketplace name: `ai-maestro-local-roles-marketplace` (from `scripts/ecosystem-config.sh`)
- Message storage → `~/.agent-messaging/`

**Note:** All skills are bundled in the `ai-maestro-plugin` plugin. There are NO standalone skills in `~/.claude/skills/` — everything is managed via the plugin system.

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
   - Location: marketplace `Emasoft/ai-maestro-plugins` → installed to `~/.claude/plugins/cache/`
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

The AMP skill (from `agent-messaging` plugin in the marketplace) provides natural language:

```
"Check my messages" → amp-inbox.sh
"Send a message to backend-api about deployment" → amp-send.sh backend-api "Deployment" "..."
"Reply to the last message" → amp-reply.sh <id> "..."
```

### Development Notes

- **Marketplace**: `Emasoft/ai-maestro-plugins` — update with `claude plugin marketplace update ai-maestro-plugins`
- **Protocol spec**: https://agentmessaging.org
- **Security**: Messages are signed with Ed25519; AI Maestro verifies signatures
- **Relay queue**: Offline agents get messages via polling (`/api/v1/messages/pending`)

## Plugin Abstraction Principle (CRITICAL)

All AI Maestro functionality is exposed through two abstraction layers. External plugins MUST use these layers — never call the API directly. See [docs/PLUGIN-ABSTRACTION-PRINCIPLE.md](./docs/PLUGIN-ABSTRACTION-PRINCIPLE.md) for the full guide.

### Layer 1: Skills (for agents)

All AI Maestro skills are bundled in the `ai-maestro` plugin (marketplace: `Emasoft/ai-maestro-plugins`). Key skills:

| Skill | Covers |
|-------|--------|
| `team-governance` | Team CRUD, COS assignment, governance requests, transfers, auth headers |
| `ai-maestro-agents-management` | Agent lifecycle via `aimaestro-agent.sh` CLI |
| `agent-messaging` | Inter-agent messaging via `amp-*` scripts + governance messaging rules |
| `agent-identity` | AID protocol — Ed25519 identity, proof of possession, OAuth token exchange |
| `team-kanban` | Team task boards, dependencies, status tracking, GitHub sync |
| `mcp-discovery` | Discover MCP server tools without installing plugins |

These skills ARE the authoritative reference. When the API changes, only these skill files need updating. The plugin also includes 12 AMP slash commands (`/amp-send`, `/amp-inbox`, etc.).

### Layer 2: Scripts (for hooks)

AI Maestro installs CLI scripts to `~/.local/bin/` that wrap API calls:
- `aimaestro-agent.sh` — Agent lifecycle CLI (delegates to `agent-*.sh` modules)
- `amp-send.sh`, `amp-inbox.sh`, `amp-read.sh`, etc. — Messaging CLI
- `aid-init.sh`, `aid-token.sh`, etc. — Agent Identity CLI

The same scripts are also bundled in the plugin (for slash commands). When the API changes, only these scripts need updating.

### Rules for External Plugins

1. **Plugin skills/commands/agents MUST NOT embed API syntax** (no curl commands, no endpoint URLs, no header patterns). They describe functionality and reference the global AI Maestro skill by name.
2. **Plugin hooks/scripts MUST NOT call the API directly.** They call globally-installed AI Maestro scripts (`aimaestro-agent.sh`, `amp-send.sh`, etc.).
3. **Governance rules are discovered at runtime** by reading the `team-governance` skill. Plugins MUST NOT hardcode governance rules, permission matrices, or role restrictions.
4. **AI Maestro's own plugin is the exception** — it IS the provider of these abstractions. Its skills contain the canonical syntax. Its scripts make the actual API calls.

### Benefits
- API change → update 1 skill/script → all plugins work
- New feature → add to skill → all agents discover it
- Governance rule change → update skill → all agents learn it automatically
- No "update hundreds of plugins" problem as the ecosystem grows

## Plugin Architecture (CRITICAL — Two Separate Worlds)

Plugins in AI Maestro are split into two completely separate categories with different lifecycles, storage locations, and management flows. **Never mix the two.**

### 1. Role-Plugins (Agent Specializations)

Role-plugins define an agent's job specialization. They contain a `.agent.toml` profile with `compatible-titles` and `compatible-clients` fields.

**Storage:** ALL role-plugins live in `~/agents/role-plugins/<plugin-name>/`. No exceptions.

**Local marketplace:** `ai-maestro-local-roles-marketplace` (directory-based, registered with Claude CLI via `claude plugin marketplace add ~/agents/role-plugins/`).

**Two sources for role-plugins:**

| Source | Location | Created by |
|--------|----------|------------|
| **Predefined** (6 defaults) | GitHub `Emasoft/ai-maestro-plugins` → cached to `~/.claude/plugins/cache/` | Emasoft (project owner) |
| **Custom** | `~/agents/role-plugins/<name>/` | Haephestos (agent creation helper) |

**Predefined role-plugins:**

| Plugin Name | Prefix | Governance Title |
|-------------|--------|-----------------|
| `ai-maestro-assistant-manager-agent` | `amama-` | MANAGER |
| `ai-maestro-chief-of-staff` | `amcos-` | CHIEF-OF-STAFF |
| `ai-maestro-programmer-agent` | `ampa-` | MEMBER |
| `ai-maestro-orchestrator-agent` | `amoa-` | ORCHESTRATOR |
| `ai-maestro-integrator-agent` | `amia-` | INTEGRATOR |
| `ai-maestro-architect-agent` | `amaa-` | ARCHITECT |

**N:1 compatibility model:** Role-plugins declare which titles they're compatible with via `compatible-titles` in `.agent.toml`. Multiple plugins can serve the same title. Plugins also declare `compatible-clients` (e.g., `["claude-code"]`, `["claude-code", "codex"]`). The UI shows:
- **1 compatible plugin** → fixed label (no choice needed)
- **2+ compatible plugins** → dropdown to choose between them
- ALL titles (including COS, MANAGER) can swap between compatible plugins

**Haephestos creation flow (8 steps):**
1. Gather info (role description + project type)
2. Generate TOML profile via PSS binary
3. Prune and refine elements
4. User review in TOML preview panel
5. Build plugin via PSS make-plugin (into `~/agents/haephestos/build/`)
6. Add AI Maestro compat fields (`compatible-titles`, `compatible-clients`, verify quad-identity)
7. Validate with CPV (`/cpv-validate-plugin`, `/cpv-fix-validation`)
8. Publish via `POST /api/agents/creation-helper/publish-plugin` (copies to marketplace, runs `claude plugin marketplace update ai-maestro-local-roles-marketplace`)

**After publishing:** The plugin appears automatically in any UI that lists role-plugins (wizard step 5, Config tab dropdown, role-plugin status API).

### 2. Normal Plugins (General-Purpose Tools)

Normal plugins are general-purpose tools (skills, MCP servers, hooks, etc.) installed from GitHub marketplaces.

**Installation:**
- **User scope** (global): Settings page → Plugins Explorer tab → browse marketplace → install
- **Local scope** (per-agent): Agent Profile → Config tab → browse marketplace → install

**Marketplace management:**
- **Add marketplace:** Settings → Plugins Explorer → Marketplaces tab → add marketplace URL
- **Remove marketplace:** Same tab → remove button
- All marketplace operations use Claude CLI: `claude plugin marketplace add/remove/update <name>`

**Normal plugins are NEVER put in `~/agents/role-plugins/`.** They are managed entirely by Claude CLI's standard plugin system (`~/.claude/plugins/cache/`, `settings.json`, `settings.local.json`).

### Title → Role-Plugin Auto-Assignment

When a governance title is assigned via the UI (Title Assignment Dialog), the ChangeTitle pipeline (Gates 15-16) automatically:
1. Finds compatible plugins for the new title + agent's client (`getCompatiblePluginsForTitle()`)
2. If the current plugin is already compatible → keeps it
3. If not → installs the first compatible plugin (uninstalls the old one)
4. If no native plugin for this client → marks for auto-conversion (TODO)

### Marketplace Names (Single Source of Truth)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MARKETPLACE_NAME` / `GITHUB_MARKETPLACE_NAME` | `ai-maestro-plugins` | GitHub marketplace for predefined role-plugins |
| `LOCAL_MARKETPLACE_NAME` | `ai-maestro-local-roles-marketplace` | Local directory marketplace for Haephestos-created plugins |
| `LOCAL_MARKETPLACE_DIR_NAME` | `role-plugins` | Directory name under `~/agents/` |

Defined in `lib/ecosystem-constants.ts` (TypeScript) and `scripts/ecosystem-config.sh` (shell). `getLocalMarketplacePath()` returns the resolved absolute path.

**Deprecated marketplaces** (auto-removed by migration): `23blocks-OS/ai-maestro-plugins`, `ai-maestro-local-agents-marketplace`, `ai-maestro-local-marketplace`, `role-plugins`.

### Key Files

- `services/role-plugin-service.ts` — Core service: `generatePluginFromToml()`, `createPersona()`, `listRolePlugins()`, `getPluginsForTitle()`, `ensureMarketplace()`, `updateMarketplaceManifest()`
- `services/element-management-service.ts` — `ChangeTitle()` (Gates 15-16 handle plugin swap), `getCompatiblePluginsForTitle()`, `installPluginLocally()`
- `app/api/agents/role-plugins/` — List/install/uninstall/status API
- `app/api/agents/creation-helper/publish-plugin/` — Publishes Haephestos-built plugin to local marketplace
- `components/agent-profile/RoleTab.tsx` — Dynamic label vs dropdown based on compatible plugin count
- `components/AgentCreationWizard.tsx` — Step 5 filters by `compatible-titles` + `compatible-clients`
- `lib/ecosystem-constants.ts` — `LOCAL_MARKETPLACE_NAME`, `GITHUB_MARKETPLACE_NAME`, `getLocalMarketplacePath()`
- `agents/haephestos-creation-helper.md` — 8-step role-plugin creation protocol

## Groups Feature (v0.25+)

Groups are lightweight agent collections for broadcast messaging — replacing the removed "open teams" concept. Unlike teams, groups have no governance, no COS, no kanban — just a subscriber list.

### Types

- `types/group.ts` — `Group` interface (id, name, description, subscriberIds, timestamps)
- `types/group.ts` — `GroupsFile` (version + groups array)

### Storage

Groups persist in `~/.aimaestro/teams/groups.json` via `lib/group-registry.ts`.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create a group |
| GET | `/api/groups/{id}` | Get group by ID |
| PUT | `/api/groups/{id}` | Update group |
| DELETE | `/api/groups/{id}` | Delete group |
| POST | `/api/groups/{id}/subscribe` | Subscribe agent to group |
| POST | `/api/groups/{id}/unsubscribe` | Unsubscribe agent from group |
| POST | `/api/groups/{id}/notify` | Broadcast message to all subscribers |

### Key Files

- `types/group.ts` — Group type definitions
- `lib/group-registry.ts` — File-based CRUD with validation
- `services/groups-service.ts` — Business logic layer
- `services/headless-router.ts` — Groups routes for headless mode
- `app/api/groups/` — Next.js API routes

### Migration from Open Teams

Open teams were removed in the governance simplification (2026-03-27). All teams are now closed (isolated messaging with COS gateway). Groups replace the "open, unstructured collection of agents" use case that open teams served, but without governance overhead.

## Ecosystem Constants (Single Source of Truth)

All marketplace repos, plugin names, and ecosystem identifiers are centralized in two mirrored files:

- **TypeScript**: `lib/ecosystem-constants.ts` — used by all server-side services and API routes
- **Shell**: `scripts/ecosystem-config.sh` — sourced by all installer/updater shell scripts

When the project owner changes repos or orgs, only these two files need updating. All shell scripts use `${MARKETPLACE_REPO:-Emasoft/ai-maestro-plugins}` (with fallback) after sourcing the config. All TypeScript code imports constants from `lib/ecosystem-constants.ts`.

**Key constants defined:**
- `MARKETPLACE_REPO` / `MARKETPLACE_NAME` — GitHub marketplace org/repo
- `MAIN_PLUGIN_NAME` — Main AI Maestro plugin
- `ROLE_PLUGIN_*` — All 6 predefined role-plugin names
- `TITLE_PLUGIN_MAP` — Governance title to required role-plugin mapping
- `AI_MAESTRO_REPO` / `MARKETPLACE_REPO_URL` — Repo URLs

**Note:** The `Emasoft/ai-maestro-plugins` references in this CLAUDE.md are documentation values. The actual runtime values come from ecosystem-constants.

## GitHub Repos Architecture (3-Repo Split)

The AI Maestro ecosystem is split across three separate GitHub repos under the `Emasoft` org. Each has a distinct role:

### 1. `Emasoft/ai-maestro` — Main App (this repo)

The Next.js dashboard + server. Also the **canonical source** for all AMP and AID scripts:
- `scripts/amp-*.sh` (28 scripts) — Agent Messaging Protocol CLI
- `scripts/aid-*.sh` (5 scripts) — Agent Identity CLI
- `scripts/agent-*.sh`, `scripts/docs-*.sh`, `scripts/graph-*.sh`, `scripts/memory-*.sh` — Other CLI tools
- `install-messaging.sh` copies these scripts to `~/.local/bin/`

This repo's scripts are **more up to date** than the upstream marketplace — they include extra security fixes (e.g., MF-023 path traversal validation in `amp-send.sh`).

### 2. `Emasoft/ai-maestro-plugin` — Core Plugin (NOT a fork)

The main AI Maestro Claude Code plugin (v2.2.0+). Contains **only** skills, commands, hooks — **zero scripts** except the hook handler:
- **1 hook script**: `scripts/ai-maestro-hook.cjs` (session tracking + message notifications)
- **11 skills** (auto-discovered from `skills/*/SKILL.md`): agent-management, agent-messaging, agent-identity, debug-hooks, docs-search, graph-query, mcp-discovery, memory-search, planning, team-governance, team-kanban
- **12 AMP commands** (`commands/*.md`): `/amp-init`, `/amp-send`, `/amp-inbox`, etc. — reference scripts at `~/.local/bin/` (installed by main repo)
- **No regular scripts** — all scripts live in the main repo and are installed system-wide by the installers

### 3. `Emasoft/ai-maestro-plugins` — Marketplace (fork of 23blocks-OS)

Fork of `23blocks-OS/ai-maestro-plugins`. Lists the 6 predefined role-plugins in `.claude-plugin/marketplace.json`. The fork is 13 commits behind upstream (as of 2026-03-31) but this is a **non-issue** — the upstream additions (AID v0.2.0, AMP v0.1.3 fixes, case normalization) are already present in the main repo with equivalent or improved versions.

**Do NOT merge upstream into this fork** — the main repo is the canonical source for AMP/AID scripts.

### 4. Role-Plugin Repos (6 repos, NOT forks)

Each is an independent Emasoft-owned repo (not forked from 23blocks-OS):

| Repo | compatible-titles | Last updated |
|------|------------------|-------------|
| `Emasoft/ai-maestro-architect-agent` | `["ARCHITECT"]` | 2026-03-29 |
| `Emasoft/ai-maestro-assistant-manager-agent` | `["MANAGER"]` | 2026-03-29 |
| `Emasoft/ai-maestro-chief-of-staff` | `["CHIEF-OF-STAFF"]` | 2026-03-29 |
| `Emasoft/ai-maestro-integrator-agent` | `["INTEGRATOR"]` | 2026-03-29 |
| `Emasoft/ai-maestro-orchestrator-agent` | `["ORCHESTRATOR"]` | 2026-03-29 |
| `Emasoft/ai-maestro-programmer-agent` | `["MEMBER"]` | 2026-03-29 |

All have `compatible-titles` and `compatible-clients` fields in their `.agent.toml`. No upstream sync needed.

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

tmux session names are limited to: `^[a-zA-Z0-9_@.-]+$`

The extended character set (`@` and `.`) supports `agentId@hostId` format used for multi-host agent addressing. **Enforce this** in any UI that creates sessions (Phase 2+). Invalid characters will cause `tmux attach` to fail silently.

### Network Security Model

**Dual-bind with IP filter (v0.27.2+):**

The server binds to `::` (all interfaces, dual-stack IPv4+IPv6) when Tailscale is detected, but a TCP-level connection filter (`server.mjs:isAllowedSource()`) drops connections from non-allowed IPs before any HTTP/WebSocket processing:

| Source | Allowed | Why |
|--------|---------|-----|
| `127.0.0.1`, `::1` | Yes | Localhost |
| `100.64.0.0/10` (Tailscale CGNAT) | Yes | Tailscale VPN IPv4 |
| `fd7a:115c:a1e0:*` (Tailscale ULA) | Yes | Tailscale VPN IPv6 |
| `192.168.x.x` (LAN) | **No** | Dropped at TCP level |
| Any other IP | **No** | Dropped at TCP level |

Without Tailscale installed, the server falls back to `127.0.0.1`-only binding (pure localhost).

**Tailscale is required for any remote access.** The `isAllowedSource()` function in `server.mjs` is the security gate. When modifying it, only allow Tailscale CGNAT (`100.64.0.0/10`) and Tailscale ULA (`fd7a:115c:a1e0::/48`) ranges — never allow LAN or public IPs.

**Known limitations (deferred to Phase 2):**
- **No human user authentication** — no login page, no session cookies (see `docs_dev/2026-04-02-maestro-auth-design.md`)
- **No CORS/CSRF protection** — all same-origin by design
- **MagicDNS does not work on iOS** — iPad/iPhone must use raw Tailscale IPv4 (e.g., `http://<tailscale-ip>:23000`), not `*.ts.net` hostnames. Run `tailscale ip -4` on the host to find the IP.
- **Tailscale IPv6 not routable from same host** — macOS Tailscale app doesn't loopback IPv6; works from remote devices but untested on iPad
- **`tailscale serve` is NOT used** — it breaks Next.js static file serving; direct bind with IP filter is used instead
- **SF-058 bypass** — requests without auth headers get full system-owner access (`lib/agent-auth.ts:35-41`); Phase 2 will add mandatory auth

**Key files:**
- `server.mjs:89-104` — Tailscale IP detection + `isAllowedSource()` filter
- `server.mjs:1316-1323` — TCP connection filter on `::` bind
- `lib/agent-auth.ts` — Agent auth bridge (Phase 1 bypass at line 35)
- `docs_dev/2026-04-02-maestro-auth-design.md` — Full maestro auth design for Phase 2
- `docs_dev/2026-04-02-remote-host-deep-audit.md` — Deep security audit of all remote access paths

## Common Gotchas

### 0. Agent API Response Nesting — ALWAYS use `.agent.field`

**CRITICAL:** `GET /api/agents/{id}` returns `{ agent: { id, name, role, governanceTitle, ... } }` — the data is nested under `.agent`. NEVER read fields directly from the response object.

```typescript
// ✅ CORRECT
const data = await res.json()
const title = data.agent?.governanceTitle
const workDir = data.agent?.workingDirectory

// ❌ WRONG — silently returns undefined, causes fallback to defaults
const title = data?.governanceTitle  // ALWAYS undefined!
```

This caused a critical bug where `governanceTitle` was always null, making title changes appear to fail silently (the server saved the title correctly, but the UI never read it back).

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

Use robust regex: `/^([a-zA-Z0-9_@.-]+):/`

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

**Prerequisites:** AI Maestro running on localhost:23000, jq installed, AMP scripts installed (`./install-messaging.sh -y`).

### UI Scenario Tests

Browser-based UI scenario tests that verify end-to-end workflows through Chrome DevTools Protocol (CDP).

**Rules & Format:** `tests/scenarios/SCENARIOS_TESTS_RULES.md` — 9 mandatory rules including CLEAN-AFTER-YOURSELF (cleanup), 0-IMPACT (don't touch user data), STATE-WIPE (backup/restore configs), FIX-AS-YOU-GO (fix bugs immediately during test), STICK-TO-UI (never bypass the browser).

**Scenarios:**

| # | File | Steps | Tests |
|---|------|-------|-------|
| SCEN-001 | `tests/scenarios/SCEN-001_title-change-lifecycle.scen.md` | 33 | ChangeTitle pipeline, plugin swap, singleton enforcement |
| SCEN-002 | `tests/scenarios/SCEN-002_teams-groups-agents.scen.md` | 53 | Team CRUD, title auto-assignment, COS, orchestrator |
| SCEN-003 | `tests/scenarios/SCEN-003_agent-creation-wizard.scen.md` | 40 | Agent wizard with INTEGRATOR, MEMBER, plugin enforcement |

**Running a scenario:** Say "run scenario 1" (or 2 or 3). The scenario file is read and executed step-by-step via Chrome CDP. Reports are saved to `tests/scenarios/reports/`, screenshots to `tests/scenarios/screenshots/SCEN-NNN/`.

**Prerequisites:** AI Maestro server running, Chrome browser open with DevTools accessible, governance password set.

### Element Management Service

All plugin/element/agent-property mutations go through `services/element-management-service.ts`. This is the centralized gateway — no other code may directly write to `enabledPlugins`, call `claude plugin` CLI, or delete element files.

**Key functions:**
- `ChangeTitle(agentId, newTitle)` — 23-gate pipeline for governance title lifecycle
- `ChangePlugin(agentId, desired)` — 13-gate pipeline for plugin install/uninstall/enable/disable
- `ChangeSkill`, `ChangeAgentDef`, `ChangeCommand`, `ChangeRule`, `ChangeOutputStyle`, `ChangeMCP`, `ChangeLSP`, `ChangeHook` — Element-specific pipelines
- `ChangeTeam(agentId, desired)` — Team membership with auto-title transitions
- `ChangeName`, `ChangeFolder`, `ChangeAvatar`, `ChangeCLIArgs` — Agent property pipelines

The PATCH `/api/agents/{id}` route is a router that dispatches to the appropriate Change* function based on which fields are in the body.

## Documentation References

- **[README.md](./README.md)** - Project overview, quick start, architecture
- **[docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md)** - Installation prerequisites
- **[docs/OPERATIONS-GUIDE.md](./docs/OPERATIONS-GUIDE.md)** - Agent management, troubleshooting
- **[docs/CEREBELLUM.md](./docs/CEREBELLUM.md)** - Cerebellum subsystem architecture, voice pipeline, TTS providers

Refer to these when users ask about setup or usage.

## Cross-Client Conversion Reference Repos

The skill/plugin conversion feature is based on code from these two open-source repos:

- **https://github.com/TokenRollAI/acplugin** — Converts Claude Code plugins to Codex, OpenCode, and Cursor formats. Handles skills, agents, commands, hooks, MCP, instructions. TypeScript, MIT license.
- **https://github.com/sustinbebustin/crucible** — Bidirectional converter for 7 AI coding harnesses (Claude, Codex, OpenCode, Cursor, Gemini, GitHub Copilot, Kiro). Handles skills and agent configs with format-specific output (TOML for Codex, JSON for Kiro, markdown-yaml for the rest). TypeScript, MIT license.

The best features from both should be combined into `services/cross-client-skill-service.ts`. Prior analysis: `docs_dev/2026-03-31-crucible-integration-analysis.md`.

## Roadmap Context

**Phase 1 (Current):** Auto-discovery, localhost-only, read-only agent interaction
**Phase 2 (Planned):** Agent creation from UI, search, enhanced grouping
**Phase 3 (Future):** Remote SSH sessions, authentication, collaboration

**Already implemented beyond Phase 1:** Team governance, Groups (lightweight agent collections), role-plugin marketplace, AMP messaging, kanban boards, agent profile panel, settings page.

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

**Team Meeting & Kanban (v0.20.19+):**
10. `app/team-meeting/page.tsx` - Team meeting page with reducer state machine
11. `components/team-meeting/TaskKanbanBoard.tsx` - Full-screen kanban overlay with 5 columns + drag-and-drop
12. `components/team-meeting/KanbanColumn.tsx` - Single kanban column with drop zone
13. `components/team-meeting/KanbanCard.tsx` - Compact draggable task card
14. `types/task.ts` - Task types with 5 statuses: backlog, pending, in_progress, review, completed
15. `lib/task-registry.ts` - File-based CRUD for team task persistence
16. `hooks/useTasks.ts` - Task hook with tasksByStatus, optimistic updates, polling

**Groups (v0.25+):**
17. `types/group.ts` - Group type definitions (lightweight agent collections)
18. `lib/group-registry.ts` - File-based CRUD for groups
19. `services/groups-service.ts` - Groups business logic

**Session Control (v0.27.1+):**
20. `hooks/useSessionActivity.ts` - WebSocket-based activity status with notificationType
21. `hooks/useRestartQueue.ts` - Queue-based auto-restart after element changes
22. `app/api/sessions/[id]/restart/route.ts` - Restart API (exit → poll → relaunch)
23. `app/api/sessions/[id]/stop/route.ts` - Graceful stop API

**Read these in order** to understand agents and data flow.

**Key UI patterns:**
- Tab-based multi-terminal architecture (v0.3.0+) - all agents mounted, visibility toggling
- Dynamic color assignment (hash-based, no hardcoding)
- Hierarchical grouping (3-level: category/subcategory/agent)
- Agent notes (per-agent localStorage)
- Avoid nested buttons (use div with cursor-pointer)
- Use visibility:hidden for inactive tabs (not display:none)
