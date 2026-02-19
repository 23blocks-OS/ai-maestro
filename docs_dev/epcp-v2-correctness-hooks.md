# Code Correctness Report: hooks

**Agent:** epcp-code-correctness-agent
**Domain:** hooks
**Files audited:** 2
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Race condition: stale `refresh()` response when `agentId` changes rapidly
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:63-100
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `refresh` callback fires three parallel fetches and unconditionally writes results to state. If `agentId` changes while fetches are in-flight (e.g., user clicks between agents quickly), the older fetch's `.then()` handler will overwrite state with data that no longer matches the current `agentId`. Because `refresh` is re-created via `useCallback([agentId])`, the old closure's `setLoading`/`setAllTeams`/etc. still reference the same state setters. There is no cancellation (AbortController) and no staleness guard (e.g., checking a ref against current agentId before calling setState).
- **Evidence:**
  ```typescript
  // Line 63-100
  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/governance').then(...)  // <-- no AbortController
      fetch('/api/teams').then(...)
      fetch('/api/governance/transfers?status=pending').then(...)
    ])
      .then(([govData, teamsData, transfersData]) => {
        // These run even if agentId changed since the fetch started
        setHasPassword(govData.hasPassword ?? false)
        setAllTeams(teamsData.teams ?? [])
        setPendingTransfers(transfersData.requests ?? [])
      })
      ...
  }, [agentId])
  ```
  The `useEffect` on line 103-105 calls `refresh()` whenever `agentId` changes, but does not return a cleanup function to abort the prior fetch.
- **Fix:** Add an `AbortController` in the `useEffect` that calls `refresh`. Pass the signal to each `fetch()`. In the cleanup, call `controller.abort()`. Alternatively, use a ref to track the latest agentId and guard the `.then()` handler:
  ```typescript
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [agentId, refresh])
  ```

### [CC-002] Race condition: `addAgentToTeam` and `removeAgentFromTeam` use read-modify-write without atomicity
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:164-228
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both `addAgentToTeam` (line 164) and `removeAgentFromTeam` (line 199) perform a read-then-write pattern: they fetch the current team, modify `agentIds` locally, then PUT the result back. If two concurrent calls target the same team (e.g., rapid UI clicks, or two components calling simultaneously), the second call reads stale data before the first write completes, and its PUT will silently overwrite the first call's changes. This is a classic TOCTOU (time-of-check/time-of-use) race.
- **Evidence:**
  ```typescript
  // Line 168-184 (addAgentToTeam)
  const teamRes = await fetch(`/api/teams/${teamId}`)  // READ
  const team: Team = teamData.team
  const updatedAgentIds = team.agentIds.includes(targetAgentId)
    ? team.agentIds
    : [...team.agentIds, targetAgentId]
  const res = await fetch(`/api/teams/${teamId}`, {     // WRITE
    method: 'PUT',
    body: JSON.stringify({ agentIds: updatedAgentIds }),
  })
  ```
- **Fix:** This is fundamentally a server-side issue (the API should accept `addAgent`/`removeAgent` as atomic operations rather than requiring a full agentIds replacement). On the client side, a simple mitigation is to serialize calls per-team using a ref-based mutex, or disable the UI button while an operation is pending.

### [CC-003] Unnecessary `managerId` in `addAgentToTeam` dependency array
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:196
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `addAgentToTeam` callback includes `managerId` in its dependency array, but the function body does not reference `managerId` at all. The comment on line 178 says "Server enforces team membership rules; no client-side allTeams check needed", confirming the old client-side check was removed. The stale dependency causes unnecessary callback re-creation whenever the manager changes, which triggers re-renders in consumers that depend on `addAgentToTeam` referential equality.
- **Evidence:**
  ```typescript
  // Line 164-197
  const addAgentToTeam = useCallback(
    async (teamId: string, targetAgentId: string): Promise<...> => {
      // ... function body does NOT use managerId ...
    },
    [refresh, managerId]  // <-- managerId is unused
  )
  ```
- **Fix:** Remove `managerId` from the dependency array: `[refresh]`.

### [CC-004] `useTeam` optimistic update does not revert on network error (thrown exception path)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:43-57
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateTeam`, an optimistic update is applied on line 46, then the fetch is performed. If the fetch throws a network error (not just a non-ok response), the function throws to the caller on line 47-48 without reverting the optimistic state. The revert via `fetchTeam()` only happens on line 53 for HTTP error responses (`!res.ok`). A `TypeError: Failed to fetch` (network down, CORS, etc.) will leave the UI showing data that was never persisted.
- **Evidence:**
  ```typescript
  // Line 43-57
  const updateTeam = useCallback(async (updates) => {
    if (!teamId) return
    setTeam(prev => prev ? { ...prev, ...updates, ... } : prev)  // optimistic
    const res = await fetch(...)  // <-- throws on network error
    if (!res.ok) {
      await fetchTeam()  // revert only for HTTP errors
      throw new Error('Failed to update team')
    }
    const data = await res.json()
    setTeam(data.team)
  }, [teamId, fetchTeam])
  ```
- **Fix:** Wrap the entire fetch+response handling in try/catch, and call `fetchTeam()` in the catch block to revert the optimistic update before re-throwing:
  ```typescript
  try {
    const res = await fetch(...)
    if (!res.ok) { await fetchTeam(); throw ... }
    const data = await res.json()
    setTeam(data.team)
  } catch (err) {
    await fetchTeam()
    throw err
  }
  ```

## NIT

### [CC-005] `refresh()` does not use `agentId` in its function body
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:63-100
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `refresh` callback declares `[agentId]` as its dependency, but the function body never references `agentId`. The three fetch URLs (`/api/governance`, `/api/teams`, `/api/governance/transfers?status=pending`) are all global endpoints without an agentId parameter. The dependency causes unnecessary re-creation of `refresh` when agentId changes (the `useEffect` already handles re-calling it). This is not a bug per se (the agentId dependency ensures refresh is re-triggered when agentId changes via the effect), but it is misleading -- the real driver of re-fetching is the `useEffect`, not the closure needing a new agentId.
- **Evidence:**
  ```typescript
  const refresh = useCallback(() => {
    // agentId never used in body
    setLoading(true)
    Promise.all([
      fetch('/api/governance')...      // no agentId
      fetch('/api/teams')...           // no agentId
      fetch('/api/governance/transfers?status=pending')...  // no agentId
    ])
    ...
  }, [agentId])  // <-- agentId not used in body
  ```
- **Fix:** Remove `agentId` from the dependency array. The `useEffect` already depends on `agentId` directly, so changing agentId will still trigger a re-fetch because `refresh` is called from within that effect.

### [CC-006] `useTeam` starts with `loading: true` but never resets if `teamId` is initially null
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:16,33-38
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The hook initializes `loading` to `true` on line 16. When `teamId` is null, the `useEffect` (line 33-38) sets `loading` to `false`. This works correctly but only after the first render cycle. During the initial render, consumers see `loading: true` and `team: null`, which may briefly flash a loading spinner even though there is nothing to load. This is cosmetic only.
- **Evidence:**
  ```typescript
  const [loading, setLoading] = useState(true)   // line 16
  // ...
  useEffect(() => {
    if (!teamId) {
      setTeam(null)
      setLoading(false)  // corrected on next render cycle
      return
    }
    ...
  }, [teamId, fetchTeam])
  ```
- **Fix:** Initialize `loading` based on whether teamId is provided: `useState(teamId !== null)`.

### [CC-007] Six separate `useState` setters in `refresh()` cause up to 6 re-renders per refresh in React 17
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:80-96
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `.then()` handler calls 6 state setters sequentially (lines 81-86), plus `setLoading(false)` in `.finally()`. In React 18+ with automatic batching, these are batched into a single re-render. However, if this code ever runs in React 17 or in a non-React-scheduled context (e.g., native setTimeout, non-React event handler), each setter triggers a separate re-render. Given the project uses React 18, this is a minor concern but worth noting for resilience.
- **Evidence:**
  ```typescript
  .then(([govData, teamsData, transfersData]) => {
    setHasPassword(govData.hasPassword ?? false)      // re-render 1
    setHasManager(govData.hasManager ?? false)         // re-render 2
    setManagerId(govData.managerId ?? null)             // re-render 3
    setManagerName(govData.managerName ?? null)         // re-render 4
    setAllTeams(teamsData.teams ?? [])                  // re-render 5
    setPendingTransfers(transfersData.requests ?? [])   // re-render 6
  })
  ```
- **Fix:** Consider consolidating into a single state object via `useReducer` or a single `useState` with an object shape. Not urgent given React 18 batching.

## CLEAN

Files with no issues found:
- _None - both files have findings_

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 4 |
| NIT | 3 |
| **Total** | **7** |

The hooks are generally well-structured with proper `useCallback`/`useMemo` usage and correct dependency arrays (with one exception). The main concerns are race conditions from uncontrolled concurrent fetches (CC-001, CC-002) and the missing optimistic-update revert on network errors (CC-004). None of these are crash-level bugs, but CC-001 and CC-004 can produce visible UI inconsistencies under real-world usage patterns.
