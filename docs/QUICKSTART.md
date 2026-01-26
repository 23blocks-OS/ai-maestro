# AI Maestro: Quick Start Guide

Get AI Maestro running in 5 minutes.

## Prerequisites

- macOS 12.0+ (Monterey or later) OR Windows 10+ (WSL2) OR Linux
- Node.js 18.17+ or 20.x
- tmux 3.0+

```bash
# macOS: Install dependencies (if not already installed)
brew install node tmux

# Linux/WSL: Install dependencies
sudo apt-get install -y nodejs npm tmux
```

---

## Choose Your Installation Path

AI Maestro offers different installation options depending on your needs:

| What You Want | Installation Method | Time |
|---------------|---------------------|------|
| **Full AI agent orchestration** (dashboard, memory, messaging, all skills) | [Full Install](#full-installation) | 5-10 min |
| **Just the planning skill** (no service needed) | [Plugin Only](#plugin-only-skills) | 1 min |
| **Try skills before committing** | [Plugin Only](#plugin-only-skills), then [Full Install](#full-installation) | 1 min + 5 min |

---

## Full Installation

### Option A: One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

**Unattended installation** (for CI/CD, scripts, WSL):
```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh -s -- -y --auto-start
```

This handles everything: prerequisites, installation, configuration. The `-y` flag skips all prompts.

**What gets installed:**
- AI Maestro service (localhost:23000)
- Web dashboard for managing agents
- 32 CLI scripts in `~/.local/bin/`
- 5 Claude Code skills in `~/.claude/skills/`
- Prerequisites (Node.js, tmux, etc.) if needed

### Option B: Manual Install

```bash
# Clone the repository
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro

# Install dependencies
yarn install
# or: npm install

# Build the application
yarn build
# or: npm run build

# Install CLI scripts and skills
./install-messaging.sh -y
```

### Start AI Maestro

**Development Mode:**
```bash
yarn dev
# or: npm run dev
```

**Production Mode (Recommended):**
```bash
# Install pm2 globally
npm install -g pm2

# Start with pm2
pm2 start ecosystem.config.cjs

# Save pm2 process list
pm2 save

# Enable auto-start on boot
pm2 startup
# Follow the command it shows
```

### Open in Browser

```bash
open http://localhost:23000
```

You're done! AI Maestro is now running with all features.

---

## Plugin Only (Skills)

If you just want Claude Code skills without running the full AI Maestro service:

```bash
/plugin marketplace add 23blocks-OS/ai-maestro
/plugin install ai-maestro@ai-maestro-marketplace
```

> **IMPORTANT: Service Dependency**
>
> | Skill | Works Without Service? |
> |-------|------------------------|
> | `planning` | **YES** - Standalone |
> | `memory-search` | NO - needs AI Maestro running |
> | `docs-search` | NO - needs AI Maestro running |
> | `graph-query` | NO - needs AI Maestro running |
> | `agent-messaging` | NO - needs AI Maestro running |
>
> **Only the `planning` skill works standalone.** For all other skills, install the full AI Maestro service.

The `planning` skill helps you stay focused on complex tasks by creating persistent markdown files:
- `task_plan.md` - Your implementation plan
- `findings.md` - Research and discoveries
- `progress.md` - Step-by-step tracking

---

## First Steps

### Create Your First Agent

1. Click the **+** button in the sidebar
2. Enter an agent name (e.g., `test-my-first-agent`)
   - Use format: `project-category-name` for automatic grouping
   - Example: `apps-website-frontend`
3. (Optional) Set working directory
4. Click **Create Agent**

The agent will appear in the sidebar. Click it to open the terminal.

### Test the Terminal

1. Click on your newly created agent
2. Type in the terminal: `echo "Hello from AI Maestro"`
3. Try some commands:
   ```bash
   pwd           # See current directory
   ls            # List files
   claude        # Start Claude Code (if installed)
   ```

### Add Agent Notes

1. Scroll down below the terminal
2. Click **Notes** section (if collapsed)
3. Type notes about what this agent is working on
4. Notes auto-save to localStorage

---

## Installation Comparison

| Feature | Full Install | Plugin Only |
|---------|--------------|-------------|
| Web dashboard | ✅ | ❌ |
| Agent management | ✅ | ❌ |
| Memory search skill | ✅ | ❌ (needs service) |
| Docs search skill | ✅ | ❌ (needs service) |
| Graph query skill | ✅ | ❌ (needs service) |
| Agent messaging skill | ✅ | ❌ (needs service) |
| **Planning skill** | ✅ | ✅ |
| CLI scripts in PATH | ✅ | ❌ |
| Hooks (session tracking) | ✅ | ❌ (needs service) |
| Peer mesh network | ✅ | ❌ |
| Code graph visualization | ✅ | ❌ |

---

## Next Steps

### Connect a Peer (Optional)

Want to manage agents across multiple machines? See [Setup Tutorial](./SETUP-TUTORIAL.md).

### Understand the Architecture

Read the [Concepts Guide](./CONCEPTS.md) to learn about:
- Localhost vs Remote Hosts
- Peer mesh network
- Security model

### See Real-World Examples

Check out [Use Cases](./USE-CASES.md) for inspiration on how to leverage multiple machines.

---

## Common Commands

```bash
# Start AI Maestro (development)
yarn dev

# Start AI Maestro (production with pm2)
pm2 start ai-maestro

# Stop AI Maestro
pm2 stop ai-maestro

# Restart AI Maestro
pm2 restart ai-maestro

# View logs
pm2 logs ai-maestro

# Check status
pm2 status
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Shift + PageUp** | Scroll up in terminal |
| **Shift + PageDown** | Scroll down in terminal |
| **Cmd + C** | Copy selected text |
| **Cmd + V** | Paste in terminal |

---

## Tips

- **Agent Naming:** Use `level1-level2-name` format for automatic hierarchical organization
  - Example: `clients-acme-frontend` groups under "clients" → "acme"

- **Multiple Agents:** Create as many as you need - they're organized automatically

- **Agent Notes:** Document what each agent is working on

- **Settings:** Click Settings (bottom of sidebar) to configure remote hosts

- **Immersive Mode:** Click "Immersive Experience" for full-screen terminal view

---

## Troubleshooting

### AI Maestro won't start

```bash
# Check if port 23000 is in use
lsof -i :23000

# Kill process using port 23000
kill -9 <PID>

# Try different port
PORT=3000 yarn dev
```

### Can't create agents

```bash
# Check if tmux is installed
tmux -V

# Test tmux manually
tmux new-session -s test
# Press Ctrl+B, then D to detach
tmux ls
# Should show: test: 1 windows
```

### Skills not working (Plugin install)

If you installed via plugin marketplace and skills aren't working:

1. **Check if AI Maestro is running:** `curl http://localhost:23000/api/sessions`
2. **If not running:** Either start it (`cd ~/ai-maestro && yarn dev`) or use only the `planning` skill
3. **If not installed:** Run the [full installation](#full-installation)

### Terminal is blank

1. Refresh the page (Cmd + R)
2. Click refresh button in sidebar
3. Check browser console for errors (F12)

---

## Getting Help

- **Documentation:** [Full Docs](../README.md)
- **Issues:** [GitHub Issues](https://github.com/23blocks-OS/ai-maestro/issues)
- **Concepts:** [Architecture Guide](./CONCEPTS.md)
- **Twitter:** [@jkpelaez](https://x.com/jkpelaez)

---

## Uninstall

```bash
# Stop AI Maestro
pm2 stop ai-maestro
pm2 delete ai-maestro
pm2 save

# Remove from auto-start
pm2 unstartup

# Delete repository
cd ..
rm -rf ai-maestro

# Remove pm2 (optional)
npm uninstall -g pm2

# Remove plugin (if installed via marketplace)
/plugin uninstall ai-maestro@ai-maestro-marketplace
/plugin marketplace remove ai-maestro-marketplace
```

---

**Ready to scale?** Check out the [Setup Tutorial](./SETUP-TUTORIAL.md) to connect peers and distribute your AI coding workforce across multiple machines!
