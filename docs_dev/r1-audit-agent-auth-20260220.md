# Code Correctness Report: agent-auth + amp-service signature enforcement

**Agent:** epcp-code-correctness-agent
**Domain:** agent-auth-and-signature-enforcement
**Files audited:** 3 (agent-auth.ts, amp-service.ts signature sections, amp-auth.ts)
**Date:** 2026-02-20T16:15:00Z

## MUST-FIX

### [CC-001] Unsigned messages accepted in routeMessage — signature enforcement incomplete
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:876-901
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When `body.signature` is falsy (line 876), the code falls through to the `else` branch at line 899 which only logs "No signature provided" and continues processing. There is no rejection. An attacker with a valid API key can send unsigned messages that bypass all cryptographic verification.

  The same issue exists even when `body.signature` IS present but `senderKeyPair?.publicHex` is falsy (line 877) — the signature is stored on the envelope (line 898) without any verification.

- **Evidence:**
  ```typescript
  // Line 876-901
  if (body.signature) {
    if (senderKeyPair?.publicHex) {
      // ... verify signature, reject if invalid ...
    }
    // *** If senderKeyPair is null/missing, signature is SILENTLY ACCEPTED ***
    envelope.signature = body.signature  // Line 898: stored unverified
  } else {
    console.log(`[AMP Route] No signature provided by ${envelope.from}`)
    // *** No rejection! Message proceeds unsigned ***
  }
  ```

- **Fix:** Add a rejection path when no signature is provided AND the sender is not mesh-forwarded. For the inner case (signature present but no public key), either reject or strip the unverified signature from the envelope. The "warn-only" behavior was supposed to be upgraded to enforcement but the `else` branch was not changed.

### [CC-002] Federated messages accepted unsigned when no sender_public_key provided
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:1630-1658
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In `deliverFederated()`, signature verification only happens when BOTH `envelope.signature` AND `sender_public_key` are truthy (line 1631). If either is missing, the entire signature verification block is skipped and the message is delivered. A malicious federation provider can deliver unsigned messages by simply omitting the `sender_public_key` field or the `envelope.signature` field.

- **Evidence:**
  ```typescript
  // Line 1630-1658
  let signatureVerified = false
  if (envelope.signature && sender_public_key) {  // *** Both must be truthy ***
    // ... verify and reject if invalid ...
  }
  // *** If either is missing, signatureVerified stays false but delivery proceeds ***

  // Line 1685-1689: Message is delivered regardless
  await deliver({
    ...
    senderPublicKeyHex: signatureVerified ? sender_public_key : undefined,
    ...
  })
  ```

- **Fix:** Require `envelope.signature` and `sender_public_key` for all federated messages. Return 403 if either is missing. Unsigned federation messages are a significant trust violation.

## SHOULD-FIX

### [CC-003] Timing-unsafe API key hash comparison
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`:89-92
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `verifyApiKeyHash()` uses `===` string comparison for hash comparison. This is vulnerable to timing side-channel attacks where an attacker can determine how many bytes of the hash match by measuring response time. While the project comment at governance.ts:88-89 acknowledges this is "accepted risk" for Phase 1 localhost-only, the API key system is designed for network use (AMP federation, cross-host mesh) where timing attacks become feasible.

- **Evidence:**
  ```typescript
  // Line 89-92
  export function verifyApiKeyHash(apiKey: string, storedHash: string): boolean {
    const computedHash = hashApiKey(apiKey)
    return computedHash === storedHash  // *** Not timing-safe ***
  }
  ```

  Note: `validateApiKey()` at line 169-170 uses `keys.find(k => k.key_hash === keyHash ...)` which has the same issue but is slightly less exploitable since it scans an array.

- **Fix:** Use `crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash))` with a length check guard.

### [CC-004] Unverified signature stored on envelope
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:897-898
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When `body.signature` is present but `senderKeyPair?.publicHex` is falsy (e.g., mesh-forwarded message from a trusted host, or agent without a keypair), the signature is copied to the envelope at line 898 without any verification. Downstream consumers of `envelope.signature` may incorrectly assume it was verified.

- **Evidence:**
  ```typescript
  if (body.signature) {
    if (senderKeyPair?.publicHex) {
      // ... verify ...
    }
    // Falls through to here if no public key
    envelope.signature = body.signature  // *** Stored unverified ***
  }
  ```

- **Fix:** Only set `envelope.signature = body.signature` inside the verified branch, or add a boolean field `envelope.signatureVerified` to track verification status.

### [CC-005] Unreachable code path silently falls through as system owner
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`:66-67
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 67 `return {}` is unreachable dead code (annotated with "Should not reach here"). The logic at lines 32-64 is exhaustive: `!authHeader && !agentIdHeader` returns at line 33; `agentIdHeader && !authHeader` returns at line 38; `authHeader` is truthy covers the remaining case at line 45. However, the fallback return at line 67 returns `{}` (system owner privileges). If future code changes break the exhaustive coverage, the silent fallback would grant system owner access — a privilege escalation.

- **Evidence:**
  ```typescript
  // Line 66-67
  // Should not reach here, but return empty (system owner) for safety
  return {}
  ```

- **Fix:** Change the fallback to return an error `{ error: 'Internal authentication error', status: 500 }` instead of granting system owner privileges. Or add a `throw new Error('unreachable')`.

### [CC-006] Empty string Authorization header bypasses X-Agent-Id check
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`:30-42
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** If `authHeader` is an empty string `""` and `agentIdHeader` is set, the check at line 37 (`agentIdHeader && !authHeader`) evaluates to `true && true` (because `!""` is `true`), so the spoofing rejection triggers correctly. HOWEVER, if `authHeader` is a whitespace string like `" "`, then `!authHeader` is `false`, so the code falls to line 45 where `if (authHeader)` is `true` (non-empty string). `authenticateRequest(" ")` would then attempt to parse `" "` as a Bearer token, which `extractApiKeyFromHeader` handles by returning `null`, causing a 401. So this edge case IS handled, but only incidentally through `amp-auth.ts` returning `null`.

  The code does NOT handle the case where HTTP headers pass `undefined` vs `null` — `request.headers.get()` returns `null` in Next.js, but headless router may pass different types. The function signature accepts `string | null` but callers should be verified.

- **Fix:** Add explicit trimming: `const auth = authHeader?.trim() || null` and `const agentId = agentIdHeader?.trim() || null` at the top of the function to normalize inputs.

## NIT

### [CC-007] Mesh-forwarded address spoofing produces only a warning
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:832-841
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When a mesh-forwarded message has a sender address whose tenant doesn't match the forwarding host, the code only `console.warn`s about "possible address spoofing" but proceeds with delivery. This allows a compromised mesh host to forge sender addresses.

- **Evidence:**
  ```typescript
  if (senderParsed.tenant !== forwardedFrom && senderParsed.tenant !== expectedHostName) {
    console.warn(`[AMP Route] Sender address tenant ... does not match ... -- possible address spoofing`)
  }
  ```

- **Fix:** Consider rejecting the message or at minimum stripping/overriding the sender address to match the forwarding host. Mark this as a Phase 2 fix if mesh trust model is fully trusted in Phase 1.

### [CC-008] Test coverage gap: empty string and whitespace inputs
- **File:** `/Users/emanuelesabetta/ai-maestro/tests/agent-auth.test.ts`
- **Severity:** NIT
- **Category:** test-coverage
- **Confidence:** CONFIRMED
- **Description:** The test suite covers the main paths well but does not test edge cases with empty strings (`""`) or whitespace strings (`"  "`) for `authHeader` and `agentIdHeader`. It also does not test the combination of `authHeader = "Bearer "` (Bearer with empty token).

- **Fix:** Add test cases for: `authenticateAgent("", "some-agent")`, `authenticateAgent("  ", null)`, `authenticateAgent("Bearer ", null)`, `authenticateAgent("Bearer ", "agent-id")`.

## CLEAN

Files with no issues found:
- None — all audited files had findings.

## SUMMARY

| Severity | Count | Details |
|----------|-------|---------|
| MUST-FIX | 2 | CC-001 (unsigned local messages accepted), CC-002 (unsigned federated messages accepted) |
| SHOULD-FIX | 4 | CC-003 (timing-unsafe hash comparison), CC-004 (unverified sig stored), CC-005 (unsafe unreachable fallback), CC-006 (whitespace edge case) |
| NIT | 2 | CC-007 (mesh spoofing warn-only), CC-008 (test coverage gaps) |

The two MUST-FIX issues are critical: the signature enforcement that was supposed to be upgraded from "warn-only" to "reject" is incomplete. The `routeMessage` function still accepts unsigned messages from any authenticated agent, and `deliverFederated` accepts unsigned federation messages when `sender_public_key` is omitted. These paths must be closed before this can be considered secure.
