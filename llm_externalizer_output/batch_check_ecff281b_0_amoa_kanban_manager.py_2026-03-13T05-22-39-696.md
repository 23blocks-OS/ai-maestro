# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_kanban_manager.py`
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

The user wants me to analyze the Python script `amoa_kanban_manager.py` and extract specific information about:

1. EXACT KANBAN COLUMNS: What column names/IDs are used? Are they hardcoded or configurable?
2. GITHUB PROJECTS V2 API: What GraphQL queries/mutations are used? What fields?
3. TASK DATA MODEL: What fields does a task/card have? How are tasks created/moved?
4. NOTIFICATION MECHANISM: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. API CALLS: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. SYNC LOGIC: How does sync between GitHub and local state work? What state is tracked?

Let me analyze the code carefully:

## 1. EXACT KANBAN COLUMNS

From lines 42-50:
```python
KANBAN_COLUMNS = {
    "backlog": "Backlog",
    "todo": "Todo",
    "in-progress": "In Progress",
    "ai-review": "AI Review",
    "human-review": "Human Review",
    "merge-release": "Merge/Release",
    "done": "Done",
    "blocked": "Blocked",
}
```

These are hardcoded in the script. They are used as keys for status labels like `status:backlog`, `status:todo`, etc.

## 2. GITHUB PROJECTS V2 API

Looking at the code, I don't see any GraphQL queries or mutations being used. The script uses the GitHub CLI (`gh`) instead:
- `gh issue create` - Create issues
- `gh issue edit` - Edit issues (add/remove labels)
- `gh issue view` - View issue details
- `gh issue list` - List issues
- `gh issue close` - Close issues
- `gh issue comment` - Add comments


- `gh auth status` - Check authentication

The script doesn't use the GitHub Projects V2 API directly. It uses labels on issues to represent kanban columns.

## 3. TASK DATA MODEL

Tasks are represented as GitHub issues with specific labels:
- `assign:<agent_name>` - Assignment label
- `priority:<priority>` - Priority label (normal, high, low)
- `status:<status>` - Kanban status label
- `blocked` - Blocked label

Task creation includes:
- Title
- Body (with Task Assignment table)
- Labels
- Dependencies (in body and via "blocked" label)

## 4. NOTIFICATION MECHANISM

The script uses `amp-send` to notify agents:
```python
def send_ai_maestro_message(
    to: str,
    subject: str,
    content: dict[str, Any],
    priority: str = "normal",
    from_agent: str = "amoa-orchestrator",
) -> bool:
```

The `amp-send` command is invoked with recipient, subject, message text, priority flag, and message type. Message content is structured as JSON with fields like `type`, `message`, `task` details, `sender_identity`, `recipient_identity`, and `instructions`.

## 5. API CALLS

No direct calls to AI Maestro API at localhost:23000. The script uses the `amp-send` CLI tool instead.

## 6. SYNC LOGIC

The script doesn't implement a sync mechanism between GitHub and local state. It reads directly from GitHub when needed (e.g., `get_ready_tasks` fetches from GitHub). There's no local state tracking.
# Analysis of `amoa_kanban_manager.py`

## 1. EXACT KANBAN COLUMNS

**Location:** Lines 42-50

```python
KANBAN_COLUMNS = {
    "backlog": "Backlog",
    "todo": "Todo",
    "in-progress": "In Progress",
    "ai-review": "AI Review",
    "human-review": "Human Review",
    "merge-release": "Merge/Release",
    "done": "Done",
    "blocked": "Blocked",
}
```

- **Hardcoded** - These are defined as a constant dictionary in the script
- **Status representation:** Each column maps to a label format `status:<key>` (e.g., `status:todo`, `status:in-progress`)
- **Configuration:** Not configurable via environment variables; would require code changes

---

## 2. GITHUB PROBECTS V2 API

**No GraphQL queries/mutations are used.** The script uses the **GitHub CLI (`gh`)** instead:

| Operation | CLI Command | Lines |
|-----------|-------------|-------|
| Create issue | `gh issue create` | 175-193 |
| Edit issue | `gh issue edit` | 206, 227, 250 |
| View issue | `gh issue view` | 203, 244, 289, 368 |
| List issues | `gh issue list` | 287-295 |
| Close issue | `gh issue close` | 268-272 |
| Comment | `gh issue comment` | 261-267 |
| Auth check | `gh auth status` | 79-92 |

**Kanban tracking method:** Uses **issue labels** (not Projects V2):
- Status labels: `status:<column_name>` (e.g., `status:todo`)
- Assignment labels: `assign:<agent_name>`
- Priority labels: `priority:<level>`
- Blocked label: `blocked`

---

## 3. TASK DATA MODEL

**Task fields (GitHub Issue):**
- `number` - Issue number (line 196)
- `url` - Issue URL (line 196)
- `title` - Task title (line 175)
- `body` - Task description with metadata table (lines 178-191)
- `labels` - Array of labels (line 193)
- `assigned_agent` - Via `assign:<name>` label
- `priority` - Via `priority:<level>` label
- `dependencies` - Listed in body + `blocked` label
- `created_at` - Timestamp (line 197)

**Task creation flow (lines 173-197):**
```python
def create_task_issue(...) -> dict[str, Any] | None:
    # Builds labels: [f"assign:{assigned_agent}", f"priority:{priority}"]
    # Builds body with Task Assignment markdown table
    # Creates via: gh issue create --title <title> --body <full_body> --label <labels>
```

**Task movement:** Via `update_task_status()` (lines 229-262) - removes old `status:*` labels, adds new one.

---

## 4. NOTIFICATION MECHANISM

**Uses `amp-send` CLI tool** (not direct API calls):

**Function:** `send_ai_maestro_message()` (lines 119-140)

```python
def send_ai_maestro_message(
    to: str,
    subject: str,
    content: dict[str, Any],
    priority: str = "normal",
    from_agent: str = "amoa-orchestrator",
) -> bool:
    result = subprocess.run(
        [
            "amp-send",
            to,
            subject,
            msg_text,
            "--priority",
            priority,
            "--type",
            msg_type,
        ],
        ...
    )
```

**Message format (JSON structure):**
```python
content = {
    "type": "task-assignment",           # or "pr-review-request", etc.
    "message": "You have been assigned...",
    "task": {
        "issue_number": int,
        "issue_url": str,
        "title": str,
    },
    "sender_identity": {
        "name": "amoa-orchestrator",
        "role": "orchestrator",
        "plugin": "ai-maestro-orchestrator-agent",
        "team": str,
    },
    "recipient_identity": {
        "name": agent_name,
        "role": str,
        "plugin": str,
    },
    "instructions": "Please review...",
}
```

**Notification triggers:**
- `notify_agent_of_task()` - Lines 313-345 (task assignment)
- `request_pr_review()` - Lines 347-380 (PR review request)
- `report_to_manager()` - Lines 382-399 (report to AMAMA)

---

## 5. API CALLS TO AI MAESTRO

**No direct HTTP calls to localhost:23000.** 

The script uses the **`amp-send`** external CLI tool (lines 133-138):
```python
subprocess.run(
    [
        "amp-send",
        to,           # Agent address from team-registry.json
        subject,
        msg_text,
        "--priority", priority,
        "--type",     msg_type,
    ],
    ...
)
```

**Agent address lookup:** `get_agent_address()` (lines 103-115) reads from `.ai-maestro/team-registry.json`:
```python
def get_agent_address(registry: dict[str, Any], agent_name: str) -> str | None:
    for agent in registry.get("agents", []):
        if agent["name"] == agent_name:
            return cast(str, agent["ai_maestro_address"])
```

---

## 6. SYNC LOGIC

**No sync mechanism exists.** The script operates as a **stateless wrapper** around GitHub:

- **No local state tracking** - No local database or file storage for task state
- **On-demand reads** - Functions like `get_ready_tasks()` (lines 281-327) query GitHub directly each time
- **No bidirectional sync** - Only pushes changes to GitHub; doesn't track local changes

**State retrieval pattern:**
```python
def get_ready_tasks(registry: dict[str, Any]) -> list[dict[str, Any]]:
    # Queries GitHub directly via gh issue list
    args = [
        "issue", "list",
        "--repo", f"{GITHUB_OWNER}/{GITHUB_REPO}",
        "--state", "open",
        "--json", "number,title,labels,body",
        "--limit", "100",
    ]
    # Parses labels to determine: assignment, blocked status, in-progress status
```

**Team registry:** Loads from `.ai-maestro/team-registry.json` (lines 94-101) - contains agent names and AI Maestro addresses.

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Kanban Columns** | 8 hardcoded: backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked |
| **API Method** | GitHub CLI (`gh`), not GraphQL |
| **Task Model** | GitHub Issues with labels (`assign:`, `priority:`, `status:`, `blocked`) |
| **Notifications** | `amp-send` CLI tool with JSON message format |
| **AI Maestro API** | No direct HTTP calls; uses `amp-send` |
| **Sync Logic** | None - stateless, queries GitHub on-demand |