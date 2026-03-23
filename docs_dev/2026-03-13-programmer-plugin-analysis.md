# AI Maestro Programmer Agent (AMPA) Plugin Analysis

**Date**: 2026-03-13
**Plugin Version**: 1.0.16
**Location**: `/Users/emanuelesabetta/Code/EMASOFT-PROGRAMMER-AGENT/ai-maestro-programmer-agent`
**Repository**: `https://github.com/Emasoft/ai-maestro-programmer-agent`

---

## 1. Plugin Structure Overview

```
ai-maestro-programmer-agent/
├── .claude-plugin/plugin.json          # Manifest (v1.0.16)
├── agents/
│   └── ampa-programmer-main-agent.md   # Main agent definition (~258 lines)
├── skills/                             # 5 bundled skills
│   ├── ampa-task-execution/            # 6 reference files
│   ├── ampa-orchestrator-communication/# 6 reference files
│   ├── ampa-github-operations/         # 6 reference files
│   ├── ampa-project-setup/             # 7 reference files
│   └── ampa-handoff-management/        # 4 reference files
├── hooks/hooks.json                    # Empty (uses global hooks)
├── scripts/                            # 24 Python scripts (18 CPV + 6 project)
├── docs/
│   ├── AGENT_OPERATIONS.md             # Operational reference
│   ├── FULL_PROJECT_WORKFLOW.md        # 24-step multi-agent workflow
│   ├── ROLE_BOUNDARIES.md             # Cross-plugin role matrix
│   └── TEAM_REGISTRY_SPECIFICATION.md  # Team registry JSON format
├── .github/workflows/                  # 3 CI/CD workflows
├── README.md
└── CHANGELOG.md
```

---

## 2. Task Execution: How Does AMPA Receive Tasks?

### Current Design

AMPA receives tasks **exclusively through AMP messaging** in orchestrated mode:

1. **Check inbox** using the globally installed `agent-messaging` skill
2. Look for messages where `content.type` is `"task"` or `"assignment"`
3. Extract `task_id`, `task_name`, `acceptance_criteria` from the message body
4. Validate required fields, send ACK to orchestrator
5. Execute implementation, then report completion via messaging

In **standalone mode** (no orchestrator detected), tasks come directly from the user via conversation.

### Integration with AI Maestro Kanban

**AMPA does NOT interact with the kanban board directly.**
- AMPA reports completion to AMOA
- AMOA is responsible for updating kanban (moving tasks between columns)
- This is correct per ROLE_BOUNDARIES.md

### Findings

- **No kanban API integration**: AMPA never calls `/api/teams/tasks/` endpoints. This is architecturally correct (AMOA's job) but means AMPA cannot see its own task assignments on the board.
- **No task polling**: AMPA relies entirely on AMP messages for task delivery. If AMOA assigns a task on the kanban but forgets to message AMPA, the task is invisible to AMPA.
- **Task ID format mismatch**: AMPA expects `content.task_id` as a free-form string (e.g., `"TASK-2024-001"`, `"AMPA-001"`). AI Maestro's actual task system uses UUIDs as task IDs. The FULL_PROJECT_WORKFLOW.md references GitHub issue numbers. There is no standardized task ID format.

---

## 3. Status Reporting: How Does AMPA Report Progress?

### Current Design

AMPA sends structured AMP messages to AMOA at defined checkpoints:

| Trigger | Subject Pattern | Priority |
|---------|----------------|----------|
| Task start | `"Status: Task #[issue] in development"` | normal |
| Milestone | `"STATUS: [TASK-ID] - [Phase]"` | normal |
| Extended task (>2h) | Every 1-2 hours | normal |
| Completion | `"COMPLETE: [TASK-ID] - [Description]"` | high |
| Blocker | `"BLOCKER: Task #[issue]"` | urgent |

### Findings

- **AMPA never updates task status on the AI Maestro kanban**. It reports to AMOA who must manually update. This creates a relay bottleneck.
- **Completion messages are very detailed** (branch, commits, files changed, lines added/removed, test count, coverage, PR URL) -- good for auditing but relies entirely on AMOA processing these.
- **No task status API calls**: AMPA doesn't use `PUT /api/teams/tasks/{id}` to update `status: in_progress` or `status: review`. All status changes go through AMOA.

---

## 4. Messaging: AMP Integration

### Current Design

AMPA uses the **globally installed** `agent-messaging` skill for ALL communication. It does NOT hardcode AMP commands or API calls.

Key messaging patterns:
- All messages go to AMOA (orchestrator) as primary recipient
- Direct-to-AMCOS messages only for urgent blockers (exceptional, must be AMOA-authorized)
- Direct-to-AMIA messages only for review requests (exceptional, must be AMOA-authorized)
- Inbox checked at start of every task + on notification banner
- 3-retry policy with 5-second delays on send failure
- Unsent messages saved to `docs_dev/unsent-<timestamp>.md`

### Findings

**GOOD: Fully abstraction-compliant**
- AMPA never hardcodes `amp-send.sh`, `amp-inbox.sh`, or `curl` commands for messaging
- Always defers to the `agent-messaging` skill for syntax
- Uses "read that skill first" pattern -- discovers API at runtime
- Message types and priorities are well-standardized

**ISSUE: No push notification handling**
- AMPA's agent definition mentions checking inbox "at the START of every task" and when the "AI Maestro inbox notification banner" appears
- But there is no hook or automated mechanism to trigger inbox reads when a push notification arrives
- The hooks.json is empty -- AMPA uses no hooks at all
- This means the agent relies on the Claude Code notification banner + the agent reading it in its context window

---

## 5. Governance: Role Checks and Permissions

### Current Design

AMPA defines its own role boundaries in the agent definition and docs:

- Cannot merge PRs (AMIA's job, except standalone mode)
- Cannot assign tasks (AMOA's job)
- Cannot move kanban tasks (AMOA's job)
- Cannot contact user directly (AMAMA's job, except standalone mode)
- Cannot spawn agents (AMCOS's job)
- Cannot make architectural decisions (AMAA's job)

### Findings

**AMPA does NOT use the AI Maestro `team-governance` skill at all.**

This is **architecturally correct** because:
- The `team-governance` skill is "ONLY for agents with MANAGER or CHIEF-OF-STAFF role"
- AMPA is an `implementer` role -- it has no governance permissions
- AMPA should NOT be calling governance API endpoints

**AMPA does NOT check its own governance status.**
- It never calls `GET /api/governance` to verify its permissions
- It never queries its team membership or role
- It relies entirely on its own agent definition to enforce boundaries (self-enforced)
- This is consistent with the CLAUDE.md principle: "Per-agent tool restrictions are self-enforced via agent markdown instructions"

**Governance rules are NOT hardcoded** -- the permission matrix exists in ROLE_BOUNDARIES.md (a shared doc) and in the agent definition. Good.

---

## 6. Hardcoded Assumptions

### API URLs and Endpoints

| File | Hardcoded Value | Issue |
|------|----------------|-------|
| `skills/ampa-handoff-management/SKILL.md` line 24 | `localhost:23000` | Hardcodes AI Maestro host:port |
| `skills/ampa-handoff-management/SKILL.md` line 56 | `curl -s "http://localhost:23000/api/health"` | Hardcodes health check URL |
| `README.md` line 188 | `curl http://localhost:PORT/health` | Uses PORT placeholder (OK) |

**Violation of Plugin Abstraction Principle:**
The handoff management skill hardcodes `localhost:23000` and a direct `curl` API call. Per the Plugin Abstraction Principle:
> "Plugin skills/commands/agents MUST NOT embed API syntax (no curl commands, no endpoint URLs, no header patterns)."

The health check should reference the `agent-messaging` skill's status check operation instead.

### Governance Rules

No governance rules are hardcoded. Role boundaries are described in docs (ROLE_BOUNDARIES.md) and the agent definition, but these are self-documentation -- not hardcoded enforcement logic.

### Other Assumptions

| Assumption | Location | Risk |
|-----------|----------|------|
| 8-column kanban system | AGENT_OPERATIONS.md, FULL_PROJECT_WORKFLOW.md, TEAM_REGISTRY_SPECIFICATION.md | AI Maestro actual kanban has 5 columns (`backlog`, `pending`, `in_progress`, `review`, `completed`), not 8 |
| Handoff directory: `$CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/` | ampa-handoff-management skill | Non-standard path, may not exist |
| Session naming: `<project>-programmer-<number>` | AGENT_OPERATIONS.md | Correct convention but not enforced by AI Maestro |
| Team registry at `.ai-maestro/team-registry.json` | TEAM_REGISTRY_SPECIFICATION.md | AI Maestro uses `/api/teams` endpoint, not file-based team registry |
| GitHub Projects for kanban | Multiple docs | AI Maestro has its own in-app kanban, not GitHub Projects |

---

## 7. What AI Maestro Features AMPA SHOULD Use But Doesn't

### 7.1 AI Maestro Task/Kanban API

AMPA documents an 8-column kanban system targeting **GitHub Projects**, but AI Maestro has its own task system:
- `GET /api/teams/tasks/{teamId}` -- list tasks
- `POST /api/teams/tasks/{teamId}` -- create task
- `PUT /api/teams/tasks/{teamId}/{taskId}` -- update task status
- `DELETE /api/teams/tasks/{teamId}/{taskId}` -- delete task

AMPA could (should?) at minimum **read** its assigned tasks from the AI Maestro kanban to verify its assignment, even if it doesn't write status directly.

### 7.2 AI Maestro Agent Registry

AI Maestro has an agent registry at `~/.aimaestro/agents/registry.json` with agent metadata. AMPA documents its own `team-registry.json` format in `.ai-maestro/team-registry.json` within the repo. These are **two different systems** and they don't align:

| Feature | AI Maestro Registry | AMPA Team Registry |
|---------|--------------------|--------------------|
| Location | `~/.aimaestro/agents/registry.json` | `.ai-maestro/team-registry.json` |
| Scope | Global, all agents | Per-repo, per-team |
| Format | AI Maestro proprietary | AMPA-defined JSON |
| Maintained by | AI Maestro server | AMCOS (manually) |

AMPA's team registry spec may be aspirational/planned. It is NOT integrated with AI Maestro's actual agent registry.

### 7.3 AI Maestro Agent Lifecycle (`aimaestro-agent.sh`)

AMPA documents that AMCOS spawns it using the `ai-maestro-agents-management` skill (which wraps `aimaestro-agent.sh`), but AMPA itself:
- Never calls `aimaestro-agent.sh` (correct -- it shouldn't create/manage agents)
- Never checks its own registration status with AI Maestro
- Never auto-registers on startup

### 7.4 Team Membership Discovery

AMPA could call `GET /api/teams` to discover which team it belongs to and who its teammates are, rather than relying on a file-based `team-registry.json` that AMCOS must manually maintain.

### 7.5 Agent Subconscious / Memory

AI Maestro has a subconscious/memory system with CozoDB and conversation indexing. AMPA has no integration with this -- it uses its own handoff management for context transfer. This is acceptable since the subconscious is managed by AI Maestro core, not by plugins.

### 7.6 Hooks

AMPA's `hooks/hooks.json` is empty. AI Maestro supports hooks that could:
- Auto-check inbox when a session starts
- Auto-register messaging identity on agent creation
- Run pre-push validation automatically

Currently AMPA relies on global hooks only.

---

## 8. Kanban Column Mismatch (CRITICAL)

**This is the most significant discrepancy found.**

AMPA documents an **8-column** kanban system:
```
Backlog -> Todo -> In Progress -> AI Review -> Human Review -> Merge/Release -> Done -> Blocked
```

AI Maestro's actual task system uses **5 statuses**:
```
backlog -> pending -> in_progress -> review -> completed
```

This means:
- AMPA agents will reference columns (`ai-review`, `human-review`, `merge-release`) that don't exist in AI Maestro's kanban
- AMPA's task routing rules (small tasks skip Human Review) won't work because the columns don't exist
- The `blocked` status exists as a separate column in AMPA's model but is not a status in AI Maestro's `TaskStatus` type
- `todo` vs `pending` naming mismatch
- `done` vs `completed` naming mismatch

This mismatch means the FULL_PROJECT_WORKFLOW.md is aspirational documentation, not reflecting AI Maestro's actual implementation. AMOA (or any agent following this workflow) will encounter errors when trying to move tasks to non-existent columns.

---

## 9. Compliance with Plugin Abstraction Principle

### Score: 90% Compliant

**Compliant:**
- AMPA skills/commands/agents do NOT embed AMP messaging API syntax (no curl, no endpoints, no headers for messaging)
- AMPA defers to the globally installed `agent-messaging` skill for messaging operations
- AMPA does not hardcode governance rules -- describes them as role descriptions
- AMPA references AI Maestro skills by name, not by implementation

**Non-compliant:**
- `skills/ampa-handoff-management/SKILL.md` hardcodes `localhost:23000` and `curl -s "http://localhost:23000/api/health"` (2 occurrences)
- Multiple docs hardcode the 8-column kanban system (which is not AI Maestro's actual system)
- `docs/TEAM_REGISTRY_SPECIFICATION.md` defines a file-based team registry format that is not used by AI Maestro

---

## 10. Overall Assessment

### Strengths

1. **Well-structured plugin**: Clean separation of agent definition, skills, reference files, docs, and scripts
2. **Dual-mode operation**: Standalone and orchestrated modes are well-designed -- the agent gracefully degrades when no orchestrator is present
3. **Token-efficient design**: File-based reporting, lazy reference loading, stdout capture -- all reduce token waste
4. **Messaging abstraction**: Correctly defers to the global `agent-messaging` skill instead of hardcoding AMP syntax
5. **Clear role boundaries**: The agent knows what it can and cannot do
6. **Comprehensive error handling**: Every skill has error tables, escalation procedures, and retry policies
7. **Cross-platform ready**: All scripts are Python (not bash), with Windows support considered
8. **CPV validation suite**: 18 validation scripts ensure plugin quality

### Issues

1. **CRITICAL: Kanban column mismatch** -- 8-column system documented vs 5-status system in AI Maestro
2. **MODERATE: Hardcoded localhost:23000** in handoff management skill (violates Plugin Abstraction Principle)
3. **MODERATE: Team registry format** not aligned with AI Maestro's actual agent/team storage
4. **LOW: No hooks defined** -- could benefit from auto-inbox-check and auto-registration hooks
5. **LOW: No task read-back** -- AMPA cannot verify its kanban assignments without AMOA forwarding them
6. **LOW: /api/health referenced** -- AI Maestro's CLAUDE.md explicitly states "Do NOT use `/api/health` to check if the site is live (it doesn't exist). Use `/api/sessions` instead."

### Recommendations

1. **Align kanban columns** with AI Maestro's actual `TaskStatus` type: `backlog | pending | in_progress | review | completed`
2. **Remove hardcoded localhost:23000** from handoff management skill -- use `agent-messaging` skill's status check instead
3. **Remove `/api/health` reference** -- replace with `agent-messaging` skill's connectivity check
4. **Consider adding a hook** that auto-checks inbox on session start (PostToolUse on first Bash command?)
5. **Consider adding task read-back** -- AMPA could read its assignments from AI Maestro's task API (read-only) to verify it has the right task
6. **Update TEAM_REGISTRY_SPECIFICATION.md** to note it is aspirational/planned, or align with AI Maestro's actual `GET /api/teams` endpoints

---

## 11. File Inventory

### Agent Definition
- `/agents/ampa-programmer-main-agent.md` -- 258 lines, well-structured with frontmatter, dual-mode, token budget, messaging tables

### Skills (5)
| Skill | SKILL.md Lines | Reference Files | Coverage |
|-------|---------------|-----------------|----------|
| ampa-task-execution | 89 | 6 | Task receipt through completion |
| ampa-orchestrator-communication | 82 | 6 | All AMOA messaging patterns |
| ampa-github-operations | 80 | 6 | Clone through PR review response |
| ampa-project-setup | 82 | 7 | Language detection through SERENA activation |
| ampa-handoff-management | 84 | 4 | Context transfer, bug reports, work state |

### Documentation (4)
| Doc | Lines | Purpose |
|-----|-------|---------|
| AGENT_OPERATIONS.md | 585 | Single source of truth for AMPA ops |
| FULL_PROJECT_WORKFLOW.md | 479 | 24-step cross-agent workflow |
| ROLE_BOUNDARIES.md | 228 | Cross-plugin role matrix |
| TEAM_REGISTRY_SPECIFICATION.md | 449 | Team registry JSON spec |

### Scripts (7 project scripts)
| Script | Purpose |
|--------|---------|
| validate_plugin.py | CPV entry point |
| pre-push-hook.py | Git pre-push validation |
| sync_cpv_scripts.py | Upstream CPV sync |
| test_order_pipeline.py | OrderPipeline tests |
| lint_files.py | Multi-language linting |
| gitignore_filter.py | .gitignore pattern filtering |
| smart_exec.py | Cross-platform execution |

### CI/CD Workflows (3)
| Workflow | Trigger | Purpose |
|----------|---------|---------|
| validate.yml | Push to main, PRs | Plugin validation |
| release.yml | Version tags (v*) | GitHub releases |
| notify-marketplace.yml | Push to main (DISABLED) | Marketplace notification |
