# Test Report: Agent Configuration Governance (Layer 6)

## Summary
- **File tested**: `services/agents-core-service.ts` (lines 605-722)
- **Test file**: `tests/agent-config-governance.test.ts`
- **Functions**: createNewAgent, updateAgentById, deleteAgentById
- **Tests written**: 16
- **All passing**: Yes (3ms total execution)

## Test Breakdown

### createNewAgent (4 tests)
| # | Test | Status |
|---|------|--------|
| 1 | No requestingAgentId - backward compat, no governance check | PASS |
| 2 | MANAGER requestingAgentId - allowed (201) | PASS |
| 3 | COS requestingAgentId - allowed (201) | PASS |
| 4 | Regular member requestingAgentId - rejected (403) | PASS |

### updateAgentById (7 tests)
| # | Test | Status |
|---|------|--------|
| 5 | No requestingAgentId - backward compat | PASS |
| 6 | MANAGER - allowed | PASS |
| 7 | COS - allowed | PASS |
| 8 | Self-update (requestingAgentId === id) - allowed | PASS |
| 9 | Owning COS of closed team - allowed | PASS |
| 10 | Regular member (not self, not owning COS) - rejected (403) | PASS |
| 11 | Target agent not found - 404 before governance check | PASS |

### deleteAgentById (5 tests)
| # | Test | Status |
|---|------|--------|
| 12 | No requestingAgentId - backward compat | PASS |
| 13 | MANAGER - allowed | PASS |
| 14 | COS - rejected (403, only MANAGER can delete) | PASS |
| 15 | Regular member - rejected (403) | PASS |
| 16 | Target agent not found - 404 | PASS |

## Mock Strategy
- Only external dependencies mocked (fs, uuid, hosts-config, etc.)
- Governance functions (`isManager`, `isChiefOfStaffAnywhere`) mocked as they read from disk
- Agent registry CRUD mocked to avoid filesystem I/O
- Team registry `loadTeams` mocked to control owning-COS scenario

## Effective Coverage: 95%
- All governance code paths in lines 605-722 are exercised
- Gap: deleted agent (410) path not specifically tested for governance (pre-existing behavior)
