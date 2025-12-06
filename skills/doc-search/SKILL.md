---
name: AI Maestro Documentation Search
description: Search project documentation including README files, ADRs, design documents, and other markdown files. Use this skill to find decisions, business context, setup guides, and project knowledge.
allowed-tools: Bash
---

# AI Maestro Documentation Search

## Purpose

Enable AI agents to search project documentation for context, decisions, and business logic. This skill helps agents:
- Find Architecture Decision Records (ADRs)
- Search design documents and specifications
- Locate README and setup guides
- Understand business context and requirements
- Discover project conventions and guidelines

## When to Use This Skill

**Use documentation search when:**
- Understanding "why" a decision was made
- Looking for business context or requirements
- Finding setup or configuration details
- Understanding API contracts
- Learning about project conventions
- Starting work on an unfamiliar project
- Implementing a feature that might have existing documentation

**Examples:**
- "What authentication approach did we decide on?"
- "Are there any design docs for the payment system?"
- "How do I set up the development environment?"
- "What are the API conventions for this project?"

## Getting Your Agent ID

**IMPORTANT:** The agent ID is the **UUID** from the AI Maestro agents list, NOT the tmux session name.

```bash
# Get your agent UUID (run once per session)
TMUX_SESSION=$(tmux display-message -p '#S')
export AGENT_ID=$(curl -s "http://localhost:23000/api/agents" | jq -r ".agents[] | select(.currentSession == \"$TMUX_SESSION\") | .id")
echo "Agent ID: $AGENT_ID"
```

## API Endpoint

**Base URL:** `http://localhost:23000/api/agents/{agent_id}/graph/docs`

**Method:** GET (for queries), POST (for indexing), DELETE (for clearing)

## Query Types

### 1. stats - Get Documentation Statistics

Get counts of indexed documents, sections, chunks, and breakdown by type.

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=stats" | jq
```

**Response:**
```json
{
  "success": true,
  "result": {
    "documents": 111,
    "sections": 4157,
    "chunks": 4497,
    "embeddings": 4497,
    "byType": {
      "readme": 5,
      "adr": 12,
      "design": 8,
      "doc": 86
    }
  }
}
```

### 2. search - Semantic Search

Search documentation using natural language queries. Uses embeddings for semantic similarity.

**Parameters:**
- `q` (required for semantic) - Natural language query
- `keyword` (alternative) - Exact keyword search
- `limit` (optional) - Max results (default: 10)
- `project` (optional) - Filter by project path

```bash
# Semantic search - finds conceptually related content
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=authentication%20flow" | jq

# Keyword search - finds exact term matches
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&keyword=OAuth" | jq

# Limit results
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=database%20design&limit=5" | jq
```

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "chunkId": "abc123-chunk-5",
      "docId": "abc123",
      "filePath": "/project/docs/adr/001-auth-strategy.md",
      "title": "ADR 001: Authentication Strategy",
      "docType": "adr",
      "heading": "Decision",
      "content": "We will use JWT tokens for authentication...",
      "similarity": 0.89
    }
  ]
}
```

### 3. find-by-type - Find Documents by Type

Find all documents of a specific type.

**Available Types:**
- `adr` - Architecture Decision Records
- `readme` - README files
- `design` - Design documents
- `api` - API documentation
- `setup` - Setup/installation guides
- `guide` - Tutorials and how-to guides
- `spec` - Specifications
- `changelog` - Change logs
- `contributing` - Contributing guidelines
- `roadmap` - Project roadmaps
- `doc` - General documentation

```bash
# Find all ADRs
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=adr" | jq

# Find all design documents
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=design" | jq

# Find README files
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=readme" | jq
```

**Response:**
```json
{
  "success": true,
  "result": [
    {
      "docId": "abc123",
      "filePath": "/project/docs/adr/001-auth-strategy.md",
      "title": "ADR 001: Authentication Strategy",
      "docType": "adr"
    }
  ]
}
```

### 4. list - List All Documents

List all indexed documents, sorted by last update.

**Parameters:**
- `limit` (optional) - Max results (default: 50)
- `project` (optional) - Filter by project path

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=list&limit=20" | jq
```

### 5. get-doc - Get Document with Sections

Get a specific document with its full section hierarchy.

**Parameters:**
- `docId` (required) - Document ID from search results

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=get-doc&docId=abc123" | jq
```

## Indexing Documentation

Index your project's documentation (usually done once, or when docs change).

```bash
# Index docs for the current project (auto-detects path)
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" | jq

# Index with specific project path
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}' | jq

# Index without embeddings (faster, keyword search only)
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" \
  -H "Content-Type: application/json" \
  -d '{"generateEmbeddings": false}' | jq

# Re-index (clears existing, indexes fresh)
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" \
  -H "Content-Type: application/json" \
  -d '{"clear": true}' | jq
```

## Clearing Documentation

```bash
# Clear all docs for this agent
curl -X DELETE "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" | jq

# Clear docs for specific project
curl -X DELETE "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?project=/path/to/project" | jq
```

## Common Workflows

### Starting on a New Project

```bash
# 1. Check if docs are indexed
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=stats" | jq

# 2. If not indexed, index them
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" | jq

# 3. Find the README
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=readme" | jq

# 4. Look for ADRs to understand decisions
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=adr" | jq
```

### Before Implementing a Feature

```bash
# 1. Search for related decisions
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=authentication%20decision" | jq

# 2. Find relevant design docs
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=user%20authentication%20design" | jq

# 3. Check for API conventions
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=API%20conventions%20guidelines" | jq
```

### Understanding a Component

```bash
# Search for documentation about a specific component
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=payment%20service%20architecture" | jq
```

## Document Types Explained

| Type | Description | Example Files |
|------|-------------|---------------|
| `adr` | Architecture Decision Records | `adr-001-*.md`, `decision-*.md` |
| `readme` | Project/module overviews | `README.md`, `readme.md` |
| `design` | Technical design documents | `design-*.md`, `architecture-*.md` |
| `api` | API documentation | `api-docs.md`, `openapi.md` |
| `setup` | Installation/setup guides | `INSTALL.md`, `getting-started.md` |
| `guide` | How-to guides and tutorials | `guide-*.md`, `tutorial-*.md` |
| `spec` | Specifications | `spec-*.md`, `specification-*.md` |
| `changelog` | Change history | `CHANGELOG.md` |
| `contributing` | Contribution guidelines | `CONTRIBUTING.md` |
| `roadmap` | Project roadmap | `ROADMAP.md`, `plan-*.md` |
| `doc` | General documentation | Other `.md` files |

## Troubleshooting

### No Results from Search

1. **Check if docs are indexed:**
   ```bash
   curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=stats" | jq
   ```
   If counts are 0, index the docs first.

2. **Verify agent ID:**
   ```bash
   TMUX_SESSION=$(tmux display-message -p '#S')
   curl -s "http://localhost:23000/api/agents" | jq ".agents[] | select(.currentSession == \"$TMUX_SESSION\")"
   ```

3. **Try keyword search instead of semantic:**
   ```bash
   curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&keyword=authentication" | jq
   ```

### Slow Indexing

- Use `generateEmbeddings: false` for faster indexing (keyword search only)
- Embeddings take ~1-2 seconds per batch of 32 chunks

### Missing Documents

Check the include/exclude patterns. By default, only `.md`, `.mdx`, and `.txt` files are indexed, excluding `node_modules`, `.git`, `dist`, etc.

## References

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Docs API Code](/app/api/agents/[id]/graph/docs/route.ts)
- [Doc Indexer Code](/lib/rag/doc-indexer.ts)
