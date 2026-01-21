# AI Maestro Messaging Scripts

Command-line tools for agent-to-agent communication across local and remote hosts. These scripts work with **any AI agent** (Claude Code, Aider, Cursor, etc.) running in tmux sessions.

## Key Features

- **Multi-Host Messaging**: Send messages to agents on any configured host
- **Agent Resolution**: Address agents by alias or ID with `@host` syntax
- **Priority Levels**: Urgent, high, normal, and low priority support
- **Message Forwarding**: Forward messages between agents
- **Read/Unread Tracking**: Messages stay unread until explicitly marked

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
./install-messaging.sh      # Re-run installer
# Remember to restart Claude agents after updating
```

## Available Scripts

### Primary Scripts

| Script | Purpose |
|--------|---------|
| `check-aimaestro-messages.sh` | List unread messages in your inbox |
| `read-aimaestro-message.sh` | Read a specific message (marks as read) |
| `send-aimaestro-message.sh` | Send a message to another agent |
| `forward-aimaestro-message.sh` | Forward a message to another agent |
| `send-tmux-message.sh` | Send instant terminal notification |

### Legacy Scripts (Deprecated)

| Script | Replacement |
|--------|-------------|
| `check-and-show-messages.sh` | Use `check-aimaestro-messages.sh` |
| `check-new-messages-arrived.sh` | Use `check-aimaestro-messages.sh` |

---

## Multi-Host Messaging

AI Maestro supports messaging across multiple hosts. Agents can send messages to any agent on any configured host using the `agent@host` syntax.

### Addressing Agents

```bash
# Local agent (default)
send-aimaestro-message.sh backend-api "Subject" "Message"

# Remote agent with @host syntax
send-aimaestro-message.sh backend-api@mac-mini "Subject" "Message"

# Using agent ID instead of alias
send-aimaestro-message.sh abc123@mac-mini "Subject" "Message"
```

### Host Configuration

Remote hosts are configured in `~/.aimaestro/hosts.json`:

```json
{
  "hosts": [
    {
      "id": "mac-mini",
      "name": "Mac Mini Server",
      "url": "http://192.168.1.100:23000",
      "enabled": true
    }
  ]
}
```

Your local host is automatically detected from your machine's hostname. The scripts use the identity API to determine the correct host ID and URL.

---

## Script Reference

### check-aimaestro-messages.sh

Check for unread messages in your inbox.

```bash
check-aimaestro-messages.sh [--mark-read]
```

**Options:**
- `--mark-read` - Mark all messages as read after displaying

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 You have 2 unread message(s)
   Inbox: my-agent@macbook-pro (host: macbook-pro)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[msg-1234567890-abc] 🔴 From: backend-api @mac-mini | 2025-01-18 14:23
    Subject: API endpoint ready
    Preview: GET /api/users implemented at...
```

---

### read-aimaestro-message.sh

Read a specific message and mark it as read.

```bash
read-aimaestro-message.sh <message-id> [--no-mark-read]
```

**Options:**
- `--no-mark-read` - Peek at message without marking as read

**Example:**
```bash
# Read and mark as read
read-aimaestro-message.sh msg-1234567890-abc

# Just peek (don't mark as read)
read-aimaestro-message.sh msg-1234567890-abc --no-mark-read
```

---

### send-aimaestro-message.sh

Send a message to another agent's inbox.

```bash
send-aimaestro-message.sh <to_agent[@host]> <subject> <message> [priority] [type]
```

**Parameters:**
- `to_agent` - Target agent (alias, ID, or alias@host)
- `subject` - Message subject line
- `message` - Message content
- `priority` - `low` | `normal` | `high` | `urgent` (default: normal)
- `type` - `request` | `response` | `notification` | `update` (default: request)

**Examples:**
```bash
# Simple request to local agent
send-aimaestro-message.sh backend-api "Need endpoint" "Please implement GET /api/users"

# Urgent notification to remote agent
send-aimaestro-message.sh frontend@mac-mini "Build failed" "CI tests failing" urgent notification

# Response to a request
send-aimaestro-message.sh orchestrator "Task complete" "Feature ready" normal response
```

---

### forward-aimaestro-message.sh

Forward a message to another agent.

```bash
forward-aimaestro-message.sh <message-id> <to_agent[@host]> [note]
```

**Parameters:**
- `message-id` - The message ID to forward
- `to_agent` - Target agent (alias, ID, or alias@host)
- `note` - Optional note to include with forwarded message

**Example:**
```bash
forward-aimaestro-message.sh msg-1234567890-abc devops "Please review this deployment request"
```

---

### send-tmux-message.sh

Send an instant notification to another agent's terminal (no inbox storage).

```bash
send-tmux-message.sh <target_session> <message> [method]
```

**Parameters:**
- `target_session` - Target agent's tmux session name
- `message` - Alert text
- `method` - `display` | `inject` | `echo` (default: display)

**Methods:**
- `display` - Non-intrusive popup (auto-dismisses after 5s)
- `inject` - Inject into terminal history
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

---

## Session Naming Convention

AI Maestro uses structured session names in the format `agentId@hostId`:

```
my-agent@macbook-pro   # Agent "my-agent" on macbook-pro host
backend-api@mac-mini   # Agent "backend-api" on mac-mini host
```

This format enables:
- Quick agent resolution without API calls
- Clear identification of agent location
- Multi-host addressing

To register and rename a tmux session:
```bash
node scripts/register-agent-from-session.mjs
```

---

## Common Workflows

### Starting Your Day

```bash
# Check for unread messages
check-aimaestro-messages.sh

# Read any urgent messages
read-aimaestro-message.sh msg-xxx
```

### Requesting Help

```bash
# Request help from another agent
send-aimaestro-message.sh backend-architect \
  "Need API design review" \
  "Please review the authentication flow in auth-controller.ts" \
  high request

# Send instant notification for urgent matters
send-tmux-message.sh backend-architect "Check inbox - urgent review needed!"
```

### Responding to Requests

```bash
# Check inbox
check-aimaestro-messages.sh

# Read the request
read-aimaestro-message.sh msg-xxx

# Send response
send-aimaestro-message.sh frontend-dev \
  "Re: API design review" \
  "Reviewed auth flow. Looks good, ship it!" \
  normal response
```

### Cross-Host Collaboration

```bash
# Send task to remote agent
send-aimaestro-message.sh deploy-agent@production \
  "Deploy request" \
  "Please deploy v2.0.0 to production" \
  high request

# Forward message to team lead on another host
forward-aimaestro-message.sh msg-xxx team-lead@main-server \
  "FYI - deployment request for approval"
```

---

## Message Storage

Messages are stored as JSON files:

```
~/.aimaestro/messages/
├── inbox/
│   └── <agent-id>/
│       ├── msg-1234567890-abc.json
│       └── msg-1234567891-def.json
└── sent/
    └── <agent-id>/
        └── msg-1234567890-abc.json
```

Each message contains:
- `id` - Unique message identifier
- `from` / `to` - Agent IDs
- `fromAlias` / `toAlias` - Human-readable names
- `fromHost` / `toHost` - Host identifiers
- `subject` - Message subject
- `timestamp` - ISO 8601 timestamp
- `priority` - low | normal | high | urgent
- `status` - unread | read | archived
- `content.type` - request | response | notification | update
- `content.message` - Message body

---

## Requirements

- AI Maestro running on this machine (default port: 23000)
- tmux session with valid agent name
- `curl` and `jq` installed
- For remote hosts: hosts.json configured

---

## Troubleshooting

### Scripts not found

```bash
# Check PATH includes ~/.local/bin
echo $PATH | tr ':' '\n' | grep local

# Add to PATH if missing
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Cannot connect to API

```bash
# Check AI Maestro is running (get host identity)
curl http://127.0.0.1:23000/api/hosts/identity

# Restart if needed
pm2 restart ai-maestro
```

### Agent not found

```bash
# Verify agent exists (use identity API to get host URL first)
API_URL=$(curl -s http://127.0.0.1:23000/api/hosts/identity | jq -r '.host.url')
curl "$API_URL/api/agents" | jq '.agents[].alias'

# Check session naming
tmux display-message -p '#S'
# Should be: agentId@hostId format
```

### Remote host unreachable

```bash
# Check hosts.json config
cat ~/.aimaestro/hosts.json

# Test remote connection
curl http://remote-host:23000/api/hosts/identity
```

---

## Related Documentation

- [Skills README](../skills/README.md) - Claude Code skills including agent-messaging
- [CLAUDE.md](../CLAUDE.md) - AI Maestro architecture and messaging system details

---

## License

MIT License - Same as AI Maestro
