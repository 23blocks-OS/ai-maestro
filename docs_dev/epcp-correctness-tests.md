# Code Correctness Report: tests (v2 — post-merge audit)

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 5
**Date:** 2026-02-20T12:45:00Z

## Scope

Audit of test files modified during the feature/team-governance merge:
1. `tests/services/teams-service.test.ts` — Service layer unit tests
2. `tests/message-filter.test.ts` — G1 governance message filter tests
3. `tests/validate-team-mutation.test.ts` — G2/G3/G5 governance mutation tests
4. `tests/team-api.test.ts` — API route integration tests
5. `tests/document-api.test.ts` — Document API route integration tests

## MUST-FIX

### [CC-001] teams-service.test.ts: updateTeamDocument tests missing getTeam mock — all success tests should 404
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts:758-800
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED

- **Description:** The `updateTeamDocument` describe block (lines 758-800) contains 5 tests, of which 4 expect `result.status` to be 200. However, NONE of these tests call `mockTeams.getTeam.mockReturnValue(...)` before invoking `updateTeamDocument`. The actual service code at `services/teams-service.ts:531` does:
  ```typescript
  const team = getTeam(teamId)
  if (!team) { return { error: 'Team not found', status: 404 } }
  ```
  Since `beforeEach` calls `vi.clearAllMocks()` which resets all mock implementations, `mockTeams.getTeam` reverts to `vi.fn()` returning `undefined`. This means `getTeam(teamId)` returns `undefined` (falsy), and the service returns `{ error: 'Team not found', status: 404 }` EVERY TIME.

  Therefore, tests expecting `result.status === 200` (lines 765, 773, 783) are false positives — they should fail because the status is 404, not 200.

  Except: if these tests are actually currently FAILING, then they are known broken tests. Either way, the mock setup is incorrect.

- **Evidence:**
  ```typescript
  // Line 758-767 — no getTeam mock:
  describe('updateTeamDocument', () => {
    it('updates document successfully', async () => {
      const doc = makeDocument({ title: 'Updated' })
      mockDocs.updateDocument.mockResolvedValue(doc)
      // MISSING: mockTeams.getTeam.mockReturnValue(makeTeam())

      const result = await updateTeamDocument('team-1', 'doc-1', { title: 'Updated' })

      expect(result.status).toBe(200)  // WILL FAIL: getTeam returns undefined → 404
    })
  ```

  Compare with `createTeamDocument` (line 653) which CORRECTLY calls `mockTeams.getTeam.mockReturnValue(makeTeam())`:
  ```typescript
  describe('createTeamDocument', () => {
    it('creates document successfully', async () => {
      const doc = makeDocument({ title: 'New Doc' })
      mockTeams.getTeam.mockReturnValue(makeTeam())  // ← CORRECT
      mockDocs.createDocument.mockResolvedValue(doc)
      // ...
    })
  ```

- **Fix:** Add `mockTeams.getTeam.mockReturnValue(makeTeam())` to every test in `updateTeamDocument` that expects a 200 response. The 404 test at line 785 should mock `getTeam` to return a team (so the document lookup is actually reached) or mock it to `null` to test team-not-found (the test currently tests document-not-found, which also requires a team to exist first).


## SHOULD-FIX

### [CC-002] document-api.test.ts: XSS test documents stored unsanitized HTML without security tracking
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:207-227
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The test at line 207 is titled "stores HTML content verbatim without sanitization (frontend concern)" and confirms `<script>alert(1)</script>` is stored as-is in the document title. The comment says "sanitization is a frontend/rendering concern". While React's JSX auto-escapes string interpolation, any use of `dangerouslySetInnerHTML` on document content would create a stored XSS. The test correctly documents current behavior but should reference a security tracking issue.
- **Evidence:**
  ```typescript
  it('stores HTML content verbatim without sanitization (frontend concern)', async () => {
    const xssTitle = '<script>alert(1)</script>'
    const req = makeRequest(`/api/teams/${team.id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title: xssTitle, content: '<img onerror="alert(2)" src=x>' }),
    })
    expect(data.document.title).toBe(xssTitle)  // Stored XSS payload confirmed
  })
  ```
- **Fix:** Add a TODO comment: `// SECURITY: Stored XSS risk — frontend MUST sanitize before rendering. Track in security issue.`

### [CC-003] team-api.test.ts: Integration tests now mock governance/ACL/validation but tests don't exercise those paths
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:39-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test file correctly added mocks for `@/lib/governance`, `@/lib/team-acl`, `@/lib/agent-registry`, and `@/lib/validation` (lines 39-60). These mocks allow the basic CRUD tests to pass without governance enforcement. However, only 3 tests (CC-004 managerId passthrough, CC-005 type/COS stripping, CC-006 closed team deletion) actually test governance-specific behavior. The remaining tests only exercise the "all access allowed, no manager" path. Consider adding tests for:
  - ACL denial (`checkTeamAccess` returns `{ allowed: false }`) for GET/PUT/DELETE
  - Invalid UUID rejection for PUT and DELETE (currently only tested for GET)
- **Evidence:**
  ```typescript
  vi.mock('@/lib/team-acl', () => ({
    checkTeamAccess: vi.fn(() => ({ allowed: true })),  // Always allows
  }))
  // No test toggles this to { allowed: false } for PUT/DELETE
  ```
- **Fix:** Add tests that toggle `checkTeamAccess` to return `{ allowed: false }` and verify 403 responses for PUT and DELETE.

### [CC-004] teams-service.test.ts: deleteTeamById tests don't cover the closed-team governance path
- **File:** /Users/emanuelesabetta/ai-maestro/tests/services/teams-service.test.ts:305-323
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The service-layer `deleteTeamById` tests only test: (1) successful open team deletion, (2) team not found 404. The service code at `services/teams-service.ts:240-247` has a significant governance branch for closed teams:
  - Returns 400 if `requestingAgentId` is undefined for closed teams
  - Returns 403 if the requesting agent is neither MANAGER nor COS
  - Allows MANAGER or COS to delete

  These governance paths ARE tested in `team-api.test.ts` (lines 377-427) at the API layer, but the service layer should also have unit tests for these branches.
- **Evidence:**
  ```typescript
  // Service code (teams-service.ts:240-247):
  if (team.type === 'closed') {
    if (!requestingAgentId) {
      return { error: '...requires agent identity...', status: 400 }
    }
    const managerId = getManagerId()
    if (requestingAgentId !== managerId && team.chiefOfStaffId !== requestingAgentId) {
      return { error: 'Only MANAGER or the team Chief-of-Staff...', status: 403 }
    }
  }

  // Test only covers:
  describe('deleteTeamById', () => {
    it('deletes team successfully', ...)  // open team only
    it('returns 404 when team not found', ...)
    // MISSING: closed team governance paths
  })
  ```
- **Fix:** Add service-layer tests for: closed team without requestingAgentId (400), unauthorized agent (403), COS authorization (200), MANAGER authorization (200).


## NIT

### [CC-005] message-filter.test.ts: Good edge case coverage including COS-not-in-agentIds and multi-team COS
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts
- **Severity:** NIT (positive)
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The message filter tests include two excellent edge case tests that were added in the governance merge:
  - Line 166-185: COS sender identified via `chiefOfStaffId` but NOT in `agentIds` (CC-006 data corruption edge case) — tests the `senderCosTeams` defense-in-depth path at `message-filter.ts:75-76`
  - Line 220-238: Normal member messaging COS who is NOT in `agentIds` — tests the `canReachCOS` path at `message-filter.ts:135`
  - Line 260-279: COS managing two closed teams messaging member of second team — tests plural `getClosedTeamsForAgent` at `message-filter.ts:108-112`

  These are well-designed tests that catch real edge cases. No issues found.

### [CC-006] validate-team-mutation.test.ts: Reserved name collision test only checks one direction of case insensitivity
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:154-169
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test provides `reservedNames = ['backend-api', 'Frontend Worker']` and creates team named `'Backend-API'`. The source uses `.toLowerCase()` on both sides. The test only verifies one direction (team name uppercase, reserved name lowercase). Consider also testing the reverse direction for completeness.
- **Fix:** Optional: add test with `reservedNames = ['BACKEND-API']` and team name `'backend-api'`.

### [CC-007] validate-team-mutation.test.ts: `beforeEach` uses `vi.clearAllMocks()` — correct but could use comment
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:60-62
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `beforeEach` at line 60 calls `vi.clearAllMocks()`. This resets the fs mock but since the functions under test (`sanitizeTeamName`, `validateTeamMutation`) are pure functions that don't touch the fs mock, the `clearAllMocks` is only needed for the module-loading mocks. A comment would clarify intent.
- **Fix:** Add comment: `// Reset module-load mocks (fs, uuid, file-lock) — functions under test are pure`

### [CC-008] team-api.test.ts: `createTeam` type parameter creates a real closed team with mocked fs — implicit validation occurs
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:379
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 379 calls `createTeam({ name: 'Closed Team', agentIds: ['cos-agent'], type: 'closed', chiefOfStaffId: 'cos-agent' })` which runs the REAL `validateTeamMutation` with mocked fs. This is an integration test pattern that validates governance rules end-to-end, which is good. However, if governance validation rules change (e.g., requiring more than 1 member), these tests could break unexpectedly. Consider adding a comment documenting this coupling.
- **Fix:** Add comment at file top: `// Integration tests: team-registry validation runs with real code and mocked fs`


## CLEAN

Files with no issues found (beyond those noted above):

- `/Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts` — 17 test scenarios, all correctly test claimed behavior. Mock signatures match actual `loadGovernance()` and `loadTeams()` function signatures. UUID constants are proper format. Edge cases well covered (mesh-forwarded, COS-not-in-agentIds, alias bypass, multi-team COS, outside sender to closed team). All 6 message filter algorithm steps have corresponding tests.

- `/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts` — 18 tests across 6 describe blocks. Pure function testing with minimal I/O mocks (only needed for module loading). All assertions verified against source code at `lib/team-registry.ts:63-189`. G2 (COS limited to 1 closed team), G3 (COS already assigned elsewhere — tested implicitly via multi-closed-team constraint), and G5 (COS-closed invariant auto-downgrade) tests all correctly test claimed behavior.

- `/Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts` — 14 tests, integration test pattern with mocked fs. UUID mock generates valid format (`00000000-0000-4000-a000-XXXXXXXXXXXX`). Team existence checks properly tested for GET and POST. PUT and DELETE also check team existence via the service layer (confirmed at `services/teams-service.ts:531` and `services/teams-service.ts:569`).


## SUMMARY

| Severity | Count | Files Affected |
|----------|-------|----------------|
| MUST-FIX | 1 | teams-service.test.ts (CC-001: missing getTeam mock in updateTeamDocument) |
| SHOULD-FIX | 3 | document-api.test.ts (CC-002), team-api.test.ts (CC-003), teams-service.test.ts (CC-004) |
| NIT | 4 | Various (CC-005 through CC-008) |

**Key Finding (CC-001):** The `updateTeamDocument` describe block in `teams-service.test.ts` never mocks `getTeam` to return a team object. Since the service's `updateTeamDocument` function checks team existence first (returning 404 if not found), all 4 tests expecting status 200 will either fail or are false positives. The `createTeamDocument`, `getTeamDocument`, and `deleteTeamDocument` tests all correctly mock `getTeam` — only `updateTeamDocument` is missing it.
