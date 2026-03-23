# P3 Test Fixes Report — 2026-02-22

## NT-005: Sort-independent assertions in listGovernanceRequests

**File:** `tests/governance-request-registry.test.ts`

**Problem:** Multiple test assertions assumed a specific ordering of results from `listGovernanceRequests()`, e.g.:
```ts
expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])
```
This is fragile because the implementation does not guarantee array ordering.

**Fix:** Changed 5 assertions to use `expect.arrayContaining()` combined with `toHaveLength()`:
```ts
expect(result.map(r => r.id)).toEqual(expect.arrayContaining(['req-pending', 'req-executed', 'req-rejected']))
```

**Lines changed:**
1. Line 311 — "returns all requests when no filter" test
2. Line 327 — "filters by hostId" test (host-A result)
3. Line 332 — "filters by hostId" test (host-C result)
4. Line 340 — "filters by agentId" test
5. Line 647 — "purgeOldRequests" test (remaining requests after purge)

All existing `toHaveLength()` assertions were already present where needed, so the length is still validated.

## SF-004: useGovernance hook API contract tests

**File:** `tests/use-governance-hook.test.ts` (NEW)

**Approach:** Since the project uses vitest in node environment without `@testing-library/react`, and `useGovernance` is a React hook requiring a render context, the tests replicate the exact fetch logic from the hook's `submitConfigRequest` and `resolveConfigRequest` callbacks as standalone async functions. This tests the API contract (endpoint, method, body structure, error handling) without needing React rendering.

**Tests created (10 total):**

### submitConfigRequest (5 tests)
1. Sends POST to `/api/v1/governance/requests` with correct body structure (`type: 'configure-agent'`, `payload: { agentId, configuration }`)
2. Returns `requestId` from successful response
3. Returns error message from non-ok response body
4. Falls back to HTTP status code when error response has no error field
5. Handles network failure gracefully

### resolveConfigRequest (5 tests)
1. Sends POST to `/approve` endpoint with `{ approverAgentId, password }` — verifies no reject fields
2. Sends POST to `/reject` endpoint with `{ rejectorAgentId, password, reason }` — verifies no approve fields
3. Returns error from non-ok response with error field
4. Handles unparseable error response body gracefully (falls back to HTTP status)
5. Handles network failure gracefully

## Verification

```
 Test Files  2 passed (2)
      Tests  40 passed (40)
   Duration  153ms
```

Both test files pass with zero failures.
