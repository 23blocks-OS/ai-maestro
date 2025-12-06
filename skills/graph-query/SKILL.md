---
name: AI Maestro Code Graph Query
description: PROACTIVELY query the code graph database to understand relationships and impact of changes. Use this skill WHEN READING any file to understand context, when searching for files, when exploring the codebase, or when you need to understand what depends on a component. This is your primary tool for understanding code structure and avoiding breaking changes.
allowed-tools: Bash
---

# AI Maestro Code Graph Query

Query the code graph to understand code relationships before making changes.

## Available Commands

All commands auto-detect your agent ID from the tmux session. Just run them:

| Command | Description |
|---------|-------------|
| `graph-describe.sh <name>` | Describe a component or function |
| `graph-find-callers.sh <function>` | Find all functions that call this function |
| `graph-find-callees.sh <function>` | Find all functions called by this function |
| `graph-find-related.sh <component>` | Find related components (extends, includes, etc.) |
| `graph-find-by-type.sh <type>` | Find all components of a type (model, controller, etc.) |
| `graph-find-serializers.sh <model>` | Find serializers for a model |
| `graph-find-associations.sh <model>` | Find model associations (belongs_to, has_many) |
| `graph-find-path.sh <from> <to>` | Find call path between two functions |

## When to Use

**ALWAYS query the graph when:**
1. After reading any code file - understand what depends on it
2. Before modifying a function - find all callers
3. Before modifying a model - find serializers and associations
4. When exploring unfamiliar code - describe components

## Quick Examples

```bash
# Describe a component
graph-describe.sh User

# Find who calls a function
graph-find-callers.sh authenticate

# Find what a function calls
graph-find-callees.sh process_payment

# Find all models
graph-find-by-type.sh model

# Find serializers for User model
graph-find-serializers.sh User

# Find User model associations
graph-find-associations.sh User

# Find call path
graph-find-path.sh create_order send_email
```

## Workflows

### Before Modifying a Model

```bash
# 1. Describe it
graph-describe.sh User

# 2. Find serializers that may need updates
graph-find-serializers.sh User

# 3. Find associations
graph-find-associations.sh User
```

### Before Modifying a Function

```bash
# 1. Find all callers (they may break if you change signature)
graph-find-callers.sh authenticate

# 2. Find what it calls
graph-find-callees.sh authenticate
```

### Exploring the Codebase

```bash
# List all models
graph-find-by-type.sh model

# List all controllers
graph-find-by-type.sh controller

# Describe a specific component
graph-describe.sh PaymentService
```

## Component Types

Use with `graph-find-by-type.sh`:
- `model` - Database models
- `serializer` - JSON serializers
- `controller` - API controllers
- `service` - Service objects
- `job` - Background jobs
- `concern` - Shared modules
- `component` - React/Vue components
- `hook` - React hooks

## Error Handling

If scripts fail:
1. Ensure AI Maestro is running: `curl http://localhost:23000/api/agents`
2. Ensure your agent is registered (scripts auto-detect from tmux session)
3. Check exact component names (case-sensitive)

## Installation

If commands are not found, run the installer:
```bash
./install-graph-tools.sh
```
