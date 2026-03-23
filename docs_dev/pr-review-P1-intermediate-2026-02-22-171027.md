# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-171027
**Pass:** 1
**Reports merged:** 12
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 6 |
| **SHOULD-FIX** | 35 |
| **NIT** | 28 |
| **Total** | 88 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


_(none)_


_(none found)_


_No must-fix issues found._


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


(none)


### [CC-P1-A1-001] Command injection via tmux display-message in config-notification-service
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:107-110
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sendTmuxNotification` function escapes double quotes but does not escape backticks, `$()`, or other shell metacharacters. The `sessionName` parameter and `message` (derived from user-controllable fields like `operation` and `targetName`) are interpolated into a shell command. An attacker who can set an agent name or operation string containing backticks or `$(...)` can achieve command injection.
- **Evidence:**
  ```typescript
  // line 107
  const escaped = truncated.replace(/"/g, '\\"')
  // line 110
  await execAsync(`tmux display-message -t "${sessionName}" "[GOVERNANCE] ${escaped}"`, { timeout: 5000 })
  ```
  If `sessionName` is `foo$(rm -rf /)`, the command becomes: `tmux display-message -t "foo$(rm -rf /)" "..."` -- the shell will execute the subcommand.
- **Fix:** Use `execFile` (which does not invoke a shell) instead of `exec`, passing arguments as an array. Alternatively, use the runtime abstraction that the rest of the codebase uses (e.g., `runtime.sendKeys`). If `exec` must be used, apply proper shell escaping to both `sessionName` and `escaped` (replace all `'` with `'\''` and wrap in single quotes, or use a library like `shell-escape`).

### [CC-P1-A1-002] `registerAgent` writes user-controlled `agentId` to filesystem without UUID validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:764-817
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In the WorkTree branch (line 764), `agentId` is derived from `sessionName` via regex replacement but is NOT validated as a UUID. The value is then used to construct a file path at line 816: `path.join(agentsDir, \`${agentId}.json\`)`. While the regex removes most special chars, it allows hyphens and alphanumeric chars, which could still enable path traversal on some edge-case systems. More critically, in the cloud agent branch (line 805), `agentId = body.id` is used directly with NO sanitization whatsoever, and this value is written to the filesystem at line 816-817. A malicious `body.id` like `../../etc/evil` would write to `~/.aimaestro/agents/../../etc/evil.json`.
- **Evidence:**
  ```typescript
  // line 764 (WorkTree branch)
  agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')
  // line 805 (Cloud branch)
  agentId = body.id  // No sanitization!
  // line 816
  const agentFilePath = path.join(agentsDir, `${agentId}.json`)
  fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
  ```
- **Fix:** Validate `agentId` as a UUID (using the same `UUID_PATTERN` regex used in `agents-skills-service.ts`) before using it in a file path. Also apply `path.basename()` as an additional safeguard.


### [CC-P10-A0-001] Command injection via unsanitized `body.url` and `body.ref` in headless router scan-repo route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED (traced code flow)
- **Description:** The headless router's `scan-repo` route passes `body.url` and `body.ref` directly to `scanRepo()` without any type or presence check on the route side. While the `scanRepo` function itself validates both, the issue is that `body.ref` is passed as-is and when `body.ref` is `undefined`, `scanRepo` receives it as the second argument. However, the `scanRepo` function has a default parameter `ref: string = 'main'` which handles this correctly. **UPDATE after tracing: This is actually safe because the service-layer validation catches undefined/invalid values.** Downgrading -- not a MUST-FIX after all.

*Self-correction: After full trace, the service layer validates properly. Removing this from MUST-FIX.*

### [CC-P10-A0-002] `activeOps` double-decrement race condition in `buildPlugin`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:307-388
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED (traced code flow)
- **Description:** In `buildPlugin()`, when the async `runBuild` promise is launched at line 367, its `.finally()` handler at line 378 decrements `activeOps`. However, if the *outer* try block (lines 319-387) throws AFTER `runBuild` has already been kicked off but BEFORE it resolves, the `catch` block at line 383-385 ALSO decrements `activeOps`. This creates a double-decrement scenario.

  Specifically, the flow is:
  1. `activeOps++` at line 323
  2. `runBuild(...)` launched at line 367 with `.finally(() => activeOps--)` at line 378-380
  3. If any code between line 367 and return at line 382 throws (unlikely but possible if `buildResults.set` somehow fails), the catch at line 383-385 decrements `activeOps`
  4. Later, `runBuild`'s `.finally()` also decrements `activeOps`

  In practice, there is no code between line 367 (`runBuild(...).catch(...).finally(...)`) and line 382 (`return`) that can throw, so the risk is very low. But the pattern is structurally fragile.
- **Evidence:**
  ```typescript
  // Line 323
  activeOps++
  // ... setup ...
  // Line 367-380: runBuild launched with .finally decrement
  runBuild(buildId, buildDir, manifest).catch(err => {
    // ...
  }).finally(() => {
    activeOps = Math.max(0, activeOps - 1)  // decrement #1
  })
  // Line 382
  return { data: result, status: 202 }
  } catch (error) {
    activeOps = Math.max(0, activeOps - 1)  // decrement #2
    // ...
  }
  ```
- **Fix:** Move the `activeOps++` to just before the `runBuild` call, and remove the decrement from the outer catch block. Or use a `try/finally` with a flag to track whether ownership of the decrement was transferred to `runBuild`.


No MUST-FIX issues found.


### [CV-P1-001] Claim: "836 tests pass"
- **Source:** Claims list, item #10
- **Severity:** MUST-FIX (inaccurate claim, not a code bug)
- **Verification:** NOT IMPLEMENTED
- **Expected:** 836 test cases pass
- **Actual:** 628 `it()`/`test()` blocks found across all 26 test files in `tests/`. The actual count breakdown:
  - agent-config-governance-extended.test.ts: 56
  - agent-registry.test.ts: 91
  - task-registry.test.ts: 47
  - cross-host-governance.test.ts: 39
  - message-filter.test.ts: 27
  - document-registry.test.ts: 27
  - role-attestation.test.ts: 25
  - governance-request-registry.test.ts: 25
  - team-api.test.ts: 24
  - team-registry.test.ts: 24
  - agent-utils.test.ts: 21
  - document-api.test.ts: 21
  - content-security.test.ts: 19
  - amp-auth.test.ts: 19
  - validate-team-mutation.test.ts: 18
  - agent-config-governance.test.ts: 16
  - governance-sync.test.ts: 16
  - host-keys.test.ts: 15
  - manager-trust.test.ts: 15
  - governance.test.ts: 13
  - governance-peers.test.ts: 20
  - governance-endpoint-auth.test.ts: 12
  - transfer-resolve-route.test.ts: 12
  - transfer-registry.test.ts: 9
  - amp-address.test.ts: 9
  - agent-auth.test.ts: 8
  - **Total: 628**
- **Evidence:** `grep -cE '^\s*(it|test)\(' tests/*.test.ts` returns 628 total
- **Impact:** Documentation/claim is inaccurate. The test suite has 628 tests, not 836. This may confuse future reviewers who expect to see 836 tests.

---


None.


---

## SHOULD-FIX Issues


### [CC-P1-A0-001] `purgeOldRequests` return value double-counts expired requests that were ALSO purged
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:279
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `purgeOldRequests` has a two-pass design: Pass 1 filters out old executed/rejected requests (the `filtered` array), and Pass 2 iterates the **filtered** results to auto-reject pending requests past a 7-day TTL. The return value on line 279 is `purged + expired`. However, there is a subtle edge case: if a pending request is older than 30 days (the default `maxAgeDays`), Pass 1 will NOT filter it out (because it's `pending`, not `executed` or `rejected`). Then Pass 2 marks it as `rejected`. In the NEXT call to `purgeOldRequests`, that now-rejected request (still older than 30 days) WILL be filtered out by Pass 1. So the double-count doesn't actually happen within one call. BUT: if `maxAgeDays` were set to a value < 7, a pending request aged between `maxAgeDays` and 7 days would not be affected by either pass, since Pass 1 only removes `executed`/`rejected` and Pass 2 only affects requests older than 7 days. This is a design gap rather than a bug.

  More critically: the `expired` count inflates the return value semantically. `purged` counts requests **removed** from the array. `expired` counts requests **status-changed** but still present in the array. The function returns `purged + expired` which suggests `purged + expired` items were removed, but only `purged` were actually removed. The `expired` requests are still in the array (now with status `rejected`). Callers logging this value (e.g., server.mjs line 1187-1188) will see a count that overstates actual removals.

- **Evidence:**
  ```typescript
  // Line 271-279
  const purged = before - filtered.length  // actual removals
  if (filtered.length < before || expired > 0) {
    saveGovernanceRequests({ ...file, requests: filtered })
  }
  // ...
  return purged + expired  // inflated: expired items are still in the array
  ```

- **Fix:** Either (a) return `{ purged, expired }` as a structured result so callers can distinguish, or (b) document that the return value includes both purged and expired (status-changed) requests.

### [CC-P1-A0-002] Duplicate TTL logic between `purgeOldRequests` and `expirePendingRequests`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:256-269 and 288-312
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The TTL expiry logic for pending requests is duplicated: once inside `purgeOldRequests` (lines 256-269, hardcoded 7-day TTL) and once in the standalone `expirePendingRequests` (lines 288-312, configurable `ttlDays` parameter). Both do the same thing: iterate pending requests, check `createdAt` against a cutoff, set status to `rejected`. If `purgeOldRequests` is the scheduled job (called from server.mjs), it already expires pending requests -- making `expirePendingRequests` redundant. If both are called, the second call is a no-op (the requests are already rejected), but it's confusing to maintain two code paths for the same behavior.

  The hardcoded `7 * 86_400_000` in `purgeOldRequests` line 257 also cannot be overridden by callers, while `expirePendingRequests` accepts a `ttlDays` parameter. This inconsistency could cause confusion about which TTL value is authoritative.

- **Evidence:**
  ```typescript
  // Inside purgeOldRequests (line 257) - hardcoded 7 days
  const pendingCutoff = Date.now() - 7 * 86_400_000

  // Standalone function (line 291) - configurable
  const cutoff = Date.now() - ttlDays * 86_400_000
  ```

- **Fix:** Remove the TTL logic from `purgeOldRequests` and have it call `expirePendingRequests` internally, or extract shared logic to a helper. At minimum, make the TTL in `purgeOldRequests` use the same configurable parameter.

### [CC-P1-A0-003] `getGovernanceRequest` and `listGovernanceRequests` read without acquiring the lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:76-98
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `getGovernanceRequest` (line 76) and `listGovernanceRequests` (line 82) call `loadGovernanceRequests()` directly without acquiring the `governance-requests` lock. If a concurrent write operation is in progress (e.g., `createGovernanceRequest` has loaded the file and is about to save), these reads will get the pre-write data. More importantly, during the atomic write (lines 70-72: write to `.tmp` then rename), a read could theoretically see a partially-written `.tmp` file -- although since the read targets the original file and `renameSync` is atomic on POSIX, this specific scenario is safe on macOS/Linux.

  The real concern is TOCTOU in callers. For example, `cross-host-governance-service.ts:253` calls `getGovernanceRequest(requestId)` without a lock, then later calls `approveGovernanceRequest` under a lock. Between the two calls, the request could be modified or rejected by another concurrent API call. This is a low-probability race in Phase 1 (single process, localhost) but could cause stale reads.

- **Evidence:**
  ```typescript
  // Line 76-78 - no lock
  export function getGovernanceRequest(id: string): GovernanceRequest | null {
    const file = loadGovernanceRequests()
    return file.requests.find((r) => r.id === id) ?? null
  }
  ```

- **Fix:** For Phase 1 this is acceptable since it's single-process. Document that these are intentionally lock-free reads for performance. For multi-process Phase 2, wrap reads in `withLock` or use a reader-writer lock.


### [CC-P1-A4-001] Duplicate filtering of pendingConfigRequests in AgentProfile.tsx
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:880-883
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The pending config request filtering `governance.pendingConfigRequests.filter(r => r.payload.agentId === agent.id)` is computed inline twice (lines 880 and 882) on every render. While functionally correct, this is redundant computation and more importantly, the count displayed in the badge (line 882) is recalculated separately from the existence check (line 880). If these ever diverge (e.g., due to a race where `agent.id` changes but `governance` hasn't re-fetched), the badge could flash incorrect values. Additionally, `AgentSkillEditor` at line 71 does the same filter internally. Three separate filter passes for the same data is wasteful.
- **Evidence:**
  ```tsx
  // Line 880-883 in AgentProfile.tsx
  {(governance.pendingConfigRequests.filter(r => r.payload.agentId === agent.id).length > 0) && (
    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
      {governance.pendingConfigRequests.filter(r => r.payload.agentId === agent.id).length}
    </span>
  )}
  ```
  ```tsx
  // Line 71 in AgentSkillEditor.tsx
  const agentPendingConfigs = pendingConfigRequests.filter(r => r.payload.agentId === agentId)
  ```
- **Fix:** Extract the filtered list into a `useMemo` or a local variable in AgentProfile (like AgentSkillEditor already does at line 71), and pass the count down or use a single reference.

### [CC-P1-A4-002] Approve/reject buttons fire without user confirmation or error feedback
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:295-306
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The approve and reject buttons for pending configuration requests call `resolveConfigRequest` immediately on click with no confirmation dialog. The `resolveConfigRequest` function returns `{ success, error }` but the return value is not consumed -- the result is a floating promise. If the resolve call fails, the user has no feedback that the action failed. Additionally, rejecting a request never prompts for a reason (`reason` parameter is always `undefined`).
- **Evidence:**
  ```tsx
  // Lines 295-306 in AgentSkillEditor.tsx
  <button
    onClick={() => resolveConfigRequest(req.id, true)}
    className="p-1 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
    title="Approve"
  >
    <Check className="w-4 h-4" />
  </button>
  <button
    onClick={() => resolveConfigRequest(req.id, false)}
    className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
    title="Reject"
  >
    <XCircle className="w-4 h-4" />
  </button>
  ```
- **Fix:**
  1. Await the result and show an error toast/inline message if `!result.success`.
  2. Add a confirmation step before approve/reject (at minimum for reject).
  3. For reject, prompt for a reason string (the API and hook support it via the `reason` parameter).

### [CC-P1-A4-003] No loading/disabled state on approve/reject buttons during pending request
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:294-309
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a user clicks approve or reject, the `resolveConfigRequest` async call is in flight, but the buttons remain clickable. The user could double-click and fire duplicate requests. Unlike the skill add/remove buttons which use the `saving` state + `disabled={saving}`, the governance buttons have no such protection.
- **Evidence:**
  ```tsx
  // No disabled prop on these buttons (lines 294-309)
  <button
    onClick={() => resolveConfigRequest(req.id, true)}
    className="p-1 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
    title="Approve"
  >
  ```
  Compare with skill remove button (line 370):
  ```tsx
  <button
    onClick={() => handleRemoveSkill(skill.id)}
    disabled={saving}  // <-- has protection
  ```
- **Fix:** Track an in-flight state per request (e.g., `resolvingIds` set) and disable buttons while the request is pending. At minimum, use the existing `saving` state to block interaction.

### [CC-P1-A4-004] `canApprove` role check may be too narrow -- does not include 'manager' check against actual manager assignment
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:72
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `canApprove` is derived as `agentRole === 'manager' || agentRole === 'chief-of-staff'`. However, `agentRole` from `useGovernance(agentId)` is computed based on whether the *viewed agent* (`agentId`) is the manager or COS -- not whether the *current user/acting agent* is. This means the approve/reject buttons appear when viewing the profile of the manager or COS agent, but NOT when a manager views a regular agent's profile. The governance role check is backwards: it checks the *subject* agent's role rather than the *actor's* role.
- **Evidence:**
  ```tsx
  // Line 70-72 in AgentSkillEditor.tsx
  const { pendingConfigRequests, resolveConfigRequest, agentRole } = useGovernance(agentId)
  const agentPendingConfigs = pendingConfigRequests.filter(r => r.payload.agentId === agentId)
  const canApprove = agentRole === 'manager' || agentRole === 'chief-of-staff'
  ```
  `useGovernance(agentId)` computes `agentRole` based on whether `agentId` (the agent being *viewed*) is the manager or COS. To check if the *viewer* can approve, the hook would need to be called with the viewer's agentId, or a separate check is needed.
- **Fix:** Either: (a) pass the acting/viewer agent's ID to `useGovernance` for role determination, or (b) add a separate `viewerRole` prop/check that represents who is currently using the UI. The server-side endpoint should also enforce authorization regardless.


### [CC-P1-A5-001] Stale test count in file header comment (agent-config-governance-extended.test.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:26
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file header comment on line 26 says "Total: 48 tests (15 + 12 + 15 + 6)" but the actual test counts are 56 (20 + 16 + 14 + 6). The per-module counts in lines 7, 10, 15, 22 are also stale:
  - Module 1 header says 15 tests, actual: 20
  - Module 2 header says 12 tests, actual: 16
  - Module 3 header says 15 tests, actual: 14
  - Module 4 header says 6 tests, actual: 6 (correct)
- **Evidence:**
  ```typescript
  // Line 26:
  // * Total: 48 tests (15 + 12 + 15 + 6)
  // Actual count by section: 20 + 16 + 14 + 6 = 56
  ```
- **Fix:** Update header comment to "Total: 56 tests (20 + 16 + 14 + 6)" and update the per-module test counts.

### [CC-P1-A5-002] Stale test count in file header comment (governance-endpoint-auth.test.ts)
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts:8
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The file header comment on line 8 says "Coverage: 13 tests across 3 security fixes" but there are only 12 actual `it()` blocks (3 + 2 + 6 + 1 = 12). One test was likely removed at some point but the header was not updated.
- **Evidence:**
  ```typescript
  // Line 8:
  // * Coverage: 13 tests across 3 security fixes
  // Actual: 12 tests (3 in SR-001 broadcastGovernanceSync, 2 in SR-001 cross-host, 6 in SR-007, 1 in header format)
  ```
- **Fix:** Update header to "Coverage: 12 tests across 3 security fixes".


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


### [CC-P1-A3-001] Missing UUID validation on `id` path parameter in config/deploy route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts:20
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `id` path parameter is used directly without UUID format validation. The `chief-of-staff/route.ts` (line 14) validates with `isValidUuid(id)` before proceeding, but this route does not. While `getAgent(agentId)` in the downstream service will return null for invalid IDs (preventing functional issues), the lack of early validation means malformed IDs (e.g., path traversal attempts like `../../etc`) reach the service layer unnecessarily. The service does use the ID for file path construction (`path.join(workingDir, '.claude')`), though the actual path is derived from the agent's stored `workingDirectory`, not the `id` parameter directly, so there is no actual path traversal vulnerability. Still, consistent validation is important for defense-in-depth.
- **Evidence:**
```typescript
// deploy/route.ts:20 - no validation
const { id } = await params
// ...
const result = await deployConfigToAgent(id, body.configuration || body, auth.agentId)
```
vs.
```typescript
// chief-of-staff/route.ts:14 - validated
const { id } = await params
if (!isValidUuid(id)) {
  return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
}
```
- **Fix:** Add `import { isValidUuid } from '@/lib/validation'` and validate `id` before proceeding, returning 400 for invalid format.

### [CC-P1-A3-002] Missing UUID validation on `id` path parameter in skills route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/route.ts:22,42,69,96
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P1-A3-001. All four handlers (GET, PATCH, POST, DELETE) extract `id` from params without UUID format validation. The downstream service calls `getAgent(id)` which returns null for invalid IDs, so there is no functional bug, but defense-in-depth is missing.
- **Evidence:**
```typescript
// Line 22 (GET), 42 (PATCH), 69 (POST), 96 (DELETE) - all use:
const { id } = await params
// No isValidUuid check
```
- **Fix:** Add UUID validation at the top of each handler, or factor it into a shared middleware/helper.

### [CC-P1-A3-003] Missing UUID validation on `id` path parameter in skills/settings route
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:19,39
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-P1-A3-001 and CC-P1-A3-002. Both GET and PUT handlers extract `id` without validation.
- **Evidence:**
```typescript
// Line 19 (GET), 39 (PUT):
const { id: agentId } = await params
// No isValidUuid check
```
- **Fix:** Add UUID validation.

### [CC-P1-A3-004] Rate limit key is global, not per-team, for COS password auth
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:31
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The rate limit key `'governance-cos-auth'` is shared across all teams. A brute-force attempt on Team A's COS endpoint will lock out legitimate COS changes on Team B. This creates a denial-of-service vector where an attacker can lock out all COS operations by targeting any single team endpoint.
- **Evidence:**
```typescript
// Line 31 - same key regardless of team ID
const rateCheck = checkRateLimit('governance-cos-auth')
// ...
recordFailure('governance-cos-auth')     // line 41
resetRateLimit('governance-cos-auth')    // line 45
```
- **Fix:** Include the team ID in the rate limit key: `checkRateLimit(\`governance-cos-auth:${id}\`)`. This scopes rate limiting per team.


### [CC-P1-A1-003] `updateSkills` uses wrong governance operation type for removals
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:101
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `updateSkills` function performs a single governance check with operation `'add-skill'` at line 101, but the function also handles skill removals (body.remove) and AI Maestro config updates. When a caller only passes `body.remove`, the governance check still evaluates as `'add-skill'`, which is semantically incorrect. While both operations currently have the same RBAC logic (COS or MANAGER), this is a logic flaw that could cause incorrect behavior if different RBAC rules are added per operation type in the future.
- **Evidence:**
  ```typescript
  // line 101 -- always checks 'add-skill' even when removing
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'add-skill')
  ```
- **Fix:** Determine the correct operation type based on which fields are present in `body`. If `body.remove` is present and `body.add` is not, use `'remove-skill'`. If both are present, check both operations or use a combined operation type.

### [CC-P1-A1-004] `saveSkillSettings` uses `'update-hooks'` operation type instead of a skill-settings operation
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:292
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `saveSkillSettings` function uses `'update-hooks'` as its governance operation type, which is semantically wrong -- it's saving skill settings, not updating hooks. This means the audit trail and any operation-specific RBAC logic would be misleading.
- **Evidence:**
  ```typescript
  // line 292
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'update-hooks')
  ```
- **Fix:** Either add a dedicated operation type for skill settings (e.g., `'update-skill-settings'`), or use `'bulk-config'` which is a more general operation type.

### [CC-P1-A1-005] `deleteAgentById` auto-rejection only targets `configure-agent` requests, not other governance request types
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:720-721
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When an agent is deleted, the code auto-rejects pending governance requests but only those of type `'configure-agent'`. Other governance request types that reference the deleted agent (e.g., `'add-to-team'`, `'assign-cos'`, `'transfer-agent'`, `'create-agent'`) would remain pending indefinitely, even though the target agent no longer exists.
- **Evidence:**
  ```typescript
  // line 720-721
  const pendingForAgent = file.requests.filter((r: ...) =>
    r.type === 'configure-agent' && r.status === 'pending' && r.payload.agentId === id
  )
  ```
- **Fix:** Remove the `r.type === 'configure-agent'` filter (or expand it to include all governance request types), so that ALL pending requests targeting the deleted agent are auto-rejected.

### [CC-P1-A1-006] `deployConfigToAgent` uses agent's `workingDirectory` to resolve `.claude/` path without validating it exists
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:55-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The function resolves the `.claude/` directory from `agent.workingDirectory` or `agent.sessions?.[0]?.workingDirectory`, but does not validate that this directory actually exists on the filesystem before attempting to create files/directories inside it. If the workingDirectory points to a non-existent or stale path, the deployment will silently create the directory tree at an unexpected location.
- **Evidence:**
  ```typescript
  // lines 55-60
  const workingDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!workingDir) {
    return { error: `Agent '${agentId}' has no working directory configured`, status: 400 }
  }
  const claudeDir = path.join(workingDir, '.claude')
  ```
- **Fix:** Add a check that `workingDir` exists on the filesystem before proceeding with deployment. Return a 400 error if it doesn't exist.

### [CC-P1-A1-007] `deployBulkConfig` always uses `deployAddSkill` for skills, never `deployRemoveSkill`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:443-448
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `deployBulkConfig` function calls `deployAddSkill` when `config.skills` is present, but the original `config.operation` might be `'bulk-config'` with the intent to remove skills. There is no way for the bulk config to remove skills -- it always adds them. Similarly for plugins (line 450-455, always `deployAddPlugin`). This makes `bulk-config` asymmetric: it can add but never remove.
- **Evidence:**
  ```typescript
  // line 443-448
  if (config.skills && config.skills.length > 0) {
    const skillResult = await deployAddSkill(claudeDir, config, deployedBy)
    // ...
  }
  ```
- **Fix:** Add a mechanism to indicate add vs remove intent for each section in the bulk config payload (e.g., separate `skillsToAdd`/`skillsToRemove` fields, or inspect `config.operation`).

### [CC-P1-A1-008] `notifyConfigRequestOutcome` accesses `request.payload.configuration?.operation` but type shows `configuration` is optional
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:29
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The function accesses `request.payload.configuration?.operation` with optional chaining, which means `operation` could be `undefined`. It falls back to the string `'configure'`. However, line 25 already checks `request.type !== 'configure-agent'` and returns early, so for `configure-agent` type requests, `configuration` should always be present. The logic is not wrong, but if `configuration` is somehow missing on a `configure-agent` request (corrupt data), the notification will use the generic fallback `'configure'`, which is misleading. The bigger concern: line 28 accesses `request.payload.agentId` without checking if `request.payload` exists at all (though the type guarantees it).
- **Evidence:**
  ```typescript
  // line 29
  const operation = request.payload.configuration?.operation || 'configure'
  ```
- **Fix:** This is acceptable as defensive coding, but consider logging a warning when `configuration` is missing for a `configure-agent` request, as it indicates data corruption.

### [CC-P1-A1-009] SSRF incomplete mitigation in `proxyHealthCheck` -- known hosts bypass private IP check
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1619-1643
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `proxyHealthCheck` function correctly blocks requests to private IPs (line 1619) and non-known hosts (line 1645). However, the check at line 1641 allows requests to private IPs if the host is "known" (in `hosts.json`). Since `hosts.json` is writable via the `/api/hosts` endpoints, an attacker who can modify `hosts.json` (e.g., via another API call) could add a private IP as a known host and then use `proxyHealthCheck` as an SSRF proxy. This is a defense-in-depth concern given that the app is localhost-only (Phase 1).
- **Evidence:**
  ```typescript
  // line 1641 -- private IPs allowed if in known hosts
  if (isPrivateIP && !isKnownHost) {
    return { error: 'URL target is not a known peer host', status: 403 }
  }
  ```
- **Fix:** Consider whether private IPs should ALWAYS be blocked in the health check proxy regardless of `hosts.json` configuration, or document this as an accepted risk for the localhost-only Phase 1 architecture.


### [CC-P10-A0-003] Headless router `scan-repo` does not validate `body.ref` default like Next.js route does
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/scan-repo/route.ts`:22
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The Next.js API route at `scan-repo/route.ts:22` passes `body.ref || 'main'` to `scanRepo()`, providing a sensible default. The headless router at line 1664 passes `body.ref` directly (no default). When `body.ref` is undefined, `scanRepo` still works because the function signature has `ref: string = 'main'`. However, if `body.ref` is explicitly an empty string `""`, the Next.js route would fallback to `'main'` (because `'' || 'main'` is `'main'`), but the headless route would pass `""` through, which would then fail the `validateGitRef` check ("Git ref is required"). This is an inconsistency between the two entry points.
- **Evidence:**
  ```typescript
  // Next.js route (scan-repo/route.ts:22)
  const result = await scanRepo(body.url, body.ref || 'main')

  // Headless route (headless-router.ts:1664)
  sendServiceResult(res, await scanRepo(body.url, body.ref))
  ```
- **Fix:** Change headless route to: `scanRepo(body.url, body.ref || 'main')` to match the Next.js route behavior.

### [CC-P10-A0-004] Headless router `push` route skips input validation present in Next.js route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1666-1668 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/push/route.ts`:16-28
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The Next.js `push` route validates `body.forkUrl` and `body.manifest` exist before calling `pushToGitHub(body)`. The headless route passes `body` directly to `pushToGitHub()`. While `pushToGitHub()` does its own validation internally (lines 468-477), the Next.js route provides earlier, more specific error messages. This is not a bug per se since the service layer catches it, but it is an API behavior inconsistency -- the error message format differs between the two entry points.
- **Evidence:**
  ```typescript
  // Next.js route validates forkUrl and manifest first
  if (!body.forkUrl || typeof body.forkUrl !== 'string') {
    return NextResponse.json({ error: 'Fork URL is required' }, { status: 400 })
  }
  // Headless route skips this
  sendServiceResult(res, await pushToGitHub(body))
  ```
- **Fix:** This is acceptable since the service layer validates. But for consistency, either remove the duplicate validation from the Next.js route (since it is redundant) or add it to the headless route as well.

### [CC-P10-A0-005] `PluginComposer.tsx` `getSkillDisplayName` returns empty string for malformed marketplace skill IDs
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/PluginComposer.tsx`:214
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `getSkillDisplayName`, for marketplace skills, the code does `skill.id.split(':')[2] || skill.id`. If the skill ID has fewer than 3 colon-separated parts (e.g., `"marketplace:plugin"` with no third part), `split(':')[2]` is `undefined`, so it falls back to `skill.id`. This works. However, if the ID is `"marketplace:plugin:"` (trailing colon), `split(':')[2]` returns `""` (empty string), which is falsy in JS, so it still falls back. This is actually handled correctly. **Self-correction: This is fine.** Removing.

### [CC-P10-A0-006] `RepoScanner` key mismatch with `getSkillKey` for deduplication check
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/RepoScanner.tsx`:127 vs `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`:268-276
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `RepoScanner.tsx`, line 127, the key for checking if a repo skill is already selected is computed as:
  ```typescript
  const key = `repo:${url}:${skill.path}`
  ```
  But in `SkillPicker.tsx`, the canonical `getSkillKey` function for repo skills is:
  ```typescript
  case 'repo':
    return `repo:${skill.url}:${skill.skillPath}`
  ```
  The `RepoScanner` uses `url` (local state, untrimmed) and `skill.path` (the `RepoSkillInfo.path` field). Meanwhile, `getSkillKey` uses `skill.url` (the `PluginSkillSelection` `url` field, which is trimmed at line 63: `url: url.trim()`) and `skill.skillPath`.

  Since `RepoSkillInfo.path` maps directly to `PluginSkillSelection.skillPath` (see line 65: `skillPath: skill.path`), the `skill.path` vs `skill.skillPath` difference is consistent.

  However, the `url` in `RepoScanner` is the *untrimmed* local state, while `getSkillKey` uses the *trimmed* url that was stored in the `PluginSkillSelection`. If the user enters a URL with leading/trailing whitespace, `RepoScanner`'s key (`repo:  https://...`) won't match the selected skill's key (`repo:https://...`), causing the "already added" check to fail -- the button won't be disabled even though the skill is already selected.
- **Evidence:**
  ```typescript
  // RepoScanner.tsx:127 -- uses untrimmed `url`
  const key = `repo:${url}:${skill.path}`

  // RepoScanner.tsx:63 -- trims url when creating the selection
  url: url.trim(),

  // SkillPicker.tsx:275 -- uses trimmed url from the selection
  return `repo:${skill.url}:${skill.skillPath}`
  ```
- **Fix:** Change RepoScanner line 127 to use `url.trim()`:
  ```typescript
  const key = `repo:${url.trim()}:${skill.path}`
  ```

### [CC-P10-A0-007] `findScriptsInDir` `isSymbolicLink()` check may not work with `readdir({ withFileTypes: true })`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:670
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** At line 670, the code checks `entry.isFile() && !entry.isSymbolicLink()`. In Node.js, `readdir({ withFileTypes: true })` returns `Dirent` objects. For symlinks, `entry.isFile()` returns `false` and `entry.isSymbolicLink()` returns `true`. So a symlink to a file would already be excluded by `entry.isFile()` alone. The `!entry.isSymbolicLink()` check is redundant but not harmful. However, there is a subtle issue: on some platforms/filesystems with `readdir`, a symlink to a file may report `isFile() === true` and `isSymbolicLink() === true` simultaneously (this was the behavior before Node.js 20.1). In that case, both checks are needed. Since the code supports Node.js 20+, this is fine. **Self-correction: The check is correct and defensive. Not a bug.**

### [CC-P10-A0-008] `scanRepo` error message leaks internal URL in 404 response
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:454
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When `git clone` fails with exit code 128, the error message includes the URL: `Repository not found or access denied: ${url}`. While the URL was already provided by the user, in a multi-user scenario this could be used to confirm whether specific repositories exist on allowed hosts (SSRF-like oracle). This is low severity since Phase 1 is localhost-only and the URL comes from the user, but it is worth noting for defense-in-depth.
- **Evidence:**
  ```typescript
  return { error: `Repository not found or access denied: ${url}`, status: 404 }
  ```
- **Fix:** Remove the URL from the error message: `'Repository not found or access denied'`

### [CC-P10-A0-009] `pushToGitHub` error message leaks internal error details
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:546
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `pushToGitHub` catch block returns the raw error message to the client: `Failed to push to GitHub: ${message}`. This could expose internal paths, git error details, or credential-related errors to the client.
- **Evidence:**
  ```typescript
  return { error: `Failed to push to GitHub: ${message}`, status: 500 }
  ```
- **Fix:** Log the detailed error server-side (already done at line 545) but return a generic message to the client: `'Failed to push to GitHub'`

### [CC-P10-A0-010] `scanRepo` error message also leaks internal error details
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:457
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P10-A0-009. The `scanRepo` catch block returns: `Failed to scan repository: ${message}` which could contain internal paths or git error output.
- **Evidence:**
  ```typescript
  return { error: `Failed to scan repository: ${message}`, status: 500 }
  ```
- **Fix:** Return generic message to client, keep detailed error in server logs.


### [CC-P10-A1-001] Unsafe cast of `payload.context` from `unknown` to `Record<string, unknown>`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:278
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `payload.context` field is typed as `unknown` in the `AMPEnvelopeMsg` interface (line 218). At line 278, it is cast directly to `Record<string, unknown> | undefined` without any runtime validation that it is actually an object. If a malformed AMP message file contains `context: "some string"`, `context: 42`, or `context: [1,2,3]`, the cast will succeed silently but downstream code expecting an object (e.g., `Object.keys(context)` or property access) could produce incorrect results or runtime errors.
- **Evidence:**
  ```typescript
  // AMPEnvelopeMsg interface (line 218):
  payload: {
    type?: string
    message?: string
    context?: unknown    // <-- typed as unknown
  }

  // Line 278 in convertAMPToMessage:
  context: (payload.context || undefined) as Record<string, unknown> | undefined,
  ```
  The `status` field has proper validation (lines 250-253 with `validStatuses.includes()`), and `priority` has a fallback default (line 273 `envelope.priority || 'normal'`), but `context` has no type-shape validation.
- **Fix:** Add a runtime check before casting:
  ```typescript
  context: (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context))
    ? payload.context as Record<string, unknown>
    : undefined,
  ```


### [CV-P1-002] Claim: "Created 56-test suite across 4 modules (skills RBAC, deploy, cross-host, notifications)"
- **Source:** Commit message, Step 10
- **Severity:** NIT (documentation inconsistency)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The file `tests/agent-config-governance-extended.test.ts` has exactly 56 `it()` blocks and 4 describe blocks (skills RBAC, config deploy, cross-host configure-agent, config notifications). This matches the claim.
- **What's missing:** The file header comment (line 26) says "Total: 48 tests (15 + 12 + 15 + 6)" which is stale. The actual per-module counts are: Module 1 has more than 15, Module 2 has more than 12, etc. -- the header comment was not updated when tests were added.
- **Evidence:** `tests/agent-config-governance-extended.test.ts:26` says "48 tests" but `grep -c 'it(' tests/agent-config-governance-extended.test.ts` returns 56.

### [CV-P1-003] Claim: "Pending/approved/refused states with UI indicators (amber/green/red)"
- **Source:** Claims list, item #4; commit message Step 8
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:**
  - Amber (pending): `AgentSkillEditor.tsx:277-282` -- amber background, amber text, Clock icon for pending config requests
  - Green (approve button): `AgentSkillEditor.tsx:296` -- `text-emerald-400` approve button
  - Red (reject button): `AgentSkillEditor.tsx:303` -- `text-red-400` reject button
  - `useGovernance.ts:30-32` -- `pendingConfigRequests` state and `submitConfigRequest`/`resolveConfigRequest` functions
- **What's missing:** The `type=configure-agent` query parameter in `useGovernance.ts:96` is silently ignored by both the Next.js route (`app/api/v1/governance/requests/route.ts:89-93`) and headless router (`headless-router.ts:1367-1372`). The `listGovernanceRequests` function only supports `status`, `hostId`, and `agentId` filters -- NOT `type`. This means `pendingConfigRequests` will contain ALL pending governance requests (add-to-team, transfer-agent, etc.), not just configure-agent ones. The AgentSkillEditor then displays them all under "Pending Configuration Changes" with `req.payload.configuration?.operation` which returns undefined for non-config requests, falling back to `req.type`.
- **Evidence:**
  - `hooks/useGovernance.ts:96` sends `?type=configure-agent&status=pending`
  - `lib/governance-request-registry.ts:82-98` -- `listGovernanceRequests` filter has no `type` field
  - `services/headless-router.ts:1367-1372` -- only passes `status`, `hostId`, `agentId` from query
  - `app/api/v1/governance/requests/route.ts:89-93` -- same, no `type` filter

### [CV-P1-004] Claim: "Auto-rejection when COS removed" (11a safeguard)
- **Source:** Claims list, item #7; commit message Step 11
- **Severity:** SHOULD-FIX
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The Next.js API route `app/api/teams/[id]/chief-of-staff/route.ts:60-77` correctly implements auto-rejection of pending configure-agent requests from the removed COS when COS is set to null.
- **What's missing:** The headless router does NOT have a `/api/teams/:id/chief-of-staff` endpoint. Running `grep -i 'chief|cos' services/headless-router.ts` returns no matches. This means the 11a safeguard only works when using the full Next.js server mode, not in headless mode. If COS is removed via the headless API (which would go through `PUT /api/teams/:id`), the auto-reject logic is NOT triggered.
- **Evidence:**
  - `app/api/teams/[id]/chief-of-staff/route.ts:60-77` -- 11a safeguard present
  - `services/headless-router.ts` -- no chief-of-staff endpoint (grep returns 0 matches)
  - Headless router PUT teams endpoint at line 1564-1575 calls `updateTeamById()` which does NOT include the auto-reject logic

---


None.


---

## Nits & Suggestions


### [CC-P1-A0-004] `ConfigurationPayload` fields are all optional with no discriminated union
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance-request.ts:62-71
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `ConfigurationPayload` has an `operation` field that determines which other fields are relevant, but all other fields (`skills`, `plugins`, `hooks`, etc.) are optional. This means TypeScript won't catch cases where `operation: 'add-skill'` is set but `skills` is missing, or where `operation: 'update-model'` has irrelevant `skills` set. A discriminated union (`type AddSkillPayload = { operation: 'add-skill'; skills: string[]; scope: ConfigScope }`) would provide compile-time safety.

  The deploy service (`agents-config-deploy-service.ts`) does runtime validation (`if (!config.skills?.length)` etc.), so this is not a functional bug -- just a missed opportunity for compile-time enforcement.

- **Evidence:**
  ```typescript
  export interface ConfigurationPayload {
    operation: ConfigOperationType
    scope: ConfigScope
    skills?: string[]       // Only relevant for add-skill/remove-skill
    plugins?: string[]      // Only relevant for add-plugin/remove-plugin
    hooks?: Record<string, unknown>    // Only for update-hooks
    mcpServers?: Record<string, unknown> // Only for update-mcp
    model?: string          // Only for update-model
    programArgs?: string    // Only for update-program-args
  }
  ```

- **Fix:** Consider a discriminated union for stricter type safety. Low priority since runtime validation exists.

### [CC-P1-A0-005] Lock ordering comment does not mention `governance-requests` lock name
- **File:** /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts:13-22
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The lock ordering invariant comment in `file-lock.ts` lists `'teams'`, `'transfers'`, `'governance'` but the governance request registry uses `'governance-requests'` (a different lock name). This is actually correct behavior (separate locks for governance config vs governance requests), but the comment should document `governance-requests` as well to prevent future developers from assuming `governance` covers all governance operations.

- **Evidence:**
  ```typescript
  // file-lock.ts lines 17-18
  //   1. 'teams'
  //   2. 'transfers'
  //   3. 'governance'
  // But governance-request-registry.ts uses 'governance-requests'
  ```

- **Fix:** Add `'governance-requests'` to the lock ordering documentation in `file-lock.ts`.

### [CC-P1-A0-006] `approveGovernanceRequest` silently returns request unchanged for terminal states
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts:156
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** When `approveGovernanceRequest` is called on an already-rejected or already-executed request (line 156), it returns the request unchanged without any indication that the approval was not applied. Similarly, `rejectGovernanceRequest` on an executed request (line 208) and `executeGovernanceRequest` on a rejected request (line 229) silently return the unchanged request. Callers have no way to distinguish "approval was applied" from "request was already terminal" without checking the status themselves before and after.

  The cross-host-governance-service does check status after calling these functions, so this doesn't cause functional bugs, but returning `null` or a discriminated result (`{ applied: false, request }`) would be cleaner.

- **Evidence:**
  ```typescript
  // Line 155-156
  if (request.status === 'rejected' || request.status === 'executed') return request
  // Caller can't tell if approval was applied or not
  ```

- **Fix:** Consider returning a result type like `{ applied: boolean; request: GovernanceRequest }` or at minimum document this behavior in the JSDoc.


### [CC-P1-A4-005] Accessibility: approve/reject buttons lack `aria-label`
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:294-309
- **Severity:** NIT
- **Category:** accessibility
- **Confidence:** CONFIRMED
- **Description:** The approve and reject icon buttons have `title` attributes but no `aria-label`. Screen readers may not announce the purpose of these buttons clearly since the only content is an SVG icon.
- **Evidence:**
  ```tsx
  <button
    onClick={() => resolveConfigRequest(req.id, true)}
    className="p-1 rounded text-emerald-400 hover:bg-emerald-500/20 transition-colors"
    title="Approve"
  >
    <Check className="w-4 h-4" />
  </button>
  ```
- **Fix:** Add `aria-label="Approve configuration request"` and `aria-label="Reject configuration request"` to the respective buttons.

### [CC-P1-A4-006] Pending config display shows raw `req.type` as fallback, may be unclear to users
- **File:** /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:286-287
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The pending config request display uses `req.payload.configuration?.operation || req.type` as the label. If `configuration` is undefined, it falls back to `req.type` which is a value like `'configure-agent'` -- a machine-readable string, not user-friendly.
- **Evidence:**
  ```tsx
  <span className="text-sm text-amber-300">
    {req.payload.configuration?.operation || req.type}
  </span>
  ```
- **Fix:** Map `req.type` to a human-readable label (e.g., `'configure-agent'` -> `'Configuration Change'`), or provide a more descriptive fallback.

### [CC-P1-A4-007] `useGovernance` instantiated twice for same agentId in AgentProfile flow
- **File:** /Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx:55 and /Users/emanuelesabetta/ai-maestro/components/marketplace/AgentSkillEditor.tsx:70
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the Skills section is expanded in AgentProfile, `useGovernance(agentId)` runs both in AgentProfile.tsx (line 55) and in AgentSkillEditor.tsx (line 70). This causes two independent sets of fetch calls to the same 4 API endpoints (governance, teams, transfers, config requests), doubling the network traffic. Since there is no shared context/provider, each instance maintains separate state.
- **Evidence:**
  ```tsx
  // AgentProfile.tsx:55
  const governance = useGovernance(agentId || null)

  // AgentSkillEditor.tsx:70
  const { pendingConfigRequests, resolveConfigRequest, agentRole } = useGovernance(agentId)
  ```
- **Fix:** Consider passing the governance data from AgentProfile as props to AgentSkillEditor, or create a GovernanceContext provider at the AgentProfile level to share the state. Alternatively, accept the duplication as a reasonable tradeoff for component encapsulation (Phase 1 acceptable).


### [CC-P1-A5-003] Module 4 tests test mock call patterns rather than actual notification service logic
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:1220-1230
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The Module 4 ("config notifications") `describe` block acknowledges in its own comments (lines 1221-1232) that it cannot test the actual `notifyConfigRequestOutcome` function because `vi.mock` is hoisted and already mocks the module. Instead, all 6 tests verify that the cross-host-governance-service calls the mocked `notifyConfigRequestOutcome` with the correct arguments. This is valid integration-level testing of the calling code's behavior, but it provides zero coverage of the actual `config-notification-service.ts` logic (e.g., the AMP message format, tmux notification dispatch, the guard `if (request.type !== 'configure-agent') return`). A separate test file for the notification service would be needed for direct unit coverage.
- **Evidence:**
  ```typescript
  // Lines 1221-1232:
  // We need to import the real module (not the mock) for this section.
  // But the module is already mocked above for cross-host tests.
  // Instead, we test via the cross-host governance service's behavior,
  // which calls notifyConfigRequestOutcome.
  ```
- **Fix:** Consider creating a separate `config-notification-service.test.ts` that tests `notifyConfigRequestOutcome` directly with its own mocks for `fetch` and `child_process.exec`. This is not urgent since the integration-level call pattern tests provide reasonable confidence.

### [CC-P1-A5-004] `makeAgentWithSubconscious` factory return type is `Record<string, unknown>` instead of a proper mock type
- **File:** /Users/emanuelesabetta/ai-maestro/tests/agent-config-governance-extended.test.ts:303-310
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The factory function `makeAgentWithSubconscious` returns `Record<string, unknown>`, which loses all type information. The mock is used with `mockAgentRegistryGetAgent.mockResolvedValue(makeAgentWithSubconscious())` where `agentRegistry.getAgent` would return an Agent-like object with `getSubconscious()`. The test works because the runtime doesn't check the types, but a more specific return type would catch mismatches if the Agent class interface changes.
- **Evidence:**
  ```typescript
  function makeAgentWithSubconscious(overrides: Partial<Agent> = {}): Record<string, unknown> {
    return {
      id: AGENT_UUID,
      name: 'test-agent-runtime',
      getSubconscious: () => null,
      ...overrides,
    }
  }
  ```
- **Fix:** Use a more specific interface or at minimum `{ id: string; name: string; getSubconscious: () => unknown }` as the return type.

### [CC-P1-A5-005] `vi.waitFor` used for fire-and-forget fetch assertion relies on timing
- **File:** /Users/emanuelesabetta/ai-maestro/tests/governance-endpoint-auth.test.ts:220,255
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `sendRequestToRemoteHost` call in `submitCrossHostRequest` is fire-and-forget (`.catch()` on line 126 of the source). The tests use `vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))` to wait for the fire-and-forget fetch to complete. While this is more deterministic than the `setTimeout` it replaced (see comment CC-P4-004), `vi.waitFor` has a default timeout of 1000ms. In CI environments under load, the promise microtask queue may be delayed. The existing implementation is reasonable and there is a comment explaining the pattern.
- **Evidence:**
  ```typescript
  // Line 220:
  await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
  ```
- **Fix:** No immediate action needed. The `vi.waitFor` approach is the best available option for testing fire-and-forget patterns. If flakiness is observed in CI, consider adding an explicit `timeout` option to `vi.waitFor`.


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


### [CC-P1-A3-005] Inconsistent error response shape across routes
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/settings/route.ts:22,28 vs /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/skills/route.ts:25,31
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The skills/settings route wraps errors in `{ success: false, error: ... }` while the skills route uses `{ error: ... }` (no `success` field). This inconsistency in the same API family (both under `/api/agents/:id/skills/`) can confuse clients.
- **Evidence:**
```typescript
// skills/settings/route.ts:22
return NextResponse.json({ success: false, error: result.error }, { status: result.status })

// skills/route.ts:25
return NextResponse.json({ error: result.error }, { status: result.status })
```
- **Fix:** Standardize error response shape across the skills API family.

### [CC-P1-A3-006] `body.configuration || body` fallback could mask malformed payloads
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/config/deploy/route.ts:34
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The expression `body.configuration || body` silently accepts two payload shapes. If a caller sends `{ configuration: null, operation: "add-skill" }`, the `body.configuration` is falsy so it falls through to `body` (which has no `operation` at top level -- it has `configuration: null` and `operation`... actually wait, it does have `operation` at the top level in this case). This is more of a documentation/clarity issue. The fallback is not harmful because the downstream service validates `config.operation`.
- **Evidence:**
```typescript
const result = await deployConfigToAgent(id, body.configuration || body, auth.agentId)
```
- **Fix:** Consider explicit documentation or a clear comment explaining the two accepted payload shapes: `{ configuration: { operation: ... } }` and `{ operation: ... }`.

### [CC-P1-A3-007] Unused atomic rate limit function -- non-atomic pattern used instead
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:31-45
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The rate-limit module provides `checkAndRecordAttempt()` (NT-006) specifically to eliminate the TOCTOU window between `checkRateLimit()` and `recordFailure()`. While Node.js is single-threaded (so the TOCTOU is not exploitable in practice), using the atomic function is better practice and matches the stated intent of NT-006. The current code uses the separate check/record pattern.
- **Evidence:**
```typescript
// COS route uses separate calls:
const rateCheck = checkRateLimit('governance-cos-auth')   // line 31
// ... password check ...
recordFailure('governance-cos-auth')                       // line 41

// But rate-limit.ts provides the atomic version:
export function checkAndRecordAttempt(...) {  // line 50
  const result = checkRateLimit(...)
  if (result.allowed) { recordFailure(...) }
  return result
}
```
However, the current separate pattern is actually **correct for the COS use case**: the COS route only records failure when the password is wrong (line 41), whereas `checkAndRecordAttempt` records on every allowed attempt. The separate pattern is intentionally more precise here -- it only penalizes failed attempts, not successful ones. So this is purely a NIT about adding a clarifying comment.
- **Fix:** Add a comment on line 31 explaining why `checkAndRecordAttempt` is not used (only failures should be recorded, not all attempts). Or consider renaming `checkAndRecordAttempt` to `checkAndRecordIfAllowed` for clarity.


### [CC-P1-A1-010] `getStartupInfo` return type is `ServiceResult<any>`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1577
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The return type uses `any` instead of a properly typed interface, which defeats TypeScript's type checking for callers of this function.
- **Evidence:**
  ```typescript
  export function getStartupInfo(): ServiceResult<any> {
  ```
- **Fix:** Define a proper interface for the startup status data and use it instead of `any`.

### [CC-P1-A1-011] `proxyHealthCheck` return type is `ServiceResult<any>`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1594
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same as above -- the return type uses `any`.
- **Evidence:**
  ```typescript
  export async function proxyHealthCheck(url: string): Promise<ServiceResult<any>> {
  ```
- **Fix:** Type the expected health check response shape.

### [CC-P1-A1-012] `RegisterAgentParams` uses `[key: string]: any` index signature
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:124
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `[key: string]: any` index signature on `RegisterAgentParams` defeats TypeScript's type narrowing for the entire interface. Any property access will be typed as `any`.
- **Evidence:**
  ```typescript
  export interface RegisterAgentParams {
    sessionName?: string
    workingDirectory?: string
    id?: string
    deployment?: { cloud?: { websocketUrl: string } }
    [key: string]: any // Allow additional fields for cloud config
  }
  ```
- **Fix:** Use a separate `cloudConfig?: Record<string, unknown>` field instead of an index signature.

### [CC-P1-A1-013] Dead code: memory settings check in `saveSkillSettings` does nothing
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:301-306
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The code checks if `settings.memory` is truthy and retrieves the subconscious, but does nothing with it besides logging. This appears to be a placeholder for future functionality that was never implemented.
- **Evidence:**
  ```typescript
  if ((settings as any).memory) {
    const subconscious = agent.getSubconscious()
    if (subconscious) {
      console.log(`[Skills Service] Updated memory settings for agent ${agentId.substring(0, 8)}`)
    }
  }
  ```
- **Fix:** Either implement the intended behavior (e.g., pass the new memory settings to the subconscious), or remove this dead code block.

### [CC-P1-A1-014] Inconsistent agent registry API usage: sync `getAgent` from `agent-registry` vs async `agentRegistry.getAgent` from `agent.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:95 vs 251
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The file uses two different agent lookup methods: the synchronous `getAgent` from `@/lib/agent-registry` (lines 95, 165, 212) and the async `agentRegistry.getAgent` from `@/lib/agent` (lines 251, 286). These are two different agent systems (file-based vs in-memory) that may return different results. Functions like `getSkillSettings` and `saveSkillSettings` use the async version, while `updateSkills`, `addSkill`, and `removeSkill` use the sync version.
- **Evidence:**
  ```typescript
  // line 95 (sync, file-based registry)
  const agent = getAgent(agentId)
  // line 251 (async, in-memory agent class)
  const agent = await agentRegistry.getAgent(agentId)
  ```
- **Fix:** Standardize on one agent lookup method within the file, or document why different methods are used for different functions.

### [CC-P1-A1-015] `agents-config-deploy-service.ts` does not validate `agentId` as UUID
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:38-44
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Unlike `agents-skills-service.ts` (which validates UUID format at lines 246-248 and 281-283), the `deployConfigToAgent` function does not validate that `agentId` is a valid UUID. The `agentId` is not used directly in filesystem paths here (the `workingDirectory` from the registry is used instead), so this is lower severity. However, it's an inconsistency in input validation.
- **Evidence:**
  ```typescript
  export async function deployConfigToAgent(
    agentId: string,
    config: ConfigurationPayload,
    deployedBy?: string
  ): Promise<ServiceResult<ConfigDiff>> {
    const agent = getAgent(agentId)  // No UUID validation
  ```
- **Fix:** Add UUID validation consistent with other service files.


### [CC-P10-A0-011] `SkillPicker.tsx` passes no-op `onSkillsFound` to `RepoScanner`
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`:255
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** At line 255, `onSkillsFound` is passed as `() => {}` (no-op). The `RepoScanner` component calls this callback after a successful scan at line 50. While this is not a bug (the callback is optional behavior), it suggests either: (a) the callback is unnecessary and could be removed from `RepoScanner`'s interface, or (b) the `SkillPicker` should use it for something (e.g., showing a notification).
- **Evidence:**
  ```typescript
  <RepoScanner
    onSkillsFound={() => {}}
    onAddSkill={onAddSkill}
    selectedSkillKeys={selectedKeys}
  />
  ```
- **Fix:** Either make `onSkillsFound` optional in `RepoScannerProps` (with `?`) or implement useful behavior.

### [CC-P10-A0-012] Version validation regex does not support pre-release with `+` build metadata
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:61
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `SEMVER_RE` regex `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` accepts pre-release versions like `1.0.0-beta.1` but does not support build metadata like `1.0.0+build.123` or `1.0.0-beta.1+build.123`, which are valid semver. This is fine for plugin versioning (build metadata is rarely needed) but worth noting.
- **Evidence:**
  ```typescript
  const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
  ```
- **Fix:** If full semver support is desired: `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/`

### [CC-P10-A0-013] `page.tsx` client-side validation regex does not validate version format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/plugin-builder/page.tsx`:46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The client-side validation at line 44-47 checks that version is non-empty but does not check that it matches semver format. The server-side `validateBuildConfig` does check semver. This means the user can type an invalid version (e.g., "abc") and the Build button will be enabled, but the build will fail with a 400 error. A better UX would be to validate semver on the client side too.
- **Evidence:**
  ```typescript
  const isValid = name.trim().length > 0
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
    && version.trim().length > 0  // no semver check
    && skills.length > 0
  ```
- **Fix:** Add `&& /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)` to the client-side validation.

### [CC-P10-A0-014] `buildPlugin` logs array overwrites previous logs on error
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:375
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the `.catch` handler of `runBuild` at line 372-377, the error updates `logs` to `[err instanceof Error ? err.message : String(err)]`, replacing any logs that may have been added by `runBuild` internally. However, since `runBuild` also does its own error handling (line 600-612) and sets logs there, this `.catch` handler is only reached for truly unexpected errors (like if `runBuild` throws synchronously before setting up its own try/catch). In that case, replacing logs is acceptable. This is a minor observation.
- **Evidence:**
  ```typescript
  .catch(err => {
    const r = buildResults.get(buildId)
    if (r && r.status === 'building') {
      buildResults.set(buildId, {
        ...r,
        status: 'failed',
        logs: [err instanceof Error ? err.message : String(err)], // overwrites
      })
    }
  })
  ```
- **Fix:** Consider preserving existing logs: `logs: [...r.logs, err instanceof Error ? err.message : String(err)]`


### [CC-P10-A1-002] Non-null assertions on `result.data!` rely on implicit convention, not type narrowing
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts:19, /Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts:19, /Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts:28,43,63, /Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts:28, /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:37
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** All 7 uses of `result.data!` across the 5 API route files follow the same pattern: `if (result.error) return ...` followed by `result.data!`. The `ServiceResult<T>` type defines both `data?: T` and `error?: string` as optional, so TypeScript cannot narrow `data` to `T` after checking `error` is falsy. The non-null assertions are **safe at runtime** because:
  1. Every success path in the service functions (verified: `getHealthStatus`, `getProviderInfo`, `registerAgent`, `routeMessage`, `listPendingMessages`, `acknowledgePendingMessage`, `batchAcknowledgeMessages`) always returns `{ data: ..., status: ... }`.
  2. Every error path returns `{ error: ..., status: ... }` which is caught by the guard.

  However, this pattern is fragile: if a service function ever returns `{ status: 200 }` without `data`, the `!` would suppress the TypeScript warning and `NextResponse.json(undefined, ...)` would produce an empty/malformed response.

  A **better pattern** would be a discriminated union for `ServiceResult`:
  ```typescript
  type ServiceResult<T> =
    | { data: T; status: number; headers?: Record<string, string>; error?: never }
    | { error: string; status: number; headers?: Record<string, string>; data?: never }
  ```
  This would let TypeScript narrow `data` automatically after `if (result.error)` checks, eliminating all `!` assertions. This is a design improvement, not a bug -- all current uses are safe.

- **Evidence:**
  ```typescript
  // Example from health/route.ts (identical pattern in all 5 files):
  const result = getHealthStatus()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data!, {  // <-- ! assertion
    status: result.status,
    headers: result.headers
  })
  ```
- **Fix:** Consider refactoring `ServiceResult` to a discriminated union. Low priority since all current usages are verified safe.

### [CC-P10-A1-003] Priority cast relies on `||` fallback but lacks validation like `status` does
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:273
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `priority` field (line 273) uses `(envelope.priority || 'normal')` as a fallback and casts directly to the union type. Compare this with the `status` field (lines 250-253) which has explicit validation with `validStatuses.includes()`. If `envelope.priority` contains an unexpected string (e.g., `"critical"` from a future AMP version or a malformed file), the cast would pass a value that doesn't match any of the union members. This won't cause a runtime crash but could produce unexpected behavior in code that switches/matches on priority values.

  Similarly, `content.type` at line 276 uses `(payload.type || 'notification')` and casts directly without validation.

  The inconsistency between the validated `status` field and the unvalidated `priority` and `content.type` fields suggests a pattern that was partially applied.
- **Evidence:**
  ```typescript
  // Line 250-253: status is VALIDATED before cast
  const rawStatus = ampMsg.metadata?.status || ampMsg.local?.status || 'unread'
  const validStatuses: Message['status'][] = ['unread', 'read', 'archived']
  const status: Message['status'] = validStatuses.includes(rawStatus as Message['status']) ? (rawStatus as Message['status']) : 'unread'

  // Line 273: priority is NOT validated, just cast
  priority: (envelope.priority || 'normal') as 'high' | 'low' | 'normal' | 'urgent',

  // Line 276: content.type is NOT validated, just cast
  type: (payload.type || 'notification') as 'status' | 'system' | 'alert' | 'request' | 'response' | 'notification' | 'update' | 'task' | 'handoff' | 'ack',
  ```
- **Fix:** Apply the same validation pattern used for `status`:
  ```typescript
  const validPriorities: Message['priority'][] = ['low', 'normal', 'high', 'urgent']
  const rawPriority = envelope.priority || 'normal'
  const priority: Message['priority'] = validPriorities.includes(rawPriority as Message['priority'])
    ? (rawPriority as Message['priority']) : 'normal'
  ```

### [CC-P10-A1-004] Union type casts in agents-messaging-service.ts are safe but verbose
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-messaging-service.ts:221,227
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Lines 221 and 227 cast `priority` and `status` parameters (typed as `string` from the route query params) to their respective union types. These casts are **safe** because:
  1. Lines 213-214 validate `status` against `validStatuses` array and return 400 if invalid.
  2. Lines 216-217 validate `priority` against `validPriorities` array and return 400 if invalid.
  3. The function only reaches lines 221/227 after validation passes.

  The casts include `| undefined` in the union which correctly handles the case where the parameter was not provided (since the destructuring defaults are implicit `undefined`).
- **Evidence:**
  ```typescript
  // Validation (lines 210-218):
  const validStatuses = ['unread', 'read', 'archived']
  const validPriorities = ['low', 'normal', 'high', 'urgent']
  const { box = 'inbox', status, priority, from, to } = params
  if (status && !validStatuses.includes(status)) {
    return { error: `Invalid status...`, status: 400 }
  }
  if (priority && !validPriorities.includes(priority)) {
    return { error: `Invalid priority...`, status: 400 }
  }

  // Casts (lines 221, 227):
  const messages = await listAgentSentMessages(agentId, { priority: priority as 'high' | 'low' | 'normal' | 'urgent' | undefined, to })
  const messages = await listAgentInboxMessages(agentId, { status: status as 'unread' | 'read' | 'archived' | undefined, priority: priority as 'high' | 'low' | 'normal' | 'urgent' | undefined, from })
  ```
- **Fix:** No fix needed. The casts are safe after validation. Could be cleaned up with type aliases for readability but this is purely cosmetic.


### [CV-P1-005] `type` query filter missing from governance requests list API
- **Severity:** SHOULD-FIX
- **Files affected:**
  - `lib/governance-request-registry.ts:82-98` (listGovernanceRequests filter interface)
  - `services/cross-host-governance-service.ts:524-531` (listCrossHostRequests passthrough)
  - `services/headless-router.ts:1367-1372` (headless GET handler)
  - `app/api/v1/governance/requests/route.ts:78-100` (Next.js GET handler)
  - `hooks/useGovernance.ts:96` (UI consumer sends `type=configure-agent`)
- **Expected:** `type` query parameter should be supported for filtering governance requests
- **Found:** The `type` parameter is sent by the UI but silently ignored by both server implementations. The `listGovernanceRequests` filter interface only supports `status`, `hostId`, `agentId`.

---


None.


---

## Source Reports

- `epcp-correctness-P1-3408eab8-f0d4-4114-bee4-9d87f39b4dc0.md`
- `epcp-correctness-P1-3d927447-1513-4cb4-8989-cb94d384ac69.md`
- `epcp-correctness-P1-43d4b737-5df7-44d2-a2d7-5b31acfb03cb.md`
- `epcp-correctness-P1-525764f4-177f-4ada-8b4e-575384f68cb8.md`
- `epcp-correctness-P1-86e11eb0-e872-4e12-9d0d-2ac06f44ebf7.md`
- `epcp-correctness-P1-f3a6cd0f-28b9-4aa9-bf8a-5e7f356a34ac.md`
- `epcp-correctness-P10-4eb0b463-6a5f-4c16-8bc0-5acded1c514d.md`
- `epcp-correctness-P10-c1adbedc-06b2-49ff-b7ae-c24515a2b2a5.md`
- `epcp-claims-P1-c703d919-4f86-4e24-947b-8ef62d416552.md`
- `epcp-claims-P10-282c7b23-2b20-4293-9867-e933cb7551f4.md`
- `epcp-review-P1-2fe039a3-e6e0-4289-aef2-76d0e633622b.md`
- `epcp-review-P10-1d1655d9-89e3-47fc-a143-dcf35ca5ad6a.md`

