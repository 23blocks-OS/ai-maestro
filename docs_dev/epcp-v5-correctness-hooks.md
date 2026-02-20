# Code Correctness Report: hooks

**Agent:** epcp-code-correctness-agent
**Domain:** hooks
**Files audited:** 2
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] Stale state after AbortError in `refresh()` — `setLoading(false)` still runs
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:71,79,87,93,111-113
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a fetch is aborted (component unmount or agentId change), the individual `.catch()` handlers on lines 70-72, 78-80, 86-88 swallow the AbortError by returning `undefined`. The `Promise.all` resolves with `[undefined, undefined, undefined]`. The `.then()` on line 92 checks `signal?.aborted` and returns early, which is correct. However, the `.finally()` on line 111 still executes `setLoading(false)`. This calls `setLoading` on a potentially unmounted component (React 18 suppresses the warning, but in React 19+ this could throw). More critically, when `agentId` changes rapidly (e.g., user clicking through agents), this creates a race: the stale request's `.finally()` sets `loading=false` before the new request completes, causing a brief flash where `loading` is false but the data is from the old agent.
- **Evidence:**
  ```typescript
  // Line 70-72: AbortError returns undefined instead of re-throwing
  .catch((err) => {
    if (err?.name === 'AbortError') return // Returns undefined
    ...
    return { hasPassword: false, ... }
  }),
  // Line 92-93: stale guard checks signal, but...
  .then(([govData, teamsData, transfersData]) => {
    if (signal?.aborted) return  // Stale response guard
    ...
  })
  // Line 111-113: ...finally ALWAYS runs, even after abort
  .finally(() => {
    setLoading(false)  // Runs on unmounted/stale component
  })
  ```
- **Fix:** Move the `setLoading(false)` inside the `.then()` block (after the stale guard passes) and inside the `.catch()` block. Or add `if (signal?.aborted) return` at the start of `.finally()`.

### [CC-002] `refresh()` called without AbortSignal after mutations — no cancellation of stale refreshes
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:133,152,171,211,250,270,290
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** All mutation callbacks (`setPassword`, `assignManager`, `assignCOS`, `addAgentToTeam`, `removeAgentFromTeam`, `requestTransfer`, `resolveTransfer`) call `refresh()` without passing an `AbortSignal`. This means these refreshes cannot be cancelled. If the user performs a mutation, then quickly switches agents (which aborts the `useEffect`'s controller), the mutation's `refresh()` call is still in-flight and will update state with data from the wrong context. Additionally, if two mutations happen in quick succession, both trigger `refresh()` but neither cancels the other, leading to out-of-order state updates.
- **Evidence:**
  ```typescript
  // Line 133
  refresh() // TODO: Pass AbortController signal to post-mutation refresh
  // Line 152
  refresh() // TODO: Pass AbortController signal to post-mutation refresh
  // (repeated at lines 171, 211, 250, 270, 290)
  ```
- **Fix:** Each mutation should create its own AbortController or accept a signal parameter. At minimum, store a ref to the latest AbortController from the useEffect and pass its signal to post-mutation refreshes.

## SHOULD-FIX

### [CC-003] `govData`, `teamsData`, `transfersData` can be `undefined` — no null guard
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:92-100
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** When a fetch throws a non-AbortError, the `.catch()` returns a default object like `{ hasPassword: false, ... }`. But when an AbortError occurs, the `.catch()` returns `undefined` (line 71: just `return`). Even though line 93 checks `signal?.aborted`, this is only a guard against the `signal` being aborted — not against the data being `undefined`. If the governance fetch is aborted but the teams fetch is not (e.g., due to timing), `govData` could be `undefined` while `teamsData` is valid. The nullish coalescing on line 95 (`govData.hasPassword ?? false`) would then throw `TypeError: Cannot read properties of undefined (reading 'hasPassword')`.
- **Evidence:**
  ```typescript
  // Line 70-72 — returns undefined on AbortError
  .catch((err) => {
    if (err?.name === 'AbortError') return  // undefined!
    ...
  }),
  // Line 95 — accesses property on potentially undefined
  setHasPassword(govData.hasPassword ?? false) // TypeError if govData is undefined
  ```
- **Fix:** Either re-throw AbortError so `Promise.all` rejects (and the outer `.catch()` handles it), or add explicit `if (!govData || !teamsData || !transfersData) return` guard before accessing properties.

### [CC-004] Double `fetchTeam()` call on optimistic update revert in useTeam
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:54,60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateTeam`, when `res.ok` is false, line 54 calls `await fetchTeam()` to revert the optimistic update, then throws. The `catch` block on line 59-61 catches this thrown error and calls `await fetchTeam()` again. This results in two sequential fetches to the same endpoint for the same revert operation, wasting bandwidth and causing a flicker.
- **Evidence:**
  ```typescript
  if (!res.ok) {
    await fetchTeam()  // Line 54: First revert fetch
    throw new Error('Failed to update team')
  }
  ...
  } catch (err) {
    await fetchTeam()  // Line 60: Second revert fetch (catches the throw from line 55)
    throw err
  }
  ```
- **Fix:** Remove the `await fetchTeam()` from line 54 (inside the `!res.ok` branch). The throw will propagate to the catch block which already calls `fetchTeam()`. Or remove the `fetchTeam()` from the catch block and only revert in the `!res.ok` case (but then network errors won't revert).

### [CC-005] `refreshTeam` does not manage loading state — inconsistent UX
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:70
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `refreshTeam` function is exposed as `fetchTeam` which does not set `loading = true` before fetching or `loading = false` after. This means consumers who call `refreshTeam()` cannot rely on the `loading` flag to show a spinner. The comment on line 70 acknowledges this, but it creates an inconsistent contract: initial fetch sets loading, manual refresh does not.
- **Evidence:**
  ```typescript
  // Line 70
  refreshTeam: fetchTeam, // Note: refreshTeam does not manage loading state — only initial fetch does
  ```
- **Fix:** Either wrap `fetchTeam` in a loading-aware version for external consumption, or document clearly in the interface that `loading` only reflects initial load.

### [CC-006] `addAgentToTeam` and `removeAgentFromTeam` race condition — read-modify-write without locking
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:185-217,225-257
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both functions do GET team → modify agentIds → PUT team. Between the GET and PUT, another tab or concurrent call could modify the same team, and the PUT would overwrite those changes. The code has comments acknowledging this (lines 180-183, 220-223), but the issue is real and affects multi-tab usage.
- **Evidence:**
  ```typescript
  // Lines 189-206: Classic TOCTOU race
  const teamRes = await fetch(`/api/teams/${teamId}`)
  // ... time passes ...
  const res = await fetch(`/api/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify({ agentIds: updatedAgentIds }),
  })
  ```
- **Fix:** As noted in the TODO comments: implement atomic server-side `POST /api/teams/{id}/members` with `{ action: 'add'|'remove', agentId }`.

### [CC-007] `useTeam` `updateTeam` optimistic update uses spread that may add invalid keys to Team
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:46
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The optimistic update spreads `updates` directly into the team object: `{ ...prev, ...updates, updatedAt: ... }`. The `updates` parameter type includes `name`, `description`, `agentIds`, `instructions` — but it does NOT include fields like `type`, `chiefOfStaffId`, `id`, etc. If a caller passes unexpected extra properties (possible with TypeScript's structural typing), they would be merged into the local state, making it inconsistent with the server state.
- **Evidence:**
  ```typescript
  setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)
  ```
- **Fix:** Minor risk due to TypeScript's excess property checking on object literals. Consider explicitly picking allowed keys from `updates` before spreading.

## NIT

### [CC-008] `useTeam` `fetchTeam` does not set `error` to null on new fetch attempt
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:19-30
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `fetchTeam` is called, it only clears `error` on success (line 26: `setError(null)`). If the user triggers a refresh while a previous error is displayed, the stale error remains visible during the new fetch attempt until it either succeeds or fails with a new error. This creates a confusing UX where an old error message persists during loading.
- **Evidence:**
  ```typescript
  const fetchTeam = useCallback(async () => {
    if (!teamId) return
    try {
      // error is not cleared here at the start
      const res = await fetch(`/api/teams/${teamId}`)
      ...
      setError(null)  // Only cleared on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team')
    }
  }, [teamId])
  ```
- **Fix:** Add `setError(null)` at the beginning of `fetchTeam`, before the try block.

### [CC-009] `refresh` callback in useGovernance has empty dependency array — stable but hides intent
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:114
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `refresh` useCallback has an empty dependency array `[]` with a comment "No deps: only uses fetch + setState, signal is a parameter". While this is technically correct (fetch is global, setState is stable), ESLint's `react-hooks/exhaustive-deps` rule would not flag this since there are genuinely no reactive dependencies. However, the empty deps array means `refresh` never changes, which is good for stability but means the `useEffect` on line 117-121 has `refresh` as a dependency that never triggers re-execution — only `agentId` changes trigger it. This is correct behavior but could be clearer by removing `refresh` from the useEffect deps and using an eslint-disable comment.
- **Evidence:**
  ```typescript
  }, []) // No deps: only uses fetch + setState, signal is a parameter

  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [agentId, refresh])  // refresh never changes, only agentId triggers
  ```
- **Fix:** No functional change needed. Consider removing `refresh` from the dep array with an exhaustive-deps disable comment for clarity, or keep as-is since it's harmless.

### [CC-010] `useTeam` `updateTeam` throws error to caller — potential unhandled promise rejection
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:55,61-62
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The `updateTeam` function both reverts state AND re-throws the error. If the caller doesn't wrap the call in try/catch, this becomes an unhandled promise rejection. This contrasts with `useGovernance`'s mutation functions which return `{ success: false, error: ... }` and never throw. The inconsistent error reporting pattern between the two hooks could trip up consumers.
- **Evidence:**
  ```typescript
  // useTeam.ts — throws on error
  } catch (err) {
    await fetchTeam()
    throw err  // Caller must catch!
  }

  // useGovernance.ts — returns error object
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '...' }
  }
  ```
- **Fix:** Consider aligning `useTeam.updateTeam` with `useGovernance`'s pattern by returning `{ success: boolean; error?: string }` instead of throwing.

## CLEAN

Files with no issues found:
- (none — both files have findings)
