# TODO: AMAMA Plugin — Plugin Abstraction Principle Fixes
# Source: consolidated-AMAMA-violations-2026-02-27.md
# Plugin Root: /Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent
# Date: 2026-02-27
# Total TODOs: 20 (18 violations → 16 fix TODOs + 2 harmonization TODOs + 2 script audit TODOs)

---

## IMPORTANT: Items That Must NOT Be Changed

The following 12 internal record-keeping systems are EAMA's operational intelligence. They are NOT violations and must be PRESERVED IN FULL:

1. `docs_dev/approvals/approval-log.md` — Immutable audit trail of all ECOS-requested operations
2. `docs_dev/approvals/approval-state.yaml` — Autonomous delegation config (YAML state file)
3. `docs_dev/sessions/active-ecos-sessions.md` — Session memory for tracking spawned ECOS instances
4. `docs_dev/sessions/spawn-failures.md` — Audit log for failed ECOS spawn attempts
5. `thoughts/shared/handoffs/eama/` — Cross-session user relationship memory
6. `thoughts/shared/handoffs/eama/decision-log.md` — Persistent record of strategic decisions
7. The three-path approval workflow (autonomous → EAMA decides, user escalation → User decides, denial → EAMA decides)
8. The immutability principle of past approval log entries
9. The `needs-revision` response type in the `eama-respond-to-ecos` command
10. The operations-always-requiring-EAMA-approval list in `delegation-rules.md`
11. The autonomous delegation YAML state file and per-ECOS grant logic
12. GitHub issue comments written via `gh issue comment` (plugin's own record-keeping)

---

## Priority 1 — Fix First (HIGH severity)

### TODO-A1: Remove Python address-lookup snippet from TEAM_REGISTRY_SPECIFICATION
- **File:** `docs/TEAM_REGISTRY_SPECIFICATION.md`
- **Lines:** ~252–281
- **Priority:** P1
- **Depends on:** None
- **Current:** Contains a Python `get_agent_address()` function snippet that reads `.emasoft/team-registry.json` directly from disk to look up an agent's `ai_maestro_address` field. The function parses local JSON to retrieve agent addresses, bypassing the `ai-maestro-agents-management` skill.
- **Change:** Remove the Python code snippet entirely (lines ~252–281). Replace with the following prose: "The `ai_maestro_address` field in `team-registry.json` IS the agent's AI Maestro session name. Use it directly with the `agent-messaging` skill. No lookup function is needed."
- **Verify:** Open the file after editing. Confirm no `def get_agent_address` function body exists. Confirm the replacement prose is present and correct. Confirm no `json.load`, `open(`, or file-path strings remain in that section.
- **Harmonization note:** None. This section contains no EAMA record-keeping content — the Python snippet is purely illustrative and must be replaced wholesale.

---

## Priority 2 — Fix Soon (MEDIUM severity, operational paths)

### TODO-A2: Fix tmux user-facing template in spawn-failure-recovery (violation #3)
- **File:** `skills/eama-ecos-coordination/references/spawn-failure-recovery.md`
- **Lines:** ~196–201
- **Priority:** P2
- **Depends on:** None
- **Current:** A user-facing message template contains the raw tmux command `tmux attach -t ecos-<project-name>`. This hardcodes the tmux session name format in a template that EAMA sends to users.
- **Change:** Replace the `tmux attach -t ecos-<project-name>` text inside the user-facing message template with: "Check the ECOS agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard."
- **Verify:** Open the file after editing. Confirm no `tmux attach` command remains in the user-message template block at lines ~196–201. Confirm the replacement text references `ai-maestro-agents-management` skill.
- **Harmonization note:** The surrounding message template content is EAMA's own communication format and must be preserved. Only the tmux command reference is replaced.

### TODO-A3: Fix tmux recovery commands in spawn-failure-recovery (violation #4)
- **File:** `skills/eama-ecos-coordination/references/spawn-failure-recovery.md`
- **Lines:** ~333–337
- **Priority:** P2
- **Depends on:** None
- **Current:** Recovery Procedure Step 3 contains `tmux list-sessions` and `tmux kill-session -t <zombie-session-name>` commands. These are agent-lifecycle operations that should reference the `ai-maestro-agents-management` skill instead.
- **Change:** Replace the `tmux list-sessions` and `tmux kill-session` commands at lines ~333–337 with: "Use the `ai-maestro-agents-management` skill to list all agent sessions and terminate orphaned ones."
- **Verify:** Open the file after editing. Confirm no `tmux list-sessions` or `tmux kill-session` commands remain in Recovery Procedure Step 3 (lines ~333–337). Confirm the replacement references `ai-maestro-agents-management` skill.
- **Harmonization note:** The broader Recovery Procedure structure and other steps are EAMA's own operational logic and must not be altered.

### TODO-A4: Standardize health check message type to `ping` (violation #5)
- **File:** `skills/eama-ecos-coordination/references/spawn-failure-recovery.md`
- **Lines:** ~172–175
- **Priority:** P2
- **Depends on:** None
- **Current:** The message type field at lines ~172–175 says `health_check`, but all other AMAMA files (including `creating-ecos-procedure.md` line ~155 and `ai-maestro-message-templates.md`) use `ping` for the same purpose. This internal inconsistency creates ambiguity.
- **Change:** Replace `health_check` with `ping` at lines ~172–175 to match the standard message type used across the rest of the plugin. Do a search for any other remaining `health_check` occurrences in this file and replace them with `ping`.
- **Verify:** Search for `health_check` in `spawn-failure-recovery.md`. Confirm zero occurrences remain. Open `ai-maestro-message-templates.md` and confirm `ping` is the canonical type. The file should now be internally consistent.
- **Harmonization note:** None. The message type `ping` is already established in `ai-maestro-message-templates.md` which is the authoritative source.

### TODO-A5: Fix tmux session listing in workflow-examples (violation #6)
- **File:** `skills/eama-ecos-coordination/references/workflow-examples.md`
- **Lines:** ~197–204
- **Priority:** P2
- **Depends on:** TODO-A3 (same content pattern — fix both files consistently)
- **Current:** The "ECOS Spawn Failure Recovery Protocol" Step 2 in this file contains `tmux list-sessions` and `tmux list-sessions | grep "ecos-<project-name>"` commands. This is duplicate content of the violation fixed in TODO-A3 — both files contain the same tmux session listing pattern.
- **Change:** Replace the `tmux list-sessions` and `tmux list-sessions | grep "ecos-..."` commands at lines ~197–204 with: "Use the `ai-maestro-agents-management` skill to list all agent sessions and identify the relevant ECOS session."
- **Verify:** Open the file after editing. Confirm no `tmux list-sessions` commands remain in the "ECOS Spawn Failure Recovery Protocol" section around lines ~197–204. Compare with the corresponding section in `spawn-failure-recovery.md` after TODO-A3 is applied to confirm consistency.
- **Harmonization note:** The broader Example structure and other workflow steps are EAMA's own operational logic and must not be altered.

### TODO-A6: Fix tmux attach command in workflow-examples Example 2 (violation #7)
- **File:** `skills/eama-ecos-coordination/references/workflow-examples.md`
- **Lines:** ~477
- **Priority:** P2
- **Depends on:** TODO-A2 (same content pattern — fix both files consistently)
- **Current:** "Example 2: ECOS Not Responding" contains `tmux attach -t ecos-inventory-system` hardcoded in a user-facing message example. This hardcodes a specific tmux session name in an illustrative template.
- **Change:** Replace `tmux attach -t ecos-inventory-system` at line ~477 with: "Check the ECOS agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard."
- **Verify:** Open the file after editing. Confirm no `tmux attach` command remains around line ~477. Confirm the replacement text references `ai-maestro-agents-management` skill. Compare with the corresponding section in `spawn-failure-recovery.md` after TODO-A2 is applied to confirm consistency.
- **Harmonization note:** The Example 2 message body is an illustrative template for EAMA communication. Only the tmux command reference is replaced; the surrounding message structure is preserved.

### TODO-A7: Replace mkdir/cp/tmux/ls commands in creating-ecos-procedure (violation #8)
- **File:** `skills/eama-ecos-coordination/references/creating-ecos-procedure.md`
- **Lines:** ~108–136 (prerequisite/setup), ~232 (tmux attach), ~239 (ls plugin check)
- **Priority:** P2
- **Depends on:** None
- **Current:** Three sets of raw shell commands are embedded:
  1. Lines ~108–136: `mkdir -p ~/agents/$SESSION_NAME` and `cp -r /path/to/emasoft-chief-of-staff ...` in prerequisite/setup steps for agent directory preparation.
  2. Line ~232: `tmux attach -t $SESSION_NAME` in the Troubleshooting section.
  3. Line ~239: `ls ~/agents/$SESSION_NAME/.claude/plugins/emasoft-*` for plugin verification in Troubleshooting.
- **Change:**
  1. For lines ~108–136: Replace the `mkdir` and `cp` commands with: "Use the `ai-maestro-agents-management` skill to prepare the agent working directory and install the required plugin. Note: If directory preparation is not yet exposed by the `ai-maestro-agents-management` skill, perform this step manually following the procedure below." Retain any manual procedure text below but label it clearly as: "**Manual fallback (only if ai-maestro-agents-management skill does not support this operation):**"
  2. For line ~232: Replace `tmux attach -t $SESSION_NAME` with: "Check the agent session via the `ai-maestro-agents-management` skill or the AI Maestro dashboard. **Manual fallback:** `tmux attach -t $SESSION_NAME`"
  3. For line ~239: Replace the bare `ls` command with: "Verify plugin installation via the `ai-maestro-agents-management` skill. **Manual fallback:** check the plugin directory directly."
- **Verify:** Open the file after editing. Confirm `mkdir -p ~/agents/` and `cp -r /path/to/emasoft-chief-of-staff` no longer appear as primary instructions. Confirm all three changed areas contain references to `ai-maestro-agents-management` skill. Confirm any manual fallback text is clearly labeled as such.
- **Harmonization note:** The broader procedure structure (steps for ECOS creation) is EAMA's own operational logic. Only the raw shell commands in setup and troubleshooting sections are modified. The existing creating-ecos-instance.md (confirmed clean) should remain unchanged.

### TODO-A8: Move kanban snapshot storage from /tmp to docs_dev (violation #2)
- **File:** `skills/eama-github-routing/references/proactive-kanban-monitoring.md`
- **Lines:** ~56–97
- **Priority:** P2
- **Depends on:** None
- **Current:** The bash monitoring procedure uses `/tmp/kanban-snapshot-$(date +%s).json` for snapshot storage, with `diff` and `mv` commands operating on `/tmp` paths. The `/tmp` directory is cleared on reboot, making these snapshots fragile and inconsistent with EAMA's session memory system.
- **Change:**
  1. Replace all `/tmp/kanban-snapshot-$(date +%s).json` path references with `docs_dev/kanban/snapshots/kanban-snapshot-$(date +%s).json`.
  2. Replace all other `/tmp/kanban-*` or `/tmp/kanban_*` path references with the `docs_dev/kanban/snapshots/` equivalent.
  3. Add a note near the `gh` CLI usage: "GitHub Project board monitoring uses the `gh` CLI directly — no AI Maestro abstraction exists for this operation."
- **Verify:** Open the file after editing. Confirm no `/tmp/kanban-` paths remain. Confirm all snapshot paths now use `docs_dev/kanban/snapshots/`. Confirm the `gh` CLI note is present.
- **Harmonization note:** The `gh` CLI usage itself (for `gh project item-list`) is acceptable — no AI Maestro wrapper exists for GitHub Projects. The `--owner Emasoft` flag is also acceptable (L4 observation, no action needed).

### TODO-A9: Remove embedded yq shell pipeline from eama-approval-workflows SKILL (violations #11 and #12)
- **File:** `skills/eama-approval-workflows/SKILL.md`
- **Lines:** 209–217
- **Priority:** P2
- **Depends on:** None
- **Current:** Lines 209–217 contain an inline shell pipeline: `cat docs_dev/approvals/approval-state.yaml | yq -r '...'` with `fromdateiso8601`, `now`, and complex yq flag syntax embedded directly in the skill body. This violates the principle that skills describe WHAT to do, not HOW to do it using specific CLI tool syntax.
- **Change:** Remove the entire `yq -r` shell command block from lines 209–217. Replace with prose: "Identify pending approvals with `requested_at` timestamps more than 24 hours in the past using the approval tracking state file at `docs_dev/approvals/approval-state.yaml`. If automation is needed, use the `check-approval-expiry.sh` script (see `scripts/` directory)." Do NOT delete the `docs_dev/approvals/approval-state.yaml` file itself or any surrounding skill text — only the inline shell command block is removed.
- **Verify:** Open the file after editing. Confirm no `yq` command, `fromdateiso8601`, or `cat docs_dev/approvals/approval-state.yaml |` pipeline remains in lines ~209–217. Confirm the replacement prose describes the intent without hardcoding tool invocation.
- **Harmonization note:** The `docs_dev/approvals/approval-state.yaml` file and its role in approval tracking are EAMA's own record-keeping. The approval state tracking logic must be preserved — only the inline shell command that reads it is replaced with prose.

### TODO-A10: Add agent-messaging skill reference to eama-status-reporting SKILL (violations #16 and #17)
- **File:** `skills/eama-status-reporting/SKILL.md`
- **Lines:** 31, 54, 57 (messaging references); 111–124 (role code examples)
- **Priority:** P2
- **Depends on:** None
- **Current:**
  - Lines 31, 54, 57: Reference "Query each role via AI Maestro for their current status" without specifying the `agent-messaging` skill. This asymmetry with GitHub operations (which correctly cite `gh` CLI) leaves the messaging path ambiguous.
  - Lines 111–124: Examples section hardcodes role codes `[EAA]`, `[EOA]`, `[EIA]` in illustrative output without noting they are illustrative defaults.
- **Change:**
  1. At line 31 (or nearest context): Add explicit text: "Use the `agent-messaging` skill to query roles for status. Refer to `~/.claude/skills/agent-messaging/SKILL.md` → 'Sending Messages' and 'Inbox' sections."
  2. Update Step 2 in the Instructions section to read: "Query each role via AMP messaging — follow the `agent-messaging` skill. Do NOT use raw curl calls or direct API endpoints."
  3. In the Examples section (lines ~111–124): Add a note before or after the example output: "Role codes (EAA, EOA, EIA) shown here are illustrative defaults. Discover active roles at runtime using the `ai-maestro-agents-management` skill before generating reports."
- **Verify:** Open the file after editing. Confirm that at least one explicit mention of "agent-messaging skill" now appears near the status query instructions. Confirm the role codes disclaimer note is present in the Examples section.
- **Harmonization note:** The status reporting workflow and report format are EAMA's own operational logic. Only the messaging reference and examples disclaimer are added; no existing content is removed.

### TODO-A11: Replace hardcoded topology rules in eama-role-routing SKILL (violations #14 and #15)
- **File:** `skills/eama-role-routing/SKILL.md`
- **Lines:** 182–186 (topology assertions); 53–62 (plugin prefix table)
- **Priority:** P2
- **Depends on:** None
- **Current:**
  - Lines 182–186: Hardcoded absolute communication topology assertions: "EAMA is the ONLY role that communicates directly with the USER", "EAA, EOA, and EIA do NOT communicate directly with each other or with EAMA", etc.
  - Lines 53–62: Hardcoded Plugin Prefix Reference table listing `eama-`, `ecos-`, `eaa-`, `eoa-`, `eia-` as authoritative session name prefixes.
- **Change:**
  1. At lines ~182–186: Replace the CRITICAL hardcoded topology assertions with: "Communication topology and role permissions are defined by the team governance configuration. Before routing, verify current role relationships by consulting the `team-governance` skill. The routing decision matrix below reflects the default EAMA topology — confirm it remains current before applying." Preserve the routing decision matrix itself (which routes which request type to which role) — that is EAMA's own operational logic.
  2. At lines ~53–62: Retain the prefix convention table but add a heading/label: "Default naming convention — verify active agents at runtime." Add a note: "Active specialist agents and their current session names are discovered at runtime via the `ai-maestro-agents-management` skill. The prefixes below are the convention, not a fixed registry."
- **Verify:** Open the file after editing. Confirm no sentence asserts EAMA is "THE ONLY" role without a qualifier. Confirm the prefix table has a "Default naming convention" label and a runtime discovery note. Confirm the routing decision matrix itself is unchanged.
- **Harmonization note:** The routing matrix (what request type routes to what role) is EAMA's core routing logic and must be preserved exactly. Only the absolute-certainty assertions about topology and the un-labeled prefix table are softened with runtime-discovery notes.

### TODO-A12: Audit eama_approve_plan.py for direct API calls (violation #9)
- **File:** `commands/eama-approve-plan.md` (references `scripts/eama_approve_plan.py`)
- **Lines:** ~5–15 (allowed-tools declaration in .md file)
- **Priority:** P2
- **Depends on:** None
- **Current:** `eama-approve-plan.md` declares `allowed-tools: ["Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/eama_approve_plan.py:*)"]`. The Python script `scripts/eama_approve_plan.py` was not available for inspection during the audit. If it makes direct `curl` or `fetch()` calls to `http://localhost:23000/...` (AI Maestro's internal API), that is a Rule 2 violation.
- **Change:**
  1. Locate and open `scripts/eama_approve_plan.py` in the plugin root.
  2. Search for any HTTP calls: `requests.get`, `requests.post`, `urllib`, `curl`, `http://localhost:23000`, `http://localhost:`, `/api/v1/`, `/api/governance/`, `/api/sessions/`.
  3. If any direct AI Maestro API calls are found: Replace them with equivalent `aimaestro-agent.sh` CLI calls (shell subprocess) or restructure to use the appropriate AI Maestro skill instead.
  4. If no direct API calls are found: Document in a comment at the top of the script: "# Verified: no direct AI Maestro API calls — compliant with Plugin Abstraction Principle (2026-02-27)."
- **Verify:** After inspection/fix: search the script for `localhost:23000`, `localhost:`, `/api/v1/`. Zero direct AI Maestro endpoint references should remain. If any `aimaestro-agent.sh` substitutions were made, verify they produce equivalent results with a test run.
- **Harmonization note:** The approval plan logic itself (reading `docs_dev/approvals/`, writing approval records) is EAMA's own record-keeping and must be preserved.

### TODO-A13: Audit eama_orchestration_status.py for direct API calls (violation #10)
- **File:** `commands/eama-orchestration-status.md` (references `scripts/eama_orchestration_status.py`)
- **Lines:** ~5–15 (allowed-tools declaration in .md file)
- **Priority:** P2
- **Depends on:** None
- **Current:** `eama-orchestration-status.md` declares an allowed-tool invoking `scripts/eama_orchestration_status.py` via Bash. The Python script was not available for inspection during the audit. Same concern as TODO-A12.
- **Change:**
  1. Locate and open `scripts/eama_orchestration_status.py` in the plugin root.
  2. Search for any HTTP calls: `requests.get`, `requests.post`, `urllib`, `curl`, `http://localhost:23000`, `/api/v1/`, `/api/governance/`, `/api/sessions/`.
  3. If any direct AI Maestro API calls are found: Replace them with equivalent `aimaestro-agent.sh` CLI calls or restructure to use the appropriate skill.
  4. If no direct API calls are found: Document in a comment at the top: "# Verified: no direct AI Maestro API calls — compliant with Plugin Abstraction Principle (2026-02-27)."
- **Verify:** After inspection/fix: search the script for `localhost:23000`, `localhost:`, `/api/v1/`. Zero direct AI Maestro endpoint references should remain.
- **Harmonization note:** The orchestration status logic itself (reading session state, reading EAMA's own docs_dev files) is EAMA's own record-keeping and must be preserved.

---

## Priority 3 — When Convenient (LOW severity)

### TODO-A14: Replace hardcoded gh search examples in eama-github-routing SKILL (violation #13)
- **File:** `skills/eama-github-routing/SKILL.md`
- **Lines:** 349–351
- **Priority:** P3
- **Depends on:** None
- **Current:** Lines 349–351 hardcode two `gh` CLI commands with specific flag syntax: `gh issue list --search "EAMA-LINK: design-uuid=abc123"` and `gh pr list --search "Design UUID: abc123"`. Skills should describe WHAT to do, not embed specific third-party CLI flag syntax.
- **Change:** Replace the hardcoded `gh` command lines at 349–351 with prose: "To find GitHub items linked by UUID, use `gh issue list` or `gh pr list` with the appropriate `--search` flag containing the UUID reference format. Consult the GitHub CLI documentation or the relevant specialist agent (EIA) for the exact search syntax." Alternatively, if exact syntax is essential for operational clarity, extract it to `scripts/find-by-uuid.sh` and reference the script name only.
- **Verify:** Open the file after editing. Confirm no hardcoded `gh issue list --search "EAMA-LINK:` or `gh pr list --search "Design UUID:` patterns remain as primary instructions. Confirm the replacement prose or script reference is present at that location.
- **Harmonization note:** The broader GitHub routing skill logic is EAMA's own routing intelligence. Only the hardcoded example CLI flag syntax is replaced with a prose description.

### TODO-A15: Add authoritative source disclaimer to eama-session-memory SKILL (violation #18)
- **File:** `skills/eama-session-memory/SKILL.md`
- **Lines:** (no specific line — add as a new section)
- **Priority:** P3
- **Depends on:** None
- **Current:** The session memory skill treats local markdown files as the authoritative source for agent state without clarifying that agent identity is owned by `ai-maestro-agents-management`. No operational violations exist — all operations are EAMA's own file management. A clarification note is needed only.
- **Change:** Add a new section near the top of the file (after the title/overview, before the first operational section):
  ```
  ## Agent Identity (Authoritative Source)
  Agent identity, metadata, and registration are the responsibility of the `ai-maestro-agents-management` skill. This skill maintains LOCAL SESSION STATE for EAMA's operational purposes (spawn tracking, session logs, performance caching), but it is NOT the source of truth for agent identity or registration status. When agent identity data conflicts between local session memory and the `ai-maestro-agents-management` skill, the `ai-maestro-agents-management` skill takes precedence.
  ```
- **Verify:** Open the file after editing. Confirm the new "Agent Identity (Authoritative Source)" section exists. Confirm it references `ai-maestro-agents-management` as the authoritative source.
- **Harmonization note:** All existing session memory content (spawn tracking, active ECOS sessions, spawn failures) is EAMA's own record-keeping and must be preserved unchanged.

---

## Priority 4 — Harmonization (Additive extensions — EAMA approval logic unchanged)

### TODO-A16: Add optional AI Maestro Request ID field to Approval Log format
- **File:** `skills/eama-session-memory/references/record-keeping-formats.md`
- **Lines:** Approval Log section (find by searching for `APPROVAL-` or `Request ID:`)
- **Priority:** P3
- **Depends on:** None (additive change — existing fields untouched)
- **Current:** The Approval Log format specifies these fields: Request ID, From, Timestamp, Operation, Risk Level, Decision, Approved By, Justification, Conditions, Outcome. There is no field for linking to AI Maestro's GovernanceRequest system when an operation falls under governance scope.
- **Change:** Add one optional field to the Approval Log format entry example, after the `Outcome` field:
  ```
  - **AI Maestro Request ID**: <governance-request-uuid>  (optional — only for governance-scoped operations: agent CRUD, team membership changes, cross-host operations)
  ```
  Add a brief note: "This field is only populated when EAMA submits a GovernanceRequest via the `team-governance` skill for governance-scoped operations. It is omitted for routine ECOS operational approvals."
- **Verify:** Open the file after editing. Confirm the `AI Maestro Request ID` optional field appears in the Approval Log format. Confirm all existing fields (Request ID through Outcome) are unchanged. Confirm the immutability principle note is unchanged.
- **Harmonization note:** This is a strictly additive change. The three approval paths (autonomous, user escalation, denial), the immutability principle, and all existing record fields are preserved exactly.

### TODO-A17: Add conditional GovernanceRequest step to approval-response-workflow
- **File:** `skills/eama-ecos-coordination/references/approval-response-workflow.md`
- **Lines:** Step 4 ("Record decision in state tracking") — find by searching for "Record decision"
- **Priority:** P3
- **Depends on:** TODO-A16 (the optional field must exist in the log format before this step can reference it)
- **Current:** Step 4 of the approval response workflow records EAMA's decision in internal state tracking (EAMA state file + audit log). There is no integration with AI Maestro's GovernanceRequest system for governance-scoped operations (agent CRUD, team assignment, cross-host operations).
- **Change:** Within Step 4, add a conditional sub-step after the existing "Log for audit trail" bullet:
  ```
  - **If the approved operation is governance-scoped** (agent creation/deletion, team membership change, cross-host operation, plugin installation granting new capabilities):
    Follow the `team-governance` skill to submit a GovernanceRequest:
    `POST /api/v1/governance/requests` with `type`, `requestedBy` (EAMA's agentId), and `payload` describing the operation.
    The `team-governance` skill will return a `governance-request-uuid`.
    Store this UUID in the approval log entry as the `AI Maestro Request ID` field (see record-keeping-formats.md).
  ```
  The rest of Step 4 and all other steps remain unchanged.
- **Verify:** Open the file after editing. Confirm the new conditional sub-step is present inside Step 4. Confirm it is clearly conditional ("If the approved operation is governance-scoped"). Confirm it references the `team-governance` skill (not a raw curl call). Confirm all other steps in the workflow are unchanged.
- **Harmonization note:** This change is ADDITIVE ONLY. The three-path approval decision logic (autonomous/user/denial), the decision communication to ECOS, and the base approval log writing are all unchanged. The new step only fires for governance-scoped operations, after EAMA has already made and recorded its own decision.

---

## Change Summary Table

| TODO | File (relative to plugin root) | Lines | Priority | Type | Status |
|------|-------------------------------|-------|----------|------|--------|
| A1 | `docs/TEAM_REGISTRY_SPECIFICATION.md` | ~252–281 | P1 | LOCAL_REGISTRY | Pending |
| A2 | `skills/eama-ecos-coordination/references/spawn-failure-recovery.md` | ~196–201 | P2 | CLI_SYNTAX | Pending |
| A3 | `skills/eama-ecos-coordination/references/spawn-failure-recovery.md` | ~333–337 | P2 | CLI_SYNTAX | Pending |
| A4 | `skills/eama-ecos-coordination/references/spawn-failure-recovery.md` | ~172–175 | P2 | INCONSISTENCY | Pending |
| A5 | `skills/eama-ecos-coordination/references/workflow-examples.md` | ~197–204 | P2 | CLI_SYNTAX | Pending |
| A6 | `skills/eama-ecos-coordination/references/workflow-examples.md` | ~477 | P2 | CLI_SYNTAX | Pending |
| A7 | `skills/eama-ecos-coordination/references/creating-ecos-procedure.md` | ~108–136, ~232, ~239 | P2 | CLI_SYNTAX | Pending |
| A8 | `skills/eama-github-routing/references/proactive-kanban-monitoring.md` | ~56–97 | P2 | CLI_SYNTAX | Pending |
| A9 | `skills/eama-approval-workflows/SKILL.md` | 209–217 | P2 | LOCAL_REGISTRY + CLI_SYNTAX | Pending |
| A10 | `skills/eama-status-reporting/SKILL.md` | 31, 54, 57, 111–124 | P2 | HARDCODED_AMP + HARDCODED_GOVERNANCE | Pending |
| A11 | `skills/eama-role-routing/SKILL.md` | 182–186, 53–62 | P2 | HARDCODED_GOVERNANCE + LOCAL_REGISTRY | Pending |
| A12 | `commands/eama-approve-plan.md` → `scripts/eama_approve_plan.py` | ~5–15 | P2 | SCRIPT_AUDIT_REQUIRED | Pending |
| A13 | `commands/eama-orchestration-status.md` → `scripts/eama_orchestration_status.py` | ~5–15 | P2 | SCRIPT_AUDIT_REQUIRED | Pending |
| A14 | `skills/eama-github-routing/SKILL.md` | 349–351 | P3 | CLI_SYNTAX | Pending |
| A15 | `skills/eama-session-memory/SKILL.md` | (new section) | P3 | MISSING_SKILL_REF | Pending |
| A16 | `skills/eama-session-memory/references/record-keeping-formats.md` | (Approval Log section) | P3 | HARMONIZATION (additive) | Pending |
| A17 | `skills/eama-ecos-coordination/references/approval-response-workflow.md` | (Step 4) | P3 | HARMONIZATION (additive) | Pending |

**Note**: Violations #11 and #12 are grouped into TODO-A9 (same file, same fix). Violations #14 and #15 are grouped into TODO-A11 (same file, same fix). Violations #16 and #17 are grouped into TODO-A10 (same file, same fix). This reduces 18 violations to 17 fix TODOs, plus 2 harmonization TODOs = 17 total actionable items.

---

*Generated from: consolidated-AMAMA-violations-2026-02-27.md*
*Plugin root: /Users/emanuelesabetta/Code/SKILL_FACTORY/OUTPUT_SKILLS/emasoft-assistant-manager-agent*
*Date: 2026-02-27*
