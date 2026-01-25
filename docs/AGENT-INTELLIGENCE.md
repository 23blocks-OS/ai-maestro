# Agent Intelligence System

AI Maestro's Agent Intelligence System gives your AI coding agents persistent memory and deep code understanding. Each agent maintains its own embedded database (CozoDB) that stores conversation history, code analysis, and semantic embeddings.

## Features Overview

### 1. Code Graph Visualization

The Code Graph provides an interactive visualization of your codebase structure, showing how files, classes, functions, and components relate to each other.

![Code Graph Visualization](./images/code_graph_02.png)

**Capabilities:**
- **Multi-language Support**: Ruby, TypeScript, Python, Go, and more
- **Entity Types**: Files, Functions, Classes, Components, Controllers, Models, Concerns
- **Relationship Types**: imports, calls, extends, includes, associations, serializes
- **Interactive Filters**: Show/hide by entity type (Files, Functions, Components)
- **Layout Options**: Hierarchical or force-directed layouts
- **Focus Mode**: Click any node to focus on its immediate relationships
- **Search**: Find specific entities by name

**How to Access:**
1. Select a session in AI Maestro
2. Click the **Graph** tab
3. Wait for the code index to build (first time only)
4. Use filters and zoom to explore

**API Endpoint:**
```
GET /api/agents/{agentId}/graph/entities?type=all
```

### 2. Agent Subconscious

The Agent Subconscious is a background process that maintains each agent's memory by indexing conversations for semantic search.

![Agent Subconscious Panel](./images/agent_subconscius.png)

**Features:**
- **Memory Maintenance**: Indexes conversations for semantic search
- **Long-Term Memory Consolidation**: Periodically consolidates memories for better retrieval
- **Self-Staggering**: Automatically staggers startup times across agents to prevent CPU spikes
- **Activity-Aware Intervals**: Runs more frequently when agent is active, less when idle

> **Note (v0.18.10+):** Message checking has been replaced by **push notifications**. When messages are sent, agents receive instant tmux notifications instead of polling. This eliminates delays and reduces CPU usage.

**Status Panel Shows:**
- **Status**: Running / Stopped
- **Memory Maintenance**: Last run time, total runs
- **Consolidation**: Last run time, memory count

**Technical Details:**

The subconscious uses a hash-based stagger offset calculated from the agent ID:
```typescript
// Each agent gets a unique offset based on its ID
const staggerOffset = hash(agentId) % memoryCheckInterval
```

This ensures that even with 100+ agents, they don't all try to run at the same time.

**Intervals:**
| Activity State | Memory Check | Consolidation |
|---------------|--------------|---------------|
| Active        | 5 minutes    | 30 minutes    |
| Idle          | 30 minutes   | 60 minutes    |
| Disconnected  | 60 minutes   | 120 minutes   |

**API Endpoint:**
```
GET /api/agents/{agentId}/subconscious
```

### 3. Conversation Memory

Browse and search through every conversation your agents have had.

![Conversation Memory](./images/agent_conversation_memory.png)

**Features:**
- **Full Conversation History**: Every message, including thinking steps
- **Semantic Search**: Find conversations by meaning, not just keywords
- **Tool Usage Tracking**: See which tools were used and how
- **Model Information**: Track which model was used for each conversation
- **Statistics**: Message counts, duration, timestamps

**How to Access:**
1. Select a session in AI Maestro
2. Click the **WorkTree** tab
3. Browse sessions, projects, and conversations
4. Click any conversation to view details

**Conversation Details Include:**
- Conversation ID and file path
- Total message count
- Model used (e.g., claude-opus-4-5-20251101)
- Git branch context
- Working directory
- Full message timeline with thinking steps

**API Endpoint:**
```
GET /api/agents/{agentId}/conversations
GET /api/agents/{agentId}/conversations/{conversationId}
```

### 4. Auto-Generated Documentation

Living documentation automatically extracted from your codebase.

**Features:**
- **Automatic Extraction**: Parses docstrings, comments, and type annotations
- **Searchable Index**: Full-text search across all documentation
- **Always Current**: Updates when you index your codebase

**How to Access:**
1. Select a session in AI Maestro
2. Click the **Docs** tab
3. Browse or search the documentation

## Architecture

### Per-Agent Database

Each agent has its own CozoDB embedded database stored at:
```
~/.aimaestro/agents/{agentId}/
  ├── agent.db           # CozoDB database
  ├── conversations/     # Indexed conversation files
  └── docs/              # Generated documentation
```

### Database Schema

The CozoDB database stores:

**Code Entities:**
```
:entity {
  id: String,
  name: String,
  type: String,        # file, function, class, component, etc.
  file_path: String,
  start_line: Int,
  end_line: Int,
  language: String
}
```

**Relationships:**
```
:relationship {
  source_id: String,
  target_id: String,
  type: String         # imports, calls, extends, includes, etc.
}
```

**Conversation Index:**
```
:conversation {
  id: String,
  file_path: String,
  message_count: Int,
  model: String,
  branch: String,
  timestamp: Int
}
```

### Memory Indexing Pipeline

1. **Claude Session Detection**: Monitors `~/.claude/projects/` for conversation files
2. **Conversation Parsing**: Extracts messages, tool usage, thinking steps
3. **Embedding Generation**: Creates semantic embeddings for search
4. **Index Storage**: Stores in CozoDB for fast retrieval

### Code Indexing Pipeline

1. **File Discovery**: Scans project directory for source files
2. **Language Detection**: Identifies programming language
3. **AST Parsing**: Parses files into abstract syntax trees
4. **Entity Extraction**: Extracts functions, classes, imports, etc.
5. **Relationship Mapping**: Builds graph of relationships
6. **Storage**: Stores entities and relationships in CozoDB

### Delta Indexing

**The Problem:** Full code re-indexing is slow and wasteful. A typical project with 200+ files takes 1000ms+ to fully re-index, even when only a few files change.

**The Solution:** Delta indexing tracks file content hashes (SHA256) and only re-indexes files that have actually changed.

**Why It Matters:** Fast iterations (~100ms when no changes vs 1000ms+ full re-index) means your code graph stays current as you work, without the wait.

**How it works:**
1. **First run**: Full index + file metadata initialization (hash, mtime, size)
2. **Subsequent runs**: Compare filesystem state against stored metadata
3. **Only re-index**: New files, modified files (hash changed), remove deleted files
4. **Skip unchanged**: Files with matching hash are left alone

**Using Delta Indexing:**

```bash
# CLI command (from any tmux session)
graph-index-delta.sh

# Or with specific project path
graph-index-delta.sh /path/to/project
```

**API Endpoint:**
```bash
# Delta index
POST /api/agents/{agentId}/graph/code
Content-Type: application/json
{"delta": true}

# Response shows what changed
{
  "success": true,
  "mode": "delta",
  "stats": {
    "filesNew": 0,
    "filesModified": 1,
    "filesDeleted": 0,
    "filesUnchanged": 191,
    "filesIndexed": 1,
    "durationMs": 127
  }
}
```

**Performance:**
| Scenario | Duration |
|----------|----------|
| Full index (200 files) | ~1000ms |
| Delta index (no changes) | ~100ms |
| Delta index (1 file changed) | ~130ms |
| Delta index (10 files changed) | ~300ms |

## Supported Languages

| Language   | File Extensions | Entity Types |
|------------|-----------------|--------------|
| Ruby       | .rb             | Classes, Modules, Methods, Concerns |
| TypeScript | .ts, .tsx       | Classes, Functions, Interfaces, Components |
| JavaScript | .js, .jsx       | Classes, Functions, Components |
| Python     | .py             | Classes, Functions, Methods |
| Go         | .go             | Structs, Functions, Interfaces |

## API Reference

### Graph Endpoints

```bash
# Get all entities
GET /api/agents/{agentId}/graph/entities

# Get entities by type
GET /api/agents/{agentId}/graph/entities?type=function

# Get relationships
GET /api/agents/{agentId}/graph/relationships

# Full reindex (re-indexes all files)
POST /api/agents/{agentId}/graph/code

# Delta reindex (only changed files - RECOMMENDED)
POST /api/agents/{agentId}/graph/code
Content-Type: application/json
{"delta": true}
```

### Subconscious Endpoints

```bash
# Get status
GET /api/agents/{agentId}/subconscious

# Global subconscious status (all agents)
GET /api/subconscious
```

### Conversation Endpoints

```bash
# List all conversations
GET /api/agents/{agentId}/conversations

# Get conversation details
GET /api/agents/{agentId}/conversations/{conversationId}

# Search conversations
GET /api/agents/{agentId}/conversations/search?q=query
```

## Configuration

### Environment Variables

```bash
# Memory check interval (default: 5 minutes when active)
MEMORY_CHECK_INTERVAL=300000

# Consolidation interval (default: 30 minutes when active)
CONSOLIDATION_INTERVAL=1800000

# Push notifications (v0.18.10+)
NOTIFICATIONS_ENABLED=true
NOTIFICATION_FORMAT="[MESSAGE] From: {from} - {subject} - check your inbox"
```

### Per-Agent Settings

Agent settings can be configured via the Agent Profile tab:
- Memory maintenance enable/disable
- Consolidation enable/disable
- Custom check intervals

> **Note:** Message polling has been replaced by push notifications (v0.18.10+). Agents receive instant tmux notifications when messages arrive.

## Troubleshooting

### Subconscious Not Running

1. Check the Subconscious panel in the sidebar
2. Verify the agent database exists: `ls ~/.aimaestro/agents/{agentId}/`
3. Check server logs: `pm2 logs ai-maestro`

### Code Graph Empty

1. Ensure the agent has indexed the codebase
2. Click "Refresh" in the Graph tab
3. Check that the working directory contains supported file types

### Conversations Not Appearing

1. Verify Claude sessions exist: `ls ~/.claude/projects/`
2. Check that conversations have been indexed
3. Trigger manual index via Subconscious panel

## Performance Considerations

### Scaling to 100+ Agents

The Agent Intelligence System is designed to scale:

- **Staggered Startup**: Agents start at different times based on ID hash
- **Activity-Aware Intervals**: Idle agents consume fewer resources
- **Per-Agent Databases**: No shared database bottleneck
- **Lazy Initialization**: Agents only initialize when first accessed

### Resource Usage

| Agents | Memory (approx) | CPU (idle) |
|--------|-----------------|------------|
| 10     | ~200 MB         | <1%        |
| 50     | ~1 GB           | <5%        |
| 100    | ~2 GB           | <10%       |

## Related Documentation

- [Agent Communication Guide](./AGENT-COMMUNICATION-QUICKSTART.md) - Inter-agent messaging
- [Operations Guide](./OPERATIONS-GUIDE.md) - General AI Maestro operations
- [Technical Specifications](./TECHNICAL-SPECIFICATIONS.md) - Architecture deep-dive
