# Distributed Agent Architecture: Docker + tmux on AWS

**Architecture Pattern:** AgentBox-style containers on AWS instances with tmux remote attachment
**Date:** January 2025
**Status:** Design proposal based on research

---

## Executive Summary

Your vision is to run **AgentBox-style Docker containers on AWS EC2 instances**, with each container running a tmux session that hosts Claude Code CLI. AI Maestro dashboard connects remotely to these containerized tmux sessions, providing the same terminal experience as local agents but with cloud execution.

**Key Insight:** This combines the best of both worlds:
- ✅ AgentBox's **container isolation & safety** (per-agent Docker containers)
- ✅ AI Maestro's **tmux-based monitoring** (attach/detach to sessions)
- ✅ **Cloud distribution** (agents run on AWS, not local machine)
- ✅ **Existing codebase compatibility** (minimal changes to WebSocket/PTY layer)

---

## Architecture Overview

### Current AI Maestro (Local Only)
```
Browser Dashboard
    ↓ WebSocket (ws://localhost:23000/term?name=session)
server.mjs (node-pty)
    ↓ spawn('tmux', ['attach-session', '-t', sessionName])
Local tmux session
    ↓
Claude Code CLI
```

### Proposed Distributed Architecture
```
Browser Dashboard (Local Machine)
    ↓ WebSocket over SSH tunnel
server.mjs (Local Machine)
    ↓ SSH connection
AWS EC2 Instance
    ↓ docker exec -it
Docker Container (agentbox-style)
    ↓ tmux attach-session
tmux session (inside container)
    ↓
Claude Code CLI (inside container)
```

---

## Technical Implementation

### 1. AWS Instance Setup

**What Gets Deployed:**
```
EC2 Instance (e.g., t3.medium in us-east-1)
├── Docker Engine
├── SSH Server (for remote access)
└── Multiple Agent Containers
    ├── Container: fluidmind-agents-backend
    │   ├── tmux session: "backend-agent"
    │   ├── Claude Code CLI
    │   └── Project workspace (mounted volume)
    ├── Container: fluidmind-agents-frontend
    │   ├── tmux session: "frontend-agent"
    │   ├── Claude Code CLI
    │   └── Project workspace (mounted volume)
    └── Container: 23blocks-IaC-terraform
        ├── tmux session: "terraform-agent"
        ├── Claude Code CLI
        └── Project workspace (mounted volume)
```

**Instance Configuration:**
```bash
# Cloud-init script (runs on first boot)
#!/bin/bash

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install tmux in base system (optional, for debugging)
apt-get update && apt-get install -y tmux

# Pull AI Maestro agent image (based on agentbox Dockerfile)
docker pull aimaestro/agent:latest

# Configure SSH for AI Maestro connections
cat >> /etc/ssh/sshd_config <<EOF
# AI Maestro remote agent access
AllowUsers aimaestro
ClientAliveInterval 30
ClientAliveCountMax 3
EOF

systemctl restart sshd

# Setup credential vault directory
mkdir -p /opt/aimaestro/credentials
chmod 700 /opt/aimaestro/credentials
```

### 2. Agent Container Design (AgentBox-Inspired)

**Dockerfile: `aimaestro-agent`**
```dockerfile
FROM debian:bookworm-slim

# Install base dependencies (similar to agentbox)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    tmux \
    zsh \
    ssh \
    nodejs \
    npm \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Create non-root user
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} claude && \
    useradd -m -u ${USER_ID} -g claude -s /bin/zsh claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Configure tmux
RUN echo "set -g mouse on" >> /home/claude/.tmux.conf && \
    echo "set -g history-limit 50000" >> /home/claude/.tmux.conf

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER claude

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Start tmux server and keep container running
ENTRYPOINT ["/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]
```

**Entrypoint Script:**
```bash
#!/bin/bash
# entrypoint.sh

# Start tmux server (detached)
tmux new-session -d -s "${AGENT_SESSION_NAME:-agent-session}" -c /workspace

# Initialize environment in tmux session
tmux send-keys -t "${AGENT_SESSION_NAME:-agent-session}" "export PATH=\$HOME/.local/bin:\$PATH" C-m
tmux send-keys -t "${AGENT_SESSION_NAME:-agent-session}" "clear" C-m

# Start Claude Code CLI in the tmux session
tmux send-keys -t "${AGENT_SESSION_NAME:-agent-session}" "claude" C-m

# Keep container running
exec "$@"
```

**Container Launch Command:**
```bash
# On AWS EC2 instance
docker run -d \
  --name fluidmind-agents-backend \
  --hostname backend-agent \
  -e AGENT_SESSION_NAME=backend-agent \
  -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  --cpus="2" \
  --memory="4g" \
  -v /opt/aimaestro/agents/backend/workspace:/workspace \
  -v /opt/aimaestro/agents/backend/cache:/home/claude/.cache \
  -v /opt/aimaestro/credentials/claude:/home/claude/.claude:ro \
  -v /opt/aimaestro/credentials/ssh:/home/claude/.ssh:ro \
  aimaestro/agent:latest
```

### 3. Remote Connection Methods

**Method 1: SSH + Docker Exec (Recommended)**

This is the most straightforward approach and requires minimal changes to AI Maestro.

```typescript
// server.mjs modification for remote agents

interface RemoteAgentConfig {
  host: string          // EC2 instance IP or hostname
  port: number          // SSH port (default 22)
  username: string      // SSH user (e.g., 'aimaestro')
  privateKeyPath: string // Path to SSH private key
  containerName: string  // Docker container name
  sessionName: string    // tmux session name inside container
}

async function attachToRemoteAgent(config: RemoteAgentConfig) {
  // SSH connection string
  const sshConnection = `${config.username}@${config.host}`

  // Command to execute on remote host
  const remoteCommand = `docker exec -it ${config.containerName} tmux attach-session -t ${config.sessionName}`

  // Spawn SSH with docker exec
  const ptyProcess = spawn('ssh', [
    '-p', config.port.toString(),
    '-i', config.privateKeyPath,
    '-t', // Force TTY allocation
    '-o', 'StrictHostKeyChecking=accept-new',
    sshConnection,
    remoteCommand
  ], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env
  })

  return ptyProcess
}
```

**Connection Flow:**
```
AI Maestro server.mjs
    ↓ SSH connection (authenticated with private key)
EC2 Instance (SSH server)
    ↓ docker exec -it container_name tmux attach-session -t session_name
Docker Container
    ↓ tmux attach
tmux session with Claude Code CLI
```

**Method 2: Expose tmux Socket via Docker Volume**

Alternative approach: Share tmux socket outside container.

```bash
# Run container with tmux socket exposed
docker run -d \
  --name fluidmind-agents-backend \
  -v /opt/aimaestro/tmux-sockets:/tmp/tmux-sockets \
  aimaestro/agent:latest

# Inside container entrypoint: start tmux with custom socket
tmux -S /tmp/tmux-sockets/backend-agent new-session -d -s backend-agent

# From host (EC2 instance), attach via socket
tmux -S /tmp/aimaestro/tmux-sockets/backend-agent attach-session -t backend-agent
```

**Connection Flow:**
```
AI Maestro server.mjs
    ↓ SSH connection
EC2 Instance
    ↓ tmux -S /path/to/socket attach-session
tmux socket (shared from container via volume)
    ↓
tmux session inside container
    ↓
Claude Code CLI
```

**Trade-offs:**

| Method | Pros | Cons |
|--------|------|------|
| **SSH + docker exec** | Simple, secure, standard | Extra layer (SSH → docker exec → tmux) |
| **Exposed tmux socket** | Direct tmux access | Security risk (socket exposed on host) |

**Recommendation:** Use **SSH + docker exec** for security and simplicity.

### 4. AI Maestro Code Changes

**Update Agent Registry Schema:**
```typescript
// types/agent.ts

interface Agent {
  id: string
  alias: string
  displayName: string

  // ... existing fields ...

  deployment: {
    type: 'local' | 'cloud'

    // For cloud agents
    cloud?: {
      provider: 'aws' | 'gcp' | 'digitalocean' | 'azure'
      region: string
      instanceId: string        // EC2 instance ID
      instanceIp: string         // Public IP for SSH
      containerName: string      // Docker container name
      sshUser: string            // SSH username (default: 'aimaestro')
      sshPort: number            // SSH port (default: 22)
      privateKeyPath: string     // Path to SSH private key
    }
  }

  tools: {
    session: {
      tmuxSessionName: string    // tmux session name (inside container)
      status: 'active' | 'idle' | 'disconnected'
    }
  }
}
```

**Update server.mjs PTY Spawning:**
```typescript
// server.mjs

function createPTYProcess(agent: Agent, cols: number, rows: number) {
  if (agent.deployment.type === 'local') {
    // Existing local logic
    return spawn('tmux', ['attach-session', '-t', agent.tools.session.tmuxSessionName], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME,
      env: process.env
    })
  } else {
    // Remote cloud agent
    const cloud = agent.deployment.cloud!
    const sshConnection = `${cloud.sshUser}@${cloud.instanceIp}`
    const remoteCommand = `docker exec -it ${cloud.containerName} tmux attach-session -t ${agent.tools.session.tmuxSessionName}`

    return spawn('ssh', [
      '-p', cloud.sshPort.toString(),
      '-i', cloud.privateKeyPath,
      '-t',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      sshConnection,
      remoteCommand
    ], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME,
      env: process.env
    })
  }
}
```

**Update Session Discovery:**
```typescript
// app/api/sessions/route.ts

export async function GET() {
  const sessions = []

  // 1. Discover local tmux sessions (existing logic)
  const { stdout: localStdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')
  // ... parse local sessions ...

  // 2. Discover remote cloud agents
  const agents = await listAgents()
  for (const agent of agents) {
    if (agent.deployment.type === 'cloud' && agent.deployment.cloud) {
      const cloud = agent.deployment.cloud

      // SSH to instance and check container/tmux status
      const checkCommand = `docker exec ${cloud.containerName} tmux has-session -t ${agent.tools.session.tmuxSessionName} 2>/dev/null && echo "exists" || echo "not-found"`

      try {
        const { stdout } = await execAsync(
          `ssh -i ${cloud.privateKeyPath} -p ${cloud.sshPort} ${cloud.sshUser}@${cloud.instanceIp} "${checkCommand}"`
        )

        if (stdout.trim() === 'exists') {
          sessions.push({
            id: agent.id,
            name: agent.tools.session.tmuxSessionName,
            location: 'remote',
            region: cloud.region,
            instanceId: cloud.instanceId,
            status: agent.tools.session.status
          })
        }
      } catch (error) {
        console.error(`Failed to check remote agent ${agent.id}:`, error)
      }
    }
  }

  return NextResponse.json({ sessions })
}
```

---

## Implementation Phases

### Phase 1: Local Containerization (Proof of Concept)

**Goal:** Replace local tmux sessions with Docker containers.

**Steps:**
1. ✅ Create `aimaestro-agent` Dockerfile
2. ✅ Test local Docker container with tmux + Claude Code
3. ✅ Modify server.mjs to use `docker exec` instead of direct `tmux attach`
4. ✅ Verify WebSocket connection works through Docker layer
5. ✅ Test terminal resizing, scrollback, input/output

**Success Criteria:**
- Dashboard connects to containerized agent same as tmux session
- Terminal performance acceptable (no noticeable latency)
- Container restart doesn't lose agent state (workspace persists)

**Estimated Time:** 1-2 days

### Phase 2: Single Remote Agent (AWS Proof of Concept)

**Goal:** Deploy one agent to AWS and connect remotely.

**Steps:**
1. ✅ Launch EC2 instance (t3.medium, us-east-1)
2. ✅ Run cloud-init script (install Docker, configure SSH)
3. ✅ Deploy agent container on EC2
4. ✅ Test SSH connection: `ssh -t user@instance docker exec -it container tmux attach`
5. ✅ Modify server.mjs to support remote agents
6. ✅ Update agent registry with cloud metadata
7. ✅ Test dashboard connection to remote agent

**Success Criteria:**
- Dashboard shows remote agent in session list
- Terminal connects and works identically to local agents
- Latency acceptable (<100ms for us-east-1)
- Agent survives container/instance restarts

**Estimated Time:** 2-3 days

### Phase 3: Multi-Region Distribution

**Goal:** Deploy agents across multiple AWS regions.

**Steps:**
1. ✅ Create instance provisioning module (Terraform/AWS SDK)
2. ✅ Support multiple regions (us-east-1, eu-west-1, ap-southeast-1)
3. ✅ Implement agent placement policies (user-selected region)
4. ✅ Add region indicator in dashboard UI
5. ✅ Test cross-region latency and performance
6. ✅ Implement agent migration (move agent to different region)

**Success Criteria:**
- Agents running in 3+ AWS regions simultaneously
- Dashboard shows all agents regardless of region
- Latency remains acceptable (region-dependent)
- Cost tracking per region works

**Estimated Time:** 3-5 days

### Phase 4: Production Hardening

**Goal:** Make distributed agents production-ready.

**Steps:**
1. ✅ Implement credential vault (encrypted storage + distribution)
2. ✅ Add container health monitoring (restart on crash)
3. ✅ Implement agent auto-scaling (spin up/down based on load)
4. ✅ Add resource limits enforcement (CPU, memory, cost quotas)
5. ✅ Implement backup/disaster recovery (workspace snapshots)
6. ✅ Add audit logging (who accessed which agent when)
7. ✅ Set up monitoring dashboards (Prometheus + Grafana)

**Success Criteria:**
- Agents automatically restart on failure
- Resource limits enforced (no runaway costs)
- All credentials encrypted and securely distributed
- Full audit trail of agent activities

**Estimated Time:** 1-2 weeks

---

## Technical Considerations

### 1. SSH Key Management

**Challenge:** Each remote agent requires SSH authentication.

**Solution:**
```bash
# Generate dedicated SSH key for AI Maestro
ssh-keygen -t ed25519 -f ~/.aimaestro/ssh/id_ed25519 -C "aimaestro-dashboard"

# Distribute public key to EC2 instances via cloud-init
# cloud-init.yaml:
users:
  - name: aimaestro
    ssh_authorized_keys:
      - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... aimaestro-dashboard
```

**Agent Registry Storage:**
```json
{
  "deployment": {
    "type": "cloud",
    "cloud": {
      "privateKeyPath": "/Users/user/.aimaestro/ssh/id_ed25519"
    }
  }
}
```

### 2. Network Latency

**Challenge:** Remote connections add network latency.

**Expected Latency:**
- **Local:** <1ms (no network)
- **Same region (us-east-1):** 20-50ms
- **Cross-country (us-east-1 ↔ us-west-2):** 60-80ms
- **Cross-continent (us-east-1 ↔ eu-west-1):** 80-120ms

**Mitigation:**
- Use SSH multiplexing (reuse connections)
- Enable SSH compression for slow connections
- Deploy agents in regions close to users/data

**SSH Multiplexing Config:**
```bash
# ~/.ssh/config
Host ec2-*.amazonaws.com
  ControlMaster auto
  ControlPath ~/.ssh/sockets/%r@%h-%p
  ControlPersist 10m
  Compression yes
  ServerAliveInterval 30
```

### 3. Connection Resilience

**Challenge:** Network interruptions break WebSocket connections.

**Solution: Reconnection Logic (Already Exists in AI Maestro)**
```typescript
// hooks/useWebSocket.ts (existing)
const reconnect = {
  maxAttempts: 5,
  backoff: [100, 500, 1000, 2000, 5000]
}
```

**Additional: SSH Auto-Reconnect**
```bash
# SSH with auto-reconnect wrapper
while true; do
  ssh -t -o "ServerAliveInterval=30" user@host docker exec -it container tmux attach
  echo "Connection lost, reconnecting in 5 seconds..."
  sleep 5
done
```

### 4. Container Persistence

**Challenge:** Container restarts lose tmux sessions.

**Solution: Named Volumes for tmux State**
```bash
docker run -d \
  --name agent \
  -v agent-workspace:/workspace \
  -v agent-tmux:/tmp/tmux \  # tmux socket directory
  --restart unless-stopped \  # Auto-restart on crash
  aimaestro/agent:latest
```

**Entrypoint Logic:**
```bash
#!/bin/bash
# Check if tmux session already exists
if tmux -S /tmp/tmux/default has-session -t agent-session 2>/dev/null; then
  echo "Reattaching to existing tmux session"
else
  echo "Creating new tmux session"
  tmux -S /tmp/tmux/default new-session -d -s agent-session
  tmux -S /tmp/tmux/default send-keys -t agent-session "claude" C-m
fi

# Keep container running
tail -f /dev/null
```

### 5. Cost Management

**Challenge:** Running agents 24/7 on AWS costs money.

**Estimated Costs (us-east-1):**
```
Instance Type: t3.medium (2 vCPU, 4GB RAM)
- On-Demand: $0.0416/hour = $30/month
- Spot Instance: ~$0.012/hour = $8.64/month (70% savings)

Storage (100GB EBS gp3):
- $8/month

Data Transfer (10GB/month):
- $0.90/month

Total per agent:
- On-Demand: ~$39/month
- Spot Instance: ~$18/month
```

**Cost Optimization:**
1. Use Spot Instances (70% cheaper, occasional interruptions)
2. Auto-stop idle agents (no activity for 1+ hours)
3. Share instances (multiple agent containers per instance)
4. Use smaller instances (t3.small for light workloads)

---

## Security Considerations

### 1. Container Isolation

**What AgentBox Does Well:**
- Each agent in separate container
- Resource limits (CPU, memory)
- Restricted filesystem access

**AI Maestro Additions:**
- Network isolation (agents can't communicate directly)
- Credential rotation (API keys expire after 30 days)
- Audit logging (all agent actions logged)

### 2. SSH Security

**Best Practices:**
```
✅ Use dedicated SSH keys (not personal keys)
✅ Disable password authentication
✅ Use SSH certificates (rotate every 90 days)
✅ Restrict SSH to AI Maestro dashboard IP
✅ Enable SSH audit logging
```

**EC2 Security Group:**
```
Inbound Rules:
- Port 22 (SSH): Only from dashboard IP
- Port 443 (HTTPS): For agent API access (optional)

Outbound Rules:
- Allow all (agents need internet for Claude API)
```

### 3. Credential Distribution

**Secure Pattern:**
```
~/.aimaestro/credentials/ (encrypted at rest)
    ↓ Encrypted transfer (SSH)
EC2 Instance
    ↓ Mounted as read-only volume
Docker Container
    ↓ Environment variables (not persisted)
Claude Code CLI (uses credentials)
```

**Never:**
- ❌ Store credentials in container images
- ❌ Commit credentials to Git
- ❌ Share credentials across agents (unless explicitly authorized)

---

## Advantages of This Architecture

### 1. Best of Both Worlds

| Feature | AgentBox | AI Maestro | This Design |
|---------|----------|------------|-------------|
| **Container Isolation** | ✅ Yes | ❌ No (tmux only) | ✅ Yes |
| **Remote Execution** | ❌ No | ⚠️ Planned | ✅ Yes |
| **Web Dashboard** | ❌ CLI only | ✅ Yes | ✅ Yes |
| **tmux Monitoring** | ✅ Yes (local) | ✅ Yes (local) | ✅ Yes (remote) |
| **Multi-Region** | ❌ No | ⚠️ Planned | ✅ Yes |

### 2. Minimal Code Changes

**Reuse Existing AI Maestro Components:**
- ✅ WebSocket/PTY bridge (just change spawn command)
- ✅ Terminal rendering (xterm.js unchanged)
- ✅ Session discovery (add SSH check)
- ✅ Agent registry (add cloud metadata)
- ✅ Message system (works across local/remote)

**Estimated Changes:** ~500 lines of code (10% of codebase)

### 3. Backward Compatibility

**Support Both Modes:**
```typescript
if (agent.deployment.type === 'local') {
  // Original logic: tmux attach
  ptyProcess = spawn('tmux', ['attach-session', '-t', sessionName])
} else {
  // New logic: SSH + docker exec + tmux attach
  ptyProcess = spawn('ssh', [/* ... */])
}
```

**Migration Path:**
1. Phase 1: All agents local (existing behavior)
2. Phase 2: Mix of local + remote agents
3. Phase 3: Optionally move all agents to cloud

---

## Open Questions

### 1. Instance Sharing

**Question:** Should multiple agent containers share one EC2 instance, or one instance per agent?

**Trade-offs:**

| Pattern | Pros | Cons |
|---------|------|------|
| **Shared Instance** | Cost-effective, resource pooling | Noisy neighbor issues, complex orchestration |
| **Dedicated Instance** | Full isolation, simple management | Higher cost, potential underutilization |

**Recommendation:** Start with **shared instances** (2-4 agents per t3.medium), add dedicated instances for high-resource agents later.

### 2. Instance Provisioning

**Question:** Who provisions EC2 instances - user or AI Maestro?

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| **Manual (user provisions)** | Simple, no AWS credentials needed | Less automated, friction for users |
| **Automatic (AI Maestro provisions)** | Seamless UX, one-click deployment | Requires AWS credentials, complex setup |

**Recommendation:** Phase 2 = manual, Phase 3+ = automatic with user-provided AWS credentials.

### 3. Container Image Distribution

**Question:** How do agent containers get the `aimaestro-agent` image?

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| **Docker Hub (public)** | Easy, standard, fast pulls | Exposes our Dockerfile publicly |
| **ECR (private)** | Secure, controlled access | Requires AWS credentials, slower setup |
| **Build on instance** | No registry needed | Slower deployments, inconsistent images |

**Recommendation:** Start with **Docker Hub (public)**, move to **ECR** if we add proprietary features.

---

## Next Steps

### Immediate Actions (Week 1)

1. **Prototype local Docker + tmux:**
   ```bash
   # Build image
   docker build -t aimaestro-agent .

   # Run container
   docker run -d --name test-agent \
     -e AGENT_SESSION_NAME=test \
     -v $(pwd):/workspace \
     aimaestro-agent:latest

   # Attach to tmux inside container
   docker exec -it test-agent tmux attach-session -t test
   ```

2. **Test node-pty through Docker:**
   ```typescript
   // Test in isolation
   const pty = spawn('docker', ['exec', '-it', 'test-agent', 'tmux', 'attach-session', '-t', 'test'], {
     name: 'xterm-256color',
     cols: 80,
     rows: 24
   })

   pty.onData((data) => console.log('Output:', data))
   pty.write('echo "Hello from Docker tmux"\n')
   ```

3. **Measure performance:**
   - Latency: local tmux vs docker exec tmux
   - Memory: container overhead vs bare tmux
   - CPU: any performance degradation?

### Next Actions (Week 2)

4. **Deploy to AWS:**
   - Launch test EC2 instance
   - Run agent container
   - Test SSH + docker exec connection from local machine

5. **Update AI Maestro:**
   - Add cloud metadata to agent registry
   - Modify server.mjs PTY spawning
   - Test dashboard connection to remote agent

6. **Validate architecture:**
   - Confirm latency acceptable (<100ms)
   - Verify container restarts don't break sessions
   - Test multiple simultaneous connections

---

## Conclusion

**Your architecture vision is sound and practical.** Using AgentBox-style Docker containers on AWS instances with remote tmux attachment provides:

1. ✅ **Safety:** Container isolation for each agent
2. ✅ **Flexibility:** Run agents anywhere (local or cloud)
3. ✅ **Simplicity:** Minimal changes to existing AI Maestro code
4. ✅ **Scalability:** Easily add more agents across regions
5. ✅ **Familiarity:** Same tmux-based monitoring as local agents

**This is a better approach than my original proposal** because it:
- Preserves the tmux monitoring paradigm (no need to learn new tools)
- Requires minimal code changes (~500 lines vs. 2000+)
- Works with existing WebSocket/PTY infrastructure
- Adds cloud distribution without sacrificing local development

**Ready to prototype?** Let's start with Phase 1 (local containerization) to validate the architecture before deploying to AWS.

---

**Document Status:** Design proposal ready for implementation
**Next Action:** Build `aimaestro-agent` Dockerfile and test local container + tmux
