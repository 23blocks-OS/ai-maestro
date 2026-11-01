# Signing a message as a person

How a device (the AI Maestro app) signs a message a person sends, so the host can mark it verified. It follows AMP protocol spec 13 (Person Principals); the code is `lib/person-signing.ts` and `lib/amp-trust.ts`.

## The key

Each device generates its own Ed25519 key pair and keeps the private key on the device (iOS Keychain). It sends only the public key, as the **raw 32 bytes, base64**, when it pairs. The host gives it a `key_id` and keeps it `pending` until the operator approves it on the dashboard.

## What is signed

The same canonical string an agent signs:

```
from|to|subject|priority|in_reply_to|payload_hash
```

- `priority` is the literal priority, `normal` when not set; `in_reply_to` is empty when not a reply.
- `payload_hash` is base64 SHA-256 of the payload as compact JSON with **keys sorted at every level**: the same as `jq -cS .payload` in `amp-send.sh`.
- The payload must carry `context.sent_at` (RFC 3339) and `context.nonce` (at least 128 random bits, hex or base64url). They are inside the payload, so the hash covers them. The host rejects a send more than 5 minutes from its clock, or a nonce it already accepted from that key in the window.
- The signature is Ed25519 over the UTF-8 bytes of that string, base64.

## Test vector

Check your implementation against these exact values. `tests/person-signing.test.ts` holds the server to them.

| | |
|---|---|
| Private key seed (hex) | `0707070707070707070707070707070707070707070707070707070707070707` |
| Public key (raw, base64) | `6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=` |
| from | `p-7f3a9c@acme.aimaestro.local` |
| to | `lola@acme.aimaestro.local` |
| subject | `Deploy staging` |
| priority | `normal` |
| in_reply_to | (empty) |

Payload:

```json
{"type":"request","message":"Please deploy the staging branch.","context":{"sent_at":"2026-11-01T10:00:00Z","nonce":"00112233445566778899aabbccddeeff"}}
```

Canonical payload (sorted keys):

```
{"context":{"nonce":"00112233445566778899aabbccddeeff","sent_at":"2026-11-01T10:00:00Z"},"message":"Please deploy the staging branch.","type":"request"}
```

| | |
|---|---|
| payload_hash | `e4UQJBts4sgrkubDH2OMcI2CERtdn/hxxraMWFV6Oik=` |
| signing string | `p-7f3a9c@acme.aimaestro.local\|lola@acme.aimaestro.local\|Deploy staging\|normal\|\|e4UQJBts4sgrkubDH2OMcI2CERtdn/hxxraMWFV6Oik=` |
| signature | `YBPkqQi465fEeN7QVgOojlFRpcs1Sk/7O4Z1tniTrsgTMOLewIiAjpfJie3lIW8KYAsdcfUfmWt9Ozd8oI6xDA==` |

Ed25519 signatures are deterministic, so the same seed and string always give this signature.
