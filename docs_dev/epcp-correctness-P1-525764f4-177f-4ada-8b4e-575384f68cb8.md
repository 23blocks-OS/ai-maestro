# Code Correctness Report: services-governance

**Agent:** epcp-code-correctness-agent
**Domain:** services-governance
**Files audited:** 2
**Date:** 2026-02-22T17:01:00Z

## MUST-FIX

### [CC-P1-A2-001] Config deploy endpoint allows unauthenticated system-owner access to modify agent configuration
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:827-836
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `/api/agents/:id/config/deploy` endpoint checks `auth.error` and returns 403 if auth fails, but `authenticateAgent()` returns `{}` (no error, no agentId) when BOTH `Authorization` and `X-Agent-Id` headers are absent (system owner / web UI case). This means any unauthenticated request without auth headers bypasses the guard and reaches `deployConfigToAgent()` with `auth.agentId = undefined`. Unlike other governance-gated routes (e.g., transfers at lines 1199-1213 and 1225-1237), this endpoint does NOT check `if (!auth.agentId)` as a second gate. Since config deployment can modify an agent's skills, plugins, hooks, and MCP servers, allowing unauthenticated access is a security risk in multi-agent environments.
- **Evidence:**
  ```typescript
  // headless-router.ts:827-836
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/config\/deploy$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
    if (auth.error) {          // <-- only checks error, not missing agentId
      sendJson(res, 403, { error: auth.error })
      return
    }
    sendServiceResult(res, await deployConfigToAgent(params.id, body.configuration || body, auth.agentId))
    //                                                                                      ^^^ undefined
  }}
  ```
  Compare with the transfer resolve endpoint (lines 1207-1211):
  ```typescript
  if (!auth.agentId) {
    sendJson(res, 401, { error: 'Authenticated agent identity required to resolve transfers' })
    return
  }
  ```
- **Fix:** Add a second guard after the `auth.error` check: `if (!auth.agentId) { sendJson(res, 401, { error: 'Authenticated agent identity required for config deployment' }); return }`. This matches the pattern used by other governance-gated routes in the same file.

## SHOULD-FIX

### [CC-P1-A2-002] Config deploy endpoint sends 403 for auth errors instead of 401
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:832
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `authenticateAgent` returns an error (e.g., invalid API key, spoofed X-Agent-Id), the config deploy endpoint hardcodes `403` as the response status. However, `AgentAuthResult.status` is set to `401` by `authenticateAgent()` for authentication failures (invalid key, missing Bearer). Using 403 (Forbidden) is semantically incorrect for authentication failures -- 401 (Unauthorized) should be used. Other governance-gated routes in the same file correctly use `auth.status || 401` (see lines 1204, 1230, 1447, etc.).
- **Evidence:**
  ```typescript
  // headless-router.ts:832 -- hardcoded 403
  sendJson(res, 403, { error: auth.error })

  // headless-router.ts:1204 -- correct pattern
  sendJson(res, auth.status || 401, { error: auth.error })
  ```
- **Fix:** Change `sendJson(res, 403, { error: auth.error })` to `sendJson(res, auth.status || 401, { error: auth.error })` to be consistent with all other auth-gated routes.

### [CC-P1-A2-003] Config deploy endpoint body fallback bypasses ConfigurationPayload type validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:835
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The expression `body.configuration || body` allows callers to send the configuration payload either nested under a `configuration` key or directly as the request body. When sent directly as the body, any top-level fields from the request (e.g., attacker-injected `operation`, `scope`, or other unexpected fields) are passed straight to `deployConfigToAgent()` as a `ConfigurationPayload`. While `deployConfigToAgent` does validate `operation`, there is no type-level guarantee that the raw body matches `ConfigurationPayload`. If `body.configuration` is `null` or `0` (falsy but present), the fallback to `body` would also trigger unexpectedly.
- **Evidence:**
  ```typescript
  // headless-router.ts:835
  sendServiceResult(res, await deployConfigToAgent(params.id, body.configuration || body, auth.agentId))
  ```
  If the body is `{ "configuration": null, "operation": "add-skill", "skills": ["malicious"] }`, then `body.configuration` is falsy, so `body` (the whole object including extra fields) is passed as the config.
- **Fix:** Use strict check: `body.configuration !== undefined ? body.configuration : body` or require the `configuration` wrapper. Consider validating that the passed object matches `ConfigurationPayload` shape before calling the service.

### [CC-P1-A2-004] configure-agent execution silently succeeds even when deployConfigToAgent returns an error
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:483-498
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `performRequestExecution`, when `configure-agent` is handled and `deployResult.error` is set, the function logs a warning and returns early (line 495). However, the governance request status has already been set to `executed` by the caller (the status was changed to `executed` by `approveGovernanceRequest` before `performRequestExecution` was called -- see line 287-288). This means a governance request can show status `executed` even though the actual config deployment failed. The governance sync broadcast at line 511 will also propagate this false success to peer hosts.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:287-288
  if (updated.status === 'executed') {
    await performRequestExecution(updated)    // <-- status already 'executed'
  }

  // cross-host-governance-service.ts:493-495
  if (deployResult.error) {
    console.warn(`${LOG_PREFIX} configure-agent execution failed for request ${request.id}: ${deployResult.error}`)
    return    // <-- returns without updating request status back to 'failed'
  }
  ```
- **Fix:** Either (a) update the governance request status to a 'failed' state when execution fails, or (b) document that `executed` means "attempted" not "succeeded." Option (a) is strongly preferred because other governance consumers rely on `executed` status to mean the operation completed successfully.

## NIT

### [CC-P1-A2-005] Lazy import of deployConfigToAgent in performRequestExecution is unnecessary
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:491
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment says "lazy import to avoid circular deps," but `deployConfigToAgent` is already statically imported at the top of `headless-router.ts` (line 125) from the same module `@/services/agents-config-deploy-service`. If this import caused a circular dependency, it would also break the headless router. The lazy import adds unnecessary async overhead and makes the dependency less visible.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:491
  const { deployConfigToAgent } = await import('@/services/agents-config-deploy-service')

  // headless-router.ts:125 -- static import of the same module
  import { deployConfigToAgent } from '@/services/agents-config-deploy-service'
  ```
- **Fix:** If there truly is a circular dependency from cross-host-governance-service.ts, keep the lazy import but verify and document the exact cycle. If not, switch to a static import at the top of the file. Note: the circular dependency risk may be real only for cross-host-governance-service.ts specifically (different import graph from headless-router.ts), so verify before changing.

### [CC-P1-A2-006] Lazy import of notifyConfigRequestOutcome is duplicated in three places
- **File:** /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts:213,293,348
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The dynamic `import('@/services/config-notification-service')` call with its try/catch wrapper is repeated identically in three places: `receiveCrossHostRequest` (line 213), `approveCrossHostRequest` (line 293), and `rejectCrossHostRequest` (line 348). This is a maintenance burden -- if the import path or error handling pattern changes, three places need updating.
- **Evidence:**
  ```typescript
  // Pattern repeated 3 times:
  try {
    const { notifyConfigRequestOutcome } = await import('@/services/config-notification-service')
    await notifyConfigRequestOutcome(approvedRequest, 'approved')
  } catch (err) {
    console.warn(`${LOG_PREFIX} Config notification failed: ${err instanceof Error ? err.message : err}`)
  }
  ```
- **Fix:** Extract a helper function like `async function safeNotifyConfigOutcome(request: GovernanceRequest, outcome: 'approved' | 'rejected')` that encapsulates the try/catch + lazy import pattern.

## CLEAN

Files with no issues beyond those listed above:
- /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts -- Well-structured with thorough validation. Rate limiting, role checks, host signature verification, and file locking are all properly implemented. The `receiveCrossHostRequest` correctly forces `status: 'pending'` and clears `approvals` on received requests (CC-P1-002 fix). G4 team membership rules correctly enforced in `performRequestExecution`. The `configure-agent` submission validator (lines 99-111) properly checks for required fields and scope.
- /Users/emanuelesabetta/ai-maestro/services/headless-router.ts -- Overall well-structured with consistent patterns for auth, body parsing, and service result handling. All skills mutation routes (PATCH, POST, DELETE at lines 811-824) and skill settings PUT (line 803) correctly apply `authenticateAgent`. The governance sync routes properly verify host signatures with timestamp freshness checks. The `readJsonBody` function correctly enforces 1MB size limit (SF-03).

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P1-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P1-525764f4-177f-4ada-8b4e-575384f68cb8.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (6 total)
- [x] My return message to the orchestrator is exactly 1-2 lines
