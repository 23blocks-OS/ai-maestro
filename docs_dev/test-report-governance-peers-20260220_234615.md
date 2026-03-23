# Test Report: governance-peers.ts

## Summary
- **File**: `lib/governance-peers.ts`
- **Test file**: `tests/governance-peers.test.ts`
- **Tests written**: 20 (all passing)
- **Duration**: 5ms (155ms total with setup)
- **Framework**: vitest 4.0.18

## Test Breakdown

| # | Function | Test | Status |
|---|----------|------|--------|
| 1 | loadPeerGovernance | returns null when no file exists | PASS |
| 2 | loadPeerGovernance | loads and returns valid peer state from disk | PASS |
| 3 | loadPeerGovernance | returns null when file contains corrupted JSON | PASS |
| 4 | savePeerGovernance | writes peer state to disk and can be read back | PASS |
| 5 | deletePeerGovernance | removes the peer state file from disk | PASS |
| 6 | getAllPeerGovernance | returns all non-expired peer states from disk | PASS |
| 7 | getAllPeerGovernance | filters out peer states whose TTL has expired | PASS |
| 8 | getAllPeerGovernance | skips files with corrupted JSON content | PASS |
| 9 | getAllPeerGovernance | filters out entries with unparseable lastSyncAt | PASS |
| 10 | isManagerOnAnyHost | returns true when agent is local manager | PASS |
| 11 | isManagerOnAnyHost | returns true when agent is manager on a peer host | PASS |
| 12 | isManagerOnAnyHost | returns false when agent is not manager anywhere | PASS |
| 13 | isChiefOfStaffOnAnyHost | returns true when agent is COS in a local team | PASS |
| 14 | isChiefOfStaffOnAnyHost | returns true when agent is COS in a peer team | PASS |
| 15 | getTeamFromAnyHost | finds a team in local teams (hostId = 'local') | PASS |
| 16 | getTeamFromAnyHost | finds a team on a peer host with correct hostId | PASS |
| 17 | getTeamFromAnyHost | returns null when team is not found anywhere | PASS |
| 18 | getPeerTeamsForAgent | returns peer teams that include the agentId | PASS |
| 19 | getPeerTeamsForAgent | returns empty array for empty agentId | PASS |
| 20 | getPeerTeamsForAgent | returns empty array when no peer teams contain agent | PASS |

## Mocking Strategy
- **fs** (external I/O): in-memory `fsStore` record, supports both named and default exports
- **@/lib/governance**: `isManager` mocked to control local governance answers
- **@/lib/team-registry**: `loadTeams` mocked to control local team answers
- All internal logic in governance-peers.ts executes unmocked (real code paths)

## Coverage Assessment
- All 8 exported functions tested
- TTL expiry logic verified with realistic timestamps
- Corrupted JSON edge case covered for both single-load and directory-scan paths
- Cross-host lookup functions tested for local-first fallback and peer iteration
- Effective coverage: ~90% of code paths
