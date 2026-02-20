# Step 6 Merge Commit Report
Generated: 2026-02-20T05:45:00Z

## Summary
Completed all 8 sub-tasks of Step 6 for the origin/main merge into feature/team-governance.

## Sub-task Results

| # | Task | Status | Details |
|---|------|--------|---------|
| 1 | Stage files | DONE | Staged services/, routes, lib/, tests/ |
| 2 | Run tests | DONE | 80 failures across 5 files |
| 3 | Fix test failures | DONE | 572/572 pass across 18 files |
| 4 | Run build | DONE | Clean pass |
| 5 | Fix build failures | DONE | None needed |
| 6 | Version bump | DONE | 0.25.0 via bump-version.sh |
| 7 | Commit | DONE | 0f0322c |
| 8 | Verify | DONE | git log confirms merge commit |

## Test Fixes Applied

### Route files (6 files) - Added `await` for async service calls
- app/api/teams/route.ts
- app/api/teams/[id]/route.ts (also added CC-005 stripping of type/chiefOfStaffId)
- app/api/teams/[id]/documents/route.ts
- app/api/teams/[id]/documents/[docId]/route.ts
- app/api/teams/[id]/tasks/route.ts
- app/api/teams/[id]/tasks/[taskId]/route.ts

### Service file (1 file) - Added team existence check
- services/teams-service.ts: updateTeamDocument now checks team exists before document update

### Test files (5 files) - Updated for governance integration
- tests/services/teams-service.test.ts: Added MockTeamValidationException via vi.hoisted(), governance/validation/team-acl/agent-registry mocks, async/await conversion, mockResolvedValue/mockRejectedValue
- tests/document-api.test.ts: Added governance/validation/team-acl/agent-registry mocks
- tests/message-filter.test.ts: Updated G1 test (COS can message open-world agents), added validation mock
- tests/validate-team-mutation.test.ts: Updated G5 test (auto-downgrade), G2 tests (COS limited to 1 closed team)
- tests/team-api.test.ts: Updated error message expectations, fixed getManagerId vs isManager mock

## Commit
```
0f0322c Merge origin/main (v0.24.9) service layer + governance integration (v0.25.0)
```

164 files changed, 21292 insertions(+), 14701 deletions(-)
