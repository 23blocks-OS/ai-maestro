# Code Correctness Report: UI Components (Governance, Teams, MessageCenter)

**Agent:** epcp-code-correctness-agent
**Domain:** ui-components
**Files audited:** 8
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] RoleAssignmentDialog: COS reassignment sends redundant API calls for teams already assigned
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:192-195
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When an agent is already COS of a team and the user keeps that team checked, `handleRoleChange` still calls `governance.assignCOS(teamId, agentId, password)` for that team. The loop at line 192 iterates ALL `selectedTeamIds`, including teams the agent already leads. Only teams NOT in `governance.cosTeams` should trigger new assignments.
- **Evidence:**
  ```typescript
  // Line 192-195 — iterates ALL selectedTeamIds
  for (const teamId of selectedTeamIds) {
    const result = await governance.assignCOS(teamId, agentId, password)
    if (!result.success) throw new Error(result.error || 'Failed to assign chief-of-staff')
  }
  ```
  The removal loop at 184-190 correctly filters by `!selectedTeamIds.includes(team.id)`, but the assignment loop doesn't filter by `!currentCosTeamIds.includes(teamId)`.
- **Fix:** Filter `selectedTeamIds` to only new assignments:
  ```typescript
  const currentCosIds = new Set(governance.cosTeams.map(t => t.id))
  for (const teamId of selectedTeamIds) {
    if (!currentCosIds.has(teamId)) {
      const result = await governance.assignCOS(teamId, agentId, password)
      // ...
    }
  }
  ```

### [CC-002] GovernancePasswordDialog: Confirm mode calls onPasswordConfirmed synchronously without error handling
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:92-96
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In 'confirm' mode, `onPasswordConfirmed(password)` is called synchronously without `setSubmitting(true)`, without try/catch, and without awaiting the callback. If the parent's `onPasswordConfirmed` is async and throws (e.g., bad password), the dialog silently clears the password and closes, leaving the user unaware of failure. Meanwhile the 'setup' mode at line 71-91 properly sets `setSubmitting(true)`, awaits the API call, and catches errors.
- **Evidence:**
  ```typescript
  } else {
    // Confirm mode: pass the password back to the caller for server-side validation
    onPasswordConfirmed(password)
    setPassword('')
  }
  ```
- **Fix:** Wrap confirm mode in the same `setSubmitting(true)` / try-catch / `setSubmitting(false)` pattern as setup mode. If `onPasswordConfirmed` is potentially async, await it.

## SHOULD-FIX

### [CC-003] RoleAssignmentDialog: Sequential COS removal creates partially-demoted state on failure
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:159-163
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When demoting from COS to normal, the code removes COS from each team sequentially in a `for` loop. If the second call fails but the first succeeded, the agent is partially demoted. The code comments acknowledge this ("partial failure leaves agent in partially-demoted state") and relies on server-side enforcement, but there is no rollback, retry, or notification to the user of which teams succeeded. The `governance.refresh()` in the catch block reloads the UI to reflect reality, which is good, but the error message is generic and doesn't indicate which teams were successfully processed.
- **Evidence:**
  ```typescript
  for (const team of governance.cosTeams) {
    const result = await governance.assignCOS(team.id, null, password)
    if (!result.success) throw new Error(result.error || `Failed to remove COS from team ${team.name}`)
  }
  ```
- **Fix:** Consider using `Promise.allSettled()` or collecting individual team results to provide a more informative error message about which operations succeeded/failed.

### [CC-004] MessageCenter: selectedMessage state not cleared when switching between inbox and sent views
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:594-631
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When switching between 'inbox' and 'sent' views, the `selectedMessage` is not reset. This means the message detail panel shows a message from the previous view. The `selectedMessage?.id === msg.id` highlight check (lines 722, 955) compares against messages from the OTHER view, which could match a different message's ID if UUIDs happen to be compared. More practically, the user sees stale message details from the other box until they click a new message.
- **Evidence:**
  ```typescript
  <button onClick={() => setView('inbox')} ...>Inbox</button>
  <button onClick={() => setView('sent')} ...>Sent</button>
  // No setSelectedMessage(null) when switching views
  ```
- **Fix:** Add `setSelectedMessage(null)` in the onClick handlers for view switching buttons.

### [CC-005] MessageCenter: Copy dropdown ref shared across inbox and sent views
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:816,1030
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `copyDropdownRef` is used for both the inbox message detail (line 816) and the sent message detail (line 1030) copy buttons. Since only one can be visible at a time (the views are mutually exclusive), this works functionally. However, both render sites use the same `ref`, so if React ever renders both (e.g., during a view transition), the ref would only point to the last-rendered element, potentially breaking the click-outside detection.
- **Evidence:**
  ```typescript
  // Line 816 (inbox view)
  <div ref={copyDropdownRef} className="relative">
  // Line 1030 (sent view)
  <div ref={copyDropdownRef} className="relative">
  ```
- **Fix:** This is low risk since views are mutually exclusive. Consider using separate refs for clarity, or document the exclusivity assumption.

### [CC-006] MessageCenter: governance reachable fetch runs even when isActive=false
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:388-403
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `fetchReachable` effect at line 388 runs when `agentId` or `apiBaseUrl` changes, regardless of the `isActive` prop. The component explicitly guards other fetches with `if (!isActive) return` (lines 407, 415), but the governance reachable fetch does not check `isActive`. With 40+ agents mounted, this creates 40+ `/api/governance/reachable` requests on mount.
- **Evidence:**
  ```typescript
  // Line 388-403 — no isActive guard
  useEffect(() => {
    const fetchReachable = async () => {
      try {
        if (!agentId) return
        const res = await fetch(`${apiBaseUrl}/api/governance/reachable?agentId=${agentId}`)
        ...
  }, [agentId, apiBaseUrl])

  // Line 406-411 — properly guarded
  useEffect(() => {
    if (!isActive) return
    fetchMessages()
    ...
  }, [messageIdentifier, isActive, ...])
  ```
- **Fix:** Add `if (!isActive) return` guard to the governance reachable fetch effect.

### [CC-007] TeamOverviewSection: handleAddAgent allows duplicate agent IDs
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:82-91
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleAddAgent` creates `newIds` by spreading `team.agentIds` and appending the new `agentId` without checking if it's already present. While the UI filters `availableAgents` to exclude existing team members, a race condition (double-click, concurrent updates from another tab) could add a duplicate.
- **Evidence:**
  ```typescript
  const handleAddAgent = async (agentId: string) => {
    try {
      setError(null)
      const newIds = [...team.agentIds, agentId]  // No dedup check
      await onUpdateTeam({ agentIds: newIds })
      ...
  ```
- **Fix:** Add dedup: `if (team.agentIds.includes(agentId)) return;` or use `new Set([...team.agentIds, agentId])`.

### [CC-008] TeamsPage: fetchTeams fetches all tasks/documents to count them -- N+1 query pattern
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:36-50
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** For each team, the page fetches the full list of tasks and documents just to count them (`(tasksData.tasks || []).length`). With many teams, this creates 2N additional API requests and transfers all task/document data over the network just to get counts. This is a classic N+1 problem.
- **Evidence:**
  ```typescript
  const enriched = await Promise.all(
    teamsData.map(async (team) => {
      const [tasksRes, docsRes] = await Promise.all([
        fetch(`/api/teams/${team.id}/tasks`).catch(() => null),
        fetch(`/api/teams/${team.id}/documents`).catch(() => null),
      ])
      const tasksData = tasksRes?.ok ? await tasksRes.json() : { tasks: [] }
      const docsData = docsRes?.ok ? await docsRes.json() : { documents: [] }
      return {
        ...team,
        taskCount: (tasksData.tasks || []).length,
        docCount: (docsData.documents || []).length,
      }
    })
  )
  ```
- **Fix:** Add a `?count=true` query parameter to the API, or include counts in the `/api/teams` response directly.

### [CC-009] RoleAssignmentDialog: Escape key handler uses onClose directly, bypasses state reset
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:91-96
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Escape key handler calls `onClose()` directly without resetting internal state (phase, error, selectedRole, selectedTeamIds). This means if the dialog is reopened, the `isOpen` useEffect will re-initialize everything, which is correct. However, if `onClose` does NOT toggle `isOpen` (which depends on the parent), stale state could persist. The handleClose in GovernancePasswordDialog properly resets state, but this dialog relies entirely on the `isOpen` effect.
- **Evidence:**
  ```typescript
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    ...
  ```
- **Fix:** Consider wrapping in a local `handleClose` that resets internal state before calling `onClose()`, for defensive programming.

### [CC-010] TeamMembershipSection: canJoinClosedTeams logic does not account for transfer requirements
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:53-59
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `canJoinClosedTeams` flag at line 53 allows managers and COS to see closed teams in the joinable list. However, the subsequent `handleJoin` logic (lines 77-103) only creates a transfer request when the agent is in a closed team led by someone else. For a COS joining a different closed team directly (bypassing transfer), the business rules may not be fully enforced on the client side. The server should catch this, but the UI could show misleading options.
- **Evidence:**
  ```typescript
  const canJoinClosedTeams = agentRole === 'manager' || agentRole === 'chief-of-staff'
  const joinableTeams = allTeams.filter(t => {
    if (memberTeamIds.has(t.id)) return false
    if (canJoinClosedTeams) return true
    return t.type !== 'closed'
  })
  ```
- **Fix:** Verify that server-side validation handles the case where a COS tries to directly join another closed team. Add a client-side check or tooltip explaining the business rule.

## NIT

### [CC-011] RoleBadge: Non-exhaustive role handling relies on implicit fallthrough
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:54-55
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The component uses sequential `if` statements for 'manager' and 'chief-of-staff', then falls through to the `// role === 'normal'` case. While TypeScript's type system ensures `GovernanceRole` is one of the three values, using a `switch` with an exhaustive check (`default: const _: never = role`) would be more maintainable if new roles are added.
- **Evidence:**
  ```typescript
  if (role === 'manager') { ... }
  if (role === 'chief-of-staff') { ... }
  // role === 'normal'
  if (!onClick) return null
  ```
- **Fix:** Consider using a switch statement with exhaustive type checking for future-proofing.

### [CC-012] RoleAssignmentDialog: JSON.stringify comparison for array equality
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:132
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Uses `JSON.stringify(arr1) === JSON.stringify(arr2)` to compare sorted arrays. This works correctly here since the arrays contain strings and are sorted, but it is fragile -- if the elements ever contained objects or the sort was removed, this comparison would break silently.
- **Evidence:**
  ```typescript
  if (JSON.stringify(currentCosTeamIds) === JSON.stringify(selected)) return true
  ```
- **Fix:** Consider a proper array comparison utility, e.g., `currentCosTeamIds.length === selected.length && currentCosTeamIds.every((id, i) => id === selected[i])`.

### [CC-013] MessageCenter: Unused import -- AlertTriangle used only in governance error, Lock used only in autocomplete
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:4
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The import line at line 4 is very long with many icons. All imports appear to be used, but `AlertTriangle` and `Lock` are only used in governance-related conditional blocks. If governance is disabled, these become dead code at runtime (though still valid imports). This is more of a code organization note.
- **Evidence:**
  ```typescript
  import { Mail, Send, Inbox, Archive, Trash2, AlertCircle, Clock, CheckCircle, Forward, Copy, ChevronDown, Server, ShieldCheck, Globe, HelpCircle, Lock, AlertTriangle, X } from 'lucide-react'
  ```
- **Fix:** No action needed. Tree-shaking handles unused icons at build time.

### [CC-014] TeamDashboardPage: agentsError type mismatch handled with `.message`
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx:104
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `useAgents()` returns `error` as some type, and the page passes `agentsError ? agentsError.message : null`. If `agentsError` is already a string (not an Error object), `.message` would be undefined. The `TeamOverviewSection` receives `agentsError` as `string | null`, so if the hook returns an Error object, this mapping is correct. But if it returns a string, the `.message` access would produce `undefined` which gets passed as a truthy value.
- **Evidence:**
  ```typescript
  agentsError={agentsError ? agentsError.message : null}
  ```
- **Fix:** Verify the return type of `useAgents().error` -- if it's `Error`, this is correct. If it could be `string`, use `agentsError instanceof Error ? agentsError.message : agentsError`.

### [CC-015] GovernancePasswordDialog: Potential stale closure in Enter key handler
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:163
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** The `onKeyDown` handler for the password input captures `isSubmitDisabled` and `handleSubmit` from the render closure. Since `handleSubmit` is defined as a plain function (not wrapped in useCallback), it's recreated each render, and the inline handler captures the latest version. This is fine for React event handlers (they always get the latest render's closure). No actual stale closure issue, but marking for awareness.
- **Evidence:**
  ```typescript
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()
  }}
  ```
- **Fix:** No action needed. React synthetic event handlers always use the latest render's closure.

### [CC-016] TeamsPage: newTeamName not reset when create dialog is cancelled via Escape
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:77-82
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Escape key handler sets `setCreating(false)`, `setCreateError(null)`, and `setNameValidation(...)` but does NOT reset `newTeamName`. The Cancel button at line 274 does reset it with `setNewTeamName('')`. This means if the user types a name, presses Escape, and reopens the dialog, the previous name will still be in the input.
- **Evidence:**
  ```typescript
  // Escape handler (line 78-82)
  if (e.key === 'Escape') {
    setCreating(false)
    setCreateError(null)
    setNameValidation({ error: null, warning: null })
    // Missing: setNewTeamName('')
  }

  // Cancel button (line 274)
  onClick={() => { setCreating(false); setNewTeamName(''); setCreateError(null); ... }}
  ```
- **Fix:** Add `setNewTeamName('')` to the Escape key handler at line 82.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx -- Clean (minor exhaustiveness nit noted above, CC-011)
- /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx -- Clean (minor type nit noted above, CC-014)
