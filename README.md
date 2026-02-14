<div align="center">

<img src="./docs/logo-constellation.svg" alt="AI Maestro Logo" width="120"/>

# AI Maestro

*I was running 35 AI agents across multiple terminals and became the human mailman between them. So I built AI Maestro.*

**Orchestrate your AI coding agents from one dashboard — with persistent memory, agent-to-agent messaging, and multi-machine support.**

[![Version](https://img.shields.io/badge/version-0.23.2-blue)](https://github.com/23blocks-OS/ai-maestro/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows%20(WSL2)-lightgrey)](https://github.com/23blocks-OS/ai-maestro)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/23blocks-OS/ai-maestro?style=social)](https://github.com/23blocks-OS/ai-maestro)

![AI Maestro Dashboard](./docs/images/aiteam-web.png)

[Quick Start](#-quick-start) · [Features](#-features) · [Documentation](#-documentation) · [Contributing](./CONTRIBUTING.md)

</div>

---

## The Story

I gave an AI agent a real task — not autocomplete, a real engineering problem. It checked the code, read the logs, queried the database, and came back with the answer. That was the moment. *This thing can actually work.*

Within a week I was running 35 agents across terminals. They were productive, but they couldn't talk to each other. I became the human message bus — copying context from one terminal, pasting into another. I was the bottleneck in my own AI team.

**So I built AI Maestro** — one dashboard to see every agent, on every machine, with persistent memory and direct agent-to-agent communication. Today I run 80+ agents across multiple computers, building real companies with them every day.

**What makes this different:**
- **Works with any AI agent** — Claude Code, Aider, Cursor, Copilot, your own scripts. We don't lock you in.
- **Multi-machine from day one** — Peer mesh network with no central server. Nobody else does this.
- **Agents that communicate** — The Agent Messaging Protocol (AMP) lets agents coordinate directly. You orchestrate, they collaborate.

---

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

This installs everything you need:
- AI Maestro dashboard and service
- Agent messaging system (AMP)
- Claude Code plugin with 5 skills and 32 CLI scripts

**Time:** 5-10 minutes · **Requires:** Node.js 18+, tmux

<details>
<summary>Windows (WSL2) / Linux notes</summary>

**Windows:** Install WSL2 first (`wsl --install` in PowerShell as Admin), then run the curl command inside Ubuntu. [Full guide](./docs/WINDOWS-INSTALLATION.md)

**Linux:** Ensure build tools are installed: `sudo apt install tmux build-essential`
</details>

<details>
<summary>Manual install</summary>

```bash
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro
yarn install
yarn dev
```

See [QUICKSTART.md](./docs/QUICKSTART.md) for detailed setup options.
</details>

Dashboard opens at `http://localhost:23000`

---

## Features

Every feature was born from a real problem. We built them in the order we needed them.

### One Dashboard

*I had 35 terminals and couldn't tell which was which.*

See and manage all your AI agents in one place. Create agents from the UI, organize them with smart naming (`project-backend-api` becomes a 3-level tree with auto-coloring), and switch between any agent with a click. Auto-discovers your existing tmux sessions.

### Any Machine

*My Mac Mini was sitting there idle. What if I ran agents on that too?*

A peer mesh network where every machine is equal. Add a computer, it joins the mesh. Every agent on every machine, visible from one dashboard. Use each machine for what it's best at — Mac for iOS builds, Linux for Docker, cloud for heavy compute. **No central server required.**

### Agent Messaging

*I was the mailman — copying messages between agents because they couldn't talk to each other.*

The [Agent Messaging Protocol (AMP)](https://agentmessaging.org) gives your agents email-like communication. Priority levels, message types, cryptographic signatures, and push notifications. Tell your agent *"send a message to backend about the deployment"* — it just works. Agents coordinate directly while you manage the big picture.

### Gateways

*A friend in Singapore wanted his agents to talk to mine. But I didn't want to give him access to my network.*

Connect your AI agents to [Slack](https://github.com/23blocks-OS/aimaestro-gateways), Discord, Email, and WhatsApp through organizational gateways. Smart routing (`@AIM:agent-name`), thread-aware responses, and content security with 34 prompt injection patterns detected at the gateway — before any agent sees the message.

### Persistent Memory

*Every morning, my agents woke up with amnesia.*

Three layers of intelligence that grow over time: **Memory** (agents remember past conversations and decisions), **Code Graph** (interactive visualization of your entire codebase with delta indexing), and **Documentation** (auto-generated, searchable docs from your code). Agents get smarter the longer they work with you.

### Work Coordination

*Talking isn't working. I needed agents to coordinate on actual deliverables.*

Assemble agents into teams, run meetings in split-pane war rooms, and track tasks on a full Kanban board with drag-and-drop, dependencies, and 5 status columns. Cross-machine teams work seamlessly. This is project management for your AI workforce.

### Agent Identity

*At 80 agents, they all looked the same.*

Custom avatars, personality profiles, and visual presence for every agent. When an agent has a face and a role, you instinctively assign it the right work — just like a real team.

---

## Who Is This For

**Developers running multiple AI agents.** If you have 3+ agents and you're switching between terminals, losing context, and playing messenger — this is for you. Works with Claude Code, Aider, Cursor, GitHub Copilot, or any terminal-based AI.

**Teams coordinating AI-assisted work.** Multiple developers, multiple agents, multiple machines. One dashboard. Agent-to-agent messaging replaces you as the bottleneck.

**Creators and operators** who want to connect AI agents to the outside world through Slack, Discord, or Email — without exposing their infrastructure.

---

<details>
<summary><b>Screenshots</b></summary>

<div align="center">
<img src="./docs/images/aimaestro-mobile.png" alt="Mobile View" width="280"/>
<img src="./docs/images/aimaestro-sidebar.png" alt="Sidebar" width="280"/>
</div>

**Code Graph** — Interactive codebase visualization

![Code Graph](./docs/images/code_graph01.png)

**Agent Inbox** — Direct agent-to-agent messaging

![Agent Messaging](./docs/images/agent-inbox.png)

</details>

---

## Documentation

**Getting Started:** [Quick Start](./docs/QUICKSTART.md) · [Core Concepts](./docs/CONCEPTS.md) · [Use Cases](./docs/USE-CASES.md)

**Multi-Machine:** [Setup Tutorial](./docs/SETUP-TUTORIAL.md) · [Network Access](./docs/NETWORK-ACCESS.md)

**Agent Communication:** [Messaging Guide](./docs/AGENT-MESSAGING-GUIDE.md) · [Architecture](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)

**Agent Intelligence:** [Intelligence Guide](./docs/AGENT-INTELLIGENCE.md) · [Code Graph](./docs/images/code_graph01.png)

**Operations:** [Operations Guide](./docs/OPERATIONS-GUIDE.md) · [Troubleshooting](./docs/TROUBLESHOOTING.md) · [Security](./SECURITY.md)

**Extend:** [Plugin Guide](./plugin/README.md) · [Windows Install](./docs/WINDOWS-INSTALLATION.md)

---

## What's Next

- Agent search and filtering across the entire mesh
- Agent playback — time-travel through agent sessions
- Performance analytics dashboard

See the full [roadmap](https://github.com/23blocks-OS/ai-maestro/issues) and [join the discussion](https://github.com/23blocks-OS/ai-maestro/discussions).

---

## Contributing

We love contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

- [Report a bug](https://github.com/23blocks-OS/ai-maestro/issues)
- [Request a feature](https://github.com/23blocks-OS/ai-maestro/issues/new?labels=enhancement)

<details>
<summary><b>Acknowledgments</b></summary>

Built with [Next.js](https://nextjs.org/), [xterm.js](https://xtermjs.org/), [CozoDB](https://www.cozodb.org/), [ts-morph](https://ts-morph.com/), [tmux](https://github.com/tmux/tmux), and [Claude Code](https://claude.ai).

</details>

---

## License

MIT — see [LICENSE](./LICENSE). Free for any purpose, including commercial.

---

<div align="center">

**Made with love in Boulder, Colorado**

[Juan Pelaez](https://x.com/jkpelaez) · [23blocks](https://23blocks.com)

*Built by AI agents, for AI agents*

[Star us on GitHub](https://github.com/23blocks-OS/ai-maestro)

</div>
