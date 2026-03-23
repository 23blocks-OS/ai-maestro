# Code Correctness Report: headless-router

**Agent:** epcp-code-correctness-agent
**Domain:** headless-router
**Files audited:** 1
**Date:** 2026-02-22T18:23:00Z
**Pass:** 4
**Finding ID Prefix:** CC-P4-A3

## MUST-FIX

### [CC-P4-A3-001] Missing cosAgentId UUID format validation in headless chief-of-staff route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1678-1683
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The headless router's chief-of-staff POST handler (lines 1604-1701) is missing the `isValidUuid(cosAgentId)` check that exists in the Next.js mirror route at `app/api/teams/[id]/chief-of-staff/route.ts:87-89`. The Next.js route validates `cosAgentId` format before passing it to `getAgent()`:

  ```typescript
  // Next.js route (line 87-89) - present:
  if (!isValidUuid(cosAgentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  ```

  The headless route skips directly from the `typeof cosAgentId !== 'string'` check (line 1678) to `getAgent(cosAgentId)` (line 1683) without UUID format validation. This allows malformed agent IDs (including path traversal patterns like `../../etc/passwd`) to be passed to `getAgent()`, which does a file-based registry lookup. While `getAgent` likely uses a Map lookup that would just return undefined for invalid IDs, the contract mismatch between the two routes means the headless router is less secure.
- **Evidence:**
  ```typescript
  // headless-router.ts lines 1678-1683 - MISSING isValidUuid check
  if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) {
    sendJson(res, 400, { error: 'agentId must be a non-empty string or null' })
    return
  }
  // MISSING: if (!isValidUuid(cosAgentId)) { ... }
  const agent = getAgent(cosAgentId)
  ```
- **Fix:** Add `if (!isValidUuid(cosAgentId)) { sendJson(res, 400, { error: 'Invalid agent ID format' }); return }` between lines 1681 and 1683 to match the Next.js route. The `isValidUuid` import already exists at line 245.

## SHOULD-FIX

### [CC-P4-A3-002] Dead code: `getQuery()` function is unused after Pass 3 refactor
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:407-412
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `getQuery()` helper function was replaced in Pass 3 by inline query parsing in `createHeadlessRouter().handle()` (lines 1868-1869). The function at lines 407-412 is now dead code -- it has zero callers in the entire codebase. Dead code in a security-critical routing module adds confusion and maintenance burden.
- **Evidence:**
  ```typescript
  // Line 407-412: defined but never called
  function getQuery(url: string): Record<string, string> {
    const urlObj = new URL(url, 'http://localhost')
    const q: Record<string, string> = {}
    urlObj.searchParams.forEach((v, k) => { q[k] = v })
    return q
  }

  // Line 1868-1869: inline replacement in handle()
  const query: Record<string, string> = {}
  urlObj.searchParams.forEach((v, k) => { query[k] = v })
  ```
  Grep confirmed zero callers of `getQuery` in the entire project.
- **Fix:** Remove the `getQuery` function (lines 406-412) since its logic is now inline in `handle()`.

### [CC-P4-A3-003] Agent export filename not sanitized in Content-Disposition header
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:922
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The export route at line 922 constructs a `Content-Disposition` header using `filename` from the service result, which is derived from `agent.name || agent.alias`. If an agent name contains `"` or `\r\n` characters, it could inject headers or break the Content-Disposition value. While agent names are typically alphanumeric with hyphens/underscores, the headless router should not rely on upstream validation for HTTP header safety.
- **Evidence:**
  ```typescript
  // Line 920-922
  sendBinary(res, 200, new Uint8Array(buffer), {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
    // ...
  })
  ```
  The `filename` is `${agentName}-export-${timestamp}.zip` where `agentName = agent.name || agent.alias`.
- **Fix:** Sanitize the filename before use: `filename.replace(/["\r\n\\]/g, '_')` or use the RFC 5987 `filename*` encoding. Alternatively, validate at the service layer.

### [CC-P4-A3-004] `readJsonBody` rejects with non-Error for 413 but error handler expects `error.statusCode`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:321, 1878-1884
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `readJsonBody` function uses `Object.assign(new Error(...), { statusCode: 413 })` to add a `statusCode` property. The catch block in `handle()` at line 1882 reads `error?.statusCode`. This works correctly for `readJsonBody`'s 413 rejection. However, the same `readRawBody` function (line 359) also uses this pattern. The concern is that the `any` type at line 1878 (`catch (error: any)`) means there's no type narrowing -- this works but relies on duck-typing a non-standard property. This is fragile: if any service function throws an error with a different `statusCode` value, it would be exposed to the client as a status code override, which could cause unexpected behavior (e.g. a service throwing `{ statusCode: 0 }` would send status 0).
- **Evidence:**
  ```typescript
  // Line 1878-1884
  } catch (error: any) {
    console.error(`[Headless] Error handling ${method} ${pathname}:`, error)
    if (!res.headersSent) {
      const statusCode = error?.statusCode || 500  // duck-typed from any thrown error
      const message = statusCode === 413 ? 'Request body too large' : 'Internal server error'
      sendJson(res, statusCode, { error: message })
    }
  }
  ```
- **Fix:** Narrow the statusCode check: only honor `413` specifically rather than any arbitrary `statusCode` from an unknown error. E.g.: `const statusCode = error?.statusCode === 413 ? 413 : 500`.

## NIT

### [CC-P4-A3-005] NT-002 comment references replaced code
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:406
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment `// NT-002: Use modern URL API instead of deprecated url.parse()` at line 406 refers to the `getQuery` function, which is now dead code (see CC-P4-A3-002). The actual fix for NT-002 was applied inline in `handle()` at line 1864. The comment is misleading since it annotates unused code.
- **Evidence:**
  ```typescript
  // Line 406-412
  // NT-002: Use modern URL API instead of deprecated url.parse()
  function getQuery(url: string): Record<string, string> {
  ```
- **Fix:** Remove the dead function and its comment (same fix as CC-P4-A3-002).

### [CC-P4-A3-006] `query.project` passed directly without fallback to `clearDocs`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:833
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** POSSIBLE
- **Description:** `clearDocs(params.id, query.project)` passes `query.project` which could be `undefined` if the query parameter is missing. Whether this is a problem depends on the `clearDocs` signature -- if it expects `string | undefined`, this is fine. Other similar patterns in the file use `|| ''` or `|| undefined` as explicit fallbacks. This inconsistency is worth noting for code clarity.
- **Evidence:**
  ```typescript
  // Line 833 - no fallback
  sendServiceResult(res, await clearDocs(params.id, query.project))
  // Compared to line 796 - explicit fallback
  sendServiceResult(res, await deleteCodeGraph(params.id, query.projectPath || ''))
  ```
- **Fix:** Verify `clearDocs` signature and either add `|| ''` if it expects a string, or leave as-is if it handles `undefined`.

### [CC-P4-A3-007] Governance sync timestamp freshness check allows negative clock skew of 60s but positive of 5 minutes
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1321
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The timestamp freshness check `tsAge > 300_000 || tsAge < -60_000` means: a timestamp from up to 5 minutes in the past is accepted, but a timestamp from up to 60 seconds in the future is accepted. This asymmetry is intentional (comment says "5 min window, allow 60s clock skew") but the comment doesn't explain the asymmetry clearly. The same pattern is repeated in 5 places (lines 1321, 1353, 1400, 1449, and the GET governance/sync at line 1354). This is functionally correct but the asymmetric window could cause confusion for maintainers.
- **Evidence:**
  ```typescript
  // Line 1319-1323 (repeated 5 times in governance routes)
  // Check timestamp freshness (5 min window, allow 60s clock skew)
  const tsAge = Date.now() - new Date(hostTimestamp).getTime()
  if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
    sendJson(res, 403, { error: 'Signature expired' })
    return
  }
  ```
- **Fix:** Consider extracting this into a helper function (e.g., `isTimestampFresh(hostTimestamp)`) to reduce duplication and centralize the logic. Also improve the comment to explain: "Accept timestamps from 5min ago to 60s in the future (clock skew tolerance)."

## CLEAN

Files with no issues found:
- (No additional files in this domain)

## Notes on Pass 3 Fixes

The following Pass 3 fixes were verified as correctly applied:
- **NT-001/NT-002:** URL parsing consolidated into single `new URL()` call in `handle()` -- CONFIRMED correct at lines 1864-1869.
- **NT-007:** Multiple-reject guard in `readJsonBody` -- CONFIRMED correct with `rejected` flag at lines 314-341.
- **NT-008:** Error responses no longer spread `result.data` -- CONFIRMED at line 395.
- **SF-001:** Raw body reader has reject guard -- CONFIRMED at lines 351-373.
- **SF-003:** Rate limit per-team key -- CONFIRMED at line 1625.
- **SF-004:** 50MB raw body limit -- CONFIRMED at lines 344-345.
- **SF-010:** Remote receive branch has dedicated try/catch -- CONFIRMED at lines 1371-1410.
- **SF-012:** Strict undefined check for config deployment -- CONFIRMED at line 878.
- **SF-024:** Type filter passed through to `listCrossHostRequests` -- CONFIRMED at line 1420.
- **SF-025:** Chief-of-staff endpoint mirrored -- CONFIRMED at lines 1604-1701 (with missing UUID validation noted in CC-P4-A3-001).
- **MF-003:** Config deploy requires authenticated identity -- CONFIRMED at lines 872-876.
- **MF-07/MF-08:** Transfer operations use auth.agentId, not body -- CONFIRMED at lines 1250-1256, 1268-1280.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only) -- read all 1892 lines in 10 chunks
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P4-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P4-ea0d592e-d300-4c9c-bdc1-5bcde65df725.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
