# Governance UI Audit Report
Generated: 2026-02-16

## Summary

Comprehensive audit of 10 governance-related UI components across the AI Maestro dashboard. The governance system implements a 3-tier role hierarchy (Manager > Chief-of-Staff > Normal), team membership with open/closed team types, messaging isolation via reachability filtering, and a transfer request workflow for closed teams. Overall the implementation is solid, but there are several missing validations, edge cases, and potential issues documented below.

---

## 1. RoleAssignmentDialog.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx`
**Lines:** 367

### Key UI States and Flows

- **Phase state machine:** `select` -> `password` -> `submitting` -> `done` (or `error`)
- **Role selection:** 3 radio-card options: `normal`, `chief-of-staff`, `manager`
- **COS team selection:** When `chief-of-staff` is selected, shows checkboxes for all closed teams. Agent can be COS of multiple teams.
- **Manager singleton warning:** If manager is already assigned to a different agent, shows amber warning that reassigning will remove the current manager.
- **Password gate:** Before executing any role change, transitions to `GovernancePasswordDialog` (mode: `confirm` if password exists, `setup` if not).

### Transition Logic (lines 113-169)

The `handleRoleChange()` function handles all 6 possible transitions:
- normal -> manager: Directly assigns manager
- normal -> COS: Assigns COS to selected teams
- manager -> normal: Removes manager assignment (null)
- manager -> COS: Removes manager first, then assigns COS
- COS -> normal: Removes COS from all current COS teams
- COS -> manager: Removes COS from all teams first, then assigns manager
- COS -> COS (different teams): Removes COS from deselected teams, assigns to newly selected teams

### Validation Present

- **Confirm button disabled** when: no change from current role, or COS selected but 0 teams checked (line 91-103)
- **Team comparison** for COS: sorts both arrays and compares JSON strings (line 96-98)
- Password required before any change executes

### Edge Cases NOT Handled

1. **No "done" phase rendering:** The phase type includes `'done'` but there is no rendering branch for it. After success, `onRoleChanged()` and `onClose()` are called immediately (line 163-164), so the dialog closes. Not a bug per se, but the `done` phase value is dead code.
2. **COS reassignment collision:** If two people simultaneously assign themselves COS of the same team, the last write wins. No optimistic concurrency check.
3. **Existing COS display is weak:** Line 272 shows `(current COS: ${team.chiefOfStaffId})` which displays a raw UUID, not a human-readable name. Should resolve to agent name.
4. **No loading state for closed teams list:** If `governance.allTeams` is still loading, the closed teams list could be empty, misleading the user into thinking no closed teams exist.
5. **Multiple sequential API calls for COS:** When assigning COS to multiple teams (line 156-159), each call is sequential. If one fails mid-way, the agent ends up partially assigned. No rollback mechanism.
6. **Nested overlay z-index:** Dialog uses `z-[70]`. When it transitions to GovernancePasswordDialog (also `z-[70]`), the RoleAssignmentDialog returns `null` during password phase, so no overlap issue. But the z-index of 70 is hardcoded and could conflict with other modals.

---

## 2. TeamMembershipSection.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx`
**Lines:** 273

### Key UI States and Flows

- **Team list:** Shows all teams the agent belongs to, with lock/unlock icons for closed/open type
- **COS badge:** Shows "COS" badge on closed teams where this agent is chief-of-staff (line 188)
- **Join Team dropdown:** Filters joinable teams based on role:
  - Manager/COS: can join any team (including closed)
  - Normal agents: can only join non-closed teams (line 53-59)
- **Transfer workflow:** When a normal agent in a closed team tries to join another team, it creates a transfer request instead of directly joining (lines 76-91)
- **Transfer resolution:** COS of the source team can approve/reject pending transfers inline (lines 221-244)

### Validation Present

- **Role-based join filtering:** Normal agents cannot see closed teams in the join dropdown
- **Transfer request creation:** Only triggered when agent is in a closed team AND is not a manager AND the closed team has a COS that is not the agent itself (line 77-80)
- **Click-outside dropdown close:** Properly implemented with useEffect + mousedown listener

### Edge Cases NOT Handled

1. **Only first closed team used as transfer source:** Line 82 uses `closedSourceTeams[0]` -- if an agent is in multiple closed teams, only the first is used as the source. The user has no way to choose which closed team to transfer from.
2. **Leave from closed team:** The leave button (line 193-199) calls `onLeaveTeam` directly with no transfer request or COS approval required. A normal agent can leave a closed team without COS approval, which may violate governance policy.
3. **No confirmation for leaving teams:** Clicking the X button immediately removes the agent. No "Are you sure?" dialog.
4. **Transfer request deduplication:** No check for an existing pending transfer for the same agent/source/destination. User could create duplicate transfer requests by clicking quickly.
5. **COS approving own transfer:** The `canResolve` check (line 213) only checks if the agent is the source team's COS. If the COS is the one being transferred, they can approve their own transfer.
6. **Info message persistence:** The `infoMessage` about pending transfer (line 258) has a manual dismiss button but no auto-timeout. It persists until the user clicks X or the component re-renders.

---

## 3. GovernancePasswordDialog.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx`
**Lines:** 195

### Key UI States and Flows

- **Two modes:**
  - `setup` mode: Two fields (password + confirm). Calls `/api/governance/password` to set the password, then passes it to `onPasswordConfirmed`.
  - `confirm` mode: Single field. Passes password directly to `onPasswordConfirmed` without server validation. The caller (RoleAssignmentDialog) is responsible for using the password in subsequent API calls that validate it server-side.
- **Enter key support:** Both fields support Enter to submit

### Validation Present

- **Minimum length:** 6 characters (line 39)
- **Password match:** Setup mode validates passwords match (line 44)
- **Submit button disabled** when: submitting, empty password, or (in setup mode) empty confirm / mismatch / too short (line 78-81)
- **Cannot close while submitting** (line 26)
- **State reset on close** (lines 29-31)

### Edge Cases NOT Handled

1. **Confirm mode has NO client-side validation:** In confirm mode, the password is passed directly to the callback without any length or format check (line 72-73). This means a user could submit a single character as password -- it will fail server-side but there is no client-side feedback before the API call.
2. **No rate limiting:** No protection against brute-force attempts on the confirm dialog. A user (or malicious script) could try many passwords rapidly.
3. **No password strength indicator:** Beyond the 6-character minimum, there is no feedback about password strength.
4. **Setup mode calls API AND passes to callback:** In setup mode (line 52-61), the component calls the password API itself AND then calls `onPasswordConfirmed`. This means the password is set server-side before the role change API call. If the subsequent role change fails, the password is still set -- which is probably fine, but it is a subtle coupling.
5. **Error display from API is raw text:** Line 58-59 uses `await res.text()` which could include HTML error pages in production, not just clean error messages.

---

## 4. RoleBadge.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx`
**Lines:** 61

### Key UI States

- **Three badge types:**
  - `manager`: Amber/gold with Crown icon, text "MANAGER"
  - `chief-of-staff`: Indigo with Shield icon, text "CHIEF-OF-STAFF"
  - `normal`: Dashed gray border with Plus icon, text "Assign Role" (only shown if `onClick` is provided; otherwise returns `null`)
- **Two sizes:** `sm` (text-xs, px-2 py-0.5) and `md` (text-sm, px-3 py-1)
- **Clickable:** All badges are `<button>` elements. If no `onClick` is provided, they use `cursor-default`.

### Validation Present

- Normal role badge hidden when no onClick handler (line 49) -- prevents showing empty badge for non-privileged viewers

### Edge Cases NOT Handled

1. **Using `<button>` without onClick:** When `onClick` is undefined, the badge still renders as a `<button>` for manager/COS roles. This is semantically wrong -- a non-interactive element should be a `<span>` or `<div>`. It also means the button has no click handler but is still focusable/tabbable.
2. **No aria-label:** The badges lack accessibility labels describing the role.

---

## 5. hooks/useGovernance.ts

**Path:** `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts`
**Lines:** 267

### Mutations Available

| Mutation | API Endpoint | Method |
|----------|-------------|--------|
| `setPassword` | `/api/governance/password` | POST |
| `assignManager` | `/api/governance/manager` | POST |
| `assignCOS` | `/api/teams/{id}/chief-of-staff` | POST |
| `addAgentToTeam` | GET `/api/teams/{id}` then PUT `/api/teams/{id}` | GET+PUT |
| `removeAgentFromTeam` | GET `/api/teams/{id}` then PUT `/api/teams/{id}` | GET+PUT |
| `requestTransfer` | `/api/governance/transfers` | POST |
| `resolveTransfer` | `/api/governance/transfers/{id}/resolve` | POST |

### How State is Fetched

- **On mount and agentId change:** Parallel fetch of 3 endpoints:
  1. `/api/governance` -- governance config (hasPassword, hasManager, managerId, managerName)
  2. `/api/teams` -- all teams list
  3. `/api/governance/transfers?status=pending` -- pending transfer requests
- **Derived state:**
  - `agentRole`: computed from `managerId === agentId` -> manager, else check if any closed team has `chiefOfStaffId === agentId` -> chief-of-staff, else normal
  - `cosTeams`: closed teams where agent is COS
  - `memberTeams`: teams where `agentIds` includes this agent

### Validation Present

- **Duplicate agent check in addAgentToTeam** (line 162): checks `team.agentIds.includes(targetAgentId)` before adding -- if already present, uses existing array unchanged. This prevents duplicate agents.
- **Error wrapping:** All mutations return `{ success: boolean; error?: string }` for consistent error handling
- **Refresh after mutations:** Every successful mutation calls `refresh()` to re-fetch state

### Edge Cases NOT Handled

1. **Race condition in addAgentToTeam/removeAgentFromTeam:** These do GET then PUT. Between the GET and PUT, another user could have modified the team. The PUT sends the full `agentIds` array, which would overwrite concurrent changes.
2. **No optimistic updates:** All state changes wait for API + refresh, causing UI lag. The refresh is a full 3-endpoint fetch.
3. **COS detection only for closed teams:** Line 43-45 checks `t.type === 'closed' && t.chiefOfStaffId === agentId`. If a team type changes from closed to open while agent is COS, the badge disappears but the server-side COS assignment may still exist.
4. **Transfer requests fetched globally:** Line 66 fetches ALL pending transfers, not just those relevant to this agent. Filtering happens in TeamMembershipSection.

---

## 6. app/teams/page.tsx (Teams List Page)

**Path:** `/Users/emanuelesabetta/ai-maestro/app/teams/page.tsx`
**Lines:** 257

### Create Team Flow

1. Click "Create Team" button -> shows inline dialog with single text input
2. Enter team name, click Create or press Enter
3. POST to `/api/teams` with `{ name, agentIds: [] }`
4. On success, redirects to `/teams/{id}`

### Validation Present

- **Empty name check:** Button disabled when `!newTeamName.trim()` (line 200)
- **Error display:** API errors shown inline below the input (line 189)
- **Escape to cancel:** Keyboard handler on Escape (line 186)

### Duplicate Prevention: NONE

- **No client-side duplicate check:** Does not check if a team with the same name already exists before POST
- **No server-side duplicate check:** The POST handler in `/api/teams/route.ts` (verified) only validates name is a non-empty string and agentIds is an array. No uniqueness check on team name.
- **RESULT:** Users can create multiple teams with identical names. This is a clear gap.

### Edge Cases NOT Handled

1. **No team type selection:** Create dialog only collects name. There is no way to choose open/closed type at creation time. All teams are created as default (open).
2. **No description field:** Create dialog has no description input. Must be added after creation via team detail page.
3. **Delete has no loading state:** `handleDelete` (line 89) has no `deleting` flag, so the delete button can be double-clicked.
4. **N+1 API calls:** `fetchTeams` does 1 fetch for teams, then 2 fetches (tasks + docs) per team in parallel. With many teams this could be significant.

---

## 7. app/teams/[id]/page.tsx (Team Detail Page)

**Path:** `/Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx`
**Lines:** 150

### How Agents are Listed

- Uses `useAgents()` hook to fetch ALL agents (not just team members)
- Passes full `agents` array to `TeamOverviewSection` which filters by `team.agentIds`
- Shows agent count in header: `{team.agentIds.length} agent{...}`

### Tab Navigation

5 tabs via `TeamDashboardSidebar`: overview, tasks, kanban, documents, instructions

### Validation Present

- **Loading state:** Shows spinner while `loading` or `!team`
- **Team not found:** Shows "Team not found" message when loading is done but team is null

### Edge Cases NOT Handled

1. **No team type display:** The page header shows team name and agent count, but never displays whether the team is open or closed.
2. **No COS display:** No indication of who the Chief-of-Staff is on the team detail page.
3. **No governance integration:** Team detail page does not show governance status, pending transfers, or role information.
4. **Agents error not propagated well:** `agentsError` is converted from `Error` to `string` via `.message` (line 95), losing the original error object.

---

## 8. components/teams/TeamOverviewSection.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx`
**Lines:** 235

### Add/Remove Agent Flow

**Add Agent:**
1. Click "Add Agent" button -> toggles dropdown showing `availableAgents` (agents NOT in team)
2. Click an agent name -> calls `handleAddAgent(agentId)` which appends to `team.agentIds` and calls `onUpdateTeam({ agentIds: newIds })`
3. Dropdown closes after adding

**Remove Agent:**
1. Hover over agent row -> trash icon appears
2. Click trash -> calls `handleRemoveAgent(agentId)` which filters out the agent and calls `onUpdateTeam({ agentIds: newIds })`

### Duplicate Agent Prevention

- **Client-side:** `availableAgents` is computed as `agents.filter(a => !team.agentIds.includes(a.id))` (line 27). This means agents already in the team are excluded from the add dropdown. VERIFIED: This prevents duplicate additions through the UI.
- **Server-side:** NOT verified here (would need to check `team-registry.ts`), but the hook `useGovernance.addAgentToTeam` also checks for duplicates (line 162 in useGovernance.ts).

### Validation Present

- **Agent loading state:** Shows spinner while agents load (line 158-162)
- **Agent error state:** Shows error message with retry button (line 163-179)
- **Empty state:** Shows "No available agents to add" when all agents are already in the team

### Edge Cases NOT Handled

1. **No confirmation for agent removal:** Clicking trash immediately removes agent. No "Are you sure?" prompt.
2. **No governance check for closed teams:** Anyone viewing the team detail page can add/remove agents, regardless of whether the team is closed and they have COS authority. The governance restriction is only enforced on the `TeamMembershipSection` join flow, not here.
3. **No team type or COS display:** The overview section shows team name, description, stats, and agent roster but never indicates if the team is open/closed or who the COS is.
4. **Race condition on concurrent edits:** `handleAddAgent`/`handleRemoveAgent` both construct new `agentIds` arrays from the current `team.agentIds` state. If two users add agents simultaneously, one addition could be lost (read-modify-write without locking).
5. **Agent display fallback chain:** Uses `agent.label || agent.name || agent.alias || agent.id.slice(0,8)` -- if all are undefined, shows first 8 chars of UUID. Could be confusing.

---

## 9. components/MessageCenter.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx`
**Lines:** 1309

### How Recipient Filtering Works

**Governance reachability (lines 386-401):**
- On mount, fetches `/api/governance/reachable?agentId={agentId}` to get list of reachable agent IDs
- The reachable endpoint uses `checkMessageAllowed()` from `lib/message-filter.ts` to compute which agents this agent can message
- Result stored in `reachableAgentIds` state (null = not loaded yet / endpoint unavailable, allowing all agents as fallback for backward compatibility)

**Agent autocomplete filtering (lines 440-460):**
- Filters `allAgents` by text match (alias, hostId, or full "alias@host" format)
- Excludes current agent (`agent.id === agentId`)
- Does NOT filter by reachability at the autocomplete level -- unreachable agents still appear

**Selection blocking (lines 507-518):**
- When user clicks an agent in autocomplete, `selectAgent()` checks if `reachableAgentIds !== null && !reachableAgentIds.includes(agent.id)`
- If unreachable, sets `governanceError` with message and does NOT set the recipient
- Unreachable agents shown with `opacity-50` and a lock icon with "Restricted" label in the dropdown (lines 1157-1182)

**Server-side enforcement:**
- If a message is sent to an unreachable agent, the server returns 403 with governance error (line 241-243)
- The error is displayed in the governance error banner

### Edge Cases NOT Handled

1. **Reachability failure is silent:** If the reachable endpoint fails (line 395-398), `reachableAgentIds` stays `null`, and ALL agents become messageable. This is a security fallback that could bypass governance.
2. **External agent bypass:** User can type any `name@host` address manually without going through autocomplete. External agents are not checked against governance. Only internal agent selection is filtered.
3. **No real-time reachability updates:** Reachability is fetched once on mount. If team membership changes during the session, the filter is stale until the component remounts.
4. **Agent suggestions show unreachable agents:** This is intentional (for transparency), but could be confusing -- users see agents they cannot message and have to click to find out.

---

## 10. components/AgentProfile.tsx

**Path:** `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx`
**Lines:** 1295

### How Governance Info is Shown

1. **Header RoleBadge (line 294):** Shows governance role badge (sm size) next to "Agent Profile" title. Clicking opens RoleAssignmentDialog.
2. **Identity section - Governance Role row (lines 487-496):** Shows shield icon + "Governance Role" label with a clickable RoleBadge. Same click target as header badge.
3. **TeamMembershipSection (lines 499-509):** Embedded in identity section. Shows team list, join dropdown, transfer requests.
4. **RoleAssignmentDialog (lines 1158-1168):** Rendered at bottom, controlled by `showRoleDialog` state.

### Integration Pattern

- `useGovernance(agentId)` is called at the top level of the component (line 55)
- The governance hook drives: role badge display, role assignment dialog data, team membership section data
- All governance mutations go through the hook, which calls `refresh()` after each mutation

### Validation Present

- **Role dialog only renders when agent exists** (line 1158: `{agent && ...}`)
- **GovernanceState passed as a whole** to RoleAssignmentDialog, giving it access to all governance data

### Edge Cases NOT Handled

1. **Two clickable RoleBadges for same action:** Both the header badge (line 294) and the identity section badge (line 494) open the same dialog. This is not a bug but could be confusing UX -- two visually different elements doing the same thing.
2. **No governance loading state in profile:** The governance hook has a `loading` state but AgentProfile never checks it. If governance data has not loaded yet, the role badge shows `normal` (the default return from the agentRole computation when managerId/allTeams are empty).
3. **No error display for governance:** If governance API calls fail silently during fetch, the profile shows default state without any error indication.

---

## Cross-Cutting Issues

### 1. No Duplicate Team Name Prevention
Neither the client-side create team form nor the server-side POST handler checks for duplicate team names. Multiple teams can have identical names.

### 2. Governance Bypass via TeamOverviewSection
The team detail page's overview section allows adding/removing agents from any team (including closed teams) without governance password or COS authority check. The governance restriction only exists in the `TeamMembershipSection` join flow.

### 3. Race Conditions in Team Membership
Both `useGovernance.addAgentToTeam` and `TeamOverviewSection.handleAddAgent` use read-modify-write patterns without optimistic concurrency control. Concurrent edits can overwrite each other.

### 4. COS UUID Not Resolved to Name
In `RoleAssignmentDialog` line 272, the existing COS is displayed as a raw UUID (`team.chiefOfStaffId`). Should be resolved to a human-readable name.

### 5. No Team Type Selection at Creation
Teams are always created as "open" (default). There is no UI to create a "closed" team. The team type must be changed after creation (mechanism not visible in audited components).

### 6. Fallback-to-Open Governance
If the reachable endpoint fails, MessageCenter allows messaging all agents (null reachableAgentIds = no filter). This could be considered a security gap for closed team isolation.
