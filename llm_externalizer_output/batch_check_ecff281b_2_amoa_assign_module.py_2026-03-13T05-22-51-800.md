# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_assign_module.py`
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

The user wants me to analyze the Python script `amoa_assign_module.py` and extract specific information about:

1. EXACT KANBAN COLUMNS: What column names/IDs are used? Are they hardcoded or configurable?
2. GITHUB PROJECTS V2 API: What GraphQL queries/mutations are used? What fields?
3. TASK DATA MODEL: What fields does a task/card have? How are tasks created/moved?
4. NOTIFICATION MECHANISM: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. API CALLS: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. SYNC LOGIC: How does sync between GitHub and local state work? What state is tracked?

Let me analyze the code:

1. **KANBAN COLUMNS**: Looking at the code, I don't see any explicit kanban column definitions in this script. The script manages module assignments and uses a state file (`.claude/orchestrator-exec-phase.local.md`) to track state. The module status values I see are:
   - "pending"
   - "planned"
   - "assigned"
   
   These could be considered kanban-like states but they're not GitHub Projects columns.

2. **GITHUB PROJECTS V2 API**: There's no GitHub Projects V2 API usage in this script. It reads from a local state file.

3. **TASK DATA MODEL**: The assignment record has these fields:
   - agent
   - agent_type
   - module
   - github_issue
   - task_uuid
   - status
   - assigned_at
   - instruction_verification (nested object with status, repetition_received, repetition_correct, questions_asked, questions_answered, authorized_at)
   - progress_polling (nested object with last_poll, poll_count, poll_history, next_poll_due)
   
4. **NOTIFICATION MECHANISM**: The script uses `amp-send` command to send messages to AI agents. The function `send_ai_maestro_message` runs the `amp-send` subprocess with parameters like session_name, subject, message, priority (high), and type (task).

5. **API CALLS**: No direct calls to AI Maestro API (localhost:23000) in this script. It uses the `amp-send` CLI tool instead.

6. **SYNC LOGIC**: The script reads from a local state file (`.claude/orchestrator-exec-phase.local.md`) with YAML frontmatter, maintains active_assignments list, and updates module status to "assigned" when work begins.
# Analysis of `amoa_assign_module.py`

## 1. EXACT KANBAN COLUMNS

**No GitHub Projects V2 kanban columns are used in this script.** 

The script uses internal state tracking with module status values (lines 139-141, 155):
- `"pending"`
- `"planned"` 
- `"assigned"`

These are stored in the local state file, not as GitHub Projects columns.

---

## 2. GITHUB PROJECTS V2 API

**No GitHub Projects V2 API calls in this script.** The script operates entirely on local state file (`.claude/orchestrator-exec-phase.local.md`).

---

## 3. TASK DATA MODEL

The task/assignment data structure is created at **lines 163-180**:

```python
assignment = {
    "agent": args.agent_id,
    "agent_type": agent_type,
    "module": args.module_id,
    "github_issue": module.get("github_issue"),
    "task_uuid": task_uuid,
    "status": "pending_verification",
    "assigned_at": datetime.now(timezone.utc).isoformat(),
    "instruction_verification": {
        "status": "awaiting_repetition",
        "repetition_received": False,
        "repetition_correct": False,
        "questions_asked": 0,
        "questions_answered": 0,
        "authorized_at": None,
    },
    "progress_polling": {
        "last_poll": None,
        "poll_count": 0,
        "poll_history": [],
        "next_poll_due": None,
    },
}
```

**Task creation**: Tasks are created when `amoa_assign_module.py` is executed with module_id and agent_id arguments. A UUID is generated at line 158:
```python
task_uuid = f"task-{uuid.uuid4().hex[:12]}"
```

**Task movement**: Status changes from `"pending"`/`"planned"` → `"assigned"` (lines 155, 162).

---

## 4. NOTIFICATION MECHANISM

**Uses AMP CLI (`amp-send`), not direct API calls.** Defined at **lines 66-79**:

```python
def send_ai_maestro_message(session_name: str, subject: str, message: str) -> bool:
    """Send a message via AI Maestro AMP CLI."""
    try:
        result = subprocess.run(
            [
                "amp-send",
                session_name,
                subject,
                message,
                "--priority",
                "high",
                "--type",
                "task",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False
```

**Message format** (lines 82-112): Creates a structured assignment message with:
- Module name and GitHub issue reference
- Task UUID and Plan ID
- Acceptance criteria
- **Instruction Verification Protocol** instructions requiring the agent to repeat requirements

---

## 5. API CALLS

**No direct calls to AI Maestro API (localhost:23000).**

The script uses the `amp-send` CLI tool (subprocess) rather than HTTP API calls.

---

## 6. SYNC LOGIC

**State file location** (line 13):
```python
EXEC_STATE_FILE = Path(".claude/orchestrator-exec-phase.local.md")
```

**State parsing** (lines 18-42): Uses YAML frontmatter parsing with `parse_frontmatter()` function.

**Tracked state**:
- `registered_agents` - contains `ai_agents` and `human_developers` lists
- `modules_status` - list of modules with id, name, status, assigned_to, github_issue, acceptance_criteria
- `active_assignments` - list of current task assignments
- `plan_id` - the plan being executed

**Sync mechanism**: This script is **write-only** for the local state file. It:
1. Reads existing state from the YAML frontmatter file
2. Creates new assignment record
3. Appends to `active_assignments` list
4. Updates module's `assigned_to` and `status`
5. Writes back the complete state

**No GitHub sync** - all state is local.