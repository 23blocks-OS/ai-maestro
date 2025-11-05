# Remote Sessions Architecture

Analysis and implementation plan for managing tmux sessions across multiple machines.

## Table of Contents
- [Overview](#overview)
- [Current Architecture](#current-architecture)
- [Approach Comparison](#approach-comparison)
- [Recommended: Manager/Worker Pattern](#recommended-managerworker-pattern)
- [Implementation Plan](#implementation-plan)
- [Technical Specifications](#technical-specifications)
- [Migration Path](#migration-path)

---

## Overview

**Goal:** Allow one AI Maestro instance (MacBook) to discover, create, and interact with tmux sessions on multiple machines (MacBook, Mac Mini, cloud servers).

**Use Cases:**
- Manage local MacBook sessions + remote Mac Mini sessions from one dashboard
- Access all your Claude Code agents from any device
- Centralized monitoring and control
- Scale to multiple worker machines

---

## Current Architecture

### Session Discovery (Local Only)

**Location:** `app/api/sessions/route.ts:15`

```typescript
const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')
```

**Limitation:** Only discovers sessions on the same machine.

### Session Creation (Local Only)

**Location:** `app/api/sessions/create/route.ts:36`

```typescript
await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`)
```

**Limitation:** Only creates sessions on the same machine.

### Terminal Connection (Local Only)

**Location:** `server.mjs:75`

```typescript
const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.env.HOME || process.cwd(),
  env: process.env
})
```

**Limitation:** PTY only connects to local tmux.

### WebSocket Flow (Local Only)

```
Browser → MacBook AI Maestro WS → PTY → Local tmux
```

---

## Approach Comparison

### Option 1: SSH Direct Connection (Original Phase 3 Plan)

#### Architecture

```
MacBook AI Maestro
├─ Session Discovery: ssh mac-mini "tmux ls"
├─ Session Creation: ssh mac-mini "tmux new-session..."
└─ Terminal: PTY → ssh -t mac-mini tmux attach -t session
```

#### Data Flow

```
Browser → MacBook WS → PTY(ssh) → Remote tmux
```

#### Pros

- ✅ Direct connection to remote tmux
- ✅ Traditional approach, well-understood
- ✅ Single point of control
- ✅ No additional server required on remote machine

#### Cons

- ❌ SSH setup required (keys, authorized_keys, known_hosts)
- ❌ Complex PTY handling with SSH tunneling
- ❌ SSH connection state management (timeouts, reconnections)
- ❌ Different code paths for local vs remote sessions
- ❌ Firewall/NAT traversal issues
- ❌ SSH key rotation and security management
- ❌ No reuse of existing APIs
- ❌ PTY + SSH = complex error handling
- ❌ Difficult to debug SSH connection issues

#### Implementation Complexity

**High** - Requires:
1. SSH client integration in Node.js (ssh2 library)
2. SSH key management
3. PTY wrapper for SSH commands
4. Connection pooling and keepalive
5. Error handling for network issues
6. Different session discovery logic per connection type
7. SSH tunnel management for WebSocket

---

### Option 2: Manager/Worker Pattern (Recommended)

#### Architecture

```
MacBook AI Maestro (Manager)
├─ Local Sessions: tmux ls (direct)
└─ Remote Sessions: HTTP GET http://mac-mini:23000/api/sessions

Mac Mini AI Maestro (Worker)
├─ Runs standard AI Maestro on port 23000
└─ Exposes same APIs as manager

Terminal Connection:
Browser → MacBook WS → HTTP Proxy → Mac Mini WS → Mac Mini tmux
```

#### Data Flow

**Session Discovery:**
```
Manager → GET http://worker:23000/api/sessions → Worker tmux ls → JSON response
Manager merges local + remote sessions
```

**Terminal Connection:**
```
Browser → Manager WS (/term?name=session&host=mac-mini)
         ↓
Manager WS Proxy
         ↓
Worker WS (ws://mac-mini:23000/term?name=session)
         ↓
Worker PTY → Worker tmux
```

#### Pros

- ✅ **No SSH needed** - Use Tailscale VPN or local network
- ✅ **Same codebase** - Every machine runs identical AI Maestro
- ✅ **APIs already exist** - Zero new API development
- ✅ **WebSocket already exists** - Just add proxy layer
- ✅ **Clean separation** - Manager/worker roles are natural
- ✅ **Scales to N machines** - Add workers by configuration
- ✅ **Standard HTTP/WS** - Easier debugging (browser dev tools)
- ✅ **Built-in security** - Tailscale handles encryption
- ✅ **Reuse existing code** - Session discovery, creation, deletion all work
- ✅ **Unified UI** - Same interface for local and remote
- ✅ **Simple config** - Just add host URLs

#### Cons

- ⚠️ Requires AI Maestro running on each worker machine (minimal overhead)
- ⚠️ WebSocket proxy adds small latency (negligible on local network/Tailscale)
- ⚠️ Each worker needs pm2 or similar process manager

#### Implementation Complexity

**Low-Medium** - Requires:
1. Configuration file for remote hosts
2. Fetch remote sessions via existing API
3. WebSocket proxy for remote connections
4. UI indicator for host location
5. Session creation routing (local vs remote)

---

## Recommended: Manager/Worker Pattern

The Manager/Worker pattern is **strongly recommended** because:

1. **Leverages existing infrastructure** - All APIs/WebSockets already work
2. **Simpler implementation** - 80% less code than SSH approach
3. **Better architecture** - Clean separation, scalable design
4. **Easier debugging** - Standard HTTP/WS, browser dev tools work
5. **More secure** - Tailscale VPN, no SSH key management
6. **Future-proof** - Can add authentication, load balancing, etc.

---

## Implementation Plan

### Phase 1: Configuration & Discovery

**Goal:** Manager discovers sessions from multiple workers

#### 1.1 Add Remote Hosts Configuration

**File:** `.aimaestro/config.json` or environment variables

```json
{
  "hosts": [
    {
      "id": "macbook-local",
      "name": "MacBook Pro",
      "url": "http://localhost:23000",
      "type": "local",
      "enabled": true
    },
    {
      "id": "mac-mini",
      "name": "Mac Mini",
      "url": "http://100.80.12.6:23000",
      "type": "remote",
      "enabled": true,
      "tailscale": true
    }
  ]
}
```

**Environment variables alternative:**

```bash
AIMAESTRO_HOSTS='[{"id":"mac-mini","name":"Mac Mini","url":"http://100.80.12.6:23000"}]'
```

#### 1.2 Update Session Discovery API

**File:** `app/api/sessions/route.ts`

**Current (local only):**
```typescript
export async function GET() {
  const { stdout } = await execAsync('tmux list-sessions')
  // Parse and return sessions
}
```

**Updated (multi-host):**
```typescript
export async function GET() {
  const hosts = getConfiguredHosts()

  const sessionsByHost = await Promise.all(
    hosts.map(async (host) => {
      if (host.type === 'local') {
        // Local discovery (existing code)
        return discoverLocalSessions(host)
      } else {
        // Remote discovery (new)
        return discoverRemoteSessions(host)
      }
    })
  )

  // Merge and return all sessions
  const allSessions = sessionsByHost.flat()
  return NextResponse.json({ sessions: allSessions })
}

async function discoverRemoteSessions(host) {
  try {
    const response = await fetch(`${host.url}/api/sessions`)
    const { sessions } = await response.json()

    // Add host metadata to each session
    return sessions.map(session => ({
      ...session,
      hostId: host.id,
      hostName: host.name,
      remote: true
    }))
  } catch (error) {
    console.error(`Failed to fetch sessions from ${host.name}:`, error)
    return []
  }
}
```

#### 1.3 Update Session Type

**File:** `types/session.ts`

```typescript
export interface Session {
  id: string
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
  agentId?: string

  // New fields for remote sessions
  hostId?: string      // "mac-mini", "macbook-local"
  hostName?: string    // "Mac Mini", "MacBook Pro"
  remote?: boolean     // true if not local
}
```

---

### Phase 2: WebSocket Proxy

**Goal:** Browser connects to manager, manager proxies to worker WebSocket

#### 2.1 Update WebSocket Handler

**File:** `server.mjs`

**Current (local only):**
```javascript
wss.on('connection', (ws, request, query) => {
  const sessionName = query.name

  // Spawn local PTY
  const ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName])

  // Pipe PTY ↔ WebSocket
})
```

**Updated (with proxy):**
```javascript
import WebSocket from 'ws'

wss.on('connection', (ws, request, query) => {
  const sessionName = query.name
  const hostId = query.host // New parameter

  if (!hostId || hostId === 'macbook-local') {
    // Local session - existing code
    handleLocalSession(ws, sessionName)
  } else {
    // Remote session - proxy to worker
    handleRemoteSession(ws, sessionName, hostId)
  }
})

function handleRemoteSession(clientWs, sessionName, hostId) {
  const host = getHostById(hostId)

  if (!host) {
    clientWs.close(1008, 'Unknown host')
    return
  }

  // Create WebSocket connection to worker
  const workerWsUrl = host.url.replace('http', 'ws') + `/term?name=${sessionName}`
  const workerWs = new WebSocket(workerWsUrl)

  // Proxy: Client → Worker
  clientWs.on('message', (data) => {
    if (workerWs.readyState === WebSocket.OPEN) {
      workerWs.send(data)
    }
  })

  // Proxy: Worker → Client
  workerWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data)
    }
  })

  // Handle disconnections
  clientWs.on('close', () => workerWs.close())
  workerWs.on('close', () => clientWs.close())

  // Handle errors
  clientWs.on('error', (err) => {
    console.error('Client WebSocket error:', err)
    workerWs.close()
  })

  workerWs.on('error', (err) => {
    console.error('Worker WebSocket error:', err)
    clientWs.close(1011, 'Remote connection failed')
  })
}
```

#### 2.2 Update Client WebSocket Connection

**File:** `hooks/useWebSocket.ts`

**Current:**
```typescript
const ws = new WebSocket(`ws://localhost:23000/term?name=${session.id}`)
```

**Updated:**
```typescript
const hostId = session.hostId || 'macbook-local'
const wsUrl = session.remote
  ? `ws://localhost:23000/term?name=${session.id}&host=${hostId}`
  : `ws://localhost:23000/term?name=${session.id}`

const ws = new WebSocket(wsUrl)
```

**Note:** Client always connects to local manager (localhost:23000). Manager handles proxying to remote workers.

---

### Phase 3: Session Creation Routing

**Goal:** Create sessions on specific hosts

#### 3.1 Update Create Session API

**File:** `app/api/sessions/create/route.ts`

**Updated:**
```typescript
export async function POST(request: Request) {
  const { name, workingDirectory, agentId, hostId } = await request.json()

  const host = hostId ? getHostById(hostId) : getLocalHost()

  if (host.type === 'local') {
    // Local creation (existing code)
    await execAsync(`tmux new-session -d -s "${name}" -c "${cwd}"`)
    return NextResponse.json({ success: true, name })
  } else {
    // Remote creation (forward to worker)
    const response = await fetch(`${host.url}/api/sessions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, workingDirectory, agentId })
    })

    return NextResponse.json(await response.json())
  }
}
```

#### 3.2 Update UI - Add Host Selection

**File:** `components/SessionList.tsx`

Add host selector to "Create Session" modal:

```tsx
<select value={selectedHost} onChange={(e) => setSelectedHost(e.target.value)}>
  {hosts.map(host => (
    <option key={host.id} value={host.id}>
      {host.name} {host.remote ? '(Remote)' : '(Local)'}
    </option>
  ))}
</select>
```

---

### Phase 4: UI Enhancements

**Goal:** Show which host each session is on

#### 4.1 Add Host Indicator

**File:** `components/SessionList.tsx`

```tsx
<div className="session-item">
  <div className="session-name">{session.name}</div>

  {session.remote && (
    <span className="host-badge">
      <ServerIcon className="w-3 h-3" />
      {session.hostName}
    </span>
  )}
</div>
```

#### 4.2 Add Host Filter

```tsx
const [selectedHostFilter, setSelectedHostFilter] = useState('all')

const filteredSessions = sessions.filter(session =>
  selectedHostFilter === 'all' || session.hostId === selectedHostFilter
)
```

---

## Technical Specifications

### Configuration Schema

```typescript
interface Host {
  id: string           // Unique identifier (e.g., "mac-mini")
  name: string         // Display name (e.g., "Mac Mini")
  url: string          // Base URL (e.g., "http://100.80.12.6:23000")
  type: 'local' | 'remote'
  enabled: boolean     // Can be disabled without removing
  tailscale?: boolean  // Using Tailscale VPN
  tags?: string[]      // Custom tags for organization
}

interface Config {
  hosts: Host[]
}
```

### Session Discovery Flow

```
1. Manager loads config → List of hosts
2. For each host:
   a. If local: execAsync('tmux ls')
   b. If remote: fetch(`${host.url}/api/sessions`)
3. Merge results, add host metadata
4. Return unified session list to UI
```

### WebSocket Proxy Flow

```
Browser → Manager WS (ws://localhost:23000/term?name=X&host=mac-mini)
              ↓
        Manager detects host=mac-mini
              ↓
        Manager opens WS to worker (ws://100.80.12.6:23000/term?name=X)
              ↓
        Bidirectional proxy:
          - Browser message → Worker
          - Worker message → Browser
```

### Error Handling

**Worker unreachable:**
- Session discovery: Skip failed hosts, log error
- Session creation: Return error to user
- Terminal connection: Show "Connection failed" message

**Worker authentication (future):**
- Add API key to config
- Include in request headers
- Worker validates before responding

---

## Migration Path

### Step 1: Single Machine (Current)

```
MacBook AI Maestro → Local tmux sessions
```

**No changes required** - Works as-is

### Step 2: Add First Remote Host

```
MacBook AI Maestro (Manager)
├─ Local sessions
└─ Mac Mini sessions (via HTTP/WS)

Mac Mini AI Maestro (Worker)
└─ Runs on port 23000
```

**Changes:**
1. Install AI Maestro on Mac Mini (pm2 setup)
2. Add Mac Mini to manager config
3. Manager discovers both local + remote

### Step 3: Scale to Multiple Hosts

```
MacBook AI Maestro (Manager)
├─ Local sessions
├─ Mac Mini sessions
├─ Cloud Server 1 sessions
└─ Cloud Server 2 sessions

Each worker runs AI Maestro independently
```

**Changes:**
- Add more hosts to config
- Each worker is independent
- Manager aggregates all sessions

---

## Comparison to Docker Agent Use Case

You mentioned doing something similar with Docker agents. Here's how they compare:

### Your Docker Agents (Single Session per Container)

```
Management Service
└─ Docker containers, each with 1 Claude agent
   ├─ Container 1 → Single agent session
   ├─ Container 2 → Single agent session
   └─ Container 3 → Single agent session
```

**Characteristics:**
- 1 container = 1 agent = 1 session
- Ephemeral containers
- Orchestrated via Docker API

### AI Maestro Multi-Host (Multiple Sessions per Host)

```
MacBook Manager
└─ Worker machines, each with N tmux sessions
   ├─ Mac Mini → 10+ tmux sessions (agents)
   ├─ Cloud Server 1 → 20+ tmux sessions
   └─ Cloud Server 2 → 15+ tmux sessions
```

**Characteristics:**
- 1 worker = N sessions = N agents
- Persistent sessions (survive across AI Maestro restarts)
- Orchestrated via HTTP/WebSocket API

### Key Difference

**Docker agents:**
- Session = Container
- Create container → Agent appears
- Stop container → Agent disappears

**AI Maestro workers:**
- Session = tmux session (lightweight)
- Multiple sessions per worker machine
- Sessions persist independently of AI Maestro process

---

## Security Considerations

### Current Phase 1 (No Authentication)

**Risks:**
- ⚠️ Any device on network can access all sessions
- ⚠️ No user authentication
- ⚠️ No session-level permissions

**Mitigations:**
- Use Tailscale VPN (encrypted, access-controlled)
- Firewall rules (block port 23000 from public internet)
- Trust all devices in Tailnet

### Future Phase 2+ (With Authentication)

**Planned:**
- User authentication (OAuth, API keys)
- Session-level permissions
- Audit logging
- HTTPS/TLS

---

## Performance Considerations

### Latency

**Local sessions:**
- Browser → Manager → Local tmux
- Latency: ~1-5ms

**Remote sessions (same network):**
- Browser → Manager → Worker (LAN) → Remote tmux
- Latency: ~5-20ms

**Remote sessions (Tailscale):**
- Browser → Manager → Worker (VPN) → Remote tmux
- Latency: ~20-100ms (depends on route)

**Recommendation:**
- Local network: Excellent performance
- Tailscale: Good performance (comparable to SSH)

### Bandwidth

**Session discovery:**
- HTTP GET request per worker (KB-sized JSON)
- Low bandwidth, runs every 10 seconds

**Terminal streaming:**
- WebSocket binary frames
- Typical: 1-10 KB/s (text output)
- Burst: 100 KB/s (large file dumps)

**Recommendation:**
- Minimal bandwidth usage
- Suitable for remote/mobile networks

---

## Implementation Checklist

### Backend

- [ ] Add configuration system (JSON file or env vars)
- [ ] Update GET /api/sessions to fetch from multiple hosts
- [ ] Add remote session discovery function
- [ ] Update session type with host metadata
- [ ] Add WebSocket proxy for remote connections
- [ ] Update POST /api/sessions/create with host routing
- [ ] Add error handling for unreachable hosts
- [ ] Add health check endpoint per host

### Frontend

- [ ] Update useWebSocket to include host parameter
- [ ] Add host indicator badge in session list
- [ ] Add host filter dropdown
- [ ] Update session creation modal with host selector
- [ ] Add visual distinction for remote sessions
- [ ] Add error messages for connection failures
- [ ] Add host management UI (add/remove/edit hosts)

### Testing

- [ ] Test local-only sessions (no regression)
- [ ] Test single remote host
- [ ] Test multiple remote hosts
- [ ] Test host unreachable scenarios
- [ ] Test WebSocket proxy stability
- [ ] Test session creation routing
- [ ] Test with Tailscale VPN
- [ ] Test with local network

### Documentation

- [ ] Update CLAUDE.md with remote session architecture
- [ ] Create REMOTE-SETUP-GUIDE.md
- [ ] Update NETWORK-ACCESS.md
- [ ] Add troubleshooting section
- [ ] Document configuration schema

---

## Next Steps

### Immediate (Do First)

1. **Prototype configuration system**
   - Create simple JSON config
   - Load hosts on startup
   - Test with 2 hosts (local + Mac Mini)

2. **Test remote session discovery**
   - Manually fetch from Mac Mini API
   - Verify JSON format matches
   - Merge with local sessions

3. **Implement WebSocket proxy**
   - Add host parameter to /term endpoint
   - Create proxy connection to worker
   - Test bidirectional streaming

### Short-term (Next Week)

1. Update UI with host indicators
2. Add host selector to session creation
3. Test end-to-end workflow
4. Document setup process

### Long-term (Phase 2)

1. Add authentication
2. Add host health monitoring
3. Add load balancing (multiple workers per region)
4. Add session migration (move session between hosts)

---

## Conclusion

The Manager/Worker pattern is the **recommended approach** for remote sessions because:

1. **Minimal implementation** - Reuses 90% of existing code
2. **Clean architecture** - Natural separation of concerns
3. **Scalable** - Add unlimited workers
4. **Secure** - Tailscale VPN handles encryption
5. **Debuggable** - Standard HTTP/WebSocket protocols
6. **Future-proof** - Easy to add features (auth, monitoring, etc.)

**Estimated implementation time:** 2-4 days for basic functionality

**Compared to SSH approach:** 10x faster to implement, 5x easier to maintain

---

**Next Steps:** Would you like to proceed with implementing this? We can start with Phase 1 (Configuration & Discovery) and build incrementally.

---

**Last Updated:** 2025-11-05
**AI Maestro Version:** 0.7.1
**Status:** Design Document - Implementation Pending
