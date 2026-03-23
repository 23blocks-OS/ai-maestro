# Plugin Governance Audit: ai-maestro-chief-of-staff
**Date:** 2026-03-10
**Repo:** https://github.com/Emasoft/ai-maestro-chief-of-staff
**Version audited:** 2.10.2
**Audit basis:** Plugin Abstraction Principle (docs/PLUGIN-ABSTRACTION-PRINCIPLE.md)

---

## Summary

The plugin is a well-structured, production-grade Chief of Staff agent for per-team governance. It correctly uses `amp-send.sh` and `aimaestro-agent.sh` for most operations. However, **Rule 1 (Skills Must Not Embed API Syntax) has widespread violations** across several SKILL.md files and their reference documents. Additionally, the hooks scripts make direct REST API calls in Python code (Rule 2 partial violation). Rule 3 (no hardcoded governance rules) and Rule 4 (dependencies declared) are largely compliant.

**Violation Severity Summary:**
- Rule 1: CRITICAL — 5 SKILL.md files contain embedded `curl` commands and raw API endpoint syntax
- Rule 2: MODERATE — 2 hook scripts make direct API calls in Python (not via global scripts)
- Rule 3: MINOR — One script hardcodes role constraints that should be discovered at runtime
- Rule 4: PASS — Dependencies declared in README.md and in SKILL.md Prerequisites sections

---

## Rule 1 Violations: Plugin Skills Embedding API Syntax

The rule states: "Plugin skills MUST NOT embed API syntax (no curl commands, no endpoint URLs, no header patterns)."

### CRITICAL: amcos-failure-detection/SKILL.md

**File:** `skills/amcos-failure-detection/SKILL.md`

**Lines 100-108** — The Examples section contains raw `curl` commands calling the AI Maestro REST API directly:

```
skills/amcos-failure-detection/SKILL.md:102:  curl -s "$AIMAESTRO_API/api/agents" | jq '.agents[] | select(.name=="libs-svg-svgbbox")'
skills/amcos-failure-detection/SKILL.md:105:  curl -X POST "$AIMAESTRO_API/api/messages" \
skills/amcos-failure-detection/SKILL.md:106:    -H "Content-Type: application/json" \
```

The second `curl` (line 105-107) also sends a message by calling `/api/messages` directly instead of using `amp-send.sh`.

**Required fix:** Replace both examples with the `ai-maestro-agents-management` skill (for agent status queries) and `amp-send.sh` (for sending messages). Remove the raw `curl` calls entirely.

---

### CRITICAL: amcos-recovery-execution/SKILL.md

**File:** `skills/amcos-recovery-execution/SKILL.md`

**Line 107** — Same pattern: raw `curl` to check agent status:

```
skills/amcos-recovery-execution/SKILL.md:107:  curl -s "$AIMAESTRO_API/api/agents" | jq '.agents[] | select(.name=="libs-svg-svgbbox") | .status'
```

**Required fix:** Replace with a reference to the `ai-maestro-agents-management` skill for status queries.

---

### CRITICAL: amcos-agent-replacement/SKILL.md

**File:** `skills/amcos-agent-replacement/SKILL.md`

**Lines 93-100** — The Examples section contains two raw `curl` calls to `/api/messages` for sending messages. This violates the rule twice: it embeds API syntax AND bypasses `amp-send.sh`:

```
skills/amcos-agent-replacement/SKILL.md:93:  curl -X POST "$AIMAESTRO_API/api/messages" \
skills/amcos-agent-replacement/SKILL.md:94:    -H "Content-Type: application/json" \
skills/amcos-agent-replacement/SKILL.md:98:  curl -X POST "$AIMAESTRO_API/api/messages" \
skills/amcos-agent-replacement/SKILL.md:99:    -H "Content-Type: application/json" \
```

**Required fix:** Replace both `curl` blocks with `amp-send.sh` invocations following the template in `skills/amcos-pre-op-notification/references/ai-maestro-message-templates.md`.

---

### CRITICAL: amcos-permission-management/SKILL.md

**File:** `skills/amcos-permission-management/SKILL.md`

**Lines 22, 43, 48, 82, 88** — The SKILL.md itself (not just a reference file) embeds raw API endpoint paths directly in procedural instructions:

```
skills/amcos-permission-management/SKILL.md:22:  1. GovernanceRequest API at `POST /api/v1/governance/requests`
skills/amcos-permission-management/SKILL.md:43:  3. `POST /api/v1/governance/requests` with payload
skills/amcos-permission-management/SKILL.md:48:  1. `GET /api/v1/governance/requests/{requestId}` to poll
skills/amcos-permission-management/SKILL.md:82:  | targetManager unknown | `GET /api/v1/teams/{teamId}/manager` |
skills/amcos-permission-management/SKILL.md:88:  **Input:** `POST /api/v1/governance/requests` with ...
```

This is in the main SKILL.md file — the authoritative skill document agents read. Embedding raw endpoint syntax here means any API change in AI Maestro will silently break the skill's instructions.

**Required fix:** The SKILL.md should reference the global `team-governance` skill by name for governance request procedures. The procedural instructions ("Submit GovernanceRequest") should describe the operation, not the raw HTTP verb and path. Detailed API syntax (if needed at all) belongs only in `references/` subdocuments.

---

### CRITICAL: amcos-transfer-management/SKILL.md

**File:** `skills/amcos-transfer-management/SKILL.md`

**Line 35** — Same issue: raw endpoint embedded in main SKILL.md procedural instructions:

```
skills/amcos-transfer-management/SKILL.md:35:  3. Submit a TransferRequest via `POST /api/v1/governance/requests` with `operation: "agent-transfer"`
```

**Required fix:** Replace with: "Submit a TransferRequest using the `team-governance` skill's transfer procedure."

---

### MAJOR: amcos-pre-op-notification/SKILL.md (Partial Violation)

**File:** `skills/amcos-pre-op-notification/SKILL.md`

**Lines 40, 51, 79** — The SKILL.md instructs agents to validate recipients by calling `GET /api/teams` directly:

```
skills/amcos-pre-op-notification/SKILL.md:40:  Before sending, validate recipient against `GET /api/teams`. Block and log violations.
skills/amcos-pre-op-notification/SKILL.md:51:  2. **Validate recipients** - Check team membership via `GET /api/teams`
skills/amcos-pre-op-notification/SKILL.md:79:  | Team violation | Validate against `GET /api/teams` before sending |
```

This is less severe because it uses an env-var-based URL pattern, but still embeds raw endpoint syntax in the SKILL.md.

**Required fix:** Replace with "Validate recipients using the `team-governance` skill" or "use `aimaestro-agent.sh` to list team members."

---

### MAJOR: amcos-agent-coordination/SKILL.md

**File:** `skills/amcos-agent-coordination/SKILL.md`

**Lines 23, 88** — Similar to above, raw API endpoint in the main SKILL.md:

```
skills/amcos-agent-coordination/SKILL.md:23:  - Registry via REST API (`GET /api/teams/{id}/agents`)
skills/amcos-agent-coordination/SKILL.md:88:  | Registry fails | Retry 3x, fallback `POST /api/teams/{id}/agents` |
```

**Required fix:** Replace with references to the `team-governance` skill or `aimaestro-agent.sh` commands.

---

### MAJOR: amcos-agent-termination/SKILL.md

**File:** `skills/amcos-agent-termination/SKILL.md`

**Line 79** — Raw API endpoint in error handling table:

```
skills/amcos-agent-termination/SKILL.md:79:  | Registry update fails | Retry 3x, then `DELETE /api/agents/{id}` |
```

**Required fix:** Replace with a reference to `aimaestro-agent.sh delete` or the `ai-maestro-agents-management` skill.

---

### MODERATE: Reference Files with Embedded Curl (Acceptable Location, Wrong Pattern)

The following reference files contain `curl` commands. While reference documents are lower severity than SKILL.md files, these still embed raw API syntax that a plugin should not own. They are in `references/` subdirectories, which is better practice than the SKILL.md itself, but still violate the principle for agent-facing documentation.

Key reference files with violations:

| File | Lines | Issue |
|------|-------|-------|
| `skills/amcos-transfer-management/references/transfer-procedures-and-examples.md` | 23, 36, 58, 68, 73, 90, 134, 146, 164, 178, 181, 185, 205 | Multiple `curl` blocks calling governance transfer API directly |
| `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` | 47, 56, 87, 105, 130, 140, 154, 157, 164 | Direct `curl` calls to `/api/agents` and `/api/teams` |
| `skills/amcos-label-taxonomy/references/label-commands-and-examples.md` | 54, 65, 82, 106 | Direct `curl` to `/api/agents` |
| `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` | 77, 101 | Direct `curl` to `/api/agents` |
| `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` | 61, 98 | Direct `curl` to `/api/agents` |
| `skills/amcos-permission-management/references/approval-workflow-engine.md` | 66, 428, 456, 546, 565 | Direct `curl` to governance API |
| `skills/amcos-permission-management/references/op-track-pending-approvals.md` | 51, 64, 82, 95, 107, 119, 123, 141, 156, 163, 175, 183 | Multiple direct `curl` to `/api/v1/governance/requests` |
| `skills/amcos-permission-management/references/op-request-approval.md` | 100 | Direct `curl` to governance API |
| `skills/amcos-agent-spawning/references/op-update-team-registry.md` | 41, 120 | Direct `curl` to `/api/teams` |
| `skills/amcos-agent-hibernation/references/op-update-team-registry.md` | 41, 120 | Direct `curl` to `/api/teams` |
| `skills/amcos-agent-termination/references/op-update-team-registry.md` | 41, 120 | Direct `curl` to `/api/teams` |
| `skills/amcos-agent-coordination/references/op-update-team-registry.md` | 41, 120 | Direct `curl` to `/api/teams` |
| `skills/amcos-agent-termination/references/success-criteria.md` | 47, 73, 132, 158, 159, 223-226 | Multiple `curl` to `/api/agents` and `/api/teams` |
| `skills/amcos-agent-coordination/references/workflow-checklists.md` | 152, 175, 177 | Direct `curl` to `/api/teams` |

---

## Rule 2 Violations: Hooks/Scripts Making Direct API Calls

The rule states: "Plugin hooks/scripts MUST NOT call the API directly. They should call global scripts: `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, etc."

### MODERATE: amcos_heartbeat_check.py (Hook Script)

**File:** `scripts/amcos_heartbeat_check.py`

**Lines 268-276** — The UserPromptSubmit hook script calls the AI Maestro REST API directly via `urllib.request`:

```python
api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
url = f"{api_base}/api/agents?status=active"
req = urllib.request.Request(url, headers={"Accept": "application/json"})
with urllib.request.urlopen(req, timeout=3) as resp:
    api_agents = json.loads(resp.read().decode())
```

This hook runs on every UserPromptSubmit event and calls `/api/agents` directly rather than delegating to `aimaestro-agent.sh list`.

**Required fix:** Replace the direct urllib call with: `subprocess.run(["aimaestro-agent.sh", "list", "--status", "active", "--json"], ...)` and parse the output.

---

### MODERATE: amcos_notify_agent.py (Script)

**File:** `scripts/amcos_notify_agent.py`

**Lines 35-40** — The notification script resolves an agent's tmux session name by directly calling `/api/agents`:

```python
api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
url = f"{api_base}/api/agents?name={agent_name}"
result = subprocess.run(["curl", "-sf", url], ...)
```

**Required fix:** Replace with `aimaestro-agent.sh show <agent_name>` to get agent details without a raw API call.

---

### MODERATE: amcos_team_registry.py (Script)

**File:** `scripts/amcos_team_registry.py`

**Lines 30, 146, 190, 202, 213, 224, 424** — This script is a full REST API client that directly calls all team endpoints (`/api/teams`, `/api/teams/{id}/agents`, etc.) via `urllib.request`. This is the most extensive violation of Rule 2 — the entire script bypasses the global scripts abstraction layer.

The script is called from `amcos-agent-spawning/SKILL.md` line 52 via:
```
uv run python scripts/amcos_team_registry.py add-agent
```

**Required fix:** The team registry operations should be delegated to `aimaestro-agent.sh` subcommands (if they exist) or the team registry management script should be moved into the AI Maestro core and called via the global CLI. If `aimaestro-agent.sh` does not yet support team roster operations, this is a gap in the global scripts that should be filed as an AI Maestro issue. Until resolved, the team registry script is an acceptable interim solution, but it should be clearly marked as `TODO: migrate to aimaestro-agent.sh team subcommands`.

**Note:** The script already has a comment stub: `# TODO: Migrate to AI Maestro REST API` in `amcos_hibernate_agent.py`, `amcos_spawn_agent.py`, `amcos_wake_agent.py`, and `amcos_terminate_agent.py` — suggesting awareness of this issue but not yet addressed in `amcos_team_registry.py`.

---

### MODERATE: amcos_generate_team_report.py (Script)

**File:** `scripts/amcos_generate_team_report.py`

**Lines 38, 62-73** — Directly fetches `GET /api/teams` via `urllib.request` to generate reports:

```python
DEFAULT_API_BASE = "http://localhost:23000"
url = f"{api_base}/api/teams"
```

**Required fix:** Delegate to `aimaestro-agent.sh` or capture output of a team-listing global script.

---

### MINOR: amcos_approval_manager.py (Script)

**File:** `scripts/amcos_approval_manager.py`

**Lines 47-81** — Implements a full REST API client for the governance requests endpoint:

```python
DEFAULT_API_BASE = "http://localhost:23000"
GOVERNANCE_API_PATH = "/api/v1/governance/requests"
```

This is the primary approval management script and it calls governance APIs directly. Given that the `team-governance` global skill handles governance request syntax, the corresponding CLI global script (`aimaestro-agent.sh governance` or similar) should handle this. If no such global script exists, this is a gap in AI Maestro's global scripts layer.

**Status:** Acceptable interim, but must be migrated when AI Maestro provides a governance CLI command.

---

## Rule 3 Assessment: Hardcoded Governance Rules

### MINOR: amcos_team_registry.py — Hardcoded Role Constraints

**File:** `scripts/amcos_team_registry.py`

**Lines 52-57** — The script defines a hardcoded `ROLE_CONSTRAINTS` dictionary with min/max counts and plugin names for each role type:

```python
ROLE_CONSTRAINTS: dict[str, RoleConstraint] = {
    "orchestrator": RoleConstraint(1, 1, "ai-maestro-orchestrator-agent", "member"),
    "architect": RoleConstraint(1, 1, "ai-maestro-architect-agent", "member"),
    "integrator": RoleConstraint(0, 10, "ai-maestro-integrator-agent", "member"),
    "programmer": RoleConstraint(1, 20, "ai-maestro-programmer-agent", "member"),
}
```

These capacity limits (min/max per role) are governance rules. If AI Maestro changes its team composition rules, this script will silently enforce the old rules.

**Required fix:** These constraints should be fetched from the `team-governance` skill or from an AI Maestro configuration endpoint at runtime, not hardcoded. Alternatively, document clearly that these are local defaults and governance rules from AI Maestro always take precedence.

---

### PASS: No Hardcoded Role Name Conditionals in Skill Files

The skill files do not contain `if role == "manager"` style conditionals. Role boundaries are described as behavioral rules in prose (e.g., "AMCOS cannot do X — that is EOA's responsibility"), which is the correct approach.

### PASS: No messaging-helper.sh References Found

A search across all files found no references to `messaging-helper.sh`. This is correct.

---

## Rule 4 Assessment: Dependencies Declared

### PASS: README.md Declares Dependencies

From `README.md` line 213-215:
```
- AI Maestro v0.26.0+
- Claude Code v2.1.69+
- External skills: `ai-maestro-agents-management` and `agent-messaging` (provided by AI Maestro core)
```

### PASS: plugin.json Has Description

`plugin.json` has a description field: "Per-team agent management - staff planning, lifecycle, governance workflows, failure recovery. Requires AI Maestro v0.26.0+."

### MINOR: plugin.json Missing Required Skills Field

`plugin.json` does not have a `requiredSkills` or `dependencies` field listing the global AI Maestro skills that must be installed. The README documents this in prose but the machine-readable manifest does not:

```json
{
  "name": "ai-maestro-chief-of-staff",
  "version": "2.10.2",
  "description": "...",
  "author": { ... },
  "repository": "...",
  "license": "MIT"
  // Missing: "requiredSkills": ["ai-maestro-agents-management", "agent-messaging", "team-governance"]
}
```

**Required fix:** Add a `requiredSkills` array to `plugin.json` listing at minimum: `["ai-maestro-agents-management", "agent-messaging", "team-governance"]`.

---

## Additional Issues Found

### Issue A: One Hardcoded `http://localhost:23000` in a Skill Reference

**File:** `skills/amcos-team-coordination/references/coordination-overview-and-examples.md`

**Line 117** — A code example uses a hardcoded localhost URL without the `$AIMAESTRO_API` variable:

```bash
curl -s "http://localhost:23000/api/sessions" | jq '.sessions[] | select(.project == "auth-service")'
```

This would fail on non-default port configurations. **Required fix:** Replace `http://localhost:23000` with `$AIMAESTRO_API` and replace the `curl` with the `ai-maestro-agents-management` skill.

**File:** `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md`

**Line 154** — Also uses explicit `http://localhost:23000` as default:
```bash
AIMAESTRO_API="${AIMAESTRO_API:-http://localhost:23000}"
```
This pattern (using the env var with fallback) is acceptable but the script still makes direct API calls.

---

### Issue B: Hooks Invoke Python Scripts Directly (Not via Global Scripts)

The `hooks/hooks.json` invokes all hooks via `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/amcos_*.py`. This is consistent with plugin pattern but means the hooks bypass any abstraction. The hook scripts themselves then make direct API calls (see Rule 2 violations). This layering issue compounds the Rule 2 problem.

---

### Issue C: amcos-permission-management Skill Is a Self-Contained API Reference

The `amcos-permission-management/SKILL.md` and its `references/` directory collectively implement a complete governance request protocol with raw API syntax. While this was appropriate when the skill was first written, the introduction of the global `team-governance` skill in AI Maestro means this skill should now **reference** `team-governance` and **not duplicate** the governance API syntax. The skill is currently in conflict with the Plugin Abstraction Principle as a whole for the governance domain.

**Recommendation:** The main `amcos-permission-management/SKILL.md` should be simplified to: "Use the `team-governance` global skill to submit and track GovernanceRequests. The procedures below describe AMCOS-specific approval workflow behavior that is not covered by the global skill."

---

## Alignment Instructions (Step-by-Step)

### Step 1: Fix Critical SKILL.md Violations (Priority: CRITICAL)

For each of the 5 SKILL.md files identified above:

**1a. `skills/amcos-failure-detection/SKILL.md` lines 100-108:**
- Remove the `## Examples` section's `curl` block for agent status.
- Replace with: "Use the `ai-maestro-agents-management` skill to query agent status."
- Remove the `curl -X POST "$AIMAESTRO_API/api/messages"` block.
- Replace with: "Use `amp-send.sh` to send the health check ping (see `amcos-pre-op-notification` skill for message format)."

**1b. `skills/amcos-recovery-execution/SKILL.md` line 107:**
- Remove the `curl` example.
- Replace with: "Use the `ai-maestro-agents-management` skill to verify agent status."

**1c. `skills/amcos-agent-replacement/SKILL.md` lines 93-100:**
- Remove both `curl -X POST "$AIMAESTRO_API/api/messages"` blocks.
- Replace with `amp-send.sh` invocations:
  ```bash
  # Request replacement approval
  amp-send.sh eama-assistant-manager "URGENT: Replace libs-svg-svgbbox" \
    --priority urgent \
    --type replacement-request \
    "Terminal failure (3 crashes). Requesting replacement approval."

  # Notify orchestrator of replacement
  amp-send.sh eoa-orchestrator "Agent replaced: libs-svg-svgbbox" \
    --priority high \
    --type replacement-notification \
    "Please generate handoff docs and update kanban."
  ```

**1d. `skills/amcos-permission-management/SKILL.md` lines 22, 43, 48, 82, 88:**
- Remove procedural steps that list raw HTTP methods and endpoint paths.
- Replace each procedure with: "Use the `team-governance` global skill to submit a GovernanceRequest."
- Keep only AMCOS-specific timing rules (60s/90s/120s escalation timeline).
- Move all raw API examples to a `references/governance-api-reference.md` file marked "For diagnostic use only."

**1e. `skills/amcos-transfer-management/SKILL.md` line 35:**
- Change: "Submit a TransferRequest via `POST /api/v1/governance/requests` with `operation: "agent-transfer"`"
- To: "Submit a TransferRequest using the `team-governance` skill's transfer procedure."

### Step 2: Fix Rule 2 Hook Script Violations (Priority: MODERATE)

**2a. `scripts/amcos_heartbeat_check.py` lines 268-292:**
- Replace the `urllib.request` block with:
  ```python
  result = subprocess.run(
      ["aimaestro-agent.sh", "list", "--json"],
      capture_output=True, text=True, timeout=3
  )
  if result.returncode == 0:
      api_agents = json.loads(result.stdout)
  ```

**2b. `scripts/amcos_notify_agent.py` lines 35-40:**
- Replace `curl` call to `/api/agents` with:
  ```python
  result = subprocess.run(
      ["aimaestro-agent.sh", "show", agent_name, "--json"],
      capture_output=True, text=True, timeout=5
  )
  ```

**2c. `scripts/amcos_team_registry.py`:**
- Add a header comment: `# TODO: Migrate to aimaestro-agent.sh team subcommands when available`
- Document each function with which `aimaestro-agent.sh` subcommand should replace it once AI Maestro provides team roster CLI support.
- File a GitHub issue against AI Maestro requesting `aimaestro-agent.sh team create|add|remove|list` subcommands.

### Step 3: Fix Hardcoded Governance Rules (Priority: MINOR)

**3a. `scripts/amcos_team_registry.py` lines 52-57:**
- Add a comment above `ROLE_CONSTRAINTS`:
  ```python
  # These are local defaults. AI Maestro governance rules take precedence.
  # TODO: Fetch role constraints from team-governance skill at runtime
  # when AI Maestro exposes a constraints endpoint.
  ```
- Or better: attempt to fetch constraints from the API first, fall back to these defaults.

### Step 4: Fix plugin.json (Priority: MINOR)

**4a. `.claude-plugin/plugin.json`:**
Add the `requiredSkills` field:
```json
{
  "name": "ai-maestro-chief-of-staff",
  "version": "2.10.2",
  "description": "Per-team agent management...",
  "author": { ... },
  "repository": "...",
  "license": "MIT",
  "requiredSkills": [
    "ai-maestro-agents-management",
    "agent-messaging",
    "team-governance"
  ],
  "minimumVersion": "0.26.0"
}
```

### Step 5: Fix Hardcoded localhost in Reference Files (Priority: MINOR)

**5a. `skills/amcos-team-coordination/references/coordination-overview-and-examples.md` line 117:**
- Replace `http://localhost:23000` with `$AIMAESTRO_API`.
- Change the `curl` example to use `amp-inbox.sh` or the `ai-maestro-agents-management` skill.

### Step 6: Simplify Reference Files (Priority: LOW, Nice-to-Have)

The reference files under `skills/amcos-permission-management/references/`, `skills/amcos-transfer-management/references/`, and `skills/amcos-label-taxonomy/references/` contain extensive raw API documentation. These should be reviewed and where possible, replaced with references to the `team-governance` skill or annotated as "Diagnostic/Reference only — use team-governance skill for operations." This is a large effort and can be done incrementally.

---

## Files Requiring Changes (Summary)

| File | Rule | Severity | Action |
|------|------|----------|--------|
| `skills/amcos-failure-detection/SKILL.md` | Rule 1 | CRITICAL | Remove curl examples, use skill/amp-send.sh |
| `skills/amcos-recovery-execution/SKILL.md` | Rule 1 | CRITICAL | Remove curl example, use skill |
| `skills/amcos-agent-replacement/SKILL.md` | Rule 1 | CRITICAL | Replace curl with amp-send.sh |
| `skills/amcos-permission-management/SKILL.md` | Rule 1 | CRITICAL | Remove raw endpoints, reference team-governance skill |
| `skills/amcos-transfer-management/SKILL.md` | Rule 1 | CRITICAL | Remove raw endpoint, reference team-governance skill |
| `skills/amcos-pre-op-notification/SKILL.md` | Rule 1 | MAJOR | Remove GET /api/teams references |
| `skills/amcos-agent-coordination/SKILL.md` | Rule 1 | MAJOR | Remove raw endpoint references |
| `skills/amcos-agent-termination/SKILL.md` | Rule 1 | MAJOR | Remove DELETE /api/agents/{id} reference |
| `skills/amcos-team-coordination/references/coordination-overview-and-examples.md` | Rule 1 | MAJOR | Replace hardcoded localhost:23000 URL |
| `skills/amcos-transfer-management/references/transfer-procedures-and-examples.md` | Rule 1 | MODERATE | Replace curl with amp-send.sh + skill refs |
| `skills/amcos-label-taxonomy/references/*.md` (4 files) | Rule 1 | MODERATE | Replace curl with aimaestro-agent.sh calls |
| `skills/amcos-permission-management/references/*.md` (3 files) | Rule 1 | MODERATE | Annotate as diagnostic-only or migrate |
| `skills/amcos-agent-*/references/op-update-team-registry.md` (4 files) | Rule 1 | MODERATE | Replace curl checks with aimaestro-agent.sh |
| `skills/amcos-agent-termination/references/success-criteria.md` | Rule 1 | MODERATE | Replace curl with aimaestro-agent.sh |
| `skills/amcos-agent-coordination/references/workflow-checklists.md` | Rule 1 | MODERATE | Replace curl with aimaestro-agent.sh |
| `scripts/amcos_heartbeat_check.py` | Rule 2 | MODERATE | Use aimaestro-agent.sh list instead of urllib |
| `scripts/amcos_notify_agent.py` | Rule 2 | MODERATE | Use aimaestro-agent.sh show instead of curl |
| `scripts/amcos_team_registry.py` | Rule 2 | MODERATE | Mark TODO, file AI Maestro issue for team CLI |
| `scripts/amcos_generate_team_report.py` | Rule 2 | MODERATE | Use aimaestro-agent.sh or global script |
| `scripts/amcos_approval_manager.py` | Rule 2 | MODERATE | Mark TODO, migrate to team-governance CLI |
| `scripts/amcos_team_registry.py` (ROLE_CONSTRAINTS) | Rule 3 | MINOR | Add comment, plan runtime discovery |
| `.claude-plugin/plugin.json` | Rule 4 | MINOR | Add requiredSkills field |

---

## What Is Already Correct (Do Not Change)

- **Messaging via `amp-send.sh`**: The agent files (`agents/*.md`), most SKILL.md files, and hooks correctly reference `amp-send.sh` for all inter-agent messaging. This is correct and must be preserved.
- **Agent lifecycle via `aimaestro-agent.sh`**: Scripts `amcos_hibernate_agent.py`, `amcos_wake_agent.py`, `amcos_terminate_agent.py`, `amcos_spawn_agent.py`, `amcos_failure_recovery.py`, `amcos_notification_protocol.py` all correctly use `aimaestro-agent.sh`. This is correct and must be preserved.
- **No `messaging-helper.sh` references**: This non-existent file is not referenced anywhere. Correct.
- **README dependencies**: Correctly lists required global skills.
- **Role boundary prose**: SKILL.md files describe role boundaries in prose (not conditionals), which is the correct approach for governance rule discovery.
- **Hooks structure**: `hooks/hooks.json` correctly uses `${CLAUDE_PLUGIN_ROOT}` for script paths.
- **AMP protocol compliance in messaging skills**: `amcos-pre-op-notification/SKILL.md` explicitly states "Never call HTTP API directly" and `amcos-pre-op-notification/references/ai-maestro-message-templates.md` line 20 states "All messages use the AMP protocol via `amp-send.sh`. Never call the HTTP API directly." These are model examples of correct behavior.
