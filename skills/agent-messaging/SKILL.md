---
name: AI Maestro Agent Messaging
description: Send and receive messages between AI agents using AI Maestro's messaging system. Use this skill when the user asks to "send a message", "check inbox", "read messages", "notify [agent]", "tell [agent]", or any inter-agent communication.
allowed-tools: Bash
---

# AI Maestro Agent Messaging

## Purpose
Enable communication between AI coding agents using AI Maestro's dual-channel messaging system. Agents are identified by their agent ID or alias, with tmux session names as a fallback. Supports both SENDING and RECEIVING messages.

## CRITICAL: Inter-Agent Communication

**YOU ARE AN AGENT** - This skill is for **agent-to-agent** communication, NOT human-agent communication.

### IMPORTANT: Understanding "Your Messages"

When the human operator says "check your messages" or "read your messages":
- **YOUR inbox** = Messages addressed TO YOUR AGENT (from anyone - operator, other agents, etc.)
- **NOT the operator's inbox** = You check YOUR inbox, not the operator's

**Example:**
- Human says: "Check your messages"
- You are agent: `backend-api`
- You check: `~/.aimaestro/messages/inbox/backend-api/` (YOUR inbox)
- These are messages addressed TO `backend-api` (from any sender)
- You DO NOT check: The operator's inbox or any other agent's inbox

### Agent Identity

- **Your inbox** = Messages addressed TO YOUR AGENT (from any sender)
- **Your agent ID** = Unique identifier for this agent (can also use agent name as fallback)
- **Your agent name** = The tmux session you're running in (get with `tmux display-message -p '#S'`)
- **Your inbox location** = `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/` or `~/.aimaestro/messages/inbox/YOUR-AGENT-NAME/`

**You do NOT read:**
- ❌ The operator's inbox
- ❌ Other agents' inboxes
- ❌ Messages not addressed to your agent

**You DO read:**
- ✅ Messages addressed TO YOUR AGENT
- ✅ YOUR OWN inbox only
- ✅ Your agent's inbox: `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/`

## When to Use This Skill

**Sending (Agent-to-Agent):**
- User (operator) says "send a message to [another-agent]"
- User says "notify [another-agent]" or "alert [another-agent]"
- User wants YOU to communicate with ANOTHER agent
- You need to send urgent alerts or requests to OTHER AGENTS

**Receiving (Check YOUR OWN Inbox):**
- User says "check my inbox" or "check my messages" = Use `check-aimaestro-messages.sh`
- User says "read my messages" or "read message X" = Use `read-aimaestro-message.sh <id>`
- User asks "any new messages?" = Use `check-aimaestro-messages.sh`
- Agent just started (best practice: check YOUR inbox first)
- You want to see what OTHER AGENTS have sent TO YOU

**RECOMMENDED WORKFLOW:**
1. First check for unread messages: `check-aimaestro-messages.sh`
2. Then read specific message: `read-aimaestro-message.sh <message-id>`
3. Message is automatically marked as read after reading

## Available Tools

## PART 1: RECEIVING MESSAGES (YOUR OWN INBOX)

**📖 QUICK START - Check and Read Messages:**
```bash
# Step 1: Check what unread messages you have
check-aimaestro-messages.sh

# Output shows:
# [msg-1234...] 🔴 From: backend-api | 2025-10-29 14:30
#     Subject: Authentication endpoint ready
#     Preview: The /api/auth/login endpoint is now...

# Step 2: Read the specific message (automatically marks as read)
read-aimaestro-message.sh msg-1234...

# Step 3: Check again - that message is now gone from unread
check-aimaestro-messages.sh
# Output: "📭 No unread messages"
```

**⚠️ CRITICAL: What "YOUR inbox" means:**
- YOU = The AI agent running in this tmux session
- YOUR inbox = `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/` (or agent name as fallback)
- Messages in YOUR inbox = Messages OTHER AGENTS sent TO YOU
- NOT the operator's messages, NOT other agents' private messages

**IMPORTANT:** These commands check YOUR AGENT'S inbox only. They automatically:
1. Detect your current agent ID or agent name
2. Read from `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/`
3. Show messages that OTHER AGENTS sent TO YOU
4. Do NOT access anyone else's inbox

### 1. Check YOUR Inbox for UNREAD Messages (Recommended)
**Command:**
```bash
check-aimaestro-messages.sh [--mark-read]
```

**What it does:**
- Shows ONLY UNREAD messages in YOUR inbox (messages sent TO YOUR AGENT)
- Automatically detects YOUR agent's session
- Displays: priority indicator, sender, subject, preview, timestamp
- Optional `--mark-read` flag to mark all messages as read after viewing
- **This is the recommended way to check messages** - avoids re-reading old messages

**Example:**
```bash
# Check unread messages without marking as read
check-aimaestro-messages.sh

# Check and mark all as read
check-aimaestro-messages.sh --mark-read
```

**Output format:**
```
📬 You have 3 unread message(s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[msg-167...] 🔴 From: backend-architect | 2025-10-29 13:45
    Subject: API endpoint ready
    Preview: The POST /api/auth/login endpoint is now...

[msg-168...] 🔵 From: frontend-dev | 2025-10-29 14:20
    Subject: Need help with styling
    Preview: Can you review the CSS for the navigation...
```

### 2. Read Specific Message and Mark as Read
**Command:**
```bash
read-aimaestro-message.sh <message-id> [--no-mark-read]
```

**What it does:**
- Retrieves and displays the full message content
- **Automatically marks the message as read** (unless `--no-mark-read` flag)
- Shows all message details: content, context, forwarding info
- Perfect for reading a specific message after checking the list

**Example:**
```bash
# Read message (automatically marks as read)
read-aimaestro-message.sh msg-1234567890-abc

# Peek at message without marking as read
read-aimaestro-message.sh msg-1234567890-abc --no-mark-read
```

**Output format:**
```
═══════════════════════════════════════════════════════════════
📧 Message: API endpoint ready
═══════════════════════════════════════════════════════════════

From:     backend-architect
To:       frontend-dev
Date:     2025-10-29 13:45:00
Priority: 🔴 urgent
Type:     response

───────────────────────────────────────────────────────────────

The POST /api/auth/login endpoint is now deployed and ready...

───────────────────────────────────────────────────────────────
📎 Context:
{
  "endpoint": "/api/auth/login"
}

✅ Message marked as read
═══════════════════════════════════════════════════════════════
```

### 3. Auto-Display on Agent Start (Legacy - DO NOT USE MANUALLY)
**Command:**
```bash
check-and-show-messages.sh
```

**What it does:**
- Automatically runs when you attach to a tmux session
- Shows a summary of unread messages
- **DO NOT run this command manually** - it's for auto-display only
- **For manual checking, use `check-aimaestro-messages.sh` instead**

**Why not use this manually?**
- It's designed for auto-display (runs on tmux attach)
- Output format is optimized for quick glance, not interactive reading
- Use the new commands (#1 and #2 above) for better experience

**Output format:**
```
Message: msg_1234567890_abcde
From: backend-architect          ← Another agent sent this TO YOU
To: frontend-dev                 ← YOUR session name
Subject: Need API endpoint
Priority: high
Type: request
Status: unread
Timestamp: 2025-01-17 14:23:45
Content: Please implement POST /api/users with pagination...
```

### 4. Check for New Messages Count (Quick)
**Command:**
```bash
check-new-messages-arrived.sh
```

**What it does:**
- Shows count of unread messages in YOUR inbox
- Automatically checks YOUR session's inbox
- Quick check without full details
- Returns "No new messages" or "You have X new message(s)"

**Example:**
```bash
check-new-messages-arrived.sh
# Output: "You have 3 new message(s)"  ← Messages sent TO YOU
```

### 5. Read Specific Message FROM YOUR Inbox (Direct File Access - Advanced)
**Command:**
```bash
cat ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/<message-id>.json | jq
```

**What it does:**
- Read a specific message file from YOUR inbox
- `$(tmux display-message -p '#S')` = YOUR session name (auto-detected)
- Use `jq` for pretty formatting
- Useful when you know the message ID

**Directory structure:**
```
~/.aimaestro/messages/
├── inbox/YOUR-SESSION-NAME/     # Messages TO YOU from other agents
│   └── msg_*.json
├── sent/YOUR-SESSION-NAME/      # Messages FROM YOU to other agents
│   └── msg_*.json
└── archived/YOUR-SESSION-NAME/  # YOUR archived messages
    └── msg_*.json
```

**Example:**
```bash
# Get YOUR session name
tmux display-message -p '#S'
# Output: frontend-dev  ← This is YOU

# List all messages in YOUR inbox
ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/

# Read specific message sent TO YOU
cat ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/msg_1234567890_abcde.json | jq
```

### 4. Mark Message as Read (via API)
**Command:**
```bash
# Get current session name
SESSION_NAME=$(tmux display-message -p '#S')

# Mark message as read
curl -X PATCH "http://localhost:23000/api/messages?agent=$SESSION_NAME&id=<message-id>&action=read" \
  -H 'Content-Type: application/json'
```

## PART 2: SENDING MESSAGES (TO OTHER AGENTS)

**⚠️ CRITICAL: What "sending a message" means:**
- Operator tells YOU to send a message TO ANOTHER AGENT
- NOT sending messages to the operator
- Message goes to ANOTHER AGENT's inbox
- Target = Another agent (identified by their tmux session name)

### 5. File-Based Messages (Persistent, Structured)
Use for detailed, non-urgent communication that needs to be referenced later BY OTHER AGENTS.

**Command:**
```bash
send-aimaestro-message.sh <to_agent[@host]> <subject> <message> [priority] [type]
```

**Parameters:**
- `to_agent[@host]` (required) - Target agent with optional host:
  - `backend-api` - Send to agent on same host (local)
  - `backend-api@mac-mini` - Send to agent on remote host "mac-mini"
  - `backend-api@local` - Explicitly send to local agent
- `subject` (required) - Brief subject line
- `message` (required) - Message content to send TO OTHER AGENT
- `priority` (optional) - low | normal | high | urgent (default: normal)
- `type` (optional) - request | response | notification | update (default: request)

**Examples:**
```bash
# Simple request (local agent)
send-aimaestro-message.sh backend-architect "Need API endpoint" "Please implement POST /api/users with pagination"

# Cross-host message (agent on remote machine)
send-aimaestro-message.sh crm-api@mac-mini "Customer data sync" "Please sync customer records from CRM" high request

# Urgent notification (local)
send-aimaestro-message.sh frontend-dev "Production issue" "API returning 500 errors" urgent notification

# Response to request
send-aimaestro-message.sh orchestrator "Re: Task complete" "User dashboard finished at components/Dashboard.tsx" normal response

# Progress update
send-aimaestro-message.sh project-lead "Payment integration: 60% done" "Stripe API integrated. Working on webhooks. ETA: 2 hours." normal update
```

## PART 2.5: CROSS-HOST MESSAGING

AI Maestro supports sending messages to agents running on different machines (hosts). This enables distributed agent workflows across your infrastructure.

### Host Configuration

Hosts are configured in `~/.aimaestro/hosts.json`:
```json
{
  "hosts": [
    {
      "id": "local",
      "name": "macbook-pro",
      "url": "http://localhost:23000",
      "type": "local",
      "enabled": true
    },
    {
      "id": "mac-mini",
      "name": "mac-mini-server",
      "url": "http://100.80.12.6:23000",
      "type": "remote",
      "enabled": true
    }
  ]
}
```

### Addressing Agents on Remote Hosts

Use the `agent@host` format to send messages to remote agents:

```bash
# Send to agent "crm-api" on host "mac-mini"
send-aimaestro-message.sh crm-api@mac-mini "Sync request" "Please sync customer data"

# Send to agent "data-processor" on host "cloud-server"
send-aimaestro-message.sh data-processor@cloud-server "Process batch" "Run nightly ETL" high request
```

### How Cross-Host Messaging Works

1. **Parse destination**: Script parses `agent@host` format
2. **Resolve host URL**: Looks up host URL from `~/.aimaestro/hosts.json`
3. **Resolve agent**: Queries remote host's API to verify agent exists
4. **Send directly**: POST message to remote host's `/api/messages` endpoint
5. **Local copy**: Saves copy in sender's sent folder

### Message Display with Hosts

When viewing messages, sender info includes their host:
```
From: backend-api@macbook-pro
To: crm-api@mac-mini
Subject: Data sync complete
```

### Troubleshooting Cross-Host Messaging

**Cannot find host:**
```bash
# List available hosts
source ~/.local/share/aimaestro/shell-helpers/common.sh
list_hosts
```

**Remote host unreachable:**
- Check host URL in `~/.aimaestro/hosts.json`
- Verify network connectivity: `curl http://<host-url>/api/sessions`
- Ensure AI Maestro is running on remote host

**Agent not found on remote host:**
- Verify agent exists on remote: `curl http://<host-url>/api/agents`
- Check agent alias spelling

### 6. Instant Notifications (Real-time, Ephemeral)
Use for urgent alerts that need immediate attention FROM OTHER AGENTS.

**Command:**
```bash
send-tmux-message.sh <target_session> <message> [method]
```

**Parameters:**
- `target_session` (required) - Target agent's name (ANOTHER AGENT, not operator)
- `message` (required) - Alert text to send TO OTHER AGENT
- `method` (optional) - display | inject | echo (default: display)

**Methods:**
- `display` - Popup notification (non-intrusive, auto-dismisses)
- `inject` - Inject into terminal history (visible but interrupts)
- `echo` - Formatted output (most visible, most intrusive)

**Examples:**
```bash
# Quick alert (popup)
send-tmux-message.sh backend-architect "Check your inbox!"

# Urgent visible alert
send-tmux-message.sh frontend-dev "Build failed! Check logs" inject

# Critical formatted alert
send-tmux-message.sh backend-architect "PRODUCTION DOWN!" echo
```

### 7. Combined Approach (Urgent + Detailed)
For critical issues, use both methods:

```bash
# 1. Get attention immediately
send-tmux-message.sh backend-architect "🚨 Check inbox NOW!"

# 2. Provide full details
send-aimaestro-message.sh backend-architect \
  "Production: Database timeout" \
  "All /api/users endpoints failing since 14:30. Connection pool exhausted. ~200 users affected. Need immediate fix." \
  urgent \
  notification
```

## Decision Guide

**Use file-based (`send-aimaestro-message.sh`) when:**
- Message contains detailed requirements or context
- Recipient needs to reference it later
- Communication is structured (priority, type)
- Not time-critical (within hours)

**Use instant (`send-tmux-message.sh`) when:**
- Urgent attention needed (minutes)
- Quick FYI ("build done", "tests passing")
- Making sure file message gets seen
- Production emergency

**Use both when:**
- Critical AND detailed information needed
- Blocking another agent's work
- Production issues affecting users

## Message Type Guidelines

- **request** - Need someone to do something (implement, review, help)
- **response** - Answering a request (task complete, here's the result)
- **notification** - FYI update, no action needed (deploy done, tests passing)
- **update** - Progress report on ongoing work (50% complete, ETA 2 hours)

## Priority Guidelines

- **urgent** - Production down, data loss, security issue (respond in < 15 min)
- **high** - Blocking work, important feature needed soon (respond in < 1 hour)
- **normal** - Standard workflow (respond within 4 hours)
- **low** - Nice-to-have, when free time available

## Examples by Scenario

### RECEIVING Examples (Checking YOUR OWN Inbox)

#### Scenario R1: Check YOUR Inbox on Agent Start
```bash
# YOU are agent "frontend-dev"
# Best practice: Always check YOUR inbox when starting work

check-and-show-messages.sh
# This checks ~/.aimaestro/messages/inbox/frontend-dev/
# Shows messages OTHER AGENTS sent TO YOU

# If messages found from other agents, read and respond appropriately
```

#### Scenario R2: Quick Check for New Messages in YOUR Inbox
```bash
# Operator asks: "Any new messages?"
# YOU (the agent) check YOUR inbox

check-new-messages-arrived.sh
# Output: "You have 2 new message(s)"  ← Sent TO YOU by other agents

# Then show full details from YOUR inbox
check-and-show-messages.sh
```

#### Scenario R3: Read Message FROM YOUR Inbox and Respond
```bash
# YOU are agent "backend-architect"
# 1. Check YOUR inbox for messages sent TO YOU

check-and-show-messages.sh

# Output shows message sent TO YOU:
# Message: msg_1705502625_abc123
# From: frontend-dev          ← Another agent sent this
# To: backend-architect       ← YOU (your session)
# Subject: Need API endpoint
# Priority: high
# Type: request
# Content: Please implement POST /api/users with pagination...

# 2. Work on the request (implement the feature)

# 3. Send response TO THE AGENT who messaged you
send-aimaestro-message.sh frontend-dev \
  "Re: API endpoint ready" \
  "Implemented POST /api/users at routes/users.ts:45. Includes pagination support." \
  normal \
  response
```

#### Scenario R4: Handle Urgent Message in YOUR Inbox
```bash
# YOU are agent "frontend-dev"
# Check YOUR inbox

check-and-show-messages.sh

# Output shows urgent message sent TO YOU:
# 🚨 Priority: urgent
# From: backend-architect     ← Sent by another agent
# To: frontend-dev            ← YOU (your session)
# Subject: Production: Database down
# Content: All queries failing since 15:30...

# 1. Acknowledge immediately TO THE AGENT who sent it
send-tmux-message.sh backend-architect "Received urgent alert - investigating now!" inject

# 2. Work on issue

# 3. Send detailed update TO THE AGENT who alerted you
send-aimaestro-message.sh backend-architect \
  "Re: Database issue - RESOLVED" \
  "Issue identified: connection pool exhausted. Increased max_connections. System stable." \
  urgent \
  response
```

### SENDING Examples

#### Scenario S1: Request Work from Another Agent
```bash
send-aimaestro-message.sh backend-api \
  "Need GET /api/users endpoint" \
  "Building user list UI. Need endpoint returning array of users with {id, name, email}. Pagination optional but nice." \
  high \
  request
```

#### Scenario S2: Urgent Alert
```bash
# Get attention
send-tmux-message.sh backend-api "🚨 Urgent: Check inbox!"

# Provide details
send-aimaestro-message.sh backend-api \
  "Production: API failing" \
  "All /users endpoints returning 500. Database connection timeout. ~100 users affected." \
  urgent \
  notification
```

#### Scenario S3: Progress Update
```bash
send-aimaestro-message.sh project-lead \
  "User auth: 75% complete" \
  "✅ Database schema done
✅ Registration endpoint done
✅ Login endpoint done
⏳ Password reset in progress

ETA: 1 hour. No blockers." \
  normal \
  update
```

#### Scenario S4: Reply to Request
```bash
send-aimaestro-message.sh frontend-dev \
  "Re: GET /api/users endpoint" \
  "Endpoint ready at routes/users.ts:120. Returns {users: Array<User>, total: number, page: number}. Supports pagination with ?page=1&limit=20." \
  normal \
  response
```

## Workflow

### Receiving Messages Workflow (Checking YOUR OWN Inbox)

**Remember: You are checking YOUR inbox for messages other agents sent TO YOU**

1. **Check YOUR inbox proactively** - Run `check-and-show-messages.sh` when starting work or operator asks
   - This reads `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/`
   - Shows messages OTHER AGENTS sent TO YOU

2. **Read message content** - Display full message details
   - From: Which agent sent this TO YOU
   - To: YOUR session name
   - Subject, priority, content: What they want YOU to know/do

3. **Assess urgency** - Check priority level (urgent = respond immediately TO THAT AGENT)

4. **Take action** - Work on the request that was sent TO YOU
   - Investigate issue
   - Implement feature
   - Or acknowledge receipt

5. **Respond TO THE AGENT who messaged you** - Send reply using appropriate method
   - File-based: Send TO the agent who messaged you
   - Instant: Send TO the agent who messaged you

6. **Mark as read** - (Optional) Update YOUR message status via API

### Sending Messages Workflow (TO Other Agents)

**Remember: Operator tells YOU to send a message TO ANOTHER AGENT**

1. **Understand the request** - What does the operator want YOU to communicate TO ANOTHER AGENT?

2. **Identify target agent** - Which OTHER agent should receive this message FROM YOU?
   - Target = Another agent's name
   - NOT the operator
   - NOT your own inbox

3. **Choose method** - Urgent? Use instant. Detailed? Use file-based. Both? Use both.
   - File-based: Goes to OTHER AGENT's inbox
   - Instant: Popup in OTHER AGENT's terminal

4. **Select priority** - How urgent is this for THE OTHER AGENT?

5. **Choose type** - Is it a request, response, notification, or update TO THE OTHER AGENT?

6. **Execute command** - Run the appropriate send-* script
   - Sends FROM YOU TO OTHER AGENT
   - Message appears in OTHER AGENT's inbox

7. **Confirm** - Tell operator: "Message sent to [other-agent-name]"

## Error Handling

### Receiving Errors (Checking YOUR Inbox)

**No messages found:**
- This is normal if YOUR inbox is empty
- Output: "No messages in your inbox"
- Means: No other agents have sent messages TO YOU yet

**Script not found:**
- Check PATH: `which check-and-show-messages.sh`
- Verify scripts installed: `ls -la ~/.local/bin/check-*.sh`

**Cannot read inbox directory:**
- Check YOUR inbox directory exists: `ls -la ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/`
- Verify YOUR session name: `tmux display-message -p '#S'`
- Remember: You're reading YOUR inbox, not someone else's

**Important: If you can't find messages:**
- Make sure you're checking the RIGHT inbox (yours)
- Don't try to read other agents' inboxes
- Don't try to read the operator's messages

### Sending Errors

**Command fails:**
- Check target session exists: `tmux list-sessions`
- Verify AI Maestro is running: `curl http://localhost:23000/api/sessions`
- Check PATH: `which send-aimaestro-message.sh`

**Invalid session name:**
- Session names must match tmux session names exactly
- Use `tmux list-sessions` to see valid names

## References

- [Quickstart](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-QUICKSTART.md)
- [Guidelines](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-GUIDELINES.md)
- [Architecture](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-ARCHITECTURE.md)
