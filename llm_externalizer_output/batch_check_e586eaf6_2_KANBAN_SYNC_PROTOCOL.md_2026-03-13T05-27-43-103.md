# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL.md`
- **Task**: You are analyzing the kanban column system and sync protocol from the "AI Maestro Orchestrator Agent" (AMOA). This is the core kanban specification that defines how the orchestrator manages its project board.

For each file, extract:
1. COLUMN DEFINITIONS: Exact column names, their order, who can move cards to each column, what triggers column transitions
2. CARD FIELDS: What metadata is on each card/task? Labels, assignees, priorities, custom fields?
3. SYNC RULES: How does the kanban sync with GitHub Projects V2? What is the synchronization direction? What events trigger sync?
4. TRANSITION RULES: What are the valid state transitions? What conditions must be met for each?
5. AUTOMATION: What automated transitions exist? (e.g., PR merged → done)
6. BLOCKED HANDLING: How are blocked tasks handled? Where do they go?
7. INTEGRATOR INTERACTION: How does the integrator agent interact with the kanban? How are review tasks assigned?

Be very thorough — these are the definitive column and workflow specs that AI Maestro needs to replicate.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the kanban column system and sync protocol from the "AI Maestro Orchestrator Agent" (AMOA). They've provided a markdown file that references three other files that need to be processed:

1. KANBAN_SYNC_PROTOCOL-part1-synchronization-rules.md
2. KANBAN_SYNC_PROTOCOL-part2-transitions-and-commands.md
3. KANBAN_SYNC_PROTOCOL-part3-automation-and-troubleshooting.md

Let me read all these files to extract the detailed information requested:

1. COLUMN DEFINITIONS: Exact column names, their order, who can move cards to each column, what triggers column transitions
2. CARD FIELDS: What metadata is on each card/task? Labels, assignees, priorities, custom fields?
3. SYNC RULES: How does the kanban sync with GitHub Projects V2? What is the synchronization direction? What events trigger sync?
4. TRANSITION RULES: What are the valid state transitions? What conditions must be met for each?
5. AUTOMATION: What automated transitions exist? (e.g., PR merged → done)
6. BLOCKED HANDLING: How are blocked tasks handled? Where do they go?
7. INTEGRATOR INTERACTION: How does the integrator agent interact with the kanban? How are review tasks assigned?

The main file provides a good overview, but I need to read the referenced files for more details. Let me check if these files are attached or if I need to look at them from the path provided.

Looking at the task, it seems like I need to process the attached files. The main file references three other files in the same directory. Let me analyze what's provided and extract the information.

From the main file (KANBAN_SYNC_PROTOCOL.md), I can already extract some information:

## COLUMN DEFINITIONS:
The 8-column system:
1. Backlog (status:backlog)
2. Todo (status:todo)


3. In Progress (status:in-progress)
4. AI Review (status:ai-review)
5. Human Review (status:human-review)
6. Merge/Release (status:merge-release)
7. Done (status:done)
8. Blocked (status:blocked)

I'll focus on the detailed workflow and transition rules for each column. The system appears to have a structured progression from initial backlog to completion, with specific review stages and potential blocking mechanisms. Each column represents a distinct phase in the task management process, with clear labels indicating the current status of work items.

The transition rules suggest a linear but flexible workflow, allowing tasks to move between columns based on specific conditions. Notably, there's a special path for "big tasks" that requires human review, while standard tasks can proceed through AI review and merge/release stages. The system also includes a blocked status, which can interrupt progress at any point in the workflow.

Automation seems to be a key feature, with predefined scripts for status updates and synchronization. The protocol appears designed to provide clear visibility into task progress while maintaining flexibility for different task types and review requirements.
I'll analyze the kanban system from the provided markdown file. Let me extract all the requested information based on what's provided in the main file and its references.

---

## Kanban Column System Analysis for AI Maestro Orchestrator Agent (AMOA)

### 1. COLUMN DEFINITIONS

**Canonical 8-Column System:**

| # | Column | Code | Label | Description |
|---|--------|------|-------|-------------|
| 1 | Backlog | `backlog` | `status:backlog` | Entry point for new tasks |
| 2 | Todo | `todo` | `status:todo` | Ready to start, dependencies resolved |
| 3 | In Progress | `in-progress` | `status:in-progress` | Active work |
| 4 | AI Review | `ai-review` | `status:ai-review` | Integrator reviews ALL tasks |
| 5 | Human Review | `human-review` | `status:human-review` | User reviews BIG tasks only |
| 6 | Merge/Release | `merge-release` | `status:merge-release` | Ready to merge |
| 7 | Done | `done` | `status:done` | Completed |
| 8 | Blocked | `blocked` | `status:blocked` | Blocked at any stage |

**Who can move cards:** Agents using the `gh issue edit` command with label manipulation (see Quick Commands section).

**Triggers for column transitions:** Defined in Part 1 of the protocol (referenced file `./KANBAN_SYNC_PROTOCOL-part1-synchronization-rules.md`):
- Rule 1: Update Status When Starting Work
- Rule 2: Update Status When Blocked
- Rule 3: Update Status When Unblocked
- Rule 4: Update Status When Creating PR
- Rule 5: Update Status When Tests Fail
- Rule 6: Update Status When PR Merged
- Rule 7: Handle PR Changes Requested

---

### 2. CARD FIELDS

Based on the Project Board Sync Commands section (Part 2), cards have these metadata fields:

| Field | Description | Command Reference |
|-------|-------------|-------------------|
| **Status** | Column/State field | `Update Status Field` |
| **Platform** | Platform field | `Update Platform Field` |
| **Priority** | Priority field | `Update Priority Field` |
| **Agent** | Assigned agent | `Update Agent Field` |

**Labels used on cards:**
- Status labels: `status:backlog`, `status:todo`, `status:in-progress`, `status:ai-review`, `status:human-review`, `status:merge-release`, `status:done`, `status:blocked`
- Custom labels (from TASK_TEMPLATE.md - referenced file): Task-specific labels

**Environment Variables for card operations:**
- `GITHUB_OWNER` - Repository owner
- `REPO_NAME` - Repository name
- `PROJECT_NUMBER` - GitHub Project number
- `PROJECT_ID` - GitHub Project ID (GraphQL)
- `ITEM_ID` - Project item ID
- `STATUS_FIELD_ID` - Status field ID
- `AGENT_NAME` - Agent session name

---

### 3. SYNC RULES

**Synchronization Direction:** Bidirectional - labels on issues AND project board columns are kept in sync.

**How sync works:**
1. Agents update GitHub issue **labels** to reflect status
2. The automation script (`scripts/sync-issue-status.sh`) handles both label updates AND kanban board synchronization
3. All status transitions are tracked through **both** issue labels and project board columns

**Events triggering sync:**
- Starting work on an issue
- Getting blocked on an issue
- Unblocking an issue
- Creating a PR
- Tests failing
- PR being merged
- PR changes being requested

---

### 4. TRANSITION RULES

**Valid State Transitions (from Quick Reference):**

```
Backlog ► Todo ► In Progress ► AI Review ─┬─► Merge/Release ► Done
                     │                    │         ▲
                     │                    ▼         │
                     │              Human Review ───┘
                     │              (big tasks only)
                     │
                     │◄──── AI Review (changes requested)
                     │
                     ▼
                  Blocked
                     │
                     ▼
                In Progress
```

**Required Fields Before Status Change (from Part 3):**

| Before Moving to... | Required Fields |
|---------------------|-----------------|
| "In Progress" | (See Part 3) |
| "AI Review" | (See Part 3) |
| "Human Review" | (See Part 3) |
| "Merge/Release" | (See Part 3) |
| "Done" | (See Part 3) |
| Setting "Blocked" | (See Part 3) |

---

### 5. AUTOMATION

**Automation Script:** `scripts/sync-issue-status.sh`

**Usage:**
```bash
./scripts/sync-issue-status.sh ISSUE_NUMBER NEW_STATUS [COMMENT]
```

**Examples:**
```bash
./scripts/sync-issue-status.sh 42 "In Progress" "Started work"
./scripts/sync-issue-status.sh 42 "AI Review" "PR #123 ready for review"
./scripts/sync-issue-status.sh 42 "Done" "Merged and deployed"
./scripts/sync-issue-status.sh 42 "Blocked" "Waiting for API key"
```

**Automated Transitions:**
- PR Merged → Done (Rule 6)
- Tests Fail → Returns to previous state (Rule 5)
- Changes Requested → Returns to AI Review (Rule 7)

---

### 6. BLOCKED HANDLING

**How blocked tasks are handled:**
- Can be set at **any stage** (from Backlog to Merge/Release)
- Uses label: `status:blocked`
- Command: Remove current status label, add `status:blocked`

**Transition from Blocked:**
- Blocked → In Progress (when unblocked)
- Uses label: Remove `status:blocked`, add `status:in-progress`

**Rule 2 (Update Status When Blocked):** When work cannot proceed
**Rule 3 (Update Status When Unblocked):** When blocking issue is resolved

---

### 7. INTEGRATOR INTERACTION

**AI Review Column:**
- The **Integrator reviews ALL tasks** in the AI Review column
- This is a mandatory review step for every task
- From AI Review, tasks can go to:
  - Merge/Release (if approved)
  - Human Review (for big tasks only)
  - Back to In Progress (if changes requested)

**Human Review Column:**
- Used for **BIG tasks only** (user review required)
- Escalated from AI Review for large/complex tasks

**Review Task Assignment:**
- Tasks are submitted to AI Review via: `gh issue edit` removing `status:in-progress` and adding `status:ai-review`
- The integrator agent picks up tasks in the AI Review column

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Total Columns** | 8 |
| **Sync Mechanism** | Labels + Project Board (bidirectional) |
| **Automation Script** | `sync-issue-status.sh` |
| **Mandatory Review** | AI Review (all tasks) |
| **Human Review Trigger** | Big tasks only |
| **Blocked Position** | Any stage |
| **Final State** | Done |

---

**Note:** The referenced files contain additional details:
- `./KANBAN_SYNC_PROTOCOL-part1-synchronization-rules.md` - Detailed rules for each status change trigger
- `./KANBAN_SYNC_PROTOCOL-part2-transitions-and-commands.md` - Mermaid diagram and full command reference
- `./KANBAN_SYNC_PROTOCOL-part3-automation-and-troubleshooting.md` - Full automation script and required fields before each status change

To complete this analysis fully, those three referenced files would need to be processed to extract the specific conditions for each transition and the complete troubleshooting guidance.