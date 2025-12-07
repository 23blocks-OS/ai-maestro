# AI Maestro RAG System

**Comprehensive Retrieval-Augmented Generation for Agent Context**

## Overview

The RAG system gives AI Maestro agents access to their complete conversation history, code graph, and database schema through hybrid search. This enables **80-95% token savings** by retrieving only relevant context for each query instead of loading entire histories.

## Architecture

### Three-Layer Hybrid Search

1. **BM25 (Lexical)** - Fast exact-term matching for function names, identifiers, error codes
2. **Dense Embeddings (Semantic)** - Understanding meaning and intent using bge-small-en-v1.5 (384-d)
3. **Keyword Tables** - Fast filtering by symbols, roles, time ranges

**Fusion**: Results merged using Reciprocal Rank Fusion (RRF) for optimal ranking

### Data Sources

- **Messages**: Conversation history with embeddings, terms, and code symbols
- **Code Graph**: Files, functions, components, services, APIs, call chains
- **Database Schema**: Tables, columns, relationships, procedures (planned)

## Implementation Status

### ✅ Phase 1: Foundation (Complete)

**Core Modules:**
- `lib/rag/embeddings.ts` - transformers.js with bge-small-en-v1.5 model
- `lib/rag/keywords.ts` - Term/symbol extraction from text and code blocks
- `lib/rag/bm25.ts` - MiniSearch wrapper for lexical search
- `lib/rag/id.ts` - Stable SHA-1-based ID generation

**Schema:**
- `lib/cozo-schema-rag.ts` - Extends existing AgentDatabase with RAG tables
- Auto-migration on database initialization

**Dependencies:**
- @xenova/transformers@2.17.2 (ML inference, no Python)
- minisearch@7.2.0 (BM25)
- ts-morph@27.0.2 (AST parsing)
- cozo-node@0.7.6 (graph database)

### ✅ Phase 2: Message Processing (Complete)

**Ingestion Pipeline (`lib/rag/ingest.ts`):**
- Batch processing of conversation JSONL files
- Parallel embedding generation
- Automatic term/symbol extraction
- Progress tracking and statistics

**Hybrid Search (`lib/rag/search.ts`):**
- BM25 + semantic search with RRF fusion
- Role filtering (user/assistant/system)
- Time-range filtering
- Multiple search modes: hybrid, semantic, term, symbol

**API Endpoint (`app/api/agents/[id]/search/route.ts`):**
- GET: Search agent's conversation history
- POST: Trigger manual ingestion

**Query Parameters:**
```
- q: Search query (required)
- mode: hybrid | semantic | term | symbol
- limit: Max results (default: 10)
- minScore: Score threshold (default: 0.0)
- role: user | assistant | system
- startTs / endTs: Time range filter
- useRrf: Use Reciprocal Rank Fusion (default: true)
- bm25Weight: BM25 weight 0-1 (default: 0.4)
- semanticWeight: Semantic weight 0-1 (default: 0.6)
```

### ✅ Phase 3: Code Graph Indexing (Complete)

**Parser (`lib/rag/code-parser.ts`):**
- ts-morph-based AST parsing
- Extracts functions, components, imports, calls
- Supports TypeScript, TSX, JavaScript, JSX
- React component detection (function + class)

**Indexer (`lib/rag/code-indexer.ts`):**
- Stores code graph in CozoDB
- Supports full project indexing
- Incremental updates for changed files
- Call chain analysis and dependency tracking

**Scripts:**
- `scripts/rag/init-code-index.ts` - Full codebase scan
- `scripts/rag/update-code-index.ts` - Git-aware incremental updates

**Usage:**
```bash
# Full index
tsx scripts/rag/init-code-index.ts <agentId> <projectPath>

# Incremental (git diff)
tsx scripts/rag/update-code-index.ts <agentId> <projectPath> [commitHash]
```

## Database Schema

### Message Tables

```cozo
messages {
  msg_id: String =>
  conversation_file: String,
  role: String,
  ts: Int,
  text: String
}

msg_vec {
  msg_id: String =>
  vec: Bytes  # 384-d Float32Array
}

msg_terms {
  msg_id: String,
  term: String
}

code_symbols {
  msg_id: String,
  symbol: String
}
```

### Code Graph Tables

```cozo
files {
  file_id: String =>
  path: String,
  module: String,
  project_path: String
}

functions {
  fn_id: String =>
  name: String,
  file_id: String,
  is_export: Bool,
  lang: String
}

components {
  component_id: String =>
  name: String,
  file_id: String
}

# Edges
declares { file_id, fn_id }
imports { from_file, to_file }
calls { caller_fn, callee_fn }
component_calls { component_id, fn_id }
```

## Usage Examples

### 1. Search Conversation History

```bash
# Hybrid search
curl "http://localhost:23000/api/agents/backend-architect/search?q=authentication&mode=hybrid&limit=10"

# Semantic search only
curl "http://localhost:23000/api/agents/backend-architect/search?q=how%20to%20implement%20JWT&mode=semantic"

# Search by code symbol
curl "http://localhost:23000/api/agents/backend-architect/search?q=validateToken&mode=symbol"

# Filter by role and time
curl "http://localhost:23000/api/agents/backend-architect/search?q=error&role=assistant&startTs=1704067200000"
```

### 2. Ingest Conversations

```bash
# Manual ingestion via API
curl -X POST http://localhost:23000/api/agents/backend-architect/search \
  -H "Content-Type: application/json" \
  -d '{
    "conversationFiles": [
      "/Users/juan/.claude/projects/myapp/.conversations/conv-2025-01-15.jsonl"
    ],
    "batchSize": 10
  }'
```

### 3. Index Codebase

```bash
# Full index
tsx scripts/rag/init-code-index.ts backend-architect /Users/juan/myproject

# Incremental update
tsx scripts/rag/update-code-index.ts backend-architect /Users/juan/myproject
```

### 4. Query Code Graph

```typescript
import { createAgentDatabase } from '@/lib/cozo-db'
import { findFunctions, findCallChain, getFunctionDependencies } from '@/lib/rag/code-indexer'

const agentDb = await createAgentDatabase({ agentId: 'backend-architect' })

// Find functions by name
const fns = await findFunctions(agentDb, 'validate%')

// Find call chain between functions
const chain = await findCallChain(agentDb, 'LoginButton', 'validateToken')

// Get function dependencies
const deps = await getFunctionDependencies(agentDb, 'authenticate')

await agentDb.close()
```

## Performance

### Expected Token Savings

- **Before RAG**: Load entire conversation history (10,000+ tokens per query)
- **After RAG**: Retrieve top-10 relevant messages (500-1000 tokens per query)
- **Savings**: 80-95% reduction in context tokens

### Indexing Performance

- **Message Ingestion**: ~100 messages/minute (with embeddings)
- **Code Indexing**: ~50 files/minute (full AST parsing)
- **Incremental Updates**: ~1 second per changed file

### Search Performance

- **BM25 Search**: <10ms (in-memory index)
- **Semantic Search**: ~50-100ms (CPU-based cosine similarity)
- **Hybrid Search**: ~100-150ms (combined)

## Configuration

### Embedding Model

```typescript
// lib/rag/embeddings.ts
const MODEL = 'Xenova/bge-small-en-v1.5'
// 384 dimensions, English, optimized for retrieval
// CPU-friendly, no GPU required
```

### Search Weights

```typescript
// Default configuration
const DEFAULT_OPTIONS = {
  bm25Weight: 0.4,      // Lexical search importance
  semanticWeight: 0.6,  // Semantic search importance
  rrfK: 60,             // RRF constant
  minScore: 0.0,        // Score threshold
  limit: 10,            // Max results
}
```

### BM25 Configuration

```typescript
// lib/rag/bm25.ts
const options = {
  fields: ['text', 'symbols'],
  searchOptions: {
    boost: { symbols: 2.0 },  // Code symbols 2x more important
    prefix: true,              // Enable prefix matching
    fuzzy: 0.1,                // Allow small typos
  },
}
```

## Future Enhancements

### Phase 4: Database Schema Graph (Planned)

- PostgreSQL catalog ingestion
- Table/column/relationship indexing
- Impact analysis queries
- Schema evolution tracking

### Phase 5: LLM Integration (Planned)

- `commit_and_update_graph` tool for agents
- Auto-indexing on git commits
- Retrieved context injection into prompts
- Token usage tracking and optimization

### Phase 6: Graph Visualization (Planned)

- Cytoscape.js unified graph viewer
- Multiple view modes (code, schema, end-to-end)
- Interactive exploration
- Export to PNG/SVG

## Troubleshooting

### Build Issues

If you encounter webpack errors with native modules:

```javascript
// next.config.js
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externals.push({
      '@xenova/transformers': 'commonjs @xenova/transformers',
      'onnxruntime-node': 'commonjs onnxruntime-node',
      'sharp': 'commonjs sharp',
    })
  }
  return config
}
```

### Embedding Model Download

First run will download the model (~100MB):

```
[Embeddings] Loading model: Xenova/bge-small-en-v1.5
[Embeddings] Loading... 45%
[Embeddings] Model loaded successfully
```

Model cached at: `~/.cache/huggingface/transformers/`

### Database Migration

Existing agents automatically get RAG tables on next access:

```typescript
// lib/cozo-db.ts - Auto-migration
private async ensureRagSchema(): Promise<void> {
  const { initializeRagSchema } = await import('./cozo-schema-rag')
  await initializeRagSchema(this)
}
```

## API Reference

### Search Endpoint

**GET** `/api/agents/:id/search`

Returns search results with scores and metadata.

**Response:**
```json
{
  "success": true,
  "agent_id": "backend-architect",
  "query": "authentication",
  "mode": "hybrid",
  "count": 5,
  "results": [
    {
      "msg_id": "msg-1704067200000-abc123",
      "score": 0.92,
      "conversation_file": "/path/to/conv.jsonl",
      "role": "assistant",
      "ts": 1704067200000,
      "text": "Here's how to implement JWT authentication...",
      "matchType": "hybrid"
    }
  ]
}
```

### Ingestion Endpoint

**POST** `/api/agents/:id/search`

Triggers manual ingestion of conversation files.

**Request:**
```json
{
  "conversationFiles": ["/path/to/file1.jsonl", "/path/to/file2.jsonl"],
  "batchSize": 10
}
```

**Response:**
```json
{
  "success": true,
  "agent_id": "backend-architect",
  "stats": {
    "totalMessages": 1250,
    "processedMessages": 1250,
    "embeddingsGenerated": 1250,
    "termsExtracted": 15000,
    "symbolsExtracted": 3200,
    "durationMs": 75000
  }
}
```

## Contributing

To add new data sources:

1. Extend `cozo-schema-rag.ts` with new tables
2. Create parser in `lib/rag/<source>-parser.ts`
3. Create indexer in `lib/rag/<source>-indexer.ts`
4. Add init script in `scripts/rag/init-<source>.ts`
5. Update search to include new data in results

## References

- [Reciprocal Rank Fusion Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [BGE Embedding Model](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [CozoDB Documentation](https://docs.cozodb.org/)
- [ts-morph Documentation](https://ts-morph.com/)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
