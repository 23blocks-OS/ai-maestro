# AI Maestro: Core Concepts

Understanding AI Maestro's architecture will help you maximize its potential for managing distributed AI coding agents.

## Table of Contents

- [What is AI Maestro?](#what-is-ai-maestro)
- [Localhost vs Remote Hosts](#localhost-vs-remote-hosts)
- [The Manager/Worker Pattern](#the-managerworker-pattern)
- [Sessions and Agents](#sessions-and-agents)
- [Security Model](#security-model)

---

## What is AI Maestro?

AI Maestro is a **browser-based dashboard** for managing multiple Claude Code sessions across one or more machines. Think of it as a "mission control" for your AI coding workforce.

### The Problem It Solves

When working with Claude Code, you might:
- Run multiple AI agents simultaneously (frontend, backend, testing, documentation)
- Want to organize agents by project or purpose
- Need to check on agent progress without switching tmux windows
- Want to manage agents across different machines (local MacBook, remote Mac Mini, cloud servers)

AI Maestro centralizes all of this in one clean web interface.

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
  └─ Local sessions: frontend-app, backend-api, docs-writer
```

**When to use:**
- Single-machine development
- Maximum security needs
- Getting started with AI Maestro
- Limited network access scenarios

### Remote Host (Worker)

A **remote host** is another computer running AI Maestro that your local instance can manage.

**Characteristics:**
- ✅ Distributes workload across multiple machines
- ✅ Leverage different machine capabilities (Mac Mini for iOS builds, Linux server for Docker)
- ✅ Scale horizontally (add more machines as needed)
- ⚠️ Requires network connectivity
- ⚠️ Requires AI Maestro installed on each machine

**Example:**
```
Your MacBook Pro (Manager)
  ├─ Local sessions: project-manager, code-reviewer
  ├─ Mac Mini (Worker) → ios-build-agent, ui-tester
  └─ Cloud Server (Worker) → database-migrations, deployment-agent
```

**When to use:**
- Resource-intensive tasks (building large projects, running multiple LLMs)
- Machine-specific requirements (Mac for iOS, Linux for Docker)
- Team environments (share powerful machines)
- Cost optimization (cheap cloud VMs for background tasks)

---

## The Manager/Worker Pattern

AI Maestro uses a **Manager/Worker architecture** - one instance acts as the control center, others as workers.

### Manager Instance

The **Manager** is the AI Maestro instance you interact with in your browser.

**Responsibilities:**
- Display all sessions (local + remote) in one unified dashboard
- Route WebSocket connections to the appropriate machine
- Provide the Settings UI for managing workers
- Aggregate session data from all workers

**Analogy:** The manager is like an air traffic controller - it doesn't fly the planes, but it coordinates all of them.

### Worker Instance

A **Worker** is an AI Maestro instance running on a remote machine that the Manager can control.

**Responsibilities:**
- Run local tmux/Claude Code sessions
- Report session status to Manager (when requested)
- Accept WebSocket connections proxied from Manager
- Execute session creation/deletion commands

**Analogy:** Workers are like planes - they do the actual work, but take instructions from the tower.

### How They Communicate

```
┌─────────────────────────────────────────────────────────────────┐
│  Your Browser (http://localhost:23000)                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Session List                    Terminal View            │   │
│  │ ┌───────────────────┐          ┌────────────────────┐   │   │
│  │ │ LOCAL             │          │ $ claude            │   │   │
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
            │  Manager (MacBook Pro)       │
            │  Port 23000                  │
            │                              │
            │  ┌────────────────────────┐  │
            │  │ WebSocket Router       │  │
            │  │ - Local sessions       │  │
            │  │ - Proxy remote sessions│  │
            │  └────────────────────────┘  │
            └──────┬────────────────┬──────┘
                   │                │
         ┌─────────▼─────┐   ┌─────▼──────────┐
         │ Local tmux    │   │ Worker Proxy   │
         │ sessions      │   │ (Mac Mini)     │
         └───────────────┘   └────────┬───────┘
                                      │ HTTP/WebSocket
                                      │ (Tailscale VPN)
                             ┌────────▼──────────┐
                             │ Worker (Mac Mini) │
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
1. Browser connects via WebSocket to Manager
2. Manager creates PTY directly to local tmux
3. Terminal I/O flows: Browser ↔ Manager ↔ Local tmux

**Flow for Remote Session:**
1. Browser connects via WebSocket to Manager
2. Manager creates WebSocket to Worker
3. Worker creates PTY to remote tmux
4. Terminal I/O flows: Browser ↔ Manager ↔ Worker ↔ Remote tmux

**Key Benefit:** From the browser's perspective, all sessions look the same - it doesn't care where they're running!

---

## Sessions and Agents

### What is a Session?

A **session** is a tmux terminal session running Claude Code (or any other CLI tool).

**Session Anatomy:**
```
Session Name: customers-zoom-backend
  ├─ tmux session (terminal multiplexer)
  ├─ Working directory: ~/projects/zoom-app/backend
  ├─ Claude Code instance (AI agent)
  └─ Session notes (stored in AI Maestro)
```

### Hierarchical Organization

AI Maestro automatically organizes sessions using a 3-level hierarchy based on naming:

**Format:** `level1-level2-sessionName`

**Example:**
```
customers-zoom-backend
  └─ Level 1: "customers"     (top-level category)
  └─ Level 2: "zoom"          (subcategory/project)
  └─ Session: "backend"       (specific agent)
```

**Benefits:**
- Visual grouping in sidebar (collapsible folders)
- Color-coded categories (auto-assigned)
- Easy filtering by project or client
- Scalable to hundreds of sessions

### Agent vs Session

While we often use these terms interchangeably:
- **Session** = Technical term (tmux session)
- **Agent** = Conceptual term (AI assistant doing work)

In practice, one session runs one agent (Claude Code instance).

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

### Tailscale VPN Mode (Recommended for Remote)

**Configuration:**
- Manager listens on `0.0.0.0:23000`
- Workers listen on `0.0.0.0:23000`
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
3. Add workers using Tailscale IPs in Settings

**When to use:**
- Remote machines (cloud servers, home lab)
- Untrusted networks (coffee shop, coworking)
- Team environments (share access securely)

### Local Network Mode

**Configuration:**
- Workers accessible via LAN IP (192.168.x.x)
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
- ❌ No user authentication (anyone with access can control all sessions)
- ❌ No session-level permissions (all sessions visible to all users)
- ❌ No credential encryption (don't store API keys in session notes)
- ❌ No audit logging (no record of who did what)

**Best Practices:**
- Use OS user accounts to isolate users
- Use environment variables for secrets (not hardcoded)
- Use Tailscale ACLs to restrict network access
- Use tmux access controls if needed

---

## Key Takeaways

1. **Localhost** = this machine, **Remote Host** = other machines
2. **Manager** coordinates, **Workers** execute
3. Sessions are automatically organized by naming convention
4. Security relies on OS users + network isolation (Tailscale recommended)
5. One browser dashboard can manage unlimited machines

**Next Steps:**
- [Use Cases](./USE-CASES.md) - See real-world scenarios
- [Setup Tutorial](./SETUP-TUTORIAL.md) - Configure your first remote worker
- [Network Access Guide](./NETWORK-ACCESS.md) - Detailed networking setup
