# AMP Mesh Networking & Federation Architecture Research Report
Generated: 2026-02-20

## Summary

AI Maestro implements a **decentralized mesh network** for inter-agent communication using the Agent Messaging Protocol (AMP). Each host running AI Maestro acts as both a client and a provider. Hosts discover each other via a manually-configured `~/.aimaestro/hosts.json` file, then auto-synchronize peer lists through bidirectional registration and peer exchange. Messages route locally first, then across the mesh via HTTP forwarding, and fall back to a relay queue when the recipient's host is unreachable. Federation with external providers (e.g., CrabMail) is supported through a separate `/api/v1/federation/deliver` endpoint. The headless mode (`MAESTRO_MODE=headless`) exposes the same mesh/federation API surface without the Next.js UI.

---

## 1. Host Discovery and Communication

### 1.1 Host Configuration: `~/.aimaestro/hosts.json`

**Location:** `~/.aimaestro/hosts.json` (shared across all projects on the machine)

**Actual contents found on this machine:**
```json
{
  "hosts": [
    { "id": "YOUR-HOSTNAME-HERE", "name": "This Machine", "url": "http://YOUR-IP-OR-HOSTNAME:23000", "type": "local", "enabled": true },
    { "id": "mac-mini", "name": "Mac Mini", "url": "http://100.80.12.6:23000", "type": "remote", "enabled": true, "tailscale": true },
    { "id": "cloud-server-1", "name": "Cloud Server 1", "url": "http://100.123.45.67:23000", "type": "remote", "enabled": false, "tailscale": true }
  ],
  "organization": "emasoft",
  "organizationSetAt": "2026-02-06T15:19:21.720Z",
  "organizationSetBy": "mac-mini-di-emanuele"
}
```

**Key Fields per Host:**
- `id` - Canonical identifier (hostname, lowercase)
- `name` - Display name
- `url` - HTTP URL with port (always port 23000)
- `type` - `local` or `remote` (used for routing decisions)
- `enabled` - Whether to include in mesh operations
- `tailscale` - Hint for Tailscale VPN usage
- `tags` - Optional categorization
- `aliases` - All known IPs/hostnames (used for duplicate detection)

### 1.2 Host Identity Resolution

**File:** `/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts` (TypeScript) and `/Users/emanuelesabetta/ai-maestro/lib/hosts-config-server.mjs` (ESM for server.mjs)

Both files contain identical logic (dual maintained). Core identity functions:

| Function | Purpose |
|----------|---------|
| `getSelfHostId()` | Returns `os.hostname().toLowerCase().replace(/\.local$/, '')` - strips macOS `.local` suffix |
| `getLocalIPs()` | All non-loopback IPv4 addresses from all network interfaces |
| `getPreferredIP()` | Priority: Tailscale (100.x) > LAN (10.x, 192.168.x) > other. NEVER localhost |
| `getSelfAliases()` | Set of: hostname + all IPs + URL forms (`http://ip:23000`) |
| `isSelf(hostId)` | Checks hostname, legacy 'local', all IPs, URL forms |

**Self-detection is multi-layered:** hostname match, IP match, URL-based IP extraction. This prevents duplicate host entries when the same machine is referenced by different names.

### 1.3 Host Loading Priority

1. `AIMAESTRO_HOSTS` environment variable (JSON)
2. `~/.aimaestro/hosts.json` file
3. Fallback: auto-generated self-host only

All hosts are migrated (id:'local' -> hostname), normalized to lowercase, validated for required fields (id, name, url), and self-host is auto-injected if missing.

### 1.4 File Locking

`/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts` implements an in-memory lock (`acquireLock`/`releaseLock`/`withLock`) with a 5-second timeout to prevent concurrent file writes to `hosts.json`.

---

## 2. Cross-Host Message Routing (`amp-service.ts`)

### 2.1 Routing Decision Tree in `routeMessage()`

**File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (lines 734-1081)

The `routeMessage` function implements this routing cascade:

```
1. AUTHENTICATE sender
   - API key validation (Bearer token)
   - OR mesh-forwarded trust (X-Forwarded-From header matches known host)

2. RATE LIMIT check (60 requests/minute per agent)

3. RESOLVE RECIPIENT
   a. If mesh-forwarded: look up locally only
   b. If explicit remote tenant in address: route to that host
   c. Otherwise: checkMeshAgentExists() - queries all peers in parallel

4. DELIVER
   a. Remote host resolved:
      - Forward via HTTP POST to remote_host/api/v1/route
      - On success: return {status: "delivered", method: "mesh"}
      - On failure: queue in relay, return {status: "queued", method: "relay"}
   b. Local agent resolved:
      - deliverLocally() -> deliver() from message-delivery.ts
      - return {status: "delivered", method: "local"}
   c. No agent found:
      - return {error: "not_found", status: 404}
```

### 2.2 Local Delivery (`message-delivery.ts`)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/message-delivery.ts`

Local delivery does exactly 3 things:
1. **Write to AMP inbox** - Persistent file storage in `~/.agent-messaging/agents/<name>/messages/inbox/`
2. **WebSocket push** - If agent is connected via `/v1/ws`, push message in real-time (supplementary to disk write)
3. **tmux notification** - Send `echo '[MESSAGE] From: ...'` to the agent's tmux session
4. **Webhook delivery** (optional) - If agent has a `webhook_url` in metadata, HTTP POST to it (with SSRF prevention)

Content security is applied to all messages (sanitization, verified/unverified tagging).

### 2.3 Mesh Forwarding (`forwardToHost()`)

**File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (lines 332-384)

When routing determines the recipient is on a remote host:

```
POST {remoteHost.url}/api/v1/route
Headers:
  Content-Type: application/json
  X-Forwarded-From: {selfHostId}    <- identifies the forwarding host
  X-AMP-Envelope-Id: {envelope.id}
  X-AMP-Signature: {signature}       <- if signed
Body: { from, to, subject, payload, priority, _forwarded: {...} }
```

The receiving host accepts the forwarded request if `X-Forwarded-From` matches a known host in its `hosts.json`. The forwarded request is authenticated as `mesh-{forwardingHostId}` (trusted host, no API key needed).

**Timeout:** 10 seconds (`FORWARD_TIMEOUT_MS`)

### 2.4 Relay Queue (`amp-relay.ts`)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-relay.ts`

When direct delivery fails (remote host unreachable, agent not found yet), messages are queued:

- **Storage:** `~/.agent-messaging/relay/{agentId}/*.json`
- **TTL:** 7 days (configurable via `AMP_RELAY_TTL_DAYS`)
- **Retrieval:** `GET /api/v1/messages/pending` (polled by agents)
- **Acknowledgment:** `DELETE /api/v1/messages/pending?id=X`

### 2.5 Mesh Agent Discovery (`checkMeshAgentExists()`)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` (lines 2275-2363)

Discovery process:
1. Check local registry: exact name -> alias -> any-host name -> any-host alias -> partial name
2. Query all peer hosts in parallel: `GET {peer.url}/api/agents/by-name/{name}`
3. Timeout: configurable, default 5000ms (3000ms for routing calls)

Returns: `{ exists, host, agent, checkedHosts, failedHosts }`

---

## 3. Agent Addressing

### 3.1 Address Format

```
name@[scope.]tenant.provider
```

Examples:
- `alice@emasoft.aimaestro.local` - Standard address
- `bob@myrepo.github.emasoft.aimaestro.local` - Scoped address (repo+platform)
- `alice` - Bare name (resolved by mesh discovery)

**Provider domain formula:** `{organization}.aimaestro.local`
- Function: `getAMPProviderDomain(organization)` in `/Users/emanuelesabetta/ai-maestro/lib/types/amp.ts`
- Default organization: `"default"` -> `default.aimaestro.local`
- This machine: `emasoft` -> `emasoft.aimaestro.local`

### 3.2 Address Parsing (`parseAMPAddress()`)

In `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (lines 296-320):

```
alice@emasoft.aimaestro.local
  name:     "alice"
  tenant:   "emasoft"
  provider: "aimaestro.local"
  scope:    undefined

bob@myrepo.github.emasoft.aimaestro.local
  name:     "bob"
  tenant:   "emasoft"
  provider: "aimaestro.local"
  scope:    "myrepo.github"
```

### 3.3 Cross-Host Routing by Address

When a message is sent to an address:
- If `provider` is not `aimaestro.local` (or ends in `.local`) -> reject with `external_provider` error (send to that provider's `route_url` instead)
- If `tenant` does not match self and is not the organization name -> treat as explicit remote, forward to host matching `tenant`
- Otherwise -> mesh discovery to find the agent

---

## 4. Registration Flow

### 4.1 Agent Registration (`POST /api/v1/register`)

**File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (lines 503-728)

Flow:
1. Validate: name, tenant, public_key (PEM Ed25519), key_algorithm
2. **Organization gate:** Organization MUST be set before any registration is allowed
3. Tenant is forced to the configured organization (client cannot override)
4. Check name uniqueness on this host (same fingerprint = re-registration allowed)
5. Create agent in registry (or adopt existing non-AMP agent)
6. Store public key via `saveKeyPair()` in `~/.aimaestro/agents/{id}/keys/`
7. Generate API key: `amp_live_sk_{64_hex_chars}` (shown only once)
8. Mark agent as AMP-registered with metadata

**Response includes:**
```json
{
  "address": "alice@emasoft.aimaestro.local",
  "agent_id": "uuid",
  "api_key": "amp_live_sk_...",
  "provider": {
    "name": "emasoft.aimaestro.local",
    "endpoint": "http://100.x.x.x:23000/api/v1",
    "route_url": "http://100.x.x.x:23000/api/v1/route"
  },
  "fingerprint": "SHA256:..."
}
```

### 4.2 Cross-Host Peer Registration (`POST /api/hosts/register-peer`)

**File:** `/Users/emanuelesabetta/ai-maestro/services/hosts-service.ts`

This is the HOST-level registration (not agent-level). When Host A adds Host B:

1. Host A adds Host B to its local `hosts.json`
2. Host A calls `POST {hostB.url}/api/hosts/register-peer` with its own identity
3. Host B adds Host A to its `hosts.json` (back-registration)
4. Host B returns its list of known hosts
5. Host A processes peer exchange: adds any new hosts from B's list (with health checks)
6. Host A calls `POST {hostB.url}/api/hosts/exchange-peers` to share its own known hosts
7. Organization is propagated during sync (adopted if not set locally)

**Anti-loop protections:**
- `propagationId` - Unique ID tracked in memory set
- `propagationDepth` - Maximum 3 hops
- `processedPropagations` - Set with 60-second TTL

---

## 5. Push Notifications Across Hosts

### 5.1 Local tmux Notifications

**File:** `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts`

Notifications are **LOCAL ONLY**. When a message arrives for a local agent:
1. Check if notifications are enabled (`NOTIFICATIONS_ENABLED` env var, default: true)
2. Skip certain message types (system, heartbeat)
3. **If target is on a remote host -> SKIP notification** (lines 107-111)
4. Look up agent in local registry
5. Send `echo '[MESSAGE] From: sender - subject - check your inbox'` to tmux session via `runtime.sendKeys()`

**Key finding:** Tmux notifications do NOT work remotely. The notification-service explicitly checks `isSelf(agentHost)` and skips remote agents. Remote hosts handle their own notifications when they receive the forwarded message.

### 5.2 WebSocket Push (`/v1/ws`)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-websocket.ts`

Agents can connect via WebSocket for real-time message delivery:

1. Connect to `ws://{host}:23000/v1/ws`
2. Send auth frame: `{ type: "auth", token: "amp_live_sk_..." }`
3. Server validates, delivers queued messages, starts heartbeat (30s ping)
4. New messages pushed as: `{ type: "message", envelope, payload, delivered_at }`

This is **per-host only** -- agents connect to their local AI Maestro instance. Cross-host real-time delivery relies on HTTP mesh forwarding -> local WebSocket push on the destination host.

---

## 6. Authentication & Authorization

### 6.1 API Key System

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts`

- **Format:** `amp_live_sk_{64_hex_chars}` (live) or `amp_test_sk_{...}` (test)
- **Storage:** `~/.aimaestro/amp-api-keys.json` - keys stored as SHA-256 hashes
- **Comparison:** Constant-time (`timingSafeEqual`) to prevent timing attacks
- **Rotation:** Old key gets 24-hour grace period, new key issued
- **Revocation:** Key marked as `revoked` in the records

Each API key record stores: `key_hash`, `agent_id`, `tenant_id`, `address`, `created_at`, `expires_at`, `status`, `last_used_at`

### 6.2 Ed25519 Signatures

**File:** `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts`

- Keypairs stored per-agent in `~/.aimaestro/agents/{id}/keys/`
- Signatures cover: `from|to|subject|priority|in_reply_to|payload_sha256`
- **Signature verification is enforced for:**
  - Mesh-forwarded messages (unsigned -> rejected with 403)
  - Federated messages (unsigned -> rejected with 403)
- **Local messages:** Unsigned allowed (agent is authenticated by API key)
- **Invalid signatures:** Always rejected (even if key present, if sig doesn't match -> 403)

### 6.3 Mesh Trust Model

**Cross-host authentication uses a trust-on-first-register model:**
- When Host A receives a forwarded request with `X-Forwarded-From: hostB`, it checks if `hostB` is in its `hosts.json`
- If yes -> trusted, authenticated as `mesh-{hostB}` (no API key needed)
- If no -> rejected as unauthorized

This means **any host in hosts.json can forward messages as any agent**. There is no per-agent cross-host authentication beyond the initial API key on the originating host.

### 6.4 User Keys

Format: `uk_{base64(ownerId:tenantId:random)}` - Used for registration authorization (D5 feature). Allows pre-authorized agent registration under a specific tenant.

### 6.5 Federation Authentication

**File:** `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (lines 1600-1736)

`POST /api/v1/federation/deliver`:
- Requires `X-AMP-Provider` header identifying the sending provider
- Rate limited: 120 requests/minute per provider
- **Signature mandatory** - both `envelope.signature` and `sender_public_key` required
- Replay protection: message IDs tracked in `~/.aimaestro/federation/delivered/` (24-hour TTL)
- Unsigned federated messages are always rejected (MF-02)

---

## 7. Cross-Host Testing

### 7.1 Test Script

**File:** `/Users/emanuelesabetta/ai-maestro/scripts/test-amp-cross-host.sh`

**Phases:**
1. **Host Health Checks** - `GET {host}/api/v1/health` for all hosts in `~/.aimaestro/hosts.json`
2. **Register Test Agents** - Create Ed25519 keypairs, register via `POST /api/v1/register` on each host
3. **Cross-Host Delivery** - Send messages between all pairs via `POST /api/v1/route`; verify `status: "delivered"`, `method: "mesh"`
4. **Reply Test** - Bidirectional reply between first two hosts
5. **Inbox Verification** - `GET /api/messages?agent={name}&action=unread-count` on each host

**Key detail:** The test addresses recipients by bare name (not full address). The sender's host performs mesh discovery to find which remote host has the agent.

**Flags:**
- `--local-only` - Only test from the first host to all others
- `--skip-inbox` - Skip inbox count verification
- `--hosts PATH` - Custom hosts.json path

---

## 8. Organization Management

### 8.1 Organization Concept

The organization name is a mesh-wide identifier stored in `~/.aimaestro/hosts.json`:
- Set once per installation (immutable after set)
- Propagated to peers during sync
- Used as the `tenant` component in AMP addresses
- **Organization mismatch between peers is a hard error** - prevents joining incompatible networks

### 8.2 Organization Sync

During host sync (`register-peer` and `exchange-peers`):
1. If local has no organization and peer has one -> **adopt** peer's organization
2. If both have the same organization -> no action
3. If both have different organizations -> **error: "Organization mismatch... Cannot join incompatible networks"**

---

## 9. Headless Mode

### 9.1 Router

**File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`

When `MAESTRO_MODE=headless`, AI Maestro runs without Next.js. The headless router maps all ~100 API patterns to service functions via regex matching.

**All mesh/federation endpoints are available in headless mode:**
- `POST /api/v1/register` -> `registerAMPAgent()`
- `POST /api/v1/route` -> `routeMessage()`
- `POST /api/v1/federation/deliver` -> `deliverFederated()`
- `GET /api/v1/health` -> `getHealthStatus()`
- `GET /api/v1/info` -> `getProviderInfo()`
- `POST /api/hosts/register-peer` -> `registerPeer()`
- `POST /api/hosts/exchange-peers` -> `exchangePeers()`
- All agent/session/message/team endpoints

The headless router handles request body parsing (with 1MB limit), JSON response formatting, multipart form parsing, and binary responses.

### 9.2 Can Headless Accept Remote Requests?

**Yes.** The headless mode binds to the same port (23000) and exposes the same API surface. Remote hosts can:
- Register peers via `/api/hosts/register-peer`
- Forward messages via `/api/v1/route`
- Deliver federated messages via `/api/v1/federation/deliver`
- Query agents via `/api/agents/by-name/{name}`

The WebSocket endpoint (`/v1/ws`) is also available in headless mode (handled by `server.mjs` before mode branching).

---

## 10. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     HOST A (AI Maestro)                         │
│                                                                 │
│  hosts.json ──> Host Config ──> Peer List                       │
│                     │                                           │
│  Agent Registry ◄───┤                                           │
│       │             │                                           │
│  ┌────▼────┐   ┌────▼────────┐   ┌──────────────┐              │
│  │ /api/v1 │   │ Host Sync   │   │ AMP WebSocket│              │
│  │ /route  │   │ register-   │   │ /v1/ws       │              │
│  │         │   │ peer,       │   │              │              │
│  │         │   │ exchange-   │   │ Real-time    │              │
│  │         │   │ peers       │   │ push to      │              │
│  │         │   │             │   │ local agents │              │
│  └────┬────┘   └─────────────┘   └──────────────┘              │
│       │                                                         │
│  ┌────▼──────────────────────────────────┐                      │
│  │           ROUTING ENGINE              │                      │
│  │                                       │                      │
│  │  1. Authenticate (API key or mesh)    │                      │
│  │  2. Resolve recipient:                │                      │
│  │     - Local registry lookup           │                      │
│  │     - Mesh discovery (query peers)    │                      │
│  │  3. Deliver:                          │                      │
│  │     - Local: inbox + WS + tmux notify │                      │
│  │     - Remote: HTTP forward to peer    │                      │
│  │     - Fallback: relay queue           │                      │
│  └───────────────────────────────────────┘                      │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ AMP Inbox Writer│  │ Notification Svc │  │ Relay Queue   │  │
│  │ ~/.agent-       │  │ tmux echo (LOCAL │  │ ~/.agent-     │  │
│  │ messaging/      │  │ ONLY)            │  │ messaging/    │  │
│  │ agents/*/inbox  │  │                  │  │ relay/        │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                                        ▲
           │ HTTP POST /api/v1/route                │
           │ X-Forwarded-From: hostA                │
           ▼                                        │
┌─────────────────────────────────────────────────────────────────┐
│                     HOST B (AI Maestro)                         │
│                                                                 │
│  (Same architecture - receives forwarded message,               │
│   delivers locally to agent on Host B)                          │
└─────────────────────────────────────────────────────────────────┘
           │                                        ▲
           │ POST /api/v1/federation/deliver        │
           │ X-AMP-Provider: crabmail.ai            │
           ▼                                        │
┌─────────────────────────────────────────────────────────────────┐
│              EXTERNAL PROVIDER (CrabMail, etc.)                 │
│                                                                 │
│  (Sends signed messages via federation endpoint,                │
│   mandatory signature + sender_public_key)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Key Files Reference

| File | Purpose |
|------|---------|
| `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` | Core AMP business logic: register, route, federation, agent management |
| `/Users/emanuelesabetta/ai-maestro/lib/message-delivery.ts` | Local delivery: inbox write + WS push + tmux notify + webhook |
| `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts` | API key generation, validation (SHA-256 + timing-safe), rotation, revocation |
| `/Users/emanuelesabetta/ai-maestro/lib/amp-keys.ts` | Ed25519 keypair management per agent |
| `/Users/emanuelesabetta/ai-maestro/lib/amp-relay.ts` | Store-and-forward relay queue for offline agents |
| `/Users/emanuelesabetta/ai-maestro/lib/amp-websocket.ts` | Real-time WebSocket delivery to connected agents |
| `/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts` | Host identity, IP detection, hosts.json loading (TypeScript) |
| `/Users/emanuelesabetta/ai-maestro/lib/hosts-config-server.mjs` | Same as above (ESM for server.mjs) |
| `/Users/emanuelesabetta/ai-maestro/lib/host-sync.ts` | Bidirectional host registration, peer exchange, organization propagation |
| `/Users/emanuelesabetta/ai-maestro/services/hosts-service.ts` | Host management API: list, add, update, delete, identity, health, sync |
| `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts` | Headless HTTP router (~100 routes) for API-only mode |
| `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts` | tmux push notifications (LOCAL ONLY) |
| `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` | Agent registry with `checkMeshAgentExists()` for cross-host discovery |
| `/Users/emanuelesabetta/ai-maestro/types/host-sync.ts` | Type definitions for peer registration/exchange protocol |
| `/Users/emanuelesabetta/ai-maestro/lib/types/amp.ts` | AMP protocol types, version, address builder |
| `/Users/emanuelesabetta/ai-maestro/scripts/test-amp-cross-host.sh` | Cross-host mesh test suite (5 phases) |

---

## 12. Limitations and Design Constraints

### 12.1 No Automatic Host Discovery
Hosts must be manually added to `~/.aimaestro/hosts.json` or discovered through peer exchange during sync. There is no mDNS/Bonjour/broadcast-based auto-discovery.

### 12.2 tmux Notifications are Local Only
The notification-service explicitly skips remote agents. Remote hosts handle their own notifications upon receiving the forwarded message. There is no SSH-based remote tmux notification.

### 12.3 Mesh Trust is Host-Level, Not Agent-Level
Any host in `hosts.json` can forward messages claiming to be from any agent on that host. There is no per-agent signature verification during mesh forwarding (only the `X-Forwarded-From` host header is checked). However, signature verification IS enforced at the envelope level - unsigned mesh-forwarded messages are rejected (MF-01).

### 12.4 Organization is Immutable After Set
Once set, the organization cannot be changed. Hosts with different organizations cannot join the same mesh (hard error).

### 12.5 No NAT Traversal
All hosts must be directly reachable by IP (Tailscale recommended for cross-network connectivity). No STUN/TURN/relay for NAT-punching.

### 12.6 Single Port Architecture
All communication happens over port 23000: HTTP API, WebSocket terminal streaming, WebSocket AMP delivery, mesh forwarding. No separate ports for different protocols.

### 12.7 No Encryption in Transit
Messages are sent over plain HTTP between hosts. Tailscale provides transport encryption when used, but the protocol itself does not enforce TLS.

### 12.8 Federation is One-Way Inbound Only
The `/api/v1/federation/deliver` endpoint accepts messages FROM external providers. There is no outbound federation mechanism to SEND messages TO external providers from the server side -- agents must use their registered provider's `route_url` directly.

### 12.9 Relay Queue is Per-Host
The relay queue (`~/.agent-messaging/relay/`) only stores messages for agents registered on the local host. There is no cross-host relay queue replication.

---

## 13. Open Questions

1. **Dual-maintained host config:** `hosts-config.ts` and `hosts-config-server.mjs` contain nearly identical logic. Why not a single source?
2. **Health check endpoint inconsistency:** The test script uses `/api/v1/health` but the hosts-service uses `/api/sessions` and `/api/config` for health checks.
3. **No periodic mesh sync:** Sync only happens when a host is added or manually triggered. There is no background heartbeat/gossip protocol to keep the mesh fresh.
4. **Signature on mesh forward:** Unsigned mesh-forwarded messages are rejected (MF-01), but the forwarding host does NOT re-sign with its own key. The original sender's signature is passed through. If the original sender did not sign, the forward will be rejected by the destination.
