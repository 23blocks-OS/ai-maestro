# Test Report: governance-sync.ts (20260220_234523)

## Summary
- Function complexity: medium (4 exported functions, ~230 lines)
- Tests written: 15
- All 15 passing (6ms total)

## Test Breakdown

| # | Function | Test | Status |
|---|----------|------|--------|
| 1 | buildLocalGovernanceSnapshot | returns correct structure with summarized teams | PASS |
| 2 | buildLocalGovernanceSnapshot | resolves manager name from agent registry | PASS |
| 3 | buildLocalGovernanceSnapshot | returns null managerName when no manager set | PASS |
| 4 | broadcastGovernanceSync | sends POST to all peer hosts with full snapshot | PASS |
| 5 | broadcastGovernanceSync | skips broadcast when no peer hosts | PASS |
| 6 | broadcastGovernanceSync | handles HTTP error responses gracefully | PASS |
| 7 | broadcastGovernanceSync | handles network failures per-peer without blocking | PASS |
| 8 | broadcastGovernanceSync | catches unexpected errors in outer try-catch | PASS |
| 9 | handleGovernanceSyncMessage | saves peer governance state with correct fields | PASS |
| 10 | handleGovernanceSyncMessage | rejects sender mismatch | PASS |
| 11 | handleGovernanceSyncMessage | defaults to empty array when teams missing | PASS |
| 12 | handleGovernanceSyncMessage | handles null managerId/managerName | PASS |
| 13 | requestPeerSync | returns parsed GovernancePeerState on success | PASS |
| 14 | requestPeerSync | returns null on HTTP error | PASS |
| 15 | requestPeerSync | returns null on network error | PASS |

## Mocking Strategy
Only external dependencies mocked (fetch, hosts-config, governance, agent-registry, team-registry, governance-peers). All internal logic (summarizeTeams, resolveManagerName) executes for real.

## File
`/Users/emanuelesabetta/ai-maestro/tests/governance-sync.test.ts`
