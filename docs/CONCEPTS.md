# AI Maestro: Core Concepts

Understanding AI Maestro's architecture will help you maximize its potential for managing distributed AI coding agents.

## Table of Contents

- [What is AI Maestro?](#what-is-ai-maestro)
- [Localhost vs Remote Hosts](#localhost-vs-remote-hosts)
- [The Peer Mesh Network](#the-peer-mesh-network)
- [Agents and tmux Sessions](#agents-and-tmux-sessions)
- [Security Model](#security-model)

---

## What is AI Maestro?

AI Maestro is a **browser-based dashboard** for managing multiple AI coding agents across one or more machines. Think of it as a "mission control" for your AI coding workforce.

### The Problem It Solves

When working with Claude Code, you might:
- Run multiple AI agents simultaneously (frontend, backend, testing, documentation)
- Want to organize agents by project or purpose
- Need to check on agent progress without switching tmux windows
- Want to manage agents across different machines (local MacBook, remote Mac Mini, cloud servers)

AI Maestro centralizes all of this in one clean web interface accessible from any connected node.

---

## Localhost vs Remote Hosts

Understanding the difference between localhost and remote hosts is crucial to leveraging AI Maestro's power.

### Localhost (Local Host)

**Localhost** means "this computer" - the machine where AI Maestro is currently running.

**Characteristics:**
- ✅ Always available (you're running on it)
- ✅ No network required
- ✅ Fastest performance (no network latency)
- ✅ Most secure (no network exposure)
- ⚠️ Limited to this machine's resources (CPU, RAM, GPU)

**Example:**
```
Your MacBook Pro running AI Maestro
  └─ Local agents: frontend-app, backend-api, docs-writer
```

**When to use:**
- Single-machine development
- Maximum security needs
- Getting started with AI Maestro
- Limited network access scenarios

### Remote Host (Peer)

A **remote host** is another computer running AI Maestro that is connected to your mesh network.

**Characteristics:**
- ✅ Distributes workload across multiple machines
- ✅ Leverage different machine capabilities (Mac Mini for iOS builds, Linux server for Docker)
- ✅ Scale horizontally (add more machines as needed)
- ✅ Access dashboard from any connected peer
- ⚠️ Requires network connectivity
- ⚠️ Requires AI Maestro installed on each machine

**Example:**
```
Peer Mesh Network (All Connected as Equals)
  ├─ MacBook Pro → project-manager, code-reviewer
  ├─ Mac Mini → ios-build-agent, ui-tester
  └─ Cloud Server → database-migrations, deployment-agent

Access from any node - all see the same agents!
```

**When to use:**
- Resource-intensive tasks (building large projects, running multiple LLMs)
- Machine-specific requirements (Mac for iOS, Linux for Docker)
- Team environments (share powerful machines)
- Cost optimization (cheap cloud VMs for background tasks)

---

## The Peer Mesh Network

AI Maestro uses a **peer mesh architecture** - all instances are equals, there's no central server.

### Decentralized Design

Every AI Maestro instance is both a participant and a potential access point in the mesh.

**Key Principles:**
- **No hierarchy** - Every node can discover and connect to other nodes
- **Bidirectional sync** - Add a peer once, both sides auto-discover each other
- **Eventually consistent** - All nodes converge to the same peer list
- **Access anywhere** - Open the dashboard from any connected node

**Analogy:** Like BitTorrent or a decentralized network - no single point of failure.

### How Peers Communicate

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Browser (any node at :23000)                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Agent List                      Terminal View            │   │
│  │ ┌───────────────────┐          ┌────────────────────┐   │   │
│  │ │ MACBOOK-PRO       │          │ $ claude            │   │   │
│  │ │ ├─ project-mgr ●  │          │ > analyzing code... │   │   │
│  │ │ └─ code-review ●  │          │                     │   │   │
│  │ │                   │          │                     │   │   │
│  │ │ MAC-MINI          │          └────────────────────┘   │   │
│  │ │ ├─ ios-build ●    │                                    │   │
│  │ │ └─ ui-test ●      │                                    │   │
│  │ └───────────────────┘                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket
                           ▼
            ┌──────────────────────────────┐
            │  Node A (MacBook Pro)        │
            │  Port 23000                  │
            │                              │
            │  ┌────────────────────────┐  │
            │  │ WebSocket Router       │  │
            │  │ - Local sessions       │  │
            │  │ - Proxy peer sessions  │  │
            │  └────────────────────────┘  │
            └──────┬────────────────┬──────┘
                   │                │
         ┌─────────▼─────┐   ┌─────▼──────────┐
         │ Local tmux    │   │ Peer Proxy     │
         │ sessions      │   │ (Mac Mini)     │
         └───────────────┘   └────────┬───────┘
                                      │ HTTP/WebSocket
                                      │ (Tailscale VPN)
                             ┌────────▼──────────┐
                             │ Node B (Mac Mini) │
                             │ Port 23000        │
                             │                   │
                             │ ┌───────────────┐ │
                             │ │ tmux sessions │ │
                             │ │ - ios-build   │ │
                             │ │ - ui-test     │ │
                             │ └───────────────┘ │
                             └───────────────────┘
```

**Flow for Local Session:**
1. Browser connects via WebSocket to the node
2. Node creates PTY directly to local tmux
3. Terminal I/O flows: Browser ↔ Node ↔ Local tmux

**Flow for Remote Peer Session:**
1. Browser connects via WebSocket to current node
2. Node creates WebSocket to peer node
3. Peer creates PTY to its local tmux
4. Terminal I/O flows: Browser ↔ Node A ↔ Node B ↔ Remote tmux

**Key Benefit:** From the browser's perspective, all agents look the same - it doesn't care where they're running!

### Automatic Peer Discovery

When you add a peer from any node:

```
Node A adds Node B
  │
  ├─► Node A calls: POST /api/hosts/register-peer to Node B
  │   (tells Node B about Node A)
  │
  ├─► Node A calls: POST /api/hosts/exchange-peers with Node B
  │   (shares peer lists)
  │
  └─► Both nodes now know about each other!
      New peers propagate to all connected nodes.
```

**You only add once** - the mesh takes care of the rest.

---

## Agents and tmux Sessions

### What is an Agent?

An **agent** is an AI coding assistant (like Claude Code, Aider, or Cursor) that you create and manage in AI Maestro.

**Agent Anatomy:**
```
Agent Name: customers-zoom-backend
  ├─ tmux session (terminal multiplexer - the underlying tool)
  ├─ Working directory: ~/projects/zoom-app/backend
  ├─ Claude Code instance (AI tool running inside)
  └─ Agent notes (stored in AI Maestro)
```

### Hierarchical Organization

AI Maestro automatically organizes agents using a 3-level hierarchy based on naming:

**Format:** `level1-level2-agentName`

**Example:**
```
customers-zoom-backend
  └─ Level 1: "customers"     (top-level category)
  └─ Level 2: "zoom"          (subcategory/project)
  └─ Agent: "backend"         (specific agent)
```

**Benefits:**
- Visual grouping in sidebar (collapsible folders)
- Color-coded categories (auto-assigned)
- Easy filtering by project or client
- Scalable to hundreds of agents

### Agent vs tmux Session

**Important distinction:**
- **Agent** = What you create and manage (the AI assistant doing work)
- **tmux session** = The underlying tool that runs the agent

When you create an agent, AI Maestro creates a tmux session for it. The tmux session is just the container - the agent is what matters to you.

---

## Security Model

Understanding AI Maestro's security model helps you deploy it safely.

### Localhost-Only Mode (Default)

**Configuration:**
```javascript
// server.mjs
server.listen(23000, '0.0.0.0', () => { ... })
```

**Security Characteristics:**
- ✅ Binds to all interfaces (`0.0.0.0`) but typically accessed via `localhost`
- ✅ No authentication required (OS-level user security)
- ✅ No encryption needed for localhost traffic
- ⚠️ Accessible to other users on the same machine
- ⚠️ Accessible to other devices if firewall allows

**When secure:**
- Single-user machine (your personal MacBook)
- Trusted network with firewall
- No sensitive credentials in sessions

### Tailscale VPN Mode (Recommended for Peers)

**Configuration:**
- All nodes listen on `0.0.0.0:23000`
- Communication via Tailscale IPs (100.x.x.x)

**Security Characteristics:**
- ✅ Encrypted tunnel (WireGuard protocol)
- ✅ Private IP space (100.x.x.x)
- ✅ NAT traversal (works behind firewalls)
- ✅ Access control via Tailscale ACLs
- ✅ No exposed ports to public internet

**Setup:**
1. Install Tailscale on all machines
2. Note Tailscale IPs (`tailscale ip`)
3. Add peers using Tailscale IPs in Settings

**When to use:**
- Remote machines (cloud servers, home lab)
- Untrusted networks (coffee shop, coworking)
- Team environments (share access securely)

### Local Network Mode

**Configuration:**
- Peers accessible via LAN IP (192.168.x.x)
- Optional: `.local` domain (Bonjour/mDNS)

**Security Characteristics:**
- ⚠️ Unencrypted traffic (unless you add HTTPS)
- ⚠️ Accessible to anyone on network
- ✅ Fast (no VPN overhead)
- ✅ Simple (no VPN setup)

**When to use:**
- Trusted home network
- Isolated development network
- Performance-critical scenarios (large file transfers)

### What AI Maestro Does NOT Protect

AI Maestro assumes OS-level security:
- ❌ No user authentication (anyone with access can control all agents)
- ❌ No agent-level permissions (all agents visible to all users)
- ❌ No credential encryption (don't store API keys in agent notes)
- ❌ No audit logging (no record of who did what)

**Best Practices:**
- Use OS user accounts to isolate users
- Use environment variables for secrets (not hardcoded)
- Use Tailscale ACLs to restrict network access
- Use tmux access controls if needed

---

## Key Takeaways

1. **Localhost** = this machine, **Remote Host** = other machines in the mesh
2. **Peer mesh** = all nodes are equal, no central server required
3. **Add once** = bidirectional discovery syncs peers automatically
4. **Agents** are automatically organized by naming convention (tmux sessions are the underlying tool)
5. Security relies on OS users + network isolation (Tailscale recommended)
6. Access the dashboard from any connected node - they all show the same agents

**Next Steps:**
- [Use Cases](./USE-CASES.md) - See real-world scenarios
- [Setup Tutorial](./SETUP-TUTORIAL.md) - Connect your first peer
- [Network Access Guide](./NETWORK-ACCESS.md) - Detailed networking setup
