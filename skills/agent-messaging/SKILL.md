---
name: AI Maestro Agent Messaging
description: Send and receive messages between AI agent sessions using AI Maestro's messaging system. Use this skill when the user asks to "send a message", "check inbox", "read messages", "notify [session]", "tell [agent]", or any inter-agent communication.
allowed-tools: Bash
---

# AI Maestro Agent Messaging

## Purpose
Enable communication between AI coding agents running in different tmux sessions using AI Maestro's dual-channel messaging system. Supports both SENDING and RECEIVING messages.

## CRITICAL: Inter-Agent Communication

**YOU ARE AN AGENT** - This skill is for **agent-to-agent** communication, NOT human-agent communication.

- **Your inbox** = Messages sent TO YOUR SESSION by OTHER AGENTS
- **Your session name** = The tmux session you're running in (get with `tmux display-message -p '#S'`)
- **Your inbox location** = `~/.aimaestro/messages/inbox/YOUR-SESSION-NAME/`

**You do NOT read:**
- ❌ The human operator's messages
- ❌ Other agents' private inboxes
- ❌ Messages not addressed to your session

**You DO read:**
- ✅ Messages sent TO YOUR SESSION by other agents
- ✅ YOUR OWN inbox only
- ✅ Messages that other agents want YOU to see

## When to Use This Skill

**Sending (Agent-to-Agent):**
- User (operator) says "send a message to [another-agent-session]"
- User says "notify [another-agent]" or "alert [another-agent]"
- User wants YOU to communicate with ANOTHER agent session
- You need to send urgent alerts or requests to OTHER AGENTS

**Receiving (Check YOUR OWN Inbox):**
- User says "check my inbox" = Check messages sent TO YOUR SESSION
- User says "read my messages" = Read messages sent TO YOU (this agent)
- User asks "any new messages?" = Check YOUR inbox for new messages
- Session just started (best practice: check YOUR inbox first)
- You want to see what OTHER AGENTS have sent TO YOU

## Available Tools

## PART 1: RECEIVING MESSAGES (YOUR OWN INBOX)

**⚠️ CRITICAL: What "YOUR inbox" means:**
- YOU = The AI agent running in this tmux session
- YOUR inbox = `~/.aimaestro/messages/inbox/YOUR-SESSION-NAME/`
- Messages in YOUR inbox = Messages OTHER AGENTS sent TO YOU
- NOT the operator's messages, NOT other agents' private messages

**IMPORTANT:** These commands check YOUR SESSION'S inbox only. They automatically:
1. Detect your current session name using `tmux display-message -p '#S'`
2. Read from `~/.aimaestro/messages/inbox/YOUR-SESSION-NAME/`
3. Show messages that OTHER AGENTS sent TO YOU
4. Do NOT access anyone else's inbox

### 1. Check YOUR Inbox (Display All Messages Sent TO YOU)
**Command:**
```bash
check-and-show-messages.sh
```

**What it does:**
- Shows all messages in YOUR inbox (messages sent TO YOUR SESSION)
- Automatically detects YOUR session name
- Displays: message ID, from (which agent), subject, priority, type, timestamp, content
- Marks urgent messages with 🚨
- No parameters needed - reads YOUR inbox automatically

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

### 2. Check for New Messages in YOUR Inbox (Quick Count)
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

### 3. Read Specific Message FROM YOUR Inbox (Direct File Access)
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
curl -X PATCH "http://localhost:23000/api/messages/<message-id>?session=$SESSION_NAME" \
  -H 'Content-Type: application/json' \
  -d '{"status": "read"}'
```

## PART 2: SENDING MESSAGES (TO OTHER AGENTS)

**⚠️ CRITICAL: What "sending a message" means:**
- Operator tells YOU to send a message TO ANOTHER AGENT
- NOT sending messages to the operator
- Message goes to ANOTHER AGENT's inbox
- Target session = Another agent's tmux session name

### 5. File-Based Messages (Persistent, Structured)
Use for detailed, non-urgent communication that needs to be referenced later BY OTHER AGENTS.

**Command:**
```bash
send-aimaestro-message.sh <to_session> <subject> <message> [priority] [type]
```

**Parameters:**
- `to_session` (required) - Target agent's session name (ANOTHER AGENT, not operator)
- `subject` (required) - Brief subject line
- `message` (required) - Message content to send TO OTHER AGENT
- `priority` (optional) - low | normal | high | urgent (default: normal)
- `type` (optional) - request | response | notification | update (default: request)

**Examples:**
```bash
# Simple request
send-aimaestro-message.sh backend-architect "Need API endpoint" "Please implement POST /api/users with pagination"

# Urgent notification
send-aimaestro-message.sh frontend-dev "Production issue" "API returning 500 errors" urgent notification

# Response to request
send-aimaestro-message.sh orchestrator "Re: Task complete" "User dashboard finished at components/Dashboard.tsx" normal response

# Progress update
send-aimaestro-message.sh project-lead "Payment integration: 60% done" "Stripe API integrated. Working on webhooks. ETA: 2 hours." normal update
```

### 6. Instant Notifications (Real-time, Ephemeral)
Use for urgent alerts that need immediate attention FROM OTHER AGENTS.

**Command:**
```bash
send-tmux-message.sh <target_session> <message> [method]
```

**Parameters:**
- `target_session` (required) - Target AGENT's session name (ANOTHER AGENT, not operator)
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

## PART 3: FORWARDING MESSAGES (ROUTING TO OTHER AGENTS)

**⚠️ CRITICAL: What "forwarding a message" means:**
- Operator tells YOU to forward a message FROM YOUR INBOX to ANOTHER AGENT
- Takes a message YOU received and sends it TO ANOTHER AGENT
- Preserves original message context (who sent it, when, original content)
- Useful for routing messages to the right expert or delegating work

### 8. Forward Message (Route to Another Agent)
Use when a message YOU received should be handled by ANOTHER AGENT instead.

**Command:**
```bash
forward-aimaestro-message.sh <message-id|latest> <recipient-session> "[optional note]"
```

**Parameters:**
- `message-id` (required) - ID of message in YOUR inbox OR use "latest" for most recent
- `recipient-session` (required) - Target agent's session name (ANOTHER AGENT)
- `note` (optional) - Additional context YOU want to add for the recipient

**Examples:**
```bash
# Forward latest message to backend architect
forward-aimaestro-message.sh latest backend-architect

# Forward specific message with note
forward-aimaestro-message.sh msg-1234567890-abc backend-architect "FYI - this is backend related"

# Forward to frontend specialist with context
forward-aimaestro-message.sh msg-9876543210-xyz frontend-dev "Please handle the UI parts of this request"

# Quick delegation with explanation
forward-aimaestro-message.sh latest devops-engineer "You're better equipped to handle this deployment issue"
```

**What happens:**
1. Reads original message from YOUR inbox
2. Creates new message TO recipient agent with:
   - Subject: "Fwd: [original subject]"
   - Your note (if provided) at the top
   - Full original message content below
   - Metadata about original sender, recipient, timestamp
3. Sends to recipient's inbox
4. Saves copy in YOUR sent folder
5. Sends tmux notification to recipient

**Natural language examples:**
```
User: "Forward the last message to backend-architect"
→ forward-aimaestro-message.sh latest backend-architect

User: "Send that API question to frontend-dev"
→ forward-aimaestro-message.sh latest frontend-dev

User: "Forward this to devops with a note saying it's urgent"
→ forward-aimaestro-message.sh latest devops-engineer "Urgent - needs immediate attention"

User: "This isn't for me, send it to the backend team"
→ forward-aimaestro-message.sh latest backend-architect "Please handle - backend related"
```

**Use forwarding when:**
- Message sent to YOU but should be handled by ANOTHER AGENT
- Question is outside YOUR expertise (route to specialist)
- Need to delegate work to ANOTHER AGENT
- Want to loop in ANOTHER AGENT on existing conversation

**Forwarded message format:**
```
[Your forwarding note if provided]

--- Forwarded Message ---
From: original-sender
To: you (original recipient)
Sent: 2025-01-19 10:30:00
Subject: Original subject here

Original message content...
--- End of Forwarded Message ---
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

#### Scenario R1: Check YOUR Inbox on Session Start
```bash
# YOU are agent "frontend-dev"
# Best practice: Always check YOUR inbox when starting a session

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

### FORWARDING Examples

#### Scenario F1: Forward Message to Right Expert
```bash
# YOU are agent "general-support"
# Check YOUR inbox
check-and-show-messages.sh

# Output shows message sent TO YOU:
# From: user-coordinator
# To: general-support        ← YOU
# Subject: Database optimization needed
# Content: How do I optimize slow queries in PostgreSQL?

# This is a backend/database question, not for YOU
# Forward TO the backend specialist
forward-aimaestro-message.sh latest backend-architect "Database question - please advise"
```

#### Scenario F2: Delegate Work with Context
```bash
# YOU are agent "senior-dev"
# Received a UI task but frontend specialist should handle it

check-and-show-messages.sh
# Shows: "Need to redesign login page"

# Forward with delegation note
forward-aimaestro-message.sh latest frontend-dev "Please take this - you're the UI expert. Let me know if you need design specs."
```

#### Scenario F3: Forward Urgent Issue
```bash
# YOU are agent "api-developer"
# Received production alert but devops should handle it

check-and-show-messages.sh
# Shows: Priority: urgent, Subject: "Server memory issue"

# Quick forward with urgency note
forward-aimaestro-message.sh latest devops-engineer "URGENT - production issue, needs immediate attention"

# Also send instant alert
send-tmux-message.sh devops-engineer "🚨 Forwarded urgent production alert to your inbox!" inject
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

1. **Check YOUR inbox proactively** - Run `check-and-show-messages.sh` when session starts or operator asks
   - This reads `~/.aimaestro/messages/inbox/YOUR-SESSION-NAME/`
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

2. **Identify target session** - Which OTHER agent/session should receive this message FROM YOU?
   - Target = Another agent's session name
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
