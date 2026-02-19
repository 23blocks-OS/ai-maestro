# Code Correctness Report: hooks

**Agent:** epcp-code-correctness-agent
**Domain:** hooks
**Files audited:** 1
**Date:** 2026-02-16T00:00:00Z

## MUST-FIX

### [CC-001] Race condition: COS removal guard runs AFTER filtering the agent out
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:202-207
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `removeAgentFromTeam`, the code first computes `updatedAgentIds` by filtering out `targetAgentId` (line 202), then checks if the agent is the COS (line 205). The guard returns an error, which is correct, but only AFTER the filter operation has already been computed. While the filtered array is not sent to the server in that case (the early return prevents it), the real problem is that the guard should run BEFORE computing the update to make the intent clear and avoid future refactoring bugs. More critically, if someone later adds optimistic state updates using `updatedAgentIds` before the guard check, the COS would be incorrectly removed from the local state.

  **However**, the more pressing issue is the ordering logic itself. The guard at line 205 checks `team.chiefOfStaffId === targetAgentId`, but this check happens after the network fetch of the team (line 197). Between the fetch and the PUT, the COS could have changed server-side (TOCTOU race). The server enforces this too (comment says so), so the functional impact is low, but the client-side guard gives a false sense of security.
- **Evidence:**
  ```typescript
  // Line 202: filter runs first
  const updatedAgentIds = team.agentIds.filter((id: string) => id !== targetAgentId)

  // Line 205-207: guard runs second
  if (team.chiefOfStaffId === targetAgentId) {
    return { success: false, error: 'Cannot remove the Chief-of-Staff...' }
  }
  ```
- **Fix:** Move the COS guard check (lines 205-207) BEFORE the filter operation (line 202). This makes the intent clear and prevents future bugs if optimistic updates are added.

## SHOULD-FIX

### [CC-002] Stale closure: `agentId` not in `refresh` dependency array
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:60-88
- **Severity:** SHOULD-FIX
- **Category:** logic (stale closure / React hook dependency)
- **Confidence:** CONFIRMED
- **Description:** The `refresh` callback (line 60) has an empty dependency array `[]` (line 88). While `refresh` itself does not directly use `agentId`, the `useEffect` on line 91-93 includes both `agentId` and `refresh` in its dependency array. Since `refresh` never changes (stable reference due to `[]`), the effect re-runs when `agentId` changes, which is correct. However, there is a subtle issue: the derived values (`agentRole`, `cosTeams`, `memberTeams`) are computed inline using `agentId` on every render (lines 40-58). These computations reference `agentId` directly from the closure, so they are always up-to-date. This is currently correct but fragile -- if `refresh` is later refactored to use `agentId` (e.g., to fetch agent-specific governance data), the stale closure will silently produce wrong results. Consider adding `agentId` to the dependency array of `refresh` for defensive correctness.
- **Evidence:**
  ```typescript
  const refresh = useCallback(() => {
    // Does not use agentId currently, but this could change
    setLoading(true)
    Promise.all([...])
    // ...
  }, [])  // <-- empty deps, agentId not included
  ```
- **Fix:** Add `agentId` to the `refresh` dependency array: `}, [agentId])`. This ensures that if `refresh` ever uses `agentId` in the future, it will have the correct value. The behavioral impact now is minimal (refresh would be a new function reference when agentId changes, but the useEffect already handles this).

### [CC-003] `addAgentToTeam` has stale `allTeams` in dependency — multi-closed-team guard may use stale data
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:167-174, 190
- **Severity:** SHOULD-FIX
- **Category:** logic (stale closure)
- **Confidence:** CONFIRMED
- **Description:** The `addAgentToTeam` callback includes `allTeams` in its dependency array (line 190), which is correct for re-creating the callback when teams change. However, between when the callback is created and when it's invoked, `allTeams` could be stale if the user clicks "add agent" while a background refresh is in flight. The multi-closed-team guard at line 168-174 uses `allTeams` from the closure and `managerId` from the closure. If teams changed server-side (e.g., agent was added to another closed team by another user/process), the client-side guard would pass but the server would reject. This is mitigated by the server-side enforcement (stated in the comment), but the UX is misleading -- the request goes to the server and then fails, instead of showing the client-side error.
- **Evidence:**
  ```typescript
  // Line 168: uses closure values that may be stale
  const isPrivileged = targetAgentId === managerId || allTeams.some(t => t.type === 'closed' && t.chiefOfStaffId === targetAgentId)
  ```
- **Fix:** Consider calling `refresh()` at the start of `addAgentToTeam` (before the guard check) to ensure fresh data, or accept the TOCTOU window and rely on server enforcement (current approach is reasonable but document the limitation).

### [CC-004] No response body validation -- `res.json()` can throw on non-JSON responses
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:64-66, 103, 122, 141, 156-158, 197-199, 233, 252
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** All `fetch().then(r => r.json())` and `await res.json()` calls assume the server returns valid JSON. If the server returns a non-JSON response (e.g., HTML error page from Next.js, 502 from a proxy, empty body), `res.json()` will throw a `SyntaxError`. In the `refresh` function (line 63-87), the outer `.catch()` handles this. But in the mutation callbacks (`setPassword`, `assignManager`, etc.), the `res.json()` call at e.g., line 103 is inside a try/catch, so the SyntaxError would be caught -- but the error message would be cryptic ("Unexpected token < in JSON...") rather than a user-friendly message.
- **Evidence:**
  ```typescript
  // Line 103-104
  const data = await res.json()  // throws SyntaxError if not JSON
  if (!res.ok) return { success: false, error: data.error || 'Failed to set password' }
  ```
- **Fix:** Add a guard before `res.json()`: check `res.ok` first and if not ok, check `content-type` header before parsing. Or wrap `res.json()` specifically with a friendlier error message.

### [CC-005] `refresh` in `Promise.all` does not check individual response `.ok` status
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:63-74
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `refresh` function calls `Promise.all` with three fetches (lines 64-66). Each `.then(r => r.json())` parses the body regardless of HTTP status. If `/api/governance` returns a 500 error with `{ error: "..." }`, the code would set `hasPassword` to `false` (via `govData.hasPassword ?? false`), silently using error response data as if it were success data. The third fetch has a `.catch(() => ({ requests: [] }))` guard, but the first two do not.
- **Evidence:**
  ```typescript
  Promise.all([
    fetch('/api/governance').then((r) => r.json()),       // No .ok check
    fetch('/api/teams').then((r) => r.json()),             // No .ok check
    fetch('/api/governance/transfers?status=pending').then((r) => r.json()).catch(() => ({ requests: [] })),
  ])
  ```
- **Fix:** Add `.ok` checks for each fetch response before parsing JSON, or add `.catch()` handlers similar to the transfers fetch. For example:
  ```typescript
  fetch('/api/governance').then(r => { if (!r.ok) throw new Error('governance fetch failed'); return r.json() })
  ```

## NIT

### [CC-006] `Team.type` is optional but compared without explicit undefined handling
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:43-44, 52, 167-170
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `Team` type declares `type?: TeamType` (optional). The hook compares `t.type === 'closed'` in multiple places. This works correctly because `undefined === 'closed'` is `false`, so teams without a `type` field are treated as non-closed (effectively open). This is logically correct behavior but relies on implicit undefined handling. A comment or explicit check would improve clarity.
- **Evidence:**
  ```typescript
  // types/team.ts line 19
  type?: TeamType  // optional

  // hooks/useGovernance.ts line 43-44
  const isCOS = allTeams.some(
    (t) => t.type === 'closed' && t.chiefOfStaffId === agentId  // works because undefined !== 'closed'
  )
  ```
- **Fix:** No code change needed, but a comment like `// undefined type defaults to 'open' behavior` would clarify intent.

### [CC-007] Derived values (`agentRole`, `cosTeams`, `memberTeams`) recompute on every render
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:40-58
- **Severity:** NIT
- **Category:** logic (performance)
- **Confidence:** CONFIRMED
- **Description:** `agentRole`, `cosTeams`, and `memberTeams` are computed inline on every render via IIFE and `.filter()` calls. With typical team counts (< 100), this is negligible. However, if the hook is used in a component that re-renders frequently (e.g., during terminal streaming), these computations run unnecessarily. Using `useMemo` would prevent recomputation when `agentId`, `managerId`, and `allTeams` haven't changed.
- **Evidence:**
  ```typescript
  // Recomputed every render
  const agentRole: GovernanceRole = (() => { ... })()
  const cosTeams = agentId ? allTeams.filter(...) : []
  const memberTeams = agentId ? allTeams.filter(...) : []
  ```
- **Fix:** Wrap in `useMemo`:
  ```typescript
  const agentRole = useMemo(() => { ... }, [agentId, managerId, allTeams])
  const cosTeams = useMemo(() => agentId ? allTeams.filter(...) : [], [agentId, allTeams])
  const memberTeams = useMemo(() => agentId ? allTeams.filter(...) : [], [agentId, allTeams])
  ```

### [CC-008] Return type of `requestTransfer` and `resolveTransfer` not explicitly annotated on `useCallback`
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:225-242, 244-261
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `requestTransfer` and `resolveTransfer` callbacks do not have explicit return type annotations on the async function. TypeScript infers the return type, which matches the `GovernanceState` interface. However, the other callbacks (`setPassword`, `assignManager`, `assignCOS`) DO have explicit return type annotations (e.g., `: Promise<{ success: boolean; error?: string }>`). For consistency and to catch future drift between the callback and the interface, explicit annotations should be added.
- **Evidence:**
  ```typescript
  // Line 96: has explicit return type
  async (pw: string, currentPw?: string): Promise<{ success: boolean; error?: string }> => {

  // Line 226: no explicit return type
  async (targetAgentId: string, fromTeamId: string, toTeamId: string, note?: string) => {
  ```
- **Fix:** Add explicit return type annotations to `requestTransfer` and `resolveTransfer` to match the pattern used by other callbacks.

## CLEAN

Files with no issues found:
- (none -- the single file audited has findings)
