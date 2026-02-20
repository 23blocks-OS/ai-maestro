# Code Correctness Report: messaging

**Agent:** epcp-code-correctness-agent
**Domain:** messaging
**Files audited:** 3
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] Type mismatch: Message.content.type (4 values) vs AMPPayload.type (10 values)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:98
- **Severity:** MUST-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `buildAMPEnvelope()` assigns `message.content.type` directly to an `AMPPayload.type` field at line 98. However, `Message.content.type` (defined in `lib/messageQueue.ts:41`) is a union of 4 values: `'request' | 'response' | 'notification' | 'update'`. Meanwhile, `AMPPayload.type` (defined in `lib/types/amp.ts:165`) is a union of 10 values: `'request' | 'response' | 'notification' | 'alert' | 'task' | 'status' | 'handoff' | 'ack' | 'update' | 'system'`. This means:
  1. TypeScript will NOT flag an error because the 4-value union is assignable to the 10-value union (narrower to wider).
  2. However, if an AMP message arrives via `/api/v1/route` with `type: 'task'` or `type: 'alert'` and is stored into a `Message` object, the `Message.content.type` field will contain a value that its own type definition doesn't allow. This is a silent data integrity issue -- the received AMP payload type gets silently stored in a field that claims to only accept 4 values.
- **Evidence:**
  ```typescript
  // lib/messageQueue.ts:40-42
  content: {
    type: 'request' | 'response' | 'notification' | 'update'  // 4 values
    ...
  }

  // lib/types/amp.ts:165
  type: 'request' | 'response' | 'notification' | 'alert' | 'task' | 'status' | 'handoff' | 'ack' | 'update' | 'system'  // 10 values

  // lib/message-send.ts:97-99
  const payload: AMPPayload = {
    type: message.content.type,  // 4-value union assigned to 10-value union -- works
    ...
  }
  ```
- **Fix:** Align the two type unions. Either:
  (a) Expand `Message.content.type` to match `AMPPayload.type` (all 10 values), or
  (b) Create a shared `MessageContentType` union exported from one canonical location and used by both interfaces.

### [CC-002] Governance filter bypass when sender is remote/unresolved (senderAgentId empty or unresolvable)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:158-166
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The governance message filter in `sendFromUI()` is only applied when `fromAgent?.agentId` is truthy (line 158). If the sender cannot be resolved by `resolveAgentIdentifier()` (returns null), the entire governance check is skipped. This means a message sent with a raw string identifier that doesn't resolve to any known agent will bypass all closed-team messaging isolation. A similar bypass exists in `forwardFromUI()` at line 392, but `forwardFromUI` at least requires `fromResolved` to be non-null (line 373), so the agentId will be present if the sender resolves. However, the resolved agent could have an empty agentId string if `resolveAgentIdentifier` returns a minimal object.
- **Evidence:**
  ```typescript
  // lib/message-send.ts:158-166
  if (fromAgent?.agentId) {  // Skipped entirely if fromAgent is null
    const filterResult = checkMessageAllowed({
      senderAgentId: fromAgent.agentId,
      recipientAgentId: toResolved.agentId || toResolved.alias || 'unknown',
    })
    if (!filterResult.allowed) {
      throw new Error(filterResult.reason || 'Message blocked by team governance policy')
    }
  }
  ```
- **Fix:** When the sender cannot be resolved and governance is active (any closed teams exist), either:
  (a) Deny the message by default ("unknown sender cannot message into governed system"), or
  (b) Pass `senderAgentId: null` to `checkMessageAllowed()` which already handles null senders (step 1 -- mesh-forward denial for closed-team recipients). This would be the semantically correct fix since an unresolved local sender is analogous to an unverified mesh sender.

## SHOULD-FIX

### [CC-003] Recipient `'unknown'` fallback defeats governance for unresolved recipients
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:161
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When both `toResolved.agentId` and `toResolved.alias` are empty/falsy, the recipient passed to `checkMessageAllowed()` is the literal string `'unknown'`. Since `'unknown'` will never appear in any team's `agentIds` array, `recipientInClosed` will be false, and the filter will treat the recipient as an open-world agent (step 2 allows freely). This means a message to an unresolvable recipient from an open-world sender will always be allowed, even if the intended recipient is actually inside a closed team.
- **Evidence:**
  ```typescript
  // lib/message-send.ts:161
  recipientAgentId: toResolved.agentId || toResolved.alias || 'unknown',
  ```
- **Fix:** If the recipient cannot be resolved (both agentId and alias are empty), and closed teams exist, either deny the message or require resolution before sending. The `'unknown'` literal is a silent bypass.

### [CC-004] `parseAMPAddress` returns `null` for addresses with empty name part (e.g., `@domain.com`)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:91
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `/^([^@]+)@(.+)$/` requires at least one character before `@`, so `@domain.com` correctly returns `null`. However, the function does NOT validate that `match[1]` (the name part) contains only valid characters. Agent names should be `[a-zA-Z0-9_-]+` per tmux constraints, but `parseAMPAddress` accepts any non-`@` characters including spaces, control characters, and path traversal sequences like `../`.
- **Evidence:**
  ```typescript
  // lib/types/amp.ts:91
  const match = address.match(/^([^@]+)@(.+)$/)
  ```
- **Fix:** Add validation that the name part matches `^[a-zA-Z0-9_.-]+$` (or whatever the canonical agent name regex is), and return `null` for invalid names.

### [CC-005] UUID regex in message-filter.ts is too permissive (partial match)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:62
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `/^[0-9a-f]{8}-[0-9a-f]{4}/` only matches the first two groups of a UUID (8-4), not the full UUID pattern. A string like `"12345678-abcd"` (12 chars) would pass as "UUID-like" even though it's not a valid UUID. This could allow a crafted identifier to bypass the alias guard in step 1b.
- **Evidence:**
  ```typescript
  // lib/message-filter.ts:62
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(recipientAgentId)
  ```
- **Fix:** Use a stricter UUID v4 regex:
  ```typescript
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(recipientAgentId)
  ```

### [CC-006] `buildAMPEnvelope` uses `message.amp?.signature || 'unsigned'` - masking empty-string signatures
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:91
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `||` operator treats empty string `''` as falsy, so if `message.amp.signature` is `''` (explicitly set to empty), it becomes `'unsigned'`. This is intentional per the comment ("Use 'unsigned' instead of empty string"), but downstream consumers checking `envelope.signature !== 'unsigned'` would incorrectly trust a message where the signature was explicitly cleared/empty. The distinction between "no signature provided" (`undefined`) and "signature was empty" (`''`) is lost.
- **Evidence:**
  ```typescript
  // lib/message-send.ts:91
  signature: message.amp?.signature || 'unsigned',
  ```
- **Fix:** Use nullish coalescing (`??`) to preserve explicit empty strings, or validate that a non-empty, non-'unsigned' signature means "signed":
  ```typescript
  signature: message.amp?.signature ?? 'unsigned',
  ```

### [CC-007] Double content security application: sendFromUI applies it, then deliver() applies it again
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:242-250 and /Users/emanuelesabetta/ai-maestro/lib/message-delivery.ts:50-57
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `sendFromUI()` calls `applyContentSecurity()` at line 242, but the result is only used for logging (`securityFlags`). The actual message content is NOT modified by this call - it only logs flags. Then `deliver()` is called at line 323 with the original message, and `deliver()` calls `applyContentSecurity()` again at line 52 (in message-delivery.ts). This means:
  1. The content security in `sendFromUI` is purely cosmetic (logs but doesn't sanitize).
  2. The actual sanitization happens in `deliver()`.
  3. However, for remote messages (line 268-303), `deliver()` is NOT called -- the message is sent via HTTP fetch without any sanitization applied to the payload.
- **Evidence:**
  ```typescript
  // message-send.ts:242-250 -- applies but only logs
  const { flags: securityFlags } = applyContentSecurity(
    message.content, isFromVerified, message.fromAlias || from, fromHostId
  )
  if (securityFlags.length > 0) {
    console.log(`[SECURITY] Message from ${message.fromAlias || from}: ${securityFlags.length} injection pattern(s) flagged`)
  }
  // message.content is NOT reassigned -- original content is sent

  // message-send.ts:284-288 -- remote path uses unsanitized content
  payload: { type: content.type, message: content.message, context: content.context },
  ```
- **Fix:** Either:
  (a) Apply content security in `sendFromUI()` and pass the sanitized content to both local and remote paths, OR
  (b) Remove the redundant call in `sendFromUI()` since `deliver()` handles it for local, and add sanitization for the remote path.

### [CC-008] `forwardFromUI` error catch re-wraps already-thrown errors losing stack trace
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:504-508
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the remote forwarding path (line 504), the catch block re-wraps the error with `throw new Error(...)`, which stringifies the original error via template literal interpolation. If the original error was already an `Error` with a message (e.g., from the `remoteResponse.ok` check at line 500-502), the new error's message will be `"Failed to forward message to remote agent: Error: Remote host returned 500: ..."` -- a double-wrapped message with lost stack trace. The same pattern exists in `sendFromUI()` at line 298-302.
- **Evidence:**
  ```typescript
  // message-send.ts:504-508
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Forward to ${targetHostId} timed out`)
    }
    throw new Error(`Failed to forward message to remote agent: ${error}`)  // Double-wraps
  }
  ```
- **Fix:** Preserve the original error as `cause`:
  ```typescript
  throw new Error(`Failed to forward message to remote agent`, { cause: error })
  ```
  Or rethrow known Error types directly.

## NIT

### [CC-009] `toResolved.agentId` is empty string for unresolved recipients but passed to `getAgent()`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:306
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When the recipient is unresolved, `toResolved.agentId` is `''` (empty string, set at line 149). This empty string is then passed to `getAgent('')` at line 306, which will fail to find any agent and return null. While this doesn't cause a crash (the code handles null), it's a wasted lookup that could be avoided with a guard.
- **Evidence:**
  ```typescript
  // message-send.ts:148-149
  const toResolved: ResolvedAgent = toAgent || {
    agentId: '',  // Empty string
    ...
  }
  // message-send.ts:306
  const recipientFullAgent = getAgent(toResolved.agentId)  // getAgent('')
  ```
- **Fix:** Guard with `toResolved.agentId ? getAgent(toResolved.agentId) : null`.

### [CC-010] `parseQualifiedName` splits on first `@` but AMP addresses have format `name@org.provider`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:45-52
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `parseQualifiedName` splits on the first `@` and treats everything after as `hostId`. But AMP addresses use the format `name@org.aimaestro.local`. If a full AMP address is passed (e.g., `backend-api@default.aimaestro.local`), the hostId would be `default.aimaestro.local`, which wouldn't match any host in `hosts.json`. The function works correctly for the intended `name@hostId` format, but there's no validation or documentation distinguishing the two formats.
- **Evidence:**
  ```typescript
  // message-send.ts:45-52
  function parseQualifiedName(qualifiedName: string): { identifier: string; hostId: string | null } {
    const atIndex = qualifiedName.indexOf('@')
    if (atIndex > 0 && atIndex < qualifiedName.length - 1) {
      return { identifier: qualifiedName.substring(0, atIndex), hostId: qualifiedName.substring(atIndex + 1) }
    }
    return { identifier: qualifiedName, hostId: null }
  }
  ```
- **Fix:** Add a comment documenting that this function expects `name@hostId` format (NOT full AMP addresses), or add logic to strip `.aimaestro.local` suffix from the hostId if present.

### [CC-011] Missing test coverage for `sendFromUI()` and `forwardFromUI()`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts
- **Severity:** NIT
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** No test file exists for `message-send.ts`. The governance filter is tested in `tests/message-filter.test.ts`, but the integration of the filter into `sendFromUI()` and `forwardFromUI()` (including the bypass when fromAgent is null -- CC-002) has no test coverage.
- **Fix:** Create `tests/message-send.test.ts` covering at minimum: (1) governance filter bypass for unresolved senders, (2) remote message routing, (3) AMP relay queuing for external agents, (4) content security application (or lack thereof) for remote messages.

### [CC-012] `GovernanceConfig.managerId` is `string | null` but `agentIsManager` does strict equality
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:80
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `governance.managerId` is `null`, the helper `agentIsManager(id)` does `null === id`, which is always false (since `id` is `string`). This is correct behavior, but it means the `managerId: null` case is silently a no-op. Given that the governance system initializes with `managerId: null`, there's a window where no one has the MANAGER role and COS agents cannot reach "the manager" (because there is no manager). This is probably intended but worth documenting.
- **Evidence:**
  ```typescript
  // message-filter.ts:80
  const agentIsManager = (id: string) => governance.managerId === id
  // governance.ts DEFAULT_GOVERNANCE_CONFIG has managerId: null
  ```
- **Fix:** No code change needed, but add a comment explaining the `managerId: null` case means "no manager appointed yet."

## CLEAN

Files with no issues found:
- (none -- all 3 files had findings)
