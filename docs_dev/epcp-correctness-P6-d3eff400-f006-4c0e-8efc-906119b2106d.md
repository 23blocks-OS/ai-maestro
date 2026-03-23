# Code Correctness Report: tests

**Agent:** epcp-code-correctness-agent
**Domain:** tests
**Pass:** 6 (auditing Pass 5 changes only)
**Finding ID Prefix:** CC-P6-A4
**Files audited:** 10
**Date:** 2026-02-22T06:30:00Z

## Pass 5 Changes Summary

The following changes were introduced in Pass 5 and are the scope of this audit:

1. **`agent-registry.test.ts`**: async/await propagation to all test callbacks that call async functions (`createAgent`, `updateAgent`, `deleteAgent`, `linkSession`, `unlinkSession`, `renameAgent`, `addSessionToAgent`, `incrementAgentMetric`)
2. **`transfer-registry.test.ts`**: Added `renameSync`/`copyFileSync` to fs mock (for atomic write support)
3. **`cross-host-governance.test.ts`**: Expanded test coverage (+11 tests: SF-018 auto-approve, SF-019 assign-cos/remove-cos/transfer-agent, SF-020 sanitization, SF-021 source/target guard), added host-keys/manager-trust/rate-limit mocks (MF-006/007/008), removed unused `mockExecuteGovernanceRequest`
4. **`governance-endpoint-auth.test.ts`**: Added rate-limit mock (SF-017), removed unused `buildLocalGovernanceSnapshot` import (NT-013), added COS type whitelist test (NT-016)
5. **`governance-sync.test.ts`**: Added Ed25519 signature header test (SF-024)
6. **`message-filter.test.ts`**: Added Step 5b tests for MANAGER/COS in closed teams (SF-023)
7. **`role-attestation.test.ts`**: Updated `buildValidAttestation` for `recipientHostId` (NT-014), added 3 recipientHostId tests (SF-022)
8. **`agents-core-service.test.ts`**: async/await propagation to test callbacks for `createNewAgent`, `updateAgentById`, `deleteAgentById`, `registerAgent`, `linkAgentSession`
9. **`agent-config-governance.test.ts`**: async/await propagation to test callbacks for `createNewAgent`, `updateAgentById`, `deleteAgentById`
10. **`test-utils/fixtures.ts`**: Removed unused `makeServiceResult` helper (NT-018)

## MUST-FIX

(none)

## SHOULD-FIX

(none)

## NIT

(none)

## CLEAN

Files with no issues found (all Pass 5 changes verified correct):

- `tests/agent-registry.test.ts` -- No issues. All async/await propagation is correct. Every function that is async in `lib/agent-registry.ts` (`createAgent`, `updateAgent`, `deleteAgent`, `linkSession`, `unlinkSession`, `renameAgent`, `addSessionToAgent`, `incrementAgentMetric`) now properly uses `await` in tests. The fs mock correctly omits `renameSync`/`copyFileSync` because `agent-registry.ts` does not use them (it uses `writeFileSync` + `statSync` in `saveAgents`).

- `tests/transfer-registry.test.ts` -- No issues. The added `renameSync` and `copyFileSync` mock implementations correctly simulate atomic write behavior: `renameSync` moves data from src to dest in `fsStore` and deletes the src entry; `copyFileSync` copies data without deleting src; both throw ENOENT when src doesn't exist. This matches the real `lib/transfer-registry.ts` usage pattern (copyFileSync for backup at line 43, renameSync for atomic write at line 62).

- `tests/cross-host-governance.test.ts` -- No issues. New mocks (MF-006 host-keys, MF-007 manager-trust, MF-008 rate-limit) correctly prevent real module loads. Removal of `mockExecuteGovernanceRequest` is correct (the service doesn't import `executeGovernanceRequest`). New tests (SF-018 auto-approve, SF-019 execution paths, SF-020 sanitization, SF-021 source/target guard) all correctly test their respective service behaviors. Verified against the actual `services/cross-host-governance-service.ts` implementation.

- `tests/governance-endpoint-auth.test.ts` -- No issues. Rate-limit mock (SF-017) correctly prevents real rate-limit state. Removed `buildLocalGovernanceSnapshot` import (NT-013) was indeed unused. New COS type whitelist test (NT-016) correctly verifies that the type whitelist check at line 93-97 of the service applies regardless of requester role. The test properly overrides `isChiefOfStaffAnywhere` via dynamic import and sets up `mockGetAgent` to return the COS agent.

- `tests/governance-sync.test.ts` -- No issues. New Ed25519 signature header test (SF-024) correctly verifies that `requestPeerSync` sends X-Host-Id, X-Host-Timestamp, and X-Host-Signature headers. The mock `signHostAttestation` returns `'mock-sig'`, matching the expected header value.

- `tests/message-filter.test.ts` -- No issues. New Step 5b tests (SF-023) correctly verify that open-world agents can reach MANAGER and COS even when they are in closed teams. Verified against the actual `lib/message-filter.ts` implementation at lines 174-181 (Step 5b). Comment updated from 15 to 17 scenarios is accurate.

- `tests/role-attestation.test.ts` -- No issues. The `buildValidAttestation` update (NT-014) correctly includes `recipientHostId` in the data string when present, matching the `buildAttestationData` function in `lib/role-attestation.ts` (line 27-28). New tests (SF-022) correctly verify `recipientHostId` inclusion in both creation and verification paths.

- `tests/services/agents-core-service.test.ts` -- No issues. All async/await propagation is correct. The service functions (`createNewAgent`, `updateAgentById`, `deleteAgentById`, `registerAgent`, `linkAgentSession`) are all async in `services/agents-core-service.ts`. The mock registry functions use `mockReturnValue` (synchronous) rather than `mockResolvedValue`, which is technically less precise but functionally correct because `await nonPromiseValue` resolves to the value itself in JavaScript. This is a pre-existing pattern, not a regression.

- `tests/agent-config-governance.test.ts` -- No issues. All async/await propagation is correct. Functions `createNewAgent`, `updateAgentById`, `deleteAgentById` are async in the service and now properly use `await` in tests.

- `tests/test-utils/fixtures.ts` -- No issues. Removed `makeServiceResult` helper (NT-018) was verified to have no imports in any test file.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings) -- N/A, no findings
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent) -- N/A, no findings
- [x] I verified each finding by tracing the code flow (not just pattern matching) -- N/A, no findings
- [x] I categorized findings correctly -- N/A, no findings
- [x] My finding IDs use the assigned prefix: CC-P6-A4-001, -002, ... -- N/A, no findings to number
- [x] My report file uses the UUID filename: epcp-correctness-P6-d3eff400-f006-4c0e-8efc-906119b2106d.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage -- All new Pass 5 code paths have corresponding tests
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (0 issues)
- [x] My return message to the orchestrator is exactly 1-2 lines

## Verification Details

Key verifications performed:
1. **async/await correctness**: Confirmed all 8 functions in `agent-registry.ts` are `async` (checked exports). Confirmed all 5 functions in `agents-core-service.ts` are `async`. All test callbacks properly `await` these calls.
2. **fs mock completeness**: Confirmed `agent-registry.ts` does NOT use `renameSync`/`copyFileSync` (uses `writeFileSync`+`statSync`). Confirmed `transfer-registry.ts` DOES use `renameSync`(line 62)/`copyFileSync`(line 43).
3. **Mock setup correctness**: `mockReturnValue` vs `mockResolvedValue` in `agents-core-service.test.ts` is pre-existing pattern, not a Pass 5 regression. `await` on non-Promise values resolves correctly in JavaScript.
4. **New test logic**: All 11 new tests in `cross-host-governance.test.ts`, 1 in `governance-endpoint-auth.test.ts`, 1 in `governance-sync.test.ts`, 2 in `message-filter.test.ts`, and 3 in `role-attestation.test.ts` were verified against their corresponding source implementations.
5. **Removed code**: `makeServiceResult` (fixtures.ts) and `mockExecuteGovernanceRequest` (cross-host-governance.test.ts) were confirmed unused.
