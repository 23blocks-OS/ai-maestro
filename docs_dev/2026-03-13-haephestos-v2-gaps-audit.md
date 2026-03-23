# Haephestos v2 Gaps Audit

**Date:** 2026-03-13
**Auditor:** Opus 4.6
**Requirements doc:** `docs_dev/2026-03-11-haephestos-v2-requirements.md`

---

## Executive Summary

Phase A (Haephestos v2 Core) is **approximately 75% complete**. The new terminal-based architecture is functional: the agent creation page, TomlPreviewPanel, HaephestosLeftPanel, and Upload button all exist and work. However, there are significant gaps: v1 legacy code (AgentCreationHelper.tsx, creation-helper-service.ts, 3 v1 API routes) has NOT been removed or archived; the AgentConfigPanel is still tied to the v1 data model; and the simple wizard (AgentCreationWizard) has zero role-selection support (Phase B is entirely unstarted). The Haephestos persona file has been fully updated for v2.

---

## 1. Agent Creation Page (`app/agent-creation/page.tsx`)

### Requirements say it should:
- Be the new Next.js page route for Haephestos v2
- Desktop layout: left panel + terminal (TerminalView) + right panel (TomlPreviewPanel) + bottom action bar
- Mobile layout: header with tab bar, slide-up sheets for panels, action bar
- Create tmux session on mount via `/api/sessions/create` with `--agent haephestos-creation-helper`
- [Cancel] destroys session + navigates back
- [Create Agent] reads `.agent.toml`, creates agent, destroys Haephestos, navigates to new agent
- Resizable panels with drag handles

### Current state:
- **IMPLEMENTED**: Full desktop layout (left panel + terminal + right panel with resize handles), mobile layout with tab bar and slide-up sheets, session lifecycle (create on mount, destroy on unmount/cancel), [Cancel] and [Create Agent] buttons, TOML parsing from draft file, error/loading states, file upload callback to HaephestosLeftPanel
- **IMPLEMENTED**: Resizable panels with drag start/move/up, min width constraints, 30% viewport max
- **IMPLEMENTED**: TerminalProvider context wrapping, agentToSession conversion
- **IMPLEMENTED**: Cleanup API route called on destroy (`/api/agents/creation-helper/cleanup`)

### Missing/incomplete:
- None critical for Phase A -- this component is essentially complete
- Minor: the TOML parsing for agent creation (lines 210-221) uses simple regex; a proper TOML parser would be more robust but is acceptable for now

---

## 2. AgentCreationHelper.tsx (`components/AgentCreationHelper.tsx`) -- V1 LEGACY

### Requirements say:
- This file (931 LOC) should be **deleted** (moved to `docs_dev/archive/`)
- Reason: "Custom chat UI replaced by TerminalView"

### Current state:
- **STILL EXISTS** at 931 lines -- NOT moved to archive
- Contains the entire v1 custom chat UI: message polling, response capture via `/api/agents/creation-helper/response`, terminal output parsing, config suggestion application, markdown rendering with ReactMarkdown/SyntaxHighlighter, file attachment UI with 3 upload slots, PSS profile generation buttons
- Imports and uses `AgentConfigPanel` (the v1 config panel)

### What should be removed:
- The entire file. All 931 lines are v1 terminal-parsing code. The v2 architecture replaces all of this with a standard TerminalView connected to a real tmux session.
- Still referenced by `components/AgentList.tsx` (lines 1517-1519: `showAdvancedCreateModal` renders it as a fallback) -- that reference must also be removed

### V1 code that is now dead:
- `startSession()` -- polls `/api/agents/creation-helper/session` for readiness
- `captureInitialGreeting()` -- polls `/api/agents/creation-helper/response`
- `sendUserMessage()` -- sends via `/api/agents/creation-helper/chat`
- `applySuggestions()` -- applies `json:config` blocks to in-memory config
- All response polling logic (800ms interval, idle timeout, thinking detection)
- All markdown rendering (ReactMarkdown + SyntaxHighlighter)
- All file attachment UI (3 separate upload slots for agent desc, design doc, existing profile)
- PSS profile generation buttons (create/edit/align modes)
- The entire custom chat message list UI

---

## 3. AgentCreationWizard.tsx (`components/AgentCreationWizard.tsx`) -- Simple Wizard

### Requirements say (Phase B):
- Add 5 role buttons to the simple wizard (Chief-of-Staff, Architect, Orchestrator, Integrator, Programmer)
- When a role is selected, create the agent with the corresponding role plugin pre-installed
- No need for Haephestos for predefined roles

### Current state:
- **Wizard steps implemented**: host selection, runtime selection (tmux/docker), program selection (7 options), agent name, working directory, summary, creation animation
- Steps are chat-bubble based with a robot avatar assistant
- Supports local and remote hosts, Docker containers
- Has "Advanced" button that navigates to `/agent-creation` (Haephestos v2)
- Agent creation calls `/api/sessions/create` or `/api/agents/docker/create`

### Missing (Phase B -- entirely unstarted):
- **No role selection step**: There is no wizard step for selecting one of the 5 predefined roles
- **No role plugin installation**: No code to pre-install role plugins during agent creation
- **No role plugin templates**: No `.agent.toml` templates for the 5 predefined roles
- **No auto-staffing dialog**: No dialog when a team is created with no agents

### Not missing (correct for Phase A):
- The wizard is functional for creating basic agents without roles -- this is the current scope

---

## 4. AgentConfigPanel.tsx (`components/AgentConfigPanel.tsx`) -- Config Panel

### Requirements say:
- "May be reused elsewhere (team meeting, etc.)" -- kept, not deleted
- In v2, the right panel is TomlPreviewPanel (raw TOML display), NOT AgentConfigPanel

### Current state:
- **350 lines** of structured config display: shows name, program, model, role, working directory, plus chip-based sections for skills, plugins, MCP servers, hooks, rules, tags
- Uses `AgentConfigDraft` type with structured arrays (not TOML)
- Still uses `framer-motion` for animated chip add/remove
- Has `onRemove` callback for removing items from config
- Hidden on mobile (`hidden md:block`)

### Assessment:
- This component is **no longer used by the v2 Haephestos flow**. The v2 right panel is `TomlPreviewPanel` which shows raw TOML content.
- It IS still imported by `AgentCreationHelper.tsx` (v1 legacy code)
- Once `AgentCreationHelper.tsx` is removed, this component will have no consumers
- The requirements say to keep it for potential reuse (team meeting, AgentProfilePanel), which is correct
- **The `AgentConfigDraft` type exported from this file** is also exported from `AgentCreationHelper.tsx` (line 28: `export type { AgentConfigDraft }`) -- that re-export should be removed when the v1 component is deleted

---

## 5. HaephestosLeftPanel.tsx (`components/HaephestosLeftPanel.tsx`)

### Requirements say:
- Big Haephestos avatar/face at top
- List of uploaded files with remove (x) buttons
- Compact, narrow (~80px desktop, hidden on mobile until tab pressed)
- Supports collapsed/icon-only mode

### Current state:
- **FULLY IMPLEMENTED** (107 lines)
- Avatar scales with panel width (70% of width, capped 40-160px)
- Collapsed mode when panel < 100px (icon-only)
- File list with hover-reveal remove buttons
- "Workshop" header label
- Close button for mobile
- Ring styling on avatar (amber-500/30)

### Missing:
- None -- this component matches the requirements

---

## 6. TomlPreviewPanel.tsx (`components/TomlPreviewPanel.tsx`)

### Requirements say:
- Displays raw content of `.agent.toml` file being built
- Polls the file every 5 seconds
- Monospace font, scrollable, read-only
- Shows "No profile generated yet" when file doesn't exist
- Collapsible on desktop, tab-accessible on mobile

### Current state:
- **FULLY IMPLEMENTED** (133 lines)
- Polls via `/api/agents/creation-helper/toml-preview` endpoint every 5 seconds
- TOML syntax highlighting (sections in amber, keys in blue, strings in green, booleans in orange, numbers in purple, comments in gray)
- Empty state with gear icon and helpful message
- Manual refresh button
- Close button
- Monospace `pre` tag with word wrap

### Missing:
- None -- this component matches the requirements, and the syntax highlighting exceeds them

---

## 7. creation-helper-service.ts (`services/creation-helper-service.ts`) -- V1 LEGACY

### Requirements say:
- This file (697 LOC) should be **deleted** (moved to `docs_dev/archive/`)
- Reason: "Terminal parsing no longer needed"

### Current state:
- **STILL EXISTS** at 698 lines -- NOT moved to archive
- Contains all v1 terminal parsing infrastructure

### V1 code that is now dead (all functions):

| Function | Lines | Purpose | Status |
|----------|-------|---------|--------|
| `simpleHash()` | 46-52 | Response deduplication hash | Dead -- v2 has no response polling |
| `sessionExists()` | 63-66 | Check tmux session | Dead -- v2 page manages sessions directly |
| `sourceAgentFile()` | 69-71 | Path to persona source | Dead -- v2 uses `/api/agents/creation-helper/ensure-persona` |
| `deployedAgentFile()` | 74-76 | Path to deployed persona | Dead |
| `deployAgentFile()` | 79-91 | Copy persona to .claude/agents/ | Dead -- v2 uses ensure-persona API |
| `removeAgentFile()` | 94-101 | Cleanup deployed persona | Dead |
| `sanitizeInput()` | 107-112 | Input sanitization | Dead -- v2 types directly in terminal |
| `stripAnsi()` | 115-117 | ANSI code stripping | Dead |
| `parseConfigBlocks()` | 128-212 | JSON config block extraction from terminal | Dead -- v2 uses TOML file polling |
| `detectResponseState()` | 222-389 | Terminal output state detection (thinking, complete, separator parsing) | Dead -- v2 has no output parsing |
| `createCreationHelper()` | 398-495 | Create session + register agent + launch claude | Dead -- v2 page does this itself |
| `deleteCreationHelper()` | 500-528 | Kill session + cleanup | Dead -- v2 page does this itself |
| `getCreationHelperStatus()` | 533-579 | Check if Claude is ready via capture-pane | Dead -- v2 has no readiness polling |
| `sendMessage()` | 584-624 | Send message via tmux send-keys | Dead -- v2 types directly in terminal |
| `captureResponse()` | 632-697 | Capture response via capture-pane + parse config blocks | Dead -- v2 has no response capture |

### Still referenced by:
- `app/api/agents/creation-helper/session/route.ts` (imports `createCreationHelper`, `deleteCreationHelper`, `getCreationHelperStatus`)
- `app/api/agents/creation-helper/chat/route.ts` (imports `sendMessage`)
- `app/api/agents/creation-helper/response/route.ts` (imports `captureResponse`)
- `services/headless-router.ts` (registers routes for these 3 API endpoints)

---

## 8. Haephestos Persona (`agents/haephestos-creation-helper.md`)

### Requirements say:
- Remove: Instructions to emit `json:config` blocks
- Add: Instructions to write draft `.agent.toml` to `~/.aimaestro/tmp/haephestos-draft.toml`
- Add: Instructions to update the file after each conversation turn
- Keep: PSS profiler integration
- Keep: Read-only tool restrictions
- Update: visibility setting

### Current state:
- **FULLY UPDATED for v2**
- `json:config` instructions removed
- New section "What You Output -- .agent.toml Draft File" with clear instructions to write to `~/.aimaestro/tmp/haephestos-draft.toml`
- Update protocol defined (Phase 1 -> each suggestion -> Phase 3 -> after PSS profiler)
- TOML format template included
- PSS profiler integration fully documented (3 modes: CREATE, EDIT, ALIGN)
- Agent hierarchy awareness added (Manager, CoS, Orchestrator, Team Members)
- Design document types explained
- Available skills catalog section updated
- Isolation constraints documented
- Frontmatter preserved with correct settings

### Missing:
- None -- persona is complete for v2

---

## 9. V1 API Routes (should be deleted/archived)

### Requirements say these should be deleted:
| Route | Status |
|-------|--------|
| `app/api/agents/creation-helper/session/route.ts` | **STILL EXISTS** -- uses v1 `creation-helper-service.ts` |
| `app/api/agents/creation-helper/chat/route.ts` | **STILL EXISTS** -- uses v1 `sendMessage()` |
| `app/api/agents/creation-helper/response/route.ts` | **STILL EXISTS** -- uses v1 `captureResponse()` |

### Requirements say these should be kept:
| Route | Status |
|-------|--------|
| `app/api/agents/creation-helper/file-picker/route.ts` | **EXISTS** -- reused by Upload button |
| `app/api/agents/creation-helper/toml-preview/route.ts` | **EXISTS** -- new v2 endpoint |
| `app/api/agents/creation-helper/cleanup/route.ts` | **EXISTS** -- new v2 endpoint |
| `app/api/agents/creation-helper/ensure-persona/route.ts` | **EXISTS** -- new v2 endpoint |

### Headless router:
- `services/headless-router.ts` still registers the v1 routes (session, chat, response) -- those registrations must be removed when the routes are deleted

---

## 10. Components that should exist but don't

### Per requirements section 9:
| Component | Status |
|-----------|--------|
| `components/HaephestosLayout.tsx` | **NOT CREATED** -- layout logic was inlined directly in `page.tsx` instead. This is fine architecturally; the requirement was advisory. |
| `components/HaephestosMobileLayout.tsx` | **NOT CREATED** -- mobile layout was inlined in `page.tsx` with a `isCompact` conditional. This is fine. |

These are non-issues -- the requirements listed them as separate files, but the implementation correctly chose to keep the layout in the page component, which is simpler and avoids unnecessary component fragmentation.

---

## 11. Upload Button in TerminalView (all agents benefit)

### Requirements say:
- Add `[Upload]` button to the prompt builder footer bar
- Uses existing `file-picker/route.ts` endpoint
- Upload file, insert server-side path into prompt textarea
- On mobile: icon-only; on desktop: icon + "Upload" label
- Allowed extensions: `.md`, `.txt`, `.toml`

### Current state:
- **FULLY IMPLEMENTED** in `TerminalView.tsx`
- Upload button at line 991, with icon + text on desktop, icon-only on touch
- Hidden file input at line 1057, accepts `.md,.txt,.toml`
- `handleFileUpload()` at line 677 uploads via POST, calls `onFileUploaded` callback
- Loading state with "Uploading..." text

### Missing:
- None

---

## 12. AgentList Navigation Update

### Requirements say:
- Change "Advanced Create" to navigate to `/agent-creation` instead of opening modal

### Current state:
- **IMPLEMENTED**: Line 738 shows `router.push('/agent-creation')`, and the wizard's "Advanced" button (line 1501) also navigates there
- The old `showAdvancedCreateModal` state still exists (line 171) and the old modal is still rendered (lines 1517-1519) -- this is v1 legacy that should be removed

---

## Summary: Phase A Checklist

| Task | Status |
|------|--------|
| Create `/agent-creation` page with desktop + mobile layouts | DONE |
| Create TomlPreviewPanel (polls .agent.toml every 5s) | DONE |
| Create HaephestosLeftPanel (avatar + file list) | DONE |
| Add [Upload] button to prompt builder (all agents benefit) | DONE |
| Update Haephestos persona (write .agent.toml, remove json:config) | DONE |
| Add [Cancel] and [Create Agent] action bar | DONE |
| Move old files to docs_dev/archive/ | **NOT DONE** |
| Update AgentList to navigate to /agent-creation | DONE (partial -- v1 modal reference remains) |

---

## Files to Archive (blocking Phase A completion)

These files must be moved to `docs_dev/archive/` to complete Phase A:

1. **`services/creation-helper-service.ts`** (698 LOC) -- all terminal parsing code
2. **`components/AgentCreationHelper.tsx`** (931 LOC) -- v1 custom chat UI
3. **`app/api/agents/creation-helper/session/route.ts`** -- v1 session management
4. **`app/api/agents/creation-helper/chat/route.ts`** -- v1 message relay
5. **`app/api/agents/creation-helper/response/route.ts`** -- v1 response capture
6. **`tests/services/creation-helper-service.test.ts`** -- tests for deleted service

### References to clean up when archiving:
- `components/AgentList.tsx`: Remove `showAdvancedCreateModal` state, the `AgentCreationHelper` import, and the conditional render block (lines 1517-1519)
- `services/headless-router.ts`: Remove route registrations for `/api/agents/creation-helper/session`, `/chat`, `/response`

---

## Phase B Status (Team Creation Enhancements)

| Task | Status |
|------|--------|
| Add 5 role buttons to simple wizard | NOT STARTED |
| Add auto-staffing dialog to team creation | NOT STARTED |
| Create role plugin templates (.agent.toml for each role) | NOT STARTED |

---

## Phase C Status (Kanban Workflow)

| Task | Status |
|------|--------|
| Add Feature Request column (column 0) | NOT STARTED |
| Manager-only approval for Feature Request -> TODO | NOT STARTED |
| Add Testing column (column 4) | NOT STARTED |
| Task design requirement document attachments | NOT STARTED |

---

## Phase D Status (CoS Autonomous Pipeline)

Entirely unstarted. Depends on Phase B completion.
