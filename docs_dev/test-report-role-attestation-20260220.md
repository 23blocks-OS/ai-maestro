# Test Report: role-attestation.ts (2026-02-20)

## Summary
- **Function complexity**: Simple (<50 lines each, 102 lines total)
- **Lines of code**: 102
- **Tests written**: 20
- **Effective coverage**: 100%

## Test File
`/Users/emanuelesabetta/ai-maestro/tests/role-attestation.test.ts`

## Test Breakdown

### createRoleAttestation (3 tests)
1. Returns complete HostAttestation with role/agentId from arguments
2. Fills hostId from getSelfHostId and timestamp from system clock
3. Fills signature via signHostAttestation with correct "role|agentId|hostId|timestamp" data format

### verifyRoleAttestation (7 tests)
4. Returns true for valid fresh attestation with correct public key
5. Returns false when timestamp is older than 5 minutes
6. Returns false when timestamp is in the future (negative age)
7. Returns true at exactly the 5-minute boundary (edge case)
8. Returns false when signature is tampered
9. Returns false when wrong public key is provided
10. Calls verifyHostAttestation with correct rebuilt data string

### serializeAttestation (2 tests)
11. Returns valid base64-encoded JSON with all fields preserved
12. Preserves fields including special characters in agentId

### deserializeAttestation (6 tests)
13. Returns valid HostAttestation from correct base64 JSON
14. Returns null for invalid base64 input
15. Returns null for valid base64 that is not JSON
16. Returns null when required fields are missing
17. Returns null when a field has the wrong type
18. Returns null for empty string

### Integration roundtrip (2 tests)
19. create -> serialize -> deserialize -> verify succeeds end-to-end
20. Roundtrip fails verification when signature is tampered after deserialization

## Mocked Dependencies (external only)
- `@/lib/host-keys`: signHostAttestation, verifyHostAttestation, getOrCreateHostKeyPair, getHostPublicKeyHex
- `@/lib/hosts-config`: getSelfHostId

## All 20 tests passing, 6ms execution time.
