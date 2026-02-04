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

**Recommended Fix:** Messages should be signed CLIENT-SIDE by the sender before calling `/api/v1/route`. The server should:
1. Verify incoming signature (if present)
2. NOT attempt to sign on behalf of agents
3. Forward signature to recipient

**Protocol Impact:** The AMP spec should clarify:
- Sender signs message before sending
- Server verifies signature (optional for local mesh)
- Signature is forwarded to recipient unchanged

---

#### Issue 3: Federation Not Implemented

**Severity:** Low (known limitation)

**Current Behavior:**
```json
{
  "error": "forbidden",
  "message": "Federation to external provider \"crabmail.ai\" is not yet supported."
}
```

**Required for Federation:**
1. Provider discovery via `/.well-known/agent-messaging.json`
2. Outbound HTTP routing to external providers
3. Inbound webhook for receiving federated messages
4. Provider-to-provider authentication

---

#### Issue 4: Address Parsing Edge Cases

**Severity:** Low

- Short addresses (`agentname`) → Works
- Full addresses (`agent@tenant.provider`) → Needs more testing
- Mesh addresses (`agent@hostid.aimaestro.local`) → Works

## Recommendations

### Priority 1: Fix Plugin Registration
- ✅ Fixed `amp-register.sh` to use correct field names
- Commit and push changes

### Priority 2: Client-Side Signing
- Update plugin's `amp-send.sh` to sign messages before sending
- Update server to verify (not create) signatures
- Document in AMP spec

### Priority 3: Federation (Future)
- Implement provider discovery
- Add outbound routing
- Add inbound webhook

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
