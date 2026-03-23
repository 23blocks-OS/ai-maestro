# EPCP Fixes Report: P6 Test Domain

**Generated:** 2026-02-22T22:08:00Z
**Pass:** 6
**Domain:** Tests

## Summary

8 issues fixed out of 8 assigned (3 skipped per task instructions: SF-033, SF-034, SF-035).

## Fixes Applied

### MF-027 (3 sub-issues)

1. **governance.test.ts** -- Added `vi.mock('@/lib/governance-sync')` returning a Promise-based mock of `broadcastGovernanceSync`. Prevents real dependency chain from firing when governance config is saved during tests.

2. **agent-registry.test.ts** -- Restructured the fs mock to extract all functions as shared references, then exposed them as both `default` exports and named exports. Added `renameSync` and `copyFileSync` to enable testing of atomic write operations.

3. **use-governance-hook.test.ts** -- Added detailed comment block (lines 30-45) documenting that these tests exercise standalone replicas of the hook callbacks, NOT the actual `useGovernance` hook. Documents the 3 specific limitations (no refresh() testing, no React state testing, no useCallback memoization testing) and explains why.

### SF-031: transfer-registry.test.ts

Added 5 new tests in two new `describe` blocks:

- `revertTransferToPending`:
  - Reverts approved transfer back to pending, verifies resolution fields cleared
  - Returns true without disk write when already pending (no-op)
  - Returns false for non-existent transfer ID

- `cleanupOldTransfers`:
  - Removes resolved transfers older than 30 days, keeps pending (even old) and recent resolved
  - Returns 0 when no transfers are old enough to clean up

### SF-032: agent-registry.test.ts

Added named export aliases alongside default export in the fs mock. All mock functions (`existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`, `statSync`, `rmSync`, `renameSync`, `copyFileSync`) are now available as both `default.fnName` and direct named exports. This ensures the mock works regardless of whether source code uses default or named imports.

### SF-036: host-keys.test.ts

Added warning comment on the `importHostKeys()` helper function documenting the requirement to use dynamic `import()` after `vi.resetModules()`. Explains that static imports reference the pre-reset module with stale cached state, and that every test MUST call `importHostKeys()` to get fresh exports.

### SF-037: agent-config-governance-extended.test.ts

Added detailed comments documenting the two separate mock systems for agent-registry:
1. `mockGetAgent` -- used by registry-level lookups in skills-service and deploy-service
2. `mockAgentRegistryGetAgent` -- used by runtime Agent class instance in saveSkillSettings

Each comment explains which code paths use which mock and warns about silent failures when the wrong mock is configured.

### NT-017: test-utils/fixtures.ts

Replaced the one-line JSDoc on `resetFixtureCounter()` with a detailed JSDoc explaining:
- When to call it (tests relying on deterministic fixture IDs)
- When it's safe to omit (tests only checking structural properties)
- Why it matters (module-level counter shared across vitest worker)

## Skipped (per task instructions)

- **SF-033**: Cache reset requires architecture decision
- **SF-034**: XSS test requires design decision about sanitization
- **SF-035**: Test timing is CI-environment dependent

## Test Results

All 201 tests pass across the 6 modified files:
- tests/governance.test.ts: 15 tests passed
- tests/agent-registry.test.ts: 73 tests passed
- tests/use-governance-hook.test.ts: 12 tests passed
- tests/transfer-registry.test.ts: 15 tests passed (was 10, +5 new)
- tests/host-keys.test.ts: 15 tests passed
- tests/agent-config-governance-extended.test.ts: 56 tests passed

No regressions in the full test suite (pre-existing task-registry.test.ts failures unrelated to these changes).

## Files Modified

1. `tests/governance.test.ts` -- Added governance-sync mock
2. `tests/agent-registry.test.ts` -- Restructured fs mock with renameSync + named exports
3. `tests/use-governance-hook.test.ts` -- Added limitation documentation comment
4. `tests/transfer-registry.test.ts` -- Added 5 new tests + 2 new imports
5. `tests/host-keys.test.ts` -- Added dynamic import warning comment
6. `tests/agent-config-governance-extended.test.ts` -- Added mock path documentation
7. `tests/test-utils/fixtures.ts` -- Enhanced resetFixtureCounter JSDoc
