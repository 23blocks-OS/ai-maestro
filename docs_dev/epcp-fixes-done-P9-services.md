# P9 Review Findings - Services Fixes

**Date:** 2026-02-26
**Branch:** feature/team-governance

## MUST-FIX (3)

### MF-001: sendCommand / sendAgentSessionCommand returns both data AND error
- **Files:** `services/sessions-service.ts:779-787`, `services/agents-core-service.ts:1182-1194`
- **Fix:** When session is not idle, return ONLY `{ error: 'Session is not idle', status: 409 }` without the `data` field. Removed the ambiguous dual data+error response pattern.

### MF-002: renameSession for cloud agents not atomic
- **File:** `services/sessions-service.ts:730-735`
- **Fix:** Write to temp file (`newAgentFilePath + '.tmp'`), then `fs.renameSync(tmp, final)`, then `fs.unlinkSync(old)`. This ensures the new file is fully written before the old one is deleted.

### MF-003: Conflicting agentId in persistSession
- **File:** `services/sessions-service.ts:620-627`
- **Fix:** Removed the first spread `...(agentId && { agentId })` since `registeredAgent.id` is the canonical source and was already overwriting it in the second spread.

## SHOULD-FIX (5)

### SF-006: Multiple handlers pass raw query as any
- **File:** `services/headless-router.ts:1182,1188-1189`
- **Fix:** Extracted and validated specific query parameters for `getMeetingMessages` (meetingId, participants, since) and `getMessages` (agent, id, action, box, limit, status, priority, from, to) instead of casting the entire query object as `any`.

### SF-007: readJsonBody returns {} for empty body
- **File:** `services/headless-router.ts:330`
- **Fix:** Changed `resolve({})` to `resolve(null)` for empty bodies, so callers can distinguish between "no body" and "empty object body".

### SF-008: Unreachable 'claude code' match
- **File:** `services/agents-core-service.ts:186`
- **Fix:** Removed redundant `|| program.includes('claude code')` since `program.includes('claude')` always matches first.

### SF-009: Divergent program resolution
- **File:** `services/agents-core-service.ts:185-199`
- **Fix:** Added `'openclaw'` case to `resolveStartCommand` to match the program list in sessions-service.ts.

### SF-010: GET /api/teams/[id]/tasks/[taskId] returns 405
- **Files:** `services/headless-router.ts:1498-1501`, `services/teams-service.ts` (new function)
- **Fix:** Created `getTeamTask(teamId, taskId, requestingAgentId)` in teams-service.ts and wired it into the headless-router GET handler with auth extraction.

### SF-013: parseInt without NaN check
- **File:** `services/headless-router.ts:1149`
- **Fix:** Added `if (limit !== undefined && isNaN(limit)) limit = 50` after parseInt to default to 50 on invalid input.

## NIT (4)

### NT-006: ServiceResult redundant re-exports
- **Files:** 26 service files + 1 consumer (plugin-builder-service.ts)
- **Fix:** Removed `export type { ServiceResult }` from all 26 service files. Updated `plugin-builder-service.ts` to import directly from `@/types/service`.

### NT-008: depth parameter accepted but not used
- **File:** `services/agents-graph-service.ts`
- **Fix:** Added JSDoc comment documenting `depth` as reserved for future use.

### NT-009: Non-null assertion on auth.agentId
- **File:** `services/amp-service.ts:1631`
- **Fix:** Added explicit `if (!auth.agentId)` guard returning 401 before using `auth.agentId`, removing the `!` non-null assertion.

### NT-010: Synchronous file read at module load
- **File:** `services/sessions-service.ts:85-89`
- **Fix:** Added comment documenting this as intentional — runs once at startup to cache version, async is unnecessary since the module must be fully initialized before request handlers run.

## Files Modified (30 total)

1. services/sessions-service.ts (MF-001, MF-002, MF-003, NT-006, NT-010)
2. services/agents-core-service.ts (MF-001, SF-008, SF-009, NT-006)
3. services/headless-router.ts (SF-006, SF-007, SF-010, SF-013)
4. services/teams-service.ts (SF-010, NT-006)
5. services/amp-service.ts (NT-009, NT-006)
6. services/agents-graph-service.ts (NT-008, NT-006)
7. services/plugin-builder-service.ts (NT-006 consumer fix)
8-30. 23 additional service files (NT-006 re-export removal)
