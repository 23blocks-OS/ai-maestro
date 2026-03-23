# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_notify_agent.py`
- **Task**: You are analyzing Python scripts from the "AI Maestro Orchestrator Agent" (AMOA) plugin. These scripts manage kanban operations and agent notifications.

For each script, extract:
1. EXACT KANBAN COLUMNS: What column names/IDs are used? Are they hardcoded or configurable?
2. GITHUB PROJECTS V2 API: What GraphQL queries/mutations are used? What fields?
3. TASK DATA MODEL: What fields does a task/card have? How are tasks created/moved?
4. NOTIFICATION MECHANISM: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. API CALLS: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. SYNC LOGIC: How does sync between GitHub and local state work? What state is tracked?

Extract exact code patterns, hardcoded values, and data structures.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the Python script provided. Let me extract the requested information:

1. **EXACT KANBAN COLUMNS**: This script doesn't deal with kanban columns - it's a notification script.

2. **GITHUB PROJECTS V2 API**: No GraphQL queries/mutations in this script.

3. **TASK DATA MODEL**: No task/card data model in this script.

4. **NOTIFICATION MECHANISM**: 
   - Uses AMP (amp-send.sh) wrapper script
   - Located at ~/.local/bin/amp-send.sh or via PATH
   - Message types: request, info (maps to "notification"), status
   - Priority levels: normal, high, urgent
   - Command format: `amp-send <recipient> <subject> <message> --priority <priority> --type <type>`

5. **API CALLS**: No direct calls to AI Maestro API (localhost:23000) - uses amp-send.sh wrapper

6. **SYNC LOGIC**: No sync logic in this script

Let me provide a comprehensive analysis.
# Analysis of `amoa_notify_agent.py`

## 1. EXACT KANBAN COLUMNS
**None** — This script does not deal with kanban operations. It is a general-purpose notification utility.

---

## 2. GITHUB PROJECTS V2 API
**None** — No GraphQL queries or mutations are used in this script.

---

## 3. TASK DATA MODEL
**None** — This script does not create, move, or manage tasks/cards.

---

## 4. NOTIFICATION MECHANISM

### AMP (amp-send.sh) Wrapper Script
- **Location Detection** (lines 67

---
⚠ TRUNCATED (partial result due to timeout)