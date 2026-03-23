# Code Correctness Report: api-governance

**Agent:** epcp-code-correctness-agent
**Domain:** api-governance
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID Prefix:** CC-P9-A1
**Files audited:** 12
**Date:** 2026-02-23T03:11:00Z

## MUST-FIX

### [CC-P9-A1-001] Transfer resolve route: early return inside `finally` block leaks lock semantics
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:83-84
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `try` block on line 79 contains multiple early `return NextResponse.json(...)` statements (lines 84, 91, 102, 117-119, 129, 163) before the `finally` on line 166. While these returns do execute `releaseLock()` in the finally block (which is correct behavior), the early returns on lines 84, 102, and 117 happen **after team mutations may have started but before `saveTeams()`**. Specifically:
  - Line 84: Returns 404 if source team not found. This is safe (no mutation yet).
  - Line 91: Returns 403 if not authorized. Safe (no mutation yet).
  - Line 102: Returns 404 if destination team not found. Safe (no mutation yet).
  - Line 117: Returns 409 for closed-team constraint. Safe (no mutation yet).
  - Line 129: Returns 409 if `resolveTransferRequest` returns null. **Potential issue**: `resolveTransferRequest` was called on line 126 which already marked the transfer as approved/rejected on disk. If it returns null (concurrent resolve), the transfer status was already changed by another caller, so this is actually fine (the other caller handled it).

  Upon deeper trace: All early returns before `resolveTransferRequest()` on line 126 are pre-validation and safe. The only return after `resolveTransferRequest()` and before `saveTeams()` is line 129, which handles the case where `resolveTransferRequest` itself returned null (concurrent resolve detected). This is correct behavior.

  **RETRACTED** -- After full trace, the lock acquisition and release pattern is correct. The `finally` block always releases the lock, and the early returns are all in safe states. Downgrading to informational.

*(No MUST-FIX issues found after thorough analysis.)*

## SHOULD-FIX

### [CC-P9-A1-002] Transfer resolve: `auth.status` may be undefined, fallback to 401 may mask real status
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:32
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `AgentAuthResult` interface defines `status?: number` (optional). On line 32:
  ```typescript
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  ```
  The `|| 401` fallback is correct for the case where `status` is undefined, but if `authenticateAgent` returns `status: 0` (which would be a bug in the auth module), it would also fall through to 401 due to JavaScript's falsy evaluation of 0. The same pattern appears in `transfers/route.ts:60`.

  While `status: 0` is not a realistic HTTP status code, using nullish coalescing (`??`) instead of `||` would be more precise and defensive.
- **Evidence:**
  ```typescript
  // transfers/[id]/resolve/route.ts:32
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  // transfers/route.ts:60
  return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  ```
- **Fix:** Replace `auth.status || 401` with `auth.status ?? 401` in both locations.

### [CC-P9-A1-003] Governance GET route: `getAgent()` may return object without `.name` -- `managerName` coalesces to null
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts`:12
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** On line 12:
  ```typescript
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  ```
  If `getAgent()` returns an agent object whose `.name` is an empty string `""`, the `||` operator will coalesce it to `null` because empty string is falsy. This may hide agents with empty names. The manager POST route at `manager/route.ts:60` uses `agent.name || agent.alias`, which also has the same empty-string issue but at least falls back to alias.

  The GET route does not fall back to alias, so a manager with `name: ""` but a valid `alias` would show `managerName: null` in the GET response while the POST response would show the alias.
- **Evidence:**
  ```typescript
  // route.ts:12 (GET)
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  // manager/route.ts:60 (POST)
  return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  ```
- **Fix:** Use the same fallback pattern in both routes: `getAgent(config.managerId)?.name || getAgent(config.managerId)?.alias || null`, or better, extract the agent once and apply the fallback consistently.

### [CC-P9-A1-004] Governance requests POST: Missing top-level try/catch for local submission path
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:89-128
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler has two paths: remote receive (lines 45-87, wrapped in try/catch) and local submission (lines 89-128). The local submission path has its own try/catch around `submitCrossHostRequest` (lines 119-128), but the validation code on lines 89-116 runs **outside any try/catch**. If any of these validation lines throw an unexpected error (e.g., `body.payload` throws a getter trap from a Proxy, or `VALID_REQUESTED_BY_ROLES.has()` receives an unexpected type), the error would bubble up as an unhandled exception, causing a 500 with stack trace leak (Next.js would catch it but with less controlled error formatting).

  The remote receive path correctly wraps everything in try/catch (lines 46-86), but the local path has a gap.
- **Evidence:**
  ```typescript
  // Line 89-116: validation code outside try/catch
  if (!body.type || typeof body.type !== 'string') { ... }
  // ...many more validations...

  // Line 119: try/catch only starts here
  try {
    const result = await submitCrossHostRequest(body)
  ```
- **Fix:** Wrap the entire local submission path (lines 89-128) in a try/catch, or move the validation inside the existing try/catch block on line 119.

### [CC-P9-A1-005] Transfer resolve: `fromTeam!` and `toTeam!` non-null assertions after conditional checks
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:113,146
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Lines 113 and 146 use non-null assertions (`fromTeam!.id`, `toTeam!.id`) within `teams.find()` callbacks:
  ```typescript
  // Line 113
  t.type === 'closed' && t.id !== fromTeam!.id && t.id !== toTeam!.id && ...
  // Line 146
  const toIdx = teams.findIndex(t => t.id === toTeam!.id)
  ```
  While `fromTeam` is guaranteed non-null by the check on line 83, and `toTeam` is guaranteed non-null by the check on line 101 (for the approve path), these non-null assertions could become incorrect if future refactoring moves these checks. The `fromTeam` on line 113 references a variable declared on line 76 and validated on line 83, and `toTeam` validated on line 101 -- both are only accessible in the approve branch (line 97 `if (action === 'approve')`), so the assertions are currently correct but fragile.
- **Evidence:**
  ```typescript
  const otherClosedTeam = teams.find(t =>
    t.type === 'closed' && t.id !== fromTeam!.id && t.id !== toTeam!.id && t.agentIds.includes(agentId)
  )
  ```
- **Fix:** Consider narrowing the types earlier (e.g., re-assign to const with type guard after the null check) to avoid non-null assertions, or add a local const like `const validFromTeam = fromTeam` after the null check so TypeScript narrows the type.

### [CC-P9-A1-006] Governance requests GET: Reflected query parameter in error message (minor XSS vector in JSON API)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/route.ts`:138,146
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** Lines 138 and 146 reflect user-provided query parameters directly in the JSON error response:
  ```typescript
  { error: `Invalid status value '${statusParam}'. Must be one of: ...` }
  { error: `Invalid type value '${typeParam}'. Must be one of: ...` }
  ```
  While these are JSON responses (not HTML), reflected values in API error messages can become attack vectors if:
  1. A frontend renders these error messages in HTML without escaping
  2. The values contain special characters that affect downstream JSON parsers

  The comment on line 137 explicitly acknowledges this: "NT-035: Reflecting validated statusParam in error is acceptable for Phase 1 JSON API (not rendered in HTML)." This is a deliberate trade-off, but worth noting the risk remains.
- **Evidence:** See lines 138, 146.
- **Fix:** Either sanitize/truncate the reflected values, or use a fixed error message that lists the valid values without echoing the input. Low priority given Phase 1 localhost-only context.

## NIT

### [CC-P9-A1-007] Manager route: `agent.name || agent.alias` uses `||` instead of `??`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/manager/route.ts`:60
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `agent.name || agent.alias` will skip `name` if it's an empty string. Using `agent.name ?? agent.alias` would only skip if `name` is null/undefined.
- **Evidence:**
  ```typescript
  return NextResponse.json({ success: true, managerId: agentId, managerName: agent.name || agent.alias })
  ```
- **Fix:** Use `agent.name ?? agent.alias` if empty-string names should be preserved.

### [CC-P9-A1-008] Transfer resolve: `saveError` caught but not logged
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:159
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `catch (saveError)` block on line 159 reverts the transfer and returns an error, but does not log `saveError`. This makes it harder to diagnose disk/permission issues in production.
- **Evidence:**
  ```typescript
  } catch (saveError) {
    // Compensating action (SR-007): revert transfer from 'approved' back to 'pending'
    await revertTransferToPending(id)
    return NextResponse.json({ error: 'Failed to save team changes...' }, { status: 500 })
  }
  ```
- **Fix:** Add `console.error('[TransferResolve] saveTeams failed:', saveError)` before the revert.

### [CC-P9-A1-009] Trust DELETE route: Missing `export const dynamic = 'force-dynamic'`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/trust/[hostId]/route.ts`
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The parent route `trust/route.ts` has `export const dynamic = 'force-dynamic'` on line 14, but the child `trust/[hostId]/route.ts` does not. While Next.js dynamic routes with params are typically not cached, adding the explicit directive would be consistent with the project convention (NT-023 pattern used in other governance routes).
- **Evidence:** Compare `trust/route.ts:14` (has it) vs `trust/[hostId]/route.ts` (missing).
- **Fix:** Add `export const dynamic = 'force-dynamic'` to `trust/[hostId]/route.ts`.

### [CC-P9-A1-010] Governance sync POST: `validSyncTypes` declared as mutable array instead of Set or const assertion
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts`:32
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Line 32 declares `const validSyncTypes: string[] = [...]` and uses `.includes()` for validation. Other routes in this domain use `Set` with `.has()` for the same pattern (e.g., `requests/route.ts:22-33` uses `VALID_GOVERNANCE_REQUEST_STATUSES = new Set([...])` and `VALID_GOVERNANCE_REQUEST_TYPES = new Set([...])`). The array approach is functionally correct but inconsistent with the established pattern and slightly less efficient for larger sets.
- **Evidence:**
  ```typescript
  // sync/route.ts:32 -- uses array + includes
  const validSyncTypes: string[] = ['manager-changed', 'team-updated', 'team-deleted', 'transfer-update']
  if (!validSyncTypes.includes(body.type)) { ... }

  // requests/route.ts:22 -- uses Set + has (established pattern)
  const VALID_GOVERNANCE_REQUEST_STATUSES = new Set(['pending', ...])
  ```
- **Fix:** Change to `const VALID_SYNC_TYPES = new Set([...])` with `.has()` for consistency.

### [CC-P9-A1-011] Governance sync POST: `validSyncTypes` declared inside function scope but is constant
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/sync/route.ts`:32
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `validSyncTypes` is declared inside the `POST` function body, meaning it's re-created on every request. The similar constants in `requests/route.ts` are declared at module scope (lines 22-33). This is a minor performance nit -- the array is small and the allocation is cheap, but module-scope would be consistent.
- **Evidence:** Compare `sync/route.ts:32` (inside POST) vs `requests/route.ts:22` (module scope).
- **Fix:** Move to module scope as `const VALID_SYNC_TYPES = new Set([...])`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts` -- Clean. Properly delegates to service layer with correct error handling.
- `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts` -- Clean. Simple delegation to service with proper error handling.
- `/Users/emanuelesabetta/ai-maestro/app/api/v1/governance/requests/[id]/approve/route.ts` -- Clean. Proper UUID validation, body validation, error branching.

## Test Coverage Notes

- No test files were found in this domain. The governance API routes rely on integration testing via `scripts/test-amp-routing.sh` and `scripts/test-amp-cross-host.sh`, but there are no unit tests for individual route handlers.
- The transfer resolve route (`transfers/[id]/resolve/route.ts`) is the most complex file (204 lines) with lock acquisition, compensating transactions, and multiple authorization paths -- it would benefit most from dedicated unit tests.
- The cross-host governance request routes (`requests/route.ts`, `requests/[id]/approve/route.ts`, `requests/[id]/reject/route.ts`) have dual-auth-mode logic (local password vs remote host signature) that should have dedicated test cases for each path.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A1-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-f2d3343d-19e2-41e9-806b-09a2ca20297f.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
