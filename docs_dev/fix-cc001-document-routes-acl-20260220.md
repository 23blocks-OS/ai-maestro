# Fix CC-001: Document routes bypass governance ACL

**Date:** 2026-02-20
**File:** `app/api/teams/[id]/documents/[docId]/route.ts`
**Issue:** All 3 handlers (GET, PUT, DELETE) never extracted `X-Agent-Id` from request headers, bypassing governance ACL for closed teams.

## Changes

1. **GET handler (line 6):** Changed `_request: NextRequest` to `request: NextRequest`. Added `const requestingAgentId = request.headers.get('X-Agent-Id') || undefined`. Passed as 3rd argument to `getTeamDocument(id, docId, requestingAgentId)`.

2. **PUT handler (line 24-25):** Added `const requestingAgentId = request.headers.get('X-Agent-Id') || undefined`. Spread into body: `updateTeamDocument(id, docId, { ...body, requestingAgentId })`.

3. **DELETE handler (line 40):** Changed `_request: NextRequest` to `request: NextRequest`. Added `const requestingAgentId = request.headers.get('X-Agent-Id') || undefined`. Passed as 3rd argument to `deleteTeamDocument(id, docId, requestingAgentId)`.

## Pattern matched

Matches the pattern used in `app/api/teams/[id]/route.ts` which already correctly extracts `X-Agent-Id` in all 3 handlers.

## Verification

Service functions already accept `requestingAgentId`:
- `getTeamDocument(teamId, docId, requestingAgentId?)` -- 3rd arg
- `updateTeamDocument(teamId, docId, params)` -- via `params.requestingAgentId`
- `deleteTeamDocument(teamId, docId, requestingAgentId?)` -- 3rd arg
