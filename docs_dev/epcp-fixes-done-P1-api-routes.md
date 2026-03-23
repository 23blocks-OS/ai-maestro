# EPCP Fixes Done - Pass 1 - Domain: api-routes
Generated: 2026-02-22

## Issues Fixed

| ID | File | Fix | Status |
|----|------|-----|--------|
| SF-014 | app/api/agents/[id]/config/deploy/route.ts | Added `isValidUuid` import + UUID validation on `id` param at top of POST handler | DONE |
| SF-015 | app/api/agents/[id]/skills/route.ts | Added `isValidUuid` import + UUID validation in all 4 handlers (GET, PATCH, POST, DELETE) | DONE |
| SF-016 | app/api/agents/[id]/skills/settings/route.ts | Added `isValidUuid` import + UUID validation in both GET and PUT handlers | DONE |
| SF-017 | app/api/teams/[id]/chief-of-staff/route.ts | Changed rate limit key from global `'governance-cos-auth'` to per-team `` `governance-cos-auth:${id}` `` in checkRateLimit, recordFailure, and resetRateLimit calls | DONE |
| NT-012 | app/api/agents/[id]/skills/settings/route.ts | Removed `success: false` wrapper from all error responses (lines 22, 28, 43, 49, 55) to match skills/route.ts `{ error: ... }` pattern | DONE |
| NT-013 | app/api/agents/[id]/config/deploy/route.ts | Replaced `body.configuration \|\| body` with strict `body.configuration !== undefined ? body.configuration : body` + explanatory comment about two accepted payload shapes | DONE |
| NT-014 | app/api/teams/[id]/chief-of-staff/route.ts | Added comment explaining why separate check/record pattern is used instead of checkAndRecordAttempt | DONE |

## Files Modified
- `app/api/agents/[id]/config/deploy/route.ts` (SF-014, NT-013)
- `app/api/agents/[id]/skills/route.ts` (SF-015)
- `app/api/agents/[id]/skills/settings/route.ts` (SF-016, NT-012)
- `app/api/teams/[id]/chief-of-staff/route.ts` (SF-017, NT-014)
