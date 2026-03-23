# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL-part1-synchronization-rules.md`
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

The user wants me to analyze the kanban column system and sync protocol from the "AI Maestro Orchestrator Agent" (AMOA). They've provided one file (part 1 of the sync protocol), but mentioned there are "attached files" that I should process. However, I only see one file in the message.

Let me extract the information requested from this file:

1. COLUMN DEFINITIONS: Exact column names, their order, who can move cards to each column, what triggers column transitions
2. CARD FIELDS: What metadata is on each card/task? Labels, assignees, priorities, custom fields?
3. SYNC RULES: How does the kanban sync with GitHub Projects V2? What is the synchronization direction? What events trigger sync?
4. TRANSITION RULES: What are the valid state transitions? What conditions must be met for each?
5. AUTOMATION: What automated transitions exist? (e.g., PR merged → done)
6. BLOCKED HANDLING: How are blocked tasks handled? Where do they go?
7. INTEGRATOR INTERACTION: How does the integrator agent interact with the kanban? How are review tasks assigned?

Let me analyze this file thoroughly:

**COLUMN DEFINITIONS:**

From the file, I can see the following columns mentioned:
1. Backlog - via label "status:backlog"
2. In Progress - via label "status:in-progress"
3. AI Review - via label "status:ai-review"
4. Human Review - via label "status:human-review"
5. Merge/Release - via label "status:merge-release"
6. Done - via label "status:done"

Also mentioned:
- Blocked status (label "status:blocked") - but this keeps the card in "In Progress" column

**CARD FIELDS:**
- Issue labels (status labels)
- Assignees
- Comments
- Project board fields (STATUS field)

**SYNC RULES:**
- The sync happens bidirectionally between GitHub issues and GitHub Projects V2


- Synchronization involves two key actions: updating issue labels and moving cards on the kanban board simultaneously
- These updates are triggered by specific events that change the task's state

**TRANSITION RULES:**
- Transitions follow a sequential flow: Backlog → In Progress → AI Review → Merge/Release → Done
- Critical or larger tasks include an additional Human Review step
- Transitions require specific actions and meet particular conditions

**AUTOMATION:**
- Transition triggers occur at critical workflow stages like starting work, getting blocked, or creating pull requests
- Manual actions are still needed to finalize status changes

**BLOCKED HANDLING:**
- Blocked tasks remain in the In Progress column with a blocked indicator
- A blocked label is added to track the task's paused state

**INTEGRATOR INTERACTION:**
- Integrator agents initiate work through specific update rules
- They mark progress by transitioning issue statuses and updating kanban columns
- Review stages involve creating pull# Kanban Analysis: KANBAN_SYNC_PROTOCOL-part1-synchronization-rules.md

Based on the provided requests and updating relevant labels file, here is the comprehensive analysis:

---

## 1. COLUMN DEFINITIONS

### Exact Column Names & Order:
| Order | Column Name | GitHub Label | Kanban Field Value |
|-------|-------------|--------------|---------------------|
| 1 | **Backlog** | `status:backlog` | — |
| 2 | **In Progress** | `status:in-progress` | "In Progress" |
| 3 | **AI Review** | `status:ai-review` | "AI Review" |
| 4 | **Human Review** *(conditional)* | `status:human-review` | "Human Review" |
| 5 | **Merge/Release** | `status:merge-release` | "Merge/Release" |
| 6 | **Done** | `status:done` | "Done" |

### Additional Status:
- **Blocked** — Uses label `status:blocked` but card **stays in "In Progress" column** with a blocked indicator (lines 54-74)

### Who Can Move Cards:
- **Agent** — Can move from Backlog → In Progress, In Progress → AI Review, AI Review → In Progress (on changes requested)
- **Orchestrator/Human Reviewer** — Can move from AI Review → Human Review, AI Review/Human Review → Merge/Release, Merge/Release → Done

---

## 2. CARD FIELDS

### Metadata on Each Card/Task:
- **Status Label** — Primary workflow indicator (`status:backlog`, `status:in-progress`, `status:blocked`, `status:ai-review`, `status:human-review`, `status:merge-release`, `status:done`)
- **Assignee** — Agent assigned to task
- **Toolchain Template** — Must be specified before work starts
- **Project Board Field** — GitHub Projects V2 STATUS field
- **Comments** — Timestamped activity logs
- **Linked PR** — Pull request linked via "Closes #{{ISSUE_NUMBER}}"

### Required Fields Before Work Starts (Rule 1, line 25-27):
- Issue must be assigned to agent
- Toolchain template must be specified
- All required tools must be verified available

---

## 3. SYNC RULES

### Synchronization Direction:
**Bidirectional** — Both GitHub issue labels AND GitHub Projects V2 board position are updated simultaneously.

### Synchronization Pattern (Lines 17-22, 80-85, etc.):
```bash
# 1. Update issue label (GitHub Issues)
gh issue edit {{ISSUE_NUMBER}} --remove-label "status:X" --add-label "status:Y"

# 2. Move card on kanban (GitHub Projects V2)
gh project item-edit --project-id {{PROJECT_ID}} --id {{ITEM_ID}} --field-id {{STATUS_FIELD_ID}} --value "Column Name"
```

### Events That Trigger Sync:
| Event | Trigger |
|-------|---------|
| Agent starts work | Rule 1 (lines 13-31) |
| Agent gets blocked | Rule 2 (lines 35-76) |
| Agent unblocks | Rule 3 (lines 78-98) |
| Agent creates PR | Rule 4 (lines 100-130) |
| Tests fail | Rule 5 (lines 132-151) |
| PR approved & merged | Rule 6 (lines 153-207) |
| Changes requested on PR | Rule 7 (lines 209-236) |

---

## 4. TRANSITION RULES

### Standard Flow:
```
Backlog → In Progress → AI Review → Merge/Release → Done
```

### Critical/Big Task Flow:
```
Backlog → In Progress → AI Review → Human Review → Merge/Release → Done
```

### Valid Transitions:

| From | To | Trigger | Conditions |
|------|-----|---------|-------------|
| Backlog | In Progress | Agent starts work (Rule 1) | Issue assigned to agent, toolchain verified |
| In Progress | AI Review | Agent creates PR (Rule 4) | All acceptance criteria met, tests passing, formatted, docs updated |
| AI Review | Human Review | Orchestrator decision (Rule 6) | Task marked as "big" or "critical" |
| AI Review | In Progress | Changes requested (Rule 7) | Reviewer requests changes |
| Human Review | Merge/Release | Human approval (Rule 6) | Human reviewer approves |
| Merge/Release | Done | PR merged (Rule 6) | Merge completed |
| In Progress | *(stays)* Blocked | Agent blocked (Rule 2) | Clear blocker description provided |
| Blocked | In Progress | Agent unblocked (Rule 3) | Resolution described |

### Requirements Before AI Review Transition (Rule 4, lines 119-127):
- [ ] All acceptance criteria met
- [ ] All tests passing locally
- [ ] Code formatted and linted
- [ ] Documentation updated
- [ ] Toolchain verified
- [ ] PR created with proper template

### Requirements Before Done Transition (Rule 6, lines 185-189):
- [ ] PR approved by reviewer
- [ ] All CI checks passing
- [ ] No merge conflicts
- [ ] Branch up to date with base

---

## 5. AUTOMATION

### Automated Transitions:
There are **no fully automated transitions** — all require either agent or human action:

| Action | Actor | Automation Level |
|--------|-------|-------------------|
| Start work | Agent | Manual (must run commands) |
| Mark blocked | Agent | Manual (must run commands) |
| Mark unblocked | Agent | Manual (must run commands) |
| Create PR → AI Review | Agent | Manual (creates PR, then runs sync) |
| AI Review → Human Review | Orchestrator | Manual decision |
| Human Review → Merge/Release | Human | Manual approval |
| Merge/Release → Done | Orchestrator/Human | Manual (after merge detected) |

The system uses **explicit command execution** rather than webhooks or event-driven automation.

---

## 6. BLOCKED HANDLING

### How Blocked Tasks Are Handled:

1. **Card Position:** Card **stays in "In Progress" column** (not moved to a separate blocked column)
2. **Label Change:** Label changes from `status:in-progress` → `status:blocked`
3. **Indicator Added:** Blocked indicator added (comment describes blocker)

### Blocked Transition Flow (Rule 2, lines 35-76):

```bash
# Label update
--remove-label "status:in-progress" --add-label "status:blocked"

# Comment with required fields:
- Blocker description
- Impact description  
- Required action/needs
```

### Unblock Flow (Rule 3, lines 78-98):
- Label changes: `status:blocked` → `status:in-progress`
- Comment added with resolution description
- Agent resumes work in same column

### Notification (Lines 66-74):
Agent must notify orchestrator via AI Maestro messaging system (AMP):
- Message type: "alert"
- Priority: "high"
- Subject: "Agent blocked: {{TASK_ID}}"

---

## 7. INTEGRATOR INTERACTION

### How Integrator Agent Interacts with Kanban:

1. **Starting Work (Rule 1):**
   - Agent receives assigned task
   - Verifies toolchain availability
   - Executes: Label update + Kanban move + Comment

2. **Creating PR for Review (Rule 4):**
   - Agent completes implementation
   - Creates pull request
   - Executes: Label `status:in-progress` → `status:ai-review`
   - Executes: Kanban move to "AI Review"
   - PR linked via "Closes #{{ISSUE_NUMBER}}" in PR body

3. **Handling Feedback (Rule 7):**
   - On "changes requested": Agent receives notification
   - Agent executes: Label `status:ai-review` → `status:in-progress`
   - Agent executes: Kanban move back to "In Progress"
   - Agent addresses feedback, then re-submits

### Review Task Assignment:
- **AI Review:** Automatic when agent creates PR
- **Human Review:** Orchestrator decides based on task size/criticality (line 163-170)
- **Done:** Orchestrator or human moves after merge completion

---

## Summary Table: Column → Label Mapping

| Kanban Column | GitHub Label | Who Moves | Trigger |
|---------------|--------------|-----------|---------|
| Backlog | `status:backlog` | Orchestrator | Task creation |
| In Progress | `status:in-progress` | Agent | Work starts |
| Blocked | `status:blocked` | Agent | Blocker encountered |
| AI Review | `status:ai-review` | Agent | PR created |
| Human Review | `status:human-review` | Orchestrator | Big/critical task |
| Merge/Release | `status:merge-release` | Reviewer | PR approved |
| Done | `status:done` | Orchestrator | PR merged |