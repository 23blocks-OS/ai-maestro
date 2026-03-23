# Headless Mode & Remote API Surface Research Report
Generated: 2026-02-20

## Summary

AI Maestro has a mature, dual-mode architecture: **full** (Next.js + UI + API) and **headless** (API-only, no Next.js). The headless router (`services/headless-router.ts`) mirrors the complete Next.js API surface (~120 route patterns across 24 service files) using a regex-based linear scan. The server binds to `127.0.0.1` by default but can bind to `0.0.0.0` via the `HOSTNAME` env var. CORS is configured as `Access-Control-Allow-Origin: *` for all `/api/*` routes. There is no TLS built into the server itself; SSL termination is expected to be handled externally (nginx + Let's Encrypt, as shown in the Terraform/AWS infrastructure). Authentication exists only for AMP v1 endpoints (Ed25519-signed API keys) and governance/team routes (agent auth via Bearer tokens). The vast majority of internal API routes have **zero authentication**, making the server fully controllable by any network-reachable client.

---

## 1. Server Binding & Network Access

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (line 76)

```javascript
const hostname = process.env.HOSTNAME || '127.0.0.1'
const port = parseInt(process.env.PORT || '23000', 10)
```

- **Default:** Localhost-only (`127.0.0.1:23000`)
- **Network access:** Set `HOSTNAME=0.0.0.0` to listen on all interfaces
- **SECURITY.md states** the app "runs on 0.0.0.0:23000 by default" -- this contradicts the code, which defaults to `127.0.0.1`. The SECURITY.md may reflect a past or PM2 configuration.
- **PM2 config** (`ecosystem.config.js`) does NOT set HOSTNAME, so PM2-managed production defaults to `127.0.0.1`

**Conclusion:** By default, the server is localhost-only. Network access requires explicit `HOSTNAME=0.0.0.0`.

---

## 2. Server Modes: Full vs Headless

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (lines 79-80, 1249-1278)

```javascript
const MAESTRO_MODE = process.env.MAESTRO_MODE || 'full'
```

| Mode | Env | Description |
|------|-----|-------------|
| `full` | default | Next.js handles all HTTP requests (pages + API routes) + WebSocket servers |
| `headless` | `MAESTRO_MODE=headless` | Headless router handles HTTP (API-only, no UI) + same WebSocket servers |

**Both modes share:**
- All 4 WebSocket servers: `/term`, `/status`, `/v1/ws`, `/companion-ws`
- PTY/tmux session management
- Startup tasks (DB sync, host normalization, agent directory sync, peer registration)
- Graceful shutdown logic
- The internal endpoint `/api/internal/pty-sessions`

**package.json scripts:**
```
"headless": "MAESTRO_MODE=headless tsx server.mjs"
"headless:prod": "NODE_ENV=production MAESTRO_MODE=headless tsx server.mjs"
```

---

## 3. Complete Route Inventory (Headless Router)

**File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts` (1469 lines, ~120 route patterns)

The headless router imports from **24 service files** and maps all Next.js API routes to direct service function calls.

### 3.1 Config & System Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/config` | `getSystemConfig` | None |
| GET | `/api/organization` | `getOrganization` | None |
| POST | `/api/organization` | `setOrganizationName` | None |
| GET | `/api/subconscious` | `getSubconsciousStatus` | None |
| GET | `/api/debug/pty` | `getPtyDebugInfo` | None |
| GET | `/api/docker/info` | `getDockerInfo` | None |
| POST | `/api/conversations/parse` | `parseConversationFile` | None |
| GET | `/api/conversations/:file/messages` | `getConversationMessages` | None |
| GET | `/api/export/jobs/:jobId` | `getExportJobStatus` | None |
| DELETE | `/api/export/jobs/:jobId` | `deleteExportJob` | None |

### 3.2 Sessions Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/sessions` | `listSessions` / `listLocalSessions` | None |
| POST | `/api/sessions/create` | `createSession` | None |
| DELETE | `/api/sessions/:id` | `deleteSession` | None |
| GET | `/api/sessions/:id/command` | `checkIdleStatus` | None |
| POST | `/api/sessions/:id/command` | `sendCommand` | None |
| PATCH | `/api/sessions/:id/rename` | `renameSession` | None |
| GET | `/api/sessions/restore` | `listRestorableSessions` | None |
| POST | `/api/sessions/restore` | `restoreSessions` | None |
| DELETE | `/api/sessions/restore` | `deletePersistedSession` | None |
| GET | `/api/sessions/activity` | `getActivity` | None |
| POST | `/api/sessions/activity/update` | `broadcastActivityUpdate` | None |

### 3.3 Agents Core Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/agents` | `listAgents` / `searchAgentsByQuery` | None |
| POST | `/api/agents` | `createNewAgent` | None |
| GET | `/api/agents/unified` | `getUnifiedAgents` | None |
| GET | `/api/agents/startup` | `getStartupInfo` | None |
| POST | `/api/agents/startup` | `initializeStartup` | None |
| POST | `/api/agents/health` | `proxyHealthCheck` | None |
| POST | `/api/agents/register` | `registerAgent` | None |
| GET | `/api/agents/by-name/:name` | `lookupAgentByName` | None |
| GET | `/api/agents/email-index` | `queryEmailIndex` | None |
| POST | `/api/agents/docker/create` | `createDockerAgent` | None |
| POST | `/api/agents/import` | `importAgent` | None |
| GET | `/api/agents/directory` | `getDirectory` | None |
| GET | `/api/agents/directory/lookup/:name` | `lookupAgentByDirectoryName` | None |
| POST | `/api/agents/directory/sync` | `syncDirectory` | None |
| GET | `/api/agents/normalize-hosts` | `diagnoseHosts` | None |
| POST | `/api/agents/normalize-hosts` | `normalizeHosts` | None |

### 3.4 Agent Sub-Routes (by agent ID) (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET/POST/PATCH/DELETE | `/api/agents/:id/session` | session CRUD | None |
| POST | `/api/agents/:id/wake` | `wakeAgent` | None |
| POST | `/api/agents/:id/hibernate` | `hibernateAgent` | None |
| GET/POST | `/api/agents/:id/chat` | chat messages | None |
| GET/POST/PATCH | `/api/agents/:id/memory/consolidate` | consolidation | None |
| GET/PATCH/DELETE | `/api/agents/:id/memory/long-term` | long-term memory | None |
| GET/POST | `/api/agents/:id/memory` | memory init/status | None |
| GET/POST | `/api/agents/:id/search` | search/ingest | None |
| POST | `/api/agents/:id/index-delta` | delta indexing | None |
| GET/POST | `/api/agents/:id/tracking` | tracking | None |
| GET/PATCH | `/api/agents/:id/metrics` | metrics | None |
| GET/POST/DELETE | `/api/agents/:id/graph/code` | code graph | None |
| GET/POST/DELETE | `/api/agents/:id/graph/db` | DB graph | None |
| GET | `/api/agents/:id/graph/query` | graph query | None |
| GET/POST | `/api/agents/:id/database` | database | None |
| GET/POST/DELETE | `/api/agents/:id/docs` | docs | None |
| GET/PATCH/POST/DELETE | `/api/agents/:id/skills` | skills | None |
| GET/PUT | `/api/agents/:id/skills/settings` | skill settings | None |
| GET/POST | `/api/agents/:id/subconscious` | subconscious | None |
| GET/POST/DELETE | `/api/agents/:id/repos` | repos | None |
| GET/POST | `/api/agents/:id/playback` | playback | None |
| GET/POST | `/api/agents/:id/export` | export/transfer | None |
| POST | `/api/agents/:id/transfer` | transfer | None |
| GET/POST/PATCH/DELETE | `/api/agents/:id/amp/addresses/*` | AMP addresses | None |
| GET/POST/PATCH/DELETE | `/api/agents/:id/email/addresses/*` | email addresses | None |
| GET/POST/PATCH/DELETE | `/api/agents/:id/messages/*` | agent messages | None |
| GET/PATCH/DELETE | `/api/agents/:id/metadata` | metadata | None |
| GET/PATCH/DELETE | `/api/agents/:id` | agent CRUD | None |

### 3.5 Hosts Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/hosts` | `listHosts` | None |
| POST | `/api/hosts` | `addNewHost` | None |
| PUT | `/api/hosts/:id` | `updateExistingHost` | None |
| DELETE | `/api/hosts/:id` | `deleteExistingHost` | None |
| GET | `/api/hosts/identity` | `getHostIdentity` | None |
| GET | `/api/hosts/health` | `checkRemoteHealth` | None |
| GET | `/api/hosts/sync` | `getMeshStatus` | None |
| POST | `/api/hosts/sync` | `triggerMeshSync` | None |
| POST | `/api/hosts/register-peer` | `registerPeer` | None |
| POST | `/api/hosts/exchange-peers` | `exchangePeers` | None |

### 3.6 AMP v1 Routes (AUTHENTICATED)

These routes use AMP API key authentication (`Authorization: Bearer amp_live_sk_...`).

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/v1/health` | `getHealthStatus` | None |
| GET | `/api/v1/info` | `getProviderInfo` | None |
| POST | `/api/v1/register` | `registerAMPAgent` | Optional |
| POST | `/api/v1/route` | `routeMessage` | Bearer |
| GET | `/api/v1/agents` | `listAMPAgents` | Bearer |
| GET | `/api/v1/agents/me` | `getAgentSelf` | Bearer |
| PATCH | `/api/v1/agents/me` | `updateAgentSelf` | Bearer |
| DELETE | `/api/v1/agents/me` | `deleteAgentSelf` | Bearer |
| GET | `/api/v1/agents/resolve/:address` | `resolveAgentAddress` | Bearer |
| POST | `/api/v1/messages/:id/read` | `sendReadReceipt` | Bearer |
| GET | `/api/v1/messages/pending` | `listPendingMessages` | Bearer |
| DELETE | `/api/v1/messages/pending` | `acknowledgePendingMessage` | Bearer |
| POST | `/api/v1/messages/pending` | `batchAcknowledgeMessages` | Bearer |
| DELETE | `/api/v1/auth/revoke-key` | `revokeKey` | Bearer |
| POST | `/api/v1/auth/rotate-key` | `rotateKey` | Bearer |
| POST | `/api/v1/auth/rotate-keys` | `rotateKeypair` | Bearer |
| POST | `/api/v1/federation/deliver` | `deliverFederated` | X-AMP-Provider header |

### 3.7 Messages (Global) Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/messages` | `getMessages` | None |
| POST | `/api/messages` | `sendGlobalMessage` | None |
| PATCH | `/api/messages` | `updateGlobalMessage` | None |
| DELETE | `/api/messages` | `removeMessage` | None |
| GET | `/api/messages/meeting` | `getMeetingMessages` | None |
| POST | `/api/messages/forward` | `forwardGlobalMessage` | None |

### 3.8 Meetings Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/meetings` | `listMeetings` | None |
| POST | `/api/meetings` | `createNewMeeting` | None |
| GET | `/api/meetings/:id` | `getMeetingById` | None |
| PATCH | `/api/meetings/:id` | `updateExistingMeeting` | None |
| DELETE | `/api/meetings/:id` | `deleteExistingMeeting` | None |

### 3.9 Governance Routes (PARTIALLY AUTHENTICATED)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/governance` | `getGovernanceConfig` | None |
| POST | `/api/governance/manager` | `setManagerRole` | None (password-based internally) |
| POST | `/api/governance/password` | `setGovernancePassword` | None (password-based internally) |
| GET | `/api/governance/reachable` | `getReachableAgents` | None |
| GET | `/api/governance/transfers` | `listTransferRequests` | None |
| POST | `/api/governance/transfers` | `createTransferReq` | **Bearer (agent auth)** |
| POST | `/api/governance/transfers/:id/resolve` | `resolveTransferReq` | **Bearer (agent auth)** |

### 3.10 Teams Routes (PARTIALLY AUTHENTICATED)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET | `/api/teams` | `listAllTeams` | None |
| POST | `/api/teams` | `createNewTeam` | **Bearer (agent auth)** |
| GET | `/api/teams/:id` | `getTeamById` | **Bearer (agent auth)** |
| PUT | `/api/teams/:id` | `updateTeamById` | **Bearer (agent auth)** |
| DELETE | `/api/teams/:id` | `deleteTeamById` | **Bearer (agent auth)** |
| POST | `/api/teams/notify` | `notifyTeamAgents` | None |
| GET/POST | `/api/teams/:id/tasks` | team tasks | **Bearer (agent auth)** |
| PUT/DELETE | `/api/teams/:id/tasks/:taskId` | task CRUD | **Bearer (agent auth)** |
| GET/POST | `/api/teams/:id/documents` | team documents | **Bearer (agent auth)** |
| GET/PUT/DELETE | `/api/teams/:id/documents/:docId` | document CRUD | **Bearer (agent auth)** |

### 3.11 Other Routes (NO AUTH)

| Method | Route | Service | Auth |
|--------|-------|---------|------|
| GET/POST/DELETE | `/api/webhooks/*` | webhooks | None |
| GET/PATCH/DELETE | `/api/domains/*` | domains | None |
| GET | `/api/marketplace/skills/*` | marketplace | None |
| GET/POST/DELETE | `/api/help/agent` | help assistant | None |

### 3.12 WebSocket Endpoints (NO AUTH)

| Path | Purpose | Auth |
|------|---------|------|
| `/term?name=<session>&host=<hostId>` | Terminal PTY streaming (local or proxied to remote) | None |
| `/status` | Real-time agent status updates | None |
| `/v1/ws` | AMP real-time message delivery | None |
| `/companion-ws?agent=<agentId>` | Companion speech events (Cerebellum) | None |

### 3.13 Internal/Special Endpoints

| Method | Route | Source | Auth |
|--------|-------|--------|------|
| GET | `/api/internal/pty-sessions` | `server.mjs` (direct, not in headless router) | None |
| GET | `/.well-known/agent-messaging.json` | Next.js route (full mode only) | None |

---

## 4. Authentication Architecture

### 4.1 AMP API Key Auth (for /api/v1/* routes)

**Files:**
- `/Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts` - Key generation, hashing, validation
- `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` - Bridge between AMP auth and internal routes

**Key format:** `amp_live_sk_<64 hex chars>` or `amp_test_sk_<64 hex chars>`

**Storage:** Keys stored as SHA-256 hashes in `~/.aimaestro/amp-api-keys.json` (mode 0600)

**Flow:**
1. Agent registers via `POST /api/v1/register` -> receives API key
2. Agent includes `Authorization: Bearer amp_live_sk_...` on subsequent requests
3. Server validates key using constant-time comparison (`timingSafeEqual`)
4. 24-hour grace period on key rotation (old key remains valid)

### 4.2 Agent Auth (for governance/teams routes)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`

Three outcomes:
1. **No auth headers** -> system owner (web UI) -> `{ agentId: undefined }`
2. **Valid `Authorization: Bearer`** -> authenticated agent -> `{ agentId: 'uuid' }`
3. **`X-Agent-Id` without valid Bearer** -> rejected 401

**Important:** When no auth headers are present, the request is treated as coming from the "system owner" (the web UI). This means governance routes that use `authenticateAgent` will allow unauthenticated requests from the web UI but require agent identity for programmatic access.

### 4.3 Auth Gap Analysis

| Route Category | Route Count | Auth Required | Risk if Exposed |
|----------------|-------------|---------------|-----------------|
| Config/System | ~10 | None | Medium - can modify organization |
| Sessions | ~11 | None | **CRITICAL** - can create/delete tmux sessions, send commands |
| Agents Core | ~16 | None | **HIGH** - can create/delete/modify agents |
| Agent Sub-routes | ~60 | None | **HIGH** - can access memory, conversations, skills, send messages |
| Hosts | ~10 | None | **HIGH** - can add/remove hosts from mesh |
| AMP v1 | ~17 | Bearer (most) | Low - properly authenticated |
| Messages | ~6 | None | **HIGH** - can read/send/delete messages |
| Governance | ~7 | Partial | Medium - transfers require auth, config does not |
| Teams | ~15 | Partial | Medium - CRUD requires agent auth, list does not |
| Webhooks/Domains | ~8 | None | Medium - can create webhooks |
| WebSockets | 4 | None | **CRITICAL** - full terminal access |

---

## 5. CORS Configuration

**File:** `/Users/emanuelesabetta/ai-maestro/next.config.js` (lines 21-37)

```javascript
// CORS headers for Manager/Worker architecture
async headers() {
  return [{
    source: '/api/:path*',
    headers: [
      { key: 'Access-Control-Allow-Origin', value: '*' },
      { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
      { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
      { key: 'Access-Control-Allow-Credentials', value: 'true' },
    ],
  }]
}
```

- **Origin:** `*` (any origin)
- **Methods:** All HTTP methods
- **Headers:** Content-Type and Authorization
- **Credentials:** Allowed

**NOTE:** This CORS config is applied by Next.js in `full` mode. The headless router does NOT set CORS headers. This means headless mode has **no CORS headers** -- browser-based cross-origin requests would be blocked, but `curl`/API calls would work fine.

**Also:** `/.well-known/agent-messaging.json` has its own `Access-Control-Allow-Origin: *`.

---

## 6. TLS/HTTPS Support

**Built-in:** NONE. The server creates a plain `http.createServer()` (line 375 of server.mjs). No TLS/HTTPS support exists in the Node.js server itself.

**External SSL termination:**
- **Terraform/AWS infrastructure** (`/Users/emanuelesabetta/ai-maestro/infrastructure/terraform/aws-agent/`) provides:
  - Nginx reverse proxy with SSL termination
  - Let's Encrypt certificate (automatic issuance and renewal)
  - The agent container binds to `0.0.0.0` inside Docker, but nginx proxies external traffic

**For local mesh (Tailscale):** No TLS -- relies on Tailscale's WireGuard encryption at the network layer.

---

## 7. Multi-Host Mesh Architecture

### Host Discovery & Registration

**File:** `/Users/emanuelesabetta/ai-maestro/lib/hosts-config-server.mjs`

- Hosts stored in `~/.aimaestro/hosts.json`
- Each host identified by `os.hostname()` (lowercased, `.local` stripped)
- IP priority: Tailscale (100.x) > LAN (10.x, 192.168.x) > other
- On startup, the server registers itself with known remote peers via `POST /api/hosts/register-peer`

### Remote Session Proxying

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (lines 413-564)

When a WebSocket connects to `/term?name=<session>&host=<hostId>`:
1. If `host` param is a remote host: proxy WebSocket to `ws://<remoteUrl>/term?name=<session>`
2. If `host` is self or absent: attach to local tmux session
3. Retry logic: 5 retries with exponential backoff (500ms, 1s, 2s, 3s, 5s)
4. 10-second connection timeout per attempt

### Agent Directory Sync

On startup (5s delay), the server calls `POST /api/agents/directory/sync` to discover agents from peers.

---

## 8. Remote Control Capabilities

### What CAN be done remotely via API (when server is network-accessible):

| Capability | Route | Risk Level |
|------------|-------|------------|
| **List all agents** | GET /api/agents | High |
| **Create/delete agents** | POST/DELETE /api/agents | Critical |
| **List tmux sessions** | GET /api/sessions | High |
| **Create tmux sessions** | POST /api/sessions/create | Critical |
| **Delete tmux sessions** | DELETE /api/sessions/:id | Critical |
| **Send commands to tmux** | POST /api/sessions/:id/command | **CRITICAL** |
| **Full terminal access** | WS /term?name=<session> | **CRITICAL** |
| **Read agent conversations** | GET /api/agents/:id/search | High |
| **Read agent memory** | GET /api/agents/:id/memory | High |
| **Send messages to agents** | POST /api/messages | High |
| **Modify host mesh** | POST /api/hosts | High |
| **Register as a peer** | POST /api/hosts/register-peer | High |
| **Trigger mesh sync** | POST /api/hosts/sync | Medium |
| **Export agent data** | GET /api/agents/:id/export | High |
| **Import agent data** | POST /api/agents/import | Critical |
| **Transfer agents between hosts** | POST /api/agents/:id/transfer | Critical |
| **Create/manage teams** | POST /api/teams (needs agent auth) | Medium |
| **Create governance transfers** | POST /api/governance/transfers (needs agent auth) | Medium |
| **Route AMP messages** | POST /api/v1/route (needs AMP auth) | Low |

### What REQUIRES local tmux access:

| Capability | Reason |
|------------|--------|
| **Direct terminal interaction** | WebSocket proxies to tmux, but tmux must be local to the target host |
| **Session scrollback history** | Captured from local tmux via `tmux capture-pane` |
| **PTY creation** | `node-pty` spawns `tmux attach` locally |
| **Session existence check** | `tmux ls` runs locally |

---

## 9. What Would Need to Change for Multi-Host Governance

### Current State
- Governance config/password/manager: stored locally per host (`~/.aimaestro/governance.json`)
- Transfer requests: stored locally per host
- Teams: stored locally per host
- No cross-host governance synchronization

### Required Changes for Multi-Host Governance

1. **Governance config replication** - Manager role, password hash need to sync across mesh hosts
2. **Cross-host transfer execution** - Transfer requests need to reach the source and target hosts
3. **Team membership enforcement across hosts** - Team rules (chief-of-staff, message filtering) must be consistent
4. **Auth for governance routes from remote hosts** - Currently, governance config routes have no auth; remote hosts could overwrite manager role
5. **CORS in headless mode** - The headless router doesn't set CORS headers; if a remote web UI needs to call a headless worker, CORS must be added
6. **Network-level auth** - Beyond AMP key auth, consider mutual TLS or shared secrets for host-to-host communication
7. **Rate limiting on mesh endpoints** - `/api/hosts/register-peer` and `/api/hosts/exchange-peers` have no rate limiting

---

## 10. Key Findings & Risks

### Findings

1. **The headless router is a complete 1:1 mirror of the Next.js API** -- no routes are missing. It uses 24 service files and ~120 regex patterns.

2. **Two modes share ALL infrastructure** except the HTTP handler. WebSocket servers, PTY management, startup tasks, and shutdown logic are identical.

3. **Authentication is sparse** -- only AMP v1 routes and governance/team mutation routes require authentication. All other routes (including session management, agent CRUD, host management) are wide open.

4. **CORS is only configured in full mode** (via next.config.js). Headless mode has no CORS headers at all.

5. **TLS must be external** -- nginx, Tailscale, or a reverse proxy is required for encrypted transport.

6. **The server CAN be used as a "remote control" API** -- creating sessions, sending commands, managing agents, and even transferring agents can all be done via HTTP calls with zero authentication.

7. **1MB request body limit** enforced in headless router (`readJsonBody` SF-03 fix).

8. **Host identity is hostname-based** (`os.hostname()`), which is simple but spoofable on untrusted networks.

9. **Tailscale is the primary recommended transport** for multi-host setups, providing WireGuard encryption and NAT traversal without server-side TLS.

10. **AWS infrastructure template exists** with nginx + Let's Encrypt for cloud deployment with proper SSL.

## Open Questions

- Should headless mode inherit the same CORS headers as full mode?
- Should session/agent management routes require authentication when accessed from non-localhost?
- How should governance state be replicated across mesh hosts -- push on change, or periodic sync?
- Should there be a "localhost bypass" for auth (current behavior) vs requiring auth for all callers?
