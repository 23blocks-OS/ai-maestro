# Step 11: Edge Case Safeguards Report
Generated: 2026-02-22T16:45:00Z

## Changes Made

### 11a: Auto-reject pending config requests when COS is removed
- **File:** `app/api/teams/[id]/chief-of-staff/route.ts` (lines 54-80)
- Captures `oldCosId` before `updateTeam` clears it
- After successful COS removal, filters pending `configure-agent` requests where `requestedBy === oldCosId`
- Calls `rejectGovernanceRequest()` for each with reason "COS role revoked for team '...'"
- Wrapped in try/catch to avoid blocking the COS removal response on failure

### 11b: Auto-reject pending config requests when target agent is deleted
- **File:** `services/agents-core-service.ts` (lines 716-731)
- After successful `deleteAgent()`, filters pending `configure-agent` requests where `payload.agentId === id`
- Calls `rejectGovernanceRequest()` for each with reason "Target agent deleted"
- Uses `requestingAgentId || 'system'` as rejector identity
- Wrapped in try/catch to avoid blocking the delete response on failure

### 11c: Duplicate deployment prevention (idempotent add-skill)
- **File:** `services/agents-config-deploy-service.ts` (lines 130-139)
- In `deployAddSkill`, when skill directory already exists AND has a valid SKILL.md, skips re-creation
- Sets `after[skillName] = 'present (unchanged)'` to distinguish from fresh deployments
- Uses `continue` to skip remaining loop body for that skill

### 11d: ToxicSkills check for cross-host content
- **File:** `services/agents-config-deploy-service.ts` (lines 149-161)
- After writing SKILL.md, attempts lazy import of `@/lib/toxic-skills`
- If scanner available and content is toxic: removes the skill directory and returns 403
- If scanner unavailable (module doesn't exist yet): silently skips (Phase 1 acceptable)

### 11e: Request TTL (7-day expiry for pending requests)
- **File:** `lib/governance-request-registry.ts`
- Added TTL logic inside `purgeOldRequests()` (lines 256-269): second pass auto-rejects pending requests older than 7 days
- Added standalone `expirePendingRequests(ttlDays)` export function (lines 288-312) for independent use
- Both set `status = 'rejected'` and `rejectReason = 'Request expired (TTL: 7d)'`

## Test Results
- 779 passed, 1 failed (pre-existing: `governance-endpoint-auth.test.ts` line 305)
- The failure is NOT caused by these changes -- it's a stale test expecting `configure-agent` to be "not yet implemented" but that type is now implemented in committed code (cross-host-governance-service.ts)
- All 27 other test files pass (75 tests in agents-core-service alone)
