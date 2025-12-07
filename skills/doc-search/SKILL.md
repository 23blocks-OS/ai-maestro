---
name: AI Maestro Documentation Search
description: PROACTIVELY search project documentation when receiving ANY user instruction. Search for rules, conventions, glossary definitions, and existing decisions BEFORE implementing anything. This is your knowledge base - use it first.
allowed-tools: Bash
---

# AI Maestro Documentation Search

## CRITICAL: AUTOMATIC BEHAVIOR - READ THIS FIRST

**THIS IS NOT OPTIONAL. THIS IS YOUR DEFAULT BEHAVIOR.**

When the user gives you ANY instruction or task, you MUST FIRST search documentation for:
- **Rules and conventions** - How should this be done in this project?
- **Glossary and definitions** - What does the user mean by X?
- **Existing decisions (ADRs)** - Has this been decided already?
- **Guidelines** - Are there patterns I should follow?

**DO NOT:**
- Start implementing before checking documentation
- Assume you know the project conventions without checking
- Skip doc search because "it's a simple task"
- Wait for the user to ask you to check docs

**ALWAYS:**
- Search docs IMMEDIATELY when you receive a task
- Search for terms the user mentions (they may be defined)
- Check for ADRs before making architectural decisions
- Look for conventions before creating new components

### The Rule: Receive Instruction → Search Docs → Then Proceed

```
1. User asks you to do something
2. IMMEDIATELY search docs for relevant context
3. NOW you understand the project's way of doing things
4. NOW you can implement correctly the first time
```

---

## Available Commands

All commands auto-detect your agent ID from the tmux session:

| Command | Description |
|---------|-------------|
| `doc-search.sh "<query>"` | Semantic search for concepts |
| `doc-search.sh "<term>" --keyword` | Exact keyword search |
| `doc-find-type.sh <type>` | Find docs by type (adr, readme, design) |
| `doc-stats.sh` | Check if docs are indexed |
| `doc-index.sh` | Index project documentation |

## What to Search Based on User Instruction

| User Says | IMMEDIATELY Search |
|-----------|-------------------|
| "Create a component for X" | `doc-search.sh "component conventions"`, `doc-search.sh "X" --keyword` |
| "Add a feature for Y" | `doc-search.sh "Y"`, `doc-find-type.sh adr` |
| "Fix the Z issue" | `doc-search.sh "Z"`, `memory-search.sh "Z"` |
| "Implement authentication" | `doc-search.sh "authentication"`, `doc-find-type.sh design` |
| "Set up the database" | `doc-search.sh "database"`, `doc-find-type.sh setup` |
| Any unfamiliar term | `doc-search.sh "<term>" --keyword` |

## Quick Examples

```bash
# User asks to create a new API endpoint
doc-search.sh "API conventions"
doc-search.sh "endpoint design"

# User mentions "OrderFlow" - what is it?
doc-search.sh "OrderFlow" --keyword

# Before making an architectural decision
doc-find-type.sh adr

# Check what documentation exists
doc-stats.sh

# Find setup instructions
doc-find-type.sh readme
doc-find-type.sh setup
```

## Document Types

Use with `doc-find-type.sh`:
- `adr` - Architecture Decision Records (check before big decisions)
- `readme` - Project overviews
- `design` - Technical design documents
- `api` - API documentation
- `setup` - Installation/setup guides
- `guide` - How-to guides
- `spec` - Specifications
- `changelog` - Change history
- `contributing` - Contribution guidelines

## Why This Matters

Without searching docs first, you will:
- Violate project conventions (then need to redo work)
- Miss existing decisions (then conflict with team)
- Misunderstand terms (then build the wrong thing)
- Skip established patterns (then create inconsistency)

**Doc search takes 1 second. Redoing work takes hours.**

## Error Handling

If docs are not indexed:
```bash
doc-stats.sh  # Check status
doc-index.sh  # Index if needed
```

If no results found, inform the user: "No documentation found for X - proceeding with best practices, but please confirm this aligns with project conventions."

## Installation

If commands are not found:
```bash
./install-doc-tools.sh
```
