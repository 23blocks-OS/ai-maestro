# EPCP Fix Report: P6 Domain api-other

**Generated:** 2026-02-22
**Pass:** 6
**Domain:** Miscellaneous API routes

## Summary

| Status | Count |
|--------|-------|
| Fixed | 12 |
| Skipped | 1 (NT-001: too broad, cross-cutting) |
| **Total assigned** | 13 |

## Fixes Applied

### MF-001: SSRF allowlist (MUST-FIX)
**File:** `app/api/hosts/health/route.ts`
**Fix:** Replaced bypassable IP blocklist with allowlist approach. Now only permits health checks to hosts registered in `hosts.json` by comparing the request hostname against each known host's URL and aliases. Returns 403 if the host is not in the allowlist. Imported `getHosts` from `@/lib/hosts-config`.

### MF-002: authenticateAgent on PATCH/DELETE (MUST-FIX)
**File:** `app/api/messages/route.ts`
**Fix:** Added `authenticateAgent()` check to both PATCH and DELETE handlers, matching the pattern already used in the POST handler. The `authenticateAgent` import was already present. Returns 401 if auth fails.

### SF-001: PluginPushConfig field validation (SHOULD-FIX)
**File:** `app/api/plugin-builder/push/route.ts`
**Fix:** Removed the unsafe `as PluginPushConfig` cast. Added explicit runtime validation for all required fields: `forkUrl`, `manifest.name`, `manifest.version`, `manifest.output`, `manifest.plugin`, `manifest.sources` (array check), and optional `branch` (string check). After validation passes, assigns to a typed `config: PluginPushConfig` variable.

### SF-002: meetingId validation (SHOULD-FIX)
**File:** `app/api/messages/meeting/route.ts`
**Fix:** Added validation that `meetingId` query parameter is provided before calling `getMeetingMessages()`. Returns 400 if missing. Also fixed the `??` response pattern to use standard `if (result.error)` check.

### SF-003: status value validation (SHOULD-FIX)
**File:** `app/api/sessions/activity/update/route.ts`
**Fix:** Added validation of `status` against known values: `['active', 'idle', 'busy', 'offline', 'error', 'waiting', 'stopped']`. Returns 400 with descriptive error if an unknown status is provided.

### SF-004: workingDirectory absolute path validation (SHOULD-FIX)
**File:** `app/api/sessions/create/route.ts`
**Fix:** Added `path.isAbsolute()` check for `workingDirectory` when provided. Returns 400 if the path is not absolute. Added `import path from 'path'`.

### SF-005: docker info error check (SHOULD-FIX)
**File:** `app/api/docker/info/route.ts`
**Fix:** Added the standard `if (result.error)` guard before returning data, matching the pattern used in all other routes.

### SF-006: body.ref validation (SHOULD-FIX)
**File:** `app/api/plugin-builder/scan-repo/route.ts`
**Fix:** Added validation that `body.ref` is either `undefined` or a string. Returns 400 if it's any other type.

### NT-002: Standard error pattern (NIT) -- 2 files
**File:** `app/api/messages/route.ts` (GET, POST, PATCH, DELETE)
**File:** `app/api/messages/forward/route.ts` (POST)
**Fix:** Replaced all `result.data ?? { error: result.error }` patterns with the standard `if (result.error) { return error } return data` two-branch pattern. The `??` operator only triggers on null/undefined, so if `result.data` is `{}` or `false`, errors would be hidden.

### NT-003: Params await pattern (NIT)
**File:** `app/api/sessions/[id]/rename/route.ts`
**Fix:** Replaced the tuple destructuring `const [{ newName }, { id: oldName }] = [jsonBody, await params]` with the standard two-line pattern used elsewhere in the codebase.

### NT-004: Deprecation removal target (NIT) -- 3 files
**File:** `app/api/sessions/[id]/rename/route.ts`
**File:** `app/api/sessions/[id]/command/route.ts`
**File:** `app/api/sessions/[id]/route.ts`
**Fix:** Added `Removal target: v0.28.0` to the `@deprecated` JSDoc comment in all three deprecated session routes.

## Skipped

### NT-001: Inconsistent response shape
**Reason:** Task instructions say "Skip (too broad, cross-cutting)."

## Files Modified

1. `app/api/hosts/health/route.ts` - MF-001
2. `app/api/messages/route.ts` - MF-002, NT-002
3. `app/api/plugin-builder/push/route.ts` - SF-001
4. `app/api/messages/meeting/route.ts` - SF-002
5. `app/api/sessions/activity/update/route.ts` - SF-003
6. `app/api/sessions/create/route.ts` - SF-004
7. `app/api/docker/info/route.ts` - SF-005
8. `app/api/plugin-builder/scan-repo/route.ts` - SF-006
9. `app/api/messages/forward/route.ts` - NT-002
10. `app/api/sessions/[id]/rename/route.ts` - NT-003, NT-004
11. `app/api/sessions/[id]/command/route.ts` - NT-004
12. `app/api/sessions/[id]/route.ts` - NT-004
