# EPCP P10 Fixes: API Agent Routes

**Generated:** 2026-02-27T00:15:00Z
**Pass:** 10 (Run ID: c7f26c53)
**Scope:** 11 files in app/api/agents/

---

## Findings Fixed: 12/12

### MUST-FIX (1/1)

| ID | File | Description | Fix Applied |
|----|------|-------------|-------------|
| MF-001 | metadata/route.ts | DELETE handler does not actually clear metadata (spread merge is no-op) | Read existing metadata keys, set each to `undefined` before calling `updateAgent`, bypassing the merge-via-spread behavior |

### SHOULD-FIX (7/7)

| ID | File | Description | Fix Applied |
|----|------|-------------|-------------|
| SF-001 | messages/route.ts, playback/route.ts | `new URL(request.url)` instead of `request.nextUrl.searchParams` | Switched to `request.nextUrl.searchParams` |
| SF-002 | playback/route.ts | `Request` type instead of `NextRequest` (GET and POST) | Changed both handlers to `NextRequest` |
| SF-003 | route.ts | `Request` type instead of `NextRequest` (GET, PATCH, DELETE) | Changed all three handlers to `NextRequest`, also switched DELETE to use `nextUrl.searchParams` |
| SF-004 | export/route.ts | `Request` type instead of `NextRequest` (GET and POST) | Changed both handlers to `NextRequest` |
| SF-005 | session/route.ts | POST handler uses `Request` instead of `NextRequest` | Changed to `NextRequest` |
| SF-006 | export/route.ts | X-Agent-Name header not sanitized for header injection | Added `.replace(/[\r\n]/g, '')` sanitization |
| SF-013 | health/route.ts | SSRF: health proxy allows requests to internal/cloud metadata URLs | Added private IP blocking (localhost, 127.0.0.1, ::1, 10.x, 192.168.x, 172.16-31.x, 169.254.x, fc00:, fd, fe80:, .local, .internal) |

### NIT (4/4)

| ID | File | Description | Fix Applied |
|----|------|-------------|-------------|
| NT-001 | consolidate/route.ts | Complex maxConversations parsing hard to read | Extracted reusable `parseIntParam()` helper function |
| NT-002 | search/route.ts | Multiple `searchParams.get()` calls for same param | Extracted `parseIntParam()` and `parseFloatParam()` helpers, eliminated redundant calls |
| NT-003 | memory/route.ts | `.catch(() => ({}))` silently swallows malformed JSON | Replaced with explicit `try/catch` with typed body variable |
| NT-004 | tracking/route.ts | `.catch(() => ({}))` silently swallows malformed JSON | Same fix as NT-003 |

### NT-044 Annotation Cleanup (all 11 files)

Stripped review-pass annotation prefixes (SF-009, MF-003, MF-002, SF-022, SF-052, SF-007, CC-P1-606, CC-P2-010, CC-P3-003, SF-001, SF-006, SF-013, NT-001, NT-002, NT-003, NT-004) from comments across all 11 assigned files, keeping explanatory text where meaningful.

---

## Files Modified

1. `app/api/agents/[id]/export/route.ts` -- SF-004, SF-006, NT-044
2. `app/api/agents/[id]/memory/consolidate/route.ts` -- NT-001, NT-044
3. `app/api/agents/[id]/memory/route.ts` -- NT-003, NT-044
4. `app/api/agents/[id]/messages/route.ts` -- SF-001, NT-044
5. `app/api/agents/[id]/metadata/route.ts` -- MF-001, NT-044
6. `app/api/agents/[id]/playback/route.ts` -- SF-001, SF-002, NT-044
7. `app/api/agents/[id]/route.ts` -- SF-003, NT-044
8. `app/api/agents/[id]/search/route.ts` -- NT-002, NT-044
9. `app/api/agents/[id]/session/route.ts` -- SF-005, NT-044
10. `app/api/agents/[id]/tracking/route.ts` -- NT-004, NT-044
11. `app/api/agents/health/route.ts` -- SF-013, NT-044
