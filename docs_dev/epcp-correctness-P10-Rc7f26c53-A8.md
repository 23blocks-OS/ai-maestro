# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent (A8)
**Domain:** tests
**Files audited:** 29
**Date:** 2026-02-26T12:00:00.000Z
**Run ID:** c7f26c53

## MUST-FIX

_No MUST-FIX issues found._

All 29 test files are structurally sound, with correct mock setups, proper beforeEach/afterEach cleanup, deterministic UUID counters, and no logic errors that would cause false positives or false negatives in the test suite.

## SHOULD-FIX

### [CC-A8-001] use-governance-hook.test.ts tests standalone replicas, not the actual hook
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:26-35
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file explicitly acknowledges (MF-027 comment at line 24-35) that it tests standalone function replicas of `submitConfigRequest` and `resolveConfigRequest`, NOT the actual `useGovernance` hook. This means: (1) The `refresh()` side-effect after successful operations is NOT tested. (2) React state updates (loading, error) are NOT tested. (3) Memoization via `useCallback` is NOT tested. If the actual hook's logic drifts from these replicas, the tests will pass while the real code is broken.
- **Evidence:**
```typescript
// MF-027 KNOWN LIMITATION: These tests exercise standalone replicas of the
// hook's submitConfigRequest and resolveConfigRequest callbacks, NOT the actual
// useGovernance hook. This means:
//   1. The refresh() side-effect after successful operations is NOT tested.
//   2. React state updates (loading, error) are NOT tested.
//   3. Memoization via useCallback is NOT tested.
```
- **Fix:** Add `@testing-library/react` (or `@testing-library/react-hooks`) as a dev dependency and write a parallel test suite that renders the actual hook. Alternatively, extract the fetch logic from the hook into a standalone module and test that module directly, ensuring the hook imports from the same module.

### [CC-A8-002] afterEach in use-governance-hook.test.ts does not restore global.fetch
- **File:** /Users/emanuelesabetta/ai-maestro/tests/use-governance-hook.test.ts:127-130
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `afterEach` calls `vi.restoreAllMocks()` but this does not restore `global.fetch` since it was assigned directly (not via `vi.stubGlobal`). While `beforeEach` re-assigns the mock each time, if a test throws before completion, `global.fetch` remains as the mock for any subsequent test file that vitest runs in the same worker. Compare with `cross-host-governance.test.ts` which correctly saves `originalFetch` and restores it in `afterEach`, and `agent-config-governance-extended.test.ts` which correctly uses `vi.stubGlobal`/`vi.unstubAllGlobals`.
- **Evidence:**
```typescript
// use-governance-hook.test.ts lines 120-130:
beforeEach(() => {
  mockFetch = vi.fn()
  global.fetch = mockFetch  // Direct assignment, NOT vi.stubGlobal
})

afterEach(() => {
  // NOTE: restoreAllMocks does not restore global.fetch; beforeEach re-assigns it each time.
  vi.restoreAllMocks()
})
```
- **Fix:** Either use `vi.stubGlobal('fetch', mockFetch)` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach` (matching agent-config-governance-extended.test.ts pattern), or save/restore the original like cross-host-governance.test.ts does: `const originalFetch = globalThis.fetch` ... `afterEach(() => { globalThis.fetch = originalFetch })`.

### [CC-A8-003] agent-registry.test.ts uses require() inside test bodies
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:169-176
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several tests in `loadAgents` use `require('path')` and `require('os')` inside the test body to construct the registry file path. Since `path` and `os` are imported at module scope in the source-under-test but not in the test file, using `require()` in a vitest/ESM context is fragile and may behave differently depending on the module system configuration. The pattern also makes the tests harder to read.
- **Evidence:**
```typescript
// agent-registry.test.ts lines 166-177:
const _registryPath = Object.keys(fileStore).length === 0
  ? (() => {
      const p = require('path')
      const os = require('os')
      const dir = p.join(os.homedir(), '.aimaestro', 'agents')
      const file = p.join(dir, 'registry.json')
      dirStore.add(dir)
      fileStore[file] = '{{not json}}'
      fileMtimes[file] = ++mtimeCounter
      return file
    })()
  : ''
```
- **Fix:** Import `path` and `os` at the top of the test file (they are already used elsewhere in similar test files) and compute `REGISTRY_FILE` as a constant. Replace inline `require()` calls with the constant. This matches the pattern used in other test files like `team-registry.test.ts` and `document-registry.test.ts`.

### [CC-A8-004] Missing test for document-registry saveDocuments write error propagation
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:142-161
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `saveDocuments` tests verify writes succeed and round-trip correctly, but do not test the error case where `writeFileSync` (or `renameSync` for atomic writes) throws. Compare with `team-registry.test.ts` which has a dedicated test: `"throws when writeFileSync fails (MF-04: surfaces write errors instead of silent data loss)"` at line 134. Document registry should have an equivalent test to verify error propagation.
- **Evidence:**
```typescript
// team-registry.test.ts has this test at line 134-141:
it('throws when writeFileSync fails (MF-04: surfaces write errors instead of silent data loss)', async () => {
  const fs = await import('fs')
  vi.mocked(fs.default.writeFileSync).mockImplementationOnce(() => {
    throw new Error('EACCES: permission denied')
  })
  expect(() => saveTeams([makeTeam({ id: 'team-x', name: 'Fail' })])).toThrow('EACCES: permission denied')
})
// document-registry.test.ts does NOT have an equivalent test
```
- **Fix:** Add a test to `document-registry.test.ts` that mocks `writeFileSync` to throw and verifies the error propagates, matching the team-registry pattern.

## NIT

### [CC-A8-005] Inconsistent global.fetch mock patterns across test files
- **File:** Multiple files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Three different patterns are used for mocking `global.fetch` across test files:
  1. `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` (agent-config-governance-extended.test.ts:441,445)
  2. Save `originalFetch` + restore in `afterEach` (cross-host-governance.test.ts:155,211)
  3. Direct `global.fetch = mockFetch` with no restore (use-governance-hook.test.ts:124)

  While all work correctly within their individual files, the inconsistency makes it harder to maintain the test suite. Pattern 1 (`vi.stubGlobal`) is the cleanest approach.
- **Evidence:** See line references above.
- **Fix:** Standardize on `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` across all test files that mock fetch.

### [CC-A8-006] Unused variable in agent-registry.test.ts updateAgent test
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-registry.test.ts:433
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the `'updates lastActive timestamp'` test, `originalLastActive` is assigned but never used in any assertion. The test only checks that `updated!.lastActive` is defined, but does not compare it against the original value.
- **Evidence:**
```typescript
// agent-registry.test.ts lines 431-438:
it('updates lastActive timestamp', async () => {
  const agent = await createAgent(makeCreateRequest({ name: 'ts-agent' }))
  const originalLastActive = agent.lastActive  // <-- assigned but never used

  // Small delay to ensure different timestamp
  const updated = await updateAgent(agent.id, { taskDescription: 'changed' })
  expect(updated!.lastActive).toBeDefined()
})
```
- **Fix:** Either add `expect(updated!.lastActive).not.toBe(originalLastActive)` to verify the timestamp actually changed, or remove the unused variable.

### [CC-A8-007] Missing `unlinkSync` in document-registry.test.ts fs mock
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:12-31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The fs mock in `document-registry.test.ts` provides `existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`, and `renameSync`, but does not mock `unlinkSync`. Compare with `team-registry.test.ts` which includes `unlinkSync`. If the `document-registry` module or any module it imports were to call `unlinkSync` (e.g., for cleanup), the test would fail with an unclear error.
- **Evidence:**
```typescript
// team-registry.test.ts includes unlinkSync:
unlinkSync: vi.fn((filePath: string) => {
  delete fsStore[filePath]
}),
// document-registry.test.ts does NOT include unlinkSync
```
- **Fix:** Add `unlinkSync` to the fs mock in document-registry.test.ts for defensive completeness.

### [CC-A8-008] document-registry.test.ts does not mock `copyFileSync`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-registry.test.ts:12-31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The fs mock in `document-registry.test.ts` does not include `copyFileSync`, which is present in other test files (e.g., `transfer-registry.test.ts:27-30`, `agent-registry.test.ts:78-83`) for corruption recovery patterns. If the document registry ever gains corruption recovery (following the governance.test.ts pattern), this would need to be added.
- **Evidence:** Compare `transfer-registry.test.ts:27-30` which has `copyFileSync` vs `document-registry.test.ts:12-31` which does not.
- **Fix:** Add `copyFileSync` mock for defensive completeness.

### [CC-A8-009] fixtures.ts makeDocument does not default `pinned` and `tags` fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts:133-144
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `makeDocument` factory in `fixtures.ts` creates a `TeamDocument` with defaults for `id`, `teamId`, `title`, `content`, `createdAt`, `updatedAt`, but does not include defaults for `pinned` and `tags`. While these fields are optional in the type, the production `createDocument` function defaults them to `false` and `[]` respectively. Tests using `makeDocument` without specifying `pinned`/`tags` will get `undefined` instead of the production defaults. This is inconsistent with the `document-registry.test.ts` local `makeDoc` helper which does set these defaults.
- **Evidence:**
```typescript
// fixtures.ts makeDocument (no pinned/tags defaults):
export function makeDocument(overrides: Partial<TeamDocument> = {}): TeamDocument {
  const n = nextId()
  return {
    id: `doc-${n}`,
    teamId: 'team-1',
    title: `Test Document ${n}`,
    content: `Content for document ${n}`,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// document-registry.test.ts makeDoc (has pinned/tags defaults):
function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
  return {
    id: `doc-helper-${++makeDocCounter}`,
    teamId: TEAM_1,
    title: 'Default Doc',
    content: 'Some content',
    pinned: false,  // <-- matches production default
    tags: [],       // <-- matches production default
    ...
  }
}
```
- **Fix:** Add `pinned: false` and `tags: []` to the `makeDocument` factory in `fixtures.ts`.

## CLEAN

Files with no issues found:

- `/Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts` -- No issues (431 lines, 10 tests covering Ed25519 signature verification, well-structured vi.waitFor patterns)
- `/Users/emanuelesabetta/ai-maestro/tests/governance-peers.test.ts` -- No issues (500 lines, 20 tests with correct TTL-based expiration logic and vi.hoisted patterns)
- `/Users/emanuelesabetta/ai-maestro/tests/governance-request-registry.test.ts` -- No issues (791 lines, 30 tests covering full approval workflow state machine)
- `/Users/emanuelesabetta/ai-maestro/tests/governance-sync.test.ts` -- No issues (522 lines, 15 tests with proper globalThis.fetch save/restore pattern)
- `/Users/emanuelesabetta/ai-maestro/tests/governance.test.ts` -- No issues (337 lines, covers corruption recovery, bcrypt, null guard)
- `/Users/emanuelesabetta/ai-maestro/tests/host-keys.test.ts` -- No issues (359 lines, 15 tests with real Ed25519 crypto, correct vi.resetModules pattern)
- `/Users/emanuelesabetta/ai-maestro/tests/manager-trust.test.ts` -- No issues (414 lines, 15 tests with dual export mock pattern)
- `/Users/emanuelesabetta/ai-maestro/tests/services/sessions-service.test.ts` -- No issues (well-structured vi.hoisted mock setup)
- `/Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts` -- No issues (962 lines, comprehensive CRUD + tasks + documents + notifications)
- `/Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts` -- No issues (608 lines, cycle detection, agent label/name/alias fallbacks)
- `/Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts` -- No issues (484 lines, governance integration and ACL denial paths)
- `/Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts` -- No issues (307 lines, instructions/lastActivityAt/lastMeetingAt fields)
- `/Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts` -- No issues (435 lines, XSS test documents frontend sanitization requirement)
- `/Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts` -- No issues (532 lines, 27+ scenarios covering Layer 1 and Layer 2 attestation-aware mesh)
- `/Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts` -- No issues (478 lines, signatureBindings Map pattern, freshness/tampering/anti-replay)
- `/Users/emanuelesabetta/ai-maestro/tests/services/agents-core-service.test.ts` -- No issues (1038 lines, 16 functions tested with comprehensive vi.hoisted setup)
- `/Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts` -- No issues (479 lines, complete CRUD + revert + cleanup with fake timers)
- `/Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts` -- No issues (456 lines, multi-closed-team constraint ordering, compensating revert, lock release)
- `/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts` -- No issues (395 lines, 18 tests covering sanitization, validation, COS rules, multi-closed constraints)
- `/Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts` -- No issues (149 lines, 8 tests covering all auth paths including identity mismatch)
- `/Users/emanuelesabetta/ai-maestro/tests/agent-config-governance.test.ts` -- No issues (462 lines, 16 tests covering Layer 5 RBAC for create/update/delete)
- `/Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts` -- No issues (1442 lines, 56 tests across 4 modules, well-documented dual mock pattern)
- `/Users/emanuelesabetta/ai-maestro/tests/cross-host-governance.test.ts` -- No issues (947 lines, 40 tests including sanitization, auto-approve, execution paths)
- `/Users/emanuelesabetta/ai-maestro/tests/amp-address.test.ts` -- No issues (73 lines, 9 tests covering AMP address parsing)
- `/Users/emanuelesabetta/ai-maestro/tests/test-utils/service-mocks.ts` -- No issues (90 lines, well-documented mock factories)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A8-001, -002, ...
- [x] My report file uses the correct path: epcp-correctness-P10-Rc7f26c53-A8.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
