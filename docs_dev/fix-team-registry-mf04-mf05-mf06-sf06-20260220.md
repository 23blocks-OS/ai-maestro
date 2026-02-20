# Fix Report: team-registry.ts MF-04, MF-05, MF-06, SF-06
Generated: 2026-02-20T16:35:00Z

## Fixes Applied

### MF-04: saveTeams() silent data loss
- `saveTeams()` now throws on failure instead of returning `false`
- Return type changed from `boolean` to `void`
- Updated 2 callers (`governance-service.ts:400`, `transfers/resolve/route.ts:157`) to use try/catch
- Updated 2 test cases in `tests/team-registry.test.ts` to expect throw instead of false return

### MF-05: updateTeam() double-save inconsistency
- Moved G4 revocation logic BEFORE the `saveTeams()` call in `updateTeam()`
- Removed the second conditional `saveTeams()` call entirely
- Now there is a single `saveTeams(teams)` call that captures both the team update and any G4 open-team revocations atomically

### MF-06: G4 revocation skipped on type change to closed
- Changed condition from `if (updatedTeam.type === 'closed' && updates.agentIds)` to `if (updatedTeam.type === 'closed')`
- Now G4 revocation runs whenever the team is closed, regardless of whether `agentIds` was explicitly in the updates
- This catches the case where `{ type: 'closed' }` is sent without `agentIds`

### SF-06: validateTeamMutation skip on type change
- Changed `if (existingTeam?.agentIds.includes(agentId)) continue` to `if (existingTeam?.type === 'closed' && existingTeam.agentIds.includes(agentId)) continue`
- Existing members are now only skipped when the team is ALREADY closed
- When type changes from open to closed, existing members are re-checked for multi-closed-team conflicts

## Files Modified
- `lib/team-registry.ts` - All 4 fixes
- `services/governance-service.ts` - Updated saveTeams caller (try/catch)
- `app/api/governance/transfers/[id]/resolve/route.ts` - Updated saveTeams caller (try/catch)
- `tests/team-registry.test.ts` - Updated saveTeams test expectations

## Test Results
- `tests/team-registry.test.ts`: 24/24 passed
- `tests/validate-team-mutation.test.ts`: 18/18 passed
- `tests/transfer-registry.test.ts`: 9/9 passed
- `tests/governance.test.ts`: 13/13 passed
- Total: 64/64 passed
