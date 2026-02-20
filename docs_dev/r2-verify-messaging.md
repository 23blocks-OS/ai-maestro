# R2 Messaging Correctness Report - Verification Results

**Date:** 2026-02-19
**Report verified:** docs_dev/epcp-v5-correctness-messaging.md
**Source files checked:** message-send.ts, message-filter.ts, types/amp.ts, messageQueue.ts, validation.ts, message-delivery.ts

## Summary

| Finding | Severity | Status | Details |
|---------|----------|--------|---------|
| CC-001 | MUST-FIX | FIXED | Message.content.type expanded to 10 values matching AMPPayload.type |
| CC-002 | MUST-FIX | FIXED | Governance always checked; null senderAgentId passed when unresolved |
| CC-003 | SHOULD-FIX | FIXED | 'unknown' fallback removed; unresolved recipients denied with throw |
| CC-004 | SHOULD-FIX | FIXED | Name part validated with `/^[a-zA-Z0-9_.-]+$/` regex |
| CC-005 | SHOULD-FIX | FIXED | Uses `isValidUuid()` from validation.ts with full UUID regex |
| CC-006 | SHOULD-FIX | FIXED | Changed from `\|\|` to `??` (nullish coalescing) |
| CC-007 | SHOULD-FIX | FIXED | Content security applied to message object before routing; both paths use sanitized content |
| CC-008 | SHOULD-FIX | FIXED | Uses `{ cause: error }` in both sendFromUI and forwardFromUI |
| CC-009 | NIT | FIXED | Guard added: `toResolved.agentId ? getAgent(...) : null` |
| CC-010 | NIT | FIXED | JSDoc comment added documenting name@hostId vs AMP address distinction |
| CC-011 | NIT | UNFIXED | No test file tests/message-send.test.ts exists |
| CC-012 | NIT | FIXED | Comment added at line 81 explaining managerId:null behavior |

**Result: 11/12 FIXED, 1/12 UNFIXED (CC-011 test coverage)**

---

## Detailed Verification

### CC-001: Type mismatch Message.content.type vs AMPPayload.type — FIXED

**Report said:** `Message.content.type` was a 4-value union (`request | response | notification | update`) vs `AMPPayload.type` with 10 values.

**Current code (messageQueue.ts:41):**
```typescript
type: 'request' | 'response' | 'notification' | 'alert' | 'task' | 'status' | 'handoff' | 'ack' | 'update' | 'system'
```
Comment: `// Aligned with AMPPayload.type in lib/types/amp.ts`

The type union was expanded from 4 to 10 values, matching AMPPayload.type exactly.

### CC-002: Governance filter bypass when sender unresolved — FIXED

**Report said:** Governance check was only applied when `fromAgent?.agentId` was truthy (line 158), skipping entirely for unresolved senders.

**Current code (message-send.ts:157-173):**
```typescript
// Always check governance regardless of sender resolution.
// When sender is unresolved, pass null — checkMessageAllowed already handles
// null senders (denies mesh-forward into closed teams).
...
const filterResult = checkMessageAllowed({
  senderAgentId: fromAgent?.agentId || null,
  recipientAgentId: recipientIdForFilter,
})
```

The `if (fromAgent?.agentId)` guard was removed. Governance is now always checked, passing `null` for unresolved senders. `checkMessageAllowed` handles null senders at step 1 (line 51).

Also fixed in `forwardFromUI()` at lines 400-413 with the same pattern.

### CC-003: Recipient 'unknown' fallback defeats governance — FIXED

**Report said:** `recipientAgentId: toResolved.agentId || toResolved.alias || 'unknown'` allowed 'unknown' to bypass closed-team checks.

**Current code (message-send.ts:163-166):**
```typescript
const recipientIdForFilter = toResolved.agentId || toResolved.alias
if (!recipientIdForFilter) {
  throw new Error('Cannot send message: recipient could not be resolved to any known agent or alias')
}
```

The `'unknown'` fallback was removed. If neither agentId nor alias is available, the message is denied with an explicit error. Same pattern in forwardFromUI at lines 403-406.

### CC-004: parseAMPAddress accepts invalid name characters — FIXED

**Report said:** The regex `/^([^@]+)@(.+)$/` accepted any non-@ characters including spaces, control chars, path traversal.

**Current code (types/amp.ts:94-96):**
```typescript
// Validate name part: only alphanumeric, underscore, hyphen, dot allowed
// Prevents spaces, control chars, path traversal sequences (e.g. "../") in agent names
if (!/^[a-zA-Z0-9_.-]+$/.test(match[1])) return null
```

Name part validation added after the regex match.

### CC-005: UUID regex too permissive (partial match) — FIXED

**Report said:** The regex `/^[0-9a-f]{8}-[0-9a-f]{4}/` only matched the first two UUID groups.

**Current code (message-filter.ts:63):**
```typescript
const isUuidLike = isValidUuid(recipientAgentId)
```

Replaced the inline partial regex with `isValidUuid()` from `lib/validation.ts`, which uses:
```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

Full UUID validation with all 5 groups and end anchor.

### CC-006: `||` masking empty-string signatures — FIXED

**Report said:** `signature: message.amp?.signature || 'unsigned'` treated empty string as falsy.

**Current code (message-send.ts:92-93):**
```typescript
// Use nullish coalescing to preserve explicit empty strings; 'unsigned' only when signature is null/undefined
signature: message.amp?.signature ?? 'unsigned',
```

Changed from `||` to `??` with explanatory comment.

### CC-007: Double content security / remote path unsanitized — FIXED

**Report said:** `sendFromUI()` applied content security but only logged flags (didn't modify content). Remote path sent unsanitized content.

**Current code (message-send.ts:248-260):**
```typescript
// Content security — capture sanitized content and apply it to the message
// so both local deliver() and remote HTTP forward use the sanitized version
const { content: sanitizedContent, flags: securityFlags } = applyContentSecurity(
  message.content, isFromVerified, message.fromAlias || from, fromHostId
)
// Cast back to Message['content'] — applyContentSecurity preserves the type field unchanged
message.content = sanitizedContent as Message['content']
```

The sanitized content is now assigned back to `message.content`, so both local delivery and remote HTTP forward (which reads from `content` variable built from `message.content`) use sanitized data. The redundant application in deliver() still exists but now acts as defense-in-depth rather than being the only sanitization.

### CC-008: Error re-wrapping loses stack trace — FIXED

**Report said:** `throw new Error(\`Failed to forward message to remote agent: ${error}\`)` double-wrapped errors.

**Current code (message-send.ts:310-312, sendFromUI):**
```typescript
throw new Error(`Remote delivery to ${targetHostId} timed out`, { cause: error })
...
throw new Error(`Failed to deliver message to remote agent`, { cause: error })
```

**Current code (message-send.ts:518-521, forwardFromUI):**
```typescript
throw new Error(`Forward to ${targetHostId} timed out`, { cause: error })
...
throw new Error(`Failed to forward message to remote agent`, { cause: error })
```

Both functions now use `{ cause: error }` to preserve the original error chain.

### CC-009: Empty agentId passed to getAgent('') — FIXED

**Report said:** `getAgent('')` was called for unresolved recipients.

**Current code (message-send.ts:316, sendFromUI):**
```typescript
const recipientFullAgent = toResolved.agentId ? getAgent(toResolved.agentId) : null
```

**Current code (message-send.ts:526, forwardFromUI):**
```typescript
// Guard against empty agentId to avoid wasted getAgent('') lookup
const recipientFullAgent = toResolved.agentId ? getAgent(toResolved.agentId) : null
```

Guard added in both functions.

### CC-010: parseQualifiedName format ambiguity — FIXED

**Report said:** No documentation distinguishing `name@hostId` format from full AMP addresses.

**Current code (message-send.ts:42-46):**
```typescript
/**
 * Parse a qualified name in `name@hostId` format (NOT full AMP addresses like `name@org.aimaestro.local`).
 * Splits on the first '@' and treats everything after as hostId.
 * For AMP address parsing, use parseAMPAddress() from lib/types/amp.ts instead.
 */
```

JSDoc comment added documenting the format distinction and pointing to `parseAMPAddress()` for AMP addresses.

### CC-011: Missing test coverage for sendFromUI/forwardFromUI — UNFIXED

**Report said:** No test file exists for `message-send.ts`.

**Verification:** Searched for `tests/message-send*` — no files found. No test file has been created for message-send.ts. The governance filter integration into sendFromUI/forwardFromUI remains untested.

### CC-012: managerId:null behavior undocumented — FIXED

**Report said:** When `governance.managerId` is null, `agentIsManager(id)` always returns false, creating a window with no manager role.

**Current code (message-filter.ts:80-82):**
```typescript
// Helper: is the given agentId the manager?
// When governance.managerId is null (no manager appointed), this returns false for all agents.
const agentIsManager = (id: string) => governance.managerId === id
```

Comment added explaining the null case behavior.
