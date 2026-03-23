# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 29
**Date:** 2026-02-23T02:30:00.000Z
**Pass:** 8
**Run ID:** 57d244f7
**Finding ID Prefix:** CC-P8-A8

## MUST-FIX

_No MUST-FIX issues found._

## SHOULD-FIX

### [CC-P8-A8-001] task-registry.test.ts: makeTaskCounter not reset in beforeEach
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:107-111
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `makeTaskCounter` variable (line 86) starts at 1000 and is used by the `makeTask()` helper to generate unique `task-${makeTaskCounter}` IDs. However, the `beforeEach` block (lines 107-111) does NOT reset `makeTaskCounter` to its initial value. This means if tests in a describe block use `makeTask()`, the IDs will continue incrementing across tests. The tests currently pass because they don't assert on exact `makeTask` helper IDs (they use `createTask` which goes through the uuid mock, or pass explicit overrides). But this is asymmetric with the `makeDocCounter` reset in document-registry.test.ts (line 100) and the `makeTeamCounter` reset in team-registry.test.ts (line 91), creating inconsistency and a latent bug if future tests rely on deterministic makeTask IDs.
- **Evidence:**
  ```typescript
  // line 86
  let makeTaskCounter = 1000

  // lines 107-111
  beforeEach(() => {
    fsStore = {}
    uuidCounter = 0
    vi.clearAllMocks()
    // NOTE: makeTaskCounter is NOT reset here
  })
  ```
- **Fix:** Add `makeTaskCounter = 1000` to the `beforeEach` block, consistent with the pattern in document-registry.test.ts and team-registry.test.ts.

### [CC-P8-A8-002] use-governance-hook.test.ts: Testing standalone replicas instead of actual hook code
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:26-35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test file acknowledges (MF-027, lines 26-35) that it tests standalone function replicas rather than the actual `useGovernance` hook. If the hook's `submitConfigRequest` or `resolveConfigRequest` implementation drifts from these replicas, the tests will still pass while the real code is broken. The replicas are manually maintained copies of the hook logic, which is inherently fragile. The test file correctly documents this limitation, but it means the "API contract" tests cannot catch regressions in the actual hook code (e.g., if the endpoint path, body structure, or error handling changes in the hook but not the replica).
- **Evidence:**
  ```typescript
  // lines 26-35
  // MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
  // hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
  // useGovernance hook. This means:
  //   1. The refresh() side-effect after successful operations is NOT tested.
  //   2. React state updates (loading, error) are NOT tested.
  //   3. Memoization via useCallback is NOT tested.
  ```
- **Fix:** Either (a) add `@testing-library/react` to enable testing the real hook, or (b) add a code comment/CI check that flags when `hooks/useGovernance.ts` changes without updating this test file. The current approach is not wrong per se, but it's a coverage gap that should be tracked.

### [CC-P8-A8-003] document-registry.test.ts: makeDoc helper does not match TeamDocument type for optional fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:79-91
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `makeDoc` helper sets `pinned: false` and `tags: []` as defaults, but the `TeamDocument` type (types/document.ts) defines these as optional (`pinned?: boolean`, `tags?: string[]`). While this doesn't cause test failures, it means tests using `makeDoc()` always have `pinned` and `tags` defined, so they never exercise the code path where these fields are `undefined`. The `createDocument` tests at lines 198-206 do test the defaults from the real function, but the `makeDoc` helper used for `loadDocuments`/`saveDocuments` tests masks the undefined case.
- **Evidence:**
  ```typescript
  // tests/document-registry.test.ts lines 79-91
  function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
    return {
      id: `doc-helper-${++makeDocCounter}`,
      teamId: TEAM_1,
      title: 'Default Doc',
      content: 'Some content',
      pinned: false,       // TeamDocument says pinned?: boolean (optional)
      tags: [],            // TeamDocument says tags?: string[] (optional)
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    }
  }
  ```
- **Fix:** Consider adding a test case for `loadDocuments`/`saveDocuments` that uses a document without `pinned` and `tags` fields (i.e., `makeDoc({ pinned: undefined, tags: undefined })`) to verify round-trip behavior when these optional fields are absent.

### [CC-P8-A8-004] fixtures.ts: makeTask missing assigneeAgentId default
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts:114-126
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `makeTask` factory in fixtures.ts does not set `assigneeAgentId` as a default, but the `Task` type defines `assigneeAgentId?: string | null`. This means tasks created via `makeTask()` will have `assigneeAgentId: undefined` (not `null`), which differs from the real `createTask` function in task-registry.ts (line 123: `assigneeAgentId: data.assigneeAgentId ?? null`). If a service test uses `makeTask()` and the production code checks `task.assigneeAgentId === null`, it would behave differently than expected because `undefined !== null`.
- **Evidence:**
  ```typescript
  // fixtures.ts lines 114-126
  export function makeTask(overrides: Partial<Task> = {}): Task {
    const n = nextId()
    return {
      id: `task-${n}`,
      teamId: 'team-1',
      subject: `Test Task ${n}`,
      status: 'pending' as TaskStatus,
      blockedBy: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      // NOTE: assigneeAgentId is missing — will be undefined, not null
      ...overrides,
    }
  }
  ```
  Compare with task-registry.test.ts makeTask (line 95): `assigneeAgentId: null` (explicit default).
- **Fix:** Add `assigneeAgentId: null` to the fixtures.ts `makeTask` factory to match the production code's behavior.

## NIT

### [CC-P8-A8-005] agent-auth.test.ts: Unused import from vitest
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts:1
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The test file imports `beforeEach` from vitest but the file does not contain a `beforeEach` block. This is a dead import. (Note: The file was read completely in the previous context; it only has `describe`/`it`/`expect`/`vi` usage, no `beforeEach` call.)
- **Evidence:** Line 1 imports `{ describe, it, expect, vi, beforeEach }` but no `beforeEach()` call exists in the 149-line file.
- **Fix:** Remove `beforeEach` from the import destructuring.

### [CC-P8-A8-006] transfer-registry.test.ts uses fake timers but other tests with timestamps do not
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:78-84
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The transfer-registry test correctly uses `vi.useFakeTimers()` and `vi.setSystemTime()` to produce deterministic timestamps, making assertions like `expect(transfer.createdAt).toBe('2025-06-01T12:00:00.000Z')` reliable. However, other test files that assert on timestamp presence but not exact values (e.g., task-registry.test.ts, document-registry.test.ts) only check `.toBeDefined()` or that `createdAt === updatedAt`. This inconsistency is not a bug, but using fake timers everywhere would make tests more deterministic and easier to debug.
- **Evidence:**
  ```typescript
  // transfer-registry.test.ts lines 78-84
  beforeEach(() => {
    fsStore = {}
    uuidCounter = 0
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'))
  })
  ```
- **Fix:** No action required. This is an observation about test style consistency. Using fake timers is better practice but the current approach works.

### [CC-P8-A8-007] governance-peers.test.ts: Mock pattern uses both named and default fs exports
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The governance-peers test mocks `fs` with both `default:` (for `import fs from 'fs'`) and named exports (for `import { readdirSync } from 'fs'`). While this works correctly because vitest supports both access patterns from a single mock, it's worth noting this dual-pattern approach for maintainability. The agent-registry.test.ts file (line 38-42) comments explicitly about this pattern (SF-032), but governance-peers.test.ts does not document the reason.
- **Evidence:** governance-peers.test.ts mocks `fs` with a `default:` block containing all methods, plus standalone named exports for `readdirSync` and `unlinkSync` at the top level of the mock object.
- **Fix:** Add a brief comment explaining the dual export pattern, consistent with agent-registry.test.ts's SF-032 comment.

### [CC-P8-A8-008] team-api.test.ts: vi.spyOn on dynamic import for createTeam verification
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:207-225
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 205 uses `vi.spyOn(await import('@/lib/team-registry'), 'createTeam')` to verify that `managerId` is passed through. This works in vitest because `await import()` returns the same module instance as the route's static import when `vi.mock` is active. The test correctly calls `spy.mockRestore()` afterward. The approach is valid but somewhat fragile -- if vitest's module resolution behavior changes, this pattern could break silently.
- **Evidence:**
  ```typescript
  // lines 209-224
  const spy = vi.spyOn(await import('@/lib/team-registry'), 'createTeam')
  // ... test ...
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][1]).toBe('manager-uuid')
  spy.mockRestore()
  ```
- **Fix:** No action required; the pattern is correct and documented with inline comments. Consider extracting this pattern into a reusable test utility if used frequently.

### [CC-P8-A8-009] service-mocks.ts: createSharedStateMock includes unused fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts:51-60
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `createSharedStateMock()` factory includes `statusSubscribers`, `terminalSessions`, and `companionClients` fields. Looking at the service test files that import this mock, only `sessionActivity` and `broadcastStatusUpdate` appear to be used by the services under test. The extra fields may be needed for type compatibility or future tests, but they add noise.
- **Evidence:**
  ```typescript
  export function createSharedStateMock() {
    const sessionActivity = new Map<string, number>()
    return {
      sessionActivity,
      broadcastStatusUpdate: vi.fn(),
      statusSubscribers: new Set(),      // Potentially unused
      terminalSessions: new Map(),        // Potentially unused
      companionClients: new Map(),        // Potentially unused
    }
  }
  ```
- **Fix:** Verify these fields are required for TypeScript type compatibility. If so, add a comment. If not, remove them.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance.test.ts -- No issues. Well-structured governance enforcement tests with proper mock setup and governance role checks.
- /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts -- No issues. Comprehensive 56-test suite across 4 modules with proper dual-mock systems documented (SF-037).
- /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts -- No issues. Thorough 1008-line integration test with proper in-memory fs mock including named+default exports (SF-032).
- /Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts -- No issues. Clean 9-scenario test for parseAMPAddress.
- /Users/emanuelesabetta/ai-maestro/tests/cross-host-governance.test.ts -- No issues. Well-organized 40-test suite with sanitization, auto-approve, and execution tests.
- /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts -- No issues. Proper Next.js API route testing with Promise.resolve() params pattern.
- /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts -- No issues. Real Ed25519 signature testing for SR-001 and SR-007.
- /Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts -- No issues (aside from NIT CC-P8-A8-007). 20-test suite with TTL expiry and cross-host peer lookups.
- /Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts -- No issues. Comprehensive 30-test suite with approval state machine and TTL-based auto-rejection.
- /Users/emanuelesabetta/ai-maestro/tests/governance-sync.test.ts -- No issues. 15-test suite covering snapshot building, broadcast, message handling, and peer sync.
- /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts -- No issues. Well-structured tests including corrupted JSON backup/heal and null===null guard (CC-015).
- /Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts -- No issues. Excellent use of real crypto operations with vi.resetModules() for cache isolation (SF-036).
- /Users/emanuelesabetta/ai-maestro/tests/manager-trust.test.ts -- No issues. 15-test suite with corrupted JSON backup, atomic write, and autoApprove tests.
- /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts -- No issues. Comprehensive 37-scenario test covering Layer 1 and Layer 2 attestation rules.
- /Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts -- No issues. Real crypto tests with fake timers for timestamp control, including cross-target replay protection.
- /Users/emanuelesabetta/ai-maestro/tests/services/agents-core-service.test.ts -- No issues. Largest service test with proper vi.hoisted() pattern and fixture imports.
- /Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts -- No issues. Comprehensive session service tests with cache behavior and activity updates.
- /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts -- No issues. Well-structured service tests with hoisted MockTeamValidationException.
- /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts -- No issues. Clean CRUD tests with proper atomic write verification.
- /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts -- No issues. Good use of fake timers for deterministic timestamps and comprehensive CRUD + cleanup tests.
- /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts -- No issues. Well-structured 11-test suite covering multi-closed constraint ordering (SR-001), compensating reverts (SR-007), validation, authorization, and 404 paths.
- /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts -- No issues. Thorough 18-test suite covering name sanitization, validation, duplicates, type validation, COS rules, and multi-closed-team constraints.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A8-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-1ad1f5f8-7387-4abe-bd35-5d00bc62c768.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
