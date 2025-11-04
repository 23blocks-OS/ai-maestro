# AI Maestro Data Model Design

**Author:** AI Maestro Development Team
**Date:** 2025-11-03
**Status:** Architecture Design
**Related Epics:** Epic 11 (Agent Intelligence Layer)

---

## Table of Contents

1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Data Model](#proposed-data-model)
4. [Agent-to-Claude Mapping](#agent-to-claude-mapping)
5. [Database Schema](#database-schema)
6. [Data Flow](#data-flow)
7. [Agent Portability](#agent-portability)
8. [Implementation Guidelines](#implementation-guidelines)

---

## Overview

This document defines the complete data model for AI Maestro, clarifying the relationship between:
- **AI Maestro Agents** (tmux sessions or cloud instances)
- **Claude Code Projects** (where conversation logs are stored)
- **Claude Sessions** (individual conversation threads)
- **JSONL Files** (Claude's conversation logs)

### Key Design Principles

1. **Agent Autonomy**: Each agent is a self-contained, portable unit
2. **Distributed Architecture**: No central database; each agent owns its data
3. **Claude Integration**: AI Maestro reads Claude Code's JSONL logs but doesn't modify them
4. **Portability**: Agents can be transferred between AI Maestro instances

---

## Current State Analysis

### What Exists Today

**AI Maestro:**
- ✅ Agent discovery (local tmux via `tmux ls`)
- ✅ Cloud agent metadata (`~/.aimaestro/agents/*.json`)
- ✅ Terminal connections (WebSocket + PTY)
- ❌ **NO tracking of agent conversations**
- ❌ **NO metrics/token tracking**
- ❌ **NO conversation search**

**Claude Code (External System):**
- ✅ Conversation logs (JSONL format)
- ✅ Session management (internal)
- ✅ Token usage (embedded in JSONL)
- ❌ **NOT indexed or searchable**
- ❌ **Not integrated with AI Maestro**

### The Disconnect

AI Maestro and Claude Code are two separate systems that run alongside each other:

```
┌─────────────────────────────────────┐
│ AI Maestro Dashboard                │
│ • Discovers agents (tmux ls)        │
│ • Connects terminals (WebSocket)    │
│ • NO conversation tracking          │
└─────────────────────────────────────┘
                 │
                 │ WebSocket + PTY
                 ▼
┌─────────────────────────────────────┐
│ tmux Session (Agent)                │
│ ├─ Runs Claude Code CLI             │
│ └─ Generates JSONL logs              │
└─────────────────────────────────────┘
                 │
                 │ Writes to filesystem
                 ▼
┌─────────────────────────────────────┐
│ ~/.claude/projects/{dir}/           │
│ • {session-id}.jsonl                │
│ • agent-{id}.jsonl (sidechains)     │
│ • NOT indexed                        │
└─────────────────────────────────────┘
```

**Epic 11 bridges this gap** by creating a database layer that indexes Claude's JSONL files.

---

## Proposed Data Model

### Core Entities

```
AI Maestro Agent
├── Agent Metadata (config.json)
├── Agent Database (agent.db) ← NEW!
│   ├── Conversations (indexed from Claude JSONL)
│   ├── Vector Embeddings (semantic search)
│   ├── Metrics (tokens, costs, tools)
│   └── Sessions (conversation threads)
└── Claude Code Integration
    └── Points to ~/.claude/projects/{dir}/
```

### Entity Definitions

#### 1. AI Maestro Agent

**Definition:** A Claude Code instance running in tmux or cloud infrastructure.

**Types:**
- **Local Agent**: tmux session on local machine
- **Cloud Agent**: Remote EC2/cloud instance with tmux

**Identifier:**
- Local: tmux session name (e.g., `23blocks-api-crm`)
- Cloud: agent ID (e.g., `cloud-agent-1`)

#### 2. Claude Code Project

**Definition:** A working directory where Claude Code operates and stores logs.

**Location:** `~/.claude/projects/{escaped-path}/`

**Contains:**
- Multiple JSONL files (conversation logs)
- Session history spanning weeks/months
- Sub-agent logs (sidechains)

#### 3. Claude Session

**Definition:** A single conversation thread with Claude.

**Identifier:** UUID (e.g., `1e8544aa-de65-4f54-8691-4d138836c981`)

**Properties:**
- Created when user starts new conversation
- Can span hours/days (persistent sessions)
- May spawn sub-agents (sidechains)

#### 4. JSONL Files

**Definition:** Line-delimited JSON logs containing conversation messages.

**Types:**
- **Main session file**: `{session-id}.jsonl` (primary conversation)
- **Sidechain files**: `agent-{short-id}.jsonl` (sub-agents spawned by main session)

**Structure:**
```jsonl
{"sessionId": "1e8544aa...", "agentId": null, "message": {...}, "timestamp": "..."}
{"sessionId": "1e8544aa...", "agentId": "ca45b764", "isSidechain": true, ...}
```

---

## Agent-to-Claude Mapping

### The Relationship Hierarchy

```
1 AI Maestro Agent
└── Maps to 1 Claude Code Project Directory
    └── Contains N Claude Sessions (over time)
        └── Each session has 1+ JSONL Files
            ├── Main file: {session-id}.jsonl
            └── Sidechain files: agent-*.jsonl
```

### Mapping Strategy

**Option 1: Explicit Configuration (Recommended)**

```json
// ~/.aimaestro/agents/23blocks-api-crm/config.json
{
  "id": "23blocks-api-crm",
  "type": "local",
  "tmuxSessionName": "23blocks-api-crm",
  "claudeProjectDir": "/Users/juanpelaez/23blocks/blocks/crm-api",
  "workingDirectory": "/Users/juanpelaez/23blocks/blocks/crm-api",
  "createdAt": "2025-11-03T...",
  "lastActive": "2025-11-03T..."
}
```

**Option 2: Derived from Working Directory (Fallback)**

```javascript
// If config.claudeProjectDir not set, derive from tmux working directory
const tmuxCwd = await getTmuxSessionCwd(tmuxSessionName)
const claudeProjectDir = resolveClaude ProjectPath(tmuxCwd)
// ~/.claude/projects/-Users-juanpelaez-23blocks-blocks-crm-api/
```

### Example Mapping

**Agent:** `23blocks-api-crm`
**Working Directory:** `/Users/juanpelaez/23blocks/blocks/crm-api`
**Claude Project:** `~/.claude/projects/-Users-juanpelaez-23blocks-blocks-crm-api/`

**JSONL Files in Project:**
```
-Users-juanpelaez-23blocks-blocks-crm-api/
├── 1e8544aa-de65-4f54-8691-4d138836c981.jsonl  (5,740 lines)
├── 3c937c98-35b7-4517-9e34-78b53978bdc1.jsonl  (45 lines)
├── agent-116092d7.jsonl                         (35 lines, sidechain)
├── agent-ca45b764.jsonl                         (12 lines, sidechain)
└── ... (more sessions over time)
```

**AI Maestro Database:** `~/.aimaestro/agents/23blocks-api-crm/agent.db`
- Indexes ALL JSONL files in the Claude project
- Stores conversations from ALL sessions
- Searchable across entire agent history

---

## Database Schema

### Location

```
~/.aimaestro/agents/{agent-id}/
├── config.json          # Agent metadata
└── agent.db             # SQLite database (THIS FILE!)
```

### Core Tables

#### 1. `conversations` Table

Stores all messages from all sessions for this agent.

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Session tracking
  session_id TEXT NOT NULL,              -- Claude session UUID
  timestamp TEXT NOT NULL,               -- ISO 8601 timestamp

  -- Message content
  role TEXT NOT NULL,                    -- 'user' | 'assistant'
  content TEXT NOT NULL,                 -- Main text content
  tool_use TEXT,                         -- JSON of tool invocations
  tool_result TEXT,                      -- JSON of tool results

  -- Token/cost tracking
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,

  -- Source tracking (for jumping back to original)
  jsonl_file TEXT NOT NULL,              -- Filename (e.g., "1e8544aa-...jsonl")
  jsonl_line INTEGER NOT NULL,           -- Line number in file

  -- Agent sidechain tracking
  agent_id TEXT,                         -- If sidechain: agent-{id}
  is_sidechain BOOLEAN DEFAULT 0,        -- True if spawned sub-agent
  parent_uuid TEXT,                      -- Link to parent message

  UNIQUE(jsonl_file, jsonl_line)
);

-- Indexes for fast lookups
CREATE INDEX idx_conv_session_time ON conversations(session_id, timestamp DESC);
CREATE INDEX idx_conv_role ON conversations(role);
CREATE INDEX idx_conv_timestamp ON conversations(timestamp DESC);
CREATE INDEX idx_conv_agent ON conversations(agent_id);
```

#### 2. `conversation_embeddings` Table (sqlite-vss)

Stores vector embeddings for semantic search.

```sql
-- Virtual table for vector search
CREATE VIRTUAL TABLE conversation_embeddings USING vss0(
  embedding(1536)  -- OpenAI text-embedding-3-small dimension
);
```

#### 3. `conversation_vectors` Table

Links conversations to their embeddings.

```sql
CREATE TABLE conversation_vectors (
  conversation_id INTEGER PRIMARY KEY,
  embedding_id INTEGER NOT NULL,
  embedding_hash TEXT,                   -- SHA-256 of content (deduplication)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (embedding_id) REFERENCES conversation_embeddings(rowid) ON DELETE CASCADE
);

CREATE INDEX idx_vectors_hash ON conversation_vectors(embedding_hash);
```

#### 4. `conversations_fts` Table (FTS5)

Full-text search index for keyword searches.

```sql
CREATE VIRTUAL TABLE conversations_fts USING fts5(
  content,
  tool_use,
  content='conversations',
  content_rowid='id'
);
```

#### 5. `sessions` Table

Metadata about conversation sessions.

```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  first_message_at TEXT,
  last_message_at TEXT,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  primary_jsonl_file TEXT,              -- Main file for this session
  has_sidechains BOOLEAN DEFAULT 0,
  status TEXT DEFAULT 'active'          -- 'active' | 'archived'
);
```

#### 6. `metrics` Table

Pre-aggregated metrics for fast dashboard display.

```sql
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_date DATE NOT NULL,

  -- Message stats
  messages_total INTEGER DEFAULT 0,
  messages_user INTEGER DEFAULT 0,
  messages_assistant INTEGER DEFAULT 0,

  -- Token stats
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0,

  -- Cost stats
  cost_total REAL DEFAULT 0,

  -- Tool usage
  tool_invocations INTEGER DEFAULT 0,
  tool_bash INTEGER DEFAULT 0,
  tool_read INTEGER DEFAULT 0,
  tool_write INTEGER DEFAULT 0,
  tool_edit INTEGER DEFAULT 0,

  UNIQUE(metric_date)
);
```

#### 7. `tool_invocations` Table

Detailed tool usage tracking.

```sql
CREATE TABLE tool_invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input TEXT,                       -- JSON of input parameters
  tool_output TEXT,                      -- JSON of output/result
  success BOOLEAN,
  duration_ms INTEGER,
  timestamp TEXT NOT NULL,

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_tool_name ON tool_invocations(tool_name);
CREATE INDEX idx_tool_timestamp ON tool_invocations(timestamp DESC);
```

---

## Data Flow

### 1. Agent Discovery

```javascript
// AI Maestro discovers agents
const localAgents = await discoverLocalAgents()   // tmux ls
const cloudAgents = await discoverCloudAgents()   // ~/.aimaestro/agents/*.json

// For each agent, determine Claude project directory
for (const agent of localAgents) {
  const cwd = await getTmuxSessionCwd(agent.tmuxSessionName)
  agent.claudeProjectDir = resolveClaude ProjectPath(cwd)
  agent.dbPath = `~/.aimaestro/agents/${agent.id}/agent.db`
}
```

### 2. JSONL Indexing (Initial)

```javascript
// ConversationIndexer class
class ConversationIndexer {
  constructor(agentId, claudeProjectDir) {
    this.agentId = agentId
    this.claudeProjectDir = claudeProjectDir
    this.dbPath = `~/.aimaestro/agents/${agentId}/agent.db`
    this.db = new Database(this.dbPath)
    this.db.loadExtension(vss)
  }

  async indexAllFiles() {
    // Find all JSONL files in Claude project
    const jsonlFiles = fs.readdirSync(this.claudeProjectDir)
      .filter(f => f.endsWith('.jsonl'))

    for (const file of jsonlFiles) {
      await this.indexJSONL(path.join(this.claudeProjectDir, file))
    }
  }

  async indexJSONL(jsonlPath) {
    const filename = path.basename(jsonlPath)
    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)
    const batch = []

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const msg = JSON.parse(lines[lineNum])

      // Check if already indexed
      const existing = this.db.prepare(`
        SELECT id FROM conversations
        WHERE jsonl_file = ? AND jsonl_line = ?
      `).get(filename, lineNum)

      if (existing) continue  // Skip duplicates

      // Extract content
      const content = this.extractContent(msg)
      if (!content) continue

      // Store message
      const msgId = this.db.prepare(`
        INSERT INTO conversations (
          session_id, timestamp, role, content,
          tool_use, tool_result,
          tokens_input, tokens_output, tokens_cached, cost,
          jsonl_file, jsonl_line,
          agent_id, is_sidechain, parent_uuid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.sessionId,
        msg.timestamp,
        msg.message?.role || 'user',
        content,
        msg.message?.content?.find(b => b.type === 'tool_use') ? JSON.stringify(msg.message.content) : null,
        msg.toolUseResult ? JSON.stringify(msg.toolUseResult) : null,
        msg.message?.usage?.input_tokens || 0,
        msg.message?.usage?.output_tokens || 0,
        msg.message?.usage?.cache_read_input_tokens || 0,
        this.calculateCost(msg.message?.usage),
        filename,
        lineNum,
        msg.agentId,
        msg.isSidechain || false,
        msg.parentUuid
      ).lastInsertRowid

      // Queue for embedding generation
      batch.push({ id: msgId, content })

      if (batch.length >= 100) {
        await this.generateEmbeddings(batch)
        batch.length = 0
      }
    }

    if (batch.length > 0) {
      await this.generateEmbeddings(batch)
    }
  }
}
```

### 3. Real-Time Updates (Incremental)

```javascript
// Watch Claude project directory for new messages
const watcher = chokidar.watch(`${claudeProjectDir}/*.jsonl`, {
  persistent: true,
  ignoreInitial: true
})

watcher.on('change', async (filepath) => {
  // Parse only new lines since last index
  await indexer.indexNewLines(filepath)
})
```

### 4. Semantic Search

```javascript
class ConversationSearch {
  async semanticSearch(query, options = {}) {
    // Generate embedding for query
    const queryEmbedding = await this.getEmbedding(query)

    // Vector search
    const results = this.db.prepare(`
      SELECT
        c.id,
        c.session_id,
        c.timestamp,
        c.role,
        c.content,
        c.jsonl_file,
        c.jsonl_line,
        (1 - v.distance) as relevance_score
      FROM conversation_embeddings e
      JOIN conversation_vectors v ON e.rowid = v.embedding_id
      JOIN conversations c ON v.conversation_id = c.id
      WHERE vss_search(e.embedding, ?)
        AND c.session_id = COALESCE(?, c.session_id)
      ORDER BY v.distance ASC
      LIMIT ?
    `).all(JSON.stringify(queryEmbedding), options.sessionId, options.limit || 10)

    return results.filter(r => r.relevance_score >= (options.minRelevance || 0.7))
  }
}
```

### 5. Metrics Aggregation

```javascript
// Pre-compute daily metrics
async function updateMetrics(db, date) {
  db.prepare(`
    INSERT OR REPLACE INTO metrics (
      metric_date,
      messages_total,
      messages_user,
      messages_assistant,
      tokens_input,
      tokens_output,
      cost_total
    )
    SELECT
      DATE(timestamp) as metric_date,
      COUNT(*) as messages_total,
      SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as messages_user,
      SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as messages_assistant,
      SUM(tokens_input) as tokens_input,
      SUM(tokens_output) as tokens_output,
      SUM(cost) as cost_total
    FROM conversations
    WHERE DATE(timestamp) = ?
    GROUP BY DATE(timestamp)
  `).run(date)
}
```

---

## Agent Portability

### Agent as Deliverable Product

Each agent is a **self-contained, portable unit** that can be transferred between AI Maestro instances.

### Agent Directory Structure

```
~/.aimaestro/agents/23blocks-api-crm/
├── config.json           # Agent metadata (type, name, working dir)
├── agent.db              # SQLite database (ALL data)
│   ├── conversations     # Indexed JSONL content
│   ├── embeddings        # Vector search data
│   ├── sessions          # Session metadata
│   └── metrics           # Pre-computed stats
└── sessions/             # Optional: Copy of JSONL files
    ├── 1e8544aa-....jsonl
    └── agent-*.jsonl
```

### Export Workflow

```bash
# Package agent for transfer
cd ~/.aimaestro/agents
tar -czf 23blocks-api-crm-$(date +%Y%m%d).tar.gz 23blocks-api-crm/

# Transfer to customer
# - Email (if small)
# - S3 presigned URL (if large)
# - USB drive (air-gapped)
```

### Import Workflow

```bash
# Customer's AI Maestro instance

# 1. Extract agent
cd ~/.aimaestro/agents
tar -xzf 23blocks-api-crm-20251103.tar.gz

# 2. Agent auto-discovered by AI Maestro
# - Dashboard scans ~/.aimaestro/agents/*/agent.db
# - Detects agent.db → loads metadata from database
# - Full conversation history immediately searchable
# - No re-indexing needed (embeddings included)

# 3. Agent ready to use
# - Connect via terminal
# - Search conversation history
# - View metrics
```

### What Travels with Agent

**Included:**
- ✅ Complete conversation history (indexed in agent.db)
- ✅ All vector embeddings (no regeneration needed)
- ✅ Performance metrics (tokens, costs, tool usage)
- ✅ Session metadata (creation times, message counts)
- ✅ Agent configuration (working directory, preferences)

**Excluded (Customer provides):**
- ❌ API keys (Anthropic, OpenAI) - customer uses their own
- ❌ SSH keys - customer's infrastructure
- ❌ tmux session state - agent creates new session on import

---

## Implementation Guidelines

### Phase 1: Core Infrastructure

1. **Create agent directory structure**
   ```javascript
   await fs.mkdir(`~/.aimaestro/agents/${agentId}`, { recursive: true })
   ```

2. **Initialize SQLite database**
   ```javascript
   const db = new Database(`~/.aimaestro/agents/${agentId}/agent.db`)
   db.loadExtension(vss)
   await initSchema(db)
   ```

3. **Map agents to Claude projects**
   ```javascript
   const claudeProjectDir = resolveClaude ProjectPath(agent.workingDirectory)
   ```

4. **Index historical JSONL files**
   ```javascript
   const indexer = new ConversationIndexer(agentId, claudeProjectDir)
   await indexer.indexAllFiles()
   ```

### Phase 2: Real-Time Updates

1. **Watch JSONL files for changes**
   ```javascript
   const watcher = chokidar.watch(`${claudeProjectDir}/*.jsonl`)
   watcher.on('change', indexNewLines)
   ```

2. **Incremental embedding generation**
   - Only generate embeddings for new messages
   - Batch processing (100 messages at a time)

### Phase 3: Search & Metrics

1. **Semantic search API**
   ```typescript
   GET /api/agents/:id/search?q=authentication&limit=10
   ```

2. **Metrics aggregation**
   - Daily metrics pre-computed
   - Real-time updates via WebSocket

### Phase 4: Agent Discovery

1. **Auto-discover portable agents**
   ```javascript
   const agents = fs.readdirSync('~/.aimaestro/agents')
     .filter(dir => fs.existsSync(`${dir}/agent.db`))
   ```

2. **Load metadata from database**
   ```sql
   SELECT * FROM sessions ORDER BY last_message_at DESC LIMIT 1
   ```

---

## Appendix

### A. Session ID Examples

From actual Claude Code logs:

```
1e8544aa-de65-4f54-8691-4d138836c981  (5,740 messages, main session)
3c937c98-35b7-4517-9e34-78b53978bdc1  (45 messages, short session)
7f3e2fa9-8a2f-4799-b83c-d0bd41f12e5a  (12 messages, aborted)
```

### B. JSONL File Examples

**Main session file:**
```
1e8544aa-de65-4f54-8691-4d138836c981.jsonl
```

**Sidechain files (spawned by session 1e8544aa):**
```
agent-116092d7.jsonl  (Explore agent)
agent-ca45b764.jsonl  (Warmup agent)
agent-9d0b0fa6.jsonl  (Plan agent)
```

All sidechains reference parent session ID:
```json
{"sessionId": "1e8544aa-de65-4f54-8691-4d138836c981", "agentId": "ca45b764", "isSidechain": true}
```

### C. Claude Project Path Resolution

```javascript
function resolveClaude ProjectPath(workingDir) {
  // Claude escapes paths: / → -, spaces → -, etc.
  // /Users/juan/projects/app → -Users-juan-projects-app
  const escaped = workingDir
    .replace(/^\//, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')

  return path.join(os.homedir(), '.claude', 'projects', escaped)
}
```

**Examples:**
```
/Users/juan/23blocks/blocks/crm-api
→ ~/.claude/projects/-Users-juan-23blocks-blocks-crm-api/

/workspace
→ ~/.claude/projects/-workspace/
```

---

## References

- [CONVERSATION-SEARCH-ARCHITECTURE.md](./CONVERSATION-SEARCH-ARCHITECTURE.md) - Vector search implementation
- [DATA-PIPELINE-ARCHITECTURE.md](./DATA-PIPELINE-ARCHITECTURE.md) - Distributed SQLite architecture
- [BACKLOG-DISTRIBUTED-AGENTS.md](./BACKLOG-DISTRIBUTED-AGENTS.md) - Epic 11 implementation plan

---

**Document Status:** ✅ Ready for Implementation
**Next Steps:** Begin Phase 1 - Core Infrastructure (Epic 11)
