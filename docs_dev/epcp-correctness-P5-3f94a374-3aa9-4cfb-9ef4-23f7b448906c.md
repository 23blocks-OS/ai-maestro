# Code Correctness Report: governance-core

**Agent:** epcp-code-correctness-agent
**Domain:** governance-core
**Pass:** 5
**Files audited:** 16
**Date:** 2026-02-22T04:21:00Z

## MUST-FIX

### [CC-P5-A2-001] G4 revocation skipped when team type changes from open to closed
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:347-369
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `updateTeam()` changes a team's type from `open` to `closed` without modifying `agentIds`, the G4 open-team revocation code does NOT run for existing members. The comment at line 349-350 says "MF-06: Always check when team is closed (not just when agentIds was explicitly provided), so that a type change to 'closed' also triggers revocation for existing members." However, the implementation at line 353 only processes "newly added" agents: `result2.agentIds.filter(aid => !previousAgentIds.includes(aid))`. When only the type changes (no agents added), `previousAgentIds` equals `result2.agentIds`, so `newlyAdded` is empty, and the `if (newlyAdded.length > 0)` guard at line 354 prevents any revocation.
- **Evidence:**
```typescript
// line 353-354
const newlyAdded = result2.agentIds.filter(aid => !previousAgentIds.includes(aid))
if (newlyAdded.length > 0) {
  // This block never runs when only type changes from open to closed
```
- **Fix:** When the type is changed to `closed`, revoke open-team memberships for ALL members of the team (not just newly added ones). The logic should check if the type changed from non-closed to closed, and if so, iterate over all `result2.agentIds` instead of just `newlyAdded`. Something like:
```typescript
const typeChangedToClosed = result2.type === 'closed' && previousType !== 'closed'
const agentsToCheck = typeChangedToClosed ? result2.agentIds : newlyAdded
if (agentsToCheck.length > 0) { ... }
```
Note: `previousType` needs to be captured before the update is applied (similar to `previousAgentIds`).

## SHOULD-FIX

### [CC-P5-A2-002] recipientHostId not validated by verifier -- cross-target replay prevention ineffective
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts`:68-81
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `createRoleAttestation()` function supports an optional `recipientHostId` field to bind an attestation to a specific target host (preventing cross-target replay attacks, per the comment at line 104 of `types/governance.ts`). However, `verifyRoleAttestation()` does not check that `attestation.recipientHostId` matches the verifying host's own ID. The signature verification succeeds regardless of which host receives the attestation, because the signed data includes the recipientHostId but the verifier never compares it against itself. The caller in `services/amp-service.ts:779` also does not perform this check.
- **Evidence:**
```typescript
// role-attestation.ts:68-81
export function verifyRoleAttestation(
  attestation: HostAttestation,
  expectedHostPublicKeyHex: string,
): boolean {
  const attestationAge = Date.now() - new Date(attestation.timestamp).getTime()
  if (attestationAge > ATTESTATION_MAX_AGE_MS || attestationAge < 0) {
    return false
  }
  // No check: attestation.recipientHostId === currentHostId
  const data = buildAttestationData(attestation)
  return verifyHostAttestation(data, attestation.signature, expectedHostPublicKeyHex)
}
```
- **Fix:** Add an optional `expectedRecipientHostId` parameter to `verifyRoleAttestation()`. When provided, verify that `attestation.recipientHostId === expectedRecipientHostId`. If the attestation has a recipientHostId that doesn't match, return false. The caller in `amp-service.ts` should pass `getSelfHostId()` as this parameter.

### [CC-P5-A2-003] Non-atomic write in saveTransfers -- crash can corrupt governance-transfers.json
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:56-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `saveTransfers()` writes directly to the target file using `writeFileSync()` instead of using the atomic temp-file-then-rename pattern used by every other save function in this domain (`saveGovernance`, `saveGovernanceRequests`, `saveManagerTrust`, `savePeerGovernance`, `saveTeams`). If the process crashes mid-write, the file will be left in a half-written, corrupt state.
- **Evidence:**
```typescript
// transfer-registry.ts:56-60
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  writeFileSync(TRANSFERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  // Should be: write to .tmp then renameSync, like saveGovernance()
}
```
- **Fix:** Use the atomic write pattern:
```typescript
function saveTransfers(requests: TransferRequest[]): void {
  ensureDir()
  const data: TransfersFile = { version: 1, requests }
  const tmpFile = TRANSFERS_FILE + '.tmp'
  writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpFile, TRANSFERS_FILE)
}
```
Note: `renameSync` must be imported from `'fs'` (it already imports `existsSync`, `copyFileSync`, etc. but not `renameSync`).

### [CC-P5-A2-004] handleGovernanceSyncMessage does not validate payload fields before type assertion
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts`:185-189
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `handleGovernanceSyncMessage()` uses `as` to type-assert `message.payload` without validating that the expected fields (`managerId`, `managerName`, `teams`) actually exist and have the correct types. A malicious or buggy peer could send a payload missing these fields, and the code would proceed with `undefined` values silently stored to disk.
- **Evidence:**
```typescript
// governance-sync.ts:185-189
const { managerId, managerName, teams } = message.payload as {
  managerId: string | null
  managerName: string | null
  teams: PeerTeamSummary[]
}
```
Line 196 has a partial mitigation (`Array.isArray(teams) ? teams : []`), but `managerId` and `managerName` are not validated. If the payload is `{ teams: "not-an-array" }`, `managerId` and `managerName` would be `undefined`, which gets stored as-is (they are typed as `string | null` but could actually be `undefined`).
- **Fix:** Add runtime validation for the extracted fields, e.g.:
```typescript
const managerId = typeof message.payload.managerId === 'string' ? message.payload.managerId : null
const managerName = typeof message.payload.managerName === 'string' ? message.payload.managerName : null
const teams = Array.isArray(message.payload.teams) ? message.payload.teams : []
```

## NIT

### [CC-P5-A2-005] isChiefOfStaffAnywhere checks all teams but does not guard against null chiefOfStaffId matching
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/governance.ts`:147-152
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `isChiefOfStaffAnywhere()` has a null guard on `agentId` (line 148) but does not guard against `team.chiefOfStaffId` being null. If a closed team has `chiefOfStaffId: null` (which should not normally happen due to the G5 auto-downgrade rule, but could occur due to data corruption or race conditions), the comparison `null === agentId` would be false (since agentId is a non-empty string after the null guard), so there's no actual bug. However, this contrasts with `isChiefOfStaff()` which explicitly handles this by checking `team.chiefOfStaffId === agentId` after the null guard, where the same logic applies. Both are safe but the pattern is subtly different from `isManager` which explicitly checks `!config.managerId`.
- **Evidence:**
```typescript
// governance.ts:147-152
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  const teams = loadTeams()
  return teams.some(
    (team) => team.type === 'closed' && team.chiefOfStaffId === agentId
  )
}
```
- **Fix:** No bug, but for consistency with the defensive pattern in `isManager()`, consider the explicit guard or a comment noting why it's safe.

### [CC-P5-A2-006] GovernanceRole type alias adds indirection without value
- **File:** `/Users/emanuelesabetta/ai-maestro/types/governance.ts`:19
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceRole` is a type alias for `AgentRole` with a comment saying they are the same thing. The alias does not add semantic distinction or constraints. Callers that use `GovernanceRole` instead of `AgentRole` add indirection that makes the codebase harder to navigate.
- **Evidence:**
```typescript
export type GovernanceRole = AgentRole
```
- **Fix:** Consider removing `GovernanceRole` and using `AgentRole` directly everywhere. If kept for documentation purposes, ensure it's used consistently.

### [CC-P5-A2-007] Unused import: `renameSync` missing from transfer-registry.ts imports for atomic write fix
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts`:9
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The import statement imports `{ readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync }` from `'fs'` but does NOT include `renameSync`, which is needed if the atomic write fix (CC-P5-A2-003) is applied. This is not a current bug, but rather a note for the fix implementation.
- **Evidence:**
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
```
- **Fix:** When applying CC-P5-A2-003, add `renameSync` to the import.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/governance-request.ts` -- Well-structured types with clear state machine definition and proper defaults
- `/Users/emanuelesabetta/ai-maestro/types/host.ts` -- Clean type definitions with good documentation
- `/Users/emanuelesabetta/ai-maestro/types/team.ts` -- Comprehensive team types with proper state machine for meetings
- `/Users/emanuelesabetta/ai-maestro/types/agent.ts` -- Thorough agent type system with proper session name parsing
- `/Users/emanuelesabetta/ai-maestro/types/service.ts` -- Minimal, clean ServiceResult generic
- `/Users/emanuelesabetta/ai-maestro/types/session.ts` -- Clean session type definition
- `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` -- Proper null guards, atomic writes, bcrypt with good salt rounds, file corruption handling
- `/Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts` -- Proper path traversal validation, TTL expiry logic correct, atomic writes
- `/Users/emanuelesabetta/ai-maestro/lib/host-keys.ts` -- Good key management with proper permissions (0o700/0o600), atomic writes, DER length validation
- `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts` -- Proper lock usage, approval state machine logic correct, atomic writes
- `/Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts` -- Clean CRUD with proper lock usage, shouldAutoApprove logic correct
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- ACL logic correct with proper ordering, Phase 1 limitations documented

## Test Coverage Notes

- `lib/role-attestation.ts` has thorough tests in `tests/role-attestation.test.ts` but no test for recipientHostId validation (because validation doesn't exist yet -- CC-P5-A2-002)
- `lib/transfer-registry.ts` -- no dedicated test file found for this module
- `lib/team-registry.ts` `updateTeam()` -- the type-change-to-closed G4 revocation path (CC-P5-A2-001) appears untested based on the MF-06 comment being only in this file
- `lib/governance-sync.ts` `handleGovernanceSyncMessage()` -- no test for malformed payload handling

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
- [x] My report file uses the UUID filename: epcp-correctness-P5-3f94a374-3aa9-4cfb-9ef4-23f7b448906c.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
