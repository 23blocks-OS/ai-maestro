# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL-part2-transitions-and-commands.md`
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

The user wants me to analyze the kanban column system and sync protocol from the "AI Maestro Orchestrator Agent" (AMOA). Let me extract the information requested from the provided markdown file.

Let me go through each item:

1. COLUMN DEFINITIONS: Exact column names, their order, who can move cards to each column, what triggers column transitions
2. CARD FIELDS: What metadata is on each card/task? Labels, assignees, priorities, custom fields?
3. SYNC RULES: How does the kanban sync with GitHub Projects V2? What is the synchronization direction? What events trigger sync?
4. TRANSITION RULES: What are the valid state transitions? What conditions must be met for each?
5. AUTOMATION: What automated transitions exist? (e.g., PR merged → done)
6. BLOCKED HANDLING: How are blocked tasks handled? Where do they go?
7. INTEGRATOR INTERACTION: How does the integrator agent interact with the kanban? How are review tasks assigned?

Let me analyze the file:

**1. COLUMN DEFINITIONS:**
From the mermaid diagram and transition commands:
- Backlog (status:backlog)
- In Progress (status:in-progress)
- AI Review (status:ai-review)
- Human Review (status:human-review)
- Merge/Release (status:merge-release)
- Done (status:done)
- Blocked (status:blocked)

Order: Backlog → In Progress → AI Review → Human Review → Merge/Release → Done
Also: In Progress → Blocked → In Progress
Also: In Progress → Backlog (de-assignment)

The document doesn't explicitly state who can move cards to each column, but the transition commands suggest:
- The orchestrator uses `gh issue edit` commands to change labels
- This implies the system/agent controls the transitions

**2. CARD FIELDS:**
From the Project Board Sync Commands section:


I'll identify the key metadata fields for tracking project items. These include critical attributes like status, platform, priority, and agent assignment. The fields provide a comprehensive view of each task's current state and context within the project management system.

**3. SYNC RULES:**
The synchronization appears to be a bidirectional process between GitHub Issues and GitHub Projects V2. The system uses label changes as the primary trigger for updating project board status, ensuring real-time alignment between issue tracking and project management tools.

**4. TRANSITION RULES:**
The workflow defines a clear progression through multiple stages, with specific rules governing task movement. Tasks can advance through different review phases, with distinct paths for small and large tasks. The system allows for both forward progression and potential regression, such as moving back to in-progress status when changes are requested.

**5. AUTOMATION:**
The current documentation lacks explicit details about automated transitions, suggesting a manual or semi-automated workflow.

**6. BLOCKED HANDLING:**
Blocked tasks have a specific mechanism for tracking and resolving impediments. When an issue becomes blocked, it transitions to a dedicated "Blocked" status, with a clear path to resume progress by moving back to "In Progress" once the blocking issue is resolved.

**7. INTEGRATOR INTERACTION:**
The integration appears to involve programmatic interactions through GitHub's command-line interface, with potential for automated status updates and field modifications.
# Kanban Column System Analysis - AI Maestro Orchestrator Agent (AMOA)

## 1. COLUMN DEFINITIONS

### Exact Column Names (in order):
| Column | Label | Description |
|--------|-------|-------------|
| 1 | `status:backlog` | Backlog - Initial state for unstarted tasks |
| 2 | `status:in-progress` | In Progress - Actively being worked on |
| 3 | `status:ai-review` | AI Review - Awaiting AI agent review |
| 4 | `status:human-review` | Human Review - Requires human approval (big tasks) |
| 5 | `status:merge-release` | Merge/Release - Ready for merge/release |
| 6 | `status:done` | Done - Completed |
| 7 | `status:blocked` | Blocked - Task is blocked |

**Who can move cards:** The system uses `gh issue edit` commands with label manipulation. The orchestrator agent controls transitions programmatically.

**Triggers for column transitions:** Label changes via GitHub CLI commands.

---

## 2. CARD FIELDS

From the Project Board Sync Commands section (lines 87-145), the following custom fields exist:

| Field | Type | Purpose |
|-------|------|---------|
| **Status** | Single select | Maps to kanban column (Backlog, In Progress, AI Review, Human Review, Merge/Release, Done) |
| **Platform** | Single select | Target platform for the task |
| **Priority** | Single select | Priority level (e.g., P0, P1, P2) |
| **Agent** | Text | Assigned AI agent name |

**Standard GitHub fields also present:**
- Labels (status labels like `status:backlog`, `status:in-progress`, etc.)
- Assignees (e.g., `{{AGENT_ASSIGNEE}}`)
- Issue number and title

---

## 3. SYNC RULES

### Synchronization Direction:
The system maintains **bidirectional sync** between:
1. **GitHub Issues** — status tracked via labels (`status:*` labels)
2. **GitHub Projects V2** — status tracked via the "Status" single-select field

### Events that trigger sync:
- **Label changes** on issues trigger project board updates
- The Project Board Sync Commands show how to update fields programmatically:
  - `gh project item-edit` for updating Status, Platform, Priority, Agent fields
  - `gh project item-list` for retrieving item IDs from issue numbers

### Sync Mechanism:
```bash
# Get project item ID from issue number
gh project item-list {{PROJECT_NUMBER}} --owner {{GITHUB_OWNER}} --format json | \
  jq -r ".items[] | select(.content.number == {{ISSUE_NUMBER}}) | .id"

# Update status field
gh project item-edit --project-id {{PROJECT_ID}} --id {{ITEM_ID}} --field-id "$STATUS_FIELD_ID" --value "{{NEW_STATUS}}"
```

---

## 4. TRANSITION RULES

### Valid State Transitions:

| From | To | Trigger/Condition |
|------|-----|-------------------|
| Backlog | In Progress | Task assignment begins |
| In Progress | AI Review | Work complete, ready for AI review |
| In Progress | Blocked | Task encounters blocker |
| In Progress | Backlog | De-assignment (removes assignee) |
| AI Review | Human Review | Big tasks requiring human approval |
| AI Review | Merge/Release | Small tasks that pass AI review |
| AI Review | In Progress | Changes requested by AI reviewer |
| Human Review | Merge/Release | Human approves the task |
| Human Review | In Progress | Changes requested by human reviewer |
| Merge/Release | Done | PR merged / release completed |
| Blocked | In Progress | Blocker resolved |

### Conditions for each transition:
- **AI Review → Human Review**: Only for "big tasks" requiring human approval
- **AI Review → Merge/Release**: Only for "small tasks" that pass AI review
- **Human Review → Merge/Release**: Requires human approval
- **In Progress → Backlog**: Requires removing the assignee (`--remove-assignee`)

---

## 5. AUTOMATION

The document does **not** explicitly specify automated transitions triggered by external events (like PR merged → done). However, the transition commands suggest the orchestrator can execute these programmatically.

**Inferred automation patterns:**
- The orchestrator likely monitors for PR merges and executes `Merge/Release → Done` transition
- Review completion triggers the appropriate next state transition

---

## 6. BLOCKED HANDLING

### How blocked tasks are handled:

| Aspect | Detail |
|--------|--------|
| **Entry** | `In Progress → Blocked` via label change: `--remove-label "status:in-progress" --add-label "status:blocked"` |
| **Exit** | `Blocked → In Progress` via label change: `--remove-label "status:blocked" --add-label "status:in-progress"` |
| **Position in workflow** | Blocked is a side-branch from In Progress, not a sequential step |
| **Metadata** | Likely accompanied by a comment explaining the blocker (not specified in this document) |

---

## 7. INTEGRATOR INTERACTION

### How the integrator agent interacts with the kanban:

1. **Task Assignment**: The integrator assigns tasks by moving cards from Backlog → In Progress and adding the agent as assignee

2. **Review Task Assignment**: 
   - **AI Review**: Tasks move to `status:ai-review` automatically when work is complete
   - **Human Review**: Tasks requiring human approval move to `status:human-review` (big tasks)

3. **Agent Field Updates**: The integrator can update the "Agent" field in GitHub Projects:
   ```bash
   gh project item-edit --project-id {{PROJECT_ID}} --id {{ITEM_ID}} --field-id "$AGENT_FIELD_ID" --text "{{AGENT_NAME}}"
   ```

4. **De-assignment**: When returning a task to backlog:
   ```bash
   gh issue edit {{ISSUE_NUMBER}} --remove-label "status:in-progress" --add-label "status:backlog" --remove-assignee "{{AGENT_ASSIGNEE}}"
   ```

---

## Summary: Definitive AMOA Kanban Spec

| Attribute | Value |
|-----------|-------|
| **Columns** | Backlog → In Progress → AI Review → Human Review → Merge/Release → Done (+ Blocked side-branch) |
| **Status Labels** | `status:backlog`, `status:in-progress`, `status:ai-review`, `status:human-review`, `status:merge-release`, `status:done`, `status:blocked` |
| **Project Fields** | Status, Platform, Priority, Agent |
| **Sync Mechanism** | GitHub Issues (labels) ↔ GitHub Projects V2 (fields) |
| **Key Distinction** | Big tasks go to Human Review; small tasks go directly to Merge/Release from AI Review |