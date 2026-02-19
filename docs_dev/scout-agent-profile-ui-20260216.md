# Scout Report: Agent Profile/Detail Panel UI Architecture
Generated: 2026-02-16T11:51:00Z

## Summary

The agent profile panel is a **right-side sliding panel** (not a modal/dialog) implemented in `AgentProfile.tsx` (1256 lines). It supports inline editing of all agent fields and saves via PATCH to `/api/agents/[id]`. Team assignment is a **free-text field** -- there is NO team picker/dropdown. The `role` field exists only on `AgentSession` (marked "Future") and is NOT exposed in any UI. Teams are a separate entity (`Team`) that track membership via `agentIds[]` on the team side, completely independent from the agent's `team` string field.

---

## Q1: Agent Profile Panel Component

### Location
- **Primary component**: `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx` (1256 lines)
- **Zoom view variant**: `/Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx` (1002 lines)

### How It Opens
- In `/Users/emanuelesabetta/ai-maestro/app/page.tsx`:
  - State: `isProfileOpen`, `profileAgent`, `profileScrollToDangerZone`
  - `handleShowAgentProfile(agent)` sets the agent + opens panel (line 369)
  - `handleShowAgentProfileDangerZone(agent)` opens panel scrolled to danger zone (line 377)
  - AgentProfile is lazy-loaded via `dynamic(() => import(...))` (line 55)
  - Rendered at line 1025 with props: `isOpen`, `onClose`, `agentId`, `sessionStatus`, `onStartSession`, `onDeleteAgent`, `scrollToDangerZone`, `hostUrl`

### Panel Structure (Collapsible Sections)
The panel uses collapsible sections tracked via `expandedSections` state:

| Section | Key | Default | What it shows |
|---------|-----|---------|---------------|
| Session Status | (always visible) | - | Online/offline badge, start session button |
| Identity | `identity` | open | Avatar (clickable), Agent Name, Display Label, Owner, Team |
| Work Configuration | `work` | open | Program, Model, Task Description, Program Args, Tags (sidebar org) |
| Deployment | `deployment` | open | Local vs Cloud badge, instance details |
| Email Addresses | `email` | closed | EmailAddressesSection component |
| Git Repositories | `repositories` | closed | Lazy-loaded repo list with detect button |
| Long-Term Memory | `memory` | closed | MemoryViewer component |
| Skills | `installedSkills` | closed | AgentSkillEditor component |
| Skill Settings | `skillSettings` | closed | SkillsSection component |
| Metrics | `metrics` | open | 6 MetricCard tiles (messages, tasks, uptime, etc.) |
| Documentation | `documentation` | closed | Description, Runbook URL, Wiki URL, Notes |
| Danger Zone | `dangerZone` | closed | Delete agent button (red themed) |

### Editable Fields
All fields use the internal `EditableField` component (line 1145-1214):
- Click-to-edit pattern (text becomes input/textarea on click)
- On blur, calls `onChange` if value changed
- Changes tracked via `hasChanges` flag
- **Save is manual** -- user clicks "Save" button in header
- Saves via `PATCH /api/agents/{id}` (line 189)

### Fields Sent on Save (line 192-204)
```
name, label, avatar, owner, team, model, taskDescription, programArgs, tags, documentation, metadata
```

---

## Q2: Team Assignment in UI

### Agent Profile Side (FREE TEXT)
- **Location**: `AgentProfile.tsx` lines 476-482, `AgentProfileTab.tsx` lines 358-362
- Team is rendered as an `EditableField` with:
  - Label: "Team"
  - Icon: `Building2`
  - Placeholder: "Team name"
  - **Free text input** -- no dropdown, no picker, no autocomplete
  - Updates agent state locally, saved with the Save button
  - Saved via PATCH as `{ team: "string" }`

### Team Entity Side (SEPARATE SYSTEM)
- Teams are a completely separate entity stored in `~/.aimaestro/teams/teams.json`
- Team type (`/Users/emanuelesabetta/ai-maestro/types/team.ts` line 13):
  ```typescript
  interface Team {
    id: string
    name: string
    description?: string
    agentIds: string[]      // Agent UUIDs - THIS is the membership list
    instructions?: string
    type?: TeamType         // 'open' | 'closed'
    chiefOfStaffId?: string
    createdAt: string
    updatedAt: string
    lastMeetingAt?: string
    lastActivityAt?: string
  }
  ```
- Team membership is managed via `agentIds[]` on the Team object
- **Adding/removing agents from teams** happens in:
  - `TeamOverviewSection.tsx` (lines 40-49): `handleRemoveAgent` and `handleAddAgent` update `team.agentIds` via `PUT /api/teams/[id]`
  - Shows a dropdown of available agents when clicking "+ Add Agent"
  - Remove button (trash icon) appears on hover next to each team member

### KEY FINDING: Two Independent Team Systems
1. **Agent.team** (string) -- A free-text label on the agent profile. Not linked to any Team entity.
2. **Team.agentIds** (string[]) -- The actual membership list in the Team entity.
3. These two are **NOT synchronized**. An agent can have `team: "Backend"` but not be in any Team entity, or be in a Team entity but have a blank `team` field.

---

## Q3: Dialog/Modal/Popup Patterns

### Pattern 1: Full-Screen Overlay Modal (Primary pattern)
Used by: `DeleteAgentDialog`, `TransferAgentDialog`, `ExportAgentDialog`, `WakeAgentDialog`, `EmailAddressDialog`, `TeamLoadDialog`, `TeamSaveDialog`, `SkillDetailModal`

**Structure:**
```tsx
// Outer: fixed full-screen backdrop
<div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
  // Inner: centered card with framer-motion animation
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="bg-gray-900 border border-{color}/30 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
  >
    {/* Header with icon + title + close button */}
    {/* Content */}
    {/* Footer with Cancel + Action buttons */}
  </motion.div>
</div>
```

**Z-index convention:**
- Backdrop for mobile agent sidebar: `z-40`
- Profile panel: `z-50`
- Inline dialogs (tag add): `z-[60]`
- Modal dialogs: `z-[70]`

**Key dialog files:**
- `/Users/emanuelesabetta/ai-maestro/components/DeleteAgentDialog.tsx` (415 lines) -- Multi-phase (confirm/deleting/done) with framer-motion AnimatePresence
- `/Users/emanuelesabetta/ai-maestro/components/TransferAgentDialog.tsx` (484 lines)
- `/Users/emanuelesabetta/ai-maestro/components/ExportAgentDialog.tsx`
- `/Users/emanuelesabetta/ai-maestro/components/WakeAgentDialog.tsx` -- Uses `createPortal` for rendering
- `/Users/emanuelesabetta/ai-maestro/components/EmailAddressDialog.tsx`
- `/Users/emanuelesabetta/ai-maestro/components/ForwardDialog.tsx`
- `/Users/emanuelesabetta/ai-maestro/components/team-meeting/TeamLoadDialog.tsx`
- `/Users/emanuelesabetta/ai-maestro/components/team-meeting/TeamSaveDialog.tsx`
- `/Users/emanuelesabetta/ai-maestro/components/marketplace/SkillDetailModal.tsx`

### Pattern 2: Inline Popup (Mini-dialog)
Used by: Tag Add dialog in AgentProfile (line 1029-1082)

```tsx
{showTagDialog && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
      {/* Content without framer-motion */}
    </div>
  </div>
)}
```

### Pattern 3: Right Slide Panel
Used by: `AgentProfile.tsx` itself

```tsx
<div className={`fixed inset-y-0 right-0 w-full md:w-[480px] bg-gray-900 border-l border-gray-800 shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out ${
  isOpen ? 'translate-x-0' : 'translate-x-full'
}`}>
```

### Pattern 4: Full-Screen Overlay (Kanban/Picker)
Used by: `TaskKanbanBoard.tsx`, `AgentPicker.tsx`

```tsx
<div className="fixed inset-0 z-40 ...">
  {/* Full-screen content */}
</div>
```

### Dialog Props Convention
Most dialogs follow this interface pattern:
```typescript
interface XxxDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm?: () => Promise<void>  // or onXxxComplete
  agentId: string
  agentAlias: string
  agentDisplayName?: string
}
```

---

## Q4: Agent Detail/Edit API Routes

### GET /api/agents/[id]
- **File**: `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts` (line 9)
- Returns `{ agent }` from `getAgent(id)` (agent-registry)

### PATCH /api/agents/[id]
- **File**: `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts` (line 31)
- Accepts `UpdateAgentRequest` body
- Calls `updateAgent(id, body)` from agent-registry
- Validates: agent exists, not soft-deleted (410 for deleted agents)
- Returns updated `{ agent }`

### DELETE /api/agents/[id]
- **File**: `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts` (line 66)
- Soft-delete by default, `?hard=true` for permanent
- Validates: prevents double soft-delete

### UpdateAgentRequest Type
- **File**: `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (line 450)
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
  // DEPRECATED
  alias?: string
  displayName?: string
}
```

### updateAgent() in Registry
- **File**: `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` (line 461)
- Normalizes name to lowercase
- Checks name uniqueness per host
- Renames tmux session if name changes
- Normalizes tags
- Merges documentation, metadata, preferences
- Saves to registry.json and invalidates cache

---

## Q5: Role Information in Agent Registry

### Agent Interface
- **File**: `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (line 152)
- The `Agent` interface has **NO `role` field** at the top level
- `role` exists ONLY on `AgentSession` (line 143):
  ```typescript
  interface AgentSession {
    index: number
    status: 'online' | 'offline'
    workingDirectory?: string
    role?: string                  // Future: "coordinator", "backend", "frontend"
    createdAt?: string
    lastActive?: string
  }
  ```
- The `role` field is marked as "Future" and is NOT used anywhere in the codebase
- It is NOT in `UpdateAgentRequest`
- It is NOT displayed in any UI component

### What Exists Instead of Role
- `taskDescription: string` -- describes what the agent works on (free text)
- `tags?: string[]` -- used for sidebar organization (folder/subfolder)
- `team?: string` -- free-text team label
- `capabilities?: string[]` -- technical capabilities (not shown in profile UI)

---

## Q6: Team Membership Display

### On Agent Profile
- Only a free-text "Team" field under the Identity section (AgentProfile.tsx line 476-482)
- No visual link to actual Team entities
- No list of teams the agent belongs to
- No "join team" or "leave team" buttons

### On Team Dashboard
- Teams are managed from the sidebar Team view and Team Dashboard:
  - `/Users/emanuelesabetta/ai-maestro/components/sidebar/TeamCard.tsx` -- Shows team card with member avatars
  - `/Users/emanuelesabetta/ai-maestro/components/sidebar/TeamListView.tsx` -- Lists all teams
  - `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx` -- Full team management with add/remove agents
- Team membership is displayed as agent avatar circles on TeamCard
- Adding agents: "+ Add Agent" button shows dropdown of available agents
- Removing agents: Trash icon appears on hover next to each member

### Teams API
- `GET /api/teams` -- List all teams
- `POST /api/teams` -- Create team with `{ name, description, agentIds, type, chiefOfStaffId }`
- `GET /api/teams/[id]` -- Get team (with ACL check)
- `PUT /api/teams/[id]` -- Update team (name, description, agentIds, instructions, type, chiefOfStaffId)
- `DELETE /api/teams/[id]` -- Delete team

---

## Architecture Map

```
app/page.tsx
  |-- state: isProfileOpen, profileAgent, profileScrollToDangerZone
  |-- handleShowAgentProfile() / handleShowAgentProfileDangerZone()
  |
  +-- <AgentList>
  |     |-- onShowAgentProfile callback (triggers profile open)
  |     +-- onShowAgentProfileDangerZone callback
  |
  +-- <AgentProfile>  (sliding panel, z-50)
        |-- Fetches GET /api/agents/{id}
        |-- EditableField components for inline editing
        |-- handleSave() -> PATCH /api/agents/{id}
        |
        +-- <DeleteAgentDialog>       (modal, z-70)
        +-- <TransferAgentDialog>     (modal, z-70)
        +-- <ExportAgentDialog>       (modal, z-70)
        +-- <AvatarPicker>            (modal)
        +-- Tag Add dialog            (inline popup, z-60)
```

## Key Files

| File | Path | Purpose |
|------|------|---------|
| AgentProfile.tsx | `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx` | Main agent profile sliding panel (1256 lines) |
| AgentProfileTab.tsx | `/Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx` | Zoom view variant of profile (1002 lines) |
| Agent type | `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (line 152) | Agent interface with all fields |
| UpdateAgentRequest | `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (line 450) | PATCH request type |
| Agent API route | `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts` | GET/PATCH/DELETE for agents (97 lines) |
| agent-registry.ts | `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` | Registry with updateAgent() at line 461 |
| Team type | `/Users/emanuelesabetta/ai-maestro/types/team.ts` (line 13) | Team interface with agentIds[] |
| Teams API | `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` | GET/POST for teams |
| Teams [id] API | `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` | GET/PUT/DELETE for single team |
| TeamOverviewSection | `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx` | Team member add/remove UI |
| DeleteAgentDialog | `/Users/emanuelesabetta/ai-maestro/components/DeleteAgentDialog.tsx` | Delete confirmation dialog pattern (415 lines) |
| TransferAgentDialog | `/Users/emanuelesabetta/ai-maestro/components/TransferAgentDialog.tsx` | Transfer dialog pattern (484 lines) |
| WakeAgentDialog | `/Users/emanuelesabetta/ai-maestro/components/WakeAgentDialog.tsx` | Wake dialog using createPortal |

## Open Questions
- The agent's `team` string field and the Team entity's `agentIds[]` are not linked -- is this intentional or a gap to be addressed?
- The `role` field on AgentSession is marked "Future" -- is there a plan to add agent-level roles?
- The agent profile has no visibility into which Team entities the agent belongs to -- would a "Teams" section showing team memberships be useful?
