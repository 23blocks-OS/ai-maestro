# Deep Audit: AMCOS Agent Lifecycle Plugin Reference Files
**Date:** 2026-02-27
**Auditor:** Claude Code (automated)
**Scope:** Plugin Abstraction Principle compliance for all 16 files in `skills/amcos-agent-lifecycle/references/`
**Governance Reference:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` + `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

---

## Executive Summary

The AMCOS agent-lifecycle reference files show **strong compliance** with Plugin Abstraction Principle in the primary agent interaction layer — they correctly use `ai-maestro-agents-management` and `agent-messaging` skill references instead of embedding CLI syntax. However, there are **two clear categories of violations** and one significant category that needs **harmonization rather than removal** (the local record-keeping system).

**Overall Verdict:**
- **COMPLIANT areas:** Agent lifecycle operations (create/hibernate/wake/terminate) correctly delegate to global skills. Messaging operations correctly use `agent-messaging` skill references. The refactoring to skill references appears substantially complete.
- **VIOLATION areas:** Local registry scripts (`amcos_team_registry.py`) are embedded directly in procedures with hardcoded syntax; isolated curl commands appear in verification steps; a few fallback curl references exist in error handling sections.
- **PRESERVE area:** The local record-keeping system (lifecycle log, approval log, team assignments log, agent-registry.json) is a DISTINCT layer from the AI Maestro GovernanceRequest API — it tracks AMCOS-internal state that does NOT exist in AI Maestro. This must be preserved but harmonized.

---

## Governance Reference Summary

### Plugin Abstraction Principle (from `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`)

Three mandatory rules for external plugins:

1. **Rule 1 — No embedded API syntax in plugin skills**: Plugin skills must reference global AI Maestro skills by name, not embed `curl` commands or endpoint URLs.
2. **Rule 2 — No direct API calls in plugin hooks/scripts**: Plugin hooks must call globally-installed scripts (`aimaestro-agent.sh`, `amp-send.sh`, etc.), never `curl`.
3. **Rule 3 — Governance rules discovered at runtime**: Do not hardcode permission matrices, role restrictions, or approval requirements.

### What the `team-governance` SKILL.md shows as canonical

The `team-governance` skill IS the canonical reference. It embeds full `curl` syntax with `localhost:23000` URLs because it IS the AI Maestro-provided skill (Rule 4 exception: "AI Maestro's Own Plugin Is the Exception"). External plugins must REFERENCE this skill, not duplicate it.

---

## Per-File Violation Inventory

### FILE 1: `cli-examples.md`

**Status: COMPLIANT** — No violations.

All lifecycle examples correctly instruct the agent to "use the `ai-maestro-agents-management` skill." No curl commands, no hardcoded endpoints, no embedded CLI syntax. The file appropriately defers all operations to the global skill.

**Notable good patterns:**
- Line 21: "Use the `ai-maestro-agents-management` skill to create a new agent"
- Line 51: "Use the `ai-maestro-agents-management` skill to terminate agent"
- All 8 operations in the Quick Reference table delegate to the skill.

---

### FILE 2: `cli-reference.md`

**Status: COMPLIANT** — No violations.

The entire file uses skill-delegation language consistently. All 12 operation sections (create, terminate, hibernate, wake, restart, update, list, show, state management, error handling, workflows) reference the `ai-maestro-agents-management` skill exclusively.

**One minor observation (not a violation):**
- Line 332: `tmux list-sessions | grep <agent-name>` — This is a valid raw tmux diagnostic command, not an AI Maestro API call. Acceptable per the principle (not an API bypass).
- Line 334: `tmux capture-pane -t <agent-name> -p | tail -50` — Same category, acceptable.

---

### FILE 3: `hibernation-procedures.md`

**Status: MINOR VIOLATIONS — 2 found**

#### Violation H1 — HARDCODED_AMP (Severity: Low)
**File:** `hibernation-procedures.md`
**Lines:** 278–298 (Example 1: Hibernating an Idle Agent), 306–326 (Example 2: Waking)
**Type:** HARDCODED_AMP

The examples in sections 3.6 use **Python pseudocode** with fabricated function names (`send_message()`, `update_registry()`, `get_agent_status()`, `spawn_agent_with_state()`, `await_agent_ready()`). These are not real API calls or real skill syntax — they are architectural pseudocode that do not map to any actual AI Maestro or AMP capability.

```python
# Lines 283-295 (approximate) — PSEUDOCODE that should be replaced with skill reference:
send_message(
    to=agent_id,
    subject="Hibernation Request",
    content={
        "type": "hibernate-request",
        ...
    }
)
```

**What it should do instead:** Reference the `agent-messaging` skill or replace with a note such as: "Use the `ai-maestro-agents-management` skill to hibernate the agent (see op-hibernate-agent.md for detailed procedure)."

#### Violation H2 — LOCAL_REGISTRY (Severity: Medium)
**File:** `hibernation-procedures.md`
**Lines:** 92–124 (Section 3.3.3 State persistence), 148–150 (Registry entry JSON)
**Type:** LOCAL_REGISTRY

The file describes a local file-based storage path (`design/memory/agents/<agent-id>/hibernate/`) and a specific JSON registry entry format with `wake_triggers` field. This format is inconsistent with the AI Maestro registry format documented in `record-keeping.md` (which uses `~/.ai-maestro/agent-states/`). The storage paths are hardcoded and contradictory across files:

- `hibernation-procedures.md` uses: `design/memory/agents/code-impl-01/hibernate/`
- `op-hibernate-agent.md` uses: `~/.ai-maestro/agent-states/<session-name>-hibernation.json`
- `success-criteria.md` uses: `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
- `record-keeping.md` uses: `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/<agent_name>-<timestamp>.json`

**What it should do instead:** Standardize to ONE canonical path. This file appears to be an older reference that predates the path standardization in the op-* files.

---

### FILE 4: `op-hibernate-agent.md`

**Status: VIOLATIONS FOUND — 3 found**

#### Violation OH1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: HIGH)
**File:** `op-hibernate-agent.md`
**Lines:** 91–95 (Step 5: Update Team Registry), 100–105 (Step 6: Log Hibernation Event), 143–154 (Example section)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

The file embeds direct calls to `amcos_team_registry.py` as a **primary procedure step**, not as a fallback or internal script reference:

```bash
# Lines 91-95 — PRIMARY PROCEDURE STEP embedding local script CLI syntax:
uv run python scripts/amcos_team_registry.py update-status \
  --name "<agent-session-name>" \
  --status "hibernated" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

```bash
# Lines 100-105 — PRIMARY PROCEDURE STEP:
uv run python scripts/amcos_team_registry.py log \
  --event "hibernation" \
  --agent "<agent-session-name>" \
  --reason "<hibernation reason>" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

**Why this is a violation:** `amcos_team_registry.py` is a local plugin script. Its CLI interface is not a global abstraction — if its syntax changes, all reference files that embed it will break. Per Rule 2 of the Plugin Abstraction Principle, this should either:
- Be wrapped in an `amcos-team-registry` global script abstraction, OR
- Be delegated via a skill reference that teaches agents to call it, OR
- Be referenced as an internal AMCOS operation without embedding the raw command syntax in what agents will read

**Note on severity:** This is HIGH because Steps 5 and 6 are core procedure steps — agents executing this procedure will call this script verbatim. Any change to `amcos_team_registry.py`'s CLI interface will silently break the procedure.

#### Violation OH2 — HARDCODED_API (Severity: LOW)
**File:** `op-hibernate-agent.md`
**Line:** 165 (Error Handling table)
**Type:** HARDCODED_API

```
# Line 165 — IN ERROR HANDLING TABLE:
Retry, or use `curl -s "$AIMAESTRO_API/api/teams"` to verify state
```

**Context:** This is in an error-handling table row for "Registry update fails". The curl command appears as a fallback diagnostic hint.

**What it should do instead:** "Check team registry via the `team-governance` skill (List All Teams operation)" or simply remove the raw curl hint.

#### Violation OH3 — LOCAL_REGISTRY (Severity: MEDIUM) — Storage path inconsistency
**File:** `op-hibernate-agent.md`
**Lines:** 44 (Prerequisites), 62 (Verify step), 79 (Step 3 content)
**Type:** LOCAL_REGISTRY

The file references `~/.ai-maestro/agent-states/` as the state storage location in three places, but this is inconsistent with `success-criteria.md` (which uses `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/`). The storage path is not a plugin-level concern and should be encapsulated by the skill or script, not embedded in reference procedures.

---

### FILE 5: `op-send-maestro-message.md`

**Status: MINOR VIOLATION — 1 found**

#### Violation SM1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: MEDIUM)
**File:** `op-send-maestro-message.md`
**Lines:** 144 (Example: Team Broadcast Message, Step 1)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

```bash
# Line 144 — IN TEAM BROADCAST EXAMPLE:
AGENTS=$(uv run python scripts/amcos_team_registry.py list --filter-status running --names-only)
```

**What it should do instead:** This step should use the `ai-maestro-agents-management` skill to list online agents (which is already described correctly in `cli-examples.md` section 1.4). The broadcast example embeds a raw script call when the agent should be instructed to use the appropriate skill.

**Suggested fix:** Replace with: "Use the `ai-maestro-agents-management` skill to list all online agents, then for each agent..."

---

### FILE 6: `op-spawn-agent.md`

**Status: VIOLATIONS FOUND — 2 found**

#### Violation OS1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: HIGH)
**File:** `op-spawn-agent.md`
**Lines:** 96–102 (Step 5: Register in Team Registry), 140–147 (Example: Orchestrator), 160–166 (Example: Programmer)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

The file embeds `amcos_team_registry.py` calls as primary procedure Steps — identical issue as `op-hibernate-agent.md` OH1:

```bash
# Lines 96-102 — PRIMARY PROCEDURE STEP:
uv run python scripts/amcos_team_registry.py add-agent \
  --name "<session-name>" \
  --role "<role>" \
  --project "<project>" \
  --status "running"
```

The examples (lines 140-147 and 160-166) repeat the same pattern. This is a high-severity violation because the raw script syntax is embedded in the primary "How to Spawn" procedure.

#### Violation OS2 — HARDCODED_API (Severity: LOW)
**File:** `op-spawn-agent.md`
**Line:** 44 (Prerequisites)
**Type:** HARDCODED_API

```
# Line 44 — IN PREREQUISITES:
Team registry API is accessible (`$AIMAESTRO_API/api/teams`)
```

**What it should do instead:** This is a prerequisite check, so it uses the environment variable `$AIMAESTRO_API` correctly (not hardcoded `localhost:23000`). The severity is LOW because `$AIMAESTRO_API` is the correct pattern to avoid hardcoding. However, the raw curl API path check should still be replaced with a skill-based check.

---

### FILE 7: `op-terminate-agent.md`

**Status: VIOLATIONS FOUND — 2 found**

#### Violation OT1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: HIGH)
**File:** `op-terminate-agent.md`
**Lines:** 93–96 (Step 5: Update Team Registry), 104–109 (Step 7: Log Termination), 148–157 (Example section)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

Same pattern as `op-hibernate-agent.md` OH1:

```bash
# Lines 93-96 — PRIMARY PROCEDURE STEP:
uv run python scripts/amcos_team_registry.py remove-agent \
  --name "<agent-session-name>"
```

```bash
# Lines 104-109 — PRIMARY PROCEDURE STEP:
uv run python scripts/amcos_team_registry.py log \
  --event "termination" \
  --agent "<agent-session-name>" \
  --reason "<termination reason>" \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

#### Violation OT2 — no additional API violations
The error handling table (line 163) references: `tmux kill-session -t <name>` — this is an acceptable raw tmux command for a "session stuck" error recovery scenario. Not a violation.

---

### FILE 8: `op-update-team-registry.md`

**Status: VIOLATIONS FOUND — 3 found (HIGHEST violation density)**

#### Violation UR1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: CRITICAL)
**File:** `op-update-team-registry.md`
**Lines:** 62–91 (Step 2: Execute Registry Update — ALL four command blocks), 97–101 (Step 3 Verify), 108–113 (Step 4 Publish), 141–189 (Both examples)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

This file is entirely about `amcos_team_registry.py` operations and embeds the script's full CLI interface throughout:

```bash
# Lines 62-68 — PRIMARY PROCEDURE (add-agent):
uv run python scripts/amcos_team_registry.py add-agent \
  --name "<agent-session-name>" --role "<role>" --project "<project>" --status "running"

# Lines 70-73 — PRIMARY PROCEDURE (remove-agent):
uv run python scripts/amcos_team_registry.py remove-agent \
  --name "<agent-session-name>"

# Lines 75-81 — PRIMARY PROCEDURE (update-status):
uv run python scripts/amcos_team_registry.py update-status \
  --name ... --status ... --timestamp ...

# Lines 83-91 — PRIMARY PROCEDURE (log):
uv run python scripts/amcos_team_registry.py log \
  --event ... --agent ... --reason ... --timestamp ...

# Lines 97-101 — VERIFY:
uv run python scripts/amcos_team_registry.py list
uv run python scripts/amcos_team_registry.py list --filter-name "..."

# Lines 108-113 — PUBLISH:
uv run python scripts/amcos_team_registry.py publish \
  --broadcast-to "all" --message "..."
```

**Severity is CRITICAL** because this is the canonical reference file for team registry updates — every other op-* file references it for registry update steps. If `amcos_team_registry.py` CLI syntax changes, this file is the blast radius center.

#### Violation UR2 — HARDCODED_API (Severity: LOW)
**File:** `op-update-team-registry.md`
**Lines:** 43, 122 (Step 5 Verify Registry State)
**Type:** HARDCODED_API

```bash
# Line 43 — PREREQUISITES:
Team exists in AI Maestro (verify with `curl -s "$AIMAESTRO_API/api/teams"`)

# Lines 122-123 — STEP 5 VERIFY:
# Uses AI Maestro REST API (not file-based)
curl -s "$AIMAESTRO_API/api/teams" | jq '.[] | {name: .name, members: (.members | length)}'
```

**Note:** These use `$AIMAESTRO_API` environment variable, not hardcoded `localhost:23000` — so they follow the environment variable pattern. The violation is that raw curl calls appear in what agents will read as procedures. They should reference the `team-governance` skill's "List All Teams" operation instead.

#### Violation UR3 — HARDCODED_AMP / message format embedding (Severity: LOW)
**File:** `op-update-team-registry.md`
**Lines:** 163–165 (Step 4 Publish example)
**Type:** HARDCODED_AMP — amcos_team_registry.py publish embeds broadcast message delivery

```bash
# Lines 163-165:
uv run python scripts/amcos_team_registry.py publish \
  --broadcast-to "all" \
  --message "New team member: $SESSION_NAME (developer on backend-api)"
```

The `publish` subcommand of `amcos_team_registry.py` internally sends AMP messages. This is an indirect violation — the AMP message format is embedded within the script's internal implementation and called from reference procedures. The AMP messaging should go through the `agent-messaging` skill, not through a registry script's side-effect.

---

### FILE 9: `op-wake-agent.md`

**Status: VIOLATIONS FOUND — 3 found**

#### Violation OW1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: HIGH)
**File:** `op-wake-agent.md`
**Lines:** 55–58 (Step 1 Verify), 67–74 (Step 2 Check Capacity), 109–113 (Step 6 Update Registry), 116–122 (Step 7 Log), 164–177 (Example section)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

```bash
# Lines 55-58 — STEP 1 (verify hibernated):
uv run python scripts/amcos_team_registry.py list \
  --filter-name "<agent-session-name>" \
  --show-status

# Lines 67-74 — STEP 2 (capacity check):
RUNNING_COUNT=$(uv run python scripts/amcos_team_registry.py list --filter-status running --count)
MAX_AGENTS=5

if [ "$RUNNING_COUNT" -ge "$MAX_AGENTS" ]; then
  echo "WARNING: At max capacity..."
fi

# Lines 109-113 — STEP 6 (registry update):
uv run python scripts/amcos_team_registry.py update-status \
  --name "<agent-session-name>" --status "running" --timestamp ...

# Lines 116-122 — STEP 7 (log event):
uv run python scripts/amcos_team_registry.py log \
  --event "wake" --agent "<agent-session-name>" --reason ...
```

#### Violation OW2 — HARDCODED_GOVERNANCE (Severity: MEDIUM)
**File:** `op-wake-agent.md`
**Lines:** 67–73 (Step 2 capacity check)
**Type:** HARDCODED_GOVERNANCE

```bash
# Lines 70-71 — HARDCODED CAPACITY LIMIT:
MAX_AGENTS=5

if [ "$RUNNING_COUNT" -ge "$MAX_AGENTS" ]; then
```

The maximum concurrent agent count (`5`) is hardcoded. Per Rule 3 of the Plugin Abstraction Principle, governance constraints must be discovered at runtime, not hardcoded. This value should come from a configuration query or the `team-governance` skill.

#### Violation OW3 — LOCAL_REGISTRY (Severity: MEDIUM)
**File:** `op-wake-agent.md`
**Lines:** 42 (Prerequisites), 62 (Step 1 Verify)
**Type:** LOCAL_REGISTRY — storage path inconsistency

```
# Line 42 — PREREQUISITES:
Hibernation state file exists at `~/.ai-maestro/agent-states/<session-name>-hibernation.json`

# Line 62 — STEP 1:
Verify the state file exists at `~/.ai-maestro/agent-states/<agent-session-name>-hibernation.json`.
```

This path (`~/.ai-maestro/agent-states/`) conflicts with:
- `success-criteria.md` which uses `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
- `record-keeping.md` which uses `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/`
- `hibernation-procedures.md` which uses `design/memory/agents/`

Three different canonical paths across four files for the same artifact.

---

### FILE 10: `record-keeping.md`

**Status: PARTIALLY COMPLIANT — Important architectural system, needs harmonization**

This file defines the AMCOS-internal record keeping system. It has no curl violations (uses `$AIMAESTRO_API` variable correctly where it does use curl). However, it defines structures that overlap with and diverge from the AI Maestro GovernanceRequest API.

#### Observation RK1 — RECORD_KEEPING (Severity: INFORMATIONAL — DO NOT REMOVE)
**File:** `record-keeping.md`
**Lines:** Throughout — The entire file

**What AMCOS tracks internally (PRESERVE ALL):**

1. **Lifecycle Log** (`docs_dev/amcos-team/agent-lifecycle.log`) — SPAWN, TERMINATE, HIBERNATE, WAKE, TEAM_ADD, TEAM_REMOVE, STATUS_CHANGE, FAILURE, ROLLBACK events. This is an **append-only audit trail** for AMCOS's own accountability. This does NOT exist in AI Maestro.

2. **Approval Requests Log** (`docs_dev/chief-of-staff/approvals/approval-requests-YYYY-MM.log`) — Tracks approval requests to EAMA, decisions, execution results. The AI Maestro GovernanceRequest API tracks cross-host governance requests; AMCOS's approval log tracks its internal EAMA-based approvals, which are a different layer.

3. **Team Assignments Log** (`docs_dev/chief-of-staff/team-assignments.md`) — Human-readable summary regenerated daily. Serves as AMCOS's own view of team membership.

4. **Operation Audit Trail** (`docs_dev/chief-of-staff/operations/operation-YYYY-MM-DD.log`) — Per-operation detailed log with request IDs.

5. **Agent Registry** (`docs_dev/chief-of-staff/agent-registry.json`) — AMCOS's own master registry tracking all agents AMCOS has spawned, with full lifecycle history including team memberships, hibernation records, timestamps.

6. **Team Registry** — Documented as "AI Maestro REST API (`GET $AIMAESTRO_API/api/teams`)" — This IS correctly delegated to the AI Maestro API.

**Harmonization needed:**

The **Central Agent Registry** (`agent-registry.json` at line 196) is an AMCOS-internal shadow of the AI Maestro agent registry. The team membership data in this file (`team_memberships` array with `team_id` and `project` fields) should be reconciled with the AI Maestro teams API — not replaced, but explicitly described as AMCOS's view vs. the authoritative AI Maestro state.

The **Hibernation State Snapshot** format (lines 313-356) uses `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/` — this is the fourth different path for hibernation state storage across the reference files.

#### Violation RK2 — LOCAL_REGISTRY (Severity: HIGH — Path standardization needed)
**File:** `record-keeping.md`
**Lines:** 34–35 (Lifecycle Log location), 78 (Approval Log location), 94 (Team Assignments location), 143 (Operation Audit Trail location), 196–197 (Agent Registry location), 315–316 (Hibernation State location)

All log file paths use `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/` — but `record-keeping.md` is the ONLY file that uses this base path. Other files use `~/.ai-maestro/`, `docs_dev/amcos-team/`, etc.

The inconsistency means agents following different op-* procedures will write to different directories, producing a fragmented audit trail.

---

### FILE 11: `spawn-procedures.md`

**Status: MINOR VIOLATIONS — 2 found**

#### Violation SP1 — HARDCODED_AMP (Severity: LOW)
**File:** `spawn-procedures.md`
**Lines:** 113–125 (Section 1.3.3 Instance creation — "Using Task Tool")
**Type:** HARDCODED_AMP

The file embeds Python pseudocode using a `Task()` constructor and `spawn_agent()` function that do not correspond to real skill syntax:

```python
# Lines 114-125 — PSEUDOCODE not mapping to real skill:
result = Task(
    description="Implement user login feature",
    prompt="""
    You are a code-implementer agent.
    ...
    Report progress via AI Maestro to chief-of-staff.
    """,
    subagent_type="code-implementer"
)
```

**What it should do instead:** Reference the `ai-maestro-agents-management` skill for agent creation. The `Task()` pseudocode is an internal conceptual diagram that could confuse agents executing the procedure.

#### Violation SP2 — HARDCODED_AMP (Severity: LOW)
**File:** `spawn-procedures.md`
**Lines:** 230–258 (Section 1.6 Examples — Python pseudocode examples)
**Type:** HARDCODED_AMP

```python
# Lines 234-246 — EXAMPLE pseudocode:
spawn_config = {
    "agent_type": "code-implementer",
    "task": "Implement JWT authentication",
    ...
}
result = spawn_agent(spawn_config)
```

These Python examples are architectural illustrations, not executable procedures, and do not correspond to any real API or skill command. They should either be clearly labeled as "conceptual diagram" or replaced with correct skill-based instructions.

---

### FILE 12: `sub-agent-role-boundaries-template.md`

**Status: COMPLIANT** — No violations.

This is a structural template for defining AMCOS sub-agents. It does not embed any API calls, endpoint URLs, or hardcoded governance rules. All communication examples reference the `agent-messaging` skill. The Tool Restrictions table correctly describes skill-based operations.

**Notable good patterns:**
- Line 317: "Execute operations via the `ai-maestro-agents-management` and `agent-messaging` skills"
- Line 248-253: Full messaging instructions use skill references, not curl
- Communication hierarchy (lines 277-290) is clean and correct

---

### FILE 13: `success-criteria.md`

**Status: VIOLATIONS FOUND — 4 found**

#### Violation SC1 — HARDCODED_API (Severity: MEDIUM)
**File:** `success-criteria.md`
**Lines:** 47 (Agent Spawned — Step 5), 72–73 (Agent Terminated — Step 3), 130–132 (Woken — Step 4), 141 (Team Assignment — Step 1), 156–159 (Team Assignment — Steps 2, 3, 4), 223 (Team Registry Not Updated — Step 1-4)
**Type:** HARDCODED_API

Multiple curl commands with direct API path references appear in verification steps:

```bash
# Line 47 — AGENT SPAWNED verification:
curl -s "$AIMAESTRO_API/api/agents" | jq '.[] | select(.name == "<agent-name>")'

# Line 73 — AGENT TERMINATED verification:
curl -s "$AIMAESTRO_API/api/agents" | jq -r '.[] | select(.name == "<agent-name>")'

# Line 132 — AGENT WOKEN verification:
curl -s "$AIMAESTRO_API/api/agents" | jq -r '.[] | select(.name == "<agent-name>") | .status'

# Lines 156-159 — TEAM ASSIGNMENT verification:
curl -s -o /dev/null -w "%{http_code}" "$AIMAESTRO_API/api/teams"
curl -s "$AIMAESTRO_API/api/agents?team=<team-name>" | jq -r '.[] | select(.name == "<agent-name>")'

# Lines 223-226 — Team Registry Not Updated verification:
curl -s -o /dev/null -w "%{http_code}" "$AIMAESTRO_API/api/teams"
curl -s "$AIMAESTRO_API/api/teams" | jq .
```

**Note:** All use `$AIMAESTRO_API` env var, not hardcoded `localhost:23000`, so they follow the environment variable convention. However, per Rule 2, even env-var-based curl should be replaced by `aimaestro-agent.sh` CLI calls or `team-governance` skill references.

#### Violation SC2 — LOCAL_REGISTRY (Severity: HIGH)
**File:** `success-criteria.md`
**Lines:** 84 (Hibernated criteria), 98–103 (Hibernated verification steps)
**Type:** LOCAL_REGISTRY — path inconsistency

```bash
# Lines 84, 98-103 — HIBERNATION VERIFICATION:
Context saved to disk: `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
ls -l $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json
jq . $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json
```

This is the third distinct hibernation state path (`$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/`) — different from op-hibernate-agent.md (`~/.ai-maestro/agent-states/`), different from record-keeping.md (`$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/`), and different from hibernation-procedures.md (`design/memory/agents/`).

#### Violation SC3 — LOCAL_REGISTRY (Severity: MEDIUM)
**File:** `success-criteria.md`
**Lines:** 239–244 (Context Not Saved section)
**Type:** LOCAL_REGISTRY

```bash
# Lines 239-244 — checking paths that vary by file:
ls -ld $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/
ls -lh $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json
jq . $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json
```

#### Violation SC4 — LOCAL_REGISTRY (Severity: LOW)
**File:** `success-criteria.md`
**Lines:** 186–190 (Approval Obtained — verification steps)
**Type:** LOCAL_REGISTRY — references log file paths

```bash
# Lines 186-187:
grep "<request-id>" docs_dev/chief-of-staff/approval-requests.log
tail -n 50 docs_dev/chief-of-staff/approval-audit.log | grep "<request-id>"
```

These reference local log files, which is expected AMCOS behavior. However, the log file names (`approval-requests.log`, `approval-audit.log`) conflict with the naming in `record-keeping.md` (`approval-requests-YYYY-MM.log`).

---

### FILE 14: `termination-procedures.md`

**Status: MINOR VIOLATIONS — 2 found**

#### Violation TP1 — HARDCODED_AMP (Severity: LOW)
**File:** `termination-procedures.md`
**Lines:** 220–242 (Section 2.6 Examples — Python pseudocode)
**Type:** HARDCODED_AMP

Same pseudocode pattern as spawn-procedures.md — Python functions (`send_termination_request()`, `await_termination_response()`, `update_registry()`, `notify_chief_of_staff()`) that don't map to real skill or API syntax:

```python
# Lines 222-241 — Python pseudocode:
send_termination_request(agent_id, graceful=True, reason="Task completed")
response = await_termination_response(agent_id, timeout=60)
update_registry(agent_id, status="TERMINATED")
notify_chief_of_staff(f"Agent {agent_id} terminated successfully")
```

#### Violation TP2 — LOCAL_REGISTRY (Severity: LOW)
**File:** `termination-procedures.md`
**Lines:** 96–100 (State Snapshot Location), 215–216 (Post-termination validation)
**Type:** LOCAL_REGISTRY

```
# Lines 96-100 — STATE SNAPSHOT LOCATION:
design/memory/agents/
└── code-impl-01/
    ├── final-state.md
    ├── task-log.md
    └── metrics.json
```

```
# Line 216 — POST-TERMINATION VALIDATION:
Check state saved by verifying that `design/memory/agents/code-impl-01/final-state.md` exists
```

This uses the old `design/memory/agents/` path (same as hibernation-procedures.md), which is inconsistent with all other files' paths. This appears to be a legacy reference that was not updated when the path was standardized.

---

### FILE 15: `workflow-checklists.md`

**Status: VIOLATIONS FOUND — 4 found**

#### Violation WC1 — LOCAL_REGISTRY / CLI_SYNTAX (Severity: HIGH)
**File:** `workflow-checklists.md`
**Lines:** 150–153 (Forming Team — Create team registry), 155 (Assign agents loop), 175–183 (Updating Team Registry — Execute update), 188 (Verify update)
**Type:** LOCAL_REGISTRY + CLI_SYNTAX

```bash
# Lines 150-153 — FORMING TEAM CHECKLIST:
Run `uv run python scripts/amcos_team_registry.py create <project-dir> --team-lead <agent-name>`

# Lines 155 (loop):
For each agent: `uv run python scripts/amcos_team_registry.py add-agent <project-dir> <agent-name> --role <role>`

# Lines 175-183 — UPDATING REGISTRY CHECKLIST (3 commands):
uv run python scripts/amcos_team_registry.py add-agent <project-dir> <agent-name> --role <role>
uv run python scripts/amcos_team_registry.py remove-agent <project-dir> <agent-name>
uv run python scripts/amcos_team_registry.py update-status <project-dir> <agent-name> <status>

# Line 188:
uv run python scripts/amcos_team_registry.py list <project-dir>
```

#### Violation WC2 — HARDCODED_API (Severity: LOW)
**File:** `workflow-checklists.md`
**Lines:** 152 (Forming Team verify), 175 (Updating Registry — Before update Step 1), 177 (record snapshot)
**Type:** HARDCODED_API

```bash
# Line 152 — VERIFY AFTER CREATE:
Verify team created via REST API: `curl -s "$AIMAESTRO_API/api/teams" | jq '.[].name'`

# Line 175:
curl -s -o /dev/null -w "%{http_code}" "$AIMAESTRO_API/api/teams"

# Line 177 — SNAPSHOT BEFORE UPDATE:
curl -s "$AIMAESTRO_API/api/teams" | jq . > docs_dev/team-registry-snapshot-$(date +%Y%m%d%H%M%S).json
```

Uses `$AIMAESTRO_API` env var correctly, but still embeds raw curl in what agents read as checklists.

#### Violation WC3 — HARDCODED_GOVERNANCE (Severity: MEDIUM)
**File:** `workflow-checklists.md`
**Lines:** 98 (Hibernating Agent — Create directory step)
**Type:** HARDCODED_GOVERNANCE — storage path encoded in checklist

```bash
# Line 98 — HIBERNATION CHECKLIST:
Create hibernation directory: `mkdir -p $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/`
```

This embeds a specific directory structure as a checklist step. The storage path should be managed by the skill/script, not hardcoded in the checklist.

#### Violation WC4 — LOCAL_REGISTRY (Severity: LOW)
**File:** `workflow-checklists.md`
**Lines:** 121–122 (Waking Agent — Pre-wake checks)
**Type:** LOCAL_REGISTRY

```bash
# Lines 121-122:
Check hibernation snapshot exists: `test -f $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
Ensure working directory still accessible
```

---

### FILE 16: `workflow-examples.md`

**Status: PARTIALLY COMPLIANT — 2 observations**

#### Observation WE1 — LOCAL_REGISTRY (Severity: LOW — Informational)
**File:** `workflow-examples.md`
**Lines:** 39–40 (Workflow 1 Step 4)
**Type:** LOCAL_REGISTRY

```
# Lines 39-40 — WORKFLOW 1 STEP 4:
4. Update team registry (.ai-maestro/team-registry.json)
```

References a `.ai-maestro/team-registry.json` file path that doesn't correspond to the REST API approach described in `record-keeping.md` (which says team registry IS the AI Maestro REST API). This path suggests a file-based registry that may be outdated.

#### Observation WE2 — Outdated content (Severity: LOW)
**File:** `workflow-examples.md`
**Lines:** 96–102 (Workflow 3 — PSS reindex)
**Type:** Outdated reference

```
# Lines 98-100:
Execute: /pss-reindex-skills (if PSS plugin available)
Or: Run pss_build_skill_index.py directly
```

These reference PSS (Plugin Skill System) internals that are not standard AI Maestro abstractions. This is a low-severity informational observation about outdated content, not a Plugin Abstraction Principle violation per se.

---

## Consolidated Violation Table

| # | File | Lines | Type | Severity | Summary |
|---|------|--------|------|----------|---------|
| H1 | `hibernation-procedures.md` | 278–326 | HARDCODED_AMP | Low | Python pseudocode functions (send_message, update_registry) don't map to real skill |
| H2 | `hibernation-procedures.md` | 92–124, 148–150 | LOCAL_REGISTRY | Medium | Storage path `design/memory/agents/` contradicts all other files |
| OH1 | `op-hibernate-agent.md` | 91–105, 143–154 | LOCAL_REGISTRY + CLI_SYNTAX | **HIGH** | `amcos_team_registry.py` commands embedded as primary procedure steps |
| OH2 | `op-hibernate-agent.md` | 165 | HARDCODED_API | Low | `curl -s "$AIMAESTRO_API/api/teams"` in error handling |
| OH3 | `op-hibernate-agent.md` | 42, 44, 62, 79 | LOCAL_REGISTRY | Medium | Storage path `~/.ai-maestro/agent-states/` conflicts with other files |
| SM1 | `op-send-maestro-message.md` | 144 | LOCAL_REGISTRY + CLI_SYNTAX | Medium | `amcos_team_registry.py list` in broadcast example |
| OS1 | `op-spawn-agent.md` | 96–102, 140–166 | LOCAL_REGISTRY + CLI_SYNTAX | **HIGH** | `amcos_team_registry.py add-agent` in primary spawn procedure |
| OS2 | `op-spawn-agent.md` | 44 | HARDCODED_API | Low | `$AIMAESTRO_API/api/teams` in prerequisites |
| OT1 | `op-terminate-agent.md` | 93–109, 148–157 | LOCAL_REGISTRY + CLI_SYNTAX | **HIGH** | `amcos_team_registry.py remove-agent/log` in primary terminate procedure |
| UR1 | `op-update-team-registry.md` | 62–113, 141–189 | LOCAL_REGISTRY + CLI_SYNTAX | **CRITICAL** | Entire file embeds `amcos_team_registry.py` full CLI interface |
| UR2 | `op-update-team-registry.md` | 43, 122–123 | HARDCODED_API | Low | `curl -s "$AIMAESTRO_API/api/teams"` in prerequisites and verify step |
| UR3 | `op-update-team-registry.md` | 163–165 | HARDCODED_AMP | Low | `amcos_team_registry.py publish` sends AMP messages as side-effect |
| OW1 | `op-wake-agent.md` | 55–74, 109–122, 164–177 | LOCAL_REGISTRY + CLI_SYNTAX | **HIGH** | `amcos_team_registry.py` in all procedure steps |
| OW2 | `op-wake-agent.md` | 70–71 | HARDCODED_GOVERNANCE | Medium | `MAX_AGENTS=5` hardcoded capacity limit |
| OW3 | `op-wake-agent.md` | 42, 62 | LOCAL_REGISTRY | Medium | Storage path `~/.ai-maestro/agent-states/` conflicts with other files |
| RK1 | `record-keeping.md` | Throughout | RECORD_KEEPING | **PRESERVE** | AMCOS internal record-keeping system — distinct from AI Maestro, must be preserved |
| RK2 | `record-keeping.md` | 34–35, 78, 94, 143, 197, 315 | LOCAL_REGISTRY | High | All log paths use different base directory than other files |
| SP1 | `spawn-procedures.md` | 113–125 | HARDCODED_AMP | Low | Python pseudocode `Task()` constructor |
| SP2 | `spawn-procedures.md` | 230–258 | HARDCODED_AMP | Low | Python pseudocode `spawn_agent()` examples |
| SC1 | `success-criteria.md` | 47, 72, 132, 156–159, 223–226 | HARDCODED_API | Medium | Multiple `curl "$AIMAESTRO_API/api/..."` in verification steps |
| SC2 | `success-criteria.md` | 84, 98–103 | LOCAL_REGISTRY | High | Hibernation path `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/` — fourth distinct path |
| SC3 | `success-criteria.md` | 239–244 | LOCAL_REGISTRY | Medium | Same path inconsistency as SC2 |
| SC4 | `success-criteria.md` | 186–190 | LOCAL_REGISTRY | Low | Log file names conflict with record-keeping.md naming |
| TP1 | `termination-procedures.md` | 220–242 | HARDCODED_AMP | Low | Python pseudocode functions |
| TP2 | `termination-procedures.md` | 96–100, 215–216 | LOCAL_REGISTRY | Low | `design/memory/agents/` path — legacy reference, contradicts all other files |
| WC1 | `workflow-checklists.md` | 150–188 | LOCAL_REGISTRY + CLI_SYNTAX | **HIGH** | `amcos_team_registry.py` commands embedded in checklists |
| WC2 | `workflow-checklists.md` | 152, 175, 177 | HARDCODED_API | Low | `curl "$AIMAESTRO_API/api/teams"` in checklists |
| WC3 | `workflow-checklists.md` | 98 | HARDCODED_GOVERNANCE | Medium | `mkdir -p $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/` hardcoded in checklist |
| WC4 | `workflow-checklists.md` | 121–122 | LOCAL_REGISTRY | Low | Storage path hardcoded in pre-wake checklist |
| WE1 | `workflow-examples.md` | 39–40 | LOCAL_REGISTRY | Low | `.ai-maestro/team-registry.json` file path reference (may be outdated) |
| WE2 | `workflow-examples.md` | 96–102 | N/A | Low | PSS plugin internal references (informational) |

---

## Critical Pattern: The `amcos_team_registry.py` Problem

**This is the highest-priority finding.** The following 7 files embed `amcos_team_registry.py` CLI syntax as **primary procedure steps**:

1. `op-hibernate-agent.md` (Steps 5, 6)
2. `op-spawn-agent.md` (Step 5)
3. `op-terminate-agent.md` (Steps 5, 7)
4. `op-update-team-registry.md` (Steps 2, 3, 4 — entire file)
5. `op-wake-agent.md` (Steps 1, 2, 6, 7)
6. `workflow-checklists.md` (Forming Team, Updating Registry sections)
7. `op-send-maestro-message.md` (Broadcast example)

**What `amcos_team_registry.py` does:** It is an AMCOS-internal script that manages the plugin's own local tracking data (add-agent, remove-agent, update-status, log, publish). This is a **legitimate local concern** for AMCOS that is separate from the AI Maestro agent registry.

**The fix approach (HARMONIZE, not remove):**

The local AMCOS team registry is a valid system. The issue is that its CLI syntax is embedded verbatim in human-readable reference documents that agents will execute. The solution is:

**Option A (Preferred per Plugin Abstraction Principle):** Treat `amcos_team_registry.py` as an internal script that should NOT be referenced directly in skill/reference files. Instead:
- Create an `amcos-team-registry-update` skill reference or op-step that says: "Update the AMCOS team registry" without embedding the script's exact CLI syntax
- The script can change internally without breaking all reference files

**Option B (Acceptable):** Add an explicit note in each reference file that `amcos_team_registry.py` is an AMCOS-internal script whose CLI is defined in `scripts/amcos_team_registry.py` and that agents should refer to the script's `--help` output for current syntax

**Option C (Minimum viable):** Keep the current pattern but add a header warning in each op-* file noting that the `amcos_team_registry.py` calls are internal AMCOS operations that may have different syntax than shown

---

## RECORD_KEEPING System Analysis

### What AMCOS tracks internally (PRESERVE ALL — do not remove)

The AMCOS record-keeping system in `record-keeping.md` defines **four distinct tracking stores**:

| Store | Location | Purpose | AI Maestro equivalent? |
|-------|----------|---------|------------------------|
| Lifecycle Log | `docs_dev/amcos-team/agent-lifecycle.log` | Complete audit trail of all lifecycle operations | NO — AI Maestro has no equivalent |
| Approval Log | `docs_dev/chief-of-staff/approvals/` | EAMA approval requests and decisions | PARTIAL — AI Maestro has GovernanceRequest API but it's for cross-host governance, not EAMA approvals |
| Team Assignments | `docs_dev/chief-of-staff/team-assignments.md` | Human-readable summary for AMCOS operator | NO — AI Maestro's teams API is machine-readable only |
| Operation Audit Trail | `docs_dev/chief-of-staff/operations/` | Per-request detailed operation log | NO |
| Agent Registry | `docs_dev/chief-of-staff/agent-registry.json` | AMCOS's master record of spawned agents | PARTIAL — AI Maestro has agent registry but lacks AMCOS-specific fields (spawned_by, team_memberships history) |

### How to harmonize with AI Maestro GovernanceRequest API

The AI Maestro GovernanceRequest API (`/api/v1/governance/requests`) handles:
- Cross-host formal approvals for `create-agent`, `transfer-agent`, `add-to-team`
- Dual-approval workflow for cross-host operations
- Tracks: `type`, `requestedBy`, `requestedByRole`, `targetHostId`, `payload`, `status`

The AMCOS Approval Log handles:
- EAMA-based approvals for LOCAL operations (single-host)
- Tracks: requester, operation type, decision, by (human manager), reason

**Harmonization recommendation:** These are complementary, not conflicting:
- AMCOS should continue its local approval log for EAMA-based decisions
- For cross-host operations, AMCOS should ALSO submit a GovernanceRequest via the AI Maestro API and reference the request ID in its approval log
- The `record-keeping.md` should explicitly note: "For cross-host operations, also submit a GovernanceRequest via `team-governance` skill's GovernanceRequest section; link the request ID in this log"

### Path Standardization Issue

The four distinct hibernation state paths found across the files represent a real operational problem — if an agent uses `op-hibernate-agent.md` to hibernate but `success-criteria.md` to verify, they will look in different directories and find nothing.

**Canonical path recommendation:** Standardize on `$CLAUDE_PROJECT_DIR/.ai-maestro/` as the base for AMCOS-local state, with subdirectories:
- `hibernated-agents/<name>/context.json` — hibernation state (from success-criteria.md)
- `teams/<team-name>/` — team-local data
- Update all references to remove `design/memory/agents/` (legacy) and `~/.ai-maestro/agent-states/` (inconsistent with project-relative path)

---

## Summary: Files Requiring Changes

| File | Violation Count | Priority | Primary Fix Needed |
|------|----------------|----------|-------------------|
| `op-update-team-registry.md` | 3 (CRITICAL) | P1 | Abstract `amcos_team_registry.py` calls; replace curl with skill refs |
| `op-hibernate-agent.md` | 3 (HIGH) | P1 | Same as above; standardize storage path |
| `op-spawn-agent.md` | 2 (HIGH) | P1 | Same; remove OS2 curl |
| `op-terminate-agent.md` | 1 (HIGH) | P1 | Same |
| `op-wake-agent.md` | 3 (HIGH) | P1 | Same; remove hardcoded MAX_AGENTS; standardize path |
| `workflow-checklists.md` | 4 (HIGH) | P1 | Same; remove hardcoded mkdir path |
| `record-keeping.md` | 1 (HIGH) | P2 | Standardize all log paths to one base directory |
| `success-criteria.md` | 4 (MEDIUM) | P2 | Replace curl with skill refs; standardize hibernation path |
| `op-send-maestro-message.md` | 1 (MEDIUM) | P2 | Replace registry script call with skill ref |
| `hibernation-procedures.md` | 2 (MEDIUM/Low) | P3 | Remove legacy `design/memory/agents/` path; clarify pseudocode |
| `spawn-procedures.md` | 2 (Low) | P3 | Label/replace Python pseudocode |
| `termination-procedures.md` | 2 (Low) | P3 | Same; update legacy path |
| `workflow-examples.md` | 2 (Low) | P3 | Update outdated path; clarify PSS reference |
| `cli-examples.md` | 0 | — | No changes needed |
| `cli-reference.md` | 0 | — | No changes needed |
| `sub-agent-role-boundaries-template.md` | 0 | — | No changes needed |

---

## Files with Zero Violations (exemplary compliance)

1. **`cli-examples.md`** — Fully compliant, excellent skill-delegation pattern throughout
2. **`cli-reference.md`** — Fully compliant, comprehensive lifecycle reference with no API violations
3. **`sub-agent-role-boundaries-template.md`** — Fully compliant, excellent template for AMCOS sub-agent structure

These three files should serve as the model for how the other files should be updated.

---

*End of audit report.*
