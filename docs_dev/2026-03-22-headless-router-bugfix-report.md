# Bug Fix Report: services/headless-router.ts
Date: 2026-03-22

## Fixes Applied

### Fix 1: PATCH /api/config — replaced raw res.writeHead/res.end with sendServiceResult (lines 534-538)
- 400 path: `res.writeHead(400, ...)` + `res.end(JSON.stringify({error:...}))` -> `sendServiceResult(res, { status: 400, error: 'No valid settings provided' })`
- 200 path: `res.writeHead(200, ...)` + `res.end(JSON.stringify({success:true, settings:updated}))` -> `sendServiceResult(res, { status: 200, data: { success: true, settings: updated } })`

### Fix 2: GET /api/sessions error handler — removed spurious data field (line 585)
- Removed `data: { sessions: [] }` from the catch block's sendServiceResult call, leaving only `{ status: 500, error: 'Failed to fetch sessions' }`.

### Fix 3: GET /api/sessions/activity error handler — removed spurious data field (line 612)
- Removed `data: { activity: {} }` from the catch block's sendServiceResult call, leaving only `{ status: 500, error: 'Failed to fetch activity' }`.

## Skipped (per instructions)

- Missing `await` for `getAgentById` in GET /api/agents/([^/]+)$ and GET /api/agents/([^/]+)/metadata: `getAgentById` is a synchronous function (returns `ServiceResult<{agent:Agent}>` directly, confirmed in agents-core-service.ts:634). No await needed.
