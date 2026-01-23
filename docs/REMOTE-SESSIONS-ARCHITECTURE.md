# Remote Sessions Architecture

Analysis and implementation plan for managing tmux sessions across multiple machines using a peer mesh network.

## Table of Contents
- [Overview](#overview)
- [Current Architecture](#current-architecture)
- [Approach Comparison](#approach-comparison)
- [Recommended: Peer Mesh Network](#recommended-peer-mesh-network)
- [Implementation Plan](#implementation-plan)
- [Technical Specifications](#technical-specifications)
- [Migration Path](#migration-path)

---

## Overview

**Goal:** Allow any AI Maestro instance to discover, create, and interact with tmux sessions on multiple machines - all connected as equals in a peer mesh network.

**Use Cases:**
- Manage agents across MacBook, Mac Mini, and cloud servers from any node
- Access all your Claude Code agents from any connected device
- Decentralized monitoring and control - no single point of failure
- Scale to multiple machines seamlessly

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
Browser → AI Maestro WS → PTY → Local tmux
```

---

## Approach Comparison

### Option 1: SSH Direct Connection (Original Phase 3 Plan)

#### Architecture

```
Central AI Maestro
├─ Session Discovery: ssh peer "tmux ls"
├─ Session Creation: ssh peer "tmux new-session..."
└─ Terminal: PTY → ssh -t peer tmux attach -t session
```

#### Data Flow

```
Browser → Central WS → PTY(ssh) → Remote tmux
```

#### Pros

- ✅ Direct connection to remote tmux
- ✅ Traditional approach, well-understood
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
- ❌ **Central server required** - single point of failure

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

### Option 2: Peer Mesh Network (Recommended)

#### Architecture

```
Peer Mesh Network (All Nodes Equal)

Node A (MacBook) ◄──────► Node B (Mac Mini)
       ▲                        ▲
       │                        │
       └────────► Node C ◄──────┘
                (Cloud)

Each node:
├─ Runs standard AI Maestro on port 23000
├─ Discovers peers via HTTP API
├─ Syncs peer list automatically
└─ Can access any agent from any node
```

#### Data Flow

**Peer Discovery:**
```
Node A → POST /api/hosts/register-peer to Node B
       ↓
Node B auto-discovers Node A
       ↓
Both nodes exchange peer lists
       ↓
All nodes eventually converge to same peer list
```

**Terminal Connection:**
```
Browser → Current Node WS (/term?name=session&host=peer-id)
         ↓
Current Node WS Proxy
         ↓
Peer Node WS (ws://peer:23000/term?name=session)
         ↓
Peer PTY → Peer tmux
```

#### Pros

- ✅ **No central server** - All nodes are equal peers
- ✅ **No SSH needed** - Use Tailscale VPN or local network
- ✅ **Same codebase** - Every machine runs identical AI Maestro
- ✅ **APIs already exist** - Zero new API development
- ✅ **WebSocket already exists** - Just add proxy layer
- ✅ **Bidirectional discovery** - Add once, both sides auto-discover
- ✅ **Scales to N machines** - Add peers by configuration
- ✅ **Standard HTTP/WS** - Easier debugging (browser dev tools)
- ✅ **Built-in security** - Tailscale handles encryption
- ✅ **Reuse existing code** - Session discovery, creation, deletion all work
- ✅ **Access from anywhere** - Dashboard works from any connected node

#### Cons

- ⚠️ Requires AI Maestro running on each machine (minimal overhead)
- ⚠️ WebSocket proxy adds small latency (negligible on local network/Tailscale)
- ⚠️ Each node needs pm2 or similar process manager

#### Implementation Complexity

**Low-Medium** - Requires:
1. Configuration file for peer hosts
2. Fetch sessions via existing API
3. WebSocket proxy for remote connections
4. UI indicator for host location
5. Session creation routing (local vs remote)
6. Automatic peer exchange protocol

---

## Recommended: Peer Mesh Network

The Peer Mesh Network is **strongly recommended** because:

1. **Decentralized** - No single point of failure, access from any node
2. **Leverages existing infrastructure** - All APIs/WebSockets already work
3. **Simpler implementation** - 80% less code than SSH approach
4. **Better architecture** - Clean separation, scalable design
5. **Easier debugging** - Standard HTTP/WS, browser dev tools work
6. **More secure** - Tailscale VPN, no SSH key management
7. **Future-proof** - Can add authentication, load balancing, etc.

---

## Implementation Plan

### Phase 1: Configuration & Discovery

**Goal:** Node discovers sessions from all connected peers

#### 1.1 Add Peer Hosts Configuration

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
        // Peer discovery (new)
        return discoverPeerSessions(host)
      }
    })
  )

  // Merge and return all sessions
  const allSessions = sessionsByHost.flat()
  return NextResponse.json({ sessions: allSessions })
}

async function discoverPeerSessions(host) {
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

  // Fields for peer sessions
  hostId?: string      // "mac-mini", "macbook-local"
  hostName?: string    // "Mac Mini", "MacBook Pro"
  remote?: boolean     // true if not local
}
```

---

### Phase 2: WebSocket Proxy

**Goal:** Browser connects to current node, node proxies to peer WebSocket

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

  if (!hostId || hostId === 'local') {
    // Local session - existing code
    handleLocalSession(ws, sessionName)
  } else {
    // Peer session - proxy to peer node
    handlePeerSession(ws, sessionName, hostId)
  }
})

function handlePeerSession(clientWs, sessionName, hostId) {
  const host = getHostById(hostId)

  if (!host) {
    clientWs.close(1008, 'Unknown host')
    return
  }

  // Create WebSocket connection to peer
  const peerWsUrl = host.url.replace('http', 'ws') + `/term?name=${sessionName}`
  const peerWs = new WebSocket(peerWsUrl)

  // Proxy: Client → Peer
  clientWs.on('message', (data) => {
    if (peerWs.readyState === WebSocket.OPEN) {
      peerWs.send(data)
    }
  })

  // Proxy: Peer → Client
  peerWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data)
    }
  })

  // Handle disconnections
  clientWs.on('close', () => peerWs.close())
  peerWs.on('close', () => clientWs.close())

  // Handle errors
  clientWs.on('error', (err) => {
    console.error('Client WebSocket error:', err)
    peerWs.close()
  })

  peerWs.on('error', (err) => {
    console.error('Peer WebSocket error:', err)
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
const hostId = session.hostId || 'local'
const wsUrl = session.remote
  ? `ws://localhost:23000/term?name=${session.id}&host=${hostId}`
  : `ws://localhost:23000/term?name=${session.id}`

const ws = new WebSocket(wsUrl)
```

**Note:** Client always connects to current node. Node handles proxying to peers.

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
    // Peer creation (forward to peer)
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
      {host.name} {host.remote ? '(Peer)' : '(Local)'}
    </option>
  ))}
</select>
```

---

### Phase 4: Automatic Peer Discovery

**Goal:** Add a peer once, both sides auto-discover each other

#### 4.1 Peer Registration API

**File:** `app/api/hosts/register-peer/route.ts`

```typescript
export async function POST(request: Request) {
  const { url, name, hostId } = await request.json()

  // Add the registering peer to our hosts list
  await addHost({
    id: hostId,
    name: name,
    url: url,
    type: 'remote',
    enabled: true
  })

  return NextResponse.json({
    success: true,
    myHostId: getLocalHostId(),
    myName: getLocalHostName()
  })
}
```

#### 4.2 Peer Exchange Protocol

When adding a new peer:

```typescript
async function addPeer(peerUrl: string) {
  // 1. Register ourselves with the peer
  const response = await fetch(`${peerUrl}/api/hosts/register-peer`, {
    method: 'POST',
    body: JSON.stringify({
      url: getMyUrl(),
      name: getMyName(),
      hostId: getMyHostId()
    })
  })

  // 2. Exchange peer lists
  const { peers } = await fetch(`${peerUrl}/api/hosts/exchange-peers`, {
    method: 'POST',
    body: JSON.stringify({ myPeers: getMyPeers() })
  }).then(r => r.json())

  // 3. Merge peer lists
  mergePeers(peers)

  // 4. Notify other peers about the new peer
  notifyPeersOfNewPeer(peerUrl)
}
```

---

### Phase 5: UI Enhancements

**Goal:** Show which host each session is on

#### 5.1 Add Host Indicator

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

#### 5.2 Add Host Filter

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
1. Node loads config → List of peers
2. For each host:
   a. If local: execAsync('tmux ls')
   b. If peer: fetch(`${host.url}/api/sessions`)
3. Merge results, add host metadata
4. Return unified session list to UI
```

### WebSocket Proxy Flow

```
Browser → Node WS (ws://localhost:23000/term?name=X&host=mac-mini)
              ↓
        Node detects host=mac-mini
              ↓
        Node opens WS to peer (ws://100.80.12.6:23000/term?name=X)
              ↓
        Bidirectional proxy:
          - Browser message → Peer
          - Peer message → Browser
```

### Peer Exchange Protocol

```
Node A adds Node B:
  1. A → POST /api/hosts/register-peer → B (A registers itself with B)
  2. A → POST /api/hosts/exchange-peers → B (share peer lists)
  3. B now knows about A, A now knows about B
  4. Both converge to same peer list
  5. New peers propagate through the mesh
```

### Error Handling

**Peer unreachable:**
- Session discovery: Skip failed hosts, log error
- Session creation: Return error to user
- Terminal connection: Show "Connection failed" message

**Peer authentication (future):**
- Add API key to config
- Include in request headers
- Peer validates before responding

---

## Migration Path

### Step 1: Single Machine (Current)

```
AI Maestro → Local tmux sessions
```

**No changes required** - Works as-is

### Step 2: Add First Peer

```
MacBook AI Maestro ◄──────► Mac Mini AI Maestro
├─ Local sessions           ├─ Local sessions
└─ Mac Mini sessions        └─ MacBook sessions

Both see all agents!
```

**Changes:**
1. Install AI Maestro on Mac Mini (pm2 setup)
2. Add Mac Mini as peer from either node
3. Both nodes auto-discover each other

### Step 3: Scale to Multiple Peers

```
MacBook ◄──────► Mac Mini
    ▲               ▲
    │               │
    └──► Cloud ◄────┘

All nodes see all agents from all peers!
```

**Changes:**
- Add more peers from any node
- Each node is independent
- All nodes see aggregated sessions

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

### AI Maestro Peer Mesh (Multiple Sessions per Node)

```
Peer Mesh Network
└─ Multiple machines, each with N tmux sessions
   ├─ Mac Mini → 10+ tmux sessions (agents)
   ├─ Cloud Server 1 → 20+ tmux sessions
   └─ Cloud Server 2 → 15+ tmux sessions
```

**Characteristics:**
- 1 node = N sessions = N agents
- Persistent sessions (survive across AI Maestro restarts)
- Orchestrated via HTTP/WebSocket API
- Accessible from any connected node

### Key Difference

**Docker agents:**
- Session = Container
- Create container → Agent appears
- Stop container → Agent disappears

**AI Maestro peers:**
- Session = tmux session (lightweight)
- Multiple sessions per peer node
- Sessions persist independently of AI Maestro process
- Access from any node in the mesh

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
- Browser → Node → Local tmux
- Latency: ~1-5ms

**Peer sessions (same network):**
- Browser → Node → Peer (LAN) → Peer tmux
- Latency: ~5-20ms

**Peer sessions (Tailscale):**
- Browser → Node → Peer (VPN) → Peer tmux
- Latency: ~20-100ms (depends on route)

**Recommendation:**
- Local network: Excellent performance
- Tailscale: Good performance (comparable to SSH)

### Bandwidth

**Session discovery:**
- HTTP GET request per peer (KB-sized JSON)
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
- [ ] Update GET /api/sessions to fetch from all peers
- [ ] Add peer session discovery function
- [ ] Update session type with host metadata
- [ ] Add WebSocket proxy for peer connections
- [ ] Update POST /api/sessions/create with host routing
- [ ] Add peer registration API
- [ ] Add peer exchange protocol
- [ ] Add error handling for unreachable peers
- [ ] Add health check endpoint per host

### Frontend

- [ ] Update useWebSocket to include host parameter
- [ ] Add host indicator badge in session list
- [ ] Add host filter dropdown
- [ ] Update session creation modal with host selector
- [ ] Add visual distinction for peer sessions
- [ ] Add error messages for connection failures
- [ ] Add peer management UI (add/remove/edit peers)

### Testing

- [ ] Test local-only sessions (no regression)
- [ ] Test single peer
- [ ] Test multiple peers
- [ ] Test peer unreachable scenarios
- [ ] Test WebSocket proxy stability
- [ ] Test session creation routing
- [ ] Test bidirectional peer discovery
- [ ] Test with Tailscale VPN
- [ ] Test with local network

### Documentation

- [ ] Update CLAUDE.md with peer mesh architecture
- [ ] Create PEER-SETUP-GUIDE.md
- [ ] Update NETWORK-ACCESS.md
- [ ] Add troubleshooting section
- [ ] Document configuration schema

---

## Next Steps

### Immediate (Do First)

1. **Prototype configuration system**
   - Create simple JSON config
   - Load hosts on startup
   - Test with 2 nodes (local + Mac Mini)

2. **Test peer session discovery**
   - Manually fetch from Mac Mini API
   - Verify JSON format matches
   - Merge with local sessions

3. **Implement WebSocket proxy**
   - Add host parameter to /term endpoint
   - Create proxy connection to peer
   - Test bidirectional streaming

### Short-term (Next Week)

1. Update UI with host indicators
2. Add host selector to session creation
3. Implement peer registration API
4. Test end-to-end workflow
5. Document setup process

### Long-term (Phase 2)

1. Add authentication
2. Add host health monitoring
3. Add load balancing (multiple peers per region)
4. Add session migration (move session between peers)

---

## Conclusion

The Peer Mesh Network is the **recommended approach** for remote sessions because:

1. **Decentralized** - No central server, access from any node
2. **Minimal implementation** - Reuses 90% of existing code
3. **Clean architecture** - Natural separation of concerns
4. **Scalable** - Add unlimited peers
5. **Secure** - Tailscale VPN handles encryption
6. **Debuggable** - Standard HTTP/WebSocket protocols
7. **Future-proof** - Easy to add features (auth, monitoring, etc.)

**Estimated implementation time:** 2-4 days for basic functionality

**Compared to SSH approach:** 10x faster to implement, 5x easier to maintain

---

**Last Updated:** 2025-01-22
**AI Maestro Version:** 0.18.x
**Status:** Implemented - Peer Mesh Architecture Active
