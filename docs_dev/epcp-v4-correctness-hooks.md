# Code Correctness Report: hooks

**Agent:** epcp-code-correctness-agent
**Domain:** hooks
**Files audited:** 2
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

_None found._

## SHOULD-FIX

### [CC-001] Stale `agentId` closure in `requestTransfer` and `resolveTransfer` body payloads
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:253, 272
- **Severity:** SHOULD-FIX
- **Category:** logic (stale closure)
- **Confidence:** CONFIRMED
- **Description:** `requestTransfer` sends `requestedBy: agentId` (line 253) and `resolveTransfer` sends `resolvedBy: agentId` (line 272). Both callbacks correctly list `agentId` in their dependency arrays (lines 263, 282), so the closure will be recreated when `agentId` changes. However, the `agentId` parameter to `useGovernance` is typed `string | null`. If `agentId` is `null` at call time, the payloads send `requestedBy: null` / `resolvedBy: null` to the server. There is no guard like the one in `useTeam.updateTeam` (`if (!teamId) return`). If the server does not validate these fields, a transfer request could be created with `requestedBy: null`.
- **Evidence:**
  ```typescript
  // line 253 — agentId may be null
  body: JSON.stringify({ agentId: targetAgentId, fromTeamId, toTeamId, requestedBy: agentId, note }),
  // line 272 — agentId may be null
  body: JSON.stringify({ action, resolvedBy: agentId, rejectReason }),
  ```
- **Fix:** Add an early-return guard at the top of both callbacks: `if (!agentId) return { success: false, error: 'No agent selected' }`. This matches the defensive pattern used in `useTeam.updateTeam` (line 44).

### [CC-002] `refresh()` calls in mutation callbacks do not use AbortController, risking state updates after unmount
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:121, 140, 159, 199, 238, 257, 276
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `useEffect` on line 105 correctly creates an AbortController and passes its signal to `refresh()`. However, every mutation callback (`setPassword`, `assignManager`, `assignCOS`, `addAgentToTeam`, `removeAgentFromTeam`, `requestTransfer`, `resolveTransfer`) calls `refresh()` without any signal. If the component unmounts while the refresh triggered by a mutation is in flight, the `.then()` handler will call `setState` on an unmounted component. In React 18 strict mode this is a no-op warning, but it represents a logical race: stale data from a slow refresh could overwrite newer state.
- **Evidence:**
  ```typescript
  // line 121 — no signal passed
  refresh()
  return { success: true }
  ```
- **Fix:** Either (a) store the AbortController in a ref and pass `controllerRef.current.signal` to all `refresh()` calls, or (b) accept this as a minor issue since React 18 suppresses the warning. Documenting the decision would suffice if (b) is chosen.

### [CC-003] `useTeam.updateTeam` double-fetches on error (redundant revert)
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:54-62
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the PUT request returns a non-ok response, line 54 calls `await fetchTeam()` to revert the optimistic update, then throws. The caller's `catch` would typically also trigger a refresh. But more importantly, if the `fetch` on line 48 itself throws a network error, execution jumps to the `catch` block at line 59, which also calls `await fetchTeam()` then re-throws. The `fetchTeam` call on line 54 (HTTP error path) is correct. But the `catch` on line 60 calls `fetchTeam()` for ALL errors, including the case where the network is down — `fetchTeam()` will itself fail silently (it catches internally and sets error state), which is fine but wasteful. This is a minor inefficiency, not a bug.
- **Evidence:**
  ```typescript
  if (!res.ok) {
    await fetchTeam()  // Revert optimistic update on HTTP error
    throw new Error('Failed to update team')
  }
  // ...
  } catch (err) {
    await fetchTeam()  // Revert optimistic update on network error too
    throw err
  }
  ```
- **Fix:** The `catch` block's `fetchTeam()` is actually correct as defense-in-depth — it covers the case where `res.json()` on line 57 throws. No change required, but the comment on line 60 is slightly misleading (it's not just network errors — it also covers JSON parse failures after a successful PUT). Consider clarifying the comment.

### [CC-004] `useGovernance.refresh` silently swallows AbortError in per-fetch `.catch()` handlers
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:70, 73, 78
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Each of the three fetches in `Promise.all` has its own `.catch(() => defaultValue)`. When the AbortController fires (line 108), each fetch rejects with an `AbortError`. The per-fetch `.catch` handlers swallow this and return default values. Then the `.then()` on line 80 runs and checks `signal?.aborted` (line 81) to bail out — which is correct. However, there is a timing edge: between the abort and the `.then()` check, the code constructs three default-value objects. This is harmless but wasteful. More importantly, if a *real* network error occurs on one fetch while the other two succeed, the error is silently replaced with defaults, and the user sees a partially-defaulted state with no error indication.
- **Evidence:**
  ```typescript
  fetch('/api/governance', { signal }).then((r) => {
    if (!r.ok) throw new Error('Request failed')
    return r.json()
  }).catch(() => ({ hasPassword: false, hasManager: false, managerId: null, managerName: null })),
  ```
- **Fix:** Consider setting an error state when a fetch fails (not just on abort). Alternatively, distinguish `AbortError` from real errors in the per-fetch `.catch()`:
  ```typescript
  .catch((err) => {
    if (err.name === 'AbortError') return { hasPassword: false, ... }
    throw err  // Let real errors propagate to the outer .catch
  })
  ```

## NIT

### [CC-005] `useTeam` initial `loading` state is `true` but immediately set to `false` for null teamId
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:16
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `loading` is initialized to `true` (line 16), and the comment says "Set false immediately by useEffect when teamId is null". This means there is one render cycle where `loading` is `true` even though no fetch will occur. For consumers that show a spinner based on `loading`, there will be a brief flash. Initializing to `!teamId ? false : true` or just `!!teamId` would eliminate the flash.
- **Evidence:**
  ```typescript
  const [loading, setLoading] = useState(true)  // Set false immediately by useEffect when teamId is null
  ```
- **Fix:** `const [loading, setLoading] = useState(!!teamId)` — avoids the single-render flash when teamId is null on mount.

### [CC-006] `useGovernance.refresh` dependency array is empty — stable but opaque
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:102
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `refresh` is a `useCallback` with `[]` dependencies. This is correct because `refresh` only calls `fetch` and `setState` — neither of which are captured closures. However, `requestTransfer` (line 253) and `resolveTransfer` (line 272) capture `agentId` from the outer scope AND use `refresh` in their dep arrays. This is fine. The empty `[]` on `refresh` is intentional and correct — just noting it for reviewers since it could look suspicious at first glance. The `signal` parameter makes it work correctly despite the empty deps.
- **Evidence:**
  ```typescript
  const refresh = useCallback((signal?: AbortSignal) => {
    // ... uses only fetch + setState, no outer closures
  }, [])
  ```
- **Fix:** No fix needed. Consider adding a brief comment: `// No deps: only uses fetch + setState, signal is a parameter`.

### [CC-007] `useTeam.fetchTeam` does not set `loading` to `false` on its own
- **File:** /Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts:19-30
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `fetchTeam` is exposed as `refreshTeam` (line 70). When called by external consumers (e.g., after an action), it does not manage the `loading` state — it neither sets `loading: true` at the start nor `loading: false` at the end. Only the initial `useEffect` (line 33-41) manages loading via `.finally()`. This means if a consumer calls `refreshTeam()`, the `loading` flag remains unchanged throughout the refresh. This is inconsistent: the initial fetch shows a loading state, but manual refreshes don't.
- **Evidence:**
  ```typescript
  const fetchTeam = useCallback(async () => {
    if (!teamId) return
    try {
      const res = await fetch(`/api/teams/${teamId}`)
      // ... sets team and error, but never touches loading
    }
  }, [teamId])
  // ...
  refreshTeam: fetchTeam,  // Exposed to consumers without loading management
  ```
- **Fix:** Either wrap `fetchTeam` to manage loading, or document that `refreshTeam` does not affect the `loading` state. The current behavior is not a bug — just a potential surprise for consumers.

## CLEAN

Files with no critical issues found:
- `/Users/emanuelesabetta/ai-maestro/hooks/useTeam.ts` — Well-structured hook with proper dependency arrays, optimistic update with revert, and null guards. Minor nits only.
- `/Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts` — Solid implementation with AbortController in useEffect, proper useMemo derivations, and correct dependency arrays. Issues are defensive-coding gaps, not bugs.
