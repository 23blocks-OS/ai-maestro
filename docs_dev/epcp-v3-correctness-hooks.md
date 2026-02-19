# Code Correctness Report: hooks

**Agent:** epcp-code-correctness-agent
**Domain:** hooks
**Files audited:** 2
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

### [CC-001] Double fetchTeam on HTTP error in updateTeam (useTeam.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:54-62
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the PUT response is not OK (`!res.ok` on line 53), `fetchTeam()` is called on line 54 to revert the optimistic update, then `throw new Error(...)` is thrown on line 55. This throw is caught by the `catch` block on line 59, which calls `fetchTeam()` AGAIN on line 60. The result is two redundant network requests to fetch the team on every HTTP error.
- **Evidence:**
```typescript
// Line 53-62
if (!res.ok) {
  await fetchTeam()  // First revert call
  throw new Error('Failed to update team')
}
// ...
} catch (err) {
  await fetchTeam()  // Second revert call - REDUNDANT on HTTP errors
  throw err
}
```
- **Fix:** Remove `await fetchTeam()` from line 54 (inside the `!res.ok` block). The catch block on line 60 already handles reverting for ALL error cases (HTTP errors and network errors). Alternatively, remove the catch-block fetchTeam and only keep the one in the `!res.ok` branch, but then network errors would not revert. The cleanest fix:
```typescript
if (!res.ok) {
  throw new Error('Failed to update team')  // Let catch handle revert
}
```

### [CC-002] AbortError triggers state reset to empty defaults (useGovernance.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:90-98
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the `useEffect` cleanup aborts a stale request (line 108), the fetch promises reject with `AbortError`. The individual `.catch()` handlers on lines 70, 74, 78 return safe defaults, so the `.then()` on line 80 still runs with fallback data. However, the abort guard on line 81 (`if (signal?.aborted) return`) prevents state updates, which is correct. But if the abort happens after the individual fetches succeed but before the `.then()` processes them, the timing creates a race where `.catch()` on line 90 may still fire. More critically: if all three fetches complete but the processing in `.then()` throws for any reason (e.g., accessing a property on unexpected data shape), the outer `.catch()` on line 90 resets ALL state to empty defaults with no abort check. This means a parsing error wipes all governance state.
- **Evidence:**
```typescript
// Lines 90-98 - no abort signal check
.catch(() => {
  // On fetch failure, reset to safe defaults
  setHasPassword(false)
  setHasManager(false)
  setManagerId(null)
  setManagerName(null)
  setAllTeams([])
  setPendingTransfers([])
})
```
- **Fix:** Add abort signal check in the `.catch()` block:
```typescript
.catch(() => {
  if (signal?.aborted) return  // Don't reset state for aborted requests
  setHasPassword(false)
  // ... rest of resets
})
```
Also add the same guard in `.finally()`:
```typescript
.finally(() => {
  if (!signal?.aborted) setLoading(false)
})
```

## SHOULD-FIX

### [CC-003] Nullable agentId sent as requestedBy/resolvedBy in transfer operations (useGovernance.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:249,268
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `useGovernance` hook receives `agentId: string | null`. In `requestTransfer` (line 249) and `resolveTransfer` (line 268), `agentId` is passed directly as `requestedBy` and `resolvedBy` in the request body. The `TransferRequest` type defines `requestedBy: string` (non-nullable) and `resolvedBy?: string` (optional but not nullable). Sending `null` for these fields violates the type contract. If `agentId` is null, these operations should either be guarded or the null should be handled.
- **Evidence:**
```typescript
// Line 249
body: JSON.stringify({ agentId: targetAgentId, fromTeamId, toTeamId, requestedBy: agentId, note }),
// agentId can be null, but TransferRequest.requestedBy is `string` (not nullable)

// Line 268
body: JSON.stringify({ action, resolvedBy: agentId, rejectReason }),
// Same issue: agentId can be null
```
- **Fix:** Add null guards at the start of both functions:
```typescript
const requestTransfer = useCallback(async (...) => {
  if (!agentId) return { success: false, error: 'No agent selected' }
  // ...
})

const resolveTransfer = useCallback(async (...) => {
  if (!agentId) return { success: false, error: 'No agent selected' }
  // ...
})
```

### [CC-004] Read-modify-write race condition in addAgentToTeam and removeAgentFromTeam (useGovernance.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:171-241
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both `addAgentToTeam` and `removeAgentFromTeam` follow a GET-modify-PUT pattern: they fetch the current team, modify the `agentIds` array locally, then PUT the full array back. If two operations execute concurrently (e.g., rapid button clicks, or two browser tabs), the second PUT will overwrite the first's changes. The code has comments acknowledging this (lines 168-170, 206-208) and notes UI buttons are disabled during operations, but the functions themselves have no locking mechanism.
- **Evidence:**
```typescript
// Lines 175-191 (addAgentToTeam) - GET then PUT pattern
const teamRes = await fetch(`/api/teams/${teamId}`)
const teamData = await teamRes.json()
const team: Team = teamData.team
const updatedAgentIds = team.agentIds.includes(targetAgentId)
  ? team.agentIds : [...team.agentIds, targetAgentId]
const res = await fetch(`/api/teams/${teamId}`, {
  method: 'PUT',
  body: JSON.stringify({ agentIds: updatedAgentIds }),
})
```
- **Fix:** Implement server-side atomic add/remove endpoints (e.g., `POST /api/teams/:id/agents/:agentId` and `DELETE /api/teams/:id/agents/:agentId`) to avoid the client-side read-modify-write pattern. This is already noted in the code comments as the proper fix.

## NIT

### [CC-005] Refresh after mutations is fire-and-forget (useGovernance.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:121,140,159,197,234,253,272
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `refresh()` function returns `void` (not a Promise), so callers after mutations (e.g., `setPassword`, `assignManager`, etc.) call `refresh()` without awaiting it. The governance data shown in the UI may briefly be stale between when the mutation succeeds and when the refresh completes. In React this is usually acceptable since state updates trigger re-renders, but if a caller chains operations (e.g., set password then assign manager), the second operation may see stale state.
- **Evidence:**
```typescript
// Line 121 in setPassword
refresh()  // Not awaited, refresh is void-returning
return { success: true }
```
- **Fix:** Consider making `refresh` return a `Promise<void>` and awaiting it in mutation callbacks. This would require changing the interface signature on line 20 and returning the Promise chain from the function body.

### [CC-006] useTeam updateTeam sends lastActivityAt in body but not in optimistic update (useTeam.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:46,51
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The optimistic update on line 46 sets `updatedAt` to current time, but the actual PUT body on line 51 sends `lastActivityAt` (not `updatedAt`). The optimistic update and the actual request disagree on which timestamp field is updated. This is not a functional bug since the server response on line 58 overwrites the optimistic state, but it means the brief optimistic state has `updatedAt` set but `lastActivityAt` unchanged, which is the reverse of what the server will actually do.
- **Evidence:**
```typescript
// Line 46 - optimistic update sets updatedAt
setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)

// Line 51 - PUT body sends lastActivityAt
body: JSON.stringify({ ...updates, lastActivityAt: new Date().toISOString() }),
```
- **Fix:** Align the optimistic update to also set `lastActivityAt`, or remove the `updatedAt` from the optimistic update if the server handles it:
```typescript
setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() } : prev)
```

## CLEAN

Files with no issues found:
- (none -- both files have findings)

---

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 2 |
| NIT | 2 |
| **Total** | **6** |
