# Decoupling Changes — AMAMA (emasoft-assistant-manager-agent) v1.1.3
Date: 2026-02-27

## Design Principle

> **Plugin skills should reference AI Maestro's global skills by name (not embed API syntax).**
> **Plugin hooks should call global scripts (not curl).**
> **Plugin files should reference authoritative APIs (not local files).**
>
> See `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`.

Plugins that embed:
- Raw bash/tmux/gh/curl commands → Prevents skill composition and breaks when APIs change
- Hardcoded governance rules, message schemas, timeouts → Creates multiple sources of truth
- Local file reads → Bypasses API layer and creates sync issues

This decoupling specification corrects 12 files across 4 violation categories.

## AI Maestro Global Skills Referenced

The plugin must delegate to these authoritative skills:

| Skill | Responsibility | Location |
|-------|-----------------|----------|
| `team-governance` | Team CRUD, COS assignment, governance requests, transfers, auth, role definitions, permission matrices | `~/.claude/skills/team-governance/` |
| `ai-maestro-agents-management` | Agent lifecycle, session management, plugin installation, agent registry (authoritative source for agent identity) | `~/.claude/skills/ai-maestro-agents-management/` |
| `agent-messaging` | Inter-agent messaging, AMP protocol, message format enforcement, ACK handling | `~/.claude/skills/agent-messaging/` |

## Violation Categories

### HARDCODED_GOVERNANCE (6 instances)
Role hierarchies, permission matrices, approval categories, kanban columns, task statuses defined in plugin → should come from `team-governance` skill.

### HARDCODED_AMP (8 instances)
Message schemas, ACK formats, timeout values, message field definitions embedded in skills → should come from `agent-messaging` skill.

### API_SYNTAX (4 files)
Raw bash/tmux/gh/curl commands with explicit flags → should reference global skills or describe capabilities generically.

### LOCAL_REGISTRY (3 instances)
Team data from `.emasoft/` local files → should call `team-governance` API instead.

---

## Change Specification

For each file below:
- **File path** (relative to plugin root at `/Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent`)
- **Current content summary** (what's wrong)
- **Required change** (specific replacement)
- **Priority**: CRITICAL / HIGH / MEDIUM / LOW

---

### 1. docs/TEAM_REGISTRY_SPECIFICATION.md — **CRITICAL**

**Violation types:** LOCAL_REGISTRY, API_SYNTAX

**Current state:**
- Defines `.emasoft/team-registry.json` as the source of truth for team metadata
- Contains Python code that reads `.emasoft/team-registry.json` directly
- Specifies team data schema (id, name, members, governance config)
- Treats local file as authoritative

**Required change:**
```markdown
# TEAM_REGISTRY_SPECIFICATION

## Source of Truth
Team data is managed by AI Maestro's `team-governance` skill. The authoritative API is:
- Endpoint: `/api/teams` (via `team-governance` skill)
- CLI: `amp-query.sh teams <team-id>` (via `agent-messaging` for federation)
- Use the `team-governance` skill to query, create, update team configurations

## Local Cache (Optional)
The `.emasoft/team-registry.json` file may be used as a LOCAL CACHE for performance, but it is NOT the source of truth. Always verify critical team data through the `team-governance` API.

## Schema (For Reference Only)
[Keep current schema for reference, but add:]
**NOTE:** This schema is informational. The authoritative schema is defined by `team-governance` skill in `~/.claude/skills/team-governance/types.ts`.

## Integration Pattern
Instead of:
```python
import json
with open('~/.emasoft/team-registry.json') as f:
    teams = json.load(f)
```

Use:
```bash
# Query team via skill
amp-query.sh teams <team-id>

# Or in Claude Code skill:
source ~/.claude/skills/team-governance/SKILL.md
query_team_by_id <team-id>
```
```

**Rationale:** Removes local file as single source of truth; directs to API layer.

---

### 2. docs/ROLE_BOUNDARIES.md — **HIGH**

**Violation types:** HARDCODED_GOVERNANCE

**Current state:**
- Defines complete role hierarchy (Manager, Lead, Engineer, etc.)
- Hardcodes permission matrix (who can approve what)
- Lists interaction patterns and validation rules
- Presented as authoritative enforcement rules

**Required change:**
```markdown
# ROLE BOUNDARIES — Informational Reference

## IMPORTANT: NOT ENFORCED BY THIS PLUGIN
This document describes role semantics and design intent. **Enforcement is the responsibility of the `team-governance` skill.**

Do NOT use role definitions from this document to make authorization decisions. Always query `team-governance` for:
- Role definitions
- Permission matrices
- Approval authorities
- Role-to-action mappings

## Semantic Description (Design Intent)
[Keep current role descriptions, but add prefix:]
"The following describes the intended semantics of roles in the AMAMA ecosystem. For authoritative definitions, see `team-governance` skill."

## Querying Role Definitions
```bash
# Query authoritative role definitions
source ~/.claude/skills/team-governance/SKILL.md
get_role_definition <role-name>
query_role_permissions <role-name> <resource-type>
```

## Implementation Note
When implementing role-based workflows:
1. Query `team-governance` for authoritative role definitions
2. Query `team-governance` for permission matrices
3. Query `team-governance` for approval authorities
4. Do NOT embed role definitions in AMAMA code
```

**Rationale:** Makes it clear that this document is informational, not enforcement; directs to API for decisions.

---

### 3. shared/message_templates.md — **HIGH**

**Violation types:** HARDCODED_AMP

**Current state:**
- Defines 8 complete AMP message types (task_assignment, approval_request, status_update, etc.)
- Specifies JSON wire format with field names, types, valid values
- Defines ACK message schema with timeout requirements
- Hardcodes field validation rules

**Required change:**
```markdown
# Message Templates — Informational Reference

## IMPORTANT: Message Format Authority
Message formats are defined and enforced by the `agent-messaging` skill. This document is INFORMATIONAL ONLY.

**Use the `agent-messaging` skill for all AMP operations:**
- Sending messages: `amp-send.sh <to> <subject> <message>`
- ACK handling: `agent-messaging` skill manages acknowledgments automatically
- Message validation: `agent-messaging` skill enforces wire format

## Semantic Intent (Design Reference)

The following describes the intended message types in the AMAMA workflow. The authoritative message formats are defined in:
- `~/.claude/skills/agent-messaging/schema.json` (wire formats)
- `~/.claude/skills/agent-messaging/SKILL.md` (capabilities and constraints)

### Message Type: Task Assignment

**Semantic intent:** One ECOS agent assigns a task to another.

**To send:**
```bash
source ~/.claude/skills/agent-messaging/SKILL.md
send_message_to <recipient-agent> \
  --subject "Task Assignment: <task-name>" \
  --content "Complete task: <description>"
```

The `agent-messaging` skill handles message formatting, serialization, and delivery.

[Repeat for remaining 7 message types, each with "To send:" → skill reference, NOT raw JSON schema]

## ACK Handling (Automatic)
The `agent-messaging` skill manages acknowledgments automatically. Do NOT define ACK timeouts or formats in AMAMA code.
```

**Rationale:** Removes hardcoded message schemas; directs to skill for all message operations.

---

### 4. skills/eama-ecos-coordination/references/creating-ecos-procedure.md — **HIGH**

**Violation types:** API_SYNTAX

**Current state:**
```bash
mkdir -p ~/.aimaestro/agents/{agent-id}/
cp -r /path/to/agent-template ~/.aimaestro/agents/{agent-id}/
tmux new-session -s {agent-name}
tmux send-keys -t {agent-name} 'cd ~/.aimaestro/agents/{agent-id} && claude' C-m
```

**Required change:**
```markdown
# Creating ECOS Procedure

## DO NOT use raw mkdir/cp/tmux commands

To create a new ECOS agent, use the `ai-maestro-agents-management` skill:

```bash
source ~/.claude/skills/ai-maestro-agents-management/SKILL.md
create_agent \
  --name <agent-name> \
  --working-dir <optional-path> \
  --plugins eama  # Installs AMAMA plugin automatically
```

The `ai-maestro-agents-management` skill handles:
- Directory creation in `~/.aimaestro/agents/`
- Agent registry enrollment
- Plugin installation
- tmux session initialization
- Claude Code CLI startup

## Manual Fallback (Diagnostic Only)
If the skill fails, manual tmux commands can be used for diagnosis. See `spawn-failure-recovery.md`.
```

**Rationale:** Replaces raw CLI commands with skill abstraction; removes operator burden for directory management.

---

### 5. skills/eama-ecos-coordination/references/spawn-failure-recovery.md — **HIGH**

**Violation types:** API_SYNTAX

**Current state:**
- Raw tmux commands: `tmux list-sessions`, `tmux kill-session`, `tmux attach -t`
- Raw filesystem commands: `ls -la ~/.aimaestro/agents/`, file permission checks
- Diagnostic procedures using raw bash

**Required change:**
```markdown
# Spawn Failure Recovery

## Primary Recovery Method: Use the Skill

If agent creation fails, first check with `ai-maestro-agents-management` skill:

```bash
source ~/.claude/skills/ai-maestro-agents-management/SKILL.md
diagnose_agent_failure <agent-name>
cleanup_agent <agent-name>
create_agent <agent-name>
```

The skill provides:
- Diagnostic output (directory state, session state, plugin installation status)
- Automated cleanup
- Re-creation with diagnostics

## Manual Diagnostics (Fallback Only)

**⚠️ These are manual diagnostic procedures. Use only if the skill fails to diagnose.**

### List all agents (tmux sessions)
```bash
tmux list-sessions
```
Shows session names matching ECOS agent identities.

### Kill a broken session (manual cleanup)
```bash
tmux kill-session -t {agent-name}
```
Use only if `ai-maestro-agents-management cleanup_agent` fails.

### Verify agent directory
```bash
ls -la ~/.aimaestro/agents/{agent-id}/
```
Check that directory exists and contains agent files. Use for diagnosis only.

## When to Use Manual Diagnostics
- Skill error messages reference specific file paths
- You need to inspect raw file state
- Recovering from severe corruption (requires `root` or file permissions adjustment)

Otherwise, always use `ai-maestro-agents-management` skill.
```

**Rationale:** Marks raw CLI commands as "diagnostic fallback only"; makes skill the primary method.

---

### 6. skills/eama-label-taxonomy/SKILL.md — **HIGH**

**Violation types:** API_SYNTAX, HARDCODED_GOVERNANCE

**Current state:**
- Embeds raw `gh issue create` / `gh issue edit` / `gh issue list` commands with explicit flags
- Hardcodes 8-column kanban system (backlog, pending, in_progress, review, completed, blocked, merged, archived)
- Hardcodes EAMA as approval authority
- Hardcodes label taxonomy (feature, bug, governance, ecos, etc.)

**Required change:**
```markdown
# eama-label-taxonomy Skill

## GitHub Issue Management

Instead of embedding `gh` commands, describe capabilities:

### Create an Issue
Capability: Create GitHub issues with appropriate labels and project assignments.

Usage: "Create a GitHub issue about [feature/bug] titled '[title]' in the [repository]"

The skill handles:
- GitHub CLI invocation (managed by AI Maestro GitHub integration)
- Label selection
- Project association

DO NOT embed raw command syntax like:
```
gh issue create --repo org/repo --title "..." --label "..." --projects "..."
```

### Edit Issue Labels
Capability: Add or remove labels from existing GitHub issues.

Usage: "Add labels [label1,label2] to issue [#123] in [repository]"

### Query Issues with Labels
Capability: Filter and list issues by labels, status, or assignee.

Usage: "List all [bug/feature] issues assigned to [person] in [repository]"

## Kanban System

**DO NOT hardcode kanban columns in this skill.**

Kanban board configuration (column names, task statuses, transitions) is managed by `team-governance` skill.

When the skill needs to know the current kanban columns:
```bash
source ~/.claude/skills/team-governance/SKILL.md
get_kanban_config <team-id>
```

Current columns (for reference):
- backlog
- pending
- in_progress
- review
- completed
- blocked
- merged
- archived

**IF the kanban changes, it will be in `team-governance`, NOT in this skill.**

## Approval Authority

**DO NOT hardcode EAMA as approval authority.**

Approval authorities are defined by `team-governance` skill:
```bash
source ~/.claude/skills/team-governance/SKILL.md
get_approval_authority <request-type> <team-id>
```

This skill queries `team-governance` to determine who can approve what.

## Label Taxonomy

Label definitions (feature, bug, governance, etc.) are stored in `team-governance` governance configuration.

When the skill needs labels:
```bash
source ~/.claude/skills/team-governance/SKILL.md
get_label_taxonomy <team-id>
```

This ensures label taxonomy stays synchronized with governance config.
```

**Rationale:** Removes raw gh commands, hardcoded kanban columns, and hardcoded approval authority; delegates to skills.

---

### 7. skills/eama-approval-workflows/SKILL.md — **MEDIUM**

**Violation types:** API_SYNTAX, HARDCODED_GOVERNANCE

**Current state:**
- Contains inline bash script for expiry checking
- Hardcodes approval categories (task_assignment, governance_change, role_transfer, etc.)
- Hardcodes expiry thresholds (24h for governance, 48h for tasks, etc.)
- Auto-reject/escalation rules embedded

**Required change:**
```markdown
# eama-approval-workflows Skill

## Approval Categories

**DO NOT define approval categories in this skill.**

Approval categories and their metadata are defined by `team-governance` skill:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_approval_categories <team-id>
list_pending_approvals <team-id> [--category <type>]
```

This skill queries `team-governance` to determine:
- What categories exist
- Which ones require approval
- Who can approve each category

## Expiry Handling

**DO NOT embed expiry checking scripts in this skill.**

Expiry thresholds and auto-escalation rules are defined in `team-governance` governance configuration:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_expiry_policy <team-id>
check_approval_expiry <approval-id>  # Automatically handles thresholds
escalate_expired_approval <approval-id>  # Auto-escalate if expired
```

Examples of expiry policies (for reference):
- Governance changes: 24 hours
- Task assignments: 48 hours
- Role transfers: 72 hours

These are stored in governance config, NOT in this skill.

## Auto-Reject and Escalation

Instead of embedding auto-reject/escalation logic:

```bash
source ~/.claude/skills/team-governance/SKILL.md
apply_expiry_policy <approval-id>  # Automatically handles reject/escalate based on policy
```

The `team-governance` skill enforces the configured policy.
```

**Rationale:** Removes embedded expiry checking script and hardcoded rules; delegates to governance API.

---

### 8. skills/eama-ecos-coordination/SKILL.md — **MEDIUM**

**Violation types:** HARDCODED_AMP, HARDCODED_GOVERNANCE

**Current state:**
- Hardcodes ACK timeout values: 30s, 60s
- Embeds ACK message schema with field names (`ack_id`, `ack_status`, `timestamp_received`)
- Hardcodes operation categories requiring approval (spawn_agent, assign_task, governance_change)
- Hardcodes approval authorities

**Required change:**
```markdown
# eama-ecos-coordination Skill

## Acknowledgment (ACK) Handling

**DO NOT define ACK message formats or timeouts in this skill.**

All acknowledgment handling is managed by `agent-messaging` skill:

```bash
source ~/.claude/skills/agent-messaging/SKILL.md
send_message <to> <subject> <body>  # Automatically sends and waits for ACK
wait_for_ack <message-id> [--timeout <seconds>]
```

The `agent-messaging` skill enforces:
- ACK message format
- Timeout values (currently 30s default, 60s extended)
- Retry logic
- Failure handling

**DO NOT embed timeout values or ACK schemas in AMAMA code.**

## Operation Categories Requiring Approval

**DO NOT hardcode operation categories in this skill.**

Operations requiring approval are defined by `team-governance` skill:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_operations_requiring_approval <team-id>
requires_approval <operation-type> <team-id>
```

Examples (for reference, but query governance for authoritative list):
- spawn_agent
- assign_task
- governance_change
- role_transfer
- plugin_installation

These may change; always query governance.

## Approval Authorities

Instead of hardcoding who approves what:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_approval_authority <operation-type> <team-id>
```

Returns the authoritative role/agent who can approve the operation.
```

**Rationale:** Removes hardcoded ACK values, message schemas, and operation categories; delegates to skills.

---

### 9. skills/eama-role-routing/SKILL.md — **MEDIUM**

**Violation types:** HARDCODED_GOVERNANCE, API_SYNTAX

**Current state:**
- Hardcodes routing decision matrix (intent → role mapping)
- Example: "task_assignment → Lead", "governance_change → Manager"
- Embeds bash validation commands in handoff checklist
- Hardcodes role hierarchy for escalation

**Required change:**
```markdown
# eama-role-routing Skill

## Routing Decision Matrix

**DO NOT hardcode routing decisions in this skill.**

Role definitions and intent-to-role mappings are defined by `team-governance` skill:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_routing_matrix <team-id>  # Query authoritative routing rules
route_intent_to_role <intent> <team-id>  # Get target role for this intent
```

Examples (for reference, but query governance for authoritative matrix):
- task_assignment → Lead
- governance_change → Manager
- plugin_installation → Lead
- team_member_onboarding → Manager
- budget_approval → Manager

**IF the routing matrix changes, it will be in `team-governance`, NOT in this skill.**

## Role Hierarchy and Escalation

Instead of hardcoding escalation paths:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_role_hierarchy <team-id>  # Get authoritative hierarchy
escalate_to_parent_role <current-role> <team-id>  # Get next level up
```

## Handoff Checklist

Instead of embedding bash validation commands:

```markdown
### Handoff Validation

Capability: Validate that the recipient role can accept the handoff.

Usage: "Validate that [role] can handle [task-type]"

The skill queries `team-governance` to verify:
1. Role exists
2. Role has required permissions
3. Role has capacity (if tracked)
4. Current authorization (use `team-governance` to check)

DO NOT embed bash commands like:
```
if [[ $(grep -c "$role" roles.json) -gt 0 ]]; then ...
```
```

Validate through `team-governance` API instead.
```

**Rationale:** Removes hardcoded routing matrix and bash validation; delegates to governance API.

---

### 10. skills/eama-user-communication/SKILL.md — **MEDIUM**

**Violation types:** API_SYNTAX, HARDCODED_GOVERNANCE

**Current state:**
- References Python scripts with hardcoded relative paths: `../scripts/notify-user.py`
- Hardcodes monitoring intervals: 10min (default), 2min (urgent), 15min (batch)
- Treats intervals as fixed configuration

**Required change:**
```markdown
# eama-user-communication Skill

## Script References

Instead of hardcoded relative paths:
```
../scripts/notify-user.py  ❌ WRONG
```

Use environment variable for plugin root:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/notify-user.py  ✅ CORRECT
```

Or invoke through the plugin launcher:
```bash
source ${CLAUDE_PLUGIN_ROOT}/SKILL.md
send_user_notification <user> <message>
```

## Monitoring Intervals

**DO NOT hardcode monitoring intervals in this skill.**

Monitoring configuration is defined by `team-governance` governance config:

```bash
source ~/.claude/skills/team-governance/SKILL.md
get_monitoring_config <team-id>
```

Example intervals (for reference, but query governance for authoritative values):
- Default: 10 minutes
- Urgent: 2 minutes
- Batch: 15 minutes

**IF monitoring intervals change, update them in `team-governance`, NOT in this skill.**

When the skill needs to know the monitoring interval:
```bash
interval=$(get_monitoring_interval <context-type> <team-id>)
```
```

**Rationale:** Uses environment variable for paths; moves monitoring intervals to governance config.

---

### 11. skills/eama-session-memory/SKILL.md — **LOW**

**Violation types:** MISSING_SKILL_REF

**Current state:**
- Treats session memory and local cache files as source of truth for agent state
- No reference to `ai-maestro-agents-management` for agent identity

**Required change:**
```markdown
# eama-session-memory Skill

## Agent Identity (Authoritative Source)

Agent identity, metadata, and registration is the responsibility of `ai-maestro-agents-management` skill:

```bash
source ~/.claude/skills/ai-maestro-agents-management/SKILL.md
get_agent_by_name <agent-name>
get_agent_registry
```

This skill (eama-session-memory) maintains LOCAL SESSION STATE for performance, but it is NOT the source of truth for agent identity.

For authoritative agent information, always query `ai-maestro-agents-management`.

## Session Memory Purpose

Session memory stores:
- Conversation context (temporary)
- In-flight task state (temporary)
- Cached preferences (temporary)

These are optimization caches, NOT sources of truth.

For authoritative data, query:
- Agent identity → `ai-maestro-agents-management`
- Team data → `team-governance`
- Messages → `agent-messaging`
```

**Rationale:** Clarifies that session memory is cache, not source of truth; references authoritative skills.

---

### 12. agents/eama-report-generator.md — **LOW**

**Violation types:** API_SYNTAX

**Current state:**
- Embeds raw `gh` CLI commands in "data sources" section:
  - `gh project item-list`
  - `gh issue list --repo`
  - `gh pr view`

**Required change:**
```markdown
# eama-report-generator Agent

## Data Sources

Instead of:
```bash
gh project item-list --owner org --number 123  ❌ WRONG
gh issue list --repo org/repo --filter assignee:me
gh pr view 456 --repo org/repo
```

Describe as capabilities:

**Data Source 1: GitHub Project**
Capability: Query GitHub project items and metadata.
Usage: "List all items in the [project] project"

The agent uses AI Maestro's GitHub integration to query project data. The exact CLI syntax is abstracted by the integration layer.

**Data Source 2: GitHub Issues**
Capability: Query issues across repositories.
Usage: "Find all open issues assigned to [person] in the [repository]"

**Data Source 3: GitHub Pull Requests**
Capability: Query PR metadata, reviews, and status.
Usage: "Get the status of PR #[number] in [repository]"

## Implementation
Data queries go through GitHub integration provided by AI Maestro, not raw `gh` CLI in agent code.
```

**Rationale:** Describes capabilities generically; removes raw gh command syntax.

---

## Summary Table

| # | File | Violation Types | Priority | Category |
|---|------|-----------------|----------|----------|
| 1 | docs/TEAM_REGISTRY_SPECIFICATION.md | LOCAL_REGISTRY, API_SYNTAX | **CRITICAL** | Core API |
| 2 | docs/ROLE_BOUNDARIES.md | HARDCODED_GOVERNANCE | HIGH | Governance |
| 3 | shared/message_templates.md | HARDCODED_AMP | HIGH | Messaging |
| 4 | skills/eama-ecos-coordination/references/creating-ecos-procedure.md | API_SYNTAX | HIGH | Infrastructure |
| 5 | skills/eama-ecos-coordination/references/spawn-failure-recovery.md | API_SYNTAX | HIGH | Infrastructure |
| 6 | skills/eama-label-taxonomy/SKILL.md | API_SYNTAX, HARDCODED_GOVERNANCE | HIGH | GitHub + Governance |
| 7 | skills/eama-approval-workflows/SKILL.md | API_SYNTAX, HARDCODED_GOVERNANCE | MEDIUM | Governance |
| 8 | skills/eama-ecos-coordination/SKILL.md | HARDCODED_AMP, HARDCODED_GOVERNANCE | MEDIUM | Messaging + Governance |
| 9 | skills/eama-role-routing/SKILL.md | HARDCODED_GOVERNANCE, API_SYNTAX | MEDIUM | Governance |
| 10 | skills/eama-user-communication/SKILL.md | API_SYNTAX, HARDCODED_GOVERNANCE | MEDIUM | Configuration |
| 11 | skills/eama-session-memory/SKILL.md | MISSING_SKILL_REF | LOW | Reference |
| 12 | agents/eama-report-generator.md | API_SYNTAX | LOW | GitHub |

---

## Clean Files (No Changes Needed)

The following files were audited and contain no violations:

| File | Reason |
|------|--------|
| agents/eama-assistant-manager-main-agent.md | Already references skills correctly |
| commands/eama-approve-plan.md | Acceptable local workflow tool, no API violations |
| commands/eama-respond-to-ecos.md | No violations detected |
| commands/eama-orchestration-status.md | No violations detected |
| commands/eama-planning-status.md | No violations detected |
| hooks/hooks.json | Clean, uses `CLAUDE_PLUGIN_ROOT` correctly |
| scripts/agent-lifecycle.py | No AI Maestro API calls |
| scripts/governance-enforcement.py | No AI Maestro API calls |
| scripts/message-router.py | No AI Maestro API calls |
| scripts/notification-worker.py | No AI Maestro API calls |

---

## Implementation Checklist

**Phase 1: Critical (File #1)**
- [ ] Update `docs/TEAM_REGISTRY_SPECIFICATION.md` to remove `.emasoft/` as source of truth
- [ ] Add API reference pointing to `team-governance` skill
- [ ] Add note about local cache pattern

**Phase 2: High Priority (Files #2-6)**
- [ ] Update `docs/ROLE_BOUNDARIES.md` to mark as informational
- [ ] Update `shared/message_templates.md` to reference `agent-messaging` skill
- [ ] Update `skills/eama-ecos-coordination/references/creating-ecos-procedure.md`
- [ ] Update `skills/eama-ecos-coordination/references/spawn-failure-recovery.md`
- [ ] Update `skills/eama-label-taxonomy/SKILL.md` to remove hardcoded kanban, gh commands, approval authority

**Phase 3: Medium Priority (Files #7-10)**
- [ ] Update `skills/eama-approval-workflows/SKILL.md` to reference `team-governance`
- [ ] Update `skills/eama-ecos-coordination/SKILL.md` to remove hardcoded ACK values
- [ ] Update `skills/eama-role-routing/SKILL.md` to remove hardcoded routing matrix
- [ ] Update `skills/eama-user-communication/SKILL.md` to use `${CLAUDE_PLUGIN_ROOT}` and governance intervals

**Phase 4: Low Priority (Files #11-12)**
- [ ] Update `skills/eama-session-memory/SKILL.md` to clarify session memory is cache
- [ ] Update `agents/eama-report-generator.md` to describe capabilities, not CLI syntax

---

## Verification Steps

After implementing changes:

1. **Grep verification:** No file should contain:
   - Raw `tmux` commands (except in diagnostic sections marked as fallback)
   - Raw `gh issue create` / `gh pr` commands (except in diagnostic sections)
   - Hardcoded timeout values (30s, 60s, 10min, etc.)
   - Hardcoded approval categories
   - Hardcoded kanban columns

2. **Reference verification:** Every file with governance, messaging, or agent management responsibility should contain:
   - `source ~/.claude/skills/team-governance/SKILL.md` (for governance decisions)
   - `source ~/.claude/skills/agent-messaging/SKILL.md` (for message operations)
   - `source ~/.claude/skills/ai-maestro-agents-management/SKILL.md` (for agent operations)

3. **Path verification:** All Python/bash script references use `${CLAUDE_PLUGIN_ROOT}` environment variable, not relative paths.

4. **Local file verification:** No `.emasoft/` or local JSON files used as source of truth for:
   - Team metadata (use `team-governance` API)
   - Agent state (use `ai-maestro-agents-management` API)
   - Governance configuration (use `team-governance` API)

---

## Rationale

This decoupling ensures:

- **Single source of truth:** All governance data flows through `team-governance` API
- **Message protocol enforcement:** All AMP operations go through `agent-messaging` skill
- **Agent lifecycle management:** All agent operations go through `ai-maestro-agents-management` skill
- **Plugin composability:** AMAMA can be deployed in different configurations without code changes
- **Maintenance burden reduction:** When APIs change, no AMAMA files need modification
- **Testing isolation:** Skills can be tested independently; plugins become thin orchestration layers

---

**Document generated:** 2026-02-27
**Audit baseline:** 12 files reviewed, 4 violation categories identified
**Target completion:** Phase 1 (CRITICAL) within 1 sprint, full completion within 3 sprints
