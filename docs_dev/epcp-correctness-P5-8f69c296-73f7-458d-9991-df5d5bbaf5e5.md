# Code Correctness Report: headless-router

**Agent:** epcp-code-correctness-agent
**Domain:** headless-router
**Files audited:** 1
**Date:** 2026-02-22T18:52:00Z
**Pass:** 5
**Finding ID Prefix:** CC-P5-A3

## MUST-FIX

### [CC-P5-A3-001] Route ordering: DELETE /api/sessions/restore shadowed by DELETE /api/sessions/([^/]+)
- **File:** services/headless-router.ts:519 and :542
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The parameterized route `DELETE /api/sessions/([^/]+)$` at line 519 appears before the static route `DELETE /api/sessions/restore$` at line 542. Because the router uses a linear regex scan (first match wins), a `DELETE /api/sessions/restore` request will match the parameterized route first, calling `deleteSession("restore")` instead of the intended `deletePersistedSession(query.sessionId)`. In Next.js App Router, static routes automatically take precedence over dynamic `[param]` routes, so this discrepancy means the headless mode behaves differently from full mode.
- **Evidence:**
  ```typescript
  // Line 519 — matches first for DELETE /api/sessions/restore
  { method: 'DELETE', pattern: /^\/api\/sessions\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await deleteSession(params.id))
  }},
  // ...
  // Line 542 — intended handler, never reached for "restore"
  { method: 'DELETE', pattern: /^\/api\/sessions\/restore$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, deletePersistedSession(query.sessionId || ''))
  }},
  ```
- **Fix:** Move the three `restore` routes (GET/POST/DELETE at lines 534-544) and the `activity` routes (GET at line 545, POST at line 553) to appear **before** the parameterized `DELETE /api/sessions/([^/]+)$` at line 519. Static sub-paths must precede their parameterized siblings in a linear-scan router.

## SHOULD-FIX

### [CC-P5-A3-002] handleGovernanceSyncMessage return value ignored — always reports success
- **File:** services/headless-router.ts:1322-1323
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The POST `/api/v1/governance/sync` handler calls `handleGovernanceSyncMessage(body.fromHostId, body)` but ignores its boolean return value, always responding with `{ ok: true }`. The function returns `false` for invalid payloads (missing/malformed `payload`, `managerId`, `managerName`, or `teams` fields), so the peer host would believe its sync succeeded when the data was actually rejected. The router validates `fromHostId` and `type` but not the payload structure; those deeper validations live inside `handleGovernanceSyncMessage` (governance-sync.ts:186-202).
- **Evidence:**
  ```typescript
  // Line 1322-1323
  handleGovernanceSyncMessage(body.fromHostId, body)
  sendJson(res, 200, { ok: true })
  ```
  ```typescript
  // governance-sync.ts:186-188 — can return false for bad payload
  if (!payload || typeof payload !== 'object') {
    console.error(`[governance-sync] Invalid payload from ${fromHostId}: payload is not an object`)
    return false
  }
  ```
- **Fix:** Check the return value and send an error response when `false`:
  ```typescript
  const accepted = handleGovernanceSyncMessage(body.fromHostId, body)
  if (!accepted) {
    sendJson(res, 400, { error: 'Invalid governance sync payload' })
    return
  }
  sendJson(res, 200, { ok: true })
  ```

## NIT

### [CC-P5-A3-003] Duplicated host signature verification boilerplate across 4 governance endpoints
- **File:** services/headless-router.ts:1294-1321, 1327-1354, 1370-1401, 1436-1449
- **Severity:** NIT
- **Category:** logic (maintainability)
- **Confidence:** CONFIRMED
- **Description:** The host signature verification pattern (read X-Host-Signature/X-Host-Timestamp/X-Host-Id headers, look up host, verify public key exists, verify signature, check timestamp freshness) is repeated four times with minor variations (different `signedData` prefixes like `gov-sync`, `gov-sync-read`, `gov-request`). This duplication increases the risk of inconsistencies during future edits. The asymmetric timestamp window comment (NT-011) is applied in one place but not all four, despite all four using identical logic.
- **Evidence:** Each block is approximately 20 lines. The only differences are:
  1. The `signedData` prefix string (`gov-sync|`, `gov-sync-read|`, `gov-request|`)
  2. Minor error message variations
- **Fix:** Extract a helper function like `verifyHostSignature(req, expectedPrefix)` that returns `{ ok: true, hostId: string }` or `{ ok: false, status: number, error: string }`. This would reduce ~80 lines to ~20 plus 4 one-liner calls.

### [CC-P5-A3-004] query parameter cast to `any` loses type safety in multiple handlers
- **File:** services/headless-router.ts:781, 793, 805, 990, 1177, 1184, 1416-1417, 1807
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple handlers cast `query as any` when passing query parameters to service functions, completely bypassing TypeScript's type checking. This is particularly notable at lines like 781 (`queryCodeGraph(params.id, query as any)`) and 990 (`listAgentMessages(params.id, query as any)`). While the query object is always `Record<string, string>` from the URL parser, casting to `any` means mismatches between query parameter names and service function expectations would not be caught at compile time.
- **Evidence:**
  ```typescript
  // Line 781
  sendServiceResult(res, await queryCodeGraph(params.id, query as any))
  // Line 990
  sendServiceResult(res, await listAgentMessages(params.id, query as any))
  // Line 1177
  sendServiceResult(res, await getMeetingMessages(query as any))
  ```
- **Fix:** Define typed query parameter interfaces for each service function and construct properly typed objects from `query`, similar to how the search handler (line 740-752) explicitly maps each parameter.

## CLEAN

Files with no issues found:
- (None -- the single audited file has findings)

## Test Coverage Notes

- No dedicated test file exists for `headless-router.ts`. The router contains ~1900 lines of hand-written route mapping that mirrors ~100 Next.js API routes. Without automated tests verifying route parity between full mode and headless mode, bugs like CC-P5-A3-001 (route ordering) would go undetected. A route parity test that compares headless router patterns against Next.js filesystem routes would catch this class of bug systematically.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P5-A3-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P5-8f69c296-73f7-458d-9991-df5d5bbaf5e5.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (none -- all files had findings)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
