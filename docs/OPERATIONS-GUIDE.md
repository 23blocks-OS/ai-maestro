# Operations Guide: Claude Code Dashboard

**Version:** 1.0.0
**Last Updated:** 2025-10-09
**Phase:** 1 - Local Sessions Only

---

## Overview

This guide explains how to start and manage Claude Code sessions so they appear in the dashboard. In Phase 1, the dashboard **automatically discovers** sessions from `tmux ls` - no manual configuration required!

---

## Prerequisites Checklist

Before starting, ensure you have:

- ✅ macOS with all requirements installed (see [REQUIREMENTS.md](./REQUIREMENTS.md))
- ✅ tmux installed and working (`tmux -V`)
- ✅ Claude Code CLI installed (`claude --version`)
- ✅ Claude Code authenticated (`claude login`)
- ✅ Dashboard installed (`yarn install` completed)

---

## 1. Quick Start: Your First Session

### Step 1: Create a tmux Session

```bash
# Navigate to your project directory
cd ~/projects/my-app

# Start a new tmux session with a descriptive name
tmux new-session -s my-app-dev

# You're now inside tmux - your prompt should show a green bar at bottom
```

### Step 2: Start Claude Code

```bash
# Inside the tmux session, start Claude Code
claude

# Claude Code will initialize and greet you
# You can now chat with Claude about your code
```

### Step 3: Detach from tmux

```bash
# Press: Ctrl+B, then D (hold Ctrl+B, release, then press D)
# This detaches from tmux but keeps the session running

# You'll return to your normal terminal
# The tmux session continues running in the background
```

### Step 4: Start the Dashboard

```bash
# In a new terminal window, navigate to the dashboard
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Start the dashboard
yarn dev

# Wait for: "ready - started server on 0.0.0.0:3000"
```

### Step 5: Open the Dashboard

```bash
# Open in your default browser
open http://localhost:3000

# Or manually visit: http://localhost:3000
```

**🎉 Success!** You should see "my-app-dev" in the sidebar. Click it to view the terminal.

---

## 2. Session Naming Best Practices

The dashboard discovers sessions automatically, so naming is important for organization.

### Recommended Naming Patterns

```bash
# Pattern: project-purpose
tmux new-session -s ecommerce-api
tmux new-session -s blog-frontend
tmux new-session -s admin-bugfix

# Pattern: client-project
tmux new-session -s acme-website
tmux new-session -s acme-backend

# Pattern: feature branches
tmux new-session -s feat-user-auth
tmux new-session -s fix-payment-bug

# Pattern: environments
tmux new-session -s dev-main
tmux new-session -s staging-test
```

### Naming Rules

- ✅ Use lowercase letters, numbers, hyphens, underscores
- ✅ Keep names under 30 characters
- ✅ Use descriptive names (not "session1", "test", etc.)
- ❌ Avoid spaces (use hyphens instead)
- ❌ Avoid special characters (!, @, #, etc.)

---

## 3. Managing Sessions

### List All Sessions

```bash
# Show all running tmux sessions
tmux list-sessions
# or shorthand:
tmux ls

# Example output:
# my-app-dev: 1 windows (created Wed Jan 10 14:23:45 2025)
# blog-fix: 1 windows (created Wed Jan 10 15:10:12 2025)
```

### Attach to a Session (Outside Dashboard)

```bash
# Attach to a specific session
tmux attach-session -t my-app-dev
# or shorthand:
tmux a -t my-app-dev

# Once attached, you'll see the live Claude Code session
# Detach again with: Ctrl+B, then D
```

### Kill a Session

```bash
# Kill a specific session (CAUTION: This ends the session permanently)
tmux kill-session -t my-app-dev

# Kill all sessions (CAUTION!)
tmux kill-server
```

### Rename a Session

```bash
# From inside the session:
# Press Ctrl+B, then $
# Type new name and press Enter

# From outside the session:
tmux rename-session -t old-name new-name
```

---

## 4. Working with Multiple Sessions

### Create Multiple Sessions

```bash
# Create first session (with Claude)
cd ~/projects/frontend
tmux new-session -s frontend-dev -d
tmux send-keys -t frontend-dev 'claude' C-m

# Create second session (with Claude)
cd ~/projects/backend
tmux new-session -s backend-api -d
tmux send-keys -t backend-api 'claude' C-m

# Create third session (with Claude)
cd ~/projects/database
tmux new-session -s db-migration -d
tmux send-keys -t db-migration 'claude' C-m

# All three sessions are now running in background
# Dashboard will show all three
```

### Switch Between Sessions in Dashboard

1. Open dashboard: http://localhost:3000
2. Click any session name in the left sidebar
3. Terminal content updates instantly
4. Previous sessions keep running in background

---

## 5. Session Lifecycle

### Session States

**Active** 🟢
- Claude Code is running
- You or dashboard is interacting with it
- Terminal is responsive

**Idle** 🟡
- Session running but no recent activity
- Claude Code still active
- Safe to interact

**Ended** ⚪
- tmux session was killed
- Claude Code exited
- Appears in dashboard until refresh

### Typical Workflow

```bash
# Morning: Start work sessions
cd ~/projects/app-a && tmux new -s app-a -d && tmux send-keys -t app-a 'claude' C-m
cd ~/projects/app-b && tmux new -s app-b -d && tmux send-keys -t app-b 'claude' C-m

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

### Helper: Start Session with Claude

Save as `~/bin/start-claude-session`:

```bash
#!/bin/bash

# Usage: start-claude-session <session-name> [directory]

SESSION_NAME=$1
WORK_DIR=${2:-$(pwd)}

if [ -z "$SESSION_NAME" ]; then
    echo "Usage: start-claude-session <session-name> [directory]"
    exit 1
fi

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "❌ Session '$SESSION_NAME' already exists"
    echo "   Attach: tmux a -t $SESSION_NAME"
    exit 1
fi

# Create session in background
cd "$WORK_DIR"
tmux new-session -d -s "$SESSION_NAME" -c "$WORK_DIR"

# Start Claude in the session
tmux send-keys -t "$SESSION_NAME" 'claude' C-m

echo "✅ Session '$SESSION_NAME' created"
echo "   Directory: $WORK_DIR"
echo "   View in dashboard: http://localhost:3000"
echo "   Attach manually: tmux a -t $SESSION_NAME"
```

**Make executable:**
```bash
chmod +x ~/bin/start-claude-session

# Add ~/bin to PATH in ~/.zshrc or ~/.bash_profile:
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Usage:**
```bash
# Start session in current directory
start-claude-session my-project

# Start session in specific directory
start-claude-session api-work ~/projects/api

# Start multiple sessions
start-claude-session frontend ~/projects/web
start-claude-session backend ~/projects/api
start-claude-session mobile ~/projects/app
```

### Helper: List Active Sessions

Save as `~/bin/list-claude-sessions`:

```bash
#!/bin/bash

echo "🎯 Active Claude Code Sessions:"
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

echo "💡 Tip: View all sessions in dashboard at http://localhost:3000"
```

**Make executable and run:**
```bash
chmod +x ~/bin/list-claude-sessions
list-claude-sessions
```

### Helper: Kill All Claude Sessions

Save as `~/bin/cleanup-claude-sessions`:

```bash
#!/bin/bash

echo "🧹 Cleaning up Claude Code sessions..."

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
chmod +x ~/bin/cleanup-claude-sessions
```

---

## 7. Dashboard Operations

### Starting the Dashboard

```bash
# Navigate to dashboard directory
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Development mode (with hot reload)
yarn dev

# Production mode
yarn build
yarn start

# Custom port
PORT=3001 yarn dev
```

### Accessing the Dashboard

```bash
# Default URL
open http://localhost:3000

# Custom port
open http://localhost:3001

# From another machine (if needed later)
# Note: Currently localhost-only, this won't work without config changes
```

### Stopping the Dashboard

```bash
# Press Ctrl+C in the terminal running the dashboard

# If running in background, find and kill the process:
lsof -i :3000
kill -9 <PID>
```

---

## 8. Troubleshooting

### Session Not Appearing in Dashboard

**Problem:** Created a tmux session but it doesn't show in the dashboard.

**Solution:**
```bash
# 1. Verify session exists
tmux ls

# 2. Refresh dashboard in browser (Cmd+R or F5)

# 3. Check dashboard logs for errors
# Look in the terminal where you ran `yarn dev`

# 4. Restart dashboard
# Press Ctrl+C, then run `yarn dev` again
```

### Can't Connect to Session in Dashboard

**Problem:** Session appears in list but clicking it shows "Connection Error"

**Solution:**
```bash
# 1. Verify tmux session is actually running
tmux ls

# 2. Try attaching manually
tmux attach -t <session-name>

# 3. If session is frozen, kill and recreate it
tmux kill-session -t <session-name>
start-claude-session <session-name>

# 4. Check dashboard WebSocket connection
# Open browser console (F12) and look for errors
```

### Terminal Not Responsive

**Problem:** Can see the terminal but typing doesn't work

**Solution:**
```bash
# 1. Click directly in the terminal area to focus it

# 2. Refresh the browser page

# 3. Check if Claude Code is still running in tmux:
tmux attach -t <session-name>
# If Claude exited, restart it:
claude

# 4. Check browser console for JavaScript errors
```

### Dashboard Won't Start

**Problem:** `yarn dev` fails with errors

**Solution:**
```bash
# 1. Check if port 3000 is in use
lsof -i :3000
kill -9 <PID>

# 2. Reinstall dependencies
rm -rf node_modules yarn.lock
yarn install

# 3. Check Node.js version
node --version  # Should be v18.17+ or v20.x

# 4. Try a different port
PORT=3001 yarn dev
```

### Session Names Look Weird

**Problem:** Session names contain strange characters or are too long

**Solution:**
```bash
# Rename the session
tmux rename-session -t old-name new-clean-name

# Use proper naming conventions (see Section 2)
```

---

## 9. Best Practices

### Session Organization

```bash
# Group related sessions with prefixes
tmux new -s project-frontend
tmux new -s project-backend
tmux new -s project-database

# Use descriptive names that explain the task
tmux new -s fix-auth-bug      # ✅ Good
tmux new -s test              # ❌ Too vague

# One session per distinct task or context
```

### Resource Management

```bash
# Check how many sessions you're running
tmux ls | wc -l

# Keep it reasonable (5-10 active sessions max)
# Kill old sessions you're done with
tmux kill-session -t completed-task
```

### Backup Important Sessions

```bash
# Capture terminal content before killing session
tmux capture-pane -pt <session-name> -S - > ~/backups/session-backup.txt

# Or use Claude to save the conversation
# (Ask Claude: "Please summarize our conversation and save it")
```

### Daily Workflow

```bash
# Morning routine
cd ~/agents-web && yarn dev &           # Start dashboard
start-claude-session main-work ~/projects
start-claude-session experiments ~/tests
open http://localhost:3000              # Open dashboard

# Evening routine
list-claude-sessions                    # Review active sessions
cleanup-claude-sessions                 # Kill all sessions (optional)
# Or keep them running overnight
```

---

## 10. Advanced Tips

### Auto-start Sessions on Boot

Create `~/Library/LaunchAgents/com.user.claude-dashboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.claude-dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd /Users/juanpelaez/23blocks/webApps/agents-web && yarn start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/claude-dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-dashboard.error.log</string>
</dict>
</plist>
```

```bash
# Load the launch agent
launchctl load ~/Library/LaunchAgents/com.user.claude-dashboard.plist

# Unload if needed
launchctl unload ~/Library/LaunchAgents/com.user.claude-dashboard.plist
```

### Persistent Sessions Across Reboots

tmux sessions end when you restart your Mac. To persist them:

1. **tmux-resurrect plugin** - Save and restore tmux sessions
2. **systemd user services** (on Linux)
3. **Manual session recreation script** (run after reboot)

Example restoration script `~/bin/restore-sessions`:

```bash
#!/bin/bash

# Restore common sessions after reboot
start-claude-session main ~/projects/main
start-claude-session experiments ~/experiments
start-claude-session docs ~/documentation

echo "✅ Sessions restored"
```

---

## 11. Quick Reference Card

### Essential Commands

```bash
# Session Management
tmux new -s name              # Create session
tmux ls                       # List sessions
tmux a -t name                # Attach to session
tmux kill-session -t name     # Kill session

# Inside tmux
Ctrl+B, D                     # Detach
Ctrl+B, $                     # Rename session
Ctrl+D                        # Exit Claude (closes session)

# Dashboard
yarn dev                      # Start dashboard
open http://localhost:3000    # Open dashboard
Ctrl+C                        # Stop dashboard

# Helper Scripts (if created)
start-claude-session name     # Create session with Claude
list-claude-sessions          # List all sessions
cleanup-claude-sessions       # Kill all sessions
```

---

## 12. Next Steps

After mastering basic operations:

1. 📖 Read [UX-SPECIFICATIONS.md](./UX-SPECIFICATIONS.md) to understand all dashboard features
2. 🏗️ Read [TECHNICAL-SPECIFICATIONS.md](./TECHNICAL-SPECIFICATIONS.md) for architecture details
3. 🎨 Read [FRONTEND-IMPLEMENTATION.md](./FRONTEND-IMPLEMENTATION.md) if modifying the UI
4. 🚀 Explore Phase 2 features (session creation from UI, remote sessions)

---

## Support

Questions or issues?
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Review dashboard logs (terminal where `yarn dev` is running)
- Check tmux logs: `tmux list-sessions`
- Open an issue in the project repository

---

**Happy coding with Claude! 🤖**
