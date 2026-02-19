# Fix governance.test.ts - Report
Generated: 2026-02-17

## Task
Add 3 missing test cases to `tests/governance.test.ts`.

## Tests Added

1. **`verifyPassword > returns false when no password has been set`** - Seeds governance with `passwordHash: null`, asserts `verifyPassword('anypassword')` returns `false`. Covers the early-return branch at line 68-69 of governance.ts.

2. **`isManager > returns false for empty string when no manager is set`** - Seeds governance with `managerId: null`, asserts `isManager('')` returns `false`. Verifies `null !== ''` edge case (strict equality prevents empty-string match).

3. **`isChiefOfStaffAnywhere > returns false when agent is COS only on open teams`** - Mocks `loadTeams` to return two open teams where the agent is COS on both, asserts `isChiefOfStaffAnywhere` returns `false`. Confirms the `team.type === 'closed'` filter excludes open-team COS designations.

## Test Results
- Total: 11 tests
- Passed: 11
- Failed: 0

## Files Modified
- `tests/governance.test.ts` - Added 3 new test cases (lines ~152, ~198, ~243)
