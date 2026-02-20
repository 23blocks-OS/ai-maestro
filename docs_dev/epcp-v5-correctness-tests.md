# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 9
**Date:** 2026-02-19T18:10:00.000Z

## MUST-FIX

### [CC-001] transfer-registry.test.ts fs mock uses named exports but governance.test.ts/team-registry.test.ts use default export -- mock style mismatch is correct but fragile
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:12-22
- **Severity:** MUST-FIX (CONFIRMED -- but currently works because implementation matches)
- **Category:** api-contract
- **Description:** The `transfer-registry.ts` source uses named imports (`import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'`), while `governance.ts` and `team-registry.ts` use default import (`import fs from 'fs'`). The transfer-registry test correctly mocks named exports (no `default` wrapper), while governance/team-registry tests correctly use the `default` wrapper. This is currently correct, but if any source file changes its import style, the corresponding test mock will silently break. **No action needed unless import style changes, but this is a documentation/awareness item.**
- **Evidence:**
  ```ts
  // transfer-registry.test.ts -- named exports (correct)
  vi.mock('fs', () => ({
    existsSync: vi.fn(...),
    readFileSync: vi.fn(...),
    writeFileSync: vi.fn(...),
  }))

  // governance.test.ts -- default export (correct)
  vi.mock('fs', () => ({
    default: {
      existsSync: vi.fn(...),
      readFileSync: vi.fn(...),
      writeFileSync: vi.fn(...),
    },
  }))
  ```
- **Fix:** Add a comment at the top of each test file noting which import style the source uses, so reviewers can catch mismatches. No code change needed.

**RETRACTED: On further analysis, this is actually correct behavior and not a bug. Downgrading from MUST-FIX to NIT (documentation).**

### [CC-002] team-api.test.ts: isValidUuid mocked to always return true bypasses UUID validation in API routes
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:54-56
- **Severity:** MUST-FIX (CONFIRMED)
- **Category:** security
- **Description:** The `isValidUuid` mock always returns `true`, which means the test for `GET /api/teams/[id]` with ID `'non-existent'` tests the "team not found" path but never tests the UUID validation guard. The real `isValidUuid` uses a strict UUID regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-.../i`), so `'non-existent'` would actually return 400, not 404. The test passes but tests the wrong code path.
- **Evidence:**
  ```ts
  // Mock always bypasses UUID validation
  vi.mock('@/lib/validation', () => ({
    isValidUuid: vi.fn(() => true),
  }))

  // This test actually tests 404 path, not the UUID validation path
  it('returns 404 for non-existent team', async () => {
    const req = makeRequest('/api/teams/non-existent')
    const res = await getTeamRoute(req, makeParams('non-existent') as any)
    expect(res.status).toBe(404) // Would be 400 in production
  })
  ```
- **Fix:** Add dedicated tests for UUID validation by temporarily mocking `isValidUuid` to return `false` for specific test cases. Also add at least one test where `isValidUuid` returns false to verify the 400 response code path.

### [CC-003] team-api.test.ts: Missing test for PUT stripping `type` and `chiefOfStaffId` -- test uses real team-registry which validates differently than the route
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:303-329
- **Severity:** MUST-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The test "ignores chiefOfStaffId and type in body" (line 303) verifies that `updateTeam` was not called with `type` or `chiefOfStaffId` in the updates. However, the test creates a team with `type: 'open'` and then sends `type: 'closed'` in the PUT body. The route's PUT handler destructures only `{ name, description, agentIds, lastMeetingAt, instructions, lastActivityAt }` -- excluding `type` and `chiefOfStaffId`. The spy assertion verifies this stripping works. **However**, the spy is created on a *dynamic import* of the module, which may not be the same instance the route uses. The `vi.spyOn(await import('@/lib/team-registry'), 'updateTeam')` creates a spy on a potentially different module instance than what was imported by the route at module load time. This means the spy may not capture the actual call.
- **Evidence:**
  ```ts
  const spy = vi.spyOn(await import('@/lib/team-registry'), 'updateTeam')
  // ... make request ...
  expect(spy).toHaveBeenCalledTimes(1)
  const updateArgs = spy.mock.calls[0][1]
  expect(updateArgs).not.toHaveProperty('type')
  ```
- **Fix:** Verify that Vitest's module registry ensures `await import(...)` returns the same module instance as the static import. If not, the spy will not intercept the real call. Consider using `vi.mocked(updateTeam)` from the statically imported module instead.

### [CC-004] team-api.test.ts: createTeam spy on dynamic import may not intercept the actual call
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:183
- **Severity:** MUST-FIX (LIKELY)
- **Category:** logic
- **Description:** Same issue as CC-003. `vi.spyOn(await import('@/lib/team-registry'), 'createTeam')` may create a spy on a different module instance than what the route handler uses. If Vitest's ESM module mock system returns different objects for `import()` vs. static `import`, the spy won't capture anything.
- **Evidence:**
  ```ts
  const spy = vi.spyOn(await import('@/lib/team-registry'), 'createTeam')
  // ... later ...
  expect(spy).toHaveBeenCalledTimes(1)
  expect(spy.mock.calls[0][1]).toBe('manager-uuid')
  ```
- **Fix:** Use the statically imported `createTeam` with `vi.mocked()` instead, or verify the test actually passes by running it.

## SHOULD-FIX

### [CC-005] governance.test.ts: bcrypt mock doesn't simulate timing -- verifyPassword timing-attack resistance not tested
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:33-38
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** security
- **Description:** The bcrypt mock uses a simple string comparison (`hash === 'hashed:${plain}'`), which is instantaneous. The real `bcrypt.compare` uses constant-time comparison to prevent timing attacks. While the comment in the source says timing attacks are accepted risk in Phase 1 (localhost-only), the mock fidelity gap means the test can't catch a future regression if someone replaces bcrypt with a naive comparison.
- **Evidence:**
  ```ts
  vi.mock('bcryptjs', () => ({
    default: {
      hash: vi.fn((plain: string, _rounds: number) => Promise.resolve(`hashed:${plain}`)),
      compare: vi.fn((plain: string, hash: string) => Promise.resolve(hash === `hashed:${plain}`)),
    },
  }))
  ```
- **Fix:** Low priority given Phase 1's localhost-only model. Document the mock fidelity gap as a comment. No immediate code change needed.

### [CC-006] message-filter.test.ts: Missing test for COS-not-in-agentIds sending to another team's member
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The message-filter source has a "defense-in-depth" path where `senderCosTeams` (teams where sender is chiefOfStaffId but NOT in agentIds) is used. The test at line 197 covers the *recipient* COS-not-in-agentIds edge case. But there is no test where the *sender* is COS but not listed in agentIds of their own team, testing the `senderCosTeams` fallback path specifically.
- **Evidence:**
  ```ts
  // Source code (message-filter.ts):
  // Defense-in-depth: also include teams where sender is COS via chiefOfStaffId,
  // in case COS was not added to agentIds (data corruption edge case).
  const senderCosTeams = closedTeams.filter(t => t.chiefOfStaffId === senderAgentId)
  const allSenderTeamIds = [...new Set([...senderTeams.map(t => t.id), ...senderCosTeams.map(t => t.id)])]
  ```
- **Fix:** Add a test where COS is the `chiefOfStaffId` of a closed team but is NOT in that team's `agentIds`, and verify they can still message team members.

### [CC-007] document-api.test.ts: No test for XSS via document title or content
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** security
- **Description:** The document API tests don't verify that malicious HTML/script content in document titles or content is handled safely. The API stores raw content without sanitization. While the API is JSON-based and the risk depends on how the frontend renders content, the tests should verify the API's behavior with potentially dangerous input to document assumptions.
- **Evidence:** No test with `title: '<script>alert(1)</script>'` or `content: '<img onerror=alert(1) src=x>'`.
- **Fix:** Add at least one test verifying the API accepts and stores content verbatim (documenting that sanitization is a frontend concern), or add server-side sanitization for titles.

### [CC-008] task-registry.test.ts: No test for path traversal prevention in teamId
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** security
- **Description:** The real `tasksFilePath()` function validates that teamId is a strict UUID v4 format and uses `path.basename()` as defense-in-depth to prevent path traversal. However, the test suite never tests what happens when an invalid teamId (e.g., `../../../etc/passwd`) is passed. This security-critical guard has zero test coverage.
- **Evidence:**
  ```ts
  // Source: task-registry.ts
  function tasksFilePath(teamId: string): string {
    if (!/^[0-9a-f]{8}-...$/i.test(teamId)) throw new Error('Invalid team ID')
    return path.join(TEAMS_DIR, path.basename(`tasks-${teamId}.json`))
  }
  ```
  No test calls `loadTasks('../malicious')` or `createTask({ teamId: '../malicious', ... })`.
- **Fix:** Add tests for `loadTasks` and `createTask` with non-UUID teamIds to verify the guard throws.

### [CC-009] transfer-resolve-route.test.ts: Missing test for 404 when source team not found
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The resolve route checks if `fromTeam` exists and returns 404 if not. The test suite does not cover this case.
- **Evidence:**
  ```ts
  // Source: resolve/route.ts
  fromTeam = teams.find(t => t.id === transferReq.fromTeamId)
  if (!fromTeam) {
    return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
  }
  ```
  No test mocks `loadTeams` to return an empty array where fromTeam would be missing.
- **Fix:** Add a test where `mockLoadTeams` returns teams that don't include the source team ID.

### [CC-010] transfer-resolve-route.test.ts: Missing test for 404 when destination team not found during approval
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The resolve route checks if `toTeam` exists before approval and returns 404 if not. No test covers this path.
- **Evidence:**
  ```ts
  // Source: resolve/route.ts
  if (action === 'approve') {
    if (!toTeam) {
      return NextResponse.json({ error: 'Destination team no longer exists...' }, { status: 404 })
    }
  }
  ```
- **Fix:** Add a test where `mockLoadTeams` includes the source team but not the destination team, and action is 'approve'.

### [CC-011] transfer-resolve-route.test.ts: Missing test for invalid transfer ID format (isValidUuid guard)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:42-44
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** security
- **Description:** The `isValidUuid` is mocked to always return `true`, meaning the UUID format validation guard for the transfer ID path parameter is never tested. A path traversal attack via malformed transfer ID would not be caught.
- **Evidence:**
  ```ts
  vi.mock('@/lib/validation', () => ({
    isValidUuid: vi.fn(() => true),
  }))
  ```
- **Fix:** Add a test where `isValidUuid` returns `false` to verify the 400 response.

### [CC-012] team-registry.test.ts: No test for `saveTeams` success path writing correct format
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:111-121
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The `saveTeams` describe block only tests the failure path (writeFileSync throws). There is no direct test for the success path verifying that `saveTeams` writes the correct `{ version: 1, teams: [...] }` format. The `createTeam` tests implicitly test this via `loadTeams()`, but `saveTeams` success return value `true` is never explicitly asserted.
- **Evidence:**
  ```ts
  describe('saveTeams', () => {
    it('returns false when writeFileSync throws', async () => {
      // Only failure path tested
    })
    // No test: it('writes teams and returns true', ...)
  })
  ```
- **Fix:** Add a success-path test: `saveTeams([team]) -> expect true; verify fsStore content`.

### [CC-013] validate-team-mutation.test.ts: Missing test for R4.7 (cannot remove COS from agentIds)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The `validateTeamMutation` source enforces rule R4.7: "Cannot remove the Chief-of-Staff from team members -- remove the COS role first." This rule is not tested at all.
- **Evidence:**
  ```ts
  // Source: team-registry.ts
  if (data.agentIds !== undefined && existingTeam?.chiefOfStaffId) {
    const cosAfterMutation = data.chiefOfStaffId !== undefined ? data.chiefOfStaffId : existingTeam.chiefOfStaffId
    if (cosAfterMutation && !data.agentIds.includes(cosAfterMutation)) {
      return { valid: false, error: 'Cannot remove the Chief-of-Staff from team members...', code: 400 }
    }
  }
  ```
  No test exercises this path.
- **Fix:** Add a test: existing closed team with COS in agentIds, update removes COS from agentIds without changing chiefOfStaffId -> expect `{ valid: false, error: '...remove the COS role first', code: 400 }`.

### [CC-014] validate-team-mutation.test.ts: Missing test for R4.4 (COS exempt from multi-closed-team constraint)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts
- **Severity:** SHOULD-FIX (CONFIRMED)
- **Category:** logic
- **Description:** The source code exempts COS agents from the one-closed-team constraint (R4.4): an agent who is COS anywhere can be in multiple closed teams. There is a test for the MANAGER exemption (R4.3) but not for the COS exemption.
- **Evidence:**
  ```ts
  // Source: team-registry.ts
  // Agent being assigned as COS in this mutation is exempt (R4.4)
  if (agentId === effectiveCOS) continue
  // Agent who is COS in any existing team is exempt (R4.4)
  const isCOSAnywhere = teams.some(t => t.chiefOfStaffId === agentId)
  if (isCOSAnywhere) continue
  ```
- **Fix:** Add tests for both branches of R4.4: (1) agent is the COS being assigned in the current mutation, (2) agent is already COS in another team.

## NIT

### [CC-015] governance.test.ts: loadGovernance test for corruption/invalid JSON is missing
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:92-120
- **Severity:** NIT
- **Category:** logic
- **Description:** The source `loadGovernance()` handles JSON parse errors by returning defaults and backing up the corrupted file. No test verifies this corruption-handling path.
- **Evidence:**
  ```ts
  // Source: governance.ts
  if (error instanceof SyntaxError) {
    console.error('[governance] CORRUPTION: governance.json contains invalid JSON...')
    try { fs.copyFileSync(GOVERNANCE_FILE, backupPath) } catch { /* best-effort */ }
  }
  ```
- **Fix:** Add a test seeding `fsStore[GOVERNANCE_FILE]` with invalid JSON and verify `loadGovernance()` returns `DEFAULT_GOVERNANCE_CONFIG`.

### [CC-016] team-registry.test.ts: `makeTeamCounter` is reset but never used in assertions
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:58-70,79
- **Severity:** NIT
- **Category:** logic
- **Description:** The `makeTeamCounter` is incremented in `makeTeam()` to generate unique IDs like `team-1`, `team-2`, etc. It's reset in `beforeEach`, but tests that use `createTeam` (which generates UUIDs via the mock) don't use `makeTeam` for ID generation. The `makeTeam` helper is only used in the `saveTeams` failure test. The counter reset is harmless but unnecessary complexity.
- **Fix:** Consider removing `makeTeamCounter` reset from `beforeEach` or simplifying `makeTeam` to use a static ID with explicit override.

### [CC-017] transfer-registry.test.ts: Uses `vi.useFakeTimers()` but other test files don't -- inconsistent time handling
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:67-72
- **Severity:** NIT
- **Category:** logic
- **Description:** The transfer-registry tests use `vi.useFakeTimers()` to control `new Date()` output, which allows asserting exact timestamps. Other test files (governance, team-registry, task-registry) don't fake timers, meaning timestamps in their assertions use `toBeDefined()` or regex checks instead of exact values. This inconsistency isn't a bug, but the transfer-registry approach is superior for deterministic testing.
- **Fix:** Consider adopting `vi.useFakeTimers()` in other test files for more precise timestamp assertions.

### [CC-018] message-filter.test.ts: Mock return type doesn't include all GovernanceConfig fields
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts:7-10
- **Severity:** NIT
- **Category:** api-contract
- **Description:** The `mockLoadGovernance` returns `{ managerId, passwordHash }` but the real `GovernanceConfig` also includes `version: 1` and `passwordSetAt`. The message-filter only reads `managerId`, so this is harmless, but the mock doesn't match the full interface.
- **Evidence:**
  ```ts
  const mockLoadGovernance = vi.fn(() => ({
    managerId: null as string | null,
    passwordHash: null as string | null,
    // Missing: version: 1, passwordSetAt: null
  }))
  ```
- **Fix:** Add the missing fields to the mock return for interface fidelity.

### [CC-019] document-api.test.ts: No test for tags field update via PUT
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:237-310
- **Severity:** NIT
- **Category:** logic
- **Description:** The PUT tests verify title, content, and pinned updates individually, but no test updates the `tags` field. The route handler does support tags updates.
- **Fix:** Add a test for updating tags via PUT.

### [CC-020] transfer-resolve-route.test.ts: `mockAcquireLock` returns a mock release function that is never asserted
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-resolve-route.test.ts:162
- **Severity:** NIT
- **Category:** logic
- **Description:** The test sets `mockAcquireLock.mockResolvedValue(vi.fn())` but never asserts that the release function was called. The source code calls `releaseLock()` in a `finally` block. Asserting that release is called would verify the lock is properly released even on error paths.
- **Evidence:**
  ```ts
  mockAcquireLock.mockResolvedValue(vi.fn())
  // Never: expect(releaseFn).toHaveBeenCalled()
  ```
- **Fix:** Capture the release function mock and assert it was called in each test.

### [CC-021] task-registry.test.ts: Missing test for assignee name resolution from alias
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:445-465
- **Severity:** NIT
- **Category:** logic
- **Description:** The `resolveTaskDeps` source falls back through `agent.label || agent.name || agent.alias || agent.id.slice(0, 8)`. Tests cover label (agent-1) and name (agent-2 with empty label), but no test covers the alias fallback or the id.slice(0, 8) fallback.
- **Evidence:**
  ```ts
  // Source: task-registry.ts
  assigneeName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
  ```
  Mock has `agent-2` with `alias: 'fe-alias'` but that's tested via `name` fallback, not alias.
- **Fix:** Add a mock agent with `label: ''`, `name: ''`, `alias: 'test-alias'` and verify alias resolution. Add another with all empty/undefined to verify id.slice fallback.

## CLEAN

Files with no issues found:
- (None -- all files had at least a NIT-level finding)

## SUMMARY

| Severity | Count |
|----------|-------|
| MUST-FIX | 3 (CC-002, CC-003, CC-004) |
| SHOULD-FIX | 10 (CC-005 through CC-014) |
| NIT | 7 (CC-015 through CC-021) |
| **Total** | **20** |

### Key Themes

1. **UUID Validation Bypass (CC-002, CC-011)**: Multiple test files mock `isValidUuid` to always return `true`, which means the UUID format validation guard (a security measure preventing path traversal) is never tested in team-api or transfer-resolve-route tests.

2. **Spy on Dynamic Import (CC-003, CC-004)**: The team-api test uses `vi.spyOn(await import('...'), 'fn')` which may or may not intercept actual calls depending on Vitest's module resolution. This pattern should be verified or replaced with `vi.mocked()`.

3. **Missing Security-Critical Tests (CC-006, CC-007, CC-008, CC-011)**: Several security-critical code paths (COS-not-in-agentIds bypass, XSS via document content, path traversal in task teamId, UUID validation) have zero test coverage.

4. **Missing Business Rule Tests (CC-013, CC-014)**: Two governance rules (R4.7 COS removal guard, R4.4 COS multi-team exemption) are enforced in source code but not tested.
