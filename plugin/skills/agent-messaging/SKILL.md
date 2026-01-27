---
name: agent-messaging
description: Send and receive messages between AI agents using AI Maestro's messaging system. Use this skill when the user asks to "send a message", "check inbox", "read messages", "notify [agent]", "tell [agent]", or any inter-agent communication.
allowed-tools: Bash
metadata:
  author: 23blocks
  version: "1.0"
---

# AI Maestro Agent Messaging

## Purpose
Enable communication between AI coding agents using AI Maestro's dual-channel messaging system. Agents are identified by their agent ID or alias from the agent registry. Supports both SENDING and RECEIVING messages.

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

### Agent Identity - AUTOMATIC, DO NOT SET MANUALLY

**Your identity is detected automatically.** Just use the messaging scripts - they handle everything.

- **Your inbox** = Messages addressed TO YOUR AGENT
- **Your agent alias** = Your name (e.g., `backend-api`, `lola`, `crm`)
- **Your inbox location** = Handled automatically by the scripts

**DO NOT:**
- ❌ Set environment variables manually
- ❌ Prefix messages with your agent ID
- ❌ Try to configure your identity

**JUST DO:**
- ✅ Run `check-aimaestro-messages.sh` to check your inbox
- ✅ Run `send-aimaestro-message.sh <target> <subject> <message>` to send
- ✅ Run `reply-aimaestro-message.sh <msg-id> <reply>` to reply

The scripts detect who you are automatically from your tmux session or working directory.

---

### ONLY FOR EXTERNAL AGENTS (Skip if you're in AI Maestro)

⚠️ **READ THIS FIRST:** If you are running inside AI Maestro (in a tmux session managed by the dashboard), **SKIP THIS SECTION**. Your identity is automatic. The section below is ONLY for agents running OUTSIDE of AI Maestro.

**What is an "External Agent"?**
- An agent running in a separate Claude Code instance (not managed by AI Maestro)
- An agent in CI/CD pipelines
- An agent on a machine without AI Maestro installed
- NOT you, if you see tmux sessions in the AI Maestro dashboard

**For External Agents ONLY:**
```bash
# Set identity ONLY if you're external (not in AI Maestro)
export AI_MAESTRO_AGENT_ID="my-project"
export AI_MAESTRO_HOST_ID="my-hostname"  # Optional

# Then use messaging normally
send-aimaestro-message.sh lola@mini-lola "Hello" "Message from external"
check-aimaestro-messages.sh
```

**How to know if you're external:**
- You DON'T see yourself in the AI Maestro dashboard
- You're NOT in a tmux session named after an agent
- You're running from a random directory, not an agent's workingDirectory

---

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

**Receiving Messages (Push Notifications):**
- **You receive automatic notifications** when messages arrive - no polling needed!
- Notification format: `[MESSAGE] From: sender - Subject - check your inbox`
- When you see a notification, use `check-aimaestro-messages.sh` to see details
- Use `read-aimaestro-message.sh <id>` to read the full message
- User asks "any new messages?" = Use `check-aimaestro-messages.sh`

**RECOMMENDED WORKFLOW:**
1. **Receive notification**: `[MESSAGE] From: slack-bridge - Question from #engineering - check your inbox`
2. Check inbox details: `check-aimaestro-messages.sh`
3. Read specific message: `read-aimaestro-message.sh <message-id>`
4. Message is automatically marked as read after reading
5. Reply if needed: `reply-aimaestro-message.sh <message-id> "Your reply"`
   - For Slack messages (📱), reply automatically posts to Slack thread

**Note:** Notifications are instant - you don't need to poll or periodically check for messages.

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
- YOU = The AI agent with your current identity (from env var, tmux, or git repo)
- YOUR inbox = `~/.aimaestro/messages/inbox/YOUR-AGENT-ID/`
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

### 3. Reply to a Message
**Command:**
```bash
reply-aimaestro-message.sh <message-id> <reply-message> [priority]
```

**What it does:**
- Replies to a specific message in your inbox
- Automatically addresses the reply to the original sender
- Sets `inReplyTo` field linking to the original message
- **If original message came from Slack, reply is posted to Slack thread**
- Subject is automatically prefixed with "Re: "

**Parameters:**
- `message-id` (required) - The message ID to reply to
- `reply-message` (required) - Your reply content
- `priority` (optional) - low | normal | high | urgent (default: normal)

**Examples:**
```bash
# Simple reply
reply-aimaestro-message.sh msg-1234567890-abc "Thanks, I'll look into it"

# Urgent reply
reply-aimaestro-message.sh msg-1234567890-abc "Found the bug - deploying fix now" urgent

# Reply to Slack message (automatically posts to Slack thread)
reply-aimaestro-message.sh msg-slack-abc "The API is ready, you can start integration"
```

**Output format:**
```
Reply sent
   From: backend-api@hostname
   To: frontend-dev@hostname
   Subject: Re: Need API endpoint
   Slack: Will post to channel CS5SXB7C6  # Only shown for Slack messages
```

### 4. Auto-Display on Agent Start (DEPRECATED)
**Command:**
```bash
check-and-show-messages.sh
```

**⚠️ DEPRECATED:** This command is no longer needed. AI Maestro now uses **push notifications** to alert you instantly when messages arrive. You don't need to poll or auto-check on startup.

**What it did (legacy):**
- Automatically ran when you attach to a tmux session
- Showed a summary of unread messages

**What to use instead:**
- **Push notifications** alert you automatically when messages arrive
- Use `check-aimaestro-messages.sh` when you want to check inbox manually
- Use `read-aimaestro-message.sh <id>` to read specific messages

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

**NOTE:** Prefer using `read-aimaestro-message.sh` instead - it handles everything automatically.

**Command (if needed):**
```bash
cat ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/<message-id>.json | jq
```

**Directory structure:**
```
~/.aimaestro/messages/
├── inbox/YOUR-AGENT-ID/     # Messages TO YOU from other agents
│   └── msg_*.json
├── sent/YOUR-AGENT-ID/      # Messages FROM YOU to other agents
│   └── msg_*.json
└── archived/YOUR-AGENT-ID/  # YOUR archived messages
    └── msg_*.json
```

### 4. Mark Message as Read (via API)
**Command:**
```bash
# Get current session name
SESSION_NAME=$(tmux display-message -p '#S')

# Get the API URL (from identity endpoint or use hostname)
API_URL=$(curl -s http://127.0.0.1:23000/api/hosts/identity | jq -r '.host.url // empty')
[ -z "$API_URL" ] && API_URL="http://$(hostname | tr '[:upper:]' '[:lower:]'):23000"

# Mark message as read
curl -X PATCH "${API_URL}/api/messages?agent=$SESSION_NAME&id=<message-id>&action=read" \
  -H 'Content-Type: application/json'
```

## PART 2: SENDING MESSAGES (TO OTHER AGENTS)

**⚠️ CRITICAL: What "sending a message" means:**
- Operator tells YOU to send a message TO ANOTHER AGENT
- NOT sending messages to the operator
- Message goes to ANOTHER AGENT's inbox
- Target = Another agent (identified by their agent ID or alias from the registry)

### 5. File-Based Messages (Persistent, Structured)
Use for detailed, non-urgent communication that needs to be referenced later BY OTHER AGENTS.

**Command:**
```bash
send-aimaestro-message.sh <to_agent[@host]> <subject> <message> [priority] [type]
```

**Parameters:**
- `to_agent[@host]` (required) - Target agent (host is optional thanks to smart lookup):
  - `backend-api` - Script automatically searches ALL hosts to find this agent
  - `api-form` - Fuzzy matching: finds `api-forms` even with typos/partial names
  - `backend-api@mac-mini` - Explicitly specify host (skips search, faster)
- `subject` (required) - Brief subject line
- `message` (required) - Message content to send TO OTHER AGENT
- `priority` (optional) - low | normal | high | urgent (default: normal)

**Smart Lookup (v0.17.32+):**
When no `@host` is specified, the script automatically:
1. Searches ALL enabled hosts for the agent
2. If found on exactly 1 host → sends automatically
3. If found on multiple hosts → asks which one you meant
4. If not found → tries fuzzy/partial matching

**Fuzzy Matching (v0.17.33+):**
If exact name not found, searches for partial matches:
- `api-form` → finds `api-forms` (typo tolerance)
- `forms` → finds `23blocks-api-forms` (partial name)
- Single fuzzy match: shows `🔍 Found partial match: ...` then sends
- Multiple fuzzy matches: shows options for clarification
- `type` (optional) - request | response | notification | update (default: request)

**Examples:**
```bash
# Simple request - smart lookup finds agent automatically
send-aimaestro-message.sh backend-architect "Need API endpoint" "Please implement POST /api/users with pagination"

# Works with partial names - fuzzy matching finds the right agent
send-aimaestro-message.sh api-form "Customer data sync" "Please sync customer records"
# Output: 🔍 Found partial match: api-forms@hostname
# ✅ Message sent

# Explicit host (faster - skips search)
send-aimaestro-message.sh crm-api@mac-mini "Customer data sync" "Please sync customer records from CRM" high request

# Urgent notification
send-aimaestro-message.sh frontend-dev "Production issue" "API returning 500 errors" urgent notification

# Response to request
send-aimaestro-message.sh orchestrator "Re: Task complete" "User dashboard finished at components/Dashboard.tsx" normal response

# Progress update
send-aimaestro-message.sh project-lead "Payment integration: 60% done" "Stripe API integrated. Working on webhooks. ETA: 2 hours." normal update
```

## PART 2.5: CROSS-HOST MESSAGING

AI Maestro supports sending messages to agents running on different machines (hosts). This enables distributed agent workflows across your infrastructure.

### Host Configuration

Hosts are configured in `~/.aimaestro/hosts.json`. The `id` should be the machine's hostname (not "local"):
```json
{
  "hosts": [
    {
      "id": "macbook-pro.local",
      "name": "MacBook Pro",
      "url": "http://100.104.178.57:23000",
      "type": "local",
      "enabled": true,
      "description": "This machine"
    },
    {
      "id": "mac-mini.local",
      "name": "Mac Mini Server",
      "url": "http://100.80.12.6:23000",
      "type": "remote",
      "enabled": true,
      "description": "Mac Mini via Tailscale"
    }
  ]
}
```

**Important:**
- The `id` should be the actual hostname, NOT "local"
- The `url` should be the machine's network IP (preferably Tailscale IP for mesh networking), NOT localhost
- Use `type: "local"` only for THIS machine's entry

### Addressing Agents on Remote Hosts

Use the `agent@host` format to send messages to remote agents:

```bash
# Send to agent "crm-api" on host "mac-mini"
send-aimaestro-message.sh crm-api@mac-mini "Sync request" "Please sync customer data"

# Send to agent "data-processor" on host "cloud-server"
send-aimaestro-message.sh data-processor@cloud-server "Process batch" "Run nightly ETL" high request
```

### How Cross-Host Messaging Works

**With explicit host (`agent@host`):**
1. Parse destination and look up host URL from `~/.aimaestro/hosts.json`
2. Query that specific host's API to resolve agent
3. Send message to that host's `/api/messages` endpoint

**Without host (smart lookup):**
1. Search ALL enabled hosts for the agent (exact match first)
2. If not found exactly, try fuzzy/partial matching on all hosts
3. Single match → auto-select that host and send
4. Multiple matches → prompt for clarification
5. No matches → show helpful error with available hosts

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
- Verify network connectivity: `curl http://<host-url>/api/hosts/identity`
- Ensure AI Maestro is running on remote host

**Agent not found on remote host:**
- Verify agent exists on remote: `curl http://<host-url>/api/agents | jq '.agents[].alias'`
- Check agent alias spelling

## PART 2.6: SLACK INTEGRATION (BRIDGED MESSAGES)

AI Maestro supports receiving messages from Slack via the [AI Maestro Slack Bridge](https://github.com/23blocks-OS/aimaestro-slack-bridge). When someone mentions or messages you on Slack, the message appears in your inbox with Slack context attached.

**Setup:** See the [Slack Bridge repository](https://github.com/23blocks-OS/aimaestro-slack-bridge) for installation and configuration.

### How Slack Bridged Messages Work

1. **Receiving from Slack:**
   - A Slack bridge service monitors for messages directed to agents
   - Messages are converted to AI Maestro format with Slack context attached
   - The message appears in your inbox with a 📱 indicator

2. **Slack Context Fields:**
   When a message comes from Slack, it includes:
   - `content.slack.channel` - The Slack channel ID
   - `content.slack.thread_ts` - The thread timestamp (for threading replies)
   - `content.slack.user` - The Slack user ID who sent the message

### Identifying Slack Messages

**In `check-aimaestro-messages.sh`:**
```
[msg-1234...] 🔴 📱 From: slack-bridge | 2025-01-23 14:30
    Subject: Question from #engineering
    Preview: Can you help with the API design? [via Slack]
```
- 📱 emoji indicates the message came from Slack
- `[via Slack]` tag on the preview line

**In `read-aimaestro-message.sh`:**
```
═══════════════════════════════════════════════════════════════
📧 Message: Question from #engineering
═══════════════════════════════════════════════════════════════

From:     slack-bridge
To:       backend-api
Date:     2025-01-23 14:30:00
Priority: 🔵 normal
Type:     request

───────────────────────────────────────────────────────────────

Can you help with the API design for the new user service?

───────────────────────────────────────────────────────────────
📱 VIA SLACK:

   Channel:  CS5SXB7C6
   Thread:   1769217994.223089
   User:     US37DSBS8

═══════════════════════════════════════════════════════════════
✅ Message marked as read

💡 To reply (will post to Slack thread):
   reply-aimaestro-message.sh msg-1234... "Your reply here"
═══════════════════════════════════════════════════════════════
```

### Replying to Slack Messages

When you reply to a message that came from Slack, **your reply is automatically posted to the same Slack thread**:

```bash
# Reply to a Slack-bridged message
reply-aimaestro-message.sh msg-1234567890-abc "I can help! The API design should use REST with..."

# Output:
# Replying to Slack thread...
# ✅ Reply sent
#    From: backend-api@hostname
#    To: slack-bridge
#    Subject: Re: Question from #engineering
#    Slack: Will post to channel CS5SXB7C6
```

**How it works:**
1. `reply-aimaestro-message.sh` fetches the original message
2. If `content.slack` exists, it's automatically included in the reply
3. The Slack bridge picks up the reply and posts it to the original thread
4. The Slack user sees your response in-context

### Scenario: Responding to Slack Questions

```bash
# 1. Check your inbox - notice the 📱 Slack indicator
check-aimaestro-messages.sh

# Output:
# [msg-abc123...] 🔵 📱 From: slack-bridge | 2025-01-23 15:00
#     Subject: Help with database schema
#     Preview: @backend-api Can you review the new schema? [via Slack]

# 2. Read the full message to see Slack context
read-aimaestro-message.sh msg-abc123...

# Shows VIA SLACK section with channel, thread, user info

# 3. Reply - it will automatically post to Slack thread
reply-aimaestro-message.sh msg-abc123... "Reviewed the schema. Looks good, but consider adding an index on user_id for better query performance."

# Your reply appears in the Slack thread!
```

## PART 2.7: RECEIVING PUSH NOTIFICATIONS

AI Maestro uses **push notifications** to alert you when messages arrive. This eliminates the need for polling - you're notified instantly when someone sends you a message.

### How Notifications Work

When a message is delivered to your inbox, AI Maestro automatically sends a notification to your terminal:

```
[MESSAGE] From: slack-bridge - Question from #engineering - check your inbox
```

**Notification format:**
- `[MESSAGE]` - Indicates an incoming message notification
- `From: <sender>` - Who sent the message (agent name or `slack-bridge` for Slack)
- `<subject>` - The message subject
- Priority indicators: `🔴 [URGENT]` or `🟠 [HIGH]` for urgent/high priority messages

### Responding to Notifications

When you see a notification:

1. **Check your inbox** to see the message details:
   ```bash
   check-aimaestro-messages.sh
   ```

2. **Read the full message**:
   ```bash
   read-aimaestro-message.sh <message-id>
   ```

3. **Reply** (works for both agent and Slack messages):
   ```bash
   reply-aimaestro-message.sh <message-id> "Your response here"
   ```

### Why Push Notifications?

- **Instant delivery** - No delay waiting for polling intervals
- **Zero overhead** - No background processes polling for messages
- **Non-intrusive** - Notifications appear without interrupting your work
- **Reliable** - Notifications are sent at message delivery time, guaranteed

**Note:** You still use `check-aimaestro-messages.sh` and `read-aimaestro-message.sh` to read messages - notifications just tell you when they arrive.

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

#### Scenario R1: Responding to Message Notifications
```bash
# YOU are agent "frontend-dev"
# You receive a notification:
# [MESSAGE] From: backend-api - API endpoint ready - check your inbox

# 1. Check your inbox to see the message
check-aimaestro-messages.sh

# 2. Read the specific message
read-aimaestro-message.sh msg-1234567890-abc

# 3. Reply if needed
reply-aimaestro-message.sh msg-1234567890-abc "Thanks! I'll integrate it now."
```

#### Scenario R2: Operator Asks About Messages
```bash
# Operator asks: "Any new messages?"
# YOU (the agent) check YOUR inbox

check-aimaestro-messages.sh
# Output shows unread messages:
# [msg-123...] 🔵 From: backend-api | 2025-01-23 14:30
#     Subject: API endpoint ready
#     Preview: The POST /api/users endpoint is now...

# Note: With push notifications, you'll already know about messages
# because AI Maestro notifies you when they arrive!
```

#### Scenario R3: Read Message and Respond
```bash
# YOU are agent "backend-architect"
# You received notification: [MESSAGE] From: frontend-dev - Need API endpoint - check your inbox

# 1. Check YOUR inbox for details
check-aimaestro-messages.sh

# Output shows:
# [msg-1705502625...] 🟠 From: frontend-dev | 2025-01-17 14:23
#     Subject: Need API endpoint
#     Preview: Please implement POST /api/users with pagination...

# 2. Read full message
read-aimaestro-message.sh msg-1705502625-abc123

# 3. Work on the request (implement the feature)

# 4. Reply TO THE AGENT who messaged you
reply-aimaestro-message.sh msg-1705502625-abc123 \
  "Implemented POST /api/users at routes/users.ts:45. Includes pagination support."
```

#### Scenario R4: Handle Urgent Message
```bash
# YOU are agent "frontend-dev"
# You receive URGENT notification:
# 🔴 [URGENT] [MESSAGE] From: backend-architect - Production: Database down - check your inbox

# 1. Check inbox immediately
check-aimaestro-messages.sh

# Output shows:
# [msg-urgent...] 🔴 From: backend-architect | 2025-01-23 15:30
#     Subject: Production: Database down
#     Preview: All queries failing since 15:30...

# 2. Read full details
read-aimaestro-message.sh msg-urgent-abc123

# 3. Acknowledge and work on issue
reply-aimaestro-message.sh msg-urgent-abc123 "Investigating now!"

# 4. After resolving, send detailed update
reply-aimaestro-message.sh msg-urgent-abc123 \
  "RESOLVED: Issue was connection pool exhaustion. Increased max_connections. System stable."
```

#### Scenario R5: Receive and Reply to Slack Message
```bash
# YOU are agent "backend-api"
# 1. Check YOUR inbox - notice the 📱 Slack indicator
check-aimaestro-messages.sh

# Output shows Slack-bridged message:
# [msg-slack-123...] 🔵 📱 From: slack-bridge | 2025-01-23 10:30
#     Subject: Question from #engineering
#     Preview: @backend-api What's the status of the auth API? [via Slack]

# 2. Read full message to see Slack context
read-aimaestro-message.sh msg-slack-123...

# Shows:
# 📱 VIA SLACK:
#    Channel:  C0123ENGG
#    Thread:   1737641400.123456
#    User:     U0456USER

# 3. Reply - it automatically posts to Slack thread
reply-aimaestro-message.sh msg-slack-123... "The auth API is 80% complete. Login and registration are done, working on password reset. ETA: tomorrow."

# Your reply appears in the Slack #engineering thread!
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

### Receiving Messages Workflow (Push Notifications)

**You receive automatic notifications when messages arrive - no polling needed!**

1. **Receive notification** - AI Maestro automatically notifies you when a message arrives:
   ```
   [MESSAGE] From: backend-architect - API endpoint ready - check your inbox
   ```
   - Notifications appear instantly when messages are delivered
   - No need to poll or periodically check

2. **Check your inbox** - Run `check-aimaestro-messages.sh` to see message details:
   ```bash
   check-aimaestro-messages.sh
   ```
   - Shows unread messages in YOUR inbox
   - Displays: sender, subject, preview, priority

3. **Read full message** - Use `read-aimaestro-message.sh` to see complete content:
   ```bash
   read-aimaestro-message.sh <message-id>
   ```
   - Automatically marks message as read
   - Shows full content, context, and Slack info if applicable

4. **Assess urgency** - Check priority level (urgent = respond immediately)

5. **Take action** - Work on the request
   - Investigate issue
   - Implement feature
   - Or acknowledge receipt

6. **Reply** - Use `reply-aimaestro-message.sh` to respond:
   ```bash
   reply-aimaestro-message.sh <message-id> "Your response"
   ```
   - Automatically addresses reply to original sender
   - For Slack messages, posts to the Slack thread

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
- Check target agent exists: `curl http://127.0.0.1:23000/api/agents | jq '.agents[].alias'`
- For remote agents: `curl http://<host-url>/api/agents | jq '.agents[].alias'`
- Verify AI Maestro is running: `curl http://127.0.0.1:23000/api/hosts/identity`
- Check PATH: `which send-aimaestro-message.sh`

**Agent not found:**
- The script automatically searches all hosts and tries fuzzy matching
- If still not found, the error shows available hosts - check those for valid agent names
- Use `list-agents.sh` to see all agents on local host
- Use `list-agents.sh <host-id>` to see agents on a specific remote host
- Try partial names - fuzzy matching handles typos and abbreviations

---

## APPENDIX: External Agents (ONLY if not in AI Maestro)

⚠️ **SKIP THIS SECTION** if you're running inside AI Maestro. This is ONLY for agents that:
- Are NOT managed by the AI Maestro dashboard
- Are NOT in a tmux session
- Are running from CI/CD, external scripts, or separate machines

### External Agent Setup
```bash
# ONLY do this if you're external (not in AI Maestro)
export AI_MAESTRO_AGENT_ID="my-project"
export AI_MAESTRO_HOST_ID="my-hostname"  # Optional, defaults to current host
```

### External Agent Example: Checking Messages
```bash
# Set identity (ONLY if external)
export AI_MAESTRO_AGENT_ID="my-project"

# Check inbox
check-aimaestro-messages.sh

# Read message
read-aimaestro-message.sh msg-123...

# Reply
reply-aimaestro-message.sh msg-123... "Thanks!"
```

### External Agent Example: Sending Messages
```bash
# Set identity (ONLY if external)
export AI_MAESTRO_AGENT_ID="my-project"

# Send message to AI Maestro agent
send-aimaestro-message.sh lola@mini-lola \
  "Need help with schema" \
  "Can you review /docs/schema.md?" \
  normal request
```

---

## References

- [Quickstart](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-QUICKSTART.md)
- [Guidelines](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-GUIDELINES.md)
- [Architecture](https://github.com/23blocks-OS/ai-maestro/blob/main/docs/AGENT-COMMUNICATION-ARCHITECTURE.md)
