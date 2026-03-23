# Code Correctness Report: types-lib

**Agent:** epcp-code-correctness-agent
**Domain:** types-lib
**Files audited:** 4
**Date:** 2026-02-22T17:58:00Z
**Pass:** 3
**Finding ID Prefix:** CC-P3-A0

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P3-A0-001] approveGovernanceRequest returns non-null for terminal states, enabling potential double-execution
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:170
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `approveGovernanceRequest` returns the unchanged request (non-null) when the request is in a terminal state (`'rejected'` or `'executed'`). The callers in `cross-host-governance-service.ts` (line 289-296) use `if (!updated)` to detect failure (null = not found), then check `if (updated.status === 'executed')` to trigger `performRequestExecution`. If an already-executed request is approved again, `approveGovernanceRequest` returns it with `status === 'executed'` unchanged, and the caller re-executes the mutation. This is a silent double-execution risk.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:170
  if (request.status === 'rejected' || request.status === 'executed') return request

  // cross-host-governance-service.ts:289-296
  const updated = await approveGovernanceRequest(requestId, approverAgentId, approverType)
  if (!updated) {
    return { error: `Failed to approve request '${requestId}'`, status: 500 }
  }
  if (updated.status === 'executed') {
    await performRequestExecution(updated)  // Double-execution if already was 'executed'
  }
  ```
- **Fix:** Either (a) return `null` for terminal states (breaking change -- update callers), or (b) add a boolean flag to the return indicating whether the approval was actually applied (e.g., `{ request, applied: boolean }`), or (c) have callers compare status before/after to detect no-op. The simplest immediate fix: callers should check if the status *transitioned* to 'executed' rather than just checking if it *is* 'executed'. Alternatively, add a pre-check in the API route: `if (request.status === 'executed' || request.status === 'rejected') return { error: 'Request already finalized', status: 409 }`.
- **Note:** The `rejectGovernanceRequest` has the same pattern (returns non-null for already-executed requests) but the caller does not branch on status after rejection, so the impact there is lower (just returns a 200 with the unchanged request, which is arguably misleading but not harmful).

### [CC-P3-A0-002] listGovernanceRequests filter.type is typed as `string` instead of `GovernanceRequestType`
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:94
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `type` field in the filter parameter of `listGovernanceRequests` is typed as `string`, but the actual `GovernanceRequest.type` field is `GovernanceRequestType` (a union of string literals). This loses type safety -- callers can pass any arbitrary string without a compile-time error. The same issue exists in the `cross-host-governance-service.ts` caller which also declares `type?: string`.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:93-94
  export function listGovernanceRequests(filter?: {
    status?: GovernanceRequestStatus
    type?: string              // Should be GovernanceRequestType
    hostId?: string
    agentId?: string
  }): GovernanceRequest[] {
  ```
- **Fix:** Change `type?: string` to `type?: GovernanceRequestType` in both `listGovernanceRequests` and its caller in `cross-host-governance-service.ts`. The import for `GovernanceRequestType` is already present at line 16.

## NIT

### [CC-P3-A0-003] loadGovernanceRequests returns spread of DEFAULT but DEFAULT already has empty requests
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:40
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On line 40, after writing defaults to disk, the function returns `{ ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }`. The spread is redundant because `DEFAULT_GOVERNANCE_REQUESTS_FILE` already has `requests: []` (line 125 of governance-request.ts). The explicit `requests: []` override was presumably added for defensive clarity but is a no-op.
- **Evidence:**
  ```typescript
  // governance-request-registry.ts:39-40
  saveGovernanceRequests(DEFAULT_GOVERNANCE_REQUESTS_FILE)
  return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }

  // governance-request.ts:123-126
  export const DEFAULT_GOVERNANCE_REQUESTS_FILE: GovernanceRequestsFile = {
    version: 1,
    requests: [],
  }
  ```
- **Fix:** Change to `return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE }` or simply `return structuredClone(DEFAULT_GOVERNANCE_REQUESTS_FILE)`. The spread is still important to avoid returning the mutable singleton.

### [CC-P3-A0-004] Empty catch block in corruption backup is too silent
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts`:55
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The catch block `catch { /* backup is best-effort */ }` at line 55 silently swallows errors during the backup of a corrupted governance-requests.json file. While the backup IS best-effort, losing the backup silently on a permissions error (e.g., disk full, read-only filesystem) means the corrupted data is lost with no trace.
- **Evidence:**
  ```typescript
  try {
    const backupPath = REQUESTS_FILE + '.corrupted.' + Date.now()
    fs.copyFileSync(REQUESTS_FILE, backupPath)
    console.error(`[governance-requests] Corrupted file backed up to ${backupPath}`)
  } catch { /* backup is best-effort */ }
  ```
- **Fix:** Add a `console.warn` in the catch block: `catch (backupErr) { console.warn('[governance-requests] Failed to backup corrupted file:', backupErr) }`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/governance-request.ts` -- Well-structured type definitions with clear discriminated unions and documentation. No issues.
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- Lock implementation with timeout, proper cleanup on timeout race, correct queue management. No issues.
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` -- Simple UUID regex validation, case-insensitive, correct pattern. No issues.

## Test Coverage Notes

- `governance-request-registry.ts`: Tests exist for all exported functions including `purgeOldRequests` (PurgeResult contract), `expirePendingRequests`, `listGovernanceRequests` (with type filter), `approveGovernanceRequest` (including terminal state guards). Tests correctly use `result.purged` and `result.expired` for the new PurgeResult type.
- `file-lock.ts`: Not directly tested in isolation, but exercised transitively through all governance registry tests.
- `validation.ts`: Used across multiple service files; `isValidUuid` tests may exist in endpoint-level tests.
- Missing test: No explicit test for the double-execution scenario described in CC-P3-A0-001 (approving an already-executed request and checking that `performRequestExecution` is NOT called again).

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P3-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P3-b84ce2f3-9779-46c5-9ed3-567e42b0efd1.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
