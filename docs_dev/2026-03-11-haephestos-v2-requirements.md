# Haephestos v2 — Terminal-Based Agent Creator

**Date:** 2026-03-11
**Status:** Requirements — approved by user
**Priority:** High
**Supersedes:** Current hidden-session + terminal-parsing architecture

---

## 1. Problem Statement

The current Haephestos architecture uses a hidden tmux session with terminal output parsing (~1800 LOC) to simulate a chat UI. This is fragile:
- Output parsing breaks across Claude Code versions (ANSI codes, separator patterns, spinner chars)
- Response detection fails for long-running sub-agents (PSS profiler: 10+ min, 60+ tool calls)
- Permission dialogs don't work in the custom chat (they need a real terminal)
- Config block extraction relies on bracket-balanced JSON scanning of terminal output
- Not cross-platform friendly (parsing assumptions tied to macOS terminal behavior)

## 2. Solution: Use the Existing Terminal Infrastructure

AI Maestro already connects to tmux sessions via xterm.js + WebSocket. Haephestos should be a **regular agent with its own visible terminal**, not a hidden session with custom parsing.

### Core Principle
> "Why try to reinvent something that already is present in ai-maestro and working?"

## 3. What Haephestos IS and IS NOT

### IS:
- An agent creator for **custom/specialized agent types**
- For creating new plugins and roles for particular frameworks or specialized roles
- For agent types that don't have predefined role plugins

### IS NOT:
- The place for the 5 predefined roles (Chief-of-Staff, Architect, Orchestrator, Integrator, Programmer)
- Those roles are handled by:
  - The **simple wizard** (role selection buttons in the existing agent creation dialog)
  - The **Chief of Staff** agent (auto-staffing flow when a team is created)

## 4. Architecture

### Desktop Layout

```
+--------+--------------------------------------+---------------------+
| Left   |        Terminal                       |   Right Panel       |
| ~80px  |        (TerminalView)                 |   ~280px            |
|        |                                       |                     |
| [avatar|  Standard xterm.js + WebSocket        |   .agent.toml       |
|  face] |  Claude --agent haephestos            |   file preview      |
|        |                                       |   (monospace,        |
|        |  User types directly                  |    scrollable,       |
|        |  Claude responds in real-time         |    auto-refresh      |
| Files: |  Permissions work natively            |    every 5s)         |
| file x |  PSS profiler visible                 |                     |
| file x |                                       |   Raw TOML content   |
|        |                                       |   rendered as-is     |
|        +---------------------------------------+                     |
|        | MobileKeyToolbar (touch only)         |                     |
|        +---------------------------------------+                     |
|        | Prompt Builder footer        [Upload] |                     |
|        | [Clear] [Send]                        |                     |
+--------+---------------------------------------+---------------------+
|                    [Cancel]        [Create Agent]                    |
+---------------------------------------------------------------------+
```

### Mobile Layout (iPhone/iPad)

```
+------------------------+
| Header: Haephestos     |
| [Files] [TOML]         |  <- tab bar (panels on demand)
+------------------------+
|                        |
|   Terminal             |
|   (full width)         |
|                        |
+------------------------+
| MobileKeyToolbar       |
| [Esc][Tab][up][dn][...] |
+------------------------+
| Prompt Builder [Upload]|  <- upload as icon
| [Send]                 |
+------------------------+
| [Cancel] [Create]      |
+------------------------+

[Files] tab -> slide-up sheet: avatar + file list
[TOML] tab -> slide-up sheet: .agent.toml preview
```

### Responsive Rules
- Buttons with labels -> icons on small screens
- Lists -> compact with scrollbar
- Left and right panels -> accessed on demand via tab bar (mobile)
- Right panel collapsible on tablet
- Everything must work on iPhone, iPad, desktop

## 5. Components

### 5.1 Left Panel (HaephestosLeftPanel)
- Big Haephestos avatar/face at top
- List of uploaded files with remove (x) buttons
- Compact, narrow (~80px desktop, hidden on mobile until tab pressed)

### 5.2 Terminal Area
- Standard `TerminalView` component — same as every other agent
- Connected to the Haephestos tmux session via WebSocket
- `hideFooter={false}` — uses the prompt builder footer
- Includes MobileKeyToolbar on touch devices

### 5.3 Right Panel (TomlPreviewPanel)
- Displays the raw content of the `.agent.toml` file being built
- Polls the file every 5 seconds
- Monospace font, scrollable, read-only
- Shows "No profile generated yet" when file doesn't exist
- Collapsible on desktop, tab-accessible on mobile

### 5.4 Prompt Builder Enhancement (ALL agents, not just Haephestos)
- Add `[Upload]` button to the prompt builder footer bar
- Uses the existing `file-picker/route.ts` endpoint
- Uploads file, then inserts the server-side path into the prompt textarea
- On mobile: icon-only button
- On desktop: icon + "Upload" label
- Allowed extensions: `.md`, `.txt`, `.toml` (configurable)

### 5.5 Bottom Action Bar
- **[Cancel]** — destroys the Haephestos session, navigates back
- **[Create Agent]** — reads the generated `.agent.toml`, creates the agent via `/api/sessions/create`
- Both buttons always visible (not in a panel)

## 6. Session Lifecycle

1. User navigates to `/agent-creation` (or opens Haephestos from agent list)
2. Page creates tmux session: `POST /api/sessions/create` with:
   - `name: "haephestos-<timestamp>"` or `"_aim-creation-helper"`
   - `program: "claude-code"`
   - `programArgs: "--agent haephestos-creation-helper"`
3. TerminalView connects via WebSocket (same as any agent)
4. User interacts with Haephestos directly in the terminal
5. Haephestos writes `.agent.toml` draft to known path (e.g., `~/.aimaestro/tmp/haephestos-draft.toml`)
6. Right panel polls that file every 5 seconds
7. User clicks [Create Agent]:
   - Reads the `.agent.toml` file
   - Creates the actual agent via the agent registry
   - Destroys the Haephestos session
   - Navigates to the new agent
8. User clicks [Cancel]:
   - Destroys the Haephestos session
   - Cleans up temp files
   - Navigates back

## 7. File Upload Flow

1. User clicks [Upload] in prompt builder (or left panel on mobile)
2. Browser `<input type="file">` opens
3. User selects file (.md, .txt, .toml)
4. File uploaded via `POST /api/agents/creation-helper/file-picker`
5. Server saves to `~/.aimaestro/tmp/creation-helper/<random>-<name>`
6. Server returns `{ path, filename }`
7. Path inserted into prompt textarea (user can edit/add context before sending)
8. File appears in left panel's file list

## 8. What Gets Deleted (moved to docs_dev/archive/)

| File | Reason |
|------|--------|
| `services/creation-helper-service.ts` (697 LOC) | Terminal parsing no longer needed |
| `components/AgentCreationHelper.tsx` (931 LOC) | Custom chat UI replaced by TerminalView |
| `app/api/agents/creation-helper/session/route.ts` | Session managed by page lifecycle using standard API |
| `app/api/agents/creation-helper/chat/route.ts` | User types in terminal directly |
| `app/api/agents/creation-helper/response/route.ts` | No more response polling |
| `tests/services/creation-helper-service.test.ts` | Tests for deleted service |

### Kept:
- `app/api/agents/creation-helper/file-picker/route.ts` — reused by [Upload] button
- `agents/haephestos-creation-helper.md` — agent persona (updated for new workflow)
- `components/AgentConfigPanel.tsx` — may be reused elsewhere (team meeting, etc.)

## 9. What Gets Created

| File | Purpose |
|------|--------|
| `app/agent-creation/page.tsx` | New Next.js page route |
| `components/HaephestosLayout.tsx` | Desktop layout: left + terminal + right + action bar |
| `components/TomlPreviewPanel.tsx` | Right panel: polls and displays .agent.toml |
| `components/HaephestosLeftPanel.tsx` | Left panel: avatar + file list |
| `components/HaephestosMobileLayout.tsx` | Mobile layout with tab bar + slide-up sheets |

## 10. What Gets Modified

| File | Change |
|------|--------|
| `components/TerminalView.tsx` | Add [Upload] button to prompt builder footer |
| `components/MobileKeyToolbar.tsx` | Add upload icon button for mobile |
| `components/AgentList.tsx` | Change "Advanced Create" to navigate to `/agent-creation` instead of opening modal |
| `agents/haephestos-creation-helper.md` | Update persona: write .agent.toml to known path, remove json:config instruction |

## 11. Haephestos Persona Updates

The agent persona file needs these changes:
- **Remove**: Instructions to emit `json:config` blocks
- **Add**: Instructions to write draft `.agent.toml` to `~/.aimaestro/tmp/haephestos-draft.toml`
- **Add**: Instructions to update the file after each conversation turn
- **Keep**: PSS profiler integration (spawn pss-agent-profiler sub-agent)
- **Keep**: READ-only tool restrictions (Read, Glob, Grep, Agent)
- **Update**: `temporary: false` (visible in agent list while active), or keep temporary but visible

## 12. Team Creation Changes

### Simple Wizard Enhancement
- Add 5 role buttons to the existing simple agent creation dialog
- When a role is selected, the agent is created with the corresponding role plugin pre-installed
- No need for Haephestos for predefined roles

### Auto-Staffing Dialog (Team Creation)
When a team is created with no agents:
> "The team is currently without staff. Do you want to create a Chief-of-Staff agent for this team and let him create the staff for you, or do you want to create the agents yourself?"
- **Option A: Auto-staff** -> Creates CoS agent, CoS handles the rest autonomously
- **Option B: Manual** -> User creates agents via simple wizard (predefined roles) or Haephestos (custom roles)

### Kanban Column Changes
Current 5 columns: Backlog -> Pending -> In Progress -> Review -> Completed

New 6 columns:
0. **Feature Request** (Limbo) — non-actionable proposals, Manager-only approval to move to TODO
1. **TODO** — actionable task requirement documents only
2. **In Progress**
3. **Review**
4. **Testing**
5. **Completed**

## 13. Implementation Phases

### Phase A: Haephestos v2 Core (this PR)
- [ ] Create `/agent-creation` page with desktop + mobile layouts
- [ ] Create TomlPreviewPanel (polls .agent.toml every 5s)
- [ ] Create HaephestosLeftPanel (avatar + file list)
- [ ] Add [Upload] button to prompt builder (all agents benefit)
- [ ] Update Haephestos persona (write .agent.toml, remove json:config)
- [ ] Add [Cancel] and [Create Agent] action bar
- [ ] Move old files to docs_dev/archive/
- [ ] Update AgentList to navigate to /agent-creation

### Phase B: Team Creation Enhancements
- [ ] Add 5 role buttons to simple wizard
- [ ] Add auto-staffing dialog to team creation
- [ ] Create role plugin templates (.agent.toml for each role)

### Phase C: Kanban Workflow
- [ ] Add Feature Request column (column 0)
- [ ] Manager-only approval for Feature Request -> TODO
- [ ] Add Testing column (column 4)
- [ ] Task design requirement document attachments

### Phase D: CoS Autonomous Pipeline
- [ ] CoS agent creation + persona
- [ ] CoS -> Manager requirements handoff
- [ ] CoS -> Architect creation + messaging
- [ ] Architect: non-actionable -> actionable design transformation
- [ ] PSS profiler integration for role plugin augmentation
- [ ] CoS: bulk agent creation with augmented profiles
- [ ] Orchestrator: actionable design -> task breakdown

## 14. Benefits Summary

| Aspect | Before (v1) | After (v2) |
|--------|-------------|------------|
| Code complexity | ~1800 LOC parsing | ~300 LOC layout |
| Response detection | Fragile regex patterns | Not needed (real terminal) |
| Thinking detection | Pattern matching | Not needed (user sees spinner) |
| Timeout handling | Adaptive idle timeout | Not needed (user watches) |
| Permission dialogs | Broken (custom chat) | Native (real terminal) |
| PSS profiler | Hidden, timeout-prone | Visible, no timeout |
| Config sync | JSON block parsing | File polling (5s) |
| Cross-platform | Fragile (parsing assumptions) | Same terminal as all agents |
| File upload | Works | Works (enhanced for all agents) |
| Mobile support | Custom chat layout | Standard responsive layout |
