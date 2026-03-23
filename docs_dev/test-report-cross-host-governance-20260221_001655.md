# Test Report: cross-host-governance-service.ts

## Summary
- **Function complexity**: Medium (429 lines, 5 exported + 2 private helpers)
- **Tests written**: 30
- **All passing**: YES (30/30)
- **Runtime**: 167ms

## Test Breakdown

| # | Function | Test | Status |
|---|----------|------|--------|
| 1 | submitCrossHostRequest | Rejects 401 for invalid password | PASS |
| 2 | submitCrossHostRequest | Rejects 404 for unknown requestedBy agent | PASS |
| 3 | submitCrossHostRequest | Rejects 403 for role mismatch (claims manager) | PASS |
| 4 | submitCrossHostRequest | Rejects 400 for self-targeting | PASS |
| 5 | submitCrossHostRequest | Rejects 404 for unknown targetHostId | PASS |
| 6 | submitCrossHostRequest | Creates local request on success (201) | PASS |
| 7 | submitCrossHostRequest | Sends HTTP POST to target host | PASS |
| 8 | submitCrossHostRequest | Tolerates HTTP failure to remote | PASS |
| 9 | receiveCrossHostRequest | Rejects 403 for unknown fromHostId | PASS |
| 10 | receiveCrossHostRequest | Rejects 400 for missing fields | PASS |
| 11 | receiveCrossHostRequest | Creates local record on success | PASS |
| 12 | receiveCrossHostRequest | Returns requestId on success | PASS |
| 13 | receiveCrossHostRequest | Handles duplicate request ID | PASS |
| 14 | approveCrossHostRequest | Rejects 401 for invalid password | PASS |
| 15 | approveCrossHostRequest | Returns 404 for unknown request | PASS |
| 16 | approveCrossHostRequest | sourceManager approverType | PASS |
| 17 | approveCrossHostRequest | targetManager approverType | PASS |
| 18 | approveCrossHostRequest | sourceCOS approverType | PASS |
| 19 | approveCrossHostRequest | Rejects 403 for non-manager/COS | PASS |
| 20 | approveCrossHostRequest | Triggers execution on status=executed | PASS |
| 21 | rejectCrossHostRequest | Rejects 401 for invalid password | PASS |
| 22 | rejectCrossHostRequest | Rejects 403 for non-manager/COS | PASS |
| 23 | rejectCrossHostRequest | Sets rejected with reason | PASS |
| 24 | rejectCrossHostRequest | Returns 404 for unknown request | PASS |
| 25 | rejectCrossHostRequest | Notifies source host via fetch | PASS |
| 26 | listCrossHostRequests | Returns all with no filter | PASS |
| 27 | listCrossHostRequests | Filters by status | PASS |
| 28 | listCrossHostRequests | Filters by hostId | PASS |
| 29 | performRequestExecution | add-to-team adds agent | PASS |
| 30 | performRequestExecution | remove-from-team removes agent | PASS |

## Mocking Strategy
- Only external dependencies mocked (governance, registries, hosts-config, fetch, file-lock)
- Internal service logic executes fully through real code paths
- Fire-and-forget fetch calls verified with 50ms settling time
