# Agent Communication Quickstart Guide

Get your AI Maestro agents talking to each other in **under 5 minutes** using the [Agent Messaging Protocol (AMP)](https://agentmessaging.org).

---

## 🎯 Two Ways to Use Agent Communication

AI Maestro supports **two operational modes** depending on your AI agent:

### Mode 1: Skills Mode (Natural Language) - Claude Code Only ✨

**Best for:** Claude Code sessions with skills enabled

**How it works:** Just ask in natural language, Claude handles the rest

```
You: "Send a message to backend-architect asking about the API endpoint"
Claude: *Automatically uses the messaging skill to send the message*
```

**Visual Example:**

![Claude Code loading the messaging skill](images/load-skill.png)
*Claude Code automatically loads the agent-messaging skill when needed*

![Sending a message with natural language](images/skill-send-message.png)
*Ask Claude to send a message - no commands needed*

![Message successfully sent](images/skill-message-sent.png)
*Claude confirms the message was sent*

**Advantages:**
- ✅ Zero command memorization
- ✅ Natural conversation flow
- ✅ Context-aware (Claude knows your session name)
- ✅ Progressive disclosure (skill loads only when needed)

**Requirements:** Claude Code with skills installed → [📖 Install the skill](../plugin/skills/README.md) (copy [`../plugin/skills/agent-messaging/`](../plugin/skills/agent-messaging) to `~/.claude/skills/`)

---

### Mode 2: Manual Mode (Command-Line) - Universal 🔧

**Best for:** Any AI agent (Aider, Cursor, custom scripts) or direct terminal usage

**How it works:** Use shell commands directly

```bash
amp-send backend-architect "Subject" "Message body" normal request
```

**Visual Example:**

![Manually sending a message](images/no-skill-send-message.png)
*Using the command-line tool directly*

![Viewing received messages](images/no-skill-receive-messages.png)
*Checking inbox with command-line tools*

**Advantages:**
- ✅ Works with ANY AI agent
- ✅ Works in any shell script
- ✅ Full control over parameters
- ✅ No dependencies on Claude Code

**Requirements:** AMP CLI tools in PATH (install via `./install-messaging.sh`) + Agent identity initialized (`amp-init --auto`)

---

## 🎯 Quick Install (Easiest)

**First-time installation:**

```bash
cd /path/to/ai-maestro
./install-messaging.sh
```

**Unattended installation** (for CI/CD, scripts):
```bash
./install-messaging.sh -y
```

The `-y` flag auto-selects full installation (scripts + skills) without prompts.

The installer will:
- ✅ Check all prerequisites (tmux, curl, Claude Code)
- ✅ Install messaging scripts to `~/.local/bin/`
- ✅ Install Claude Code skill to `~/.claude/skills/`
- ✅ Configure PATH if needed
- ✅ Verify everything works

**Time:** < 1 minute

**Update existing installation:**

```bash
cd /path/to/ai-maestro
git pull origin main  # Get latest changes
./update-messaging.sh
```

The updater will:
- ✅ Update all messaging scripts in `~/.local/bin/`
- ✅ Backup old skill version (timestamped)
- ✅ Update Claude Code skill to `~/.claude/skills/`
- ✅ Verify installation

⚠️ **Important:** After updating, restart your Claude Code sessions to reload the updated skill.

**Time:** < 30 seconds

---

## Prerequisites Check (Manual)

```bash
# 1. AI Maestro running?
curl -s http://localhost:23000/api/sessions | jq

# 2. Shell scripts in PATH? (Required for both modes)
which amp-send

# 3. At least 2 tmux sessions?
tmux list-sessions

# 4. Claude Code skills? (Optional - for Skills Mode only)
ls -la ~/.claude/skills/agent-messaging/
```

If any check fails, see [Prerequisites](#prerequisites) below or use the [installer](#-quick-install-easiest).

---

## 🚀 Quick Start: Skills Mode (Claude Code)

**No commands to memorize - just talk to Claude naturally!**

### Step 1: Send Your First Message

Just ask Claude in plain English:

```
You: "Send a message to backend-architect with subject 'Test Message'
     and say 'Hello from quickstart!'"

Claude: I'll send that message for you.
        *Uses amp-send automatically*
        ✅ Message sent successfully to backend-architect
```

![Claude sending a message with natural language](images/skill-send-message.png)

### Step 2: Check Your Inbox

Ask Claude to check messages:

```
You: "Check my inbox" or "Do I have any new messages?"

Claude: Let me check your inbox...
        *Uses amp-inbox automatically*

        📬 You have 2 messages:
        1. From: frontend-dev
           Subject: UI components ready
           ...
```

![Claude checking inbox](images/skill-review-inbox.png)

### Step 3: See Real Agent Communication

![Agent receiving a message](images/agent-I-got-a-message.png)
*The receiving agent sees incoming messages in real-time*

![Agent viewing inbox](images/agent-inbox.png)
*Agents can review their full inbox with all messages*

![Agent replying](images/agent-replied.png)
*Agents can send replies using natural language*

✅ **Success!** You're using AI-to-AI communication with zero command memorization.

**That's it!** Claude handles all the technical details. You just describe what you want.

---

## 🔧 Quick Start: Manual Mode (Universal)

**Works with ANY AI agent or shell script - not just Claude Code!**

### Step 1: Send Your First Message

Use the command-line tool directly:

```bash
amp-send backend-architect \
  "Test Message" \
  "Hello from quickstart!" \
  normal \
  notification
```

![Sending message with command-line](images/no-skill-send-message.png)
*Direct command-line usage - works with any agent*

**Check it worked:**
```bash
# View recipient's inbox (on the other session)
amp-inbox

# Or check the message files directly
ls ~/.agent-messaging/messages/inbox/
```

![Message sent confirmation](images/no-skill-message-sent.png)

### Step 2: Check Your Inbox

Use the inbox checking tool:

```bash
amp-inbox
```

![Viewing inbox messages](images/no-skill-receive-messages.png)
*Command-line tools show all inbox messages*

Or review in detail:

```bash
# Quick unread count
amp-inbox --unread

# Full inbox view
amp-inbox
```

![Reviewing inbox](images/no-skill-review-inbox.png)

### Step 3: Send an Instant Alert

For urgent notifications, use the tmux messaging:

```bash
send-tmux-message.sh backend-architect "👋 Hello from quickstart!"
```

The recipient sees a popup notification **immediately** in their terminal.

✅ **Success!** You just used the universal command-line interface that works with ANY agent.

**Advantages of Manual Mode:**
- Works with Aider, Cursor, custom scripts, or any terminal
- Full parameter control
- Can be used in automation scripts
- No AI agent required

---

## Quick Command Reference

### File-Based Messages (Persistent)

```bash
# Basic syntax
amp-send <to> <subject> <message> [priority] [type]

# Examples
amp-send backend "Quick Q" "What's the API endpoint?"
amp-send frontend "Urgent!" "Deploy failed!" urgent notification
amp-send tester "Done" "Feature complete" normal update
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
amp-inbox

# Quick unread count
amp-inbox --unread

# View via dashboard
# Open http://localhost:23000 → Select session → Messages tab
```

---

## Common Scenarios (Both Modes)

Each scenario shows **both** Skills Mode (natural language) and Manual Mode (command-line).

### Scenario 1: Request Work from Another Agent

**Skills Mode (Claude Code):**
```
You: "Send a high-priority request to backend-architect asking them to build
     a POST /api/users endpoint. Mention I'm building a user form and need
     email and password fields."

Claude: *Automatically formats and sends the message*
```

**Manual Mode (Command-Line):**
```bash
amp-send backend-architect \
  "Need POST /api/users endpoint" \
  "Building user form, need API endpoint with email/password fields" \
  high \
  request
```

---

### Scenario 2: Urgent Alert

**Skills Mode (Claude Code):**
```
You: "URGENT: Send an emergency message to backend-architect.
     Production is down - API returning 500 errors since 2:30pm.
     Also send an instant tmux notification."

Claude: *Sends both instant alert and detailed message*
```

**Manual Mode (Command-Line):**
```bash
# Instant popup first
send-tmux-message.sh backend-architect "🚨 Check your inbox!"

# Then detailed message
amp-send backend-architect \
  "Production down!" \
  "API returning 500 errors since 2:30pm" \
  urgent \
  notification
```

---

### Scenario 3: Progress Update

**Skills Mode (Claude Code):**
```
You: "Send an update to orchestrator: user dashboard is 75% complete,
     finished UI components, now working on API integration."

Claude: *Sends formatted progress update*
```

**Manual Mode (Command-Line):**
```bash
amp-send orchestrator \
  "User dashboard 75% complete" \
  "Finished UI components, working on API integration" \
  normal \
  update
```

---

### Scenario 4: Reply to a Message

**Skills Mode (Claude Code):**
```
You: "Reply to frontend-dev about the POST /api/users endpoint.
     Tell them it's ready at routes/users.ts:45, accepts email and
     password, returns a JWT token."

Claude: *Sends reply with proper subject line*
```

**Manual Mode (Command-Line):**
```bash
amp-send frontend-dev \
  "Re: POST /api/users endpoint" \
  "Endpoint ready at routes/users.ts:45. Accepts {email, password}, returns JWT token." \
  normal \
  response
```

---

## Decision Trees

### Which Mode Should I Use?

```
Are you using Claude Code?
│
├─ YES → Do you have skills installed?
│         │
│         ├─ YES → Use Skills Mode ✨
│         │        (Natural language, zero commands)
│         │
│         └─ NO → Use Manual Mode 🔧
│                 (Install skills from ~/.claude/skills/)
│
└─ NO (using Aider, Cursor, custom script, etc.)
         └─ Use Manual Mode 🔧
            (Only option for non-Claude agents)
```

### Which Messaging Method Should I Use?

```
Need to send a message?
│
├─ Urgent, needs immediate attention?
│  │
│  ├─ Skills Mode: "Send urgent tmux notification to..."
│  └─ Manual Mode: send-tmux-message.sh session "🚨 Alert!"
│
├─ Contains detailed info/context?
│  │
│  ├─ Skills Mode: "Send a message to... with subject..."
│  └─ Manual Mode: amp-send session "Subject" "Details..."
│
├─ Both urgent AND detailed?
│  │
│  ├─ Skills Mode: "Send urgent message to... AND send tmux notification"
│  └─ Manual Mode:
│     1. send-tmux-message.sh session "🚨 Check inbox!"
│     2. amp-send session "Details..." urgent
│
└─ Just a quick FYI?
   │
   ├─ Skills Mode: "Send an update to... saying..."
   └─ Manual Mode: amp-send session "Subject" "FYI..."
```

---

## Troubleshooting

### "command not found: amp-send"

**Fix:** Scripts not in PATH. Use full path:

```bash
/Users/$(whoami)/.local/bin/amp-send ...
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
**Fix 2:** Check your AMP status and permissions:
```bash
amp-status
ls -la ~/.agent-messaging/messages/inbox/
chmod -R u+rw ~/.agent-messaging/
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

### 2. AMP CLI Tools Installed

AMP tools should be in `~/.local/bin/`:

```bash
which amp-send amp-inbox amp-init

# If missing, install from the repo
./install-messaging.sh

# Or manually
cp plugins/amp-messaging/scripts/amp-*.sh ~/.local/bin/
chmod +x ~/.local/bin/amp-*.sh
```

### 3. PATH Configured

For scripts to work without full paths, add to `~/.zshenv`:

```bash
# Add this line to ~/.zshenv
export PATH="$HOME/.local/bin:$PATH"

# Reload
source ~/.zshenv

# Test
which amp-send
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

### Slack Integration

Want your whole team to interact with AI agents from Slack? Check out the **[AI Maestro Slack Bridge](https://github.com/23blocks-OS/aimaestro-slack-bridge)**:

- DM or @mention agents from Slack
- Route to specific agents: `@AIM:backend-api check health`
- Responses delivered to Slack threads
- No terminal access needed for team members

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
amp-send "$OTHER" \
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
echo "  • Inbox: amp-inbox (run in $OTHER session)"
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

### What You've Learned

**Two Ways to Communicate:**
- ✅ **Skills Mode** - Natural language with Claude Code (zero commands)
- ✅ **Manual Mode** - Command-line tools (works with any agent)

**Core Capabilities:**
- ✅ Send persistent messages (file-based, searchable)
- ✅ Send instant alerts (tmux notifications)
- ✅ Check inboxes and read messages
- ✅ Choose the right mode and method for each situation

**Skills Mode (Claude Code Only):**
```
You: "Send a message to backend-architect..."
Claude: *Handles everything automatically*
```

**Manual Mode (Any Agent):**
```bash
amp-send backend-architect "Subject" "Message"
```

**Time to first message:**
- Skills Mode: < 1 minute (just ask Claude)
- Manual Mode: < 2 minutes (one command)

🚀 **Your agents can now coordinate without you being the middleman!**
