# Claim Verification Report

**Agent:** epcp-claim-verification-agent
**PR:** feature/team-governance (Pass 5 review of Pass 4 commit 6fbda6d)
**Date:** 2026-02-22T18:57:00Z
**Claims extracted:** 18
**Verified:** 17 | **Failed:** 0 | **Partial:** 1 | **Unverifiable:** 0

---

## PARTIALLY IMPLEMENTED (SHOULD-FIX)

### [CV-P5-001] Claim: "SF-003: TOCTOU guard added after approveGovernanceRequest"
- **Source:** Commit message, SHOULD-FIX section
- **Severity:** SHOULD-FIX (minor design gap, not a correctness bug)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** `preApprovalStatus` is captured at line 306 before `approveGovernanceRequest()` is called. After the call returns, `weTriggeredExecution` checks that `preApprovalStatus` was not already terminal AND `updated.status === 'executed'`. This prevents the same caller from double-executing if a concurrent writer already moved the request to `executed`.
- **What's limited:** The `request` object (line 269) is loaded outside any lock via `getGovernanceRequest(requestId)` -- a plain file read. The `preApprovalStatus` at line 306 captures the status from this stale, unlocked read. A true TOCTOU race between two concurrent `approveCrossHostRequest` callers could both read `status: 'dual-approved'`, both call `approveGovernanceRequest`, and `approveGovernanceRequest` (which uses `withLock` internally) would only let one actually transition to `executed`. The post-check then correctly prevents the loser from calling `performRequestExecution`. So the guard **does work** in practice, but only because `approveGovernanceRequest` is internally locked. The "TOCTOU guard" label slightly overstates what the pre/post pattern alone achieves -- the real protection is the internal lock in `approveGovernanceRequest`.
- **Evidence:**
  - `services/cross-host-governance-service.ts:269` -- stale read outside lock
  - `services/cross-host-governance-service.ts:306` -- `const preApprovalStatus: string = request.status`
  - `services/cross-host-governance-service.ts:316-317` -- `weTriggeredExecution` check
- **Impact:** Low. The guard works correctly in practice due to the internal lock. The naming is slightly misleading but the behavior is sound.

---

## CONSISTENCY ISSUES

None found. All changes are internally consistent.

---

## VERIFIED CLAIMS

| # | Claim | File:Line | Status |
|---|---|---|---|
| 1 | "MF-001: submitConfigRequest test replica now matches 6-param hook signature" | `hooks/useGovernance.ts:287` has 6 params: `(targetAgentId, config, password, requestedBy, requestedByRole, targetHostId?)`. Test replica at `tests/use-governance-hook.test.ts:29-36` matches exactly with same 6 params. All test call-sites updated (lines 126, 151, 166, 180, 190). | VERIFIED |
| 2 | "MF-002: Add missing submitConfigRequest error-path test + fix .catch() replica" | `tests/use-governance-hook.test.ts:175-210` adds two new tests: `handles unparseable error response body gracefully` and `defaults targetHostId to localhost when not provided`. The `.catch()` in test replica (line 51-54) matches the hook's `.catch((parseErr: unknown) => ...)` pattern at `hooks/useGovernance.ts:302-304`. | VERIFIED |
| 3 | "MF-003: Add isValidUuid(cosAgentId) check in headless COS route" | `services/headless-router.ts:1680-1684` -- `isValidUuid` is imported (line 245) and called with early return `sendJson(res, 400, ...)` before `getAgent(cosAgentId)` at line 1686. | VERIFIED |
| 4 | "SF-001: Add requestedByRole/payload validation in governance requests POST" | `app/api/v1/governance/requests/route.ts:80-93` -- Validates `requestedByRole` against `VALID_REQUESTED_BY_ROLES` Set (line 119: `manager, chief-of-staff, member`), validates `payload` is object (line 88), validates `payload.agentId` is string (line 91). All return 400 on failure. | VERIFIED |
| 5 | "SF-002: Fix hostname regex to allow single-char and cap at 253 chars" | `app/api/v1/governance/requests/route.ts:122` -- `HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/`. Tested: single char `a` passes, 253-char string passes, 254-char fails, empty fails. The `?` makes the group optional, enabling single-char match. | VERIFIED |
| 6 | "SF-004: Skip auto-approve for duplicate receiveCrossHostRequest" | `services/cross-host-governance-service.ts:194` -- `const isNew = await withLock(...)` returns `false` for duplicates (line 201), `true` for new (line 214). Line 221: `if (isNew && shouldAutoApprove(request))` gates auto-approve. | VERIFIED |
| 7 | "SF-005/SF-006: Fix readFileSync/writeFileSync mock signatures" | `tests/governance-request-registry.test.ts:42,47,56,61` -- Both `readFileSync` mocks now include `_encoding?: string` param, both `writeFileSync` mocks now include `_encoding?: string` param. Matches real Node.js fs signatures. | VERIFIED |
| 8 | "SF-007/SF-008: Add null-return tests for reject/execute unknown IDs" | `tests/governance-request-registry.test.ts:618-627` -- `rejectGovernanceRequest` null test with empty file. Lines 657-666 -- `executeGovernanceRequest` null test with empty file. Both assert `result` is `null`. | VERIFIED |
| 9 | "SF-009: Add dual-approved status path test" | `tests/governance-request-registry.test.ts:530-551` -- Test `sets status to dual-approved when both sides have COS approval but not both managers`. Seeds request with `sourceCOS` approval, adds `targetCOS`, asserts `status === 'dual-approved'`, confirms neither manager is present. | VERIFIED |
| 10 | "SF-011: Check resolveConfigRequest return value in handleResolve" | `components/marketplace/AgentSkillEditor.tsx:97-100` -- `const result = await resolveConfigRequest(...)` followed by `if (!result.success) { setError(result.error \|\| 'Failed to resolve configuration request') }`. Previously was fire-and-forget `await resolveConfigRequest(...)` with no result check. | VERIFIED |
| 11 | "SF-012: Clear timer before setting new saveSuccess timeout" | `components/marketplace/AgentSkillEditor.tsx:159,181` -- Both `handleAdd` and `handleRemove` now call `if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)` before `saveSuccessTimerRef.current = setTimeout(...)`. Prevents stale timer from prematurely clearing success state. | VERIFIED |
| 12 | "SF-013: Remove dead getQuery() function" | `services/headless-router.ts` -- Grep for `getQuery` returns 0 matches. Diff shows removal of lines 405-410 (the `getQuery` function). No callers existed. | VERIFIED |
| 13 | "SF-014: Sanitize export filename in Content-Disposition" | `services/headless-router.ts:913-914` -- `const safeFilename = filename.replace(/["\r\n\\]/g, '_')` followed by `Content-Disposition: attachment; filename="${safeFilename}"`. Strips quotes, newlines, and backslashes to prevent header injection. | VERIFIED |
| 14 | "SF-015: Narrow statusCode check to 413 only" | `services/headless-router.ts:1885` -- `const statusCode = error?.statusCode === 413 ? 413 : 500`. Previously was `const statusCode = error?.statusCode \|\| 500` which would propagate any arbitrary status code from the error object. Now only 413 is honored; everything else defaults to 500. | VERIFIED |
| 15 | "SF-016: Clarify ToxicSkills as TODO placeholder" | `services/agents-config-deploy-service.ts:162-165` -- Comment updated to `TODO(Phase 2): ToxicSkills scan not yet implemented. Deployed skills are NOT scanned...`. More explicit than the previous generic TODO. | VERIFIED |
| 16 | "NT-001: Move HOSTNAME_RE to module level" | `app/api/v1/governance/requests/route.ts:122` -- `HOSTNAME_RE` is now at module level (between the two `export async function` declarations), outside any function. Previously was inside `GET()` function body. | VERIFIED |
| 17 | "NT-008: Remove unused agentRole destructuring" | `components/marketplace/AgentSkillEditor.tsx:79` -- Destructuring is `{ pendingConfigRequests, resolveConfigRequest, managerId }`. `agentRole` is no longer destructured. Only appears in a comment at line 81. | VERIFIED |

---

## Self-Verification

- [x] I extracted EVERY factual claim from the PR description (not just some)
- [x] I extracted EVERY factual claim from EACH commit message
- [x] For each claim, I quoted the author's EXACT words
- [x] For each claim, I read the FULL function/file (not just grep matches)
- [x] For "field X populated" claims: I traced query -> assign -> return (N/A - no such claims)
- [x] For "version bumped" claims: I checked ALL version-containing files (N/A - no such claims)
- [x] For "removed X" claims: I searched for ALL references to X (verified getQuery has 0 refs, agentRole removed from destructuring)
- [x] For "fixed bug X" claims: I verified the fix path is actually closed (TOCTOU guard traced, statusCode narrowed, filename sanitized)
- [x] For "added tests" claims: I read the test assertions, not just the test name (verified dual-approved, null-return, error-path tests)
- [x] I marked each claim: VERIFIED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / CANNOT VERIFY
- [x] I did NOT skip claims that seemed "obvious" (obvious claims fail most often)
- [x] My finding IDs use the assigned prefix: CV-P5-001
- [x] My report file uses the UUID filename: epcp-claims-P5-972fb328-bf68-4948-af2b-c54f6f141ef7.md
- [x] I checked cross-file consistency (versions, types, configs match everywhere)
- [x] The verified/failed/partial counts in my return message match the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
