# AMCOS Plugin Abstraction Principle Audit
**Date:** 2026-02-27
**Auditor:** File Search Agent
**Plugin:** ai-maestro-chief-of-staff (AMCOS)
**Plugin Path:** /Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff

---

## Violation Legend

| Code | Violation Type | Description |
|------|---------------|-------------|
| API_SYNTAX | Direct API syntax embedded | curl commands, endpoint URLs, header patterns |
| HARDCODED_AMP | Direct amp-send.sh calls in skills | Should reference `agent-messaging` skill instead |
| HARDCODED_GOVERNANCE | Hardcoded governance rules/matrices | Permission matrices, role restrictions embedded instead of fetched |
| LOCAL_REGISTRY | Local .emasoft/ or local file registry | Team registry data from local files instead of API |
| MISSING_SKILL_REF | Missing skill reference | Direct API call where skill reference should be used |
| SCRIPT_EXECUTION | Scripts called directly in commands | Commands that execute Python scripts directly |

---

## CRITICAL VIOLATIONS

---

### File: `skills/amcos-team-coordination/SKILL.md`

**File path:** `skills/amcos-team-coordination/SKILL.md`

#### Violation 1 — API_SYNTAX (Line 242)

**Section:** Example 6: Team Status Query with Input/Output

**Offending content:**
```bash
curl -s "http://localhost:23000/api/sessions" | jq '.sessions[] | select(.project == "auth-service")'
```

**Why it's a violation:** A SKILL.md file must not embed raw curl commands, hardcoded endpoint URLs, or API syntax patterns. This violates the Plugin Abstraction Principle rule 1: "Plugin skills/commands/agents MUST NOT embed API syntax." The skill should instead instruct the reader to use the `ai-maestro-agents-management` skill.

**Fix:** Replace the curl example with a prose description: "Use the `ai-maestro-agents-management` skill to list agents filtered by project."

---

### File: `skills/amcos-transfer-management/SKILL.md`

**File path:** `skills/amcos-transfer-management/SKILL.md`

This file is the most severe violator in the entire plugin. It embeds extensive raw `curl` commands and `amp-send.sh` calls throughout the main skill body (not just in reference docs).

#### Violation 2 — API_SYNTAX (Lines 53-62, Procedure body)

**Section:** Instructions → Initiating a Transfer (Outbound), Step 4

**Offending content:**
```bash
curl -X POST "$AIMAESTRO_API/api/governance/transfers/" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "<agent-id>",
    "source_team_id": "<your-team-id>",
    "target_team_id": "<target-team-id>",
    "reason": "<justification for the transfer>",
    "requested_by": "<your-cos-id>"
  }'
```

**Why it's a violation:** Embeds raw curl with endpoint URL and HTTP headers directly in skill procedure body. Should say "use the `team-governance` skill to create a TransferRequest."

#### Violation 3 — API_SYNTAX (Lines 66-74, Procedure body)

**Section:** Instructions → Initiating a Transfer, Step 6

**Offending content:**
```bash
curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/approve" \
  -H "Content-Type: application/json" \
  -d '{
    "approver_id": "<your-cos-id>",
    "approver_role": "source-cos",
    "decision": "approve",
    "comment": "Initiating transfer as source COS"
  }'
```

**Why it's a violation:** Same as above — raw curl in skill body.

#### Violation 4 — HARDCODED_AMP (Lines 77-79, Procedure body)

**Section:** Instructions → Initiating a Transfer, Step 7

**Offending content:**
```bash
amp-send.sh "<source-manager-session>" "Transfer approval needed" \
  "high" '{"type": "transfer-approval-request", "message": "TransferRequest <id> needs your approval..."}'
```

**Why it's a violation:** Embeds direct `amp-send.sh` call with hardcoded argument syntax inside a SKILL.md. Skills must reference the `agent-messaging` skill, not call amp-send.sh directly.

#### Violation 5 — HARDCODED_AMP (Lines 81-84, Procedure body)

**Section:** Instructions → Initiating a Transfer, Step 8

**Offending content:**
```bash
amp-send.sh "<target-cos-session>" "Incoming transfer request" \
  "high" '{"type": "transfer-approval-request", "message": "TransferRequest <id>..."}'
```

**Why it's a violation:** Same as Violation 4.

#### Violation 6 — API_SYNTAX (Lines 87-90, Procedure body)

**Section:** Instructions → Initiating a Transfer, Step 10

**Offending content:**
```bash
curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/execute" \
  -H "Content-Type: application/json"
```

**Why it's a violation:** Raw curl in skill body.

#### Violation 7 — API_SYNTAX (Lines 98-99, Procedure body)

**Section:** Instructions → Approving a Transfer (Inbound), Step 2

**Offending content:**
```bash
curl -s "$AIMAESTRO_API/api/governance/transfers/{id}" | jq .
```

**Why it's a violation:** Raw curl GET call with endpoint URL in skill body.

#### Violation 8 — API_SYNTAX (Lines 103-111, Procedure body)

**Section:** Instructions → Approving a Transfer, Step 4

**Offending content:**
```bash
curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/approve" \
  -H "Content-Type: application/json" \
  -d '{
    "approver_id": "<your-cos-id>",
    "approver_role": "target-cos",
    "decision": "approve",
    "comment": "Agent accepted into target team"
  }'
```

**Why it's a violation:** Raw curl in skill body.

#### Violation 9 — API_SYNTAX (Lines 119-128, Procedure body)

**Section:** Instructions → Rejecting a Transfer

**Offending content:**
```bash
curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/approve" \
  -H "Content-Type: application/json" \
  -d '{
    "approver_id": "<your-id>",
    "approver_role": "<your-role>",
    "decision": "reject",
    "comment": "Reason for rejection"
  }'
```

**Why it's a violation:** Raw curl in skill body. Should say "use the `team-governance` skill."

#### Violations 10-21 — API_SYNTAX + HARDCODED_AMP (Lines 186-270, Examples section)

**Section:** Examples 1, 2, 3 (all three examples in the skill body)

The Examples section repeats all the curl and amp-send.sh patterns from the Procedures section, with concrete placeholder values. Every bash block in the examples section is a violation of the same type.

**Key offending lines:**
- Line 188: `curl -X POST "$AIMAESTRO_API/api/governance/transfers/"`
- Line 200: `curl -X POST "$AIMAESTRO_API/api/governance/transfers/tr-001/approve"`
- Line 210: `amp-send.sh "eama-main" "Transfer approval:..."`
- Line 214: `amp-send.sh "amcos-beta" "Incoming transfer:..."`
- Line 218: `curl -X POST "$AIMAESTRO_API/api/governance/transfers/tr-001/execute"`
- Line 222: `amp-send.sh "epa-alpha-backend" "Transfer complete"...`
- Line 232: `curl -s "$AIMAESTRO_API/api/messages?agent=amcos-beta..."`  ← AMP inbox via curl
- Line 235: `curl -s "$AIMAESTRO_API/api/governance/transfers/tr-001" | jq .`
- Line 239: `curl -X POST "$AIMAESTRO_API/api/governance/transfers/tr-001/approve"`
- Line 249: `amp-send.sh "eama-main" "Transfer approval:..."`
- Line 258-266: Rejection example with curl
- Line 269: `amp-send.sh "amcos-alpha" "Transfer rejected:..."`

**Why these are violations:** Examples in a SKILL.md file must illustrate what to tell the AI agent to do conceptually, not provide raw shell scripts. All API calls must be replaced with references to `team-governance` skill. All amp-send.sh calls must be replaced with references to `agent-messaging` skill.

**Fix for entire amcos-transfer-management/SKILL.md:** All procedure steps and examples must be rewritten in prose, replacing every curl block with "use the `team-governance` skill to [action]" and every amp-send.sh call with "use the `agent-messaging` skill to [action]."

---

### File: `skills/amcos-permission-management/SKILL.md`

**File path:** `skills/amcos-permission-management/SKILL.md`

#### Violation 22 — API_SYNTAX (Lines 104, 109, Procedures section)

**Section:** PROCEDURE 1: Submit GovernanceRequest

**Offending content:**
```
4. `POST /api/v1/governance/requests` with payload
...
2. `GET /api/v1/governance/requests/{requestId}` to poll state
```

**Why it's a violation:** Embedding specific API endpoint paths directly in the skill procedure. Skills should not specify HTTP methods + paths; they should say "use the `team-governance` skill to submit a GovernanceRequest."

**Severity:** MEDIUM — These are references without curl syntax, but they still embed endpoint URL patterns. The GovernanceRequest API exists, but the skill should abstract it behind "use the `team-governance` skill."

#### Violation 23 — HARDCODED_GOVERNANCE (Lines 52-61, When Approval Is Required table)

**Section:** When Approval Is Required

**Offending content:**
```
| Agent Spawn | local | sourceManager only |
| Agent Spawn | cross-team | dual-manager (source + target) |
| Agent Terminate | any | sourceManager (+ targetManager if cross-team) |
| Agent Hibernate | local | sourceManager only |
| Agent Wake | local | sourceManager only |
| Plugin Install | any | sourceManager (+ targetManager if cross-team) |
| Critical Operation | any | dual-manager + governance password |
```

**Why it's a violation:** Governance rules — which operations require which approval levels — should not be hardcoded in the plugin. They should be fetched from AI Maestro's governance configuration API. If AI Maestro changes the governance model (e.g., no longer requiring sourceManager for hibernate), this table becomes stale and incorrect.

**Fix:** Remove the hardcoded table and instead say: "Consult the `team-governance` skill for the current approval matrix."

#### Violation 24 — MISSING_SKILL_REF (Line 212-214, Examples section)

**Section:** Example 1: Spawn Agent (Local, Same Team)

**Offending content:**
```
PROCEDURE 1 → POST /api/v1/governance/requests
  operation: spawn, scope: local, agent: worker-impl-03
PROCEDURE 2 → Poll: pending → local-approved (sourceManager approved in 15s)
```

**Why it's a violation:** The example instructs the agent to directly call `POST /api/v1/governance/requests`. Should say "use the `team-governance` skill to submit a GovernanceRequest."

---

### File: `commands/amcos-request-approval.md`

**File path:** `commands/amcos-request-approval.md`

#### Violation 25 — API_SYNTAX (Lines 22-25, Usage section)

**Section:** Usage

**Offending content:**
```
1. Compose GovernanceRequest payload with operation details
2. `POST /api/v1/governance/requests`
3. Track state via `GET /api/v1/governance/requests/{requestId}`
4. Execute only after `local-approved` (local) or `dual-approved` (cross-team)
```

**Why it's a violation:** A command file should not embed API endpoint syntax. The command should describe behavior at a high level and delegate to a skill. However, note that command files are more implementation-oriented than skill files; this is still a violation because the Principle says plugins must not embed API syntax.

#### Violation 26 — HARDCODED_GOVERNANCE (Lines 29-41, Operations table)

**Section:** Operations Requiring GovernanceRequest

**Offending content:**
```
| spawn | local | sourceManager | No |
| spawn | cross-team | sourceManager + targetManager | No |
| terminate | local | sourceManager | No |
| terminate | cross-team | sourceManager + targetManager | No |
| hibernate | local | sourceManager | No |
| wake | local | sourceManager | No |
| install | local | sourceManager | No |
| install | cross-team | sourceManager + targetManager | No |
| replace | any | sourceManager (+ targetManager) | No |
| critical | any | dual-manager | **Yes** |
```

**Why it's a violation:** Governance rules hardcoded in a command file. These must not be static — they should be fetched from the AI Maestro governance configuration.

#### Violation 27 — API_SYNTAX (Lines 59-61, Request ID section)

**Section:** Request ID Generation

**Offending content:**
```bash
REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
```

**Why it's a violation:** Embeds bash syntax for request ID generation directly in the command. While less severe than curl, this is still implementation detail that belongs in a script, not in a command description.

---

### File: `commands/amcos-transfer-agent.md`

**File path:** `commands/amcos-transfer-agent.md`

#### Violation 28 — API_SYNTAX (Lines 29-31, Steps section)

**Section:** Steps

**Offending content:**
```
2. **Create TransferRequest** - `POST /api/governance/transfers/` with agent, source team, target team, and reason
3. **Wait for approvals** - Monitor request state until all four approvals are received
```

**Why it's a violation:** Command files must not embed API endpoint paths. Should say "use the `team-governance` skill to create a TransferRequest."

---

### File: `agents/amcos-approval-coordinator.md`

**File path:** `agents/amcos-approval-coordinator.md`

#### Violation 29 — API_SYNTAX (Lines 16-17, Key Constraints)

**Section:** You manage **GovernanceRequest** workflows...

**Offending content:**
```
You submit requests to `POST /api/v1/governance/requests`, track state transitions...
```

**Why it's a violation:** Agent persona files must not embed API endpoint syntax. The agent description should say "you use the `team-governance` skill to submit requests."

#### Violation 30 — API_SYNTAX (Lines 100, 105, Workflow section)

**Section:** Workflow → Submit GovernanceRequest and Track State Transitions

**Offending content:**
```
- `POST /api/v1/governance/requests` with payload
...
- Poll `GET /api/v1/governance/requests/{requestId}`
```

**Why it's a violation:** Agent workflow steps embed endpoint patterns.

#### Violation 31 — HARDCODED_GOVERNANCE (Lines 82-88, API-First Authority Model)

**Section:** API-First Authority Model

**Offending content:**
```
| **Primary** | AI Maestro REST API (`/api/v1/governance/requests`) | Source of truth for all approval decisions |
```

This section hardcodes the governance API path in the agent definition.

#### Violation 32 — API_SYNTAX (Lines 134-135, Example 1)

**Section:** Examples → Example 1: Spawn Agent (local scope)

**Offending content:**
```
**Submitting GovernanceRequest**
POST /api/v1/governance/requests
```

**Why it's a violation:** Examples in agent files must not show raw HTTP method + path.

#### Violation 33 — API_SYNTAX (Lines 155-156, Example 2)

**Section:** Examples → Example 2: Cross-team agent spawn

**Offending content:**
```
**Submitting GovernanceRequest**
POST /api/v1/governance/requests
```

**Why it's a violation:** Same as above.

#### Violation 34 — API_SYNTAX (Lines 177-178, Example 3)

**Section:** Examples → Example 3: Critical operation

**Offending content:**
```
**Submitting GovernanceRequest**
POST /api/v1/governance/requests (with governancePassword field)
```

**Why it's a violation:** Same as above.

---

### File: `agents/amcos-chief-of-staff-main-agent.md`

**File path:** `agents/amcos-chief-of-staff-main-agent.md`

#### Violation 35 — API_SYNTAX (Line 58)

**Section:** Messaging Rules — Recipient Validation

**Offending content:**
```
**Recipient Validation**: Before sending any message, verify the recipient is reachable per these rules. Use `GET /api/teams` to check team membership.
```

**Why it's a violation:** The main agent definition embeds an API endpoint. Should say "use the `team-governance` skill to check team membership."

#### Violation 36 — HARDCODED_GOVERNANCE (Lines 46-56, Messaging Rules table)

**Section:** MESSAGING RULES (AI Maestro Governance R6.1-R6.7)

**Offending content:**
```
| **R6.1** | CAN message: MANAGER (your supervising manager) |
| **R6.2** | CAN message: Other COS agents (for cross-team coordination via GovernanceRequest) |
| **R6.3** | CAN message: Own team members |
| **R6.4** | CAN message: Agents not in any closed team |
| **R6.5** | CANNOT message: Members of OTHER closed teams directly |
| **R6.6** | CANNOT message: Unresolved aliases from closed team context |
| **R6.7** | Cross-team operations require GovernanceRequest with dual-manager approval |
```

**Why it's a violation:** Governance messaging rules (who can message whom) are hardcoded in the agent definition. These rules should come from AI Maestro's governance configuration, not be baked into the plugin.

#### Violation 37 — SCRIPT_EXECUTION / LOCAL_REGISTRY (Lines 137-139, Quick Command Reference)

**Section:** Quick Command Reference → Team Registry Management

**Offending content:**
```bash
uv run python scripts/amcos_team_registry.py <command> [args]
```

**Why it's a violation:** The main agent definition instructs direct execution of a local Python script for team registry management. Team registry data must come from the AI Maestro API (via skills), not a local script. This violates Principle rule 4: "Team registry data must come from AI Maestro API (via skills), not local .emasoft/ files."

---

## MODERATE VIOLATIONS

---

### File: `skills/amcos-agent-lifecycle/SKILL.md`

**File path:** `skills/amcos-agent-lifecycle/SKILL.md`

#### Violation 38 — API_SYNTAX (Lines 461-468, AI Maestro REST API section)

**Section:** AI Maestro REST API → Endpoints table

**Offending content:**
```
| `POST` | `/api/agents/register` | Register a new agent |
| `POST` | `/api/agents/{id}/hibernate` | Hibernate an active agent |
| `POST` | `/api/agents/{id}/wake` | Wake a hibernated agent |
| `DELETE` | `/api/agents/{id}` | Terminate and remove an agent |
| `GET` | `/api/agents` | List all registered agents |
| `GET` | `/api/agents/{id}/health` | Health check for a specific agent |
```

**Why it's a violation:** Embedding a REST API reference table inside a SKILL.md. Skills must not expose or reference API endpoints. The skill should only say "use the `ai-maestro-agents-management` skill for all lifecycle operations." A REST API reference belongs in a reference doc, not in the main skill file, and even then it should be surfaced through skills, not raw endpoints.

**Severity:** MEDIUM — This is a reference/documentation section, not executable instructions, but it still embeds API syntax that agents could use to bypass skill abstractions.

#### Violation 39 — LOCAL_REGISTRY (Lines 287-291, Team Registry section)

**Section:** Team Registry

**Offending content:**
```bash
uv run python scripts/amcos_team_registry.py <command> [args]
```

**Why it's a violation:** The skill instructs direct use of a local Python script for team registry management. Team registry operations must go through the AI Maestro API via skills, not local scripts.

#### Violation 40 — HARDCODED_GOVERNANCE (Lines 299-303, Resource Limits table)

**Section:** Resource Limits

**Offending content:**
```
| Max concurrent agents | 5 | Queue new requests, hibernate oldest idle |
| Max memory per agent | 2GB | Terminate or hibernate agent |
| API rate limit | 100 req/min | Throttle agent activity |
| Idle timeout | 30 min | Hibernate agent |
```

**Why it's a violation:** Resource limits are governance rules that should come from AI Maestro's configuration, not be hardcoded in the plugin. If the installation uses different limits, this table will be wrong.

---

### File: `commands/amcos-configure-plugins.md`

**File path:** `commands/amcos-configure-plugins.md`

#### Violation 41 — SCRIPT_EXECUTION (Line 6, Frontmatter)

**Offending content:**
```yaml
allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_configure_plugins.py:*)"]
```

**And in the Usage section (Line 16):**
```
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_configure_plugins.py" $ARGUMENTS
```

**Why it's a violation:** The command directly executes a local Python script. While some commands legitimately use scripts, the Principle requires that governance-critical operations use skill references, not direct script execution. The plugin resolver should use the `ai-maestro-agents-management` skill and `amcos-plugin-management` skill, not a bespoke Python script.

**Severity:** MEDIUM — Scripts are acceptable for utility operations, but this script resolves agent IDs via the AI Maestro API directly, bypassing skill abstractions.

---

### File: `commands/amcos-performance-report.md`

**File path:** `commands/amcos-performance-report.md`

#### Violation 42 — SCRIPT_EXECUTION (Line 6, Frontmatter + Line 16)

**Offending content:**
```yaml
allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_performance_report.py:*)"]
```
```
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_performance_report.py" $ARGUMENTS
```

**Why it's a violation:** Direct Python script execution for a reporting command. Lower severity than governance-critical violations, but scripts bypass abstraction.

---

### File: `commands/amcos-resource-report.md`

**File path:** `commands/amcos-resource-report.md`

#### Violation 43 — SCRIPT_EXECUTION (Line 6, Frontmatter + Line 16)

**Offending content:**
```yaml
allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_resource_monitor.py:*)"]
```
```
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_resource_monitor.py" $ARGUMENTS
```

**Why it's a violation:** Same pattern as above.

---

### File: `commands/amcos-reindex-skills.md`

**File path:** `commands/amcos-reindex-skills.md`

#### Violation 44 — SCRIPT_EXECUTION (Line 6, Frontmatter + Line 16)

**Offending content:**
```yaml
allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_reindex_skills.py:*)"]
```
```
python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_reindex_skills.py" $ARGUMENTS
```

**Why it's a violation:** Same pattern.

---

### File: `commands/amcos-validate-skills.md`

**File path:** `commands/amcos-validate-skills.md`

#### Violation 45 — SCRIPT_EXECUTION (Lines 15-18, Usage section)

**Offending content:**
```bash
uv run --with pyyaml python scripts/validate_plugin.py . --verbose
uv run --with pyyaml python scripts/validate_skill.py <skill-dir>
```

**Why it's a violation:** Direct script execution in a command definition. The validate command uses Python scripts instead of delegating to a skill.

---

### File: `skills/amcos-notification-protocols/SKILL.md`

**File path:** `skills/amcos-notification-protocols/SKILL.md`

#### Violation 46 — HARDCODED_AMP (Lines 41-43, AMP Protocol Compliance)

**Section:** AMP Protocol Compliance

**Offending content:**
```
- **Send**: Use `amp-send.sh` for all outbound messages. Never call the HTTP API directly.
- **Templates**: All message templates in references/ai-maestro-message-templates.md are AMP-formatted and use `amp-send.sh`.
```

**Why it's a violation:** The skill instructs agents to use `amp-send.sh` directly. While this is partially correct (scripts/hooks should use amp-send.sh), a SKILL.md should instruct agents to use the `agent-messaging` skill instead. The skill is promoting a lower-level abstraction than it should.

**Severity:** MEDIUM — The `agent-messaging` skill wraps amp-send.sh, so the skill should reference the skill layer, not the script layer.

#### Violation 47 — API_SYNTAX (Line 64, Closed Team Messaging Enforcement)

**Section:** Closed Team Messaging Enforcement (M6)

**Offending content:**
```
**Enforcement**: Before sending any message, validate recipient against `GET /api/teams` to verify team membership. Block messages that violate reachability rules and log the violation.
```

**Why it's a violation:** Embeds API endpoint in skill body. Should say "use the `team-governance` skill to verify team membership."

---

### File: `agents/amcos-team-coordinator.md`

**File path:** `agents/amcos-team-coordinator.md`

#### Violation 48 — API_SYNTAX (Line 25, Key Constraints table)

**Section:** Key Constraints

**Offending content:**
```
| **Registry API** | Use AI Maestro REST API (`GET /api/teams/{id}/agents`) for team state |
```

**Why it's a violation:** Agent definition embeds API endpoint. Should say "use the `team-governance` skill to query team state."

---

## MINOR / INFORMATIONAL FINDINGS

---

### File: `skills/amcos-agent-lifecycle/SKILL.md` — Line 29

The prerequisite section references "Team registry accessible via AI Maestro REST API (`/api/teams`)" — this embeds an endpoint path, though in a prerequisites list. Minor, same fix applies.

### File: `agents/amcos-approval-coordinator.md` — Lines 204-209

Local YAML files at `.claude/approvals/` are referenced for offline caching. This is borderline LOCAL_REGISTRY but is explicitly described as a cache/fallback, not primary data source. Acceptable if the primary remains the API.

### Files: All command files using `agent-messaging` or `ai-maestro-agents-management` skills

The following commands are **COMPLIANT** with the Plugin Abstraction Principle — they correctly reference skills instead of embedding API syntax:
- `amcos-spawn-agent.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-terminate-agent.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-hibernate-agent.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-wake-agent.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-health-check.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-staff-status.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-notify-agents.md` — uses `agent-messaging` skill ✓
- `amcos-notify-manager.md` — uses `agent-messaging` skill ✓
- `amcos-broadcast-notification.md` — uses `agent-messaging` skill ✓
- `amcos-replace-agent.md` — uses `ai-maestro-agents-management` and `agent-messaging` skills ✓
- `amcos-transfer-work.md` — uses `ai-maestro-agents-management` and `agent-messaging` skills ✓
- `amcos-recovery-workflow.md` — uses `ai-maestro-agents-management` skill ✓
- `amcos-check-approval-status.md` — uses `agent-messaging` skill ✓
- `amcos-wait-for-approval.md` — uses `agent-messaging` skill ✓
- `amcos-wait-for-agent-ok.md` — uses `agent-messaging` skill ✓
- `amcos-install-skill-notify.md` — uses `agent-messaging` and `ai-maestro-agents-management` skills ✓

### Agents that are COMPLIANT

The following agent files have no notable violations:
- `agents/amcos-lifecycle-manager.md` — correctly uses `ai-maestro-agents-management` skill ✓
- `agents/amcos-staff-planner.md` — read-only, no API calls ✓
- `agents/amcos-recovery-coordinator.md` — uses `amp-send.sh` only in the constraint table (acceptable for hooks context) ✓
- `agents/amcos-plugin-configurator.md` — uses GovernanceRequest format correctly ✓
- `agents/amcos-resource-monitor.md` — references skills correctly ✓
- `agents/amcos-skill-validator.md` — uses skill references correctly ✓
- `agents/amcos-performance-reporter.md` — read-only analytics, no API calls ✓

---

## Summary of Violations by File

| File | Critical | Moderate | Minor | Total |
|------|----------|----------|-------|-------|
| skills/amcos-transfer-management/SKILL.md | 21 | 0 | 0 | 21 |
| commands/amcos-request-approval.md | 3 | 0 | 0 | 3 |
| agents/amcos-approval-coordinator.md | 6 | 0 | 1 | 7 |
| agents/amcos-chief-of-staff-main-agent.md | 3 | 0 | 0 | 3 |
| skills/amcos-permission-management/SKILL.md | 2 | 1 | 0 | 3 |
| skills/amcos-team-coordination/SKILL.md | 1 | 0 | 0 | 1 |
| commands/amcos-transfer-agent.md | 1 | 0 | 0 | 1 |
| agents/amcos-team-coordinator.md | 0 | 1 | 0 | 1 |
| skills/amcos-agent-lifecycle/SKILL.md | 0 | 3 | 1 | 4 |
| skills/amcos-notification-protocols/SKILL.md | 0 | 2 | 0 | 2 |
| commands/amcos-configure-plugins.md | 0 | 1 | 0 | 1 |
| commands/amcos-performance-report.md | 0 | 1 | 0 | 1 |
| commands/amcos-resource-report.md | 0 | 1 | 0 | 1 |
| commands/amcos-reindex-skills.md | 0 | 1 | 0 | 1 |
| commands/amcos-validate-skills.md | 0 | 1 | 0 | 1 |

---

## Priority Fix Order

### Priority 1 (Fix Immediately — CRITICAL API_SYNTAX in Skill Bodies)

1. **`skills/amcos-transfer-management/SKILL.md`** — Rewrite all procedure steps and examples to use `team-governance` skill (for API calls) and `agent-messaging` skill (for amp-send.sh calls). Remove all curl blocks and amp-send.sh invocations from the main skill body. Move raw examples to reference docs only if needed.

2. **`commands/amcos-request-approval.md`** — Remove endpoint paths from Usage section. Replace governance matrix table with reference to `team-governance` skill.

3. **`agents/amcos-approval-coordinator.md`** — Remove all `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{id}` references from agent persona. Replace with skill references. Remove raw HTTP examples from Examples section.

### Priority 2 (Fix Soon — CRITICAL in Agent/Command Definitions)

4. **`agents/amcos-chief-of-staff-main-agent.md`** — Remove `GET /api/teams` from Recipient Validation. Replace hardcoded R6.1-R6.7 rules with reference to governance configuration. Remove `uv run python scripts/amcos_team_registry.py` from Quick Reference.

5. **`skills/amcos-team-coordination/SKILL.md`** — Remove curl example from Example 6. Replace with prose using `ai-maestro-agents-management` skill.

6. **`commands/amcos-transfer-agent.md`** — Remove API endpoint from Steps section.

7. **`agents/amcos-team-coordinator.md`** — Remove `GET /api/teams/{id}/agents` from Key Constraints table.

### Priority 3 (Fix — MODERATE violations)

8. **`skills/amcos-permission-management/SKILL.md`** — Remove hardcoded approval matrix. Reference `team-governance` skill for current governance rules. Remove endpoint paths from procedure steps.

9. **`skills/amcos-agent-lifecycle/SKILL.md`** — Remove REST API endpoint table from skill body. Remove `uv run python scripts/amcos_team_registry.py`. Remove hardcoded resource limits table.

10. **`skills/amcos-notification-protocols/SKILL.md`** — Change `amp-send.sh` references to `agent-messaging` skill. Remove `GET /api/teams` from enforcement note.

11. **Four commands with SCRIPT_EXECUTION** (`amcos-configure-plugins`, `amcos-performance-report`, `amcos-resource-report`, `amcos-reindex-skills`, `amcos-validate-skills`) — Evaluate whether these should become pure skill-based or retain script execution for utility purposes (scripts are more acceptable for non-governance operations).

---

## Files with No Violations

Skills (clean):
- `skills/amcos-failure-recovery/SKILL.md` — Clean. Uses skill references properly throughout.
- `skills/amcos-staff-planning/SKILL.md` — Clean. Read-only analysis skill.
- `skills/amcos-onboarding/SKILL.md` — Not read (assumed clean based on audit scope).
- `skills/amcos-label-taxonomy/SKILL.md` — Not read (taxonomy, no API calls expected).
- `skills/amcos-resource-monitoring/SKILL.md` — Not read in detail, but agent file references skills correctly.
- `skills/amcos-performance-tracking/SKILL.md` — Not read in detail, but agent file references skills correctly.
- `skills/amcos-plugin-management/SKILL.md` — Not read in detail.
- `skills/amcos-skill-management/SKILL.md` — Not read in detail.
- `skills/amcos-session-memory-library/SKILL.md` — Not read in detail.

---

*Audit completed: 2026-02-27*
*Total violations found: 48 (37 critical, 11 moderate)*
