# Code Correctness Report: ui-governance

**Agent:** epcp-code-correctness-agent
**Domain:** ui-governance
**Files audited:** 7
**Date:** 2026-02-16T00:00:00Z

## MUST-FIX

### [CC-001] RoleBadge uses `<button>` without onClick, no type attribute — causes form submission and accessibility issues
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx:22-31
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** All three role renders use `<button>` elements, but when `onClick` is undefined (e.g., for 'manager' or 'chief-of-staff' roles rendered without an onClick prop), the button element has no type attribute. Buttons default to `type="submit"`, which would submit any parent `<form>`. The manager and chief-of-staff branches always render a `<button>` even when `onClick` is undefined, setting `cursor-default` but still allowing click/keyboard activation. For the 'normal' role, if there IS an onClick, there is still no `type="button"`.
- **Evidence:**
```tsx
<button
  onClick={onClick}
  className={`... ${onClick ? 'hover:bg-amber-500/30 cursor-pointer' : 'cursor-default'}`}
>
```
- **Fix:** Add `type="button"` to all three `<button>` elements. When `onClick` is undefined, consider using a `<span>` instead of `<button>` to avoid keyboard focusability on non-interactive elements, or add `disabled` when no onClick is provided.

### [CC-002] GovernancePasswordDialog exit animation never fires — AnimatePresence missing
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:83-91
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `motion.div` has `exit={{ opacity: 0, scale: 0.95 }}` defined, but it is conditionally rendered with `if (!isOpen) return null` at line 83, and there is no `<AnimatePresence>` wrapper in this component or its parent (RoleAssignmentDialog renders it inline). Without AnimatePresence, the exit animation is never triggered — the component is simply unmounted.
- **Evidence:**
```tsx
if (!isOpen) return null

return (
  <div className="fixed inset-0 ...">
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}  // ← never fires
```
- **Fix:** Either wrap with `<AnimatePresence>` in the parent component, or remove the dead `exit` prop since it creates false expectations about animation behavior.

## SHOULD-FIX

### [CC-003] AgentProfile.tsx useEffect missing `baseUrl` in dependency array
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:118
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The fetch agent effect at line 95-118 uses `baseUrl` in the fetch URL (`${baseUrl}/api/agents/${agentId}`) but the dependency array is `[isOpen, agentId]`. If `hostUrl` (and thus `baseUrl`) changes while the dialog is open, the effect won't re-run and will continue using the stale URL.
- **Evidence:**
```tsx
useEffect(() => {
  if (!isOpen || !agentId) return
  const fetchAgent = async () => {
    const response = await fetch(`${baseUrl}/api/agents/${agentId}`)
    ...
  }
  fetchAgent()
}, [isOpen, agentId])  // missing baseUrl
```
- **Fix:** Add `baseUrl` to the dependency array: `[isOpen, agentId, baseUrl]`.

### [CC-004] AgentProfile.tsx repos fetch effect missing `baseUrl` dependency
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:141
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-003 but for the repositories fetch effect. Uses `baseUrl` in fetch URL but dependency array is `[isOpen, agentId, expandedSections.repositories, reposLoaded]`.
- **Evidence:**
```tsx
}, [isOpen, agentId, expandedSections.repositories, reposLoaded])
```
- **Fix:** Add `baseUrl` to the dependency array.

### [CC-005] GovernancePasswordDialog state not reset when dialog re-opens in 'confirm' mode
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx:25-32
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `handleClose` function resets state, but this only runs on explicit close. When the dialog is closed and re-opened (isOpen transitions false→true), there is no `useEffect` watching `isOpen` to reset state. If a user enters a password, closes via backdrop click (parent sets isOpen=false), and re-opens, the stale password and error state from the previous session will be visible.
- **Evidence:**
```tsx
const handleClose = () => {
  if (submitting) return
  onClose()
  setPassword('')
  setConfirmPassword('')
  setError(null)
}
// No useEffect to reset state when isOpen changes
```
- **Fix:** Add a `useEffect` that resets form state when `isOpen` transitions to `true`:
```tsx
useEffect(() => {
  if (isOpen) {
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setSubmitting(false)
  }
}, [isOpen])
```

### [CC-006] RoleAssignmentDialog partially completed role changes leave inconsistent state on error
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:133-189
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `handleRoleChange`, multi-step transitions (e.g., COS→Manager requires removing COS from each team, then assigning manager) execute sequentially. If one step fails mid-sequence, the catch block sets the error phase but does not roll back the successful prior steps. For example, if demoting from COS to normal across 2 teams, and the second team removal fails, the first team removal has already been committed.
- **Evidence:**
```tsx
// Remove COS from all teams where this agent is COS
for (const team of governance.cosTeams) {
  const result = await governance.assignCOS(team.id, null, password)
  if (!result.success) throw new Error(...)
  // ← If this throws on 2nd iteration, 1st team COS removal already committed
}
```
- **Fix:** Document this as a known limitation, or implement a transaction-like pattern where all operations are validated before committing, or at minimum add a note in the error UI that partial changes may have been applied and a refresh should be performed.

### [CC-007] MessageCenter uses `as any` type assertions extensively, losing type safety
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:742, 794, 805, 965, 1019
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple places cast to `(msg as any).fromLabel`, `(selectedMessage as any).fromVerified`, `(selectedMessage as any).fromLabel`, `(selectedMessage as any).toLabel`. These properties should be declared on the `MessageSummary` and `Message` types rather than using unsafe `as any` casts. If the API changes or these fields are removed, there will be no compile-time error.
- **Evidence:**
```tsx
{(msg as any).fromLabel || msg.fromAlias || msg.from}
{(selectedMessage as any).fromVerified !== false ? ... }
{(selectedMessage as any).toLabel || msg.toAlias || msg.to}
```
- **Fix:** Add `fromLabel`, `toLabel`, and `fromVerified` to the `MessageSummary` and `Message` type interfaces in `@/lib/messageQueue`.

### [CC-008] MessageCenter polling effects missing dependencies
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:404-422
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both the initial fetch effect (line 404-410) and polling interval effect (line 412-422) list `[messageIdentifier, isActive]` as dependencies but call `fetchMessages`, `fetchSentMessages`, `fetchUnreadCount`, and `fetchSentCount` which are all `useCallback` instances. These are stable references due to useCallback, but the lint rule expects them in the dep array. More importantly, the `fetchMessages` and `fetchSentMessages` callbacks have `inboxLimit` and `sentLimit` in their own dependency arrays, so if limits change, the callbacks are recreated, but the polling interval won't restart since it doesn't depend on these callbacks.
- **Evidence:**
```tsx
useEffect(() => {
  if (!isActive) return
  fetchMessages()      // not in dep array
  fetchSentMessages()  // not in dep array
  fetchUnreadCount()   // not in dep array
  fetchSentCount()     // not in dep array
}, [messageIdentifier, isActive])
```
- **Fix:** Add the callback references to the dependency arrays. For the interval, this will cause it to restart when limits change, which is the correct behavior.

### [CC-009] AgentProfileTab duplicated Crown/Shield imports
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:11,21
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `Crown` and `Shield` are imported twice — once at line 11 (though only Shield is not in the main import block) and again at line 21 as a separate import statement from 'lucide-react'. This is a duplicate import. While some bundlers handle this gracefully, it indicates code maintenance issues and some bundlers/linters will flag or error on this.
- **Evidence:**
```tsx
// Line 2-12: first import from lucide-react (doesn't include Crown/Shield)
import { User, Briefcase, ... Terminal } from 'lucide-react'
// Line 21: separate import
import { Crown, Shield } from 'lucide-react'
```
- **Fix:** Consolidate into a single import statement from 'lucide-react'.

### [CC-010] TeamMembershipSection transfer resolution swallows errors
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx:224-226
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The approve/reject transfer buttons use inline async functions that call `onResolveTransfer` but do not handle the result. If the resolution fails (`result.success === false`), the error is silently ignored and the user receives no feedback.
- **Evidence:**
```tsx
onClick={async () => {
  setResolvingTransferId(transfer.id)
  try { await onResolveTransfer(transfer.id, 'approve') } finally { setResolvingTransferId(null) }
}}
```
- **Fix:** Check the result and set an error message if `!result.success`:
```tsx
const result = await onResolveTransfer(transfer.id, 'approve')
if (!result.success) setError(result.error || 'Failed to approve transfer')
```

## NIT

### [CC-011] RoleAssignmentDialog existingCos conditional uses redundant check
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:289-294
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ternary to compute `existingCos` checks `governance.allTeams.length > 0` as a condition for showing the COS name, but this will always be true at this point because we are inside `closedTeams.map()` and `closedTeams` is derived from `governance.allTeams`. The check is always truthy and the null branch is dead code.
- **Evidence:**
```tsx
const existingCos =
  team.chiefOfStaffId && team.chiefOfStaffId !== agentId
    ? governance.allTeams.length > 0   // ← always true here
      ? `(current COS: ${resolveAgentName(team.chiefOfStaffId)})`
      : null                           // ← dead code
    : null
```
- **Fix:** Simplify to:
```tsx
const existingCos =
  team.chiefOfStaffId && team.chiefOfStaffId !== agentId
    ? `(current COS: ${resolveAgentName(team.chiefOfStaffId)})`
    : null
```

### [CC-012] RoleAssignmentDialog exit animation never fires (same as parent)
- **File:** /Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx:207-210
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Like CC-002, the `motion.div` at line 207 has only `initial` and `animate` props (no `exit`), which is correct since there's no AnimatePresence. However, the component does conditional rendering at line 191 (`if (!isOpen) return null`), so the `initial` animation runs on every open — this is fine, but worth noting there is no exit animation by design.
- **Evidence:** N/A — this is informational, no bug here.

### [CC-013] AgentProfile and AgentProfileTab have large code duplication
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx and /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both components share nearly identical logic for: field editing, tag management, avatar picking, save handling, repo detection, governance integration, metric display, and documentation editing. The only significant differences are: AgentProfile has `isOpen`/`onClose` modal behavior and lazy loading, while AgentProfileTab is embedded as a tab. This creates a high maintenance burden — bugs fixed in one may not be fixed in the other.
- **Fix:** Extract shared logic into a custom hook (e.g., `useAgentProfile`) and shared sub-components to reduce duplication.

### [CC-014] MessageCenter copy dropdown click-outside detection is fragile
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:425-437
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The click-outside handler for the copy dropdown checks `!target.closest('.relative')` which will match ANY element with class `relative` as an ancestor, not just the dropdown's container. This is fragile because many Tailwind components use `relative`.
- **Evidence:**
```tsx
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.relative')) {
    setShowCopyDropdown(false)
  }
}
```
- **Fix:** Use a ref on the dropdown container and check `ref.current.contains(target)` instead of relying on a CSS class selector.

### [CC-015] MessageCenter select elements missing accessible labels
- **File:** /Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx:1240-1266
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The Priority and Type `<select>` elements have visible `<label>` elements but no `htmlFor`/`id` pairing, and no `name` or `aria-label` attributes. Screen readers may not associate the labels with the selects.
- **Evidence:**
```tsx
<label className="block text-sm font-medium text-gray-300 mb-1">
  Priority:
</label>
<select
  value={composePriority}
  // No id, no name, no aria-label
```
- **Fix:** Add `id` attributes to selects and matching `htmlFor` to labels, e.g., `id="compose-priority"` and `htmlFor="compose-priority"`.

## CLEAN

Files with no issues found:
- (None — all files had at least minor issues)

## SUMMARY

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 8 |
| NIT | 5 |
| **Total** | **15** |

The two MUST-FIX items are: (1) `<button>` elements without `type="button"` that can accidentally submit forms, and (2) a dead exit animation creating false expectations. The SHOULD-FIX items are primarily around missing useEffect dependencies, swallowed errors in transfer resolution, `as any` type casts bypassing type safety, and partial role change atomicity. The NITs are code quality and accessibility improvements.
