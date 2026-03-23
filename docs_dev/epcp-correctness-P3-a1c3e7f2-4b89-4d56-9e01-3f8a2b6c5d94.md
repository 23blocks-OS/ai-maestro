# Code Correctness Report: ui-tests

**Agent:** epcp-code-correctness-agent
**Domain:** ui-tests
**Files audited:** 7
**Date:** 2026-02-22T17:58:00.000Z

## MUST-FIX

### [CC-P3-A3-001] resolveConfigRequest sends wrong request body to approve/reject endpoints
- **File:** hooks/useGovernance.ts:315-318
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (traced through route handlers to service functions)
- **Description:** The `resolveConfigRequest` function sends `{ reason }` in the POST body to `/api/v1/governance/requests/${requestId}/approve` and `/api/v1/governance/requests/${requestId}/reject`. However, both endpoints require completely different fields:
  - Approve endpoint (`app/api/v1/governance/requests/[id]/approve/route.ts:22-24`) requires `{ approverAgentId, password }` -- returns 400 "Missing required fields: approverAgentId, password" if absent.
  - Reject endpoint (`app/api/v1/governance/requests/[id]/reject/route.ts:58-60`) requires `{ rejectorAgentId, password }` -- returns 400 "Missing required fields: rejectorAgentId, password" if absent.

  The `resolveConfigRequest` function never sends `approverAgentId`, `rejectorAgentId`, or `password`. This means **every call to resolve a config request will always fail with HTTP 400**.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:311-318
  const resolveConfigRequest = useCallback(
    async (requestId: string, approved: boolean, reason?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const endpoint = approved ? 'approve' : 'reject'
        const res = await fetch(`/api/v1/governance/requests/${requestId}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })  // <-- Missing approverAgentId/rejectorAgentId + password
        })
  ```
  ```typescript
  // app/api/v1/governance/requests/[id]/approve/route.ts:22-24
  if (!body?.approverAgentId || !body?.password) {
    return NextResponse.json({ error: 'Missing required fields: approverAgentId, password' }, { status: 400 })
  }
  ```
- **Fix:** The `resolveConfigRequest` function signature needs to accept `approverAgentId` (or use the hook's `agentId` from parent scope) and `password`, and include them in the request body. The body for approve should be `{ approverAgentId, password, reason }` and for reject should be `{ rejectorAgentId, password, reason }`.

### [CC-P3-A3-002] submitConfigRequest sends incomplete request body -- missing required fields
- **File:** hooks/useGovernance.ts:286-296
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (traced through route handler to submitCrossHostRequest service function)
- **Description:** The `submitConfigRequest` function sends only `{ type, payload }` to `POST /api/v1/governance/requests`. The route handler at `app/api/v1/governance/requests/route.ts:67` passes this body directly to `submitCrossHostRequest()` (from `cross-host-governance-service.ts:59-67`), which requires the following fields: `type`, `targetHostId`, `requestedBy`, `requestedByRole`, `payload`, `password`, and optionally `note`.

  The function is missing: `targetHostId`, `requestedBy`, `requestedByRole`, and `password`. Without `password`, the service returns 401 "Invalid governance password". Without the other fields, the function may crash or produce undefined behavior.
- **Evidence:**
  ```typescript
  // hooks/useGovernance.ts:286-296
  const submitConfigRequest = useCallback(
    async (targetAgentId: string, config: Record<string, unknown>): Promise<{ ... }> => {
      try {
        const res = await fetch('/api/v1/governance/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'configure-agent',
            payload: { agentId: targetAgentId, configuration: config },
            // Missing: targetHostId, requestedBy, requestedByRole, password
          })
        })
  ```
  ```typescript
  // services/cross-host-governance-service.ts:59-67
  export async function submitCrossHostRequest(params: {
    type: GovernanceRequestType
    targetHostId: string        // <-- required
    requestedBy: string         // <-- required
    requestedByRole: AgentRole  // <-- required
    payload: GovernanceRequestPayload
    password: string            // <-- required
    note?: string
  }): Promise<ServiceResult<GovernanceRequest>> {
  ```
- **Fix:** The `submitConfigRequest` function signature needs to accept `password`, `targetHostId`, `requestedBy`, and `requestedByRole` (or derive them from the hook's state, e.g., using `agentId` for `requestedBy`, `agentRole` for `requestedByRole`, and a sensible default or param for `targetHostId`). All must be included in the request body.

## SHOULD-FIX

### [CC-P3-A3-003] AgentSkillEditor calls resolveConfigRequest without required auth fields
- **File:** components/marketplace/AgentSkillEditor.tsx:82
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (direct consequence of CC-P3-A3-001)
- **Description:** `AgentSkillEditor.tsx` calls `resolveConfigRequest(requestId, approved)` at line 82. Since `resolveConfigRequest` sends the wrong body (see CC-P3-A3-001), every approve/reject action in the skill editor UI will silently fail. The error is caught and logged to console (line 83-84), but no user-facing feedback is shown.
- **Evidence:**
  ```typescript
  // components/marketplace/AgentSkillEditor.tsx:79-86
  const handleResolve = async (requestId: string, approved: boolean) => {
    setResolvingIds(prev => new Set(prev).add(requestId))
    try {
      await resolveConfigRequest(requestId, approved) // Always fails with 400
    } catch (err) {
      console.error('Failed to resolve config request:', err)
    } finally {
  ```
- **Fix:** After fixing CC-P3-A3-001, update all callers to provide the required auth fields. The `handleResolve` function in AgentSkillEditor should prompt for or supply the governance password and the approver/rejector agent ID.

### [CC-P3-A3-004] No test coverage for useGovernance hook's API contract correctness
- **File:** hooks/useGovernance.ts (entire file)
- **Severity:** SHOULD-FIX
- **Category:** test-coverage
- **Confidence:** CONFIRMED (searched all test files in the domain)
- **Description:** None of the 4 test files in this domain test the `useGovernance` hook directly. The hook contains complex API contract logic (constructing request bodies for 10+ different endpoints), but no unit tests verify that the request bodies match what the server endpoints expect. The API contract mismatches in CC-P3-A3-001 and CC-P3-A3-002 would have been caught by tests that mock `fetch` and verify the request body structure.
- **Fix:** Add a test file (`tests/use-governance-hook.test.ts`) that imports `useGovernance`, mocks `fetch`, and verifies each function sends the correct request body structure to the correct endpoint.

## NIT

### [CC-P3-A3-005] Inconsistent error handling in resolveConfigRequest vs submitConfigRequest
- **File:** hooks/useGovernance.ts:320-322 vs hooks/useGovernance.ts:297-299
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `resolveConfigRequest` (line 321) catches JSON parse failure with `.catch(() => ({}))` and falls through to a generic error message. `submitConfigRequest` (line 298) uses the same pattern. However, `resolveConfigRequest` returns the error directly from the response, while `submitConfigRequest` does too. Both are consistent with each other, but both swallow JSON parse errors silently. Minor -- the pattern is used consistently across both functions.
- **Evidence:**
  ```typescript
  // Both use same pattern - consistent but could log parse failure
  const data = await res.json().catch(() => ({}))
  return { success: false, error: data.error || `HTTP ${res.status}` }
  ```
- **Fix:** Consider logging when JSON parse fails on error responses, as this can make debugging harder.

### [CC-P3-A3-006] governance-request-registry.test.ts: test assumes specific request ordering in listGovernanceRequests
- **File:** tests/governance-request-registry.test.ts:311
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The test at line 311 asserts `expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])`, which assumes `listGovernanceRequests()` returns results in insertion order. If the implementation ever changes to sort by date or status, this test will break. The test is correct for the current implementation but is fragile.
- **Evidence:**
  ```typescript
  // tests/governance-request-registry.test.ts:311
  expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])
  ```
- **Fix:** Use `expect.arrayContaining` or sort-independent assertions if ordering is not part of the function's contract.

## CLEAN

Files with no issues found:
- `tests/agent-config-governance.test.ts` -- 16 well-structured tests with proper mock isolation, correct assertions, no logic errors. Test data factories are clean and reusable.
- `tests/governance-endpoint-auth.test.ts` -- 12 tests covering Ed25519 signature verification and type whitelisting. Mock strategy is sound (using real `broadcastGovernanceSync` with mocked sub-dependencies). `afterEach` properly restores globals (NT-010).
- `tests/governance-request-registry.test.ts` -- 30 comprehensive tests covering all 10 exported functions. In-memory filesystem mock is well-designed. Atomic write verification is correct. Only minor ordering fragility noted (NIT).
- `tests/agent-config-governance-extended.test.ts` -- 56 tests across 4 modules. Thorough coverage of RBAC, deploy service, cross-host governance, and notifications. Mock isolation is correct. UUID counter reset prevents test pollution.
- `components/AgentProfile.tsx` -- Governance integration (useGovernance hook usage, RoleBadge, RoleAssignmentDialog, TeamMembershipSection) is correctly wired. No direct calls to broken functions (resolveConfigRequest/submitConfigRequest are not used in this component).

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = API contract mismatches that cause every call to fail (400/401 errors)
      SHOULD-FIX = Downstream caller affected by MUST-FIX, missing test coverage
      NIT = Style consistency, test fragility
- [x] My finding IDs use the assigned prefix: CC-P3-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P3-a1c3e7f2-4b89-4d56-9e01-3f8a2b6c5d94.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (useGovernance hook has no tests)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (6 issues: 2 must-fix, 2 should-fix, 2 nit)
- [x] My return message to the orchestrator is exactly 1-2 lines
