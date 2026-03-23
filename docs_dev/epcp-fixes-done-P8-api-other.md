# EPCP P8 Fixes: api-other routes domain

**Generated:** 2026-02-23T04:00:00Z
**Pass:** 8
**Domain:** API routes (hosts, meetings, organization, agents/health, agents/search, agents/consolidate, agents/import, teams/chief-of-staff, teams/notify)

## Summary

11/11 findings fixed across 9 files.

## Fixes Applied

### MF-001: SSRF allowlist checks hostname only, not port
**File:** `app/api/hosts/health/route.ts`
**Fix:** Changed comparison from `parsed.hostname` to `parsed.origin` (which includes protocol+hostname+port). This prevents attackers from reaching internal services (Redis :6379, Postgres :5432) on known hosts by crafting requests to different ports. Bare hostname aliases still use hostname match since they carry no port information.

### SF-009: `result.data ?? { error }` pattern in meetings/[id] routes
**File:** `app/api/meetings/[id]/route.ts`
**Status:** Already fixed by another agent. GET/PATCH/DELETE all use explicit `if (result.error)` guard pattern. SF-014 (auth on GET) was also already applied.

### SF-010: Same `result.data ?? { error }` pattern in meetings list/create
**File:** `app/api/meetings/route.ts`
**Fix:** Replaced `result.data ?? { error: result.error }` with explicit `if (result.error)` branching in both GET (listMeetings) and POST (createNewMeeting) handlers.

### SF-011: Same `result.data ?? { error }` pattern in organization POST
**File:** `app/api/organization/route.ts`
**Fix:** Replaced `result.data ?? { error: result.error }` with explicit `if (result.error)` branching in POST handler.

### SF-013: hosts/identity GET does not check for error in result
**File:** `app/api/hosts/identity/route.ts`
**Fix:** Added standard `if (result.error)` guard before returning `result.data`.

### SF-015: SSRF risk in health proxy -- no URL validation before fetching
**File:** `app/api/agents/health/route.ts`
**Fix:** Added URL scheme validation after the string check. Parses the URL with `new URL()`, rejects if protocol is not `http:` or `https:`. Catches invalid URLs and returns 400.

### SF-016: minScore=0 silently treated as undefined in search route
**File:** `app/api/agents/[id]/search/route.ts`
**Fix:** Replaced `parseFloat(...) || undefined` with `Number.isNaN(parseFloat(...)) ? undefined : parseFloat(...)`. This preserves valid zero values for minScore.

### SF-017: parseInt fallback `|| undefined` drops valid 0 for limit/startTs/endTs
**File:** `app/api/agents/[id]/search/route.ts`
**Fix:** Same NaN-check pattern applied to `limit`, `startTs`, and `endTs` parameters. `parseInt(..., 10) || undefined` replaced with `Number.isNaN(parseInt(..., 10)) ? undefined : parseInt(..., 10)`.

### SF-018: maxConversations=0 silently becomes undefined in consolidate route
**File:** `app/api/agents/[id]/memory/consolidate/route.ts`
**Fix:** Same NaN-check pattern applied. `parseInt(..., 10) || undefined` replaced with `Number.isNaN(parseInt(..., 10)) ? undefined : parseInt(..., 10)`.

### NT-008: Missing `dynamic = 'force-dynamic'` on chief-of-staff, notify routes
**Files:** `app/api/teams/[id]/chief-of-staff/route.ts`, `app/api/teams/notify/route.ts`
**Fix:** Added `export const dynamic = 'force-dynamic'` to both files for consistency with other POST-only routes in the project.

### NT-014: import route uses `result.status || 500` fallback uniquely
**File:** `app/api/agents/import/route.ts`
**Fix:** Removed the `|| 500` fallback, making it consistent with all other routes that use `result.status` directly.

## Files Modified

| File | Findings Fixed |
|------|---------------|
| `app/api/hosts/health/route.ts` | MF-001 |
| `app/api/meetings/[id]/route.ts` | SF-009 (already fixed) |
| `app/api/meetings/route.ts` | SF-010 |
| `app/api/organization/route.ts` | SF-011 |
| `app/api/hosts/identity/route.ts` | SF-013 |
| `app/api/agents/health/route.ts` | SF-015 |
| `app/api/agents/[id]/search/route.ts` | SF-016, SF-017 |
| `app/api/agents/[id]/memory/consolidate/route.ts` | SF-018 |
| `app/api/teams/[id]/chief-of-staff/route.ts` | NT-008 |
| `app/api/teams/notify/route.ts` | NT-008 |
| `app/api/agents/import/route.ts` | NT-014 |
