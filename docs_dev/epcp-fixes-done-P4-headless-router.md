# EPCP Fixes Report: Pass 4 - headless-router domain

**Generated:** 2026-02-22T18:45:00Z
**File:** services/headless-router.ts
**Findings fixed:** 6/6

---

## Fixes Applied

### MF-003 (MUST-FIX): Missing isValidUuid check in chief-of-staff POST handler
**Lines:** 1680-1684 (after edit)
**Change:** Added `isValidUuid(cosAgentId)` check between the `typeof` check and `getAgent()` call, returning 400 with "Invalid agent ID format" on failure. Mirrors the Next.js route at `app/api/teams/[id]/chief-of-staff/route.ts:87-89`. The `isValidUuid` import already existed at line 245.

### SF-013 (SHOULD-FIX): Removed dead getQuery() function
**Lines:** 406-412 (removed)
**Change:** Deleted the unused `getQuery()` function and its stale `// NT-002` comment. The function was replaced in Pass 3 by inline query parsing at lines 1868-1872 in `createHeadlessRouter().handle()`.

### SF-014 (SHOULD-FIX): Sanitized export filename in Content-Disposition header
**Lines:** 913-914 (after edit)
**Change:** Added `filename.replace(/["\r\n\\]/g, '_')` to sanitize the filename before embedding in the Content-Disposition header, preventing header injection via double quotes, newlines, or backslashes in agent names.

### SF-015 (SHOULD-FIX): Narrowed statusCode check to only honor 413
**Lines:** 1884-1885 (after edit)
**Change:** Changed `error?.statusCode || 500` to `error?.statusCode === 413 ? 413 : 500`. This prevents arbitrary status code injection from any thrown error object -- only 413 (from readJsonBody size limit) is honored; everything else maps to 500.

### NT-010 (NIT): Added fallback for query.project in clearDocs call
**Lines:** 825-826 (after edit)
**Change:** Added `|| ''` fallback: `clearDocs(params.id, query.project || '')`. While `clearDocs` accepts `projectPath?: string` (undefined is valid), the explicit fallback aligns with patterns used elsewhere and ensures consistent behavior.

### NT-011 (NIT): Added comment explaining asymmetric timestamp freshness window
**Lines:** 1314-1316 (after edit)
**Change:** Replaced terse comment with explanation of why the window is asymmetric: 5 min past (300s) tolerates network latency/processing delays, while 60s future guards against clock skew without accepting pre-dated replay attacks. Added note that this pattern is repeated across all governance sync endpoints.

---

## Verification

All edits made via targeted Read+Edit. No scripts used. Each change verified by re-reading the affected lines after edit.
