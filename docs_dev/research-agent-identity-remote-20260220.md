# Codebase Report: Agent Identity, Registration, and Remote Operations
Generated: 2026-02-20

## Summary

AI Maestro implements a **mesh network** of hosts where each host runs an AI Maestro instance. Agents are the first-class citizens -- they have UUIDs, cryptographic identities (Ed25519), and are scoped to hosts (like email: `auth@macbook-pro` differs from `auth@mac-mini`). Agent transfers between hosts work via HTTP API (export ZIP -> import ZIP) -- there is NO SSH/remote execution. Terminal operations (tmux) are fundamentally local-only; remote terminal viewing works via WebSocket proxying between AI Maestro instances. Docker-based agents are also supported for containerized execution.

---

## 1. Agent Data Model (`types/agent.ts` + `lib/agent-registry.ts`)

**File:** `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (lines 152-231)
**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts`

### Core Identity Fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` (UUID) | Globally unique identifier, generated via `uuidv4()` |
| `name` | `string` | Agent identity (e.g., "23blocks-apps-website"), unique **per host** |
| `label` | `string?` | Display override (auto-generated persona name matching avatar gender) |
| `avatar` | `string?` | Avatar URL (hash-based, deterministic from agent ID) |
| `alias` | `string?` | **DEPRECATED** -- use `name` instead |

### Host Binding

| Field | Type | Purpose |
|-------|------|---------|
| `hostId` | `string` | Host identifier = machine hostname, lowercase, no `.local` suffix |
| `hostName` | `string?` | Human-readable host name |
| `hostUrl` | `string?` | API URL (e.g., `http://100.80.12.6:23000`) |

**Key insight:** Agent names are **scoped per host**. The uniqueness constraint is `(name, hostId)`. This is explicitly documented as "like email addresses: auth@macbook-pro != auth@mac-mini". Verified at `agent-registry.ts:363-367`:

```typescript
const existing = getAgentByName(agentName, hostId)
if (existing) {
  throw new Error(`Agent "${agentName}" already exists on host "${hostId}"`)
}
```

### Cryptographic Identity (AMP)

**File:** `/Users/emanuelesabetta/ai-maestro/types/agent.ts` (lines 27-45)

```typescript
interface AMPAgentIdentity {
  fingerprint: string       // SHA256 fingerprint of public key
  publicKeyHex: string      // 32-byte Ed25519 public key (hex)
  keyAlgorithm: 'Ed25519'
  createdAt: string
  ampAddress?: string       // e.g., "name@tenant.aimaestro.local"
  tenant?: string
}
```

Keys travel WITH the agent during transfer (exported in ZIP, imported on target). This means the agent's cryptographic identity is portable across hosts.

### Sessions (Multi-Brain Support)

```typescript
interface AgentSession {
  index: number                // 0, 1, 2... (0 = primary/coordinator)
  status: 'online' | 'offline'
  workingDirectory?: string   // Override agent's default
  role?: string               // Future: "coordinator", "backend", "frontend"
  createdAt?: string
  lastActive?: string
}
```

Session names derived from agent name: `{name}` for index 0, `{name}_{index}` for others.

### Deployment Types

```typescript
type DeploymentType = 'local' | 'cloud'

interface AgentDeployment {
  type: DeploymentType
  local?: { hostname: string; platform: string }
  cloud?: {
    provider: 'aws' | 'gcp' | 'digitalocean' | 'azure' | 'local-container'
    websocketUrl: string       // WebSocket URL to container
    healthCheckUrl?: string
    containerName?: string
    status?: 'provisioning' | 'running' | 'stopped' | 'error'
    // ... region, instanceType, publicIp, apiEndpoint
  }
}
```

### Runtime Types

```typescript
runtime?: 'tmux' | 'docker' | 'api' | 'direct'
```

This is a stored field on the agent, defaulting to `'tmux'`. The `AgentRuntime` interface in `agent-runtime.ts` defines the abstraction layer, but currently only `TmuxRuntime` is implemented.

### Soft-Delete Support

Agents support soft-delete (`deletedAt` timestamp) and hard-delete (with automatic backup). Soft-deleted agents are excluded from all name/alias lookups unless `includeDeleted=true` is passed.

---

## 2. Agent CRUD Endpoints

**File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/route.ts`
**File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/route.ts`

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agents` | List all agents on THIS host (with `?q=` search) |
| `POST` | `/api/agents` | Create new agent |
| `GET` | `/api/agents/[id]` | Get agent by ID |
| `PATCH` | `/api/agents/[id]` | Update agent |
| `DELETE` | `/api/agents/[id]` | Delete agent (soft by default, `?hard=true` for permanent) |
| `POST` | `/api/agents/register` | Register agent from session name or cloud config |
| `POST` | `/api/agents/docker/create` | Create agent in Docker container |
| `POST` | `/api/agents/import` | Import agent from ZIP |
| `GET` | `/api/agents/by-name/[name]` | Look up agent by name |
| `POST` | `/api/agents/normalize-hosts` | Normalize all agent hostIds (startup task) |
| `POST` | `/api/agents/startup` | Startup initialization |
| `GET` | `/api/agents/unified` | Unified agent view |
| `GET` | `/api/agents/health` | Agent system health |
| `GET/POST` | `/api/agents/email-index` | Email index management |

### Agent Sub-Resources (per agent)

| Path Suffix | Purpose |
|-------------|---------|
| `/transfer` | Transfer agent to another host |
| `/export` | Export as ZIP |
| `/session` | Session management |
| `/metadata` | Agent metadata CRUD |
| `/messages` | Message management |
| `/search` | Semantic search in agent's memory |
| `/memory` | Memory retrieval |
| `/memory/consolidate` | Long-term memory consolidation |
| `/memory/long-term` | Long-term memory access |
| `/database` | Direct database access |
| `/graph/*` | Knowledge graph (code, db, query) |
| `/index-delta` | Incremental conversation indexing |
| `/subconscious` | Subconscious process management |
| `/docs` | Documentation access |
| `/repos` | Git repository management |
| `/skills` | Skill configuration |
| `/skills/settings` | Skill settings |
| `/amp/addresses` | AMP address management |
| `/email/addresses` | Email address management |
| `/metrics` | Performance metrics |
| `/tracking` | Activity tracking |
| `/hibernate` | Hibernate agent |
| `/wake` | Wake agent |
| `/chat` | Chat interface |
| `/playback` | Session playback |

---

## 3. Agent Transfer Between Hosts

**File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts`
**File:** `/Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts` (lines 981-1096)

### Transfer Protocol

The transfer is a **3-step HTTP-based process**:

1. **Export**: Call self's `/api/agents/{id}/export` to get a ZIP buffer
2. **Import**: POST the ZIP to `{targetHostUrl}/api/agents/import` as multipart/form-data
3. **Cleanup** (move mode only): Delete source agent data locally

### Transfer Request

```typescript
interface TransferRequest {
  targetHostId: string
  targetHostUrl: string       // e.g., "http://100.80.12.6:23000"
  mode: 'move' | 'clone'     // move = delete source after transfer
  newAlias?: string           // Optional new name on target
  cloneRepositories?: boolean // Clone git repos on target
}
```

### What Gets Transferred (ZIP Contents)

The export ZIP (created by `exportAgentZip`) contains:

| File/Dir | Contents |
|----------|----------|
| `manifest.json` | Version, export metadata, content flags, repository list |
| `registry.json` | Full agent object (sanitized: deployment set to 'local', sessions set to 'offline') |
| `agent.db` | CozoDB database file |
| `messages/inbox/` | Inbox messages (JSON files) |
| `messages/sent/` | Sent messages (JSON files) |
| `messages/archived/` | Archived messages |
| `skills/marketplace/` | Marketplace skill SKILL.md files |
| `skills/custom/` | Custom skill directories |
| `hooks/` | Hook configuration and scripts |
| `keys/` | **Ed25519 keypair (private + public)** -- identity travels with agent |
| `registrations/` | External AMP provider registrations |

### Import Process (lines 570-850+)

On the target host, `importAgent`:
1. Extracts ZIP to temp directory
2. Reads manifest and validates version
3. Reads agent registry entry
4. Checks for name conflicts (409 if exists, unless `overwrite: true`)
5. Generates new UUID if `newId` option is set
6. Sets `deployment.type = 'local'` with target machine's hostname/platform
7. Sets all sessions to 'offline'
8. Imports: database, messages, skills, hooks, AMP keys, registrations
9. Optionally clones git repositories from remote URLs
10. If keys not present, generates new keypair

### Key Design Decision: Identity Portability

AMP keys (Ed25519) are **included in the export**. This means:
- An agent's cryptographic identity is portable
- Messages signed by the agent on host A can still be verified after transfer to host B
- The agent's AMP address may change (new host), but its fingerprint remains the same

---

## 4. Remote Host & Mesh Network Architecture

### Host Configuration

**File:** `/Users/emanuelesabetta/ai-maestro/types/host.ts`
**File:** `/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts`

```typescript
interface Host {
  id: string          // hostname (e.g., "macbook-pro", "mac-mini")
  name: string        // Human-readable
  url: string         // Base API URL (e.g., "http://100.80.12.6:23000")
  aliases?: string[]  // All IPs, hostnames, URLs for this host
  enabled?: boolean
  tailscale?: boolean
  type?: 'local' | 'remote'  // DEPRECATED - use isSelf() instead
  isSelf?: boolean    // Runtime computed, not stored
  capabilities?: { docker?: boolean; dockerVersion?: string }
}
```

### Host Identity

**File:** `/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts` (lines 90-201)

- `getSelfHostId()`: Returns `os.hostname().toLowerCase().replace(/\.local$/, '')` -- this IS the canonical host ID
- `isSelf(hostId)`: Checks against hostname, all local IPs, and URL forms
- `getPreferredIP()`: Priority: Tailscale (100.x) > LAN (10.x, 192.168.x) > others. **NEVER** returns localhost
- `getSelfAliases()`: All known ways to reach this host (IPs, hostname, URL forms)

### Hosts Configuration Loading

**File:** `/Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts` (lines 232-305)

Priority:
1. `AIMAESTRO_HOSTS` environment variable (JSON array)
2. `~/.aimaestro/hosts.json` file
3. Default: self host only

The `hosts.json` format:
```json
{
  "organization": "acme",
  "organizationSetAt": "2026-01-15T...",
  "organizationSetBy": "macbook-pro",
  "hosts": [
    {
      "id": "macbook-pro",
      "name": "MacBook Pro",
      "url": "http://100.80.12.6:23000",
      "aliases": ["100.80.12.6", "192.168.1.5", "macbook-pro.local"],
      "enabled": true,
      "tailscale": true
    },
    {
      "id": "mac-mini",
      "name": "Mac Mini",
      "url": "http://100.104.178.57:23000",
      "enabled": true,
      "tailscale": true
    }
  ]
}
```

### Host API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/hosts` | List all configured hosts |
| `POST` | `/api/hosts` | Add new host (with bidirectional sync) |
| `GET/PATCH/DELETE` | `/api/hosts/[id]` | Host CRUD |
| `GET` | `/api/hosts/identity` | This host's identity |
| `POST` | `/api/hosts/register-peer` | Register a peer host |
| `POST` | `/api/hosts/exchange-peers` | Exchange peer lists |
| `GET` | `/api/hosts/health` | Host health check |
| `POST` | `/api/hosts/sync` | Trigger host sync |

### Mesh Synchronization

**File:** `/Users/emanuelesabetta/ai-maestro/lib/host-sync.ts`

Key features:
- **Circular propagation prevention** via `propagationId` tracking with 1-minute TTL
- **Maximum propagation depth** of 3 hops
- **Bidirectional registration**: When host A adds host B, it also registers itself on B
- **Peer exchange**: Hosts share their peer lists to achieve eventual mesh connectivity
- Timeouts: 10s for peer registration, 15s for peer exchange, 5s for health checks

### Startup Host Sync

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (lines 1100-1176)

On server startup, three delayed operations:
1. **t+2s**: Normalize agent hostIds (ensure canonical format)
2. **t+5s**: Sync agent directory with peers (discover new agents)
3. **t+5s**: Register self with all known remote peers

### Agent Directory (Distributed)

**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-directory.ts`

A distributed directory service for locating agents across the mesh:

```typescript
interface AgentDirectoryEntry {
  name: string              // Agent name
  hostId: string            // Host where agent lives
  hostUrl?: string          // URL to reach the host
  ampAddress?: string       // Full AMP address
  ampRegistered: boolean    // AMP-registered?
  lastSeen: string          // Last verification timestamp
  source: 'local' | 'remote'
}
```

- Stored at `~/.aimaestro/agent-directory.json`
- Cache TTL: 5 minutes
- Sync interval: 1 minute
- Each host maintains its own directory, syncing with peers

---

## 5. Remote Terminal Viewing (WebSocket Proxy)

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (lines 415-564)
**File:** `/Users/emanuelesabetta/ai-maestro/lib/websocket-proxy.mjs`

### How It Works

When a browser requests a terminal for a remote session, the **local** AI Maestro acts as a WebSocket proxy:

```
Browser (xterm.js)
  | WebSocket: ws://local:23000/term?name=backend&host=mac-mini
  v
Local AI Maestro (server.mjs)
  | Detects host param, calls getHostById(host)
  | isSelf(host) = false → handleRemoteWorker()
  v
Remote AI Maestro (worker)
  | ws://100.104.178.57:23000/term?name=backend
  v
Remote tmux session (node-pty → tmux attach)
```

### Connection Routing (server.mjs lines 790-814)

```javascript
if (query.host && typeof query.host === 'string') {
  const host = getHostById(query.host)
  if (!isSelf(host.id)) {
    handleRemoteWorker(ws, sessionName, host.url)
    return
  }
  // If isSelf, fall through to local tmux handling
}
```

### Remote Worker Connection (server.mjs lines 415-564)

- Retry logic: 5 retries with exponential backoff (500ms, 1s, 2s, 3s, 5s)
- Connection timeout: 10 seconds
- Sends status messages to client: "Connecting...", "Retrying...", "Connected", "Failed"
- Uses WebSocket code 4000 for permanent failure (client should NOT retry)
- Full bidirectional proxy: browser messages → remote, remote messages → browser

### Key Point: NO SSH

There is **zero SSH** in the codebase. Remote terminal access is achieved by:
1. Each host runs its own AI Maestro instance
2. The "manager" host proxies WebSocket connections to the "worker" host
3. The worker host handles the tmux attachment locally
4. All communication is HTTP + WebSocket over the network (typically Tailscale VPN)

---

## 6. Tmux Operations: Fundamentally Local

**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-runtime.ts`

### AgentRuntime Interface

```typescript
interface AgentRuntime {
  readonly type: 'tmux' | 'docker' | 'api' | 'direct'
  listSessions(): Promise<DiscoveredSession[]>
  sessionExists(name: string): Promise<boolean>
  getWorkingDirectory(name: string): Promise<string>
  createSession(name: string, cwd: string): Promise<void>
  killSession(name: string): Promise<void>
  renameSession(oldName: string, newName: string): Promise<void>
  sendKeys(name: string, keys: string, opts?): Promise<void>
  capturePane(name: string, lines?: number): Promise<string>
  getAttachCommand(name: string, socketPath?: string): { command: string; args: string[] }
}
```

### TmuxRuntime Implementation

All operations execute `tmux` commands **locally** via `child_process.exec`:
- `tmux list-sessions` -- discovery
- `tmux has-session -t NAME` -- existence check
- `tmux display-message -t NAME -p "#{pane_current_path}"` -- working directory
- `tmux new-session -d -s NAME -c CWD` -- create
- `tmux kill-session -t NAME` -- kill
- `tmux send-keys -t NAME ...` -- I/O
- `tmux capture-pane -t NAME -p -S -N` -- capture

There is NO mechanism to run these commands on a remote host. Remote tmux operations require the remote host to have its own AI Maestro instance that handles them locally.

### Sync Helpers

`sessionExistsSync`, `killSessionSync`, `renameSessionSync` use `execSync`/`execFileSync` for synchronous operations from the agent registry (which cannot use async).

### Runtime Abstraction (Future)

The interface declares `type: 'tmux' | 'docker' | 'api' | 'direct'` but only `TmuxRuntime` is implemented. A singleton pattern provides `getRuntime()`/`setRuntime()` for future pluggability.

---

## 7. Docker Agent Support

**File:** `/Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts`
**File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/docker/create/route.ts`

### Docker Agent Creation

- `POST /api/agents/docker/create` creates an agent inside a Docker container
- If `hostId` targets a remote host, the request is **forwarded via HTTP** to that host's API
- Verifies Docker is available locally via `docker version`
- Agent gets `deployment.type = 'cloud'` with `provider: 'local-container'`

### Remote Docker Forwarding

```typescript
if (body.hostId) {
  const targetHost = hosts.find(h => h.id === body.hostId)
  if (targetHost && !isSelf(targetHost.id)) {
    const resp = await fetch(`${targetHost.url}/api/agents/docker/create`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { data: await resp.json(), status: resp.status }
  }
}
```

This is the pattern used throughout: remote operations are HTTP API calls to the remote AI Maestro instance, not SSH.

---

## 8. Cross-Host Test Topology

**File:** `/Users/emanuelesabetta/ai-maestro/scripts/test-amp-cross-host.sh`

### Test Setup

- Reads hosts from `~/.aimaestro/hosts.json`
- Requires at least 2 enabled hosts
- Tests prerequisite: AI Maestro running on all hosts, Tailscale connectivity, jq installed

### Test Flow

1. **Load hosts** from `hosts.json` (array: HOST_IDS, HOST_NAMES, HOST_URLS)
2. **Health check** each host via `GET {url}/api/v1/health`
3. **Create test agents** with Ed25519 keypairs (generated locally via openssl)
4. **Register agents** on each host via `POST {url}/api/v1/register`
5. **Cross-host message delivery**: Send from host A's agent to host B's agent
6. **Verify delivery**: Check message arrived on target host

### Test Modes

- Default: Full mesh test (all pairs)
- `--local-only`: Only test local-to-remote delivery
- `--skip-inbox`: Skip inbox file verification on remote hosts

### Mentioned Hosts (in comments)

The script references "minilola, leonidas, mac-mini, local" as example hosts in the mesh.

---

## 9. Remote Install Script

**File:** `/Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh` (1395 lines)

### Purpose

A **curl-pipe-bash** installer for deploying AI Maestro on new machines:
```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | bash
# or: curl -fsSL https://get.aimaestro.dev | bash
```

### Features

- Interactive "Maestro" character with typing animation
- Auto-disables animation over SSH
- Installs prerequisites (Node.js, tmux, etc.)
- Clones the repo, installs dependencies
- Configures PM2 for production running
- Supports: `-d DIR`, `-y` (non-interactive), `--skip-prereqs`, `--skip-tools`, `--uninstall`

### Key Point

This is a **deployment** script, not a remote execution mechanism. It must be run ON the target machine (via SSH or similar). It does not establish any SSH tunnel or remote control channel.

---

## 10. Server Binding

**File:** `/Users/emanuelesabetta/ai-maestro/server.mjs` (line 76)

```javascript
const hostname = process.env.HOSTNAME || '127.0.0.1'
```

- **Default**: Binds to `127.0.0.1` (localhost only)
- **Remote access**: Set `HOSTNAME=0.0.0.0` to accept connections from any network interface
- **Port**: `PORT` env var, default `23000`
- **Mode**: `MAESTRO_MODE` env var -- `full` (Next.js + UI) or `headless` (API-only)

For mesh networking, each host MUST set `HOSTNAME=0.0.0.0` to allow peer connections.

---

## Architecture Map

```
                        ┌─────────────────────────────┐
                        │       Browser (UI)           │
                        │  xterm.js + React + Next.js  │
                        └──────────┬──────────────────┘
                                   │ WebSocket + HTTP
                                   ▼
    ┌──────────────────────────────────────────────────────────┐
    │                  AI Maestro (Host A)                      │
    │  server.mjs: HTTP + WebSocket + Status WS + AMP WS       │
    │                                                           │
    │  ┌─────────────┐  ┌────────────────┐  ┌───────────────┐ │
    │  │Agent Registry│  │ Agent Runtime   │  │ Host Config   │ │
    │  │ (JSON file)  │  │ (TmuxRuntime)  │  │ (hosts.json)  │ │
    │  │              │  │  tmux commands  │  │               │ │
    │  └──────┬───────┘  └───────┬────────┘  └───────┬───────┘ │
    │         │                  │                    │          │
    │         ▼                  ▼                    ▼          │
    │  ~/.aimaestro/       local tmux           Peer Hosts      │
    │  agents/registry.json  sessions           (via HTTP)      │
    │  agent-directory.json                                     │
    └──────────────────────────┬───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │ HTTP API       │ WebSocket Proxy │
              ▼                ▼                 ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
    │ AI Maestro       │  │ AI Maestro       │  │ Docker       │
    │ (Host B)         │  │ (Host C)         │  │ Container    │
    │ Same architecture│  │ Same architecture│  │ (agent)      │
    └─────────────────┘  └─────────────────┘  └──────────────┘
```

---

## What Is Fundamentally Local-Only

| Operation | Local Only? | How Remote Works |
|-----------|-------------|------------------|
| tmux session create/kill/rename | YES | HTTP API to remote AI Maestro |
| tmux send-keys/capture-pane | YES | HTTP API to remote AI Maestro |
| Terminal viewing (PTY attach) | YES (node-pty) | WebSocket proxy through local AI Maestro |
| Agent registry read/write | YES (file I/O) | Each host has its own registry |
| CozoDB database access | YES (file I/O) | Each host has its own databases |
| AMP message delivery | NO (federated) | HTTP routing between AI Maestro instances |
| Agent transfer | NO (federated) | Export ZIP + HTTP upload to target |
| Docker agent creation | YES (docker CLI) | HTTP forwarding to target host's API |
| Agent directory lookup | NO (distributed) | Periodic sync with peer hosts |

---

## Open Questions

1. **No DockerRuntime implementation**: The `AgentRuntime` interface declares `docker | api | direct` types but only `TmuxRuntime` exists. Docker agents likely use the container's internal tmux or direct WebSocket connection.

2. **Container agent handling explicitly removed**: `server.mjs` line 566-567: "NOTE: Container agent handling removed - not yet implemented. Future: Add handleContainerAgent() when cloud deployment is supported."

3. **No SSH anywhere**: The entire codebase has zero SSH/remote execution. All cross-host communication is HTTP APIs between AI Maestro instances. This means every remote host MUST run its own AI Maestro instance.

4. **Agent ID across transfer**: During transfer, the agent UUID is preserved by default. A new UUID is only generated if `newId: true` is passed in import options, or if the same UUID already exists on the target host.

5. **Registry is local**: Each host has its own `~/.aimaestro/agents/registry.json`. There is no shared/distributed registry -- only the agent directory provides cross-host discovery.
