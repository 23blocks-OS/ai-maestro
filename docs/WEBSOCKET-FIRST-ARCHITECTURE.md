# WebSocket-First Distributed Architecture

**Architecture Pattern:** Each agent container exposes WebSocket server for direct browser connection
**Comparison:** SSH-tunneled approach vs. WebSocket-exposed approach
**Date:** January 2025

---

## Architecture Comparison

### Approach 1: Your Proposal (WebSocket-First) 🆕

```
Browser Dashboard (Local Machine)
    ↓ wss://agent1.aws.com:23000 (direct WebSocket)
AWS ECS Task / EC2 Instance
    ↓
Docker Container: Agent 1
    ├── WebSocket Server (port 23000 exposed)
    ├── node-pty + server.mjs equivalent
    └── tmux → Claude Code CLI

Browser Dashboard (Local Machine)
    ↓ wss://agent2.aws.com:23001 (direct WebSocket)
Docker Container: Agent 2
    ├── WebSocket Server (port 23001 exposed)
    ├── node-pty + server.mjs equivalent
    └── tmux → Claude Code CLI
```

**Key Characteristics:**
- ✅ Each container runs its own WebSocket server
- ✅ Browser connects directly to remote WebSocket
- ✅ No SSH tunneling required
- ✅ Simpler connection model (browser ↔ container)

### Approach 2: SSH-First (My Original Proposal)

```
Browser Dashboard (Local Machine)
    ↓ ws://localhost:23000 (local WebSocket)
Local server.mjs (runs on your machine)
    ↓ SSH tunnel + docker exec
AWS EC2 Instance
    ↓
Docker Container: Agent 1
    ├── NO WebSocket server
    ├── NO exposed ports
    └── tmux → Claude Code CLI (pure terminal)
```

**Key Characteristics:**
- ✅ Centralized WebSocket server (local machine)
- ✅ SSH for remote access (encrypted tunnel)
- ✅ No exposed ports on containers
- ✅ Terminal-only containers (simpler)

---

## Your Questions Answered

### Q1: How many Docker containers can run in one ECS task?

**Answer:** ECS supports multiple containers per task, but for our use case:

**Recommended Pattern:**
```
ECS Cluster: ai-maestro-agents
├── ECS Service: agent-pool-1 (us-east-1)
│   ├── Task 1: Agent Container 1 (exposed port 23001)
│   ├── Task 2: Agent Container 2 (exposed port 23002)
│   ├── Task 3: Agent Container 3 (exposed port 23003)
│   └── ...
└── ECS Service: agent-pool-2 (eu-west-1)
    └── Similar task distribution
```

**Each ECS Task = 1 Agent Container** (for simplicity)

**Why not multiple containers per task?**
- ✅ Easier scaling (scale tasks = scale agents)
- ✅ Simpler networking (one port per task)
- ✅ Better isolation (agent failures don't affect others)
- ✅ Independent resource allocation (CPU/memory per agent)

**Alternative: Multiple agents per EC2 instance**
```
EC2 Instance (t3.xlarge)
├── Container 1: Agent A (port 23001)
├── Container 2: Agent B (port 23002)
├── Container 3: Agent C (port 23003)
└── Container 4: Agent D (port 23004)
```

**Capacity Planning:**

| Instance Type | vCPU | Memory | Agents per Instance | Cost/Month |
|---------------|------|---------|---------------------|------------|
| t3.medium | 2 | 4GB | 1-2 agents | $30 |
| t3.large | 2 | 8GB | 2-4 agents | $60 |
| t3.xlarge | 4 | 16GB | 4-8 agents | $120 |

**Recommendation:** Start with **1 agent per ECS task**, 2-4 tasks per EC2 instance.

### Q2: How do we connect to agents inside containers?

**Your WebSocket-First Approach:**

```
1. Each container runs WebSocket server (embedded server.mjs)
2. Container exposes port (e.g., 23001)
3. AWS Load Balancer maps domains to containers
4. Browser connects: wss://agent-1.aimaestro.com
```

**Network Flow:**
```
Browser
    ↓ wss://agent-1.aimaestro.com (HTTPS/WSS over internet)
AWS Application Load Balancer (ALB)
    ↓ Routes to correct ECS task based on subdomain
ECS Task: Agent 1 Container
    ├── WebSocket server listening on port 23000
    ├── Accepts connection, authenticates
    └── Spawns node-pty → tmux attach
tmux session with Claude Code CLI
```

### Q3: Is the connection WebSocket from browser to cloud?

**Yes, with your architecture:**

```
Browser (xterm.js)
    ↓ WebSocket: wss://agent-1.aimaestro.com
    ↓ (encrypted over internet)
AWS Load Balancer
    ↓ (routes based on domain/path)
Agent Container (WebSocket server)
    ↓ node-pty
tmux → Claude Code CLI
```

**Key Points:**
1. ✅ **Direct WebSocket** from browser to cloud container
2. ✅ **No local server** required (browser → cloud directly)
3. ✅ **Load balancer** routes connections to correct agent
4. ✅ **WSS (secure WebSocket)** for encryption

---

## Detailed WebSocket-First Architecture

### 1. Container Structure

**Each agent container runs:**

```dockerfile
FROM debian:bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    tmux \
    git \
    curl

# Install Node.js dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

# Copy server code (minimal WebSocket + PTY bridge)
COPY agent-server.js ./

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create workspace
RUN mkdir -p /workspace
WORKDIR /workspace

# Expose WebSocket port
EXPOSE 23000

# Start server
CMD ["node", "/app/agent-server.js"]
```

**agent-server.js** (simplified server.mjs for containers):

```javascript
// agent-server.js - Runs inside each agent container

const http = require('http')
const { WebSocketServer } = require('ws')
const pty = require('node-pty')
const { spawn } = require('child_process')

const PORT = process.env.AGENT_PORT || 23000
const AGENT_ID = process.env.AGENT_ID || 'unknown'
const SESSION_NAME = process.env.TMUX_SESSION_NAME || 'agent-session'

// HTTP server (health checks)
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      agentId: AGENT_ID,
      sessionName: SESSION_NAME
    }))
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

// WebSocket server
const wss = new WebSocketServer({
  server: httpServer,
  path: '/term'
})

// Active PTY sessions (one per tmux session, shared across clients)
const sessions = new Map()

wss.on('connection', (ws, req) => {
  console.log(`[${AGENT_ID}] New WebSocket connection`)

  let ptyProcess = null
  let sessionKey = SESSION_NAME

  // Get or create PTY process for this session
  if (sessions.has(sessionKey)) {
    console.log(`[${AGENT_ID}] Reusing existing PTY for session: ${sessionKey}`)
    ptyProcess = sessions.get(sessionKey).pty
    sessions.get(sessionKey).clients.add(ws)
  } else {
    console.log(`[${AGENT_ID}] Creating new PTY for session: ${sessionKey}`)

    // Start tmux session if it doesn't exist
    spawn('tmux', ['has-session', '-t', SESSION_NAME], (error) => {
      if (error) {
        // Session doesn't exist, create it
        spawn('tmux', ['new-session', '-d', '-s', SESSION_NAME, '-c', '/workspace'])
        spawn('tmux', ['send-keys', '-t', SESSION_NAME, 'claude', 'C-m'])
      }
    })

    // Attach to tmux session
    ptyProcess = pty.spawn('tmux', ['attach-session', '-t', SESSION_NAME], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/workspace',
      env: process.env
    })

    sessions.set(sessionKey, {
      pty: ptyProcess,
      clients: new Set([ws])
    })

    // Broadcast PTY output to all connected clients
    ptyProcess.onData((data) => {
      const sessionData = sessions.get(sessionKey)
      if (sessionData) {
        sessionData.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data)
          }
        })
      }
    })

    ptyProcess.onExit(() => {
      console.log(`[${AGENT_ID}] PTY exited for session: ${sessionKey}`)
      sessions.delete(sessionKey)
    })
  }

  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)

      if (data.type === 'input') {
        ptyProcess.write(data.data)
      } else if (data.type === 'resize') {
        ptyProcess.resize(data.cols, data.rows)
      }
    } catch (e) {
      // Raw terminal input (not JSON)
      ptyProcess.write(message)
    }
  })

  // Handle client disconnect
  ws.on('close', () => {
    console.log(`[${AGENT_ID}] WebSocket disconnected`)
    const sessionData = sessions.get(sessionKey)
    if (sessionData) {
      sessionData.clients.delete(ws)

      // If no more clients, clean up after 30 seconds
      if (sessionData.clients.size === 0) {
        setTimeout(() => {
          if (sessions.get(sessionKey)?.clients.size === 0) {
            console.log(`[${AGENT_ID}] No clients for 30s, cleaning up session: ${sessionKey}`)
            sessionData.pty.kill()
            sessions.delete(sessionKey)
          }
        }, 30000)
      }
    }
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[${AGENT_ID}] Agent server listening on port ${PORT}`)
  console.log(`[${AGENT_ID}] Session: ${SESSION_NAME}`)
  console.log(`[${AGENT_ID}] Health: http://0.0.0.0:${PORT}/health`)
  console.log(`[${AGENT_ID}] WebSocket: ws://0.0.0.0:${PORT}/term`)
})
```

### 2. ECS Task Definition

**AWS ECS Task (JSON):**

```json
{
  "family": "aimaestro-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "agent-container",
      "image": "aimaestro/agent:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 23000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "AGENT_ID",
          "value": "fluidmind-agents-backend"
        },
        {
          "name": "TMUX_SESSION_NAME",
          "value": "backend-agent"
        },
        {
          "name": "AGENT_PORT",
          "value": "23000"
        }
      ],
      "secrets": [
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:anthropic-api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/aimaestro-agents",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "agent"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:23000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### 3. AWS Load Balancer Configuration

**Application Load Balancer (ALB):**

```
ALB: aimaestro-agents-alb.us-east-1.elb.amazonaws.com
├── Listener: HTTPS (443)
│   ├── Certificate: *.aimaestro.com (ACM)
│   └── Rules:
│       ├── Host: agent-1.aimaestro.com → Target Group 1 (Task 1, port 23000)
│       ├── Host: agent-2.aimaestro.com → Target Group 2 (Task 2, port 23000)
│       └── Host: agent-3.aimaestro.com → Target Group 3 (Task 3, port 23000)
└── Target Groups:
    ├── TG-agent-1: ECS Task 1 (container port 23000)
    ├── TG-agent-2: ECS Task 2 (container port 23000)
    └── TG-agent-3: ECS Task 3 (container port 23000)
```

**DNS Configuration (Route 53):**

```
aimaestro.com (hosted zone)
├── agent-1.aimaestro.com → CNAME → aimaestro-agents-alb.us-east-1.elb.amazonaws.com
├── agent-2.aimaestro.com → CNAME → aimaestro-agents-alb.us-east-1.elb.amazonaws.com
└── agent-3.aimaestro.com → CNAME → aimaestro-agents-alb.us-east-1.elb.amazonaws.com
```

**How ALB Routes Connections:**

1. Browser connects: `wss://agent-1.aimaestro.com`
2. DNS resolves to ALB IP
3. ALB receives connection on port 443 (HTTPS/WSS)
4. ALB checks `Host` header: `agent-1.aimaestro.com`
5. ALB routes to Target Group 1 (ECS Task 1)
6. Connection forwarded to container port 23000
7. WebSocket upgrade completes
8. Browser ↔ Container WebSocket established

### 4. Browser Connection (AI Maestro Dashboard)

**Update WebSocket Connection Logic:**

```typescript
// hooks/useWebSocket.ts

interface AgentConnection {
  type: 'local' | 'cloud'

  // For local agents
  url?: string  // ws://localhost:23000/term?name=session

  // For cloud agents
  cloudUrl?: string  // wss://agent-1.aimaestro.com/term
  agentId?: string
  region?: string
}

export function useWebSocket(agent: AgentConnection) {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    let websocket: WebSocket

    if (agent.type === 'local') {
      // Connect to local server.mjs
      websocket = new WebSocket(agent.url)
    } else {
      // Connect directly to cloud agent
      websocket = new WebSocket(agent.cloudUrl)
    }

    websocket.onopen = () => {
      console.log(`Connected to ${agent.type} agent`)
      setStatus('connected')
    }

    websocket.onmessage = (event) => {
      // Terminal output from agent
      if (terminalRef.current) {
        terminalRef.current.write(event.data)
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
      setStatus('disconnected')
    }

    websocket.onclose = () => {
      console.log('WebSocket closed')
      setStatus('disconnected')
      // Implement reconnection logic
    }

    setWs(websocket)

    return () => {
      websocket.close()
    }
  }, [agent])

  const sendInput = (data: string) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  return { ws, status, sendInput }
}
```

**Agent Registry Update:**

```typescript
// types/agent.ts

interface Agent {
  id: string
  alias: string
  displayName: string

  deployment: {
    type: 'local' | 'cloud'

    // For local agents
    local?: {
      tmuxSessionName: string
    }

    // For cloud agents
    cloud?: {
      provider: 'aws'
      region: string
      websocketUrl: string  // wss://agent-1.aimaestro.com/term
      healthCheckUrl: string  // https://agent-1.aimaestro.com/health
      ecsTaskArn: string
      ecsCluster: string
      containerName: string
    }
  }
}
```

---

## Comparison: WebSocket-First vs SSH-First

| Aspect | WebSocket-First (Your Idea) | SSH-First (My Original) |
|--------|------------------------------|-------------------------|
| **Connection Model** | Browser → Cloud (direct) | Browser → Local → Cloud |
| **Exposed Ports** | Yes (23000+ per agent) | No (SSH only, port 22) |
| **Load Balancer** | Required (ALB) | Not required |
| **SSL/TLS** | Yes (WSS via ALB) | SSH encryption |
| **Local server.mjs** | Not needed | Required |
| **Container Complexity** | Higher (runs WebSocket server) | Lower (pure terminal) |
| **Networking** | Public internet exposure | Private (SSH tunnel) |
| **Scalability** | Excellent (ALB auto-scales) | Limited (SSH connections) |
| **Cost** | Higher (ALB ~$16/month + data) | Lower (no ALB, just EC2) |
| **Latency** | Lower (direct connection) | Higher (SSH overhead) |
| **Security Model** | ALB + WSS + auth tokens | SSH keys + OS-level auth |
| **Multi-Region** | Excellent (ALB per region) | Complex (SSH to each) |

---

## Cost Analysis: WebSocket-First Architecture

### AWS Resources Required

**Per Agent:**
```
ECS Fargate Task (1 vCPU, 2GB RAM):
- $0.04048/hour = $29/month

Or EC2 (shared across 4 agents):
- t3.large: $60/month ÷ 4 agents = $15/agent

Application Load Balancer:
- $16/month (shared across all agents)
- LCU charges: ~$5/month (low traffic)

Data Transfer:
- First 1GB/month: Free
- Next 10GB: $0.90/month per agent

Route 53 (DNS):
- Hosted zone: $0.50/month
- Queries: ~$0.40/month (1M queries)

Total per agent (ECS Fargate):
- $29 (compute) + $0.90 (data) = ~$30/month

Total per agent (EC2 shared):
- $15 (compute) + $0.90 (data) = ~$16/month

Shared costs (all agents):
- ALB: $21/month
- Route 53: $0.90/month
```

**10 Agents on EC2 (Shared):**
```
EC2 Instances (3x t3.large): $180/month
ALB: $21/month
Route 53: $1/month
Data Transfer: $9/month
Total: $211/month (~$21/agent)
```

### Cost Comparison

| Architecture | 10 Agents Cost/Month | Notes |
|--------------|---------------------|-------|
| **WebSocket-First (ECS Fargate)** | $300 | Most expensive, easiest to manage |
| **WebSocket-First (EC2 Shared)** | $211 | Good balance |
| **SSH-First (EC2)** | $180 | Cheapest, no ALB |

---

## Security Considerations

### WebSocket-First Security

**Threat Model:**
1. ⚠️ **Exposed WebSocket endpoints** (public internet)
2. ⚠️ **Multiple attack surfaces** (ALB, containers, WebSocket)
3. ⚠️ **DDoS potential** (open WebSocket ports)

**Mitigations:**

```typescript
// 1. Authentication Token (JWT)
// Browser sends token on WebSocket connect
ws.send(JSON.stringify({
  type: 'auth',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
}))

// 2. Agent server validates token
if (!validateJWT(token, SECRET_KEY)) {
  ws.close(1008, 'Unauthorized')
  return
}

// 3. IP Whitelisting (AWS Security Group)
// Only allow connections from dashboard IP
SecurityGroup:
  Ingress:
    - Port 23000
      Source: <dashboard-public-ip>/32

// 4. Rate Limiting (at ALB or application level)
// Prevent abuse
const rateLimiter = new RateLimiter({
  tokensPerInterval: 100,
  interval: 'minute'
})

// 5. WAF (Web Application Firewall)
// Protect ALB from common attacks
AWS WAF:
  - SQL injection protection
  - XSS protection
  - Rate limiting per IP
```

### SSH-First Security

**Threat Model:**
1. ✅ **No exposed WebSocket** (SSH tunnel only)
2. ✅ **Single attack surface** (SSH on port 22)
3. ✅ **Standard hardening** (SSH is well-understood)

**Mitigations:**
```bash
# Standard SSH hardening
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers aimaestro
```

---

## Recommendation

### Use WebSocket-First If:

1. ✅ You want **lowest latency** (direct browser → cloud)
2. ✅ You plan to **scale to 50+ agents** (ALB handles this well)
3. ✅ You want **simpler client code** (no local server.mjs)
4. ✅ Budget allows **~$21/agent** ($16 shared EC2 + $5 overhead)
5. ✅ You're comfortable with **public-facing WebSocket** (with auth)

### Use SSH-First If:

1. ✅ You want **lowest cost** (~$15/agent, no ALB)
2. ✅ You prioritize **security** (no public WebSocket exposure)
3. ✅ You have **fewer agents** (<20, SSH scales fine)
4. ✅ You want **simpler containers** (pure terminal, no WebSocket server)
5. ✅ You're okay with **local server.mjs** running on dashboard machine

---

## Hybrid Approach (Best of Both?)

**Consideration:** Could we support **both** architectures?

```typescript
// Agent registry supports both
interface Agent {
  deployment: {
    type: 'local' | 'cloud-ssh' | 'cloud-websocket'

    local?: { tmuxSessionName: string }

    cloudSsh?: {
      host: string
      containerName: string
      // Connect via: ssh → docker exec → tmux
    }

    cloudWebSocket?: {
      url: string  // wss://agent.aimaestro.com
      // Connect directly
    }
  }
}

// Connection logic handles all three
function connectToAgent(agent: Agent) {
  switch (agent.deployment.type) {
    case 'local':
      return connectLocal(agent)
    case 'cloud-ssh':
      return connectViaSsh(agent)
    case 'cloud-websocket':
      return connectViaWebSocket(agent)
  }
}
```

**Benefits:**
- Start with SSH (cheaper, simpler)
- Add WebSocket later (scale, performance)
- Support both simultaneously

---

## Next Steps

### If You Choose WebSocket-First:

1. Build `agent-server.js` (simplified server.mjs for containers)
2. Create Dockerfile with WebSocket server
3. Test locally: `docker run -p 23000:23000 agent`
4. Deploy to ECS (single task as proof-of-concept)
5. Configure ALB + Route 53
6. Update AI Maestro to connect to `wss://agent.aimaestro.com`

### If You Choose SSH-First:

1. Build Dockerfile (pure terminal, no WebSocket)
2. Deploy to EC2, run container
3. Test SSH: `ssh -t user@host docker exec -it container tmux attach`
4. Update server.mjs to spawn SSH instead of tmux
5. Test dashboard connection

### If You Choose Hybrid:

1. Start with SSH (cheaper, simpler)
2. Add WebSocket support to agent containers
3. Update dashboard to support both connection types
4. Migrate agents one-by-one from SSH to WebSocket

---

## My Recommendation

**Start with SSH-First**, then **add WebSocket capability later** as you scale.

**Why?**
1. **Lower initial cost** (~$15/agent vs ~$21/agent)
2. **Simpler containers** (no WebSocket server to debug)
3. **Better security** (no public exposure initially)
4. **Faster to MVP** (reuse existing server.mjs logic)
5. **Easy to add WebSocket later** (containerize server.mjs, expose port)

**Migration Path:**
```
Phase 1: SSH-First (MVP)
- 5-10 agents on EC2
- SSH tunneling from dashboard
- Cost: ~$80-150/month

Phase 2: Add WebSocket Support
- Containerize server.mjs → agent-server.js
- Add ALB for new agents
- Keep SSH agents running (backward compatible)
- Cost: ~$150-250/month (mixed mode)

Phase 3: Full WebSocket
- Migrate all agents to WebSocket
- Decommission local server.mjs
- Scale to 50+ agents
- Cost: ~$1000+/month (at scale)
```

**Your Call:** Which architecture aligns better with your vision and timeline?
