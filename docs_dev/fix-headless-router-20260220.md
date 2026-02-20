# Fix Report: headless-router.ts - 12 Issues Fixed
Generated: 2026-02-20T15:44:00Z

## Summary
Fixed all 12 issues from audit report `epcp-correctness-headless-router.md`.

## MUST-FIX (9 issues: CC-001 through CC-009)
Added missing `await` to 9 async teams-service calls that were passing unresolved Promises to `sendServiceResult()`:

| Issue | Line | Function | Status |
|-------|------|----------|--------|
| CC-001 | 1151 | `updateTeamTask` | FIXED |
| CC-002 | 1155 | `deleteTeamTask` | FIXED |
| CC-003 | 1164 | `createTeamTask` | FIXED |
| CC-004 | 1171 | `updateTeamDocument` | FIXED |
| CC-005 | 1174 | `deleteTeamDocument` | FIXED |
| CC-006 | 1183 | `createTeamDocument` | FIXED |
| CC-007 | 1192 | `updateTeamById` | FIXED |
| CC-008 | 1196 | `deleteTeamById` | FIXED |
| CC-009 | 1204 | `createNewTeam` | FIXED |

## SHOULD-FIX (3 issues: CC-010 through CC-012)
Added X-Agent-Id header extraction for 3 document routes that were missing governance ACL:

| Issue | Route | Change |
|-------|-------|--------|
| CC-010 | DELETE /api/teams/:id/documents/:docId | Added `requestingAgentId` extraction + pass as 3rd arg |
| CC-011 | PUT /api/teams/:id/documents/:docId | Added `requestingAgentId` extraction + inject into body |
| CC-012 | GET /api/teams/:id/documents/:docId | Added `requestingAgentId` extraction + pass as 3rd arg |

## Verification
- TypeScript: 0 errors in headless-router.ts (pre-existing errors in governance-service.ts are unrelated)
- File modified: `services/headless-router.ts`
