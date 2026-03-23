# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-15T08:21:13.606Z
- **Input file**: `/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL.md`
- **Task**: This is an AI Maestro orchestrator agent plugin that manages GitHub project kanbans. I need you to extract ALL kanban customizations this plugin makes. For each file, list:

1. Custom kanban columns/statuses it defines or expects (exact names and any mapping)
2. GitHub Projects v2 GraphQL operations it performs (mutations, queries)
3. Status transitions and workflow rules it enforces
4. Label taxonomy and how labels map to kanban columns
5. Any custom fields on GitHub project items (priority, assignee, module, etc.)
6. Sync operations between AI Maestro kanban API and GitHub project boards

Be exhaustive. List every column name, every status value, every GraphQL operation, every label-to-status mapping.

---

## Model: google/gemini-2.5-flash

```text
/tmp/ai-maestro-orchestrator-agent-review/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL.md
1. Custom kanban columns/statuses it defines or expects:
   - Backlog (code: backlog)
   - Todo (code: todo)
   - In Progress (code: in-progress)
   - AI Review (code: ai-review)
   - Human Review (code: human-review)
   - Merge/Release (code: merge-release)
   - Done (code: done)
   - Blocked (code: blocked)

2. GitHub Projects v2 GraphQL operations it performs:
   - The document mentions `PROJECT_ID`, `ITEM_ID`, and `STATUS_FIELD_ID` as environment variables for GraphQL operations, implying mutations to update project item fields.
   - "Update Status Field"
   - "Update Platform Field"
   - "Update Priority Field"
   - "Update Agent Field"
   - "Get Item ID for Issue" (implies a query to retrieve the project item ID for a given issue)

3. Status transitions and workflow rules it enforces:
   - Valid Transitions:
     - Backlog → Todo
     - Todo → In Progress
     - In Progress → AI Review
     - AI Review → Merge/Release
     - AI Review → Human Review (for big tasks only)
     - Human Review → Merge/Release
     - Merge/Release → Done
     - Any status → Blocked
     - Blocked → In Progress
     - AI Review → In Progress (when changes are requested)
   - Rule 1: Update Status When Starting Work (implies Todo -> In Progress)
   - Rule 2: Update Status When Blocked (implies any status -> Blocked)
   - Rule 3: Update Status When Unblocked (implies Blocked -> In Progress)
   - Rule 4: Update Status When Creating PR (implies In Progress -> AI Review)
   - Rule 5: Update Status When Tests Fail (implies AI Review -> In Progress)
   - Rule 6: Update Status When PR Merged (implies Merge/Release -> Done)
   - Rule 7: Handle PR Changes Requested (implies AI Review -> In Progress)
   - Required Fields Before Status Change (details in Part 3, but implies checks before transitions):
     - Before Moving to "In Progress"
     - Before Moving to "AI Review"
     - Before Moving to "Human Review"
     - Before Moving to "Merge/Release"
     - Before Moving to "Done"
     - Before Setting "Blocked"

4. Label taxonomy and how labels map to kanban columns:
   - `status:backlog` maps to Backlog
   - `status:todo` maps to Todo
   - `status:in-progress` maps to In Progress
   - `status:ai-review` maps to AI Review
   - `status:human-review` maps to Human Review
   - `status:merge-release` maps to Merge/Release
   - `status:done` maps to Done
   - `status:blocked` maps to Blocked
   - Label transitions are used to reflect status changes:
     - `remove-label "status:backlog"` and `add-label "status:todo"` for Backlog to Todo
     - `remove-label "status:todo"` and `add-label "status:in-progress"` for Todo to In Progress
     - `remove-label "status:in-progress"` and `add-label "status:ai-review"` for In Progress to AI Review
     - `remove-label "status:ai-review"` and `add-label "status:human-review"` for AI Review to Human Review
     - `remove-label "status:ai-review"` and `add-label "status:merge-release"` for AI Review to Merge/Release
     - `remove-label "status:merge-release"` and `add-label "status:done"` for Merge/Release to Done
     - `remove-label "status:in-progress"` and `add-label "status:blocked"` for In Progress to Blocked (example, implies similar for other statuses)

5. Any custom fields on GitHub project items:
   - Status (explicitly mentioned as `STATUS_FIELD_ID`)
   - Platform
   - Priority
   - Agent

6. Sync operations between AI Maestro kanban API and GitHub project boards:
   - The protocol itself defines the synchronization logic.
   - The `sync-issue-status.sh` script is the primary mechanism for performing these sync operations, handling both label updates and kanban board synchronization.
   - It takes `ISSUE_NUMBER`, `NEW_STATUS`, and an optional `COMMENT` as input.
   - The script is expected to update both issue labels and the GitHub Project board's custom fields (specifically the Status field).
   - The mention of `AIMAESTRO_API` suggests that AI Maestro might consume or trigger these updates, but the document focuses on the GitHub side of the sync.
```

---

## Model: x-ai/grok-4.1-fast

### File: /tmp/ai-maestro-orchestrator-agent-review/skills/amoa-remote-agent-coordinator/templates/github/KANBAN_SYNC_PROTOCOL.md

#### 1. Custom kanban columns/statuses defined or expected (exact names and mappings)
- **Canonical 8-Column System** (explicitly defined table with columns, codes, labels, descriptions):
  | Column Name     | Code          | Label             | Description                  |
  |-----------------|---------------|-------------------|------------------------------|
  | Backlog        | backlog      | status:backlog   | Entry point for new tasks   |
  | Todo           | todo         | status:todo      | Ready to start, dependencies resolved |
  | In Progress    | in-progress  | status:in-progress | Active work                |
  | AI Review      | ai-review    | status:ai-review | Integrator reviews ALL tasks |
  | Human Review   | human-review | status:human-review | User reviews BIG tasks only |
  | Merge/Release  | merge-release| status:merge-release | Ready to merge            |
  | Done           | done         | status:done      | Completed                   |
  | Blocked        | blocked      | status:blocked   | Blocked at any stage        |

- **Quick Reference Status Labels** (repeated mapping of states to labels, identical to table above):
  | State          | Label             |
  |----------------|-------------------|
  | Backlog       | status:backlog   |
  | Todo          | status:todo      |
  | In Progress   | status:in-progress |
  | AI Review     | status:ai-review |
  | Human Review  | status:human-review |
  | Merge/Release | status:merge-release |
  | Done          | status:done      |
  | Blocked       | status:blocked   |

- Column codes used in sync script examples: "In Progress", "AI Review", "Done", "Blocked" (human-readable names passed as NEW_STATUS argument to `sync-issue-status.sh`).

#### 2. GitHub Projects v2 GraphQL operations performed (mutations, queries)
- No explicit GraphQL query/mutation strings or schemas defined in this file.
- **Implied operations via Project Board Sync Commands** (referenced in Part 2):
  | Command                | Implied GraphQL Operation (GitHub Projects v2) |
  |------------------------|------------------------------------------------|
  | Get Item ID for Issue | `projectV2 -> node -> projectItem` query (to retrieve ITEM_ID from issue number using PROJECT_ID). |
  | Update Status Field   | `updateProjectV2ItemFieldValue` mutation (using STATUS_FIELD_ID and ITEM_ID to set status to column code like "backlog"). |
  | Update Platform Field | `updateProjectV2ItemFieldValue` mutation (targeting platform custom field). |
  | Update Priority Field | `updateProjectV2ItemFieldValue` mutation (targeting priority custom field). |
  | Update Agent Field    | `updateProjectV2ItemFieldValue` mutation (targeting agent custom field, e.g., with AGENT_NAME). |

- **Environment variables referencing GraphQL IDs** (used in operations):
  | Variable         | Purpose                          |
  |------------------|----------------------------------|
  | PROJECT_ID      | GitHub Project ID (GraphQL, e.g., PVT_xxx) for queries/mutations. |
  | ITEM_ID         | Project item ID (GraphQL, e.g., PVTI_xxx) for field updates. |
  | STATUS_FIELD_ID | Status single-select field ID (GraphQL, e.g., PVTSSF_xxx) for status mutations. |

#### 3. Status transitions and workflow rules enforced
- **Valid Transitions** (from mermaid-style diagram):
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
  - Forward flow: Backlog → Todo → In Progress → AI Review → (Human Review for big tasks only) → Merge/Release → Done.
  - Branch: AI Review → Human Review → Merge/Release (Human Review only for "big tasks").
  - Loop: AI Review → (changes requested) → In Progress.
  - Side path: In Progress ↔ Blocked (bidirectional: block from In Progress, unblock back to In Progress).

- **Synchronization Rules** (referenced in Part 1, by rule number):
  | Rule # | Trigger/Event                  | Transition/Action                  |
  |--------|--------------------------------|------------------------------------|
  | 1     | Starting Work                 | Update to In Progress             |
  | 2     | Blocked                       | Update to Blocked                 |
  | 3     | Unblocked                     | Update from Blocked to prior state (implied In Progress) |
  | 4     | Creating PR                   | Update to AI Review               |
  | 5     | Tests Fail                    | Implied revert/Blocked (not explicit) |
  | 6     | PR Merged                     | Update to Done                    |
  | 7     | PR Changes Requested          | Revert to In Progress from AI Review |

- **Required Fields Before Status Change** (referenced in Part 3, preconditions enforced):
  | Target Column       | Required Fields Before Move                  |
  |---------------------|----------------------------------------------|
  | In Progress        | (Listed, details in part3)                  |
  | AI Review          | (Listed, details in part3)                  |
  | Human Review       | (Listed, details in part3)                  |
  | Merge/Release      | (Listed, details in part3)                  |
  | Done               | (Listed, details in part3)                  |
  | Blocked            | (Listed, details in part3)                  |

- **Quick Commands** (explicit bash `gh issue edit` transitions via label swaps):
  | From → To              | Command Details                                      |
  |------------------------|------------------------------------------------------|
  | Backlog → Todo         | Remove status:backlog, add status:todo              |
  | Todo → In Progress     | Remove status:todo, add status:in-progress          |
  | In Progress → AI Review| Remove status:in-progress, add status:ai-review     |
  | AI Review → Human Review | Remove status:ai-review, add status:human-review (big tasks only) |
  | AI Review → Merge/Release | Remove status:ai-review, add status:merge-release |
  | Merge/Release → Done   | Remove status:merge-release, add status:done        |
  | In Progress → Blocked  | Remove status:in-progress, add status:blocked       |

- **General Rule**: All transitions tracked via **both issue labels AND project board columns** for consistency.

#### 4. Label taxonomy and how labels map to kanban columns
- **Primary Taxonomy**: All status labels follow `status:<column-code-lowercase-with-hyphens>` pattern.
  | Label              | Maps To Column     | Usage Notes                          |
  |--------------------|--------------------|--------------------------------------|
  | status:backlog    | Backlog           | Remove to leave, add to enter       |
  | status:todo       | Todo              | Remove to leave, add to enter       |
  | status:in-progress| In Progress       | Remove to leave, add to enter       |
  | status:ai-review  | AI Review         | Remove to leave, add to enter       |
  | status:human-review | Human Review    | Remove to leave, add to enter (big tasks) |
  | status:merge-release | Merge/Release  | Remove to leave, add to enter       |
  | status:done       | Done              | Remove to leave, add to enter       |
  | status:blocked    | Blocked           | Remove to leave, add to enter       |

- **Mapping Mechanics**: 
  - Labels are mutually exclusive (remove old status label before adding new one).
  - Label changes trigger project board column moves via sync script.
  - No other label types mentioned (e.g., no priority or platform labels; those are custom fields).

#### 5. Any custom fields on GitHub project items
- **Explicit Custom Fields** (from Part 2 Project Board Sync Commands and environment vars):
  | Field Name       | Type/Usage                          | ID/Notes                     |
  |------------------|-------------------------------------|------------------------------|
  | Status          | Single-select (maps to columns)    | STATUS_FIELD_ID (PVTSSF_xxx)|
  | Platform        | (Implied single/multi-select)      | Updated via sync command    |
  | Priority        | (Implied single-select, e.g., high/medium/low) | Updated via sync command |
  | Agent           | (Implied text or single-select)    | Updated with AGENT_NAME (e.g., worker-1) |

- Fields are **required before certain status changes** (per Part 3 rules, e.g., before In Progress, AI Review, etc.).

#### 6. Sync operations between AI Maestro kanban API and GitHub project boards
- **Primary Sync Mechanism**: Bidirectional consistency between **GitHub issue labels** and **GitHub Projects v2 board columns** (no direct AI Maestro API calls in this file; AIMAESTRO_API is env var for potential routing).
  - Labels → Board: Update labels → sync script moves project item to matching column.
  - Board → Labels: Implied reverse (consistency enforced).

- **Automation Script** (`scripts/sync-issue-status.sh`):
  | Operation                  | Details                                      |
  |----------------------------|----------------------------------------------|
  | Usage                     | `./scripts/sync-issue-status.sh ISSUE_NUMBER NEW_STATUS [COMMENT]` |
  | Handles                   | Label updates + project board sync (Get Item ID → Update fields). |
  | Examples                  | `42 "In Progress" "Started work"`<br>`42 "AI Review" "PR #123 ready for review"`<br>`42 "Done" "Merged and deployed"`<br>`42 "Blocked" "Waiting for API key"` |

- **Environment Integration**:
  | Var              | Role in Sync                              |
  |------------------|-------------------------------------------|
  | GITHUB_OWNER    | Repo context for `gh issue edit`.        |
  | REPO_NAME       | Repo context for `gh issue edit`.        |
  | PROJECT_NUMBER  | Legacy numeric ID (CLI fallback).        |
  | PROJECT_ID      | GraphQL ID for item queries/updates.     |
  | ITEM_ID         | GraphQL ID for field mutations.          |
  | STATUS_FIELD_ID | GraphQL ID for status field updates.     |
  | AGENT_NAME      | Value for Agent field (e.g., "worker-1").|
  | AIMAESTRO_API   | AI Maestro API URL (AMP routing; potential for AI Maestro kanban push/pull, but not detailed here). |

- **Error Handling/Best Practices**: Referenced in Part 3 (full details not in this file).
- **See Also**: Links to TASK_TEMPLATE.md, PROGRESS_UPDATE_TEMPLATE.md, TOOLCHAIN_TEMPLATE.md (implied related sync formats).