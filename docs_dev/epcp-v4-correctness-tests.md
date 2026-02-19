# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 9
**Date:** 2026-02-19T17:29:00.000Z

## MUST-FIX

### [CC-001] fs mock shape mismatch between transfer-registry.test.ts and actual imports
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:11-21
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `transfer-registry.ts` uses named imports (`import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'`), but the test mocks `fs` with top-level named exports (no `default` wrapper). Meanwhile, other test files (governance, team-registry, team-api, document-api, task-registry) mock `fs` with a `default:` wrapper because their corresponding implementation files use `import fs from 'fs'` (default import). The transfer-registry test is correct for its implementation -- this is NOT a bug. However, the inconsistency between test files is confusing and if someone refactors transfer-registry.ts to use `import fs from 'fs'` the test would silently break.
- **Evidence:**
  ```typescript
  // transfer-registry.ts uses NAMED imports:
  import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

  // transfer-registry.test.ts correctly mocks named exports:
  vi.mock('fs', () => ({
    existsSync: vi.fn(...),
    readFileSync: vi.fn(...),
    writeFileSync: vi.fn(...),
    mkdirSync: vi.fn(),
  }))
  ```
- **Fix:** This is actually correctly matched to the implementation. Re-classifying to NIT for the inconsistency documentation concern. See CC-012.

**REVISED: No MUST-FIX issues found after full verification.**

## SHOULD-FIX

### [CC-002] governance.test.ts: bcrypt mock uses BCRYPT_SALT_ROUNDS=12 in real code but mock ignores salt rounds entirely
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:33-38
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The mock for `bcrypt.hash` accepts `(plain: string)` with one argument and returns `hashed:${plain}`, ignoring the salt rounds parameter. The real `bcrypt.hash` is called as `bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS)` where `BCRYPT_SALT_ROUNDS = 12`. While this mock works for the test's purpose (verifying the hashed value is stored), it cannot catch bugs where the salt rounds argument is missing, wrong, or passed in the wrong position. The mock signature should accept the second argument to at least verify it's being called correctly.
- **Evidence:**
  ```typescript
  // Mock:
  hash: vi.fn((plain: string) => Promise.resolve(`hashed:${plain}`)),
  // Real call:
  config.passwordHash = await bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS)
  ```
- **Fix:** Change mock to `hash: vi.fn((plain: string, _rounds: number) => Promise.resolve(\`hashed:${plain}\`))` and optionally add an assertion that `bcrypt.hash` was called with 12 as the second argument.

### [CC-003] governance.test.ts: loadGovernance creates governance file on first call, but mock fs does not capture this side effect accurately
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:93-100
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test "returns defaults when no governance file exists on disk" asserts that `loadGovernance()` returns `DEFAULT_GOVERNANCE_CONFIG`. However, the real `loadGovernance()` also calls `saveGovernance(DEFAULT_GOVERNANCE_CONFIG)` on first run (line in the impl: "First-time initialization: write defaults and return them"). The test does not verify that `writeFileSync` was called, meaning it cannot catch a regression where the first-run initialization is accidentally removed.
- **Evidence:**
  ```typescript
  // Real implementation:
  if (!fs.existsSync(GOVERNANCE_FILE)) {
    saveGovernance(DEFAULT_GOVERNANCE_CONFIG)  // <-- side effect
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
  ```
- **Fix:** Add assertion: `expect(fs.default.writeFileSync).toHaveBeenCalled()` to verify the first-run write side effect.

### [CC-004] team-api.test.ts: POST route uses governance and agent-registry but test mocks may mask validation path
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:36-51
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The real `POST /api/teams` calls `getManagerId()` and `loadAgents()` to pass to `createTeam()` for validation (R4.1 multi-closed constraint and agent name collision). The test mocks `governance.getManagerId` to return `null` and `agent-registry.loadAgents` to return `[]`. This means the test's "creates team with name and agents" never exercises the validation paths where a managerId exists or agent name collisions occur. These are separate from the pure `validateTeamMutation` tests in validate-team-mutation.test.ts, but the API-level integration test should have at least one case with a non-null managerId.
- **Evidence:**
  ```typescript
  // Mock always returns null/empty:
  vi.mock('@/lib/governance', () => ({
    getManagerId: vi.fn(() => null),
    ...
  }))
  vi.mock('@/lib/agent-registry', () => ({
    loadAgents: vi.fn(() => []),
  }))
  ```
- **Fix:** Add a test case for `POST /api/teams` that sets `getManagerId` to return a real ID and `loadAgents` to return agents, then verifies the validation integration works end-to-end through the API route.

### [CC-005] team-api.test.ts: PUT route strips chiefOfStaffId and type, but no test verifies this security-critical behavior
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:203-274
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The real `PUT /api/teams/[id]` route intentionally strips `chiefOfStaffId` and `type` from the request body (line: "Strip chiefOfStaffId and type from generic PUT -- these must use dedicated password-protected endpoints (R3.12, R8.2)"). This is a security-critical behavior that prevents unauthorized team type changes. But no test verifies that passing `type` or `chiefOfStaffId` in the PUT body is silently ignored.
- **Evidence:**
  ```typescript
  // Route implementation:
  const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt } = body
  // chiefOfStaffId and type are NOT destructured -- intentionally stripped
  ```
- **Fix:** Add test: "ignores chiefOfStaffId and type in PUT body" that creates a team, sends PUT with `{ type: 'closed', chiefOfStaffId: 'some-agent' }`, and verifies the team's type and chiefOfStaffId remain unchanged.

### [CC-006] team-api.test.ts: DELETE route has no test for closed team deletion guard (SR-002)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:280-298
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The real DELETE handler has a guard: "Closed team deletion requires elevated authority (MANAGER or COS)". It checks `X-Agent-Id` header and blocks deletion by non-MANAGER/non-COS agents. The test only covers basic 404 and successful deletion cases. There is no test for:
  - Attempting to delete a closed team without the `X-Agent-Id` header
  - Attempting to delete a closed team with a non-authorized agent
  - Successful deletion by COS or MANAGER
- **Evidence:**
  ```typescript
  // Route code not tested:
  if (team && team.type === 'closed') {
    if (agentId && !isManager(agentId) && team.chiefOfStaffId !== agentId) {
      return NextResponse.json(
        { error: 'Closed team deletion requires MANAGER or Chief-of-Staff authority' },
        { status: 403 }
      )
    }
  }
  ```
- **Fix:** Add test cases for the closed team deletion guard, including the 403 path and the authorized path.

### [CC-007] transfer-resolve-route.test.ts: Missing test for 400 validation (missing action/resolvedBy)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:150-284
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The resolve route has initial validation: `if (!action || !resolvedBy)` returns 400, and `if (action !== 'approve' && action !== 'reject')` returns 400. Neither of these early-exit paths is tested. The route also has a 404 for "Transfer request not found" and 409 for "already resolved" -- neither tested.
- **Evidence:**
  ```typescript
  // Untested paths in the route:
  if (!action || !resolvedBy) {
    return NextResponse.json({ error: 'action and resolvedBy are required' }, { status: 400 })
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }
  ```
- **Fix:** Add tests for: (a) missing action, (b) missing resolvedBy, (c) invalid action value, (d) transfer not found (404), (e) already resolved transfer (409).

### [CC-008] transfer-resolve-route.test.ts: Missing test for authorization check (403 path)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:150-284
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The resolve route verifies that `resolvedBy` is either the source team COS or MANAGER before allowing resolution. This is a security-critical check. No test verifies that a non-COS, non-MANAGER agent is rejected with 403.
- **Evidence:**
  ```typescript
  // Untested path:
  if (!isSourceCOS && !isGlobalManager) {
    return NextResponse.json({ error: 'Only the source team COS or MANAGER can resolve this transfer' }, { status: 403 })
  }
  ```
- **Fix:** Add a test where `resolvedBy` is neither the COS nor the MANAGER and verify 403 is returned.

### [CC-009] document-api.test.ts: No test for document-registry's `createDocument` being synchronous (not wrapped in withLock)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:98-111
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Unlike `task-registry.ts` and `team-registry.ts` which wrap mutations in `withLock()`, the `document-registry.ts` `createDocument` function does NOT use any locking. It does a read-modify-write cycle (`loadDocuments` -> `documents.push(doc)` -> `saveDocuments`) without protection. The test does not mock or exercise any concurrent access scenario, but more importantly, the test file does not even mock `@/lib/file-lock` because the document-registry never imports it. This means document creation has a race condition in production under concurrent requests. This is an implementation bug surfaced by test analysis.
- **Evidence:**
  ```typescript
  // document-registry.ts - createDocument is NOT locked:
  export function createDocument(data: {...}): TeamDocument {
    const documents = loadDocuments(data.teamId)  // READ
    // ... build doc ...
    documents.push(doc)                            // MODIFY
    saveDocuments(data.teamId, documents)          // WRITE
    return doc
  }
  // Compare with task-registry.ts:
  export function createTask(data: {...}): Promise<Task> {
    return withLock('tasks-' + data.teamId, () => { ... })
  }
  ```
- **Fix:** This is an implementation bug: `createDocument`, `updateDocument`, and `deleteDocument` should use `withLock()`. The test should be updated to mock `@/lib/file-lock` and verify locking behavior, similar to the task-registry tests.

### [CC-010] message-filter.test.ts: Missing edge case - sender in multiple closed teams (COS scenario)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts:49-228
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `checkMessageAllowed` implementation uses `getClosedTeamsForAgent` (plural) to handle COS agents in multiple closed teams (R6.7). However, no test exercises the case where a COS is in multiple closed teams and messages a member from their second team (not first). This is a critical path for the plural-teams logic.
- **Evidence:**
  ```typescript
  // Implementation handles multi-team COS:
  const senderCosTeams = closedTeams.filter(t => t.chiefOfStaffId === senderAgentId)
  const allSenderTeamIds = [...new Set([...senderTeams.map(t => t.id), ...senderCosTeams.map(t => t.id)])]
  // But no test has a COS in TWO closed teams messaging a member from team #2
  ```
- **Fix:** Add a test where COS is chiefOfStaffId in two closed teams and messages a member from the second team, verifying it's allowed.

## NIT

### [CC-011] team-registry.test.ts: createTeam calls validateTeamMutation internally, which means simple create tests may fail on valid names
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:127-154
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the real `createTeam()`, `validateTeamMutation()` is called with the team data, and the function sanitizes the name. The tests use names like "New Team", "Empty", "Described", "Persisted" -- all are at least 4 characters and valid. However, the test `createTeam({ name: 'Empty', agentIds: [] })` uses a 5-character name which is fine, but there's no test for boundary conditions (exactly 4 chars, exactly 64 chars). These boundary tests exist in `validate-team-mutation.test.ts` for the pure function, but integration coverage through `createTeam` would be valuable.
- **Fix:** Consider adding one createTeam test with a 4-character name to verify end-to-end validation integration.

### [CC-012] Inconsistent fs mock patterns across test files
- **File:** Multiple test files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Most test files mock `fs` with `default:` wrapper (matching `import fs from 'fs'`), but `transfer-registry.test.ts` mocks with top-level named exports (matching `import { readFileSync, ... } from 'fs'`). Both patterns are correct for their respective implementations, but the inconsistency could confuse developers and make it harder to spot mock/import mismatches during refactoring.
- **Fix:** Add a comment in `transfer-registry.test.ts` explaining why the mock pattern differs: "// Named exports mock (not default) because transfer-registry.ts uses named imports".

### [CC-013] task-registry.test.ts: makeTaskCounter initialized to 1000 but never explained
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:73
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `makeTaskCounter` starts at 1000 to avoid collisions with the uuid mock counter, but there is no comment explaining this choice. The comment on line 73 says "Separate from uuid mock counter to avoid coupling" but doesn't explain why 1000 specifically.
- **Fix:** No action needed -- the existing comment is sufficient. The value 1000 is arbitrary and just needs to be distinct from the uuid counter range.

### [CC-014] validate-team-mutation.test.ts: reservedNames test uses hardcoded lowercase comparison but doesn't test the edge case from the implementation
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:154-169
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test verifies that `Backend-API` collides with `backend-api` in reservedNames. The real implementation uses `.toLowerCase()` on both sides. However, the test's error message assertion expects `'Name "backend-api" is already used by an agent'` but the real implementation returns `'Name "${collision}" is already used by an agent'` where `collision` is the original-case value from reservedNames. The test assertion `expect(result.error).toBe('Name "backend-api" is already used by an agent')` will match because the reservedNames array contains `'backend-api'` which is the `collision` variable value. This is correct but subtly relies on the first matching reserved name being the lowercase one.
- **Evidence:**
  ```typescript
  // reservedNames = ['backend-api', 'Frontend Worker']
  // collision = reservedNames.find(n => n.toLowerCase() === lowerName)
  // lowerName = 'backend-api' (from 'Backend-API'.toLowerCase())
  // collision = 'backend-api' (first match in array)
  ```
- **Fix:** The test is correct. No action needed.

### [CC-015] governance.test.ts: isManager test does not cover null === null edge case
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:204-209
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test for `isManager('')` when no manager is set verifies the result is `false`. However, the real implementation is `config.managerId === agentId`, and when `managerId` is `null` and `agentId` is `''`, the comparison `null === ''` is `false` (correct). But there is no test for `isManager(undefined as any)` or `isManager(null as any)` which would behave differently due to `null === null` being `true`. While these are pathological inputs, the implementation has no guard against them.
- **Fix:** Consider adding a defensive test: `expect(isManager(null as any)).toBe(false)` to ensure passing null as agentId doesn't accidentally match a null managerId, or add a guard in the implementation.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts -- Mock pattern matches named imports correctly; comprehensive coverage of CRUD, filtering, and idempotency. Well-structured with fake timers.
- /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts -- Pure function tests with excellent coverage of all validation branches (name, type, COS, multi-closed). No mock drift risk since these are pure functions.

## SUMMARY

| Category | Count |
|----------|-------|
| MUST-FIX | 0 |
| SHOULD-FIX | 9 |
| NIT | 5 |
| CLEAN | 2 |

### Key Themes

1. **Missing negative/security path tests (CC-005, CC-006, CC-007, CC-008):** Several API routes have authorization and validation paths (403s, 400s) that are not tested. The tests focus on happy paths and basic 404s but miss security-critical guard clauses.

2. **Document-registry race condition (CC-009):** The document-registry lacks `withLock()` protection on its CRUD operations, unlike task-registry and team-registry. This is an implementation bug surfaced by comparing test patterns across files.

3. **Mock fidelity (CC-002, CC-003):** Some mocks are too permissive (bcrypt ignoring salt rounds) or miss verifying important side effects (first-run file creation), which could allow regressions to slip through.

4. **Multi-team COS edge case (CC-010):** The message-filter's multi-closed-team COS logic (R6.7) is implemented but not tested with a COS in multiple teams.
