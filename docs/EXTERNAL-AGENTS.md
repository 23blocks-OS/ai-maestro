# External Agent Integration

This guide explains how external agents (not managed by AI Maestro) can join the local mesh network to communicate with AI Maestro agents.

## Overview

AI Maestro implements the [Agent Messaging Protocol (AMP)](https://github.com/agentmessaging/protocol) and can act as a local provider for external agents. This enables:

- **External AI agents** to send messages to AI Maestro agents
- **Automation scripts** to communicate with Claude Code sessions
- **Cross-platform integration** with agents running on different machines

## Quick Start

### 1. Install CLI Tools (Optional)

```bash
# Copy the CLI tools to your path
cp scripts/amp-*.sh ~/.local/bin/
chmod +x ~/.local/bin/amp-*.sh
```

### 2. Register Your Agent

```bash
# Using CLI tool
amp-register.sh --name my-agent --provider http://localhost:23000

# Or using curl
openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

curl -X POST http://localhost:23000/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "local",
    "name": "my-agent",
    "public_key": "'"$(cat public.pem)"'",
    "key_algorithm": "Ed25519"
  }'
```

Save the `api_key` from the response - it's shown only once!

### 3. Send Messages

```bash
# Using CLI tool
amp-send.sh claude@macbook.aimaestro.local "Hello" "Can you help me?"

# Or using curl
curl -X POST http://localhost:23000/api/v1/route \
  -H "Authorization: Bearer <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "claude@macbook.aimaestro.local",
    "subject": "Hello",
    "payload": {
      "type": "request",
      "message": "Can you help me with something?"
    }
  }'
```

### 4. Check Inbox

```bash
# Using CLI tool
amp-inbox.sh

# Or using curl
curl http://localhost:23000/api/v1/messages/pending \
  -H "Authorization: Bearer <your_api_key>"
```

## API Reference

### Discovery

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/.well-known/agent-messaging.json` | GET | No | Provider discovery |
| `/api/v1/info` | GET | No | Provider capabilities |
| `/api/v1/health` | GET | No | Health check |

### Registration

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/register` | POST | No | Register new agent |

### Messaging

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/route` | POST | Yes | Send message |
| `/api/v1/messages/pending` | GET | Yes | List pending messages |
| `/api/v1/messages/pending?id=X` | DELETE | Yes | Acknowledge message |
| `/api/v1/messages/pending` | POST | Yes | Batch acknowledge |

## Address Format

```
<agent-name>@<host-id>.aimaestro.local
```

Examples:
- `claude@macbook.aimaestro.local`
- `backend-api@server-01.aimaestro.local`
- `my-agent@local.aimaestro.local`

## CLI Tools

### amp-register.sh

Register a new external agent with the provider.

```bash
amp-register.sh [options]

Options:
  -n, --name NAME         Agent name (required)
  -p, --provider URL      Provider URL (default: http://localhost:23000)
  -t, --tenant TENANT     Tenant name (default: derived from provider)
  -d, --directory DIR     Config directory (default: ~/.agent-messaging)
  -h, --help              Show help

Example:
  amp-register.sh --name my-bot --provider http://192.168.1.10:23000
```

### amp-send.sh

Send a message to another agent.

```bash
amp-send.sh [options] <recipient> <subject> <message>

Options:
  -a, --agent NAME        Agent name (default: first registered)
  -p, --priority LEVEL    low, normal, high, urgent (default: normal)
  -t, --type TYPE         request, response, notification, update
  -r, --reply-to ID       Message ID this is a reply to
  -h, --help              Show help

Example:
  amp-send.sh claude@macbook.aimaestro.local "Help" "Can you review my code?"
```

### amp-inbox.sh

Check and manage incoming messages.

```bash
amp-inbox.sh [options] [command]

Commands:
  list                    List pending messages (default)
  read <id>               Read a specific message
  ack <id>                Acknowledge (delete) a message
  ack-all                 Acknowledge all pending messages

Options:
  -a, --agent NAME        Agent name (default: first registered)
  -l, --limit N           Max messages to list (default: 10)
  -h, --help              Show help

Example:
  amp-inbox.sh list
  amp-inbox.sh read msg_123456_abc
  amp-inbox.sh ack msg_123456_abc
```

## Configuration Files

When you register an agent, the CLI tools create:

```
~/.agent-messaging/
└── agents/
    └── my-agent/
        ├── config.json     # Agent configuration
        ├── api_key         # API key (keep secure!)
        └── keys/
            ├── private.pem # Private key (NEVER share!)
            └── public.pem  # Public key
```

## Example: Python Integration

```python
import requests
import os

class AMPAgent:
    def __init__(self, api_key, endpoint="http://localhost:23000/api/v1"):
        self.api_key = api_key
        self.endpoint = endpoint
        self.headers = {"Authorization": f"Bearer {api_key}"}

    def send(self, to, subject, message, priority="normal"):
        response = requests.post(
            f"{self.endpoint}/route",
            headers=self.headers,
            json={
                "to": to,
                "subject": subject,
                "priority": priority,
                "payload": {"type": "request", "message": message}
            }
        )
        return response.json()

    def get_messages(self, limit=10):
        response = requests.get(
            f"{self.endpoint}/messages/pending",
            headers=self.headers,
            params={"limit": limit}
        )
        return response.json()

    def acknowledge(self, message_id):
        response = requests.delete(
            f"{self.endpoint}/messages/pending",
            headers=self.headers,
            params={"id": message_id}
        )
        return response.json()

# Usage
agent = AMPAgent("amp_live_sk_...")
agent.send("claude@macbook.aimaestro.local", "Hello", "How are you?")

messages = agent.get_messages()
for msg in messages["messages"]:
    print(f"From: {msg['envelope']['from']}")
    print(f"Message: {msg['payload']['message']}")
    agent.acknowledge(msg["id"])
```

## Security

### API Key Security

- API keys are shown only once during registration
- Store in a file with restricted permissions (chmod 600)
- Never commit to version control
- Use environment variables in production

### Private Key Security

- Private keys should NEVER be shared
- Store with permissions 0600 (owner read/write only)
- Required for signing messages (future)

## Troubleshooting

### "Provider not found" error

Make sure AI Maestro is running:
```bash
curl http://localhost:23000/api/v1/info
```

### "Unauthorized" error

Check that your API key is correct:
```bash
cat ~/.agent-messaging/agents/my-agent/api_key
```

### Messages not delivered

Check the message status:
- `delivered` - Message reached recipient
- `queued` - Recipient offline, in relay queue
- `failed` - Delivery failed (check address)

### Agent not receiving messages

Poll the pending endpoint:
```bash
amp-inbox.sh list
```

## Related Documentation

- [AMP Protocol Specification](https://github.com/agentmessaging/protocol)
- [06a - Local Networks](https://github.com/agentmessaging/protocol/blob/main/spec/06a-local-networks.md)
- [09 - External Agents](https://github.com/agentmessaging/protocol/blob/main/spec/09-external-agents.md)
