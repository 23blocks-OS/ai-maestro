# AgentBox Research & Comparison Analysis

**Research Date:** January 2025
**Repository:** https://github.com/fletchgqc/agentbox
**Purpose:** Evaluate agentbox architecture for distributed AWS agent execution vision

---

## Executive Summary

AgentBox is a **Docker-based isolation wrapper** for Claude Code CLI focused on safe YOLO mode (`--dangerously-skip-permissions`) execution through containerization. While it provides excellent patterns for **per-project isolation** and **sandboxing**, it is **fundamentally a local development tool** rather than a distributed agent orchestration system.

### Key Verdict for AI Maestro

**Good Ideas to Adopt:**
1. ✅ Container-based agent isolation (safety & reproducibility)
2. ✅ Per-project environment configuration (.mcp.json, .envrc patterns)
3. ✅ Shared authentication with isolated execution state
4. ✅ Persistent caches with ephemeral containers

**Bad Ideas / Not Applicable:**
1. ❌ Ephemeral container pattern (conflicts with long-running agent vision)
2. ❌ Single-machine Docker-only approach (doesn't scale to distributed AWS)
3. ❌ Hash-based container naming (too implementation-specific)
4. ❌ No remote execution capabilities

**Missing Pieces We Need:**
1. Cloud instance provisioning & lifecycle management
2. Remote agent registration & discovery
3. Inter-agent communication protocols (beyond localhost)
4. Resource quotas & cost management
5. Multi-region orchestration

---

## 1. AgentBox Architecture Deep Dive

### 1.1 Core Design Philosophy

**Problem Statement:** "The only way to use AI agents is with YOLO mode (`--dangerously-skip-permissions`), which is risky."

**Solution:** Containerize each project so Claude Code can run unrestricted within safe boundaries.

**Architecture Pattern:**
```
Host Machine
├── agentbox script (shell wrapper)
├── Single Dockerfile → agentbox:latest image
└── Multiple ephemeral containers (one per project)
    ├── Auto-removed on exit (--rm flag)
    ├── Shared: Authentication, Git config, SSH keys
    └── Isolated: Package caches, shell history, MCP data
```

### 1.2 Container Lifecycle

**Ephemeral Execution Model:**
```bash
# Container starts
docker run --rm \
  -v /host/project:/workspace \
  -v ~/.agentbox/caches/project-hash:/home/claude/.cache \
  agentbox:latest

# User works in containerized Claude CLI

# Container exits → Automatic cleanup
# Caches persist, container disappears
```

**Persistence Strategy:**
- **Ephemeral:** Container filesystem, running processes
- **Persistent:**
  - Host filesystem (`/workspace` mount)
  - Package manager caches (`~/.cache/npm`, `~/.cache/pip`)
  - Shell history (`~/.zsh_history`, `~/.bash_history`)
  - Claude CLI credentials (Docker named volumes)
  - MCP server data (Docker volumes)

### 1.3 Project Isolation Mechanism

**Hash-Based Container Naming:**
```bash
project_hash=$(echo -n "$PROJECT_DIR" | sha256sum | cut -c1-12)
container_name="agentbox-${project_hash}"
```

**Benefits:**
- Deterministic container names (same project = same container name)
- Automatic per-project cache directories
- No manual container management needed

**Isolation Boundaries:**

| Resource | Sharing Strategy |
|----------|------------------|
| **Project Files** | Mounted from host (`/workspace`) |
| **npm/pip caches** | Per-project hash-based directories |
| **Shell history** | Per-project (`.zsh_history` per hash) |
| **Claude auth** | Shared via Docker volume (`.claude` directory) |
| **SSH keys** | Shared via mount (`~/.agentbox/ssh`) |
| **Git config** | Shared read-only (`~/.gitconfig`) |
| **MCP servers** | Isolated per-project (`.mcp.json` + volumes) |

### 1.4 Multi-Instance Support (PR #15)

**Problem:** Running multiple Claude CLI sessions on same project simultaneously.

**Implementation:**
```bash
# First instance
agentbox → container: agentbox-abc123

# Second instance (auto-detected)
agentbox → container: agentbox-abc123-2

# Third instance
agentbox → container: agentbox-abc123-3
```

**What's Shared Across Instances:**
- Claude authentication
- Project files (same `/workspace` mount)
- SSH keys
- Git configuration

**What's Isolated Per Instance:**
- CLI session (separate tmux/terminal)
- MCP server data directories
- Package manager lock files (npm cache conflicts)
- Shell history

**Maintainer Concerns:**
> "Is this really useful versus just using Git worktrees or duplicating the repository?"

**Risk:** Concurrent instances modifying same files → merge conflicts.

### 1.5 MCP Server Configuration (PR #11)

**Pattern:** Project-level `.mcp.json` files for version-controlled server configuration.

**Why This Matters:**
- **Team Consistency:** Everyone gets same MCP servers without manual setup
- **Container Isolation:** Docker needs independent MCP config from host
- **Reproducibility:** New team members get working environment instantly

**Implementation:**
```bash
# .mcp.json in project root
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "postgres": {
      "command": "docker",
      "args": ["exec", "-i", "postgres-container", "psql"]
    }
  }
}
```

**On Container Startup:**
1. Read project's `.mcp.json`
2. Configure Claude CLI with these servers
3. Create Docker volumes for MCP data persistence
4. Handle permission issues (UID/GID mapping)

**Known Issues (from PR discussion):**
- Claude CLI bug #9189: Approval prompts don't appear in containers
- Workaround: Pre-approve servers in entrypoint script
- Multi-instance conflicts: npm cache locks between concurrent instances

### 1.6 Environment Management (direnv PR #12)

**Problem:** Claude Code credentials in `.envrc` files not detected in containers.

**Solution:** Install direnv and configure shell hooks.

**Pattern:**
```bash
# .envrc in project root
export ANTHROPIC_API_KEY="sk-ant-..."
export DATABASE_URL="postgres://..."
export AWS_ACCESS_KEY_ID="..."

# First time
direnv allow

# Every cd into directory → auto-loads variables
```

**Security Trade-off:**
- ✅ **Pro:** Sophisticated environment management (conditionals, scripting)
- ⚠️ **Con:** `.envrc` files execute arbitrary shell code (requires `direnv allow`)

**Comparison to `.env` files:**
- `.env`: Simple key=value, loaded by Docker, safer
- `.envrc`: Executable scripts, more powerful, requires trust

---

## 2. Comparison: AgentBox vs. AI Maestro

### 2.1 Architectural Paradigms

| Aspect | AgentBox | AI Maestro |
|--------|----------|------------|
| **Core Pattern** | Ephemeral Docker containers | Persistent tmux sessions |
| **Agent Lifecycle** | Start → Work → Exit → Cleanup | Long-running, always-on |
| **Isolation** | Container boundaries (Docker) | Process boundaries (tmux) |
| **Discovery** | Manual invocation (`agentbox`) | Auto-discovery (`tmux ls`) |
| **State Persistence** | Host mounts + Docker volumes | File-based registry + localStorage |
| **Execution Model** | Local Docker daemon only | Local tmux (future: remote SSH) |
| **Scaling** | Multiple containers per machine | Multiple tmux sessions per machine |
| **Authentication** | Shared volumes, isolated exec | OS-level (localhost-only) |

### 2.2 Agent Isolation Strategies

**AgentBox Approach:**
```
Project A Container
├── Isolated: Package caches, shell history, MCP data
└── Shared: Claude auth, SSH keys, git config

Project B Container
├── Isolated: Package caches, shell history, MCP data
└── Shared: Claude auth, SSH keys, git config
```

**AI Maestro Approach:**
```
Tmux Session A (fluidmind-agents-backend)
├── No isolation (same user environment)
└── Tracked: Session metadata, messages, notes

Tmux Session B (fluidmind-apps-webapp)
├── No isolation (same user environment)
└── Tracked: Session metadata, messages, notes
```

**Key Difference:** AgentBox provides **technical isolation** (container boundaries), AI Maestro provides **organizational isolation** (session management).

### 2.3 Credential & Authentication Handling

**AgentBox:**
```bash
# Dedicated SSH directory (separate from personal keys)
~/.agentbox/ssh/
├── id_rsa
├── id_rsa.pub
└── config

# Claude credentials via Docker volume
docker volume: agentbox_claude_credentials
→ /home/claude/.claude/

# Per-project .envrc or .env
/project/.envrc  # API keys, secrets
```

**AI Maestro:**
```bash
# No credential management (relies on OS user)
~/.claude/  # Standard Claude CLI location (not managed)

# No secret storage
# No SSH key management
# No API key vault
```

**Verdict:** AgentBox has **superior credential isolation**. AI Maestro has **zero credential management**.

### 2.4 Multi-Agent/Multi-Session Handling

**AgentBox:**
- ✅ Multiple projects via separate containers
- ✅ Multi-instance support (experimental, PR #15)
- ❌ No communication between containers
- ❌ No orchestration layer
- ❌ Single-machine only

**AI Maestro:**
- ✅ Multiple tmux sessions (auto-discovered)
- ✅ Session hierarchy & organization (level1/level2/session)
- ✅ Inter-agent messaging system (file-based queues)
- ✅ Agent registry with persistent metadata
- ❌ No isolation between sessions
- ❌ Single-machine only (Phase 1)

**Verdict:** AI Maestro has **better multi-agent coordination**. AgentBox has **better per-agent isolation**.

### 2.5 Remote/Distributed Execution

**AgentBox:**
- ❌ No remote execution capabilities
- ❌ No cloud provider integration
- ❌ Docker daemon must be local
- ⚠️ Theoretically could SSH to remote Docker host, but not designed for this

**AI Maestro:**
- ✅ Type definitions for cloud deployment (AWS, GCP, Azure, DigitalOcean)
- ✅ UI toggle for Local vs. Cloud deployment
- ❌ **Not implemented** (UI disabled, no backend)
- 🎯 **Planned for Phase 2/3**

**Verdict:** Neither system supports distributed execution yet. AI Maestro has **architecture readiness** for it.

### 2.6 Terminal & Communication Layer

**AgentBox:**
```
User Terminal
    ↓
agentbox shell script
    ↓
docker exec -it agentbox-xxx /bin/zsh
    ↓
Claude Code CLI (inside container)
```

**AI Maestro:**
```
Browser (xterm.js)
    ↓ WebSocket
server.mjs (node-pty)
    ↓
tmux attach-session -t session-name
    ↓
Claude Code CLI (in tmux)
```

**Key Differences:**
- AgentBox: **CLI-based**, traditional terminal (stdin/stdout)
- AI Maestro: **Web-based**, terminal streaming via WebSocket
- AgentBox: **Interactive sessions** (user types commands)
- AI Maestro: **Monitored sessions** (dashboard watches agents work)

**Verdict:** Fundamentally different use cases. AgentBox is **developer-centric** (I work inside container). AI Maestro is **observer-centric** (I watch agents work).

---

## 3. Good Ideas from AgentBox to Adopt

### 3.1 ✅ Container-Based Agent Isolation

**What AgentBox Does Well:**
- Each agent runs in isolated container environment
- Dependency conflicts impossible (each container has own package caches)
- Safe YOLO mode (mistakes contained within container boundaries)
- Reproducible environments (Dockerfile defines exact setup)

**How AI Maestro Could Adopt:**
```
Current: Agents run directly on host OS
Future: Each agent runs in dedicated container

Benefits:
- Safety: Agent can't accidentally delete host files
- Reproducibility: Same environment every time
- Multi-tenancy: Different agents, different dependencies
- Security: Container limits (CPU, memory, network)
```

**Implementation Path:**
1. Create per-agent Docker images (or use universal image like agentbox)
2. Spawn containers for new agents instead of tmux sessions
3. WebSocket → docker exec bridge instead of tmux attach
4. Persist agent state via Docker volumes

**Trade-offs:**
- ➕ Better isolation & safety
- ➕ Reproducible environments
- ➖ More resource overhead (containers vs. processes)
- ➖ Complexity increase (Docker dependency)

### 3.2 ✅ Per-Project MCP Configuration

**What AgentBox Does Well:**
- `.mcp.json` files in version control
- Team members get consistent MCP servers automatically
- No manual configuration required
- Works in containers (isolated from host)

**How AI Maestro Could Adopt:**
```
Current: MCP servers configured globally (~/.claude/config.json)
Future: Per-agent MCP configuration

Implementation:
1. Read agent's .mcp.json on session start
2. Configure Claude CLI with agent-specific servers
3. Store MCP data in agent-specific directory
4. UI: Show which MCP servers each agent has access to
```

**Benefits:**
- Different agents access different tools/databases
- MCP configuration becomes part of project setup
- Easier onboarding (clone repo → MCP servers auto-configured)

### 3.3 ✅ Persistent Caches + Ephemeral Execution

**Pattern:**
```
Ephemeral: Container, processes, temp files
Persistent: Package caches, credentials, project files
```

**Why This Is Brilliant:**
- Fast restarts (caches survive container deletion)
- Clean slate every time (no cruft accumulation)
- Resource efficiency (old containers don't pile up)
- Stateless execution (all state is explicitly mounted)

**How AI Maestro Could Adopt:**
```
Current: Tmux sessions run forever, accumulate state
Future: Agent containers restart cleanly

Per-Agent Persistent Storage:
~/.aimaestro/agents/{agent-id}/
├── cache/           # npm, pip, etc.
├── history/         # Shell history
├── workspace/       # Project files
└── mcp-data/        # MCP server state

Ephemeral:
- Container filesystem
- Running processes
- Temp files
```

**Benefits:**
- Agents start fresh (no accumulated state bugs)
- Explicit about what persists vs. what's temporary
- Easier debugging (state is clearly separated)

### 3.4 ✅ Shared Authentication, Isolated Execution

**AgentBox Pattern:**
```
Shared across all projects:
- Claude CLI credentials (~/.claude/)
- SSH keys (~/.agentbox/ssh/)
- Git identity (~/.gitconfig)

Isolated per project:
- Package installations
- Shell history
- MCP server connections
- Environment variables (.envrc)
```

**Why This Works:**
- **DRY principle:** Don't duplicate credentials across projects
- **Security:** Single location to protect (instead of N copies)
- **Convenience:** Configure once, use everywhere
- **Isolation where it matters:** Code execution, dependencies, data

**How AI Maestro Could Adopt:**
```
Shared credential vault (per-user):
~/.aimaestro/credentials/
├── claude/          # Claude API keys
├── aws/             # AWS credentials
├── github/          # GitHub tokens
└── ssh/             # SSH keys

Per-agent execution isolation:
~/.aimaestro/agents/{agent-id}/
├── workspace/       # Agent's working directory
├── cache/           # Agent's package cache
└── env/             # Agent-specific environment variables
```

---

## 4. Bad Ideas / Not Applicable

### 4.1 ❌ Ephemeral Container Pattern

**AgentBox Approach:** Containers auto-delete on exit (`--rm` flag).

**Why This Doesn't Fit AI Maestro:**
```
AI Maestro Vision: Long-running agents
- Agents work continuously on tasks
- Agents maintain state over days/weeks
- Agents have persistent identity ("backend-architect" agent exists long-term)

AgentBox Model: Session-based work
- Start container when developer starts work
- Exit container when developer finishes
- Container lifecycle tied to human work session
```

**Fundamental Mismatch:** AgentBox is **human-session-oriented**, AI Maestro is **agent-lifecycle-oriented**.

**Better Pattern for AI Maestro:**
- Long-running containers (not `--rm`)
- Container lifecycle managed by orchestrator
- Restart on crash, persist across reboots
- Explicit stop/start/pause controls

### 4.2 ❌ Single-Machine Docker-Only Approach

**AgentBox Limitation:** All containers run on local Docker daemon.

**Why This Blocks Distributed Vision:**
```
AI Maestro Goal: Agents distributed across AWS regions
- Agent 1: us-east-1 (close to database)
- Agent 2: eu-west-1 (close to European users)
- Agent 3: Local machine (development agent)

AgentBox Model:
- All agents on same machine
- Scaling = more containers on same host
- No remote orchestration
```

**What's Needed Instead:**
- Remote Docker hosts (SSH to cloud instances)
- Kubernetes/ECS/Fargate orchestration
- Agent placement policies (region affinity, resource requirements)
- Service mesh for inter-agent communication

### 4.3 ❌ Hash-Based Container Naming

**AgentBox Pattern:**
```bash
project_hash=$(echo -n "$PROJECT_DIR" | sha256sum | cut -c1-12)
container_name="agentbox-${project_hash}"
```

**Problems for AI Maestro:**
1. **Opaque identifiers:** "agentbox-7f3a9c1b2e4d" tells you nothing
2. **No human-readable names:** Can't identify agents in `docker ps`
3. **No hierarchy:** Can't organize by project/team/purpose
4. **Collision potential:** Different projects could theoretically hash to same value

**Better Pattern for AI Maestro:**
```bash
# Human-readable, hierarchical agent names
fluidmind-agents-backend-architect
fluidmind-apps-webapp-frontend
23blocks-IaC-terraform-agent

# Container name = agent ID (already unique, meaningful)
docker run --name fluidmind-agents-backend-architect ...
```

### 4.4 ❌ No Remote Execution Framework

**AgentBox Missing:**
- No SSH connection handling
- No cloud instance provisioning
- No distributed agent registry
- No cross-region communication

**Why This Matters for AI Maestro:**
```
Required Capabilities:
1. Provision AWS EC2 instance
2. Install Docker + dependencies
3. Start agent container on remote host
4. Establish WebSocket tunnel (local dashboard ↔ remote agent)
5. Monitor agent health across network
6. Handle agent migration (move agent to different instance)
```

**AgentBox Doesn't Address:** Any of the above.

---

## 5. Missing Pieces for Distributed AWS Vision

### 5.1 Cloud Instance Lifecycle Management

**What's Needed:**
```typescript
interface CloudInstanceManager {
  // Provisioning
  createInstance(config: {
    provider: 'aws' | 'gcp' | 'digitalocean',
    region: string,
    instanceType: string,
    agentId: string
  }): Promise<Instance>

  // Lifecycle
  startInstance(instanceId: string): Promise<void>
  stopInstance(instanceId: string): Promise<void>
  terminateInstance(instanceId: string): Promise<void>

  // Monitoring
  getInstanceStatus(instanceId: string): Promise<InstanceStatus>
  getInstanceMetrics(instanceId: string): Promise<Metrics>

  // Migration
  migrateAgent(agentId: string, targetRegion: string): Promise<void>
}
```

**AgentBox Coverage:** 0% (purely local execution)

### 5.2 Remote Agent Registration & Discovery

**What's Needed:**
```typescript
interface AgentDiscovery {
  // Registration
  registerAgent(agent: {
    id: string,
    location: 'local' | 'remote',
    endpoint?: string,  // ws://instance-ip:23000
    capabilities: string[],
    region?: string
  }): Promise<void>

  // Discovery
  discoverAgents(): Promise<Agent[]>  // Local + remote
  findAgentsByRegion(region: string): Promise<Agent[]>
  findAgentsByCapability(capability: string): Promise<Agent[]>

  // Health
  checkAgentHealth(agentId: string): Promise<HealthStatus>
}
```

**AgentBox Coverage:** 0% (only local container discovery via Docker)

### 5.3 Inter-Agent Communication Protocol

**What's Needed:**
```typescript
interface InterAgentMessaging {
  // Cross-region messaging
  sendMessage(from: AgentId, to: AgentId, message: Message): Promise<void>

  // Work delegation
  delegateTask(from: AgentId, to: AgentId, task: Task): Promise<TaskResult>

  // Event streaming
  subscribeToAgent(agentId: AgentId, events: EventType[]): EventStream

  // State synchronization
  syncState(agentId: AgentId): Promise<AgentState>
}
```

**Current AI Maestro Coverage:** 20% (file-based local messaging only)
**AgentBox Coverage:** 0% (no inter-agent communication)

### 5.4 Resource Quotas & Cost Management

**What's Needed:**
```typescript
interface ResourceManager {
  // Quotas
  setAgentQuota(agentId: string, quota: {
    maxCPU: number,
    maxMemory: number,
    maxTokens: number,
    maxCost: number
  }): Promise<void>

  // Monitoring
  getAgentResourceUsage(agentId: string): Promise<ResourceUsage>
  getAgentCosts(agentId: string, period: TimePeriod): Promise<Cost>

  // Enforcement
  pauseAgentOnQuotaExceeded(agentId: string): Promise<void>
  alertOnCostThreshold(agentId: string, threshold: number): Promise<void>
}
```

**AI Maestro Coverage:** 10% (token tracking exists but not enforced)
**AgentBox Coverage:** 0% (no resource management)

### 5.5 Secure Credential Distribution

**What's Needed:**
```typescript
interface CredentialVault {
  // Storage
  storeCredential(key: string, value: string, scope: 'global' | 'agent'): Promise<void>

  // Distribution
  distributeToAgent(agentId: string, credentials: string[]): Promise<void>

  // Rotation
  rotateCredential(key: string): Promise<void>

  // Access control
  grantAccess(agentId: string, credentialKey: string): Promise<void>
  revokeAccess(agentId: string, credentialKey: string): Promise<void>
}
```

**AI Maestro Coverage:** 0% (no credential management)
**AgentBox Coverage:** 30% (mounts SSH keys, but no vault or rotation)

---

## 6. Recommended Architecture for Distributed AI Maestro

### 6.1 Hybrid Local + Cloud Model

**Pattern:**
```
AI Maestro Control Plane (your machine)
├── Web Dashboard (Next.js + WebSocket)
├── Local Agents (Docker containers)
│   ├── Agent A (container)
│   └── Agent B (container)
└── Remote Agent Manager
    ├── Provisions cloud instances
    ├── Deploys agents to cloud
    └── Maintains WebSocket tunnels

AWS Region: us-east-1
├── EC2 Instance 1
│   └── Agent C (Docker container)
└── EC2 Instance 2
    └── Agent D (Docker container)

AWS Region: eu-west-1
└── EC2 Instance 3
    └── Agent E (Docker container)
```

**Key Components:**

1. **Local Agents:** Run in Docker containers (adopting AgentBox pattern)
2. **Cloud Agents:** Run in Docker containers on EC2 instances
3. **Unified Dashboard:** Single web interface for all agents (local + remote)
4. **WebSocket Tunnels:** SSH tunnels or VPN for remote agent terminals
5. **Agent Registry:** Centralized database of all agents (local + cloud)

### 6.2 Agent Isolation Strategy

**Adopt AgentBox's Containerization:**
```bash
# Each agent = Docker container (not just tmux session)
docker run -d \
  --name fluidmind-agents-backend \
  --cpus="2" \
  --memory="4g" \
  -v ~/.aimaestro/agents/backend/workspace:/workspace \
  -v ~/.aimaestro/agents/backend/cache:/home/claude/.cache \
  -v aimaestro-credentials:/home/claude/.claude \
  aimaestro-agent:latest
```

**Benefits:**
- ✅ CPU/memory limits enforced
- ✅ Safe YOLO mode (isolated filesystem)
- ✅ Reproducible environment
- ✅ Easy migration (container image is portable)

### 6.3 Credential Management System

**Adopt AgentBox's Shared Auth + Add Vault:**
```
~/.aimaestro/credentials/  # Encrypted credential vault
├── claude/
│   └── api-key.enc
├── aws/
│   ├── access-key.enc
│   └── secret-key.enc
├── github/
│   └── token.enc
└── ssh/
    ├── id_rsa.enc
    └── id_rsa.pub

# Distribution to agents
Agent Container 1: Mount claude/ + aws/ + github/
Agent Container 2: Mount claude/ + github/ (no AWS access)
Agent Container 3: Mount claude/ only
```

**Flow:**
1. Credentials stored encrypted on control plane
2. Agent requests credentials on startup
3. Control plane distributes via Docker secrets or env vars
4. Agent uses credentials, never persists them

### 6.4 Remote Agent Deployment

**Provisioning Flow:**
```
User: "Deploy agent to AWS us-east-1"
    ↓
1. Provision EC2 instance (Terraform/CDK)
2. Install Docker + dependencies (cloud-init script)
3. Build agent container image
4. Push to ECR (Elastic Container Registry)
5. SSH to instance: docker pull + docker run
6. Establish WebSocket tunnel (SSH reverse proxy)
7. Register agent in central registry
8. Dashboard auto-discovers new agent
```

**Monitoring:**
```
Control Plane polls remote agents:
- WebSocket health check every 30s
- Resource usage metrics (CPU, memory, cost)
- Agent status (active/idle/error)
- Automatic restart on crash
```

### 6.5 Inter-Agent Communication

**Pattern:**
```
Agent A (us-east-1) → Message Queue → Agent B (eu-west-1)

Options:
1. File-based (current): Only works for local agents
2. HTTP API: POST to remote agent's endpoint
3. Message Queue: SQS, RabbitMQ, Kafka
4. gRPC: Efficient binary protocol for agent-to-agent

Recommendation: HTTP API initially, SQS for production
```

**Implementation:**
```typescript
// Each agent exposes HTTP API
POST /api/agents/{agentId}/messages
{
  "from": "agent-a",
  "subject": "Task delegation",
  "content": "...",
  "priority": "high"
}

// Agents poll their own inbox
GET /api/agents/{agentId}/messages/inbox
```

---

## 7. Implementation Roadmap

### Phase 2: Local Containerization (AgentBox-Inspired)

**Goal:** Replace tmux sessions with Docker containers for local agents.

**Tasks:**
1. ✅ Create `aimaestro-agent` Dockerfile (adopt AgentBox's multi-language setup)
2. ✅ Modify session creation to spawn Docker containers instead of tmux
3. ✅ Update WebSocket bridge: `docker exec` instead of `tmux attach`
4. ✅ Implement per-agent volume mounts (workspace, cache, credentials)
5. ✅ Add resource limits (CPU, memory) to agent containers
6. ✅ Support `.mcp.json` per-agent configuration
7. ✅ Test local multi-agent scenarios

**Outcome:** Safer, isolated local agents with reproducible environments.

### Phase 3: Remote Agent Foundation

**Goal:** Deploy first cloud agent to AWS.

**Tasks:**
1. ✅ Build EC2 provisioning module (Terraform or AWS SDK)
2. ✅ Create cloud-init script (install Docker, configure networking)
3. ✅ Implement SSH tunnel for WebSocket (local dashboard ↔ remote agent)
4. ✅ Add agent location tracking (local vs. remote) in registry
5. ✅ Update dashboard to show agent location & region
6. ✅ Test single remote agent (us-east-1)

**Outcome:** First distributed agent running on AWS.

### Phase 4: Credential Vault & Security

**Goal:** Secure credential distribution to agents.

**Tasks:**
1. ✅ Build encrypted credential vault (`~/.aimaestro/credentials/`)
2. ✅ Implement credential encryption (AES-256)
3. ✅ Add credential distribution to agents (Docker secrets)
4. ✅ Support credential rotation
5. ✅ Add access control (which agents access which credentials)
6. ✅ Audit logging for credential access

**Outcome:** Secure credential management for distributed agents.

### Phase 5: Multi-Region Orchestration

**Goal:** Deploy agents across multiple AWS regions.

**Tasks:**
1. ✅ Add region selection to agent creation UI
2. ✅ Implement agent placement policies (region affinity, cost optimization)
3. ✅ Build inter-agent messaging (HTTP API + SQS)
4. ✅ Add agent health monitoring across regions
5. ✅ Implement agent migration (move agent to different region)
6. ✅ Add cost tracking per region

**Outcome:** Full multi-region distributed agent system.

---

## 8. Final Recommendations

### 8.1 What to Adopt from AgentBox

**Immediately:**
1. ✅ **Container-based isolation** - Replace tmux with Docker for local agents
2. ✅ **Per-agent MCP configuration** - Support `.mcp.json` files
3. ✅ **Shared credentials pattern** - Single credential source, distributed to agents
4. ✅ **Persistent caches + clean execution** - Cache package installs, restart cleanly

**Later (Phase 3+):**
5. ✅ **Multi-instance support** - Multiple agents on same project (with conflict warnings)
6. ✅ **Environment management** - Support `.envrc` or similar for per-agent env vars

### 8.2 What NOT to Adopt

**Anti-Patterns:**
1. ❌ **Ephemeral containers** - AI Maestro needs long-running agents
2. ❌ **Hash-based naming** - Use human-readable agent IDs
3. ❌ **Single-machine assumption** - Design for distributed from start
4. ❌ **CLI-only interface** - Keep web dashboard as primary interface

### 8.3 What AI Maestro Needs Beyond AgentBox

**Critical Missing Pieces:**
1. 🎯 **Cloud instance provisioning** (Terraform, AWS SDK)
2. 🎯 **Remote agent registration** (central registry + discovery)
3. 🎯 **Inter-agent communication** (HTTP API, message queues)
4. 🎯 **Resource quotas & cost management** (enforce limits, track costs)
5. 🎯 **Credential vault** (encrypted storage + distribution)
6. 🎯 **Multi-region orchestration** (agent placement, health checks)

### 8.4 Architectural Alignment

**AgentBox Vision:** Safe local development environments for Claude CLI
**AI Maestro Vision:** Distributed agent orchestration across cloud regions

**Alignment Score:** 40%

**Why Low Alignment:**
- AgentBox solves **developer productivity** (isolated dev environments)
- AI Maestro solves **agent orchestration** (manage many autonomous agents)
- AgentBox is **session-based** (start when working, stop when done)
- AI Maestro is **lifecycle-based** (agents live long-term)
- AgentBox is **single-machine** by design
- AI Maestro needs **multi-region** distribution

**Bottom Line:** AgentBox provides **excellent patterns for local agent isolation**, but doesn't address **distributed orchestration** or **cloud deployment**. Use AgentBox's containerization approach, but build custom orchestration layer on top.

---

## 9. Action Items

### Immediate Next Steps

1. **Prototype local containerization:**
   - Create `aimaestro-agent` Dockerfile based on agentbox's setup
   - Test replacing one tmux session with Docker container
   - Measure resource overhead (container vs. tmux)

2. **Design credential vault:**
   - Choose encryption library (libsodium, node-seal)
   - Design credential schema (global vs. per-agent)
   - Prototype distribution to containers (Docker secrets)

3. **Research cloud provisioning:**
   - Evaluate Terraform vs. AWS CDK vs. SDK
   - Prototype EC2 instance creation + Docker setup
   - Test SSH tunnel for WebSocket connection

4. **Design inter-agent messaging:**
   - Choose protocol (HTTP, gRPC, SQS)
   - Design message schema (compatible with current file-based system)
   - Prototype cross-region messaging

### Questions to Answer

1. **Container overhead:** How much does Docker add vs. tmux? (CPU, memory, latency)
2. **Cost model:** What's the monthly cost for 10 agents across 3 AWS regions?
3. **Networking:** How to securely connect dashboard to remote agents? (VPN, SSH tunnels, public endpoints)
4. **Migration:** How to migrate existing tmux-based agents to containers without downtime?
5. **Backward compatibility:** Support both tmux and Docker agents during transition?

---

## 10. Conclusion

**AgentBox is a well-designed tool for local Docker-based development**, with excellent patterns for project isolation and safe YOLO mode execution. However, it's **fundamentally a local development tool**, not a distributed agent orchestration platform.

**For AI Maestro's distributed AWS vision:**
- ✅ **Adopt:** Container isolation, shared credentials, persistent caches, MCP config patterns
- ❌ **Reject:** Ephemeral containers, hash-based naming, single-machine limitation
- 🎯 **Build:** Cloud provisioning, remote agent registry, inter-agent messaging, resource management

**Next Steps:** Prototype local containerization using AgentBox patterns, then build custom orchestration layer for distributed cloud deployment.

---

**Research conducted by:** Claude Code
**Analysis date:** January 2025
**Status:** Ready for review and next-phase planning
