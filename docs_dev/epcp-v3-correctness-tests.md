# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 8
**Date:** 2026-02-17T01:45:00.000Z

## MUST-FIX

### [CC-001] Mock pattern mismatch: transfer-registry.test.ts mocks `fs` as named exports but source uses named imports
- **File:** tests/transfer-registry.test.ts:11-21
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test mocks `fs` with named exports (`existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync` at top level of mock factory), but the source `lib/transfer-registry.ts` (line 9) uses `import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'` (named ESM imports). In contrast, all other test files mock `fs` as `{ default: { ... } }` because their source files use `import fs from 'fs'` (default import). The transfer-registry source file genuinely uses named imports, so its mock pattern is actually correct for its specific source file. However, the mock does NOT wrap the functions in a `default` property, meaning if Vitest's module resolution for `fs` aliases named exports through `default`, this could break. In practice, Node's `fs` module exports both named and default, and Vitest's mock factory replaces the entire module, so providing named exports directly is valid for destructured imports. **After full trace: this is actually correct and matches the source import style. Downgrading to NIT for the inconsistency with other test files' patterns.**

**REVISED: Downgraded to NIT (see CC-009).**

### [CC-002] Mock pattern mismatch: transfer-registry.test.ts mocks `crypto.randomUUID` but source uses named import
- **File:** tests/transfer-registry.test.ts:24-26
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test mocks `crypto` as `{ randomUUID: vi.fn(...) }`. The source `lib/transfer-registry.ts` (line 12) uses `import { randomUUID } from 'crypto'`. This is a named import, and the mock provides it as a named export. This is correct. However, all other test files that need UUID mocking mock `uuid` module (`{ v4: vi.fn(...) }`) because their source files use `import { v4 as uuidv4 } from 'uuid'`. This is not a bug in itself -- the transfer-registry source genuinely uses `crypto.randomUUID` while other sources use the `uuid` package.

**REVISED: Not a bug. The mock correctly matches the source. Removed from MUST-FIX.**

---

*After thorough re-analysis, no MUST-FIX issues were found. All findings are SHOULD-FIX or NIT.*

## SHOULD-FIX

### [CC-003] document-registry.ts `docsFilePath` lacks path-traversal validation unlike `task-registry.ts`
- **File:** tests/document-api.test.ts (entire file) / lib/document-registry.ts:22-24
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `task-registry.ts` source (line 27) validates `teamId` with a strict UUID regex and uses `path.basename()` to prevent path traversal. The `document-registry.ts` source (line 22-24) does NOT validate `teamId` at all -- `docsFilePath` directly interpolates `teamId` into a path with no sanitization. A malicious `teamId` like `../../etc/passwd` could read/write arbitrary files. The test suite (`document-api.test.ts`) does not test for path traversal inputs. This is not strictly a test bug, but the tests should include a test case verifying path traversal is rejected, and the source should be hardened.
- **Evidence:**
  ```typescript
  // document-registry.ts:22-24 -- NO validation
  function docsFilePath(teamId: string): string {
    return path.join(TEAMS_DIR, `docs-${teamId}.json`)
  }

  // task-registry.ts:24-29 -- HAS validation
  function tasksFilePath(teamId: string): string {
    if (!/^[0-9a-f]{8}-...$/i.test(teamId)) throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`tasks-${teamId}.json`))
  }
  ```
- **Fix:** Add UUID validation to `docsFilePath` in the source, and add a test case in `document-api.test.ts` that verifies non-UUID teamIds are rejected.

### [CC-004] Missing test coverage: `cleanupOldTransfers` function not tested
- **File:** tests/transfer-registry.test.ts
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The source `lib/transfer-registry.ts` exports `cleanupOldTransfers()` (lines 118-134), which filters resolved transfer requests older than 30 days. This function has non-trivial logic (date comparison, filtering by status, conditional save). No test covers this function. The function has a potential issue: it uses `r.resolvedAt || r.createdAt` which could be `undefined` for pending requests, but pending requests are filtered out first so this is safe. Still, the function deserves test coverage.
- **Evidence:**
  ```typescript
  // lib/transfer-registry.ts:118-134 -- exported but never tested
  export async function cleanupOldTransfers(): Promise<number> { ... }
  ```
- **Fix:** Add test cases for `cleanupOldTransfers` covering: (1) no resolved requests, (2) resolved requests within 30 days kept, (3) resolved requests older than 30 days removed, (4) pending requests always kept.

### [CC-005] Missing test coverage: `saveGovernance` export not tested
- **File:** tests/governance.test.ts
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** `lib/governance.ts` exports `saveGovernance()` (line 49) as a public function. It is exercised indirectly through `setPassword`, `setManager`, and `removeManager`, but there is no direct test for its error-handling behavior (it is designed to let errors propagate per fail-fast). Also `isChiefOfStaff` (single team check, line 107) and `getClosedTeamForAgent` / `getClosedTeamsForAgent` (lines 122-136) have no test coverage.
- **Evidence:** Functions exported from `lib/governance.ts` but not imported or tested in `tests/governance.test.ts`: `saveGovernance`, `isChiefOfStaff`, `getClosedTeamForAgent`, `getClosedTeamsForAgent`.
- **Fix:** Add test cases for `isChiefOfStaff`, `getClosedTeamForAgent`, `getClosedTeamsForAgent` at minimum, as these are used in API routes and the message filter.

### [CC-006] Missing test coverage: `saveTeams` success path and `TeamValidationException` not tested
- **File:** tests/team-registry.test.ts
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The `saveTeams` test (line 112-121) only tests the failure path (writeFileSync throwing). There is no test that verifies `saveTeams` returns `true` on success or that the written JSON structure is correct. Also, `TeamValidationException` is never directly tested (its constructor, `name` property, `code` property). It is exercised through `createTeam` in `team-api.test.ts` indirectly.
- **Evidence:**
  ```typescript
  // tests/team-registry.test.ts - saveTeams only tests error path
  describe('saveTeams', () => {
    it('returns false when writeFileSync throws', async () => { ... })
  })
  ```
- **Fix:** Add a test case `it('returns true and writes correct JSON structure on success')` for `saveTeams`.

### [CC-007] `wouldCreateCycle` test at line 507-524 tests a degenerate case that is already covered
- **File:** tests/task-registry.test.ts:507-524
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test titled "detects a 2-node cycle (B depends on A, adding A depends on B)" at line 507 calls `wouldCreateCycle(TEAM_1, 'b', 'a')` which checks "would adding A as a dependency of B create a cycle?" But B already has A in its `blockedBy` array. So this test is checking whether adding a *duplicate* existing dependency would be detected as a cycle. The function will return `true` because it walks from A to B (which matches taskId 'b'). The test comment explains this correctly, but the test name is misleading -- it implies checking a new dependency scenario, when actually it's checking "A already blocks B, would re-adding it be detected?" This is functionally correct but the name could confuse maintainers. More importantly, the test does NOT test the actual 2-node cycle scenario: "B blocks A, and we want to add A blocks B" (i.e., `wouldCreateCycle(TEAM_1, 'a', 'b')` where a.blockedBy=[] and b.blockedBy=['a']).
- **Evidence:**
  ```typescript
  // The test checks wouldCreateCycle('b', 'a') where b.blockedBy=['a'] already
  // It does NOT check wouldCreateCycle('a', 'b') which is the actual "add reverse edge" scenario
  ```
- **Fix:** Add a separate test for `wouldCreateCycle(TEAM_1, 'a', 'b')` where B depends on A but A does not depend on B, verifying the cycle IS detected in the reverse direction.

## NIT

### [CC-008] Inconsistent `fs` mock pattern: transfer-registry.test.ts uses named exports, all others use `default`
- **File:** tests/transfer-registry.test.ts:11-21
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `transfer-registry.test.ts` mocks `fs` with named exports at the top level of the mock factory (`{ existsSync, mkdirSync, readFileSync, writeFileSync }`). All other 6 test files that mock `fs` use the `{ default: { ... } }` pattern. This is because `transfer-registry.ts` uses `import { readFileSync, ... } from 'fs'` (named) while all other source files use `import fs from 'fs'` (default). Both patterns are correct for their respective source files, but the inconsistency could confuse maintainers.
- **Evidence:**
  ```typescript
  // transfer-registry.test.ts -- named exports mock (correct for source)
  vi.mock('fs', () => ({
    existsSync: vi.fn(...),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(...),
    writeFileSync: vi.fn(...),
  }))

  // governance.test.ts (and all others) -- default export mock (correct for source)
  vi.mock('fs', () => ({
    default: {
      existsSync: vi.fn(...),
      ...
    },
  }))
  ```
- **Fix:** Consider standardizing the import style in source files (all use `import fs from 'fs'` or all use named imports) for consistency.

### [CC-009] `makeTeamCounter` in team-registry.test.ts is not reset atomically with `uuidCounter`
- **File:** tests/team-registry.test.ts:58,77-80
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `makeTeamCounter` (line 58) is reset to 0 in `beforeEach` (line 79), but the helper `makeTeam` (line 60) uses pre-increment (`++makeTeamCounter`) to generate IDs like `team-1`, `team-2`. The `uuidCounter` is also reset to 0. Since `createTeam` uses `uuidv4()` (mocked as `uuid-N`), the manually created IDs (`team-N`) and the generated IDs (`uuid-N`) never collide. This is not a bug, but the two counter systems could confuse maintainers about which ID format comes from which path.
- **Fix:** No action needed. Documented for maintainer awareness.

### [CC-010] `afterEach` to restore real timers only in transfer-registry.test.ts
- **File:** tests/transfer-registry.test.ts:70-72
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Only `transfer-registry.test.ts` uses `vi.useFakeTimers()` / `vi.useRealTimers()`. All other test files rely on real system time. This is fine since `transfer-registry.test.ts` needs deterministic timestamps for assertions on `createdAt` and `resolvedAt`. The pattern is correct. However, `governance.test.ts` tests `setPassword` which also calls `new Date().toISOString()` for `passwordSetAt` but does NOT use fake timers -- it just asserts `typeof config.passwordSetAt === 'string'` and checks ISO validity rather than an exact value. Both approaches work but the inconsistency is worth noting.
- **Fix:** No action needed. Both approaches are valid.

### [CC-011] Comments inside tests use JSDoc `/** */` syntax which are not docstrings
- **File:** All 8 test files
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** All test files place `/** Verifies that ... */` comments as the first line inside the `it()` callback body. In TypeScript/JavaScript, these are not actual JSDoc docstrings -- they're just block comments. True docstrings would be on the function itself. However, since `vitest` does not support docstrings on test callbacks, this is the pragmatic approach and is consistent across all files.
- **Fix:** No action needed. This is a codebase convention.

### [CC-012] `document-api.test.ts` does not mock `@/lib/document-registry` -- relies on transitive fs mock
- **File:** tests/document-api.test.ts:35-36
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test file comment at line 35-36 explicitly notes: "team-registry is tested via its real implementation with a mocked 'fs' module. This is an integration test pattern -- the fs mock is picked up transitively." This is a valid integration test approach. The document-registry functions (`createDocument`, `loadDocuments`) are called with real logic but with the fs mock layer underneath. This is correct and well-documented.
- **Fix:** No action needed.

### [CC-013] `message-filter.test.ts` mock for `loadGovernance` returns minimal object, not full `GovernanceConfig`
- **File:** tests/message-filter.test.ts:7-9
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `mockLoadGovernance` returns `{ managerId: null, passwordHash: null }` which is missing the `version` and `passwordSetAt` fields from the full `GovernanceConfig` type. However, the `checkMessageAllowed` function only accesses `governance.managerId`, so the partial mock is sufficient for test correctness. The function never reads `version`, `passwordHash`, or `passwordSetAt`.
- **Evidence:**
  ```typescript
  // message-filter.ts:48 -- only uses managerId
  const governance = loadGovernance()
  // ...
  const agentIsManager = (id: string) => governance.managerId === id
  ```
- **Fix:** Consider returning a full `GovernanceConfig` shape in the mock for type completeness, but this is cosmetic.

## CLEAN

Files with no issues found:
- tests/validate-team-mutation.test.ts -- No issues. All 15 tests correctly exercise sanitizeTeamName and validateTeamMutation. Mock setup is minimal and correct (only mocking fs/uuid/file-lock for module loading). Test coverage is thorough across name validation, duplicate checks, type validation, COS rules, and multi-closed-team constraints.
- tests/message-filter.test.ts -- No issues (aside from cosmetic CC-013). All 11 test scenarios correctly cover the full algorithm (steps 1-6 plus edge cases). Mock isolation is clean. The COS-not-in-agentIds defensive test (line 177) is a valuable edge case. All assertions correctly match the source's returned `reason` strings.
- tests/team-api.test.ts -- No issues. All 13 tests correctly exercise the API routes through the mocked fs layer. The `makeParams` helper correctly uses `Promise.resolve` matching the Next.js 14 async params pattern. Mock setup for governance, team-acl, and agent-registry is appropriate.

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 5 |
| NIT | 6 |
| CLEAN | 3 |

**Key findings:**
1. **Security gap (CC-003):** `document-registry.ts` lacks path-traversal validation on `teamId`, unlike `task-registry.ts` which has strict UUID validation. No test covers this.
2. **Missing test coverage (CC-004, CC-005, CC-006):** Several exported functions (`cleanupOldTransfers`, `isChiefOfStaff`, `getClosedTeamForAgent`, `getClosedTeamsForAgent`, `saveTeams` success path) have no direct test coverage.
3. **Misleading cycle test (CC-007):** The 2-node cycle test checks a degenerate case (re-adding existing dependency) rather than the true reverse-edge scenario.
4. All mock patterns are correct for their respective source files. The `fs` mock inconsistency (CC-008) reflects genuine import style differences in the source files.
5. All test assertions correctly match source behavior. No false positive assertions were found.
