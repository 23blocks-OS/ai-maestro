# Code Correctness Report: agent-auth + amp-service (signature/auth)

**Agent:** epcp-code-correctness-agent (Round 2 - Independent)
**Domain:** agent-auth-amp-service
**Files audited:** 4 (2 primary, 2 context)
**Date:** 2026-02-20T16:21:00Z

## Files Audited

1. `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` (68 lines)
2. `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (1715 lines) -- focused on `routeMessage` and `deliverFederated`
3. `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts` (392 lines) -- context for authenticateRequest
4. `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts` (455 lines) -- context for verifySignature

---

## MUST-FIX

### [CC-001] routeMessage accepts unsigned messages without rejection
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:876-901
- **Severity:** MUST-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** When `body.signature` is falsy (undefined/null/empty string), the code simply logs "No signature provided" and continues to deliver the message. This means any authenticated agent can send messages without signing them, and the messages will be delivered without any cryptographic proof of authorship. The signature field on the envelope is left as empty string `''`. While the sender must still authenticate via API key, this defeats the purpose of the Ed25519 signing infrastructure -- an attacker who steals an API key can send messages that appear to come from that agent without possessing the private key.
- **Evidence:**
  ```typescript
  // Line 876-901
  if (body.signature) {
    // ... verification logic ...
  } else {
    console.log(`[AMP Route] No signature provided by ${envelope.from}`)
    // Falls through -- message is delivered unsigned!
  }
  ```
- **Fix:** For non-forwarded messages, require `body.signature` to be present. At minimum, mark unsigned messages clearly in the envelope metadata so recipients can distinguish signed from unsigned messages. Ideally, reject unsigned messages from locally-authenticated agents (they have keypairs and should sign).

### [CC-002] deliverFederated accepts messages with missing signature + missing public key
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:1629-1658
- **Severity:** MUST-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The signature verification block at line 1631 is: `if (envelope.signature && sender_public_key)`. If either the signature OR the public key is missing, the entire verification block is skipped, and the message is delivered without any verification. A malicious federated provider could send any message claiming to be from any agent simply by omitting the signature or the public key.
- **Evidence:**
  ```typescript
  // Line 1630-1658
  let signatureVerified = false
  if (envelope.signature && sender_public_key) {
    // ... verification ...
  }
  // If this block is skipped (no sig or no key), signatureVerified stays false
  // but execution continues to deliver the message at line 1685
  ```
  At line 1689, the code does pass `signatureVerified ? sender_public_key : undefined` to `deliver()`, but the message is still delivered regardless.
- **Fix:** Reject federated messages that lack a signature or a public key. Federation is an external trust boundary -- all messages crossing it must be signed and verified.

### [CC-003] routeMessage signature verification skipped when sender has no stored keypair
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:876-898
- **Severity:** MUST-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** When `body.signature` is provided but `senderKeyPair?.publicHex` is falsy (agent has no stored keypair), the signature is accepted without verification and copied directly to the envelope. The `if (senderKeyPair?.publicHex)` check at line 877 silently skips verification. This means a compromised agent that somehow lost its keypair (or a re-registered agent) could send forged signatures that would be propagated as-is.
- **Evidence:**
  ```typescript
  // Line 876-898
  if (body.signature) {
    if (senderKeyPair?.publicHex) {
      // Verification happens here
    }
    // If no publicHex, falls through without verification
    envelope.signature = body.signature  // Line 898: copies unverified signature!
  }
  ```
- **Fix:** If `body.signature` is present but no public key exists for the sender, reject the message or at minimum clear the signature from the envelope to prevent propagating unverified signatures.

---

## SHOULD-FIX

### [CC-004] Timing attack vulnerability in API key hash comparison
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`:89-92 and 169-170
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** `verifyApiKeyHash` (line 91) uses `===` for hash comparison, and `validateApiKey` (line 170) uses `===` to compare `k.key_hash === keyHash`. String equality operators in JavaScript are not constant-time -- they short-circuit on the first differing character. This makes the comparison vulnerable to timing side-channel attacks where an attacker can determine how many leading characters of a hash match by measuring response time.
- **Evidence:**
  ```typescript
  // Line 91 (verifyApiKeyHash)
  return computedHash === storedHash

  // Line 170 (validateApiKey - the one actually used)
  const record = keys.find(k =>
    k.key_hash === keyHash &&
    ...
  )
  ```
- **Fix:** Use `crypto.timingSafeEqual()` for hash comparison:
  ```typescript
  const { timingSafeEqual } = require('crypto')
  return timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash))
  ```
  Note: Both buffers must be the same length. Since both are `sha256:` + 64 hex chars, they will always be the same length for valid hashes.

### [CC-005] authenticateAgent treats empty-string headers as "no auth attempt"
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`:32
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** logic
- **Description:** The check `if (!authHeader && !agentIdHeader)` at line 32 treats empty strings as falsy, meaning `authenticateAgent("", "")` returns `{}` (system owner), which grants unauthenticated system-owner access. While `request.headers.get()` in Next.js returns `null` for missing headers (not empty string), some proxy configurations or custom HTTP clients might send empty Authorization headers. An attacker sending `Authorization: ` (with empty value) or `X-Agent-Id: ` could bypass authentication and be treated as system owner.
- **Evidence:**
  ```typescript
  // Line 32
  if (!authHeader && !agentIdHeader) {
    return {}  // System owner -- full access
  }
  ```
  The header values come from `request.headers.get('Authorization')` which returns `string | null`. In practice, an empty Authorization header would be `""` which is falsy in JS.
- **Fix:** Explicitly check for `null` instead of using falsy checks:
  ```typescript
  if (authHeader === null && agentIdHeader === null) {
    return {}
  }
  ```

### [CC-006] Mesh-forwarded messages bypass signature verification entirely
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:744-757, 874
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** When a message is forwarded from a trusted mesh host (`forwardedFrom` is set and matches a configured host), the code sets `senderKeyPair` to `null` at line 874 (`isMeshForwarded ? null : loadKeyPair(...)`). This means any signature provided with a mesh-forwarded message is never verified -- it's just blindly copied to the envelope at line 898. The comment at line 755 confirms this: "signature NOT verified -- trusted host". However, the original sender's signature should still be verifiable using the sender's public key, which could be fetched or included in forwarded data.
- **Evidence:**
  ```typescript
  // Line 874
  const senderKeyPair = isMeshForwarded ? null : loadKeyPair(auth.agentId!)

  // Line 755
  console.log(`[AMP Route] Accepting mesh-forwarded request from ${forwardedFrom} (signature NOT verified -- trusted host)`)
  ```
- **Fix:** For mesh-forwarded messages, attempt to verify the signature using the `_forwarded.original_from` sender's public key (resolved via the sender's host). If verification fails, reject the message or clearly mark it as unverified.

### [CC-007] Race condition in file-based API key storage (validateApiKey)
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`:161-187
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** race-condition
- **Description:** `validateApiKey` performs a read-modify-write cycle (load keys, update `last_used_at`, save keys) without any file locking. If two requests arrive simultaneously for different API keys, the second `saveApiKeys` call will overwrite the first's `last_used_at` update. More critically, if `createApiKey` or `rotateApiKey` runs concurrently with `validateApiKey`, the newly created/rotated key could be lost.
- **Evidence:**
  ```typescript
  // Lines 166-183
  const keys = loadApiKeys()         // Read
  const keyHash = hashApiKey(apiKey)
  const record = keys.find(...)
  if (record) {
    record.last_used_at = ...        // Modify
    saveApiKeys(keys)                // Write -- no lock!
  }
  ```
- **Fix:** Use file locking (e.g., `proper-lockfile` or `fd-lock`) around read-modify-write operations, or use an atomic write pattern with a lockfile.

### [CC-008] Federation replay protection fails open
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:205-209
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** In `trackMessageId`, if `fs.writeFileSync` fails (line 206), the function still returns `true` (line 211), allowing the message through. The comment says "fail open for delivery" but this defeats replay protection -- if an attacker can cause write failures (e.g., fill disk, permission issues), they can replay messages indefinitely.
- **Evidence:**
  ```typescript
  // Lines 205-211
  try {
    fs.writeFileSync(filePath, id, 'utf-8')
  } catch {
    // If write fails, allow message through (fail open for delivery)
  }
  return true
  ```
- **Fix:** Fail closed: if the tracking file cannot be written, reject the message. Replay protection is a security control and should not fail open.

### [CC-009] API key hash not using a salt (SHA-256 without salt)
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`:82-84
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** `hashApiKey` uses plain SHA-256 without a salt. While the API keys themselves are 32 random bytes (256 bits of entropy), making brute force infeasible, unsalted hashes mean identical keys would produce identical hashes. More importantly, if the hash file is leaked, an attacker could use rainbow tables or pre-computed hashes. Best practice for credential storage is to use a salted hash (bcrypt, scrypt, argon2) or at minimum HMAC-SHA256 with a server-side secret.
- **Evidence:**
  ```typescript
  // Line 82-84
  export function hashApiKey(apiKey: string): string {
    return 'sha256:' + createHash('sha256').update(apiKey).digest('hex')
  }
  ```
- **Fix:** Since API keys have 256 bits of entropy, this is lower priority than typical password hashing. But for defense in depth, use HMAC-SHA256 with a server-side secret stored separately from the key file.

---

## NIT

### [CC-010] Dead code: unreachable return at end of authenticateAgent
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`:66-67
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** logic
- **Description:** The comment says "Should not reach here" and returns `{}` (system owner). The code flow analysis confirms this is unreachable: by line 66, we know `authHeader` was truthy (otherwise line 32 or 37 would have returned), so the `if (authHeader)` block at line 45 must have been entered and returned. However, leaving unreachable code that returns a permissive result (`{}` = system owner) is a maintenance risk -- if future refactoring changes the control flow, this fallback could inadvertently grant system-owner access.
- **Evidence:**
  ```typescript
  // Line 66-67
  // Should not reach here, but return empty (system owner) for safety
  return {}
  ```
- **Fix:** Replace with `throw new Error('Unreachable: authenticateAgent logic error')` to make it fail-fast if somehow reached.

### [CC-011] verifyApiKeyHash is exported but never called
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`:89-92
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** api-contract
- **Description:** `verifyApiKeyHash` is exported but has zero callers across the codebase. The actual key verification in `validateApiKey` (line 170) computes the hash inline and uses `===` comparison. This dead export creates confusion about how keys are meant to be verified.
- **Evidence:** Grep for `verifyApiKeyHash` shows it only appears in the definition (amp-auth.ts:89), test file, and previous audit reports.
- **Fix:** Either remove the dead export or refactor `validateApiKey` to use it (and add timing-safe comparison inside it).

### [CC-012] `auth.address!` non-null assertion on potentially undefined field
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:853, 856, 1195
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** type-safety
- **Description:** Several places use `auth.address!` with a non-null assertion. The `AMPAuthResult` type defines `address` as optional (`address?: string`). When auth comes from a mesh-forwarded virtual identity (line 753), `address` is set to `mesh@${forwardedFrom}`, but for normal auth, `address` comes from the API key record which should always have it. However, the non-null assertion suppresses TypeScript's safety checks.
- **Evidence:**
  ```typescript
  // Line 853
  const agentName = senderAgent.name || senderAgent.alias || auth.address!.split('@')[0]
  // Line 856
  senderAddress = auth.address!
  // Line 1195
  from: auth.address!,
  ```
- **Fix:** Add a guard: `if (!auth.address) return { error: 'internal_error', ... }` before the non-null assertion sites.

### [CC-013] Inconsistent error codes: 403 vs 401 for signature failures
- **File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts`:891-893, 1645-1649
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** api-contract
- **Description:** Invalid signatures return HTTP 403 with error code `'forbidden'`. However, 403 typically means "authenticated but not authorized." A failed signature verification is more accurately an authentication failure (401). The inconsistency: missing auth returns 401, but bad signature returns 403, even though both are authentication problems.
- **Fix:** Consider using 401 with error code `'signature_invalid'` for consistency, or document the distinction clearly.

---

## CLEAN

Files with no issues found:
- (none -- all audited files had findings)

---

## Summary Table

| ID | Severity | Category | File | Description |
|----|----------|----------|------|-------------|
| CC-001 | MUST-FIX | security | amp-service.ts:876-901 | Unsigned messages accepted in routeMessage |
| CC-002 | MUST-FIX | security | amp-service.ts:1629-1658 | deliverFederated accepts unsigned federated messages |
| CC-003 | MUST-FIX | security | amp-service.ts:876-898 | Unverified signature propagated when no sender keypair |
| CC-004 | SHOULD-FIX | security | amp-auth.ts:91,170 | Timing attack on hash comparison (no timingSafeEqual) |
| CC-005 | SHOULD-FIX | logic | agent-auth.ts:32 | Empty-string headers treated as "no auth" (system owner) |
| CC-006 | SHOULD-FIX | security | amp-service.ts:744-757,874 | Mesh-forwarded sigs never verified |
| CC-007 | SHOULD-FIX | race-condition | amp-auth.ts:161-187 | File-based key storage TOCTOU race |
| CC-008 | SHOULD-FIX | security | amp-service.ts:205-209 | Replay protection fails open on write error |
| CC-009 | SHOULD-FIX | security | amp-auth.ts:82-84 | Unsalted SHA-256 for key hashing |
| CC-010 | NIT | logic | agent-auth.ts:66-67 | Unreachable permissive fallback |
| CC-011 | NIT | api-contract | amp-auth.ts:89-92 | Dead export verifyApiKeyHash |
| CC-012 | NIT | type-safety | amp-service.ts:853,856,1195 | Non-null assertions on optional auth.address |
| CC-013 | NIT | api-contract | amp-service.ts:891-893 | 403 vs 401 inconsistency for sig failures |
