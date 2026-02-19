# Fix team-registry.test.ts
Generated: 2026-02-17

## Changes

1. **Separated makeTeam counter from uuid mock counter**: Added `makeTeamCounter` (line 61) so `makeTeam` no longer increments `uuidCounter`. Both counters reset in `beforeEach`.
2. **Added saveTeams write failure test**: New `describe('saveTeams')` block (lines 107-120) mocks `writeFileSync` to throw and asserts `saveTeams()` returns `false`.

## Test Results
22 tests, 22 passed, 0 failed.
