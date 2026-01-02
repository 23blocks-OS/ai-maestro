# Long-Term Memory Implementation Plan

## Overview

Implement a two-tier memory system inspired by biological memory:
- **Short-term memory**: Current system (raw messages + embeddings) - temporary, high detail
- **Long-term memory**: New system (consolidated insights) - permanent, distilled knowledge

Consolidation extracts key facts, decisions, preferences, and patterns from conversations using LLM summarization (Ollama or Claude API).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SHORT-TERM MEMORY                           │
│  (Current System - lib/rag/)                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  messages   │  │   msg_vec   │  │  msg_terms  │                 │
│  │ (raw text)  │  │ (embeddings)│  │  (keywords) │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│         ↓                                                           │
│    Configurable retention (7-90 days)                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    CONSOLIDATION PROCESS
                    (Nightly + On-demand)
                    LLM extracts insights
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         LONG-TERM MEMORY                            │
│  (New System - lib/memory/)                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  memories table                                              │   │
│  │  - id, agent_id, category, content, source_conversations   │   │
│  │  - confidence, created_at, last_reinforced_at, access_count │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  memory_vec (embeddings for semantic search)                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Categories: fact | decision | preference | pattern | insight       │
│  Never deleted (or rarely)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Memory Categories

| Category | Description | Example |
|----------|-------------|---------|
| `fact` | Specific pieces of information | "Production DB is at 192.168.1.50" |
| `decision` | Choices made with rationale | "Chose React over Vue due to team expertise" |
| `preference` | User/project preferences | "Always use TypeScript, prefer functional style" |
| `pattern` | Recurring workflows | "Run tests before deploying to staging" |
| `insight` | Learned understanding | "This codebase uses repository pattern" |

## Implementation Steps

### Step 1: Add Long-Term Memory Schema
**File**: `lib/cozo-schema-memory.ts`

```typescript
// New CozoDB tables for long-term memory
memories {
  memory_id: String
  =>
  agent_id: String,
  category: String,           // fact | decision | preference | pattern | insight
  content: String,            // The actual memory content
  context: String?,           // Additional context/reasoning
  source_conversations: String?, // JSON array of conversation files
  source_message_ids: String?,   // JSON array of msg_ids that led to this
  confidence: Float,          // 0.0-1.0, how confident the LLM was
  created_at: Int,
  last_reinforced_at: Int,    // Updated when same insight extracted again
  reinforcement_count: Int,   // How many times this was reinforced
  access_count: Int,          // How many times queried
  last_accessed_at: Int?
}

memory_vec {
  memory_id: String
  =>
  vec: Bytes                  // 384-d embedding for semantic search
}

consolidation_runs {
  run_id: String
  =>
  agent_id: String,
  started_at: Int,
  completed_at: Int?,
  status: String,             // running | completed | failed
  conversations_processed: Int,
  memories_created: Int,
  memories_reinforced: Int,
  llm_provider: String,       // ollama | claude
  error: String?
}
```

### Step 2: Create LLM Provider Interface
**File**: `lib/memory/llm-provider.ts`

Abstract interface for memory consolidation LLM:

```typescript
interface MemoryExtractionResult {
  memories: Array<{
    category: 'fact' | 'decision' | 'preference' | 'pattern' | 'insight'
    content: string
    context?: string
    confidence: number  // 0.0-1.0
  }>
}

interface LLMProvider {
  name: string
  isAvailable(): Promise<boolean>
  extractMemories(conversationText: string): Promise<MemoryExtractionResult>
}

// Implementations:
// - OllamaProvider (uses localhost:11434)
// - ClaudeProvider (uses Anthropic API)
```

### Step 3: Create Ollama Provider
**File**: `lib/memory/ollama-provider.ts`

```typescript
class OllamaProvider implements LLMProvider {
  name = 'ollama'
  model = 'llama3.2'  // or configurable

  async isAvailable(): Promise<boolean> {
    // Check if Ollama is running at localhost:11434
  }

  async extractMemories(text: string): Promise<MemoryExtractionResult> {
    // POST to /api/generate with extraction prompt
    // Parse JSON response
  }
}
```

### Step 4: Create Claude Provider
**File**: `lib/memory/claude-provider.ts`

```typescript
class ClaudeProvider implements LLMProvider {
  name = 'claude'
  model = 'claude-3-haiku-20240307'  // Fast & cheap for extraction

  async isAvailable(): Promise<boolean> {
    // Check if ANTHROPIC_API_KEY is set
  }

  async extractMemories(text: string): Promise<MemoryExtractionResult> {
    // Use Anthropic SDK
    // Parse structured response
  }
}
```

### Step 5: Create Memory Consolidation Engine
**File**: `lib/memory/consolidate.ts`

Core consolidation logic:

```typescript
async function consolidateMemories(agentDb: AgentDatabase, options: {
  provider?: 'ollama' | 'claude' | 'auto'  // auto = try ollama first
  dryRun?: boolean
}): Promise<ConsolidationResult> {
  // 1. Find unprocessed conversations (not yet consolidated)
  // 2. For each conversation:
  //    a. Load messages from short-term memory
  //    b. Send to LLM for extraction
  //    c. Deduplicate against existing memories
  //    d. If similar memory exists, reinforce it
  //    e. Otherwise, create new memory
  // 3. Generate embeddings for new memories
  // 4. Record consolidation run
  // 5. Return stats
}

async function pruneShortTermMemory(agentDb: AgentDatabase, options: {
  retentionDays: number
  dryRun?: boolean
}): Promise<PruneResult> {
  // Delete messages older than retentionDays that have been consolidated
}
```

### Step 6: Create Memory Search
**File**: `lib/memory/search.ts`

```typescript
async function searchLongTermMemory(
  query: string,
  agentDb: AgentDatabase,
  options: {
    limit?: number
    categories?: string[]
    minConfidence?: number
  }
): Promise<MemorySearchResult[]> {
  // 1. Embed query
  // 2. Search memory_vec for similar embeddings
  // 3. Filter by category/confidence
  // 4. Update access_count and last_accessed_at
  // 5. Return ranked results
}
```

### Step 7: Add Consolidation to Subconscious
**File**: `lib/agent.ts` (modify)

Add consolidation to the subconscious background jobs:

```typescript
// In AgentSubconscious class:
private consolidationInterval: NodeJS.Timeout | null = null

private async runConsolidation() {
  // Run nightly at configured time (default 2 AM)
  // Or when manually triggered
}

// Add to start():
this.scheduleConsolidation()
```

### Step 8: Add Memory Settings
**File**: `lib/memory/settings.ts`

```typescript
interface MemorySettings {
  consolidation: {
    enabled: boolean
    schedule: 'nightly' | 'weekly' | 'manual'
    nightlyTime: string  // "02:00" format
    llmProvider: 'ollama' | 'claude' | 'auto'
    ollamaModel: string  // default: 'llama3.2'
    claudeModel: string  // default: 'claude-3-haiku-20240307'
  }
  retention: {
    shortTermDays: number  // 0 = keep forever, default: 30
    pruneAfterConsolidation: boolean
  }
}
```

### Step 9: Add API Endpoints
**Files**: `app/api/agents/[id]/memory/...`

```
GET  /api/agents/{id}/memory/long-term
     Query long-term memories (with search)

POST /api/agents/{id}/memory/consolidate
     Trigger manual consolidation

GET  /api/agents/{id}/memory/consolidation-runs
     List consolidation history

GET  /api/agents/{id}/memory/settings
PUT  /api/agents/{id}/memory/settings
     Get/update memory settings

POST /api/agents/{id}/memory/prune
     Manually prune short-term memory
```

### Step 10: Add UI Components
**File**: `components/MemoryPanel.tsx` (new)

Memory management panel showing:
- Long-term memory list with categories
- Search across memories
- Consolidation status and history
- Settings for retention/schedule
- Manual consolidate/prune buttons

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/cozo-schema-memory.ts` | Create | Long-term memory CozoDB tables |
| `lib/memory/llm-provider.ts` | Create | LLM provider interface |
| `lib/memory/ollama-provider.ts` | Create | Ollama implementation |
| `lib/memory/claude-provider.ts` | Create | Claude API implementation |
| `lib/memory/consolidate.ts` | Create | Consolidation engine |
| `lib/memory/search.ts` | Create | Long-term memory search |
| `lib/memory/settings.ts` | Create | Memory settings types |
| `lib/memory/prune.ts` | Create | Short-term memory pruning |
| `lib/agent.ts` | Modify | Add consolidation to subconscious |
| `app/api/agents/[id]/memory/long-term/route.ts` | Create | Query long-term memories |
| `app/api/agents/[id]/memory/consolidate/route.ts` | Create | Trigger consolidation |
| `app/api/agents/[id]/memory/settings/route.ts` | Create | Memory settings API |
| `components/MemoryPanel.tsx` | Create | Memory management UI |

## LLM Extraction Prompt

```
You are a memory consolidation system. Analyze the following conversation and extract important memories that should be retained long-term.

For each memory, classify it as one of:
- fact: Specific pieces of information (URLs, paths, credentials, names)
- decision: Choices made with rationale
- preference: User or project preferences
- pattern: Recurring workflows or behaviors
- insight: Learned understanding about the codebase or project

Output JSON:
{
  "memories": [
    {
      "category": "fact",
      "content": "The production database is PostgreSQL at db.example.com:5432",
      "context": "Discussed during deployment setup",
      "confidence": 0.95
    }
  ]
}

Only extract truly important information worth remembering permanently.
Skip routine coding actions and temporary details.

CONVERSATION:
{conversation_text}
```

## Deduplication Strategy

When a new memory is extracted:
1. Embed the new memory content
2. Search existing memories with cosine similarity > 0.85
3. If match found:
   - Don't create duplicate
   - Increment `reinforcement_count` on existing memory
   - Update `last_reinforced_at`
   - Optionally merge context if new info
4. If no match:
   - Create new memory with embedding

## Success Criteria

- [ ] Long-term memories persist across short-term pruning
- [ ] Consolidation extracts meaningful insights (not noise)
- [ ] Ollama works offline without API key
- [ ] Falls back to Claude if Ollama unavailable
- [ ] Deduplication prevents memory bloat
- [ ] Reinforcement tracks repeated insights
- [ ] Search finds relevant long-term memories
- [ ] UI shows memory status and allows management
- [ ] Settings configurable per agent

## Implementation Order

1. Schema + types (foundation)
2. Ollama provider (test locally first)
3. Consolidation engine (core logic)
4. Memory search (query ability)
5. API endpoints (expose functionality)
6. Claude provider (fallback)
7. Subconscious integration (automation)
8. UI components (user interface)
9. Pruning logic (cleanup)
10. Settings UI (configuration)
