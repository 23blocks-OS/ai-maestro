# EPCP Fix Report: P8 Services Domain

**Generated:** 2026-02-23T03:00:00Z
**Pass:** 8
**Domain:** services/

---

## Summary

| Severity | Assigned | Fixed | Skipped |
|----------|----------|-------|---------|
| MUST-FIX | 4 | 4 | 0 |
| SHOULD-FIX | 7 | 7 | 0 |
| NIT | 3 | 3 | 0 |
| **Total** | **14** | **14** | **0** |

---

## MUST-FIX

### MF-005: Missing null check for agentRegistry.getAgent() in agents-docs-service.ts
**File:** `services/agents-docs-service.ts` (3 locations: queryDocs, indexDocs, clearDocs)
**Fix:** Added `if (!agent) { return { error: 'Agent not found', status: 404 } }` after each `agentRegistry.getAgent()` call, before calling `.getDatabase()`.

### MF-006: Missing null check for agentRegistry.getAgent() in config-service.ts
**File:** `services/config-service.ts` (line ~779)
**Fix:** Added `if (!agent) { return { error: 'Agent not found', status: 404 } }` between `getAgent()` and `getDatabase()` calls.

### MF-007: CozoScript injection via unvalidated `limit`
**File:** `services/agents-docs-service.ts` (line ~121)
**Fix:** Replaced `const listLimit = limit || 50` with `const listLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 50)))` to force integer coercion and bound the value.

### MF-008: ToxicSkills claim not implemented
**File:** `services/agents-config-deploy-service.ts` (line ~162)
**Fix:** Added explicit `console.warn()` call that logs a clear warning each time a skill is deployed without a ToxicSkills scan. Clarified the TODO comment to state the scan is NOT implemented.

---

## SHOULD-FIX

### SF-033: Reachable agents cache duplicated between route and service
**Files:** `app/api/governance/reachable/route.ts`, `services/governance-service.ts`
**Fix:** Removed all cache logic and direct agent computation from the route. Route now delegates entirely to `governance-service.ts:getReachableAgents()`. Added max-size bound (1000 entries) to the service-level cache to prevent unbounded growth.

### SF-046: controlPlayback uses parseInt on non-numeric string
**File:** `services/agents-playback-service.ts` (line ~98)
**Fix:** Added `Number.isNaN(parsedIndex)` check after `parseInt()` to return a clear 400 error when `sessionId` is non-numeric, instead of silently always returning 404.

### SF-047: agents-chat-service reads entire JSONL without size limit
**File:** `services/agents-chat-service.ts` (line ~92)
**Fix:** Added `MAX_CONVERSATION_FILE_SIZE` constant (50MB) and a pre-read size check using the file stat. Returns 413 if file exceeds limit.

### SF-048: getConversationMessages uses sync file I/O in async function
**File:** `services/agents-chat-service.ts` (lines ~55-92)
**Fix:** Replaced `fs.existsSync`, `fs.readdirSync`, `fs.statSync`, and `fs.readFileSync` with async equivalents: `fsp.access`, `fsp.readdir`, `fsp.stat`, and `fsp.readFile`.

### SF-049: updateExistingMeeting casts status to any without validation
**File:** `services/messages-service.ts` (line ~537)
**Fix:** Added runtime validation of `updates.status` against `VALID_MEETING_STATUSES` array (`['active', 'ended']`). Returns 400 if status is invalid. Removed `as any` cast, replaced with proper typed cast.

### SF-050: agents-docker-service silently swallows agent registry errors
**File:** `services/agents-docker-service.ts` (lines ~238-239)
**Fix:** Changed from silent swallow to returning a 207 Multi-Status response with a `warning` field explaining that the container started but registry update failed, so the caller can retry or clean up.

### SF-051: agents-docker-service exposes githubToken as Docker env var in plaintext
**File:** `services/agents-docker-service.ts` (lines ~183-184)
**Fix:** GitHub token is now written to a temporary env file (mode 0600) and passed via `--env-file` instead of `-e GITHUB_TOKEN=...`. The temp file is cleaned up in a `finally` block after `docker run` completes.

---

## NIT

### NT-036: Extensive use of ServiceResult<any>
**Files:** Multiple service files
**Fix:** Added `// NT-036: TODO: Replace ServiceResult<any> with specific result types` comment to `agents-docs-service.ts` (matching existing comment in `agents-memory-service.ts`). This is a cross-cutting refactor tracked as a Phase 2 item.

### NT-037: agents-directory-service returns status 500 with data instead of error
**File:** `services/agents-directory-service.ts` (line ~82)
**Fix:** Changed `return { data: { found: false }, status: 500 }` to `return { error: 'Failed to lookup agent', status: 500 }` to match the error convention used by all other service methods.

### NT-038: parseConversationFile logs every line parse error at ERROR level
**File:** `services/config-service.ts` (lines ~730-731)
**Fix:** Replaced per-line `console.error()` calls with a counter. After the loop, a single `console.warn()` logs the count of malformed lines. Removed raw line content from log output to avoid exposing sensitive data.

---

## Files Modified

1. `services/agents-docs-service.ts` - MF-005 (3 null checks), MF-007 (limit coercion), NT-036 (TODO comment)
2. `services/config-service.ts` - MF-006 (null check), NT-038 (parse error logging)
3. `services/agents-config-deploy-service.ts` - MF-008 (ToxicSkills warning log)
4. `app/api/governance/reachable/route.ts` - SF-033 (delegate to service, remove duplicate cache)
5. `services/governance-service.ts` - SF-033 (add max-size bound to reachable cache)
6. `services/agents-playback-service.ts` - SF-046 (NaN check for parseInt)
7. `services/agents-chat-service.ts` - SF-047 (file size limit), SF-048 (async I/O)
8. `services/messages-service.ts` - SF-049 (meeting status validation)
9. `services/agents-docker-service.ts` - SF-050 (surface registry error), SF-051 (env file for token)
10. `services/agents-directory-service.ts` - NT-037 (error response format)

## Verification

- TypeScript compilation: No new errors introduced (verified via `npx tsc --noEmit`)
- All 14 assigned findings addressed
