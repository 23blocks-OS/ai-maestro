# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:36.402Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P10-lib.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown /Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P10-lib.md
- Line 1: # EPCP P10 Fix Report: lib/ files
- Line 4: 26 findings addressed across 14 lib/ files. All fixes verified with `tsc --noEmit` (zero new errors).
- Line 14: **Change:** All three write sites (saveHosts, setOrganization, adoptOrganization) now use temp-file + rename pattern with `process.pid`.
- Line 18: **Change:** Removed 67 lines of local lock code (acquireLock/releaseLock/withLock). Now imports and wraps the shared `withLock` from `@/lib/file-lock` with lock name `'hosts'`.
- Line 22: **Change:** Added `setOrganizationAsync()` and `adoptOrganizationAsync()` functions that wrap the sync versions in `withLock('hosts')`. Sync versions preserved for backward compatibility (callers in `services/` and `lib/host-sync.ts` use them synchronously). TOCTOU risk documented in sync version comments.
- Line 27: **Change:** `getSentCount` now uses `readdirSync(sentDir, { withFileTypes: true })` and recurses one level into subdirectories, matching the `writeToAMPSent()` storage pattern of `sent/{recipientDir}/{messageId}.json`.
- Line 35: **Change:** Made async, wrapped in `withLock('governance-peers-${hostId}')`.
- Line 39: **Change:** Added `process.pid` to temp file names for both private and public key writes.
- Line 43: **Change:** Replaced the `SF-038` comment with a clearer `SF-034` comment explaining the three-way chain.
- Line 47: **Change:** `findIndex` and `updates.id` comparison now use `.toLowerCase()`, consistent with `addHost()`.
- Line 51: **Change:** Both `.find()` and `.filter()` now use `.toLowerCase()`, consistent with `addHost()`.
- Line 55: **Change:** Single `syncTimestamp` variable used for both the `GovernanceSyncMessage.timestamp` and the signature `X-Host-Timestamp` header. Removed the second `new Date().toISOString()` call.
- Line 59: **Change:** Added block comment in Step 5 explaining that closed-team members cannot directly message MANAGER by design (chain-of-command: Member -> COS -> MANAGER).
- Line 63: **Change:** Replaced `findIndex(q => q.agentId === agentId && q.timestamp === entry.timestamp)` with `indexOf(entry)` for exact object reference matching.
- Line 67: **Change:** Now iterates `agents[index].sessions` and uses `computeSessionName(name, session.index)` for both old and new session names.
- Line 71: **Change:** Added tmux session renaming loop before updating the registry name. Uses `computeSessionName()` for each session, with best-effort error handling.
- Line 75: **Change:** Added `isSelf(fromHostId)` check. Only uses `VERIFIED_LOCAL_SENDER` when the sender agent is on the local host; otherwise passes `undefined`.
- Line 79: **Change:** Added detailed comment explaining why full load is necessary (filter logic, AMP envelope conversion, governance filtering). Added TODO for Phase 2 optimization.
- Line 83: **Change:** Added `PHASE 2 REQUIRED` comment block at top of module explaining the opt-in bypass risk and the need to make auth mandatory in Phase 2.
- Line 87: **Change:** Uses temp file + rename pattern with `process.pid` for AMP config.json updates.
- Line 94: **Change:** Removed `type: 'local'` from createExampleConfig, replaced with comment.
- Line 98: **Change:** Added comment explaining why version mismatch intentionally does NOT heal (to avoid destroying newer-format data) and improved the log message to indicate manual migration is required.
- Line 102: **Change:** Simplified to just the case-insensitive check (`host.id.toLowerCase() === hostId.toLowerCase()`).
- Line 106: **Change:** Entire local lock mechanism was removed by MF-010 migration to shared file-lock.
- Line 110: **Change:** Changed `.replace()` to `.replaceAll()` for both `{from}` and `{subject}` placeholders.
- Line 114: **Change:** Added try/catch around `renameSync` with `unlinkSync(tmpPath)` cleanup in the catch block.
- Line 118: **Change:** Replaced hardcoded `'Sonnet 4.5'`/`'Haiku 4.5'`/`'Opus 4.5'` with dynamic version extraction via regex `(/(\d[\d.-]*\d)/)` from the model string.
- Line 122: 1. `lib/agent-auth.ts` - SF-058 (Phase 2 comment)
- Line 123: 2. `lib/agent-registry.ts` - MF-001, SF-040, SF-041, NT-025
- Line 124: 3. `lib/document-registry.ts` - NT-026
- Line 125: 4. `lib/governance-peers.ts` - SF-032
- Line 126: 5. `lib/governance-sync.ts` - SF-037
- Line 127: 6. `lib/governance.ts` - NT-021
- Line 128: 7. `lib/host-keys.ts` - SF-033
- Line 129: 8. `lib/hosts-config.ts` - MF-009, MF-010, MF-011, SF-035, SF-036, NT-020, NT-022, NT-023
- Line 130: 9. `lib/index-delta.ts` - SF-039, NT-027
- Line 131: 10. `lib/message-filter.ts` - SF-038
- Line 132: 11. `lib/message-send.ts` - SF-042
- Line 133: 12. `lib/messageQueue.ts` - MF-012, SF-043
- Line 134: 13. `lib/notification-service.ts` - NT-024
- Line 135: 14. `lib/team-registry.ts` - SF-034
- Line 138: - MF-011: Callers of `setOrganization()` and `adoptOrganization()` in `services/config-service.ts`, `services/hosts-service.ts`, and `lib/host-sync.ts` should migrate to the `*Async` lock-protected versions.
- Line 139: - `lib/file-lock.ts` lock ordering comment should add `'hosts'` to the invariant list.
```