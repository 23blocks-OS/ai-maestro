# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 7
**Date:** 2026-02-16T20:31:00.000Z

## MUST-FIX

### [CC-001] transfer-registry.test.ts: Path mismatch between test helper and source module
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:50-51
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test helper computes `TRANSFERS_FILE` using `os.homedir()` (line 51), but the source `lib/transfer-registry.ts` computes it using `process.env.HOME || '~'` (line 15). On most systems these are identical, but if `process.env.HOME` is unset or differs from `os.homedir()`, the `seedTransfers()` helper writes to a path that the module never reads, causing tests to silently pass with empty data rather than seeded data. This is a real portability bug.
- **Evidence:**
  ```typescript
  // test (line 50-51):
  const AI_MAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
  const TRANSFERS_FILE = path.join(AI_MAESTRO_DIR, 'governance-transfers.json')

  // source (lib/transfer-registry.ts line 15-16):
  const AI_MAESTRO_DIR = path.join(process.env.HOME || '~', '.aimaestro')
  const TRANSFERS_FILE = path.join(AI_MAESTRO_DIR, 'governance-transfers.json')
  ```
- **Fix:** Change the test to use `process.env.HOME || '~'` to match the source, or better yet, mock `process.env.HOME` explicitly in `beforeEach` to guarantee consistency.

## SHOULD-FIX

### [CC-002] team-api.test.ts: Missing mocks for `@/lib/team-acl`, `@/lib/governance`, and `@/lib/agent-registry`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts:9-33
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test imports real API route handlers (`GET`, `PUT`, `DELETE` from `app/api/teams/[id]/route.ts` and `app/api/teams/route.ts`). These routes import `checkTeamAccess` from `@/lib/team-acl`, `getManagerId` from `@/lib/governance`, and `loadAgents` from `@/lib/agent-registry`. None of these are explicitly mocked. They work only because:
  1. `checkTeamAccess` short-circuits when `requestingAgentId` is `undefined` (no X-Agent-Id header).
  2. `getManagerId()` reads governance.json via the mocked fs (returns null from defaults).
  3. `loadAgents()` reads agent-registry.json via the mocked fs (returns []).

  This makes the tests fragile: if any of these modules add side effects (logging, caching, filesystem writes to new paths), the tests may break in confusing ways. More importantly, the ACL path is NEVER tested through the API layer.
- **Evidence:**
  ```typescript
  // team-api.test.ts only mocks:
  vi.mock('fs', ...)
  vi.mock('uuid', ...)
  vi.mock('@/lib/file-lock', ...)

  // But API routes import:
  import { checkTeamAccess } from '@/lib/team-acl'     // NOT mocked
  import { getManagerId } from '@/lib/governance'       // NOT mocked
  import { loadAgents } from '@/lib/agent-registry'     // NOT mocked
  ```
- **Fix:** Either mock these three modules explicitly to make the test's dependencies transparent, or add dedicated test cases that send `X-Agent-Id` headers to exercise the ACL path.

### [CC-003] governance.test.ts: `isChiefOfStaffAnywhere` missing negative test for open-only COS
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:202-232
- **Severity:** SHOULD-FIX
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The test at line 203 verifies that `isChiefOfStaffAnywhere('agent-cos-1')` returns true when the agent is COS of a closed team. However, it does NOT test the case where an agent is COS of ONLY open teams (should return false). The real implementation at `governance.ts:119-121` filters on `team.type === 'closed'`, so an agent who is COS of only open teams should return false. This branch is untested.
- **Evidence:**
  ```typescript
  // Source (governance.ts:117-121):
  export function isChiefOfStaffAnywhere(agentId: string): boolean {
    const teams = loadTeams()
    return teams.some(
      (team) => team.type === 'closed' && team.chiefOfStaffId === agentId
    )
  }

  // Test only has one scenario where agent-cos-1 IS COS of a closed team.
  // Missing: scenario where agent is COS of only open teams → should return false
  ```
- **Fix:** Add a test case where `loadTeams` returns only open teams with a chiefOfStaffId set, and verify `isChiefOfStaffAnywhere` returns false.

### [CC-004] governance.test.ts: `verifyPassword` does not test the "no password set" case
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:142-150
- **Severity:** SHOULD-FIX
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The `verifyPassword` test only checks correct/incorrect password against a seeded hash. It does not test the case where `passwordHash` is null (no password set), which should return false per the source code at `governance.ts:73-74`.
- **Evidence:**
  ```typescript
  // Source (governance.ts:71-77):
  export function verifyPassword(plaintext: string): boolean {
    const config = loadGovernance()
    if (!config.passwordHash) {
      return false  // ← THIS PATH IS NEVER TESTED
    }
    return bcrypt.compareSync(plaintext, config.passwordHash)
  }
  ```
- **Fix:** Add a test: `it('returns false when no password has been set', () => { expect(verifyPassword('anything')).toBe(false) })`.

### [CC-005] team-registry.test.ts: `makeTeam` helper mutates shared `uuidCounter`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts:58-67
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `makeTeam` helper at line 60 does `id: \`team-${++uuidCounter}\``, which increments the same `uuidCounter` used by the `uuid.v4` mock. This means calling `makeTeam()` changes the sequence of UUIDs that `createTeam` will produce. While tests currently work because `beforeEach` resets `uuidCounter = 0`, this creates an invisible coupling where the order of helper calls affects test expectations. If a test called `makeTeam()` before `createTeam()`, the team's ID would not be `uuid-1` as expected.
- **Evidence:**
  ```typescript
  let uuidCounter = 0
  vi.mock('uuid', () => ({
    v4: vi.fn(() => { uuidCounter++; return `uuid-${uuidCounter}` }),
  }))

  function makeTeam(overrides: Partial<Team> = {}): Team {
    return {
      id: `team-${++uuidCounter}`,  // ← Mutates the SAME counter used by uuid mock
      ...
    }
  }
  ```
- **Fix:** Use a separate counter for the helper, or use a static prefix like `test-team-${localCounter}` that doesn't conflict with the uuid mock counter.

### [CC-006] transfer-registry.test.ts: `resolveTransferRequest` tests don't verify idempotency (already-resolved)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:260-308
- **Severity:** SHOULD-FIX
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The source code at `transfer-registry.ts:101` has an explicit guard: `if (requests[idx].status !== 'pending') return null`. This means resolving an already-resolved transfer should return null. This branch is not tested.
- **Evidence:**
  ```typescript
  // Source (transfer-registry.ts:100-101):
  if (idx === -1) return null
  if (requests[idx].status !== 'pending') return null // Already resolved ← UNTESTED
  ```
- **Fix:** Add a test that creates a transfer, approves it, then attempts to approve it again and asserts the return is null.

### [CC-007] message-filter.test.ts: Missing test for normal member messaging their own COS
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts:44-234
- **Severity:** SHOULD-FIX
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The `checkMessageAllowed` source at lines 91-94 has an explicit branch: "Normal member can message the COS of their own team" (`senderTeams.some(team => team.chiefOfStaffId === recipientAgentId)`). This is a distinct code path from "member messaging a teammate" (line 85-90), but it has no dedicated test case. While the teammate test at lines 180-195 may indirectly cover this if the teammate happens to be COS, there is no explicit test for a non-COS member messaging their COS.
- **Evidence:**
  ```typescript
  // Source (message-filter.ts:91-95):
  // Can message the COS of their own team
  const canReachCOS = senderTeams.some(team => team.chiefOfStaffId === recipientAgentId)
  if (canReachCOS) {
    return { allowed: true }
  }
  ```
- **Fix:** Add a test case: normal member sends to COS (not a peer teammate) and verify it is allowed.

### [CC-008] document-api.test.ts: Missing team existence check for PUT/DELETE document routes
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:234-320
- **Severity:** SHOULD-FIX
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The PUT and DELETE document tests only check the "document not found" 404 case. They do NOT test the case where the team itself doesn't exist. Looking at the source routes (`app/api/teams/[id]/documents/[docId]/route.ts`), the PUT and DELETE handlers don't check team existence before operating on documents (unlike GET which checks team existence at line 11-14). This means the tests correctly reflect the source, but the source has a potential issue where you can update/delete documents for non-existent teams. This is a source bug, not a test bug, but the test should document this behavior.
- **Evidence:**
  ```typescript
  // PUT route (lines 23-48) - no team existence check
  // DELETE route (lines 52-62) - no team existence check
  // vs GET route (lines 6-19) - HAS team existence check
  ```
- **Fix:** Either add team existence checks to the PUT/DELETE routes and test them, or add a test documenting that PUT/DELETE on documents don't require team existence.

## NIT

### [CC-009] transfer-registry.test.ts: `afterEach` not imported but used via global
- **File:** /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts:1,70
- **Severity:** NIT
- **Category:** logic (style inconsistency)
- **Confidence:** CONFIRMED
- **Description:** `afterEach` is used at line 70 but not included in the import from `vitest` at line 1. It works because `globals: true` is set in vitest.config.ts, but all other test files either import `afterEach` explicitly or don't use it. This inconsistency makes the code harder to understand.
- **Evidence:**
  ```typescript
  // Line 1:
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  // Line 70:
  afterEach(() => { vi.useRealTimers() })  // ← afterEach not imported
  ```
- **Fix:** Add `afterEach` to the import: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`.

### [CC-010] validate-team-mutation.test.ts: Uses both `afterEach` and `restoreAllMocks` while other test files use `beforeEach` with `clearAllMocks`
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:59-62
- **Severity:** NIT
- **Category:** logic (style inconsistency)
- **Confidence:** CONFIRMED
- **Description:** Most test files use `beforeEach` with `vi.clearAllMocks()`. This file uses `afterEach` with both `vi.clearAllMocks()` and `vi.restoreAllMocks()`. The `restoreAllMocks()` is unnecessary here since the functions under test (`sanitizeTeamName`, `validateTeamMutation`) are pure functions that don't use spied methods, and the fs/uuid mocks are module-level vi.mock() calls that aren't affected by restoreAllMocks.
- **Evidence:**
  ```typescript
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()  // ← Unnecessary for module-level vi.mock()
  })
  ```
- **Fix:** For consistency, use `beforeEach` with `vi.clearAllMocks()` like the other test files.

### [CC-011] team-registry.test.ts and team-api.test.ts: No test for `saveTeams` function
- **File:** /Users/emanuelesabetta/ai-maestro/tests/team-registry.test.ts
- **Severity:** NIT
- **Category:** logic (test coverage gap)
- **Confidence:** CONFIRMED
- **Description:** The `saveTeams` function is exported from `team-registry.ts` and imported in the test file but never directly tested. It is exercised indirectly through `createTeam`, `updateTeam`, and `deleteTeam`, but edge cases like write failure (returning false) are not tested.
- **Fix:** Consider adding a test for `saveTeams` error handling, or at minimum a test that mocks `writeFileSync` to throw and verifies `saveTeams` returns false.

### [CC-012] governance.test.ts: `isManager` does not test with empty string managerId
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:187-196
- **Severity:** NIT
- **Category:** logic (edge case)
- **Confidence:** CONFIRMED
- **Description:** The test checks `isManager('')` returns false (line 194), but this is when the managerId is `'agent-boss-42'`. It doesn't test the edge case where the managerId itself is an empty string (what if `setManager('')` was called?). The source would then have `isManager('')` return true, which may be unexpected.
- **Fix:** Add a test that calls `setManager('')` and verifies behavior of `isManager('')` and `isManager('agent-x')`.

## CLEAN

Files with no issues found (beyond those noted above):
- /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts — Well-structured, good branch coverage (10 scenarios covering all main code paths). Minor gap noted in CC-007.
- /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts — Excellent coverage of pure validation logic. All 15 test scenarios are meaningful and well-documented. Minor style nit in CC-010.
