# Code Correctness Report: messaging

**Agent:** epcp-code-correctness-agent
**Domain:** messaging
**Files audited:** 3
**Date:** 2026-02-19T00:00:00Z

## MUST-FIX

### [CC-001] Message filter bypass: `agentIsManager()` matches when managerId is null
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:62
- **Severity:** MUST-FIX
- **Category:** logic / security
- **Confidence:** CONFIRMED
- **Description:** The `agentIsManager` helper compares `governance.managerId === id`. The `GovernanceConfig.managerId` type is `string | null`. When no MANAGER is set (`managerId: null`), this comparison is safe because `null === someString` is always `false`. However, there is a deeper issue: the `/api/v1/route/route.ts` caller at line 575 passes `senderAgentId: senderAgent?.id || null`. If `senderAgent` is undefined (external/mesh sender), `senderAgentId` becomes `null`, which hits Step 1 (mesh-forwarded, always allowed) and bypasses all governance checks. This means **any unauthenticated mesh-forwarded message can reach agents inside closed teams**, which contradicts R6.5 (outside sender to closed-team recipient should be denied). The `senderAgentId === null` path at line 42 trusts all mesh-forwarded messages unconditionally.
- **Evidence:**
  ```typescript
  // message-filter.ts:42
  if (senderAgentId === null) {
    return { allowed: true }
  }

  // api/v1/route/route.ts:574-575
  const filterResult = checkMessageAllowed({
    senderAgentId: senderAgent?.id || null,  // null when sender is unknown/external
    recipientAgentId: localAgent.id,
  })
  ```
- **Fix:** In the `/api/v1/route` caller, if `senderAgent` is null (unknown sender from mesh), pass a sentinel value like `'__mesh_unknown__'` instead of `null`, so that the filter can distinguish "mesh-forwarded with known peer" from "completely unknown sender". Alternatively, add a `meshForwarded: boolean` field to `MessageFilterInput` and only allow mesh bypass when the header `X-Forwarded-From` is from a trusted/registered host (verified against hosts.json). The current blanket trust of null sender is a governance bypass vector.

### [CC-002] Filter bypass via unresolved recipient: alias/name used instead of UUID
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:158
- **Severity:** MUST-FIX
- **Category:** security / logic
- **Confidence:** CONFIRMED
- **Description:** When the recipient cannot be resolved locally (e.g., remote or unknown agent), `toResolved.agentId` is empty string `''`, so the filter falls back to `toResolved.alias || 'unknown'`. The message filter then checks this alias against `closedTeams[].agentIds[]`, which contains UUIDs. An alias will never match a UUID, so `recipientInClosed` will be `false`, and the filter will treat the recipient as "not in a closed team" -- allowing the message through even if the actual recipient IS in a closed team on a remote host.
- **Evidence:**
  ```typescript
  // message-send.ts:145-148
  const toResolved: ResolvedAgent = toAgent || {
    agentId: '',  // Empty string
    alias: options.toAlias || toIdentifier,
    // ...
  }

  // message-send.ts:156-159
  const filterResult = checkMessageAllowed({
    senderAgentId: fromAgent.agentId,
    recipientAgentId: toResolved.agentId || toResolved.alias || 'unknown',
    // When toAgent is null: recipientAgentId = alias (not UUID)
  })
  ```
  The filter at message-filter.ts:53 does: `closedTeams.filter(t => t.agentIds.includes(recipientAgentId))` -- aliases will never match UUIDs.
- **Fix:** When the recipient cannot be resolved to a UUID, and the sender IS in a closed team, the filter should deny by default (fail-closed for governance). Add a `recipientResolved: boolean` flag to `MessageFilterInput`, or deny when `recipientAgentId` is not a valid UUID and sender is in a closed team.

## SHOULD-FIX

### [CC-003] `generateMessageId()` uses `Math.random()` -- weak randomness for message IDs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:57-59
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Message IDs are generated with `Math.random().toString(36).substring(2, 9)`, which provides only ~36 bits of entropy and is not cryptographically random. While `crypto` is already imported in this file, it is not used for ID generation. Message IDs could potentially be predicted, enabling replay attacks or message ID collisions.
- **Evidence:**
  ```typescript
  function generateMessageId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    return `msg-${timestamp}-${random}`
  }
  ```
- **Fix:** Use `crypto.randomBytes(8).toString('hex')` or `crypto.randomUUID()` instead of `Math.random()`. The `crypto` module is already imported on line 17.

### [CC-004] `AMP_RELAY_TTL_DAYS` does not validate parsed integer -- NaN propagates silently
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:26
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseInt(process.env.AMP_RELAY_TTL_DAYS || '7', 10)` will return `NaN` if the env var is set to a non-numeric string (e.g., `"abc"`). `NaN` then propagates into the relay queue TTL calculation (`NaN * 24 * 60 * 60 * 1000` = `NaN`), causing `expires_at` to be `Invalid Date`, which means messages would never expire or would be immediately expired depending on downstream comparison logic.
- **Evidence:**
  ```typescript
  export const AMP_RELAY_TTL_DAYS = parseInt(process.env.AMP_RELAY_TTL_DAYS || '7', 10)
  // If AMP_RELAY_TTL_DAYS="abc" → parseInt("abc", 10) = NaN
  ```
- **Fix:** Add NaN guard: `const parsed = parseInt(process.env.AMP_RELAY_TTL_DAYS || '7', 10); export const AMP_RELAY_TTL_DAYS = Number.isNaN(parsed) ? 7 : parsed`

### [CC-005] `parseAMPAddress` regex rejects valid multi-dot provider names
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:90
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The regex `/^([^@]+)@([^.]+)\.(.+)$/` captures organization as the first dot-segment after `@`, and provider as everything after. This works for `agent@org.aimaestro.local` but would also match `agent@org.sub.provider.com` where `organization="org"` and `provider="sub.provider.com"`. This is fine for the current `.aimaestro.local` suffix, but the function docstring says "Parse an AMP address into components" generically. More critically, addresses without a dot after `@` (e.g., `agent@localhost`) return `null`, which could cause issues for local-only deployments.
- **Evidence:**
  ```typescript
  const match = address.match(/^([^@]+)@([^.]+)\.(.+)$/)
  if (!match) return null  // "agent@localhost" → null
  ```
- **Fix:** Either document the constraint that AMP addresses must have at least one dot in the domain part, or handle the `@localhost` case by making the dot-split optional.

### [CC-006] Forwarded message `fromLabel` is never set
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:426-453
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `forwardedMessage` object built in `forwardFromUI()` does not set `fromLabel` or `toLabel`, unlike `sendFromUI()` which sets them from options. The `Message` type likely has these optional fields. While not a crash, it means forwarded messages will display raw alias/UUID in the UI instead of the human-friendly display name.
- **Evidence:**
  ```typescript
  // sendFromUI() sets fromLabel (line 214):
  fromLabel: options.fromLabel || fromAgent?.displayName,

  // forwardFromUI() does NOT set fromLabel (line 426-453):
  const forwardedMessage: Message = {
    // ...
    from: fromResolved.agentId,
    fromAlias: fromResolved.alias,
    // fromLabel is missing
    // toLabel is missing
  }
  ```
- **Fix:** Add `fromLabel: fromResolved.displayName` and `toLabel: toResolved.displayName` to the forwarded message construction.

### [CC-007] `buildAMPEnvelope` accesses `message.amp?.signature` but `Message.amp` may not have this shape
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:88
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** `buildAMPEnvelope()` accesses `message.amp?.signature` on line 88. The `Message` type's `amp` field (from messageQueue.ts) has optional `signature` property. For forwarded messages (from `forwardFromUI()`), the `forwardedMessage` object does not set an `amp` field at all, so `message.amp?.signature` will be `undefined`, and the envelope `signature` will be `''`. This is functionally OK but means the AMP envelope always has an empty signature for forwarded messages, which downstream receivers may interpret differently than "unsigned".
- **Evidence:**
  ```typescript
  // line 88
  signature: message.amp?.signature || '',
  ```
- **Fix:** Consider setting `signature: 'none'` or explicitly marking unsigned envelopes so downstream can distinguish "no signature provided" from "empty signature".

## NIT

### [CC-008] Dead code: Step 6 in message-filter.ts is unreachable
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:120-126
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Step 6 checks `!senderInClosed && recipientInClosed`. However, by this point in the code: Step 2 already returned if `!senderInClosed && !recipientInClosed`. Step 3 returned if sender is MANAGER. Step 4 returned (either true or false) if sender is COS. Step 5 returned (either true or false) if `senderInClosed`. So after Step 5, `senderInClosed` must be `false` (otherwise Step 5 would have returned). And since we passed Step 2, if `senderInClosed` is `false` then `recipientInClosed` must be `true`. So the condition `!senderInClosed && recipientInClosed` at Step 6 is ALWAYS true when reached. The code is correct but the conditional is redundant.
- **Evidence:**
  ```typescript
  // After Step 5 returns for senderInClosed=true cases...
  // Step 6: senderInClosed is guaranteed false, recipientInClosed is guaranteed true
  if (!senderInClosed && recipientInClosed) {  // Always true here
    return { allowed: false, reason: '...' }
  }
  // Step 7: return { allowed: true }  // UNREACHABLE
  ```
  Step 7 (default allow on line 129) is also unreachable.
- **Fix:** Replace Steps 6+7 with a direct `return { allowed: false, reason: '...' }`. The conditional and default case are dead code. This improves readability and makes the exhaustive coverage explicit.

### [CC-009] `parseQualifiedName` does not handle multiple `@` signs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:46-51
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseQualifiedName` splits on `@` and checks if there are exactly 2 parts. An address like `user@host@extra` would produce 3 parts and be treated as having no hostId (returns the full string as identifier). This is safe but potentially confusing.
- **Evidence:**
  ```typescript
  const parts = qualifiedName.split('@')
  if (parts.length === 2) {
    return { identifier: parts[0], hostId: parts[1] }
  }
  return { identifier: qualifiedName, hostId: null }
  ```
- **Fix:** Consider using `qualifiedName.split('@', 2)` or `indexOf('@')` + `substring` to handle the "first @ is the delimiter" pattern more robustly, and log a warning for malformed addresses with multiple `@` signs.

### [CC-010] `AMPPayload.type` union does not include all content types used in practice
- **File:** /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts:150
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** LIKELY
- **Description:** The `AMPPayload.type` is a union of specific string literals. The `Message.content.type` field is used directly as `AMPPayload.type` in `buildAMPEnvelope()` (line 95). If `Message.content.type` includes values not in the AMPPayload union (e.g., custom types), TypeScript would flag this at compile time. However, given that the `Message` type from `messageQueue.ts` may have a broader type, there could be a type mismatch.
- **Evidence:**
  ```typescript
  // amp.ts:150
  type: 'request' | 'response' | 'notification' | 'alert' | 'task' | 'status' | 'handoff' | 'ack' | 'update' | 'system'

  // message-send.ts:95
  const payload: AMPPayload = {
    type: message.content.type,  // May not match the union
  }
  ```
- **Fix:** Verify that `Message.content.type` is assignable to `AMPPayload['type']`, or add a type assertion with validation.

## CLEAN

Files with no issues found:
- (none -- all three files have findings)

## Summary

| Severity | Count |
|----------|-------|
| MUST-FIX | 2 |
| SHOULD-FIX | 5 |
| NIT | 3 |
| **Total** | **10** |

**Critical findings:**
1. **CC-001**: Mesh-forwarded messages (null sender) bypass governance filter entirely, allowing outside messages to reach closed-team members.
2. **CC-002**: When recipient cannot be resolved to UUID, governance filter is ineffective because it compares aliases against UUID-based team membership lists.
