# P9 Review Fixes - lib/ and services/ layer

**Date:** 2026-02-26

## MUST-FIX (3/3 done)

| ID | File | Fix |
|----|------|-----|
| MF-007 | lib/hosts-config.ts:20-53 | Replaced function-reference-equality lock waiter identification with monotonic counter (`_lockWaiterId`). findIndex now matches on stable numeric `id` field. |
| MF-008 | lib/index-delta.ts:47-67 | Moved `entry` declaration before `setTimeout` callback to fix temporal dead zone. Used two-phase init: declare entry with null resolve, then patch after timeoutHandle exists. |
| MF-009 | lib/amp-auth.ts:236-246 | Wrapped `saveApiKeys(keys)` inside `void withLock('amp-api-keys', ...)` in validateApiKey's debounced write path. Fire-and-forget to keep validation synchronous. |

## SHOULD-FIX (8/8 done)

| ID | File | Fix |
|----|------|-----|
| SF-023 | lib/messageQueue.ts:857-868 | Wrapped `fs.unlink` in `withLock('msg-${messageId}')` in deleteMessage. |
| SF-024 | lib/governance-peers.ts:60-68 | Made savePeerGovernance async, wrapped body in `withLock('governance-peers-${hostId}')`. Updated caller in governance-sync.ts to await. |
| SF-025 | lib/message-send.ts:180-187 | Added comment documenting that alias may be passed where UUID is expected; noted as Phase 2 limitation. |
| SF-026 | lib/hosts-config.ts:236 | Added mtime-based cache invalidation: loadHostsConfig now checks `statSync(HOSTS_CONFIG_PATH).mtimeMs` vs cached mtime before returning cached value. |
| SF-027 | lib/amp-auth.ts:73-76 | On error in `_loadApiKeysRaw`, now sets `_apiKeysCache = []` and `_apiKeysCacheTimestamp = Date.now()` to avoid re-reading corrupt file every call. |
| SF-028 | lib/task-registry.ts:49-63 | Changed saveTasks from `(): boolean` to `(): void`, removed try/catch so errors propagate. Updated test to not check return value. |
| SF-029 | lib/document-registry.ts:48-62 | Changed saveDocuments from `(): boolean` to `(): void`, removed try/catch so errors propagate. Updated test to not check return value. |
| SF-030 | lib/messageQueue.ts:731-734 | Replaced `listSentMessages().length` with `readdirSync(sentDir).filter(e => e.endsWith('.json')).length` for O(1) count without parsing. |
| SF-058 | lib/rate-limit.ts + services/ | Removed deprecated `recordFailure` alias. Updated headless-router.ts to import/use `recordAttempt`. Updated governance-service.ts to use `checkAndRecordAttempt` (already imported). Updated 3 test mocks. |

## NIT (2/2 done)

| ID | File | Fix |
|----|------|-----|
| NT-014 | lib/governance.ts:162-184 | Added `if (!agentId) return false/null/[]` guards to isChiefOfStaffAnywhere, getClosedTeamForAgent, getClosedTeamsForAgent. |
| NT-015 | lib/hosts-config.ts:182,201 | Removed redundant `.toLowerCase()` on selfId (already lowercase from getSelfHostId). |

## Files modified

- `lib/hosts-config.ts` (MF-007, SF-026, NT-015)
- `lib/index-delta.ts` (MF-008)
- `lib/amp-auth.ts` (MF-009, SF-027)
- `lib/messageQueue.ts` (SF-023, SF-030)
- `lib/governance-peers.ts` (SF-024)
- `lib/governance-sync.ts` (SF-024 caller update)
- `lib/message-send.ts` (SF-025)
- `lib/task-registry.ts` (SF-028)
- `lib/document-registry.ts` (SF-029)
- `lib/rate-limit.ts` (SF-058)
- `lib/governance.ts` (NT-014)
- `services/headless-router.ts` (SF-058)
- `services/governance-service.ts` (SF-058)
- `tests/cross-host-governance.test.ts` (SF-058 mock update)
- `tests/agent-config-governance-extended.test.ts` (SF-058 mock update)
- `tests/governance-endpoint-auth.test.ts` (SF-058 mock update)
- `tests/task-registry.test.ts` (SF-028 test update)
- `tests/document-registry.test.ts` (SF-029 test update)
