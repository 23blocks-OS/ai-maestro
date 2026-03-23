# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 2
**Date:** 2026-02-22T18:22:00.000Z
**Finding ID Prefix:** CC-P4-A4

## MUST-FIX

### [CC-P4-A4-001] submitConfigRequest test replica diverges from actual hook signature and body
- **File:** tests/use-governance-hook.test.ts:29-51
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The standalone function replica of `submitConfigRequest` has a 2-parameter signature `(targetAgentId, config)`, but the actual `useGovernance.ts` hook (line 287) takes 6 parameters: `(targetAgentId, config, password, requestedBy, requestedByRole, targetHostId?)`. More critically, the request body in the replica omits `password`, `requestedBy`, `requestedByRole`, and `targetHostId` fields that the actual hook sends. This means the tests validate a request body structure that does NOT match what the production code actually sends.
- **Evidence:**
  Test replica body (lines 37-40):
  ```typescript
  body: JSON.stringify({
    type: 'configure-agent',
    payload: { agentId: targetAgentId, configuration: config },
  })
  ```
  Actual hook body (lines 292-299):
  ```typescript
  body: JSON.stringify({
    type: 'configure-agent',
    targetHostId: targetHostId || 'localhost',
    requestedBy,
    requestedByRole,
    password,
    payload: { agentId: targetAgentId, configuration: config },
  })
  ```
  The test asserts that the body has only `type` and `payload`, but the production code also sends `targetHostId`, `requestedBy`, `requestedByRole`, and `password`. A server relying on these fields would fail if they were missing. The test gives a false green.
- **Fix:** Update the replica function to match the actual 6-parameter signature, and update the request body to include all fields. Update the assertion in the test at line 123-126 to verify the additional body fields.

### [CC-P4-A4-002] submitConfigRequest error-path replica diverges from actual hook error handling
- **File:** tests/use-governance-hook.test.ts:43
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The test replica's error path for non-ok responses uses `.catch(() => ({}))` (line 43), while the actual hook (lines 302-305) uses `.catch((parseErr: unknown) => { console.warn(...); return {} })`. While the functional result is equivalent (both return `{}`), the test at lines 143-155 claims to verify the actual hook's behavior but is testing a subtly different implementation. More importantly, the test for `submitConfigRequest` never tests the case where `res.json()` throws on the error path -- this case IS tested for `resolveConfigRequest` (line 245-258) but NOT for `submitConfigRequest`, creating asymmetric coverage despite both functions having identical error handling patterns in the real hook.
- **Evidence:**
  Test replica line 43:
  ```typescript
  const data = await res.json().catch(() => ({}))
  ```
  Actual hook lines 302-305:
  ```typescript
  const data = await res.json().catch((parseErr: unknown) => {
    console.warn('[useGovernance] Failed to parse response JSON:', parseErr)
    return {}
  })
  ```
- **Fix:** (1) Update the replica to match the actual hook's `.catch()` signature. (2) Add a test case for `submitConfigRequest` that verifies behavior when `res.json()` throws on the error path (symmetric with the existing test at line 245).

## SHOULD-FIX

### [CC-P4-A4-003] readFileSync mock ignores encoding parameter
- **File:** tests/governance-request-registry.test.ts:44,63
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `readFileSync` mock accepts only `(filePath: string)`, but the actual call in `governance-request-registry.ts:43` passes `(REQUESTS_FILE, 'utf-8')`. The mock ignores the encoding argument, which means it returns a raw string regardless. This works in this test because the mock always returns strings, but it means the test wouldn't catch a regression where someone removes the encoding argument from the source (which would cause `readFileSync` to return a `Buffer` instead of `string` in real Node.js).
- **Evidence:**
  Mock (line 44):
  ```typescript
  readFileSync: vi.fn((filePath: string) => {
  ```
  Source (line 43):
  ```typescript
  const data = fs.readFileSync(REQUESTS_FILE, 'utf-8')
  ```
- **Fix:** Update the mock signature to `readFileSync: vi.fn((filePath: string, _encoding?: string) => {` and optionally assert in at least one test that the encoding parameter was passed.

### [CC-P4-A4-004] writeFileSync mock ignores encoding parameter
- **File:** tests/governance-request-registry.test.ts:48,67
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P4-A4-003 but for `writeFileSync`. The mock takes `(filePath: string, data: string)` but the source passes a third argument `'utf-8'`. The test wouldn't detect if the encoding were removed from the source.
- **Evidence:**
  Mock (line 48):
  ```typescript
  writeFileSync: vi.fn((filePath: string, data: string) => {
  ```
  Source (line 71):
  ```typescript
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  ```
- **Fix:** Update mock to `writeFileSync: vi.fn((filePath: string, data: string, _encoding?: string) => {`.

### [CC-P4-A4-005] Missing test: rejectGovernanceRequest with unknown ID
- **File:** tests/governance-request-registry.test.ts:565-590
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `rejectGovernanceRequest` test suite tests rejection of a pending request and rejection guard for executed requests, but does NOT test what happens when `rejectGovernanceRequest` is called with a non-existent ID. The source code (line 218) returns `null` in this case. The `approveGovernanceRequest` suite correctly tests this case (line 514-521), but `rejectGovernanceRequest` does not.
- **Evidence:** The source at line 218 returns `null` for unknown IDs:
  ```typescript
  if (!request) return null
  ```
  No test verifies this behavior for `rejectGovernanceRequest`.
- **Fix:** Add a test case: `it('returns null for unknown request ID', ...)` that seeds an empty requests file and calls `rejectGovernanceRequest('nonexistent', 'agent', 'reason')`, asserting the result is `null`.

### [CC-P4-A4-006] Missing test: executeGovernanceRequest with unknown ID
- **File:** tests/governance-request-registry.test.ts:596-624
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Similar to CC-P4-A4-005, the `executeGovernanceRequest` test suite does not test the `null` return case for unknown IDs (source line 240: `if (!request) return null`).
- **Evidence:** Source at line 240:
  ```typescript
  if (!request) return null
  ```
  No test verifies this path.
- **Fix:** Add a test case asserting `executeGovernanceRequest('nonexistent')` returns `null`.

### [CC-P4-A4-007] Missing test: dual-approved status path in approveGovernanceRequest
- **File:** tests/governance-request-registry.test.ts:447-559
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The source code (lines 198-201) has a `dual-approved` status path that is triggered when both source-side AND target-side have at least COS approval but NOT both managers. This status transition is documented in the JSDoc (line 155) but never tested. The test suite only covers: sourceCOS alone (remote-approved), targetManager alone (local-approved), both managers (executed), and terminal state guards. The `dual-approved` path has zero test coverage.
- **Evidence:** Source lines 198-201:
  ```typescript
  } else if (hasAnySourceApproval && hasAnyTargetApproval) {
    // Both sides have at least COS approval but not both managers yet
    request.status = 'dual-approved'
  }
  ```
- **Fix:** Add a test: seed a request with `sourceCOS` approval, then approve with `targetCOS`. Assert `status === 'dual-approved'`.

### [CC-P4-A4-008] Test does not verify refresh() call in hook after successful mutation
- **File:** tests/use-governance-hook.test.ts:129-141
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The actual `useGovernance` hook calls `refresh()` (fire-and-forget) after successful `submitConfigRequest` (line 309) and `resolveConfigRequest` (line 338). Since the test replicas are standalone functions (not extracted from the hook), they cannot test this behavior. This is an inherent limitation of the test strategy, but it means a regression that removes the `refresh()` call would not be caught. The test file's header (lines 12-13) acknowledges this limitation, but it should be documented as a known gap.
- **Evidence:** Source line 309:
  ```typescript
  refresh() // CC-002: Intentionally fire-and-forget
  ```
  The test replica at line 47 simply returns the result without calling any refresh.
- **Fix:** Either document this as a known test gap with a `// TODO:` comment in the test, or add a test that uses `@testing-library/react` or a minimal hook wrapper to verify `refresh()` is called after success.

## NIT

### [CC-P4-A4-009] Inconsistent agentId filter test -- relies on coincidental string match
- **File:** tests/governance-request-registry.test.ts:338-345
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test for `listGovernanceRequests` agentId filter (line 341) relies on `'agent-x'` matching both `pendingReq.payload.agentId` (which is `'agent-x'` from the fixture at line 282) AND `rejectedReq.requestedBy` (which is `'agent-x'` from line 299). This is correct but the two match paths (payload.agentId vs requestedBy) are not explicitly tested separately. A single test with the same string matching both paths doesn't confirm both filter branches work independently.
- **Evidence:**
  ```typescript
  const result = listGovernanceRequests({ agentId: 'agent-x' })
  expect(result).toHaveLength(2) // matches both paths with same string
  ```
- **Fix:** Add two sub-assertions or separate test cases: one where agentId matches only `payload.agentId` and another where it matches only `requestedBy`.

### [CC-P4-A4-010] Test comment says "lines 286-309" but actual line numbers may have shifted
- **File:** tests/use-governance-hook.test.ts:27
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The JSDoc on the replica function says "Mirrors hooks/useGovernance.ts lines 286-309 exactly" but the line numbers in the source are currently 286-316 (with the `refresh()` call and `[refresh]` dependency array). Hard-coded line numbers in comments go stale quickly.
- **Evidence:**
  ```typescript
  * Mirrors hooks/useGovernance.ts lines 286-309 exactly.
  ```
  The actual function spans lines 286-316 in the source.
- **Fix:** Remove the specific line number references or use a more stable reference like "Mirrors the submitConfigRequest useCallback in hooks/useGovernance.ts".

## CLEAN

Files with no issues found:
- (No files were completely clean; both files had findings.)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (read source files to confirm)
- [x] I categorized findings correctly:
      MUST-FIX = tests that give false positives due to wrong API contract
      SHOULD-FIX = missing test coverage for code paths, mock inaccuracies
      NIT = style, documentation, test design improvements
- [x] My finding IDs use the assigned prefix: CC-P4-A4-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P4-ad56df60-9209-42c4-b82b-5777513cfdc5.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (noted both have findings)
- [x] Total finding count in my return message matches the actual count in the report (10 findings: 2 must-fix, 6 should-fix, 2 nit)
- [x] My return message to the orchestrator is exactly 1-2 lines
