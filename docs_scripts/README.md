# AI Maestro Documentation Scripts

Command-line tools for searching auto-generated code documentation. These scripts help AI agents understand function signatures, class definitions, API specs, and code patterns.

## Purpose

Documentation scripts help agents:
- **Find** function signatures before calling them
- **Understand** class definitions and interfaces
- **Discover** existing implementations to avoid duplication
- **Learn** documented patterns in the codebase

## Installation

```bash
cd /path/to/ai-maestro
./install-messaging.sh
# Installs all scripts including docs tools
```

Scripts are installed to `~/.local/bin/`.

---

## Available Scripts

| Script | Purpose |
|--------|---------|
| `docs-search.sh` | Search documentation with semantic or keyword matching |
| `docs-find-by-type.sh` | Find documents by type (function, class, etc.) |
| `docs-get.sh` | Get full content of a specific document |
| `docs-list.sh` | List all indexed documents |
| `docs-index.sh` | Trigger full documentation indexing |
| `docs-index-delta.sh` | Trigger incremental documentation indexing |
| `docs-stats.sh` | Show documentation index statistics |
| `docs-helper.sh` | Helper functions (sourced by other scripts) |

---

## Script Reference

### docs-search.sh

Search documentation using semantic or keyword matching.

```bash
docs-search.sh [options] <query>
```

**Options:**
- `--keyword, -k` - Use exact keyword matching instead of semantic
- `--limit, -l N` - Limit results (default: 10)
- `--help, -h` - Show help

**Examples:**
```bash
# Semantic search (finds related concepts)
docs-search.sh "authentication flow"

# Keyword search (exact match)
docs-search.sh --keyword authenticate

# Limit results
docs-search.sh --limit 20 "database connection"
```

**Output:**
```
Found 3 document(s) matching 'authentication':

[doc-abc123] UserController.authenticate
  Type: function | File: src/controllers/user.ts
  Authenticates a user with email and password...

[doc-def456] AuthService
  Type: class | File: src/services/auth.ts
  Service for handling user authentication...
```

---

### docs-find-by-type.sh

Find all documents of a specific type.

```bash
docs-find-by-type.sh <type>
```

**Document Types:**
| Type | Description |
|------|-------------|
| `function` | Function/method documentation |
| `class` | Class documentation |
| `module` | Module/namespace documentation |
| `interface` | Interface/type documentation |
| `component` | React/Vue component documentation |
| `constant` | Documented constants |
| `readme` | README files |
| `guide` | Guide/tutorial documentation |

**Examples:**
```bash
# Find all class documentation
docs-find-by-type.sh class

# Find all interface definitions
docs-find-by-type.sh interface

# Find all README files
docs-find-by-type.sh readme
```

---

### docs-get.sh

Get the full content of a specific document.

```bash
docs-get.sh <doc-id>
```

**Example:**
```bash
# Get document by ID (from search results)
docs-get.sh doc-abc123
```

**Output:**
```
=== UserController.authenticate ===
Type: function
File: src/controllers/user.ts
---
Authenticates a user with email and password.

@param email - User's email address
@param password - User's password
@returns Promise<User> - The authenticated user
@throws AuthError - If credentials are invalid

=== Sections ===

## Usage
const user = await UserController.authenticate('user@example.com', 'password')

## See Also
- AuthService.validateCredentials
- UserService.findByEmail
```

---

### docs-list.sh

List all indexed documents.

```bash
docs-list.sh [--limit N]
```

---

### docs-index.sh

Trigger full documentation indexing (rebuilds from scratch).

```bash
docs-index.sh
```

---

### docs-index-delta.sh

Trigger incremental documentation indexing (updates changed files only).

```bash
docs-index-delta.sh
```

---

### docs-stats.sh

Show documentation index statistics.

```bash
docs-stats.sh
```

**Output:**
```
Documentation Index Statistics:
  Total documents: 156
  By type:
    function: 89
    class: 24
    interface: 18
    component: 15
    readme: 10
  Last indexed: 2025-01-15T14:23:45Z
```

---

## How It Works

1. **Code Parsing**: Documentation is extracted from source files (JSDoc, TypeDoc, docstrings)
2. **Embedding Generation**: Text is converted to vector embeddings
3. **Vector Storage**: Embeddings stored in CozoDB for similarity search
4. **Search**: Queries are embedded and matched against stored documents

---

## Proactive Usage Pattern

Documentation search should be used **proactively** when:

- User says "implement X function" - Search for existing patterns
- User mentions a class/service - Search for its documentation
- Before calling unfamiliar functions - Search for signatures
- Creating new components - Search for existing examples

**Example workflow:**
```bash
# User: "Add OAuth login to UserController"
# Agent should immediately search:
docs-search.sh "UserController"
docs-search.sh "OAuth authentication"
docs-find-by-type.sh function

# This finds:
# - Existing UserController methods
# - Any existing OAuth implementations
# - Function signatures to follow
```

---

## Troubleshooting

### No documents found

```bash
# Check index status
docs-stats.sh

# Re-index documentation
docs-index.sh
```

### Script not found

```bash
# Check PATH
which docs-search.sh

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

The `docs-search` Claude Code skill provides natural language access to these scripts. When an agent says "find the documentation for X" or "what's the signature for Y", the skill translates that to the appropriate script calls.

See: [Docs Search Skill](../skills/docs-search/SKILL.md)

---

## Requirements

- AI Maestro running on `http://localhost:23000`
- tmux session with registered agent
- Indexed documentation (run `docs-index.sh` first)
- `curl` and `jq` installed

---

## License

MIT License - Same as AI Maestro
