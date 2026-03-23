# EPCP Pass 4 Fixes: governance-libs domain
Generated: 2026-02-22T18:46:00Z

## Findings Fixed: 5/5

### SF-003 (SHOULD-FIX) -- TOCTOU race in approveCrossHostRequest
**File:** `services/cross-host-governance-service.ts`
**Fix:** Captured `preApprovalStatus` before calling `approveGovernanceRequest()`. After the call returns, execution only proceeds if `preApprovalStatus` was non-terminal AND `updated.status` became `'executed'`. This closes the window where a concurrent approver could cause double execution.

### SF-004 (SHOULD-FIX) -- Auto-approve only new requests in receiveCrossHostRequest
**File:** `services/cross-host-governance-service.ts`
**Fix:** Changed `withLock` callback to return a boolean (`isNew`). Returns `true` when a new request is inserted, `false` when a duplicate is skipped. The auto-approve block now gates on `isNew && shouldAutoApprove(request)` to prevent re-approving duplicates.

### SF-016 (SHOULD-FIX) -- ToxicSkills TODO comment clarity
**File:** `services/agents-config-deploy-service.ts`
**Fix:** Replaced the vague TODO with a clear `TODO(Phase 2)` comment stating that deployed skills are NOT scanned for malicious content, referencing `lib/toxic-skills.ts` (to be created).

### NT-004 (NIT) -- JSDoc for purgeOldRequests time windows
**File:** `lib/governance-request-registry.ts`
**Fix:** Expanded the JSDoc to explicitly document the two time windows: pending requests expire after 7 days (auto-rejected), terminal-state requests purge after maxAgeDays (default 30).

### NT-005 (NIT) -- Status naming convention comment
**File:** `lib/governance-request-registry.ts`
**Fix:** Added a naming convention block to the `approveGovernanceRequest` JSDoc explaining that 'remote-approved'/'local-approved' are from the target host's perspective: 'remote' = the source host approved it, 'local' = the target host approved it.
