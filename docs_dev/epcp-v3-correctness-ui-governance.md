# Code Correctness Report: ui-governance

**Agent:** epcp-code-correctness-agent
**Domain:** ui-governance
**Files audited:** 4
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

### [CC-001] Stale closure in Escape key handler references outdated `handleClose`
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:35-40
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` for the Escape key handler has a dependency array of `[isOpen]`, but it captures `handleClose` from the closure at the time the effect runs. `handleClose` itself references `submitting` state. If `submitting` changes after the effect has registered the keydown listener, pressing Escape will use a stale `submitting` value (always the value from when the effect ran). This means pressing Escape while a submission is in progress could close the dialog despite the `if (submitting) return` guard in `handleClose`.
- **Evidence:**
```tsx
// Line 35-39
useEffect(() => {
  if (!isOpen) return
  const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
  document.addEventListener('keydown', handleKey)
  return () => document.removeEventListener('keydown', handleKey)
}, [isOpen])  // Missing handleClose dependency

// handleClose references `submitting` state:
const handleClose = () => {
  if (submitting) return  // stale closure - submitting is always false from initial render
  onClose()
  ...
}
```
- **Fix:** Either add `handleClose` (wrapped in `useCallback`) to the dependency array, or add `submitting` to the dependency array and inline the check: `if (e.key === 'Escape' && !submitting) handleClose()`. The recommended fix is to wrap `handleClose` in `useCallback` with `[submitting, onClose]` deps, then add it to the useEffect deps.

## SHOULD-FIX

### [CC-002] RoleAssignmentDialog partial failure leaves inconsistent state
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:141-198
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When transitioning roles (e.g., from COS to manager at lines 161-168, or from manager to COS at lines 170-187), the handler performs multiple sequential API calls (remove old role, assign new role). If the first call succeeds but the second fails, the agent is left in an intermediate state (e.g., COS removed but manager not assigned). While `governance.refresh()` is called in the catch block (line 194), the user sees a generic error message and the "Retry" button re-enters the select phase, which will attempt the full transition again -- including re-removing a role that was already removed (which may error or no-op depending on the API). This is not a data corruption bug since the server state is consistent, but the UX is confusing and the retry logic is not idempotent.
- **Evidence:**
```tsx
// Lines 161-168: Two sequential calls for COS->Manager transition
if (currentRole === 'chief-of-staff') {
  for (const team of governance.cosTeams) {
    const result = await governance.assignCOS(team.id, null, password)
    if (!result.success) throw new Error(...)
  }
}
const result = await governance.assignManager(agentId, password)
// If this fails, COS was already removed but manager not assigned
```
- **Fix:** Consider making the role transition atomic on the server side (single API endpoint that handles the full transition), or at least track which steps succeeded so the retry can skip completed steps. Alternatively, after `governance.refresh()` in the catch block, reset `currentRole` state from the refreshed data so the retry uses the actual current state.

### [CC-003] `handleSubmit` in GovernancePasswordDialog is async but called without error boundary in onKeyDown
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:157-158, 179-180
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `handleSubmit` is an `async` function. When called from `onKeyDown` handlers (lines 158, 180), the returned promise is not awaited (it becomes a floating promise). If `handleSubmit` throws an unhandled error not caught by the internal try/catch (e.g., a network error during `res.text()` on line 76, or `onPasswordConfirmed` throws), it would result in an unhandled promise rejection rather than being caught by React's error boundary.
- **Evidence:**
```tsx
// Line 158
onKeyDown={(e) => {
  if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()  // floating promise
}}
```
- **Fix:** The internal try/catch in `handleSubmit` should cover all paths, but for the `confirm` mode path (lines 88-92), `onPasswordConfirmed(password)` is called outside try/catch. If `onPasswordConfirmed` throws, it's unhandled. Wrap the entire function body in the try/catch, or ensure `onPasswordConfirmed` never throws.

### [CC-004] Confirm mode in GovernancePasswordDialog does not set `submitting` state
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:88-92
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `confirm` mode, `handleSubmit` calls `onPasswordConfirmed(password)` without wrapping it in `setSubmitting(true)` / `setSubmitting(false)`. If `onPasswordConfirmed` triggers an async operation that takes time (e.g., the RoleAssignmentDialog's `handleRoleChange`), the user could press Enter/click Confirm multiple times during that period, causing duplicate invocations.
- **Evidence:**
```tsx
// Lines 88-92 (confirm mode path)
} else {
  // Confirm mode: pass the password back to the caller for server-side validation
  onPasswordConfirmed(password)
  setPassword('')
}
```
Compare with setup mode (lines 67-87) which properly sets `submitting = true`.
- **Fix:** Wrap the confirm mode path in `setSubmitting(true)` / `setSubmitting(false)` as well, or close the dialog immediately after calling `onPasswordConfirmed` to prevent double-clicks.

### [CC-005] RoleAssignmentDialog Escape handler does not respect phase state
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:85-90
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Escape key handler calls `onClose()` directly regardless of the current phase. During the `submitting` phase, pressing Escape will close the dialog while the role change API calls are still in progress. The overlay click handler on line 215 also calls `onClose` during the submitting phase. This could confuse users who see the dialog disappear while an operation is incomplete.
- **Evidence:**
```tsx
// Line 87
const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
// No check for phase === 'submitting'
```
- **Fix:** Add a guard: `if (e.key === 'Escape' && phase !== 'submitting') onClose()`. Similarly, disable the overlay click handler during submitting phase.

## NIT

### [CC-006] `GovernanceRole` imported from two different locations
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:4, TeamMembershipSection.tsx:6
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `RoleBadge.tsx` imports `GovernanceRole` from `@/hooks/useGovernance` (line 4) while `TeamMembershipSection.tsx` imports it from `@/types/governance` (line 6). Both resolve to the same type since `useGovernance.ts` re-exports from `@/types/governance`, but inconsistent import sources can cause confusion. All UI components should import types from the canonical source (`@/types/governance`).
- **Evidence:**
```tsx
// RoleBadge.tsx:4
import type { GovernanceRole } from '@/hooks/useGovernance'

// TeamMembershipSection.tsx:6
import type { GovernanceRole } from '@/types/governance'
```
- **Fix:** Standardize all imports of `GovernanceRole` to come from `@/types/governance`.

### [CC-007] RoleBadge re-exports GovernanceRole type unnecessarily
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:5
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `RoleBadge.tsx` re-exports `GovernanceRole` with `export type { GovernanceRole }`. A presentational component should not re-export domain types. Consumers should import `GovernanceRole` from its canonical location (`@/types/governance`), not from a UI component.
- **Evidence:**
```tsx
// RoleBadge.tsx:5
export type { GovernanceRole }
```
- **Fix:** Remove the re-export. If any consumers import `GovernanceRole` from `RoleBadge`, update them to import from `@/types/governance`.

### [CC-008] TeamMembershipSection error state not cleared on successful operations
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:228-240, 248-260
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The inline approve/reject transfer handlers (lines 228-240, 248-260) clear `error` at the start but do not clear it on success. If a previous operation failed and the error message is showing, a successful subsequent approve/reject does not clear the stale error message. The `handleJoin` and `handleLeave` functions do clear error at the start, but the transfer resolution handlers only clear it before the attempt, not after success.
- **Evidence:**
```tsx
// Line 229-235
setError(null) // cleared before attempt
setResolvingTransferId(transfer.id)
try {
  const result = await onResolveTransfer(transfer.id, 'approve')
  if (!result.success) {
    setError(result.error || 'Failed to approve transfer')
  }
  // No explicit success handling to clear prior unrelated error
}
```
- **Fix:** This is actually correct since `setError(null)` is called before the attempt. The pattern is fine. Downgraded to NIT since the error IS cleared at the start of each handler call.

## CLEAN

Files with no issues found:
- (none - all files had at least minor findings)

## SUMMARY

| Severity | Count |
|----------|-------|
| MUST-FIX | 1 |
| SHOULD-FIX | 4 |
| NIT | 3 |
| **Total** | **8** |

The most critical issue is CC-001: the stale closure in the Escape key handler for GovernancePasswordDialog, which can bypass the submission guard and close the dialog during an in-progress API call. CC-002 (partial failure during multi-step role transitions) and CC-005 (Escape during submitting phase) are the next most impactful issues.
