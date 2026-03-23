# P5 Review Fixes: Governance Test Files
Generated: 2026-02-22T21:25:00Z

## Summary
Fixed 15 issues across 8 governance test files. All 202 tests pass.

## SHOULD-FIX (8 addressed)

### SF-013: use-governance-hook.test.ts
Added TODO comment documenting that standalone function replicas test API call logic but do not test the refresh() side-effect the real hook triggers.

### SF-014: agent-config-governance-extended.test.ts:747
Updated misleading comment to clarify: "mockFsAccess behavior comes from the describe-level beforeEach, not from this test's setup."

### SF-015: agent-config-governance-extended.test.ts:724-742
Replaced blanket `mockFsAccess.mockResolvedValue(undefined)` with path-aware `mockImplementation` that only resolves for expected skill/plugin directory paths. Unexpected paths reject with ENOENT. Applied to both remove-skill and remove-plugin tests.

### SF-027: governance-endpoint-auth.test.ts:87-93
Added fragility comment: "NOTE: When new imports are added to governance-sync.ts, this mock must be updated."

### SF-032: role-attestation.test.ts
Added 2 new tests:
- `returns false when expectedRecipientHostId does not match attestation recipientHostId` (cross-target replay protection)
- `passes when expectedRecipientHostId is omitted (backward compatibility)`

### SF-033: message-filter.test.ts
Added ALLOW test: open-world sender (OPEN_A, not in any closed team) sends to MANAGER agent in a closed team. Verifies message is allowed.

### SF-034: governance-sync.test.ts
Added assertions verifying Ed25519 signature headers (X-Host-Id, X-Host-Timestamp, X-Host-Signature) are included in broadcastGovernanceSync outbound POST requests.

### SF-035: agent-config-governance.test.ts
Added defensive `vi.mock('@/lib/governance-sync', ...)` to prevent real HTTP calls since governance.ts imports broadcastGovernanceSync.

## NITS (7 addressed)

### NT-011: governance-request-registry.test.ts:450
No change needed. `requestedByRole: 'chief-of-staff'` is correct -- AgentRole type is `'manager' | 'chief-of-staff' | 'member'`.

### NT-012: governance-request-registry.test.ts:130-153
Updated makeRequest helper default timestamps from stale `2025-06-01` to recent fixed `2026-02-20T12:00:00.000Z`.

### NT-013: agent-config-governance-extended.test.ts:874, 1052
Added comments: "Using `as any` intentionally for negative type-safety test" at both locations.

### NT-014: use-governance-hook.test.ts:108-115
Added comment: "NOTE: restoreAllMocks does not restore global.fetch; beforeEach re-assigns it each time."

### NT-025: governance-endpoint-auth.test.ts:105
Already addressed in prior pass (import removed, comment present at line 112). No change needed.

### NT-028: governance-endpoint-auth.test.ts:258-343
Added test: `allows add-to-team type when requestedByRole is chief-of-staff` to demonstrate role-independence of the type whitelist.

## Bonus Fixes (pre-existing issues discovered during testing)

### Rate-limit mock missing checkAndRecordAttempt
- `governance-endpoint-auth.test.ts`: Added `checkAndRecordAttempt` to rate-limit mock (cross-host-governance-service now uses this function)
- `agent-config-governance-extended.test.ts`: Same fix

### fs/promises mock missing rename
- `agent-config-governance-extended.test.ts`: Added `rename` to fs/promises mock (deploy service uses `fs.rename` for atomic writes)

### UUID validation breaking nonexistent-agent tests
- `agent-config-governance-extended.test.ts`: Changed `addSkill('nonexistent', ...)` and `removeSkill('nonexistent', ...)` to use valid UUID format `'00000000-0000-0000-0000-000000000099'` to pass SF-040 UUID validation before reaching the 404 check.

## Test Results
- Files: 8
- Total tests: 202
- Passed: 202
- Failed: 0

## Files Modified
1. `tests/use-governance-hook.test.ts` (SF-013, NT-014)
2. `tests/agent-config-governance-extended.test.ts` (SF-014, SF-015, NT-013, rate-limit mock, fs rename mock, UUID fixes)
3. `tests/governance-endpoint-auth.test.ts` (SF-027, NT-028, rate-limit mock)
4. `tests/role-attestation.test.ts` (SF-032)
5. `tests/message-filter.test.ts` (SF-033)
6. `tests/governance-sync.test.ts` (SF-034)
7. `tests/agent-config-governance.test.ts` (SF-035)
8. `tests/governance-request-registry.test.ts` (NT-012)
