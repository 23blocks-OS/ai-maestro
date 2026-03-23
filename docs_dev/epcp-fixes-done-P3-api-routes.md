# P3 API Route Fixes Report

**Date:** 2026-02-22
**Pass:** 3
**Files modified:** 4

## SF-007: Local POST submission has no field validation
**File:** `app/api/v1/governance/requests/route.ts` lines 67-79
**Fix:** Added validation for `type`, `password`, `targetHostId`, `requestedBy` before calling `submitCrossHostRequest(body)`. Each field checked for presence and string type. Returns 400 with specific error message.

## SF-008: GET handler doesn't validate hostId or agentId format
**File:** `app/api/v1/governance/requests/route.ts` lines 122-132
**Fix:** Added `isValidUuid()` check for `agentId` (which is a UUID). For `hostId`, which is a hostname string (e.g. "macbook-pro"), added hostname regex validation (`/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/`). Imported `isValidUuid` from `@/lib/validation`. Returns 400 for invalid formats.

## SF-009: Skill settings/skills PUT/PATCH/POST/DELETE allows unauthenticated writes (auth is soft)
**File:** `app/api/agents/[id]/skills/settings/route.ts` PUT handler (line 52-62)
**File:** `app/api/agents/[id]/skills/route.ts` PATCH handler (line 55-65), POST handler (line 94-104), DELETE handler (line 136-146)
**Fix:** In all 4 handlers, replaced `auth.error ? null : auth.agentId` pattern with explicit check: if `Authorization` or `X-Agent-Id` header is present, authentication is validated and 401 returned on failure. If neither header present, `requestingAgentId` stays null (Phase 1 web UI compatibility).

## NT-008: Config deploy route leaks error details in 500 response
**File:** `app/api/agents/[id]/config/deploy/route.ts` line 48
**Fix:** Removed `details` field from 500 response. `console.error` still logs full error server-side.
**Bonus:** Also removed `details` field from all 4 catch blocks in `app/api/agents/[id]/skills/route.ts` (GET, PATCH, POST, DELETE) which had the same leak pattern.

## Summary
- **4/4 review findings fixed** (SF-007, SF-008, SF-009, NT-008)
- SF-009 applied to 4 handlers across 2 files
- NT-008 pattern also cleaned from skills route (4 additional catch blocks)
