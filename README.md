<div align="center">

<img src="./docs/logo-constellation.svg" alt="AI Maestro Logo" width="120"/>

# AI Maestro

**Stop juggling terminal windows. Orchestrate your AI coding agents from one dashboard.**

[![Version](https://img.shields.io/badge/version-0.20.1-blue)](https://github.com/23blocks-OS/ai-maestro/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20(WSL2)-lightgrey)](https://github.com/23blocks-OS/ai-maestro)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)

[Quick Start](./docs/QUICKSTART.md) • [Features](#-features) • [Updating](#-updating-ai-maestro) • [Documentation](#-documentation) • [Contributing](./CONTRIBUTING.md)

</div>

---

## The Problem

Your AI agents are scattered across terminals, computers, and cloud servers. They forget everything between sessions. They can't talk to each other. You're the bottleneck - copy-pasting context, relaying messages, and manually coordinating their work.

## The Solution

![AI Maestro Dashboard](./docs/images/aiteam-web.png)

**AI Maestro** is an **AI Agent Orchestrator** that gives your agents superpowers:
- **Persistent memory** that grows over time (Code Graph + CozoDB)
- **Direct agent-to-agent communication** (no more playing messenger)
- **Run agents anywhere** - laptop, remote servers, Docker containers
- **One dashboard** to orchestrate them all

Your agents become a coordinated team, not isolated tools.

### One Dashboard, Unlimited Machines

```
Your Browser (any node at :23000)
         ┌──────────────────────┐
         │                      │
    ┌────┴────┐           ┌────┴────┐
    │ MacBook │◄─────────►│Mac Mini │
    │  Pro    │           │         │
    └────┬────┘           └────┬────┘
         │                      │
         └──────────┬──────────┘
                    │
              ┌─────┴─────┐
              │AWS Server │
              └───────────┘

Every node is equal - no central server required
```

**Benefits:**
- ✅ **Peer mesh network** - all nodes connected as equals
- ✅ Distribute workload across multiple machines
- ✅ Leverage machine-specific capabilities (Mac for iOS, Linux for Docker)
- ✅ Scale horizontally - add more machines as needed
- ✅ Work from anywhere (Tailscale VPN)
- ✅ One click to switch between any agent on any machine
- ✅ Access dashboard from any connected node

---

## ✨ Features

### 🌐 Peer Mesh Network (New in v0.8.0!)
Distribute your AI agents across **unlimited machines** - all connected as equals in a decentralized mesh.

> **⚠️ macOS 15+ Users:** If setting up peer connections, you MUST run `./scripts/fix-pm2-daemon.sh` first to fix Local Network Privacy blocking. [See Known Issues](#️-known-issues) for details.

- **Decentralized Architecture**: No central server - every node is equal
- **Automatic Peer Discovery**: Add a host once, both sides auto-discover each other
- **Real-time Health Monitoring**: Green/red/yellow indicators show peer status at a glance
- **Seamless Experience**: Remote agents work exactly like local ones (transparent WebSocket proxying)
- **Secure by Default**: Tailscale VPN integration for encrypted peer connections
- **Eventually Consistent**: All nodes converge to the same peer list automatically

**Example Setup:**
- **Laptop (8GB RAM):** Lightweight tasks, project management
- **Desktop (32GB RAM):** Heavy builds, large codebase analysis
- **Cloud Server:** Docker builds, CI/CD, platform-specific testing

→ [See Setup Tutorial](./docs/SETUP-TUTORIAL.md) | [Use Cases](./docs/USE-CASES.md) | [Concepts Guide](./docs/CONCEPTS.md)

### Universal Agent Support
Works with **any** terminal-based AI:
- Claude Code
- Aider
- Cursor
- GitHub Copilot CLI
- OpenAI Codex
- Your custom AI scripts

### Smart Organization
- **3-level hierarchy**: Use hyphens to create structure (e.g., `project-category-agent`)
- **Dynamic color coding**: Each top-level category gets its own color automatically
- **Visual hierarchy**: Expandable accordion with icons
- **Auto-grouping**: Agents with hyphens are automatically organized
- **Instant search**: Find any agent immediately *(coming in v1.1)*

### Agent Management
- **Create** agents from the UI
- **Rename** with a click
- **Delete** when done
- **Notes** for each agent (auto-saved to localStorage)
- **Auto-discovery**: Detects all your tmux sessions automatically

### Agent Communication System
- **File-Based Messaging**: Persistent, structured messages between agents
  - Priorities: urgent | high | normal | low
  - Types: request | response | notification | update
  - Rich context: Attach metadata, requirements, code snippets
  - **Unread-only filtering**: Agents see only new messages
  - **Auto-mark-as-read**: Messages marked read after retrieval
  - **Inbox & Outbox**: Full send/receive tracking per agent
- **Instant tmux Notifications**: Real-time alerts for urgent matters
  - Popup notifications (non-intrusive)
  - Terminal injections (visible in history)
  - Formatted output (for critical alerts)
- **CLI Tools**: Shell scripts for command-line messaging ([📁 View Scripts](./plugin/scripts))
  - [`send-aimaestro-message.sh`](./plugin/scripts/send-aimaestro-message.sh) - Send structured messages
  - [`forward-aimaestro-message.sh`](./plugin/scripts/forward-aimaestro-message.sh) - Forward messages between agents
  - [`check-and-show-messages.sh`](./plugin/scripts/check-and-show-messages.sh) - Display inbox
  - [`check-new-messages-arrived.sh`](./plugin/scripts/check-new-messages-arrived.sh) - Quick unread count
  - [`send-tmux-message.sh`](./plugin/scripts/send-tmux-message.sh) - Instant notifications
  - [📖 Installation Guide](./plugin/README.md)
- **Web UI**: Rich inbox/compose interface in Messages tab
- **Slack Integration**: Connect your team's Slack to AI agents ([🔗 Slack Bridge](https://github.com/23blocks-OS/aimaestro-slack-bridge))
  - DM or @mention agents from Slack
  - Route to specific agents with `@AIM:agent-name`
  - Responses delivered to Slack threads
- See [📬 Communication Docs](./docs/AGENT-COMMUNICATION-QUICKSTART.md) for 5-minute setup

### Agent Intelligence System (New in v0.11!)
Your AI agents become smarter over time with persistent memory and deep code understanding.

- **Code Graph Visualization**: Interactive graph showing your codebase structure
  - Multi-language support: Ruby, TypeScript, Python, and more
  - Visualize classes, functions, components, and their relationships
  - Filter by type: Files, Functions, Components
  - See imports, calls, extends, includes, associations
  - Focus mode to explore specific code paths
  - **Delta Indexing**: Only re-indexes changed files (~100ms vs 1000ms+ full re-index)
- **Agent Subconscious**: Background memory maintenance
  - Automatic conversation indexing for semantic search
  - Long-term memory consolidation for better retrieval
  - Push notifications for instant message delivery (v0.18.10+)
  - Self-staggering scheduler (scales to 100+ agents without CPU spikes)
  - Activity-aware intervals (faster when active, slower when idle)
- **Conversation Memory**: Full conversation history with search
  - Browse every conversation your agents have had
  - See thinking messages and tool usage
  - Search across all conversations semantically
  - Track model usage and conversation statistics
- **Auto-Generated Documentation**: Living documentation from your codebase
  - Automatically extracts and indexes code documentation
  - Search through all documented functions and classes

> [See Agent Intelligence Guide](./docs/AGENT-INTELLIGENCE.md) for setup and configuration

### Claude Code Plugin (New in v0.20!)
Use AI Maestro skills directly with Claude Code via the official plugin marketplace.

**Two Installation Options:**

| Option | What You Get | Service Required? |
|--------|--------------|-------------------|
| **Plugin Only** | 5 skills (1 standalone, 4 need service) | 4/5 skills need service |
| **Full Install** | Everything (service + dashboard + all skills) | Included |

#### Option 1: Plugin Only (Quick Start)

```bash
/plugin marketplace add 23blocks-OS/ai-maestro
/plugin install ai-maestro@ai-maestro-marketplace
```

> **Important:** Only the `planning` skill works standalone. Other skills (memory-search, docs-search, graph-query, agent-messaging) require the AI Maestro service running on localhost:23000.

#### Option 2: Full Installation (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

This installs everything: service, dashboard, all 5 skills working, 32 CLI scripts.

**Skills Included:**

| Skill | Description | Standalone? |
|-------|-------------|-------------|
| `ai-maestro:planning` | Stay focused on complex multi-step tasks | **YES** |
| `ai-maestro:memory-search` | Search your conversation history | NO |
| `ai-maestro:docs-search` | Search auto-generated documentation | NO |
| `ai-maestro:graph-query` | Query code relationships | NO |
| `ai-maestro:agent-messaging` | Send/receive messages between agents | NO |

**Also Included:**
- **3 Hooks** for automatic integration (SessionStart, Stop, Notification)
- **32 CLI Scripts** for direct command-line usage

> [See Plugin Guide](./plugin/README.md) for full documentation

### Portable Agents (New in v0.15!)
Move your AI agents anywhere. Export, import, transfer, and clone agents across machines.

- **Export to .zip Files**: Package agents with full configuration
  - Agent metadata, settings, and customizations
  - Message history (inbox/outbox)
  - Git repository associations
  - One-click download from agent profile
- **Import from Any Source**: Bring agents into new AI Maestro instances
  - Drag-and-drop or file picker
  - Automatic conflict detection
  - Preview before importing
- **Cross-Host Transfer**: Move agents between machines
  - Transfer to any connected worker host
  - Full data migration (messages, settings, repos)
- **Clone & Backup**: Duplicate agents for experimentation
  - Create agent backups before major changes
  - Share agent configurations with teammates
  - Version your agent setups

> [See Multi-Computer Guide](./docs/multi-computer.html#portable-agents) for detailed transfer workflows

### Built for Speed
- WebSocket streaming for real-time terminal I/O
- No lag, no polling
- Keyboard shortcuts for power users
- Native macOS performance

### Access from Anywhere
- **Fully mobile-optimized** interface for phones and tablets
- **Touch-optimized** controls with swipe gestures
- **Secure remote access** via Tailscale VPN
- **Monitor agents** while away from your desk
- See [📱 Mobile Access](#-access-from-mobile-devices) section below for setup and screenshots

---

## 🚀 Quick Start

> **Windows Users:** See [Windows Installation Guide](./docs/WINDOWS-INSTALLATION.md) for WSL2 setup (5-10 minutes)

### Zero to Hero (Easiest - for new users)

**macOS/Linux - One command installs everything:**

```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

**With options:**
```bash
# Install to custom directory
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh -s -- -d ~/projects/ai-maestro

# Fully unattended install (CI/CD, scripts, WSL)
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh -s -- -y --auto-start

# See all options
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh -s -- --help
```

> **💡 The `-y` flag** enables non-interactive mode - all prompts are auto-accepted. Perfect for automated deployments and CI/CD pipelines.

**Windows - Install via WSL2:**

```powershell
# 1. Install WSL2 (PowerShell as Administrator)
wsl --install

# 2. Restart Windows, then in Ubuntu terminal:
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh

# 3. Access from Windows browser: http://localhost:23000
```

**Full Windows guide:** [docs/WINDOWS-INSTALLATION.md](./docs/WINDOWS-INSTALLATION.md)

This installs:
- ✅ Homebrew (if needed)
- ✅ Node.js, Yarn, tmux (if needed)
- ✅ AI Maestro
- ✅ Agent messaging system (optional)
- ✅ All configuration

**Time:** 5-10 minutes (depending on what's already installed)

---

### Manual Install (for developers)

```bash
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro
yarn install
```

**Configure tmux for optimal scrolling** (highly recommended):
```bash
./scripts/setup-tmux.sh
```

This enables:
- ✅ Mouse wheel scrolling (works with Claude Code's alternate screen)
- ✅ 50,000 line scrollback buffer (up from 2,000)
- ✅ Better terminal colors

**Configure SSH for tmux sessions** (CRITICAL for git operations):
```bash
# Add to ~/.tmux.conf
echo '
# SSH Agent Configuration - AI Maestro
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g '"'"'SSH_AUTH_SOCK'"'"' ~/.ssh/ssh_auth_sock
' >> ~/.tmux.conf

# Add to ~/.zshrc (or ~/.bashrc)
echo '
# SSH Agent for tmux - AI Maestro
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
' >> ~/.zshrc

# Create initial symlink and reload tmux config
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
tmux source-file ~/.tmux.conf 2>/dev/null || true
```

This ensures:
- ✅ SSH keys work in all tmux sessions
- ✅ Git operations work without permission errors
- ✅ SSH persists across system restarts

**Start the dashboard**:
```bash
yarn dev
```

Dashboard opens at `http://localhost:23000`

**Network Access:** By default, AI Maestro is accessible on your local network at port 23000. See [Security](#security) below for important information.

**⚠️ After System Restart:** tmux and the dashboard won't auto-start by default. To avoid socket errors after restart, see [Auto-start Setup Guide](./docs/OPERATIONS-GUIDE.md#services-not-running-after-restart-most-common) for one-time configuration using macOS LaunchAgents and pm2.

**Optional: Configure settings**
```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local to customize:
# - HOSTNAME: Change to 'localhost' for local-only access
# - ENABLE_LOGGING: Set to 'true' to enable agent logging
# See the Security and Configuration sections below for all options
```

### 2. Create Your First Agent

**Option A: From the UI** (Recommended)

1. Click the **"+" button** in the sidebar
2. Enter an agent name using hyphens for hierarchy:
   - Simple: `my-project`
   - Organized: `myproject-backend-api` (creates 3 levels)
3. Choose your working directory
4. Click "Create Agent"
5. Start your AI agent in the terminal that appears

**Option B: From Terminal** (For tmux users)

```bash
# In another terminal
cd ~/my-project
tmux new-session -s myproject-backend-api

# Start your AI agent (claude, aider, cursor, copilot, etc.)
claude

# Detach: Ctrl+B then D
```

> **💡 Hierarchy Tip**: Agent names with hyphens create automatic organization:
> - `project-backend` → 2 levels (project > backend)
> - `project-backend-api` → 3 levels (project > backend > api)
> - Each top level gets its own color automatically!

### 3. Start Coding

Your agent is now live in the dashboard. Click to switch between agents. Add notes. Organize your work. That's it.

---

## 🔄 Updating AI Maestro

AI Maestro automatically checks for updates and shows you when a new version is available.

### Update Notification

When a new version is released, you'll see a **green badge** in the footer next to the version number:

```
Version 0.11.3  [v0.12.0]  • Made with ♥ in Boulder Colorado
                 ↑
           Click to see update details
```

Click the badge to see:
- What version you're on vs. latest
- Link to changelog
- Update instructions

> **Note:** The update check requires internet access. If you're running in an air-gapped environment, it will silently skip the check - AI Maestro works perfectly offline.

### One-Command Update

To update AI Maestro to the latest version:

```bash
cd /path/to/ai-maestro
./update-aimaestro.sh
```

**What this updates:**
- ✅ Application code (pulls latest from GitHub)
- ✅ Dependencies (runs `yarn install`)
- ✅ Rebuilds the application
- ✅ CLI scripts (messaging, docs, etc.) → `~/.local/bin/`
- ✅ Claude Code skills → `~/.claude/skills/`
- ✅ Restarts PM2 automatically (if running)

**Example output:**
```
╔════════════════════════════════════════╗
║      AI Maestro - Full Updater         ║
╚════════════════════════════════════════╝

Current version: 0.11.3
New commits available: 5

Recent changes:
abc1234 feat: Add new feature
def5678 fix: Bug fix

📥 Pulling latest changes...
🔨 Installing dependencies...
🔨 Building application...
🚀 Installing scripts and skills...
🔄 Restarting AI Maestro via PM2...

╔════════════════════════════════════════╗
║        Update Complete!                ║
╚════════════════════════════════════════╝

Updated: 0.11.3 → 0.12.0

⚠️  IMPORTANT: Restart your Claude Code agents
    to reload updated skills
```

### Manual Update (Alternative)

If you prefer to update manually:

```bash
cd /path/to/ai-maestro

# 1. Pull latest code
git pull origin main

# 2. Install dependencies
yarn install

# 3. Rebuild
yarn build

# 4. Reinstall scripts and skills
./install-messaging.sh  # Select option 3 for both

# 5. Restart server
pm2 restart ai-maestro
```

### After Updating

**Important:** After any update, restart your Claude Code agents to reload updated skills:

1. In each tmux session running Claude Code:
   - Type `exit` or press `Ctrl+D` to exit Claude
   - Type `claude` to restart

This ensures your agents have the latest skills and capabilities.

---

## 📱 Access from Mobile Devices

AI Maestro is fully mobile-optimized, letting you monitor and control your AI agents from your phone or tablet - perfect for checking progress while away from your desk.

<div align="center">
<img src="./docs/images/aimaestro-mobile.png" alt="AI Maestro on Mobile" width="300"/>
<img src="./docs/images/aimaestro-sidebar.png" alt="Mobile Sidebar" width="300"/>
</div>

### Secure Remote Access with Tailscale

The best way to access AI Maestro from anywhere is using [Tailscale](https://tailscale.com) - a zero-config VPN that creates a secure network between your devices.

> **Note:** AI Maestro is not endorsed by or affiliated with Tailscale in any way. We simply use it and recommend it based on our positive experience.

**Why Tailscale?**
- ✅ **Zero port forwarding** - No need to expose ports to the internet
- ✅ **Encrypted connections** - All traffic is automatically encrypted
- ✅ **No public IP needed** - Works behind NAT, firewalls, and routers
- ✅ **Cross-platform** - iOS, Android, macOS, Windows, Linux
- ✅ **Free for personal use** - Up to 100 devices

### Setup Guide

**1. Install Tailscale on your development machine:**
```bash
# macOS
brew install tailscale

# Or download from https://tailscale.com/download
```

**2. Install Tailscale on your mobile device:**
- iOS: [App Store](https://apps.apple.com/app/tailscale/id1470499037)
- Android: [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

**3. Connect both devices:**
- Open Tailscale on both devices
- Sign in with the same account (Google, Microsoft, GitHub, etc.)
- Both devices will appear in your Tailscale network

**4. Start AI Maestro:**
```bash
# On your development machine
yarn dev
```

**5. Access from your mobile device:**
```
http://YOUR-MACHINE-NAME:23000
```

Find your machine name in Tailscale settings (e.g., `macbook-pro`, `desktop-work`)

### Mobile Features

- **Touch-optimized interface** - Swipe to open sidebar, tap to close
- **Auto-collapsing sidebar** - Sidebar starts collapsed on mobile for maximum terminal space
- **Compact header** - Essential info only, optimized for small screens
- **Notes panel collapsed by default** - More room for terminal output
- **Full terminal access** - View output, run commands, monitor progress
- **Responsive layout** - Adapts perfectly to any screen size

### Use Cases

- 📊 **Monitor long-running builds** from your phone
- 🐛 **Check agent progress** while away from desk
- 📝 **Read agent notes** on your tablet
- ✅ **Verify completions** without being at your computer
- 🔄 **Switch between agents** from anywhere
- 💻 **Full terminal input** - Type commands and interact with agents from any device

---

## 📬 Inter-Agent Communication

**The next evolution in AI pair programming:** Your agents can now talk to each other.

When you're running a `backend-architect` agent and a `frontend-developer` agent, they need to coordinate. The backend agent finishes an API endpoint and needs to notify the frontend agent. The frontend agent hits an error and needs help from the backend team. Previously, you were the middleman - copying messages, switching contexts, losing flow.

**Not anymore.**

### How It Works

AI Maestro provides a **dual-channel messaging system** designed specifically for agent-to-agent communication:

#### 1. File-Based Messaging (Persistent & Structured)

Perfect for detailed requests, specifications, and async collaboration:

```bash
# Backend agent tells frontend agent: "API is ready"
send-aimaestro-message.sh frontend-dev \
  "GET /api/users endpoint ready" \
  "Endpoint implemented at routes/users.ts:45. Returns paginated user list. Supports ?page=1&limit=20" \
  normal \
  response

# Forward messages between agents with context
forward-aimaestro-message.sh latest frontend-dev qa-tester \
  "QA: Please verify this API endpoint"
```

**Features:**
- **Priorities**: `urgent` | `high` | `normal` | `low`
- **Types**: `request` | `response` | `notification` | `update`
- **Forwarding**: Pass messages between agents with notes and metadata preservation
- **Inbox**: Each agent has their own inbox (Messages tab in UI)
- **Persistent**: Messages saved to `~/.aimaestro/messages/inbox/`
- **Searchable**: Filter by priority, type, sender, or content

#### 2. Instant tmux Notifications (Real-Time Alerts)

For when agents need immediate attention:

```bash
# Urgent alert - pops up in the target agent's terminal
send-tmux-message.sh backend-architect "🚨 Production database down - check inbox!"
```

**Three delivery methods:**
- **`display`** - Non-intrusive popup (auto-dismisses)
- **`inject`** - Visible in terminal history
- **`echo`** - Formatted output for critical alerts

### Real-World Use Case

```bash
# Frontend agent working on user dashboard
# Backend agent finishes the API they need

# Backend sends structured message
send-aimaestro-message.sh frontend-dev \
  "User stats API ready" \
  "GET /api/stats implemented. Returns {activeUsers, signups, revenue}.
   Cached for 5min. Rate limited to 100/hour." \
  high \
  notification

# Backend also sends instant alert so frontend sees it immediately
send-tmux-message.sh frontend-dev "✅ User stats API is ready - check inbox for details"

# Frontend agent checks inbox
check-and-show-messages.sh
# Sees the full message with context

# Frontend responds after integration
send-aimaestro-message.sh backend-architect \
  "Re: User stats API integrated" \
  "Dashboard updated. Works perfectly. Thanks!" \
  normal \
  response
```

### Claude Code Integration

Every agent can use the messaging system automatically via a **Claude Code skill** ([📁 View Skill](./plugin/skills/agent-messaging)):

```bash
# With any agent, just say:
> "Send a message to backend-architect asking them to implement POST /api/users"
> "Forward the last message to qa-tester with a note to verify the implementation"

# Claude automatically:
# 1. Recognizes the messaging/forwarding intent
# 2. Chooses appropriate method (file-based)
# 3. Sends or forwards message to the target agent's inbox
# 4. Confirms delivery with metadata
```

**No manual scripting needed** - agents understand natural language messaging commands.

**Installation:**
- **Plugin:** Run `claude --plugin-dir ./plugin` (loads all skills, hooks, and scripts)
- **Easy:** Run [`./install-messaging.sh`](./install-messaging.sh) (installs scripts + skills to your system)
- **Update:** Run [`./update-messaging.sh`](./update-messaging.sh) (updates scripts + skills with zero friction)
- **Manual:** Copy [`plugin/skills/`](./plugin/skills) to `~/.claude/skills/` ([📖 Guide](./plugin/README.md))

### Built-In UI

Each agent has a **Messages tab** with:
- 📥 **Inbox** - See all messages sent to this agent
- 📤 **Sent** - Track what you've sent to other agents
- ✍️ **Compose** - Send new messages with priority/type selection
- ↗️ **Forward** - Forward received messages to other agents with notes
- 🔔 **Unread count** - Never miss important messages

### Slack Integration

**Connect your team's Slack workspace to AI Maestro agents.** Your entire team can now interact with AI agents directly from Slack - no terminal access needed.

```
Slack Message → Slack Bridge → AI Maestro → Agent
                                               ↓
Slack Thread  ← Slack Bridge ← AI Maestro ← Response
```

**Features:**
- **DM the bot** - Send direct messages to interact with agents
- **@mention in channels** - `@AI Maestro check the API status`
- **Route to specific agents** - `@AIM:backend-api check server health`
- **Thread responses** - Replies delivered to the original Slack thread
- **Cross-host routing** - Route to agents on any host in your network

**Quick Start:**
```bash
# Clone the Slack Bridge
git clone https://github.com/23blocks-OS/aimaestro-slack-bridge.git
cd aimaestro-slack-bridge
npm install

# Configure (see README for Slack app setup)
cp .env.example .env
# Edit .env with your Slack tokens

# Run
npm start
```

**See the full setup guide:** [🔗 AI Maestro Slack Bridge](https://github.com/23blocks-OS/aimaestro-slack-bridge)

### Get Started in 2 Minutes

**Easy Install (Recommended):**
```bash
./install-messaging.sh
# Interactive installer - checks prerequisites, installs scripts & skill
```

**Update Existing Installation:**
```bash
./update-messaging.sh
# Updates scripts and skill - backs up old version automatically
# Remember to restart agents to reload updated skill
```

**Manual Install:** See [Installation Guide](./plugin/README.md)

```bash
# 1. Agents check inbox on startup
check-and-show-messages.sh

# 2. Send your first message
send-aimaestro-message.sh backend-api \
  "Test message" \
  "Hello from the communication system!" \
  normal \
  notification

# 3. Check for new messages
check-new-messages-arrived.sh
```

**For Claude Code:** Install the plugin or skills to use natural language - [Plugin Guide](./plugin/README.md)

### Documentation

- **[📬 Quickstart Guide](./docs/AGENT-COMMUNICATION-QUICKSTART.md)** - Send your first message in < 2 minutes
- **[📋 Guidelines](./docs/AGENT-COMMUNICATION-GUIDELINES.md)** - Best practices for effective agent communication
- **[📖 Messaging Guide](./docs/AGENT-MESSAGING-GUIDE.md)** - Complete reference with all tools and options
- **[🏗️ Architecture](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)** - Technical deep-dive into the messaging system
- **[⚙️ Claude Code Configuration](./docs/CLAUDE-CODE-CONFIGURATION.md)** - Skills, slash commands, and configuration options

### Why This Matters

**Before:** You're the bottleneck. Every agent interaction goes through you.

**After:** Agents coordinate directly. You orchestrate, they collaborate.

**Result:** Faster development, better context retention, true multi-agent workflows.

---

## 📸 Screenshots

<details>
<summary><b>Hierarchical Agent Organization</b></summary>

Agents organized automatically using hyphens, with color coding and icons:

**Example agent names:**
- `fluidmind-agents-backend-architect`
- `fluidmind-agents-frontend-developer`
- `fluidmind-experiments-api-tester`
- `ecommerce-development-cart-api`
- `ecommerce-development-checkout-flow`

**Displays as:**
```
🎨 fluidmind (purple)
  📁 agents
    🤖 backend-architect
    🤖 frontend-developer
  📁 experiments
    🧪 api-tester

🛒 ecommerce (blue)
  📁 development
    💻 cart-api
    💻 checkout-flow
```

Each top-level category gets a unique color automatically - no configuration needed.

</details>

<details>
<summary><b>Agent Notes</b></summary>

Take notes for each agent. They're saved automatically to your browser:
- Track architectural decisions
- Save commands for later
- Keep TODO lists
- Leave context for tomorrow

</details>

---

## 🎯 Why AI Maestro?

### 🧠 Agents That Remember
Every agent has persistent memory powered by CozoDB. They learn your codebase and remember past conversations. No more re-explaining context every session.

### 💬 Agents That Communicate
Direct agent-to-agent messaging. Your frontend agent can request APIs from backend agent without you playing messenger. Built-in inbox/outbox with priority levels.

### 🌐 Agents Everywhere
Run agents on your laptop, remote servers, Docker containers, or cloud VMs. All connected via a decentralized peer mesh network - access from any node.

### 🗺️ Agents That Understand
Code Graph visualization shows your entire codebase structure. Agents know what files relate to what before they even start. Delta indexing keeps everything current (~100ms updates).

---

**Why not just use tmux directly?**
You can! AI Maestro is built on tmux. But instead of memorizing keybindings and switching between panes, you get visual organization, point-and-click switching, persistent memory, agent communication, and Code Graph visualization.

**Is it just a tmux GUI?**
It started that way, but now it's an AI Agent Orchestrator. Think of it as tmux + memory + communication + code understanding + visual hierarchy. You still have full access to your tmux sessions from the terminal.

---

## 📋 Requirements

### macOS
- **macOS 12.0+** (Monterey or later)
- **Node.js 18.17+**
- **tmux 3.0+**
- **Your favorite AI agent** (Claude, Aider, Cursor, Copilot, etc.)

### Windows
- **Windows 10 version 2004+** or **Windows 11**
- **WSL2 (Windows Subsystem for Linux)** - [Installation Guide](./docs/WINDOWS-INSTALLATION.md)
- **Node.js 18.17+** (installed in WSL2)
- **tmux 3.0+** (installed in WSL2)
- **Your favorite AI agent** (Claude, Aider, Cursor, Copilot, etc.)

### Linux
- **Ubuntu 20.04+** / **Debian 11+** / **Fedora 35+** or equivalent
- **Node.js 18.17+**
- **tmux 3.0+**
- **Your favorite AI agent** (Claude, Aider, Cursor, Copilot, etc.)

---

## 🛠️ Tech Stack

Built with modern, battle-tested tools:

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Terminal**: xterm.js with WebGL acceleration
- **Backend**: Custom Node.js server with WebSocket
- **Database**: [CozoDB](https://www.cozodb.org/) - Embedded graph-relational database for agent memory
- **Code Analysis**: [ts-morph](https://ts-morph.com/) - TypeScript/JavaScript AST parsing for Code Graph
- **Embeddings**: Transformers.js with all-MiniLM-L6-v2 for semantic search
- **Font**: Space Grotesk for a modern feel
- **Icons**: lucide-react

---

## 📚 Documentation

### Getting Started
- **[Quick Start Guide](./docs/QUICKSTART.md)** - Get AI Maestro running in 5 minutes ⚡
- **[Core Concepts](./docs/CONCEPTS.md)** - Understand localhost, hosts, and peer mesh network
- **[Use Cases](./docs/USE-CASES.md)** - Real-world scenarios and benefits

### Peer Mesh Network (Multi-Machine Setup)
- **[Setup Tutorial](./docs/SETUP-TUTORIAL.md)** - Connect your first peer (step-by-step)
- **[Network Access Guide](./docs/NETWORK-ACCESS.md)** - Tailscale, local network, and security
- **[Remote Sessions Architecture](./docs/REMOTE-SESSIONS-ARCHITECTURE.md)** - Technical deep-dive

### Agent Communication
- **[Quickstart Guide](./docs/AGENT-COMMUNICATION-QUICKSTART.md)** - Send your first message in < 2 minutes
- **[Guidelines](./docs/AGENT-COMMUNICATION-GUIDELINES.md)** - Best practices and patterns
- **[Messaging Guide](./docs/AGENT-MESSAGING-GUIDE.md)** - Comprehensive reference
- **[Architecture](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)** - Technical deep-dive

### Agent Intelligence
- **[Agent Intelligence Guide](./docs/AGENT-INTELLIGENCE.md)** - Code Graph, Subconscious, and Memory systems

### General
- **[Windows Installation](./docs/WINDOWS-INSTALLATION.md)** - Complete WSL2 setup guide for Windows users
- **[Operations Guide](./docs/OPERATIONS-GUIDE.md)** - How to use AI Maestro
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Solutions for common issues
  - **🔥 Most Common Issue:** [Services not running after restart](./docs/OPERATIONS-GUIDE.md#services-not-running-after-restart-most-common) - Socket errors? Read this first!
- **[Technical Specs](./docs/TECHNICAL-SPECIFICATIONS.md)** - Architecture deep-dive
- **[UX Specs](./docs/UX-SPECIFICATIONS.md)** - Design decisions
- **[Contributing](./CONTRIBUTING.md)** - How to contribute
- **[Security](./SECURITY.md)** - Security model

---

## 🗺️ Roadmap

### Phase 1 ✅ Complete
- ✅ Local tmux session management
- ✅ Hierarchical organization
- ✅ Dynamic color coding
- ✅ Agent notes
- ✅ Full CRUD from UI

### Phase 2 ✅ Complete
- ✅ Agent communication system (file-based messaging)
- ✅ Web UI for inbox/compose
- ✅ CLI tools for messaging
- ✅ Mobile-optimized interface

### Phase 3 ✅ Complete (v0.8.0)
- ✅ Peer mesh network architecture (decentralized)
- ✅ Remote host management via Settings UI
- ✅ Smart peer discovery wizard
- ✅ WebSocket proxy for remote agents
- ✅ Tailscale VPN integration

### Phase 4 ✅ Complete (v0.11.0)
- ✅ Agent Intelligence System
- ✅ Code Graph visualization with multi-language support
- ✅ Agent Subconscious with background memory maintenance
- ✅ Conversation history browser with semantic search
- ✅ Auto-generated documentation from codebase
- ✅ CozoDB embedded database per agent

### Phase 5 (2026)
- [ ] Search & filter across all agents
- [ ] Export agent transcripts
- [ ] Agent playback (time-travel debugging)

### Phase 6 (Future)
- [ ] Agent sharing & collaboration
- [ ] AI-generated agent summaries
- [ ] Performance metrics dashboard
- [ ] Cloud deployment templates

---

## 🤝 Contributing

We love contributions! AI Maestro is built for developers, by developers.

**Ways to contribute**:
- 🐛 Report bugs
- 💡 Suggest features
- 📝 Improve docs
- 🔧 Submit PRs

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## ⚠️ Important Notes

### Security

**⚠️ Network Access Enabled by Default**

AI Maestro runs on `0.0.0.0:23000` which means:
- ✅ **Accessible from any device on your local network**
- ⚠️ **No authentication required** - anyone on your WiFi can access it
- ⚠️ **Unencrypted connections** (ws://) - data sent in plain text
- ⚠️ **Full terminal access** - anyone connected can run commands

**Safe for:**
- Home networks (trusted WiFi)
- Private office networks
- Development on trusted LANs

**NOT safe for:**
- Public WiFi (coffee shops, airports, etc.)
- Shared office WiFi with untrusted users
- Exposing port 23000 to the internet

---

#### 🔒 Localhost-Only Mode (Recommended for Maximum Security)

For the most secure setup, restrict AI Maestro to only accept connections from your local machine:

**Option 1: One-time run**
```bash
HOSTNAME=localhost yarn dev
# or
HOSTNAME=127.0.0.1 yarn dev
```

**Option 2: Persistent configuration** (recommended)

Create a `.env.local` file in the project root:

```bash
# .env.local
HOSTNAME=localhost
PORT=23000
```

Then run normally:
```bash
yarn dev
```

**Production build:**
```bash
HOSTNAME=localhost yarn build
HOSTNAME=localhost yarn start
```

---

#### 🌐 Network Configuration Options

| Configuration | Access Level | Use Case |
|--------------|--------------|----------|
| `HOSTNAME=localhost` | **Local machine only** | Maximum security, single developer |
| `HOSTNAME=127.0.0.1` | **Local machine only** | Same as localhost (explicit IP) |
| `HOSTNAME=0.0.0.0` (default) | **Local network** | Access from phone/tablet/other computers |
| `HOSTNAME=192.168.x.x` | **Specific network interface** | Control which network accepts connections |

**Testing your configuration:**

```bash
# After starting the server, test access:

# Should always work (local access)
curl http://localhost:23000

# Will only work if HOSTNAME is 0.0.0.0 or your local IP
curl http://192.168.1.100:23000  # Replace with your machine's IP
```

---

#### 📝 Agent Logging Configuration

**Agent Logging (Disabled by Default)**

AI Maestro can optionally log terminal agent content to `./logs/{agentName}.txt` files. This is useful for:
- 📊 Reviewing AI agent conversations
- 🐛 Debugging issues after agents stop
- 📖 Creating documentation from agent interactions
- 🔍 Searching through past work

**What gets logged:**
- ✅ All terminal output and commands
- ✅ AI agent responses and reasoning
- 🚫 Filtered out: Claude Code status updates and thinking steps (reduces noise)
- 🚫 Not logged: Browser notes (stored in localStorage only)

**Controls:**

1. **Global master switch** (in `.env.local`):
```bash
# Enable agent logging
ENABLE_LOGGING=true

# Disable all agent logging (default)
ENABLE_LOGGING=false
```

2. **Per-agent toggle**: Each terminal has a 📝/🚫 button in the header to enable/disable logging for that specific agent

**Privacy considerations:**
- Log files are stored locally only (`./logs/` directory)
- Logs are gitignored by default (never committed to git)
- No logs are sent over the network
- Logs contain whatever commands and data you run in terminals
- Consider disabling logging when working with sensitive data

**Disk usage:**
- Log files grow with agent activity
- No automatic cleanup or rotation (manage manually)
- Disable logging globally or per-agent to save disk space

---

#### 🛡️ Additional Security Measures

**Built-in protections:**
- No data sent over the internet (runs 100% locally)
- Notes stored in browser localStorage only
- tmux sessions run with your user permissions
- No external API calls or telemetry

**Recommended practices:**
- Use localhost-only mode when on untrusted networks
- Never expose port 23000 to the internet (no port forwarding)
- Review tmux session permissions regularly
- Consider using a firewall to restrict port 23000 access

**⚠️ Not for production use** without adding:
- Authentication (user login)
- HTTPS/WSS encryption
- Rate limiting
- Access logging

### ⚠️ Known Issues

#### macOS Local Network Privacy Blocking Peer Connections (macOS 15+)

**If you're setting up peer mesh connections on macOS 15+ (Sequoia) or macOS 26+ (Tahoe), you MUST apply this fix.**

**Symptoms:**
- ✅ Local agents work fine
- ❌ Remote peer agents don't appear
- ❌ `EHOSTUNREACH` errors in PM2 logs
- ✅ `curl` to remote peers works from terminal

**Root Cause:** macOS Local Network Privacy restricts PM2 (user-level process) from accessing local network IPs. This is a macOS security feature introduced in macOS 15.

**Quick Fix (5 minutes):**

```bash
# Step 1: Convert PM2 to system daemon (exempt from restrictions)
./scripts/fix-pm2-daemon.sh

# Step 2: Complete the transition
./scripts/transition-to-daemon.sh

# Step 3: Verify peer connections work
curl http://localhost:23000/api/sessions | jq '.sessions | group_by(.hostId)'
```

**What this does:**
- ✅ Keeps all PM2 functionality (`pm2 logs`, `pm2 restart`, etc.)
- ✅ Fixes network access to peer nodes
- ✅ Auto-starts on boot
- ✅ No workflow changes

**Alternative:** Use [Tailscale](./docs/NETWORK-ACCESS.md) to connect peers (may bypass restriction).

**Full documentation:** See [GitHub Issue #24](https://github.com/23blocks-OS/ai-maestro/issues/24) for complete technical details and troubleshooting.

---

### Known Limitations

#### Scrollback with Claude Code
When Claude Code updates status indicators (like "Thinking..."), you may see duplicate lines in the scrollback buffer. This is a known limitation of xterm.js (the terminal library used by VS Code, JupyterLab, and most web terminals).

**Why this happens:**
- Native terminals (iTerm2, Terminal.app) only add content to scrollback when it scrolls off the top
- xterm.js records every cursor movement, including in-place status updates
- Claude Code uses cursor positioning to update indicators, creating intermediate states in scrollback

**Workarounds included:**
- 🧹 **Clear button** in terminal header - manually clean scrollback when needed
- **No history replay** - start with clean terminal on reconnect
- These are the same workarounds used by other xterm.js-based terminals

**Note:** This is not specific to AI Maestro - it affects all web terminals using xterm.js with tools that update status indicators in place.

### Compatibility
- Works with **any** terminal-based AI agent
- Not affiliated with Anthropic, OpenAI, GitHub, or any AI provider
- Each AI agent requires separate installation/authentication

### License
MIT License - see [LICENSE](./LICENSE)

**Copyright © 2025 Juan Peláez / 23blocks**

Free to use for any purpose, including commercial.

---

## 💬 Support

- 🐛 **Bugs**: [Open an issue](https://github.com/23blocks-OS/ai-maestro/issues)
- 💡 **Features**: [Request here](https://github.com/23blocks-OS/ai-maestro/issues/new?labels=enhancement)
- 📖 **Docs**: [See /docs](./docs)

---

## 🙏 Acknowledgments

Built with amazing open source tools:
- [Claude Code](https://claude.ai) by Anthropic
- [CozoDB](https://www.cozodb.org/) - Graph-relational database
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Next.js](https://nextjs.org/) - React framework
- [ts-morph](https://ts-morph.com/) - TypeScript compiler API wrapper
- [tmux](https://github.com/tmux/tmux) - Terminal multiplexer
- [lucide-react](https://lucide.dev/) - Icons

---

<div align="center">

**Made with ♥ in Boulder, Colorado**

[Juan Peláez](https://x.com/jkpelaez) @ [23blocks](https://23blocks.com)
*Coded with Claude*

**Built for developers who love AI pair programming**

[⭐ Star us on GitHub](https://github.com/23blocks-OS/ai-maestro) • [🐦 Follow updates](https://x.com/jkpelaez)

</div>
