# AI Maestro Messaging Scripts

Command-line tools for agent-to-agent communication. These scripts work with **any AI agent** (Claude Code, Aider, Cursor, etc.) running in tmux sessions.

## Installation

### Recommended: Automated Installer

```bash
cd /path/to/ai-maestro
./install-messaging.sh
# Installs scripts + Claude Code skill automatically
```

### Update Existing Installation

```bash
cd /path/to/ai-maestro
git pull origin main        # Get latest changes
./update-messaging.sh       # Update scripts and skill
# Remember to restart Claude agents after updating
```

### Manual Installation

#### Option 1: Copy to PATH

```bash
# Copy all scripts to your local bin directory
cp *.sh ~/.local/bin/

# Make them executable
chmod +x ~/.local/bin/*.sh

# Verify installation
which send-aimaestro-message.sh
```

#### Option 2: Add to PATH

```bash
# Add this repo's messaging_scripts folder to your PATH
echo 'export PATH="$PATH:/path/to/ai-maestro/messaging_scripts"' >> ~/.zshrc
source ~/.zshrc

# Make scripts executable
chmod +x *.sh
```

## Available Scripts

### 1. send-aimaestro-message.sh

Send persistent, structured messages to another agent's inbox.

**Usage:**
```bash
send-aimaestro-message.sh <to_session> <subject> <message> [priority] [type]
```

**Parameters:**
- `to_session` - Target agent's name (required)
- `subject` - Brief subject line (required)
- `message` - Message content (required)
- `priority` - low | normal | high | urgent (optional, default: normal)
- `type` - request | response | notification | update (optional, default: request)

**Examples:**
```bash
# Simple request
send-aimaestro-message.sh backend-api "Need endpoint" "Please implement GET /api/users"

# Urgent notification
send-aimaestro-message.sh frontend-dev "Build failed" "Tests failing in CI" urgent notification

# Response to request
send-aimaestro-message.sh orchestrator "Task complete" "Feature implemented at src/components/Dashboard.tsx" normal response
```

### 2. check-and-show-messages.sh

Display all messages in your agent's inbox.

**Usage:**
```bash
check-and-show-messages.sh
```

**Output:**
```
Message: msg_1234567890_abcde
From: backend-architect
To: frontend-dev
Subject: API endpoint ready
Priority: high
Type: response
Status: unread
Timestamp: 2025-01-18 14:23:45
Content: GET /api/users implemented at routes/users.ts...
```

### 3. check-new-messages-arrived.sh

Quick check for unread message count.

**Usage:**
```bash
check-new-messages-arrived.sh
```

**Output:**
```
You have 3 new message(s)
```

### 4. send-tmux-message.sh

Send instant real-time notifications to another agent's terminal.

**Usage:**
```bash
send-tmux-message.sh <target_session> <message> [method]
```

**Parameters:**
- `target_session` - Target agent's name (required)
- `message` - Alert text (required)
- `method` - display | inject | echo (optional, default: display)

**Methods:**
- `display` - Non-intrusive popup (auto-dismisses)
- `inject` - Inject into terminal history (visible, interrupts)
- `echo` - Formatted output (most visible)

**Examples:**
```bash
# Quick popup alert
send-tmux-message.sh backend-api "Check your inbox!"

# Visible terminal injection
send-tmux-message.sh frontend-dev "Build complete!" inject

# Critical formatted alert
send-tmux-message.sh backend-api "PRODUCTION DOWN!" echo
```

## Common Workflows

### Check inbox on agent start
```bash
# Best practice: Check messages when starting work
check-and-show-messages.sh
```

### Send urgent alert with details
```bash
# 1. Get immediate attention
send-tmux-message.sh backend-api "🚨 Check inbox NOW!"

# 2. Provide full context
send-aimaestro-message.sh backend-api \
  "Production: Database timeout" \
  "All /api/users endpoints failing. ~200 users affected." \
  urgent \
  notification
```

### Respond to a request
```bash
# 1. Check your inbox
check-and-show-messages.sh

# 2. Work on the request

# 3. Send response
send-aimaestro-message.sh frontend-dev \
  "Re: API ready" \
  "Implemented at routes/users.ts:45" \
  normal \
  response
```

## Requirements

- AI Maestro running on `http://localhost:23000`
- tmux session with valid agent name
- `curl` and `jq` installed

## Troubleshooting

**Scripts not found:**
```bash
# Check PATH
echo $PATH

# Verify scripts are executable
ls -la ~/.local/bin/*.sh
```

**Can't send messages:**
```bash
# Check AI Maestro is running
curl http://localhost:23000/api/sessions

# Verify target agent exists
tmux list-sessions

# Check you're in a tmux session
tmux display-message -p '#S'
```

**No messages found:**
- This is normal if your inbox is empty
- Messages are stored in `~/.aimaestro/messages/inbox/YOUR-AGENT-NAME/`

## Documentation

- [Quickstart Guide](../docs/AGENT-COMMUNICATION-QUICKSTART.md)
- [Best Practices](../docs/AGENT-COMMUNICATION-GUIDELINES.md)
- [Complete Reference](../docs/AGENT-MESSAGING-GUIDE.md)
- [Architecture](../docs/AGENT-COMMUNICATION-ARCHITECTURE.md)

## License

MIT License - Same as AI Maestro
