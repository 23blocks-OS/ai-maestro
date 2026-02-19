# Codebase Report: UI Patterns for Dialogs, Selections, and Team Management
Generated: 2026-02-16

## Summary

Explored the AI Maestro codebase to catalog all dialog/modal patterns, password input handling, team management UI, agent metadata APIs, and dropdown/select components. This report provides the patterns needed to design a governance role selector that fits naturally into the existing UI.

---

## 1. Dialog/Modal/Popup Components

The codebase uses a **consistent hand-rolled modal pattern** -- NO third-party dialog library (no Radix, Headless UI, shadcn/ui). All dialogs are custom `fixed inset-0` overlays.

### Pattern A: Simple Dialog (no animation)
**Files:** `ForwardDialog.tsx`, `TeamLoadDialog.tsx`, `TeamSaveDialog.tsx`

```
Structure:
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
      Header (border-b border-gray-700)
      Content (p-4 space-y-4)
      Footer (flex justify-end gap-2 px-5 py-3 border-t border-gray-800)
    </div>
  </div>
```

Props pattern: `{ isOpen: boolean; onClose: () => void; ... }`
Early return: `if (!isOpen) return null`

### Pattern B: Animated Dialog (framer-motion)
**Files:** `DeleteAgentDialog.tsx`, `ExportAgentDialog.tsx`, `ImportAgentDialog.tsx`, `WakeAgentDialog.tsx`

```
Structure:
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
    <motion.div initial/animate/exit (scale + opacity)>
      <AnimatePresence mode="wait"> for phase transitions
    </motion.div>
  </div>
```

Uses `framer-motion` for enter/exit animations and multi-phase transitions.
Phase state machine: `'idle' | 'packing' | 'zipping' | 'ready' | 'error'` etc.

### Pattern C: Portal-based Dialog
**Files:** `WakeAgentDialog.tsx`, `EmailAddressDialog.tsx`, `AgentSkillEditor.tsx`

```tsx
import { createPortal } from 'react-dom'
// ...
if (typeof document === 'undefined') return null
return createPortal(<div className="fixed inset-0 ...">...</div>, document.body)
```

Used when dialog is rendered from a deeply nested component (e.g., inside sidebar) and needs to escape stacking context.

### Pattern D: Full-screen Overlay
**Files:** `TaskKanbanBoard.tsx`, `SkillDetailModal.tsx`, `OrganizationSetup.tsx`

```
<div className="fixed inset-0 z-40 ...">  // z-40 for kanban, z-50 for modals
```

Full viewport overlays with scrollable content areas.

### Z-index Hierarchy (verified)
| z-index | Usage |
|---------|-------|
| z-40 | Kanban board overlay |
| z-50 | Standard dialogs (TeamLoad, TeamSave, ForwardDialog, SkillDetail) |
| z-[60] | EmailAddressDialog (portal, above sidebar) |
| z-[70] | DeleteAgentDialog, ExportAgentDialog |
| z-9998/9999 | WakeAgentDialog (uses inline style, portal, above everything) |

### Common Dialog Styling
- **Backdrop:** `bg-black/50` to `bg-black/70`, often with `backdrop-blur-sm`
- **Card:** `bg-gray-900` (or `bg-gray-800`), `border border-gray-700/800`, `rounded-xl` or `rounded-lg`
- **Header:** Icon in colored bg circle + title + subtitle, X close button right-aligned
- **Close button:** `<X className="w-5 h-5" />` with hover state
- **Primary button colors:** `bg-emerald-600 hover:bg-emerald-500` (save/confirm), `bg-blue-600 hover:bg-blue-500` (action), `bg-red-600` (destructive)
- **Cancel button:** `text-gray-400 hover:text-gray-300` (text-only, no bg)

---

## 2. Password Input Handling

### Locations
1. **`components/companion/VoiceControls.tsx`** (lines 214, 228) -- API key inputs
   ```tsx
   <input type="password" value={config.openaiApiKey || ''} onChange={...}
     placeholder="sk-..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm..." />
   ```

2. **`components/AgentList.tsx`** (line 2378) -- GitHub token input in advanced agent creation
   ```tsx
   <input id="adv-github-token" type="password" value={githubToken} onChange={...}
     placeholder="ghp_..." className="..." />
   ```

3. **`app/api/governance/password/route.ts`** -- Server-side password set/verify API
   - POST with `{ password, currentPassword }` body
   - Uses `bcryptjs` with 12 salt rounds
   - Min 6 characters validation

4. **`app/api/governance/manager/route.ts`** -- Requires governance password to set manager
   - POST with `{ agentId, password }` body

### Password Input Styling Pattern
```
type="password"
className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200
           placeholder-gray-500 focus:outline-none focus:border-emerald-500"
```

**NOTE:** There is NO password input in the UI for the governance password itself. The governance password API exists but has no corresponding frontend component yet. The password is set/verified only via API calls. This is a gap that would need to be filled for a governance role selector.

---

## 3. Team Meeting Page (`app/team-meeting/`)

### Page Structure (`app/team-meeting/page.tsx`)
- Uses `useSearchParams` to determine view:
  - No params -> `MeetingLobby` (team selection, create new meeting)
  - `?meeting=<id>` -> `MeetingRoom` (active meeting with terminals)
  - `?team=<id>` -> Pre-load team into meeting

### Key Components
| Component | Path | Purpose |
|-----------|------|---------|
| `MeetingLobby.tsx` | `components/team-meeting/` | Select agents, load teams, start meeting |
| `MeetingRoom.tsx` | `components/team-meeting/` | Active meeting: terminals, chat, tasks |
| `MeetingHeader.tsx` | `components/team-meeting/` | Meeting controls, kanban toggle |
| `MeetingSidebar.tsx` | `components/team-meeting/` | Agent list during meeting |
| `MeetingTerminalArea.tsx` | `components/team-meeting/` | Terminal grid |
| `AgentPicker.tsx` | `components/team-meeting/` | Grid of agents with search, multi-select |
| `TaskKanbanBoard.tsx` | `components/team-meeting/` | Full-screen kanban overlay |
| `TeamLoadDialog.tsx` | `components/team-meeting/` | Load saved team into meeting |
| `TeamSaveDialog.tsx` | `components/team-meeting/` | Save current agent selection as team |

### State Machine (in `types/team.ts`)
```
MeetingPhase: 'idle' -> 'selecting' -> 'ringing' -> 'active'
```

Managed by `useReducer` with `TeamMeetingAction` union type (19 action types).

---

## 4. Teams Page (`app/teams/`)

### Teams List Page (`app/teams/page.tsx`)
- Fetches `/api/teams` on mount
- Enriches with task/doc counts per team (parallel fetches)
- Shows `TeamListCard` for each team in a grid
- Inline team creation: text input + button (no modal)
- Delete: `deleteConfirm` state triggers inline confirmation (not a separate dialog)

### Team Dashboard Page (`app/teams/[id]/page.tsx`)
- Tab-based sidebar: `TeamDashboardSidebar` with tabs: overview, tasks, kanban, documents, instructions
- Sections: `TeamOverviewSection`, `TeamTasksSection`, `TeamKanbanSection`, `TeamDocumentsSection`, `TeamInstructionsSection`

### Team Type (from `types/team.ts`)
```typescript
interface Team {
  id: string              // UUID
  name: string
  description?: string
  agentIds: string[]      // Agent UUIDs
  instructions?: string   // Team-level markdown
  type?: TeamType         // 'open' | 'closed'
  chiefOfStaffId?: string // Agent UUID (only for closed teams)
  createdAt: string
  updatedAt: string
  lastMeetingAt?: string
  lastActivityAt?: string
}
```

### TeamOverviewSection Agent Roster
- Shows team agents in a list with avatars
- "Add Agent" button opens an inline dropdown (not a dialog) listing available agents
- Remove agent via trash icon on hover (opacity-0 -> opacity-100 on group-hover)
- No role column or badge currently displayed for agents

### TeamListCard
- Card with team name, agent count, task count, doc count, last activity
- "Start Meeting" button, delete button (opacity on hover)
- Click card navigates to `/teams/[id]`

---

## 5. Agent Metadata API Routes

### `/api/agents/[id]` (route.ts)
- **GET** - Fetch agent by ID
- **PATCH** - Update agent (uses `UpdateAgentRequest` type)
- **DELETE** - Soft delete (or hard with `?hard=true`)

### `UpdateAgentRequest` Fields (from `types/agent.ts`)
```typescript
interface UpdateAgentRequest {
  name?: string
  label?: string
  avatar?: string
  model?: string
  taskDescription?: string
  programArgs?: string
  tags?: string[]
  owner?: string
  team?: string
  workingDirectory?: string
  documentation?: Partial<AgentDocumentation>
  metadata?: Record<string, any>
  preferences?: Partial<AgentPreferences>
}
```

**IMPORTANT:** There is NO `governanceRole` or `role` field in the Agent type or UpdateAgentRequest. The governance role concept is currently external to the agent -- it's stored in:
- `governance.json` for the MANAGER role (singleton `managerId`)
- `Team.chiefOfStaffId` for COS role (per-team)

### Governance API Routes
| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/governance` | GET | Check if password/manager set | None |
| `/api/governance/password` | POST | Set/change governance password | Current password (if exists) |
| `/api/governance/manager` | POST | Set/remove manager agent | Governance password |
| `/api/teams/[id]/chief-of-staff` | POST | Set/remove COS for closed team | Governance password |

### Governance Library (`lib/governance.ts`)
Key functions:
- `loadGovernance()` / `saveGovernance()` - File-based CRUD at `~/.aimaestro/governance.json`
- `setPassword()` / `verifyPassword()` - bcrypt password management
- `getManagerId()` / `setManager()` / `removeManager()` - Singleton manager
- `isManager(agentId)` - Check if agent is the manager
- `isChiefOfStaff(agentId, teamId)` - Check COS for specific team
- `isChiefOfStaffAnywhere(agentId)` - Check COS across all closed teams
- `getClosedTeamForAgent(agentId)` - Find agent's closed team

### Governance Types (`types/governance.ts`)
```typescript
type TeamType = 'open' | 'closed'

interface GovernanceConfig {
  version: 1
  passwordHash: string | null
  passwordSetAt: string | null
  managerId: string | null
}
```

**NOTE:** There is NO `GovernanceRole` type defined anywhere. No `WORKER`, `CHIEF_OF_STAFF`, `MANAGER` enum exists. These roles are implicit from the data model (managerId in governance.json, chiefOfStaffId in team).

---

## 6. Dropdown/Select/Popover Components

### Native `<select>` (Most Common Pattern)
**Files:** `ForwardDialog.tsx`, `TaskCreateForm.tsx`, `DependencyPicker.tsx`, `TaskDetailView.tsx`, `AgentSearch.tsx`, `AgentGraph.tsx`, `SkillBrowser.tsx`, `AgentSubconsciousIndicator.tsx`, `SubconsciousStatus.tsx`, `SkillsSection.tsx`, `GraphVisualization.tsx`

Standard styling:
```tsx
<select
  value={value}
  onChange={e => setValue(e.target.value)}
  className="w-full text-sm bg-gray-800/60 text-gray-300 rounded-lg px-3 py-2
             focus:outline-none focus:ring-1 focus:ring-emerald-600
             border border-gray-700 appearance-none cursor-pointer"
>
  <option value="">Select...</option>
  {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
</select>
```

### Custom Dropdown (Inline Toggle)
**Files:** `TeamOverviewSection.tsx` (agent add dropdown), `EmailAddressDialog.tsx` (domain dropdown)

Pattern: Toggle `showDropdown` boolean, render a positioned `<div>` list:
```tsx
{showDropdown && (
  <div className="mb-3 bg-gray-800 border border-gray-700 rounded-lg p-2 max-h-48 overflow-y-auto">
    {items.map(item => (
      <button onClick={() => handleSelect(item.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700">
        {item.name}
      </button>
    ))}
  </div>
)}
```

### Radio-button Style Selector
**Files:** `WakeAgentDialog.tsx` (CLI options), `AgentCreationWizard.tsx`

Pattern: List of clickable cards with selected state:
```tsx
{OPTIONS.map(option => (
  <button
    onClick={() => setSelected(option.id)}
    className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all ${
      isSelected
        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
        : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600'
    }`}
  >
    <Icon />
    <div><name/><description/></div>
  </button>
))}
```

### Multi-select Grid (AgentPicker)
**File:** `components/team-meeting/AgentPicker.tsx`

Grid of agent cards with checkmark overlay, search bar at top:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
  {agents.map(agent => (
    <div onClick={() => onToggleAgent(agent.id)}
      className={isSelected ? 'bg-emerald-500/20 border-2 border-emerald-500' : 'bg-gray-800/60 border-2 border-transparent'}
    >
      <Check /> indicator, Avatar, Name
    </div>
  ))}
</div>
```

### Tag-based Multi-select (DependencyPicker)
**File:** `components/team-meeting/DependencyPicker.tsx`

Selected items shown as tags with X remove buttons, then a `<select>` dropdown to add more.

---

## Architecture Summary for Governance Role Selector Design

### What Exists
1. Governance backend: password, manager, COS APIs and lib functions
2. Team types: open/closed with chiefOfStaffId
3. Agent type: No governance role field

### What Does NOT Exist Yet
1. No `GovernanceRole` enum/type
2. No UI for setting/displaying governance roles
3. No password input component for governance operations
4. No role badges/indicators on agent cards or lists
5. No UI for the governance password (set/change/verify)

### Recommended Patterns for a Governance Role Selector
Based on the existing patterns, a role selector would best fit as:

1. **For a simple role dropdown:** Use the native `<select>` pattern (most common, consistent with TaskCreateForm assignee selector and ForwardDialog agent selector)

2. **For a richer role selector:** Use the radio-button card pattern (like WakeAgentDialog CLI options) with icons for each role (WORKER, CHIEF_OF_STAFF, MANAGER)

3. **For password-gated operations:** Show an inline password field within the dialog before allowing the role change (pattern exists in API but not UI -- would be new)

4. **Dialog container:** Use Pattern A (simple dialog, no animation) for consistency with team-related dialogs, or Pattern C (portal) if rendered from within AgentProfile sidebar

5. **Role badges on agent lists:** Small colored badge next to agent name (pattern similar to online/offline status indicator in TeamOverviewSection agent roster)

## Key Files
| File | Purpose |
|------|---------|
| `/Users/emanuelesabetta/ai-maestro/types/governance.ts` | GovernanceConfig type, TeamType |
| `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` | Password, manager, COS functions |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts` | GET governance status |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts` | Set/change password |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts` | Set/remove manager |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` | Set/remove COS |
| `/Users/emanuelesabetta/ai-maestro/types/agent.ts` | Agent type (no role field) |
| `/Users/emanuelesabetta/ai-maestro/types/team.ts` | Team type with chiefOfStaffId |
| `/Users/emanuelesabetta/ai-maestro/components/DeleteAgentDialog.tsx` | Animated dialog pattern |
| `/Users/emanuelesabetta/ai-maestro/components/ForwardDialog.tsx` | Simple dialog + select pattern |
| `/Users/emanuelesabetta/ai-maestro/components/WakeAgentDialog.tsx` | Portal + radio selector pattern |
| `/Users/emanuelesabetta/ai-maestro/components/team-meeting/TaskCreateForm.tsx` | Native select for agent assignment |
| `/Users/emanuelesabetta/ai-maestro/components/team-meeting/DependencyPicker.tsx` | Tag multi-select pattern |
| `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx` | Inline dropdown + agent roster |
| `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx` | Agent profile sidebar (where role could be displayed) |
