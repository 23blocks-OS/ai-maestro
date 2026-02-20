# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 9
**Date:** 2026-02-20T12:00:00.000Z

## Files Audited

1. `tests/services/teams-service.test.ts`
2. `tests/team-api.test.ts`
3. `tests/document-api.test.ts`
4. `tests/message-filter.test.ts`
5. `tests/validate-team-mutation.test.ts`
6. `tests/team-registry.test.ts`
7. `tests/governance.test.ts`
8. `tests/transfer-resolve-route.test.ts`
9. `tests/task-registry.test.ts`

---

## MUST-FIX

### [CC-001] task-registry.test.ts: fs mock missing `renameSync` and `unlinkSync`
- **File:** tests/task-registry.test.ts:12-24
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (traced source code at lib/task-registry.ts:48-57)
- **Description:** The task-registry.test.ts fs mock provides `existsSync`, `mkdirSync`, `readFileSync`, and `writeFileSync`, but does NOT include `renameSync` or `unlinkSync`. However, looking at the actual `saveTasks()` source code (lib/task-registry.ts:48-57), it calls `fs.writeFileSync()` directly (NOT the atomic temp+rename pattern). So the saveTasks function itself does NOT use renameSync. This is actually NOT a bug in the test — the test correctly mocks the functions that saveTasks actually calls.
- **RETRACTED:** After tracing the source, saveTasks in task-registry.ts does NOT use atomic writes (unlike saveTeams in team-registry.ts and saveGovernance in governance.ts). The test mock is correct for the current implementation. However, this is a real bug in the **source** — saveTasks should use atomic writes like the other registries. Filed as a source-level finding, not a test bug.

*No MUST-FIX issues found in test files after verification.*

---

## SHOULD-FIX

### [CC-002] task-registry.ts source: saveTasks lacks atomic write pattern
- **File:** lib/task-registry.ts:48-57
- **Severity:** SHOULD-FIX
- **Category:** logic (data integrity)
- **Confidence:** CONFIRMED
- **Description:** `saveTasks()` uses bare `writeFileSync()` without the atomic temp-file-then-rename pattern that both `saveTeams()` (team-registry.ts) and `saveGovernance()` (governance.ts) use. If the process crashes mid-write, the tasks file will be corrupted. This is an inconsistency in the codebase — the test correctly reflects the current source behavior, but the source itself has a data integrity risk.
- **Evidence:**
  ```typescript
  // lib/task-registry.ts:52 — bare writeFileSync, no atomic pattern
  fs.writeFileSync(tasksFilePath(teamId), JSON.stringify(file, null, 2), 'utf-8')

  // Compare with lib/governance.ts:66-68 — atomic write
  const tmpFile = GOVERNANCE_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8')
  fs.renameSync(tmpFile, GOVERNANCE_FILE)
  ```
- **Fix:** Add atomic write to `saveTasks()` and update the test's fs mock to include `renameSync`.

### [CC-003] governance.test.ts: fs mock missing `unlinkSync`
- **File:** tests/governance.test.ts:11-35
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The governance.test.ts fs mock includes `copyFileSync` and `renameSync` (for the corruption-backup and atomic-write paths) but does NOT include `unlinkSync`. Looking at the source, `saveGovernance()` uses `writeFileSync + renameSync` (atomic write), and the corruption handler uses `copyFileSync`. Neither path calls `unlinkSync` currently. However, a robust atomic-write pattern should clean up temp files on failure — if that's ever added, the mock would break. Currently not a bug, but a gap.
- **Evidence:**
  ```typescript
  // governance.test.ts mock provides:
  // existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync
  // Missing: unlinkSync
  ```
- **Fix:** Add `unlinkSync: vi.fn()` to the governance fs mock for completeness and future-proofing.

### [CC-004] document-api.test.ts: Missing agent-auth mock
- **File:** tests/document-api.test.ts
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The document-api.test.ts file does NOT mock `@/lib/agent-auth`. Other API route tests (team-api.test.ts, transfer-resolve-route.test.ts) properly mock this module. Currently, document-api tests don't set `X-Agent-Id` headers, so the missing mock doesn't cause failures. However, if document routes ever add authentication (which they should for closed-team document access control), these tests will break unexpectedly.
- **Evidence:** Compared with team-api.test.ts which has:
  ```typescript
  vi.mock('@/lib/agent-auth', () => ({
    authenticateAgent: vi.fn((authHeader, agentIdHeader) => {
      if (agentIdHeader) return { agentId: agentIdHeader }
      return {}
    })
  }))
  ```
  document-api.test.ts has no such mock.
- **Fix:** Add the agent-auth mock to document-api.test.ts for consistency and forward-compatibility.

### [CC-005] validate-team-mutation.test.ts: Missing test for empty string name after sanitization
- **File:** tests/validate-team-mutation.test.ts
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The test covers names shorter than 4 chars (line 98-106) and names with only whitespace via `sanitizeTeamName` (line 83-87), but does NOT test the case where a name consisting entirely of control characters (e.g., `"\x00\x01\x02"`) passes sanitization to become an empty string, which should be caught by the min-length check. This is a boundary condition for the sanitize-then-validate pipeline.
- **Evidence:** No test for `validateTeamMutation([], null, { name: '\x00\x01\x02' }, null)` which should yield `{ valid: false, error: 'Team name must be at least 4 characters', code: 400 }`.
- **Fix:** Add a test case for all-control-character names flowing through sanitization before validation.

### [CC-006] team-registry.test.ts: saveTeams error test uses dynamic import pattern that may be fragile
- **File:** tests/team-registry.test.ts:135-143
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `saveTeams` error test uses `await import('fs')` to get the mock reference, then `vi.mocked(fs.default.writeFileSync).mockImplementationOnce(...)`. This works but is fragile — the dynamic import returns the mocked module, but the test relies on the mock's `writeFileSync` being the same reference that the source module captured at import time. With vitest's ESM module mocking, this should work, but the pattern is unusual and harder to maintain than using `vi.hoisted()` with a shared mock reference.
- **Evidence:**
  ```typescript
  it('returns false when writeFileSync throws', async () => {
    const fs = await import('fs')
    vi.mocked(fs.default.writeFileSync).mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied')
    })
    ...
  })
  ```
- **Fix:** Consider using a module-level reference (e.g., from `vi.hoisted()`) for cleaner mock overrides. Not a bug, but a maintainability concern.

---

## NIT

### [CC-007] transfer-resolve-route.test.ts: `Mock` type imported but never used
- **File:** tests/transfer-resolve-route.test.ts:1
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Line 1 imports `type Mock` from vitest, but `Mock` is never used anywhere in the file. All mock functions use `vi.fn()` directly.
- **Evidence:** `import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'`
- **Fix:** Remove `type Mock` from the import.

### [CC-008] task-registry.test.ts: `makeTaskCounter` not reset in beforeEach
- **File:** tests/task-registry.test.ts:79,100-104
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `makeTaskCounter` variable starts at 1000 (line 79) and is never reset in `beforeEach` (lines 100-104). This means task IDs from `makeTask()` are not deterministic across test runs if tests are reordered. The `uuidCounter` and `fsStore` ARE properly reset. Since `makeTask()` is only used for helper data (not for ID matching), this is cosmetic, but it's inconsistent with the reset pattern in team-registry.test.ts (which resets `makeTeamCounter` in beforeEach, line 91).
- **Evidence:**
  ```typescript
  // task-registry.test.ts:100-104
  beforeEach(() => {
    fsStore = {}
    uuidCounter = 0
    vi.clearAllMocks()
    // Missing: makeTaskCounter = 1000
  })
  ```
- **Fix:** Add `makeTaskCounter = 1000` to beforeEach for consistency.

### [CC-009] governance.test.ts: isChiefOfStaffAnywhere test uses inline team objects instead of makeTeam helper
- **File:** tests/governance.test.ts:271-329
- **Severity:** NIT
- **Category:** test-coverage (style)
- **Confidence:** CONFIRMED
- **Description:** The `isChiefOfStaffAnywhere` tests manually construct full team objects with all required fields (id, name, type, agentIds, chiefOfStaffId, createdAt, updatedAt) instead of using the local `seedGovernance` helper or a shared `makeTeam` factory. This is verbose but not incorrect. Other test files in this PR use `makeTeam()` helpers for this purpose.
- **Fix:** Consider using a local `makeTeam` helper for consistency, but this is purely stylistic.

### [CC-010] teams-service.test.ts: Large file (962 lines) could benefit from splitting
- **File:** tests/services/teams-service.test.ts
- **Severity:** NIT
- **Category:** test-coverage (maintainability)
- **Confidence:** CONFIRMED
- **Description:** At 962 lines, this is the largest test file in the PR. It tests 15+ service functions. While the mocking setup is shared, the file could be split into domain-specific test files (e.g., teams-service-documents.test.ts, teams-service-tasks.test.ts) for easier navigation and faster targeted test runs.
- **Fix:** Consider splitting in a future PR. Not urgent.

---

## Checklist Verification Results

| # | Checklist Item | Status | Details |
|---|---------------|--------|---------|
| 1 | getTeam mock for updateTeamDocument | PASS | teams-service.test.ts lines 793, 803, 821, 831 correctly set up `mockTeams.getTeam.mockReturnValue(makeTeam())` |
| 2 | Assertions match service/function behavior | PASS | All assertions traced against source code. No false positives found. |
| 3 | False positives (tests that pass but shouldn't) | PASS | No false positives identified. Tests correctly validate both happy and error paths. |
| 4 | vi.mock('@/lib/agent-auth') where needed | PARTIAL | Present in team-api.test.ts and transfer-resolve-route.test.ts. Missing in document-api.test.ts (CC-004). |
| 5 | fs mocks complete (renameSync, unlinkSync) | PASS | team-api.test.ts includes both. team-registry.test.ts includes both. governance.test.ts includes renameSync+copyFileSync (no unlinkSync needed currently). task-registry.test.ts has neither (but source doesn't use atomic writes — CC-002). validate-team-mutation.test.ts has minimal mock (correct — tests pure functions). |
| 6 | Closed-team governance tests for deleteTeamById | PASS | teams-service.test.ts lines 325-353 test COS-only deletion of closed teams. team-api.test.ts lines 415-464 test COS allowed, MANAGER allowed, unauthorized denied. |
| 7 | ACL denial tests for PUT/DELETE | PASS | team-api.test.ts lines 372-387 (PUT ACL denial), 467-481 (DELETE ACL denial). |
| 8 | XSS SECURITY TODO comment in document-api.test.ts | PASS | Lines 217-238 contain the XSS test with "SECURITY: Stored XSS risk" comment. |
| 9 | Tests that test mocked behavior instead of real | PASS | All tests properly mock dependencies while testing real logic. The bcrypt mock in governance.test.ts correctly simulates hash/compare behavior. No tests test only mock wiring. |

---

## CLEAN

Files with no issues found:
- `tests/services/teams-service.test.ts` — Comprehensive, 962 lines, all mocks correct, all assertions verified against source
- `tests/team-api.test.ts` — Complete fs mock, agent-auth mock, ACL tests, closed-team governance tests
- `tests/message-filter.test.ts` — 15 scenarios covering all 6 decision steps, UUID-format IDs, defense-in-depth tests
- `tests/validate-team-mutation.test.ts` — 18 tests covering sanitization, validation, duplicates, COS rules, multi-closed constraints (one coverage gap noted as CC-005)

---

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 5 (1 source bug, 4 test gaps) |
| NIT | 4 |

**Overall Assessment:** The test suite is well-structured with comprehensive coverage. No false positives or incorrect assertions were found. The main gaps are: (1) a source-level data integrity issue in task-registry.ts saveTasks lacking atomic writes, (2) missing agent-auth mock in document-api tests, and (3) minor coverage gaps for edge cases. All tests correctly mock their dependencies and validate both happy and error paths.
