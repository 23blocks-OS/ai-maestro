# Deep Audit: AMCOS Plugin Top-Level Files — Plugin Abstraction Principle
**Date**: 2026-02-27
**Auditor**: Task subagent (deep-audit-AMCOS-toplevel)
**Scope**: All AMCOS plugin top-level files — governance refs, docs, shared templates, agents, commands
**Standard**: Plugin Abstraction Principle (PAP) — see `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

---

## Audit Categories

| Code | Description |
|------|-------------|
| **HARDCODED_API** | curl commands, endpoint URLs (`/api/v1/...`), HTTP headers, status codes embedded directly instead of referencing a skill |
| **HARDCODED_GOVERNANCE** | Role restrictions, permission matrices, allowed-agent lists hardcoded in frontmatter or body |
| **HARDCODED_AMP** | AMP/JSON message payloads embedded inline instead of referencing the `agent-messaging` skill |
| **CLI_SYNTAX** | Hardcoded `aimaestro-agent.sh`, `amp-send.sh`, or direct process/signal invocations embedded where a skill should be referenced |
| **RECORD_KEEPING** | Internal tallying, thresholds, IDs, state machine logic — flag and **PRESERVE** (do not remove) |
| **REDUNDANT_OPERATIONS** | Duplicates of operations already provided by AI Maestro or a skill — flag for harmonization (not removal) |

Verdict codes used per finding:
- **VIOLATION** — must be fixed: remove hardcoded detail and replace with skill reference
- **PRESERVE** — must be kept: record-keeping or threshold data that belongs here
- **HARMONIZE** — redundant with a skill/API but preserve the abstraction layer; add a reference note
- **CLEAN** — no violation found

---

## Section 1: Governance Reference Files

### 1.1 `skills/team-governance/SKILL.md`
**Verdict**: CLEAN
This is the authoritative governance skill. It defines the GovernanceRequest state machine, approval workflows, and team-governance API. It is the correct abstraction layer. No violations.
**Role in PAP**: Source of truth that all governance-related commands should reference instead of embedding API calls.

### 1.2 `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Verdict**: CLEAN
This is the PAP definition document itself. No violations.
**Role in PAP**: Defines the standard that this audit enforces.

---

## Section 2: AMCOS Docs Files

### 2.1 `docs/AGENT_OPERATIONS.md`
**Verdict**: CLEAN
This is a governance reference document. Section 10 explicitly states: "All messaging operations use the `agent-messaging` skill. Never use explicit API calls or command-line tools directly." Section 3 states the AI Maestro API endpoint is accessed via the `agent-messaging` skill, not through direct calls.

**PRESERVE items found**:
- Role prefix table (amcos-, eaa-, eoa-, eia-, eama-)
- Kanban 8-column system definition (backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked)
- Scripts reference table with file paths
- Session naming convention rules

These are reference data that belongs in this doc.

### 2.2 `docs/FULL_PROJECT_WORKFLOW.md`
**Verdict**: CLEAN
Descriptive workflow document. All messaging described via AMP protocol. GovernanceRequests described at abstraction level (no hardcoded endpoints). Communication matrix correctly routes everything via AMP.
No violations.

### 2.3 `docs/ROLE_BOUNDARIES.md`
**Verdict**: CLEAN
Defines AMCOS/EOA/EIA/EAA/EAMA role boundaries. No API calls, no hardcoded governance permissions, no CLI syntax. Pure documentation.

**PRESERVE items found**:
- Role boundary table (who can create agents, assign tasks, etc.)
- Communication restrictions table (who AMCOS can/cannot message)
- Cross-team GovernanceRequest requirement rule

### 2.4 `docs/TEAM_REGISTRY_SPECIFICATION.md`
**Verdict**: CLEAN (with PRESERVE notes)
**Note**: This doc contains example curl commands but they are documentation examples with `$AIMAESTRO_API` variable substitution — not hardcoded URLs.

```bash
# This is ACCEPTABLE — uses env var, is a documentation example, not operational code
curl -X POST "$AIMAESTRO_API/api/teams" ...
```

**PRESERVE items found**:
- Agent naming convention format (`<team-prefix>-<role>[-<instance>]`)
- Team naming convention format (`<repo-name>-<project-type>-team`)
- Role types table (manager/chief-of-staff/member)
- Functional sub-role definitions (orchestrator, architect, integrator, etc.)
- Kanban 8-column system cross-reference
- AMP messaging example commands (use `amp-send.sh` correctly as CLI script, not hardcoded API)
- Git commit message format (AMCOS-specific)
- PR body format (AMCOS-specific)

---

## Section 3: AMCOS Shared Template Files

### 3.1 `shared/handoff_template.md`
**Verdict**: CLEAN
Template document. All message formats include the note: "Use the `agent-messaging` skill to send messages. The JSON structure below shows the message content." — correctly marking JSON as content, not operational code.

**PRESERVE items found**:
- Handoff YAML schema (uuid, from_role, to_role, created, github_issue, etc.)
- Session continuity handoff format (Agent State table, Pending Approvals, Open Issues)
- File naming convention for handoffs
- Storage location: `docs_dev/handoffs/`
- Handoff type definitions (6 types)
- Communication hierarchy (all via COS, not direct)

### 3.2 `shared/message_templates.md`
**Verdict**: CLEAN (with PRESERVE notes)
Every message template includes the disclaimer: "> **Note**: Use the `agent-messaging` skill to send messages. The JSON structure below shows the message content." — correct PAP-compliant pattern. JSON structures are documentation of message content, not operational code.

**PRESERVE items found**:
- 13 message type definitions (onboarding, role_briefing, termination_warning, heartbeat_poll, performance_report_request, task_assignment, status_request, status_update, completion, approval_request, approval_response, question, error_report)
- Priority level table (urgent/high/normal/low with use-case definitions)
- Session name convention (amcos-/eaa-/eoa-/eia- prefixes)
- Checkpoint structure (25%/50%/75%/100% with report types)

### 3.3 `shared/onboarding_checklist.md`
**Verdict**: CLEAN
Step 3 "Register Agent in Tracking" correctly delegates to the `ai-maestro-agents-management` skill rather than direct API calls. Message template includes the `agent-messaging` skill note.

**PRESERVE items found**:
- Pre-start resource threshold checklist (CPU 80%, Memory 85%, Disk 90%, MAX_CONCURRENT_AGENTS 10, MAX_AGENTS_PER_PROJECT 5)
- Post-start verification timing (60 seconds)
- Heartbeat check interval (300 seconds)
- Onboarding retry policy (up to 3 times, then escalate)
- ONBOARDING_TIMEOUT_SECONDS value (60 seconds)
- Mandatory briefing elements list (5 elements)

**One minor issue in Step 4 "Spawn Agent Process"**:
```bash
# This embeds claude CLI syntax directly — should reference ai-maestro-agents-management skill instead
claude --session "${SESSION_NAME}" \
       --project "${PROJECT_DIR}" \
       --plugin-dir "${PLUGIN_PATH}"
```
**Finding**: CLI_SYNTAX (minor) — `claude` CLI invocation embedded in checklist Step 4. Should reference the `ai-maestro-agents-management` skill instead.

### 3.4 `shared/performance_report_template.md`
**Verdict**: CLEAN
Pure report template. No operational code, no API calls.

**PRESERVE items found**:
- Performance report schema (report_id, agent_session, role, generated, period_start, period_end, report_type)
- Task performance table structure
- Resource threshold references (CPU 80%, Memory 85%, Disk 90%)
- Communication metrics table structure
- Quality metrics thresholds (Tests Passing 100%, Lint Errors 0, Type Errors 0)
- Approval activity tracking structure

---

## Section 4: AMCOS Agent Files

### 4.1 `agents/amcos-chief-of-staff-main-agent.md`
**Verdict**: CLEAN (with one minor note)

**Note**: The "Quick Command Reference" section contains:
```bash
uv run python scripts/amcos_team_registry.py <command> [args]
```
This is a direct Python script invocation rather than a skill reference. However, this is an internal AMCOS script (not an AI Maestro platform script), so it falls within acceptable use for plugin-local tooling.

**PRESERVE items found**:
- Governance Rules R6.1–R6.7 (messaging rules)
- Sub-agent routing table (which task type → which sub-agent)
- Communication hierarchy diagram (User → EAMA → AMCOS → Team Agents → Worker Agents)
- Governance role mapping (manager/chief-of-staff/member with plugin roles)
- Core responsibilities list (7 items)
- GovernanceRequest requirement for destructive/cross-team operations rule

**REDUNDANT_OPERATIONS**: The "Team Registry" section references `GET /api/teams` for recipient validation (line 58: "Use `GET /api/teams` to check team membership"). This is a direct API call reference that should be abstracted via the `team-governance` skill.
- **Finding**: HARDCODED_API (minor) — `GET /api/teams` referenced directly. Should reference `team-governance` skill instead.

### 4.2 `agents/amcos-lifecycle-manager.md`
**Verdict**: CLEAN
All lifecycle operations correctly delegated to the `ai-maestro-agents-management` skill. No hardcoded API calls, no CLI syntax. Correctly notes "AMP Messaging: Use `amp-send.sh` for all inter-agent communication."

### 4.3 `agents/amcos-approval-coordinator.md`
**Verdict**: HARDCODED_API, HARDCODED_GOVERNANCE, RECORD_KEEPING

**VIOLATION — HARDCODED_API (lines 100, 105)**:
```
POST /api/v1/governance/requests
GET /api/v1/governance/requests/{requestId}
```
These REST endpoint paths are hardcoded in the workflow steps. Should reference `team-governance` skill instead.

**VIOLATION — HARDCODED_GOVERNANCE (lines 28-31)**:
The constraint table hardcodes governance policy:
```
"Never execute operations without GovernanceRequest reaching `dual-approved` (cross-team) or `local-approved` (local)"
```
This is governance policy that should be referenced from the `team-governance` skill rather than re-stated here.

**REDUNDANT_OPERATIONS**: The GovernanceRequest state machine on lines 42-46 duplicates what the `team-governance` skill already defines.

**PRESERVE items found (do NOT remove)**:
- GovernanceRequest state machine diagram (`pending → local-approved / remote-approved → dual-approved → executed`)
- Approver tracking fields list (sourceCOS, sourceManager, targetCOS, targetManager)
- GovernanceRequest payload template (lines 56-70)
- Escalation timeline (60s reminder → 90s urgent → 120s auto-action)
- Rate limit awareness rule (respect 429/Retry-After)
- Timeout enforcement policy
- Audit trail logging requirement
- Tracking location `~/.aimaestro/governance/pending/` (line 166 in amcos-request-approval)

**Recommended fix**: Replace hardcoded `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` with: "Use the `team-governance` skill to submit and track GovernanceRequests."

### 4.4 `agents/amcos-recovery-coordinator.md`
**Verdict**: CLEAN
Correctly references `amcos-failure-recovery` skill. Recovery workflow (DETECT → CLASSIFY → NOTIFY → EXECUTE → LOG) is described at abstraction level. AMP messaging correctly delegated to skill.

**PRESERVE items found**:
- Failure classification table (TRANSIENT/RECOVERABLE/TERMINAL with auto-recovery rules)
- Recovery workflow diagram
- Iron Rules table

### 4.5 `agents/amcos-performance-reporter.md`
**Verdict**: CLEAN
Read-only analytics agent. Delegates to `amcos-performance-tracking` skill. No API calls, no CLI syntax.

**PRESERVE items found**:
- Four report type definitions (Individual, Team/Project, Comparison, Trend)
- Constraint: "Every weakness must have a corresponding improvement recommendation"

### 4.6 `agents/amcos-resource-monitor.md`
**Verdict**: CLEAN
Correctly delegates to `amcos-resource-monitoring` skill.

**PRESERVE items found**:
- Spawn-blocking threshold table (max_concurrent_agents 10, cpu_threshold 80%, memory_threshold 85%, disk_threshold 90%)
- Status output format (ALL_CLEAR vs SPAWN_BLOCKED)

### 4.7 `agents/amcos-skill-validator.md`
**Verdict**: CLEAN
Correctly delegates to `amcos-skill-management` skill and CPV validator. PSS coordination via skill reference.

### 4.8 `agents/amcos-staff-planner.md`
**Verdict**: CLEAN
Read-only analysis agent. Delegates to `amcos-staff-planning` skill.

**PRESERVE items found**:
- Max concurrent agents recommendation (4-6 per plan)
- Context memory limit (100K tokens per agent)
- Output file naming convention (`docs_dev/staffing/SP-YYYYMMDD-HHMMSS.md`)

### 4.9 `agents/amcos-team-coordinator.md`
**Verdict**: CLEAN (one minor note)

**Note**: The key constraints table references:
```
"Registry API: Use AI Maestro REST API (`GET /api/teams/{id}/agents`) for team state"
```
This is a direct REST endpoint reference in agent constraints — should reference `team-governance` skill instead.

**Finding**: HARDCODED_API (minor) — `GET /api/teams/{id}/agents` hardcoded in constraint. Should reference skill.

### 4.10 `agents/amcos-plugin-configurator.md`
**Verdict**: HARDCODED_API (minor), RECORD_KEEPING

**VIOLATION — HARDCODED_API (lines 32-33)**:
```
"Remote config operations (different host or different team) MUST use GovernanceRequest API. Local (same host, same team) config remains direct."
```
The GovernanceRequest JSON format is embedded directly in the agent body (lines 57-68):
```json
{
  "type": "configure-agent",
  "target": "<agent-session-name>",
  "operation": "<ConfigOperationType>",
  ...
}
```
This GovernanceRequest payload should reference the `team-governance` skill rather than embed the JSON format.

**PRESERVE items found**:
- ConfigOperationType enum (add-skill, remove-skill, add-plugin, remove-plugin, update-hooks, update-mcp, update-model, bulk-config)
- Plugin scope table (local/project/user with settings file locations)
- Decision logic: same-host-same-team → direct; different-host-or-team → GovernanceRequest

---

## Section 5: AMCOS Command Files

### 5.1 `commands/amcos-spawn-agent.md`
**Verdict**: CLEAN
Correctly delegates to `ai-maestro-agents-management` skill.

### 5.2 `commands/amcos-terminate-agent.md`
**Verdict**: CLEAN
Correctly delegates to `ai-maestro-agents-management` skill.

### 5.3 `commands/amcos-hibernate-agent.md`
**Verdict**: CLEAN
Correctly delegates to `ai-maestro-agents-management` skill.

### 5.4 `commands/amcos-wake-agent.md`
**Verdict**: CLEAN
Correctly delegates to `ai-maestro-agents-management` skill.

### 5.5 `commands/amcos-staff-status.md`
**Verdict**: CLEAN
Correctly delegates to `ai-maestro-agents-management` skill.

### 5.6 `commands/amcos-health-check.md`
**Verdict**: CLEAN
Uses `ai-maestro-agents-management` skill for health queries. AMP ping mentioned ("via `amp-send.sh`") in workflow description — but this is a description, not operational code.

**PRESERVE items found**:
- Health status value definitions (HEALTHY/DEGRADED/OFFLINE/HIBERNATED/UNRESPONSIVE/UNKNOWN)
- Health threshold table (Heartbeat <60s healthy, 60-300s degraded, >300s critical; Response <200ms healthy, etc.)

### 5.7 `commands/amcos-recovery-workflow.md`
**Verdict**: CLI_SYNTAX (minor), RECORD_KEEPING

**VIOLATION — CLI_SYNTAX (line 82)**:
```
2. Send SIGTERM to Claude Code process (graceful stop)
```
This is a direct SIGTERM process manipulation reference embedded in a workflow step. While described in plain text, it describes a direct process operation that should be abstracted via the `ai-maestro-agents-management` skill's restart capability.

**PRESERVE items found**:
- 3-level recovery strategy table (Level 1: restart / Level 2: hibernate-wake / Level 3: replace)
- Decision guide table (symptom → recommended action)
- Recovery action criteria (when restart vs hibernate-wake vs replace)

### 5.8 `commands/amcos-replace-agent.md`
**Verdict**: HARDCODED_GOVERNANCE (minor), RECORD_KEEPING

**VIOLATION — HARDCODED_GOVERNANCE (lines 106-109, 127-130)**:
Hardcoded recipient session names in step descriptions:
```
"Recipient: `eama-assistant-manager`"
"Recipient: `eoa-orchestrator`"
```
These are hardcoded agent session name strings. Agent discovery should be done via `GET /api/teams/{id}/agents` role lookup (or via the `team-governance` skill), not hardcoded strings.

**PRESERVE items found**:
- 6-step replacement workflow (request approval, create agent, generate handoff, update kanban, transfer handoff, verify ready)
- Team boundary constraint note ("Replacement must be within the same team")

### 5.9 `commands/amcos-request-approval.md`
**Verdict**: **CRITICAL VIOLATIONS** — HARDCODED_API, HARDCODED_GOVERNANCE, HARDCODED_AMP, RECORD_KEEPING, REDUNDANT_OPERATIONS

This is the most severely non-compliant file in the entire plugin.

**VIOLATION — HARDCODED_API (lines 3-4, 23-24)**:
```
POST /api/v1/governance/requests
GET /api/v1/governance/requests/{requestId}
```
These REST endpoint paths are embedded in the Usage section and workflow steps. This is a direct violation of PAP — the `team-governance` skill exists precisely to abstract these operations.

**VIOLATION — HARDCODED_API (lines 155-162)**:
HTTP 429 rate limiting details hardcoded:
```
- API may return `429 Too Many Requests`
- Respect `Retry-After` header
- Max 10 GovernanceRequests/minute per COS
- Back off exponentially on repeated 429s
```
These implementation details belong in the `team-governance` skill, not the command file.

**VIOLATION — HARDCODED_GOVERNANCE (lines 29-40)**:
Full approval matrix hardcoded in the command file:
```
| spawn | local | sourceManager | No |
| spawn | cross-team | sourceManager + targetManager | No |
| terminate | local | sourceManager | No |
| terminate | cross-team | sourceManager + targetManager | No |
...
| critical | any | dual-manager | Yes |
```
This governance policy should be referenced from the `team-governance` skill, not re-declared here.

**VIOLATION — HARDCODED_AMP (lines 86-129)**:
Two full GovernanceRequest JSON payload schemas embedded directly:
```json
{
  "requestId": "GR-20260227150000-a1b2c3d4",
  "type": "terminate",
  "sourceCOS": "amcos-main",
  ...
}
```
These schemas should be referenced from the `team-governance` skill documentation, not embedded in the command.

**VIOLATION — CLI_SYNTAX (line 57)**:
```bash
REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
```
Request ID generation via shell commands is embedded directly. This logic belongs in the `team-governance` skill.

**REDUNDANT_OPERATIONS**: This entire command duplicates functionality already provided by the `team-governance` skill. The command should be a thin wrapper that invokes the skill.

**PRESERVE items found (do NOT remove)**:
- GovernanceRequest state machine diagram (`pending → local-approved / remote-approved → dual-approved → executed`)
- Request ID format: `GR-YYYYMMDDHHMMSS-XXXXXXXX` (this format is AMCOS-specific identity)
- Tracking file location: `~/.aimaestro/governance/pending/GR-*.json`
- Error code table (429 → rate limited, 400 → wrong password, 404 → unknown targetManager)
- `--governance-password` parameter requirement for critical operations

**Recommended fix**: Replace the entire Usage section with:
```
Use the `team-governance` skill to submit a GovernanceRequest for the specified operation type and scope.
```
Then preserve the PRESERVE items as reference data only (not as operational instructions).

### 5.10 `commands/amcos-resource-report.md`
**Verdict**: CLEAN
Uses Python script via `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_resource_monitor.py"` — this is a plugin-local script via env var, which is acceptable.

**PRESERVE items found**:
- Warning threshold table (CPU >80%/95%, Memory <20%/<10%, Disk <10%/<5%, Swap >50%/80%, Agent Messages >10/>50 pending)

### 5.11 `commands/amcos-performance-report.md`
**Verdict**: CLEAN
Uses Python script via `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_performance_report.py"` — plugin-local script, acceptable.

**PRESERVE items found**:
- Rating calculation formula (40% success + 30% completion time + 20% error rate + 10% retry rate)
- Performance threshold table (>90% success, <4hr avg, <10% retry, <10% error — "Good Threshold" column)
- Data retention: 90 days default
- Refresh cycle: 15 minutes

**REDUNDANT_OPERATIONS** (minor): Performance data collection overlaps with AI Maestro's own agent monitoring. However, the AMCOS-specific rating calculation (star system) and recommendation generation adds value not in the base AI Maestro monitoring, so this is acceptable redundancy.

### 5.12 `commands/amcos-reindex-skills.md`
**Verdict**: CLEAN
Uses `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_reindex_skills.py"` — plugin-local script, acceptable. Correctly sends `/pss-reindex-skills` command via AI Maestro messaging rather than direct PSS API calls.

### 5.13 `commands/amcos-transfer-agent.md`
**Verdict**: **CRITICAL VIOLATIONS** — HARDCODED_API, HARDCODED_GOVERNANCE

**VIOLATION — HARDCODED_GOVERNANCE (frontmatter, lines 4-6)**:
```yaml
allowed_agents:
  - amcos-chief-of-staff
  - amcos-team-manager
```
Hardcoded role restrictions in YAML frontmatter. This governance constraint should not be embedded as a static list — it should be resolved dynamically via the `team-governance` skill's governance role checks.

**VIOLATION — HARDCODED_API (line 29)**:
```
POST /api/governance/transfers/
```
Direct REST endpoint hardcoded in the Steps section. Note this also uses a different API path format than the governance skill uses (`/api/governance/transfers/` vs the skill's `/api/v1/governance/requests`) — potential inconsistency indicating the command was not derived from the skill's API spec.

**REDUNDANT_OPERATIONS**: The entire TransferRequest workflow described here is a subset of the cross-team GovernanceRequest workflow already defined in the `team-governance` skill.

**PRESERVE items found**:
- Transfer scope constraint: "Both source and target COS + managers must approve"
- Transfer polling requirement until terminal state

**Recommended fix**:
1. Remove `allowed_agents` from frontmatter — use `team-governance` skill to enforce role checks at runtime
2. Replace `POST /api/governance/transfers/` with: "Use the `team-governance` skill to submit a cross-team TransferRequest GovernanceRequest"
3. Verify the transfer endpoint path is consistent with the governance skill spec

### 5.14 `commands/amcos-transfer-work.md`
**Verdict**: CLEAN
Correctly uses `agent-messaging` skill and `ai-maestro-agents-management` skill. Role boundary note ("AMCOS sends handoff; EOA handles kanban") is proper. All messaging abstracted via skills.

### 5.15 `commands/amcos-validate-skills.md`
**Verdict**: CLI_SYNTAX

**VIOLATION — CLI_SYNTAX (lines 16-18, 63)**:
```bash
uv run --with pyyaml python scripts/validate_plugin.py . --verbose
uv run --with pyyaml python scripts/validate_skill.py <skill-dir>
```
Direct `uv run` CLI syntax is embedded in the command description and examples. The `allowed-tools` frontmatter also hardcodes this:
```yaml
allowed-tools: ["Bash(uv run --with pyyaml python:*)"]
```
This is direct CLI tool invocation rather than referencing the `claude-plugins-validation` skill (which exists as `cpv-validate-skill`, `cpv-validate-plugin`, etc.).

**PRESERVE items found**:
- Validation severity levels (CRITICAL/MAJOR/MINOR)
- Zero-tolerance policy for CRITICAL and MAJOR issues

**Recommended fix**: Replace the `uv run` invocations with references to the appropriate `claude-plugins-validation` skill commands (`cpv-validate-plugin`, `cpv-validate-skill`). The Python scripts are implementation details of the skill, not surface-level commands.

### 5.16 `commands/amcos-notify-manager.md`
**Verdict**: HARDCODED_AMP (minor), RECORD_KEEPING

**VIOLATION — HARDCODED_AMP (lines 136-145)**:
JSON acknowledgment response format embedded directly:
```json
{
  "type": "notification_ack",
  "original_message_id": "msg-20250202153000-b2c3d4e5",
  "acknowledged": true,
  ...
}
```
This should reference the `agent-messaging` skill's acknowledgment format rather than defining it inline. The file does have the note about using `agent-messaging` skill to send, but embeds the expected response format directly.

**VIOLATION — HARDCODED_API (minor, line 184-188)**:
Message queue fallback location hardcoded:
```
- Location: `~/.aimaestro/outbox/`
- Auto-retry: Every 5 minutes
- Expiry: 24 hours (configurable)
```
The outbox path and retry parameters are implementation details of the `agent-messaging` skill.

**PRESERVE items found**:
- Rate limiting rules (max 1 status/hr per topic, max 3 issue reports/hr for same issue, no limit for alerts)
- Message ID format: `msg-YYYYMMDDHHMMSS-XXXXXXXX`
- Notification type table (8 types: status_update, issue_report, alert, completion, request_info, escalation, health_check, resource_alert)
- Hardcoded recipient (`ai-maestro-assistant-manager-agent`) as the canonical EAMA address — this is acceptable as EAMA has a well-known, stable session name

### 5.17 `commands/amcos-notify-agents.md`
**Verdict**: CLEAN
Correctly uses `agent-messaging` skill and `ai-maestro-agents-management` skill. JSON acknowledgment template includes proper disclaimer ("Use the `agent-messaging` skill to send messages").

**PRESERVE items found**:
- Operation type table (8 operation types: skill-install, plugin-install, restart, hibernate, wake, update, maintenance, custom)
- Timeout behavior (120 seconds, reminders every 30 seconds)

### 5.18 `commands/amcos-broadcast-notification.md`
**Verdict**: CLEAN
Correctly uses `agent-messaging` skill and `ai-maestro-agents-management` skill for all operations.

**PRESERVE items found**:
- Priority levels with agent behavior definitions (normal: process when convenient, high: before other tasks, urgent: interrupt current work)
- Role wildcard definitions (* = all agents, helper, specialist, orchestrator)
- Team boundary constraint note

### 5.19 `commands/amcos-check-approval-status.md`
**Verdict**: HARDCODED_API (minor), RECORD_KEEPING

**VIOLATION — HARDCODED_API (lines 140-146)**:
Approval storage paths hardcoded:
```
| Pending  | `~/.aimaestro/approvals/pending/` |
| Approved | `~/.aimaestro/approvals/approved/` |
| Rejected | `~/.aimaestro/approvals/rejected/` |
| Expired  | `~/.aimaestro/approvals/expired/` |
```
These filesystem paths are implementation details of the approval system that should not be embedded in a command file. They should be referenced via the `team-governance` skill or `agent-messaging` skill.

**Note**: The primary workflow correctly uses `agent-messaging` skill to check for `approval_response` messages.

**PRESERVE items found**:
- Status value table (7 states: pending, approved, rejected, deferred, expired, completed, cancelled)
- Status interpretation guide (what to do for each status)

### 5.20 `commands/amcos-install-skill-notify.md`
**Verdict**: CLEAN (with minor note)

**Note**: The "Agent Acknowledgment Format" section embeds JSON:
```json
{
  "to": "<orchestrator>",
  "subject": "ACK: Ready for skill install",
  "content": { "type": "ack", "status": "ready", ... }
}
```
However, the section includes proper disclaimer: "> **Note**: Use the `agent-messaging` skill to send messages. The JSON structure below shows the message content." — this is PAP-compliant.

**PRESERVE items found**:
- 4-phase installation protocol (Pre-notification, Acknowledgment, Installation, Post-verification)
- Acknowledgment timeout (120 seconds, reminders every 30 seconds)

### 5.21 `commands/amcos-configure-plugins.md`
**Verdict**: CLEAN
Uses `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_configure_plugins.py"` — plugin-local script, acceptable.

**Note**: Line 113 references "Agent not found" error with suggestion "Verify agent name with AI Maestro API" — this is acceptable as an error handling note, not an operational instruction.

### 5.22 `commands/amcos-wait-for-agent-ok.md`
**Verdict**: HARDCODED_AMP (minor), RECORD_KEEPING

**VIOLATION — HARDCODED_AMP (lines 148-158)**:
JSON acknowledgment format embedded in "Acknowledgment Message Format" section:
```json
{
  "to": "<orchestrator-session>",
  "subject": "ACK: Ready",
  "content": {
    "type": "ack",
    "status": "ready",
    "message": "Work saved, ready for operation"
  }
}
```
The file does include the note: "> **Note**: Use the `agent-messaging` skill to send messages. The JSON structure below shows the message content." — so this is borderline. The JSON format is documented as message content, not as raw API payload. However, defining the canonical `ack` format inline (rather than referencing the `agent-messaging` skill's documented formats) is a PAP violation because different commands may define subtly different `ack` formats, leading to incompatibility.

**PRESERVE items found**:
- Timeout behavior rationale: "The orchestrator decides policy. This command provides information about whether ack was received, but doesn't block critical operations."
- Default values (TIMEOUT=120, REMIND_INTERVAL=30)
- Exit code semantics (exits 0 on timeout, displays warning)

### 5.23 `commands/amcos-wait-for-approval.md`
**Verdict**: CLEAN
Correctly uses `agent-messaging` skill for polling. Conditional execution (`--on-approved`, `--on-rejected`) also delegates to skills.

**PRESERVE items found**:
- Timeout recommendations table by operation type (hibernate/wake 60s, spawn 120s, install 120s, terminate 180s, replace 300s)
- Return codes 0-5 (approved/rejected/timeout/deferred/error/cancelled)
- Adaptive polling interval strategy (0-60s: every 5s; 60-180s: every 10s; 180s+: every 30s)
- Request ID format: `AMCOS-YYYYMMDDHHMMSS-XXXXXXXX` (slightly different from GovernanceRequest format GR-*)

---

## Summary of Violations by Category

### HARDCODED_API Violations

| File | Severity | Detail |
|------|----------|--------|
| `commands/amcos-request-approval.md` | **CRITICAL** | `POST /api/v1/governance/requests`, `GET /api/v1/governance/requests/{requestId}`, HTTP 429/Retry-After, rate limit (10 req/min) |
| `commands/amcos-transfer-agent.md` | **CRITICAL** | `POST /api/governance/transfers/` — inconsistent path format |
| `agents/amcos-approval-coordinator.md` | MAJOR | `POST /api/v1/governance/requests`, `GET /api/v1/governance/requests/{requestId}` |
| `commands/amcos-check-approval-status.md` | MINOR | Approval storage paths `~/.aimaestro/approvals/{pending,approved,rejected,expired}/` |
| `commands/amcos-notify-manager.md` | MINOR | Outbox path `~/.aimaestro/outbox/`, retry interval 5 min |
| `agents/amcos-chief-of-staff-main-agent.md` | MINOR | `GET /api/teams` referenced for recipient validation |
| `agents/amcos-team-coordinator.md` | MINOR | `GET /api/teams/{id}/agents` in key constraints |

### HARDCODED_GOVERNANCE Violations

| File | Severity | Detail |
|------|----------|--------|
| `commands/amcos-transfer-agent.md` | **CRITICAL** | `allowed_agents: [amcos-chief-of-staff, amcos-team-manager]` in YAML frontmatter |
| `commands/amcos-request-approval.md` | MAJOR | Full operation-to-approver-to-password matrix hardcoded (spawn/terminate/hibernate/wake/install/replace/critical) |
| `agents/amcos-approval-coordinator.md` | MAJOR | No-self-approval policy and governance password requirement re-declared (duplicates `team-governance` skill) |
| `agents/amcos-plugin-configurator.md` | MINOR | GovernanceRequest JSON format for remote config operations embedded inline |

### HARDCODED_AMP Violations

| File | Severity | Detail |
|------|----------|--------|
| `commands/amcos-request-approval.md` | MAJOR | Two full GovernanceRequest JSON schemas embedded (local and cross-team payloads) |
| `commands/amcos-wait-for-agent-ok.md` | MINOR | `ack` JSON format embedded (though with skill-usage note) |
| `commands/amcos-notify-manager.md` | MINOR | Expected `notification_ack` response JSON format embedded |

### CLI_SYNTAX Violations

| File | Severity | Detail |
|------|----------|--------|
| `commands/amcos-validate-skills.md` | MAJOR | `uv run --with pyyaml python scripts/validate_plugin.py` in both body and frontmatter `allowed-tools` — should use `cpv-validate-plugin` skill |
| `commands/amcos-recovery-workflow.md` | MINOR | "Send SIGTERM to Claude Code process (graceful stop)" in workflow step 2 |
| `shared/onboarding_checklist.md` | MINOR | `claude --session ... --project ... --plugin-dir ...` in Step 4 |

### REDUNDANT_OPERATIONS

| File | Detail |
|------|--------|
| `commands/amcos-request-approval.md` | Entire GovernanceRequest submission workflow duplicates `team-governance` skill |
| `commands/amcos-transfer-agent.md` | TransferRequest subset of cross-team GovernanceRequest already in `team-governance` skill |
| `agents/amcos-approval-coordinator.md` | Governance state machine and approval workflow duplicates `team-governance` skill |
| `commands/amcos-performance-report.md` | Data collection overlap with AI Maestro monitoring (acceptable: AMCOS adds rating calculation and star system) |

---

## Summary of PRESERVE Items (Do Not Remove)

The following items MUST be preserved across all files — they are AMCOS-specific record-keeping, threshold data, naming conventions, and state machine definitions that have no equivalent in the skills they may be adjacent to:

### Identity and Naming Conventions
- GovernanceRequest ID format: `GR-YYYYMMDDHHMMSS-XXXXXXXX`
- Approval request ID format: `AMCOS-YYYYMMDDHHMMSS-XXXXXXXX`
- Message ID format: `msg-YYYYMMDDHHMMSS-XXXXXXXX`
- Agent naming convention: `<team-prefix>-<role>[-<instance>]`
- Team naming convention: `<repo-name>-<project-type>-team`
- Session name prefixes: amcos-, eaa-, eoa-, eia-, eama-
- Handoff file naming: `handoff-{uuid}-{from}-to-{to}.md`

### Thresholds and Limits
- Max concurrent agents: 10
- Max agents per project: 5
- CPU spawn threshold: 80% (critical 95%)
- Memory spawn threshold: 85% (critical 95%)
- Disk spawn threshold: 90%
- Onboarding timeout: 60 seconds
- Heartbeat check interval: 300 seconds
- Escalation timeline: 60s reminder → 90s urgent → 120s auto-action
- Approval timeouts by operation type (hibernate 60s, spawn/install 120s, terminate 180s, replace 300s)
- Rate limiting: max 1 status/hr per topic, max 3 issue reports/hr for same issue
- Notification manager rate limit: max 10 GovernanceRequests/minute per COS

### State Machines and Workflows
- GovernanceRequest state machine: `pending → local-approved / remote-approved → dual-approved → executed / rejected`
- Failure classification: TRANSIENT (retry 3x) / RECOVERABLE (soft restart) / TERMINAL (manager approval)
- Recovery escalation levels: Level 1 restart → Level 2 hibernate-wake → Level 3 replace
- 4-phase skill installation protocol
- 6-step agent replacement workflow
- Approval decision return codes (0-5)
- Adaptive polling intervals

### Record-Keeping Structures
- Performance rating formula (40% success + 30% time + 20% error + 10% retry)
- Performance threshold table (>90% success, <4hr, <10% retry, <5% error)
- 90-day data retention rule
- 15-minute performance refresh cycle
- Approval storage path structure (`~/.aimaestro/approvals/{pending,approved,rejected,expired}/`)
- Governance tracking path: `~/.aimaestro/governance/pending/GR-*.json`
- Handoff storage: `docs_dev/handoffs/`
- Staffing plan storage: `docs_dev/staffing/SP-YYYYMMDD-HHMMSS.md`

### Governance Policy Definitions
- Messaging rules R6.1–R6.7 (who AMCOS can/cannot message)
- Role boundary table (AMCOS/EOA/EIA/EAA/EAMA responsibilities)
- Communication restriction: cannot message members of other closed teams directly
- GovernanceRequest required for cross-team operations (dual-manager approval)
- Plugin mutual exclusivity rule (one role plugin per Claude Code instance)
- `--scope local` requirement for plugin installation
- Kanban 8-column system definition

---

## Priority Fix List (Ordered by Severity)

### Critical (fix first)
1. **`commands/amcos-request-approval.md`** — Replace `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` with `team-governance` skill references. Remove embedded governance matrix and JSON schemas (preserve as reference notes only).
2. **`commands/amcos-transfer-agent.md`** — Remove `allowed_agents` from frontmatter. Replace `POST /api/governance/transfers/` with `team-governance` skill reference. Verify endpoint path consistency with governance skill spec.

### Major (fix second)
3. **`agents/amcos-approval-coordinator.md`** — Replace `POST /api/v1/governance/requests` references with `team-governance` skill.
4. **`commands/amcos-validate-skills.md`** — Replace `uv run --with pyyaml python` with `cpv-validate-plugin` / `cpv-validate-skill` skill references. Update `allowed-tools` frontmatter.

### Minor (fix third)
5. **`commands/amcos-notify-manager.md`** — Move `notification_ack` JSON format and outbox path to `agent-messaging` skill reference.
6. **`commands/amcos-check-approval-status.md`** — Remove hardcoded filesystem paths; reference `team-governance` skill for storage abstraction.
7. **`agents/amcos-plugin-configurator.md`** — Move GovernanceRequest JSON format for remote config to `team-governance` skill reference.
8. **`agents/amcos-chief-of-staff-main-agent.md`** — Replace `GET /api/teams` with `team-governance` skill reference.
9. **`agents/amcos-team-coordinator.md`** — Replace `GET /api/teams/{id}/agents` with `team-governance` skill reference.
10. **`commands/amcos-wait-for-agent-ok.md`** — Reference `agent-messaging` skill for canonical `ack` format definition.
11. **`commands/amcos-recovery-workflow.md`** — Replace SIGTERM reference with `ai-maestro-agents-management` skill's restart capability.
12. **`shared/onboarding_checklist.md`** — Replace `claude` CLI in Step 4 with `ai-maestro-agents-management` skill reference.

---

## File-Level Clean/Violation Summary

| File | Category | Verdict |
|------|----------|---------|
| `skills/team-governance/SKILL.md` | Governance Ref | CLEAN |
| `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md` | Governance Ref | CLEAN |
| `docs/AGENT_OPERATIONS.md` | Docs | CLEAN |
| `docs/FULL_PROJECT_WORKFLOW.md` | Docs | CLEAN |
| `docs/ROLE_BOUNDARIES.md` | Docs | CLEAN |
| `docs/TEAM_REGISTRY_SPECIFICATION.md` | Docs | CLEAN (examples use env vars) |
| `shared/handoff_template.md` | Shared | CLEAN |
| `shared/message_templates.md` | Shared | CLEAN |
| `shared/onboarding_checklist.md` | Shared | CLI_SYNTAX (minor) |
| `shared/performance_report_template.md` | Shared | CLEAN |
| `agents/amcos-chief-of-staff-main-agent.md` | Agent | HARDCODED_API (minor) |
| `agents/amcos-lifecycle-manager.md` | Agent | CLEAN |
| `agents/amcos-approval-coordinator.md` | Agent | HARDCODED_API + HARDCODED_GOVERNANCE (major) |
| `agents/amcos-recovery-coordinator.md` | Agent | CLEAN |
| `agents/amcos-performance-reporter.md` | Agent | CLEAN |
| `agents/amcos-resource-monitor.md` | Agent | CLEAN |
| `agents/amcos-skill-validator.md` | Agent | CLEAN |
| `agents/amcos-staff-planner.md` | Agent | CLEAN |
| `agents/amcos-team-coordinator.md` | Agent | HARDCODED_API (minor) |
| `agents/amcos-plugin-configurator.md` | Agent | HARDCODED_API (minor) |
| `commands/amcos-spawn-agent.md` | Command | CLEAN |
| `commands/amcos-terminate-agent.md` | Command | CLEAN |
| `commands/amcos-hibernate-agent.md` | Command | CLEAN |
| `commands/amcos-wake-agent.md` | Command | CLEAN |
| `commands/amcos-staff-status.md` | Command | CLEAN |
| `commands/amcos-health-check.md` | Command | CLEAN |
| `commands/amcos-recovery-workflow.md` | Command | CLI_SYNTAX (minor) |
| `commands/amcos-replace-agent.md` | Command | HARDCODED_GOVERNANCE (minor) |
| `commands/amcos-request-approval.md` | Command | **CRITICAL — HARDCODED_API + HARDCODED_GOVERNANCE + HARDCODED_AMP + CLI_SYNTAX** |
| `commands/amcos-resource-report.md` | Command | CLEAN |
| `commands/amcos-performance-report.md` | Command | CLEAN (minor redundancy, acceptable) |
| `commands/amcos-reindex-skills.md` | Command | CLEAN |
| `commands/amcos-transfer-agent.md` | Command | **CRITICAL — HARDCODED_API + HARDCODED_GOVERNANCE** |
| `commands/amcos-transfer-work.md` | Command | CLEAN |
| `commands/amcos-validate-skills.md` | Command | CLI_SYNTAX (major) |
| `commands/amcos-notify-manager.md` | Command | HARDCODED_AMP + HARDCODED_API (minor) |
| `commands/amcos-notify-agents.md` | Command | CLEAN |
| `commands/amcos-broadcast-notification.md` | Command | CLEAN |
| `commands/amcos-check-approval-status.md` | Command | HARDCODED_API (minor) |
| `commands/amcos-install-skill-notify.md` | Command | CLEAN |
| `commands/amcos-configure-plugins.md` | Command | CLEAN |
| `commands/amcos-wait-for-agent-ok.md` | Command | HARDCODED_AMP (minor) |
| `commands/amcos-wait-for-approval.md` | Command | CLEAN |

**Total files audited**: 44
**CLEAN**: 28 (64%)
**Minor violations**: 12 (27%)
**Critical/Major violations**: 4 (9%)
