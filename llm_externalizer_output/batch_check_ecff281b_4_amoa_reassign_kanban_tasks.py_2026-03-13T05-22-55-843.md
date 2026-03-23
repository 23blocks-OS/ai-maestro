# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/scripts/amoa_reassign_kanban_tasks.py`
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

The user wants me to analyze the Python script provided. Let me extract the required information systematically.

1. **EXACT KANBAN COLUMNS**: What column names/IDs are used? Are they hardcoded or configurable?
2. **GITHUB PROJECTS V2 API**: What GraphQL queries/mutations are used? What fields?
3. **TASK DATA MODEL**: What fields does a task/card have? How are tasks created/moved?
4. **NOTIFICATION MECHANISM**: How are agents notified? Does it use AMP (amp-send.sh) or direct API calls? What message format?
5. **API CALLS**: Any direct calls to AI Maestro API (localhost:23000)? What endpoints?
6. **SYNC LOGIC**: How does sync between GitHub and local state work? What state is tracked?

Let me analyze the script:

### 1. KANBAN COLUMNS
This script doesn't use GitHub Projects V2 (kanban columns). It uses GitHub Issues with labels:
- `assigned:<agent_id>` - Label to track which agent an issue is assigned to
- `reassigned` - Label to mark issues that have been reassigned

These are NOT kanban columns - they're labels on issues.

### 2. GITHUB PROJECTS V2 API
This script does NOT use GitHub Projects V2 API. It uses the `gh` CLI tool to interact with GitHub Issues:
- `gh issue list` - to find issues by label or assignee
- `gh issue edit` - to update assignees and labels
- `gh issue comment` - to add audit comments
- `gh pr list` - to check for open PRs

No GraphQL queries/mutations are used.

### 3. TASK DATA MODEL
Tasks are GitHub Issues with:
- `number` - Issue number
- `title` - Issue title
- `labels` - List of labels (including `assigned:<agent_id>` and `reassigned`)


- `assignees` - List of assignees

Tasks are reassigned by updating the assignee field and modifying labels to reflect the new agent ownership.

### 4. NOTIFICATION MECHANISM
No notification mechanism is implemented in this script. It doesn't call amp-send.sh or any external notification service.

### 5. API CALLS
No direct calls to AI Maestro API (localhost:23000). This script only interacts with GitHub via the `gh` CLI.

### 6. SYNC LOGIC
The script finds issues by both label (`assigned:<agent_id>`) and assignee, then merges them to avoid duplicates. It updates the assignee and labels, then adds an audit comment to track the reassignment history.
# Analysis of `amoa_reassign_kanban_tasks.py`

## 1. EXACT KANBAN COLUMNS

**This script does NOT use GitHub Projects V2 kanban columns.** It operates on GitHub Issues using labels, not project columns.

- **Label pattern**: `assigned:<agent_id>` (e.g., `assigned:impl-1`)
- **Additional label**: `reassigned` (added when issue is reassigned)
- **Hardcoded**: Yes — labels are hardcoded in the code:
  - Line 143: `old_label = "assigned:{}".format(old_agent)`
  - Line 144: `new_label = "assigned:{}".format(new_agent)`
  - Line 155: `"--add-label", "{},reassigned".format(new_label)`

---

## 2. GITHUB PROJECTS V2 API

**No GraphQL queries/mutations are used.** This script uses the `gh` CLI tool (not the GraphQL API):

| Function | gh CLI Command | Purpose |
|----------|----------------|---------|
| `find_issues_by_label()` (line 52) | `gh issue list --label <label> --state open` | Find issues by label |
| `find_issues_by_assignee()` (line 79) | `gh issue list --assignee <agent> --state open` | Find issues by assignee |
| `check_issue_has_open_pr()` (line 101) | `gh pr list --search issue:# --state open` | Check for linked PRs |
| `update_issue_assignee()` (line 169) | `gh issue edit --remove-assignee --add-assignee` | Change assignee |
| `update_issue_labels()` (line 193) | `gh issue edit --remove-label --add-label` | Update labels |
| `add_audit_comment()` (line 223) | `gh issue comment --body` | Add audit trail |

---

## 3. TASK DATA MODEL

**Task = GitHub Issue** with the following fields:

| Field | Source | Description |
|-------|--------|-------------|
| `number` | `gh issue list --json number` | Issue number |
| `title` | `gh issue list --json title` | Issue title |
| `labels` | `gh issue list --json labels` | List of label objects |
| `assignees` | `gh issue list --json assignees` | List of assignee objects |

**Task creation**: Not performed by this script (only reassigns existing issues).

**Task movement**: Performed via:
- `update_issue_assignee()` — removes old agent, adds new agent as assignee
- `update_issue_labels()` — removes `assigned:<old_agent>`, adds `assigned:<new_agent>` and `reassigned`

---

## 4. NOTIFICATION MECHANISM

**No notification mechanism exists in this script.**

- Does NOT use `amp-send.sh` (AMP)
- Does NOT make direct API calls to any notification service
- Only adds an **audit comment** to the GitHub issue (lines 223-252)

Audit comment format (lines 229-247):
```python
comment_lines = [
    "## Agent Reassignment Notice",
    "",
    "| Field | Value |",
    "|-------|-------|",
    "| **Previous Agent** | {} |".format(old_agent),
    "| **New Agent** | {} |".format(new_agent),
    "| **Reason** | {} |".format(reason),
    "| **Timestamp** | {} |".format(now),
    "",
]
# Optional handoff URL section
# Footer: "*Automated reassignment by AMOA*"
```

---

## 5. API CALLS TO AI MAESTRO API

**No calls to AI Maestro API (localhost:23000).**

This script only interacts with:
- GitHub CLI (`gh`) — for issue/PR operations
- No HTTP requests to any AI Maestro endpoints

---

## 6. SYNC LOGIC

**State tracked locally during execution:**

1. **Issue discovery** (lines 295-307):
   - Searches by both label (`assigned:<agent_id>`) AND assignee
   - Merges results and deduplicates by issue number
   - Uses `seen_numbers` set to track already-seen issues

2. **State during dry-run** (lines 309-327):
   - Reports what *would* be reassigned
   - Checks for open PRs as warning
   - No persistent state storage

3. **State during actual reassignment** (lines 329-372):
   - For each issue: updates assignee, updates labels, adds audit comment
   - Tracks success/failure counts
   - Returns JSON result with details

4. **No persistent sync state**:
   - No local database or file storage
   - No tracking of last sync timestamp
   - Each run queries GitHub fresh

---

## Summary Table

| Aspect | Finding |
|--------|---------|
| **Kanban Columns** | None — uses Issue labels only |
| **GitHub API** | `gh` CLI (REST-style), not GraphQL |
| **Task Fields** | number, title, labels, assignees |
| **Notification** | None — only GitHub issue comments |
| **AI Maestro API** | None |
| **Sync Logic** | Query-based, no persistent state |