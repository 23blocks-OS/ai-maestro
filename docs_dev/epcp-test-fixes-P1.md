# EPCP Test Fixes - Pass 1 (UUID Validation)

Generated: 2026-02-22

## Summary

Fixed 17 test failures caused by UUID validation guards added in review fix passes (NT-009, MF-002, SF-007).

## Root Causes

### Issue 1: NT-009 UUID validation in deployConfigToAgent (16 failures)
- `services/agents-config-deploy-service.ts` added `isValidUuid(agentId)` check
- Test file used `TARGET_AGENT_ID = 'agent-target-ext-004'` (not a UUID)
- Fix: Changed `TARGET_AGENT_ID` to `'550e8400-e29b-41d4-a716-446655440000'`
- Also fixed `'nonexistent-agent'` to `'00000000-0000-0000-0000-000000000000'` in the 404 test

### Issue 1b: SF-007 working directory validation (part of same 16 failures)
- `deployConfigToAgent` added `fs.access(workingDir)` to verify directory exists on disk
- Global `beforeEach` set `mockFsAccess.mockRejectedValue(ENOENT)` for all paths
- Fix: Added a `beforeEach` inside the `config deploy service` describe block that resolves for `/tmp/test-agent` (the mock agent's workingDirectory) but rejects for other paths

### Issue 2: MF-002 UUID validation in registerAgent (1 failure)
- `services/agents-core-service.ts` added `isValidUuid(agentId)` check for cloud agents
- Test used `id: 'cloud-agent'` (not a UUID)
- Fix: Changed to `id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'`

## Files Modified

1. `tests/agent-config-governance-extended.test.ts`
   - Changed `TARGET_AGENT_ID` from `'agent-target-ext-004'` to UUID `'550e8400-e29b-41d4-a716-446655440000'`
   - Changed `'nonexistent-agent'` to `'00000000-0000-0000-0000-000000000000'` in 404 test
   - Added `beforeEach` in `config deploy service` block for smart `mockFsAccess` routing

2. `tests/services/agents-core-service.test.ts`
   - Changed cloud agent `id` from `'cloud-agent'` to `'a1b2c3d4-e5f6-7890-abcd-ef1234567890'`

## Test Results

- Total: 131 tests across 2 files
- Passed: 131
- Failed: 0
