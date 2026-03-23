# Architect Plugin (AMAA) — Deep Analysis

**Date**: 2026-03-13
**Plugin**: `ai-maestro-architect-agent` v2.1.3
**Location**: `/Users/emanuelesabetta/Code/EMASOFT-ARCHITECT-AGENT/ai-maestro-architect-agent`
**Repo**: `https://github.com/Emasoft/ai-maestro-architect-agent`

---

## 1. Plugin Structure Overview

```
ai-maestro-architect-agent/
├── .claude-plugin/plugin.json          # Marketplace manifest (v2.1.3)
├── agents/                             # 6 agent definitions
│   ├── amaa-architect-main-agent.md    # Main architect (model: opus)
│   ├── amaa-planner.md                 # Planning agent (model: sonnet)
│   ├── amaa-documentation-writer.md    # Doc writer (model: opus)
│   ├── amaa-api-researcher.md          # API research (model: opus)
│   ├── amaa-modularizer-expert.md      # Module decomposition (model: opus)
│   └── amaa-cicd-designer.md           # CI/CD design (model: opus)
├── commands/                           # 4 slash commands
│   ├── amaa-start-planning.md          # /amaa-start-planning
│   ├── amaa-add-requirement.md         # /amaa-add-requirement
│   ├── amaa-modify-requirement.md      # /amaa-modify-requirement
│   └── amaa-remove-requirement.md      # /amaa-remove-requirement
├── hooks/hooks.json                    # 1 hook: Stop (exit blocker)
├── skills/                             # 13 skills × 2 (each has -ops variant) = 26 skill dirs
├── scripts/                            # ~55 Python scripts (mix of plugin-specific + CPV tooling)
├── lib/                                # Shared Python lib (cross_platform, thresholds, report_utils)
├── docs/                               # 4 reference docs (AGENT_OPERATIONS, ROLE_BOUNDARIES, etc.)
└── tests/                              # 2 test files
```

---

## 2. Design Document Workflow

### How It Creates Actionable Design Documents

**Lifecycle**: `DRAFT → REVIEW → APPROVED → IMPLEMENTING → COMPLETED → ARCHIVED`

**Document types**: Requirements (REQ), Specifications (SPEC), Architecture (ARCH), PDR (Project Design Records), Handoffs (HAND), Decisions (DEC), Memory (MEM)

**UUID format**: `{TYPE}-{YYYYMMDD}-{NNNN}` (e.g., `REQ-20260129-0001`)

**Workflow**:
1. AMAA receives requirements from AMCOS (via AMP message)
2. Runs `/amaa-start-planning` — creates `.claude/orchestrator-plan-phase.local.md` state file
3. Uses `/amaa-add-requirement`, `/amaa-modify-requirement`, `/amaa-remove-requirement` to track plan items
4. Delegates to sub-agents:
   - `amaa-planner` — Creates roadmaps with risk assessments
   - `amaa-api-researcher` — Researches external APIs, produces 5-file documentation sets
   - `amaa-modularizer-expert` — Decomposes into modules with dependency graphs
   - `amaa-cicd-designer` — Designs CI/CD pipelines
   - `amaa-documentation-writer` — Writes technical docs using templates (Module Spec, API Contract, ADR)
5. Each design doc gets frontmatter with UUID, type, status, timestamps, author
6. Validation via `amaa_design_validate.py` checks frontmatter compliance
7. Handoff doc created in `docs_dev/design/handoff-{uuid}.md`
8. Sends completion message to AMCOS via AMP

**Output location**: All artifacts in `docs_dev/design/` with subdirectories for requirements, handoffs, decisions, etc.

**Key scripts**:
- `amaa_design_create.py` — Create design document from template
- `amaa_design_validate.py` — Validate frontmatter compliance
- `amaa_design_search.py` — Search by UUID, type, status, keyword
- `amaa_design_lifecycle.py` — Manage state transitions
- `amaa_design_handoff.py` — Export/sanitize design docs for GitHub issue attachment
- `amaa_design_uuid.py` — Generate/validate UUIDs
- `amaa_design_transition.py` — Handle state transitions
- `amaa_design_version.py` — Version management
- `amaa_design_export.py` — Export design documents
- `amaa_compile_handoff.py` — Compile handoff packages
- `amaa_requirement_analysis.py` — Requirement analysis tooling

---

## 3. Messaging Integration

### How It Communicates

**Transport**: AMP CLI scripts (`amp-send`, `amp-inbox`, `amp-read`, `amp-reply`)

**Python wrappers**:
- `amaa_send_message.py` — Wraps `amp-send` with argparse CLI
- `amaa_check_inbox.py` — Wraps `amp-inbox` with filtering/formatting

**Compliance with Plugin Abstraction Principle**: **GOOD** — The scripts call `amp-send` and `amp-inbox` CLI commands (Layer 2 scripts), not the AI Maestro API directly. No hardcoded `curl` commands to `localhost:23000`.

**Message templates** (defined in `skills/amaa-design-communication-patterns/references/ai-maestro-message-templates.md`):
- 1.1: Acknowledgment (receipt of design request)
- 1.2: Clarification request (ambiguous requirements)
- 1.3: Design completion notification
- 1.4: Handoff ready notification
- 1.5: Blocker report
- 1.6: ACK verification
- 1.7: Retry on no ACK (30s timeout)
- 1.8: Escalation after retry failure

**ACK Protocol**: Send → Wait 30s → Check for ACK → Retry once → Wait 30s → Escalate to AMCOS

**Message JSON structure**:
```json
{
  "type": "<acknowledgment|clarification_request|design_complete|handoff|blocker|retry|escalation>",
  "message": "<message text>"
}
```

### Communication Hierarchy

**AMAA communicates ONLY with AMCOS** — All messages go to/from AMCOS (Chief of Staff). AMAA does NOT communicate directly with AMAMA, AMOA, or AMIA.

---

## 4. Governance & Permissions

### Current State: **NO governance integration**

**AMAA does NOT**:
- Check team membership before operating
- Verify its role permissions via the AI Maestro governance API
- Query the `team-governance` skill for authorization rules
- Validate that it has been properly assigned to a team
- Check governance approval status before sending handoffs
- Use AI Maestro's team/governance endpoints

**Self-enforced constraints** (via agent markdown instructions only):
- "PROJECT-LINKED: One AMAA per project"
- "AMCOS-ONLY COMMS: Receive work from AMCOS only. Report back to AMCOS only"
- "NO TASK ASSIGNMENT: You do NOT assign tasks. That's AMOA's job"
- These are instruction-based, not API-enforced

**Role boundary docs** (`docs/ROLE_BOUNDARIES.md`, `docs/FULL_PROJECT_WORKFLOW.md`, `docs/TEAM_REGISTRY_SPECIFICATION.md`) define the theoretical hierarchy but are purely informational — no runtime enforcement.

---

## 5. Hardcoded Assumptions

### 5.1 Hardcoded Agent Names

| Location | Hardcoded Name | Issue |
|----------|---------------|-------|
| Message templates (`ai-maestro-message-templates.md`) | `ecos` as AMCOS recipient | Hardcodes the AMCOS session name instead of looking it up from team registry |
| `AGENT_OPERATIONS.md` | `orchestrator-master` as AMCOS recipient | Different hardcoded name than templates — inconsistency |
| `op-send-ai-maestro-message.md` | `orchestrator-master`, `helper-agent-generic`, `amia-integrator-main-agent` | Multiple hardcoded target names |
| `amaa_send_message.py` | Falls back to `"architect-agent"` | Hardcoded fallback sender name |
| `amaa_check_inbox.py` | Falls back to `"architect-agent"` | Hardcoded fallback sender name |

**Critical inconsistency**: The message templates use `ecos` as the AMCOS target, while AGENT_OPERATIONS.md uses `orchestrator-master`. These are two different agents (AMCOS vs AMOA). The templates are correct (AMAA→AMCOS), but AGENT_OPERATIONS.md incorrectly sends to AMOA directly.

### 5.2 Hardcoded Paths

| Item | Hardcoded Value |
|------|----------------|
| Design output | `docs_dev/design/` |
| Plan state file | `.claude/orchestrator-plan-phase.local.md` |
| Session state | `.claude/amaa-session-state.local.md` |
| Design index | `docs_dev/design/index.json` |
| Team registry | `.ai-maestro/team-registry.json` |

### 5.3 Hardcoded Status Labels

`amaa_github_sync_status.py` hardcodes status labels: `status:draft`, `status:review`, `status:approved`, etc. These should ideally be discovered from AI Maestro's label taxonomy.

### 5.4 Kanban Columns

Both `AGENT_OPERATIONS.md` and `FULL_PROJECT_WORKFLOW.md` hardcode an 8-column kanban system. This differs from AI Maestro's current 5-status task system (`backlog`, `pending`, `in_progress`, `review`, `completed`). **This is a significant drift.**

### 5.5 No Hardcoded API URLs

**GOOD**: No `localhost:23000`, no `AIMAESTRO_API`, no direct `curl` calls to the AI Maestro REST API. All messaging goes through `amp-send`/`amp-inbox` CLI.

---

## 6. What AI Maestro Features It SHOULD Use But Doesn't

### 6.1 Team Governance API

AMAA should:
- Query its team membership on startup: `GET /api/governance/teams/{teamId}/members`
- Verify it has the `architect` role before accepting design tasks
- Check that the sender of a design request is actually AMCOS for this team
- Validate team membership before sending handoff documents

### 6.2 `team-governance` Skill

AMAA should reference the global `team-governance` skill instead of hardcoding:
- Role boundaries (currently duplicated in `docs/ROLE_BOUNDARIES.md`)
- Communication hierarchy (currently duplicated in main agent markdown)
- Permission matrices (currently self-enforced via instructions)

### 6.3 Team Registry API

Instead of reading `.ai-maestro/team-registry.json` from the local filesystem, AMAA should:
- Use `GET /api/teams` to discover its team
- Use `GET /api/teams/{teamId}` to get team members and their roles
- Look up AMCOS dynamically instead of hardcoding `ecos` or `orchestrator-master`

### 6.4 Agent Identity from AI Maestro

AMAA hardcodes fallback to `"architect-agent"`. It should:
- Use `AIMAESTRO_AGENT` environment variable
- Query AI Maestro's agent registry for its own identity
- Derive its session name from the tmux session, not a hardcoded default

### 6.5 Design Document Registration with AI Maestro

Design documents could be registered with AI Maestro's API so other agents can discover them without filesystem access. Currently, handoff documents are only discoverable if the receiving agent has access to the same filesystem.

### 6.6 Task/Kanban Integration

The plugin references an 8-column kanban system that doesn't match AI Maestro's actual `useTasks` hook with 5 statuses. AMAA should use AI Maestro's task API instead of assuming GitHub Projects columns.

### 6.7 Subconscious/Memory Integration

AMAA has its own session memory system (`.claude/amaa-session-state.local.md`, `docs_dev/design/index.json`) that is completely separate from AI Maestro's CozoDB-based memory system. It should integrate with:
- AI Maestro's `maintainMemory()` for semantic search across design decisions
- AI Maestro's conversation indexing for design history

---

## 7. Stop Hook Analysis

The `amaa_stop_check.py` hook blocks session exit when:
1. Design documents are in DRAFT state
2. Claude Tasks are pending/in-progress
3. Requirements lack corresponding design docs
4. GitHub issues labeled `architecture`/`design` are open and assigned to `@me`

**Implementation quality**: Good — reads from stdin as JSON (correct hook protocol), checks multiple locations for design docs, uses `gh` CLI for GitHub checks, limits output to 10 blockers, returns proper JSON with `decision: block`.

**Missing**: Does not notify AMCOS or AI Maestro that exit was blocked. Should send an AMP message when blocking.

---

## 8. Sub-Agent Architecture

All 5 sub-agents follow consistent patterns:
- Receive tasks from main agent only
- Write output to `docs_dev/` as timestamped .md files
- Return minimal 2-3 line reports
- Never execute code (design-only constraint)
- Reference skills by folder name (correct pattern)

**Model selection**:
- `amaa-planner` uses Sonnet (cheaper, adequate for planning)
- All others use Opus (needed for complex analysis)

**RULE 14**: All agents enforce "User Requirements Immutable" — they STOP and escalate rather than modifying user requirements. This is well-implemented with escalation paths.

---

## 9. GitHub Integration

Three scripts handle GitHub integration:
- `amaa_github_issue_create.py` — Create issue from design doc UUID
- `amaa_github_attach_document.py` — Attach design to existing issue
- `amaa_github_sync_status.py` — Sync design status ↔ issue labels

All use `gh` CLI (not GitHub API directly), which is the correct approach.

**Label taxonomy** defined in `amaa-label-taxonomy` skill with operations for creating component, status, priority, and type labels.

---

## 10. Key Findings Summary

### Strengths

1. **Clean AMP integration**: Uses `amp-send`/`amp-inbox` CLI, not direct API calls. Follows Plugin Abstraction Principle for messaging.
2. **Well-structured design lifecycle**: DRAFT→REVIEW→APPROVED→IMPLEMENTING→COMPLETED→ARCHIVED with validation scripts
3. **Consistent sub-agent pattern**: All sub-agents follow the same minimal-report protocol
4. **RULE 14 enforcement**: Strong protection of user requirements immutability
5. **GitHub integration via `gh` CLI**: No hardcoded GitHub API tokens or URLs
6. **Comprehensive documentation**: AGENT_OPERATIONS.md, ROLE_BOUNDARIES.md, TEAM_REGISTRY_SPECIFICATION.md, FULL_PROJECT_WORKFLOW.md

### Issues

1. **CRITICAL: No governance integration** — Does not use AI Maestro's governance API or `team-governance` skill. All role enforcement is instruction-based (self-enforced).
2. **CRITICAL: Hardcoded recipient names** — `ecos` in templates vs `orchestrator-master` in AGENT_OPERATIONS.md. Inconsistent and brittle.
3. **HIGH: Kanban column mismatch** — Plugin assumes 8-column kanban (backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked) but AI Maestro's task system uses 5 statuses (backlog, pending, in_progress, review, completed).
4. **HIGH: Duplicate role boundary docs** — `docs/ROLE_BOUNDARIES.md` and `docs/FULL_PROJECT_WORKFLOW.md` duplicate information that should come from AI Maestro's `team-governance` skill. These will inevitably drift.
5. **MEDIUM: No team registry API usage** — Reads `.ai-maestro/team-registry.json` from filesystem instead of using AI Maestro's team API.
6. **MEDIUM: Separate memory system** — Own session state files instead of integrating with AI Maestro's CozoDB memory.
7. **MEDIUM: Stop hook doesn't notify** — Blocks exit but doesn't send AMP message about the block.
8. **LOW: Hardcoded fallback identity** — `"architect-agent"` fallback in messaging scripts.
9. **LOW: Status label hardcoding** — `amaa_github_sync_status.py` hardcodes status labels.

### Recommendations

1. **Remove hardcoded recipient names** — Look up AMCOS dynamically from team registry API or AMP discovery.
2. **Add governance checks** — On startup, verify team membership and role assignment via AI Maestro API.
3. **Reference `team-governance` skill** — Instead of embedding role boundaries in docs, reference the global skill.
4. **Align kanban columns** — Match AI Maestro's 5-status system or use the task API.
5. **Remove duplicate role docs** — Or clearly mark them as "local copy, authoritative source is team-governance skill".
6. **Integrate memory** — Use AI Maestro's subconscious memory for design decision persistence.
7. **Send AMP notification on stop-hook block** — Let AMCOS know the architect couldn't exit cleanly.

---

## 11. File Index

### Agents
- `/agents/amaa-architect-main-agent.md` — Main agent, skills: design-lifecycle, communication-patterns, session-memory, github-integration, hypothesis-verification, design-management, label-taxonomy, requirements-analysis
- `/agents/amaa-planner.md` — Sonnet, skills: session-memory, planning-patterns
- `/agents/amaa-documentation-writer.md` — Opus, skills: documentation-writing, session-memory
- `/agents/amaa-api-researcher.md` — Opus, skills: api-research, session-memory, planning-patterns
- `/agents/amaa-modularizer-expert.md` — Opus, skills: session-memory, modularization
- `/agents/amaa-cicd-designer.md` — Opus, skills: session-memory, cicd-design

### Commands
- `/commands/amaa-start-planning.md` — Calls `amaa_start_planning.py`
- `/commands/amaa-add-requirement.md` — Calls `amaa_modify_requirement.py add`
- `/commands/amaa-modify-requirement.md` — Calls `amaa_modify_requirement.py modify`
- `/commands/amaa-remove-requirement.md` — Calls `amaa_modify_requirement.py remove`

### Key Skills (13 skills, each with -ops variant)
- `amaa-design-lifecycle` — Design doc state machine
- `amaa-design-communication-patterns` — AMP messaging templates and protocols
- `amaa-design-management` — UUID generation, document CRUD, search
- `amaa-session-memory` — Session state persistence
- `amaa-requirements-analysis` — Requirement patterns
- `amaa-planning-patterns` — Planning methodology (includes bun/LSP reference docs)
- `amaa-documentation-writing` — Doc templates (Module Spec, API Contract, ADR)
- `amaa-api-research` — API research workflow
- `amaa-modularization` — Module decomposition patterns
- `amaa-cicd-design` — CI/CD pipeline design
- `amaa-github-integration` — GitHub issue/project integration
- `amaa-hypothesis-verification` — Verification before handoff
- `amaa-label-taxonomy` — GitHub label management

### Key Scripts (amaa-specific)
- `amaa_send_message.py` — Send AMP message (wraps amp-send)
- `amaa_check_inbox.py` — Check AMP inbox (wraps amp-inbox)
- `amaa_design_create.py` — Create design document
- `amaa_design_validate.py` — Validate design document
- `amaa_design_search.py` — Search design documents
- `amaa_design_lifecycle.py` — State transitions
- `amaa_design_handoff.py` — Export/attach design to GitHub
- `amaa_design_uuid.py` — UUID generation/validation
- `amaa_design_transition.py` — State transition management
- `amaa_design_version.py` — Version management
- `amaa_design_export.py` — Export design documents
- `amaa_compile_handoff.py` — Compile handoff packages
- `amaa_requirement_analysis.py` — Requirement analysis
- `amaa_start_planning.py` — Initialize plan phase
- `amaa_modify_requirement.py` — Add/modify/remove requirements
- `amaa_stop_check.py` — Stop hook implementation
- `amaa_github_issue_create.py` — Create GitHub issue from design
- `amaa_github_attach_document.py` — Attach design to issue
- `amaa_github_sync_status.py` — Sync status ↔ labels
- `amaa_init_design_folders.py` — Initialize design directory structure

### Hooks
- `hooks.json` — Stop hook runs `amaa_stop_check.py` (5s timeout)

### Docs
- `AGENT_OPERATIONS.md` — Comprehensive operations guide
- `ROLE_BOUNDARIES.md` — Role hierarchy and permissions
- `TEAM_REGISTRY_SPECIFICATION.md` — Team registry JSON schema
- `FULL_PROJECT_WORKFLOW.md` — End-to-end workflow from requirements to delivery

### Lib
- `__init__.py` — Exports cross_platform and thresholds
- `cross_platform.py` — atomic_write_json, atomic_write_text, run_command
- `thresholds.py` — PlanningConfig, TaskComplexityConfig, TimeoutsConfig
- `report_utils.py` — Report formatting utilities
