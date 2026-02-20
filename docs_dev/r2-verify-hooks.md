# R2 Hooks Correctness Verification Report

**Date:** 2026-02-19
**Source report:** docs_dev/epcp-v5-correctness-hooks.md
**Files verified:** hooks/useGovernance.ts, hooks/useTeam.ts

## Summary

| Finding | Severity | Status |
|---------|----------|--------|
| CC-001 | MUST-FIX | FIXED |
| CC-002 | MUST-FIX | PARTIAL |
| CC-003 | SHOULD-FIX | FIXED |
| CC-004 | SHOULD-FIX | FIXED |
| CC-005 | SHOULD-FIX | FIXED |
| CC-006 | SHOULD-FIX | PARTIAL |
| CC-007 | SHOULD-FIX | PARTIAL |
| CC-008 | NIT | FIXED |
| CC-009 | NIT | FIXED |
| CC-010 | NIT | PARTIAL |

**Totals: 6 FIXED, 4 PARTIAL, 0 UNFIXED**

---

## Detailed Verification

### CC-001: Stale state after AbortError in `refresh()` — FIXED

**Report said:** `.finally()` on line 111 runs `setLoading(false)` even after abort, causing state updates on unmounted components.

**Current code (useGovernance.ts:113-117):**
```typescript
.finally(() => {
  // CC-001: Prevent setting state on aborted/stale requests
  if (signal?.aborted) return
  setLoading(false)
})
```

**Verification:** The `.finally()` block now checks `signal?.aborted` before calling `setLoading(false)`. This prevents the stale state update described in the report. FIXED.

---

### CC-002: `refresh()` called without AbortSignal after mutations — PARTIAL

**Report said:** All mutation callbacks call `refresh()` without passing an AbortSignal, meaning post-mutation refreshes cannot be cancelled.

**Current code (e.g., useGovernance.ts:141, 160, 179, 221, 262, 282):**
```typescript
refresh() // CC-002: Intentionally fire-and-forget — user-initiated mutation, we want the updated state
```

**Verification:** The code has CC-002 comments acknowledging the pattern, but the calls still invoke `refresh()` without a signal. The comments indicate this is now an intentional design decision ("fire-and-forget" for user-initiated mutations) rather than an oversight. However, the underlying issue (no cancellation of post-mutation refreshes if agent changes rapidly) still technically exists. The report's suggested fix (pass AbortController signal or store a ref) was NOT implemented. Marked PARTIAL because the team acknowledged the issue and documented the intentional tradeoff, but did not implement the technical fix.

---

### CC-003: `govData`, `teamsData`, `transfersData` can be undefined — FIXED

**Report said:** AbortError catch returns `undefined`, and the `.then()` block accesses properties on potentially undefined values.

**Current code (useGovernance.ts:94-95):**
```typescript
if (signal?.aborted) return  // Stale response guard
// CC-003: Guard against undefined data (AbortError catch returns undefined)
if (!govData || !teamsData || !transfersData) return
```

**Verification:** An explicit null guard was added at line 95 that checks all three data objects before accessing any properties. This prevents the `TypeError` described in the report. FIXED.

---

### CC-004: Double `fetchTeam()` call on optimistic update revert — FIXED

**Report said:** When `res.ok` is false, `fetchTeam()` is called to revert, then the throw propagates to the catch block which calls `fetchTeam()` again.

**Current code (useTeam.ts:57-67):**
```typescript
if (!res.ok) {
  // CC-004: Don't call fetchTeam() here — the throw propagates to the catch block
  // which already calls fetchTeam() to revert the optimistic update
  throw new Error('Failed to update team')
}
const data = await res.json()
setTeam(data.team)
} catch (err) {
  await fetchTeam()  // Revert optimistic update on network error too
  throw err
}
```

**Verification:** The `fetchTeam()` call was removed from the `!res.ok` branch (lines 57-60). Only the catch block at line 65 now calls `fetchTeam()`. The double-fetch is eliminated. FIXED.

---

### CC-005: `refreshTeam` does not manage loading state — FIXED

**Report said:** The exposed `refreshTeam` function (which is `fetchTeam`) does not set `loading = true/false`, creating inconsistent UX.

**Current code (useTeam.ts:75-83):**
```typescript
// CC-005: refreshTeam wraps fetchTeam with loading state for consistent UX
refreshTeam: async () => {
  setLoading(true)
  try {
    await fetchTeam()
  } finally {
    setLoading(false)
  }
},
```

**Verification:** `refreshTeam` is no longer a direct alias for `fetchTeam`. It is now wrapped in a function that sets `loading = true` before the fetch and `loading = false` in a `finally` block. FIXED.

---

### CC-006: `addAgentToTeam` and `removeAgentFromTeam` TOCTOU race — PARTIAL

**Report said:** Both functions do GET team, modify agentIds, PUT team — classic read-modify-write race condition.

**Current code (useGovernance.ts:188-194, 230-236):**
```typescript
// KNOWN LIMITATION (Phase 1): Client-side read-modify-write pattern.
// Two concurrent browser tabs modifying the same team's agentIds can cause lost updates.
// CC-006: TOCTOU race — Server validates via validateTeamMutation, so client-side
// optimistic update may be reverted if the server rejects the mutation.
// TODO Phase 2: Replace with atomic server-side POST /api/teams/{id}/members endpoint
// that accepts { action: 'add'|'remove', agentId: string } and performs the operation
// under withLock, eliminating the race condition entirely.
```

**Verification:** The race condition still exists in the code. The response was to add detailed documentation (CC-006 comments and TODO for Phase 2) acknowledging the issue and planning the atomic server-side endpoint fix. Server-side validation via `validateTeamMutation` provides some safety, but the TOCTOU race is not eliminated. Marked PARTIAL because the issue is acknowledged, documented, and deferred to Phase 2 with a clear plan, but not technically fixed.

---

### CC-007: `updateTeam` optimistic update spread may add invalid keys — PARTIAL

**Report said:** Spreading `updates` directly into the team object could merge unexpected extra properties.

**Current code (useTeam.ts:47-50):**
```typescript
// CC-007: Optimistic update — server validates via validateTeamMutation.
// TypeScript's excess property checking on object literals limits `updates` to declared keys,
// but structural typing could allow extra keys at runtime; server is the authority.
setTeam(prev => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev)
```

**Verification:** The code still uses the same spread pattern. The response was to add a CC-007 comment acknowledging that the server is the authority and TypeScript provides compile-time guardrails. The report's suggested fix (explicitly picking allowed keys) was NOT implemented. Marked PARTIAL because the risk is documented and mitigated by server-side validation, but the client-side code was not changed.

---

### CC-008: `fetchTeam` does not set `error` to null on new fetch attempt — FIXED

**Report said:** When `fetchTeam` is called, it only clears `error` on success, causing stale errors to persist during loading.

**Current code (useTeam.ts:21):**
```typescript
setError(null) // CC-008: Clear stale error at start so UI doesn't show old error during fetch
```

**Verification:** `setError(null)` is now called at the beginning of `fetchTeam`, before the `try` block. This clears any stale error immediately when a new fetch begins. FIXED.

---

### CC-009: `refresh` callback has empty dependency array — FIXED

**Report said:** The empty deps array on `refresh` useCallback hides intent; `refresh` in the useEffect deps never triggers re-execution.

**Current code (useGovernance.ts:118-129):**
```typescript
// CC-009: Empty deps is intentional — refresh only uses fetch (global) + setState (stable),
// signal is passed as a parameter. refresh never changes identity, which is the desired behavior.
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])

useEffect(() => {
  const controller = new AbortController()
  refresh(controller.signal)
  return () => controller.abort()
// eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable (empty deps), only agentId triggers re-fetch
}, [agentId])
```

**Verification:** Both the `useCallback` and the `useEffect` now have explicit eslint-disable comments explaining the intentional behavior. The `refresh` dependency was removed from the `useEffect` deps array, replaced with just `[agentId]`, and the rationale is documented. This addresses the report's suggestion for clarity. FIXED.

---

### CC-010: `updateTeam` throws error to caller — PARTIAL

**Report said:** `updateTeam` throws errors (unlike `useGovernance` which returns `{ success, error }`), creating inconsistent error patterns between hooks.

**Current code (useTeam.ts:43-44, 64-67):**
```typescript
// CC-010: updateTeam throws on error to allow callers to handle in try/catch.
// This is a deliberate pattern — unlike useGovernance which returns { success, error } objects.
...
} catch (err) {
  await fetchTeam()
  throw err
}
```

**Verification:** The code still throws errors to the caller. The response was to document this as a deliberate design choice via a CC-010 comment. The report's suggested fix (aligning with useGovernance's return pattern) was NOT implemented. The inconsistency remains, but is now documented. Marked PARTIAL because the issue is acknowledged but the behavioral inconsistency was not resolved.
