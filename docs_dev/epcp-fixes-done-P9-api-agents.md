# P9 Review Fixes - API Agents Routes

**Date:** 2026-02-26
**Pass:** P9
**Scope:** Agent API route handlers

## MUST-FIX (4 findings, 8 handlers)

| ID | File | Fix |
|----|------|-----|
| MF-015 | `app/api/agents/directory/lookup/[name]/route.ts` | Added outer try-catch to GET handler |
| MF-016 | `app/api/agents/directory/route.ts` | Added outer try-catch to GET handler |
| MF-017 | `app/api/agents/directory/sync/route.ts` | Added outer try-catch to POST handler |
| MF-018 | `app/api/agents/startup/route.ts` | Added outer try-catch to POST and GET handlers |
| MF-018 | `app/api/agents/normalize-hosts/route.ts` | Added outer try-catch to GET and POST handlers |

## SHOULD-FIX (6 findings)

| ID | File | Fix |
|----|------|-----|
| SF-046 | `app/api/agents/email-index/route.ts` | Added try-catch to GET handler |
| SF-047 | `app/api/agents/[id]/amp/addresses/[address]/route.ts` | Added ADDRESS_PATTERN validation to GET/PATCH/DELETE |
| SF-047 | `app/api/agents/[id]/email/addresses/[address]/route.ts` | Added ADDRESS_PATTERN validation to GET/PATCH/DELETE |
| SF-048 | `app/api/agents/[id]/messages/[messageId]/route.ts` | Added isValidUuid(messageId) to GET/PATCH/DELETE/POST |
| SF-050 | `app/api/agents/[id]/search/route.ts` | Added NaN guards for bm25Weight and semanticWeight |
| SF-051 | `app/api/agents/by-name/[name]/route.ts` | Added ^[a-zA-Z0-9_-]+$ format validation for name |
| SF-052 | `app/api/agents/[id]/metadata/route.ts` | Added plain-object check, 64KB size limit, depth-5 nesting limit |

## NIT (2 findings, applied to touched routes only)

| ID | File | Fix |
|----|------|-----|
| NT-027 | `app/api/agents/email-index/route.ts` | Changed `new URL(request.url)` to `request.nextUrl.searchParams` |
| NT-027 | `app/api/agents/[id]/messages/[messageId]/route.ts` | Changed `new URL(request.url)` to `request.nextUrl.searchParams` |

NT-026 (unused first parameter type): All touched routes already use `NextRequest` or have no request parameter (startup, normalize-hosts). No changes needed.

## Files Modified (12 total)

1. `app/api/agents/directory/lookup/[name]/route.ts`
2. `app/api/agents/directory/route.ts`
3. `app/api/agents/directory/sync/route.ts`
4. `app/api/agents/startup/route.ts`
5. `app/api/agents/normalize-hosts/route.ts`
6. `app/api/agents/email-index/route.ts`
7. `app/api/agents/[id]/amp/addresses/[address]/route.ts`
8. `app/api/agents/[id]/email/addresses/[address]/route.ts`
9. `app/api/agents/[id]/messages/[messageId]/route.ts`
10. `app/api/agents/[id]/search/route.ts`
11. `app/api/agents/by-name/[name]/route.ts`
12. `app/api/agents/[id]/metadata/route.ts`
