# EPCP Fixes Done -- Pass 5: Messaging Domain

**Date:** 2026-02-22
**Files:** lib/messageQueue.ts, lib/amp-auth.ts, lib/message-send.ts, lib/notification-service.ts

## Summary

15 findings reviewed. 3 required new edits. 12 were already fixed in prior passes (P1-P4).

## MUST-FIX

| ID | Status | Notes |
|----|--------|-------|
| MF-026 | ALREADY FIXED (P4, MF-024) | `resolveAgent` already uses indexOf-based parsing at lines 543-545. No destructuring split remains. |
| MF-027 | ENHANCED | `fromVerified` at line 266 now also infers from `envelope.signature` or `ampMsg.signature` presence when `fromVerified` is not explicitly set. Prior fix (MF-025) only used `ampMsg.fromVerified ?? false`. |

## SHOULD-FIX

| ID | Status | Notes |
|----|--------|-------|
| SF-008 | ALREADY FIXED (P4, SF-004) | All mutating functions (`createApiKey`, `rotateApiKey`, `revokeApiKey`, `revokeAllKeysForAgent`) already wrapped in `withLock('amp-api-keys', ...)`. |
| SF-009 | COMMENT ADDED | Added Phase 1 acceptable + Phase 2 recommendation comment above `keys.find()` in `validateApiKey`. |
| SF-061 | ALREADY FIXED (P4, SF-050) | `convertAMPToMessage` already uses typed `AMPEnvelopeMsg` interface (line 203) instead of `any`. |
| SF-062 | ALREADY FIXED (P4, SF-051) | `triggerOldDuplicateCleanup` already reads each file and checks format before deleting. Comment SF-051 documents the safety check. |
| SF-063 | ALREADY FIXED (P4, SF-052) | `markMessageAsRead` and `archiveMessage` already wrapped in `withLock('msg-${messageId}', ...)`. |
| SF-064 | COMMENT ADDED | Added `SF-064: TODO: Wire into shutdown handler or remove export. Currently only called from tests.` to `cleanupAgentCacheSweep` docstring. |
| SF-065 | COMMENT ENHANCED | Updated `hashApiKey` docstring to include SF-065 tag and Phase 2 HMAC-SHA256 recommendation. |
| SF-066 | FIX APPLIED | Added explicit empty/whitespace-only validation for `from` and `to` at the top of `sendFromUI()` in message-send.ts. Throws descriptive errors instead of relying on accidental `'' || null` coercion. |

## NITS

| ID | Status | Notes |
|----|--------|-------|
| NT-042 | COMMENT ENHANCED | Updated priority indicator comment to include NT-042 tag and "Configurable in Phase 2" note. Prior fix (NT-028) already replaced emoji with plain text. |
| NT-043 | ALREADY FIXED (P4, NT-029) | `ResolvedAgent` is canonical in messageQueue.ts; message-send.ts re-exports it. No duplication. |
| NT-044 | ALREADY FIXED (P4, NT-030) | `getSelfHostName` is canonical in messageQueue.ts; message-send.ts imports it. No duplication. |
| NT-045 | ALREADY FIXED (P4, NT-031) | `saveApiKeys` already uses temp-file-then-rename atomic write pattern (lines 85-87). |

## Files Modified

1. `lib/messageQueue.ts` -- MF-027 (enhanced fromVerified inference), SF-064 (TODO comment)
2. `lib/amp-auth.ts` -- SF-009 (timing comment), SF-065 (hash comment enhanced)
3. `lib/message-send.ts` -- SF-066 (empty agentId validation)
4. `lib/notification-service.ts` -- NT-042 (comment enhanced)
