# Test Report: validateTeamMutation & sanitizeTeamName

## Summary
- Function complexity: simple (sanitizeTeamName ~5 LOC), medium (validateTeamMutation ~120 LOC)
- Tests written: 15 (3 sanitize + 12 validate)
- All 15 passing in 2ms

## Test File
`/Users/emanuelesabetta/ai-maestro/tests/validate-team-mutation.test.ts`

## Tests

| # | Function | Scenario | Result |
|---|----------|----------|--------|
| 1 | sanitizeTeamName | strips control chars and trims | PASS |
| 2 | sanitizeTeamName | collapses multiple spaces | PASS |
| 3 | sanitizeTeamName | empty for whitespace-only | PASS |
| 4 | validateTeamMutation | rejects name < 4 chars | PASS |
| 5 | validateTeamMutation | rejects name > 64 chars | PASS |
| 6 | validateTeamMutation | rejects name not starting with letter/digit | PASS |
| 7 | validateTeamMutation | rejects invalid characters | PASS |
| 8 | validateTeamMutation | rejects duplicate name (case-insensitive) | PASS |
| 9 | validateTeamMutation | rejects agent name collision | PASS |
| 10 | validateTeamMutation | rejects invalid team type | PASS |
| 11 | validateTeamMutation | rejects closed team without COS | PASS |
| 12 | validateTeamMutation | rejects COS on open team | PASS |
| 13 | validateTeamMutation | auto-adds COS to agentIds | PASS |
| 14 | validateTeamMutation | rejects normal agent in multiple closed teams | PASS |
| 15 | validateTeamMutation | allows MANAGER in multiple closed teams | PASS |

## Quality
- No mocking of functions under test (pure functions tested directly)
- Only module-level imports mocked (fs, uuid, file-lock)
- Realistic data structures matching Team type
- Each test exercises one specific code path
