# The Agent Ecosystem

Every AI agent you build has four dimensions. Get all four right and you have a complete team member — not just a chatbot with a name.

```
Complete Agent = Personality (WHO) + Capabilities (HOW) + Identity (TRUST) + Communication (TALK)
```

## The Agent Formula

| | Dimension | What it does | Component |
|-|-----------|-------------|-----------|
| **WHO** | Personality | Domain expertise, workflows, deliverables, communication style | [Agent Library](https://github.com/msitarzewski/agency-agents) |
| **HOW** | Capabilities | Skills, scripts, CLI tools your agent can use | [Plugin Builder](https://github.com/23blocks-OS/ai-maestro-plugins) |
| **TRUST** | Identity | Cryptographic keys, OAuth tokens, verifiable identity | [AID Protocol](https://agentids.org) |
| **TALK** | Communication | Agent-to-agent messaging with signatures and routing | [AMP Protocol](https://agentmessaging.org) |

**AI Maestro** is the stage — the OS that orchestrates agents across machines, provides persistent memory, and gives you one dashboard to manage them all.

**Lola** is the example — a batteries-included Chief of Staff that shows what a fully assembled agent looks like.

## How It All Fits Together

```
                    ┌─────────────────────────────────────────────┐
                    │              AI MAESTRO (The OS)             │
                    │  Dashboard · Memory · Multi-Machine Mesh    │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────────────┐
                    │                  │                          │
              ┌─────┴─────┐    ┌──────┴──────┐    ┌──────────────┴─┐
              │  Agent A   │    │  Agent B     │    │  Agent C       │
              │  (Lola)    │    │  (Backend)   │    │  (Designer)    │
              └─────┬─────┘    └──────┬──────┘    └──────────────┬─┘
                    │                 │                           │
          ┌────────┼────────┐        │                           │
          │        │        │        │                           │
       ┌──┴──┐ ┌──┴──┐ ┌──┴──┐  ┌──┴──┐                    ┌──┴──┐
       │ WHO │ │ HOW │ │TRUST│  │TALK │                    │ ... │
       └──┬──┘ └──┬──┘ └──┬──┘  └──┬──┘                    └─────┘
          │       │       │        │
  agency- │ plugin│  AID  │  AMP   │
  agents  │ builder      │        │
```

**Assembly flow:**

```
1. Pick a personality    →  agency-agents/engineering/frontend-developer.md
2. Give it skills        →  plugin builder assembles messaging, memory, graph, planning
3. Give it identity      →  AID generates Ed25519 keys + OAuth tokens
4. Give it a voice       →  AMP enables agent-to-agent communication
5. Deploy on AI Maestro  →  One dashboard, persistent memory, multi-machine mesh
```

## The Components

### Agent Library — WHO your agent is

150+ specialist personalities organized by division: engineering, design, marketing, finance, product, strategy, testing, and more. Each personality is a markdown file that defines the agent's expertise, workflows, deliverables, and communication style.

These are not skills or tools. They define *who* your agent is — a frontend developer thinks differently from a growth hacker, and their personality file captures that.

- **Repo:** [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (MIT, 15K+ stars)
- **Install:** `./scripts/install.sh --tool claude-code`
- **Structure:** One `.md` file per agent, organized by division

### Plugin Builder — HOW your agent works

A composable build system that assembles skills from multiple sources into a single Claude Code plugin. Fork it, edit `plugin.manifest.json`, build, install. Your agent wakes up knowing everything you gave it.

Default skills: Agent Messaging, Agent Identity, Agent Management, Memory Search, Code Graph, Docs Search, Planning.

- **Repo:** [23blocks-OS/ai-maestro-plugins](https://github.com/23blocks-OS/ai-maestro-plugins)
- **Install:** `./build-plugin.sh --clean && claude plugin install ./plugins/ai-maestro`

### AID — TRUST your agent earns

The Agent Identity Protocol gives each agent a verifiable cryptographic identity. Ed25519 key pairs, OAuth 2.0 authentication, and passwordless access to services. When agents sign messages, other agents can verify who sent them.

- **Spec:** [agentids.org](https://agentids.org)
- **Plugin:** Bundled in the Plugin Builder as a git source

### AMP — TALK between agents

The Agent Messaging Protocol is email for AI agents. Priority levels, message types, cryptographic signatures, push notifications, and federation across machines. Tell your agent "send a message to backend about the deployment" — it just works.

- **Spec:** [agentmessaging.org](https://agentmessaging.org)
- **Plugin:** Bundled in the Plugin Builder as a git source

### AI Maestro — The Stage

The OS that ties it all together. One dashboard to see every agent on every machine. Persistent memory that grows over time. Code graph visualization. Team meetings with Kanban boards. Multi-machine peer mesh with no central server.

- **Repo:** [23blocks-OS/ai-maestro](https://github.com/23blocks-OS/ai-maestro)
- **Install:** `curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh`

### Lola — The Example

A batteries-included Chief of Staff framework that shows what a fully assembled agent looks like. Email triage, semantic memory, task management, content security. Clone, configure, deploy.

- **Repo:** [23blocks-OS/lolabot](https://github.com/23blocks-OS/lolabot)
- **Install:** `git clone https://github.com/23blocks-OS/lolabot.git && cd lolabot && ./setup.sh`

---

## Build Your First Agent Team

### Step 1: Install AI Maestro

```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

Dashboard opens at `http://localhost:23000`. You now have the OS, messaging, and a Claude Code plugin with 7 skills.

### Step 2: Browse agent personalities

```bash
# Clone the agent library
git clone https://github.com/msitarzewski/agency-agents.git

# See what's available
ls agency-agents/
# academic/  design/  engineering/  finance/  marketing/  product/  ...

# Install all personalities into Claude Code
cd agency-agents && ./scripts/install.sh --tool claude-code
```

Each file is a personality definition — domain expertise, workflows, deliverables, communication style.

### Step 3: Create your first agent

```bash
# Create an agent with a personality
aimaestro-agent.sh create --name frontend-dev \
  --personality agency-agents/engineering/engineering-frontend-developer.md
```

Your agent now has a personality (WHO) and skills (HOW) from the plugin.

### Step 4: Deploy Lola as your Chief of Staff

```bash
git clone https://github.com/23blocks-OS/lolabot.git
cd lolabot && ./setup.sh
```

Lola handles email, memory, tasks, and content security. She's the example of a fully assembled agent.

### Step 5: Scale your AI company

Add more specialists from the Agent Library. Each one gets the plugin skills automatically. They communicate via AMP. You orchestrate from the AI Maestro dashboard.

```
Your AI Company:
├── Lola (Chief of Staff) — email, tasks, memory
├── frontend-dev — UI implementation, component architecture
├── backend-api — API design, database optimization
├── growth-hacker — acquisition, viral loops, analytics
├── content-writer — blog posts, documentation, social media
└── qa-engineer — testing, bug reports, quality assurance
```

---

## Going Deeper

| Topic | Where to learn more |
|-------|-------------------|
| AI Maestro setup | [Quick Start Guide](./QUICKSTART.md) |
| Multi-machine mesh | [Multi-Computer Setup](./SETUP-TUTORIAL.md) |
| Agent messaging | [AMP Guide](./AGENT-MESSAGING-GUIDE.md) |
| Persistent memory | [Intelligence Guide](./AGENT-INTELLIGENCE.md) |
| Plugin customization | [Plugin Builder README](../plugin/README.md) |
| Agent personalities | [agency-agents README](https://github.com/msitarzewski/agency-agents#readme) |
| Lola framework | [lolabot README](https://github.com/23blocks-OS/lolabot#readme) |
| AID protocol | [agentids.org](https://agentids.org) |
| AMP protocol | [agentmessaging.org](https://agentmessaging.org) |
