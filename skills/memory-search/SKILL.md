---
name: AI Maestro Memory Search
description: Search your conversation history using semantic search to find relevant past discussions, code snippets, and context. Use this skill when the user asks to "find where we discussed", "search my memory", "recall conversation about", "when did we talk about", or any memory/history search.
allowed-tools: Bash
---

# AI Maestro Memory Search

## Purpose
Enable AI agents to search their conversation history using semantic (meaning-based) search. This allows agents to recall past discussions, find code snippets from previous sessions, and retrieve context from earlier conversations.

## When to Use This Skill

- User asks "where did we discuss X?"
- User asks "find conversations about Y"
- User asks "what did we decide about Z?"
- User asks "search my memory for..."
- User asks "recall when we talked about..."
- User asks "find the code snippet where we..."
- Agent needs to recall previous context
- Agent needs to find related past discussions

## API Endpoint

**Base URL:** `http://localhost:23000/api/agents/{agent_id}/search`

**Method:** GET

**Required Parameters:**
- `q` - Search query (required)

**Optional Parameters:**
- `mode` - Search mode: `hybrid` (default), `semantic`, `term`, or `symbol`
- `limit` - Max results (default: 10)
- `minScore` - Minimum score threshold (default: 0.0)
- `role` - Filter by role: `user`, `assistant`, or `system`
- `conversation_file` - Filter by specific conversation file path
- `startTs` - Filter by start timestamp (unix ms)
- `endTs` - Filter by end timestamp (unix ms)
- `useRrf` - Use Reciprocal Rank Fusion: `true` (default) or `false`
- `bm25Weight` - Weight for lexical matches (0-1, default: 0.4)
- `semanticWeight` - Weight for semantic matches (0-1, default: 0.6)

## Search Modes

### 1. hybrid (Default - Recommended)
Combines lexical (BM25) and semantic search for best results.

**Use when:**
- General search queries
- You want both exact matches and semantic understanding
- You're not sure which mode to use

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/search?q={QUERY}" | jq
```

### 2. semantic
Pure semantic search - finds conceptually similar content even with different words.

**Use when:**
- Looking for related concepts, not exact terms
- Query might use different words than the original conversation
- Searching for similar ideas or patterns

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/search?q={QUERY}&mode=semantic" | jq
```

### 3. term
Exact term matching (lexical search only).

**Use when:**
- Looking for exact phrases or keywords
- Searching for specific variable/function names
- Need precise matches

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/search?q={QUERY}&mode=term" | jq
```

### 4. symbol
Search for code symbols (function names, class names, variables).

**Use when:**
- Looking for code elements mentioned in conversations
- Searching for class/function references
- Finding discussions about specific code symbols

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/search?q={QUERY}&mode=symbol" | jq
```

## Examples

### Basic Search
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Search for discussions about authentication
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=authentication%20implementation" | jq
```

**Response:**
```json
{
  "success": true,
  "agent_id": "backend-api",
  "query": "authentication implementation",
  "mode": "hybrid",
  "results": [
    {
      "msg_id": "msg-123456",
      "score": 0.85,
      "conversation_file": "/home/user/.claude/projects/myapp/conversations/conv-001.jsonl",
      "role": "assistant",
      "ts": 1704067200000,
      "text": "I'll implement JWT authentication. First, let's create the auth middleware...",
      "matchType": "hybrid"
    },
    {
      "msg_id": "msg-123457",
      "score": 0.72,
      "conversation_file": "/home/user/.claude/projects/myapp/conversations/conv-001.jsonl",
      "role": "user",
      "ts": 1704067100000,
      "text": "Can you help me set up user authentication for the API?",
      "matchType": "semantic"
    }
  ],
  "count": 2
}
```

### Semantic Search (Find Related Concepts)
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find discussions about error handling (semantic - finds related even with different words)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=handling%20failures%20gracefully&mode=semantic&limit=5" | jq
```

### Search Only User Messages
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find what the user asked about database optimization
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=database%20performance&role=user" | jq
```

### Search Only Assistant Responses
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find your previous explanations about caching
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=caching%20strategy&role=assistant" | jq
```

### Search by Code Symbol
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find discussions mentioning the UserController class
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=UserController&mode=symbol" | jq
```

### Search with Time Range
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Get timestamps for last 24 hours
START_TS=$(($(date +%s) - 86400))000
END_TS=$(date +%s)000

# Search within time range
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=bug%20fix&startTs=$START_TS&endTs=$END_TS" | jq
```

### Search in Specific Conversation
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Search within a specific conversation file
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=refactoring&conversation_file=/path/to/conversation.jsonl" | jq
```

### Adjust Search Weights
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Favor semantic matching (for conceptual queries)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=making%20code%20cleaner&semanticWeight=0.8&bm25Weight=0.2" | jq

# Favor exact matching (for specific terms)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=processPayment%20function&semanticWeight=0.2&bm25Weight=0.8" | jq
```

## Getting Your Agent ID

Your agent ID is typically your tmux session name:

```bash
# Get current session name (your agent ID)
AGENT_ID=$(tmux display-message -p '#S')
echo "Your agent ID: $AGENT_ID"
```

## Common Workflows

### Workflow 1: Recall Previous Decisions
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find where we discussed architectural decisions
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=architecture%20decision&limit=10" | jq '.results[] | {role, text: .text[0:200], score}'
```

### Workflow 2: Find Code Snippets
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find code we wrote for a specific feature
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=pagination%20implementation&role=assistant" | jq '.results[] | {text: .text[0:500], conversation_file}'
```

### Workflow 3: Trace a Discussion Topic
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find all mentions of a topic across conversations
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=user%20permissions&limit=20" | jq '.results[] | {role, text: .text[0:150], ts: (.ts/1000 | strftime("%Y-%m-%d %H:%M"))}'
```

### Workflow 4: Find Bug Discussions
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find discussions about a specific bug or error
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=null%20pointer%20exception%20fix" | jq
```

### Workflow 5: Recall Implementation Details
```bash
AGENT_ID=$(tmux display-message -p '#S')

# Find how we implemented a specific feature
curl -s "http://localhost:23000/api/agents/$AGENT_ID/search?q=how%20did%20we%20implement%20email%20notifications&mode=semantic" | jq
```

## Understanding Results

Each result contains:

| Field | Description |
|-------|-------------|
| `msg_id` | Unique message identifier |
| `score` | Relevance score (0-1, higher is more relevant) |
| `conversation_file` | Path to the conversation file |
| `role` | Message role: user, assistant, or system |
| `ts` | Timestamp (Unix milliseconds) |
| `text` | Message content |
| `matchType` | How it matched: `hybrid`, `bm25`, or `semantic` |

### Match Types Explained

- **hybrid** - Found by both lexical AND semantic search (strongest matches)
- **bm25** - Found by lexical (keyword) matching only
- **semantic** - Found by semantic (meaning) similarity only

## Error Handling

**Missing query:**
```json
{
  "success": false,
  "error": "Missing required parameter: q (query)"
}
```

**Invalid mode:**
```json
{
  "success": false,
  "error": "Invalid mode. Must be: hybrid, semantic, term, or symbol"
}
```

**No results:**
```json
{
  "success": true,
  "query": "very specific thing that was never discussed",
  "results": [],
  "count": 0
}
```

## Tips for Effective Searches

1. **Start broad, then narrow** - Begin with general queries, then add filters
2. **Use semantic for concepts** - When looking for ideas, not exact words
3. **Use term for code** - When searching for specific function/variable names
4. **Filter by role** - Narrow down to user questions or assistant answers
5. **Check multiple conversations** - Results span all indexed conversations
6. **Adjust weights** - Tune bm25Weight/semanticWeight for your query type
7. **Use time ranges** - Focus on recent or historical discussions

## Memory Indexing

Your agent's memory is automatically indexed when you:
- Start a new session
- Use the search API (triggers background delta indexing)
- Explicitly call the index-delta endpoint

To manually trigger indexing:
```bash
AGENT_ID=$(tmux display-message -p '#S')
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/index-delta"
```

## References

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Search API Code](/app/api/agents/[id]/search/route.ts)
- [RAG Search Module](/lib/rag/search.ts)
