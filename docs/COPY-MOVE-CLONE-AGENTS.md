# Agent Serialization & Portability: Copy, Move, Clone

**Author:** AI Maestro Development Team
**Date:** 2025-11-03
**Status:** Requirements & Design
**Epic:** TBD (Agent Lifecycle Management)

---

## Table of Contents

1. [Overview](#overview)
2. [Use Cases](#use-cases)
3. [Core Concepts](#core-concepts)
4. [Agent Package Structure](#agent-package-structure)
5. [Operations](#operations)
6. [Serialization (Dehydrate)](#serialization-dehydrate)
7. [Deserialization (Hydrate)](#deserialization-hydrate)
8. [Export/Import Scripts](#exportimport-scripts)
9. [API Design](#api-design)
10. [Implementation Phases](#implementation-phases)

---

## Overview

AI Maestro agents should be **fully portable, serializable entities** that can:
- **Move** between local and cloud environments
- **Copy** (replicate) to create backups or parallel instances
- **Clone** to different projects/customers with full history
- **Serialize** (dehydrate) for storage/transfer
- **Deserialize** (hydrate) to restore in new environment

### Key Principles

1. **Agent Autonomy**: Agent is a complete, self-contained unit
2. **Platform Agnostic**: Works on local (tmux) or cloud (EC2/any infrastructure)
3. **Zero Configuration**: Import and run - no manual setup
4. **Full Fidelity**: Complete conversation history, settings, and intelligence preserved

---

## Use Cases

### 1. Customer Delivery (Clone)
```
Scenario: Deliver trained agent to customer after 6-month engagement

Action: CLONE agent to customer's infrastructure
- Agent brings complete conversation history
- Customer can continue conversations
- Customer can search all past discussions
- No vendor lock-in
```

### 2. Cloud Migration (Move)
```
Scenario: Move local development agent to production cloud

Action: MOVE agent from local tmux → AWS EC2
- Agent stops running locally
- Serialized and transferred to cloud
- Rehydrated on EC2 instance
- Continues where it left off
```

### 3. Backup & Disaster Recovery (Copy)
```
Scenario: Create backup before major refactoring

Action: COPY agent to backup location
- Original agent continues running
- Backup captured at point-in-time
- Can restore if something goes wrong
- Multiple backups over time
```

### 4. Multi-Environment Testing (Clone)
```
Scenario: Test new features without affecting production agent

Action: CLONE production agent → staging environment
- Staging agent has full production history
- Safe to experiment
- Can compare behavior
- Throw away or promote to production
```

### 5. Team Collaboration (Copy)
```
Scenario: Share agent with team member for code review

Action: COPY agent → teammate's machine
- Teammate can review conversation history
- Understand decision-making process
- Ask agent questions about implementation
```

---

## Core Concepts

### Serialization (Dehydrate)

**Definition:** Convert running agent into portable, transferable package.

**What Happens:**
1. **Pause agent** (stop tmux session or disconnect)
2. **Snapshot database** (agent.db with all data)
3. **Capture configuration** (project .claude/ settings)
4. **Package as archive** (tar.gz with manifest)
5. **Generate metadata** (export date, source, checksums)

**Output:** `agent-{id}-{timestamp}.tar.gz` (20-100MB)

### Deserialization (Hydrate)

**Definition:** Restore agent from package into new environment.

**What Happens:**
1. **Extract package** to appropriate directories
2. **Validate integrity** (checksums, required files)
3. **Adapt paths** (update working directory references)
4. **Initialize infrastructure** (create tmux session or cloud instance)
5. **Verify connectivity** (test database, permissions)
6. **Register with AI Maestro** (dashboard discovery)

**Result:** Fully functional agent in new environment

---

## Agent Package Structure

### Complete Package Contents

```
agent-23blocks-api-crm-20251103.tar.gz
│
├── MANIFEST.json                    # Package metadata
├── README.txt                       # Import instructions
│
├── aimaestro-agent/                 # AI Maestro agent data
│   ├── config.json                  # Agent metadata
│   └── agent.db                     # SQLite database
│       ├── conversations (full text)
│       ├── embeddings (vectors)
│       ├── metrics (pre-computed)
│       └── sessions (metadata)
│
├── claude-project/                  # Claude conversation logs (optional)
│   ├── {session-id}.jsonl          # Original logs
│   └── agent-*.jsonl                # Sidechain logs
│
└── project-claude-config/           # Project Claude settings (CRITICAL!)
    ├── .claude/
    │   ├── settings.local.json      # Tool permissions
    │   ├── commands/                # Custom slash commands
    │   └── skills/                  # Custom skills
    ├── CLAUDE.md                    # Project instructions
    └── .claudeignore                # Ignore patterns
```

### MANIFEST.json

```json
{
  "agentId": "23blocks-api-crm",
  "version": "1.0.0",
  "exportDate": "2025-11-03T21:45:00Z",
  "exportedBy": "juan@23blocks.com",
  "
": {
    "type": "local",
    "platform": "darwin",
    "tmuxSessionName": "23blocks-api-crm",
    "workingDirectory": "/Users/juan/23blocks/blocks/crm-api",
    "claudeProjectDir": "~/.claude/projects/-Users-juan-23blocks-blocks-crm-api"
  },
  "statistics": {
    "totalMessages": 5740,
    "totalSessions": 12,
    "totalTokens": 2500000,
    "totalCost": 125.50,
    "firstMessageDate": "2025-10-01T10:00:00Z",
    "lastMessageDate": "2025-11-03T20:30:00Z"
  },
  "contents": {
    "aimaestroAgent": "aimaestro-agent/",
    "claudeProject": "claude-project/",
    "projectClaudeConfig": "project-claude-config/"
  },
  "checksums": {
    "agent.db": "sha256:abc123...",
    "config.json": "sha256:def456...",
    "settings.local.json": "sha256:ghi789..."
  },
  "compatibility": {
    "minAIMaestroVersion": "0.7.0",
    "minClaudeVersion": "2.0.0",
    "requiredTools": ["sqlite-vss", "better-sqlite3"]
  },
  "notes": "Agent exported for customer delivery. Full conversation history included."
}
```

---

## Operations

### Operation Matrix

| Operation | Source Remains | Destination | Use Case |
|-----------|---------------|-------------|----------|
| **MOVE** | ❌ Deleted | New location | Local → Cloud migration |
| **COPY** | ✅ Unchanged | Duplicate | Backup, testing |
| **CLONE** | ✅ Unchanged | Modified | Customer delivery, new project |

### 1. MOVE (Migration)

**Command:**
```bash
ai-maestro agent move 23blocks-api-crm --to cloud --provider aws
```

**Process:**
1. Serialize agent (dehydrate)
2. Transfer to destination
3. Deserialize (hydrate)
4. **Delete source** (agent no longer exists locally)
5. Update registry

**Reversible:** Use `move` back to restore

### 2. COPY (Replication)

**Command:**
```bash
ai-maestro agent copy 23blocks-api-crm --to backup --name 23blocks-api-crm-backup
```

**Process:**
1. Serialize agent (dehydrate)
2. Transfer to destination
3. Deserialize with new name
4. **Source unchanged** (both agents exist)
5. Register both in registry

**Use Case:** Point-in-time snapshots

### 3. CLONE (Fork)

**Command:**
```bash
ai-maestro agent clone 23blocks-api-crm --to customer --name customer-crm-agent
```

**Process:**
1. Serialize agent (dehydrate)
2. Transfer to destination
3. Deserialize with modifications:
   - New agent ID
   - New working directory
   - Reset ownership metadata
4. **Source unchanged**
5. Register cloned agent

**Use Case:** Customer delivery, new team member onboarding

---

## Serialization (Dehydrate)

### Dehydration Process

```javascript
class AgentSerializer {
  async dehydrate(agentId, options = {}) {
    const agent = await this.getAgent(agentId)

    // 1. Validate agent is ready for export
    if (agent.status === 'running' && !options.force) {
      throw new Error('Agent is running. Stop it first or use --force')
    }

    // 2. Create staging directory
    const stagingDir = `/tmp/agent-export-${agentId}-${Date.now()}`
    await fs.mkdir(stagingDir, { recursive: true })

    // 3. Copy AI Maestro agent data
    await this.copyAgentData(agent, stagingDir)

    // 4. Copy Claude conversation logs (if requested)
    if (options.includeLogs !== false) {
      await this.copyClaude Logs(agent, stagingDir)
    }

    // 5. Copy project Claude configuration
    await this.copyProjectClaudeConfig(agent, stagingDir)

    // 6. Generate manifest
    const manifest = await this.generateManifest(agent, stagingDir)
    await fs.writeFile(
      path.join(stagingDir, 'MANIFEST.json'),
      JSON.stringify(manifest, null, 2)
    )

    // 7. Generate README
    await this.generateReadme(agent, stagingDir)

    // 8. Create archive
    const archivePath = `/tmp/${agentId}-${new Date().toISOString().split('T')[0]}.tar.gz`
    await this.createArchive(stagingDir, archivePath)

    // 9. Calculate checksums
    const checksum = await this.calculateChecksum(archivePath)

    // 10. Cleanup staging
    await fs.rm(stagingDir, { recursive: true })

    return {
      archivePath,
      checksum,
      size: (await fs.stat(archivePath)).size,
      manifest
    }
  }

  async copyAgentData(agent, stagingDir) {
    const sourceDir = `~/.aimaestro/agents/${agent.id}`
    const destDir = path.join(stagingDir, 'aimaestro-agent')

    // Copy entire agent directory
    await fs.cp(sourceDir, destDir, { recursive: true })

    // Optionally compact database
    if (this.options.compact) {
      await this.compactDatabase(path.join(destDir, 'agent.db'))
    }
  }

  async copyClaude Logs(agent, stagingDir) {
    const claudeProjectDir = this.resolveClaude ProjectDir(agent.workingDirectory)
    const destDir = path.join(stagingDir, 'claude-project')

    if (!fs.existsSync(claudeProjectDir)) {
      console.warn(`Claude project directory not found: ${claudeProjectDir}`)
      return
    }

    // Copy all JSONL files
    const jsonlFiles = fs.readdirSync(claudeProjectDir)
      .filter(f => f.endsWith('.jsonl'))

    for (const file of jsonlFiles) {
      await fs.copyFile(
        path.join(claudeProjectDir, file),
        path.join(destDir, file)
      )
    }
  }

  async copyProjectClaudeConfig(agent, stagingDir) {
    const projectDir = agent.workingDirectory
    const destDir = path.join(stagingDir, 'project-claude-config')

    await fs.mkdir(destDir, { recursive: true })

    // Copy .claude directory
    if (fs.existsSync(path.join(projectDir, '.claude'))) {
      await fs.cp(
        path.join(projectDir, '.claude'),
        path.join(destDir, '.claude'),
        { recursive: true }
      )
    }

    // Copy CLAUDE.md
    if (fs.existsSync(path.join(projectDir, 'CLAUDE.md'))) {
      await fs.copyFile(
        path.join(projectDir, 'CLAUDE.md'),
        path.join(destDir, 'CLAUDE.md')
      )
    }

    // Copy .claudeignore
    if (fs.existsSync(path.join(projectDir, '.claudeignore'))) {
      await fs.copyFile(
        path.join(projectDir, '.claudeignore'),
        path.join(destDir, '.claudeignore')
      )
    }
  }
}
```

### Export Options

```typescript
interface DehydrateOptions {
  includeLogs?: boolean        // Include Claude JSONL logs (default: true)
  compact?: boolean            // Compact SQLite database (default: false)
  encrypt?: boolean            // Encrypt package with password (default: false)
  password?: string            // Encryption password
  excludeSessions?: string[]   // Session IDs to exclude
  dateRange?: {                // Only include messages in date range
    start: Date
    end: Date
  }
}
```

---

## Deserialization (Hydrate)

### Hydration Process

```javascript
class AgentDeserializer {
  async hydrate(packagePath, destination, options = {}) {
    // 1. Extract package to temp directory
    const tempDir = `/tmp/agent-import-${Date.now()}`
    await this.extractArchive(packagePath, tempDir)

    // 2. Read and validate manifest
    const manifest = JSON.parse(
      await fs.readFile(path.join(tempDir, 'MANIFEST.json'), 'utf8')
    )

    await this.validateManifest(manifest)
    await this.checkCompatibility(manifest)

    // 3. Verify checksums
    await this.verifyChecksums(tempDir, manifest.checksums)

    // 4. Determine target configuration
    const targetConfig = await this.buildTargetConfig(manifest, destination, options)

    // 5. Install AI Maestro agent data
    await this.installAgentData(tempDir, targetConfig)

    // 6. Install Claude logs (if present)
    if (fs.existsSync(path.join(tempDir, 'claude-project'))) {
      await this.installClaude Logs(tempDir, targetConfig)
    }

    // 7. Install project Claude configuration
    await this.installProjectClaudeConfig(tempDir, targetConfig)

    // 8. Update agent config with new paths
    await this.updateAgentConfig(targetConfig)

    // 9. Initialize infrastructure (tmux or cloud)
    if (targetConfig.autoStart) {
      await this.initializeAgent(targetConfig)
    }

    // 10. Register with AI Maestro
    await this.registerAgent(targetConfig)

    // 11. Cleanup temp directory
    await fs.rm(tempDir, { recursive: true })

    return {
      agentId: targetConfig.agentId,
      location: targetConfig.type, // 'local' | 'cloud'
      status: 'ready'
    }
  }

  async buildTargetConfig(manifest, destination, options) {
    const originalAgent = manifest.sourceAgent

    return {
      agentId: options.newName || originalAgent.agentId,
      type: destination.type, // 'local' | 'cloud'
      workingDirectory: destination.workingDirectory,
      claudeProjectDir: this.resolveClaude ProjectDir(destination.workingDirectory),

      // Cloud-specific
      ...(destination.type === 'cloud' && {
        cloud: {
          provider: destination.provider,
          region: destination.region,
          instanceType: destination.instanceType
        }
      }),

      // Local-specific
      ...(destination.type === 'local' && {
        tmuxSessionName: options.newName || originalAgent.agentId
      }),

      autoStart: options.autoStart !== false,
      preserveHistory: options.preserveHistory !== false
    }
  }

  async installProjectClaudeConfig(tempDir, targetConfig) {
    const sourceDir = path.join(tempDir, 'project-claude-config')
    const projectDir = targetConfig.workingDirectory

    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project directory does not exist: ${projectDir}. Clone repository first.`)
    }

    // Install .claude directory
    if (fs.existsSync(path.join(sourceDir, '.claude'))) {
      const targetClaudeDir = path.join(projectDir, '.claude')
      await fs.mkdir(targetClaudeDir, { recursive: true })
      await fs.cp(
        path.join(sourceDir, '.claude'),
        targetClaudeDir,
        { recursive: true }
      )
    }

    // Install CLAUDE.md (merge with existing if present)
    if (fs.existsSync(path.join(sourceDir, 'CLAUDE.md'))) {
      const targetClaudeMd = path.join(projectDir, 'CLAUDE.md')

      if (fs.existsSync(targetClaudeMd) && !targetConfig.overwrite) {
        // Backup existing
        await fs.copyFile(targetClaudeMd, `${targetClaudeMd}.backup`)
      }

      await fs.copyFile(
        path.join(sourceDir, 'CLAUDE.md'),
        targetClaudeMd
      )
    }

    // Install .claudeignore
    if (fs.existsSync(path.join(sourceDir, '.claudeignore'))) {
      await fs.copyFile(
        path.join(sourceDir, '.claudeignore'),
        path.join(projectDir, '.claudeignore')
      )
    }
  }
}
```

### Import Options

```typescript
interface HydrateOptions {
  newName?: string              // New agent ID (for clone operation)
  autoStart?: boolean           // Start agent after import (default: true)
  preserveHistory?: boolean     // Keep all conversation history (default: true)
  overwrite?: boolean           // Overwrite existing files (default: false)
  workingDirectory?: string     // Override working directory
}
```

---

## Export/Import Scripts

### Export Script (Full Implementation)

```bash
#!/bin/bash
# ai-maestro-export-agent.sh

set -e

AGENT_ID="$1"
OUTPUT_DIR="${2:-.}"
INCLUDE_LOGS="${3:-true}"

if [ -z "$AGENT_ID" ]; then
  echo "Usage: ./ai-maestro-export-agent.sh <agent-id> [output-dir] [include-logs]"
  exit 1
fi

DATE=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/$AGENT_ID-$DATE.tar.gz"
STAGING="/tmp/agent-export-$AGENT_ID-$$"

echo "🔄 Exporting agent: $AGENT_ID"
echo "   Output: $OUTPUT_FILE"

# 1. Validate agent exists
if [ ! -d ~/.aimaestro/agents/$AGENT_ID ]; then
  echo "❌ Error: Agent not found: $AGENT_ID"
  exit 1
fi

# 2. Read agent config
CONFIG_FILE=~/.aimaestro/agents/$AGENT_ID/config.json
WORKING_DIR=$(jq -r '.workingDirectory' "$CONFIG_FILE")
CLAUDE_PROJECT_DIR=$(jq -r '.claudeProjectDir // empty' "$CONFIG_FILE")

if [ -z "$CLAUDE_PROJECT_DIR" ]; then
  # Derive from working directory
  CLAUDE_PROJECT_DIR=~/.claude/projects/$(echo "$WORKING_DIR" | sed 's|/|-|g' | sed 's|^-||')
fi

echo "   Working Dir: $WORKING_DIR"
echo "   Claude Project: $CLAUDE_PROJECT_DIR"

# 3. Create staging directory
mkdir -p "$STAGING"

# 4. Copy AI Maestro agent data
echo "   → Copying AI Maestro agent data..."
cp -r ~/.aimaestro/agents/$AGENT_ID "$STAGING/aimaestro-agent"

# 5. Copy Claude logs (if requested)
if [ "$INCLUDE_LOGS" = "true" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
  echo "   → Copying Claude conversation logs..."
  mkdir -p "$STAGING/claude-project"
  cp "$CLAUDE_PROJECT_DIR"/*.jsonl "$STAGING/claude-project/" 2>/dev/null || true
fi

# 6. Copy project Claude configuration
echo "   → Copying project Claude configuration..."
mkdir -p "$STAGING/project-claude-config"

if [ -d "$WORKING_DIR/.claude" ]; then
  cp -r "$WORKING_DIR/.claude" "$STAGING/project-claude-config/"
fi

if [ -f "$WORKING_DIR/CLAUDE.md" ]; then
  cp "$WORKING_DIR/CLAUDE.md" "$STAGING/project-claude-config/"
fi

if [ -f "$WORKING_DIR/.claudeignore" ]; then
  cp "$WORKING_DIR/.claudeignore" "$STAGING/project-claude-config/"
fi

# 7. Query database for statistics
DB_FILE="$STAGING/aimaestro-agent/agent.db"
if [ -f "$DB_FILE" ]; then
  TOTAL_MESSAGES=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM conversations" 2>/dev/null || echo "0")
  TOTAL_SESSIONS=$(sqlite3 "$DB_FILE" "SELECT COUNT(DISTINCT session_id) FROM conversations" 2>/dev/null || echo "0")
  TOTAL_TOKENS=$(sqlite3 "$DB_FILE" "SELECT SUM(tokens_input + tokens_output) FROM conversations" 2>/dev/null || echo "0")
  TOTAL_COST=$(sqlite3 "$DB_FILE" "SELECT SUM(cost) FROM conversations" 2>/dev/null || echo "0")
  FIRST_MSG=$(sqlite3 "$DB_FILE" "SELECT MIN(timestamp) FROM conversations" 2>/dev/null || echo "unknown")
  LAST_MSG=$(sqlite3 "$DB_FILE" "SELECT MAX(timestamp) FROM conversations" 2>/dev/null || echo "unknown")
else
  TOTAL_MESSAGES=0
  TOTAL_SESSIONS=0
  TOTAL_TOKENS=0
  TOTAL_COST=0
  FIRST_MSG="unknown"
  LAST_MSG="unknown"
fi

# 8. Create manifest
cat > "$STAGING/MANIFEST.json" <<EOF
{
  "agentId": "$AGENT_ID",
  "version": "1.0.0",
  "exportDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exportedBy": "$(whoami)@$(hostname)",
  "sourceAgent": {
    "type": "$(jq -r '.type // "local"' "$CONFIG_FILE")",
    "platform": "$(uname -s)",
    "workingDirectory": "$WORKING_DIR",
    "claudeProjectDir": "$CLAUDE_PROJECT_DIR"
  },
  "statistics": {
    "totalMessages": $TOTAL_MESSAGES,
    "totalSessions": $TOTAL_SESSIONS,
    "totalTokens": $TOTAL_TOKENS,
    "totalCost": $TOTAL_COST,
    "firstMessageDate": "$FIRST_MSG",
    "lastMessageDate": "$LAST_MSG"
  },
  "contents": {
    "aimaestroAgent": "aimaestro-agent/",
    "claudeProject": "claude-project/",
    "projectClaudeConfig": "project-claude-config/"
  },
  "compatibility": {
    "minAIMaestroVersion": "0.7.0",
    "minClaudeVersion": "2.0.0"
  }
}
EOF

# 9. Create README
cat > "$STAGING/README.txt" <<EOF
AI Maestro Agent Package
=========================

Agent ID: $AGENT_ID
Export Date: $(date)
Total Messages: $TOTAL_MESSAGES
Total Sessions: $TOTAL_SESSIONS

CONTENTS:
  - aimaestro-agent/          AI Maestro agent data (config + database)
  - claude-project/           Claude conversation logs
  - project-claude-config/    Project Claude settings (IMPORTANT!)
  - MANIFEST.json            Package metadata

IMPORT INSTRUCTIONS:

1. Extract package:
   tar -xzf $AGENT_ID-$DATE.tar.gz

2. Run import script:
   ./ai-maestro-import-agent.sh ./ /path/to/project

3. Restart AI Maestro dashboard

For full documentation, see:
https://docs.ai-maestro.23blocks.com/agent-portability
EOF

# 10. Create archive
echo "   → Creating archive..."
tar -czf "$OUTPUT_FILE" -C "$STAGING" .

# 11. Calculate checksum
CHECKSUM=$(shasum -a 256 "$OUTPUT_FILE" | awk '{print $1}')

# 12. Cleanup
rm -rf "$STAGING"

# 13. Display summary
SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo ""
echo "✅ Agent exported successfully!"
echo ""
echo "   Package: $OUTPUT_FILE"
echo "   Size: $SIZE"
echo "   SHA256: $CHECKSUM"
echo "   Messages: $TOTAL_MESSAGES"
echo "   Sessions: $TOTAL_SESSIONS"
echo ""
```

### Import Script (Full Implementation)

```bash
#!/bin/bash
# ai-maestro-import-agent.sh

set -e

PACKAGE="$1"
PROJECT_DIR="$2"
NEW_NAME="$3"

if [ -z "$PACKAGE" ] || [ -z "$PROJECT_DIR" ]; then
  echo "Usage: ./ai-maestro-import-agent.sh <package.tar.gz> <project-directory> [new-agent-name]"
  echo ""
  echo "Example:"
  echo "  ./ai-maestro-import-agent.sh agent-20251103.tar.gz /home/customer/project"
  exit 1
fi

TEMP_DIR="/tmp/agent-import-$$"

echo "🔄 Importing agent from: $PACKAGE"
echo "   Project Dir: $PROJECT_DIR"

# 1. Extract package
echo "   → Extracting package..."
mkdir -p "$TEMP_DIR"
tar -xzf "$PACKAGE" -C "$TEMP_DIR"

# 2. Read manifest
if [ ! -f "$TEMP_DIR/MANIFEST.json" ]; then
  echo "❌ Error: Invalid package (no MANIFEST.json found)"
  rm -rf "$TEMP_DIR"
  exit 1
fi

AGENT_ID=$(jq -r '.agentId' "$TEMP_DIR/MANIFEST.json")
TOTAL_MESSAGES=$(jq -r '.statistics.totalMessages' "$TEMP_DIR/MANIFEST.json")

if [ -n "$NEW_NAME" ]; then
  AGENT_ID="$NEW_NAME"
fi

echo "   Agent ID: $AGENT_ID"
echo "   Messages: $TOTAL_MESSAGES"

# 3. Check if agent already exists
if [ -d ~/.aimaestro/agents/$AGENT_ID ]; then
  echo "⚠️  Warning: Agent already exists: $AGENT_ID"
  read -p "   Overwrite? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Import cancelled"
    rm -rf "$TEMP_DIR"
    exit 1
  fi
  rm -rf ~/.aimaestro/agents/$AGENT_ID
fi

# 4. Install AI Maestro agent data
echo "   → Installing AI Maestro agent data..."
mkdir -p ~/.aimaestro/agents
cp -r "$TEMP_DIR/aimaestro-agent" ~/.aimaestro/agents/$AGENT_ID

# 5. Install Claude logs (if present)
if [ -d "$TEMP_DIR/claude-project" ]; then
  echo "   → Installing Claude conversation logs..."
  CLAUDE_ESCAPED=$(echo "$PROJECT_DIR" | sed 's|/|-|g' | sed 's|^-||')
  CLAUDE_TARGET=~/.claude/projects/$CLAUDE_ESCAPED

  mkdir -p "$CLAUDE_TARGET"
  cp "$TEMP_DIR/claude-project"/*.jsonl "$CLAUDE_TARGET/" 2>/dev/null || true
fi

# 6. Install project Claude configuration
echo "   → Installing project Claude configuration..."

if [ ! -d "$PROJECT_DIR" ]; then
  echo "⚠️  Warning: Project directory not found: $PROJECT_DIR"
  echo "   You'll need to:"
  echo "   1. Clone the project repository to: $PROJECT_DIR"
  echo "   2. Manually install Claude config:"
  echo "      cp -r $TEMP_DIR/project-claude-config/.claude $PROJECT_DIR/"
  echo "      cp $TEMP_DIR/project-claude-config/CLAUDE.md $PROJECT_DIR/"
else
  # Install .claude directory
  if [ -d "$TEMP_DIR/project-claude-config/.claude" ]; then
    mkdir -p "$PROJECT_DIR/.claude"
    cp -r "$TEMP_DIR/project-claude-config/.claude/"* "$PROJECT_DIR/.claude/"
  fi

  # Install CLAUDE.md
  if [ -f "$TEMP_DIR/project-claude-config/CLAUDE.md" ]; then
    if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
      cp "$PROJECT_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md.backup"
      echo "   (Backed up existing CLAUDE.md to CLAUDE.md.backup)"
    fi
    cp "$TEMP_DIR/project-claude-config/CLAUDE.md" "$PROJECT_DIR/"
  fi

  # Install .claudeignore
  if [ -f "$TEMP_DIR/project-claude-config/.claudeignore" ]; then
    cp "$TEMP_DIR/project-claude-config/.claudeignore" "$PROJECT_DIR/"
  fi
fi

# 7. Update agent config with new paths
echo "   → Updating agent configuration..."
NEW_CLAUDE_DIR=~/.claude/projects/$CLAUDE_ESCAPED

jq --arg id "$AGENT_ID" \
   --arg wd "$PROJECT_DIR" \
   --arg cd "$NEW_CLAUDE_DIR" \
   '.id = $id | .workingDirectory = $wd | .claudeProjectDir = $cd | .lastActive = null' \
   ~/.aimaestro/agents/$AGENT_ID/config.json > /tmp/config.tmp

mv /tmp/config.tmp ~/.aimaestro/agents/$AGENT_ID/config.json

# 8. Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Agent imported successfully!"
echo ""
echo "Next steps:"
echo "  1. Restart AI Maestro dashboard"
echo "  2. Agent '$AGENT_ID' will auto-discover"
echo "  3. Connect to terminal to start using"
echo ""
```

---

## API Design

### REST API Endpoints

```typescript
// Export agent
POST /api/agents/:id/export
{
  includeLogs: boolean,
  compact: boolean,
  encrypt: boolean,
  password?: string
}
Response: {
  downloadUrl: string,
  checksum: string,
  size: number,
  expiresAt: string
}

// Import agent
POST /api/agents/import
FormData: {
  package: File,
  projectDirectory: string,
  newName?: string,
  autoStart: boolean
}
Response: {
  agentId: string,
  status: 'ready' | 'pending',
  location: 'local' | 'cloud'
}

// Move agent
POST /api/agents/:id/move
{
  destination: {
    type: 'local' | 'cloud',
    provider?: 'aws' | 'gcp' | 'azure',
    region?: string,
    workingDirectory: string
  },
  autoStart: boolean
}
Response: {
  taskId: string,
  status: 'in_progress'
}

// Copy agent
POST /api/agents/:id/copy
{
  newName: string,
  destination: {
    type: 'local' | 'cloud',
    workingDirectory: string
  }
}
Response: {
  newAgentId: string,
  status: 'ready'
}

// Clone agent
POST /api/agents/:id/clone
{
  newName: string,
  destination: {
    type: 'local' | 'cloud',
    workingDirectory: string
  },
  preserveHistory: boolean,
  resetOwnership: boolean
}
Response: {
  newAgentId: string,
  status: 'ready'
}

// Check export/import status
GET /api/agents/tasks/:taskId
Response: {
  taskId: string,
  status: 'in_progress' | 'completed' | 'failed',
  progress: number,
  message: string,
  result?: any
}
```

---

## Implementation Phases

### Phase 1: Core Serialization (2 weeks) - 13 points
- [ ] Design agent package format (MANIFEST.json, directory structure)
- [ ] Implement AgentSerializer class (dehydrate)
- [ ] Implement AgentDeserializer class (hydrate)
- [ ] Export script (bash)
- [ ] Import script (bash)
- [ ] Test: Export and import local agent

### Phase 2: API & UI (1 week) - 8 points
- [ ] POST /api/agents/:id/export endpoint
- [ ] POST /api/agents/import endpoint
- [ ] UI: "Export Agent" button in AgentProfile
- [ ] UI: "Import Agent" drag-and-drop zone
- [ ] UI: Progress indicators
- [ ] Test: Export/import via dashboard

### Phase 3: Move Operation (1 week) - 8 points
- [ ] POST /api/agents/:id/move endpoint
- [ ] Implement move logic (local → cloud)
- [ ] Implement move logic (cloud → local)
- [ ] UI: "Move to Cloud" button
- [ ] UI: "Move to Local" button
- [ ] Test: Bidirectional moves

### Phase 4: Copy & Clone (1 week) - 8 points
- [ ] POST /api/agents/:id/copy endpoint
- [ ] POST /api/agents/:id/clone endpoint
- [ ] Implement copy logic (preserve everything)
- [ ] Implement clone logic (reset ownership, new ID)
- [ ] UI: "Duplicate Agent" button
- [ ] UI: "Clone for Customer" workflow
- [ ] Test: Copy and clone operations

### Phase 5: Advanced Features (1 week) - 8 points
- [ ] Package encryption (AES-256)
- [ ] Selective export (date ranges, sessions)
- [ ] Database compaction
- [ ] Checksum verification
- [ ] Integrity checks
- [ ] Resume interrupted transfers
- [ ] Test: All advanced features

**Total Epic Points:** 45 points (~5-6 weeks)

---

## Success Metrics

- [ ] Agent export completes in <2 minutes for 100MB database
- [ ] Agent import completes in <3 minutes
- [ ] Package size: 50-70% smaller with compaction
- [ ] Zero data loss during export/import
- [ ] Move operation: <5 minutes local → cloud
- [ ] 100% fidelity: Agent works identically after import
- [ ] Search works immediately (no re-indexing needed)
- [ ] All conversation history preserved and searchable

---

## Security Considerations

1. **Encryption**: Optional AES-256 encryption for sensitive agents
2. **Checksums**: SHA-256 verification on import
3. **API Keys**: Never export API keys (customer provides their own)
4. **SSH Keys**: Never export SSH keys
5. **Secrets**: Scan for secrets before export (warn if found)
6. **Permissions**: Preserve tool permissions (settings.local.json)
7. **Ownership**: Reset ownership metadata on clone
8. **Access Control**: Only agent owner can export

---

## Customer Delivery Workflow

### Seller (23blocks)

```bash
# 1. Export agent for customer
./ai-maestro-export-agent.sh 23blocks-api-crm ./customer-delivery

# 2. Generate delivery package
zip customer-crm-agent-delivery.zip \
  23blocks-api-crm-*.tar.gz \
  ai-maestro-import-agent.sh \
  DELIVERY-INSTRUCTIONS.md

# 3. Transfer to customer
# - Email (if small)
# - S3 presigned URL
# - USB drive (air-gapped)
```

### Customer

```bash
# 1. Receive package and extract
unzip customer-crm-agent-delivery.zip

# 2. Clone project repository
git clone https://github.com/customer/their-crm-project /home/customer/crm

# 3. Import agent
./ai-maestro-import-agent.sh \
  23blocks-api-crm-20251103.tar.gz \
  /home/customer/crm \
  customer-crm-agent

# 4. Configure API keys (customer's own)
# Add to ~/.aimaestro/agents/customer-crm-agent/.env or environment

# 5. Start AI Maestro dashboard
npm run dev

# 6. Connect to agent terminal
# Agent is ready with full conversation history!
```

---

## References

- [DATA-MODEL-DESIGN.md](./DATA-MODEL-DESIGN.md) - Agent data structure
- [CONVERSATION-SEARCH-ARCHITECTURE.md](./CONVERSATION-SEARCH-ARCHITECTURE.md) - Vector search
- [BACKLOG-DISTRIBUTED-AGENTS.md](./BACKLOG-DISTRIBUTED-AGENTS.md) - Implementation roadmap

---

**Document Status:** ✅ Ready for Backlog
**Next Steps:** Create Epic in backlog, prioritize in roadmap
