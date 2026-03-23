# EPCP P10 Fix Report -- Services (13 files)

**Generated:** 2026-02-27
**Review Source:** `docs_dev/epcp-review-P10-Rc7f26c53-final.md`
**Scope:** 13 service files assigned to P10 fix agent

## Summary

| Severity | Assigned | Fixed | Skipped |
|----------|----------|-------|---------|
| MUST-FIX | 5 | 5 | 0 |
| SHOULD-FIX | 8 | 8 | 0 |
| NIT | 8 | 8 | 0 |
| **Total** | **21** | **21** | **0** |

## MUST-FIX Fixes

### MF-005: agents-memory-service.ts -- missing null-check on agent
Added `getAgentFromFileRegistry(agentId)` null-check guard to all 12 functions:
`getMemory`, `initializeMemory`, `getConsolidationStatus`, `triggerConsolidation`,
`manageConsolidation`, `queryLongTermMemories`, `deleteLongTermMemory`,
`updateLongTermMemory`, `searchConversations`, `ingestConversations`,
`getTracking`, `initializeTracking`.
Each returns `{ error: 'Agent not found', status: 404 }` when registry lookup fails.

### MF-006: agents-transfer-service.ts -- parseInt without NaN check
Added `Number.isNaN(parsedSessionIndex)` validation after `parseInt(sessionId, 10)`.
Returns 400 error when sessionId is not a valid numeric string.

### MF-007: headless-router.ts -- TOCTOU race in chief-of-staff endpoint
Replaced separate `checkRateLimit`/`recordAttempt` calls with atomic
`checkAndRecordAttempt` from `@/lib/rate-limit`. Added `resetRateLimit` on
successful password verification.

### MF-008: messages-service.ts -- unrecognized action fall-through
Added `RECOGNIZED_ACTIONS` whitelist. Unrecognized actions now return 400
with list of valid actions instead of silently falling through to inbox listing.

### MF-017: cross-host-governance-service.ts -- performRequestExecution swallows failures
Added `executionError` and `executionFailedAt` fields to the governance request
record when execution fails. Used `as any` since `GovernanceRequest` type is
outside scope (types/ not in assigned files).

## SHOULD-FIX Fixes

### SF-018: webhooks-service.ts -- event type reflected without truncation
Truncated event type to 50 chars in error message: `String(event).slice(0, 50)`.

### SF-020: config-service.ts -- execSync with shell for PTY debug
Documented intentional shell usage (piping requires shell; all commands are
hardcoded constants with no user input).

### SF-021: config-service.ts -- execAsync for Docker version
Replaced `exec`/`execAsync` with `execFile`/`execFileAsync` for Docker version
command. Passes args as array to avoid shell.

### SF-023: hosts-service.ts -- getHosts() called inside per-peer loop
Hoisted `getHosts()` call before the loop in `exchangePeers`.

### SF-024: hosts-service.ts -- timer leak in checkHostHealth
Moved `controller`/`timeout` before try block. Added `finally { clearTimeout(timeout) }`
to ensure cleanup on all paths.

### SF-025: hosts-service.ts -- timer leak in getMeshStatus
Same pattern as SF-024. Added `finally { clearTimeout(timeout) }`.

### SF-026: messages-service.ts -- forwardMessage missing format validation
Added length check (200 chars) and control character regex validation for
`fromSession` and `toSession` parameters.

### SF-027: sessions-service.ts -- renameSession overwrites agentConfig.id
Removed `agentConfig.id = newName` in cloud agent rename path to preserve
UUID-based lookups. Only `name` and `alias` are updated.

## NIT Fixes

### NT-013: webhooks-service.ts -- webhook URL scheme validation
Added protocol check after `new URL()` parse to restrict to `http:` and `https:` only.

### NT-014: agents-graph-service.ts -- unused depth parameter
Documented the `depth` parameter in `queryCodeGraph` as reserved for future use.

### NT-015: agents-playback-service.ts -- placeholder file
Added "Phase 5 -- this file is a placeholder" indicator to TODO comment.

### NT-016: agents-graph-service.ts -- verbose console.log
Changed `console.log` to `console.debug` in `queryDbGraph`, `queryGraph`,
and `queryCodeGraph`.

### NT-017: help-service.ts -- predictable temp file path
Already fixed (randomUUID used in temp file name). Verified and confirmed.

### NT-018: headless-router.ts -- query as any in marketplace
Replaced `query as any` with typed `SkillSearchParams` interface import.

### NT-019: plugin-builder-service.ts -- evictionInterval runs forever
Converted to lazy initialization with `ensureEvictionStarted()`. Timer only
starts after first build result is stored. Used `.unref()` to not block process exit.

### NT-043/NT-044: comment cleanup across all 13 files
Stripped review-pass finding-ID prefixes (e.g., `// NT-006:`, `// MF-009:`,
`// SF-029:`, `// CC-P1-506:`) from production code comments. Preserved
explanatory text where meaningful.

## Files Modified

1. `services/agents-graph-service.ts` -- NT-014, NT-016, NT-043/NT-044
2. `services/agents-memory-service.ts` -- MF-005, NT-043/NT-044
3. `services/agents-playback-service.ts` -- NT-015, NT-043/NT-044
4. `services/agents-transfer-service.ts` -- MF-006, NT-043/NT-044
5. `services/config-service.ts` -- SF-020, SF-021, NT-043/NT-044
6. `services/cross-host-governance-service.ts` -- MF-017, NT-043/NT-044
7. `services/headless-router.ts` -- MF-007, NT-018, NT-043/NT-044
8. `services/help-service.ts` -- NT-017, NT-043/NT-044
9. `services/hosts-service.ts` -- SF-023, SF-024, SF-025, NT-043/NT-044
10. `services/messages-service.ts` -- MF-008, SF-026, NT-043/NT-044
11. `services/plugin-builder-service.ts` -- NT-019, NT-043/NT-044
12. `services/sessions-service.ts` -- SF-027, NT-043/NT-044
13. `services/webhooks-service.ts` -- SF-018, NT-013, NT-043/NT-044

## Notes

- SF-028/SF-029/SF-030/SF-031 (sessions-service ServiceResult wrapping) acknowledged as known debt per SF-022/NT-036; would change public API signatures.
- MF-017 uses `as any` for `executionError` field since `GovernanceRequest` type file is outside assigned scope.
