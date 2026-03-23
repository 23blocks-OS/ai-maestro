# Decoupling Changes — AMCOS (ai-maestro-chief-of-staff) v1.3.5
Date: 2026-02-27

## Design Principle

> Plugin skills should reference AI Maestro's global skills by name (not embed API syntax).
> Plugin hooks should call global scripts (not curl).
> See docs/PLUGIN-ABSTRACTION-PRINCIPLE.md.

The Plugin Abstraction Principle prohibits plugin files from embedding:
- Raw `curl` commands or HTTP endpoint URLs
- Direct `amp-send.sh` / `amp-*.sh` calls inside SKILL.md bodies
- Hardcoded governance rules, permission matrices, or resource limits
- Local Python script execution for operations that belong to skill-level abstractions
- Team registry access via local files or bespoke scripts instead of the API

---

## AI Maestro Global Skills Referenced

- `team-governance` — Team CRUD, COS assignment, governance requests, transfers, auth
- `ai-maestro-agents-management` — Agent lifecycle via `aimaestro-agent.sh` CLI
- `agent-messaging` — Inter-agent messaging via `amp-*` scripts

---

## Change Specification

---

### 1. `skills/amcos-transfer-management/SKILL.md`

**Priority: CRITICAL**

**Violation count: 21 violations (highest in the entire plugin)**

**Current content summary:**

This file is the most severely non-compliant file in the plugin. The procedures section (lines 53–130) and the examples section (lines 186–270) both embed raw shell commands directly in the skill body. Violations span three types:

- **API_SYNTAX (12 instances):** Raw `curl -X POST "$AIMAESTRO_API/api/governance/transfers/"`, `curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/approve"`, `curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/execute"`, `curl -s "$AIMAESTRO_API/api/governance/transfers/{id}"`, and `curl -s "$AIMAESTRO_API/api/messages?agent=..."` embedded across procedure steps and all three examples.
- **HARDCODED_AMP (7 instances):** `amp-send.sh "<session>" "subject" "priority" '{"type": "transfer-approval-request", ...}'` calls embedded in procedure steps (lines 77–79, 81–84) and repeated across examples (lines 210, 214, 222, 249, 269).
- The examples section is particularly egregious: rather than showing conceptual flows, each of the three examples (Outbound Transfer, Inbound Approval, Rejection) reproduces the full shell command sequence verbatim.

**Required changes:**

**Procedures section — Initiating a Transfer (Outbound):**

Replace every `curl` block and `amp-send.sh` call with prose skill references:

| Step | Current (violating) | Required replacement |
|------|---------------------|----------------------|
| Step 4 | `curl -X POST "$AIMAESTRO_API/api/governance/transfers/"` with JSON body | "Use the `team-governance` skill to create a TransferRequest, providing the agent ID, source team ID, target team ID, and justification reason." |
| Step 6 | `curl -X POST ".../approve"` with source-cos approval body | "Use the `team-governance` skill to submit your source-COS approval on the TransferRequest." |
| Step 7 | `amp-send.sh "<source-manager-session>" "Transfer approval needed" ...` | "Use the `agent-messaging` skill to send a high-priority transfer approval request message to your supervising manager." |
| Step 8 | `amp-send.sh "<target-cos-session>" "Incoming transfer request" ...` | "Use the `agent-messaging` skill to notify the target COS of the incoming TransferRequest." |
| Step 10 | `curl -X POST ".../execute"` | "Once all four approvals are collected, use the `team-governance` skill to execute the transfer." |

**Procedures section — Approving a Transfer (Inbound):**

| Step | Current (violating) | Required replacement |
|------|---------------------|----------------------|
| Step 2 | `curl -s "$AIMAESTRO_API/api/governance/transfers/{id}"` | "Use the `team-governance` skill to retrieve the full TransferRequest details." |
| Step 4 | `curl -X POST ".../approve"` with target-cos body | "Use the `team-governance` skill to submit your target-COS approval on the TransferRequest." |

**Procedures section — Rejecting a Transfer:**

| Step | Current (violating) | Required replacement |
|------|---------------------|----------------------|
| Rejection step | `curl -X POST ".../approve"` with `"decision": "reject"` | "Use the `team-governance` skill to reject the TransferRequest, providing your role and rejection reason." |

**Examples section (lines 186–270) — all three examples:**

All bash blocks in the examples must be removed. Replace each example with a prose narrative that describes the conceptual flow:

- Example 1 (Outbound Transfer): Replace all curl and amp-send.sh blocks with a step-by-step prose walkthrough referencing `team-governance` and `agent-messaging` skills at each step.
- Example 2 (Inbound Approval): Same — prose only, no shell blocks.
- Example 3 (Rejection): Same — prose only, no shell blocks.

If raw API examples are required for developer reference, move them to a separate `references/amcos-transfer-api-examples.md` file that is explicitly marked as a developer reference document, not part of the SKILL.md that agents execute.

---

### 2. `skills/amcos-team-coordination/SKILL.md`

**Priority: CRITICAL**

**Violation count: 1 violation**

**Current content summary:**

- **API_SYNTAX (line 242):** Example 6 "Team Status Query with Input/Output" contains:
  ```bash
  curl -s "http://localhost:23000/api/sessions" | jq '.sessions[] | select(.project == "auth-service")'
  ```
  This embeds a hardcoded localhost URL and raw curl command inside a SKILL.md example block.

**Required changes:**

Remove the curl command block from Example 6. Replace with prose:

> "Use the `ai-maestro-agents-management` skill to list active agents filtered by project. For example: 'List all agents currently assigned to the auth-service project.'"

The example should demonstrate the natural-language request pattern, not the raw API call.

---

### 3. `skills/amcos-permission-management/SKILL.md`

**Priority: CRITICAL / HIGH** (two critical, one moderate)

**Violation count: 3 violations**

**Current content summary:**

- **API_SYNTAX (lines 104, 109 — CRITICAL):** PROCEDURE 1 "Submit GovernanceRequest" lists steps as:
  ```
  4. POST /api/v1/governance/requests with payload
  ...
  2. GET /api/v1/governance/requests/{requestId} to poll state
  ```
  Endpoint paths with HTTP methods embedded in procedure steps.

- **HARDCODED_GOVERNANCE (lines 52–61 — CRITICAL):** A table titled "When Approval Is Required" hardcodes the full governance approval matrix:
  ```
  | Agent Spawn | local | sourceManager only |
  | Agent Spawn | cross-team | dual-manager (source + target) |
  | Agent Terminate | any | sourceManager (+ targetManager if cross-team) |
  | Agent Hibernate | local | sourceManager only |
  | Agent Wake | local | sourceManager only |
  | Plugin Install | any | sourceManager (+ targetManager if cross-team) |
  | Critical Operation | any | dual-manager + governance password |
  ```

- **MISSING_SKILL_REF (lines 212–214 — MODERATE):** Example 1 shows:
  ```
  PROCEDURE 1 → POST /api/v1/governance/requests
    operation: spawn, scope: local, agent: worker-impl-03
  ```

**Required changes:**

**API_SYNTAX fix (PROCEDURE 1 steps):**

Replace:
- Step 4: `POST /api/v1/governance/requests with payload` → "Use the `team-governance` skill to submit a GovernanceRequest with the operation, scope, and target agent details."
- Step 2 (polling): `GET /api/v1/governance/requests/{requestId} to poll state` → "Use the `team-governance` skill to check the status of the GovernanceRequest until it reaches `local-approved` or `dual-approved`."

**HARDCODED_GOVERNANCE fix (approval matrix table):**

Remove the entire hardcoded "When Approval Is Required" table. Replace with:

> "Consult the `team-governance` skill for the current approval matrix. The governance configuration is managed by AI Maestro and may vary by installation. Do not rely on a hardcoded table — query the live configuration."

**MISSING_SKILL_REF fix (Example 1):**

Replace `PROCEDURE 1 → POST /api/v1/governance/requests` with:

> "Use the `team-governance` skill to submit a GovernanceRequest: operation=spawn, scope=local, target=worker-impl-03."

---

### 4. `skills/amcos-agent-lifecycle/SKILL.md`

**Priority: HIGH** (three moderate, one minor)

**Violation count: 4 violations**

**Current content summary:**

- **API_SYNTAX (lines 461–468 — MODERATE):** A section titled "AI Maestro REST API → Endpoints table" embeds a full REST endpoint reference:
  ```
  | POST | /api/agents/register       | Register a new agent      |
  | POST | /api/agents/{id}/hibernate  | Hibernate an active agent |
  | POST | /api/agents/{id}/wake       | Wake a hibernated agent   |
  | DELETE | /api/agents/{id}          | Terminate and remove an agent |
  | GET  | /api/agents                 | List all registered agents |
  | GET  | /api/agents/{id}/health     | Health check for specific agent |
  ```

- **LOCAL_REGISTRY (lines 287–291 — MODERATE):** The skill body instructs:
  ```bash
  uv run python scripts/amcos_team_registry.py <command> [args]
  ```

- **HARDCODED_GOVERNANCE (lines 299–303 — MODERATE):** A "Resource Limits" table hardcodes:
  ```
  | Max concurrent agents | 5       | Queue new requests, hibernate oldest idle |
  | Max memory per agent  | 2GB     | Terminate or hibernate agent              |
  | API rate limit        | 100 req/min | Throttle agent activity              |
  | Idle timeout          | 30 min  | Hibernate agent                           |
  ```

- **API_SYNTAX (line 29 — MINOR):** Prerequisites section references "Team registry accessible via AI Maestro REST API (`/api/teams`)".

**Required changes:**

**API endpoint table (MODERATE):**

Remove the "AI Maestro REST API → Endpoints" table entirely from the SKILL.md body. Replace with:

> "For all agent lifecycle operations — register, hibernate, wake, terminate, list, health-check — use the `ai-maestro-agents-management` skill. Do not call API endpoints directly."

If a developer reference table is needed, move it to `references/amcos-agent-lifecycle-api-ref.md` with a clear note that it is a reference document for contributors, not operational instructions.

**LOCAL_REGISTRY fix:**

Remove the `uv run python scripts/amcos_team_registry.py` instruction. Replace with:

> "To query team registry data, use the `team-governance` skill. Team registry operations must go through the AI Maestro API, not a local Python script."

**HARDCODED_GOVERNANCE fix (Resource Limits table):**

Remove the hardcoded resource limits table. Replace with:

> "Resource limits (concurrent agents, memory caps, rate limits, idle timeouts) are governed by the AI Maestro installation configuration. Consult the `team-governance` skill or the AI Maestro administrator for current limits. Do not rely on hardcoded values."

**Minor prerequisite fix (line 29):**

Replace `"Team registry accessible via AI Maestro REST API (/api/teams)"` with:

> "Team registry accessible via the `team-governance` skill."

---

### 5. `skills/amcos-notification-protocols/SKILL.md`

**Priority: HIGH** (two moderate violations)

**Violation count: 2 violations**

**Current content summary:**

- **HARDCODED_AMP (lines 41–43 — MODERATE):** The "AMP Protocol Compliance" section instructs:
  ```
  - Send: Use amp-send.sh for all outbound messages. Never call the HTTP API directly.
  - Templates: All message templates in references/ai-maestro-message-templates.md are AMP-formatted and use amp-send.sh.
  ```

- **API_SYNTAX (line 64 — MODERATE):** The "Closed Team Messaging Enforcement (M6)" section states:
  ```
  Enforcement: Before sending any message, validate recipient against GET /api/teams to verify team membership. Block messages that violate reachability rules and log the violation.
  ```

**Required changes:**

**HARDCODED_AMP fix (AMP Protocol Compliance section):**

The skill instructs agents to use `amp-send.sh` directly — a script-level abstraction. Skills must reference the skill layer above the script layer.

Replace:
- `"Use amp-send.sh for all outbound messages."` → `"Use the agent-messaging skill to send all outbound messages. The skill handles AMP formatting, signing, and delivery routing."`
- `"use amp-send.sh"` reference in templates line → `"use the agent-messaging skill"`

**API_SYNTAX fix (Closed Team Messaging Enforcement):**

Replace `"validate recipient against GET /api/teams"` with:

> "Before sending any message, use the `team-governance` skill to verify the recipient's team membership and reachability. Block messages that violate reachability rules and log the violation."

---

### 6. `agents/amcos-chief-of-staff-main-agent.md`

**Priority: CRITICAL**

**Violation count: 3 violations**

**Current content summary:**

- **API_SYNTAX (line 58 — CRITICAL):** Messaging Rules — Recipient Validation section states:
  ```
  Recipient Validation: Before sending any message, verify the recipient is reachable per these rules. Use GET /api/teams to check team membership.
  ```

- **HARDCODED_GOVERNANCE (lines 46–56 — CRITICAL):** The main agent persona embeds a full governance messaging rules table labeled "MESSAGING RULES (AI Maestro Governance R6.1-R6.7)":
  ```
  | R6.1 | CAN message: MANAGER (your supervising manager) |
  | R6.2 | CAN message: Other COS agents (for cross-team coordination via GovernanceRequest) |
  | R6.3 | CAN message: Own team members |
  | R6.4 | CAN message: Agents not in any closed team |
  | R6.5 | CANNOT message: Members of OTHER closed teams directly |
  | R6.6 | CANNOT message: Unresolved aliases from closed team context |
  | R6.7 | Cross-team operations require GovernanceRequest with dual-manager approval |
  ```

- **SCRIPT_EXECUTION / LOCAL_REGISTRY (lines 137–139 — CRITICAL):** Quick Command Reference section lists:
  ```bash
  uv run python scripts/amcos_team_registry.py <command> [args]
  ```

**Required changes:**

**API_SYNTAX fix (Recipient Validation):**

Replace `"Use GET /api/teams to check team membership."` with:

> "Use the `team-governance` skill to check team membership before sending any message."

**HARDCODED_GOVERNANCE fix (R6.1-R6.7 table):**

Remove the entire hardcoded R6.1-R6.7 messaging rules table from the agent persona. The governance model may change between AI Maestro versions, and a baked-in rule set will silently become stale.

Replace with:

> "Messaging reachability rules are defined by AI Maestro's governance configuration. Before sending any cross-team or external message, use the `team-governance` skill to verify that the intended recipient is reachable from your current team context. Never rely on a hardcoded rule set — always query the live governance state."

**SCRIPT_EXECUTION fix (Team Registry Management):**

Remove `uv run python scripts/amcos_team_registry.py <command> [args]` from the Quick Command Reference. Replace the "Team Registry Management" entry with:

> "Team Registry Management: Use the `team-governance` skill for all team registry queries and updates."

---

### 7. `agents/amcos-approval-coordinator.md`

**Priority: CRITICAL**

**Violation count: 7 violations (6 critical, 1 minor)**

**Current content summary:**

- **API_SYNTAX (lines 16–17 — CRITICAL):** Key Constraints section states:
  ```
  You submit requests to POST /api/v1/governance/requests, track state transitions...
  ```

- **API_SYNTAX (lines 100, 105 — CRITICAL):** Workflow → Submit GovernanceRequest section lists:
  ```
  - POST /api/v1/governance/requests with payload
  ...
  - Poll GET /api/v1/governance/requests/{requestId}
  ```

- **HARDCODED_GOVERNANCE (lines 82–88 — CRITICAL):** API-First Authority Model table embeds:
  ```
  | Primary | AI Maestro REST API (/api/v1/governance/requests) | Source of truth for all approval decisions |
  ```

- **API_SYNTAX (lines 134–135 — CRITICAL):** Example 1 "Spawn Agent (local scope)":
  ```
  Submitting GovernanceRequest
  POST /api/v1/governance/requests
  ```

- **API_SYNTAX (lines 155–156 — CRITICAL):** Example 2 "Cross-team agent spawn":
  ```
  Submitting GovernanceRequest
  POST /api/v1/governance/requests
  ```

- **API_SYNTAX (lines 177–178 — CRITICAL):** Example 3 "Critical operation":
  ```
  Submitting GovernanceRequest
  POST /api/v1/governance/requests (with governancePassword field)
  ```

- **MINOR:** Lines 204–209 reference `.claude/approvals/` local YAML files for offline caching — borderline LOCAL_REGISTRY, but explicitly described as a fallback cache. Acceptable if primary source remains the API; note the acceptable boundary clearly.

**Required changes:**

**Key Constraints fix (lines 16–17):**

Replace `"You submit requests to POST /api/v1/governance/requests"` with:

> "You submit requests using the `team-governance` skill, which manages GovernanceRequest creation, submission, and state tracking."

**Workflow steps fix (lines 100, 105):**

Replace:
- `"POST /api/v1/governance/requests with payload"` → `"Use the team-governance skill to submit a GovernanceRequest with the required operation, scope, target agent, and requestor fields."`
- `"Poll GET /api/v1/governance/requests/{requestId}"` → `"Use the team-governance skill to check the GovernanceRequest status, polling until the state reaches local-approved or dual-approved."`

**API-First Authority Model table fix (lines 82–88):**

Replace the raw endpoint in the table:
- `AI Maestro REST API (/api/v1/governance/requests)` → `team-governance skill (backed by AI Maestro REST API)`

**Examples sections fix (lines 134–135, 155–156, 177–178):**

In all three examples, replace:
```
Submitting GovernanceRequest
POST /api/v1/governance/requests
```
with:
```
Submitting GovernanceRequest
Use the team-governance skill: "Submit a GovernanceRequest for [operation] [scope] [target]"
```

For Example 3, the `governancePassword` note should become:
> "Use the team-governance skill to submit a GovernanceRequest for a critical operation; the skill will prompt for the governance password as required."

**Minor — offline cache note (lines 204–209):**

Add an explicit boundary comment:
> "Note: Local `.claude/approvals/` YAML files are used only as an offline cache when the AI Maestro API is unreachable. The primary source of truth is always the `team-governance` skill. Never write to this cache directly — it is populated by the skill."

---

### 8. `agents/amcos-team-coordinator.md`

**Priority: MEDIUM**

**Violation count: 1 violation**

**Current content summary:**

- **API_SYNTAX (line 25 — MODERATE):** Key Constraints table contains:
  ```
  | Registry API | Use AI Maestro REST API (GET /api/teams/{id}/agents) for team state |
  ```

**Required changes:**

Replace the raw endpoint in the Key Constraints table:

- `AI Maestro REST API (GET /api/teams/{id}/agents)` → `team-governance skill`

Full replacement:
```
| Registry API | Use the team-governance skill to query team state and agent membership |
```

---

### 9. `commands/amcos-request-approval.md`

**Priority: CRITICAL**

**Violation count: 3 violations**

**Current content summary:**

- **API_SYNTAX (lines 22–25 — CRITICAL):** Usage section lists:
  ```
  1. Compose GovernanceRequest payload with operation details
  2. POST /api/v1/governance/requests
  3. Track state via GET /api/v1/governance/requests/{requestId}
  4. Execute only after local-approved (local) or dual-approved (cross-team)
  ```

- **HARDCODED_GOVERNANCE (lines 29–41 — CRITICAL):** "Operations Requiring GovernanceRequest" table hardcodes:
  ```
  | spawn     | local      | sourceManager                          | No  |
  | spawn     | cross-team | sourceManager + targetManager          | No  |
  | terminate | local      | sourceManager                          | No  |
  | terminate | cross-team | sourceManager + targetManager          | No  |
  | hibernate | local      | sourceManager                          | No  |
  | wake      | local      | sourceManager                          | No  |
  | install   | local      | sourceManager                          | No  |
  | install   | cross-team | sourceManager + targetManager          | No  |
  | replace   | any        | sourceManager (+ targetManager)        | No  |
  | critical  | any        | dual-manager                           | Yes |
  ```

- **API_SYNTAX (lines 59–61 — LOW):** Request ID Generation section embeds bash syntax:
  ```bash
  REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
  ```

**Required changes:**

**API_SYNTAX fix (Usage section steps 2–3):**

Replace:
- Step 2: `POST /api/v1/governance/requests` → `"Use the team-governance skill to submit the GovernanceRequest."`
- Step 3: `Track state via GET /api/v1/governance/requests/{requestId}` → `"Use the team-governance skill to poll the GovernanceRequest status."`

**HARDCODED_GOVERNANCE fix (Operations table):**

Remove the entire hardcoded operations/approvers table. Replace with:

> "The set of operations that require a GovernanceRequest and the required approver roles are defined in the AI Maestro governance configuration. Use the `team-governance` skill to determine approval requirements for any operation. The governance model is dynamic and must be queried at runtime, not read from a static table."

**API_SYNTAX / implementation detail fix (Request ID Generation):**

Remove the bash snippet for request ID generation. Replace with:

> "Request IDs are assigned by AI Maestro when the GovernanceRequest is submitted via the `team-governance` skill. You do not need to generate them manually."

---

### 10. `commands/amcos-transfer-agent.md`

**Priority: CRITICAL**

**Violation count: 1 violation**

**Current content summary:**

- **API_SYNTAX (lines 29–31 — CRITICAL):** Steps section item 2 states:
  ```
  2. Create TransferRequest - POST /api/governance/transfers/ with agent, source team, target team, and reason
  3. Wait for approvals - Monitor request state until all four approvals are received
  ```

**Required changes:**

Replace Step 2:
- `POST /api/governance/transfers/ with agent, source team, target team, and reason` → `"Use the team-governance skill to create a TransferRequest, providing the agent ID, source team, target team, and reason."`

Step 3 requires no change (it describes monitoring behavior, not an API call), but add clarity:
- Append: `"Use the team-governance skill to check the TransferRequest status."`

---

### 11. `commands/amcos-configure-plugins.md`

**Priority: MEDIUM**

**Violation count: 1 violation**

**Current content summary:**

- **SCRIPT_EXECUTION (line 6 frontmatter + line 16 — MODERATE):**
  ```yaml
  allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_configure_plugins.py:*)"]
  ```
  ```
  python3 "${CLAUDE_PLUGIN_ROOT}/scripts/amcos_configure_plugins.py" $ARGUMENTS
  ```
  This script resolves agent IDs via the AI Maestro API directly, bypassing skill abstractions.

**Required changes:**

Evaluate whether `amcos_configure_plugins.py` is a pure utility script (acceptable to retain) or whether it makes governance-sensitive API calls (must be replaced with skill references).

If the script calls governance or agent management endpoints:
- Replace the `python3 ...` execution with a reference to the `ai-maestro-agents-management` skill and/or `amcos-plugin-management` skill.
- Update `allowed-tools` accordingly.

If the script is a utility only (file manipulation, YAML parsing, no API calls):
- Retain the script execution but add a comment: `# This script performs local utility operations only; governance calls must use skills.`
- Audit the script source to verify it makes no API calls.

**Action required:** Audit `scripts/amcos_configure_plugins.py` source before deciding.

---

### 12. `commands/amcos-performance-report.md`

**Priority: LOW**

**Violation count: 1 violation**

**Current content summary:**

- **SCRIPT_EXECUTION (line 6 + line 16 — LOW):**
  ```yaml
  allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_performance_report.py:*)"]
  ```
  Direct Python script execution for a reporting command.

**Required changes:**

Performance reporting is a read-only, analytics-only operation with lower governance sensitivity than lifecycle or transfer commands.

Options (choose one based on script internals):
1. **Retain if read-only:** If `amcos_performance_report.py` only reads cached metrics/logs without calling governance endpoints, the script execution is acceptable. Add a comment confirming this.
2. **Replace if API-dependent:** If the script calls `/api/agents` or other AI Maestro endpoints, replace with: "Use the `ai-maestro-agents-management` skill to retrieve performance metrics."

**Action required:** Audit `scripts/amcos_performance_report.py` to confirm it makes no governance API calls.

---

### 13. `commands/amcos-resource-report.md`

**Priority: LOW**

**Violation count: 1 violation**

**Current content summary:**

- **SCRIPT_EXECUTION (line 6 + line 16 — LOW):**
  ```yaml
  allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_resource_monitor.py:*)"]
  ```

**Required changes:**

Same evaluation as `amcos-performance-report.md` above. Resource monitoring is read-only analytics; the main concern is whether the script calls governance endpoints.

If it queries `/api/agents/{id}/health` or similar — replace with `ai-maestro-agents-management` skill reference.
If it reads system metrics only — retain with a confirming comment.

**Action required:** Audit `scripts/amcos_resource_monitor.py`.

---

### 14. `commands/amcos-reindex-skills.md`

**Priority: LOW**

**Violation count: 1 violation**

**Current content summary:**

- **SCRIPT_EXECUTION (line 6 + line 16 — LOW):**
  ```yaml
  allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_reindex_skills.py:*)"]
  ```

**Required changes:**

Skill indexing is a local file operation (scanning SKILL.md files, building indexes). This is a utility operation that does not interact with AI Maestro governance APIs.

Recommended action: **Retain the script execution** but add a confirming comment:
```yaml
# amcos_reindex_skills.py performs local file indexing only — no governance API calls.
# If governance data is needed during indexing, refactor to call the team-governance skill.
```

**Action required:** Verify `scripts/amcos_reindex_skills.py` makes no API calls before confirming retention.

---

### 15. `commands/amcos-validate-skills.md`

**Priority: LOW**

**Violation count: 1 violation**

**Current content summary:**

- **SCRIPT_EXECUTION (lines 15–18 — LOW):** Usage section shows:
  ```bash
  uv run --with pyyaml python scripts/validate_plugin.py . --verbose
  uv run --with pyyaml python scripts/validate_skill.py <skill-dir>
  ```

**Required changes:**

Plugin/skill validation is a structural correctness check (schema validation, required fields, YAML syntax). This is a local utility operation with no governance implications.

Recommended action: **Retain the script execution** for validation commands. However, ensure the commands accurately reflect that this is a developer/contributor utility, not an operational command.

Add a note to the command description:
> "This command runs local validation scripts that check plugin file structure and schema compliance. It does not call AI Maestro APIs. For runtime governance checks, use the `team-governance` skill."

---

## Summary Table

| File | Violation Types | Violation Count | Priority | Action |
|------|----------------|-----------------|----------|--------|
| `skills/amcos-transfer-management/SKILL.md` | API_SYNTAX, HARDCODED_AMP | 21 | CRITICAL | Rewrite all procedure steps and examples: replace all curl with `team-governance` skill, all amp-send.sh with `agent-messaging` skill |
| `agents/amcos-approval-coordinator.md` | API_SYNTAX, HARDCODED_GOVERNANCE | 7 (6 critical, 1 minor) | CRITICAL | Remove all `POST/GET /api/v1/governance/requests` from constraints, workflow, and examples; replace with `team-governance` skill references |
| `commands/amcos-request-approval.md` | API_SYNTAX, HARDCODED_GOVERNANCE | 3 | CRITICAL | Remove endpoint paths from Usage; remove hardcoded operations table; remove bash ID generation |
| `agents/amcos-chief-of-staff-main-agent.md` | API_SYNTAX, HARDCODED_GOVERNANCE, SCRIPT_EXECUTION | 3 | CRITICAL | Remove `GET /api/teams`, remove R6.1-R6.7 table, remove `uv run python` registry script |
| `skills/amcos-permission-management/SKILL.md` | API_SYNTAX, HARDCODED_GOVERNANCE, MISSING_SKILL_REF | 3 | CRITICAL/HIGH | Remove approval matrix table; replace endpoint paths with `team-governance` skill |
| `skills/amcos-team-coordination/SKILL.md` | API_SYNTAX | 1 | CRITICAL | Remove curl from Example 6; replace with `ai-maestro-agents-management` skill prose |
| `commands/amcos-transfer-agent.md` | API_SYNTAX | 1 | CRITICAL | Remove `POST /api/governance/transfers/` from Steps; replace with `team-governance` skill |
| `skills/amcos-agent-lifecycle/SKILL.md` | API_SYNTAX, LOCAL_REGISTRY, HARDCODED_GOVERNANCE | 4 (3 moderate, 1 minor) | HIGH | Remove REST API endpoint table; remove python script reference; remove resource limits table |
| `skills/amcos-notification-protocols/SKILL.md` | HARDCODED_AMP, API_SYNTAX | 2 | HIGH | Replace `amp-send.sh` references with `agent-messaging` skill; replace `GET /api/teams` with `team-governance` skill |
| `agents/amcos-team-coordinator.md` | API_SYNTAX | 1 | MEDIUM | Remove `GET /api/teams/{id}/agents` from Key Constraints; replace with `team-governance` skill |
| `commands/amcos-configure-plugins.md` | SCRIPT_EXECUTION | 1 | MEDIUM | Audit script; if governance calls exist, replace with skill references |
| `commands/amcos-performance-report.md` | SCRIPT_EXECUTION | 1 | LOW | Audit script; retain if read-only analytics only |
| `commands/amcos-resource-report.md` | SCRIPT_EXECUTION | 1 | LOW | Audit script; retain if read-only analytics only |
| `commands/amcos-reindex-skills.md` | SCRIPT_EXECUTION | 1 | LOW | Audit script; retain if local file ops only; add confirming comment |
| `commands/amcos-validate-skills.md` | SCRIPT_EXECUTION | 1 | LOW | Retain; add note clarifying local-only utility status |

**Total violations: 51 (37 critical, 11 moderate, 3 minor)**
*(Note: Raw audit counted 48; 3 additional minor instances were identified during specification writing from audit notes.)*

---

## Clean Files (No Changes Required)

The following files are **fully compliant** with the Plugin Abstraction Principle and require no changes:

### Commands (Compliant)
- `commands/amcos-spawn-agent.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-terminate-agent.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-hibernate-agent.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-wake-agent.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-health-check.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-staff-status.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-notify-agents.md` — correctly uses `agent-messaging` skill
- `commands/amcos-notify-manager.md` — correctly uses `agent-messaging` skill
- `commands/amcos-broadcast-notification.md` — correctly uses `agent-messaging` skill
- `commands/amcos-replace-agent.md` — correctly uses `ai-maestro-agents-management` and `agent-messaging` skills
- `commands/amcos-transfer-work.md` — correctly uses `ai-maestro-agents-management` and `agent-messaging` skills
- `commands/amcos-recovery-workflow.md` — correctly uses `ai-maestro-agents-management` skill
- `commands/amcos-check-approval-status.md` — correctly uses `agent-messaging` skill
- `commands/amcos-wait-for-approval.md` — correctly uses `agent-messaging` skill
- `commands/amcos-wait-for-agent-ok.md` — correctly uses `agent-messaging` skill
- `commands/amcos-install-skill-notify.md` — correctly uses `agent-messaging` and `ai-maestro-agents-management` skills

### Agent Personas (Compliant)
- `agents/amcos-lifecycle-manager.md` — correctly uses `ai-maestro-agents-management` skill
- `agents/amcos-staff-planner.md` — read-only analysis, no API calls
- `agents/amcos-recovery-coordinator.md` — `amp-send.sh` appears only in hooks context (acceptable)
- `agents/amcos-plugin-configurator.md` — uses GovernanceRequest format correctly
- `agents/amcos-resource-monitor.md` — references skills correctly
- `agents/amcos-skill-validator.md` — uses skill references correctly
- `agents/amcos-performance-reporter.md` — read-only analytics, no API calls

### Skills (Compliant or Not Audited — Assumed Clean)
- `skills/amcos-failure-recovery/SKILL.md` — verified clean; uses skill references properly throughout
- `skills/amcos-staff-planning/SKILL.md` — verified clean; read-only analysis skill
- `skills/amcos-onboarding/SKILL.md` — not fully audited; taxonomy-focused, API calls not expected
- `skills/amcos-label-taxonomy/SKILL.md` — not fully audited; taxonomy only, no API calls expected
- `skills/amcos-resource-monitoring/SKILL.md` — agent file references skills correctly; skill body not fully audited
- `skills/amcos-performance-tracking/SKILL.md` — agent file references skills correctly; skill body not fully audited
- `skills/amcos-plugin-management/SKILL.md` — not fully audited
- `skills/amcos-skill-management/SKILL.md` — not fully audited
- `skills/amcos-session-memory-library/SKILL.md` — not fully audited

**Recommendation:** The nine skills marked "not fully audited" should be reviewed in a follow-up audit pass to confirm they contain no embedded API syntax. Given that their corresponding agent files are compliant, violations are unlikely but not ruled out.

---

## Implementation Priority Order

### Phase 1 — Fix Immediately (CRITICAL violations in skill and agent bodies)

1. `skills/amcos-transfer-management/SKILL.md` — highest violation density (21 violations); fully rewrite procedures and examples
2. `agents/amcos-approval-coordinator.md` — 6 critical violations across constraints, workflow, and examples
3. `commands/amcos-request-approval.md` — 3 critical violations including hardcoded governance matrix
4. `agents/amcos-chief-of-staff-main-agent.md` — main persona must not embed governance rules or script execution
5. `skills/amcos-permission-management/SKILL.md` — hardcoded approval matrix and endpoint paths
6. `skills/amcos-team-coordination/SKILL.md` — single curl violation, quick to fix
7. `commands/amcos-transfer-agent.md` — single endpoint violation, quick to fix

### Phase 2 — Fix Soon (HIGH violations in secondary skill bodies)

8. `skills/amcos-agent-lifecycle/SKILL.md` — remove API reference table, script reference, resource limits
9. `skills/amcos-notification-protocols/SKILL.md` — replace amp-send.sh and endpoint references
10. `agents/amcos-team-coordinator.md` — single endpoint in key constraints table

### Phase 3 — Fix and Audit (MEDIUM/LOW — command script execution)

11. `commands/amcos-configure-plugins.md` — audit then decide
12. `commands/amcos-performance-report.md` — audit then decide
13. `commands/amcos-resource-report.md` — audit then decide
14. `commands/amcos-reindex-skills.md` — audit then decide
15. `commands/amcos-validate-skills.md` — clarify utility-only status

### Phase 4 — Precautionary Audit (skills marked "not fully audited")

16–24. Nine skills not fully audited in the initial pass (see Clean Files section above)

---

*Source audit: `/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-audit-AMCOS-raw.md`*
*Specification completed: 2026-02-27*
*Total files with violations: 15*
*Total violations: 51 (37 critical, 11 moderate, 3 minor)*
