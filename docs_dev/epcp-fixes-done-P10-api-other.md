# EPCP P10 Fix Report: API Other Routes

**Generated:** 2026-02-27T00:15:00Z
**Pass:** 10
**Run ID:** c7f26c53
**Agent:** fix-api-other
**Scope:** 19 route files (config, conversations, domains, export, governance/transfers, help, hosts, marketplace, sessions/activity, teams, v1, webhooks)

---

## Findings Fixed: 19/19

### MUST-FIX (3 fixed)

| ID | File | Fix Applied |
|----|------|-------------|
| MF-002 | `app/api/conversations/[file]/messages/route.ts` | Pass decoded file to service instead of encoded (prevents double-decode path traversal). Added try-catch (SF-008) and `export const dynamic = 'force-dynamic'` (NT-007). |
| MF-003 | `app/api/webhooks/route.ts`, `app/api/webhooks/[id]/route.ts` | Added `authenticateAgent()` guard to POST (create) and DELETE endpoints, consistent with other mutating routes. Changed `Request` to `NextRequest`. |
| MF-004 | `app/api/webhooks/[id]/route.ts` | Added `isValidUuid(id)` validation to GET and DELETE handlers, consistent with every other `[id]` route. |

### SHOULD-FIX (10 fixed)

| ID | File | Fix Applied |
|----|------|-------------|
| SF-007 | `app/api/config/route.ts` | Wrapped GET handler in try-catch with 500 fallback. Removed stale `CC-P1-817` comment. |
| SF-008 | `app/api/conversations/[file]/messages/route.ts` | Added outer try-catch to catch `URIError` from malformed percent-encoded sequences. |
| SF-009 | `app/api/domains/[id]/route.ts` | Added outer try-catch to all three handlers (GET, PATCH, DELETE). Added `export const dynamic = 'force-dynamic'` (NT-007). |
| SF-010 | `app/api/domains/route.ts` | Added outer try-catch to both handlers (GET, POST). Added `export const dynamic = 'force-dynamic'` (NT-007). |
| SF-011 | `app/api/export/jobs/[jobId]/route.ts` | Added outer try-catch to both handlers (GET, DELETE). Added `export const dynamic = 'force-dynamic'` (NT-007). |
| SF-012 | `app/api/governance/transfers/route.ts` | Changed `auth.status || 401` to `auth.status ?? 401` for consistency with sibling resolve route. |
| SF-014 | `app/api/teams/[id]/documents/[docId]/route.ts` | Whitelisted fields `{ title, content, pinned, tags }` from body instead of spreading raw body. |
| SF-015 | `app/api/teams/route.ts` | Whitelisted fields `{ name, description, agentIds, type }` from body instead of spreading raw body. |
| SF-016 | `app/api/sessions/activity/update/route.ts` | Added regex validation `/^[a-zA-Z0-9_-]+$/` for `sessionName` format. |
| SF-017 | `app/api/marketplace/skills/[id]/route.ts` | Added validation: reject empty IDs, IDs > 200 chars, or IDs with control characters. |
| SF-019 | `app/api/hosts/health/route.ts` | Removed redundant `if (hostUrl)` wrapper after early return already guarantees non-empty. Cleaned up stale MF-prefixed comments. |

### NIT (6 fixed)

| ID | File | Fix Applied |
|----|------|-------------|
| NT-005 | `app/api/export/jobs/[jobId]/route.ts` | Renamed unused `request` to `_request` in GET and DELETE. |
| NT-006 | `app/api/governance/transfers/[id]/resolve/route.ts` | Updated comments on redundant null checks to clarify they are defensive guards for TypeScript narrowing. |
| NT-007 | `app/api/conversations/[file]/messages/route.ts`, `app/api/domains/[id]/route.ts`, `app/api/domains/route.ts`, `app/api/export/jobs/[jobId]/route.ts` | Added `export const dynamic = 'force-dynamic'` to 4 mutable route files. |
| NT-008 | `app/api/v1/info/route.ts` | Replaced `?? {} as AMPInfoResponse` with explicit `if (!result.data)` guard returning 500. |
| NT-009 | `app/api/v1/register/route.ts` | Replaced `(result.data ?? {})` with explicit `if (!result.data)` guard returning 500. |
| NT-010 | `app/api/v1/route/route.ts` | Replaced `(result.data ?? {})` with explicit `if (!result.data)` guard returning 500. |
| NT-011 | `app/api/teams/notify/route.ts` | Added validation: `agentIds` must be a non-empty array. |
| NT-012 | `app/api/help/agent/route.ts` | Added outer try-catch to all three handlers (POST, DELETE, GET). |

---

## Files Modified (19)

1. `app/api/config/route.ts`
2. `app/api/conversations/[file]/messages/route.ts`
3. `app/api/domains/[id]/route.ts`
4. `app/api/domains/route.ts`
5. `app/api/export/jobs/[jobId]/route.ts`
6. `app/api/governance/transfers/[id]/resolve/route.ts`
7. `app/api/governance/transfers/route.ts`
8. `app/api/help/agent/route.ts`
9. `app/api/hosts/health/route.ts`
10. `app/api/marketplace/skills/[id]/route.ts`
11. `app/api/sessions/activity/update/route.ts`
12. `app/api/teams/[id]/documents/[docId]/route.ts`
13. `app/api/teams/notify/route.ts`
14. `app/api/teams/route.ts`
15. `app/api/v1/info/route.ts`
16. `app/api/v1/register/route.ts`
17. `app/api/v1/route/route.ts`
18. `app/api/webhooks/[id]/route.ts`
19. `app/api/webhooks/route.ts`

## Notes

- Pre-existing TypeScript errors in `governance/transfers/[id]/resolve/route.ts` (lines 119, 147, 157) are about `fromTeam`/`toTeam` possibly undefined in `.find()` callbacks. These exist before and after changes and are not caused by this fix pass.
- For MF-002, the service-side fix (removing `decodeURIComponent` in `config-service.ts:787`) is outside this agent's scope. The route-side fix (passing decoded value) eliminates the double-decode attack vector.
