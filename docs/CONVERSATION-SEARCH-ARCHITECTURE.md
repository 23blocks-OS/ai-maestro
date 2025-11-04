# Conversation Search Architecture: Vector-Powered Semantic Search

**Author:** AI Maestro Development Team
**Date:** 2025-11-03
**Epic:** Epic 11 - Agent Intelligence Layer

## The Game-Changing Insight

**Current Problem:**
```
User: "What did we discuss about authentication?"
→ Claude reads entire 17MB JSONL file (~4M tokens)
→ Limited to 200K token context window
→ Must chunk and re-read multiple times
→ Cost: $1.50-$2.00 per search
→ 100 searches/month = $200
```

**Solution: SQLite + Vector Embeddings**
```
User: "What did we discuss about authentication?"
→ Generate embedding for query (1 token = $0.00002)
→ Vector search finds 5-10 most relevant messages (<500ms)
→ Send only relevant context to Claude (~2K tokens)
→ Cost: $0.002-$0.003 per search
→ 100 searches/month = $0.30
→ SAVINGS: 99.85% 🚀
```

## Architecture Philosophy: Agent Autonomy

**CRITICAL DESIGN DECISION:** Each agent is **fully autonomous and portable**.

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Directory (Portable Unit)                             │
│  ~/.claude/projects/my-agent/                                │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Agent Data (Co-located)                            │    │
│  │                                                     │    │
│  │  • agent.db (SQLite with sqlite-vss)              │    │
│  │    - Conversations table                           │    │
│  │    - Vector embeddings                             │    │
│  │    - FTS5 search index                             │    │
│  │    - Performance metrics                           │    │
│  │                                                     │    │
│  │  • conversations/ (JSONL files)                    │    │
│  │    - 2025-01-15.jsonl                              │    │
│  │    - 2025-01-16.jsonl                              │    │
│  │                                                     │    │
│  │  • config.json (Agent configuration)               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  🚀 PORTABLE: Zip this folder → Transfer to customer        │
│              Agent carries its entire history + embeddings  │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket / HTTPS
                              │
┌─────────────────────────────┼───────────────────────────────┐
│  AI Maestro Dashboard (Any Instance)                         │
│                             │                               │
│  ┌──────────────────────────▼──────────────────────────┐   │
│  │ Search Interface                                     │   │
│  │ GET /api/agents/:id/search?q="authentication"      │   │
│  │                                                      │   │
│  │ • Queries agent's local SQLite database             │   │
│  │ • No central database - fully distributed            │   │
│  │ • Agent works with ANY AI Maestro instance           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Why Per-Agent Databases?

**Use Case: Agent as Deliverable**
```
Scenario: Your customer hires an AI agent for 6 months
1. Agent works on customer's project
2. Builds up conversation history (100MB JSONL)
3. Database indexes all conversations + embeddings
4. Customer engagement ends
5. Zip agent directory → Transfer to customer
6. Customer can:
   - Continue using the agent on their own AI Maestro
   - Search entire conversation history semantically
   - No vendor lock-in - agent is fully independent
```

**Benefits:**
- **Portability**: Agent is a self-contained unit (data + config)
- **Privacy**: No central database - each agent owns its data
- **Scalability**: No bottleneck - each agent processes independently
- **Resilience**: If one agent's DB corrupts, others unaffected
- **Transfer**: Easy to move agents between AI Maestro instances

## Architecture Overview

## Database Schema

### Core Tables

```sql
-- Store all conversation messages
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user' | 'assistant'
  content TEXT NOT NULL,
  tool_use TEXT,  -- JSON of tool invocations
  tool_result TEXT,  -- JSON of tool results
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  jsonl_file TEXT NOT NULL,  -- Path to original JSONL
  jsonl_line INTEGER NOT NULL,  -- Line number for direct access
  UNIQUE(jsonl_file, jsonl_line)
);

-- Vector embeddings for semantic search (sqlite-vss)
CREATE VIRTUAL TABLE conversation_embeddings USING vss0(
  embedding(1536)  -- OpenAI text-embedding-3-small dimension
);

-- Link conversations to their embeddings
CREATE TABLE conversation_vectors (
  conversation_id INTEGER PRIMARY KEY,
  embedding_id INTEGER NOT NULL,
  embedding_hash TEXT,  -- SHA-256 of content (detect duplicates)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (embedding_id) REFERENCES conversation_embeddings(rowid) ON DELETE CASCADE
);

-- Full-text search index (for keyword searches)
CREATE VIRTUAL TABLE conversations_fts USING fts5(
  content,
  tool_use,
  content='conversations',
  content_rowid='id'
);

-- Indexes for fast lookups
CREATE INDEX idx_conv_session_time ON conversations(session_id, timestamp DESC);
CREATE INDEX idx_conv_role ON conversations(role);
CREATE INDEX idx_conv_timestamp ON conversations(timestamp DESC);
CREATE INDEX idx_vectors_hash ON conversation_vectors(embedding_hash);
```

## Implementation

### 1. Conversation Indexer

```javascript
import Database from 'better-sqlite3'
import { vss } from 'sqlite-vss'
import fs from 'fs'
import crypto from 'crypto'

class ConversationIndexer {
  constructor(agentId, claudeProjectDir) {
    this.agentId = agentId
    this.claudeProjectDir = claudeProjectDir

    // CRITICAL: Database lives INSIDE agent directory for portability
    // NOT in ~/.ai-maestro/ - agent owns its data!
    const dbPath = path.join(claudeProjectDir, 'agent.db')
    this.db = new Database(dbPath)
    this.db.loadExtension(vss)
    this.initSchema()
  }

  initSchema() {
    // Create tables (schema above)
    this.db.exec(`/* Schema from above */`)
  }

  async indexJSONL(jsonlPath) {
    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)
    const batch = []

    for (let i = 0; i < lines.length; i++) {
      try {
        const msg = JSON.parse(lines[i])

        // Extract content
        const content = this.extractContent(msg)
        if (!content) continue

        // Check if already indexed
        const existing = this.db.prepare(`
          SELECT id FROM conversations
          WHERE jsonl_file = ? AND jsonl_line = ?
        `).get(jsonlPath, i)

        if (existing) continue  // Skip if already indexed

        // Store message
        const msgId = this.db.prepare(`
          INSERT INTO conversations (
            session_id, timestamp, role, content, tool_use, tool_result,
            tokens_input, tokens_output, tokens_cached, cost,
            jsonl_file, jsonl_line
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          jsonlPath,
          i
        ).lastInsertRowid

        // Add to batch for embedding generation
        batch.push({ id: msgId, content })

        // Process batch every 100 messages (rate limiting)
        if (batch.length >= 100) {
          await this.generateEmbeddings(batch)
          batch.length = 0
        }
      } catch (error) {
        console.error(`Error indexing line ${i}:`, error)
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await this.generateEmbeddings(batch)
    }
  }

  extractContent(msg) {
    if (!msg.message?.content) return null

    // Handle different content types
    if (typeof msg.message.content === 'string') {
      return msg.message.content
    }

    if (Array.isArray(msg.message.content)) {
      return msg.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
    }

    return null
  }

  async generateEmbeddings(batch) {
    // Generate embeddings via OpenAI API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch.map(item => item.content)
      })
    })

    const result = await response.json()

    // Store embeddings
    const stmt = this.db.prepare(`
      INSERT INTO conversation_embeddings (embedding) VALUES (?)
    `)

    const linkStmt = this.db.prepare(`
      INSERT INTO conversation_vectors (conversation_id, embedding_id, embedding_hash)
      VALUES (?, ?, ?)
    `)

    result.data.forEach((embeddingData, index) => {
      const { id: conversationId, content } = batch[index]
      const embedding = embeddingData.embedding

      // Store embedding
      const embeddingId = stmt.run(JSON.stringify(embedding)).lastInsertRowid

      // Create hash for deduplication
      const hash = crypto.createHash('sha256').update(content).digest('hex')

      // Link to conversation
      linkStmt.run(conversationId, embeddingId, hash)
    })
  }

  calculateCost(usage) {
    if (!usage) return 0

    // Claude Sonnet 4.5 pricing
    const inputCost = (usage.input_tokens / 1_000_000) * 3.00
    const outputCost = (usage.output_tokens / 1_000_000) * 15.00
    const cachedCost = (usage.cache_read_input_tokens / 1_000_000) * 0.30

    return inputCost + outputCost + cachedCost
  }
}
```

### 2. Semantic Search

```javascript
class ConversationSearch {
  constructor(agentId, claudeProjectDir) {
    // Database lives inside agent directory
    const dbPath = path.join(claudeProjectDir, 'agent.db')
    this.db = new Database(dbPath)
    this.db.loadExtension(vss)
  }

  async semanticSearch(query, options = {}) {
    const {
      limit = 10,
      minRelevance = 0.7,
      sessionId = null,
      startDate = null,
      endDate = null,
      role = null
    } = options

    // Generate embedding for query
    const queryEmbedding = await this.getEmbedding(query)

    // Build SQL query
    let sql = `
      SELECT
        c.id,
        c.session_id,
        c.timestamp,
        c.role,
        c.content,
        c.tool_use,
        c.jsonl_file,
        c.jsonl_line,
        c.tokens_input,
        c.tokens_output,
        c.cost,
        (1 - v.distance) as relevance_score
      FROM conversation_embeddings e
      JOIN conversation_vectors v ON e.rowid = v.embedding_id
      JOIN conversations c ON v.conversation_id = c.id
      WHERE vss_search(e.embedding, ?)
    `

    const params = [JSON.stringify(queryEmbedding)]

    if (sessionId) {
      sql += ` AND c.session_id = ?`
      params.push(sessionId)
    }

    if (startDate) {
      sql += ` AND c.timestamp >= ?`
      params.push(startDate)
    }

    if (endDate) {
      sql += ` AND c.timestamp <= ?`
      params.push(endDate)
    }

    if (role) {
      sql += ` AND c.role = ?`
      params.push(role)
    }

    sql += ` ORDER BY v.distance ASC LIMIT ?`
    params.push(limit)

    const results = this.db.prepare(sql).all(...params)

    // Filter by minimum relevance
    return results.filter(r => r.relevance_score >= minRelevance)
  }

  keywordSearch(query, options = {}) {
    const { limit = 10, sessionId = null } = options

    let sql = `
      SELECT
        c.id,
        c.session_id,
        c.timestamp,
        c.role,
        c.content,
        c.jsonl_file,
        c.jsonl_line,
        bm25(conversations_fts) as relevance_score
      FROM conversations_fts
      JOIN conversations c ON conversations_fts.rowid = c.id
      WHERE conversations_fts MATCH ?
    `

    const params = [query]

    if (sessionId) {
      sql += ` AND c.session_id = ?`
      params.push(sessionId)
    }

    sql += ` ORDER BY relevance_score DESC LIMIT ?`
    params.push(limit)

    return this.db.prepare(sql).all(...params)
  }

  async getEmbedding(text) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    })

    const result = await response.json()
    return result.data[0].embedding
  }
}
```

### 3. API Endpoint

```typescript
// app/api/agents/[id]/search/route.ts
import { NextResponse } from 'next/server'
import { ConversationSearch } from '@/lib/conversation-search'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const { searchParams } = new URL(request.url)

  const query = searchParams.get('q')
  const type = searchParams.get('type') || 'semantic'  // 'semantic' | 'keyword'
  const limit = parseInt(searchParams.get('limit') || '10')
  const sessionId = searchParams.get('session_id')
  const role = searchParams.get('role')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!query) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 })
  }

  try {
    const searcher = new ConversationSearch(agentId)

    const results = type === 'semantic'
      ? await searcher.semanticSearch(query, { limit, sessionId, role, startDate, endDate })
      : searcher.keywordSearch(query, { limit, sessionId })

    return NextResponse.json({
      query,
      type,
      results,
      count: results.length
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
```

## Cost Analysis

### Scenario: 100MB JSONL History (6 months of conversations)

**Without Vector Search:**
```
Per search:
- Read 100MB JSONL = ~25M tokens
- Claude context limit: 200K tokens
- Must chunk: 25M / 200K = 125 chunks
- Cost per search: $1.50 (input) + $0.50 (output) = $2.00
- 100 searches/month: $200
```

**With Vector Search:**
```
Initial setup (one-time):
- Generate embeddings: 25M tokens × $0.00002 = $0.50

Per search:
- Query embedding: 1 token × $0.00002 = $0.00002
- Vector search: <500ms (free, local SQLite)
- Return 10 relevant messages = ~2K tokens
- Claude cost: $0.006 (input) + $0.003 (output) = $0.009
- 100 searches/month: $0.90

Total month 1: $0.50 + $0.90 = $1.40
Total month 2+: $0.90

Savings: $200 - $0.90 = $199.10/month (99.55%)
```

## Key Benefits

1. **99.5%+ Cost Reduction** - From $200/month to $0.90/month
2. **Instant Search** - <500ms vs minutes of JSONL parsing
3. **Better Results** - Semantic understanding vs keyword matching
4. **Offline Capable** - Search works without internet (after initial indexing)
5. **Scalable** - 1GB+ of conversation history, no problem
6. **Privacy** - Data never leaves agent (except for OpenAI embedding generation)
7. **Portable** - Agent is a self-contained deliverable unit

## Agent Transfer Workflow

### Exporting an Agent

```bash
# 1. Agent directory structure
~/.claude/projects/backend-architect/
├── agent.db              # SQLite database (conversations + embeddings)
├── conversations/        # JSONL history files
│   ├── 2025-01-15.jsonl
│   ├── 2025-01-16.jsonl
│   └── 2025-01-17.jsonl
├── config.json          # Agent configuration
└── .env                 # API keys (optional - customer provides their own)

# 2. Package agent for transfer
cd ~/.claude/projects
tar -czf backend-architect-2025-01-17.tar.gz backend-architect/

# 3. Transfer to customer
# - Email/file transfer (if small)
# - S3 presigned URL (if large)
# - USB drive (for air-gapped environments)
```

### Importing an Agent

```bash
# Customer's AI Maestro instance

# 1. Extract agent
cd ~/.claude/projects
tar -xzf backend-architect-2025-01-17.tar.gz

# 2. Agent auto-discovered by AI Maestro dashboard
# - Scans ~/.claude/projects/**/agent.db
# - Detects agent.db → recognizes as portable agent
# - Loads conversation history from database
# - Full search capability immediately available

# 3. Agent continues working
# - Customer can chat with agent (new conversations)
# - All history searchable semantically
# - No reconfiguration needed
```

### What Travels with the Agent

**Included:**
- ✅ Complete conversation history (JSONL + SQLite index)
- ✅ All vector embeddings (no regeneration needed)
- ✅ Performance metrics (tokens, costs, session stats)
- ✅ Agent configuration (tmux settings, working directory)

**Excluded (Customer provides):**
- ❌ API keys (Anthropic, OpenAI) - customer uses their own
- ❌ SSH keys - customer's infrastructure
- ❌ Local file paths - agent adapts to new environment

### Migration Between AI Maestro Instances

```typescript
// API endpoint to detect portable agents
// app/api/agents/discover/route.ts

export async function GET() {
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  const agentDirs = fs.readdirSync(claudeProjectsDir)

  const portableAgents = []

  for (const dir of agentDirs) {
    const dbPath = path.join(claudeProjectsDir, dir, 'agent.db')

    // Detect agent by presence of agent.db
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath)

      // Read agent metadata from database
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_conversations,
          SUM(tokens_input + tokens_output) as total_tokens,
          SUM(cost) as total_cost,
          MIN(timestamp) as first_conversation,
          MAX(timestamp) as last_conversation
        FROM conversations
      `).get()

      portableAgents.push({
        id: dir,
        dbPath,
        ...stats,
        portable: true,
        status: 'ready'
      })

      db.close()
    }
  }

  return NextResponse.json({ agents: portableAgents })
}
```

## Next Steps

See [BACKLOG-DISTRIBUTED-AGENTS.md](./BACKLOG-DISTRIBUTED-AGENTS.md) Epic 11 for implementation phases.
