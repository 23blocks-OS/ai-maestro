# Agent Pack & Distribution Guide

## Overview

The Agent Pack feature allows you to export, clone, move, and distribute AI Maestro agents as portable packages. Each pack contains the agent's complete state including metadata, database, messages, and optionally workspace files.

## What Gets Packed?

An agent pack (`.tar.gz` archive) includes:

1. **Agent Metadata** (always included)
   - Agent ID, alias, display name
   - Model, program, task description
   - Tags, owner, team information
   - Deployment configuration
   - Metrics and preferences

2. **Database** (included if exists)
   - CozoDB embedded database (`agent.db`)
   - Conversation history
   - Vector embeddings
   - Knowledge graph
   - Full-text search indices

3. **Messages** (optional, default: included)
   - Inbox messages
   - Sent messages
   - Message metadata and status

4. **Workspace** (optional, default: excluded)
   - Project files and directories
   - Working directory contents
   - **Note:** Can be very large, use selectively

5. **Manifest**
   - Pack version and creation date
   - Original agent information
   - Included components list
   - Workspace size (if included)

## Use Cases

### 1. Clone an Agent Locally

Create a copy of an agent on the same machine:

```bash
# Pack the agent
./scripts/pack-agent.mjs backend-api

# Unpack with new alias
./scripts/unpack-agent.mjs agent-pack-backend-api-*.tar.gz --alias backend-api-dev
```

**Use case:** Testing changes without affecting the original agent.

### 2. Move Agent to Another Host

Transfer an agent to a different machine:

```bash
# On source machine: pack the agent
./scripts/pack-agent.mjs backend-api --all

# Transfer the pack file
scp agent-pack-backend-api-*.tar.gz user@remote-host:~/

# On remote machine: unpack the agent
./scripts/unpack-agent.mjs ~/agent-pack-backend-api-*.tar.gz
```

**Use case:** Moving development to a different server or cloud instance.

### 3. Distribute Agent as Template

Share an agent configuration without workspace files:

```bash
# Pack without workspace
./scripts/pack-agent.mjs backend-api --no-messages

# Share the small pack file
# Recipients can unpack and customize
```

**Use case:** Sharing agent templates with team members or the community.

### 4. Backup Agents

Create periodic backups of critical agents:

```bash
# Pack with everything
./scripts/pack-agent.mjs backend-api --all --output ~/backups/backend-api-$(date +%Y%m%d).tar.gz

# Automated backup script
for agent in backend-api frontend-ui data-processor; do
  ./scripts/pack-agent.mjs $agent --all --output ~/backups/$agent-$(date +%Y%m%d).tar.gz
done
```

**Use case:** Disaster recovery and version history.

## CLI Usage

### Pack an Agent

```bash
./scripts/pack-agent.mjs <alias> [options]

Options:
  --include-workspace    Include workspace files (may be large)
  --no-messages          Exclude messages
  --output <path>        Custom output path
  --all                  Include everything (workspace + messages)

Examples:
  pack-agent.mjs backend-api                              # Basic pack
  pack-agent.mjs backend-api --include-workspace          # With workspace
  pack-agent.mjs backend-api --output ~/backups/agent.tgz # Custom output
  pack-agent.mjs backend-api --all                        # Everything
```

### Unpack an Agent

```bash
./scripts/unpack-agent.mjs <pack-file> [options]

Options:
  --alias <name>         Restore with specific alias (default: {original}-clone)
  --inspect              Inspect pack contents without restoring
  --restore-id           Restore with original agent ID (use with caution!)
  --workspace <path>     Custom workspace directory
  -y, --yes              Skip confirmation prompts

Examples:
  unpack-agent.mjs pack.tar.gz                            # Auto-clone
  unpack-agent.mjs pack.tar.gz --alias backend-api-dev    # Custom alias
  unpack-agent.mjs pack.tar.gz --inspect                  # Inspect only
  unpack-agent.mjs pack.tar.gz --restore-id --yes         # Exact restore
```

### Inspect a Pack

Before unpacking, you can inspect the pack contents:

```bash
./scripts/unpack-agent.mjs agent-pack-backend-api-*.tar.gz --inspect
```

Output:
```
Pack Information
════════════════════════════════════════════════════════════════════
Original Agent:
  • ID: abc123...
  • Alias: backend-api
  • Display Name: Backend API Agent

Pack Details:
  • Version: 1.0.0
  • Created: 2025-11-09 10:30:45

Includes:
  • Database: ✓
  • Messages: ✓
  • Workspace: ✗
```

## UI Usage

### Export an Agent (Pack)

1. Open the agent profile panel (click agent avatar or "Agent Profile" button)
2. Click the **"Pack"** button in the header
3. Configure options:
   - ☑ Include Messages (recommended)
   - ☐ Include Workspace (optional, can be large)
4. Click **"Create Pack"**
5. Wait for packing to complete
6. Click **"Download Pack"** to save the `.tar.gz` file

### Import an Agent (Unpack)

1. Click the **"Import"** button in the dashboard header
2. Select a pack file (`.tar.gz`)
3. Configure options:
   - **New Alias**: Leave empty to auto-generate, or specify custom alias
   - ☐ Restore with Original ID (⚠️ may conflict with existing agent)
4. Click **"Import Agent"**
5. Wait for import to complete
6. The agent will appear in your dashboard

## API Endpoints

### POST /api/agents/:id/pack

Pack an agent for export.

**Request:**
```json
{
  "includeWorkspace": false,
  "includeMessages": true,
  "outputPath": "/optional/custom/path.tar.gz"
}
```

**Response:**
```json
{
  "success": true,
  "packFile": "/tmp/agent-pack-backend-api-1699564800000.tar.gz",
  "size": 15728640,
  "manifest": {
    "version": "1.0.0",
    "packDate": "2025-11-09T10:30:45.000Z",
    "agent": {
      "id": "abc123...",
      "alias": "backend-api",
      "displayName": "Backend API Agent"
    },
    "includes": {
      "database": true,
      "messages": true,
      "workspace": false,
      "notes": false
    }
  }
}
```

### GET /api/agents/:id/pack?file=<path>

Download a packed agent file.

**Response:** Binary `.tar.gz` file download

### POST /api/agents/unpack

Unpack and restore an agent.

**Request:** `multipart/form-data`
- `file`: Pack file (`.tar.gz`)
- `newAlias`: (optional) Custom alias
- `restoreToId`: (optional) "true" to restore with original ID
- `targetDirectory`: (optional) Custom workspace location

**Response:**
```json
{
  "success": true,
  "agent": {
    "id": "def456...",
    "alias": "backend-api-clone",
    "displayName": "Backend API Agent"
  }
}
```

## Pack File Structure

```
agent-pack-{alias}-{timestamp}.tar.gz
└── agent-pack-{alias}-{timestamp}/
    ├── manifest.json          # Pack metadata
    ├── agent.json             # Agent registry entry
    ├── database/
    │   └── agent.db           # CozoDB database
    ├── messages/
    │   ├── inbox/
    │   │   └── *.json         # Inbox messages
    │   └── sent/
    │       └── *.json         # Sent messages
    ├── notes.json             # Session notes (placeholder)
    └── workspace/             # (optional) Working directory
        └── ...project files
```

## Best Practices

### When to Include Workspace

**Include workspace when:**
- Moving agent to new host where code isn't available
- Creating complete backup for disaster recovery
- Sharing a self-contained demo or template

**Exclude workspace when:**
- Agent works on a Git repository (clone separately on target)
- Workspace is very large (>100MB)
- Distributing agent template (users will provide their own workspace)
- Creating frequent backups (workspace doesn't change often)

### Alias Naming Conventions

When unpacking, choose descriptive aliases:

- **Clones:** `backend-api-dev`, `backend-api-staging`
- **Versions:** `backend-api-v1`, `backend-api-v2`
- **Environments:** `backend-api-prod`, `backend-api-test`
- **Users:** `backend-api-alice`, `backend-api-bob`

### ID Restoration Warning

The `--restore-id` flag restores an agent with its original ID:

⚠️ **Use with extreme caution:**
- Will fail if an agent with that ID already exists
- Can cause conflicts in multi-agent systems
- Only use when intentionally replacing an agent
- Recommended for disaster recovery only

**Safe approach:** Let the system generate a new ID (default behavior)

## Troubleshooting

### "Agent not found" during pack

**Cause:** Agent alias doesn't exist in registry.

**Solution:**
```bash
# List all agents
curl http://localhost:23000/api/agents | jq '.agents[] | .alias'

# Use exact alias (case-sensitive)
./scripts/pack-agent.mjs <correct-alias>
```

### "Agent with alias already exists" during unpack

**Cause:** Target alias is already taken.

**Solution:**
```bash
# Specify a different alias
./scripts/unpack-agent.mjs pack.tar.gz --alias unique-alias

# Or inspect the pack first to see original alias
./scripts/unpack-agent.mjs pack.tar.gz --inspect
```

### Pack file is too large

**Cause:** Workspace contains large files (node_modules, build artifacts, etc.)

**Solution:**
- Pack without workspace: `--no-workspace` (workspace excluded by default)
- Clean workspace before packing: Remove `node_modules`, `.git`, `dist`, etc.
- Use `.gitignore` patterns (automatically excluded: `.git`, `node_modules`, `.next`, `dist`, `build`)

### Pack/unpack fails with permission errors

**Cause:** Insufficient permissions for temp directory or target paths.

**Solution:**
```bash
# Ensure write permissions
chmod 755 /tmp
chmod 755 ~/.aimaestro

# Use custom output path with correct permissions
./scripts/pack-agent.mjs agent --output ~/my-packs/agent.tar.gz
```

## Advanced Usage

### Automated Backup Script

Create a daily backup cron job:

```bash
#!/bin/bash
# ~/bin/backup-agents.sh

BACKUP_DIR=~/agent-backups/$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"

# Backup all critical agents
for agent in backend-api frontend-ui data-processor; do
  echo "Backing up $agent..."
  ./scripts/pack-agent.mjs "$agent" --all --output "$BACKUP_DIR/$agent.tar.gz"
done

# Keep only last 7 days
find ~/agent-backups -type d -mtime +7 -exec rm -rf {} \;
```

Add to crontab:
```bash
crontab -e
# Add: 0 2 * * * ~/bin/backup-agents.sh
```

### CI/CD Integration

Pack agents in CI pipeline for deployment:

```yaml
# .github/workflows/deploy-agent.yml
name: Deploy Agent
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Pack Agent
        run: |
          ./scripts/pack-agent.mjs backend-api --all \
            --output agent-pack.tar.gz

      - name: Deploy to Production
        run: |
          scp agent-pack.tar.gz prod-server:~/
          ssh prod-server './scripts/unpack-agent.mjs ~/agent-pack.tar.gz --yes'
```

## Migration from Other Systems

If you're migrating agents from another system:

1. **Create a minimal pack structure** matching the format above
2. **Populate `agent.json`** with required fields
3. **Add `manifest.json`** with version `1.0.0`
4. **Import using unpack script**

Example migration script:
```bash
# Create pack directory
mkdir -p agent-pack-imported/database

# Create agent.json from old system data
cat > agent-pack-imported/agent.json <<EOF
{
  "id": "$(uuidgen)",
  "alias": "imported-agent",
  "displayName": "Imported Agent",
  "program": "claude-code",
  "model": "claude-sonnet-4-5",
  "taskDescription": "Migrated from legacy system",
  "tags": ["imported"],
  ...
}
EOF

# Create manifest
cat > agent-pack-imported/manifest.json <<EOF
{
  "version": "1.0.0",
  "packDate": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "agent": {
    "id": "...",
    "alias": "imported-agent",
    "displayName": "Imported Agent"
  },
  "includes": {
    "database": false,
    "messages": false,
    "workspace": false,
    "notes": false
  }
}
EOF

# Create tarball
tar -czf agent-pack-imported.tar.gz agent-pack-imported/

# Import
./scripts/unpack-agent.mjs agent-pack-imported.tar.gz
```

## Future Enhancements

Planned features for future versions:

- **Encrypted packs**: Password-protected agent exports
- **Differential packs**: Only pack changed data since last backup
- **Cloud sync**: Direct upload/download to S3, Google Drive, etc.
- **Pack registry**: Centralized repository for sharing agent templates
- **Version control**: Track pack history and rollback capability
- **Compression options**: Choose compression level (speed vs. size)
- **Selective restore**: Unpack only specific components

## See Also

- [Agent Registry Documentation](./AGENTS.md)
- [Messaging System Guide](./MESSAGING.md)
- [Operations Guide](./OPERATIONS-GUIDE.md)
- [API Reference](./API.md)
