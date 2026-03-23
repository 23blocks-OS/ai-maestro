# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID prefix:** CC-P9-A8
**Files audited:** 29
**Date:** 2026-02-23T03:20:00.000Z

## MUST-FIX

_No MUST-FIX issues found._

All 29 test files were audited thoroughly. No crashes, security holes, data loss, or wrong-result bugs were identified in the test code itself. The tests are well-structured, use correct mocking patterns, and accurately verify the behavior of their modules under test.

## SHOULD-FIX

### [CC-P9-A8-001] use-governance-hook.test.ts tests standalone replicas, not actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:41-112
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test file explicitly declares (line 25-34) that it tests standalone function replicas of the `useGovernance` hook's `submitConfigRequest` and `resolveConfigRequest` callbacks, NOT the actual hook. This means if the actual hook implementation drifts from these replicas, the tests will still pass but the real code will be wrong. The test file acknowledges this limitation (MF-027) and notes that `refresh()` side-effects, React state updates, and `useCallback` memoization are NOT tested.
- **Evidence:**
```typescript
// lines 25-34
// MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
// hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
// useGovernance hook. This means:
//   1. The refresh() side-effect after successful operations is NOT tested.
//   2. React state updates (loading, error) are NOT tested.
//   3. Memoization via useCallback is NOT tested.
```
- **Fix:** This is a known limitation documented in the file. The proper fix requires adding `@testing-library/react` (or `@testing-library/react-hooks`) to the project's test dependencies so the actual React hook can be rendered and tested. Until then, the replica pattern is the best available approach but should be regularly diffed against the real hook to detect drift.

### [CC-P9-A8-002] governance-peers.test.ts dual-export mock pattern creates inconsistent function references
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts:33-88
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The fs mock exports named functions AND a `default` object with duplicated implementations. Both share the same `fsStore`, but the named exports and default exports are separate `vi.fn()` instances. This means `vi.clearAllMocks()` resets call counts on both, but if production code uses a mix of named and default imports, the mock call assertions could be misleading. The comment at line 30-32 explains this is intentional ("NT-003: Dual export mock pattern"), but the mock functions are not shared references -- they are independent vi.fn() wrappers, so calling `vi.mocked(fs.default.existsSync)` and `vi.mocked(existsSync)` would show different call counts.
- **Evidence:**
```typescript
// lines 35-36 (named export)
existsSync: vi.fn((filePath: string) => filePath in fsStore),
// lines 63-64 (default export, separate vi.fn)
existsSync: vi.fn((filePath: string) => filePath in fsStore),
```
- **Fix:** Consider using shared function references between named and default exports to avoid potential assertion confusion. For example: define `const mockExistsSync = vi.fn(...)` once and use it in both the named export and `default.existsSync`.

### [CC-P9-A8-003] agent-config-governance-extended.test.ts does not restore globalThis.fetch on error paths
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:380-447
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `globalThis.fetch` is overridden in `beforeEach` (line 442) and restored in `afterEach` (line 446). However, if a test throws an unhandled error between these lifecycle hooks, `afterEach` may not run reliably in all test runners, leaving `fetch` mocked for subsequent test files. While Vitest typically runs afterEach even on failures, this pattern is fragile.
- **Evidence:**
```typescript
// line 380
const originalFetch = globalThis.fetch
// line 442
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
// line 446
globalThis.fetch = originalFetch
```
- **Fix:** Use `vi.stubGlobal('fetch', ...)` instead, which integrates with Vitest's mock lifecycle and is automatically restored by `vi.restoreAllMocks()`. Alternatively, use `vi.spyOn(globalThis, 'fetch')` which also auto-restores.

### [CC-P9-A8-004] task-registry.test.ts empty string assigneeAgentId test relies on implementation detail
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:241-245
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 241 verifies that `createTask` with `assigneeAgentId: ''` preserves the empty string because "Source uses `??` not `||`". This tests an implementation detail (nullish coalescing behavior) rather than a documented API contract. If the implementation switches to `||` (which would convert `''` to `null`), this test would fail but the behavior change might actually be desirable. The test comment correctly documents the current behavior but the empty-string case should ideally be treated as equivalent to `null` (no assignee).
- **Evidence:**
```typescript
it('keeps empty string assigneeAgentId as-is (nullish coalescing does not convert empty string)', async () => {
    const task = await createTask({ teamId: TEAM_1, subject: 'Test', assigneeAgentId: '' })
    expect(task.assigneeAgentId).toBe('')
})
```
- **Fix:** If empty-string assigneeAgentId is not a valid use case, the source code should normalize it to `null` using `||` instead of `??`, and this test should be updated to expect `null`. If empty string IS valid, document why in the type definition.

## NIT

### [CC-P9-A8-005] Inconsistent mock pattern for `withLock` across test files
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `@/lib/file-lock` mock uses different signatures across test files. Some use `(_name: string, fn: () => unknown)`, others use `(_name: string, fn: () => any)`. While this doesn't cause bugs (both work), the inconsistency makes it harder to maintain. Files affected: transfer-registry.test.ts (line 39 uses `any`), team-api.test.ts (line 46 uses `any`), governance-peers.test.ts (line doesn't mock withLock), etc.
- **Evidence:**
```typescript
// transfer-registry.test.ts:39
withLock: vi.fn((_name: string, fn: () => any) => Promise.resolve(fn())),
// document-registry.test.ts:44
withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
```
- **Fix:** Standardize on `() => unknown` across all test files for type safety consistency (stricter than `any`).

### [CC-P9-A8-006] transfer-registry.test.ts mocks `crypto` instead of `uuid` for ID generation
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:34-36
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Unlike most other test files that mock `uuid` with `{ v4: vi.fn(...) }`, transfer-registry.test.ts mocks `crypto` with `{ randomUUID: vi.fn(...) }`. This is correct if the source module uses `crypto.randomUUID()` instead of `uuid.v4()`, but it's a different pattern from the rest of the codebase. Not a bug, but notable for consistency.
- **Evidence:**
```typescript
// transfer-registry.test.ts:34-36
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
}))
```
- **Fix:** No action needed if the source module uses `crypto.randomUUID()`. Just noting the pattern difference.

### [CC-P9-A8-007] role-attestation.test.ts signatureBindings cleared twice (beforeEach + afterEach)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts:99-112
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `signatureBindings.clear()` is called in both `beforeEach` (line 104) and `afterEach` (line 111). The comment at line 102 explains the `beforeEach` call: "CC-P4-010: Clear signatureBindings in beforeEach for complete test isolation. vi.clearAllMocks() in afterEach does NOT clear standalone Maps." Having it in both hooks is redundant but harmless -- the `beforeEach` clear is the important one (ensures clean state before test), while the `afterEach` clear is extra insurance.
- **Evidence:**
```typescript
beforeEach(() => {
  // ...
  signatureBindings.clear() // line 104
})
afterEach(() => {
  // ...
  signatureBindings.clear() // line 111
})
```
- **Fix:** Keep the `beforeEach` call (it's the critical one). The `afterEach` call can be removed as it's redundant, but leaving it is not harmful.

### [CC-P9-A8-008] test-utils/service-mocks.ts MockTeamValidationException pattern is duplicated
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts and /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:23-29
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `MockTeamValidationException` class (extending Error with a `code` property) is defined in both service-mocks.ts and inline in transfer-resolve-route.test.ts (lines 23-29). The duplicate definition could drift. The service-mocks.ts version exists specifically to be shared, but transfer-resolve-route.test.ts defines its own copy.
- **Evidence:**
```typescript
// transfer-resolve-route.test.ts:23-29
TeamValidationException: class TeamValidationException extends Error {
    code: number
    constructor(message: string, code: number) {
      super(message)
      this.code = code
    }
  },
```
- **Fix:** Import the shared MockTeamValidationException from test-utils/service-mocks.ts instead of defining it inline.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts -- No issues. 7 well-structured tests covering all authenticateAgent branches.
- /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance.test.ts -- No issues. 16 tests properly covering governance RBAC for agent CRUD.
- /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts -- No issues. ~70 comprehensive tests with correct mock patterns.
- /Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts -- No issues. 9 concise tests for address parsing.
- /Users/emanuelesabetta/ai-maestro/tests/cross-host-governance.test.ts -- No issues. ~40 tests with thorough sanitization coverage.
- /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts -- No issues. ~20 tests covering API routes correctly.
- /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts -- No issues. ~25 tests with round-trip verification.
- /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts -- No issues. 12 tests verifying Ed25519 signature contracts.
- /Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts -- No issues. 30 tests covering full request lifecycle.
- /Users/emanuelesabetta/ai-maestro/tests/governance-sync.test.ts -- No issues. 15 tests with proper mock validation.
- /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts -- No issues. ~15 tests including corruption self-healing.
- /Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts -- No issues. 15 tests with real crypto operations. Excellent use of vi.resetModules() for cache isolation.
- /Users/emanuelesabetta/ai-maestro/tests/manager-trust.test.ts -- No issues. 15 tests with proper corrupted-file handling.
- /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts -- No issues. 27+ tests thoroughly covering all R6.x rules and Layer 2 attestation.
- /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts -- No issues (aside from NIT-007). 25 tests with excellent signature-binding mock pattern.
- /Users/emanuelesabetta/ai-maestro/tests/services/agents-core-service.test.ts -- No issues. ~60 tests with proper fixtures.
- /Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts -- No issues. ~50 tests covering caching and lifecycle.
- /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts -- No issues. ~50 tests with MockTeamValidationException pattern.
- /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts -- No issues. ~50 tests with comprehensive CRUD and lifecycle coverage.
- /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts -- No issues. 18 pure-function tests covering all validation branches.
- /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts -- No issues. ~25 API route tests with correct ACL mock patterns.
- /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts -- No issues. ~18 tests with proper atomic write testing.
- /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts -- No issues (aside from NIT-008). ~12 tests covering multi-closed constraint and compensating revert.
- /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts -- No issues. Clean test fixture helpers.
- /Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts -- No issues. Shared mock patterns.
- /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts -- No issues (aside from SHOULD-FIX-002). 20 tests with dual-export mock.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A8-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-61ae11eb-a64a-4ca5-8c12-3ab1f1f66170.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
