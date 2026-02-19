# Claim Verification Report

**Agent:** epcp-claim-verification-agent
**PR:** #feature/team-governance (latest commit ec82db3)
**Date:** 2026-02-19T17:35:00Z
**Claims extracted:** 16
**Verified:** 10 | **Failed:** 2 | **Partial:** 3 | **Unverifiable:** 1

---

## FAILED CLAIMS (MUST-FIX)

### [CV-001] Claim: "UUID validation on all path parameters to prevent path traversal"
- **Source:** PR description, section "Key Implementation Details"
- **Severity:** MUST-FIX
- **Verification:** NOT IMPLEMENTED
- **Expected:** All [id] route parameters in governance and teams APIs validate UUID format before use
- **Actual:** No UUID validation exists in any of the governance or team [id] routes. Searched for `isValidUuid`, `UUID_REGEX`, `uuid.*valid`, and UUID regex patterns across:
  - `app/api/governance/transfers/[id]/resolve/route.ts` -- NO validation
  - `app/api/teams/[id]/route.ts` (GET/PUT/DELETE) -- NO validation
  - `app/api/teams/[id]/chief-of-staff/route.ts` -- NO validation
  - `app/api/teams/[id]/tasks/[taskId]/route.ts` -- NO validation
  - `app/api/teams/[id]/documents/[docId]/route.ts` -- NO validation
  - No shared middleware.ts exists to intercept path params
- **Evidence:** The ONLY UUID validation in the entire codebase is in `lib/team-registry.ts:313` inside `deleteTeam()` which validates the UUID before constructing a task file cleanup path. This is a defense-in-depth check on file path construction, NOT a route-level parameter validation.
- **Impact:** Path parameters are passed directly to `getTeam(id)`, `getTransferRequest(id)`, etc. without format validation. While these functions do array lookups (not file path construction), the PR claim of "UUID validation on all path parameters" is false. No route-level UUID validation exists.

### [CV-002] Claim: "336 tests passing across 8 test files"
- **Source:** PR description, section "Test Coverage"
- **Severity:** MUST-FIX (factual inaccuracy in PR description)
- **Verification:** NOT IMPLEMENTED (partially wrong)
- **Expected:** 336 tests across exactly 8 test files
- **Actual:** 336 tests pass (VERIFIED via `npx vitest run`), but across 15 test files total, not 8. The PR body names 9 governance-related test areas ("governance, team registry, transfer registry, message filter, team API, validate-team-mutation, document API, task registry, and transfer resolve route") -- which correspond to 9 files, not 8.
- **Evidence:** `ls tests/*.test.ts` returns 15 files. The 9 governance-related files all exist. The PR says "8" but lists 9 names.
- **Impact:** Minor factual error -- the test count (336) is correct but the file count claim (8) is wrong. Should say "9 governance-related test files" or "15 total test files".

---

## PARTIALLY IMPLEMENTED (SHOULD-FIX)

### [CV-003] Claim: "All team mutations go through validateTeamMutation() which enforces R1-R8 business rules"
- **Source:** PR description, section "Key Implementation Details"
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:**
  - `createTeam()` calls `validateTeamMutation()` at `lib/team-registry.ts:250`
  - `updateTeam()` calls `validateTeamMutation()` at `lib/team-registry.ts:286`
  - `validateTeamMutation()` correctly enforces: R1.3, R1.4, R1.7, R1.8, R2.1, R2.3, R4.1, R4.3, R4.4, R4.6, R4.7
- **What's missing:**
  1. **deleteTeam() does NOT call validateTeamMutation()** -- `lib/team-registry.ts:305-318` just filters and saves without any validation through this function. The authority check for closed team deletion is in the API route (`app/api/teams/[id]/route.ts:78-88`), not in `validateTeamMutation()`.
  2. **validateTeamMutation only enforces R1, R2, and R4** -- not R3, R5, R6, R7, or R8. Those rules are enforced in different locations:
     - R3 (ACL): `lib/team-acl.ts` and route-level `chiefOfStaffId`/`type` stripping
     - R5 (transfers): `app/api/governance/transfers/route.ts` and `transfers/[id]/resolve/route.ts`
     - R6 (messaging): `lib/message-filter.ts`
     - R8: Route-level guards (e.g., `app/api/teams/[id]/route.ts:43` strips `chiefOfStaffId` and `type` from generic PUT)
  - The claim "enforces R1-R8" overstates what `validateTeamMutation` does.
- **Evidence:** `lib/team-registry.ts:44-54` (function docstring lists only R1, R2, R4 rules); `lib/team-registry.ts:249,283` (comments say "R1-R4, name sanitization")

### [CV-004] Claim: "rate-limited (5 attempts/60s via shared key)"
- **Source:** PR description, section "Key Implementation Details"
- **Severity:** NIT (functionally correct but claim slightly imprecise)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:**
  - `lib/rate-limit.ts:9-10`: DEFAULT_MAX_ATTEMPTS = 5, DEFAULT_WINDOW_MS = 60_000 -- VERIFIED
  - All 3 governance password routes use the shared key `'governance-password'`:
    - `app/api/governance/password/route.ts:19` -- VERIFIED
    - `app/api/governance/manager/route.ts:21` -- VERIFIED
    - `app/api/teams/[id]/chief-of-staff/route.ts:26` -- VERIFIED
  - `resetRateLimit()` is called on success in all 3 routes -- VERIFIED
  - `recordFailure()` is called on password failure in all 3 routes -- VERIFIED
- **What's missing:** The claim says "5 attempts/60s" which implies a sliding window. The implementation in `lib/rate-limit.ts` is a FIXED window (not sliding): the `resetAt` timestamp is set on first failure and doesn't slide. After the window expires, the counter resets entirely. This is a minor precision issue -- the implementation is functional but the PR calls it a "sliding window" on line 15 of the PR description: "In-memory sliding window rate limiter". The actual implementation is a fixed-window counter.
- **Evidence:** `lib/rate-limit.ts:36-39` -- `resetAt` is set to `now + windowMs` on first failure and never updated on subsequent failures, making it a fixed window.

### [CV-005] Claim: "7-step checkMessageAllowed()"
- **Source:** PR description, section "Summary" bullet 3
- **Severity:** NIT
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The function `checkMessageAllowed()` in `lib/message-filter.ts:38-130` does implement 7 labeled steps:
  - Step 1: Mesh-forwarded (line 42)
  - Step 2: Neither in closed team (line 67)
  - Step 3: MANAGER (line 72)
  - Step 4: COS (line 77)
  - Step 5: Normal closed-team member (line 101)
  - Step 6: Outside sender to closed-team recipient (line 121)
  - Step 7: Default allow (line 129)
- **What's missing:** The function comment at lines 26-33 describes steps R6.1-R6.7, and the code implements all 7. However, Step 4 has 3 sub-branches (COS->MANAGER, COS->COS, COS->own team members), making it arguably more than 7 decision points. This is a nitpick -- the "7-step" label is reasonable.
- **Evidence:** `lib/message-filter.ts:26-33` (algorithm comment), `lib/message-filter.ts:42-129` (implementation with 7 labeled steps)

---

## CONSISTENCY ISSUES

### [CV-006] Rate limiter described as "sliding window" but implements fixed window
- **Severity:** SHOULD-FIX (documentation inaccuracy)
- **Files affected:** PR description line 15, `lib/rate-limit.ts:1-4` (file header says "sliding time window")
- **Expected:** Sliding window rate limiter
- **Found:** Fixed window rate limiter. The `resetAt` field is set once on first failure (`lib/rate-limit.ts:38`) and the window expires at that fixed time regardless of subsequent failures. A true sliding window would adjust the window on each new failure.

### [CV-007] Test file count mismatch in PR description
- **Severity:** NIT
- **Files affected:** PR description line 42
- **Expected:** Consistent file count
- **Found:** PR says "8 test files" but names 9 test areas (governance, team registry, transfer registry, message filter, team API, validate-team-mutation, document API, task registry, transfer resolve route). All 9 files exist. The total repo has 15 test files.

---

## VERIFIED CLAIMS

| # | Claim | File:Line | Status |
|---|---|---|---|
| 1 | "Transfer approval flow: constraint checks BEFORE resolveTransferRequest()" | `app/api/governance/transfers/[id]/resolve/route.ts:65-89` (R5.5 toTeam check at line 69, R4.1/R5.7 multi-closed check at line 74, THEN resolveTransferRequest at line 94) | VERIFIED |
| 2 | "Compensating revertTransferToPending() if saveTeams() fails" | `app/api/governance/transfers/[id]/resolve/route.ts:126-131` (checks `saved` return, calls `revertTransferToPending(id)`) + `lib/transfer-registry.ts:119-135` (function exists, reverts status/resolvedAt/resolvedBy to pending/undefined) | VERIFIED |
| 3 | "Closed team deletion requires MANAGER or Chief-of-Staff authority" | `app/api/teams/[id]/route.ts:78-88` (checks `team.type === 'closed'`, then `isManager(agentId)` and `team.chiefOfStaffId !== agentId`) | VERIFIED |
| 4 | "Web UI (no X-Agent-Id) retains admin privileges for Phase 1" | `app/api/teams/[id]/route.ts:82` (`if (agentId && ...)` -- when agentId is undefined, guard is skipped) | VERIFIED |
| 5 | "verifyPassword() is async" | `lib/governance.ts:71` (`export async function verifyPassword(plaintext: string): Promise<boolean>`, returns `bcrypt.compare()` which is async) | VERIFIED |
| 6 | "loadGovernance() distinguishes SyntaxError from read errors" | `lib/governance.ts:42-50` (`if (error instanceof SyntaxError)` branch with corruption warning, separate generic error branch) | VERIFIED |
| 7 | "withLock() mutex prevents concurrent file corruption" | `lib/file-lock.ts:62-69` (`withLock<T>` acquires lock, runs fn, releases in finally) + `lib/file-lock.ts:21-37` (acquireLock with queue-based mutual exclusion) | VERIFIED |
| 8 | "336 tests passing" | `npx vitest run` output: "Tests 336 passed (336)" | VERIFIED |
| 9 | "Async bcrypt: Non-blocking password hashing/verification" | `lib/governance.ts:64` (`await bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS)`), `lib/governance.ts:78` (`bcrypt.compare(plaintext, config.passwordHash)`) -- both async | VERIFIED |
| 10 | "validateTeamMutation centralizes business rules for team state transitions" | `lib/team-registry.ts:63-182` (function exists with comprehensive rule enforcement); called from `createTeam` (line 250) and `updateTeam` (line 286) | VERIFIED |

---

## CANNOT VERIFY

### [CV-008] Claim: "Known limitations documented with Phase 2 TODOs for read-modify-write races and web UI ACL bypass"
- **Source:** PR description, section "Key Implementation Details"
- **Verification:** CANNOT VERIFY (would need to search all .ts files for Phase 2 TODO comments)
- **Partial Evidence:** `lib/team-acl.ts:40-41` has `// TODO Phase 2: Add X-Request-Source header...` which confirms at least one Phase 2 TODO exists for the web UI ACL bypass. The read-modify-write race TODO was not searched exhaustively.

---

## ADDITIONAL OBSERVATIONS

### Transfer resolve route uses acquireLock directly (not withLock)
The transfer resolve route (`app/api/governance/transfers/[id]/resolve/route.ts:42`) uses `acquireLock('teams')` directly with a try/finally block instead of `withLock()`. This is intentional and documented in the code comment (line 40-41): "We use acquireLock directly (instead of withLock) because we need to return NextResponse objects from within the critical section." This is a correct design choice.

### saveTeams returns boolean for error detection
`lib/team-registry.ts:224-234`: `saveTeams()` returns `true`/`false` instead of throwing. This enables the compensating action pattern in the transfer resolve route (line 126: `const saved = saveTeams(teams)`). If it threw, the `revertTransferToPending` would need to be in a catch block, which is less clear.

### Rate limit key is truly shared
All 3 password routes use the exact same key `'governance-password'`, which means 5 failed attempts across ANY of the 3 endpoints will lock out ALL of them. This is the correct behavior for brute-force protection (attacker can't circumvent by switching endpoints).
