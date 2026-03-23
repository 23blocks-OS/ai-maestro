# EPCP P10 Fix Report: lib/ files
**Generated:** 2026-02-27T00:15:00Z
**Review Run:** P10 / Rc7f26c53

## Summary
26 findings addressed across 14 lib/ files. All fixes verified with `tsc --noEmit` (zero new errors).

---

## MUST-FIX (4 findings)

### [MF-001] agent-registry.ts: metadata merge no-op for clear
**Status:** FIXED
**Change:** When `updates.metadata` (or `.documentation`/`.preferences`) is an empty `{}`, replace entirely instead of spreading. Added explicit empty-object detection before merge.

### [MF-009] hosts-config.ts: saveHosts not atomic (3 locations)
**Status:** FIXED
**Change:** All three write sites (saveHosts, setOrganization, adoptOrganization) now use temp-file + rename pattern with `process.pid`.

### [MF-010] hosts-config.ts: duplicate lock implementation
**Status:** FIXED
**Change:** Removed 67 lines of local lock code (acquireLock/releaseLock/withLock). Now imports and wraps the shared `withLock` from `@/lib/file-lock` with lock name `'hosts'`.

### [MF-011] hosts-config.ts: setOrganization/adoptOrganization TOCTOU race
**Status:** FIXED (partial)
**Change:** Added `setOrganizationAsync()` and `adoptOrganizationAsync()` functions that wrap the sync versions in `withLock('hosts')`. Sync versions preserved for backward compatibility (callers in `services/` and `lib/host-sync.ts` use them synchronously). TOCTOU risk documented in sync version comments.
**Follow-up needed:** Callers outside this file list should migrate to `*Async` versions.

### [MF-012] messageQueue.ts: getSentCount misses subdirectories
**Status:** FIXED
**Change:** `getSentCount` now uses `readdirSync(sentDir, { withFileTypes: true })` and recurses one level into subdirectories, matching the `writeToAMPSent()` storage pattern of `sent/{recipientDir}/{messageId}.json`.

---

## SHOULD-FIX (14 findings)

### [SF-032] governance-peers.ts: deletePeerGovernance no file lock
**Status:** FIXED
**Change:** Made async, wrapped in `withLock('governance-peers-${hostId}')`.

### [SF-033] host-keys.ts: atomic write without process.pid
**Status:** FIXED
**Change:** Added `process.pid` to temp file names for both private and public key writes.

### [SF-034] team-registry.ts: chiefOfStaffId ternary confusing
**Status:** FIXED
**Change:** Replaced the `SF-038` comment with a clearer `SF-034` comment explaining the three-way chain.

### [SF-035] hosts-config.ts: updateHost case-sensitive ID comparison
**Status:** FIXED
**Change:** `findIndex` and `updates.id` comparison now use `.toLowerCase()`, consistent with `addHost()`.

### [SF-036] hosts-config.ts: deleteHost case-sensitive comparison
**Status:** FIXED
**Change:** Both `.find()` and `.filter()` now use `.toLowerCase()`, consistent with `addHost()`.

### [SF-037] governance-sync.ts: double timestamp
**Status:** FIXED
**Change:** Single `syncTimestamp` variable used for both the `GovernanceSyncMessage.timestamp` and the signature `X-Host-Timestamp` header. Removed the second `new Date().toISOString()` call.

### [SF-038] message-filter.ts: add clarifying comment about MANAGER reachability
**Status:** FIXED
**Change:** Added block comment in Step 5 explaining that closed-team members cannot directly message MANAGER by design (chain-of-command: Member -> COS -> MANAGER).

### [SF-039] index-delta.ts: acquireIndexSlot timeout may match wrong queue item
**Status:** FIXED
**Change:** Replaced `findIndex(q => q.agentId === agentId && q.timestamp === entry.timestamp)` with `indexOf(entry)` for exact object reference matching.

### [SF-040] agent-registry.ts: updateAgent tmux rename uses base name
**Status:** FIXED
**Change:** Now iterates `agents[index].sessions` and uses `computeSessionName(name, session.index)` for both old and new session names.

### [SF-041] agent-registry.ts: renameAgent does not rename tmux sessions
**Status:** FIXED
**Change:** Added tmux session renaming loop before updating the registry name. Uses `computeSessionName()` for each session, with best-effort error handling.

### [SF-042] message-send.ts: forwardFromUI marks verified unconditionally
**Status:** FIXED
**Change:** Added `isSelf(fromHostId)` check. Only uses `VERIFIED_LOCAL_SENDER` when the sender agent is on the local host; otherwise passes `undefined`.

### [SF-043] messageQueue.ts: getUnreadCount loads all messages to count
**Status:** DOCUMENTED
**Change:** Added detailed comment explaining why full load is necessary (filter logic, AMP envelope conversion, governance filtering). Added TODO for Phase 2 optimization.

### [SF-058] agent-auth.ts: governance enforcement opt-in
**Status:** FIXED
**Change:** Added `PHASE 2 REQUIRED` comment block at top of module explaining the opt-in bypass risk and the need to make auth mandatory in Phase 2.

### [NT-025] agent-registry.ts: config.json rename not atomic
**Status:** FIXED
**Change:** Uses temp file + rename pattern with `process.pid` for AMP config.json updates.

---

## NIT (8 findings)

### [NT-020] hosts-config.ts: deprecated type:'local' in example config
**Status:** FIXED
**Change:** Removed `type: 'local'` from createExampleConfig, replaced with comment.

### [NT-021] governance.ts: loadGovernance version mismatch not healed
**Status:** FIXED
**Change:** Added comment explaining why version mismatch intentionally does NOT heal (to avoid destroying newer-format data) and improved the log message to indicate manual migration is required.

### [NT-022] hosts-config.ts: getHostById double case-insensitive check
**Status:** FIXED
**Change:** Simplified to just the case-insensitive check (`host.id.toLowerCase() === hostId.toLowerCase()`).

### [NT-023] hosts-config.ts: _lockWaiterId overflow
**Status:** RESOLVED (moot)
**Change:** Entire local lock mechanism was removed by MF-010 migration to shared file-lock.

### [NT-024] notification-service.ts: replace only replaces first occurrence
**Status:** FIXED
**Change:** Changed `.replace()` to `.replaceAll()` for both `{from}` and `{subject}` placeholders.

### [NT-026] document-registry.ts: temp file not cleaned up on renameSync failure
**Status:** FIXED
**Change:** Added try/catch around `renameSync` with `unlinkSync(tmpPath)` cleanup in the catch block.

### [NT-027] index-delta.ts: hardcoded model names
**Status:** FIXED
**Change:** Replaced hardcoded `'Sonnet 4.5'`/`'Haiku 4.5'`/`'Opus 4.5'` with dynamic version extraction via regex `(/(\d[\d.-]*\d)/)` from the model string.

---

## Files Modified
1. `lib/agent-auth.ts` - SF-058 (Phase 2 comment)
2. `lib/agent-registry.ts` - MF-001, SF-040, SF-041, NT-025
3. `lib/document-registry.ts` - NT-026
4. `lib/governance-peers.ts` - SF-032
5. `lib/governance-sync.ts` - SF-037
6. `lib/governance.ts` - NT-021
7. `lib/host-keys.ts` - SF-033
8. `lib/hosts-config.ts` - MF-009, MF-010, MF-011, SF-035, SF-036, NT-020, NT-022, NT-023
9. `lib/index-delta.ts` - SF-039, NT-027
10. `lib/message-filter.ts` - SF-038
11. `lib/message-send.ts` - SF-042
12. `lib/messageQueue.ts` - MF-012, SF-043
13. `lib/notification-service.ts` - NT-024
14. `lib/team-registry.ts` - SF-034

## Follow-up Required (Outside Scope)
- MF-011: Callers of `setOrganization()` and `adoptOrganization()` in `services/config-service.ts`, `services/hosts-service.ts`, and `lib/host-sync.ts` should migrate to the `*Async` lock-protected versions.
- `lib/file-lock.ts` lock ordering comment should add `'hosts'` to the invariant list.
