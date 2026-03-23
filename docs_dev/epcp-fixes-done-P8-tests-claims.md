# EPCP P8 Fixes: Tests & Claims Domain

**Date:** 2026-02-23
**Pass:** 8
**Domain:** Tests, Claims, Documentation

## Summary

17 findings assigned | 14 fixed/documented | 1 false finding (NT-001) | 2 no-action-needed per review

## Fixes Applied

### SF-001: task-registry.test.ts makeTaskCounter not reset in beforeEach
**File:** `tests/task-registry.test.ts:107-111`
**Fix:** Added `makeTaskCounter = 1000` to the `beforeEach` block, matching the pattern used by `makeDocCounter` in document-registry.test.ts.

### SF-003: document-registry.test.ts makeDoc helper does not exercise undefined optional fields
**File:** `tests/document-registry.test.ts`
**Fix:** Added test case `'handles undefined pinned and tags fields'` that passes `pinned: undefined, tags: undefined` to `createDocument` and verifies round-trip behavior.

### SF-004: fixtures.ts makeTask missing assigneeAgentId default
**File:** `tests/test-utils/fixtures.ts:114-126`
**Fix:** Added `assigneeAgentId: null` to the `makeTask` factory, matching production `createTask` which uses `data.assigneeAgentId ?? null`.

### SF-052: CHANGELOG "169 new tests" -- actual count is 252 across 10 files
**File:** `CHANGELOG.md:19`
**Fix:** Updated to "252 new tests across 10 test files" and added `agent-config-governance-extended` to the file list.
**Breakdown:** governance-peers(20) + governance-sync(16) + host-keys(15) + role-attestation(27) + governance-request-registry(34) + cross-host-governance(40) + manager-trust(15) + agent-config-governance(16) + agent-config-governance-extended(56) + governance-endpoint-auth(13) = 252.

### SF-053: agentHostMap listed as functional feature but is only a type stub
**File:** `CHANGELOG.md:16`
**Fix:** Annotated CHANGELOG entry with `(@planned -- type stub only, not yet populated or consumed)`.

### NT-003: governance-peers.test.ts dual export mock pattern undocumented
**File:** `tests/governance-peers.test.ts`
**Fix:** Added explanatory comment before `vi.mock('fs', ...)` explaining why both named and default exports are mocked with identical implementations sharing the same fsStore.

### NT-005: service-mocks.ts createSharedStateMock potentially unused fields
**File:** `tests/test-utils/service-mocks.ts:51-60`
**Fix:** Added comment explaining that `statusSubscribers`, `terminalSessions`, `companionClients` are required for TypeScript structural compatibility with the SharedState interface.

### NT-011: Deprecation logs on every request in sessions/[id]/* routes
**Files:**
- `app/api/sessions/[id]/command/route.ts`
- `app/api/sessions/[id]/rename/route.ts`
- `app/api/sessions/[id]/route.ts`
**Fix:** Added module-level `let _deprecationWarned = false` guard to each `logDeprecation()` function. Warning is now emitted once per server lifetime instead of on every request.

### NT-012: body typed as `any` in docs and graph/code POST handlers
**Files:**
- `app/api/agents/[id]/docs/route.ts:61`
- `app/api/agents/[id]/graph/code/route.ts:58`
**Fix:** Changed `let body: any = {}` to `let body: Record<string, unknown> = {}`.

### NT-015: parseSessionName does not guard against empty string input
**File:** `types/agent.ts:93-99`
**Fix:** Added early return guard: `if (!tmuxName) { return { agentName: '', index: 0 } }`.

### NT-022: password/route.ts combined validation condition is hard to read
**File:** `services/governance-service.ts:113` (validation was moved here by SF-031 in an earlier pass)
**Fix:** Split `!password || typeof password !== 'string' || password.length < 6` into two separate checks with distinct error messages.

### Pre-existing test fix: team-api.test.ts chiefOfStaffId null vs undefined
**File:** `tests/team-api.test.ts:360`
**Fix:** Changed `expect(data.team.chiefOfStaffId).toBeUndefined()` to `.toBeNull()` to match SF-038's change (createTeam now defaults chiefOfStaffId to null).

## Document-Only Findings (No Code Fix)

### SF-002: use-governance-hook.test.ts tests standalone replicas
Already documented with `MF-027 KNOWN LIMITATION` block (lines 24-34) and TODO comments (lines 70-72). No additional code change needed. TODO for @testing-library/react adoption.

### SF-054: Commit claims "56 new tests" but actual count is 72
Commit-level documentation discrepancy (16 + 56 = 72, not 56). Not fixable in code. Noted for accuracy.

### NT-002: transfer-registry.test.ts uses fake timers but other timestamp tests do not
No action required per review. Style inconsistency observation only.

### NT-004: team-api.test.ts vi.spyOn on dynamic import is fragile but correct
No action required per review. Documentation observation only.

## False Finding

### NT-001: agent-auth.test.ts "unused beforeEach import"
**VERIFIED FALSE:** The `beforeEach` import IS used at line 23 of the file (`beforeEach(() => { vi.clearAllMocks() })`). The review finding was incorrect.

## Findings Not Applicable (No Change Needed per Review)

### NT-009: path import used only for path.isAbsolute
Review explicitly states "No change needed" -- `path.isAbsolute` is more correct than `startsWith('/')`.

## Test Results

868 tests passed, 0 failed (30 test files).
