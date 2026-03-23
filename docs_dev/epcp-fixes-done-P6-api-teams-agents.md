# EPCP P6 Fixes: API Teams & Agents Domain

**Generated:** 2026-02-22T22:15:00Z
**Domain:** api-teams-agents
**Pass:** 6

## Summary

| Severity | Fixed | Skipped | Total |
|----------|-------|---------|-------|
| MUST-FIX | 3 | 0 | 3 |
| SHOULD-FIX | 9 | 0 | 9 |
| NIT | 3 | 1 | 4 |
| **Total** | **15** | **1** | **16** |

## Fixes Applied

### MUST-FIX

**MF-005: Missing UUID validation on document route path parameters**
- `app/api/teams/[id]/documents/[docId]/route.ts` - Added `isValidUuid()` checks for both `id` and `docId` at top of GET, PUT, DELETE handlers
- `app/api/teams/[id]/documents/route.ts` - Added `isValidUuid()` check for `id` at top of GET, POST handlers
- Both files now import from `@/lib/validation`

**MF-006: Unsafe cast of `body.blockedBy` without runtime validation**
- `app/api/teams/[id]/tasks/[taskId]/route.ts:38` - Added `Array.isArray(body.blockedBy)` check before use, returns 400 if not array. Removed `as string[]` cast.
- `app/api/teams/[id]/tasks/route.ts:62` - Same fix applied. Removed `as string[]` cast.

**MF-007: Missing UUID validation on meeting route path parameters**
- `app/api/meetings/[id]/route.ts` - Added `isValidUuid(id)` check at top of GET, PATCH, DELETE handlers. Imported from `@/lib/validation`.

### SHOULD-FIX

**SF-007: Metadata PATCH returns 400 for all caught errors**
- `app/api/agents/[id]/metadata/route.ts:53-55` - Catch block now differentiates: TypeError or messages containing "Invalid" return 400, everything else returns 500 with generic "Internal server error" message.

**SF-009: Agent ID not validated as UUID in most [id] routes**
- Added `isValidUuid(id)` check to ALL agent `[id]` routes that didn't already have it (22 files, ~70 handlers total):
  - `app/api/agents/[id]/route.ts` (GET, PATCH, DELETE)
  - `app/api/agents/[id]/wake/route.ts` (POST)
  - `app/api/agents/[id]/metrics/route.ts` (GET, PATCH)
  - `app/api/agents/[id]/session/route.ts` (POST, PATCH, GET, DELETE)
  - `app/api/agents/[id]/hibernate/route.ts` (POST)
  - `app/api/agents/[id]/memory/route.ts` (GET, POST)
  - `app/api/agents/[id]/memory/long-term/route.ts` (GET, DELETE, PATCH)
  - `app/api/agents/[id]/memory/consolidate/route.ts` (GET, POST, PATCH)
  - `app/api/agents/[id]/search/route.ts` (GET, POST)
  - `app/api/agents/[id]/subconscious/route.ts` (GET, POST)
  - `app/api/agents/[id]/export/route.ts` (GET, POST)
  - `app/api/agents/[id]/transfer/route.ts` (POST)
  - `app/api/agents/[id]/playback/route.ts` (GET, POST)
  - `app/api/agents/[id]/repos/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/chat/route.ts` (GET, POST)
  - `app/api/agents/[id]/docs/route.ts` (GET, POST, DELETE)
  - `app/api/agents/[id]/index-delta/route.ts` (POST)
  - `app/api/agents/[id]/database/route.ts` (GET, POST)
  - `app/api/agents/[id]/tracking/route.ts` (GET, POST)
  - `app/api/agents/[id]/messages/route.ts` (GET, POST)
  - `app/api/agents/[id]/messages/[messageId]/route.ts` (GET, PATCH, DELETE, POST)
  - `app/api/agents/[id]/amp/addresses/route.ts` (GET, POST)
  - `app/api/agents/[id]/amp/addresses/[address]/route.ts` (GET, PATCH, DELETE)
  - `app/api/agents/[id]/email/addresses/route.ts` (GET, POST)
  - `app/api/agents/[id]/email/addresses/[address]/route.ts` (GET, PATCH, DELETE)
  - `app/api/agents/[id]/metadata/route.ts` (GET, PATCH, DELETE)
- Routes that already had validation (skipped): `skills/route.ts`, `skills/settings/route.ts`, `config/deploy/route.ts`
- Graph routes also covered: `graph/query/route.ts`, `graph/db/route.ts`, `graph/code/route.ts`

**SF-010: Wake route lowercases program name**
- `app/api/agents/[id]/wake/route.ts:27` - Removed `.toLowerCase()` on program field. Case-sensitive filesystems need exact case.

**SF-011: Number(body.priority) passes NaN silently**
- `app/api/teams/[id]/tasks/[taskId]/route.ts:36` - Added `Number.isFinite()` check after `Number(body.priority)`, returns 400 if NaN
- `app/api/teams/[id]/tasks/route.ts:63` - Same fix applied

**SF-012: Notify route authenticates but doesn't pass identity to service**
- `app/api/teams/notify/route.ts` - Now passes `requestingAgentId: auth.agentId` to `notifyTeamAgents()` for audit trail

**SF-013: Meetings routes have no authentication**
- `app/api/meetings/route.ts` - Added `authenticateAgent` to POST handler
- `app/api/meetings/[id]/route.ts` - Added `authenticateAgent` to PATCH and DELETE handlers. Imported from `@/lib/agent-auth`.

**SF-014: Unsafe `as` cast for body.status in task update route**
- `app/api/teams/[id]/tasks/[taskId]/route.ts:35` - Added validation against `VALID_TASK_STATUSES` array (`backlog`, `pending`, `in_progress`, `review`, `completed`). Returns 400 if invalid. Removed unsafe `as TaskStatus` cast approach.

**SF-015: Double-strip defense-in-depth not documented**
- `app/api/teams/[id]/route.ts:57` - Added comment documenting the intentional defense-in-depth pattern where both route and service strip `type` and `chiefOfStaffId`.

### NIT

**NT-007: teams/names response shape implicit**
- `app/api/teams/names/route.ts` - Added inline comment documenting response shape `{ teamNames: string[], agentNames: string[] }` and its purpose.

**NT-009: Missing force-dynamic export**
- `app/api/teams/route.ts` - Added `export const dynamic = 'force-dynamic'`
- `app/api/meetings/route.ts` - Added `export const dynamic = 'force-dynamic'`

**NT-008: Standardize response pattern (SKIPPED)**
- Too broad / cosmetic. Would touch many files across the entire codebase, not scoped to this domain.

## TypeScript Verification

`npx tsc --noEmit` shows 8 pre-existing errors in test files only. Zero new errors introduced by these changes.

## Files Modified (30 files)

1. `app/api/teams/[id]/documents/[docId]/route.ts`
2. `app/api/teams/[id]/documents/route.ts`
3. `app/api/teams/[id]/tasks/[taskId]/route.ts`
4. `app/api/teams/[id]/tasks/route.ts`
5. `app/api/teams/[id]/route.ts`
6. `app/api/teams/notify/route.ts`
7. `app/api/teams/names/route.ts`
8. `app/api/teams/route.ts`
9. `app/api/meetings/[id]/route.ts`
10. `app/api/meetings/route.ts`
11. `app/api/agents/[id]/route.ts`
12. `app/api/agents/[id]/wake/route.ts`
13. `app/api/agents/[id]/metrics/route.ts`
14. `app/api/agents/[id]/metadata/route.ts`
15. `app/api/agents/[id]/session/route.ts`
16. `app/api/agents/[id]/hibernate/route.ts`
17. `app/api/agents/[id]/memory/route.ts`
18. `app/api/agents/[id]/memory/long-term/route.ts`
19. `app/api/agents/[id]/memory/consolidate/route.ts`
20. `app/api/agents/[id]/search/route.ts`
21. `app/api/agents/[id]/subconscious/route.ts`
22. `app/api/agents/[id]/export/route.ts`
23. `app/api/agents/[id]/transfer/route.ts`
24. `app/api/agents/[id]/playback/route.ts`
25. `app/api/agents/[id]/repos/route.ts`
26. `app/api/agents/[id]/chat/route.ts`
27. `app/api/agents/[id]/docs/route.ts`
28. `app/api/agents/[id]/index-delta/route.ts`
29. `app/api/agents/[id]/database/route.ts`
30. `app/api/agents/[id]/tracking/route.ts`
31. `app/api/agents/[id]/messages/route.ts`
32. `app/api/agents/[id]/messages/[messageId]/route.ts`
33. `app/api/agents/[id]/amp/addresses/route.ts`
34. `app/api/agents/[id]/amp/addresses/[address]/route.ts`
35. `app/api/agents/[id]/email/addresses/route.ts`
36. `app/api/agents/[id]/email/addresses/[address]/route.ts`
37. `app/api/agents/[id]/graph/query/route.ts`
38. `app/api/agents/[id]/graph/db/route.ts`
39. `app/api/agents/[id]/graph/code/route.ts`
