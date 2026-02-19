# Code Correctness Report: ui-governance-teams

**Agent:** epcp-code-correctness-agent
**Domain:** ui-governance-teams
**Files audited:** 11 (1 missing: ForwardDialog.tsx does not exist)
**Date:** 2026-02-19T12:00:00Z

## MUST-FIX

### [CC-001] GovernancePasswordDialog Escape handler uses stale `handleClose` reference
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:37-39
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Escape key useEffect depends on `[isOpen]` but calls `handleClose`, which is defined inline and captures the `submitting` state. Because `handleClose` is not in the dependency array, pressing Escape during a submission will close the dialog even though `handleClose` checks `if (submitting) return` -- it reads a stale `submitting = false` closure. Additionally, React's exhaustive-deps lint rule would flag this.
- **Evidence:**
  ```tsx
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])  // missing handleClose in deps
  ```
- **Fix:** Either wrap `handleClose` in `useCallback` and add it to the dependency array, or inline the submitting guard in the effect and add `submitting` to deps. Example: `}, [isOpen, submitting])` with an inline check.

### [CC-002] MessageCenter: `loadMessage` function is not wrapped in useCallback
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:152-170
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `loadMessage` is defined as a plain async function (not wrapped in `useCallback`). It calls `fetchMessages()` and `fetchUnreadCount()` which are `useCallback` dependencies. Since `loadMessage` is a new reference every render, it cannot be safely used as a dependency elsewhere and could cause stale closure bugs. More critically, `loadMessage` closes over `messageIdentifier` and `apiBaseUrl` but does not appear in any dependency array -- if these change, the old closure is silently retained in click handlers.
- **Evidence:**
  ```tsx
  const loadMessage = async (messageId: string, box: 'inbox' | 'sent' = 'inbox') => {
    // ...uses messageIdentifier, apiBaseUrl via closure
  }
  ```
- **Fix:** Wrap `loadMessage` in `useCallback` with appropriate dependencies, or (since it's only used in click handlers) accept the current pattern but document why it's safe.

### [CC-003] MessageCenter: `sendMessage` uses `sessionName` for `from` field but `messageIdentifier` for everything else
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:224
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** For non-forwarded sends, the `from` field is set to `sessionName` (line 224), but every other API call in the component uses `messageIdentifier` (which is `agentId || sessionName`). If `agentId` is provided, the message is sent with `from: sessionName` instead of `from: agentId`, creating an inconsistency between who the server thinks sent the message and who the component queries messages for.
- **Evidence:**
  ```tsx
  // Line 28: const messageIdentifier = agentId || sessionName
  // Line 224: from: sessionName,  // <-- should this be messageIdentifier?
  ```
- **Fix:** Use `messageIdentifier` consistently, or verify that the server expects `sessionName` specifically for the `from` field.

## SHOULD-FIX

### [CC-004] GovernancePasswordDialog: `submitting` state not reset on `isOpen` change
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:26-31
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` that resets form state when `isOpen` changes resets `password`, `confirmPassword`, and `error`, but does NOT reset `submitting`. If the dialog is closed while a request is in-flight (e.g., parent calls `onClose`), and then reopened, `submitting` may still be `true`, leaving the form in a stuck state.
- **Evidence:**
  ```tsx
  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setConfirmPassword('')
      setError(null)
      // missing: setSubmitting(false)
    }
  }, [isOpen])
  ```
- **Fix:** Add `setSubmitting(false)` to the reset block.

### [CC-005] RoleAssignmentDialog: COS team pre-selection missing on open
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:75-81
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the dialog opens and the agent is already a chief-of-staff (`currentRole === 'chief-of-staff'`), `selectedTeamIds` is reset to an empty array. This means the user sees "COS" selected but no teams checked, and the Confirm button is disabled because `selectedTeamIds.length === 0`. The user must re-check the same teams to make any changes. The `isConfirmDisabled` logic (lines 119-131) does compare against `governance.cosTeams`, but the UX is confusing because the checkboxes don't reflect the current state.
- **Evidence:**
  ```tsx
  useEffect(() => {
    if (isOpen) {
      setSelectedRole(currentRole)
      setSelectedTeamIds([])  // Should pre-populate with current COS teams
      setPhase('select')
      setError(null)
    }
  }, [isOpen, currentRole])
  ```
- **Fix:** Initialize `selectedTeamIds` with the current COS team IDs: `setSelectedTeamIds(governance.cosTeams.map(t => t.id))`.

### [CC-006] RoleAssignmentDialog: `governance` not in the useEffect dependency for COS pre-selection
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:75-82
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Even if CC-005 is fixed, `governance.cosTeams` is used in the reset effect but `governance` is not in the dependency array. The fix for CC-005 requires adding the relevant governance state to the dependency array.
- **Fix:** Add `governance.cosTeams` to the effect's dependency array, or compute COS team IDs outside the effect.

### [CC-007] TeamOverviewSection: `handleRemoveAgent` parameter shadows component prop type
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:68
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleRemoveAgent(agentId: string)` uses a parameter named `agentId`, which shadows the same variable name if it ever appeared in scope. Currently there is no `agentId` prop so it's not a runtime bug, but it's a maintenance hazard. More importantly, this operation directly modifies `team.agentIds` on the client without checking if the user has governance permission (e.g., removing an agent from a closed team should require COS/MANAGER role).
- **Evidence:**
  ```tsx
  const handleRemoveAgent = async (agentId: string) => {
    const newIds = team.agentIds.filter(id => id !== agentId)
    await onUpdateTeam({ agentIds: newIds })
  }
  ```
- **Fix:** Rename the parameter to `targetAgentId` to avoid shadowing. The governance permission check should ideally be enforced server-side (verify this is the case in the API route).

### [CC-008] MessageCenter: Toast `setTimeout` not cleaned up on unmount
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:69-72
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `showToast` uses `setTimeout(() => setToast(null), 3000)` which is never cleaned up. If the component unmounts before the timeout fires, it will try to call `setToast` on an unmounted component (React warning in dev, no-op in production but still a leak pattern).
- **Evidence:**
  ```tsx
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)  // no cleanup
  }, [])
  ```
- **Fix:** Store the timeout ID in a ref and clear it on unmount or on subsequent calls.

### [CC-009] MessageCenter: `deleteMessage` confirmation timeout not cleared on unmount
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:266
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-008: `setTimeout(() => setPendingDelete(null), 5000)` is never cleaned up, and the previous timeout is never cleared if deleteMessage is called again for a different message.
- **Fix:** Store timeout in ref, clear on unmount and on each new call.

### [CC-010] MessageCenter: Missing aria-role on autocomplete listbox items
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:1162-1192
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The autocomplete suggestions container has `role="listbox"` and `aria-label`, but individual suggestion items (div elements) lack `role="option"` and `aria-selected` attributes. This breaks the ARIA autocomplete pattern for screen readers.
- **Evidence:**
  ```tsx
  <div
    key={agent.id}
    onClick={() => selectAgent(agent)}
    className={`px-3 py-2 cursor-pointer...`}
  >
  ```
- **Fix:** Add `role="option"` and `aria-selected={isSelected}` to each suggestion div.

### [CC-011] Password inputs lack `id` and `autocomplete` attributes
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:150-163
- **Severity:** SHOULD-FIX
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** Password input fields lack `id` attributes, so the `<label>` elements are not programmatically associated. They also lack `autocomplete` attributes (should be `autocomplete="new-password"` for setup and `autocomplete="current-password"` for confirm), which impacts password manager integration and accessibility.
- **Evidence:**
  ```tsx
  <label className="block text-sm font-medium text-gray-300 mb-2">
    {mode === 'setup' ? 'New Password' : 'Password'}
  </label>
  <input
    type="password"
    value={password}
    // Missing: id, autocomplete, htmlFor on label
  ```
- **Fix:** Add `id="governance-password"` to the input, `htmlFor="governance-password"` to the label, and `autocomplete="new-password"` or `autocomplete="current-password"`.

### [CC-012] RoleAssignmentDialog: Missing `AnimatePresence` for exit animation
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:214-216
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The dialog uses `motion.div` with initial/animate props but has no `AnimatePresence` wrapper and no `exit` prop, so closing the dialog will not produce any exit animation (it just disappears). GovernancePasswordDialog correctly uses `AnimatePresence` but this dialog does not.
- **Evidence:**
  ```tsx
  // Line 200: if (!isOpen) return null
  // Line 214-218:
  <div className="fixed inset-0...">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      // Missing: exit prop
  ```
- **Fix:** Wrap in `AnimatePresence` and add `exit={{ opacity: 0, scale: 0.95 }}`.

### [CC-013] RoleAssignmentDialog: Concurrent COS removal during role change is not atomic
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:152-157
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** When demoting from chief-of-staff to normal, the code loops through COS teams and removes the assignment one at a time with `await` in a for loop. If the first succeeds but the second fails, the agent ends up in a partially-demoted state. The `governance.refresh()` in the catch block mitigates this, but the user sees a confusing error and must retry.
- **Evidence:**
  ```tsx
  } else if (currentRole === 'chief-of-staff') {
    for (const team of governance.cosTeams) {
      const result = await governance.assignCOS(team.id, null, password)
      if (!result.success) throw new Error(...)
    }
  }
  ```
- **Fix:** Consider using `Promise.allSettled` for parallel execution or implement a single server-side endpoint for batch COS removal. At minimum, document the partial-failure behavior.

## NIT

### [CC-014] ForwardDialog.tsx does not exist
- **File:** /Users/emanuelesabetta/ai-maestro/components/ForwardDialog.tsx
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The audit scope included `components/ForwardDialog.tsx` but this file does not exist. Only `libs_dev/ForwardDialog.tsx.bak` exists. The forwarding functionality is implemented inline in MessageCenter.tsx. This is not a bug but a scope mismatch.
- **Fix:** Remove from audit scope or restore the file if it was intended to exist.

### [CC-015] TeamOverviewSection: Name editing input lacks `maxLength`
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:104-108
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The team name input in TeamOverviewSection has no `maxLength` attribute. The TeamsPage's create form validates 4-64 characters, but the edit-in-place field does not enforce the same constraint client-side.
- **Fix:** Add `maxLength={64}` to the name input, and validate `name.length >= 4` before calling `handleSaveName`.

### [CC-016] MessageCenter: `sentCount` state is maintained but never displayed
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:36,139-149,211,424
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `sentCount` is fetched via `fetchSentCount()` and the state is maintained, but it is never rendered in the UI. The Sent button does not show a count badge (unlike the Inbox button which shows `unreadCount`).
- **Fix:** Either display `sentCount` in the Sent button badge, or remove the unused state and fetch call to reduce unnecessary API requests.

### [CC-017] RoleBadge: Clickable span elements should use button role
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:31-33
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** When `onClick` is not provided, non-interactive `<span>` elements are rendered with `cursor-default`, which is correct. However, the component correctly uses `<button>` when `onClick` is provided. No issue here -- this is well-implemented. (Audit note: no finding after verification.)
- **Fix:** None needed.

### [CC-018] AgentProfileTab: Duplicate `EditableField` and `MetricCard` component definitions
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:944-1044 vs /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:1184-1295
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `EditableField`, `MetricCard`, and `formatNumber` are identically defined in both `AgentProfile.tsx` and `AgentProfileTab.tsx`. This is code duplication that could drift apart over time.
- **Fix:** Extract these into a shared module (e.g., `components/shared/EditableField.tsx`).

### [CC-019] TeamsPage: Keyboard Escape handler on Create dialog works via `onKeyDown` on input only
- **File:** /Users/emanuelesabetta/ai-maestro/app/teams/page.tsx:245
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The Create Team dialog only handles Escape via the input's `onKeyDown`. If the user clicks outside the input (but still inside the modal overlay), pressing Escape won't close the dialog. Compare with GovernancePasswordDialog which has a document-level keydown listener.
- **Fix:** Add a document-level `keydown` listener for Escape on the modal, or add `onClick={handleClose}` on the backdrop div.

### [CC-020] TeamOverviewSection: Description edit area missing Escape key handling
- **File:** /Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx:152-158
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The description textarea does not handle Escape key to cancel editing (unlike the name input which does handle Escape on line 110). Users must click the Cancel button instead.
- **Fix:** Add `onKeyDown` handler for Escape key to the textarea.

### [CC-021] MessageCenter: Compose form message label not associated with textarea
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:1276-1289
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The message textarea has `id="compose-message"` and `aria-label`, but the label element (line 1276) does not have `htmlFor="compose-message"`, so they are not programmatically associated.
- **Evidence:**
  ```tsx
  <label className="block text-sm font-medium text-gray-300 mb-1">
    Message:
  </label>
  <textarea
    id="compose-message"
  ```
- **Fix:** Add `htmlFor="compose-message"` to the label.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx -- Well-structured component with proper interactive/non-interactive element handling
- /Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx -- Clean page component with proper data fetching and loading states
