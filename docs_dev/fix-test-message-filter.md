# Fix Test: message-filter.test.ts

## Task
Add test case: normal member sends message to COS (who is not a peer teammate in the same team) - should be allowed.

## Change Made
Added test `allows a normal member to message the COS of their team (COS is not a peer teammate)` to `/Users/emanuelesabetta/ai-maestro/tests/message-filter.test.ts`.

The test creates a closed team where the COS (`cos-alpha`) is set as `chiefOfStaffId` but is NOT included in `agentIds`. This means the COS is not a "peer teammate" — they don't appear in the team member list. A normal member (`member-a1`) sends a message to `cos-alpha`. The `canReachCOS` branch (step 5, line 101-105 of message-filter.ts) correctly allows this because it checks `senderTeams.some(team => team.chiefOfStaffId === recipientAgentId)`.

## Test Results
- 11 tests total, 11 passed, 0 failed
- File: tests/message-filter.test.ts
- Runner: vitest v4.0.18
- Duration: 143ms
