# Claim Verification Report

**Agent:** epcp-claim-verification-agent
**PR:** feature/team-governance vs main
**Pass:** 7
**Date:** 2026-02-22T22:30:00Z
**Claims extracted:** 16
**Verified:** 14 | **Failed:** 0 | **Partial:** 2 | **Unverifiable:** 0

---

## PARTIALLY IMPLEMENTED (SHOULD-FIX)

### [CV-P7-001] Claim: "169 new tests across 9 test files"
- **Source:** CHANGELOG.md line 19, v0.26.0 section
- **Severity:** SHOULD-FIX (documentation inaccuracy, not a code bug)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** All 9 test files exist exactly as named: governance-peers, governance-sync, host-keys, role-attestation, governance-request-registry, cross-host-governance, manager-trust, agent-config-governance, governance-endpoint-auth. All files contain real tests with real assertions.
- **What's missing:** The actual test count across these 9 files is **196** (20+16+15+27+34+40+15+16+13), not 169. Additionally there is a 10th file `agent-config-governance-extended.test.ts` with 56 more tests that is not mentioned. The 169 figure was likely correct at an earlier commit but subsequent fix passes added tests without updating the CHANGELOG count.
- **Evidence:**
  - tests/governance-peers.test.ts: 20 `it()` calls
  - tests/governance-sync.test.ts: 16 `it()` calls
  - tests/host-keys.test.ts: 15 `it()` calls
  - tests/role-attestation.test.ts: 27 `it()` calls
  - tests/governance-request-registry.test.ts: 34 `it()` calls
  - tests/cross-host-governance.test.ts: 40 `it()` calls
  - tests/manager-trust.test.ts: 15 `it()` calls
  - tests/agent-config-governance.test.ts: 16 `it()` calls
  - tests/governance-endpoint-auth.test.ts: 13 `it()` calls
  - tests/agent-config-governance-extended.test.ts: 56 `it()` calls (unlisted)
- **Impact:** Low. The actual count (196+ across 10 files) exceeds the claim. No missing tests.

### [CV-P7-002] Claim: "dual-manager approval state machine for add-to-team, remove-from-team, assign-cos, remove-cos, transfer-agent operations"
- **Source:** CHANGELOG.md line 12, v0.26.0 section (Layer 3 description)
- **Severity:** SHOULD-FIX (documentation inaccuracy)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The dual-manager approval state machine is fully implemented for all 5 listed operations PLUS `configure-agent`. The GovernanceRequestType union includes all 5 plus `create-agent`, `delete-agent`, and `configure-agent`. The `performRequestExecution()` function at cross-host-governance-service.ts:407-543 has working switch cases for `add-to-team`, `remove-from-team`, `assign-cos`, `remove-cos`, `transfer-agent`, and `configure-agent`.
- **What's missing:** The `create-agent` and `delete-agent` types exist in the GovernanceRequestType union (types/governance-request.ts:18-19) and are accepted as valid in `receiveCrossHostRequest` validation (line 175), but:
  1. They are NOT in the IMPLEMENTED_TYPES list at cross-host-governance-service.ts:110, so `submitCrossHostRequest` rejects them with "not yet implemented".
  2. The `performRequestExecution` default case at line 540 logs "not yet implemented" for them.

  This means the types are defined but non-functional for cross-host submission. The CHANGELOG does not explicitly claim these work -- it only lists the 5 operations. However, the type union declares them, which could mislead consumers.
- **Evidence:**
  - types/governance-request.ts:18-19 -- `'create-agent' | 'delete-agent'` in GovernanceRequestType
  - cross-host-governance-service.ts:110 -- IMPLEMENTED_TYPES does NOT include them
  - cross-host-governance-service.ts:540 -- "not yet implemented" in default case
- **Impact:** Low. The CHANGELOG claim is technically accurate (it lists only the 5 operations). The non-implemented types in the union are forward-looking placeholders. However, `receiveCrossHostRequest` accepts them (line 175), which means a remote peer could send a `create-agent` request that gets stored but never executed -- a silent no-op.

---

## CONSISTENCY ISSUES

No cross-file consistency issues found.

- **Version 0.26.0:** Consistent across all 8+ files (package.json, version.json, README.md, remote-install.sh, docs/index.html, docs/ai-index.html, CHANGELOG.md, docs/OPERATIONS-GUIDE.md, docs/BACKLOG.md).
- **GovernanceRole alias:** Correctly aliases AgentRole in types/governance.ts:23 as claimed.
- **'normal' -> 'member' migration:** No instances of `'normal'` as a governance role remain in any .ts file. All role references use `'manager' | 'chief-of-staff' | 'member'`.

---

## VERIFIED CLAIMS

| # | Claim | File:Line | Status |
|---|---|---|---|
| 1 | "Peer governance cache (lib/governance-peers.ts)" | lib/governance-peers.ts:1-179 -- loadPeerGovernance, savePeerGovernance, getAllPeerGovernance, isManagerOnAnyHost, isChiefOfStaffOnAnyHost | VERIFIED |
| 2 | "Broadcast sync (lib/governance-sync.ts) replicate MANAGER/COS/team state across mesh hosts" | lib/governance-sync.ts:80-162 -- broadcastGovernanceSync sends full snapshot (managerId, managerName, teams) to all peer hosts; handleGovernanceSyncMessage persists to disk | VERIFIED |
| 3 | "Ed25519 host keypairs (lib/host-keys.ts)" | lib/host-keys.ts:41-68 -- generateAndStoreKeyPair uses crypto.generateKeyPairSync('ed25519'), stores hex-encoded DER keys; signHostAttestation:131, verifyHostAttestation:156 | VERIFIED |
| 4 | "Signed role attestations (lib/role-attestation.ts) verify MANAGER/COS identity on mesh-forwarded messages" | lib/role-attestation.ts:40-88 -- createRoleAttestation signs "role\|agentId\|hostId\|timestamp[\|recipientHostId]", verifyRoleAttestation checks signature + timestamp freshness + recipient binding | VERIFIED |
| 5 | "Request lifecycle (types/governance-request.ts, lib/governance-request-registry.ts, services/cross-host-governance-service.ts)" | types/governance-request.ts:12-126 (types), lib/governance-request-registry.ts:121-249 (CRUD with file locking), services/cross-host-governance-service.ts:59-548 (submit/receive/approve/reject/execute) | VERIFIED |
| 6 | "Manager Trust Registry (lib/manager-trust.ts) enable auto-approval of governance requests from trusted peers" | lib/manager-trust.ts:112-216 -- addTrustedManager, removeTrustedManager, shouldAutoApprove checks hostId + managerId + autoApprove flag; cross-host-governance-service.ts:227-240 calls shouldAutoApprove and auto-approves as targetManager | VERIFIED |
| 7 | "Agent configuration governance (Layer 5): MANAGER/COS role enforcement on agent CRUD operations -- createNewAgent, updateAgentById, deleteAgentById" | agents-core-service.ts:604-733 -- createNewAgent checks isManager/isChiefOfStaffAnywhere (line 609-613); updateAgentById checks isManager/isChiefOfStaffAnywhere/isSelf/isOwningCOS (line 659-674); deleteAgentById checks isManager only (line 706-710) | VERIFIED |
| 8 | "AgentConfiguration interface in types/agent.ts for governed agent config fields (skills, mcpServers, hooks, model, programArgs)" | types/agent.ts:438 -- interface AgentConfiguration with skills?, mcpServers?, hooks?, model?, programArgs? | VERIFIED |
| 9 | "agentHostMap field on Team type for multi-host team membership tracking" | types/team.ts:34 -- `agentHostMap?: Record<string, string>` | VERIFIED |
| 10 | "Message filter accepts attested mesh roles: verified MANAGER attestation allows cross-host messages to closed-team recipients" | lib/message-filter.ts:55-80 -- when senderRole='manager' and senderHostId present, returns allowed:true; COS attestation allows reaching MANAGER, other COS, open-world agents | VERIFIED |
| 11 | "API routes: governance requests (submit/list/approve/reject), governance sync, manager trust (add/list/remove)" | services/headless-router.ts:1283-1481 -- POST/GET /api/v1/governance/sync, POST/GET /api/v1/governance/requests, POST approve/reject, GET/POST /api/governance/trust, DELETE /api/governance/trust/[hostId] | VERIFIED |
| 12 | "GovernanceRole is now an alias for AgentRole from types/agent.ts" | types/governance.ts:23 -- `export type GovernanceRole = AgentRole` | VERIFIED |
| 13 | "Standardized governance roles: 'normal' -> 'member' across codebase" | No remaining 'normal' role references in any .ts file; AgentRole = 'manager' \| 'chief-of-staff' \| 'member' at types/agent.ts:435 | VERIFIED |
| 14 | "AMP service (forwardToHost, routeMessage) adds/verifies role attestation headers on mesh-forwarded messages" | amp-service.ts:335-384 forwardToHost includes X-AMP-Sender-Role, X-AMP-Sender-Agent-Id, X-AMP-Sender-Role-Attestation headers; amp-service.ts:1040-1048 routeMessage creates attestation via createRoleAttestation for manager/COS senders | VERIFIED |

---

## Self-Verification

- [x] I extracted EVERY factual claim from the PR description (not just some)
- [x] I extracted EVERY factual claim from EACH commit message
- [x] For each claim, I quoted the author's EXACT words
- [x] For each claim, I read the FULL function/file (not just grep matches)
- [x] For "field X populated" claims: I traced query -> assign -> return (N/A if no such claims)
- [x] For "version bumped" claims: I checked ALL version-containing files
- [x] For "removed X" claims: I searched for ALL references to 'normal' role (confirmed zero remain)
- [x] For "fixed bug X" claims: N/A -- no specific bug fix claims in this version
- [x] For "added tests" claims: I read the test files and counted individual it() calls
- [x] I marked each claim: VERIFIED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / CANNOT VERIFY
- [x] I did NOT skip claims that seemed "obvious"
- [x] My finding IDs use the assigned prefix: CV-P7-001, CV-P7-002
- [x] My report file uses the UUID filename: epcp-claims-P7-55ff3976-eff0-433e-b47a-2013f4a67bf8.md
- [x] I checked cross-file consistency (versions, types, configs match everywhere)
- [x] The verified/failed/partial counts in my return message match the report
- [x] My return message to the orchestrator is exactly 1-2 lines
