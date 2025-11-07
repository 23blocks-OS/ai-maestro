# Terminal Architecture Comparison

## Overview

This document compares our current integrated terminal architecture with the dtach-based gateway service from the fork at https://github.com/TheMightyDman/ai-maestro-dtach/tree/dtach-session-engine-rebuild

Both implementations use **xterm.js** on the frontend. The key differences are in the backend session management architecture.

---

## Current Architecture (Default)

### Summary
Single integrated server combining Next.js and WebSocket on port 23000, with direct tmux attachment and support for remote worker proxying.

### Components
- **server.mjs** - Single HTTP server handling:
  - Next.js page serving
  - WebSocket upgrades on `/term?name=<sessionName>`
  - PTY session management
  - Remote worker proxying
  - Container agent proxying

### Session Management
```
Browser WebSocket → server.mjs → node-pty → tmux attach-session
```

**Features:**
- Direct `tmux attach-session -t <name>` spawning
- Simple Map-based session tracking
- Multiple clients per session (unlimited)
- 30-second cleanup timer on last client disconnect
- Activity tracking via global sessionActivity Map
- Optional session logging to files

### Connection Types
1. **Local tmux** - Direct PTY attachment
2. **Remote Worker** - WebSocket proxy to remote host
3. **Container Agent** - WebSocket proxy to cloud container

### Backpressure Handling
```typescript
ptyProcess.onData((data) => {
  ptyProcess.pause()
  // Send to all clients
  Promise.all(writePromises).finally(() => {
    ptyProcess.resume()
  })
})
```

Simple pause/resume pattern based on write completion.

### History/Scrollback
Captured on client connect via `tmux capture-pane`:
```bash
# Try full history (1000 lines)
tmux capture-pane -t <session> -p -S -1000 -J

# Fallback to visible content
tmux capture-pane -t <session> -p -J
```

Sent as plain text with `\r\n` line endings for xterm.js scrollback.

### Limitations
- No resource limits (unlimited clients per session)
- No per-IP connection limits
- No metrics/monitoring system
- No WebSocket protocol versioning
- History limited to tmux capture on connect (not buffered)

### Strengths
- Simple, easy to understand
- Integrated with Next.js (single port)
- Supports multiple backend types (tmux, remote, container)
- Works with existing tmux sessions without modification

---

## dtach Gateway Architecture (Alternative)

### Summary
Separate microservice on port 23001 dedicated to terminal session management, using dtach instead of tmux for session attachment.

### Components
1. **server.mjs** - Next.js + WebSocket proxy
   - Routes WebSocket connections to gateway service

2. **terminal-gateway service** (port 23001)
   - `index.ts` - WebSocket server with "maestro.v1" protocol
   - `SessionManager.ts` - Centralized session lifecycle
   - `PtySession.ts` - dtach-based PTY wrapper
   - `RingBuffer.ts` - 32MB circular buffer for history

### Session Management
```
Browser WebSocket → server.mjs proxy → gateway:23001 → SessionManager → PtySession → dtach -a <socket>
```

**Features:**
- `dtach -a` attachment (persistent sessions)
- SessionManager with resource constraints
- RingBuffer for 32MB history buffering
- Metrics & monitoring endpoints
- Protocol versioning ("maestro.v1")

### Resource Limits
```typescript
maxClientsPerSession: 4        // Max viewers per session
maxActiveConnectionsPerIp: 8   // Per-IP connection limit
ipConnections: Map             // IP tracking
```

Slot-based admission control prevents resource exhaustion.

### Backpressure Handling
```typescript
evaluateBackpressure() {
  const totalBuffered = sum(client.bufferedAmount)

  if (totalBuffered > highWaterMark && !paused) {
    pty.pause()
    paused = true
  } else if (totalBuffered < lowWaterMark && paused) {
    pty.resume()
    paused = false
  }
}
```

Threshold-based backpressure with high/low watermarks.

### History/Scrollback
- **RingBuffer** - Circular buffer (default 32MB)
- History stored in memory, not fetched from tmux
- New clients receive buffered history immediately
- No tmux capture-pane calls needed

### Protocol
Custom WebSocket protocol "maestro.v1":
```typescript
// Client → Server
{ type: 'hello', token: string }
{ type: 'join', session: string, cols: number, rows: number }
{ type: 'input', data: string }
{ type: 'resize', cols: number, rows: number }
{ type: 'ack', seq: number }

// Server → Client
{ type: 'output', seq: number, data: string }
{ type: 'joined', session: string }
{ type: 'error', error: string }
```

Sequence numbers for reliable delivery and acknowledgment.

### Metrics & Monitoring
```
GET /activity  - Session snapshots (requires bearer token)
GET /metrics   - Prometheus-style metrics
```

### dtach vs tmux
- **dtach** - Lightweight session detachment tool
  - Single command per session
  - No multiplexer features (no windows, panes, etc.)
  - Just session persistence and detachment

- **tmux** - Full terminal multiplexer
  - Multiple windows, panes, layouts
  - Copy mode, scrollback management
  - Split screens, session management UI

### Limitations
- Requires separate service deployment (port 23001)
- More complex architecture (multiple services)
- Client limit (4 per session) may be restrictive
- No built-in support for remote workers or container agents
- Requires dtach installation

### Strengths
- Resource limits prevent abuse
- RingBuffer provides reliable history
- Metrics for monitoring
- Protocol versioning for compatibility
- Proper backpressure with watermarks
- Separate service can scale independently

---

## Side-by-Side Comparison

| Feature | Current (tmux) | Gateway (dtach) |
|---------|----------------|-----------------|
| **Architecture** | Integrated | Microservice |
| **Ports** | 23000 only | 23000 + 23001 |
| **Session Backend** | tmux | dtach |
| **PTY Command** | `tmux attach-session -t <name>` | `dtach -a <socket>` |
| **Clients per Session** | Unlimited | Max 4 |
| **Connections per IP** | Unlimited | Max 8 |
| **History Buffer** | tmux scrollback | 32MB RingBuffer |
| **History Load** | On connect (tmux capture-pane) | From buffer (instant) |
| **Backpressure** | Pause/resume on writes | High/low watermarks |
| **Protocol** | None | "maestro.v1" |
| **Metrics** | None | Prometheus + /activity |
| **Remote Workers** | ✅ Built-in proxy | ❌ Not supported |
| **Container Agents** | ✅ Built-in proxy | ❌ Not supported |
| **Cleanup Timer** | 30s grace period | 30s grace period |
| **Multiplexer Features** | ✅ (windows, panes) | ❌ (single command only) |
| **Complexity** | Low (1 service) | Medium (2 services) |
| **Installation** | tmux only | tmux + dtach |

---

## Implementation Strategy

To support both architectures, we need:

### 1. Settings Toggle
Add a terminal backend selector in Settings:
```typescript
type TerminalBackend = 'tmux' | 'dtach-gateway'
```

Store in localStorage or user preferences.

### 2. WebSocket URL Resolution
```typescript
// Current
ws://localhost:23000/term?name=<sessionName>

// Gateway
ws://localhost:23001/term?session=<sessionName>
```

Frontend needs to switch URLs based on setting.

### 3. Protocol Handling
- **tmux backend**: Simple string messages
- **dtach-gateway**: JSON protocol messages (hello, join, input, output, ack)

Frontend needs protocol adapter.

### 4. Service Management
- **tmux**: Already running (server.mjs)
- **dtach-gateway**: Separate service start/stop

Need PM2 config or startup scripts for gateway service.

### 5. Feature Matrix
Some features only work with current architecture:
- Remote worker proxying → tmux only
- Container agent proxying → tmux only
- Unlimited clients → tmux only
- Resource limits → gateway only
- Metrics → gateway only

UI should show feature availability based on selection.

---

## Recommendation

**Default**: Keep current tmux-based architecture
- Supports all existing features (remote workers, containers)
- Simple, proven, no additional services
- Works for majority of use cases

**Optional**: Add dtach-gateway for advanced users
- Better resource management
- Monitoring and metrics
- Protocol versioning for future compatibility
- Requires separate service deployment

**Implementation Priority**:
1. Add Settings UI toggle
2. Implement WebSocket URL switching
3. Add protocol adapter for dtach-gateway
4. Create gateway service deployment scripts
5. Document trade-offs and feature availability
