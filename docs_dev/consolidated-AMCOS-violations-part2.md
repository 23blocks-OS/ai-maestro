# AMCOS Consolidated Violations — Part 2 (ops-planning, toplevel, session-memory, gap-fills)
## Date: 2026-02-27

---

## Violations Table

| # | File (relative to plugin root) | Violation Type | Severity | Description |
|---|---|---|---|---|
| 1 | `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` | HARDCODED_API | HIGH | Step 5 and Example embed `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `current_issues_add`; must use `ai-maestro-agents-management` skill instead |
| 2 | `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` | HARDCODED_API | HIGH | Steps 1, 2, 4, 5 and Automated Sync Script contain 6+ curl calls to `$AIMAESTRO_API/api/agents/...` and `$AIMAESTRO_API/api/teams/default/agents`; must use `ai-maestro-agents-management` skill |
| 3 | `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` | HARDCODED_API | HIGH | Step 3 and Example embed `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `status: "terminated"`; must use `ai-maestro-agents-management` skill |
| 4 | `skills/amcos-plugin-management/references/remote-plugin-management.md` | HARDCODED_AMP | MEDIUM | Sections 2.2 and 3.2 embed raw AMP message format JSON directly (`{"type": "plugin-install", ...}`, `{"type": "plugin-update", ...}`); must reference the `agent-messaging` skill by name instead |
| 5 | `skills/amcos-skill-management/references/op-configure-pss-integration.md` | LOCAL_REGISTRY | HIGH | Contains `cat ~/.claude/skills-index.json | jq '.skills["skill-name"]'`; must use PSS CLI commands (`/pss-status`, `/pss-suggest`) instead of direct file reads |
| 6 | `skills/amcos-skill-management/references/op-reindex-skills-pss.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
| 7 | `skills/amcos-skill-management/references/pss-integration.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
| 8 | `skills/amcos-skill-management/references/skill-reindexing.md` | LOCAL_REGISTRY | HIGH | Contains direct `jq` reads of `~/.claude/skills-index.json`; must use PSS CLI commands instead |
| 9 | `commands/amcos-request-approval.md` | HARDCODED_API | CRITICAL | Lines 3–4, 23–24: `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` hardcoded in Usage section and workflow steps; must use `team-governance` skill |
| 10 | `commands/amcos-request-approval.md` | HARDCODED_API | CRITICAL | Lines 155–162: HTTP 429 rate limiting details hardcoded (`Retry-After` header, max 10 GovernanceRequests/minute per COS, exponential backoff); implementation details belong in `team-governance` skill |
| 11 | `commands/amcos-request-approval.md` | HARDCODED_GOVERNANCE | MAJOR | Lines 29–40: Full operation-to-approver-to-password approval matrix hardcoded (spawn/terminate/hibernate/wake/install/replace/critical operations); must reference `team-governance` skill |
| 12 | `commands/amcos-request-approval.md` | HARDCODED_AMP | MAJOR | Lines 86–129: Two full GovernanceRequest JSON payload schemas embedded (local and cross-team payloads); must reference `team-governance` skill documentation |
| 13 | `commands/amcos-request-approval.md` | CLI_SYNTAX | MINOR | Line 57: `REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"` — request ID generation via shell commands embedded directly; logic belongs in `team-governance` skill |
| 14 | `commands/amcos-transfer-agent.md` | HARDCODED_API | CRITICAL | Line 29: `POST /api/governance/transfers/` hardcoded in Steps section; uses inconsistent path format vs governance skill (`/api/governance/transfers/` vs `/api/v1/governance/requests`); must use `team-governance` skill |
| 15 | `commands/amcos-transfer-agent.md` | HARDCODED_GOVERNANCE | CRITICAL | Frontmatter lines 4–6: `allowed_agents: [amcos-chief-of-staff, amcos-team-manager]` hardcoded YAML; governance constraints must be resolved dynamically via `team-governance` skill |
| 16 | `agents/amcos-approval-coordinator.md` | HARDCODED_API | MAJOR | Lines 100, 105: `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` hardcoded in workflow steps; must use `team-governance` skill |
| 17 | `agents/amcos-approval-coordinator.md` | HARDCODED_GOVERNANCE | MAJOR | Lines 28–31: Governance constraint table re-declares no-self-approval policy and GovernanceRequest requirements that duplicate the `team-governance` skill |
| 18 | `commands/amcos-validate-skills.md` | CLI_SYNTAX | MAJOR | Lines 16–18, 63: `uv run --with pyyaml python scripts/validate_plugin.py` and `uv run --with pyyaml python scripts/validate_skill.py` embedded in body and `allowed-tools` frontmatter; must use `cpv-validate-plugin` / `cpv-validate-skill` skill references |
| 19 | `commands/amcos-notify-manager.md` | HARDCODED_AMP | MINOR | Lines 136–145: `notification_ack` response JSON format embedded inline (`{"type": "notification_ack", "original_message_id": ..., "acknowledged": true}`); must reference `agent-messaging` skill's acknowledgment format |
| 20 | `commands/amcos-notify-manager.md` | HARDCODED_API | MINOR | Lines 184–188: Message queue outbox path `~/.aimaestro/outbox/` and retry parameters (every 5 minutes, 24-hour expiry) hardcoded; implementation details belong in `agent-messaging` skill |
| 21 | `agents/amcos-chief-of-staff-main-agent.md` | HARDCODED_API | MINOR | Line 58 (approx.): `GET /api/teams` referenced directly for recipient validation; must use `team-governance` skill |
| 22 | `agents/amcos-team-coordinator.md` | HARDCODED_API | MINOR | Key constraints table: `GET /api/teams/{id}/agents` hardcoded as the way to get team state; must use `team-governance` skill |
| 23 | `agents/amcos-plugin-configurator.md` | HARDCODED_GOVERNANCE | MINOR | Lines 57–68: GovernanceRequest JSON format for remote config operations (`{"type": "configure-agent", "target": ..., "operation": ...}`) embedded inline; must reference `team-governance` skill |
| 24 | `commands/amcos-check-approval-status.md` | HARDCODED_API | MINOR | Lines 140–146: Approval storage filesystem paths hardcoded: `~/.aimaestro/approvals/pending/`, `~/.aimaestro/approvals/approved/`, `~/.aimaestro/approvals/rejected/`, `~/.aimaestro/approvals/expired/`; must reference `team-governance` skill |
| 25 | `commands/amcos-wait-for-agent-ok.md` | HARDCODED_AMP | MINOR | Lines 148–158: `ack` JSON format embedded inline (`{"to": "<orchestrator-session>", "content": {"type": "ack", "status": "ready"}}`); different commands define subtly different `ack` formats causing incompatibility; must use `agent-messaging` skill canonical format |
| 26 | `commands/amcos-recovery-workflow.md` | CLI_SYNTAX | MINOR | Line 82 (approx.): "Send SIGTERM to Claude Code process (graceful stop)" embedded as workflow step; direct process operation must be abstracted via `ai-maestro-agents-management` skill's restart capability |
| 27 | `commands/amcos-replace-agent.md` | HARDCODED_GOVERNANCE | MINOR | Lines 106–109, 127–130: Hardcoded agent session names `eama-assistant-manager` and `eoa-orchestrator` as recipients; agent discovery must use `team-governance` skill or `GET /api/teams/{id}/agents` role lookup, not hardcoded strings |
| 28 | `shared/onboarding_checklist.md` | CLI_SYNTAX | MINOR | Step 4 "Spawn Agent Process": `claude --session "${SESSION_NAME}" --project "${PROJECT_DIR}" --plugin-dir "${PLUGIN_PATH}"` embedded directly; must reference `ai-maestro-agents-management` skill |
| 29 | `skills/amcos-label-taxonomy/SKILL.md` | HARDCODED_API | HIGH | Lines 93–95: `curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1"` in Example 1, Step 3; must use `ai-maestro-agents-management` skill "Update Agent" section |
| 30 | `skills/amcos-label-taxonomy/SKILL.md` | HARDCODED_API | HIGH | Lines 117–119: `curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1"` with `{"status": "terminated"}` in Example 2, Step 3; must use `ai-maestro-agents-management` skill "Update/Delete Agent" section |
| 31 | `skills/amcos-label-taxonomy/SKILL.md` | HARDCODED_API | HIGH | Lines 257–259: `curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq .` in "Agent Registry and Labels" section; must use `ai-maestro-agents-management` skill "Show Agent" section |
| 32 | `skills/amcos-label-taxonomy/SKILL.md` | HARDCODED_API | HIGH | Lines 265–268: `REGISTERED=$(curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq -r '.current_issues | sort | .[]')` in Sync Check section; must use `ai-maestro-agents-management` skill |
| 33 | `skills/amcos-label-taxonomy/SKILL.md` | HARDCODED_API | LOW | Lines 50, 73: Checklist item references "AI Maestro REST API" directly ("Update team registry via AI Maestro REST API") and error table says "Run sync check via REST API"; must reference `ai-maestro-agents-management` skill |
| 34 | `skills/amcos-skill-management/references/validation-procedures.md` | HARDCODED_API | MEDIUM | Lines 914–916: `ps aux | grep ai-maestro` in Section 7.2 "PSS unavailable" Step 4; direct OS process introspection as fallback bypasses `ai-maestro-agents-management` skill health check already used in the same section |
| 35 | `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | CLI_SYNTAX | MEDIUM | Lines 110–115, 182–188: `uv run python scripts/amcos_team_registry.py log --event "project-handoff" --agent ... --timestamp ...` hardcoded inline; CLI syntax is fragile — must add `--help` deferral note or create stable wrapper script (NOTE: the call itself MUST be preserved per Harmonization Rule) |
| 36 | `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | LOCAL_REGISTRY | LOW | Line 151: `~/.ai-maestro/agent-states/[agent-name]-emergency.json` hardcoded as emergency state dump path; uses wrong prefix (`~/.ai-maestro/` vs actual `~/.aimaestro/`) and bypasses abstraction; must use `ai-maestro-agents-management` skill to request state dump |
| 37 | `skills/amcos-onboarding/references/op-deliver-role-briefing.md` | CLI_SYNTAX | LOW | Lines 96–105: `uv run python scripts/amcos_team_registry.py update-role --name ... --role ...` and `uv run python scripts/amcos_team_registry.py log --event "role-briefing" ...` hardcoded; CLI syntax is fragile (note argument inconsistency: `--name` vs `--agent`); must add `--help` deferral note (calls MUST be preserved) |
| 38 | `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` | CLI_SYNTAX | LOW | Lines 111–115, 183–188: `uv run python scripts/amcos_team_registry.py log --event "onboarding-complete" --agent ... --reason ...` hardcoded inline; must add `--help` deferral note (calls MUST be preserved) |
| 39 | `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` | CLI_SYNTAX | LOW | Lines 87–91: `uv run python scripts/amcos_team_registry.py log --event "restart" --agent ... --reason ...` hardcoded inline; must add `--help` deferral note (calls MUST be preserved) |
| 40 | `skills/amcos-resource-monitoring/SKILL.md` | HARDCODED_API | MEDIUM | Lines 136–146 (Example 1): macOS-specific bash block embedded (`top -l 1`, `vm_stat`, `df -h`) for CPU/memory/disk checks; platform-specific OS commands embedded where a runbook reference (`references/op-check-system-resources.md`) should be used instead |
| 41 | `skills/amcos-resource-monitoring/SKILL.md` | HARDCODED_GOVERNANCE | LOW | Lines 200–201, 214: Session limit thresholds hardcoded (conservative 10, normal 15, max 20) and alert type enumerations hardcoded (CPU_HIGH, MEMORY_LOW, DISK_FULL, SESSION_LIMIT, RATE_LIMIT, NETWORK_DOWN); must be discovered from AI Maestro configuration at runtime |
| 42 | `skills/amcos-skill-management/SKILL.md` | CLI_SYNTAX | HIGH | Lines 218–231 (Example 1): `pip install skills-ref` and `skills-ref validate /path/to/my-skill` and `skills-ref read-properties ...` embedded directly; third-party CLI syntax creates coupling — must defer to `references/op-validate-skill.md` runbook |
| 43 | `skills/amcos-skill-management/SKILL.md` | LOCAL_REGISTRY | MEDIUM | Lines 258–259 (Example 3): `cat ~/.claude/skills-index.json | jq '.skills | length'` — direct read of AI Maestro internal file path; must defer to `references/op-reindex-skills-pss.md` runbook instead |

---

## RECORD_KEEPING Items (PRESERVE — do NOT remove)

| # | File | What it records | Why it must stay |
|---|---|---|---|
| 1 | `skills/amcos-onboarding/references/op-restart-agent-plugin.md` | `amcos_team_registry.py log` call for restart events | AMCOS-internal audit logging; plugin's own tracking system |
| 2 | `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | `amcos_team_registry.py log` call for project-handoff events | AMCOS-internal audit logging; plugin's own tracking system |
| 3 | `skills/amcos-onboarding/references/op-deliver-role-briefing.md` | `amcos_team_registry.py update-role` and `log` for role briefings | AMCOS-internal role tracking and audit log |
| 4 | `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` | `amcos_team_registry.py log` for onboarding-complete events | AMCOS-internal audit logging; plugin's own tracking system |
| 5 | `commands/amcos-request-approval.md` | GovernanceRequest state machine diagram (`pending → local-approved / remote-approved → dual-approved → executed`) | AMCOS-specific workflow diagram; no equivalent in skill |
| 6 | `commands/amcos-request-approval.md` | Request ID format: `GR-YYYYMMDDHHMMSS-XXXXXXXX` | AMCOS-specific identity convention for tracking |
| 7 | `commands/amcos-request-approval.md` | Tracking file location: `~/.aimaestro/governance/pending/GR-*.json` | Canonical tracking path for governance requests |
| 8 | `commands/amcos-request-approval.md` | Error code table (429 → rate limited, 400 → wrong password, 404 → unknown targetManager) | Reference data for error handling |
| 9 | `commands/amcos-request-approval.md` | `--governance-password` parameter requirement for critical operations | Security requirement specific to AMCOS |
| 10 | `agents/amcos-approval-coordinator.md` | GovernanceRequest state machine diagram | AMCOS-specific workflow; must not be removed |
| 11 | `agents/amcos-approval-coordinator.md` | Approver tracking fields (sourceCOS, sourceManager, targetCOS, targetManager) | AMCOS-specific data model |
| 12 | `agents/amcos-approval-coordinator.md` | GovernanceRequest payload template (lines 56–70) | Reference template for building requests |
| 13 | `agents/amcos-approval-coordinator.md` | Escalation timeline (60s reminder → 90s urgent → 120s auto-action) | AMCOS-specific policy threshold |
| 14 | `agents/amcos-approval-coordinator.md` | Rate limit awareness rule (respect 429/Retry-After) | Implementation constraint |
| 15 | `agents/amcos-approval-coordinator.md` | Timeout enforcement policy | Implementation constraint |
| 16 | `agents/amcos-approval-coordinator.md` | Audit trail logging requirement | Compliance requirement |
| 17 | `agents/amcos-approval-coordinator.md` | Tracking location `~/.aimaestro/governance/pending/` | Storage path for pending requests |
| 18 | `agents/amcos-plugin-configurator.md` | ConfigOperationType enum (add-skill, remove-skill, add-plugin, remove-plugin, update-hooks, update-mcp, update-model, bulk-config) | AMCOS-specific type system |
| 19 | `agents/amcos-plugin-configurator.md` | Plugin scope table (local/project/user with settings file locations) | AMCOS-specific scope definitions |
| 20 | `agents/amcos-plugin-configurator.md` | Decision logic: same-host-same-team → direct; different-host-or-team → GovernanceRequest | AMCOS-specific routing policy |
| 21 | `commands/amcos-recovery-workflow.md` | 3-level recovery strategy table (Level 1: restart / Level 2: hibernate-wake / Level 3: replace) | AMCOS-specific escalation levels |
| 22 | `commands/amcos-recovery-workflow.md` | Decision guide table (symptom → recommended action) | AMCOS-specific runbook data |
| 23 | `commands/amcos-replace-agent.md` | 6-step replacement workflow | AMCOS-specific workflow definition |
| 24 | `commands/amcos-replace-agent.md` | Team boundary constraint: "Replacement must be within the same team" | AMCOS governance rule |
| 25 | `commands/amcos-check-approval-status.md` | Status value table (7 states: pending, approved, rejected, deferred, expired, completed, cancelled) | AMCOS-specific state definitions |
| 26 | `commands/amcos-notify-manager.md` | Rate limiting rules (max 1 status/hr per topic, max 3 issue reports/hr for same issue) | AMCOS-specific rate policy |
| 27 | `commands/amcos-notify-manager.md` | Message ID format: `msg-YYYYMMDDHHMMSS-XXXXXXXX` | AMCOS-specific identity convention |
| 28 | `commands/amcos-notify-manager.md` | Notification type table (8 types) | AMCOS-specific type definitions |
| 29 | `commands/amcos-wait-for-agent-ok.md` | Timeout behavior rationale ("orchestrator decides policy") | Design intent documentation |
| 30 | `commands/amcos-wait-for-agent-ok.md` | Default values (TIMEOUT=120, REMIND_INTERVAL=30) | Configuration constants |
| 31 | `commands/amcos-wait-for-agent-ok.md` | Exit code semantics (exits 0 on timeout, displays warning) | Interface contract |
| 32 | `commands/amcos-wait-for-approval.md` | Timeout recommendations table by operation type | AMCOS-specific policy data |
| 33 | `commands/amcos-wait-for-approval.md` | Return codes 0–5 (approved/rejected/timeout/deferred/error/cancelled) | Interface contract |
| 34 | `commands/amcos-wait-for-approval.md` | Adaptive polling interval strategy (0–60s: 5s; 60–180s: 10s; 180s+: 30s) | AMCOS-specific performance optimization |
| 35 | `commands/amcos-wait-for-approval.md` | Request ID format: `AMCOS-YYYYMMDDHHMMSS-XXXXXXXX` | AMCOS-specific identity convention (distinct from GR-* format) |
| 36 | `commands/amcos-performance-report.md` | Rating calculation formula (40% success + 30% completion time + 20% error rate + 10% retry rate) | AMCOS-specific analytics formula |
| 37 | `commands/amcos-performance-report.md` | Performance threshold table (>90% success, <4hr avg, <10% retry, <5% error) | AMCOS-specific KPI thresholds |
| 38 | `commands/amcos-performance-report.md` | Data retention: 90 days; refresh cycle: 15 minutes | AMCOS-specific operational parameters |
| 39 | `commands/amcos-health-check.md` | Health threshold table (Heartbeat <60s healthy, 60–300s degraded, >300s critical; Response <200ms healthy) | AMCOS-specific health definitions |
| 40 | `agents/amcos-resource-monitor.md` | Spawn-blocking threshold table (max_concurrent_agents 10, cpu_threshold 80%, memory_threshold 85%, disk_threshold 90%) | AMCOS-specific spawn policy |
| 41 | `agents/amcos-chief-of-staff-main-agent.md` | Governance Rules R6.1–R6.7 (messaging rules) | AMCOS-specific communication policy |
| 42 | `agents/amcos-chief-of-staff-main-agent.md` | Sub-agent routing table (task type → sub-agent) | AMCOS-specific orchestration map |
| 43 | `agents/amcos-chief-of-staff-main-agent.md` | Communication hierarchy diagram | Architecture reference |
| 44 | `shared/onboarding_checklist.md` | Pre-start resource threshold checklist (CPU 80%, Memory 85%, Disk 90%, MAX_CONCURRENT_AGENTS 10, MAX_AGENTS_PER_PROJECT 5) | AMCOS-specific spawn policy |
| 45 | `shared/onboarding_checklist.md` | Post-start verification timing (60 seconds), heartbeat check interval (300 seconds), onboarding retry policy (3 times then escalate) | AMCOS-specific operational timing |
| 46 | `docs/AGENT_OPERATIONS.md` | Role prefix table (amcos-, eaa-, eoa-, eia-, eama-); Kanban 8-column system definition; session naming convention rules | AMCOS canonical reference data |
| 47 | `docs/ROLE_BOUNDARIES.md` | Role boundary table; communication restrictions table; cross-team GovernanceRequest requirement rule | AMCOS governance definitions |
| 48 | `docs/TEAM_REGISTRY_SPECIFICATION.md` | Agent/team naming conventions; role type table; functional sub-role definitions; git commit and PR format; Kanban 8-column cross-reference | AMCOS-specific conventions |
| 49 | `shared/message_templates.md` | 13 message type definitions; priority level table; session name conventions; checkpoint structure | AMCOS canonical message catalog |
| 50 | `shared/handoff_template.md` | Handoff YAML schema; 6 handoff type definitions; communication hierarchy rule; storage location `docs_dev/handoffs/` | AMCOS canonical handoff format |
| 51 | `agents/amcos-staff-planner.md` | Max concurrent agents recommendation (4–6); context memory limit (100K tokens); output file naming convention | AMCOS planning policy |

---

## Files Confirmed Clean

The following files were audited across all 6 input reports and found to have zero violations:

**Governance Reference Files:**
- `skills/team-governance/SKILL.md`
- `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`

**AMCOS Docs:**
- `docs/AGENT_OPERATIONS.md`
- `docs/FULL_PROJECT_WORKFLOW.md`
- `docs/ROLE_BOUNDARIES.md`
- `docs/TEAM_REGISTRY_SPECIFICATION.md` (example curl commands use `$AIMAESTRO_API` env var — acceptable in documentation)

**Shared Templates:**
- `shared/handoff_template.md`
- `shared/message_templates.md`
- `shared/performance_report_template.md`

**Agent Files:**
- `agents/amcos-lifecycle-manager.md`
- `agents/amcos-recovery-coordinator.md`
- `agents/amcos-performance-reporter.md`
- `agents/amcos-resource-monitor.md`
- `agents/amcos-skill-validator.md`
- `agents/amcos-staff-planner.md`

**Command Files:**
- `commands/amcos-spawn-agent.md`
- `commands/amcos-terminate-agent.md`
- `commands/amcos-hibernate-agent.md`
- `commands/amcos-wake-agent.md`
- `commands/amcos-staff-status.md`
- `commands/amcos-health-check.md`
- `commands/amcos-resource-report.md`
- `commands/amcos-performance-report.md` (minor redundancy with AI Maestro monitoring, but AMCOS adds distinct rating calculation — acceptable)
- `commands/amcos-reindex-skills.md`
- `commands/amcos-transfer-work.md`
- `commands/amcos-notify-agents.md`
- `commands/amcos-broadcast-notification.md`
- `commands/amcos-install-skill-notify.md`
- `commands/amcos-configure-plugins.md`
- `commands/amcos-wait-for-approval.md`

**Skill SKILL.md Entry Points:**
- `skills/amcos-plugin-management/SKILL.md`
- `skills/amcos-onboarding/SKILL.md`
- `skills/amcos-performance-tracking/SKILL.md`

**Skill Reference Files (ops-planning categories):**
- `skills/amcos-plugin-management/references/catalog-management.md`
- `skills/amcos-plugin-management/references/compatibility-checking.md`
- `skills/amcos-plugin-management/references/dependency-resolution.md`
- `skills/amcos-plugin-management/references/install-procedures.md`
- `skills/amcos-plugin-management/references/op-install-plugin.md`
- `skills/amcos-plugin-management/references/op-update-plugin.md`
- `skills/amcos-plugin-management/references/op-verify-plugin.md`
- `skills/amcos-plugin-management/references/plugin-testing.md`
- `skills/amcos-plugin-management/references/version-management.md`
- `skills/amcos-skill-management/references/op-validate-skill.md`
- `skills/amcos-skill-management/references/skill-catalog.md`
- `skills/amcos-skill-management/references/skill-quality-standards.md`
- `skills/amcos-onboarding/references/op-prepare-agent-workspace.md`
- `skills/amcos-onboarding/references/op-verify-agent-readiness.md`
- `skills/amcos-onboarding/references/workspace-templates.md`
- All 7 files in `skills/amcos-staff-planning/references/`
- All 7 files in `skills/amcos-resource-monitoring/references/`
- All 7 files in `skills/amcos-performance-tracking/references/`
- `skills/amcos-label-taxonomy/references/label-schema.md`

**Session Memory Library Files (all 5 integration reference files):**
- `skills/amcos-session-memory-library/references/ai-maestro-integration.md` (conceptual-only; no hardcoded endpoints)
- `skills/amcos-session-memory-library/references/error-handling.md`
- `skills/amcos-session-memory-library/references/state-file-format.md`
- `skills/amcos-session-memory-library/references/14-context-sync-part1-foundations.md`
- `skills/amcos-session-memory-library/references/14-context-sync-part2-advanced.md`

---

## De-duplication Notes

The following violations were reported in multiple source files and have been merged into single entries above:

- Violations 1–3 (label taxonomy reference files) appeared in both `deep-audit-AMCOS-ops-planning-2026-02-27.md` and `gap-fill-AMCOS-batch1.md`. The batch1 report provides more precise line numbers (93–95, 117–119, 257–268) which are used in the table.
- Violation 4 (remote-plugin-management.md HARDCODED_AMP) appeared only in the ops-planning report.
- Violations 5–8 (skill-management LOCAL_REGISTRY) appeared only in the ops-planning report.
- Violations 9–28 (toplevel commands and agents) appeared only in `deep-audit-AMCOS-toplevel-2026-02-27.md`.
- Violations 29–34 (label taxonomy SKILL.md and validation-procedures.md) appeared only in `gap-fill-AMCOS-batch1.md`.
- Violations 35–39 (onboarding and plugin-management CLI_SYNTAX) appeared only in `gap-fill-AMCOS-batch2.md`.
- Violations 40–43 (resource-monitoring and skill-management SKILL.md) appeared only in `gap-fill-AMCOS-batch3.md`.
- The session-memory audit (`deep-audit-AMCOS-session-memory-2026-02-27.md`) found ZERO violations; all findings were clean or RECORD_KEEPING items.

---

## Priority Fix Order

### CRITICAL (fix first — blocks correct governance flow)
- `commands/amcos-request-approval.md` (#9, #10, #11, #12, #13)
- `commands/amcos-transfer-agent.md` (#14, #15)

### MAJOR (fix second)
- `agents/amcos-approval-coordinator.md` (#16, #17)
- `commands/amcos-validate-skills.md` (#18)

### HIGH (fix third — direct API calls in skill bodies)
- `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` (#1)
- `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` (#2)
- `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` (#3)
- `skills/amcos-label-taxonomy/SKILL.md` (#29, #30, #31, #32, #33)
- `skills/amcos-skill-management/references/op-configure-pss-integration.md` (#5)
- `skills/amcos-skill-management/references/op-reindex-skills-pss.md` (#6)
- `skills/amcos-skill-management/references/pss-integration.md` (#7)
- `skills/amcos-skill-management/references/skill-reindexing.md` (#8)
- `skills/amcos-skill-management/SKILL.md` (#42)

### MEDIUM (fix fourth)
- `skills/amcos-plugin-management/references/remote-plugin-management.md` (#4)
- `skills/amcos-skill-management/references/validation-procedures.md` (#34)
- `skills/amcos-onboarding/references/op-conduct-project-handoff.md` (#35, #36)
- `skills/amcos-resource-monitoring/SKILL.md` (#40)
- `skills/amcos-skill-management/SKILL.md` (#43)
- `commands/amcos-notify-manager.md` (#19, #20)
- `agents/amcos-plugin-configurator.md` (#23)
- `commands/amcos-check-approval-status.md` (#24)

### MINOR / LOW (fix last)
- `agents/amcos-chief-of-staff-main-agent.md` (#21)
- `agents/amcos-team-coordinator.md` (#22)
- `commands/amcos-wait-for-agent-ok.md` (#25)
- `commands/amcos-recovery-workflow.md` (#26)
- `commands/amcos-replace-agent.md` (#27)
- `shared/onboarding_checklist.md` (#28)
- `skills/amcos-onboarding/references/op-deliver-role-briefing.md` (#37)
- `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` (#38)
- `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` (#39)
- `skills/amcos-resource-monitoring/SKILL.md` (#41)
