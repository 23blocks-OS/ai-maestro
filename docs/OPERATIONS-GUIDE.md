# Operations Guide: AI Maestro

**Version:** 1.0.0
**Last Updated:** 2025-10-09
**Phase:** 1 - Local Agents with Full UI Management

---

## Overview

This guide explains how to create and manage AI coding agents using the AI Maestro dashboard. Works with **Claude Code, OpenAI Codex, GitHub Copilot CLI, Cursor, Aider**, and any other terminal-based AI agent. The dashboard **automatically discovers** existing agents from `tmux ls` and provides full agent management (create, rename, delete) directly from the UI!

---

## Prerequisites Checklist

Before starting, ensure you have:

- ✅ macOS with all requirements installed (see [REQUIREMENTS.md](./REQUIREMENTS.md))
- ✅ tmux installed and working (`tmux -V`)
- ✅ **Your AI agent installed**: Claude Code, Aider, Copilot CLI, Cursor, etc.
- ✅ AI agent authenticated (e.g., `claude login`, `aider --check`, etc.)
- ✅ Dashboard installed (`yarn install` completed)

---

## 1. Quick Start: Your First Agent

### Step 1: Create a tmux Agent

```bash
# Navigate to your project directory
cd ~/projects/my-app

# Start a new tmux session with a descriptive name
tmux new-session -s my-app-dev

# You're now inside tmux - your prompt should show a green bar at bottom
```

### Step 2: Start Your AI Tool

```bash
# Inside the tmux session, start your AI assistant
# Choose one:
claude              # Claude Code
aider               # Aider AI
copilot             # GitHub Copilot CLI
cursor              # Cursor AI
# or any other terminal-based AI tool

# Your AI agent will initialize
# You can now start coding with AI assistance
```

### Step 3: Detach from tmux

```bash
# Press: Ctrl+B, then D (hold Ctrl+B, release, then press D)
# This detaches from tmux but keeps the agent running

# You'll return to your normal terminal
# The tmux session continues running in the background
```

### Step 4: Start the Dashboard

```bash
# In a new terminal window, navigate to the dashboard
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Start the dashboard
yarn dev

# Wait for: "ready - started server on 0.0.0.0:23000"
```

**⚠️ Network Access Warning:** By default, AI Maestro is accessible on your local network at port 23000. This means anyone on your WiFi can access it. See the [Security](#security) section for important information.

### Step 5: Open the Dashboard

```bash
# Open in your default browser
open http://localhost:23000

# Or manually visit: http://localhost:23000

# From another device on your network (tablet, phone, etc.)
# Visit: http://YOUR-LOCAL-IP:23000
# To find your local IP: ifconfig | grep "inet " | grep -v 127.0.0.1
```

**🎉 Success!** You should see "my-app-dev" in the sidebar. Click it to view the terminal.

---

## 2. Agent Naming Best Practices

The dashboard automatically organizes agents hierarchically using forward slashes in names. This creates a beautiful, color-coded sidebar!

### Hierarchical Naming Pattern (RECOMMENDED)

Use forward slashes to create 3-level organization:

```bash
# Format: category/subcategory/agent-name
fluidmind/agents/backend-architect
fluidmind/agents/frontend-developer
fluidmind/experiments/api-tester

ecommerce/development/cart-api
ecommerce/development/checkout-flow
ecommerce/testing/integration-tests

personal/projects/blog-redesign
personal/learning/rust-tutorial
```

**Result in Dashboard:**
- **Level 1 (category)**: "fluidmind" - Gets a unique color and icon
- **Level 2 (subcategory)**: "agents" - Folder under category
- **Level 3 (agent)**: "backend-architect" - Individual terminal

### Alternative: Simple Names

```bash
# Pattern: project-purpose
tmux new-session -s ecommerce-api
tmux new-session -s blog-frontend

# These appear under "default" category
```

### Naming Rules

- ✅ Use forward slashes for hierarchy (category/sub/name)
- ✅ Use lowercase letters, numbers, hyphens, underscores
- ✅ Keep names descriptive and meaningful
- ✅ Same category name = same color (automatic!)
- ❌ Avoid spaces (use hyphens instead)
- ❌ Avoid special characters (!, @, #, etc.)
- ❌ More than 3 levels (category/sub1/sub2/name)

---

## 3. UI-Based Agent Management

You can now manage agents directly from the dashboard UI!

### Create a New Agent (From UI)

1. Click the **"+" (Create)** button in the sidebar header
2. Enter agent name (use forward slashes for hierarchy)
3. Optionally specify working directory
4. Click "Create Agent"
5. Agent appears immediately in sidebar

**Example:**
- Name: `fluidmind/agents/api-developer`
- Working Dir: `/Users/you/projects/api`

### Rename an Agent (From UI)

1. Hover over any agent in the sidebar
2. Click the **Edit** icon that appears
3. Enter new name
4. Click "Rename"
5. Dashboard updates immediately

### Delete an Agent (From UI)

1. Hover over any agent in the sidebar
2. Click the **Delete** icon that appears
3. Confirm deletion in modal
4. Agent is terminated and removed

**Warning:** Deletion is permanent and cannot be undone!

## 4. Command-Line Agent Management

You can also manage agents via terminal commands:

### List All Sessions

```bash
# Show all running tmux sessions
tmux list-sessions
# or shorthand:
tmux ls

# Example output:
# fluidmind/agents/backend: 1 windows (created Wed Jan 10 14:23:45 2025)
# ecommerce/api: 1 windows (created Wed Jan 10 15:10:12 2025)
```

### Attach to an Agent

```bash
# Attach to a specific agent
tmux attach-session -t "fluidmind/agents/backend"
# or shorthand:
tmux a -t "fluidmind/agents/backend"

# Note: Use quotes for names with slashes!
```

### Kill an Agent

```bash
# Kill a specific agent (CAUTION: Permanent!)
tmux kill-session -t "my-app-dev"

# Kill all agents (CAUTION!)
tmux kill-server
```

### Rename an Agent

```bash
# From inside the agent:
# Press Ctrl+B, then $
# Type new name and press Enter

# From outside the agent:
tmux rename-session -t "old-name" "new-name"
```

---

## 4. Working with Multiple Agents

### Create Multiple Agents

```bash
# Create first agent (with Claude)
cd ~/projects/frontend
tmux new-session -s frontend-dev -d
tmux send-keys -t frontend-dev 'claude' C-m  # or aider, cursor, copilot, etc.

# Create second agent (with Aider)
cd ~/projects/backend
tmux new-session -s backend-api -d
tmux send-keys -t backend-api 'aider' C-m

# Create third agent (with Copilot)
cd ~/projects/database
tmux new-session -s db-migration -d
tmux send-keys -t db-migration 'copilot' C-m

# All three agents are now running in background
# Dashboard will show all three
```

### Switch Between Agents in Dashboard

1. Open dashboard: http://localhost:23000
2. Click any agent name in the left sidebar
3. Terminal content updates instantly
4. Previous agents keep running in background

---

## 5. Agent Lifecycle

### Agent States

**Active** 🟢
- AI agent is running
- You or dashboard is interacting with it
- Terminal is responsive

**Idle** 🟡
- Agent running but no recent activity
- AI tool still active
- Safe to interact

**Ended** ⚪
- tmux session was killed
- AI tool exited
- Appears in dashboard until refresh

### Typical Workflow

```bash
# Morning: Start work sessions
cd ~/projects/app-a && tmux new -s app-a -d && tmux send-keys -t app-a 'claude' C-m
cd ~/projects/app-b && tmux new -s app-b -d && tmux send-keys -t app-b 'aider' C-m

# Start dashboard
cd ~/agents-web && yarn dev

# Work throughout the day using the dashboard

# Evening: Review what's running
tmux ls

# Keep sessions running overnight (optional)
# Or clean up:
tmux kill-session -t app-a
tmux kill-session -t app-b
```

---

## 6. Automation Scripts

### Helper: Start Agent with AI Tool

Save as `~/bin/start-ai-session`:

```bash
#!/bin/bash

# Usage: start-ai-session <agent-name> <ai-command> [directory]
# Example: start-ai-session my-project claude ~/projects/app
# Example: start-ai-session backend aider ~/projects/api

SESSION_NAME=$1
AI_COMMAND=${2:-claude}  # Default to claude if not specified
WORK_DIR=${3:-$(pwd)}

if [ -z "$SESSION_NAME" ]; then
    echo "Usage: start-ai-session <agent-name> <ai-command> [directory]"
    echo "Example: start-ai-session my-project claude ~/projects/app"
    echo "AI commands: claude, aider, copilot, cursor, etc."
    exit 1
fi

# Check if agent already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "❌ Agent '$SESSION_NAME' already exists"
    echo "   Attach: tmux a -t $SESSION_NAME"
    exit 1
fi

# Create agent in background
cd "$WORK_DIR"
tmux new-session -d -s "$SESSION_NAME" -c "$WORK_DIR"

# Start AI tool in the agent
tmux send-keys -t "$SESSION_NAME" "$AI_COMMAND" C-m

echo "✅ Agent '$SESSION_NAME' created with $AI_COMMAND"
echo "   Directory: $WORK_DIR"
echo "   View in dashboard: http://localhost:23000"
echo "   Attach manually: tmux a -t $SESSION_NAME"
```

**Make executable:**
```bash
chmod +x ~/bin/start-ai-session

# Add ~/bin to PATH in ~/.zshrc or ~/.bash_profile:
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Usage:**
```bash
# Start agent with Claude in current directory
start-ai-session my-project claude

# Start agent with Aider in specific directory
start-ai-session api-work aider ~/projects/api

# Start multiple agents with different AI tools
start-ai-session frontend claude ~/projects/web
start-ai-session backend aider ~/projects/api
start-ai-session mobile cursor ~/projects/app
```

### Helper: List Active Sessions

Save as `~/bin/list-ai-sessions`:

```bash
#!/bin/bash

echo "🎯 Active AI Agent Sessions:"
echo ""

if ! tmux has-session 2>/dev/null; then
    echo "No active sessions"
    exit 0
fi

tmux list-sessions -F '#{session_name} | Created: #{session_created_string} | Windows: #{session_windows}' | \
while IFS='|' read -r name created windows; do
    echo "📁 $name"
    echo "   $created"
    echo "   $windows"
    echo ""
done

echo "💡 Tip: View all sessions in dashboard at http://localhost:23000"
```

**Make executable and run:**
```bash
chmod +x ~/bin/list-ai-sessions
list-ai-sessions
```

### Helper: Kill All AI Sessions

Save as `~/bin/cleanup-ai-sessions`:

```bash
#!/bin/bash

echo "🧹 Cleaning up AI agent sessions..."

if ! tmux has-session 2>/dev/null; then
    echo "No active sessions to clean up"
    exit 0
fi

# List sessions
echo ""
echo "Current sessions:"
tmux ls

echo ""
read -p "Kill ALL sessions? (yes/no): " CONFIRM

if [ "$CONFIRM" = "yes" ]; then
    tmux kill-server
    echo "✅ All sessions terminated"
else
    echo "❌ Cancelled"
fi
```

**Make executable:**
```bash
chmod +x ~/bin/cleanup-ai-sessions
```

---

## 7. Agent Notes Feature

Each agent has a built-in notes area for capturing important information while working with your AI agent.

### Using Agent Notes

1. **Expand Notes**: Click "Show Agent Notes" button below the terminal (if collapsed)
2. **Take Notes**: Type directly in the textarea - supports copy/paste
3. **Auto-Save**: Notes save automatically to localStorage (per-agent)
4. **Collapse**: Click the down arrow to hide notes and maximize terminal space

### Notes Use Cases

- **Track decisions**: Record architectural decisions made with your AI agent
- **Save commands**: Copy/paste useful commands your AI suggests
- **Todo lists**: Keep track of what's left to implement
- **Context**: Notes for when you return to the agent later
- **Code snippets**: Temporary storage for code before committing

**Note:** Notes are stored in browser localStorage and persist between dashboard restarts!

---

## 8. Dashboard Operations

### Starting the Dashboard

```bash
# Navigate to dashboard directory
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Development mode (with hot reload)
yarn dev

# Production mode (with PM2 for auto-restart)
yarn build
pm2 start server.mjs --name ai-maestro

# Custom port and hostname
PORT=3001 yarn dev
HOSTNAME=localhost PORT=3001 yarn dev  # Localhost-only for better security

# Run localhost-only (more secure, not accessible on network)
HOSTNAME=localhost yarn dev
```

### Accessing the Dashboard

```bash
# Default URL (from same machine)
open http://localhost:23000

# From another device on your local network
# 1. Find your local IP address:
ifconfig | grep "inet " | grep -v 127.0.0.1
# Example output: inet 10.0.0.87 ...

# 2. On your other device (tablet, phone, another computer):
# Visit: http://10.0.0.87:23000
# (Replace 10.0.0.87 with your actual local IP)

# Custom port
open http://localhost:3001
```

### Security

**⚠️ Important:** By default, AI Maestro is accessible from any device on your local network:
- ✅ **Convenient** - Access from tablets, phones, other computers
- ⚠️ **No authentication** - Anyone on your WiFi can access it
- ⚠️ **Unencrypted** - WebSocket connections use ws:// (not wss://)
- ⚠️ **Full terminal access** - Anyone connected can run commands

**Safe for:**
- Home networks (trusted WiFi)
- Private office networks
- Development on trusted LANs

**NOT safe for:**
- Public WiFi (coffee shops, airports)
- Shared office WiFi with untrusted users
- Exposing to the internet

**To run localhost-only (more secure):**
```bash
HOSTNAME=localhost PORT=3000 yarn dev
```

See [SECURITY.md](../SECURITY.md) for full security details.

### Stopping the Dashboard

```bash
# If running with yarn dev: Press Ctrl+C in the terminal

# If running with PM2:
pm2 stop ai-maestro
pm2 delete ai-maestro  # To remove from PM2 completely

# If running in background, find and kill the process:
lsof -i :23000
kill -9 <PID>
```

---

## 8. SSH Configuration for Git Operations

### The Problem

When working with AI agents in tmux (especially after system restarts), you may encounter:
```
git@gitlab.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**Root cause:** The SSH agent socket path (`SSH_AUTH_SOCK`) changes between system restarts. tmux sessions started at boot don't inherit the updated socket path.

### The Solution: Stable SSH Symlink

Create a stable symlink that tmux always uses, which your shell keeps updated with the current SSH agent socket.

### One-Time Setup

**Step 1: Configure tmux to use a stable symlink**

Add to `~/.tmux.conf`:
```bash
# SSH Agent Configuration - AI Maestro
# This tells tmux to use a stable symlink instead of the changing socket path
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock
```

**Step 2: Configure your shell to maintain the symlink**

Add to `~/.zshrc` (or `~/.bashrc` if using bash):
```bash
# SSH Agent for tmux - AI Maestro
# Create/update stable symlink to current SSH agent socket
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
```

**Step 3: Apply the configuration**

```bash
# Create initial symlink
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock

# Reload tmux configuration
tmux source-file ~/.tmux.conf

# Reload shell configuration (or open new terminal)
source ~/.zshrc
```

### How It Works

1. **SSH Agent** creates a socket at `/private/tmp/com.apple.launchd.XXXXX/Listeners` (path changes on restart)
2. **Your shell** keeps `~/.ssh/ssh_auth_sock` symlinked to the current socket
3. **tmux sessions** use the stable `~/.ssh/ssh_auth_sock` path
4. **Result:** Git/SSH operations work in all tmux sessions, even after restarts

### Verifying It Works

**Test in a new tmux session:**
```bash
# Create test agent
tmux new-session -s test-ssh -d

# Test SSH
tmux send-keys -t test-ssh 'ssh-add -l' C-m
sleep 1
tmux capture-pane -t test-ssh -p | tail -5

# Should show your SSH keys
# Clean up
tmux kill-session -t test-ssh
```

**Or test directly:**
```bash
# Should show your SSH keys
SSH_AUTH_SOCK=~/.ssh/ssh_auth_sock ssh-add -l

# Should authenticate successfully
SSH_AUTH_SOCK=~/.ssh/ssh_auth_sock ssh -T git@github.com
```

### Fixing Existing Sessions

If you have tmux sessions that were created before this setup, they'll still have the old SSH config. Two options:

**Option 1: Restart the shell (quick)**
```bash
# In AI Maestro terminal or attached tmux session
exec $SHELL

# Then test
git push  # Should work now
```

**Option 2: Create new sessions**

New sessions from AI Maestro will automatically have SSH configured correctly.

### Troubleshooting SSH Issues

**Problem: SSH still not working in tmux**

1. **Verify symlink exists and points to correct socket:**
   ```bash
   ls -la ~/.ssh/ssh_auth_sock
   # Should show symlink to /private/tmp/com.apple.launchd.*/Listeners
   ```

2. **Verify tmux is using the symlink:**
   ```bash
   tmux show-environment | grep SSH_AUTH_SOCK
   # Should show: SSH_AUTH_SOCK=/Users/you/.ssh/ssh_auth_sock
   ```

3. **Recreate the symlink:**
   ```bash
   rm ~/.ssh/ssh_auth_sock
   ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
   tmux source-file ~/.tmux.conf
   ```

4. **Check SSH agent is running:**
   ```bash
   ssh-add -l
   # Should list your keys, not "Could not open a connection"
   ```

**Problem: Works in terminal but not in AI Maestro**

This means the shell environment in your tmux session needs refreshing:
```bash
# In the AI Maestro terminal
exec $SHELL
```

**Problem: SSH works but git still fails**

Check your git remote URL:
```bash
git remote -v

# Should use SSH format:
# origin  git@github.com:user/repo.git (fetch)

# NOT HTTPS format:
# origin  https://github.com/user/repo.git (fetch)

# Fix if needed:
git remote set-url origin git@github.com:user/repo.git
```

---

## 9. Troubleshooting

### Services Not Running After Restart (MOST COMMON)

**Problem:** After restarting your Mac, the dashboard shows "Socket Error" or "Cannot connect" when trying to create sessions.

**Cause:** The tmux server is not running. tmux sessions don't survive system restarts by default.

**Immediate Fix:**
```bash
# Create a tmux session to start the tmux server
tmux new-session -s default -d

# Now refresh your dashboard - it should work
```

**Permanent Fix - Auto-start tmux on Login:**

Create a LaunchAgent to automatically start tmux after every restart:

```bash
# 1. Find your tmux path
which tmux
# Output example: /opt/homebrew/bin/tmux

# 2. Create the LaunchAgent directory (if it doesn't exist)
mkdir -p ~/Library/LaunchAgents

# 3. Create the LaunchAgent file
cat > ~/Library/LaunchAgents/com.user.tmux.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.tmux</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/tmux</string>
        <string>new-session</string>
        <string>-d</string>
        <string>-s</string>
        <string>default</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/tmux-launchagent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/tmux-launchagent.error.log</string>
</dict>
</plist>
EOF

# 4. Update the tmux path in the file if yours is different
# Edit the file and replace /opt/homebrew/bin/tmux with your path from step 1

# 5. Load the LaunchAgent
launchctl load ~/Library/LaunchAgents/com.user.tmux.plist

# 6. Verify it's running
tmux ls
# Should show: default: 1 windows (created ...)
```

**Permanent Fix - Auto-start Dashboard with pm2:**

Configure pm2 to auto-start your dashboard on every restart:

```bash
# 1. Generate the pm2 startup script
pm2 startup
# This will output a sudo command - copy and run it

# 2. Save your current pm2 processes
pm2 save

# 3. Verify pm2 LaunchAgent was created
ls ~/Library/LaunchAgents/ | grep pm2
# Should show: pm2.yourusername.plist
```

**Verify Both Services:**
```bash
# Check tmux is running
tmux ls

# Check pm2 is running
pm2 list

# Check LaunchAgents are loaded
launchctl list | grep tmux
launchctl list | grep pm2
```

Now after every restart, both tmux and your dashboard will start automatically!

**⚠️ Important:** After setting up auto-start, also configure SSH for git operations. See [Section 8: SSH Configuration](#8-ssh-configuration-for-git-operations) for detailed setup to avoid "Permission denied (publickey)" errors.

---

### Git/SSH Permission Denied Errors

**Problem:** Getting `git@gitlab.com: Permission denied (publickey)` errors in tmux sessions.

**Solution:** This is an SSH configuration issue. Follow the comprehensive guide in [Section 8: SSH Configuration for Git Operations](#8-ssh-configuration-for-git-operations).

Quick fix for existing sessions:
```bash
# In AI Maestro terminal
exec $SHELL
```

---

### Agent Not Appearing in Dashboard

**Problem:** Created a tmux session but it doesn't show in the dashboard.

**Solution:**
```bash
# 1. Verify agent exists
tmux ls

# 2. Refresh dashboard in browser (Cmd+R or F5)

# 3. Check dashboard logs for errors
# Look in the terminal where you ran `yarn dev`

# 4. Restart dashboard
# Press Ctrl+C, then run `yarn dev` again
```

### Can't Connect to Agent in Dashboard

**Problem:** Agent appears in list but clicking it shows "Connection Error"

**Solution:**
```bash
# 1. Verify tmux session is actually running
tmux ls

# 2. Try attaching manually
tmux attach -t <agent-name>

# 3. If agent is frozen, kill and recreate it
tmux kill-session -t <agent-name>
start-ai-session <agent-name> claude  # or your preferred AI tool

# 4. Check dashboard WebSocket connection
# Open browser console (F12) and look for errors
```

### Terminal Not Responsive

**Problem:** Can see the terminal but typing doesn't work

**Solution:**
```bash
# 1. Click directly in the terminal area to focus it

# 2. Refresh the browser page

# 3. Check if your AI tool is still running in tmux:
tmux attach -t <agent-name>
# If your AI exited, restart it:
claude  # or aider, cursor, copilot, etc.

# 4. Check browser console for JavaScript errors
```

### Dashboard Won't Start

**Problem:** `yarn dev` fails with errors

**Solution:**
```bash
# 1. Check if port 23000 is in use
lsof -i :23000
kill -9 <PID>

# 2. Reinstall dependencies
rm -rf node_modules yarn.lock
yarn install

# 3. Check Node.js version
node --version  # Should be v18.17+ or v20.x

# 4. Try a different port
PORT=3001 yarn dev
```

### Agent Names Look Weird

**Problem:** Agent names contain strange characters or are too long

**Solution:**
```bash
# Rename the agent
tmux rename-session -t old-name new-clean-name

# Use proper naming conventions (see Section 2)
```

---

## 9. Best Practices

### Agent Organization

```bash
# Group related agents with prefixes
tmux new -s project-frontend
tmux new -s project-backend
tmux new -s project-database

# Use descriptive names that explain the task
tmux new -s fix-auth-bug      # ✅ Good
tmux new -s test              # ❌ Too vague

# One agent per distinct task or context
```

### Resource Management

```bash
# Check how many sessions you're running
tmux ls | wc -l

# Keep it reasonable (5-10 active sessions max)
# Kill old sessions you're done with
tmux kill-session -t completed-task
```

### Backup Important Agents

```bash
# Capture terminal content before killing agent
tmux capture-pane -pt <agent-name> -S - > ~/backups/agent-backup.txt

# Or ask your AI tool to save the conversation
# (e.g., "Please summarize our conversation and save it")
```

### Daily Workflow

```bash
# Morning routine
cd ~/agents-web && yarn dev &           # Start dashboard
start-ai-session main-work claude ~/projects
start-ai-session experiments aider ~/tests
open http://localhost:23000             # Open dashboard

# Evening routine
list-ai-sessions                        # Review active sessions
cleanup-ai-sessions                     # Kill all sessions (optional)
# Or keep them running overnight
```

---

## 10. Advanced Tips

### Auto-start Services on Boot

**⚠️ Important:** After a system restart, both tmux and the dashboard need to be running for AI Maestro to work.

For comprehensive setup instructions, see the **"Services Not Running After Restart"** section in [Troubleshooting (Section 8)](#8-troubleshooting).

Quick summary:
- **tmux auto-start**: Create a LaunchAgent to start tmux server on login
- **Dashboard auto-start**: Use `pm2 startup` and `pm2 save` to auto-start the dashboard
- **Verification**: Both services will start automatically after every restart

### Persistent Sessions Across Reboots

tmux sessions end when you restart your Mac. To persist them:

1. **tmux-resurrect plugin** - Save and restore tmux sessions
2. **systemd user services** (on Linux)
3. **Manual session recreation script** (run after reboot)

Example restoration script `~/bin/restore-sessions`:

```bash
#!/bin/bash

# Restore common sessions after reboot
start-ai-session main claude ~/projects/main
start-ai-session experiments aider ~/experiments
start-ai-session docs cursor ~/documentation

echo "✅ Sessions restored"
```

---

## 11. Quick Reference Card

### Essential Commands

```bash
# Agent Management
tmux new -s name              # Create agent
tmux ls                       # List agents
tmux a -t name                # Attach to agent
tmux kill-session -t name     # Kill agent

# Inside tmux
Ctrl+B, D                     # Detach
Ctrl+B, $                     # Rename agent
Ctrl+D                        # Exit AI tool (closes agent)

# Dashboard
yarn dev                      # Start dashboard
open http://localhost:23000   # Open dashboard
Ctrl+C                        # Stop dashboard
pm2 start server.mjs --name ai-maestro  # Start with PM2

# Helper Scripts (if created)
start-ai-session name agent   # Create agent with AI tool
list-ai-sessions              # List all agents
cleanup-ai-sessions           # Kill all agents
```

---

## 12. Next Steps

After mastering basic operations:

1. 📖 Read [UX-SPECIFICATIONS.md](./UX-SPECIFICATIONS.md) to understand all dashboard features
2. 🏗️ Read [TECHNICAL-SPECIFICATIONS.md](./TECHNICAL-SPECIFICATIONS.md) for architecture details
3. 🎨 Read [FRONTEND-IMPLEMENTATION.md](./FRONTEND-IMPLEMENTATION.md) if modifying the UI
4. 🚀 Explore Phase 2 features (agent creation from UI, remote agents)

---

## Support

Questions or issues?
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Review dashboard logs (terminal where `yarn dev` is running)
- Check tmux logs: `tmux list-sessions`
- Open an issue in the project repository

---

**Happy coding with your AI agents! 🤖**
