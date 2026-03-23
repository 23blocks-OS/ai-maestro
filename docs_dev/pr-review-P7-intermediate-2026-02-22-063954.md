# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-063954
**Pass:** 7
**Reports merged:** 3
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 2 |
| **SHOULD-FIX** | 2 |
| **NIT** | 1 |
| **Total** | 5 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


### [CC-P7-A0-001] Missing `await` on async `updateAgentById` in PATCH /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:945
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `updateAgentById` is declared `async` (agents-core-service.ts:645) and returns `Promise<ServiceResult<...>>`. At line 945 in the headless-router's PATCH `/api/agents/[id]/metadata` handler, the call is made without `await`. This means `result` is a Promise object, not the resolved value. Consequently, `result.error` is always `undefined` (Promise objects don't have an `.error` property), so the handler always falls through to the success branch and sends `{ metadata: undefined }` because `result.data` is also undefined on the Promise.
- **Evidence:**
  ```typescript
  // Line 943-951
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = updateAgentById(params.id, { metadata })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { metadata: result.data?.agent?.metadata })
    }
  }},
  ```
- **Fix:** Change line 945 to `const result = await updateAgentById(params.id, { metadata })`

### [CC-P7-A0-002] Missing `await` on async `updateAgentById` in DELETE /metadata route (headless-router.ts)
- **File:** services/headless-router.ts:953
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P7-A0-001 but in the DELETE `/api/agents/[id]/metadata` handler. The `updateAgentById` call at line 953 is missing `await`. The result is a Promise, so the handler always reaches the success branch and sends `{ success: true }` even if the underlying update failed.
- **Evidence:**
  ```typescript
  // Line 952-959
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = updateAgentById(params.id, { metadata: {} })  // <-- MISSING await
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { success: true })
    }
  }},
  ```
- **Fix:** Change line 953 to `const result = await updateAgentById(params.id, { metadata: {} })`


---

## SHOULD-FIX Issues


### [CC-P7-A0-003] `getMetrics` (sync) called without `await` at GET /metrics in headless-router -- correct but inconsistent with PATCH
- **File:** services/headless-router.ts:734
- **Severity:** NIT (not a bug)
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `getMetrics` is declared as synchronous (`export function getMetrics(agentId: string): ServiceResult<any>` at agents-memory-service.ts:1101), so the call at line 734 without `await` is correct. Meanwhile `updateMetrics` is async and correctly uses `await` at line 738 after the diff fix. No action needed -- noting for completeness.


### [CV-P7-001] Claim: "resolve 14 review findings (14 MUST-FIX missing await)"
- **Source:** Commit message
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The diff contains exactly 14 `await` additions across 7 files. All 14 are genuine missing-await fixes for async functions (`updateMetrics`, `updateAgentById`, `deleteAgentById`, `linkAgentSession`, `normalizeHosts`, `registerAgent`, `createNewAgent`). All 7 functions are confirmed `async` in their service definitions.
- **What's missing:** Two additional call sites for `updateAgentById` in `services/headless-router.ts` at lines 945 and 953 (PATCH/DELETE `/api/agents/[id]/metadata`) remain un-awaited. These are the same async function fixed elsewhere in this commit but were not caught in this pass.
- **Evidence:**
  - `services/headless-router.ts:945` -- `const result = updateAgentById(params.id, { metadata })` -- missing `await`
  - `services/headless-router.ts:953` -- `const result = updateAgentById(params.id, { metadata: {} })` -- missing `await`
- **Impact:** The metadata PATCH and DELETE endpoints will receive a Promise object instead of the resolved ServiceResult, causing `result.error` to be undefined (Promise objects don't have `.error`), so the handler will always fall through to the success path and return `{ metadata: undefined }` or `{ success: true }` regardless of whether the operation actually succeeded or failed.

---


---

## Nits & Suggestions


_No nits found._


### [CV-P7-002] Two additional missing-await call sites for updateAgentById not fixed
- **Severity:** MUST-FIX
- **Files affected:** services/headless-router.ts
- **Expected:** All call sites of async `updateAgentById` should be awaited
- **Found:**
  - `services/headless-router.ts:945` -- `const result = updateAgentById(params.id, { metadata })` -- NOT awaited
  - `services/headless-router.ts:953` -- `const result = updateAgentById(params.id, { metadata: {} })` -- NOT awaited
- **Note:** These are in the PATCH/DELETE handlers for `/api/agents/[id]/metadata`, distinct from the PATCH/DELETE for `/api/agents/[id]` which were fixed in this commit.

---


---

## Source Reports

- `epcp-correctness-P7-268dc241-d7a9-437e-9c4d-1df761f34918.md`
- `epcp-claims-P7-6648438e-b892-460b-80ed-c82855a46b5e.md`
- `epcp-review-P7-70ecbca4-1565-48ff-bf1c-b4e852896722.md`

