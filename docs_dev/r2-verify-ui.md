# R2 UI Correctness Report - Verification Results

**Date:** 2026-02-19
**Report verified:** docs_dev/epcp-v5-correctness-ui.md
**Findings:** CC-001 through CC-016

## Summary

| Status | Count |
|--------|-------|
| FIXED | 10 |
| UNFIXED | 0 |
| PARTIAL | 2 |
| NO-ACTION-NEEDED | 4 |

---

## MUST-FIX

### CC-001 — RoleAssignmentDialog: COS reassignment sends redundant API calls
**Status: FIXED**

Lines 205-208 of `components/governance/RoleAssignmentDialog.tsx` now contain:
```typescript
// CC-001: Only assign COS to teams where this agent is not already COS — avoids redundant API calls
const existingCosTeamIds = governance.cosTeams.map(t => t.id)
const newTeamIds = selectedTeamIds.filter(id => !existingCosTeamIds.includes(id))
for (const teamId of newTeamIds) {
```
The assignment loop now filters to only new team IDs, avoiding redundant API calls. The fix matches the recommendation exactly.

---

### CC-002 — GovernancePasswordDialog: Confirm mode calls onPasswordConfirmed without error handling
**Status: FIXED**

Lines 92-103 of `components/governance/GovernancePasswordDialog.tsx` now contain:
```typescript
} else {
  // Confirm mode: pass the password back to the caller for server-side validation
  // Wrapped in try/catch with submitting state to match setup mode's error handling pattern (CC-002)
  setSubmitting(true)
  try {
    await onPasswordConfirmed?.(password)
    setPassword('')
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Confirmation failed')
  } finally {
    setSubmitting(false)
  }
}
```
The confirm mode now wraps the callback in `setSubmitting(true)`, `try/catch`, and `await`, exactly as recommended. Comment references CC-002.

---

## SHOULD-FIX

### CC-003 — RoleAssignmentDialog: Sequential COS removal creates partially-demoted state
**Status: PARTIAL**

Lines 169-174 show:
```typescript
// Sequential removal — partial failure is acceptable since each removal is independent.
// Server state is consistent after each step.
for (const team of governance.cosTeams) {
  const result = await governance.assignCOS(team.id, null, password)
  if (!result.success) throw new Error(result.error || `Failed to remove COS from team ${team.name}`)
}
```
Comments were added acknowledging the sequential removal pattern and documenting that partial failure is acceptable since server state is consistent after each step. The `governance.refresh()` in the catch block reloads state. However, the code does NOT use `Promise.allSettled()` or collect per-team results for informative error messages as suggested. The comments serve as documentation of the design decision but the UX improvement (informative error about which teams succeeded/failed) was not implemented.

---

### CC-004 — MessageCenter: selectedMessage state not cleared when switching views
**Status: FIXED**

Lines 596 and 612 of `components/MessageCenter.tsx` now contain:
```typescript
onClick={() => { setView('inbox'); setSelectedMessage(null) }}
...
onClick={() => { setView('sent'); setSelectedMessage(null) }}
```
Both Inbox and Sent buttons now call `setSelectedMessage(null)` when switching views, exactly as recommended.

---

### CC-005 — MessageCenter: Copy dropdown ref shared across inbox and sent views
**Status: FIXED**

Lines 816-818 and 1032-1034 now contain explicit comments:
```typescript
{/* Copy Button with Dropdown
   Single ref is correct — only one copy dropdown can be open at a time
   regardless of view, since inbox and sent views are mutually exclusive */}
```
The code documents the exclusivity assumption explicitly. The report's recommendation was "document the exclusivity assumption" (since the views are mutually exclusive and this is low risk). This is addressed via comments.

---

### CC-006 — MessageCenter: governance reachable fetch runs even when isActive=false
**Status: FIXED**

Lines 387-404 of `components/MessageCenter.tsx` now show:
```typescript
// Fetch reachable agents for governance filtering (guarded by isActive to prevent API flood with 40+ agents)
useEffect(() => {
  if (!isActive) return
  const fetchReachable = async () => {
    ...
  }
  fetchReachable()
}, [agentId, apiBaseUrl, isActive])
```
The `isActive` guard has been added both as an early return and as a dependency, exactly as recommended.

---

### CC-007 — TeamOverviewSection: handleAddAgent allows duplicate agent IDs
**Status: FIXED**

Lines 85-86 of `components/teams/TeamOverviewSection.tsx` now contain:
```typescript
// CC-007: Prevent adding duplicate agent members
if (team.agentIds.includes(agentId)) { setError('Agent is already a member'); return }
```
The dedup check is present before the spread, matching the recommendation. Comment references CC-007.

---

### CC-008 — TeamsPage: fetchTeams N+1 query pattern
**Status: PARTIAL**

Lines 35-51 of `app/teams/page.tsx` still fetch full tasks/documents per team to count them:
```typescript
// Phase 1: Client-side count via full fetch. Phase 2: Add /api/teams/[id]/stats endpoint for efficient counts.
// (N+1 query pattern: fetches all tasks/documents per team to derive counts)
const enriched = await Promise.all(
  teamsData.map(async (team) => {
    const [tasksRes, docsRes] = await Promise.all([
      fetch(`/api/teams/${team.id}/tasks`).catch(() => null),
      fetch(`/api/teams/${team.id}/documents`).catch(() => null),
    ])
    ...
  })
)
```
The N+1 pattern remains, but a comment was added documenting it as a Phase 1 limitation with a plan to add a stats endpoint in Phase 2. The fix recommendation (add `?count=true` or include counts in `/api/teams` response) was NOT implemented. Marked as PARTIAL because the issue is documented but not resolved.

---

### CC-009 — RoleAssignmentDialog: Escape key handler bypasses state reset
**Status: FIXED**

Lines 90-105 of `components/governance/RoleAssignmentDialog.tsx` now contain:
```typescript
// CC-009: Defensive close handler — resets internal state before calling parent onClose,
// so stale state never persists even if parent does not toggle isOpen immediately.
const handleClose = useCallback(() => {
  setSelectedTeamIds([])
  setError(null)
  setPhase('select')
  onClose()
}, [onClose])

// Close dialog on Escape key press
useEffect(() => {
  if (!isOpen) return
  const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
  ...
```
The Escape handler now calls `handleClose()` instead of `onClose()` directly. `handleClose` resets `selectedTeamIds`, `error`, and `phase` before calling `onClose()`. Comment references CC-009.

---

### CC-010 — TeamMembershipSection: canJoinClosedTeams logic does not account for transfer requirements
**Status: FIXED**

Lines 51-63 of `components/governance/TeamMembershipSection.tsx` now contain:
```typescript
// Determine which teams this agent can join.
// Managers and COS can SEE closed teams in the dropdown, but joining a closed team
// requires a transfer request — the Join button opens a transfer request flow rather
// than directly adding the agent. Direct joining is only allowed for open teams.
// Managers bypass the transfer requirement entirely (they have full authority).
const memberTeamIds = new Set(memberTeams.map(t => t.id))
const canSeeClosedTeams = agentRole === 'manager' || agentRole === 'chief-of-staff'
```
The variable was renamed from `canJoinClosedTeams` to `canSeeClosedTeams` to clarify intent. Detailed comments explain the business rule: managers bypass transfer requirements, COS can see closed teams but must go through transfer flow. Lines 75-104 show `handleJoin` correctly routes to transfer request for closed teams when the agent is not a manager. The report's concern about client-side business rules being incomplete is addressed by the transfer request logic and documentation.

---

## NIT

### CC-011 — RoleBadge: Non-exhaustive role handling relies on implicit fallthrough
**Status: FIXED**

`components/governance/RoleBadge.tsx` lines 33-73 now use a `switch` statement with explicit `case 'manager'`, `case 'chief-of-staff'`, `case 'normal'`, and a `default` case that renders unknown roles with a fallback label. This replaces the sequential `if` statements. The switch approach is more maintainable and handles future roles gracefully.

---

### CC-012 — RoleAssignmentDialog: JSON.stringify comparison for array equality
**Status: NO-ACTION-NEEDED**

Line 142 still uses `JSON.stringify` for array comparison:
```typescript
if (JSON.stringify(currentCosTeamIds) === JSON.stringify(selected)) return true
```
A comment was added at line 141: "JSON.stringify for shallow array comparison — acceptable for small team ID arrays". The report classified this as NIT and acknowledged it works correctly for sorted string arrays. The comment documents the design choice.

---

### CC-013 — MessageCenter: Unused import — AlertTriangle and Lock
**Status: NO-ACTION-NEEDED**

Line 4 of `components/MessageCenter.tsx` still imports all icons including `AlertTriangle` and `Lock`. The report itself stated "No action needed. Tree-shaking handles unused icons at build time." Both icons are used in governance-related conditional blocks.

---

### CC-014 — TeamDashboardPage: agentsError type mismatch handled with `.message`
**Status: FIXED**

Line 104 of `app/teams/[id]/page.tsx` now contains:
```typescript
agentsError={agentsError instanceof Error ? agentsError.message : agentsError ? String(agentsError) : null}
```
This handles both `Error` objects (extracting `.message`) and string/other types (via `String()`), exactly matching the report's recommendation. Verified that `useAgents()` returns `error` typed as `Error | null` (hooks/useAgents.ts:214), so the `instanceof Error` branch is the primary path, but the fallback to `String()` is defensive.

---

### CC-015 — GovernancePasswordDialog: Potential stale closure in Enter key handler
**Status: NO-ACTION-NEEDED**

Lines 170-175 of `components/governance/GovernancePasswordDialog.tsx` contain:
```typescript
// CC-015: No stale closure risk -- React inline event handlers always capture the
// latest render's closure, so `password`, `isSubmitDisabled`, and `handleSubmit`
// are always current without needing useCallback or a dependency array.
onKeyDown={(e) => {
  if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()
}}
```
The report itself stated "No action needed." A comment was added referencing CC-015 and explaining why there is no stale closure risk.

---

### CC-016 — TeamsPage: newTeamName not reset when create dialog is cancelled via Escape
**Status: FIXED**

Lines 79-84 of `app/teams/page.tsx` now contain:
```typescript
if (e.key === 'Escape') {
  setCreating(false)
  setNewTeamName('')
  setCreateError(null)
  setNameValidation({ error: null, warning: null })
}
```
`setNewTeamName('')` is now present in the Escape key handler at line 81, matching the Cancel button behavior. This was the exact fix recommended.

---

## Verification Complete

All 16 findings have been verified against the current source code:
- **10 FIXED**: CC-001, CC-002, CC-004, CC-005, CC-006, CC-007, CC-009, CC-010, CC-011, CC-014, CC-016
- **2 PARTIAL**: CC-003 (documented but not refactored), CC-008 (documented as Phase 2 TODO)
- **4 NO-ACTION-NEEDED**: CC-012, CC-013, CC-015 (report recommended no action; comments added)

Note: The count in the summary table shows 10 FIXED because CC-016 is included there. The detailed list above has 11 entries under FIXED due to CC-016 being the 11th. Corrected count: 11 FIXED, 2 PARTIAL, 3 NO-ACTION-NEEDED = 16 total.
