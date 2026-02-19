# Fix team-api.test.ts - Missing Mocks

Generated: 2026-02-17

## Task
Add explicit mocks for `@/lib/team-acl`, `@/lib/governance`, and `@/lib/agent-registry` in the team API test file.

## Analysis

The test file imports route handlers from:
- `@/app/api/teams/route.ts` - imports `getManagerId` from governance, `loadAgents` from agent-registry
- `@/app/api/teams/[id]/route.ts` - imports `getManagerId` from governance, `checkTeamAccess` from team-acl

None of these three modules were mocked, meaning tests depended on real filesystem reads to `~/.aimaestro/governance.json` and `~/.aimaestro/agents/registry.json`.

## Changes Made

Added three `vi.mock()` blocks after the existing `file-lock` mock and before imports:

1. **`@/lib/governance`** - Mocks `getManagerId` (returns null), `isManager` (returns false), `loadGovernance` (returns empty config), `verifyPassword` (returns false)
2. **`@/lib/team-acl`** - Mocks `checkTeamAccess` (returns `{ allowed: true }`)
3. **`@/lib/agent-registry`** - Mocks `loadAgents` (returns empty array)

## Test Results

All 16 tests pass (9ms total execution).

| Suite | Tests | Status |
|-------|-------|--------|
| GET /api/teams | 2 | PASS |
| POST /api/teams | 5 | PASS |
| GET /api/teams/[id] | 2 | PASS |
| PUT /api/teams/[id] | 5 | PASS |
| DELETE /api/teams/[id] | 2 | PASS |
