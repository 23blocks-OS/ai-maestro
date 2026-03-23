# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:34.498Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P5-3e1c8815-3a1f-45cb-941c-675041d38a9e.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P5-3e1c8815-3a1f-45cb-941c-675041d38a9e.md
Line 1: # Code Correctness Report: governance-libs
Line 2: **Agent:** epcp-code-correctness-agent
Line 3: **Domain:** governance-libs
Line 4: **Files audited:** 3
Line 5: **Date:** 2026-02-22T18:53:00Z
Line 6: **Pass:** 5
Line 7: **Finding ID Prefix:** CC-P5-A2
Line 12: ### [CC-P5-A2-001] Rate-limit check/record is not atomic in submitCrossHostRequest, approveCrossHostRequest, rejectCrossHostRequest
Line 13: - **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:71-82, 254-266, 343-355
Line 14: - **Severity:** SHOULD-FIX
Line 15: - **Category:** race-condition
Line 16: - **Confidence:** CONFIRMED
Line 17: - **Description:** All three password-gated functions (submit, approve, reject) use the pattern `checkRateLimit()` -> `verifyPassword()` -> `recordFailure()`. There is a `checkAndRecordAttempt()` atomic helper available in `lib/rate-limit.ts` (NT-006, line 50) that was added specifically to eliminate the window between check and record. However, the current code does not use it. In the current pattern, two concurrent requests with wrong passwords could both pass `checkRateLimit()` before either calls `recordFailure()`, allowing an attacker to bypass the rate limit by one extra attempt per concurrent batch. This is a minor race in the single-process Phase 1 model (Node.js event loop serializes synchronous code), but `verifyPassword` is async (bcrypt.compare), so there IS a window where two concurrent requests can both pass the check before either records failure.
Line 20:   // cross-host-governance-service.ts:71-82 (submit)
Line 29:   Meanwhile, `checkAndRecordAttempt()` exists at `lib/rate-limit.ts:50` and atomically checks + records.
Line 30: - **Fix:** Replace the `checkRateLimit` + `recordFailure` pattern with `checkAndRecordAttempt` for each of the three functions, and call `resetRateLimit` only on success. Alternatively, record the attempt BEFORE verifying the password and reset on success -- this is the standard approach for rate limiting authentication. Example:
Line 37: ### [CC-P5-A2-002] `expirePendingRequestsInPlace` only expires 'pending' status, not intermediate approval statuses
Line 38: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:264-278
Line 39: - **Severity:** SHOULD-FIX
Line 40: - **Category:** logic
Line 41: - **Confidence:** CONFIRMED
Line 42: - **Description:** The TTL expiry helper only checks `req.status === 'pending'`. Requests in 'remote-approved', 'local-approved', or 'dual-approved' states are NOT expired even if they are older than 7 days. These intermediate states represent requests where one side approved but the other never did -- they can accumulate indefinitely without ever transitioning to a terminal state. The `purgeOldRequests` function at line 310-314 only purges terminal-state requests ('executed'/'rejected'). This means a request stuck in 'local-approved' for 90 days will never be cleaned up.
Line 45:   // governance-request-registry.ts:267-276
Line 54: ### [CC-P5-A2-003] `receiveCrossHostRequest` validates `request.requestedByRole` but not `request.requestedBy`
Line 55: - **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:164-166
Line 56: - **Severity:** SHOULD-FIX
Line 57: - **Category:** security
Line 58: - **Confidence:** CONFIRMED
Line 59: - **Description:** The function validates that `request.id`, `request.type`, and `request.payload.agentId` exist, and validates that `request.requestedByRole` is a valid role. But it does not validate `request.requestedBy` (the requester's agent ID). A malicious peer could send an empty or crafted `requestedBy` string that later gets used in `shouldAutoApprove()` (line 221) to check against `trust.managerId`. While the auto-approve check itself is safe (empty string would not match a UUID), there's no validation that `requestedBy` is a non-empty string, which could lead to confusing audit trails.
Line 62:   // cross-host-governance-service.ts:164-166
Line 68: ### [CC-P5-A2-004] `deployUpdateSettings` performs non-atomic write to settings.json
Line 69: - **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts`:331-351
Line 70: - **Severity:** SHOULD-FIX
Line 71: - **Category:** race-condition
Line 72: - **Confidence:** CONFIRMED
Line 73: - **Description:** The `deployUpdateSettings` function reads `settings.json`, modifies it in memory, then writes it back directly with `fs.writeFile()`. Unlike `saveGovernanceRequests()` which uses atomic temp-file-then-rename, this function writes directly to the target file. If the process crashes mid-write, the settings.json file could be left in a corrupted/truncated state. Additionally, there is no file-level locking -- concurrent `bulk-config` deployments to the same agent could race.
Line 76:   // agents-config-deploy-service.ts:351
Line 79:   // governance-request-registry.ts:70-72
Line 87: ### [CC-P5-A2-005] `performRequestExecution` swallows execution failures silently
Line 88: - **File:** `/Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts`:398-400, 546-549
Line 89: - **Severity:** NIT
Line 90: - **Category:** logic
Line 91: - **Confidence:** CONFIRMED
Line 92: - **Description:** The comment at line 398-400 acknowledges that the request status is 'executed' before `performRequestExecution` runs, and that execution failures are logged but not reflected in the request status. This is already documented as a Phase 2 concern ("A proper fix would add a 'failed' status"). No action needed now, but noting for completeness. The try/catch at line 546 ensures failures never propagate, which is correct for the current design.
Line 95:   // cross-host-governance-service.ts:398-400
Line 101: ### [CC-P5-A2-006] `loadGovernanceRequests` does not validate the `version` field
Line 102: - **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:42-45
Line 103: - **Severity:** NIT
Line 104: - **Category:** type-safety
Line 105: - **Confidence:** CONFIRMED
Line 106: - **Description:** The parsed JSON is cast to `GovernanceRequestsFile` without validating that `version === 1` or that `requests` is an array. If the file format evolves in Phase 2 with a version bump, loading a v2 file with v1 code would silently produce wrong results. This is a defense-in-depth concern, not a current bug.
Line 108:   // governance-request-registry.ts:44
Line 112: ### [CC-P5-A2-007] `receiveCrossHostRequest` uses