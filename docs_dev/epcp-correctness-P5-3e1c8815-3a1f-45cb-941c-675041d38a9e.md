# Code Correctness Report: governance-libs

**Agent:** epcp-code-correctness-agent
**Domain:** governance-libs
**Files audited:** 3
**Date:** 2026-02-22T18:53:00Z
**Pass:** 5
**Finding ID Prefix:** CC-P5-A2

## MUST-FIX

_No MUST-FIX issues found._

## SHOULD-FIX

### [CC-P5-A2-001] Rate-limit check/record is not atomic in submitCrossHostRequest, approveCrossHostRequest, rejectCrossHostRequest
- **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:71-82, 254-266, 343-355
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** All three password-gated functions (submit, approve, reject) use the pattern `checkRateLimit()` -> `verifyPassword()` -> `recordFailure()`. There is a `checkAndRecordAttempt()` atomic helper available in `lib/rate-limit.ts` (NT-006, line 50) that was added specifically to eliminate the window between check and record. However, the current code does not use it. In the current pattern, two concurrent requests with wrong passwords could both pass `checkRateLimit()` before either calls `recordFailure()`, allowing an attacker to bypass the rate limit by one extra attempt per concurrent batch. This is a minor race in the single-process Phase 1 model (Node.js event loop serializes synchronous code), but `verifyPassword` is async (bcrypt.compare), so there IS a window where two concurrent requests can both pass the check before either records failure.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:71-82 (submit)
  const rateCheck = checkRateLimit(submitRateLimitKey)
  if (!rateCheck.allowed) { ... }
  if (!(await verifyPassword(params.password))) {  // <-- yields here
    recordFailure(submitRateLimitKey)               // <-- another request could pass checkRateLimit during the await
    ...
  }
  ```
  The same pattern appears at lines 254-266 (approve) and 343-355 (reject).
  Meanwhile, `checkAndRecordAttempt()` exists at `lib/rate-limit.ts:50` and atomically checks + records.
- **Fix:** Replace the `checkRateLimit` + `recordFailure` pattern with `checkAndRecordAttempt` for each of the three functions, and call `resetRateLimit` only on success. Alternatively, record the attempt BEFORE verifying the password and reset on success -- this is the standard approach for rate limiting authentication. Example:
  ```typescript
  const rateCheck = checkAndRecordAttempt(submitRateLimitKey)
  if (!rateCheck.allowed) { return 429 }
  if (!(await verifyPassword(params.password))) { return 401 }
  resetRateLimit(submitRateLimitKey) // success - clear the failure record
  ```

### [CC-P5-A2-002] `expirePendingRequestsInPlace` only expires 'pending' status, not intermediate approval statuses
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:264-278
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The TTL expiry helper only checks `req.status === 'pending'`. Requests in 'remote-approved', 'local-approved', or 'dual-approved' states are NOT expired even if they are older than 7 days. These intermediate states represent requests where one side approved but the other never did -- they can accumulate indefinitely without ever transitioning to a terminal state. The `purgeOldRequests` function at line 310-314 only purges terminal-state requests ('executed'/'rejected'). This means a request stuck in 'local-approved' for 90 days will never be cleaned up.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:267-276
  for (const req of requests) {
    if (req.status === 'pending') {        // <-- only 'pending'
      const createdAt = new Date(req.createdAt).getTime()
      if (createdAt < cutoff) {
        req.status = 'rejected'
        ...
      }
    }
  }
  ```
  Intermediate statuses ('remote-approved', 'local-approved', 'dual-approved') are ignored.
- **Fix:** Include intermediate approval statuses in the TTL check. For example:
  ```typescript
  const NON_TERMINAL = ['pending', 'remote-approved', 'local-approved', 'dual-approved']
  if (NON_TERMINAL.includes(req.status)) { ... }
  ```

### [CC-P5-A2-003] `receiveCrossHostRequest` validates `request.requestedByRole` but not `request.requestedBy`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:164-166
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The function validates that `request.id`, `request.type`, and `request.payload.agentId` exist, and validates that `request.requestedByRole` is a valid role. But it does not validate `request.requestedBy` (the requester's agent ID). A malicious peer could send an empty or crafted `requestedBy` string that later gets used in `shouldAutoApprove()` (line 221) to check against `trust.managerId`. While the auto-approve check itself is safe (empty string would not match a UUID), there's no validation that `requestedBy` is a non-empty string, which could lead to confusing audit trails.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:164-166
  if (!request.id || !request.type || !request.payload?.agentId) {
    return { error: 'Invalid governance request: missing id, type, or payload.agentId', status: 400 }
  }
  // requestedBy is NOT checked here or anywhere else in the function
  ```
- **Fix:** Add `!request.requestedBy` to the validation check at line 165:
  ```typescript
  if (!request.id || !request.type || !request.payload?.agentId || !request.requestedBy) {
  ```

### [CC-P5-A2-004] `deployUpdateSettings` performs non-atomic write to settings.json
- **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts`:331-351
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `deployUpdateSettings` function reads `settings.json`, modifies it in memory, then writes it back directly with `fs.writeFile()`. Unlike `saveGovernanceRequests()` which uses atomic temp-file-then-rename, this function writes directly to the target file. If the process crashes mid-write, the settings.json file could be left in a corrupted/truncated state. Additionally, there is no file-level locking -- concurrent `bulk-config` deployments to the same agent could race.
- **Evidence:**
  ```typescript
  // agents-config-deploy-service.ts:351
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
  ```
  Compare with the atomic pattern used elsewhere:
  ```typescript
  // governance-request-registry.ts:70-72
  const tmpFile = REQUESTS_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, REQUESTS_FILE)
  ```
- **Fix:** Use the same atomic write pattern: write to `settingsPath + '.tmp'`, then `fs.rename()`:
  ```typescript
  const tmpPath = settingsPath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8')
  await fs.rename(tmpPath, settingsPath)
  ```

## NIT

### [CC-P5-A2-005] `performRequestExecution` swallows execution failures silently
- **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:398-400, 546-549
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The comment at line 398-400 acknowledges that the request status is 'executed' before `performRequestExecution` runs, and that execution failures are logged but not reflected in the request status. This is already documented as a Phase 2 concern ("A proper fix would add a 'failed' status"). No action needed now, but noting for completeness. The try/catch at line 546 ensures failures never propagate, which is correct for the current design.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:398-400
  // NOTE: Execution failures are logged but do not propagate to callers.
  // The request status is already 'executed' before this runs.
  // A proper fix would add a 'failed' status to GovernanceRequestStatus (Phase 2).
  ```

### [CC-P5-A2-006] `loadGovernanceRequests` does not validate the `version` field
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:42-45
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The parsed JSON is cast to `GovernanceRequestsFile` without validating that `version === 1` or that `requests` is an array. If the file format evolves in Phase 2 with a version bump, loading a v2 file with v1 code would silently produce wrong results. This is a defense-in-depth concern, not a current bug.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:44
  const parsed: GovernanceRequestsFile = JSON.parse(data)
  return parsed  // no validation of parsed.version or Array.isArray(parsed.requests)
  ```
- **Fix:** Add a version guard: `if (parsed.version !== 1) { throw new Error(...) }`

### [CC-P5-A2-007] `receiveCrossHostRequest` uses a spread that could carry unexpected fields
- **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:207-212
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The received request is stored with `...request` spread, then specific fields are overwritten. Any extra fields in the remote-sent `request` object that are not part of the `GovernanceRequest` type will be persisted to disk. While TypeScript types prevent this at compile time, at runtime any JSON field from a malicious peer would be stored. The explicit overrides for `status` and `approvals` are correct.
- **Evidence:**
  ```typescript
  // cross-host-governance-service.ts:207-212
  file.requests.push({
    ...request,                                    // <-- any extra fields persist
    status: 'pending' as GovernanceRequestStatus,
    approvals: {},
    updatedAt: new Date().toISOString(),
  })
  ```
- **Fix:** Destructure only known fields instead of spreading the entire object. E.g.:
  ```typescript
  file.requests.push({
    id: request.id,
    type: request.type,
    sourceHostId: request.sourceHostId,
    targetHostId: request.targetHostId,
    // ... etc
    status: 'pending',
    approvals: {},
    updatedAt: new Date().toISOString(),
  })
  ```

### [CC-P5-A2-008] No test coverage for `agents-config-deploy-service.ts`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts`
- **Severity:** NIT
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** There is no test file for `agents-config-deploy-service.ts`. Tests exist for `governance-request-registry.test.ts` and `cross-host-governance.test.ts`, but config deployment operations (skill/plugin add/remove, settings merge, bulk config) have no automated test coverage. This is the service that writes to agent `.claude/` directories -- bugs here could corrupt agent configurations.
- **Fix:** Create `tests/agents-config-deploy-service.test.ts` covering at minimum: add-skill (new and idempotent), remove-skill, path traversal rejection, settings merge behavior, bulk-config with multiple operations.

## CLEAN

Files with no issues found:
- _None -- all three files have at least one finding._

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P5-A2-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P5-3e1c8815-3a1f-45cb-941c-675041d38a9e.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (CC-P5-A2-008)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (none are fully clean)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
