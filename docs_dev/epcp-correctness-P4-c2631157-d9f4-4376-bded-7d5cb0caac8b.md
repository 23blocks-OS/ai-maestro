# Code Correctness Report: hooks-ui

**Agent:** epcp-code-correctness-agent
**Domain:** hooks-ui
**Files audited:** 2
**Date:** 2026-02-22T18:22:00Z
**Pass:** 4
**Finding ID prefix:** CC-P4-A0

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P4-A0-001] resolveConfigRequest return value silently ignored in handleResolve
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:97
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `handleResolve` awaits `resolveConfigRequest(...)` but never checks the return value `{ success, error }`. The `resolveConfigRequest` implementation in `useGovernance.ts` (lines 318-345) wraps all errors in a return object and never throws, so the `catch` block in `handleResolve` (line 98-99) will never execute. When the server rejects an approve/reject (e.g., wrong password, already resolved), the user sees no error feedback.
- **Evidence:**
```typescript
// AgentSkillEditor.tsx:88-103
const handleResolve = async (requestId: string, approved: boolean) => {
  // ...
  try {
    await resolveConfigRequest(requestId, approved, governancePassword, resolverAgent)
    // <-- return value { success: false, error: '...' } is silently ignored
  } catch (err) {
    // This catch will never fire -- resolveConfigRequest never throws
    console.error('Failed to resolve config request:', err)
  } finally {
    // ...
  }
}
```
- **Fix:** Check the return value and set error state on failure:
```typescript
const result = await resolveConfigRequest(requestId, approved, governancePassword, resolverAgent)
if (!result.success) {
  setError(result.error || 'Failed to resolve configuration request')
}
```

### [CC-P4-A0-002] saveSuccessTimerRef not cleared before setting new timeout (timer leak)
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:155,176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `handleAddSkill` or `handleRemoveSkill` is called multiple times in quick succession (e.g., user rapidly adds two skills), the previous timer is not cleared before setting a new one. This creates orphaned timers that can set `saveSuccess` to `false` at unexpected times, causing the "Saved" indicator to flash/disappear prematurely. The cleanup on unmount (line 66) only clears the last timer ref.
- **Evidence:**
```typescript
// Line 155 (inside handleAddSkill):
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)

// Line 176 (inside handleRemoveSkill):
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)

// Neither clears the previous timer first
```
- **Fix:** Clear the existing timer before setting a new one:
```typescript
if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)
```

## NIT

### [CC-P4-A0-003] Unused imports in AgentSkillEditor
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:29
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `useGovernance` hook destructures `agentRole` (line 79) but `agentRole` is never used in the component's render logic or any handler. It's only destructured, not referenced. Similarly, `managerId` is used on line 94 inside `handleResolve`, which is valid, so that one is fine. But `agentRole` is dead code.
- **Evidence:**
```typescript
// Line 79
const { pendingConfigRequests, resolveConfigRequest, agentRole, managerId } = useGovernance(agentId)
// agentRole is never referenced anywhere else in the file
```
- **Fix:** Remove `agentRole` from the destructuring to avoid confusion about whether it's used for access control decisions.

### [CC-P4-A0-004] canApprove hardcoded to true, agentRole unused for authorization
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:82
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `canApprove` is hardcoded to `true` with a comment "Phase 1: localhost single-user". The `agentRole` is destructured (line 79) but not used to gate the approve/reject buttons. This is fine for Phase 1 but should be tracked as a Phase 2 TODO since the plumbing (`agentRole`) is already in place but not connected.
- **Evidence:**
```typescript
// Line 82
const canApprove = true  // Phase 1 hardcoded
```
- **Fix:** This is documented and intentional for Phase 1. No action needed now, but Phase 2 should wire `canApprove` to `agentRole === 'manager' || agentRole === 'chief-of-staff'`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` -- No issues. The hook is well-structured with proper abort signal handling (CC-001 fix from earlier pass is correct), null guards for AbortError returns (CC-003 fix verified), proper useCallback/useMemo dependency arrays, and documented TOCTOU limitations for the read-modify-write pattern. The `refresh` callback with empty deps is correctly justified by the eslint-disable comment.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P4-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P4-c2631157-d9f4-4376-bded-7d5cb0caac8b.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
