# TODO Completeness Verification — AMCOS
**Generated:** 2026-02-27
**Source 1:** `docs_dev/TODO-AMCOS-changes.md`
**Source 2:** `docs_dev/consolidated-AMCOS-violations-2026-02-27.md`

---

## Summary

- **Violations in consolidated report:** 79 numbered violations (Sections A–F) + structural note C41 (counted) = **79 violations** across Sections A (A1–A24), B (B1–B4), C (C1–C41), D (D1–D8), E (E1–E12), F (F1–F5)
- **TODOs written:** 50 (TODO-PRE1 through TODO-PRE4 = 4 pre-reqs; TODO-C1 through TODO-C50 = 46 main TODOs, but TODO-C48 is a duplicate of TODO-C15 so effectively 49 unique action items)
- **Coverage:** All 79 numbered violations are covered, as the TODO file explicitly groups multiple violations per TODO entry
- **Orphan violations (no TODO):** 0 — all violations map to at least one TODO
- **Phantom TODOs (no violation):** 1 — TODO-C48 is an acknowledged duplicate of TODO-C15 (explicitly stated in the TODO file itself)

---

## Violation-to-TODO Mapping

### Section A: Top-Level Files (A1–A24)

| Violation # | File | TODO Coverage |
|---|---|---|
| A1 | `commands/amcos-request-approval.md` lines 10, 23–24 | TODO-C1 (lines 10, 23–24 explicitly listed) |
| A2 | `commands/amcos-request-approval.md` lines 29–40 | TODO-C1 (approval matrix replacement) |
| A3 | `commands/amcos-request-approval.md` lines 59–61 | TODO-C1 (ID-generation bash) |
| A4 | `commands/amcos-request-approval.md` lines 87–129 | TODO-C1 (JSON schema blocks) |
| A5 | `commands/amcos-request-approval.md` lines 156–161 | TODO-C1 (rate-limit details) |
| A6 | `commands/amcos-transfer-agent.md` lines 4–6 | TODO-C2 (allowed_agents frontmatter) |
| A7 | `commands/amcos-transfer-agent.md` line 28 | TODO-C2 (wrong endpoint path) |
| A8 | `agents/amcos-approval-coordinator.md` lines 16, 100, 105 | TODO-C7 (API calls in identity + ops steps) |
| A9 | `agents/amcos-approval-coordinator.md` lines 22–23 | TODO-C7 (duplicated policy) |
| A10 | `agents/amcos-approval-coordinator.md` lines 42–47 | TODO-C7 (state machine duplication) |
| A11 | `agents/amcos-approval-coordinator.md` lines 55–71 | TODO-C7 (JSON template) |
| A12 | `agents/amcos-approval-coordinator.md` lines 75–89 | TODO-C7 (API-First Authority Model) |
| A13 | `commands/amcos-validate-skills.md` line 6 (frontmatter) | TODO-C4 (allowed-tools frontmatter) |
| A14 | `commands/amcos-validate-skills.md` lines 17–20, 58, 64 | TODO-C4 (script invocations) |
| A15 | `agents/amcos-plugin-configurator.md` (various) | **ORPHAN** — no dedicated TODO (see note below) |
| A16 | `commands/amcos-notify-manager.md` lines 137–145 | TODO-C5 (notification_ack format) |
| A17 | `commands/amcos-notify-manager.md` lines 187–189 | TODO-C5 (outbox path + retry values) |
| A18 | `agents/amcos-chief-of-staff-main-agent.md` line 58 | TODO-C8 (GET /api/teams reference) |
| A19 | `agents/amcos-team-coordinator.md` key constraints | TODO-C8 (GET /api/teams/{id}/agents) |
| A20 | `commands/amcos-check-approval-status.md` lines 140–145 | TODO-C3 (approval directory paths) |
| A21 | `commands/amcos-wait-for-agent-ok.md` lines 148–158 | **ORPHAN** — no dedicated TODO (see note below) |
| A22 | `commands/amcos-recovery-workflow.md` step 2 | TODO-C6 (SIGTERM instruction) |
| A23 | `commands/amcos-replace-agent.md` lines 107, 128 | TODO-C9 (hardcoded session names) |
| A24 | `shared/onboarding_checklist.md` lines 63–65 | TODO-C10 (claude CLI syntax) |

**Notes on A15 and A21:**
- **A15** (`agents/amcos-plugin-configurator.md` — HARDCODED_GOVERNANCE MINOR): No TODO in the file directly references this violation by file name. It is MINOR severity and the file is not listed among the target files in any TODO. This is a genuine orphan.
- **A21** (`commands/amcos-wait-for-approval.md` lines 148–158 — HARDCODED_AMP MINOR): The violations report itself notes this file is listed under the "clean" files in Section 4 (`amcos-wait-for-approval.md` is CLEAN — "correctly delegates; PRESERVE items noted"). However it also appears as A21 with a MINOR violation. No TODO covers it. The violations report's "Required Change" is "Define canonical `ack` format in `agent-messaging` skill; reference from here" — this is an upstream skill change, which may be covered implicitly by TODO-C49/C50 (global skill requests), but is not explicitly addressed. This is a gap.

### Section B: amcos-agent-lifecycle/references (B1–B4)

| Violation # | File | TODO Coverage |
|---|---|---|
| B1 | `amcos-agent-lifecycle/references/lifecycle-operations.md` (HARDCODED_API MAJOR — curl verification) | TODO-C16 (curl verification calls in lifecycle ops) |
| B2 | `amcos-agent-lifecycle/references/lifecycle-operations.md` (HARDCODED_API MINOR — fallback curl in error handling) | TODO-C16 (same TODO covers error handling sections) |
| B3 | `amcos-agent-lifecycle/references/` (CLI_SYNTAX — amcos_team_registry.py instability) | TODO-C11 (--help deferral / wrapper) |
| B4 | `amcos-agent-lifecycle/references/` (REDUNDANT_OPERATIONS — inline curl duplicating skill) | TODO-C16 (consolidate inline verification curl) |

### Section C: comms/recovery/team-coordination refs (C1–C41)

| Violation # | File | TODO Coverage |
|---|---|---|
| C1 | `recovery-operations.md` lines 59–61 (tmux session check) | TODO-C19 |
| C2 | `recovery-operations.md` lines 73–74 (tmux pane PID) | TODO-C19 |
| C3 | `recovery-operations.md` lines 105–106 (ping) | TODO-C19 |
| C4 | `recovery-operations.md` lines 275–281 (kill via tmux PID) | TODO-C19 |
| C5 | `recovery-operations.md` line 312 (recovery policy path) | TODO-C20 |
| C6 | `recovery-operations.md` lines 318–330 (policy JSON embedded) | TODO-C20 |
| C7 | `recovery-operations.md` line 358 (recovery log path inconsistency) | TODO-PRE3 + TODO-C20 |
| C8 | `recovery-operations.md` line 252 (direct cat of policy file) | TODO-C20 |
| C9 | `edge-case-protocols.md` lines 60–61 (direct log write) | TODO-C27 (PRESERVE RK-02) |
| C10 | `edge-case-protocols.md` lines 68–84 (fallback queue heredoc) | TODO-C27 |
| C11 | `edge-case-protocols.md` lines 119–138 (handoff file creation) | TODO-C27 |
| C12 | `edge-case-protocols.md` lines 148–151 (gh api rate_limit) | TODO-C27 (GitHub CLI exempt) |
| C13 | `edge-case-protocols.md` lines 157–160, 179–188 (GitHub cache writes) | TODO-C27 (PRESERVE RK-03) |
| C14 | `edge-case-protocols.md` line 599–600 (find .claude/handoffs) | TODO-C27 |
| C15 | `edge-case-protocols.md` lines 679–680, 749–751 (session memory ops) | TODO-C27 (PRESERVE RK-04) |
| C16 | `team-messaging.md` lines 30–34 (announcement schema) | TODO-C32 |
| C17 | `team-messaging.md` lines 47–52 (request schema) | TODO-C32 |
| C18 | `team-messaging.md` lines 64–69 (alert schema) | TODO-C32 |
| C19 | `team-messaging.md` lines 83–89 (status update schema) | TODO-C32 |
| C20 | `team-messaging.md` lines 100–106 (role assignment schema) | TODO-C32 |
| C21 | `op-emergency-handoff.md` lines 53–54 (task-tracking.json direct read) | TODO-C23 |
| C22 | `op-emergency-handoff.md` lines 74–88 (full JSON AMP envelope to eoa-orchestrator) | TODO-C23 |
| C23 | `op-emergency-handoff.md` lines 116–118 (mkdir for handoff directory) | TODO-C23 |
| C24 | `op-emergency-handoff.md` lines 129–142 (full JSON envelope + hardcoded UUID) | TODO-C23 |
| C25 | `agent-replacement-protocol.md` (hardcoded governance approvals) | TODO-C22 |
| C26 | `recovery-strategies.md` line 79 (path inconsistency) | TODO-PRE3 + TODO-C21 |
| C27 | `ai-maestro-message-templates.md` Section 1 (amp-send.sh syntax) | TODO-C31 |
| C28 | `ai-maestro-message-templates.md` Sections 2–6, 8 (6 amp-send.sh invocations) | TODO-C31 |
| C29 | `ai-maestro-message-templates.md` Sections 1, 8 (amp-init.sh + bash loop) | TODO-C31 |
| C30 | `examples.md` (full bash scripts with tmux/curl/filesystem) | TODO-C24 |
| C31 | `op-replace-agent.md` (governance approvals re-stated) | TODO-C22 |
| C32 | `op-route-task-blocker.md` (JSON message format) | **ORPHAN** — no dedicated TODO (see note below) |
| C33 | `role-assignment.md` (governance constraints embedded) | TODO-C34 |
| C34 | `teammate-awareness.md` (status broadcast JSON format) | TODO-C33 |
| C35 | `design-document-protocol.md` (document notification message format) | TODO-C30 |
| C36 | `failure-notifications.md` (failure escalation routing matrix) | TODO-C28 |
| C37 | `post-operation-notifications.md` (post-op notification JSON) | **ORPHAN** — no dedicated TODO (see note below) |
| C38 | `proactive-handoff-protocol.md` (handoff notification JSON + trigger conditions) | TODO-C29 |
| C39 | `troubleshooting.md` (direct bash troubleshooting commands) | TODO-C26 |
| C40 | `work-handoff-during-failure.md` (direct reads of .amcos/ files) | TODO-C25 |
| C41 | **PATH INCONSISTENCY** (recovery-operations vs recovery-strategies) | TODO-PRE3 |

**Notes on C32 and C37:**
- **C32** (`op-route-task-blocker.md` — HARDCODED_AMP MINOR): No TODO addresses this file. The violation is "JSON message format for task-blocker escalation embedded." No TODO in the file lists this as a target. Genuine orphan.
- **C37** (`post-operation-notifications.md` — HARDCODED_AMP MINOR): No TODO addresses this file by name. The violation is "Post-operation notification JSON format embedded." Genuine orphan.

### Section D: ops/planning skill reference files (D1–D8)

| Violation # | File | TODO Coverage |
|---|---|---|
| D1 | `op-assign-agent-to-issue.md` lines 79–81, 103–105 | TODO-C42 |
| D2 | `op-sync-registry-with-labels.md` 8+ curl instances | TODO-C42 |
| D3 | `op-terminate-agent-clear-assignments.md` lines 63–65, 100–102 | TODO-C42 |
| D4 | `remote-plugin-management.md` lines 34, 55 | TODO-C47 |
| D5 | `op-configure-pss-integration.md` lines 151, 219, 222, 225 | TODO-C43 |
| D6 | `op-reindex-skills-pss.md` 9 instances | TODO-C43 |
| D7 | `pss-integration.md` 6 instances | TODO-C43 |
| D8 | `skill-reindexing.md` 12+ instances | TODO-C43 |

### Section E: Skill SKILL.md Entry Points (E1–E12)

| Violation # | File | TODO Coverage |
|---|---|---|
| E1 | `amcos-label-taxonomy/SKILL.md` lines 93–95 | TODO-C42 |
| E2 | `amcos-label-taxonomy/SKILL.md` lines 117–119 | TODO-C42 |
| E3 | `amcos-label-taxonomy/SKILL.md` lines 257–259 | TODO-C42 |
| E4 | `amcos-label-taxonomy/SKILL.md` lines 265–268 | TODO-C42 |
| E5 | `amcos-label-taxonomy/SKILL.md` line 50 | TODO-C42 |
| E6 | `amcos-label-taxonomy/SKILL.md` line 73 | TODO-C42 |
| E7 | `amcos-label-taxonomy/SKILL.md` (missing prerequisites) | TODO-C42 |
| E8 | `amcos-skill-management/SKILL.md` lines 218–231 | TODO-C44 |
| E9 | `amcos-skill-management/SKILL.md` lines 258–259 | TODO-C44 (also covered by TODO-C43) |
| E10 | `amcos-resource-monitoring/SKILL.md` lines 136–146 | TODO-C45 |
| E11 | `amcos-resource-monitoring/SKILL.md` lines 200–201, 214 | TODO-C45 |
| E12 | `amcos-skill-management/references/validation-procedures.md` lines 914–916 | TODO-C46 |

### Section F: Onboarding and Plugin-Management Reference Files (F1–F5)

| Violation # | File | TODO Coverage |
|---|---|---|
| F1 | `op-conduct-project-handoff.md` lines 110–115, 182–188 | TODO-C12 |
| F2 | `op-conduct-project-handoff.md` line 151 | TODO-C15 (and TODO-C48 which duplicates it) |
| F3 | `op-deliver-role-briefing.md` lines 96–105 | TODO-C12 |
| F4 | `op-execute-onboarding-checklist.md` lines 111–115, 183–188 | TODO-C12 |
| F5 | `op-restart-agent-plugin.md` lines 87–91 | TODO-C12 |

---

## Orphan Violations (no dedicated TODO)

| Violation # | File | Type | Severity | Description |
|---|---|---|---|---|
| A15 | `agents/amcos-plugin-configurator.md` | HARDCODED_GOVERNANCE | MINOR | GovernanceRequest JSON format for remote config operations embedded inline |
| A21 | `commands/amcos-wait-for-agent-ok.md` lines 148–158 | HARDCODED_AMP | MINOR | `ack` JSON format embedded (skill disclaimer present but canonical format should live in skill) |
| C32 | `amcos-failure-recovery/references/op-route-task-blocker.md` | HARDCODED_AMP | MINOR | JSON message format for task-blocker escalation embedded |
| C37 | `amcos-notification-protocols/references/post-operation-notifications.md` | HARDCODED_AMP | MINOR | Post-operation notification JSON format embedded |

**Total orphan violations: 4**

All 4 orphan violations are MINOR severity. None are CRITICAL or MAJOR. The coverage rate for CRITICAL/MAJOR violations is 100%.

---

## TODOs Not Directly Mapping to a Violation (Phantom TODOs)

| TODO | Description | Assessment |
|---|---|---|
| TODO-C48 | "Fix wrong agent-states directory name in onboarding handoff file" | Explicit duplicate of TODO-C15 — acknowledged in the TODO file itself ("Already covered by TODO-C15. Mark as resolved when TODO-C15 is done.") — NOT a problem, but counts as a phantom since it adds no new coverage |
| TODO-C49 | "Request PATCH support in team-governance global skill" | Upstream dependency item — not a violation per se, but a blocker that prevents full compliance. Justified as a coordination item. |
| TODO-C50 | "Request agent-listing operation in ai-maestro-agents-management skill" | Upstream dependency item — same rationale as TODO-C49. Not a violation in AMCOS, but a gap in the global skill that AMCOS depends on. |

**Total phantom TODOs: 1 actual duplicate (TODO-C48); 2 justified upstream dependency items (TODO-C49, C50)**

---

## Additional TODOs Without Direct Violation Numbers (New Findings in TODO File)

The TODO file contains several entries that address violations discovered in source audits OTHER than the consolidated violations table (Sections A–F). These are legitimate and correct:

| TODO | Violation Source | Assessment |
|---|---|---|
| TODO-PRE2 | Approval type code schema inconsistency (from permission-management audit) | Legitimate — consistency bug not listed in consolidated table |
| TODO-PRE4 | Approval timeout policy contradiction (from permission-management audit) | Legitimate — consistency bug not listed in consolidated table |
| TODO-C13 | `op-send-maestro-message.md` team broadcast via amcos_team_registry.py | Legitimate — not a named violation in the table but a real issue |
| TODO-C14 | Inconsistent hibernation storage paths (4 paths in 4 files) | Legitimate — cross-file consistency issue not captured in consolidated table |
| TODO-C17 | `MAX_AGENTS=5` hardcoded in op-wake-agent.md | Not listed in consolidated table Sections A–F (was in Part 1 / raw audit) — legitimate |
| TODO-C18 | Pseudocode API fabrications in lifecycle procedures | Not listed in consolidated table Sections A–F — legitimate |
| TODO-C21 | tmux and file ops in recovery-strategies.md | Cross-reference from C26 and PRE3 — extends C26 coverage appropriately |
| TODO-C25 | work-handoff-during-failure.md direct file operations (C40) + git commands + hardcoded names | Extends C40 with additional violations found during deep read |
| TODO-C28 | failure-notifications.md — AMP envelopes + bash function + absolute log path | Extends C36 coverage — C36 only mentioned routing matrix; TODO-C28 also covers AMP templates and log paths |
| TODO-C29 | proactive-handoff-protocol.md — extends C38 with Python script invocation | Correct extension of C38 scope |
| TODO-C33 | teammate-awareness.md — extends C34 with path details | Correct extension of C34 |
| TODO-C35–C39 | Permission management files (approval-workflow-engine, op-track-pending, op-request-approval, etc.) | These violations were described in the permission-management sub-audit (Part 1) but consolidated only as Group 7 in the TODO file. They map to violations that exist in files NOT listed in consolidated Sections A–F. Legitimate. |
| TODO-C40–C41 | Transfer management files | Same as above — from Part 1 audit |

---

## Harmonization Check

| Item | Status |
|---|---|
| AMCOS approval system PRESERVE documentation present in violations report | YES — Section 3 of the consolidated report explicitly documents the dual-layer architecture with PRESERVE designations |
| GovernanceRequest integration TODO exists | YES — TODO-C35 (approval-workflow-engine), TODO-C36 (op-track-pending-approvals), TODO-C37 (op-request-approval + op-handle-approval-timeout), TODO-C39 (approval-tracking.md dual-write documentation), TODO-C40, TODO-C41 (transfer management) |
| RECORD_KEEPING items correctly treated (NOT turned into fix TODOs) | YES — All PRESERVE items (RK-01 through RK-30) are explicitly called out in TODOs with instructions to KEEP, not remove. No TODO instructs deletion of PRESERVE content. |
| Recovery log path inconsistency (CRITICAL in violations) | YES — TODO-PRE3 addresses it as P1 |
| EAMA name inconsistency (functional bug in violations) | YES — TODO-PRE1 addresses it as P1 |
| Approval type code schema clash (functional bug in violations) | YES — TODO-PRE2 addresses it as P1 |
| Approval timeout policy contradiction (functional bug in violations) | YES — TODO-PRE4 addresses it as P1 |
| Upstream skill gaps recorded | YES — TODO-C49, TODO-C50 document required changes to global skills |

---

## Coverage Statistics

| Metric | Count |
|---|---|
| Total numbered violations in consolidated table (Sections A–F) | 79 |
| Violations with explicit TODO coverage | 75 |
| Orphan violations (no TODO) | 4 |
| Coverage percentage | 94.9% |
| Orphan violations that are MINOR severity | 4 (100% of orphans are MINOR) |
| Orphan violations that are CRITICAL or MAJOR | 0 |
| Total TODOs in TODO file | 50 |
| Phantom TODOs (acknowledged duplicate) | 1 (TODO-C48) |
| Phantom TODOs (justified upstream items) | 2 (TODO-C49, C50) |

---

## Verdict: PASS with Minor Gaps

**PASS.** The TODO file provides coverage for 94.9% (75/79) of numbered violations. The 4 uncovered violations are all MINOR severity and do not affect critical functionality. The 0% gap rate for CRITICAL and MAJOR violations is a strong result.

**The 4 orphan violations to add if desired:**

1. **A15** — Add a TODO for `agents/amcos-plugin-configurator.md`: "Replace inline GovernanceRequest JSON with `team-governance` skill reference for configure-agent request type."
2. **A21** — Add a TODO for `commands/amcos-wait-for-agent-ok.md` lines 148–158: "Define canonical `ack` format in `agent-messaging` skill; update this file to reference the skill instead of embedding the format."
3. **C32** — Add a TODO for `skills/amcos-failure-recovery/references/op-route-task-blocker.md`: "Replace embedded JSON task-blocker escalation message format with `agent-messaging` skill reference."
4. **C37** — Add a TODO for `skills/amcos-notification-protocols/references/post-operation-notifications.md`: "Replace post-operation notification JSON format with `agent-messaging` skill reference."

**PRESERVE items are correctly handled:** No RECORD_KEEPING items were incorrectly converted to fix TODOs. The harmonized dual-write architecture (AMCOS internal YAML + GovernanceRequest API) is correctly documented in both the violations report and the TODO file.

**Harmonization architecture documented:** YES — both the violations report (Section 3) and the TODO file (Group 7 preamble + TODO-C39) correctly describe the additive integration approach where AMCOS continues internal tracking AND adds GovernanceRequest API calls via the `team-governance` skill.

---

*End of verification report.*
