# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Files audited:** 8
**Date:** 2026-02-17T00:19:00.000Z

## MUST-FIX

None.

## SHOULD-FIX

### [CC-001] transfer-registry.test.ts: missing `type` field on `Team`-shaped makeTeam helper would fail strict mode
- **File:** /Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts:44-53
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `makeTeam()` helper returns `Team` but does not include the required `type: TeamType` field in its defaults. The `Team` interface declares `type: TeamType` as required (not optional). While this works at runtime (JavaScript doesn't enforce interfaces), it means the helper produces objects that are technically invalid `Team` instances. In tests that check `team.type === 'closed'`, the missing field evaluates as `undefined !== 'closed'` which happens to produce correct behavior for open-team scenarios, but this is incidental, not intentional.
- **Evidence:**
  ```typescript
  // validate-team-mutation.test.ts:44-53
  function makeTeam(overrides: Partial<Team> = {}): Team {
    return {
      id: 'team-default',
      name: 'Default Team',
      agentIds: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    }
  }
  ```
  Same pattern in `team-registry.test.ts:60-69`.
- **Fix:** Add `type: 'open' as const` to the default fields in both `makeTeam` helpers:
  ```typescript
  function makeTeam(overrides: Partial<Team> = {}): Team {
    return {
      id: 'team-default',
      name: 'Default Team',
      type: 'open',
      agentIds: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    }
  }
  ```

### [CC-002] message-filter.test.ts: test for "member messages COS not in agentIds" may not reflect real-world data
- **File:** /Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts:174-192
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The test at line 174 creates a team where the COS (`cos-alpha`) is the `chiefOfStaffId` but is NOT in `agentIds`. The `validateTeamMutation` function (R4.6) explicitly auto-adds the COS to `agentIds`, meaning in production this scenario should never occur. The test still passes because `message-filter.ts` line 102 checks `team.chiefOfStaffId === recipientAgentId` separately from the `agentIds` membership check. While the test correctly validates the code path, the scenario it tests (COS not in agentIds) represents an inconsistent data state that governance validation would prevent.
- **Evidence:**
  ```typescript
  // line 181: COS is NOT in agentIds
  const teamAlpha = makeClosedTeam('alpha', ['member-a1', 'member-a2'], 'cos-alpha')
  ```
  The `makeClosedTeam` helper puts `cos-alpha` only as `chiefOfStaffId`, not in `agentIds`.
- **Fix:** Either (a) add a comment explaining this tests a defensive code path for data consistency, or (b) include the COS in agentIds to match production invariants and add a separate test for the defensive `canReachCOS` check with an explicit comment about why it matters.

## NIT

### [CC-003] task-registry.test.ts: `uuidCounter` is shared between `makeTask` and `vi.mock('uuid')`, causing fragile counter coupling
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:26-31 and 74-86
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `uuidCounter` variable is shared between the `uuid` mock and the `makeTask()` helper function. When `makeTask()` is called, it increments `uuidCounter` directly (line 76: `id: \`task-\${++uuidCounter}\``), and when `createTask()` is called, the uuid mock also increments it. This creates implicit coupling between test setup and assertion logic. Tests that call both `makeTask()` and `createTask()` in sequence (like `wouldCreateCycle` tests at line 476) will have their uuid counter affected by both paths. This hasn't caused bugs because the `wouldCreateCycle` tests use `saveTasks` (which doesn't call uuid) and explicit IDs via `makeTask`, but it's fragile.
- **Evidence:**
  ```typescript
  // Shared counter used by both:
  let uuidCounter = 0
  vi.mock('uuid', () => ({ v4: vi.fn(() => { uuidCounter++; return `uuid-${uuidCounter}` }) }))
  // ...
  function makeTask(overrides: Partial<Task> = {}): Task {
    return { id: `task-${++uuidCounter}`, ... }
  }
  ```
- **Fix:** Use a separate counter for `makeTask` (e.g., `let makeTaskCounter = 0`) to decouple it from the uuid mock, similar to the pattern used in `team-registry.test.ts` which correctly uses a separate `makeTeamCounter`.

### [CC-004] governance.test.ts: `isChiefOfStaffAnywhere` test uses `as any` to bypass Team type
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance.test.ts:240
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The mock return value for `loadTeams` uses `as any` to bypass TypeScript's type checking. This means the mock objects lack the `type: TeamType` field validation at compile time. If the `Team` interface changes, these mocks would silently diverge from the real type without a compile error. The `type` field is critical because `isChiefOfStaffAnywhere` filters by `team.type === 'closed'`.
- **Evidence:**
  ```typescript
  mockedLoadTeams.mockReturnValue([
    { id: 'team-open-1', name: 'Open Team', type: 'open', ... },
    { id: 'team-closed-1', name: 'Closed Team', type: 'closed', ... },
  ] as any)  // bypasses Team[] type check
  ```
- **Fix:** Remove `as any` and ensure mock objects match the `Team` interface exactly (add any missing optional fields), or use `Partial<Team>` with a helper function.

### [CC-005] document-api.test.ts: no explicit mock of team-registry relies on transitive fs mock
- **File:** /Users/emanuelesabetta/ai-maestro/tests/document-api.test.ts:1-68
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `document-api.test.ts` file does not explicitly mock `@/lib/team-registry` but relies on the `fs` mock being picked up transitively by the real `team-registry` module. This works because `team-registry` uses `import fs from 'fs'` (matching the `default` export in the mock), but it creates a tight coupling between the test and the internal implementation detail of team-registry's fs import style. If team-registry ever switches to named imports (like `transfer-registry.ts` does), the document-api tests would break without a clear error message.
- **Evidence:** No `vi.mock('@/lib/team-registry', ...)` line exists in `document-api.test.ts`, yet the test uses `createTeam` which depends on `@/lib/team-registry` and its transitive dependency on `fs`.
- **Fix:** This is acceptable as-is since it's integration-testing the actual registry+route stack. Adding a comment noting the transitive mock dependency would aid maintainability.

### [CC-006] Missing edge case: task-registry createTask with empty string assigneeAgentId
- **File:** /Users/emanuelesabetta/ai-maestro/tests/task-registry.test.ts:162-217
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The source code `createTask` uses `data.assigneeAgentId || null` (line 112 of task-registry.ts), which means an empty string `''` assigneeAgentId would be silently converted to `null`. No test covers this edge case. While arguably correct behavior, it should be documented or tested.
- **Evidence:**
  ```typescript
  // task-registry.ts:112
  assigneeAgentId: data.assigneeAgentId || null,
  ```
  An empty string `''` is falsy, so `'' || null` evaluates to `null`.
- **Fix:** Either add a test asserting `createTask({...assigneeAgentId: ''})` produces `null`, or change the source to use `?? null` instead of `|| null` to be explicit about the nullish check.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/transfer-registry.test.ts -- No issues. Mocks correctly match named imports from fs. Fake timers properly set up and torn down. All assertion chains complete with persistence verification.
- /Users/emanuelesabetta/ai-maestro/tests/team-api.test.ts -- No issues. Route handler mocking (governance, team-acl, agent-registry) is correct. Params use Promise.resolve matching Next.js 14 App Router signature. Status codes verified against actual route implementation.

## SUMMARY

- **0 MUST-FIX**: No blocking bugs found.
- **2 SHOULD-FIX**: Missing required `type` field in `makeTeam` helpers (CC-001), and test scenario with COS not in agentIds representing impossible production state (CC-002).
- **4 NIT**: Shared counter fragility (CC-003), `as any` type bypass (CC-004), transitive mock coupling (CC-005), missing empty-string edge case (CC-006).
- **All 330 tests pass** (verified by running `yarn test --run`).
- **Mock correctness verified**: All mock patterns correctly match source import styles (default vs named). The `transfer-registry.test.ts` correctly mocks `fs` with named exports (matching `import { readFileSync, ... } from 'fs'`) and `crypto` with `randomUUID` (matching `import { randomUUID } from 'crypto'`). All other test files correctly mock `fs` with `default:` (matching `import fs from 'fs'`).
