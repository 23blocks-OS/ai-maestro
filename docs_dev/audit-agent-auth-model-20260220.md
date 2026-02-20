# Agent Authentication Model Audit
Generated: 2026-02-20

## Summary

AI Maestro has **two completely separate authentication systems** operating on different API surfaces:

1. **AMP v1 Protocol** (`/api/v1/*`) -- Properly authenticated with API keys, Ed25519 signatures, and hashed key storage.
2. **Internal APIs** (`/api/teams/*`, `/api/governance/*`, `/api/messages/*`) -- **No authentication at all.** The `X-Agent-Id` header is trusted blindly without any verification.

The governance system (team ACLs, transfer approvals, closed-team restrictions) relies entirely on the unverified `X-Agent-Id` header. **Any HTTP client can impersonate any agent** by setting this header to any valid agent UUID.

Furthermore, the server binds to `0.0.0.0` (all network interfaces), not `127.0.0.1`, which means the unauthenticated internal APIs are accessible from the network -- contradicting the "localhost-only" security assumption stated in `CLAUDE.md`.

---

## 1. How Agents Authenticate with the API

### AMP v1 Protocol (Authenticated)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`

The AMP protocol endpoints (`/api/v1/*`) use a proper authentication flow:

1. **Registration** (`POST /api/v1/register`): Agent provides Ed25519 public key + tenant. Server generates an API key (format: `amp_live_sk_{64 hex chars}`), stores the SHA-256 hash, and returns the key once.

2. **Subsequent requests** use `Authorization: Bearer amp_live_sk_...` header. The `authenticateRequest()` function in `lib/amp-auth.ts` (line 365) extracts the key, hashes it, and looks it up in `~/.aimaestro/amp-api-keys.json`.

3. **Key management** includes rotation (24h grace period for old keys), revocation, expiry checking, and debounced last-used tracking.

**VERIFIED:** `authenticateRequest()` at `lib/amp-auth.ts:365-391` validates the API key against stored hashes and returns the agent ID, tenant ID, and address from the key record. Unauthenticated requests to `/api/v1/route` are rejected with 401.

### Internal APIs (NOT Authenticated)

**Files:**
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` (line 14)
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` (lines 10, 25, 50)
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts` (lines 10, 26)
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts` (lines 10, 33)
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/documents/route.ts` (lines 10, 25)
- `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts` (lines 1150-1204)

All these routes use the exact same pattern:
```typescript
const requestingAgentId = request.headers.get('X-Agent-Id') || undefined
```

**There is no validation of this header.** No API key check, no signature verification, no session token, no correlation with AMP registration. The value is passed directly to governance functions like `checkTeamAccess()`, `isManager()`, `isSourceCOS`, etc.

### Internal Messages API (NOT Authenticated)

**File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts`

The messages API (`POST /api/messages`) accepts a `from` field in the request body with no authentication at all. Any client can send a message claiming to be from any agent.

---

## 2. AMP Message Signing (Ed25519)

### Key Generation and Storage

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts`

- `saveKeyPair()` (line 142): Stores key pairs in `~/.aimaestro/agents/{agentId}/keys.json`
- `loadKeyPair()` (line 160): Reads them back
- `calculateFingerprint()` (line 129): SHA-256 hash of public key hex, first 16 chars

### Signature Verification

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts:426-455`

The `verifySignature()` function:
- Reconstructs Ed25519 public key from hex (SPKI DER format)
- Uses Node.js `crypto.verify()` with null algorithm (Ed25519 handles its own)
- Returns boolean (valid/invalid)

### Signature Flow in Message Routing

**File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts:873-898`

When routing a message (`POST /api/v1/route`):
1. If `body.signature` is present AND the sender's public key is on file, the server verifies the signature
2. The signature data is: `from|to|subject|priority|in_reply_to|payloadHash` joined with `|`
3. **IMPORTANT:** Invalid signatures only produce a `console.warn` -- they do NOT reject the message (line 890-891)
4. Missing signatures are logged but also NOT rejected (line 897)

This means Ed25519 signatures are **informational only** in the current implementation. A message with a bad or missing signature is still delivered.

---

## 3. X-Agent-Id Header Trust Analysis

### Routes That Read X-Agent-Id

| Route | File | Line | Validates? |
|-------|------|------|-----------|
| `POST /api/teams` | `app/api/teams/route.ts` | 14 | NO |
| `GET /api/teams/[id]` | `app/api/teams/[id]/route.ts` | 10 | NO |
| `PUT /api/teams/[id]` | `app/api/teams/[id]/route.ts` | 25 | NO |
| `DELETE /api/teams/[id]` | `app/api/teams/[id]/route.ts` | 50 | NO |
| `GET /api/teams/[id]/tasks` | `app/api/teams/[id]/tasks/route.ts` | 10 | NO |
| `POST /api/teams/[id]/tasks` | `app/api/teams/[id]/tasks/route.ts` | 26 | NO |
| `PUT /api/teams/[id]/tasks/[taskId]` | `app/api/teams/[id]/tasks/[taskId]/route.ts` | 10 | NO |
| `DELETE /api/teams/[id]/tasks/[taskId]` | `app/api/teams/[id]/tasks/[taskId]/route.ts` | 33 | NO |
| `GET /api/teams/[id]/documents` | `app/api/teams/[id]/documents/route.ts` | 10 | NO |
| `POST /api/teams/[id]/documents` | `app/api/teams/[id]/documents/route.ts` | 25 | NO |
| Headless router (11 routes) | `services/headless-router.ts` | 1150-1204 | NO |

**Every single route trusts X-Agent-Id blindly.** There is no middleware, no shared auth function, and no Next.js middleware.ts file in the project.

### What X-Agent-Id Controls

The unverified header is used for:

1. **Team ACL** (`lib/team-acl.ts:35-74`): Determines if an agent can access closed team resources (tasks, documents, team details)
2. **Team deletion** (`services/teams-service.ts:241-245`): Only MANAGER or COS can delete closed teams
3. **Task/document CRUD on closed teams**: All write operations check if the requester is a team member
4. **Transfer request creation** (`app/api/governance/transfers/route.ts:67-68`): The `requestedBy` field (from body, not header) checks if the agent is MANAGER or COS

### Critical Observation About Transfer Approval

The transfer resolve endpoint (`app/api/governance/transfers/[id]/resolve/route.ts:33`) takes `resolvedBy` from the **request body** (not even from a header). Lines 73-77:
```typescript
const isSourceCOS = fromTeam.chiefOfStaffId === resolvedBy
const isGlobalManager = isManager(resolvedBy)
if (!isSourceCOS && !isGlobalManager) {
  return NextResponse.json({ error: '...' }, { status: 403 })
}
```

This means any HTTP client can approve/reject transfers by simply claiming `resolvedBy` is the MANAGER UUID or the source team COS UUID.

---

## 4. What Prevents Impersonation

### Current State: Nothing

There is **no mechanism** preventing impersonation on internal APIs. An attacker (or a misconfigured agent) can:

1. **Set `X-Agent-Id` to the MANAGER UUID** and gain full access to all closed teams
2. **Set `resolvedBy` to MANAGER UUID** in transfer resolution requests to approve/reject any transfer
3. **Send messages via `/api/messages` with any `from` value** to impersonate any agent
4. **Omit `X-Agent-Id` entirely** to bypass team ACL checks (see `team-acl.ts:42-44` -- undefined agentId = "web UI request" = allowed)

The only thing that provides any security is:
- UUID format validation (attacker needs to know the target UUID, but UUIDs are exposed in multiple API responses)
- Governance password for setting/changing the MANAGER role (`POST /api/governance/manager`)

### The Governance Password

**File:** `/Users/emanuelesabetta/ai-maestro/services/governance-service.ts:60-103`

Setting or changing the MANAGER requires the governance password (bcrypt-hashed, rate-limited). This is the **only** governance operation that requires real authentication. However, once a MANAGER is set, the MANAGER UUID is returned by `GET /api/governance` (line 49: `managerId: config.managerId ?? null`), so any client can read it and use it in `X-Agent-Id`.

---

## 5. Localhost Security Model

### CLAUDE.md Claims vs Reality

**CLAUDE.md states** (under "Localhost-Only Security Model"):
> Application binds to `localhost` (127.0.0.1) ONLY

**Reality** (`server.mjs:76`):
```javascript
const hostname = process.env.HOSTNAME || '0.0.0.0' // 0.0.0.0 allows network access
```

The server binds to `0.0.0.0` by default, which means it listens on **all network interfaces**, not just localhost. Any machine on the local network (or Tailscale mesh) can reach port 23000.

The comment in server.mjs even acknowledges this: `// 0.0.0.0 allows network access`

### Implications

Since the internal APIs have no authentication and the server is network-accessible:
- Any process on the network can query `GET /api/governance` to learn the MANAGER UUID
- Then set `X-Agent-Id` to that UUID and perform any privileged operation
- Or omit `X-Agent-Id` entirely to get "web UI" access (bypasses all team ACL)

---

## 6. Two Auth Worlds -- Gap Analysis

| Feature | AMP v1 (`/api/v1/*`) | Internal (`/api/teams/*`, `/api/messages/*`, `/api/governance/*`) |
|---------|---------------------|------------------------------------------------------------------|
| API key required | YES | NO |
| Key hashing | SHA-256 | N/A |
| Key rotation | YES (24h grace) | N/A |
| Rate limiting | YES (per-agent) | Only on governance password |
| Identity verification | API key -> agent ID lookup | `X-Agent-Id` header trusted blindly |
| Ed25519 signatures | Present but advisory-only | Not used |
| Impersonation prevention | API key is secret | None |
| Network binding | Same server | Same server |

### The Bridge Gap

The AMP `amp-send.sh` script uses `Authorization: Bearer {api_key}` when calling `/api/v1/route`. But the Claude Code agents themselves, when using internal APIs (via `curl` to `/api/messages` or `/api/teams`), use no authentication at all. The `X-Agent-Id` header is set by the agent itself with no proof of identity.

---

## 7. Recommendations

### P0 -- Critical (Phase 1 Fix)

1. **Bind to 127.0.0.1 by default** in `server.mjs`. Change line 76 to:
   ```javascript
   const hostname = process.env.HOSTNAME || '127.0.0.1'
   ```
   If network access is needed (mesh), require explicit opt-in via environment variable.

2. **Authenticate internal API calls from agents.** The AMP API key infrastructure already exists. Require agents to include `Authorization: Bearer {api_key}` on internal API calls and validate it the same way `/api/v1/route` does. Map the authenticated agent ID from the key record to the governance identity.

### P1 -- Important (Before Phase 2)

3. **Reject (not just warn) invalid/missing signatures** on AMP routed messages. Lines 890-898 of `amp-service.ts` should return 403 for bad signatures.

4. **Remove the undefined-agentId bypass** in `team-acl.ts:42-44`. Instead of treating missing `X-Agent-Id` as "web UI = allowed", require a separate authentication path for the web UI (e.g., session cookie or CSRF token as noted in the TODO on line 41).

5. **Move `resolvedBy` from body to authenticated identity.** The transfer resolve endpoint should derive the resolver identity from the authenticated API key, not from a user-supplied field in the request body.

### P2 -- Phase 2

6. **Unified auth middleware.** Create a Next.js `middleware.ts` or a shared function that all routes call to authenticate the request before processing.

7. **Audit trail.** Log all governance-related actions (team mutations, transfer resolutions) with the authenticated identity, not the claimed identity.

---

## 8. Key Files Referenced

| File | Purpose |
|------|---------|
| `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts` | AMP API key management (generate, validate, rotate, revoke) |
| `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts` | Ed25519 key storage and signature verification |
| `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` | AMP registration and message routing with auth |
| `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` | Team access control (trusts X-Agent-Id blindly) |
| `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts` | Team CRUD with governance checks |
| `/Users/emanuelesabetta/ai-maestro/services/governance-service.ts` | Governance password and manager role |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts` | Team API routes (no auth) |
| `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` | Team CRUD routes (no auth) |
| `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts` | Transfer approval (resolvedBy from body) |
| `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts` | Internal message API (no auth) |
| `/Users/emanuelesabetta/ai-maestro/server.mjs` | Server binds to 0.0.0.0 |
