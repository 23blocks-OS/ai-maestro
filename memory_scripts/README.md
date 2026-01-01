# AI Maestro Memory Scripts

Command-line tools for searching agent conversation history. These scripts enable AI agents to remember past discussions, decisions, and context.

## Purpose

Memory scripts help agents:
- **Remember** what was discussed before
- **Find** previous decisions and solutions
- **Avoid** repeating explanations or contradicting past work
- **Continue** where work left off

## Installation

```bash
cd /path/to/ai-maestro
./install-messaging.sh
# Installs all scripts including memory tools
```

Scripts are installed to `~/.local/bin/`.

---

## Available Scripts

| Script | Purpose |
|--------|---------|
| `memory-search.sh` | Search conversation history with various modes |
| `memory-helper.sh` | Helper functions (sourced by other scripts) |

---

## Script Reference

### memory-search.sh

Search your agent's conversation history for past discussions.

```bash
memory-search.sh <query> [--mode MODE] [--role ROLE] [--limit N]
```

**Parameters:**
- `query` - Search terms (required)
- `--mode` - Search mode: `hybrid` (default), `semantic`, `term`, `symbol`
- `--role` - Filter by role: `user`, `assistant`
- `--limit` - Maximum results (default: 10)

**Search Modes:**
| Mode | Best For |
|------|----------|
| `hybrid` | General search (combines all modes) |
| `semantic` | Finding related concepts, similar ideas |
| `term` | Exact keyword matching |
| `symbol` | Code symbols (functions, classes) |

**Examples:**
```bash
# Basic search
memory-search.sh "authentication"

# Semantic search for related concepts
memory-search.sh "user login flow" --mode semantic

# Find what the user asked about
memory-search.sh "requirements" --role user

# Limit results
memory-search.sh "API design" --limit 5

# Find code-related discussions
memory-search.sh "PaymentService" --mode symbol
```

**Output:**
```
Searching memory for: authentication
Mode: hybrid
---
Found 3 result(s):

[user] Score: 0.87
  We need OAuth2 authentication with Google and GitHub support...

[assistant] Score: 0.82
  I implemented the authentication flow in auth-controller.ts...

[user] Score: 0.79
  Can you add refresh token handling to the auth system...
```

---

## How It Works

1. **Conversation Indexing**: The AI Maestro subconscious system indexes all conversations from `~/.claude/projects/` into a vector database
2. **Search Query**: When you search, the query is converted to embeddings
3. **Vector Search**: CozoDB performs similarity search across indexed conversations
4. **Results**: Matching messages are returned with relevance scores

---

## Prerequisites

For memory search to work:

1. **Subconscious must be running**: Conversations need to be indexed first
2. **Agent must have conversations**: New agents have no history to search

### Check Indexing Status

```bash
# Trigger delta indexing for your agent
curl -X POST "http://localhost:23000/api/agents/${AGENT_ID}/index-delta"
```

### View Index Stats

```bash
# Check how many conversations are indexed
curl "http://localhost:23000/api/agents/${AGENT_ID}/stats" | jq
```

---

## Proactive Usage Pattern

Memory search should be used **proactively** when:

- User mentions "continue working on X" - Search for "X"
- User references a previous decision - Search for that topic
- User says "what we discussed" - Search for context
- Starting any new task - Search for related history

**Example workflow:**
```bash
# User: "Continue working on the payment feature"
# Agent should immediately search memory:
memory-search.sh "payment feature"

# This finds:
# - Previous discussions about payment requirements
# - Decisions made about payment architecture
# - Files that were modified
```

---

## Troubleshooting

### No results found

```bash
# Check if conversations are indexed
curl "http://localhost:23000/api/agents/${AGENT_ID}/stats" | jq '.conversationsIndexed'

# Trigger indexing
curl -X POST "http://localhost:23000/api/agents/${AGENT_ID}/index-delta"
```

### Script not found

```bash
# Check PATH
which memory-search.sh

# Scripts are installed to ~/.local/bin/
# Add to PATH if needed:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Cannot connect to API

```bash
# Check AI Maestro is running
pm2 status ai-maestro

# Restart if needed
pm2 restart ai-maestro
```

---

## Related Skills

The `memory-search` Claude Code skill provides natural language access to these scripts. When an agent says "check my memory for X" or "what did we discuss about Y", the skill translates that to the appropriate script calls.

See: [Memory Search Skill](../skills/memory-search/SKILL.md)

---

## Requirements

- AI Maestro running on `http://localhost:23000`
- tmux session with registered agent
- Indexed conversation history
- `curl` and `jq` installed

---

## License

MIT License - Same as AI Maestro
