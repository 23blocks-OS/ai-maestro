---
name: AI Maestro Documentation Search
description: Search auto-generated documentation from your codebase. Use this skill when you need to find documentation, understand APIs, look up function signatures, or find usage examples. The documentation is extracted from docstrings, comments, JSDoc, RDoc, and type annotations.
allowed-tools: Bash
---

# AI Maestro Documentation Search

## Overview

Search through auto-generated documentation extracted from your codebase. This includes:
- Function/method documentation (JSDoc, RDoc, docstrings)
- Class and module documentation
- Type annotations and interfaces
- README files and markdown documentation
- Code comments explaining complex logic

## When to Use This Skill

Use docs-search when you need to:
- Find documentation for a function or class
- Look up API signatures and parameters
- Find usage examples in documentation
- Understand what a module or component does
- Search for documented patterns or conventions

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

Docs-search works well with other AI Maestro skills:

1. **graph-query**: Find code structure, then look up its documentation
   ```bash
   # Find the function in code graph
   graph-describe.sh authenticate
   # Look up its documentation
   docs-search.sh "authenticate function"
   ```

2. **memory-search**: Find past discussions about documented features
   ```bash
   # Search docs for the feature
   docs-search.sh "rate limiting"
   # Find conversations about it
   # (use memory-search skill)
   ```

## Automatic Behavior

When working with code, proactively search documentation:

1. **Before implementing**: Search for existing patterns
   ```bash
   docs-search.sh "error handling pattern"
   ```

2. **When using unfamiliar code**: Look up its documentation
   ```bash
   docs-search.sh "PaymentService"
   ```

3. **When writing documentation**: Check existing style
   ```bash
   docs-find-by-type.sh function | head -5
   docs-get.sh <doc-id>  # See documentation format
   ```

## Error Handling

If commands fail:
1. Ensure AI Maestro is running: `curl http://localhost:23000/api/agents`
2. Ensure documentation has been indexed: `docs-stats.sh`
3. If no docs indexed, run: `docs-index.sh`

If documentation is empty:
- Check project has documented code (JSDoc, docstrings, comments)
- Verify project path is correct
- Re-index with: `docs-index.sh /path/to/project`
