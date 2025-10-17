# Agent Communication Quickstart Guide

Get your AI Maestro agents talking to each other in **under 5 minutes**.

## Prerequisites Check

```bash
# 1. AI Maestro running?
curl -s http://localhost:23000/api/sessions | jq

# 2. Shell scripts in PATH?
which send-aimaestro-message.sh

# 3. At least 2 tmux sessions?
tmux list-sessions
```

If any check fails, see [Prerequisites](#prerequisites) below.

---

## Send Your First Message (2 Minutes)

### Option 1: File-Based Message (Persistent)

**From current session to another session:**

```bash
send-aimaestro-message.sh backend-architect "Test Message" "Hello from quickstart!" normal notification
```

**Check it worked:**
```bash
# View recipient's inbox
ls ~/.aimaestro/messages/inbox/backend-architect/

# Read the message
cat ~/.aimaestro/messages/inbox/backend-architect/*.json | jq
```

✅ **Success!** You just sent a persistent message that the recipient can read anytime.

---

### Option 2: Instant Notification (Real-time)

**Send a popup notification:**

```bash
send-tmux-message.sh backend-architect "👋 Hello from quickstart!"
```

The recipient sees a popup notification **immediately** in their terminal.

✅ **Success!** You sent an instant alert.

---

## Quick Command Reference

### File-Based Messages (Persistent)

```bash
# Basic syntax
send-aimaestro-message.sh <to> <subject> <message> [priority] [type]

# Examples
send-aimaestro-message.sh backend "Quick Q" "What's the API endpoint?"
send-aimaestro-message.sh frontend "Urgent!" "Deploy failed!" urgent notification
send-aimaestro-message.sh tester "Done" "Feature complete" normal update
```

**Priorities:** `low` | `normal` | `high` | `urgent`
**Types:** `request` | `response` | `notification` | `update`

### Instant Notifications (Real-time)

```bash
# Basic syntax
send-tmux-message.sh <session> <message> [method]

# Methods
send-tmux-message.sh backend "Check inbox"              # Popup (default)
send-tmux-message.sh backend "Need help!" inject        # Inject in terminal
send-tmux-message.sh backend "URGENT!" echo             # Echo to output
```

### Check Your Inbox

```bash
# Show all messages with formatting
check-and-show-messages.sh

# Quick unread count
check-new-messages-arrived.sh

# View via dashboard
# Open http://localhost:23000 → Select session → Messages tab
```

---

## Common Scenarios

### Scenario 1: Request Work from Another Agent

```bash
# From frontend agent to backend agent
send-aimaestro-message.sh backend-architect \
  "Need POST /api/users endpoint" \
  "Building user form, need API endpoint with email/password fields" \
  high \
  request
```

### Scenario 2: Urgent Alert

```bash
# Instant popup + persistent message
send-tmux-message.sh backend-architect "🚨 Check your inbox!"
send-aimaestro-message.sh backend-architect \
  "Production down!" \
  "API returning 500 errors since 2:30pm" \
  urgent \
  notification
```

### Scenario 3: Progress Update

```bash
send-aimaestro-message.sh orchestrator \
  "User dashboard 75% complete" \
  "Finished UI components, working on API integration" \
  normal \
  update
```

### Scenario 4: Reply to a Message

```bash
send-aimaestro-message.sh frontend-dev \
  "Re: POST /api/users endpoint" \
  "Endpoint ready at routes/users.ts:45. Accepts {email, password}, returns JWT token." \
  normal \
  response
```

---

## Decision Tree: Which Method to Use?

```
Need to send a message?
│
├─ Urgent, needs immediate attention?
│  └─ Use send-tmux-message.sh (instant popup)
│
├─ Contains detailed info/context?
│  └─ Use send-aimaestro-message.sh (persistent file)
│
├─ Both urgent AND detailed?
│  └─ Send instant alert first, then detailed message:
│     1. send-tmux-message.sh session "🚨 Check inbox!"
│     2. send-aimaestro-message.sh session "Details..." urgent
│
└─ Just a quick FYI?
   └─ Use send-aimaestro-message.sh (keeps history)
```

---

## Troubleshooting

### "command not found: send-aimaestro-message.sh"

**Fix:** Scripts not in PATH. Use full path:

```bash
/Users/$(whoami)/.local/bin/send-aimaestro-message.sh ...
```

Or fix PATH permanently:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv
source ~/.zshenv
```

### "Failed to send message (HTTP 000)"

**Fix:** AI Maestro not running. Start it:

```bash
cd /path/to/agents-web
yarn dev
```

### "Session not found"

**Fix:** Check session name exactly:

```bash
tmux list-sessions
# Use exact session name from output
```

### Messages not appearing in dashboard

**Fix 1:** Refresh the browser page
**Fix 2:** Check file permissions:
```bash
ls -la ~/.aimaestro/messages/inbox/your-session-name/
chmod -R u+rw ~/.aimaestro/messages/
```

---

## Prerequisites

### 1. AI Maestro Running

```bash
# Start the server (if not running)
cd ~/path/to/agents-web
yarn dev

# Verify it's running
curl http://localhost:23000/api/sessions
```

### 2. Shell Scripts Installed

Scripts should be in `~/.local/bin/`:

```bash
ls -l ~/.local/bin/*message*.sh

# If missing, they should be committed in the repo
# Check the repo or ask for installation instructions
```

### 3. PATH Configured

For scripts to work without full paths, add to `~/.zshenv`:

```bash
# Add this line to ~/.zshenv
export PATH="$HOME/.local/bin:$PATH"

# Reload
source ~/.zshenv

# Test
which send-aimaestro-message.sh
```

### 4. tmux Sessions

Create at least 2 sessions for testing:

```bash
# Session 1: backend
tmux new-session -s backend-architect -d
tmux send-keys -t backend-architect 'claude' Enter

# Session 2: frontend
tmux new-session -s frontend-dev -d
tmux send-keys -t frontend-dev 'claude' Enter

# Verify
tmux list-sessions
```

---

## Next Steps

**You're ready to use the communication system!**

For more advanced usage:
- **[Agent Communication Guidelines](./AGENT-COMMUNICATION-GUIDELINES.md)** - Best practices and patterns
- **[Agent Messaging Guide](./AGENT-MESSAGING-GUIDE.md)** - Comprehensive guide with workflows
- **[Agent Communication Architecture](./AGENT-COMMUNICATION-ARCHITECTURE.md)** - Technical deep-dive

---

## Quick Test Script

Copy-paste this to test the full system:

```bash
#!/bin/bash
# Test agent communication system

echo "🧪 Testing AI Maestro Communication System..."
echo ""

# Get current session
CURRENT=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$CURRENT" ]; then
  echo "❌ Not in a tmux session"
  exit 1
fi

# Find another session
OTHER=$(tmux list-sessions -F "#{session_name}" | grep -v "^$CURRENT$" | head -n1)
if [ -z "$OTHER" ]; then
  echo "❌ Need at least 2 tmux sessions"
  exit 1
fi

echo "📤 Sending from: $CURRENT"
echo "📥 Sending to: $OTHER"
echo ""

# Test file-based message
echo "1️⃣ Testing file-based message..."
send-aimaestro-message.sh "$OTHER" \
  "Test from quickstart" \
  "This is a test message. System is working! ✅" \
  normal \
  notification

echo ""

# Test instant message
echo "2️⃣ Testing instant notification..."
send-tmux-message.sh "$OTHER" "🧪 Test notification from $CURRENT"

echo ""
echo "✅ Tests complete!"
echo ""
echo "Check results:"
echo "  • Inbox: ls ~/.aimaestro/messages/inbox/$OTHER/"
echo "  • Dashboard: http://localhost:23000 → Select '$OTHER' → Messages tab"
echo "  • Other session: Switch to '$OTHER' and check terminal"
```

Save as `test-communication.sh`, make executable, and run:

```bash
chmod +x test-communication.sh
./test-communication.sh
```

---

## Summary

**You now know how to:**
- ✅ Send persistent messages with `send-aimaestro-message.sh`
- ✅ Send instant alerts with `send-tmux-message.sh`
- ✅ Check your inbox with `check-and-show-messages.sh`
- ✅ Choose the right method for each situation

**Time to first message: < 2 minutes** 🚀
