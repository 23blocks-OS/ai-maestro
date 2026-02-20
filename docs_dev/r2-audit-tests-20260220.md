# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests (independent second-pass audit)
**Files audited:** 6 test files, 3 source files, 4 API route files, 5 supporting lib files
**Date:** 2026-02-20T16:21:00Z

---

## VERIFICATION SUMMARY

### Files Audited

| # | Test File | Source File(s) Under Test | Test Count |
|---|-----------|---------------------------|------------|
| 1 | tests/services/teams-service.test.ts | services/teams-service.ts | 47 |
| 2 | tests/team-api.test.ts | app/api/teams/route.ts, app/api/teams/[id]/route.ts | 19 |
| 3 | tests/document-api.test.ts | app/api/teams/[id]/documents/route.ts, app/api/teams/[id]/documents/[docId]/route.ts | 18 |
| 4 | tests/message-filter.test.ts | lib/message-filter.ts | 16 |
| 5 | tests/validate-team-mutation.test.ts | lib/team-registry.ts (validateTeamMutation, sanitizeTeamName) | 18 |
| 6 | tests/team-registry.test.ts | lib/team-registry.ts (CRUD: loadTeams, saveTeams, createTeam, updateTeam, getTeam, deleteTeam) | 20 |

**Total test cases: 138**

---

## CHECKLIST VERIFICATION RESULTS

### Checklist Item 5: vi.mock('@/lib/agent-auth') present where tests set X-Agent-Id headers

| Test File | Sets X-Agent-Id? | Has agent-auth mock? | Verdict |
|-----------|-------------------|----------------------|---------|
| teams-service.test.ts | No (calls service directly, no HTTP headers) | No (not needed) | OK |
| team-api.test.ts | YES (lines 379, 419, 435, 452, 472) | YES (line 68-73) | OK |
| document-api.test.ts | No (no X-Agent-Id headers used) | No (not needed) | OK |
| message-filter.test.ts | No (no HTTP layer) | No (not needed) | OK |
| validate-team-mutation.test.ts | No (pure function tests) | No (not needed) | OK |
| team-registry.test.ts | No (lib-level CRUD) | No (not needed) | OK |

### Checklist Item 6: fs mocks include renameSync/unlinkSync (needed for atomic writes)

| Test File | Mocks fs? | Has renameSync? | Has unlinkSync? | Verdict |
|-----------|-----------|-----------------|-----------------|---------|
| teams-service.test.ts | No (mocks lib modules, not fs) | N/A | N/A | OK |
| team-api.test.ts | YES | YES (line 24-29) | YES (line 31-33) | OK |
| document-api.test.ts | YES | YES (line 20-26) | YES (line 27-29) | OK |
| message-filter.test.ts | No (mocks governance/team-registry) | N/A | N/A | OK |
| validate-team-mutation.test.ts | YES (minimal, for module loading) | No | No | **FINDING CC-001** |
| team-registry.test.ts | YES | YES (line 22-28) | YES (line 29-31) | OK |

### Checklist Item 7: updateTeamDocument tests have getTeam mock

| Test File | Tests updateTeamDocument? | Has getTeam mock? | Verdict |
|-----------|---------------------------|-------------------|---------|
| teams-service.test.ts | YES (lines 789-837) | YES (mockTeams.getTeam.mockReturnValue, line 793, 803, 821, 830) | OK |
| document-api.test.ts | YES (lines 299-393) | Uses real team-registry with fs mock (createTeam creates team first) | OK |

---

## MUST-FIX

*None found.*

---

## SHOULD-FIX

### [CC-001] validate-team-mutation.test.ts: fs mock lacks renameSync/unlinkSync — saveTeams will silently fail
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:17-24
- **Severity:** SHOULD-FIX
- **Category:** mock-correctness
- **Confidence:** CONFIRMED (traced team-registry.ts:246-248 — saveTeams calls writeFileSync to .tmp then renameSync)
- **Description:** The fs mock in validate-team-mutation.test.ts provides only `existsSync`, `mkdirSync`, `readFileSync`, and `writeFileSync`. It omits `renameSync` and `unlinkSync`. The source code `saveTeams()` at team-registry.ts:247-248 does an atomic write pattern: `writeFileSync(tmpFile, ...)` then `renameSync(tmpFile, TEAMS_FILE)`. Without `renameSync` mocked, the rename will throw (or return undefined since it's a mock object without the method). However, since validate-team-mutation.test.ts only tests `sanitizeTeamName` and `validateTeamMutation` (pure functions that never call `saveTeams`), this does NOT currently cause test failures. It would fail if any test in this file called `createTeam` or `updateTeam` through the real implementation.
- **Evidence:**
```typescript
// validate-team-mutation.test.ts:17-24
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => { throw new Error('not found') }),
    writeFileSync: vi.fn(),
    // MISSING: renameSync, unlinkSync
  },
}))
```
```typescript
// team-registry.ts:246-248
const tmpFile = TEAMS_FILE + '.tmp'
fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
fs.renameSync(tmpFile, TEAMS_FILE)  // Would throw without renameSync mock
```
- **Fix:** Add `renameSync: vi.fn()` and `unlinkSync: vi.fn()` to the fs mock for defensive completeness, even though current tests don't trigger that code path.

### [CC-002] team-api.test.ts: agent-auth mock bypasses real authentication logic — X-Agent-Id accepted without Bearer token
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:68-73
- **Severity:** SHOULD-FIX
- **Category:** mock-correctness
- **Confidence:** CONFIRMED
- **Description:** The agent-auth mock in team-api.test.ts accepts any X-Agent-Id header directly without requiring a Bearer token. The real `authenticateAgent` (lib/agent-auth.ts:37-41) rejects X-Agent-Id without Authorization header with a 401. This means the test at line 419 (`headers: { 'X-Agent-Id': 'random-agent' }`) would return 401 in production instead of reaching the governance check that returns 403. The test passes because the mock skips authentication entirely. This is a known tradeoff (commented at line 68: "in tests, trust X-Agent-Id directly"), but it means the test exercises the wrong code path.
- **Evidence:**
```typescript
// test mock (team-api.test.ts:69-72) — accepts X-Agent-Id directly
vi.mock('@/lib/agent-auth', () => ({
  authenticateAgent: vi.fn((authHeader: string | null, agentIdHeader: string | null) => {
    if (agentIdHeader) return { agentId: agentIdHeader }
    return {}
  })
}))

// real code (agent-auth.ts:37-41) — rejects X-Agent-Id without Bearer
if (agentIdHeader && !authHeader) {
  return { error: 'Agent identity requires authentication...', status: 401 }
}
```
- **Fix:** Either (a) update tests that use X-Agent-Id to also include an Authorization header and adjust the mock to validate it, or (b) document this mock divergence more explicitly with a comment explaining that ACL/governance tests are the focus, not auth.

### [CC-003] teams-service.test.ts: createNewTeam test does not verify agentNames resolution
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts:146-159
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED
- **Description:** `createNewTeam` calls `loadAgents().map(a => a.name).filter(Boolean)` to get agent names for collision checks (teams-service.ts:150). The test at line 155 asserts the third argument is `[]` (empty array), which is correct only because `mockAgentRegistry.loadAgents` returns `[]`. However, there is no test that verifies agent names are actually passed through when agents exist. If the `.map(a => a.name).filter(Boolean)` logic were broken, no test would catch it.
- **Evidence:**
```typescript
// teams-service.ts:150
const agentNames = loadAgents().map(a => a.name).filter(Boolean)
// All test calls pass [] as 3rd arg because loadAgents returns []
expect(mockTeams.createTeam).toHaveBeenCalledWith(..., null, [])
```
- **Fix:** Add a test case where `mockAgentRegistry.loadAgents` returns agents with names, and verify the names array is correctly passed as the third argument to `createTeam`.

### [CC-004] teams-service.test.ts: updateTeamById test does not verify agentNames resolution
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts:261-282
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED
- **Description:** Same as CC-003 but for `updateTeamById`. The `updateTeam` mock always receives `[]` as agentNames. No test verifies that loaded agent names are passed through.
- **Fix:** Add a test case where agents exist and verify the 4th argument to `updateTeam`.

### [CC-005] message-filter.test.ts: no test for Step 5b — open-world sender to MANAGER or COS recipient
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced message-filter.ts:146-152)
- **Description:** The source code at message-filter.ts:145-152 has two branches for Step 5b: an open-world agent messaging the MANAGER (`return { allowed: true }`) and an open-world agent messaging a COS (`return { allowed: true }`). These branches are reached when `!senderInClosed && recipientInClosed` after all earlier steps. The existing test "denies an outside sender messaging a recipient inside a closed team" (line 328) only covers Step 6 (open sender → normal closed-team member). Steps 5b branches are never tested.
- **Evidence:**
```typescript
// message-filter.ts:146-152 — untested branches
// Step 5b: Open-world agents can reach MANAGER and COS (v2 Rules 62-63)
if (agentIsManager(recipientAgentId)) {
  return { allowed: true }   // <-- NO TEST
}
if (agentIsCOS(recipientAgentId)) {
  return { allowed: true }   // <-- NO TEST
}
```
- **Fix:** Add two tests: (1) open-world sender → MANAGER recipient (should be allowed), (2) open-world sender → COS recipient (should be allowed).

### [CC-006] message-filter.test.ts: no test for COS denial path (Step 4 final return)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced message-filter.ts:119-122)
- **Description:** At message-filter.ts:119-122, there is a COS denial branch: "Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, own team members, and agents not in any closed team". This branch is reached when a COS tries to message a normal member of a *different* closed team (not one the COS manages). No test covers this.
- **Evidence:**
```typescript
// message-filter.ts:119-122 — untested branch
return {
  allowed: false,
  reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, own team members, and agents not in any closed team',
}
```
- **Fix:** Add a test: COS of Team Alpha messages a normal member of Team Beta (where COS is not the COS of Beta). Expected: denied.

### [CC-007] team-registry.test.ts: no test for G4 open-team revocation on createTeam
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced team-registry.ts:292-308)
- **Description:** When `createTeam` creates a closed team, it revokes normal agents' open team memberships (team-registry.ts:292-308, the "G4" block). No test in team-registry.test.ts verifies this behavior. This is a significant business rule (v2 Rule 22).
- **Evidence:**
```typescript
// team-registry.ts:293-307 — G4 open-team revocation, never tested
if (team.type === 'closed') {
  for (const agentId of team.agentIds) {
    if (agentId === managerId) continue
    if (agentId === team.chiefOfStaffId) continue
    for (const otherTeam of teams) {
      if (otherTeam.id === team.id || otherTeam.type !== 'open') continue
      const idx = otherTeam.agentIds.indexOf(agentId)
      if (idx !== -1) otherTeam.agentIds.splice(idx, 1)
    }
  }
}
```
- **Fix:** Add test: create an open team with agent-A, then create a closed team that includes agent-A. Verify agent-A is removed from the open team's agentIds.

### [CC-008] team-registry.test.ts: no test for G4 open-team revocation on updateTeam
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced team-registry.ts:350-372)
- **Description:** When `updateTeam` adds agents to a closed team, it revokes their open team memberships (team-registry.ts:350-372). No test verifies this behavior.
- **Fix:** Add test: create open team with agent-B, create closed team without agent-B, then update the closed team to add agent-B. Verify agent-B is removed from the open team.

### [CC-009] team-registry.test.ts: no test for deleteTeam orphaned file cleanup
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced team-registry.ts:385-392)
- **Description:** `deleteTeam` has logic to clean up orphaned task and document files (team-registry.ts:385-392). No test verifies that these files are cleaned up. The UUID validation guard on line 386 is also untested.
- **Evidence:**
```typescript
// team-registry.ts:385-392 — untested cleanup logic
if (/^[0-9a-f]{8}-...$/i.test(id)) {
  const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
  try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
  const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
  try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
}
```
- **Fix:** Add test: create team, add task/doc files to fsStore, delete team, verify task/doc files are removed. Also test that non-UUID team IDs skip cleanup (the regex guard).

### [CC-010] team-registry.test.ts: no test for loadTeams migration (teams without type field)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced team-registry.ts:220-232)
- **Description:** `loadTeams` has a migration path that adds `type: 'open'` to teams that lack a type field (team-registry.ts:220-232). No test verifies this behavior.
- **Fix:** Add test: seed fsStore with a team JSON missing the `type` field, call `loadTeams()`, verify the returned team has `type: 'open'`.

### [CC-011] team-registry.test.ts: saveTeams false path uses wrong fs mock technique
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:135-143
- **Severity:** SHOULD-FIX
- **Category:** mock-correctness
- **Confidence:** LIKELY
- **Description:** The test for `saveTeams` returning false mocks `writeFileSync` to throw. However, `saveTeams` (team-registry.ts:246-248) actually writes to a `.tmp` file first, then calls `renameSync`. If `writeFileSync` throws, `renameSync` is never called — which is correct. But the test's `await import('fs')` dynamic import to get the mock might not return the same module instance in all vitest configurations. The test itself is fragile because it relies on dynamic import resolution.
- **Evidence:**
```typescript
// team-registry.test.ts:136-138
const fs = await import('fs')
vi.mocked(fs.default.writeFileSync).mockImplementationOnce(() => {
  throw new Error('EACCES: permission denied')
})
```
- **Fix:** Minor: consider importing `fs` at the top level (which works since it's already mocked) and using `vi.mocked(fs.default.writeFileSync)` directly instead of dynamic import.

---

## NIT

### [CC-012] teams-service.test.ts: deleteTeamById test relies on vi.mocked(getManagerId) leaking between tests
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts:334-342
- **Severity:** NIT
- **Category:** test-isolation
- **Confidence:** CONFIRMED
- **Description:** The test "returns 403 when unauthorized agent tries to delete closed team" (line 334) calls `vi.mocked(getManagerId).mockReturnValue('manager-1')` but does not reset it. The next test "allows COS to delete their own closed team" (line 344) also calls `vi.mocked(getManagerId).mockReturnValue('manager-1')` — so this works. But if test ordering changes, the mock state from line 337 could leak. The `beforeEach` at line 111 calls `vi.clearAllMocks()` which resets call counts but does NOT reset `mockReturnValue` — `vi.clearAllMocks` only clears calls/instances, not implementations. To fully reset, `vi.restoreAllMocks()` or explicit re-mock is needed.
- **Evidence:** `vi.clearAllMocks()` at line 111 does NOT reset `mockReturnValue`. However, since `getManagerId` is mocked globally at line 69 to return `null`, `vi.clearAllMocks()` will clear the `mockReturnValue` override back to the original mock implementation. Actually, upon closer inspection, `vi.clearAllMocks()` DOES reset `mockReturnValue` for `vi.fn()` mocks. So the global mock `getManagerId: vi.fn(() => null)` at line 69 defines the factory return. `clearAllMocks()` resets the mock to its original implementation (the `() => null` factory). This means the leak concern is actually a false alarm.
- **Fix:** No action needed. The `vi.clearAllMocks()` combined with the global `vi.fn(() => null)` factory resets correctly. However, using `vi.restoreAllMocks()` in beforeEach (like message-filter.test.ts does at line 75) would be more defensive.

### [CC-013] document-api.test.ts: UUID mock produces valid-format UUIDs but team-api.test.ts does not
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:38-43 vs /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:34-41
- **Severity:** NIT
- **Category:** mock-correctness
- **Confidence:** CONFIRMED
- **Description:** `document-api.test.ts` generates valid UUID-format strings (`00000000-0000-4000-a000-00000000000N`) to pass the UUID validation in `docsFilePath()`. `team-api.test.ts` generates `uuid-N` format which is NOT a valid UUID. This works for team-api.test.ts because `isValidUuid` is mocked to always return true. But it means team-api tests don't exercise the real UUID validation code path.
- **Evidence:**
```typescript
// team-api.test.ts:40 — NOT a valid UUID
return `uuid-${uuidCounter}`

// document-api.test.ts:39 — valid UUID format
return `00000000-0000-4000-a000-${hex}`
```
- **Fix:** Consider aligning team-api.test.ts to also generate valid-format UUIDs for consistency. Low priority since the mock correctly prevents UUID validation from being exercised.

### [CC-014] validate-team-mutation.test.ts: no test for COS-already-assigned-elsewhere check (G3)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts (entire file)
- **Severity:** NIT
- **Category:** coverage-gap
- **Confidence:** CONFIRMED (traced team-registry.ts:141-146)
- **Description:** The source code at team-registry.ts:139-146 has a check: "An agent already serving as COS of another team cannot be assigned as COS of this team" (G3, v2 Rule 7). This is a distinct check from the multi-closed-team constraint (R4.1) which checks agentIds membership, not chiefOfStaffId role. No test in validate-team-mutation.test.ts specifically targets G3, though the "rejects COS agent already in another closed team" test (line 334) hits R4.1 which happens to catch COS agents too.
- **Fix:** Add a dedicated G3 test: existing Team A has COS agent-X. New Team B tries to set `chiefOfStaffId: agent-X`. Verify the G3 error message "Agent is already Chief-of-Staff of team..." is returned (not the R4.1 error about being in a closed team).

### [CC-015] team-registry.test.ts: createTeam does not test TeamValidationException for invalid names
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:150-185
- **Severity:** NIT
- **Category:** coverage-gap
- **Confidence:** CONFIRMED
- **Description:** `createTeam` in team-registry.ts calls `validateTeamMutation` and throws `TeamValidationException` on failure (line 272). The test for `createTeam` tests success paths and minimum name length but never tests that invalid names (empty, too short, bad characters) throw `TeamValidationException`.
- **Fix:** Add test: call `createTeam({ name: 'AB', agentIds: [] })` and expect it to reject with `TeamValidationException`.

### [CC-016] teams-service.test.ts: TeamValidationException error path tested only for updateTeamById
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts
- **Severity:** NIT
- **Category:** coverage-gap
- **Confidence:** CONFIRMED
- **Description:** The source code for both `createNewTeam` and `updateTeamById` have `TeamValidationException` catch blocks (teams-service.ts:159-161 and 226-228). The test for `createNewTeam` only tests generic Error throws (line 198-205) returning 500, not `TeamValidationException` which should return the exception's specific status code. The `TeamValidationException` path is only implicitly tested via the mock.
- **Fix:** Add test: mock `createTeam` to throw `new MockTeamValidationException('Name too short', 400)` and verify the result has `status: 400` (not 500).

---

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts — No issues. Factory functions produce correct default values matching the type contracts.

---

## COVERAGE GAP TABLE

| Source Function | Test File | Branches Tested | Branches Missing |
|---|---|---|---|
| `listAllTeams` | teams-service.test.ts | empty list, populated list | (none) |
| `createNewTeam` | teams-service.test.ts | success, success with desc/agents, missing name, null name, bad agentIds, generic error, defaults agentIds | TeamValidationException error path; agentNames forwarding when agents exist |
| `getTeamById` | teams-service.test.ts | found, not found | UUID validation (400), ACL denial (403) |
| `updateTeamById` | teams-service.test.ts | success, all fields, not found (null), generic error | UUID validation (400), ACL denial (403), TeamValidationException error path, agentNames forwarding |
| `deleteTeamById` | teams-service.test.ts | success, not found, closed team no agent, closed team 403, COS allowed | UUID validation (400), ACL denial (403), deleteTeam returning false after getTeam succeeds |
| `listTeamTasks` | teams-service.test.ts | success, empty, team not found | ACL denial (403) |
| `createTeamTask` | teams-service.test.ts | success, all fields, trim, not found, missing subject, whitespace subject, bad blockedBy, generic error | ACL denial (403) |
| `updateTeamTask` | teams-service.test.ts | success, unblocked, team 404, task 404, self-dep, circular dep, invalid status, valid statuses, bad blockedBy, generic error, null task | ACL denial (403) |
| `deleteTeamTask` | teams-service.test.ts | success, team 404, task 404 | ACL denial (403) |
| `listTeamDocuments` | teams-service.test.ts | docs, empty, team 404 | ACL denial (403) |
| `createTeamDocument` | teams-service.test.ts | success, all fields, defaults content, team 404, missing title, generic error | ACL denial (403) |
| `getTeamDocument` | teams-service.test.ts | found, team 404, doc 404 | ACL denial (403) |
| `updateTeamDocument` | teams-service.test.ts | success, only provided fields, pinned/tags, doc 404, generic error | ACL denial (403) |
| `deleteTeamDocument` | teams-service.test.ts | success, doc 404 | ACL denial (403), team 404 |
| `notifyTeamAgents` | teams-service.test.ts | success, not found, partial, error, bad agentIds, bad teamName, alias fallback | (none) |
| `checkMessageAllowed` | message-filter.test.ts | null sender open, open-open, manager bypass, COS→manager, COS→COS, COS→own member, COS not in agentIds, COS→open world, member→teammate, member→COS (not in agentIds), member→outsider denial, multi-team COS, null→closed denial, alias bypass denial, outside→closed denial | COS→other team member (COS denial path), open-world→MANAGER, open-world→COS |
| `sanitizeTeamName` | validate-team-mutation.test.ts | control chars, whitespace collapse, empty | (none) |
| `validateTeamMutation` | validate-team-mutation.test.ts | short name, long name, bad start char, bad chars, duplicate name, reserved name, invalid type, closed-no-COS downgrade, COS-on-open, COS auto-add, COS removal guard, multi-closed normal, manager exempt, COS-in-another-closed, COS-elsewhere-joining | G3 COS-already-COS-of-another-team (distinct from R4.1) |
| `loadTeams` | team-registry.test.ts | no file, existing file, invalid JSON | migration (teams missing type field) |
| `saveTeams` | team-registry.test.ts | success write, write failure | (none) |
| `createTeam` | team-registry.test.ts | name+agents, empty agents, description, min-length name, persistence | TeamValidationException throw, G4 open-team revocation |
| `updateTeam` | team-registry.test.ts | name+desc, agentIds, instructions, lastActivityAt, lastMeetingAt, updatedAt, not found, persistence, clear instructions | G4 open-team revocation on adding agent to closed team |
| `getTeam` | team-registry.test.ts | found, not found | (none) |
| `deleteTeam` | team-registry.test.ts | success, not found, preserves others | Orphaned task/doc file cleanup, UUID validation guard |

---

## FALSE POSITIVE ANALYSIS

All 138 tests were reviewed for false positives (tests that pass but test the wrong thing):

| Test | Verdict | Rationale |
|---|---|---|
| team-api.test.ts: "returns 403 when non-authorized agent deletes closed team" | **PASSES CORRECTLY but via different path than production** | In production, `X-Agent-Id: random-agent` without `Authorization` header returns 401 (agent-auth.ts:37-41). In test, mock skips auth and returns `{ agentId: 'random-agent' }`, so the governance check is reached and returns 403. The test validates governance logic but not the full HTTP request flow. |
| All other tests | **NO FALSE POSITIVES FOUND** | Mocks return structurally correct data matching real return types. Assertions check the correct fields. |

---

## SUMMARY

- **0 MUST-FIX** issues
- **11 SHOULD-FIX** issues (1 mock gap, 1 auth mock divergence, 8 coverage gaps, 1 fragile mock technique)
- **5 NIT** issues (1 false alarm on test isolation, 1 mock inconsistency, 3 minor coverage gaps)
- **Total test cases audited:** 138
- **False positives found:** 0 (1 test noted as correct-but-different-path)
- **Mock correctness:** All mocks return structurally valid data. agent-auth mock diverges from production behavior (documented tradeoff).
- **Highest-impact gaps:** G4 open-team revocation logic (team-registry.ts:292-308, 350-372) and message-filter Step 5b branches (message-filter.ts:146-152) are completely untested.
