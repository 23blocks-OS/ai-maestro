# Fix: document-api.test.ts - Non-existent team tests for PUT and DELETE

Generated: 2026-02-17

## Task
Add tests for PUT and DELETE operations on documents of non-existent teams.

## Findings

The GET single-document endpoint checks `getTeam(id)` first and returns 404 with "Team not found" when the team does not exist. However, the PUT and DELETE handlers skip the team existence check entirely. They delegate directly to `updateDocument` / `deleteDocument`, which load an empty document list for the non-existent team and return 404 with "Document not found" instead.

This is an inconsistency: GET returns "Team not found", but PUT and DELETE return "Document not found" for the same non-existent team scenario.

## Tests Added

1. `PUT /api/teams/[id]/documents/[docId]` > `returns 404 with "Document not found" when team does not exist`
   - Documents that PUT does not validate team existence
   - Asserts status 404 and error message "Document not found"

2. `DELETE /api/teams/[id]/documents/[docId]` > `returns 404 with "Document not found" when team does not exist`
   - Documents that DELETE does not validate team existence
   - Asserts status 404 and error message "Document not found"

## Test Results

- Total: 19 tests
- Passed: 19
- Failed: 0

## File Modified

- `tests/document-api.test.ts` - Added 2 new test cases
