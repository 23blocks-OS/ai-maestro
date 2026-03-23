# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL-part3-automation-and-troubleshooting.md`
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

Let me analyze the provided file:

From the automation script, I can see the column names:
- Backlog
- Todo
- In Progress
- AI Review
- Human Review
- Merge/Release
- Done
- Blocked

The labels used are:
- status:backlog
- status:todo
- status:in-progress
- status:ai-review
- status:human-review
- status:merge-release
- status:done
- status:blocked

Required fields before each transition:
- Before Moving to "In Progress": Issue assigned to agent, Toolchain template specified, All required tools available, Environment setup script tested, Agent authenticated to GitHub
- Before Moving to "AI Review": All acceptance criteria met, All tests passing locally, Code formatted and linted, Documentation updated, Toolchain verified, PR created and linked, PR template filled completely, Test results included in PR


- Before Moving to "Human Review": AI review completed and approved, All AI-flagged issues resolved, PR ready for human reviewer
- Before Moving to "Merge/Release": Human review completed and approved, All review comments addressed, Final CI checks passing
- Before Moving to "Done": PR approved by reviewer, All CI checks passing, No merge conflicts, Branch up to date with base, PR merged to main, Issue closed
- Before Setting "Blocked": Blocker clearly described, Required action identified, Impact assessed, Orchestrator notified

The sync mechanism uses labels as the primary status indicator, with the GitHub Projects V2 board maintaining parallel state. Status changes propagate through a bidirectional sync where the script updates both the label and the project field simultaneously, ensuring consistency across both representations.

For transitions, the script handles the logic by removing any existing status labels and applying the new one, then updating the corresponding project field. The automation appears to be manual rather than event-driven, with the script invoked directly rather than triggered by specific GitHub events like PR merges.

When tasks become blocked, they move to a dedicated "Blocked" column with specific requirements: the blocker must be documented, the required action identified, the impact assessed, and the orchestrator notified. The integrator interacts with the kanban through the sync script, which accepts the issue number, new status, and optional comment as parameters.
# Kanban Column System and Sync Protocol Analysis

## File: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL-part3-automation-and-troubleshooting.md`

---

## 1. COLUMN DEFINITIONS

### Exact Column Names (in order):
Based on the automation script `sync-issue-status.sh` (lines 21-52), the kanban columns are:

| Column Name | Label Value | Order |
|-------------|-------------|-------|
| Backlog | `status:backlog` | 1 |
| Todo | `status:todo` | 2 |
| In Progress | `status:in-progress` | 3 |
| AI Review | `status:ai-review` | 4 |
| Human Review | `status:human-review` | 5 |
| Merge/Release | `status:merge-release` | 6 |
| Done | `status:done` | 7 |
| Blocked | `status:blocked` | 8 |

### Who Can Move Cards:
- **Integrator Agent** — The primary actor, identified by `AGENT_NAME` environment variable (line 16)
- Must have **write access** to the repository
- GitHub token must have correct scopes

### Triggers for Column Transitions:
- Manual invocation of the sync script: `./sync-issue-status.sh ISSUE_NUMBER NEW_STATUS [COMMENT]`
- Each transition requires specific **prerequisites** to be met (see Section 4 below)

---

## 2. CARD FIELDS

### Labels (Primary Status Indicator):
- `status:backlog` — Task in backlog
- `status:todo` — Task ready to be worked on
- `status:in-progress` — Task actively being worked on
- `status:ai-review` — Awaiting AI code review
- `status:human-review` — Awaiting human code review
- `status:merge-release` — Ready for merge/release
- `status:done` — Task completed
- `status:blocked` — Task blocked

### Required Metadata Before Transitions:

**Before "In Progress":**
- Issue assigned to agent
- Toolchain template specified
- All required tools available
- Environment setup script tested
- Agent authenticated to GitHub

**Before "AI Review":**
- All acceptance criteria met
- All tests passing locally
- Code formatted and linted
- Documentation updated
- Toolchain verified
- PR created and linked
- PR template filled completely
- Test results included in PR

**Before "Human Review":**
- AI review completed and approved
- All AI-flagged issues resolved
- PR ready for human reviewer

**Before "Merge/Release":**
- Human review completed and approved
- All review comments addressed
- Final CI checks passing

**Before "Done":**
- PR approved by reviewer
- All CI checks passing
- No merge conflicts
- Branch up to date with base
- PR merged to main
- Issue closed

**Before "Blocked":**
- Blocker clearly described
- Required action identified
- Impact assessed
- Orchestrator notified

---

## 3. SYNC RULES

### Synchronization Direction:
**Bidirectional sync** between:
1. **GitHub Issue Labels** — Primary status store
2. **GitHub Projects V2** — Visual board representation

### Sync Mechanism (from `sync-issue-status.sh`):

**Step 1: Update Labels (lines 60-73)**
```bash
# Remove old status labels
for LABEL in $CURRENT_LABELS; do
  if [[ "$LABEL" == status:* ]]; then
    gh issue edit "$ISSUE_NUMBER" --remove-label "$LABEL"
  fi
done

# Add new status label
gh issue edit "$ISSUE_NUMBER" --add-label "$NEW_LABEL"
```

**Step 2: Update Project Board (lines 75-92)**
```bash
# Get project item ID
ITEM_ID=$(gh project item-list "$PROJECT_NUMBER" ...)

# Get status field ID
STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" ... | 
  jq -r '.[] | select(.name == "Status") | .id')

# Update project item
gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" 
  --field-id "$STATUS_FIELD_ID" --value "$NEW_STATUS"
```

### Events That Trigger Sync:
- Manual script execution by integrator agent
- No automatic event-based triggers defined in this document

### Best Practices (lines 155-163):
1. Always comment when changing status — Provide context for the transition
2. Update both labels and project board — Keep them in sync
3. Verify required fields before transition — Don't skip validation
4. Notify orchestrator on critical events — Blocked, failed, completed
5. Use atomic operations — Update label and board in same script
6. Log all transitions — Keep audit trail of status changes
7. Handle errors gracefully — Don't leave issues in inconsistent state
8. Test sync script before use — Verify it works on test issue first

---

## 4. TRANSITION RULES

### Valid State Transitions:

| From | To | Conditions |
|------|-----|------------|
| Any | **Backlog** | Task deferred or reset |
| Any | **Todo** | Task ready for prioritization |
| Backlog/Todo | **In Progress** | Agent assigned, toolchain ready, environment tested |
| In Progress | **AI Review** | Code complete, tests passing, PR created, PR template filled |
| AI Review | **Human Review** | AI review approved, issues resolved |
| Human Review | **Merge/Release** | Human approved, comments addressed, CI passing |
| Merge/Release | **Done** | PR merged, issue closed |
| Any | **Blocked** | Blocker described, action identified, impact assessed, orchestrator notified |

### Conditions Must Be Met:
Each transition has a **checklist** that must be completed before the status change (lines 99-137). The script does NOT enforce these automatically — the **agent must verify** them manually.

---

## 5. AUTOMATION

### Automated Transitions:
**None explicitly defined** in this document. The sync script is **manually invoked**, not triggered by GitHub events.

### However, the protocol implies these automated flows:
- **PR merged → Done**: When PR is merged and issue closed (requires manual verification before marking Done)
- **CI passing → Merge/Release**: Final CI checks must pass before merge

### Script Location:
`scripts/sync-issue-status.sh` — Must be saved and made executable.

### Usage:
```bash
./sync-issue-status.sh ISSUE_NUMBER NEW_STATUS [COMMENT]
# Example: ./sync-issue-status.sh 42 "In Progress" "Started work"
```

---

## 6. BLOCKED HANDLING

### Where Blocked Tasks Go:
- **Column:** `Blocked` (label: `status:blocked`)

### Required Actions Before Setting Blocked (lines 133-137):
- [ ] Blocker clearly described
- [ ] Required action identified
- [ ] Impact assessed
- [ ] **Orchestrator notified**

### Comment Format (when blocking):
The script adds a comment with:
- Current status
- Agent comment
- Agent name
- Timestamp (UTC)

```bash
gh issue comment "$ISSUE_NUMBER" --body "**Status:** $NEW_STATUS

$COMMENT

**Agent:** $AGENT_NAME
**Time:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
```

---

## 7. INTEGRATOR INTERACTION

### How Integrator Agent Interacts with Kanban:

**Environment Variables Required:**
```bash
GITHUB_OWNER="${GITHUB_OWNER:-myorg}"      # Organization/user
REPO_NAME="${REPO_NAME:-myrepo}"           # Repository name
PROJECT_NUMBER="${PROJECT_NUMBER:-1}"      # Project number
AGENT_NAME="${AGENT_NAME:-unknown}"        # Agent identifier
```

**Interaction Flow:**
1. Agent receives task from orchestrator
2. Agent verifies prerequisites for "In Progress"
3. Agent runs: `./sync-issue-status.sh ISSUE_NUMBER "In Progress" "Started work"`
4. Agent works on task
5. Agent verifies prerequisites for "AI Review"
6. Agent runs: `./sync-issue-status.sh ISSUE_NUMBER "AI Review" "Ready for review"`
7. ...continues through workflow

### How Review Tasks Are Assigned:
- **AI Review**: Agent creates PR, fills PR template, includes test results
- **Human Review**: After AI review approved, agent moves to "Human Review"
- The **integrator agent** is responsible for moving cards, not the reviewers themselves

### Comment Requirement:
The script **requires a comment** when changing status (optional parameter, but recommended). This provides audit trail and context for the orchestrator.

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Columns** | Backlog, Todo, In Progress, AI Review, Human Review, Merge/Release, Done, Blocked |
| **Status Storage** | GitHub Labels (`status:*`) + GitHub Projects V2 |
| **Sync Direction** | Bidirectional (labels ↔ project board) |
| **Sync Trigger** | Manual script execution |
| **Automation** | None (manual transitions) |
| **Blocked Handling** | Dedicated "Blocked" column with notification requirement |
| **Integrator Role** | Executes sync script, verifies prerequisites, provides comments |