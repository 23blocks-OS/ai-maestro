# AI Maestro Database Architecture: Dual Approach
## SQLite Relational + Vector + Graph

**Author:** AI Maestro Development Team
**Date:** 2025-11-03
**Status:** Architecture Design
**Epic:** Epic 11 (Agent Intelligence Layer)

---

## Table of Contents

1. [Overview](#overview)
2. [The Dual Database Approach](#the-dual-database-approach)
3. [Option 1: SQLite + Vector (sqlite-vss)](#option-1-sqlite--vector-sqlite-vss)
4. [Option 2: SQLite + Vector + Graph](#option-2-sqlite--vector--graph)
5. [Graph Database Options](#graph-database-options)
6. [Knowledge Graph Design](#knowledge-graph-design)
7. [Comparison & Recommendation](#comparison--recommendation)
8. [Implementation Strategy](#implementation-strategy)

---

## Executive Summary

**Decision**: Use **CozoDB** for AI Maestro agent databases

**Why**: CozoDB is a real graph database (Datalog queries) that's embedded like SQLite, with built-in vector search and full-text search. It solves all three needs (conversations, vectors, graph) in a single dependency.

**Key Benefits**:
- ✅ Real graph database (not SQL emulation with joins/CTEs)
- ✅ Embedded (perfect for agent portability)
- ✅ Vector search built-in (no separate sqlite-vss extension)
- ✅ More mature than sqlite-graph (3 years vs brand new alpha)
- ✅ Rich language support (Node.js, Python, Go, Rust, Swift)
- ✅ Single database instead of two (agent.db for everything)

**Risk Mitigation**: Pre-1.0 (v0.7) but we can lock to specific version, abstract behind our API, and migrate later if needed.

---

## Overview

As the agent works, it builds **two types of intelligence**:

### 1. **Conversational Intelligence** (What was discussed)
- Message history
- Token usage
- Semantic search (vector embeddings)
- **Storage**: Relational tables + vector search

### 2. **Knowledge Graph** (What the agent knows)
- Entities (files, functions, concepts, people)
- Relationships (imports, calls, references, depends-on)
- Context (why decisions were made)
- **Storage**: Graph database

### The Vision

```
Agent Intelligence = Conversations + Knowledge Graph

User: "Why did we change the authentication system?"

Search Strategy:
1. Vector search conversations → Find relevant discussions
2. Graph query → Trace authentication.ts relationships
3. Combine → "On Oct 15, we discussed switching from JWT to OAuth2
              because user.ts needed social login support"
```

---

## The Dual Database Approach

### Architecture Overview

```
~/.aimaestro/agents/{agent-id}/
├── config.json                 # Agent metadata
├── agent.db                    # PRIMARY DATABASE
│   ├── conversations           # Message history (relational)
│   ├── embeddings              # Vector search (sqlite-vss)
│   ├── metrics                 # Performance stats (relational)
│   └── sessions                # Session metadata (relational)
│
└── knowledge.db                # KNOWLEDGE GRAPH (Option 2 only)
    ├── entities                # Nodes (files, functions, concepts)
    ├── relationships           # Edges (imports, calls, references)
    ├── entity_embeddings       # Vector search for entities
    └── graph_analytics         # Centrality, clustering
```

### Why Two Databases?

**Separation of Concerns:**
- `agent.db`: **Linear, temporal data** (conversations over time)
- `knowledge.db`: **Graph, relational data** (interconnected knowledge)

**Benefits:**
1. **Performance**: Graph queries don't slow down conversation search
2. **Portability**: Can export knowledge graph separately
3. **Evolution**: Can upgrade graph schema without touching conversations
4. **Clarity**: Clear separation between "what was said" vs "what is known"

**Alternative (Single Database)**:
- Store graph as relational tables in `agent.db`
- Simpler deployment
- Slightly slower complex graph queries

---

## Option 1: SQLite + Vector (sqlite-vss)

**What We Already Designed**: Conversation indexing with semantic search.

### Database: agent.db

```sql
-- Conversations (relational)
CREATE TABLE conversations (...);

-- Vector search (sqlite-vss)
CREATE VIRTUAL TABLE conversation_embeddings USING vss0(
  embedding(1536)
);

-- Full-text search
CREATE VIRTUAL TABLE conversations_fts USING fts5(...);

-- Metrics & sessions
CREATE TABLE metrics (...);
CREATE TABLE sessions (...);
```

### Capabilities

✅ **What it does well:**
- Semantic search across conversations
- Fast keyword search (FTS5)
- Metrics and analytics
- Message history

❌ **What it lacks:**
- No entity extraction (files, functions, concepts)
- No relationship tracking (imports, calls, depends-on)
- No graph traversal (find all dependencies of X)
- No centrality measures (what's most important?)

### Use Cases

**Good for:**
- "What did we discuss about authentication?" (semantic search)
- "Show me all messages with TODO" (keyword search)
- "How many tokens did we use last week?" (metrics)

**Limited for:**
- "What files depend on user.ts?" (no graph)
- "What's the most important file in this project?" (no centrality)
- "How are auth and database connected?" (no relationships)

---

## Option 2: SQLite + Vector + Graph

**Enhanced Approach**: Add knowledge graph to capture entity relationships.

### Database 1: agent.db (Same as Option 1)

Stores conversations, embeddings, metrics.

### Database 2: knowledge.db (NEW!)

```sql
-- === ENTITIES (Nodes) ===

CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT UNIQUE NOT NULL,    -- Stable identifier (e.g., "file:src/auth.ts")
  type TEXT NOT NULL,                 -- 'file' | 'function' | 'class' | 'concept' | 'person'
  name TEXT NOT NULL,                 -- Display name
  properties TEXT,                    -- JSON metadata
  first_seen TEXT NOT NULL,           -- When agent first encountered
  last_seen TEXT NOT NULL,            -- Most recent mention
  mention_count INTEGER DEFAULT 0,    -- How often discussed
  importance_score REAL DEFAULT 0.0,  -- Calculated centrality
  embedding_id INTEGER,               -- Link to vector search
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_entity_type ON entities(type);
CREATE INDEX idx_entity_name ON entities(name);
CREATE INDEX idx_entity_importance ON entities(importance_score DESC);

-- === RELATIONSHIPS (Edges) ===

CREATE TABLE relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,         -- Entity ID (source)
  target_id INTEGER NOT NULL,         -- Entity ID (target)
  relationship_type TEXT NOT NULL,    -- 'imports' | 'calls' | 'references' | 'depends_on'
  strength REAL DEFAULT 1.0,          -- Relationship weight (0.0-1.0)
  properties TEXT,                    -- JSON metadata
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  mention_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE(source_id, target_id, relationship_type)
);

CREATE INDEX idx_rel_source ON relationships(source_id);
CREATE INDEX idx_rel_target ON relationships(target_id);
CREATE INDEX idx_rel_type ON relationships(relationship_type);
CREATE INDEX idx_rel_strength ON relationships(strength DESC);

-- === ENTITY MENTIONS (Link to conversations) ===

CREATE TABLE entity_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,   -- Link to conversations table in agent.db
  context TEXT,                       -- Surrounding text
  sentiment TEXT,                     -- 'positive' | 'negative' | 'neutral'
  timestamp TEXT NOT NULL,

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX idx_mention_entity ON entity_mentions(entity_id);
CREATE INDEX idx_mention_conversation ON entity_mentions(conversation_id);
CREATE INDEX idx_mention_time ON entity_mentions(timestamp DESC);

-- === ENTITY EMBEDDINGS (Vector search for entities) ===

CREATE VIRTUAL TABLE entity_embeddings USING vss0(
  embedding(1536)
);

CREATE TABLE entity_vectors (
  entity_id INTEGER PRIMARY KEY,
  embedding_id INTEGER NOT NULL,
  embedding_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (embedding_id) REFERENCES entity_embeddings(rowid) ON DELETE CASCADE
);

-- === GRAPH ANALYTICS (Pre-computed metrics) ===

CREATE TABLE graph_metrics (
  entity_id INTEGER PRIMARY KEY,
  degree_centrality REAL DEFAULT 0.0,      -- How many connections
  betweenness_centrality REAL DEFAULT 0.0, -- How often on shortest paths
  closeness_centrality REAL DEFAULT 0.0,   -- Average distance to others
  pagerank REAL DEFAULT 0.0,               -- Importance (Google-style)
  clustering_coefficient REAL DEFAULT 0.0, -- How clustered neighbors are
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

### Capabilities

✅ **Everything from Option 1**, PLUS:

✅ **Entity Extraction**:
- Automatically identify files, functions, classes mentioned
- Track concepts discussed (authentication, caching, deployment)
- Recognize people (team members, customers)

✅ **Relationship Tracking**:
- `auth.ts` imports `database.ts`
- `loginUser()` calls `validateToken()`
- Authentication concept references OAuth2 standard

✅ **Graph Traversal**:
- "Find all files that depend on user.ts" (recursive query)
- "What's the impact of changing database.ts?" (downstream analysis)
- "How are auth and payment systems connected?" (path finding)

✅ **Knowledge Discovery**:
- Centrality: "What's the most important file?" (PageRank)
- Clustering: "Which files work together?" (community detection)
- Impact: "What will break if I change this?" (dependency analysis)

### Use Cases

**Conversation Queries** (same as Option 1):
- "What did we discuss about authentication?"
- "Show me all messages with TODO"

**Knowledge Queries** (NEW!):
- "What files depend on user.ts?"
- "What's the most important file in this project?"
- "How are auth and database connected?"
- "What functions call validateToken()?"
- "What concepts are related to security?"

**Hybrid Queries** (POWERFUL!):
- "Why did we change authentication?"
  → Vector search conversations + Graph trace auth.ts relationships
- "What should I know before modifying database.ts?"
  → Graph find dependencies + Search relevant discussions
- "Show me the history of decisions about caching"
  → Search conversations mentioning caching + Graph of cache-related files

---

## Graph Database Options

**IMPORTANT**: We want REAL graph databases with native graph query languages (Cypher, Datalog), not relational database emulations using SQL joins and recursive CTEs.

### Option A: sqlite-graph (Cypher + SQLite) ⭐

**GitHub**: https://github.com/agentflare-ai/sqlite-graph
**Status**: Alpha (v0.1.0), production v1.0.0 planned for 2027
**Language**: C++ (SQLite extension)
**Query Language**: openCypher (native graph queries)

**Pros:**
- ✅ Native Cypher query support (REAL graph database)
- ✅ SQLite extension (single .so file)
- ✅ High performance (300K+ nodes/sec)
- ✅ 100% openCypher CREATE compliance
- ✅ Python bindings
- ✅ Embedded (no server required)

**Cons:**
- ❌ Alpha release (API may change before v1.0)
- ❌ Limited adoption (new project, 2024)
- ❌ Advanced features planned for v0.2.0
- ❌ Production v1.0.0 not until 2027

**Example Usage:**

```python
import sqlite3
import sqlite_graph

conn = sqlite3.connect('knowledge.db')
conn.enable_load_extension(True)
conn.load_extension('libsqlite_graph.so')

# Create entities with Cypher
conn.execute("""
  SELECT cypher_execute('
    CREATE (f:File {path: "src/auth.ts", lines: 250})
  ')
""")

# Create relationships
conn.execute("""
  SELECT cypher_execute('
    MATCH (a:File {path: "src/auth.ts"})
    MATCH (b:File {path: "src/database.ts"})
    CREATE (a)-[:IMPORTS {count: 5}]->(b)
  ')
""")

# Query graph
result = conn.execute("""
  SELECT cypher_execute('
    MATCH (f:File)-[:IMPORTS*1..3]->(dep)
    WHERE f.path = "src/auth.ts"
    RETURN dep.path, COUNT(*) as depth
  ')
""").fetchall()
```

### Option B: CozoDB (Datalog + SQLite-like) ⭐⭐

**GitHub**: https://github.com/cozodb/cozo
**Status**: v0.7 (pre-1.0), actively developed since 2022
**Language**: Rust (native), with extensive bindings
**Query Language**: Datalog (native graph queries) + relational

**Pros:**
- ✅ Native Datalog query support (REAL graph database)
- ✅ Embedded like SQLite (no server)
- ✅ Multiple storage backends (SQLite, RocksDB, in-memory)
- ✅ Vector search (HNSW), full-text search built-in
- ✅ Extensive language support (Python, Node.js, Go, Java, Rust, Swift, Android, WASM)
- ✅ Transactional, time-travel queries
- ✅ More mature than sqlite-graph (3+ years development)
- ✅ Rich ecosystem (HTTP server option)

**Cons:**
- ❌ Pre-1.0 (v0.7) - API/storage not guaranteed stable until v1.0
- ❌ Datalog learning curve (different from Cypher)
- ❌ Young project (though more mature than sqlite-graph)

**Example Usage:**

```javascript
// Node.js example
const { CozoDb } = require('cozo-node')

// Embedded database in agent directory
const db = new CozoDb('~/.aimaestro/agents/agent-1/knowledge.db')

// Create entities (Datalog)
db.run(`
  ?[path, type, lines] <- [
    ['src/auth.ts', 'file', 250],
    ['src/database.ts', 'file', 180]
  ]
  :put files {path, type, lines}
`)

// Create relationships
db.run(`
  ?[from, to, rel_type] <- [
    ['src/auth.ts', 'src/database.ts', 'imports']
  ]
  :put relationships {from, to, rel_type}
`)

// Query dependencies (graph traversal)
const result = db.run(`
  dep[path, depth] := *files{path: 'src/auth.ts'}, depth = 0
  dep[to_path, new_depth] := dep[from_path, depth],
                              *relationships{from: from_path, to: to_path},
                              new_depth = depth + 1,
                              new_depth <= 3
  ?[path, depth] := dep[path, depth]
  :order depth
`)
```

### Option C: LevelGraph (Triples + LevelDB)

**GitHub**: https://github.com/levelgraph/levelgraph
**Status**: Stable, maintained (Node.js 18+)
**Language**: JavaScript (Node.js)
**Query Language**: Triple pattern matching

**Pros:**
- ✅ Embedded (LevelDB-based)
- ✅ Works in Node.js and browsers
- ✅ Simple triple store (subject-predicate-object)
- ✅ Mature project (since 2013)
- ✅ JSON-LD and N3/Turtle support

**Cons:**
- ❌ No Cypher or Datalog (basic pattern matching only)
- ❌ Limited graph algorithms
- ❌ JavaScript only
- ❌ Less powerful than Cypher/Datalog

### Option D: Memgraph (openCypher + In-Memory) 🚀

**GitHub**: https://github.com/memgraph/memgraph
**Status**: Production-ready (v1.0+), enterprise-backed
**Language**: C/C++
**Query Language**: openCypher (Neo4j-compatible)

**Pros:**
- ✅ Production-ready, stable
- ✅ openCypher (same as Neo4j)
- ✅ High performance (in-memory)
- ✅ ACID transactions
- ✅ Used in production by major companies

**Cons:**
- ❌ Not truly embedded (requires server process)
- ❌ In-memory first (larger memory footprint)
- ❌ More complex deployment than SQLite-style
- ❌ Not file-based like SQLite

### Option E: NebulaGraph (openCypher + Distributed)

**GitHub**: https://github.com/vesoft-inc/nebula
**Status**: Production-ready, enterprise-backed
**Language**: C++
**Query Language**: nGQL (openCypher-based)

**Pros:**
- ✅ Production-ready (used by Snapchat, Binance)
- ✅ openCypher-based
- ✅ Mature, stable
- ✅ High performance

**Cons:**
- ❌ Not embedded (distributed architecture)
- ❌ Requires cluster setup
- ❌ Overkill for single-agent use case
- ❌ Complex deployment

### Option F: Pure SQLite Relational (⚠️ NOT A GRAPH DATABASE)

**Approach**: Store graph as relational tables (entities + relationships).

**IMPORTANT**: This is NOT a real graph database - it's a relational database emulating graphs using SQL joins and recursive CTEs.

**Pros:**
- ✅ No external dependencies
- ✅ Fully portable (works anywhere SQLite works)
- ✅ Stable (no alpha software)
- ✅ Simple queries for basic operations

**Cons:**
- ❌ No Cypher/Datalog (must write complex recursive SQL)
- ❌ Not a real graph database (just tables with foreign keys)
- ❌ Slower for deep graph traversal
- ❌ More code to maintain
- ❌ Misses the point of graph databases

**Example Usage:**

```sql
-- Create entity
INSERT INTO entities (entity_id, type, name, properties)
VALUES ('file:src/auth.ts', 'file', 'auth.ts', '{"lines": 250}');

-- Create relationship
INSERT INTO relationships (source_id, target_id, relationship_type, strength)
SELECT
  (SELECT id FROM entities WHERE entity_id = 'file:src/auth.ts'),
  (SELECT id FROM entities WHERE entity_id = 'file:src/database.ts'),
  'imports',
  1.0;

-- Query dependencies (recursive CTE)
WITH RECURSIVE deps AS (
  SELECT target_id, 1 as depth
  FROM relationships
  WHERE source_id = (SELECT id FROM entities WHERE entity_id = 'file:src/auth.ts')

  UNION ALL

  SELECT r.target_id, d.depth + 1
  FROM relationships r
  JOIN deps d ON r.source_id = d.target_id
  WHERE d.depth < 3
)
SELECT DISTINCT e.name, e.type, MIN(d.depth) as min_depth
FROM deps d
JOIN entities e ON d.target_id = e.id
GROUP BY e.id
ORDER BY min_depth;
```

### Graph Database Selection Criteria

For AI Maestro agents, we need:

**Must-Have:**
- ✅ Embedded (file-based, no server)
- ✅ Portable (agents transfer to customers)
- ✅ Native graph queries (Cypher or Datalog)
- ✅ Node.js/Python support

**Nice-to-Have:**
- ✅ Vector search built-in
- ✅ Production-ready (v1.0+)
- ✅ Active development

**Comparison:**

| Feature | sqlite-graph | CozoDB | LevelGraph | Memgraph | Pure SQL |
|---------|-------------|---------|------------|----------|----------|
| **Embedded** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No (server) | ✅ Yes |
| **Query Language** | Cypher | Datalog | Triples | Cypher | SQL |
| **Production Ready** | ❌ Alpha | ⚠️ Pre-1.0 | ✅ Yes | ✅ Yes | ✅ Yes |
| **Vector Search** | ❌ No | ✅ Built-in | ❌ No | ❌ No | ⚠️ Extension |
| **Node.js Support** | ⚠️ Limited | ✅ Native | ✅ Native | ✅ Driver | ✅ Native |
| **Real Graph DB** | ✅ Yes | ✅ Yes | ⚠️ Basic | ✅ Yes | ❌ No |
| **Maturity** | New (2024) | 3 years | 10+ years | Production | N/A |

---

## Knowledge Graph Design

### Entity Types

```typescript
type EntityType =
  | 'file'          // Source files (auth.ts, database.ts)
  | 'function'      // Functions/methods (loginUser, validateToken)
  | 'class'         // Classes/types (User, AuthService)
  | 'concept'       // Abstract concepts (authentication, caching)
  | 'person'        // People (Juan, team member)
  | 'library'       // External dependencies (express, react)
  | 'endpoint'      // API routes (/api/login, /api/users)
  | 'database'      // DB tables/collections (users, sessions)
  | 'error'         // Common errors (AuthenticationError)
  | 'decision'      // Architectural decisions (use OAuth2)
```

### Relationship Types

```typescript
type RelationshipType =
  // Code relationships
  | 'imports'       // auth.ts imports database.ts
  | 'calls'         // loginUser() calls validateToken()
  | 'extends'       // AuthService extends BaseService
  | 'implements'    // UserController implements IController
  | 'uses'          // auth.ts uses jwt library

  // Conceptual relationships
  | 'references'    // Authentication references OAuth2 spec
  | 'depends_on'    // Login flow depends on database connection
  | 'related_to'    // Security related to authentication
  | 'caused_by'     // Bug caused by race condition
  | 'solved_by'     // Problem solved by caching

  // Temporal relationships
  | 'replaced_by'   // JWT authentication replaced by OAuth2
  | 'evolved_from'  // Current design evolved from original MVP

  // Social relationships
  | 'created_by'    // auth.ts created by Juan
  | 'maintained_by' // database.ts maintained by team
  | 'reviewed_by'   // PR reviewed by senior dev
```

### Entity Extraction Strategy

**From Conversations:**

```javascript
class EntityExtractor {
  async extractEntities(message) {
    // 1. Explicit mentions (file paths, function names)
    const explicitEntities = this.extractExplicitMentions(message.content)
    //    Example: "Let's modify src/auth.ts" → Entity(file:src/auth.ts)

    // 2. Tool use analysis (files read, written, edited)
    const toolEntities = this.extractFromToolUse(message.tool_use)
    //    Example: Read(src/database.ts) → Entity(file:src/database.ts)

    // 3. Concept extraction (LLM-based)
    const concepts = await this.extractConcepts(message.content)
    //    Example: "We need better authentication" → Entity(concept:authentication)

    // 4. Code analysis (AST parsing for imports, calls)
    const codeEntities = await this.analyzeCode(message.content)
    //    Example: "import db from './database'" → Relationship(imports)

    return { explicitEntities, toolEntities, concepts, codeEntities }
  }

  extractExplicitMentions(content) {
    const patterns = [
      /[\w-]+\.(?:ts|js|py|tsx|jsx)/g,           // Files
      /function\s+(\w+)/g,                        // Functions
      /class\s+(\w+)/g,                           // Classes
      /\/api\/[\w/-]+/g,                          // API routes
    ]
    // ... regex matching
  }

  async extractConcepts(content) {
    // Use LLM to identify discussed concepts
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{
        role: 'system',
        content: 'Extract key technical concepts discussed (e.g., authentication, caching, deployment). Return JSON array.'
      }, {
        role: 'user',
        content: content
      }],
      response_format: { type: 'json_object' }
    })

    return JSON.parse(response.choices[0].message.content).concepts
  }
}
```

### Relationship Extraction Strategy

```javascript
class RelationshipExtractor {
  async extractRelationships(message, entities) {
    // 1. Code-based relationships (imports, calls)
    const codeRelationships = await this.analyzeCodeRelationships(message.content)

    // 2. Conceptual relationships (LLM-based)
    const conceptualRelationships = await this.extractConceptualRelationships(
      message.content,
      entities
    )

    // 3. Temporal relationships (changes over time)
    const temporalRelationships = this.detectChanges(message, entities)

    // 4. Causal relationships (X caused Y)
    const causalRelationships = this.detectCausality(message.content)

    return [
      ...codeRelationships,
      ...conceptualRelationships,
      ...temporalRelationships,
      ...causalRelationships
    ]
  }

  async analyzeCodeRelationships(content) {
    // Parse code snippets in message
    const codeBlocks = this.extractCodeBlocks(content)
    const relationships = []

    for (const block of codeBlocks) {
      // Use AST parser (TypeScript, Python, etc.)
      const ast = this.parseCode(block.code, block.language)

      // Extract imports
      for (const imp of ast.imports) {
        relationships.push({
          source: block.currentFile,
          target: imp.module,
          type: 'imports',
          strength: 1.0
        })
      }

      // Extract function calls
      for (const call of ast.calls) {
        relationships.push({
          source: ast.currentFunction,
          target: call.functionName,
          type: 'calls',
          strength: 1.0
        })
      }
    }

    return relationships
  }
}
```

---

## Comparison & Recommendation

### Feature Comparison

| Feature | Option 1 (Vector Only) | Option 2 (Vector + Graph) |
|---------|----------------------|--------------------------|
| **Semantic conversation search** | ✅ Excellent | ✅ Excellent |
| **Keyword search** | ✅ Fast (FTS5) | ✅ Fast (FTS5) |
| **Metrics & analytics** | ✅ Complete | ✅ Complete |
| **Entity extraction** | ❌ No | ✅ Automatic |
| **Relationship tracking** | ❌ No | ✅ Full graph |
| **Dependency analysis** | ❌ No | ✅ Yes (graph traversal) |
| **Impact assessment** | ❌ No | ✅ Yes (centrality) |
| **Knowledge discovery** | ❌ No | ✅ Yes (PageRank, clustering) |
| **Hybrid queries** | ❌ No | ✅ Yes (conversation + graph) |
| **Storage overhead** | ~50MB | ~75MB (+50% for graph) |
| **Query complexity** | Simple SQL | SQL + recursive CTEs or Cypher |
| **Maintenance** | Low | Medium |
| **Portability** | Excellent | Good (2 databases) |

### Complexity Comparison

| Task | Option 1 | Option 2 |
|------|----------|----------|
| **Setup** | Simple (1 DB) | Medium (2 DBs) |
| **Indexing conversations** | Medium | Medium (same) |
| **Entity extraction** | N/A | Medium (LLM + regex) |
| **Relationship extraction** | N/A | Complex (AST + LLM) |
| **Graph analytics** | N/A | Medium (pre-compute) |
| **Search API** | Simple | Medium (2 data sources) |

### Cost Comparison (100MB conversation history)

| Item | Option 1 | Option 2 |
|------|----------|----------|
| **Initial embedding (conversations)** | $0.50 | $0.50 |
| **Entity embedding (graph)** | $0 | ~$0.10 (2K entities) |
| **Entity extraction (LLM)** | $0 | ~$5 (one-time, 5K messages) |
| **Monthly search** | $0.90 | $0.90 (same) |
| **Total Month 1** | $1.40 | $6.50 |
| **Total Month 2+** | $0.90 | $0.90 |

**Graph cost**: One-time $5 investment, then free!

### Recommendation: **CozoDB (Option B)** ⭐⭐⭐

**Why CozoDB is the best choice for AI Maestro:**

#### 1. **Best Balance of Features**
- ✅ Real graph database (Datalog queries, not SQL emulation)
- ✅ Embedded like SQLite (perfect for agent autonomy)
- ✅ Vector search built-in (consolidate both needs in one DB!)
- ✅ More mature than sqlite-graph (3 years vs brand new)
- ✅ Rich language support (Node.js, Python, Go, Rust)

#### 2. **Solves Both Problems at Once**
```
Instead of:
  agent.db (SQLite + sqlite-vss) → Conversations + Vector
  + knowledge.db (sqlite-graph) → Graph

We can use:
  agent.db (CozoDB) → Conversations + Vector + Graph + Full-text

Single database, single dependency!
```

#### 3. **Pre-1.0 But Stable Enough**
- v0.7 with 3 years of development
- Used in production by early adopters
- Active development (not abandoned)
- Explicit commitment: "versions before 1.0 don't promise API stability"
  → We know what we're getting into
  → Can lock to specific version until v1.0

#### 4. **Datalog is Powerful**
```datalog
// Find all dependencies (any depth) - REAL GRAPH QUERY
dep[to_path, depth] := *files{path: 'src/auth.ts'},
                       depth = 0
dep[to_path, new_depth] := dep[from_path, depth],
                           *relationships{from: from_path, to: to_path},
                           new_depth = depth + 1

?[path, depth] := dep[path, depth]
:order depth
```

vs SQL recursive CTE (16 lines of complex joins) ❌

#### 5. **Risk Mitigation**
- Lock to v0.7 until v1.0 is released
- Abstract behind our own API (can swap implementation later)
- Export/import scripts ensure data portability
- Fallback: Can always export to SQLite if needed

### Alternative: **sqlite-graph (Option A)** if Cypher is Required

**When to choose sqlite-graph:**
- Team already knows Cypher (Neo4j experience)
- Cypher syntax is non-negotiable
- Willing to accept alpha status (v0.1.0)
- Production v1.0 timeline (2027) is acceptable

**Trade-offs:**
- ✅ Cypher is more popular than Datalog
- ❌ Less mature than CozoDB (brand new vs 3 years)
- ❌ No vector search (need separate sqlite-vss)
- ❌ Limited Node.js support

### Phased Approach

#### Phase 1 (Epic 11): Conversations + Vector
**Technology**: CozoDB embedded database
**Rationale:**
- ✅ Immediate value (conversation search)
- ✅ Proven vector search (HNSW built-in)
- ✅ Lower complexity (start with relational features)
- ✅ 99.85% cost savings vs current approach

**Deliverables:**
- Conversation indexing (using CozoDB relational features)
- Semantic search (using CozoDB vector search)
- Metrics dashboard

#### Phase 2 (Epic 14): Add Graph Layer
**Technology**: Same CozoDB database, enable graph features
**Rationale:**
- ✅ Build on proven foundation
- ✅ No new dependency (already using CozoDB!)
- ✅ Clear ROI (impact analysis, knowledge discovery)
- ✅ Datalog queries for graph traversal

**Deliverables:**
- Entity extraction
- Relationship tracking
- Graph analytics using Datalog

---

## Implementation Strategy

### Phase 1: Conversations + Vector (Epic 11)

**Already Designed**: See [CONVERSATION-SEARCH-ARCHITECTURE.md](./CONVERSATION-SEARCH-ARCHITECTURE.md)

**Database**: `agent.db`
- conversations (relational)
- conversation_embeddings (sqlite-vss)
- conversations_fts (FTS5)
- metrics, sessions

**Timeline**: 8 weeks (110 points)

### Phase 2: Add Knowledge Graph (Epic 14 - NEW!)

**Database**: Add `knowledge.db` or extend `agent.db`

#### Step 1: Entity Extraction (2 weeks)
- Design entity schema
- Implement EntityExtractor class
- Process historical conversations
- Test: Extract 2K entities from 100MB history

#### Step 2: Relationship Extraction (2 weeks)
- Design relationship schema
- Implement RelationshipExtractor class
- AST parsing for code relationships
- LLM-based concept relationships
- Test: Extract 5K relationships

#### Step 3: Graph Analytics (1 week)
- Implement centrality calculations
- Pre-compute PageRank, degree centrality
- Build graph metrics dashboard
- Test: "What's the most important file?"

#### Step 4: Hybrid Queries (1 week)
- Combine conversation + graph search
- API: `/api/agents/:id/search` (enhanced)
- UI: Graph visualization (D3.js)
- Test: "Why did we change auth? + Show dependencies"

#### Step 5: Real-Time Updates (1 week)
- Watch conversations for new entities
- Incremental entity extraction
- Relationship updates on file changes
- Graph metric recalculation

**Total Epic 14 Points**: 34 points (~7 weeks)

### Technology Decision Tree

```
Start: What does the agent need?

1. Only conversation search?
   → CozoDB (relational mode)
     Simple, proven, immediate value
     99.85% cost savings

2. Conversation search + future graph capabilities?
   → CozoDB (start relational, add graph later)
     Best of both worlds
     Single dependency
     Built-in vector search

3. Must have Cypher syntax (Neo4j compatibility)?
   → sqlite-graph
     openCypher compliance
     Risk: Alpha status (v0.1.0)
     No vector search (need sqlite-vss too)

4. Want production-grade graph DB with server?
   → Memgraph or NebulaGraph
     Enterprise-ready
     Not embedded (requires server)
     Overkill for single-agent use case

5. Want to avoid all graph databases?
   → Pure SQLite + recursive CTEs ❌
     NOT RECOMMENDED
     Misses the point of graph databases
     Complex SQL instead of graph queries
```

**Our Recommendation**: **CozoDB for All Phases** ⭐⭐⭐

**Why CozoDB wins:**
- ✅ One database for everything (relational + vector + graph)
- ✅ Embedded (perfect for agent autonomy)
- ✅ Real graph queries (Datalog, not SQL joins)
- ✅ More mature than sqlite-graph (3 years vs alpha)
- ✅ Vector search built-in (no separate extension)
- ✅ Pre-1.0 but stable enough (lock to v0.7)
- ✅ Can always migrate to sqlite-graph or Neo4j later if needed

---

## Next Steps

1. ✅ **Complete Epic 11** (Conversations + Vector) - Already designed
2. **Create Epic 14** (Knowledge Graph) - Add to backlog
3. **Prototype**: Build small graph with 100 entities
4. **Evaluate**: Test query performance, extraction accuracy
5. **Decide**: sqlite-graph vs Pure SQLite vs GraphRAG
6. **Implement**: Phased rollout (entity → relationships → analytics)

---

## References

- [CONVERSATION-SEARCH-ARCHITECTURE.md](./CONVERSATION-SEARCH-ARCHITECTURE.md) - Vector search design
- [DATA-MODEL-DESIGN.md](./DATA-MODEL-DESIGN.md) - Core data model
- [BACKLOG-DISTRIBUTED-AGENTS.md](./BACKLOG-DISTRIBUTED-AGENTS.md) - Implementation roadmap
- [sqlite-graph GitHub](https://github.com/agentflare-ai/sqlite-graph) - Cypher extension
- [GraphRAG with SQLite](https://dev.to/stephenc222/how-to-build-lightweight-graphrag-with-sqlite-53le) - Tutorial

---

**Document Status:** ✅ Ready for Review
**Decision Required:** Approve phased approach (Epic 11 → Epic 14)
**Next Action:** Review with team, add Epic 14 to backlog
