# Code Correctness Report: ui-tests

**Agent:** epcp-code-correctness-agent
**Domain:** ui-tests
**Files audited:** 5
**Date:** 2026-02-22T17:36:00Z
**Pass:** 2 (verifying P1 fixes + checking for new issues)

## MUST-FIX

_No must-fix issues found._

## SHOULD-FIX

### [CC-P2-A3-001] Inconsistent optional chaining on `payload` between AgentProfile and AgentSkillEditor
- **File:** `components/marketplace/AgentSkillEditor.tsx:71`
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `AgentSkillEditor.tsx` line 71 uses `r.payload.agentId` (non-optional access) while `AgentProfile.tsx` line 60 uses `r.payload?.agentId` (optional chaining). The `GovernanceRequest` type at `types/governance-request.ts:107` declares `payload: GovernanceRequestPayload` as non-optional, so neither should crash at runtime. However, the `pendingConfigRequests` array comes from `useGovernance` state which is typed as `GovernanceRequest[]` -- the payload field is always present per the type. The inconsistency is not a runtime bug but a code style issue that creates confusion about whether payload could be undefined. Since `AgentProfile.tsx` also accesses `r.payload?.configuration?.operation` at line 304-305 (the `configuration` field IS optional per the type), the optional chaining on `payload` itself is unnecessary defensive coding, while the optional chaining on `configuration` is correct.
- **Evidence:**
  ```tsx
  // AgentSkillEditor.tsx:71 -- no optional chaining on payload
  const agentPendingConfigs = pendingConfigRequests.filter(r => r.payload.agentId === agentId)

  // AgentProfile.tsx:60 -- optional chaining on payload (unnecessary)
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agent?.id)
  ```
- **Fix:** Make both files consistent. Since `payload` is non-optional in the type, remove the `?.` on `payload` in `AgentProfile.tsx:60` (keep `agent?.id` since `agent` can be null). Alternatively, add `?.` in `AgentSkillEditor.tsx` for defensive coding consistency.

### [CC-P2-A3-002] AgentProfile `agentPendingConfigRequests` filters against nullable `agent?.id` which could cause empty results during loading
- **File:** `components/AgentProfile.tsx:60`
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 60 computes `agentPendingConfigRequests` by filtering `governance.pendingConfigRequests` against `agent?.id`. However, `agent` state starts as `null` and is populated asynchronously via `useEffect`. During the loading phase (or if the fetch fails), `agent` is null so `agent?.id` is `undefined`, causing the filter to return an empty array. This is not a crash bug, but it means the `pendingConfigCount` used later in the UI will always be 0 during loading. This is mostly fine since the UI shows a loading spinner during that time, but the computation runs on every render even when `agent` is null, which is wasted work. The `useGovernance(agentId || null)` hook already uses the prop `agentId` directly, which is always available. The filter should use `agentId` (the prop) instead of `agent?.id` (the state) for consistency with what `useGovernance` uses.
- **Evidence:**
  ```tsx
  // Line 55: useGovernance uses agentId prop directly
  const governance = useGovernance(agentId || null)

  // Line 60: But this filter uses agent state (which may be null during loading)
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agent?.id)
  ```
- **Fix:** Change `agent?.id` to `agentId` on line 60 to match the prop used by `useGovernance`:
  ```tsx
  const agentPendingConfigRequests = governance.pendingConfigRequests.filter(r => r.payload?.agentId === agentId)
  ```

### [CC-P2-A3-003] `canApprove` in AgentSkillEditor checks agentRole of the profiled agent, not the viewer
- **File:** `components/marketplace/AgentSkillEditor.tsx:75`
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 75 sets `canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'`. However, `agentRole` comes from `useGovernance(agentId)` which returns the role of the agent being viewed, not the current viewer/user. In Phase 1 (localhost, single user = system owner), the comment on lines 72-74 acknowledges this and says it's acceptable. This is documented as a known limitation. However, the logic is still inverted: if you're viewing a "member" agent's profile, the approve/reject buttons won't appear even though the viewer (system owner) has full access. Conversely, viewing a "manager" agent's profile would show approve/reject buttons.
- **Evidence:**
  ```tsx
  // Line 70-75
  const { pendingConfigRequests, resolveConfigRequest, agentRole } = useGovernance(agentId)
  // ...
  const canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'
  ```
  The comment says "In Phase 1 (localhost, single user), the 'viewer' IS the system owner who has full access." But that reasoning would mean `canApprove` should always be `true` in Phase 1, not dependent on the viewed agent's role.
- **Fix:** For Phase 1, change to `const canApprove = true` with a comment explaining that in Phase 1 the viewer is always the system owner. Or fetch the manager's agentId and check that instead. This is a known Phase 1 limitation but the current logic does not match the stated intent.

## NIT

### [CC-P2-A3-004] `governance-endpoint-auth.test.ts` does not restore `vi.stubGlobal('fetch')` in afterEach
- **File:** `tests/governance-endpoint-auth.test.ts:135-142`
- **Severity:** NIT
- **Category:** test-isolation
- **Confidence:** CONFIRMED
- **Description:** The test file uses `vi.stubGlobal('fetch', mockFetch)` in `beforeEach` but does not restore the original `fetch` in `afterEach`. Compare with `agent-config-governance-extended.test.ts` which correctly saves `originalFetch` and restores it in `afterEach`. While vitest clears mocks between test files, within a test file the stubbed global persists, which is fine since `vi.clearAllMocks()` resets mock state. However, best practice is to restore globals to avoid side effects. Since vitest runs each test file in its own worker, this is unlikely to cause real issues.
- **Evidence:**
  ```ts
  // governance-endpoint-auth.test.ts:135
  vi.stubGlobal('fetch', mockFetch)
  // No afterEach to restore

  // agent-config-governance-extended.test.ts:355,418-420
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })
  ```
- **Fix:** Add `afterEach` to restore original fetch, or use `vi.unstubAllGlobals()` in afterEach.

### [CC-P2-A3-005] `uuid` mock in `agent-config-governance-extended.test.ts` returns static value
- **File:** `tests/agent-config-governance-extended.test.ts:226-228`
- **Severity:** NIT
- **Category:** test-isolation
- **Confidence:** CONFIRMED
- **Description:** The uuid mock always returns `'test-uuid-ext-001'`. This means all tests that trigger uuid generation will get the same ID. This is fine for current tests since none compare or deduplicate generated UUIDs within a single test, but if future tests need unique IDs within a test case (e.g., creating multiple entities), this mock would cause ID collisions. The `agents-core-service.test.ts` file uses a better pattern with an incrementing counter: `vi.fn(() => 'uuid-${++uuidCounter}')`.
- **Evidence:**
  ```ts
  // Static mock
  vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-ext-001') }))

  // Better pattern (in agents-core-service.test.ts)
  mockUuid: { v4: vi.fn(() => `uuid-${++uuidCounter}`) }
  ```
- **Fix:** Consider switching to the incrementing counter pattern for robustness if more tests are added.

### [CC-P2-A3-006] `AgentProfile.tsx` save handler uses `setTimeout` to delay `setSaving(false)` on success path
- **File:** `components/AgentProfile.tsx:222`
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On successful save, line 222 uses `setTimeout(() => setSaving(false), 500)` to keep the spinner visible for 500ms. This is a common UX pattern to prevent "flash" of loading state. However, if the component unmounts during that 500ms window (user closes profile), `setSaving(false)` will trigger a React state update on an unmounted component. In React 18 with concurrent mode, this warning was removed, but it's still unnecessary work. The error path correctly calls `setSaving(false)` immediately.
- **Evidence:**
  ```tsx
  if (response.ok) {
    setHasChanges(false)
    setTimeout(() => setSaving(false), 500) // potential update on unmounted component
  }
  ```
- **Fix:** Use a cleanup ref pattern or simply call `setSaving(false)` immediately. This is minor since React 18 no longer warns about this.

## CLEAN

Files with no issues found:
- `tests/agent-config-governance-extended.test.ts` -- 56 well-structured tests with comprehensive mock setup, proper isolation, good edge case coverage. Factory functions are well-designed. Mock patterns are consistent. All governance RBAC paths tested (manager, COS, member, null). Cross-host configure-agent flow thoroughly covered including regression tests for existing types. Notification integration tests are creative (testing via mock call verification). No bugs found.
- `tests/governance-endpoint-auth.test.ts` -- 12 tests covering Ed25519 signature verification. Clean mock setup, proper import ordering (mocks before imports). The `vi.waitFor` pattern for fire-and-forget fetch is a good solution. Tests verify header format, timestamp consistency, and type whitelist. Minor nit about fetch restoration (CC-P2-A3-004 above) but no correctness issues.
- `tests/services/agents-core-service.test.ts` -- 40+ comprehensive tests covering all CRUD operations, wake/hibernate lifecycle, session management, and edge cases. Uses shared fixtures with counter-based unique IDs. Good error path coverage (404, 400, 410, 500). Mock patterns are well-organized with `vi.hoisted()` for proper hoisting. No bugs found.
- `tests/test-utils/fixtures.ts` -- Clean factory functions with counter-based unique IDs. Proper type safety. `resetFixtureCounter` exported for test isolation.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P2-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P2-86654a1e-f90a-42bd-9b48-d444c7db4cf5.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (6 total: 0 must-fix, 3 should-fix, 3 nit)
- [x] My return message to the orchestrator is exactly 1-2 lines
