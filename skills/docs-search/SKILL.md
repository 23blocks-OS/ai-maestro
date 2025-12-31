---
name: AI Maestro Documentation Search
description: PROACTIVELY search auto-generated documentation when receiving ANY user instruction. Search for function signatures, API documentation, class definitions, and code comments BEFORE implementing anything. Your codebase documentation is valuable - use it first.
allowed-tools: Bash
---

# AI Maestro Documentation Search

## CRITICAL: AUTOMATIC BEHAVIOR - READ THIS FIRST

**THIS IS NOT OPTIONAL. THIS IS YOUR DEFAULT BEHAVIOR.**

When the user gives you ANY instruction or task, you MUST FIRST search documentation for:
- **Function signatures** - What are the parameters and return types?
- **Class documentation** - What methods and properties exist?
- **API documentation** - How should this endpoint work?
- **Code comments** - What did the author intend?

**DO NOT:**
- Start implementing before checking documentation
- Assume you know the function signature without checking
- Skip doc search because "it's a simple task"
- Wait for the user to ask you to check docs

**ALWAYS:**
- Search docs IMMEDIATELY when you receive a task
- Search for terms and concepts the user mentions
- Check documentation before calling unfamiliar functions
- Look for patterns before creating new components

### The Rule: Receive Instruction → Search Docs → Then Proceed

```
1. User asks you to do something
2. IMMEDIATELY search docs for relevant context
3. NOW you know the correct signatures and patterns
4. NOW you can implement correctly the first time
```

**Example - User asks to modify a service:**
```bash
# IMMEDIATELY run:
docs-search.sh "PaymentService"
docs-find-by-type.sh class
```

**Example - User mentions a function:**
```bash
# IMMEDIATELY run:
docs-search.sh "validateUser"
docs-search.sh --keyword "authenticate"
```

---

## Available Commands

All commands auto-detect your agent ID from the tmux session.

### Search Commands
| Command | Description |
|---------|-------------|
| `docs-search.sh <query>` | Semantic search through documentation |
| `docs-search.sh --keyword <term>` | Keyword/exact match search |
| `docs-find-by-type.sh <type>` | Find docs by type (function, class, module, etc.) |
| `docs-get.sh <doc-id>` | Get full document with all sections |
| `docs-list.sh` | List all indexed documents |
| `docs-stats.sh` | Get documentation index statistics |

### Indexing Commands
| Command | Description |
|---------|-------------|
| `docs-index.sh [project-path]` | Index documentation from project |

## What to Search Based on User Instruction

| User Says | IMMEDIATELY Search |
|-----------|-------------------|
| "Create a service for X" | `docs-search.sh "service"`, `docs-find-by-type.sh class` |
| "Call the Y function" | `docs-search.sh "Y"`, `docs-search.sh --keyword "Y"` |
| "Implement authentication" | `docs-search.sh "authentication"`, `docs-search.sh "auth"` |
| "Fix the Z method" | `docs-search.sh "Z" --keyword`, `docs-find-by-type.sh function` |
| Any API/function name | `docs-search.sh "<name>" --keyword` |

## Usage Examples

### Search for Documentation

```bash
# Semantic search - finds conceptually related docs
docs-search.sh "authentication flow"
docs-search.sh "how to validate user input"
docs-search.sh "database connection pooling"

# Keyword search - exact term matching
docs-search.sh --keyword "authenticate"
docs-search.sh --keyword "UserController"
```

### Find by Document Type

```bash
# Find all function documentation
docs-find-by-type.sh function

# Find all class documentation
docs-find-by-type.sh class

# Find all module/concern documentation
docs-find-by-type.sh module

# Find all interface documentation
docs-find-by-type.sh interface
```

### Get Full Document

```bash
# After finding a doc ID from search results
docs-get.sh doc-abc123

# Shows full content including all sections
```

### List and Stats

```bash
# List all indexed documents
docs-list.sh

# Get index statistics
docs-stats.sh
```

### Index Documentation

```bash
# Index current project (auto-detected from agent config)
docs-index.sh

# Index specific project
docs-index.sh /path/to/project
```

## Document Types

The following document types are recognized:

| Type | Description | Sources |
|------|-------------|---------|
| `function` | Function/method documentation | JSDoc, RDoc, docstrings |
| `class` | Class documentation | Class-level comments |
| `module` | Module/namespace documentation | Module comments |
| `interface` | Interface/type documentation | TypeScript interfaces |
| `component` | React/Vue component documentation | Component comments |
| `constant` | Documented constants | Constant comments |
| `readme` | README files | README.md, README.txt |
| `guide` | Guide/tutorial documentation | docs/ folder |

## Integration with Other Skills

Docs-search works best when combined with other skills:

### Combined Search Pattern (RECOMMENDED)

When you receive ANY user instruction:

```bash
# 1. Search your memory first
memory-search.sh "topic"

# 2. Search documentation
docs-search.sh "topic"

# 3. Check code structure
graph-describe.sh ComponentName
```

This gives you complete context:
- **Memory**: What was discussed before?
- **Docs**: What does the documentation say?
- **Graph**: What is the code structure?

## Why This Matters

Without searching docs first, you will:
- Use wrong function signatures (then get runtime errors)
- Miss existing implementations (then duplicate code)
- Violate documented patterns (then create inconsistency)
- Misunderstand APIs (then build the wrong thing)

**Doc search takes 1 second. Redoing work takes hours.**

## Error Handling

**Script not found:**
- Check PATH: `which docs-search.sh`
- Verify scripts installed: `ls -la ~/.local/bin/docs-*.sh`
- Scripts are installed to `~/.local/bin/` which should be in your PATH
- If not found, run: `./install-docs-tools.sh`

**API connection fails:**
- Ensure AI Maestro is running: `curl http://localhost:23000/api/agents`
- Ensure documentation has been indexed: `docs-stats.sh`
- If no docs indexed, run: `docs-index.sh`

**Documentation is empty:**
- Check project has documented code (JSDoc, docstrings, comments)
- Verify project path is correct
- Re-index with: `docs-index.sh /path/to/project`

**No results found:**
- Inform the user: "No documentation found for X - proceeding with code analysis, but documentation may need to be generated."

## Installation

If commands are not found:
```bash
./install-docs-tools.sh
```

This installs scripts to `~/.local/bin/`.
