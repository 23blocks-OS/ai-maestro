# Code Correctness Report: components-hooks

**Agent:** epcp-code-correctness-agent
**Domain:** components-hooks
**Files audited:** 19
**Date:** 2026-02-22T00:00:00Z
**Pass:** 7 (after 6 prior fix passes)

## MUST-FIX

No MUST-FIX issues found.

## SHOULD-FIX

### [CC-P7-A7-001] AgentProfileTab (zoom) handleSave does not reset saving state on non-OK response
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:169-176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the save API returns a non-OK response, the component does not call `setSaving(false)`. It only sets it to false after a 500ms delay on the success path (`setTimeout(() => setSaving(false), 500)`). If the response is not OK and not a network error (caught by the catch block), `saving` remains `true` forever, leaving the Save button in a stuck spinner state.
- **Evidence:**
```typescript
// lines 169-177
if (response.ok) {
  setHasChanges(false)
  setTimeout(() => setSaving(false), 500)
}
// NO else branch to setSaving(false) on non-OK response
```
- **Fix:** Add an `else` branch that calls `setSaving(false)` on non-OK responses, matching the pattern already used in the sibling `AgentProfile.tsx` (see lines 222-229 with CC-P1-702 fix). Example:
```typescript
if (response.ok) {
  setHasChanges(false)
  setTimeout(() => setSaving(false), 500)
} else {
  const errData = await response.json().catch(() => ({ error: 'Save failed' }))
  console.error('Failed to save agent:', errData.error || response.statusText)
  setSaving(false)
}
```
- **Note:** The sibling component `AgentProfile.tsx` already has this fix (annotated CC-P1-702), but `AgentProfileTab.tsx` was not patched identically.

### [CC-P7-A7-002] AgentProfileTab (zoom) repositories list uses array index as React key
- **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:610-612
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The repositories list in AgentProfileTab uses `key={idx}` (array index) as the React key for repository items. This can cause incorrect rendering when repositories are added, removed, or reordered. The sibling `AgentProfile.tsx` already uses a stable key (`repo.remoteUrl || repo.localPath || idx` with annotation SF-019), but this file was not updated.
- **Evidence:**
```tsx
// line 610-612 in AgentProfileTab.tsx
{repositories.map((repo, idx) => (
  <div
    key={idx}   // unstable key
```
vs AgentProfile.tsx line 793:
```tsx
key={repo.remoteUrl || repo.localPath || idx}  // stable key (SF-019)
```
- **Fix:** Change `key={idx}` to `key={repo.remoteUrl || repo.localPath || idx}` to match the pattern in AgentProfile.tsx (SF-019).

### [CC-P7-A7-003] TerminalView localStorage reads not wrapped in try/catch
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:507-526
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Multiple `localStorage.getItem` calls in TerminalView's useEffect hooks (lines 507-526 for notes and prompt loading) are not wrapped in try/catch, while the `notesCollapsed` initializer at line 57 IS wrapped (annotated SF-018). In private browsing or when localStorage is full, these unprotected reads will throw and crash the component during mount. The `localStorage.setItem` calls at lines 531-565 are also unprotected.
- **Evidence:**
```typescript
// line 507-516 — unprotected read
useEffect(() => {
  const key = `agent-notes-${storageId}`
  const savedNotes = localStorage.getItem(key)  // can throw
  ...
}, [])

// line 518-527 — unprotected read
useEffect(() => {
  const key = `agent-prompt-${storageId}`
  const savedPrompt = localStorage.getItem(key)  // can throw
  ...
}, [])

// line 530-532 — unprotected write
useEffect(() => {
  localStorage.setItem(`agent-notes-${storageId}`, notes)  // can throw
}, [notes, storageId])
```
vs the protected pattern at line 57-64:
```typescript
try {
  const savedCollapsed = localStorage.getItem(collapsedKey)
  ...
} catch {
  // localStorage unavailable (private browsing, storage full, etc.)
}
```
- **Fix:** Wrap all `localStorage.getItem` and `localStorage.setItem` calls in try/catch blocks, consistent with the SF-018 pattern already used in the same file.

## NIT

### [CC-P7-A7-004] TerminalView uses deprecated document.execCommand('copy')
- **File:** /Users/emanuelesabetta/ai-maestro/components/TerminalView.tsx:161
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `handleTerminalCopy` function has a fallback path that uses `document.execCommand('copy')`, which is deprecated by the Web API standard. While it serves as a fallback for contexts where Clipboard API fails, this should be noted for future removal.
- **Evidence:**
```typescript
// line 161
document.execCommand('copy')
```
- **Fix:** No immediate fix needed. Document for future removal when Clipboard API support is universal.

### [CC-P7-A7-005] RepoScanner unmount does not abort in-flight scan
- **File:** /Users/emanuelesabetta/ai-maestro/components/plugin-builder/RepoScanner.tsx:19
- **Severity:** NIT
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `RepoScanner` component stores an `AbortController` in a ref (`abortRef`) and aborts previous scans when starting a new one, but does not abort on component unmount. If the component unmounts during a scan, the fetch resolves and calls `setScanResult`/`setError` on an unmounted component (React will log a warning in dev mode, though it's a no-op in production since React 18).
- **Evidence:**
```typescript
// line 19 — ref created but no cleanup effect
const abortRef = useRef<AbortController | null>(null)
// No useEffect(() => { return () => abortRef.current?.abort() }, [])
```
- **Fix:** Add a cleanup effect: `useEffect(() => { return () => { abortRef.current?.abort() } }, [])` matching the pattern used in `SkillPicker.tsx` (line 58) and `BuildAction.tsx` (lines 35-40).

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/components/governance/GovernancePasswordDialog.tsx` -- No issues. Well-structured dialog with proper state reset, escape key handling, double-submit guard, and error handling.
- `/Users/emanuelesabetta/ai-maestro/components/governance/RoleBadge.tsx` -- No issues. Clean component with exhaustive switch, safe String() coercion for default case (CC-P1-708).
- `/Users/emanuelesabetta/ai-maestro/components/governance/RoleAssignmentDialog.tsx` -- No issues. Proper state reset on open/close, AbortController for fetch, Promise.allSettled for partial failure reporting (CC-003), correct escape key handling.
- `/Users/emanuelesabetta/ai-maestro/components/governance/TeamMembershipSection.tsx` -- No issues. Clean component with proper click-outside handling, transfer request flow, error/info messaging.
- `/Users/emanuelesabetta/ai-maestro/components/Header.tsx` -- No issues. Simple presentational component with proper URL encoding for activeAgentId.
- `/Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx` -- No issues. Proper cleanup of save-success timer, AbortController for governance fetch, portal for modal, resolvingIds set management.
- `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/BuildAction.tsx` -- No issues. AbortController for polling (SF-022), poll failure counting, cleanup on unmount.
- `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/PluginComposer.tsx` -- No issues. Pure presentational component with proper skill grouping.
- `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx` -- No issues. Proper abort cleanup on unmount, useMemo for filtering, accessible keyboard handlers.
- `/Users/emanuelesabetta/ai-maestro/components/teams/TeamOverviewSection.tsx` -- No issues. Proper state sync with team prop, COS removal guard (CC-P1-710), duplicate add prevention (CC-007).
- `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` -- No issues. Well-structured hook with AbortController, isMountedRef (SF-023), isMutatingRef (SF-016), proper null guards, documented known limitations (TOCTOU).
- `/Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts` -- No issues. Clean hook with AbortController (MF-005), optimistic updates with revert, safe key filtering (CC-007).
- `/Users/emanuelesabetta/ai-maestro/hooks/useTerminal.ts` -- No issues. Dynamic imports, WebGL inline loading, debounced resize, bracketed paste, proper cleanup chain.
- `/Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts` -- No issues. Callback refs for stale closure prevention, exponential backoff (SF-011), permanent failure code 4000 handling.
- `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx` -- No issues. Proper error handling on save (CC-P1-702), stable repo keys (SF-019), governance integration.
- `/Users/emanuelesabetta/ai-maestro/components/MessageCenter.tsx` -- No issues. Double-delete confirmation, governance reachability filtering, toast notifications with timer cleanup, pagination.

## Test Coverage Notes

- No test files were found in the domain for any of these 19 files. The hooks (`useGovernance`, `useTeam`, `useTerminal`, `useWebSocket`) contain significant business logic that would benefit from unit tests, particularly:
  - `useGovernance`: mutation locking, role derivation, refresh abort handling
  - `useTeam`: optimistic update/revert cycle, safe key filtering
  - `useWebSocket`: reconnection backoff timing, permanent failure handling
  - `useTerminal`: WebGL fallback, paste normalization

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P7-A7-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P7-d9ea0473-5d18-4c24-b8ed-cb623bda65a3.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
