<div align="center">

# 🎼 AI Maestro

**Stop juggling terminal windows. Orchestrate your AI coding agents from one dashboard.**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/23blocks-OS/ai-maestro/releases)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](https://github.com/23blocks-OS/ai-maestro)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)

[Quick Start](#-quick-start) • [Features](#-features) • [Documentation](./docs) • [Contributing](./CONTRIBUTING.md)

</div>

---

## The Problem

You're using Claude Code for backend, Aider for frontend, and Cursor for docs. Each in its own terminal window. Each in a different tmux pane. You're constantly switching contexts, losing track of which agent is where, and your terminal tabs look like chaos.

## The Solution

![AI Maestro Dashboard](./docs/images/aiteam-web.png)

AI Maestro gives you one beautiful web dashboard for all your AI coding agents. Click between sessions instantly. Organize them hierarchically. Take notes. Never lose track again.

---

## ✨ Features

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
- **Auto-grouping**: Sessions with hyphens are automatically organized
- **Instant search**: Find any session immediately *(coming in v1.1)*

### Session Management
- **Create** sessions from the UI
- **Rename** with a click
- **Delete** when done
- **Notes** for each session (auto-saved to localStorage)
- **Auto-discovery**: Detects all your tmux sessions automatically

### Built for Speed
- WebSocket streaming for real-time terminal I/O
- No lag, no polling
- Keyboard shortcuts for power users
- Native macOS performance

---

## 🚀 Quick Start

### 1. Install

```bash
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro
yarn install
yarn dev
```

Dashboard opens at `http://localhost:23000`

**Network Access:** By default, AI Maestro is accessible on your local network at port 23000. See [Security](#-important-notes) for important information.

### 2. Create Your First Session

**Option A: From the UI** (Recommended)

1. Click the **"+" button** in the sidebar
2. Enter a session name using hyphens for hierarchy:
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

> **💡 Hierarchy Tip**: Session names with hyphens create automatic organization:
> - `project-backend` → 2 levels (project > backend)
> - `project-backend-api` → 3 levels (project > backend > api)
> - Each top level gets its own color automatically!

### 3. Start Coding

Your session is now live in the dashboard. Click to switch between sessions. Add notes. Organize your work. That's it.

---

## 📸 Screenshots

<details>
<summary><b>Hierarchical Session Organization</b></summary>

Sessions organized automatically using hyphens, with color coding and icons:

**Example session names:**
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
<summary><b>Session Notes</b></summary>

Take notes for each session. They're saved automatically to your browser:
- Track architectural decisions
- Save commands for later
- Keep TODO lists
- Leave context for tomorrow

</details>

---

## 🎯 Why AI Maestro?

**Problem**: Managing multiple AI agents is chaotic.
**Solution**: One dashboard to rule them all.

**Why not just use tmux directly?**
You can! AI Maestro is built on tmux. But instead of memorizing keybindings and switching between panes, you get:
- Visual organization
- Point-and-click switching
- Persistent notes
- Beautiful UI

**Is it just a tmux GUI?**
Think of it as tmux + organization + notes + visual hierarchy. You still have full access to your tmux sessions from the terminal.

---

## 📋 Requirements

- **macOS 12.0+** (Monterey or later)
- **Node.js 18.17+**
- **tmux 3.0+**
- **Your favorite AI agent** (Claude, Aider, Cursor, Copilot, etc.)

---

## 🛠️ Tech Stack

Built with modern, battle-tested tools:

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Terminal**: xterm.js with WebGL acceleration
- **Backend**: Custom Node.js server with WebSocket
- **Font**: Space Grotesk for a modern feel
- **Icons**: lucide-react

---

## 📚 Documentation

- **[Operations Guide](./docs/OPERATIONS-GUIDE.md)** - How to use AI Maestro
- **[Technical Specs](./docs/TECHNICAL-SPECIFICATIONS.md)** - Architecture deep-dive
- **[UX Specs](./docs/UX-SPECIFICATIONS.md)** - Design decisions
- **[Contributing](./CONTRIBUTING.md)** - How to contribute
- **[Security](./SECURITY.md)** - Security model

---

## 🗺️ Roadmap

### Phase 1 (Current) ✅
- Local tmux session management
- Hierarchical organization
- Dynamic color coding
- Session notes
- Full CRUD from UI

### Phase 2 (Q4 2025)
- [ ] Search & filter
- [ ] Export session transcripts

### Phase 3 (Future)
- [ ] Remote SSH sessions
- [ ] Session sharing
- [ ] AI-generated summaries

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

**To run localhost-only (more secure):**
```bash
HOSTNAME=localhost PORT=3000 yarn dev
```

**Additional Security:**
- No data sent over the internet (runs 100% locally)
- Notes stored in browser localStorage only
- tmux sessions run with your user permissions
- **Not for production use** without adding authentication & HTTPS

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
- [xterm.js](https://xtermjs.org/) - Terminal emulator
- [Next.js](https://nextjs.org/) - React framework
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
