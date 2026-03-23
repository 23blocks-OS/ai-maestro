# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 2
**Date:** 2026-02-22T17:02:00.000Z

## MUST-FIX

_No must-fix issues found._

## SHOULD-FIX

### [CC-P1-A5-001] Stale test count in file header comment (agent-config-governance-extended.test.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:26
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file header comment on line 26 says "Total: 48 tests (15 + 12 + 15 + 6)" but the actual test counts are 56 (20 + 16 + 14 + 6). The per-module counts in lines 7, 10, 15, 22 are also stale:
  - Module 1 header says 15 tests, actual: 20
  - Module 2 header says 12 tests, actual: 16
  - Module 3 header says 15 tests, actual: 14
  - Module 4 header says 6 tests, actual: 6 (correct)
- **Evidence:**
  ```typescript
  // Line 26:
  // * Total: 48 tests (15 + 12 + 15 + 6)
  // Actual count by section: 20 + 16 + 14 + 6 = 56
  ```
- **Fix:** Update header comment to "Total: 56 tests (20 + 16 + 14 + 6)" and update the per-module test counts.

### [CC-P1-A5-002] Stale test count in file header comment (governance-endpoint-auth.test.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts:8
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file header comment on line 8 says "Coverage: 13 tests across 3 security fixes" but there are only 12 actual `it()` blocks (3 + 2 + 6 + 1 = 12). One test was likely removed at some point but the header was not updated.
- **Evidence:**
  ```typescript
  // Line 8:
  // * Coverage: 13 tests across 3 security fixes
  // Actual: 12 tests (3 in SR-001 broadcastGovernanceSync, 2 in SR-001 cross-host, 6 in SR-007, 1 in header format)
  ```
- **Fix:** Update header to "Coverage: 12 tests across 3 security fixes".

## NIT

### [CC-P1-A5-003] Module 4 tests test mock call patterns rather than actual notification service logic
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:1220-1230
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Module 4 ("config notifications") `describe` block acknowledges in its own comments (lines 1221-1232) that it cannot test the actual `notifyConfigRequestOutcome` function because `vi.mock` is hoisted and already mocks the module. Instead, all 6 tests verify that the cross-host-governance-service calls the mocked `notifyConfigRequestOutcome` with the correct arguments. This is valid integration-level testing of the calling code's behavior, but it provides zero coverage of the actual `config-notification-service.ts` logic (e.g., the AMP message format, tmux notification dispatch, the guard `if (request.type !== 'configure-agent') return`). A separate test file for the notification service would be needed for direct unit coverage.
- **Evidence:**
  ```typescript
  // Lines 1221-1232:
  // We need to import the real module (not the mock) for this section.
  // But the module is already mocked above for cross-host tests.
  // Instead, we test via the cross-host governance service's behavior,
  // which calls notifyConfigRequestOutcome.
  ```
- **Fix:** Consider creating a separate `config-notification-service.test.ts` that tests `notifyConfigRequestOutcome` directly with its own mocks for `fetch` and `child_process.exec`. This is not urgent since the integration-level call pattern tests provide reasonable confidence.

### [CC-P1-A5-004] `makeAgentWithSubconscious` factory return type is `Record<string, unknown>` instead of a proper mock type
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:303-310
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The factory function `makeAgentWithSubconscious` returns `Record<string, unknown>`, which loses all type information. The mock is used with `mockAgentRegistryGetAgent.mockResolvedValue(makeAgentWithSubconscious())` where `agentRegistry.getAgent` would return an Agent-like object with `getSubconscious()`. The test works because the runtime doesn't check the types, but a more specific return type would catch mismatches if the Agent class interface changes.
- **Evidence:**
  ```typescript
  function makeAgentWithSubconscious(overrides: Partial<Agent> = {}): Record<string, unknown> {
    return {
      id: AGENT_UUID,
      name: 'test-agent-runtime',
      getSubconscious: () => null,
      ...overrides,
    }
  }
  ```
- **Fix:** Use a more specific interface or at minimum `{ id: string; name: string; getSubconscious: () => unknown }` as the return type.

### [CC-P1-A5-005] `vi.waitFor` used for fire-and-forget fetch assertion relies on timing
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts:220,255
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `sendRequestToRemoteHost` call in `submitCrossHostRequest` is fire-and-forget (`.catch()` on line 126 of the source). The tests use `vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))` to wait for the fire-and-forget fetch to complete. While this is more deterministic than the `setTimeout` it replaced (see comment CC-P4-004), `vi.waitFor` has a default timeout of 1000ms. In CI environments under load, the promise microtask queue may be delayed. The existing implementation is reasonable and there is a comment explaining the pattern.
- **Evidence:**
  ```typescript
  // Line 220:
  await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
  ```
- **Fix:** No immediate action needed. The `vi.waitFor` approach is the best available option for testing fire-and-forget patterns. If flakiness is observed in CI, consider adding an explicit `timeout` option to `vi.waitFor`.

## CLEAN

Files with no issues found:
- _None_ -- both files have minor issues documented above.

## Missing Test Coverage (Flagged, Not Verified)

1. **No direct unit tests for `config-notification-service.ts`**: The `notifyConfigRequestOutcome` function is only tested indirectly via the cross-host service's mock call patterns. The actual AMP message construction, tmux notification dispatch, and the `if (request.type !== 'configure-agent') return` guard are not directly tested.

2. **No test for `getSkillSettings` governance**: The `getSkillSettings` function has no governance enforcement (intentional per the source code), but there is no explicit test asserting this. There is a test for `getSkillsConfig` (line 597) which verifies reads are public, but `getSkillSettings` is not tested in this file. It may be covered elsewhere.

3. **No test for `deployConfigToAgent` with `update-program-args` operation**: The `update-program-args` operation is listed in `VALID_OPERATIONS` but has no test case in the deploy service section.

4. **No negative test for `bulk-config` sub-operation failure**: The `bulk-config` test (line 833) tests the happy path. If one sub-operation fails (e.g., `deployAddSkill` returns an error), `deployBulkConfig` should return that error. This error propagation path is not tested.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P1-A5-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P1-43d4b737-5df7-44d2-a2d7-5b31acfb03cb.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
