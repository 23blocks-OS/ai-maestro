# Fix Report: teams-service.test.ts CC-001 and CC-004

**Date:** 2026-02-20T15:44:00Z
**File:** tests/services/teams-service.test.ts

## CC-001 (MUST-FIX): updateTeamDocument missing getTeam mock

Added `mockTeams.getTeam.mockReturnValue(makeTeam())` to all 5 tests in the `updateTeamDocument` describe block:
- "updates document successfully" (line ~759)
- "passes only provided fields" (line ~769)
- "passes pinned and tags when provided" (line ~777)
- "returns 404 when document not found" (line ~785) - now properly tests document-not-found after team IS found
- "returns 500 when updateDocument throws" (line ~793)

Without this fix, all 4 success tests were false positives returning 404 (team not found) instead of exercising the document update path.

## CC-004 (SHOULD-FIX): deleteTeamById closed-team governance tests

Added 3 new tests and imported `getManagerId` from `@/lib/governance`:

1. **"returns 400 when deleting closed team without requestingAgentId"** - Verifies governance requires agent identity for closed team deletion
2. **"returns 403 when unauthorized agent tries to delete closed team"** - Verifies non-MANAGER/non-COS agents are rejected
3. **"allows COS to delete their own closed team"** - Verifies COS authorization path returns 200

## Test Results

All 73 tests passing (70 original + 3 new).
