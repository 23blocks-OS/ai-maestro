# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 29
**Date:** 2026-02-22T21:40:00Z
**Pass:** 6
**Agent Prefix:** A7
**Finding ID Prefix:** CC-P6-A7

## MUST-FIX

### [CC-P6-A7-001] governance.test.ts does not mock @/lib/governance-sync, causing real dependency chain to fire
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:58-61
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The source file `lib/governance.ts` imports `broadcastGovernanceSync` from `@/lib/governance-sync` (line 16) and calls it in `setManager()` (line 111) and `removeManager()` (line 122) with `.catch(() => {})`. The test file mocks `fs`, `uuid`, `bcryptjs`, `@/lib/file-lock`, and `@/lib/team-registry` but does NOT mock `@/lib/governance-sync`. When `setManager()` or `removeManager()` are called in tests, the real `broadcastGovernanceSync` executes, which in turn imports `@/lib/hosts-config`, `@/lib/host-keys`, `@/lib/agent-registry`, and `@/lib/team-registry` -- all of which operate on the real filesystem or generate real crypto keys. The tests pass only because `broadcastGovernanceSync` is called fire-and-forget with `.catch(() => {})`, silently swallowing all errors. This is fragile: any change to `governance-sync.ts` error handling (e.g., removing the `.catch()`) would break these tests. Worse, real host key generation and filesystem writes may occur as side effects during tests.
- **Evidence:**
  ```typescript
  // governance.ts line 16:
  import { broadcastGovernanceSync } from '@/lib/governance-sync'
  // governance.ts line 111:
  broadcastGovernanceSync('manager-changed', { agentId }).catch(() => {})

  // governance.test.ts: NO mock for @/lib/governance-sync
  // Only mocks: fs, uuid, bcryptjs, @/lib/file-lock, @/lib/team-registry
  ```
- **Fix:** Add `vi.mock('@/lib/governance-sync', () => ({ broadcastGovernanceSync: vi.fn().mockResolvedValue(undefined) }))` to `governance.test.ts`.

### [CC-P6-A7-002] agent-registry.test.ts does not mock renameSync, causing atomic writes to fail silently
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:38-68
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `agent-registry.test.ts` fs mock provides `existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`, `statSync`, and `rmSync` -- but does NOT provide `renameSync`. The source file `lib/agent-registry.ts` uses atomic writes (writeFileSync to .tmp, then renameSync), which is the standard pattern across the codebase. Without `renameSync` in the mock, any code path in agent-registry.ts that performs an atomic write would call the real `fs.renameSync` or get `undefined is not a function`. The mock provides these methods only on `default` (not as named exports), so if the source uses named imports (`import { renameSync } from 'fs'`), the mock would fail entirely. However, since agent-registry.ts uses `import fs from 'fs'` (default import), the mock works for existing methods. The missing `renameSync` means atomic writes are NOT tested -- the test silently writes to `fileStore` via `writeFileSync` but the rename step that makes it atomic is not exercised.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts mock (lines 38-68): NO renameSync
  vi.mock('fs', () => {
    return {
      default: {
        existsSync: ...,
        mkdirSync: ...,
        readFileSync: ...,
        writeFileSync: ...,
        statSync: ...,
        rmSync: ...,
        // Missing: renameSync, copyFileSync
      },
    }
  })
  ```
- **Fix:** Add `renameSync` and `copyFileSync` to the fs mock's `default` object, implementing them with the standard fsStore pattern used in other test files (e.g., governance-request-registry.test.ts lines 51-58).

### [CC-P6-A7-003] use-governance-hook.test.ts tests standalone replicas, NOT the actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:30-105
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test file explicitly states it tests "standalone function replicas" that "mirror the hook's callbacks exactly" (lines 22-27). These replicas are hand-written copies of `submitConfigRequest` and `resolveConfigRequest` from `hooks/useGovernance.ts`. This is a test correctness issue: if the actual hook code changes (e.g., different request body format, different error handling), the test replicas would NOT detect the regression because they test a copy, not the real code. I verified the replicas against the actual hook (lines 286-345 of useGovernance.ts) and they currently match, but this is a maintenance hazard. The replicas also omit the `refresh()` fire-and-forget call that the real hook makes after success, which is documented but means refresh side-effects are untested.
- **Evidence:**
  ```typescript
  // use-governance-hook.test.ts line 22-27:
  // TODO: These replicas test the API call logic but do not test the refresh()
  // side-effect that the real hook triggers after successful operations.
  // Testing refresh() requires @testing-library/react or a minimal hook wrapper
  ```
- **Fix:** Either (a) import the hook and test it with a minimal React test wrapper (e.g., `renderHook` from `@testing-library/react`), or (b) extract `submitConfigRequest` and `resolveConfigRequest` logic into a shared utility module that both the hook and the tests import directly, eliminating the replica pattern entirely.

## SHOULD-FIX

### [CC-P6-A7-004] transfer-registry.test.ts does not test revertTransferToPending or cleanupOldTransfers
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:46-53
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The import block at lines 46-53 imports `loadTransfers`, `createTransferRequest`, `getTransferRequest`, `getPendingTransfersForTeam`, `getPendingTransfersForAgent`, and `resolveTransferRequest`. However, `lib/transfer-registry.ts` also exports `revertTransferToPending` (line 147) and `cleanupOldTransfers` (line 169), which are not imported or tested. `revertTransferToPending` is used as a compensating transaction in `transfer-resolve-route.ts` and is critical for data consistency when downstream operations fail. `cleanupOldTransfers` handles time-based cleanup with a 30-day cutoff. Both functions have non-trivial logic paths that lack test coverage.
- **Evidence:**
  ```typescript
  // transfer-registry.ts exports not tested:
  export async function revertTransferToPending(id: string): Promise<boolean> { ... }
  export async function cleanupOldTransfers(): Promise<number> { ... }
  ```
- **Fix:** Add tests for `revertTransferToPending` (approved->pending revert, rejected->pending revert, not-found returns false, already-pending is no-op) and `cleanupOldTransfers` (removes resolved requests older than 30 days, keeps pending regardless of age, keeps recent resolved).

### [CC-P6-A7-005] agent-registry.test.ts fs mock uses only default export; source imports may mismatch
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:38-68
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The agent-registry.test.ts fs mock provides methods only on `default: { ... }`, with no named exports. Other test files in the codebase that mock `fs` for sources using named imports (like `import { readFileSync, writeFileSync, ... } from 'fs'`) provide both `default` AND named export mocks (see governance-request-registry.test.ts lines 40-79, governance-peers.test.ts). If `agent-registry.ts` uses `import fs from 'fs'` (default import), this works. However, this pattern is fragile -- if agent-registry.ts is refactored to use named imports (as many other lib files do, e.g., transfer-registry.ts, governance-peers.ts), the mock would silently fail. The inconsistency across test files (some provide both, some only default) creates a maintenance risk.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts: default-only mock
  vi.mock('fs', () => ({ default: { existsSync, mkdirSync, ... } }))

  // governance-request-registry.test.ts: both default AND named exports
  vi.mock('fs', () => ({
    default: { existsSync, ... },
    existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync,
  }))
  ```
- **Fix:** Add named export aliases alongside the default export in the agent-registry.test.ts fs mock, matching the pattern in governance-request-registry.test.ts.

### [CC-P6-A7-006] sessions-service.test.ts listSessions cache test may interfere with other tests
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts:137-155
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The test at line 140 verifies that `listSessions()` caches results for 3 seconds. Because the cache is module-level state in `sessions-service.ts`, and `beforeEach` only clears mocks (not the module-level cache), this test's cached state can leak into subsequent tests. The test comment at line 137-138 acknowledges this: "listSessions has a module-level 3s cache that persists across tests." This means other describe blocks testing functions that internally call `listSessions` may get stale cached data from this test, potentially masking bugs. Other tests that call `listLocalSessions` (which is tested separately) may work around this, but any test that calls `listSessions` directly after this test could get cached data.
- **Evidence:**
  ```typescript
  // sessions-service.test.ts line 137-138:
  // NOTE: listSessions has a module-level 3s cache that persists across tests.
  // We test caching in a single test. For session data behavior, use listLocalSessions.
  ```
- **Fix:** Either (a) reset the module-level cache between tests using `vi.resetModules()` and dynamic imports, or (b) use `vi.useFakeTimers()` to advance past the 3s TTL between tests, or (c) export a `resetCache()` function from sessions-service.ts for test use.

### [CC-P6-A7-007] document-api.test.ts documents known stored-XSS surface but no sanitization test exists
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The document-api.test.ts file documents a known stored-XSS security surface: the document content field stores HTML verbatim without sanitization. However, there is no test that verifies either (a) that HTML is sanitized before storage, or (b) that the system explicitly documents this as an accepted risk with output encoding happening at render time. Since Phase 1 is localhost-only, this is not a critical vulnerability, but the test suite should at minimum verify the behavior (storing raw HTML) and document the security boundary explicitly.
- **Evidence:** Document API creates and updates documents with arbitrary content strings, including potential HTML/script payloads, without any sanitization test.
- **Fix:** Add a test that stores HTML content (e.g., `<script>alert(1)</script>`) and verifies the expected behavior -- either sanitized output or documented acceptance of raw storage with render-time encoding.

### [CC-P6-A7-008] cross-host-governance.test.ts uses vi.waitFor for fire-and-forget fetch assertions, which is timing-dependent
- **File:** /Users/emanuelesabetta/ai-maestro/tests/cross-host-governance.test.ts
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Several tests in cross-host-governance.test.ts use `vi.waitFor()` to assert on fire-and-forget `fetch()` calls that happen inside `performRequestExecution`. While this pattern is documented (CC-P4-004), it depends on `vi.waitFor`'s default timeout and polling interval to catch the asynchronous fetch. In CI environments with higher latency, these assertions could become flaky. The pattern is: the function under test fires a fetch and does not await it; the test uses `vi.waitFor(() => expect(mockFetch).toHaveBeenCalled())` to poll for the assertion.
- **Evidence:** Multiple tests use `await vi.waitFor(() => { expect(mockFetch).toHaveBeenCalled() })` to catch fire-and-forget network calls.
- **Fix:** Consider refactoring the service to return a promise for the fire-and-forget operation (at least in test mode), or use `vi.waitFor` with explicit timeout parameters to make the timing expectation clear.

### [CC-P6-A7-009] host-keys.test.ts module cache reset pattern may leak state between tests
- **File:** /Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The host-keys.test.ts uses `vi.resetModules()` + dynamic `import()` to reset the module-level `cachedKeyPair` variable between tests. This is correct in principle, but the pattern is fragile: if any test forgets to use the dynamically-imported module and instead uses the static import, it would operate on a stale cached module instance. The test file handles this correctly for the tests I reviewed, but the pattern itself is error-prone for future test additions.
- **Evidence:** Tests use `vi.resetModules()` then `const { getOrCreateHostKeyPair, ... } = await import('@/lib/host-keys')` to get a fresh module instance.
- **Fix:** Add a comment warning future developers to always use the dynamically-imported module, or export a `_resetCacheForTesting()` function from host-keys.ts.

### [CC-P6-A7-010] agent-config-governance-extended.test.ts has two separate mock systems for agent-registry
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:59-98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test file sets up two separate mock paths for agent registry: `mockGetAgent` (line 59, used via `@/lib/agent-registry.getAgent`) and `mockAgentRegistryGetAgent` (line 94, used via `@/lib/agent.agentRegistry.getAgent`). These are separate mocks pointing to different mock functions for what is conceptually the same operation: getting an agent by ID. If a test only configures one mock but the code under test uses the other path, the test will get `undefined` (the default mock return) instead of failing explicitly. This makes it easy to write tests that pass for the wrong reason.
- **Evidence:**
  ```typescript
  // Line 59: const mockGetAgent = vi.fn()
  // Line 67: vi.mock('@/lib/agent-registry', () => ({ getAgent: (...args) => mockGetAgent(...args), ... }))

  // Line 94: const mockAgentRegistryGetAgent = vi.fn()
  // Line 95: vi.mock('@/lib/agent', () => ({ agentRegistry: { getAgent: (...args) => mockAgentRegistryGetAgent(...args) } }))
  ```
- **Fix:** Document clearly in the test file which code paths use which mock, and consider unifying them if the source code can be refactored to use a single agent registry access pattern.

## NIT

### [CC-P6-A7-011] Inconsistent UUID mocking strategy across test files
- **File:** Multiple test files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Different test files use different UUID generation strategies: `agent-registry.test.ts` and `governance.test.ts` mock `uuid.v4`; `transfer-registry.test.ts` and `governance-request-registry.test.ts` mock `crypto.randomUUID`; `host-keys.test.ts` uses real crypto. This mirrors the actual source code (some modules use `uuid.v4`, others use `crypto.randomUUID`), so the mocks are correct. However, the inconsistency makes it harder to reason about which UUID approach each module uses and creates a risk of mock mismatch if a source module changes its UUID generation strategy.
- **Evidence:**
  ```typescript
  // agent-registry.test.ts: vi.mock('uuid', () => ({ v4: () => ... }))
  // transfer-registry.test.ts: vi.mock('crypto', () => ({ randomUUID: vi.fn(() => ...) }))
  // governance-request-registry.test.ts: vi.mock('crypto', () => ({ randomUUID: ... }))
  ```
- **Fix:** Consider standardizing on one UUID generation approach across the codebase (e.g., `crypto.randomUUID` which is Node.js built-in and does not require the `uuid` package).

### [CC-P6-A7-012] validate-team-mutation.test.ts tests pure functions with thorough coverage -- no issues
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** This is a well-structured test file testing `sanitizeTeamName` and `validateTeamMutation` pure functions. Coverage includes COS rules, multi-closed-team constraints, null/undefined edge cases, and XSS prevention via name sanitization. No issues found. Minor observation: the test uses `vi.mocked(loadTeams).mockReturnValue(...)` for team state, which is the correct pattern for testing pure functions that depend on external state.
- **Evidence:** All test assertions verified against source logic. No mock mismatches.
- **Fix:** None needed.

### [CC-P6-A7-013] amp-address.test.ts is clean -- tests pure function with no mocks
- **File:** /Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Tests 9 cases for `parseAMPAddress` -- a pure function with no dependencies. All test cases verified correct. No mock mismatches possible since no mocks are used.
- **Evidence:** All assertions verified against pure parsing logic.
- **Fix:** None needed.

### [CC-P6-A7-014] test-utils/fixtures.ts counter is reset by only some test files
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `fixtures.ts` exports `resetFixtureCounter()` for test isolation. Service test files (`sessions-service.test.ts`, `teams-service.test.ts`, `agents-core-service.test.ts`) call it in `beforeEach`, but the lib-level test files that also use fixtures (if any do) may not. Since the counter is shared module-level state, tests run in parallel could generate overlapping IDs if they share the module instance. In practice, vitest runs test files in separate worker threads, so cross-file contamination is unlikely. Within a single file, the `beforeEach` reset is sufficient.
- **Evidence:**
  ```typescript
  // sessions-service.test.ts line 121: resetFixtureCounter()
  // teams-service.test.ts line 112: resetFixtureCounter()
  ```
- **Fix:** No fix needed for correctness (vitest isolates workers). For clarity, document that `resetFixtureCounter()` is only needed when tests depend on deterministic fixture IDs.

### [CC-P6-A7-015] role-attestation.test.ts uses sophisticated signatureBindings Map pattern -- well implemented
- **File:** /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test uses a `signatureBindings` Map to track which data was signed and bind it to the returned signature (CC-P1-1003 fix). This allows `verifyHostAttestation` to check that the signature actually corresponds to the data, preventing "any signature verifies any data" false positives. The implementation is correct and well-documented. Verified that the mock accurately reflects the real `host-keys.ts` API: `signHostAttestation(data: string) => string` and `verifyHostAttestation(data: string, sig: string, pubKeyHex: string) => boolean`.
- **Evidence:** Mock correctly validates data-signature binding via Map lookup.
- **Fix:** None needed.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts` -- No issues. Pure function test, no mocks needed.
- `/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts` -- No issues. Thorough pure function coverage.
- `/Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts` -- No issues. 8 well-structured tests covering identity spoofing edge cases.
- `/Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts` -- No issues. 20 tests with correct fs mock (both default and named exports), TTL filtering verified.
- `/Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts` -- No issues. 30 tests with complete fs mock, atomic write testing, corruption recovery.
- `/Users/emanuelesabetta/ai-maestro/tests/governance-sync.test.ts` -- No issues. 15 tests covering broadcast, sync receipt, signature verification.
- `/Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts` -- No issues. 12 tests using real broadcastGovernanceSync with proper mocking.
- `/Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts` -- No issues (SHOULD-FIX noted separately for fragile pattern). Real crypto ops, module cache reset correct.
- `/Users/emanuelesabetta/ai-maestro/tests/manager-trust.test.ts` -- No issues. 15 tests for trust CRUD and auto-approve logic.
- `/Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts` -- No issues. 27 tests covering all R6.x rules including Layer 2 attestation.
- `/Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts` -- No issues. Sophisticated mock pattern, anti-replay tests.
- `/Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts` -- No issues. 25 tests with valid UUID constants.
- `/Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts` -- No issues. Path traversal rejection, cycle detection tested.
- `/Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts` -- No issues. Next.js route handler testing, ACL denial coverage.
- `/Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts` -- No issues. CRUD coverage, error propagation.
- `/Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts` -- No issues. Multi-closed-team ordering, compensating transaction testing.
- `/Users/emanuelesabetta/ai-maestro/tests/agent-config-governance.test.ts` -- No issues. 16 tests for Layer 5 RBAC.
- `/Users/emanuelesabetta/ai-maestro/tests/services/agents-core-service.test.ts` -- No issues. ~60 tests with vi.hoisted pattern.
- `/Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts` -- No issues (SHOULD-FIX noted separately for cache leak). Comprehensive session lifecycle.
- `/Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts` -- No issues. Complete CRUD coverage with fixture factories.
- `/Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts` -- No issues. Well-designed factory pattern.
- `/Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts` -- No issues. Clean mock factory pattern.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A7-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-926c2319-2d75-4b59-a8a5-de1a7c317f92.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
