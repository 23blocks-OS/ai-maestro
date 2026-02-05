# Agent Messaging System Guide

This guide explains how to use the [Agent Messaging Protocol (AMP)](https://agentmessaging.org) to enable communication between AI agents. AMP is an open standard for AI agent communication, providing secure, cryptographically signed messaging between agents.

## Overview

AI Maestro implements AMP v1.0 and can act as both a local provider and federate with external providers like [CrabMail](https://crabmail.ai). This enables powerful workflows like:

- **Agent Coordination**: Frontend agent requests API from backend agent
- **Task Delegation**: Orchestrator agent assigns work to specialist agents
- **Progress Updates**: Long-running tasks broadcast status to other agents
- **Context Sharing**: Agents share code, findings, or decisions

---

## 🎯 Two Operational Modes

AI Maestro's messaging system works in **two ways**, depending on your AI agent:

### Mode 1: Skills Mode - Natural Language (Claude Code Only) ✨

**Best for:** Claude Code sessions with the agent-messaging skill installed

**How it works:** Just describe what you want in natural language. Claude automatically uses the appropriate tools.

```
You: "Send a message to backend-architect asking about the API endpoint status"
Claude: *Automatically calls amp-send with proper parameters*
        ✅ Message sent to backend-architect
```

**Visual Example:**

![Claude Code loading the agent-messaging skill](images/skill-loaded.png)
*Claude Code automatically loads the skill when you mention messaging*

![Sending a message with natural language](images/skill-send-message.png)
*No commands needed - just describe what you want*

**Advantages:**
- ✅ Zero command memorization
- ✅ Context-aware (Claude knows your session name)
- ✅ Natural conversation flow
- ✅ Automatically formats messages correctly
- ✅ Progressive disclosure (skill loads only when relevant)

**Requirements:**
- Claude Code with skills support
- Agent-messaging skill installed at `~/.claude/skills/agent-messaging/`
- AMP CLI tools installed (via `./install-messaging.sh`)

---

### Mode 2: Manual Mode - Command-Line (Universal) 🔧

**Best for:** Any AI agent (Aider, Cursor, custom scripts, shell scripts) or direct usage

**How it works:** Use shell commands directly to send and receive messages.

```bash
amp-send backend-architect \
  "API endpoint status" \
  "What's the status of the /api/users endpoint?"
```

**Visual Example:**

![Using command-line directly](images/no-skill-send-message.png)
*Direct command-line usage - works with any agent*

![Viewing inbox via command line](images/no-skill-review-inbox.png)
*Command-line tools for checking messages*

**Advantages:**
- ✅ Works with **ANY** AI agent (not just Claude Code)
- ✅ Works in shell scripts and automation
- ✅ Full control over all parameters
- ✅ No dependencies on Claude Code
- ✅ Direct filesystem access

**Requirements:**
- AMP CLI tools installed in `~/.local/bin/` (via `./install-messaging.sh`)
- PATH configured to include `~/.local/bin/`
- Agent identity initialized (`amp-init --auto`)

---

## Which Mode Should You Use?

```
Are you using Claude Code with skills installed?
│
├─ YES → Use Skills Mode ✨
│        (Natural language, zero commands)
│
└─ NO → Use Manual Mode 🔧
         (Universal, works with any agent)
```

**The rest of this guide shows BOTH modes** for each operation, so you can use whichever fits your setup.

---

## Visual Communication Flow

Here's what agent-to-agent communication looks like in action:

### Complete Workflow Example

![Agent receives notification](images/agent-I-got-a-message.png)
*Step 1: Agent receives notification of incoming message*

![Agent reviews inbox](images/agent-inbox.png)
*Step 2: Agent opens inbox to review message details*

![Agent sends reply](images/agent-replied.png)
*Step 3: Agent composes and sends reply*

![Complete agent-to-agent exchange](images/inbox-agent-response-to-agent.png)
*Result: Complete agent-to-agent communication without human intervention*

**Key insight:** Whether using Skills Mode (natural language) or Manual Mode (commands), the underlying communication system is identical. Messages are stored persistently, searchable, and structured.

---

## Message Storage Location

AMP messages are stored in: `~/.agent-messaging/`

```
~/.agent-messaging/
├── config.json           # Agent configuration
├── keys/
│   ├── private.pem       # Ed25519 private key (NEVER share!)
│   └── public.pem        # Ed25519 public key
├── messages/
│   ├── inbox/            # Received messages
│   └── sent/             # Sent messages
└── registrations/        # External provider registrations
```

**Note:** AMP uses cryptographic signing (Ed25519) to ensure message authenticity. Your private key signs outgoing messages, and recipients verify signatures using your public key.

## Message Format

Messages are stored as JSON files:

```json
{
  "id": "msg-1736614200-abc123",
  "from": "frontend-developer",
  "to": "backend-architect",
  "timestamp": "2025-01-11T14:30:00Z",
  "subject": "Need API endpoint for user authentication",
  "priority": "high",
  "status": "unread",
  "content": {
    "type": "request",
    "message": "I'm building the login form and need a POST /api/auth/login endpoint",
    "context": {
      "component": "LoginForm.tsx",
      "requirements": [
        "Accept email and password",
        "Return JWT token on success",
        "Return 401 on invalid credentials"
      ]
    }
  },
  "inReplyTo": null
}
```

## How to Use Messaging in Claude Code Sessions

### Method 1: Via Dashboard UI

1. **Open the Messages Tab**: In the AI Maestro dashboard, select a session and click the "Messages" tab
2. **Compose a Message**: Click "Compose" and fill in:
   - **To**: Target session name (e.g., `backend-architect`)
   - **Subject**: Brief description
   - **Priority**: low | normal | high | urgent
   - **Type**: request | response | notification | update
   - **Message**: Your message content
3. **Send**: Click "Send Message"
4. **Check Inbox**: Switch to the recipient session and view messages in the Messages tab

### Method 2: Programmatically (Using Files)

Agents can read/write messages directly by accessing the file system.

#### Checking for New Messages

Use the AMP CLI tools:

```bash
# Check inbox for new messages
amp-inbox

# Quick unread count
amp-inbox --unread

# Read a specific message
amp-read <message-id>
```

#### Sending a Message Programmatically

Use the AMP CLI or API:

```bash
# Using AMP CLI (recommended)
amp-send backend-architect "Need login API endpoint" "Please implement POST /api/auth/login endpoint"

# Using curl with the AMP API
curl -X POST http://localhost:23000/api/v1/route \
  -H "Authorization: Bearer <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "backend-architect@local.aimaestro.local",
    "subject": "Need login API endpoint",
    "payload": {
      "type": "request",
      "message": "Please implement POST /api/auth/login endpoint"
    }
  }'
```

### Method 2.5: Using AMP CLI Tools (Recommended)

AI Maestro provides AMP CLI tools for message sending. These tools implement the [Agent Messaging Protocol](https://agentmessaging.org).

#### amp-init

Initialize your agent identity (required once).

**Usage:**
```bash
amp-init --auto    # Auto-generate agent name from tmux session
amp-init my-agent  # Specify agent name explicitly
```

#### amp-send

Send a message to another agent.

**Usage:**
```bash
amp-send <recipient> <subject> <message>
```

**Examples:**
```bash
# Simple message
amp-send backend-architect "Need API endpoint" "Please implement POST /api/users"

# With priority
amp-send --priority high backend-architect "Urgent request" "Production issue!"

# Reply to a message
amp-reply <message-id> "Your reply here"
```

**Output:**
```
Message sent successfully
  To: backend-architect@local.aimaestro.local
  Subject: Need API endpoint
  ID: msg_abc123
```

#### amp-inbox

Check your inbox for messages.

**Usage:**
```bash
amp-inbox           # List all messages
amp-inbox --unread  # List unread only
```

**Example output:**
```
📬 Inbox (3 messages)

1. [UNREAD] From: frontend-developer
   Subject: Need API endpoint
   Time: 2025-01-17T14:30:00Z
   Priority: high

2. [READ] From: orchestrator
   Subject: Task assignment
   Time: 2025-01-17T12:00:00Z

Use 'amp-read <id>' to read a message
```

#### amp-read

Read a specific message.

**Usage:**
```bash
amp-read <message-id>
```

#### amp-reply

Reply to a message.

**Usage:**
```bash
amp-reply <message-id> "Your reply message"
```

#### amp-status

Check your agent status and registrations.

**Usage:**
```bash
amp-status
```

**Output:**
```
Agent: backend-architect
Address: backend-architect@myorg.aimaestro.local
Public Key: (Ed25519) abc123...

Registrations:
  - local.aimaestro.local (active)
```

---

### Method 3: Using the API

The dashboard exposes REST endpoints for messaging:

```bash
# Send a message
curl -X POST http://localhost:23000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "from": "frontend-developer",
    "to": "backend-architect",
    "subject": "Need API endpoint",
    "priority": "high",
    "content": {
      "type": "request",
      "message": "Please implement POST /api/auth/login"
    }
  }'

# List messages for an agent
curl "http://localhost:23000/api/messages?agent=backend-architect"

# Get unread count
curl "http://localhost:23000/api/messages?agent=backend-architect&action=unread-count"

# Mark as read
curl -X PATCH "http://localhost:23000/api/messages?agent=backend-architect&id=msg-123&action=read"
```

---

### Method 4: Instant tmux Notifications

For urgent, real-time notifications that need immediate attention (different from persistent file-based messages).

#### send-tmux-message.sh

Send instant notifications directly to another session's terminal.

**Usage:**
```bash
send-tmux-message.sh <target_session> <message> [method]
```

**Parameters:**
- `target_session` (required) - Target session name
- `message` (required) - Notification text
- `method` (optional) - display | inject | echo (default: display)

**Methods:**

1. **display** - Popup notification (default, non-intrusive)
   ```bash
   send-tmux-message.sh backend-architect "Check your inbox!"
   ```
   Shows a temporary popup in the target session's status line (auto-dismisses after ~5 seconds).

2. **inject** - Inject as comment in terminal history
   ```bash
   send-tmux-message.sh backend-architect "Urgent: API down!" inject
   ```
   Appears in the terminal history as an executed command. More visible than display.

3. **echo** - Echo to terminal output with formatting
   ```bash
   send-tmux-message.sh backend-architect "CRITICAL: Check logs!" echo
   ```
   Displays formatted message box in terminal output. Most visible but also most intrusive.

**Comparison with File-Based Messages:**

| Feature | send-tmux-message.sh | amp-send |
|---------|----------------------|---------------------------|
| **Speed** | Instant (< 10ms) | Delayed (~100ms, requires API) |
| **Persistence** | Temporary | Permanent (stored in file) |
| **Visibility** | High (appears in terminal) | Medium (requires checking inbox) |
| **Best for** | Urgent alerts | Detailed communication |
| **Structured data** | No | Yes (priority, type, context) |
| **Searchable** | No | Yes (via API or files) |

**When to use instant notifications:**
- ✅ Urgent issues requiring immediate attention
- ✅ Quick "FYI" alerts ("build complete", "tests passing")
- ✅ Making sure file-based message gets seen
- ✅ Production emergencies

**When to use file-based messages:**
- ✅ Detailed requests with context
- ✅ Messages that need to be referenced later
- ✅ Structured communication (priority, type)
- ✅ Non-urgent communication

**Combined approach (urgent + detailed):**
```bash
# 1. Get their attention immediately
send-tmux-message.sh backend-architect "🚨 Urgent: Check inbox NOW!"

# 2. Provide full details in file-based message
amp-send backend-architect \
  "Production: API endpoint failing" \
  "POST /api/users returning 500 errors. Started at 14:30. Logs show database timeout. ~200 users affected." \
  urgent \
  notification
```

**Security note:** Messages are shell-escaped with `printf '%q'` to prevent command injection.

---

## Agent Workflow Examples

### Example 1: Request-Response Pattern

This example shows how two agents coordinate on a feature. We'll show **both** Skills Mode and Manual Mode.

#### Skills Mode (Claude Code) ✨

**Frontend Agent** (session: `project-frontend-ui`):

```
User: "Build a login form"

Claude (Frontend):
1. Designs login form component
2. Realizes it needs an API endpoint
3. You: "We need to request an API endpoint from the backend agent"
   Claude: "I'll send a message to the backend agent requesting this."
   *Automatically sends structured message*
4. Continues with UI work while waiting
```

![Frontend agent sending request](images/skill-send-message.png)
*Frontend agent requesting API endpoint using natural language*

**Backend Agent** (session: `project-backend-api`):

```
User: "Check for messages and work on any requests"

Claude (Backend):
1. You: "Do I have any messages?"
   Claude: "Let me check your inbox..."
   *Automatically calls amp-inbox*
2. Finds message from frontend agent
3. Reads requirements
4. Implements /api/auth/login endpoint
5. You: "Reply to the frontend agent that the endpoint is ready"
   Claude: *Automatically sends response with details*
```

![Backend agent checking inbox](images/skill-review-inbox.png)
*Backend agent checking for incoming requests*

![Backend agent receiving message](images/agent-I-got-a-message.png)
*Backend agent sees the incoming request*

![Backend agent viewing inbox](images/agent-inbox.png)
*Backend agent reviews message details*

**Frontend Agent** (continues):

```
Claude (Frontend):
1. You: "Check if backend agent replied"
   Claude: *Checks inbox, finds response*
2. Updates LoginForm to call the new endpoint
3. Tests integration
```

![Frontend agent sees reply](images/agent-replied.png)
*Frontend agent receives confirmation from backend*

---

#### Manual Mode (Universal) 🔧

**Frontend Agent** (session: `project-frontend-ui`):

```bash
# Frontend agent sends request
amp-send project-backend-api \
  "Need POST /api/auth/login endpoint" \
  "Building login form, need API with email/password → JWT token" \
  high \
  request
```

![Manual mode sending](images/no-skill-send-message.png)
*Using command-line to send request*

**Backend Agent** (session: `project-backend-api`):

```bash
# Backend agent checks inbox
amp-inbox

# Implements endpoint, then replies
amp-send project-frontend-ui \
  "Re: Login API endpoint ready" \
  "Endpoint at routes/auth.ts:45. POST /api/auth/login - accepts {email, password}, returns JWT" \
  normal \
  response
```

![Manual mode inbox check](images/no-skill-receive-messages.png)
*Checking inbox via command line*

![Manual mode reviewing inbox](images/no-skill-review-inbox.png)
*Reviewing full inbox with details*

**Result:** Same outcome, different interaction style. Choose what fits your workflow!

### Example 2: Broadcast Pattern

**Orchestrator Agent** (session: `project-orchestrator`):

```
Claude (Orchestrator):
1. User requests: "Implement user management feature"
2. Breaks down into subtasks
3. Broadcasts messages to specialist agents:
   - To: project-frontend-ui → "Build user list component"
   - To: project-backend-api → "Create CRUD endpoints for users"
   - To: project-database-migrations → "Add users table schema"
4. Each agent works independently
5. Orchestrator monitors progress via response messages
```

### Example 3: Proactive Monitoring

Add to your agent's `CLAUDE.md` instructions:

```markdown
## Message Monitoring Protocol

At the start of each task:
1. Check for new messages: `amp-inbox`
2. If messages exist, read and prioritize them based on priority field
3. Handle urgent/high priority messages immediately
4. Queue normal/low priority messages for later
5. Always respond to request-type messages when task is complete using `amp-reply`
```

## Message Types and When to Use Them

### `request`
Use when you need another agent to do something:
- "Please implement X endpoint"
- "Can you review this code?"
- "Need help with Y algorithm"

### `response`
Use when replying to a request:
- "Endpoint implemented at routes/auth.ts:45"
- "Code review complete, found 3 issues"
- "Algorithm implemented in utils/sort.ts"

### `notification`
Use for FYI updates that don't require action:
- "Deployment completed successfully"
- "Tests are now passing"
- "Database migration applied"

### `update`
Use for progress reports on ongoing work:
- "50% complete on user dashboard"
- "Encountered issue with API, investigating"
- "Waiting for external dependency"

## Priority Levels

- **`urgent`**: Drop everything and address immediately
- **`high`**: Address as soon as current task completes
- **`normal`**: Handle in normal workflow
- **`low`**: Handle when you have free time

## Best Practices

### 1. Push Notifications (Automatic)

As of v0.18.10, AI Maestro uses **push notifications** to instantly alert agents when messages arrive:

```
[MESSAGE] From: backend-api@mini-lola - API endpoint ready - check your inbox
```

No polling or manual checking required - agents receive notifications in real-time via tmux.

**To check for any missed messages** (e.g., at session startup):

```bash
# Quick check for unread messages
amp-inbox
```

### 2. Use Clear Subjects

Good: "Need POST /api/users endpoint with pagination"
Bad: "Help needed"

### 3. Provide Context

Always include:
- What you need
- Why you need it
- Any relevant code/files
- Expected format/structure

### 4. Respond to Requests

If you receive a request-type message, always send a response when done.

### 5. Clean Up Old Messages

Delete messages after handling:

```bash
# Delete a specific message
amp-delete <message-id>

# Or use the delete tool directly
rm ~/.agent-messaging/messages/inbox/<message-id>.json
```

## Troubleshooting

### Messages Not Appearing

1. Check AMP status: `amp-status`
2. Verify agent is initialized: `ls ~/.agent-messaging/config.json`
3. Check message files: `ls ~/.agent-messaging/messages/inbox/`
4. Verify session name: `tmux display-message -p '#S'`

### Agent Not Finding Messages

1. Ensure agent is initialized: `amp-init --auto`
2. Check directory exists: `ls ~/.agent-messaging/messages/inbox/`
3. Verify file permissions: `chmod -R u+rw ~/.agent-messaging/`

### Message JSON Format Errors

Use this template and replace values:

```json
{
  "id": "msg-TIMESTAMP-RANDOM",
  "from": "sender-session-name",
  "to": "recipient-session-name",
  "timestamp": "2025-01-11T14:30:00Z",
  "subject": "Your subject",
  "priority": "normal",
  "status": "unread",
  "content": {
    "type": "request",
    "message": "Your message here"
  }
}
```

## Advanced: Custom Message Handlers

You can create custom scripts that automatically process messages using the AMP CLI:

```bash
#!/bin/bash
# ~/.local/bin/process-agent-messages.sh

INBOX=~/.agent-messaging/messages/inbox

for msg_file in $INBOX/*.json; do
  [ -f "$msg_file" ] || continue

  # Parse message envelope and payload
  PRIORITY=$(jq -r '.envelope.priority' "$msg_file")
  SUBJECT=$(jq -r '.envelope.subject' "$msg_file")
  FROM=$(jq -r '.envelope.from' "$msg_file")

  # Handle based on priority
  if [ "$PRIORITY" = "urgent" ]; then
    echo "🚨 URGENT MESSAGE from $FROM: $SUBJECT"
    # Trigger notification, log, etc.
  fi
done
```

Or use the AMP API to fetch and process messages programmatically.

**Learn more:** Visit [agentmessaging.org](https://agentmessaging.org) for the full AMP protocol specification.

## Integration with Claude Code

### Push Notifications (v0.18.10+)

AI Maestro automatically delivers messages via push notifications. When a message arrives, you'll see:

```
[MESSAGE] From: backend-api - API endpoint ready - check your inbox
```

Add to your `CLAUDE.md` project instructions:

```markdown
## Inter-Agent Communication

This project uses the AI Maestro messaging system for agent coordination.

**When you receive a message notification:**
1. Run `amp-inbox` to see your inbox
2. Read messages with `amp-read <msg-id>`
3. Prioritize urgent/high priority messages
4. Incorporate message context into your task planning

**When you need help from another agent:**
1. Identify the appropriate specialist agent
2. Use `amp-send <agent> <subject> <message>` or the Messages tab in the dashboard
3. Include clear context and requirements
4. Continue with independent work while waiting for response

**When you complete work requested by another agent:**
1. Send a response message with results
2. Include file paths, line numbers, and any relevant details
3. Mark the original request as handled
```

## Slack Integration

Connect your team's Slack workspace to AI Maestro agents using the [AI Maestro Slack Bridge](https://github.com/23blocks-OS/aimaestro-slack-bridge).

### How It Works

```
Slack Message → Slack Bridge → AI Maestro API → Agent Inbox
                                                      ↓
Slack Thread  ← Slack Bridge ← AI Maestro API ← Agent Response
```

### Usage

**DM the bot:**
Send a direct message to the AI Maestro bot in Slack.

**Mention in channels:**
```
@AI Maestro what's the status of the API refactoring?
```

**Route to specific agents:**
```
@AIM:backend-api check the server health
@AIM:frontend-dev review the CSS changes
@AIM:graph-query find all API endpoints
```

### Responding to Slack Messages

When you receive a notification from Slack:

```
[MESSAGE] From: slack-bot - Slack: Question from Juan - check your inbox
```

1. Check your inbox: `amp-inbox`
2. Read the message to see the full Slack context
3. Send your response to `slack-bot` - it will be posted to the Slack thread

```bash
amp-send slack-bot \
  "Re: Question from Juan" \
  "The API endpoint is at /api/users. See routes/users.ts for implementation." \
  normal response
```

### Setup

See the [AI Maestro Slack Bridge repository](https://github.com/23blocks-OS/aimaestro-slack-bridge) for installation and configuration.

## Future Enhancements

Potential future features for the messaging system:

- **Message Templates**: Pre-defined message formats for common scenarios
- **Auto-Responses**: Agents automatically acknowledge receipt
- **Message Threading**: Link related messages together
- **Rich Content**: Attach files, code snippets, screenshots
- **Message Search**: Full-text search across all messages
- **Webhooks**: Trigger external actions on message receipt
- **Analytics**: Track agent communication patterns

## AMP Federation with External Providers

AI Maestro can federate with external AMP providers, allowing your agents to communicate with agents on other networks.

### Register with an External Provider

```bash
# Register with CrabMail (example)
amp-register --provider https://crabmail.ai --tenant myorg

# Register with another AI Maestro instance
amp-register --provider http://192.168.1.10:23000 --tenant remote
```

### Send Messages to External Agents

```bash
# Send to an agent on CrabMail
amp-send alice@acme.crabmail.ai "Hello" "Cross-network message!"

# Send to an agent on another AI Maestro instance
amp-send backend@remote.aimaestro.local "Request" "Can you help?"
```

### Fetch Messages from External Providers

```bash
# Fetch pending messages from all registered providers
amp-fetch
```

**Learn more about federation:** See the [AMP Protocol Specification](https://agentmessaging.org) for details on cross-network messaging.

## Related Documentation

- **[Agent Communication Quickstart](./AGENT-COMMUNICATION-QUICKSTART.md)** - Get started in 5 minutes
- **[Agent Communication Guidelines](./AGENT-COMMUNICATION-GUIDELINES.md)** - Best practices and patterns
- **[Agent Communication Architecture](./AGENT-COMMUNICATION-ARCHITECTURE.md)** - Technical deep-dive
- **[External Agents Integration](./EXTERNAL-AGENTS.md)** - Connect non-AI Maestro agents
- **[Operations Guide](./OPERATIONS-GUIDE.md)** - Dashboard operations
- **[CLAUDE.md](../CLAUDE.md)** - Project architecture and conventions
- **[AMP Protocol](https://agentmessaging.org)** - Official Agent Messaging Protocol specification
