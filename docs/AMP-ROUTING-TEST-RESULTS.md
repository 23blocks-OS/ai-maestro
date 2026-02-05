# AMP Routing Test Results

**Date:** 2026-02-04
**Version:** 0.20.x
**Tester:** Claude Opus 4.5

## Test Scenario

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Maestro Instance (localhost:23000)                          │
│  Organization: rnd23blocks                                      │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Agent A    │    │  Agent B    │    │  Agent C    │         │
│  │  (test)     │◄──►│  (test)     │◄──►│  (online)   │         │
│  │  no session │    │  no session │    │  has tmux   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                 │                   │                 │
│         ▼                 ▼                   ▼                 │
│    ┌─────────┐      ┌─────────┐        ┌─────────┐             │
│    │  QUEUE  │      │  QUEUE  │        │ DIRECT  │             │
│    │  relay  │      │  relay  │        │ local   │             │
│    └─────────┘      └─────────┘        └─────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  CrabMail.ai    │
                    │  (FEDERATION)   │
                    │  NOT SUPPORTED  │
                    └─────────────────┘
```

## Test Results

### ✅ Passed Tests

| Test | Description | Result |
|------|-------------|--------|
| Agent Registration | Register new agent via API | ✅ Works |
| Message Queuing | Offline agent messages → relay queue | ✅ Works |
| Pending Messages | External agent polls for messages | ✅ Works |
| Message Acknowledgment | ACK removes from queue | ✅ Works |
| Local Delivery | Online agent (with session) receives directly | ✅ Works |
| Federation Rejection | External provider returns 403 | ✅ Correct |
| Client-Side Signing | Messages signed with Ed25519 before sending | ✅ Works |
| Server Signature Verification | Server verifies client signatures | ✅ Works |
| Signature Forwarding | Signatures stored in relay queue | ✅ Works |

### 🟡 Issues Found

#### Issue 1: Plugin/API Field Mismatch

**Severity:** High (blocks registration)

The `amp-register.sh` script sends:
```json
{
  "agent_name": "...",
  "public_key_hex": "..."
}
```

But the API expects:
```json
{
  "name": "...",
  "public_key": "...PEM format..."
}
```

**Status:** Fixed in this session

---

#### Issue 2: Message Signatures Empty

**Severity:** Medium

**Observed:** Messages queued/delivered have empty signatures:
```json
"signature": ""
```

**Cause:** The server tries to sign messages using the sender's private key, but:
- External agents own their private key
- Server only has their public key (from registration)
- Private key should never leave the agent

**Status:** ✅ Fixed in this session

**Implementation:**
1. Client (`amp-send.sh`) now signs messages before sending
2. Signature format: `from|to|subject|payload_hash` (SHA256, base64)
3. Server verifies signature using sender's public key
4. Signature forwarded to recipient unchanged

**Technical Notes:**
- Fixed jq newline issue in payload hash calculation
- Server logs `[AMP Route] Verified signature from ...` on success
- Invalid signatures are logged but accepted (graceful degradation)

---

#### Issue 3: Federation Architecture Clarification

**Severity:** N/A (by design)

**Current Behavior:**
```json
{
  "error": "forbidden",
  "message": "Federation to external provider \"crabmail.ai\" is not yet supported."
}
```

**This is correct behavior.** AI Maestro should NOT relay messages to external providers.

**Architecture:**
- External provider routing is handled **client-side** by `amp-send.sh`
- When sending to `alice@acme.crabmail.ai`, the client routes directly to CrabMail's API
- AI Maestro only handles local mesh routing (`@*.aimaestro.local`)
- Agents register with external providers independently and use those APIs directly

**Inbound federation (external → local) options:**
1. Agents poll external providers via `amp-fetch.sh`
2. Future: External providers could push via webhook endpoint

---

#### Issue 4: Address Parsing Edge Cases

**Severity:** Low

- Short addresses (`agentname`) → Works
- Full addresses (`agent@tenant.provider`) → Needs more testing
- Mesh addresses (`agent@hostid.aimaestro.local`) → Works

## Recommendations

### Priority 1: Fix Plugin Registration
- ✅ Fixed `amp-register.sh` to use correct field names
- ✅ Committed and pushed

### Priority 2: Client-Side Signing
- ✅ Updated `amp-send.sh` to sign messages before sending
- ✅ Updated server (`route.ts`) to verify signatures
- ✅ Signatures forwarded to recipients
- ✅ Fixed jq newline issue in payload hash calculation

### Priority 3: External Provider Support (Client-Side)
- ✅ `amp-send.sh` already routes to external providers directly
- ✅ Registration with external providers via `amp-register.sh`
- Future: `amp-fetch.sh` for polling external provider messages

## Test Commands

```bash
# Register test agent
curl -X POST "http://localhost:23000/api/v1/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","tenant":"org","public_key":"...PEM...","key_algorithm":"Ed25519"}'

# Send message
curl -X POST "http://localhost:23000/api/v1/route" \
  -H "Authorization: Bearer amp_live_sk_..." \
  -d '{"to":"recipient","subject":"Test","payload":{"type":"notification","message":"Hello"}}'

# Check pending
curl -X GET "http://localhost:23000/api/v1/messages/pending" \
  -H "Authorization: Bearer amp_live_sk_..."

# Acknowledge
curl -X DELETE "http://localhost:23000/api/v1/messages/pending?id=msg_xxx" \
  -H "Authorization: Bearer amp_live_sk_..."
```
