# Agent Messaging System Guide

This guide explains how to use the file-based messaging system to enable communication between Claude Code agents running in different tmux sessions.

## Overview

The AI Maestro dashboard includes a file-based message queue that allows agents to send and receive messages. This enables powerful workflows like:

- **Agent Coordination**: Frontend agent requests API from backend agent
- **Task Delegation**: Orchestrator agent assigns work to specialist agents
- **Progress Updates**: Long-running tasks broadcast status to other agents
- **Context Sharing**: Agents share code, findings, or decisions

## Message Storage Location

All messages are stored in: `~/.aimaestro/messages/`

```
~/.aimaestro/messages/
├── inbox/
│   ├── backend-architect/     # Messages TO backend-architect
│   ├── frontend-developer/    # Messages TO frontend-developer
│   └── api-tester/           # Messages TO api-tester
├── sent/
│   ├── backend-architect/     # Messages FROM backend-architect
│   └── frontend-developer/    # Messages FROM frontend-developer
└── archived/
    └── backend-architect/     # Archived messages
```

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

Add this to your agent's workflow (e.g., in a custom prompt or CLAUDE.md):

```bash
# Check for new messages at the start of each task
ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/*.json 2>/dev/null

# Read a specific message
cat ~/.aimaestro/messages/inbox/my-session-name/msg-123.json
```

#### Sending a Message Programmatically

Create a JSON file in the recipient's inbox and your sent folder:

```bash
# Example: Send message from frontend-developer to backend-architect
MESSAGE_ID="msg-$(date +%s)-$(openssl rand -hex 4)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > ~/.aimaestro/messages/inbox/backend-architect/${MESSAGE_ID}.json << 'EOF'
{
  "id": "'${MESSAGE_ID}'",
  "from": "frontend-developer",
  "to": "backend-architect",
  "timestamp": "'${TIMESTAMP}'",
  "subject": "Need login API endpoint",
  "priority": "high",
  "status": "unread",
  "content": {
    "type": "request",
    "message": "Please implement POST /api/auth/login endpoint",
    "context": {
      "requirements": ["email", "password", "JWT response"]
    }
  }
}
EOF

# Copy to your sent folder
cp ~/.aimaestro/messages/inbox/backend-architect/${MESSAGE_ID}.json \
   ~/.aimaestro/messages/sent/frontend-developer/${MESSAGE_ID}.json
```

### Method 3: Using the API

The dashboard exposes REST endpoints for messaging:

```bash
# Send a message
curl -X POST http://localhost:3000/api/messages \
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

# List messages for a session
curl "http://localhost:3000/api/messages?session=backend-architect"

# Get unread count
curl "http://localhost:3000/api/messages?session=backend-architect&action=unread-count"

# Mark as read
curl -X PATCH "http://localhost:3000/api/messages?session=backend-architect&id=msg-123&action=read"
```

## Agent Workflow Examples

### Example 1: Request-Response Pattern

**Frontend Agent** (session: `project-frontend-ui`):

```
User: "Build a login form"

Claude (Frontend):
1. Designs login form component
2. Realizes it needs an API endpoint
3. Sends message to backend agent:
   - To: project-backend-api
   - Subject: "Need POST /api/auth/login endpoint"
   - Type: request
   - Context: { requirements: ["email/password", "JWT token"] }
4. Continues with UI work while waiting
```

**Backend Agent** (session: `project-backend-api`):

```
User: "Check for messages and work on any requests"

Claude (Backend):
1. Checks inbox: ls ~/.aimaestro/messages/inbox/project-backend-api/
2. Finds message from frontend agent
3. Reads requirements
4. Implements /api/auth/login endpoint
5. Sends response message:
   - To: project-frontend-ui
   - Subject: "Re: Login API endpoint ready"
   - Type: response
   - Context: { endpoint: "POST /api/auth/login", file: "routes/auth.ts:45" }
```

**Frontend Agent** (continues):

```
Claude (Frontend):
1. Receives response message
2. Updates LoginForm to call the new endpoint
3. Tests integration
```

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
1. Check for new messages: `ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/*.json`
2. If messages exist, read and prioritize them based on priority field
3. Handle urgent/high priority messages immediately
4. Queue normal/low priority messages for later
5. Always respond to request-type messages when task is complete
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

### 1. Check Messages Regularly

Add message checking to your agent workflow:

```bash
# Add to .bashrc or .zshrc for automatic checking
check_messages() {
  SESSION=$(tmux display-message -p '#S' 2>/dev/null)
  if [ -n "$SESSION" ]; then
    COUNT=$(ls ~/.aimaestro/messages/inbox/$SESSION/*.json 2>/dev/null | wc -l)
    if [ $COUNT -gt 0 ]; then
      echo "📬 You have $COUNT unread message(s)"
    fi
  fi
}

# Run on every prompt
PROMPT_COMMAND="check_messages"
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

Archive or delete messages after handling:

```bash
# Move to archived
mv ~/.aimaestro/messages/inbox/my-session/msg-123.json \
   ~/.aimaestro/messages/archived/my-session/

# Or delete
rm ~/.aimaestro/messages/inbox/my-session/msg-123.json
```

## Troubleshooting

### Messages Not Appearing in Dashboard

1. Check file permissions: `ls -la ~/.aimaestro/messages/inbox/`
2. Verify JSON format: `cat ~/.aimaestro/messages/inbox/session-name/msg.json | jq`
3. Check session name matches exactly: `tmux list-sessions`

### Agent Not Finding Messages

1. Verify session name: `echo $(tmux display-message -p '#S')`
2. Check directory exists: `ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/`
3. Verify file permissions: `chmod -R u+rw ~/.aimaestro/messages/`

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

You can create custom scripts that automatically process messages:

```bash
#!/bin/bash
# ~/.local/bin/process-agent-messages.sh

SESSION=$(tmux display-message -p '#S')
INBOX=~/.aimaestro/messages/inbox/$SESSION

for msg_file in $INBOX/*.json; do
  [ -f "$msg_file" ] || continue

  # Parse message
  TYPE=$(jq -r '.content.type' "$msg_file")
  PRIORITY=$(jq -r '.priority' "$msg_file")

  # Handle based on type and priority
  if [ "$PRIORITY" = "urgent" ]; then
    echo "🚨 URGENT MESSAGE: $(jq -r '.subject' "$msg_file")"
    # Trigger notification, log, etc.
  fi

  # Mark as read or archive
  # ...
done
```

Add to cron or run periodically in your session.

## Integration with Claude Code

### Proactive Message Checking

Add to your `CLAUDE.md` project instructions:

```markdown
## Inter-Agent Communication

This project uses the AI Maestro messaging system for agent coordination.

**At the start of each task:**
1. Check for messages: `ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/*.json`
2. Read any unread messages
3. Prioritize urgent/high priority messages
4. Incorporate message context into your task planning

**When you need help from another agent:**
1. Identify the appropriate specialist agent
2. Use the Messages tab in the dashboard to send a request
3. Include clear context and requirements
4. Continue with independent work while waiting for response

**When you complete work requested by another agent:**
1. Send a response message with results
2. Include file paths, line numbers, and any relevant details
3. Mark the original request as handled
```

## Future Enhancements

Potential future features for the messaging system:

- **Message Templates**: Pre-defined message formats for common scenarios
- **Auto-Responses**: Agents automatically acknowledge receipt
- **Message Threading**: Link related messages together
- **Rich Content**: Attach files, code snippets, screenshots
- **Message Search**: Full-text search across all messages
- **Webhooks**: Trigger external actions on message receipt
- **Analytics**: Track agent communication patterns

## Related Documentation

- [EXTERNAL-SESSION-SETUP.md](../EXTERNAL-SESSION-SETUP.md) - Creating tmux sessions
- [OPERATIONS-GUIDE.md](./OPERATIONS-GUIDE.md) - Dashboard operations
- [CLAUDE.md](../CLAUDE.md) - Project architecture and conventions
