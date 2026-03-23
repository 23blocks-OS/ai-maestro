# TODO: AMCOS Plugin — Plugin Abstraction Principle Harmonization Changes

**Generated:** 2026-02-27
**Based on:** `consolidated-AMCOS-violations-2026-02-27.md` (191 violations) + `consolidated-AMCOS-violations-part1.md`
**Standard:** Plugin Abstraction Principle (`docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`)
**Plugin root assumed:** `ai-maestro-chief-of-staff/` (paths below are relative to this root)

---

## BEFORE STARTING: Internal Consistency Bugs to Fix First

Three functional bugs discovered during the audit MUST be resolved before any abstraction work,
because they affect runtime correctness regardless of abstraction compliance.

---

### TODO-PRE1: Fix EAMA recipient name inconsistency
- **Files:** `commands/amcos-request-approval.md`, `agents/amcos-approval-coordinator.md`, `skills/amcos-failure-recovery/references/agent-replacement-protocol.md`, `skills/amcos-failure-recovery/references/examples.md`, `skills/amcos-failure-recovery/references/op-replace-agent.md`, `skills/amcos-permission-management/references/approval-workflow-engine.md`, `skills/amcos-permission-management/references/op-request-approval.md`
- **Lines:** Various — every occurrence of `eama-assistant-manager` or `eama-main`
- **Priority:** P1
- **Depends on:** None
- **Current:** Seven files disagree on the EAMA agent name. Four files use `eama-assistant-manager`; three files (approval-workflow-engine.md, op-request-approval.md, op-handle-approval-timeout.md) use `eama-main`. Messages sent to the wrong name will never be received.
- **Change:** Define one configurable constant `EAMA_SESSION_NAME` (or equivalent environment variable). Replace every hardcoded occurrence of both `eama-assistant-manager` and `eama-main` with a reference to this constant. Document the constant in the plugin's top-level README or a shared config file.
- **Verify:** Search for `eama-assistant-manager` and `eama-main` across all AMCOS files; zero literal occurrences should remain after replacement.
- **Harmonization note:** The EAMA agent itself defines its own canonical session name; the constant should read from that, not hardcode a value.

---

### TODO-PRE2: Unify approval type code schema
- **Files:** `skills/amcos-permission-management/references/approval-workflow-engine.md`, `skills/amcos-permission-management/references/approval-escalation.md`, `skills/amcos-permission-management/references/op-request-approval.md`, any file containing `agent_spawn`, `agent_terminate`, `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install`
- **Lines:** Various
- **Priority:** P1
- **Depends on:** None
- **Current:** Two incompatible approval type code schemas co-exist. Schema A (used in `approval-types-detailed.md`, `op-request-approval.md`): `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install`. Schema B (used in `approval-workflow-engine.md`): `agent_spawn`, `agent_terminate`, `agent_replace`, `plugin_install`, `critical_operation`. A request created in Schema A cannot be processed by code using Schema B.
- **Change:** Choose one unified schema — recommended: AMCOS-namespaced prefix (`amcos.spawn`, `amcos.terminate`, `amcos.hibernate`, `amcos.wake`, `amcos.plugin_install`, `amcos.replace`, `amcos.critical`). Update all files to use only this unified schema. Define it canonically in one document (e.g., `docs/APPROVAL_TYPES.md`) and reference it everywhere else.
- **Verify:** Search for `agent_spawn`, `agent_terminate`, `"spawn"`, `"terminate"` type codes; confirm all occurrences use the single chosen namespace.
- **Harmonization note:** AMCOS type codes are distinct from AI Maestro's GovernanceRequest type codes. The namespacing (`amcos.` prefix) makes this explicit.

---

### TODO-PRE3: Resolve recovery log path and format inconsistency
- **Files:** `skills/amcos-failure-recovery/references/recovery-operations.md` (line 358), `skills/amcos-failure-recovery/references/recovery-strategies.md` (line 79)
- **Lines:** recovery-operations.md:358, recovery-strategies.md:79
- **Priority:** P1
- **Depends on:** None
- **Current:** Two files use different paths AND different formats for the same recovery log. `recovery-operations.md` uses `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` (JSON object format). `recovery-strategies.md` uses `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` (newline-delimited JSON). Data written by one file cannot be read by the other.
- **Change:** Canonicalize to `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` (JSONL format preferred for append-only logs). Update `recovery-operations.md` line 358 and all associated read/write logic to use this path and format. Remove the old `thoughts/shared/recovery-log.json` path reference entirely.
- **Verify:** Search for `recovery-log` across all files; confirm only one path remains. Confirm `.jsonl` format is used.
- **Harmonization note:** RK-11 (recovery-operations.md) and RK-13 (recovery-strategies.md) are both PRESERVE items — they track the same data. After harmonization, treat the single canonical path as the PRESERVE item.

---

### TODO-PRE4: Resolve approval timeout policy contradiction
- **Files:** `skills/amcos-permission-management/references/approval-escalation.md`, `skills/amcos-permission-management/references/approval-workflow-engine.md`
- **Lines:** approval-escalation.md (policy table), approval-workflow-engine.md (auto-reject table)
- **Priority:** P1
- **Depends on:** TODO-PRE2
- **Current:** `approval-escalation.md` says `spawn` → PROCEED on timeout. `approval-workflow-engine.md` says `agent_spawn` → Auto-reject on timeout. These are contradictory policies for the same operation under different schema names.
- **Change:** After unifying the schema (TODO-PRE2), unify the timeout policy in one canonical document. Create or designate a single `docs/APPROVAL_POLICY.md` (or section in an existing doc) as the authoritative timeout-policy source. Both `approval-escalation.md` and `approval-workflow-engine.md` must reference it rather than declaring their own policies.
- **Verify:** Remove duplicate policy tables. Confirm only one file declares the timeout policy per operation type.
- **Harmonization note:** The timeout policy itself is a PRESERVE item (RK values) — the goal is consolidation, not removal.

---

## GROUP 1: Top-Level Command Files — Governance API Abstraction

*All violations in `commands/` where direct API calls or governance structures are embedded.*

---

### TODO-C1: Replace hardcoded governance API calls in amcos-request-approval.md
- **File:** `commands/amcos-request-approval.md`
- **Lines:** 10, 23–24, 59–61, 87–129, 156–161
- **Priority:** P1
- **Depends on:** TODO-PRE1, TODO-PRE2; also depends on `team-governance` global skill gaining PATCH support (see note)
- **Current:** Lines 10/23–24 embed `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` directly in usage instructions. Lines 29–40 hardcode a full operation→approver→password approval matrix. Lines 59–61 embed `REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"` ID-generation bash. Lines 87–129 embed two full GovernanceRequest JSON schemas. Lines 156–161 hardcode HTTP 429, Retry-After header, 10 req/min rate-limit details.
- **Change:** (a) Replace all direct API path references with "Use the `team-governance` skill to submit a GovernanceRequest". (b) Remove the approval matrix table; replace with "The `team-governance` skill determines approval routing based on operation type and agent roles at runtime." (c) Remove the ID-generation bash; reference `team-governance` skill for ID generation. (d) Replace JSON schema blocks with a prose reference to the `team-governance` skill's payload-fields documentation. (e) Replace rate-limit details with "See `team-governance` skill for rate-limit guidance."
- **Verify:** No occurrences of `/api/v1/governance/requests`, `openssl rand`, `Retry-After`, or full JSON blocks remain in this file. The AMCOS-internal YAML state tracking steps (write to `approval-state.yaml`, log via `amcos_team_registry.py`) must be preserved — do not remove them.
- **Harmonization note:** The AMCOS request correlation ID format `AMCOS-YYYYMMDDHHMMSS-XXXXXXXX` (PRESERVE item in Appendix) is distinct from the GovernanceRequest `GR-*` ID returned by the API. Both must exist: AMCOS ID is created locally; GovernanceRequest ID is returned by the skill call and stored in `approval-state.yaml`.

---

### TODO-C2: Remove hardcoded allowed_agents and transfer endpoint in amcos-transfer-agent.md
- **File:** `commands/amcos-transfer-agent.md`
- **Lines:** 4–6 (YAML frontmatter), 28
- **Priority:** P1
- **Depends on:** None
- **Current:** YAML frontmatter contains `allowed_agents: [amcos-chief-of-staff, amcos-team-manager]` which hardcodes role-based access control. Line 28 embeds `POST /api/governance/transfers/` (missing the `/v1/` prefix, inconsistent with all other files that use `/api/v1/`).
- **Change:** Remove `allowed_agents` from frontmatter entirely; the `team-governance` skill handles role checks at runtime. Replace line 28 API path reference with "Use the `team-governance` skill transfer workflow to initiate a transfer request." Add a note that the skill resolves the correct endpoint path.
- **Verify:** YAML frontmatter contains no `allowed_agents` key. No raw HTTP path appears in the command body for the transfer endpoint.
- **Harmonization note:** None — this is a clean abstraction case with no PRESERVE items in these lines.

---

### TODO-C3: Replace hardcoded API paths in amcos-check-approval-status.md
- **File:** `commands/amcos-check-approval-status.md`
- **Lines:** 140–145
- **Priority:** P2
- **Depends on:** None
- **Current:** Hardcodes approval storage paths: `~/.aimaestro/approvals/pending/`, `/approved/`, `/rejected/`, `/expired/` for approval status query.
- **Change:** Replace filesystem path references with "Use the `team-governance` skill to query GovernanceRequest status by request ID." The AMCOS-internal `approval-state.yaml` lookup (for AMCOS-local fields like escalation_count) may remain alongside the skill call.
- **Verify:** No `~/.aimaestro/approvals/` path references remain in this file.
- **Harmonization note:** The status value table (7 states: pending/approved/rejected/deferred/expired/completed/cancelled) is a PRESERVE item. Keep the table; only remove the directory path references.

---

### TODO-C4: Remove CLI syntax from amcos-validate-skills.md
- **File:** `commands/amcos-validate-skills.md`
- **Lines:** 6 (YAML frontmatter), 17–20, 58, 64
- **Priority:** P2
- **Depends on:** None
- **Current:** YAML frontmatter embeds `allowed-tools: ["Bash(uv run --with pyyaml python:*)"]`. Body at lines 17–20, 58, 64 embeds `uv run --with pyyaml python scripts/validate_plugin.py` and `validate_skill.py` invocations.
- **Change:** Remove `allowed-tools` from frontmatter (CLI syntax does not belong in frontmatter). Replace validation script invocations with "Refer to the `cpv-validate-plugin` skill or `claude-plugins-validation` skill for the current validation command syntax."
- **Verify:** No `uv run`, `allowed-tools`, or direct Python script invocations remain in this file.
- **Harmonization note:** None.

---

### TODO-C5: Remove hardcoded AMP format and API path from amcos-notify-manager.md
- **File:** `commands/amcos-notify-manager.md`
- **Lines:** 137–145, 187–189
- **Priority:** P2
- **Depends on:** None
- **Current:** Lines 137–145 embed a `notification_ack` JSON response format without an `agent-messaging` skill disclaimer. Lines 187–189 hardcode `~/.aimaestro/outbox/` path, 5-minute retry interval, and 24-hour expiry.
- **Change:** Add an `agent-messaging` skill reference before the ACK format (or move the format into the `agent-messaging` skill docs and reference it here). Replace outbox path and retry/expiry values with a reference to the `agent-messaging` skill's outbox/retry behavior documentation.
- **Verify:** No raw outbox path or retry interval values remain without a skill reference. The 8 notification types taxonomy and rate-limiting rules (PRESERVE items) are not removed.
- **Harmonization note:** The 8 notification types (`status_update`, `issue_report`, `alert`, etc.) and rate limits (max 1 status/hr per topic) are AMCOS-internal policy PRESERVE items — keep them, only add skill references for the protocol-level details.

---

### TODO-C6: Replace hardcoded recovery signal instruction in amcos-recovery-workflow.md
- **File:** `commands/amcos-recovery-workflow.md`
- **Lines:** Step 2
- **Priority:** P2
- **Depends on:** None
- **Current:** "Send SIGTERM to Claude Code process (graceful stop)" — a direct process signal instruction embedded as a workflow step.
- **Change:** Replace with "Use the `ai-maestro-agents-management` skill for graceful agent stop."
- **Verify:** No direct process signal (`SIGTERM`, `kill`, `pkill`) instructions remain as steps.
- **Harmonization note:** None.

---

## GROUP 2: Top-Level Agent Files — Governance and API Abstraction

---

### TODO-C7: Replace governance API calls and duplicated policy in amcos-approval-coordinator.md
- **File:** `agents/amcos-approval-coordinator.md`
- **Lines:** 16, 22–23, 42–47, 55–71, 75–89, 100, 105
- **Priority:** P1
- **Depends on:** TODO-PRE1, TODO-C1
- **Current:** Lines 16/100/105 embed `POST /api/v1/governance/requests` and `GET` references in the agent's identity statement and operational steps. Lines 22–23 re-declare the no-self-approval policy and governance password requirement (duplicates `team-governance` skill). Lines 42–47 embed the GovernanceRequest state machine (`pending → local-approved → dual-approved → executed`), duplicating the skill. Lines 55–71 embed a full GovernanceRequest JSON template. Lines 75–89 embed an "API-First Authority Model" section with additional endpoint references.
- **Change:** Replace all direct API path references with `team-governance` skill references. Replace the embedded state machine description with "See `team-governance` skill for the GovernanceRequest lifecycle." Replace the JSON template with "Refer to `team-governance` skill for payload field definitions." Replace the policy re-declaration with "See `team-governance` skill for the no-self-approval and password constraints." Keep the agent's approval-tracking logic and AMCOS-internal coordination steps.
- **Verify:** No `/api/v1/governance/requests` URLs remain. No GovernanceRequest JSON schemas remain inline.
- **Harmonization note:** The agent's own approval-tracking state and coordination role are AMCOS-specific and must be preserved. Only remove the duplicated governance policy content and direct API calls.

---

### TODO-C8: Replace hardcoded GET /api/teams references in agent files
- **Files:** `agents/amcos-chief-of-staff-main-agent.md` (line 58), `agents/amcos-team-coordinator.md` (key constraints section)
- **Lines:** chief-of-staff-main-agent.md:58; team-coordinator.md:key constraints
- **Priority:** P2
- **Depends on:** None
- **Current:** `agents/amcos-chief-of-staff-main-agent.md` line 58 references `GET /api/teams` for recipient validation. `agents/amcos-team-coordinator.md` hardcodes `GET /api/teams/{id}/agents` in the key constraints section.
- **Change:** Replace both raw API path references with "Use the `ai-maestro-agents-management` skill to query team membership."
- **Verify:** No `GET /api/teams` or `GET /api/teams/{id}/agents` raw paths remain in either file.
- **Harmonization note:** None.

---

### TODO-C9: Replace hardcoded agent session names in amcos-replace-agent.md
- **File:** `commands/amcos-replace-agent.md`
- **Lines:** 107, 128
- **Priority:** P3
- **Depends on:** TODO-PRE1
- **Current:** Hardcoded recipient session names `eama-assistant-manager` and `eoa-orchestrator` used directly in message-send steps.
- **Change:** After TODO-PRE1 resolves the EAMA name, update these references to use the configurable `EAMA_SESSION_NAME` constant. For `eoa-orchestrator`, consider using the `ai-maestro-agents-management` skill to resolve the current orchestrator agent dynamically, or document this as a configurable constant.
- **Verify:** No literal `eama-assistant-manager` or `eoa-orchestrator` remain as fixed strings.
- **Harmonization note:** Dynamic lookup is preferable; if a constant is used, it should be in the plugin's shared config, not inline.

---

### TODO-C10: Replace CLI syntax in shared/onboarding_checklist.md
- **File:** `shared/onboarding_checklist.md`
- **Lines:** 63–65
- **Priority:** P3
- **Depends on:** None
- **Current:** `claude --session "${SESSION_NAME}" --project "${PROJECT_DIR}" --plugin-dir "${PLUGIN_PATH}"` embedded as a checklist step.
- **Change:** Replace with "Use the `ai-maestro-agents-management` skill to create a new agent session."
- **Verify:** No direct `claude` CLI invocation with session/project flags remains.
- **Harmonization note:** None.

---

## GROUP 3: Agent Lifecycle References — amcos_team_registry.py CLI Syntax

*All violations where `amcos_team_registry.py` subcommand syntax is embedded in procedure files. These are CLI_SYNTAX violations — the fix is adding a `--help` deferral note, or creating a stable `amcos-registry.sh` wrapper that is documented as the canonical interface.*

---

### TODO-C11: Add --help deferral or stable wrapper for amcos_team_registry.py in lifecycle op files
- **Files:** `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` (Steps 5–6), `skills/amcos-agent-lifecycle/references/op-spawn-agent.md` (Step 5 + examples), `skills/amcos-agent-lifecycle/references/op-terminate-agent.md` (Steps 5, 7 + examples), `skills/amcos-agent-lifecycle/references/op-wake-agent.md` (Steps 1, 2, 6, 7 + examples), `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` (all Steps 2a–2d, 3, 4 + examples), `skills/amcos-agent-lifecycle/references/workflow-checklists.md` (Forming Team + Updating Registry sections)
- **Lines:** Various in each file — all procedure steps that invoke `amcos_team_registry.py` subcommands
- **Priority:** P2
- **Depends on:** None (optional improvement: create `amcos-registry.sh` wrapper first, then this becomes trivial)
- **Current:** All six files embed `amcos_team_registry.py` subcommand syntax directly (`add-agent`, `remove-agent`, `update-status`, `log`, `list`, `publish`, `create`). The argument interface is unstable — flag inconsistencies exist within the same script (`--name` vs `--agent` in different files). Any CLI change to the script silently breaks all these procedures.
- **Change:** Two options — choose one: (A) Above each invocation, add the comment `# Run: uv run python scripts/amcos_team_registry.py --help for current argument syntax` and a note "exact flags may vary — verify with --help before running". (B) Create `scripts/amcos-registry.sh` as a stable wrapper with a documented, stable argument interface; update all six files to call the wrapper instead.  Option B is preferred if any CLI changes to the underlying script are planned.
- **Verify:** Procedure steps no longer present invocation syntax as definitive. If option B: wrapper script exists with documented interface.
- **Harmonization note:** The operations themselves (spawn, hibernate, wake, terminate, update-status, log) are all PRESERVE actions — only the CLI syntax coupling needs to change, not the operations. `op-update-team-registry.md` is the highest blast-radius file (entire file depends on this script).

---

### TODO-C12: Add --help deferral for amcos_team_registry.py in onboarding reference files
- **Files:** `skills/amcos-onboarding/references/op-conduct-project-handoff.md` (lines 110–115, 182–188), `skills/amcos-onboarding/references/op-deliver-role-briefing.md` (lines 96–105), `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` (lines 111–115, 183–188), `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` (lines 87–91)
- **Lines:** As noted above
- **Priority:** P3
- **Depends on:** TODO-C11 (should use same wrapper/approach decided there)
- **Current:** Four files embed `amcos_team_registry.py log ...` and `update-role ...` subcommand syntax with specific flags, without noting that the CLI interface may change.
- **Change:** Apply the same approach chosen in TODO-C11 (--help deferral comment or wrapper reference) to all four files.
- **Verify:** No procedure step presents a `amcos_team_registry.py` invocation as a definitive, exact command without a deferral note.
- **Harmonization note:** Same as TODO-C11 — operations are PRESERVE, only CLI syntax coupling changes.

---

### TODO-C13: Add --help deferral for amcos_team_registry.py in send-maestro-message op file
- **File:** `skills/amcos-agent-lifecycle/references/op-send-maestro-message.md`
- **Lines:** Team Broadcast example
- **Priority:** P3
- **Depends on:** TODO-C11
- **Current:** `AGENTS=$(uv run python scripts/amcos_team_registry.py list --filter-status running --names-only)` embedded in Team Broadcast example; should use `ai-maestro-agents-management` skill for agent listing.
- **Change:** Replace the `amcos_team_registry.py list` call in the example with a reference to the `ai-maestro-agents-management` skill for listing running agents. Keep the broadcast pattern itself.
- **Verify:** No direct `amcos_team_registry.py` call remains in this file.
- **Harmonization note:** None.

---

### TODO-C14: Consolidate inconsistent hibernation storage paths
- **Files:** `skills/amcos-agent-lifecycle/references/hibernation-procedures.md`, `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md`, `skills/amcos-agent-lifecycle/references/success-criteria.md`, `skills/amcos-agent-lifecycle/references/workflow-checklists.md`
- **Lines:** All occurrences of hibernation storage paths in each file
- **Priority:** P2
- **Depends on:** TODO-PRE3 (path harmonization approach)
- **Current:** Four different paths exist for hibernation state storage across four files: `design/memory/agents/<agent-id>/hibernate/` (hibernation-procedures.md), `~/.ai-maestro/agent-states/` (op-hibernate-agent.md), `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json` (success-criteria.md), `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/` (workflow-checklists.md). Note: `.ai-maestro/` (with hyphen) vs `.aimaestro/` (no hyphen) is also inconsistent.
- **Change:** Choose one canonical hibernation storage path (consult AI Maestro documentation for the correct base directory — likely `~/.aimaestro/` without hyphen based on main project convention). Update all four files to use this single path. Document as a PRESERVE item with a canonical location comment.
- **Verify:** Search for `agent-states`, `hibernated-agents`, `hibernate/` path suffixes; all should resolve to the same canonical directory.
- **Harmonization note:** The hibernation state itself is a PRESERVE item. The goal is path harmonization, not removal.

---

### TODO-C15: Fix incorrect directory name in onboarding handoff file
- **File:** `skills/amcos-onboarding/references/op-conduct-project-handoff.md`
- **Lines:** 151
- **Priority:** P3
- **Depends on:** TODO-C14 (follow same path canonicalization)
- **Current:** `~/.ai-maestro/agent-states/[agent-name]-emergency.json` uses `~/.ai-maestro/` (with hyphen) which is inconsistent with the main project convention of `~/.aimaestro/` (no hyphen).
- **Change:** Correct to `~/.aimaestro/agent-states/` — or replace entirely with an `ai-maestro-agents-management` skill state-dump request reference.
- **Verify:** No `~/.ai-maestro/` (with hyphen) paths remain in this file.
- **Harmonization note:** None.

---

### TODO-C16: Remove or annotate curl verification calls in lifecycle operations
- **Files:** `skills/amcos-agent-lifecycle/references/success-criteria.md` (lines 47, 72, 132, 156–159, 223–226), `skills/amcos-agent-lifecycle/references/workflow-checklists.md` (lines with curl for verify-after-create, before-update, pre-update snapshot), `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` (error handling table), `skills/amcos-agent-lifecycle/references/op-spawn-agent.md` (prerequisites), `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` (prerequisites + step 5)
- **Lines:** As noted above
- **Priority:** P3
- **Depends on:** None
- **Current:** Multiple files use `curl "$AIMAESTRO_API/api/..."` for verification steps after lifecycle operations. All use `$AIMAESTRO_API` env var correctly, but still embed raw curl in agent-facing procedures.
- **Change:** Replace each raw `curl "$AIMAESTRO_API/api/..."` verification call with "Use the `ai-maestro-agents-management` skill health-check or show-agent operation to verify."
- **Verify:** No raw `curl "$AIMAESTRO_API` patterns remain in lifecycle reference files.
- **Harmonization note:** The verification steps themselves should be preserved — only the curl mechanism changes.

---

### TODO-C17: Remove MAX_AGENTS hardcoded capacity limit in op-wake-agent.md
- **File:** `skills/amcos-agent-lifecycle/references/op-wake-agent.md`
- **Lines:** Step 2 bash block
- **Priority:** P2
- **Depends on:** None
- **Current:** `MAX_AGENTS=5` is hardcoded directly in a bash block as a capacity check. Governance constraints must be discovered at runtime, not hardcoded in procedure files.
- **Change:** Remove the hardcoded `MAX_AGENTS=5` value. Replace with: "Check current agent capacity limit via the `team-governance` skill or AI Maestro instance monitoring settings before waking."
- **Verify:** No `MAX_AGENTS=` assignment remains in the file.
- **Harmonization note:** The session limits concept (conservative 10, normal 15, max 20 per `amcos-resource-monitoring/SKILL.md`) and this `MAX_AGENTS=5` conflict — both should ultimately be resolved against the runtime governance configuration.

---

### TODO-C18: Replace pseudocode API fabrications in lifecycle procedures
- **Files:** `skills/amcos-agent-lifecycle/references/hibernation-procedures.md` (Section 1.3.3, 1.6), `skills/amcos-agent-lifecycle/references/spawn-procedures.md` (Sections 1.3.3, 1.6), `skills/amcos-agent-lifecycle/references/termination-procedures.md` (Section 2.6)
- **Lines:** Each file's pseudocode example blocks
- **Priority:** P3
- **Depends on:** None
- **Current:** Three files contain Python pseudocode with fabricated function names that do not correspond to any real API or skill syntax: `send_message()`, `update_registry()`, `get_agent_status()`, `spawn_agent_with_state()`, `await_agent_ready()`, `send_termination_request()`, etc. These create false expectations about available APIs. `Task()` constructor in spawn-procedures.md also does not match real skill syntax.
- **Change:** Remove or clearly label all pseudocode blocks as "Conceptual illustration only — not executable syntax." Add a note below each block: "For actual implementation, use the `ai-maestro-agents-management` skill (for agent operations) and the `agent-messaging` skill (for messaging)."
- **Verify:** No pseudocode blocks remain without a "Conceptual illustration" label.
- **Harmonization note:** None.

---

## GROUP 4: Failure Recovery — tmux/API/Governance Abstraction

---

### TODO-C19: Replace all direct tmux and system commands in recovery-operations.md
- **File:** `skills/amcos-failure-recovery/references/recovery-operations.md`
- **Lines:** 59–61, 73–74, 105–106, 275–281
- **Priority:** P1
- **Depends on:** None
- **Current:** Lines 59–61: `tmux has-session -t <agent-name>` for session existence check. Lines 73–74: `tmux list-panes -t <agent-name> -F '#{pane_pid}'` for PID lookup. Lines 105–106: `ping -c 3 <host-ip>` for network connectivity. Lines 275–281: `PID=$(tmux list-panes...) kill TERM` for graceful process stop. These are the highest-severity HARDCODED_API violations (9 instances total in this file).
- **Change:** Replace each command with its `ai-maestro-agents-management` skill equivalent: session existence check → skill session-existence query; PID lookup → skill agent-status check; ping → skill health-check; graceful stop → skill graceful-stop operation.
- **Verify:** No `tmux`, `ping`, or direct `kill`/`SIGTERM` commands remain in procedure steps (as distinct from diagnostic-only comments clearly labelled as local-only fallbacks).
- **Harmonization note:** The recovery log schema (RK-11) and recovery policy structure (RK-12) in this file are PRESERVE items — do not remove them, only remove the bash execution commands.

---

### TODO-C20: Replace direct filesystem operations in recovery-operations.md (policy + log reads)
- **File:** `skills/amcos-failure-recovery/references/recovery-operations.md`
- **Lines:** 252, 312, 318–330, 358
- **Priority:** P2
- **Depends on:** TODO-PRE3 (path must be canonical before documenting as PRESERVE)
- **Current:** Line 252: `cat $CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` direct file read. Line 312: recovery policy path hardcoded inline. Lines 318–330: policy JSON with governance defaults embedded inline (`auto_replace_on_terminal: false`, etc.). Line 358: recovery log write to wrong path (pre-harmonization).
- **Change:** After TODO-PRE3 canonicalizes the recovery log path: (a) For the policy read, replace direct `cat` with a comment noting the policy file location as a documented PRESERVE constant, and add a sentence: "Access via the plugin's recovery policy read pattern." (b) Move the inline policy JSON block to a single canonical location in the plugin (e.g., `docs/RECOVERY_POLICY_DEFAULT.json`) and reference it from this file. (c) Update line 358 to use the harmonized path from TODO-PRE3.
- **Verify:** No `cat ... recovery-policy.json` or `thoughts/shared/` path references remain as live procedure steps. Policy JSON is in one canonical location only.
- **Harmonization note:** RK-11 (recovery log) and RK-12 (recovery policy) are PRESERVE items — the data structures must be preserved, only the access method changes.

---

### TODO-C21: Replace hardcoded tmux and file ops in recovery-strategies.md
- **File:** `skills/amcos-failure-recovery/references/recovery-strategies.md`
- **Lines:** 79 (after TODO-PRE3 path fix), additional tmux references
- **Priority:** P2
- **Depends on:** TODO-PRE3, TODO-C19
- **Current:** Direct `tmux has-session -t <agent-name>` for hibernate check. Direct file path reference for log writes to `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl`. Manager-approval-required hardcoded as recovery prerequisite.
- **Change:** Replace tmux check with `ai-maestro-agents-management` skill session-existence check. The recovery log path (now canonical after TODO-PRE3) becomes a documented PRESERVE reference point — add a comment "Canonical PRESERVE path: see recovery-log harmonization." Replace "Manager approves replacement" prerequisite with a reference to the `team-governance` skill approval workflow.
- **Verify:** No direct `tmux` commands in procedure steps. Path aligns with canonical path from TODO-PRE3.
- **Harmonization note:** RK-13 (recovery log) is a PRESERVE item after path harmonization.

---

### TODO-C22: Replace hardcoded governance approvals in agent-replacement-protocol.md and op-replace-agent.md
- **Files:** `skills/amcos-failure-recovery/references/agent-replacement-protocol.md`, `skills/amcos-failure-recovery/references/op-replace-agent.md`
- **Lines:** Various approval requirement statements, AMP envelope blocks
- **Priority:** P1
- **Depends on:** TODO-PRE1, TODO-C1
- **Current:** `agent-replacement-protocol.md` hardcodes: "Request Manager Approval from `eama-assistant-manager`", "Wait for approval (max 15 minutes)", "CRITICAL: Never proceed without manager approval", "The replacement agent has NO MEMORY of the old agent." Also contains three full JSON AMP envelopes to `eoa-orchestrator`, `eama-assistant-manager`, and new agent. `op-replace-agent.md` repeats the approval requirement and three prose-format message specs with AMP field structure.
- **Change:** Keep the "approval required" marker as a one-line note only. Replace all approval workflow details with "Use the `team-governance` skill to submit a replacement approval request. Use the `agent-messaging` skill to notify the orchestrator and new agent." Remove full JSON envelope blocks; replace with "See `agent-messaging` skill for message payload structure."
- **Verify:** No full JSON AMP envelopes remain in these files. The approval-required constraint is still noted (as a single sentence), not removed.
- **Harmonization note:** The "CRITICAL: Never proceed without manager approval" is a governance rule — preserve it as a one-line constraint note. The detailed approval workflow logic belongs in the skill, not the reference file.

---

### TODO-C23: Replace hardcoded filesystem operations and AMP envelope in op-emergency-handoff.md
- **File:** `skills/amcos-failure-recovery/references/op-emergency-handoff.md`
- **Lines:** 53–54, 74–88, 116–118, 129–142
- **Priority:** P1
- **Depends on:** None
- **Current:** Lines 53–54: direct `cat .../task-tracking.json | jq` read. Lines 74–88: full JSON AMP envelope to `eoa-orchestrator` for emergency handoff. Lines 116–118: `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/`. Lines 129–142: full JSON envelope with hardcoded example UUID `EH-20250204-svgbbox-001` (project-specific example).
- **Change:** Lines 53–54: replace with `ai-maestro-agents-management` skill task-state query reference, or add comment noting this is a plugin-internal PRESERVE read (the task-tracking.json state is RK-14). Lines 74–88: replace JSON envelope with "Use `agent-messaging` skill to send emergency handoff notification to the orchestrator." Lines 116–118: document the handoff directory as a PRESERVE constant with a comment, or replace `mkdir` with `agent-messaging` skill handoff-creation reference. Lines 129–142: replace JSON envelope with skill reference; replace the project-specific hardcoded UUID with `<UUID-PLACEHOLDER>` or a generic example pattern.
- **Verify:** No project-specific example UUIDs (like `EH-20250204-svgbbox-001`) remain. No full JSON AMP envelopes remain as procedure steps. RK-14 task-tracking PRESERVE item is still documented.
- **Harmonization note:** `task-tracking.json` is a PRESERVE item (RK-14). The file reading access to it should be documented as an intentional plugin-local read, not removed.

---

### TODO-C24: Replace bash scripts and hardcoded agent names in examples.md
- **File:** `skills/amcos-failure-recovery/references/examples.md`
- **Lines:** Various worked example sections
- **Priority:** P2
- **Depends on:** TODO-C19, TODO-C22
- **Current:** Worked examples embed full bash scripts with tmux, curl, and filesystem operations. Two instances use hardcoded project-specific agent name `libs-svg-svgbbox` (in AMP envelope `to` field and `git log --author` flag).
- **Change:** Replace example bash implementations with prose descriptions of the steps. Replace each bash operation with a reference to the relevant skill (tmux → `ai-maestro-agents-management`, curl → same skill or `team-governance`, message send → `agent-messaging`). Replace the hardcoded agent name `libs-svg-svgbbox` with a generic placeholder `<agent-session-name>`.
- **Verify:** No `libs-svg-svgbbox` or other project-specific agent names remain. No bash scripts with tmux/curl/filesystem commands remain as worked examples.
- **Harmonization note:** None.

---

### TODO-C25: Replace direct file operations and governance in work-handoff-during-failure.md
- **File:** `skills/amcos-failure-recovery/references/work-handoff-during-failure.md`
- **Lines:** Various — 8 instances total including git log/diff commands and jq read-modify-write
- **Priority:** P2
- **Depends on:** None
- **Current:** Direct `jq` read of `task-tracking.json`; `git log --oneline --author="libs-svg-svgbbox"` with hardcoded agent name; `git diff --name-only`; duplicate detection via `git log --oneline --author="failed-agent"`; `git diff` comparison; direct jq read-modify-write of `task-tracking.json` with `temp.json` pattern; hardcoded agent name `libs-svg-svgbbox` in git author flag; `jq '.completed_by = "apps-svgplayer-development (emergency handoff)"'`.
- **Change:** Replace the hardcoded agent names with `<failed-agent-session-name>` and `<receiving-agent-session-name>` placeholders. Replace direct git commands with prose descriptions: "Query the agent's recent git commits to identify in-progress work." Replace the `task-tracking.json` read-modify-write pattern with: "Update task tracking using the plugin's task-state update pattern (see PRESERVE item RK-14/RK-15)." Document the `temp.json` pattern as fragile — recommend using `jq ... > temp.json && mv temp.json original.json` with explicit note about non-atomicity.
- **Verify:** No project-specific agent names (`libs-svg-svgbbox`, `apps-svgplayer-development`) remain. The RK-14 and RK-15 task record fields (`completed_by`, `completed_at`, `status`) are still documented as PRESERVE items.
- **Harmonization note:** RK-14 (task status update pattern) and RK-15 (task record fields) are PRESERVE items. The update must still happen — only the implementation brittleness changes.

---

### TODO-C26: Document troubleshooting commands as optional local-only diagnostics
- **File:** `skills/amcos-failure-recovery/references/troubleshooting.md`
- **Lines:** Various — tmux/ps diagnostic commands, `~/.claude/settings.json` reference, port `23000` reference
- **Priority:** P3
- **Depends on:** None
- **Current:** References `~/.claude/settings.json` as the file to check for hook configuration. References port `23000` as the AI Maestro port to verify. Contains `CRITICAL: Never proceed with replacement without manager approval` as an absolute rule. Diagnostic bash commands for troubleshooting.
- **Change:** Keep diagnostic bash commands but add a label: "Local-only diagnostic fallback — use only when AI Maestro API is unavailable." Replace `~/.claude/settings.json` reference with a note that hook configuration location may vary; refer to AI Maestro documentation. Replace hardcoded port `23000` with `$AIMAESTRO_API` environment variable reference. The "Never proceed without manager approval" CRITICAL marker can remain as a one-line governance note.
- **Verify:** Port `23000` is no longer hardcoded. `~/.claude/settings.json` is not presented as a definitive location. Diagnostic commands are clearly labeled as local-only fallbacks.
- **Harmonization note:** None.

---

## GROUP 5: Notification Protocols — Edge Cases, AMP Templates, Handoff Protocol

---

### TODO-C27: Classify edge-case direct file operations as PRESERVE or replace with skill references
- **File:** `skills/amcos-notification-protocols/references/edge-case-protocols.md`
- **Lines:** 60–61, 68–84, 119–138, 148–151, 157–160, 179–188, 599–600, 679–680, 749–751
- **Priority:** P2
- **Depends on:** None
- **Current:** Multiple categories: (A) Direct log write to `.claude/logs/maestro-failures.log` (PRESERVE item RK-02 — must stay). (B) Fallback queue JSON heredoc to `.claude/handoffs/` (offline queuing — should reference `agent-messaging` skill or be PRESERVE). (C) `gh api rate_limit` GitHub API call (exempt — GitHub CLI is external). (D) GitHub cache writes to `.claude/cache/github/` (PRESERVE RK-03). (E) Handoff file creation via `cat > ".claude/handoffs/..."`. (F) `find .claude/handoffs` search. (G) Session memory `ls`/`cp -r` operations (PRESERVE RK-04).
- **Change:** (A) Keep as-is — document as PRESERVE RK-02 with explicit comment. (B) Replace fallback queue heredoc JSON with `agent-messaging` skill outbox reference; or if this is an offline-only path, mark as PRESERVE with explicit "offline fallback" label. (C) Keep `gh api rate_limit` — add comment "GitHub CLI exempt from PAP". (D) Keep GitHub cache writes — document as PRESERVE RK-03. (E) Replace handoff file creation with `agent-messaging` skill handoff-creation reference. (F) Replace `find .claude/handoffs` with `agent-messaging` skill handoff-lookup reference. (G) Keep session memory operations — document as PRESERVE RK-04.
- **Verify:** PRESERVE items are clearly labelled with their RK reference numbers. Non-PRESERVE items use skill references instead of direct filesystem operations.
- **Harmonization note:** RK-02, RK-03, RK-04 are all PRESERVE items that must stay. This file has the most PRESERVE items of any violation file — be careful not to over-remove.

---

### TODO-C28: Replace failure log path and AMP envelopes in failure-notifications.md
- **File:** `skills/amcos-notification-protocols/references/failure-notifications.md`
- **Lines:** Various (AMP envelope instances, bash function, absolute log path)
- **Priority:** P2
- **Depends on:** None
- **Current:** Three full AMP envelope templates embedded. `capture_error()` bash function with `$()` command substitution embedded. Absolute system path `LOG_FILE="/var/log/chief-of-staff/operations.log"` hardcoded.
- **Change:** Replace AMP envelope templates with references to the `agent-messaging` skill for message payload structure (keep the failure log entry schema as a PRESERVE item — RK-05). Remove the `capture_error()` function definition; replace with a prose description of what to capture. Replace the absolute log path with a configurable variable or a reference to the AMCOS plugin's log configuration.
- **Verify:** No `/var/log/` absolute paths remain. No inline bash function definitions remain. The failure log entry schema (RK-05 fields: `timestamp`, `event_type`, `operation`, `target_agent`, `error`, etc.) is preserved.
- **Harmonization note:** RK-05 (failure log schema) is a PRESERVE item — the schema fields must remain, just not the bash function that writes them.

---

### TODO-C29: Replace AMP envelope and API calls in proactive-handoff-protocol.md
- **File:** `skills/amcos-notification-protocols/references/proactive-handoff-protocol.md`
- **Lines:** Various
- **Priority:** P2
- **Depends on:** None
- **Current:** Direct `cat docs_dev/.uuid-registry.json | jq '.designs | keys'` bash read. Direct `python scripts/amcos_design_search.py` call. Hardcoded relative path for handoff writes (`$CLAUDE_PROJECT_DIR/docs_dev/handoffs/`). AMP envelope for handoff notification. UUID registry at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` referenced directly.
- **Change:** Replace the `cat ... | jq` read with the `ai-maestro-agents-management` skill or a documented PRESERVE read comment (per RK-07). Replace `amcos_design_search.py` call with: "See `amcos-design-search` skill or equivalent — do not invoke Python scripts directly." Replace AMP envelope with `agent-messaging` skill reference. Add explicit PRESERVE comments for UUID registry items (RK-07, RK-08).
- **Verify:** No direct Python script invocations remain. The UUID chain concept and handoff YAML frontmatter schema (RK-07, RK-08) remain documented.
- **Harmonization note:** RK-07 (UUID registry format) and RK-08 (handoff document schema) are PRESERVE items — they define the data structure, not how to access it.

---

### TODO-C30: Replace API calls in design-document-protocol.md
- **File:** `skills/amcos-notification-protocols/references/design-document-protocol.md`
- **Lines:** Various (5 call sites: validation + 4 search modes)
- **Priority:** P3
- **Depends on:** None
- **Current:** Direct `uv run python scripts/amcos_design_validate.py design/` and `amcos_design_search.py` invocations (5 call sites). UUID registry at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` referenced directly via `cat ... | jq`.
- **Change:** Replace script invocations with skill references or `--help` deferral notes (same pattern as TODO-C11). Add PRESERVE comment for UUID registry schema reference (RK-01).
- **Verify:** No direct `amcos_design_validate.py` or `amcos_design_search.py` invocations remain as procedure steps.
- **Harmonization note:** RK-01 (UUID registry schema) is a PRESERVE item.

---

### TODO-C31: Replace amp-send.sh CLI syntax in ai-maestro-message-templates.md
- **File:** `skills/amcos-notification-protocols/references/ai-maestro-message-templates.md`
- **Lines:** Section 1 (base command syntax), Sections 2–6 and 8 (6 full amp-send.sh invocations), Section 1/8 (amp-init.sh + bash iteration)
- **Priority:** P2
- **Depends on:** None
- **Current:** `amp-send.sh --to --subject --priority --type --message` base syntax and 6 full invocations for approval requests, escalations, operation notices, results, EOA notifications, and broadcast loop. Also `amp-init.sh --auto` and `for agent in...done` bash loop.
- **Change:** Replace all `amp-send.sh` and `amp-init.sh` CLI invocations with references to the `agent-messaging` skill. Replace the bash loop pattern with a prose description: "For broadcast to all team members, use the `agent-messaging` skill broadcast operation."
- **Verify:** No `amp-send.sh` or `amp-init.sh` invocations remain as definitive procedure steps.
- **Harmonization note:** The message templates themselves (subjects, priority levels, content descriptions) are AMCOS-internal communication patterns and should be preserved as reference material — only the amp-send.sh CLI coupling needs to change.

---

## GROUP 6: Team Coordination — AMP Schemas and Governance

---

### TODO-C32: Replace embedded AMP content-type schemas in team-messaging.md
- **File:** `skills/amcos-team-coordination/references/team-messaging.md`
- **Lines:** 30–34 (announcement), 47–52 (request), 64–69 (alert), 83–89 (status-update), 100–106 (role-assignment)
- **Priority:** P2
- **Depends on:** None
- **Current:** Five JSON content-type schemas embedded directly, one per message type. These couple the reference file to the AMP protocol's internal type system. If AMP protocol changes, all five schemas become incorrect.
- **Change:** Replace each JSON schema block with a prose description of the message intent and "Use the `agent-messaging` skill for current content type definitions and schema." Keep a brief description of each message type (announcement, request, alert, status-update, role-assignment) as prose.
- **Verify:** No JSON content-type schema blocks remain. Prose descriptions of each message type remain.
- **Harmonization note:** None.

---

### TODO-C33: Replace direct file write and hardcoded roster paths in teammate-awareness.md
- **File:** `skills/amcos-team-coordination/references/teammate-awareness.md`
- **Lines:** Step 5 (direct file write), occurrences of `design/memory/team-roster.md` and `design/memory/team-roster-update.md`
- **Priority:** P2
- **Depends on:** None
- **Current:** Hardcoded path `design/memory/team-roster.md`. "Step 5: Write updated roster to disk" implies a direct file write without skill abstraction. Second hardcoded path `design/memory/team-roster-update.md`. Three instances total.
- **Change:** Replace "Write updated roster to disk" with "Update the team roster using the `ai-maestro-agents-management` skill." Replace hardcoded paths with a reference to the skill for roster management, or document the paths as PRESERVE constants with an explicit comment.
- **Verify:** No direct file write instructions remain in procedure steps. RK-20 (roster format with columns) and RK-21 (team status report template) are preserved.
- **Harmonization note:** RK-20 and RK-21 are PRESERVE items — the roster structure and report template must remain, only the access mechanism changes.

---

### TODO-C34: Replace hardcoded governance constraints in role-assignment.md
- **File:** `skills/amcos-team-coordination/references/role-assignment.md`
- **Lines:** Various — static reporting hierarchy for 3 roles, roster update step
- **Priority:** P3
- **Depends on:** None
- **Current:** `"Reporting to: Code Reviewer, Orchestrator"` in Developer Role; `"Reporting to: Orchestrator, Chief of Staff"` in Code Reviewer Role; `"Reporting to: Chief of Staff"` in DevOps Role — all hardcoded static hierarchies. Roster update written as inline markdown table implying direct file write.
- **Change:** For reporting hierarchies: add a note "Reporting lines are examples; actual hierarchy is determined by team configuration at runtime." For roster update step: replace inline table write with a reference to the `ai-maestro-agents-management` skill for roster updates (as noted in RK-19).
- **Verify:** Reporting hierarchies are labeled as examples, not binding constraints. RK-19 (roster format) is preserved.
- **Harmonization note:** RK-16 (roster update after role assignment) and RK-19 (roster format) are PRESERVE items.

---

## GROUP 7: Permission Management — Approval System Harmonization

*These TODOs implement the harmonized approval flow described in Part 1 of the violations report. The goal is to ADD GovernanceRequest skill integration ALONGSIDE the existing AMCOS internal tracking, not replace it.*

---

### TODO-C35: Harmonize approval-workflow-engine.md — replace curl with team-governance skill references
- **File:** `skills/amcos-permission-management/references/approval-workflow-engine.md`
- **Lines:** Multiple — all `curl` calls to `$AIMAESTRO_API/api/v1/governance/requests` (5+ instances: PATCH approval, PATCH timeout, POST request, GET pending)
- **Priority:** P1
- **Depends on:** TODO-PRE1, TODO-PRE2, TODO-PRE4; also depends on `team-governance` global skill gaining PATCH support
- **Current:** Direct `curl -X POST`, `curl -X PATCH`, `curl -X GET` calls to the governance API endpoint. Also reads autonomous mode config from `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` via direct `jq` reads and writes back via fragile `jq ... > tmp && mv tmp` pattern. Also contains content type string `"approval_request"` and hardcoded EAMA name `eama-main`.
- **Change:** Replace all `curl` governance API calls with "Use the `team-governance` skill to [POST/PATCH/GET] a GovernanceRequest." Keep ALL of: local YAML tracking, escalation state, reminder count management, rollback plan — these are PRESERVE items (RK-22). For the autonomous mode config: move the `jq` read/write pattern to a documented PRESERVE constant with explicit comment noting it is AMCOS-private ephemeral state. The `jq` write with `mv tmp` is acceptable as a PRESERVE mechanism with a stability comment added.
- **Verify:** No direct `curl` calls to governance API remain. The local YAML tracking layer (`approval-state.yaml` equivalent) is still intact. RK-24 (autonomous mode config concept) is preserved.
- **Harmonization note:** See Part 1 report's "Recommended harmonized flow" diagram: CREATE entry in local YAML (preserve) → reference `team-governance` skill for POST (replace curl) → AMCOS tracks escalation locally (preserve) → reference `team-governance` skill for PATCH on decision (replace curl). This is an ADDITIVE change, not a replacement.

---

### TODO-C36: Replace direct curl in op-track-pending-approvals.md with team-governance skill references
- **File:** `skills/amcos-permission-management/references/op-track-pending-approvals.md`
- **Lines:** All procedure steps (GET ?status=pending, POST new request, PATCH $REQUEST_ID, etc.)
- **Priority:** P1
- **Depends on:** TODO-C35, TODO-PRE1
- **Current:** Every procedure step uses direct `curl` to the governance API. Also uses undocumented query parameters (`?status=pending&reminder_sent=false&min_age_seconds=60`) that may not exist in the API. References `check_messages_for_request_id` undefined function. Most pervasive HARDCODED_API violation in permission-management skill.
- **Change:** Replace all `curl` steps with `team-governance` skill references. For `reminder_sent=false&min_age_seconds=60` query params: verify with AI Maestro `team-governance` skill documentation whether these are supported. If not, replace with client-side filtering logic that fetches all pending requests and filters locally. For the undefined `check_messages_for_request_id` function: replace with "Use the `agent-messaging` skill to check for messages matching a given request ID."
- **Verify:** No direct `curl` calls remain. Query parameters are either verified against skill documentation or replaced with client-side filtering.
- **Harmonization note:** RK-22 (local YAML approval tracking) is preserved — this file's changes are about the API call mechanism only.

---

### TODO-C37: Replace direct curl in op-request-approval.md and op-handle-approval-timeout.md
- **Files:** `skills/amcos-permission-management/references/op-request-approval.md`, `skills/amcos-permission-management/references/op-handle-approval-timeout.md`
- **Lines:** op-request-approval.md:Step 5 (POST curl); op-request-approval.md:Step 3 (AMP envelope heredoc); op-handle-approval-timeout.md:Step 1 (GET curl)
- **Priority:** P1
- **Depends on:** TODO-PRE1, TODO-C35
- **Current:** `op-request-approval.md` Step 5 embeds `curl -s -X POST "$AIMAESTRO_API/api/v1/governance/requests"` with full JSON body. Step 3 constructs a full AMP envelope in bash heredoc to `eama-main`. `op-handle-approval-timeout.md` Step 1 embeds `curl -s "$AIMAESTRO_API/api/v1/governance/requests/$REQUEST_ID" | jq '...'`.
- **Change:** `op-request-approval.md` Step 5: replace with "Use the `team-governance` skill to submit the GovernanceRequest." Step 3: replace AMP heredoc with "Use the `agent-messaging` skill to send an approval-request message to the EAMA agent (use `EAMA_SESSION_NAME` constant — see TODO-PRE1)." `op-handle-approval-timeout.md` Step 1: replace with "Use the `team-governance` skill to query GovernanceRequest status."
- **Verify:** No `curl -s -X POST` or `curl -s "$AIMAESTRO_API` remain in either file. The local YAML tracking steps are preserved.
- **Harmonization note:** None — these are clean curl-to-skill replacements.

---

### TODO-C38: Replace hardcoded governance policy tables in approval-escalation.md and approval-request-procedure.md
- **Files:** `skills/amcos-permission-management/references/approval-escalation.md`, `skills/amcos-permission-management/references/approval-request-procedure.md`
- **Lines:** approval-escalation.md (timeout policy table), approval-request-procedure.md (operational threshold defaults)
- **Priority:** P2
- **Depends on:** TODO-PRE4 (canonical policy document must exist first)
- **Current:** `approval-escalation.md` hardcodes timeout proceed/abort policy without runtime override path. `approval-request-procedure.md` hardcodes operational thresholds (e.g., `agent idle beyond threshold (default: 30 minutes)`) as absolute defaults.
- **Change:** After TODO-PRE4 creates a canonical policy document: reference it from both files instead of re-declaring policies inline. For threshold defaults: rewrite as "default: 30 minutes — configurable via AMCOS approval policy" with a reference to the canonical policy location.
- **Verify:** Both files reference the canonical policy document. No inline policy tables remain as definitive (non-referenced) declarations.
- **Harmonization note:** RK-23 (escalation audit log) is a PRESERVE item in approval-escalation.md — keep it.

---

### TODO-C39: Document approval-tracking.md YAML state as harmonized dual-write PRESERVE item
- **File:** `skills/amcos-permission-management/references/approval-tracking.md`
- **Lines:** All — Python code for YAML read/write, timeout calculation
- **Priority:** P1
- **Depends on:** TODO-C35, TODO-C36
- **Current:** Plugin-local YAML state file at `docs_dev/state/amcos-approval-tracking.yaml` tracks approval state independently of AI Maestro GovernanceRequest API. Python code to read/write it is embedded. Timeout `submitted_at + 120 seconds` hardcoded in Python with no discovery mechanism.
- **Change:** This file's YAML tracking system is a PRESERVE item (RK-22). The change needed is: (a) Add documentation that this YAML is the AMCOS-internal layer; the GovernanceRequest API (accessed via `team-governance` skill) is the cross-system layer. Add a diagram or bullet list showing the dual-write flow. (b) Replace the hardcoded `120 seconds` timeout with a reference to the canonical timeout policy (created in TODO-PRE4). (c) Keep all Python read/write code — it is intentional PRESERVE.
- **Verify:** The YAML tracking code is clearly documented as PRESERVE with a rationale comment. The timeout is now a reference to the canonical policy, not a hardcoded literal.
- **Harmonization note:** RK-22 explicitly designates this system as PRESERVE. The dual-write architecture (local YAML + GovernanceRequest API) is the correct design — only the timeout needs to reference the policy document.

---

## GROUP 8: Transfer Management — Wrong Endpoint Fixes

---

### TODO-C40: Fix wrong HTTP endpoint in op-approve-transfer-request.md (CRITICAL bug)
- **File:** `skills/amcos-transfer-management/references/op-approve-transfer-request.md`
- **Lines:** 37–44 and all state-transition table references
- **Priority:** P1
- **Depends on:** None (this is a functional bug, highest priority in transfer-management)
- **Current:** Embeds `POST /api/governance/transfers/{id}/approve` directly — this endpoint is WRONG. The `team-governance` skill documents `POST /api/governance/transfers/{id}/resolve` with `action: "approve"` in the body. Using the wrong endpoint will cause HTTP 404 at runtime. Also contains hardcoded transfer approval matrix (source/target COS, manager roles) and full state transition table.
- **Change:** Correct the endpoint to reference the `team-governance` skill's transfer resolution operation. Replace `POST /api/governance/transfers/{id}/approve` with "Use the `team-governance` skill to resolve a transfer request with `action: 'approve'`." Remove the hardcoded approval matrix; replace with "Approval routing is determined by the `team-governance` skill based on current team roles."
- **Verify:** No `/approve` endpoint path remains. The correct pattern using `resolve` + `action` body is referenced. No hardcoded role matrices remain.
- **Harmonization note:** None — this is a correctness fix plus abstraction.

---

### TODO-C41: Replace wrong endpoint in op-create-transfer-request.md (CRITICAL bug)
- **File:** `skills/amcos-transfer-management/references/op-create-transfer-request.md`
- **Lines:** Various — all direct API call references
- **Priority:** P1
- **Depends on:** None
- **Current:** Embeds `POST /api/governance/transfers/` directly — must delegate to `team-governance` skill. Also hardcodes prerequisites ("Requester must have permission to initiate transfers") and which roles must be notified (Source COS, source manager, target COS, target manager) as Step 4 with no runtime reference.
- **Change:** Replace `POST /api/governance/transfers/` with "Use the `team-governance` skill transfer-creation workflow." Replace hardcoded prerequisites with "Verify requester authorization using the `team-governance` skill." Replace hardcoded notification list with "Notifications are routed by the `team-governance` skill based on current team membership."
- **Verify:** No `POST /api/governance/transfers/` path remains. No hardcoded notification recipient lists remain.
- **Harmonization note:** None.

---

## GROUP 9: Label Taxonomy and Ops Skills — curl Replacement

---

### TODO-C42: Replace all curl calls in amcos-label-taxonomy (SKILL.md + reference files)
- **Files:** `skills/amcos-label-taxonomy/SKILL.md` (lines 93–95, 117–119, 257–259, 265–268, 50, 73 + missing prerequisites section), `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` (lines 79–81, 103–105), `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` (8+ curl instances), `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` (lines 63–65, 100–102)
- **Lines:** As noted above
- **Priority:** P1
- **Depends on:** None
- **Current:** SKILL.md contains 4 curl calls to `$AIMAESTRO_API/api/agents/implementer-1` in examples. Also references "Update team registry via AI Maestro REST API" and "Run sync check via REST API" as normative language. Missing Prerequisites section. `op-sync-registry-with-labels.md` has 8+ direct curl calls to `/api/agents/` and `/api/teams/` — highest-severity file in ops/planning scope. `op-assign-agent-to-issue.md` and `op-terminate-agent-clear-assignments.md` each have curl calls to PATCH agent status.
- **Change:** All curl calls across all four files: replace with `ai-maestro-agents-management` skill references (Update Agent, Terminate Agent, Show Agent, Sync Check operations). In SKILL.md: reword "via AI Maestro REST API" → "via the `ai-maestro-agents-management` skill". Add a `## Prerequisites` section to SKILL.md listing `ai-maestro-agents-management` skill as a dependency. Replace hardcoded example agent name `implementer-1` with `<agent-session-name>` placeholder.
- **Verify:** No `curl "$AIMAESTRO_API` patterns remain in any of the four files. SKILL.md has a Prerequisites section.
- **Harmonization note:** None — these are clean curl-to-skill replacements.

---

### TODO-C43: Replace skills-index.json direct reads in skill-management references
- **Files:** `skills/amcos-skill-management/SKILL.md` (line 258–259), `skills/amcos-skill-management/references/op-configure-pss-integration.md` (lines 151, 219, 222, 225), `skills/amcos-skill-management/references/op-reindex-skills-pss.md` (9 instances), `skills/amcos-skill-management/references/pss-integration.md` (6 instances), `skills/amcos-skill-management/references/skill-reindexing.md` (12+ instances)
- **Lines:** As noted above
- **Priority:** P2
- **Depends on:** None
- **Current:** Multiple files read `~/.claude/skills-index.json` directly via `cat ... | jq` with internal structure access (`skills["name"]`, `.categories["x"]`, `.skills | length`). This directly couples the skill files to the PSS internal file format. `skill-reindexing.md` is the most affected file (12+ instances).
- **Change:** Replace all `cat ~/.claude/skills-index.json | jq ...` reads with PSS CLI commands (`/pss-status`, `/pss-suggest`) or references to the `ai-maestro-agents-management` skill. For SKILL.md line 258–259 Example 3: replace with "Verify skill count using `/pss-status`."
- **Verify:** No `cat ~/.claude/skills-index.json` patterns remain in any of the five files.
- **Harmonization note:** None.

---

### TODO-C44: Replace CLI syntax in amcos-skill-management/SKILL.md examples
- **File:** `skills/amcos-skill-management/SKILL.md`
- **Lines:** 218–231 (Example 1), 258–259 (Example 3)
- **Priority:** P2
- **Depends on:** None
- **Current:** Lines 218–231 embed `pip install skills-ref` and `skills-ref validate /path/...` / `skills-ref read-properties /path/...` in Example 1. Lines 258–259 use `cat ~/.claude/skills-index.json | jq '.skills | length'`.
- **Change:** Replace bash block in lines 218–231 with prose deferring to `references/op-validate-skill.md` for current validation syntax. Replace lines 258–259 with `/pss-status` command reference.
- **Verify:** No `pip install skills-ref` or `skills-ref validate` commands remain. No `cat ~/.claude/skills-index.json` in Example 3.
- **Harmonization note:** None.

---

### TODO-C45: Replace macOS-specific bash block in amcos-resource-monitoring/SKILL.md
- **File:** `skills/amcos-resource-monitoring/SKILL.md`
- **Lines:** 136–146, 200–201, 214
- **Priority:** P2
- **Depends on:** None
- **Current:** Lines 136–146 contain macOS-specific bash: `top -l 1 | grep ...`, `vm_stat | grep ...`, `df -h /` — platform-specific implementation embedded in the skill entry point. Lines 200–201 and 214 hardcode session limits (conservative 10, normal 15, max 20) and alert type enumeration.
- **Change:** Replace bash block with prose deferring to `references/op-check-system-resources.md` for current resource-check commands. For session limits: replace hardcoded numbers with "Compare against limits defined in AI Maestro instance monitoring settings — discoverable at runtime."
- **Verify:** No `top -l 1`, `vm_stat`, `df -h` commands remain in the SKILL.md entry point. Session limit numbers are presented as examples, not definitive constraints.
- **Harmonization note:** None.

---

### TODO-C46: Replace ps aux fallback in validation-procedures.md
- **File:** `skills/amcos-skill-management/references/validation-procedures.md`
- **Lines:** 914–916
- **Priority:** P3
- **Depends on:** None
- **Current:** `ps aux | grep ai-maestro` fallback in Section 7.2 Step 4 as a system health check bypass when the API is unavailable.
- **Change:** Replace `ps aux | grep` with documentation reference: "If AI Maestro API is unreachable, refer to the `ai-maestro-agents-management` skill's offline-check guidance, or consult the OPERATIONS-GUIDE."
- **Verify:** No `ps aux | grep` remains in this file.
- **Harmonization note:** None.

---

### TODO-C47: Replace AMP message format blocks in plugin-management reference
- **File:** `skills/amcos-plugin-management/references/remote-plugin-management.md`
- **Lines:** 34, 55
- **Priority:** P3
- **Depends on:** None
- **Current:** Two raw AMP message format JSON blocks embedded: `"type": "plugin-install"` and `"type": "plugin-update"`.
- **Change:** Replace with references to the `agent-messaging` skill for plugin operation message format.
- **Verify:** No JSON message format blocks with `"type": "plugin-install"` or `"type": "plugin-update"` remain as inline schemas.
- **Harmonization note:** None.

---

## GROUP 10: Onboarding and Plugin Management — Path and CLI Fixes

---

### TODO-C48: Fix wrong agent-states directory name in onboarding handoff file
- **File:** `skills/amcos-onboarding/references/op-conduct-project-handoff.md`
- **Lines:** 151
- **Priority:** P3
- **Depends on:** TODO-C14 (canonical hibernation path)
- **Current:** `~/.ai-maestro/agent-states/[agent-name]-emergency.json` uses `~/.ai-maestro/` with hyphen.
- **Change:** Already covered by TODO-C15. Mark as resolved when TODO-C15 is done.
- **Verify:** See TODO-C15.
- **Harmonization note:** See TODO-C14.

---

## GROUP 11: Required Changes to Global Skills (Blockers)

*These are NOT changes to AMCOS plugin files. They are gaps in global skills that BLOCK AMCOS from fully delegating. Record them as dependency items.*

---

### TODO-C49: Request PATCH support in team-governance global skill (Blocker for Group 7)
- **File:** Global skill — not in AMCOS plugin root (this is an upstream dependency)
- **Lines:** N/A
- **Priority:** P1
- **Depends on:** None (prerequisite for TODO-C35, TODO-C36, TODO-C37)
- **Current:** The `team-governance` global skill currently documents only POST (create) and GET (list/read) operations for GovernanceRequests. AMCOS needs PATCH to update status to `approved`, `rejected`, or `timeout`. Without PATCH support in the skill, AMCOS cannot delegate approval status updates — it must either use curl (violation) or leave approvals unresolvable.
- **Change:** Submit a request to the `team-governance` skill maintainer to add: PATCH `/api/v1/governance/requests/{id}` (approve/reject/timeout), with documentation. Until this is available, AMCOS files that need PATCH can document the operation as "Use `team-governance` skill PATCH when available; see GitHub issue #NNN."
- **Verify:** `team-governance` skill documents the PATCH operation. AMCOS files reference the skill, not a direct curl.
- **Harmonization note:** Also needed: documentation of `reminder_sent` and `min_age_seconds` query parameters used by AMCOS, or confirmation they are unsupported (requiring client-side filtering instead).

---

### TODO-C50: Request agent-listing operation in ai-maestro-agents-management skill for broadcast use
- **File:** Global skill — not in AMCOS plugin root (upstream dependency)
- **Lines:** N/A
- **Priority:** P2
- **Depends on:** None (prerequisite for TODO-C13)
- **Current:** `op-send-maestro-message.md` needs to list running agents for broadcast. Currently uses `amcos_team_registry.py list --filter-status running --names-only` as a workaround. If the `ai-maestro-agents-management` skill supports filtered agent listing by status, AMCOS can delegate to it directly.
- **Change:** Verify whether `ai-maestro-agents-management` skill supports "list agents by status" query. If yes: update TODO-C13 to reference this operation. If no: document as a skill gap and keep the registry script call with a stability comment.
- **Verify:** Check `ai-maestro-agents-management` skill documentation for agent list/filter operations.
- **Harmonization note:** None.

---

## Summary: Priority Ordering

| Priority | Count | Description |
|----------|-------|-------------|
| P1 | 15 | Functional bugs and correctness fixes; critical abstractions blocking integration |
| P2 | 22 | High-severity violations requiring skill-reference replacement |
| P3 | 13 | Low-severity violations; CLI stability improvements; minor cleanup |
| **Total TODOs** | **50** | (covering 191 raw violations, grouped by fix pattern) |

**Recommended execution order:**
1. TODO-PRE1 through TODO-PRE4 (internal consistency bugs — must be first)
2. TODO-C49, TODO-C50 (upstream skill gaps — file requests early, work in parallel)
3. All P1 TODOs: C1, C2, C7, C22, C23, C35, C36, C37, C39, C40, C41, C42
4. All P2 TODOs
5. All P3 TODOs

**PRESERVE items that must NOT be removed under any TODO:**
RK-01 through RK-30 as listed in `consolidated-AMCOS-violations-part1.md` Appendix, and the Appendix of the master report. When in doubt, add a `<!-- PRESERVE: RK-XX -->` comment rather than removing content.

---

*End of TODO list.*
*Source: `consolidated-AMCOS-violations-2026-02-27.md` (191 violations) + `consolidated-AMCOS-violations-part1.md`*
*Date: 2026-02-27*
