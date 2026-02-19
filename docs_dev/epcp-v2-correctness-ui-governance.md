# Code Correctness Report: ui-governance

**Agent:** epcp-code-correctness-agent
**Domain:** ui-governance
**Files audited:** 4
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

_No must-fix issues found._

## SHOULD-FIX

### [CC-001] Double-click on password confirm can fire onPasswordConfirmed multiple times
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:79-83
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `confirm` mode, `handleSubmit` calls `onPasswordConfirmed(password)` without setting `submitting = true` first. The submit button's `isSubmitDisabled` does not guard against rapid clicks in confirm mode, only in setup mode (where `setSubmitting(true)` is called on line 58). If the user double-clicks the Confirm button rapidly, `onPasswordConfirmed` fires multiple times.
- **Evidence:**
  ```typescript
  // Lines 79-83 — confirm mode branch
  } else {
    // Confirm mode: pass the password back to the caller for server-side validation
    onPasswordConfirmed(password)
    setPassword('')
  }
  ```
  Compare to setup mode (line 58) which correctly calls `setSubmitting(true)` before the async work.
- **Fix:** Add `setSubmitting(true)` at the start of the confirm branch and `setSubmitting(false)` after `onPasswordConfirmed` returns (or wrap in try/finally). Alternatively, add a guard `if (submitting) return` at the top of `handleSubmit`.

### [CC-002] Partial failure in sequential role-change API calls leaves governance in inconsistent state
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:139-180
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleRoleChange` performs multiple sequential API calls (e.g., remove COS from N teams, then assign manager). If the first API call succeeds but a subsequent one fails, the error is caught and shown, but the already-executed operations are not rolled back. For example, if switching from COS (2 teams) to manager: the first `assignCOS(team1, null)` succeeds, the second `assignCOS(team2, null)` fails — the agent is now COS of only team2 but not manager, an unintended intermediate state.
- **Evidence:**
  ```typescript
  // Lines 153-160 — COS removal followed by manager assignment
  if (currentRole === 'chief-of-staff') {
    for (const team of governance.cosTeams) {
      const result = await governance.assignCOS(team.id, null, password)
      if (!result.success) throw new Error(...)
    }
  }
  const result = await governance.assignManager(agentId, password)
  if (!result.success) throw new Error(...)
  ```
- **Fix:** Consider adding a `refresh()` call in the catch block so the UI reloads actual server state. Alternatively, implement a batch/transactional endpoint on the backend for composite role changes. At minimum, document this limitation or add a "Retry" that re-reads current state.

### [CC-003] Stale info message after transfer request persists through subsequent actions
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:88,277-285
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a transfer request is created (line 88), `setInfoMessage(...)` displays a blue info bar. This message persists indefinitely until the user manually clicks the X dismiss button. If the user subsequently performs other actions (joining an open team, leaving a team), the stale "Transfer request sent" message remains visible, potentially confusing.
- **Evidence:**
  ```typescript
  // Line 88 — message set
  setInfoMessage(`Transfer request sent. Awaiting approval from ${sourceTeam.name}'s Chief-of-Staff.`)

  // Lines 277-285 — only dismissed by user click
  {infoMessage && (
    <div className="text-xs text-blue-400 px-1 mt-1 flex items-center gap-1">
      <Clock className="w-3 h-3" />
      {infoMessage}
      <button onClick={() => setInfoMessage(null)} ...>
        <X className="w-3 h-3" />
      </button>
    </div>
  )}
  ```
  Note: `handleJoin` clears `error` on line 72 but never clears `infoMessage`. `handleLeave` (line 109) also never clears `infoMessage`.
- **Fix:** Clear `infoMessage` at the start of `handleJoin` and `handleLeave` (add `setInfoMessage(null)` alongside `setError(null)`).

## NIT

### [CC-004] No Escape key handler on GovernancePasswordDialog overlay
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:92-204
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The dialog responds to Enter key on inputs (lines 147-148, 169-170) but does not handle the Escape key to dismiss the dialog. This is a common accessibility expectation for modal dialogs (WAI-ARIA dialog pattern). The backdrop div on line 95 also lacks `onClick={handleClose}` for click-to-dismiss.
- **Evidence:**
  ```typescript
  // Line 95 — backdrop div, no onClick
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
  ```
- **Fix:** Add a `useEffect` that listens for `keydown` Escape events when `isOpen` is true and calls `handleClose()`. Optionally add `onClick={handleClose}` to the backdrop div.

### [CC-005] No Escape key handler on RoleAssignmentDialog overlay
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:205-383
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** Same as CC-004 but for `RoleAssignmentDialog`. No Escape key handler, no backdrop click-to-close. The `motion.div` has `onClick={(e) => e.stopPropagation()}` (line 211) suggesting backdrop-close was considered, but the backdrop div (line 206) has no `onClick`.
- **Evidence:**
  ```typescript
  // Line 206 — backdrop div, no onClick
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
    <motion.div
      ...
      onClick={(e) => e.stopPropagation()} // Prevents bubbling, but nothing to bubble to
    >
  ```
- **Fix:** Add `onClick={onClose}` to the backdrop div (line 206) and add an Escape key listener.

### [CC-006] Re-export chain for GovernanceRole type is unnecessarily long
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:4-5, TeamMembershipSection.tsx:6
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `GovernanceRole` is defined in `types/governance.ts`, re-exported through `hooks/useGovernance.ts`, re-exported through `RoleBadge.tsx`, and consumed by `TeamMembershipSection.tsx`. The chain is: `types/governance.ts` -> `hooks/useGovernance.ts` -> `RoleBadge.tsx` -> `TeamMembershipSection.tsx`. `TeamMembershipSection` should import directly from `types/governance.ts` or `hooks/useGovernance.ts` rather than from `RoleBadge.tsx` (a sibling UI component).
- **Evidence:**
  ```typescript
  // TeamMembershipSection.tsx:6
  import type { GovernanceRole } from '@/components/governance/RoleBadge'

  // Should be:
  import type { GovernanceRole } from '@/types/governance'
  ```
- **Fix:** Change the import in `TeamMembershipSection.tsx` to import from `@/types/governance` directly. This removes a coupling between sibling UI components for a type definition.

### [CC-007] Only first closed source team used for transfer request
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:82
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When an agent in a closed team tries to join another team, only the first closed source team is used as `sourceTeam` for the transfer request (line 82: `closedSourceTeams[0]`). If the agent belongs to multiple closed teams with different COS leaders, only one COS is asked for approval. This may be intentional (an agent can only be in one closed team at a time by business rule) but is not enforced in this code.
- **Evidence:**
  ```typescript
  // Lines 76-83
  const closedSourceTeams = memberTeams.filter(t =>
    t.type === 'closed' && t.chiefOfStaffId && t.chiefOfStaffId !== agentId
  )
  if (closedSourceTeams.length > 0 && onRequestTransfer && agentRole !== 'manager') {
    const sourceTeam = closedSourceTeams[0] // Only first closed team
    const result = await onRequestTransfer(agentId, sourceTeam.id, teamId)
  ```
- **Fix:** If agents can belong to multiple closed teams, iterate over all `closedSourceTeams` and create transfer requests for each. If not (business rule prevents it), add a comment documenting this assumption.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx` — No issues. Clean conditional rendering, proper button/span distinction, accessible `type="button"`.
