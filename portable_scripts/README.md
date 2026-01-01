# AI Maestro Portable Scripts

Command-line tools for exporting and importing agents between machines. These scripts enable agent portability - moving agents with all their data across different AI Maestro installations.

## Purpose

Portable scripts help you:
- **Migrate** agents to new machines
- **Backup** agent data including databases and messages
- **Clone** agents for testing or development
- **Share** agent configurations with team members

## Installation

```bash
cd /path/to/ai-maestro
./install-messaging.sh
# Installs all scripts including portable tools
```

Scripts are installed to `~/.local/bin/`.

---

## Available Scripts

| Script | Purpose |
|--------|---------|
| `list-agents.sh` | List all agents available for export |
| `export-agent.sh` | Export an agent to a portable ZIP file |
| `import-agent.sh` | Import an agent from a ZIP file |

---

## Script Reference

### list-agents.sh

List all registered agents with their status and export commands.

```bash
list-agents.sh [--json]
```

**Options:**
- `--json` - Output raw JSON response

**Example:**
```bash
list-agents.sh
```

**Output:**
```
AI Maestro Agents
=================

Found 3 agent(s):

● backend-api (Backend API Developer)
    ID: 633f6cdc...
    Session: backend-api@local
    Export: export-agent.sh backend-api

● frontend-dev (Frontend Developer)
    ID: a1b2c3d4...
    Session: frontend-dev@local
    Export: export-agent.sh frontend-dev

○ data-analyst
    ID: e5f6g7h8...
    Export: export-agent.sh data-analyst

Commands:
  export-agent.sh <alias>          Export an agent to ZIP
  import-agent.sh <file.zip>       Import an agent from ZIP
```

---

### export-agent.sh

Export an agent to a portable ZIP file containing all agent data.

```bash
export-agent.sh <agent-alias-or-id> [output-dir]
```

**Arguments:**
- `agent-alias-or-id` - The agent's alias or UUID
- `output-dir` - Directory to save ZIP file (default: current directory)

**Examples:**
```bash
# Export to current directory
export-agent.sh backend-api

# Export to specific directory
export-agent.sh backend-api ~/exports

# Export by ID
export-agent.sh 633f6cdc-4404-431a-a95c-80f66a520401
```

**Output:**
```
Exporting agent: backend-api
Output directory: /Users/me/exports

Export successful!

File: /Users/me/exports/backend-api-export-2025-01-15T14-30-00.zip
Size: 2.4M

Export Contents:
  Agent: backend-api (633f6cdc...)
  Exported: 2025-01-15T14:30:00Z
  From: my-macbook
  Database: Yes
  Messages: 42 inbox, 15 sent, 3 archived

To import this agent on another machine:
  import-agent.sh "/Users/me/exports/backend-api-export-2025-01-15T14-30-00.zip"
```

**What's Included:**
- Agent registry entry (metadata, settings)
- CozoDB database (conversation index, memory)
- Messages (inbox, sent, archived)
- Manifest file with export metadata

---

### import-agent.sh

Import an agent from a portable ZIP file.

```bash
import-agent.sh <zip-file> [options]
```

**Arguments:**
- `zip-file` - Path to the agent export ZIP file

**Options:**
| Option | Description |
|--------|-------------|
| `--alias <name>` | Override the agent alias |
| `--new-id` | Generate a new agent ID instead of keeping original |
| `--skip-messages` | Don't import messages |
| `--overwrite` | Overwrite existing agent with same alias |

**Examples:**
```bash
# Basic import
import-agent.sh backend-api-export.zip

# Import with new alias
import-agent.sh backend-api-export.zip --alias backend-api-v2

# Fresh import with new ID
import-agent.sh backend-api-export.zip --new-id

# Replace existing agent
import-agent.sh backend-api-export.zip --overwrite

# Import without messages
import-agent.sh backend-api-export.zip --skip-messages

# Combine options
import-agent.sh backend-api-export.zip --alias clone --new-id
```

**Output:**
```
Importing agent from: backend-api-export.zip

Package Contents:
  Agent: backend-api (633f6cdc...)
  Display Name: Backend API Developer
  Exported: 2025-01-15T14:30:00Z
  From: other-macbook (darwin)
  Database: Yes
  Messages: 60 total (42 inbox, 15 sent, 3 archived)

Import Options:
  Generate New ID: Yes

Uploading to AI Maestro...

Import successful!

Imported Agent:
  ID: a1b2c3d4-5678-90ab-cdef-1234567890ab
  Alias: backend-api
  Display Name: Backend API Developer
  Program: claude

Import Stats:
  Registry: Yes
  Database: Yes
  Messages: 60 (42 inbox, 15 sent, 3 archived)

The agent is now available in AI Maestro.
You can create a session for it or link it to an existing tmux session.
```

---

## Common Workflows

### Migrating to a New Machine

```bash
# On old machine: Export the agent
export-agent.sh my-agent ~/Desktop

# Transfer the ZIP file to new machine (scp, airdrop, etc.)

# On new machine: Import the agent
import-agent.sh my-agent-export-2025-01-15.zip
```

### Creating a Backup

```bash
# Create backup directory
mkdir -p ~/agent-backups

# Export all agents
list-agents.sh --json | jq -r '.agents[].alias' | while read alias; do
    export-agent.sh "$alias" ~/agent-backups
done
```

### Cloning an Agent for Testing

```bash
# Export the agent
export-agent.sh production-agent

# Import as a new agent with different name and ID
import-agent.sh production-agent-export.zip \
    --alias test-agent \
    --new-id \
    --skip-messages
```

### Sharing with Team

```bash
# Export with portable settings
export-agent.sh shared-agent ~/team-exports

# Team member imports
import-agent.sh shared-agent-export.zip --new-id
```

---

## Export Contents

The ZIP file contains:

```
agent-export-2025-01-15.zip
├── manifest.json           # Export metadata and checksums
├── registry.json           # Agent configuration
├── database/
│   └── agent.db           # CozoDB database (memory, index)
└── messages/
    ├── inbox/
    │   ├── msg-001.json
    │   └── msg-002.json
    ├── sent/
    │   └── msg-003.json
    └── archived/
        └── msg-004.json
```

### manifest.json Structure

```json
{
  "version": "1.0",
  "exportedAt": "2025-01-15T14:30:00Z",
  "exportedFrom": {
    "hostname": "my-macbook",
    "platform": "darwin",
    "aiMaestroVersion": "0.17.17"
  },
  "agent": {
    "id": "633f6cdc-4404-431a-a95c-80f66a520401",
    "alias": "backend-api",
    "displayName": "Backend API Developer"
  },
  "contents": {
    "hasDatabase": true,
    "hasMessages": true,
    "messageStats": {
      "inbox": 42,
      "sent": 15,
      "archived": 3
    }
  }
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIMAESTRO_API` | `http://localhost:23000` | API endpoint URL |

**Example:**
```bash
# Use remote AI Maestro
AIMAESTRO_API=http://192.168.1.100:23000 list-agents.sh
```

---

## Troubleshooting

### Cannot connect to API

```bash
# Check AI Maestro is running
pm2 status ai-maestro

# Restart if needed
pm2 restart ai-maestro

# Verify API is accessible
curl http://localhost:23000/api/agents
```

### Export fails

```bash
# Check agent exists
list-agents.sh | grep <alias>

# Try exporting by ID instead
export-agent.sh <full-uuid>
```

### Import fails with "agent exists"

```bash
# Use --overwrite to replace
import-agent.sh export.zip --overwrite

# Or use a different alias
import-agent.sh export.zip --alias new-name
```

### Script not found

```bash
# Check PATH
which export-agent.sh

# Scripts are installed to ~/.local/bin/
# Add to PATH if needed:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Requirements

- AI Maestro running on `http://localhost:23000`
- `curl`, `jq`, and `python3` installed
- `unzip` for viewing export contents
- Sufficient disk space for exports

---

## License

MIT License - Same as AI Maestro
