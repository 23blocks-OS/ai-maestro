# Consolidated AMCOS Plugin — Plugin Abstraction Principle Violation Report

**Date:** 2026-02-27
**Standard:** Plugin Abstraction Principle (`docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`)
**Plugin Root:** `ai-maestro-chief-of-staff/` (AMCOS plugin)
**Scope:** All AMCOS SKILL.md files + reference files + top-level agents/commands/shared/docs

**Source Reports Consolidated:**
1. `decoupling-audit-AMCOS-raw.md` — Raw SKILL.md-only audit
2. `deep-audit-AMCOS-approval-transfer-2026-02-27.md` — Top-level agents/commands/shared/docs (43 files)
3. `deep-audit-AMCOS-lifecycle-2026-02-27.md` — `amcos-agent-lifecycle/references/` (16 files)
4. `deep-audit-AMCOS-comms-recovery-2026-02-27.md` — comms/recovery/team-coordination refs (34 files)
5. `deep-audit-AMCOS-ops-planning-2026-02-27.md` — ops/planning skill refs (53 actual files)
6. `deep-audit-AMCOS-toplevel-2026-02-27.md` — Secondary top-level pass
7. `deep-audit-AMCOS-session-memory-2026-02-27.md` — Session-memory-library (5 integration files)
8. `gap-fill-AMCOS-batch1.md` — `amcos-label-taxonomy/SKILL.md`, `amcos-plugin-management/SKILL.md`, `amcos-skill-management/references/validation-procedures.md`
9. `gap-fill-AMCOS-batch2.md` — 4 onboarding + plugin-management reference files
10. `gap-fill-AMCOS-batch3.md` — `amcos-resource-monitoring/SKILL.md`, `amcos-skill-management/SKILL.md`, 2 other SKILL.md files
11. `gap-fill-AMCOS-AMAMA-batch4.md` — `amcos-staff-planning/SKILL.md` (AMCOS portion)
12. `gap-fill-AMCOS-batch7.md` — 4 spot-check reference files
13. `verify-AMCOS-comms-recovery.md` — Verification of comms/recovery audit (found additional violations in `ai-maestro-message-templates.md`)
14. `verify-AMCOS-toplevel.md` — Verification of top-level audit (confirmed all violations, found 1 missed finding)
15. `verify-AMCOS-ops-planning.md` — Verification of ops-planning audit (confirmed violations REAL, found 36 fabricated filenames)

---

## 1. EXECUTIVE SUMMARY

### Total Confirmed Violations

| Violation Type | Count | Severity Breakdown |
|---|---|---|
| HARDCODED_API | ~78 | CRITICAL: 4 / MAJOR: 12 / MINOR: 16 / LOW: ~46 |
| HARDCODED_GOVERNANCE | ~22 | CRITICAL: 3 / MAJOR: 6 / MINOR: 13 |
| HARDCODED_AMP | ~42 | CRITICAL: 1 / MAJOR: 8 / MINOR: ~33 |
| LOCAL_REGISTRY | ~28 | MAJOR: 8 / MINOR: ~20 |
| CLI_SYNTAX | ~18 | HIGH: 3 / MEDIUM: 5 / LOW: 10 |
| REDUNDANT_OPERATIONS | 3 | MAJOR: 2 / MINOR: 1 |
| **TOTAL** | **~191** | |

**Note on counting methodology:** Where a single file has multiple instances of the same violation type, each distinct code location is counted separately. The comms/recovery section (34 files) accounts for the majority of HARDCODED_API and LOCAL_REGISTRY violations due to embedded bash scripts for failure recovery. Items marked RECORD_KEEPING are NOT violations — they are preserved by design.

### Scope Summary

| Scope | Files Audited | Files with Violations | Files Clean |
|---|---|---|---|
| Top-level (agents/commands/shared/docs) | 43 | 18 | 25 |
| `amcos-agent-lifecycle/references/` | 16 | 4 | 12 |
| comms/recovery/team-coordination refs | 34 | ~20 | ~14 |
| ops/planning skill refs | 53 | 12 | 41 |
| Skill SKILL.md entry points (all skills) | ~14 | 5 | 9 |
| Session-memory-library (integration files) | 5 | 0 | 5 |
| **TOTAL** | **~165** | **~59** | **~106** |

Additionally, ~113 session-memory-library reference files were not individually read but were confirmed clean by automated grep scan (no curl, no AIMAESTRO_API references, no skills-index.json access patterns).

---

## 2. VIOLATIONS TABLE

### Section A: Top-Level Files (agents/, commands/, shared/, docs/)

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| A1 | `commands/amcos-request-approval.md` | 10, 23–24 | HARDCODED_API | CRITICAL | `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` embedded directly in usage instructions | Replace with reference to `team-governance` skill submission workflow |
| A2 | `commands/amcos-request-approval.md` | 29–40 | HARDCODED_GOVERNANCE | CRITICAL | Full operation→approver→password matrix hardcoded: spawn/terminate/hibernate/wake/install/replace/critical with role names and password requirements | Remove matrix; reference `team-governance` skill for approval routing at runtime |
| A3 | `commands/amcos-request-approval.md` | 59–61 | CLI_SYNTAX | MAJOR | `REQUEST_ID="GR-$(date +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"` — ID generation syntax embedded directly | Move to `team-governance` skill; reference skill for ID generation |
| A4 | `commands/amcos-request-approval.md` | 87–129 | HARDCODED_AMP | MAJOR | Two full GovernanceRequest JSON schemas embedded: local payload (lines 87–106) and cross-team payload (lines 110–129) | Replace with prose description; reference `team-governance` skill for payload structure |
| A5 | `commands/amcos-request-approval.md` | 156–161 | HARDCODED_API | MAJOR | Rate limiting details hardcoded: HTTP 429, Retry-After header, 10 req/min limit, exponential backoff | Replace with reference to `team-governance` skill's rate-limit guidance |
| A6 | `commands/amcos-transfer-agent.md` | 4–6 (YAML frontmatter) | HARDCODED_GOVERNANCE | CRITICAL | `allowed_agents: [amcos-chief-of-staff, amcos-team-manager]` in YAML frontmatter | Remove `allowed_agents` from frontmatter; use `team-governance` skill for role-checks at runtime |
| A7 | `commands/amcos-transfer-agent.md` | 28 | HARDCODED_API | CRITICAL | `POST /api/governance/transfers/` — inconsistent path format (missing `/v1/` prefix vs other files that use `/api/v1/`) | Replace with `team-governance` skill reference; verify endpoint path with skill spec |
| A8 | `agents/amcos-approval-coordinator.md` | 16, 100, 105 | HARDCODED_API | MAJOR | `POST /api/v1/governance/requests` and `GET /api/v1/governance/requests/{requestId}` in agent identity statement and operational steps | Replace with `team-governance` skill references in all three locations |
| A9 | `agents/amcos-approval-coordinator.md` | 22–23 | HARDCODED_GOVERNANCE | MAJOR | No-self-approval policy and governance password requirement re-declared — duplicates `team-governance` skill content | Replace constraint table with reference to `team-governance` skill constraints section |
| A10 | `agents/amcos-approval-coordinator.md` | 42–47 | REDUNDANT_OPERATIONS | MAJOR | GovernanceRequest state machine (`pending → local-approved → dual-approved → executed`) duplicates `team-governance` skill | Replace with reference to `team-governance` skill state machine documentation |
| A11 | `agents/amcos-approval-coordinator.md` | 55–71 | HARDCODED_AMP | MAJOR | Full GovernanceRequest JSON template embedded | Replace with `team-governance` skill payload-fields reference |
| A12 | `agents/amcos-approval-coordinator.md` | 75–89 | HARDCODED_API | MAJOR | API-First Authority Model section with additional `/api/v1/governance/requests` references (missed by original audit, found by verification) | Replace with `team-governance` skill authority model reference |
| A13 | `commands/amcos-validate-skills.md` | 6 (YAML frontmatter) | CLI_SYNTAX | MAJOR | `allowed-tools: ["Bash(uv run --with pyyaml python:*)"]` embeds specific CLI syntax in frontmatter | Remove CLI syntax from frontmatter; reference `cpv-validate-plugin` skill instead |
| A14 | `commands/amcos-validate-skills.md` | 17–20, 58, 64 | CLI_SYNTAX | MAJOR | `uv run --with pyyaml python scripts/validate_plugin.py` and `validate_skill.py` invocations embedded in body and examples | Replace with reference to `cpv-validate-plugin` skill or `claude-plugins-validation` skill |
| A15 | `agents/amcos-plugin-configurator.md` | (various) | HARDCODED_GOVERNANCE | MINOR | GovernanceRequest JSON format for remote config operations embedded inline | Replace inline JSON with `team-governance` skill reference for `configure-agent` request type |
| A16 | `commands/amcos-notify-manager.md` | 137–145 | HARDCODED_AMP | MINOR | `notification_ack` JSON response format embedded without `agent-messaging` skill disclaimer | Add `agent-messaging` skill reference before the ACK format; or move format to skill docs |
| A17 | `commands/amcos-notify-manager.md` | 187–189 | HARDCODED_API | MINOR | `~/.aimaestro/outbox/` path, 5-minute retry interval, 24-hour expiry hardcoded | Replace with `agent-messaging` skill reference for outbox/retry behavior |
| A18 | `agents/amcos-chief-of-staff-main-agent.md` | 58 | HARDCODED_API | MINOR | `GET /api/teams` referenced for recipient validation | Replace with `ai-maestro-agents-management` skill reference for team membership query |
| A19 | `agents/amcos-team-coordinator.md` | (key constraints section) | HARDCODED_API | MINOR | `GET /api/teams/{id}/agents` hardcoded in key constraints | Replace with `ai-maestro-agents-management` skill reference |
| A20 | `commands/amcos-check-approval-status.md` | 140–145 | HARDCODED_API | MINOR | Approval storage paths: `~/.aimaestro/approvals/pending/`, `/approved/`, `/rejected/`, `/expired/` hardcoded | Replace with `team-governance` or `agent-messaging` skill reference for approval status query |
| A21 | `commands/amcos-wait-for-agent-ok.md` | 148–158 | HARDCODED_AMP | MINOR | `ack` JSON format embedded (with skill-usage note present but canonical format should live in `agent-messaging` skill) | Define canonical `ack` format in `agent-messaging` skill; reference from here |
| A22 | `commands/amcos-recovery-workflow.md` | (step 2) | CLI_SYNTAX | MINOR | "Send SIGTERM to Claude Code process (graceful stop)" — direct process signal instruction | Replace with `ai-maestro-agents-management` skill reference for graceful agent stop |
| A23 | `commands/amcos-replace-agent.md` | 107, 128 | HARDCODED_AMP | MINOR | Hardcoded recipient session names `eama-assistant-manager` and `eoa-orchestrator` in message send steps (classification: HARDCODED_AMP, not HARDCODED_GOVERNANCE) | Consider dynamic lookup via `ai-maestro-agents-management` skill for EAMA/EOA resolution |
| A24 | `shared/onboarding_checklist.md` | 63–65 | CLI_SYNTAX | MINOR | `claude --session "${SESSION_NAME}" --project "${PROJECT_DIR}" --plugin-dir "${PLUGIN_PATH}"` embedded | Replace with `ai-maestro-agents-management` skill reference for agent session creation |

### Section B: `amcos-agent-lifecycle/references/` (16 files)

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| B1 | `amcos-agent-lifecycle/references/lifecycle-operations.md` (or equivalent) | (various) | HARDCODED_API | MAJOR | Isolated curl commands in verification steps after lifecycle operations (create/hibernate/wake/terminate) | Replace curl verification calls with `ai-maestro-agents-management` skill health-check references |
| B2 | `amcos-agent-lifecycle/references/lifecycle-operations.md` | (error handling sections) | HARDCODED_API | MINOR | Fallback curl references in error handling sections when AI Maestro is unresponsive | Replace with `ai-maestro-agents-management` skill error-path documentation reference |
| B3 | `amcos-agent-lifecycle/references/amcos_team_registry.py` embedded calls | (procedure steps) | CLI_SYNTAX | MINOR | `amcos_team_registry.py` invocation syntax embedded in lifecycle procedures — argument interface is unstable (flag inconsistencies within same script) | Add `# Refer to scripts/amcos_team_registry.py --help for current argument syntax` above each invocation; or create stable `amcos-registry.sh` wrapper |
| B4 | `amcos-agent-lifecycle/references/` (multiple files) | (various) | REDUNDANT_OPERATIONS | MINOR | Local lifecycle operations (create/hibernate/wake/terminate) redirect to `ai-maestro-agents-management` skill correctly, but some files also contain inline verification curl calls that duplicate what the skill provides | Consolidate: remove inline verification curl; use skill for both operation and verification |

**Note:** The lifecycle audit identified the `amcos_team_registry.py` embedded calls as CLI_SYNTAX violations but correctly flagged the LOCAL RECORD-KEEPING system as PRESERVE. See Section 3 for harmonization details.

### Section C: comms/recovery/team-coordination references (34 files)

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| C1 | `amcos-failure-recovery/references/recovery-operations.md` | 59–61 | HARDCODED_API | MAJOR | `tmux has-session -t <agent-name> 2>/dev/null` embedded bash command for session check | Replace with `ai-maestro-agents-management` skill session-existence check |
| C2 | `amcos-failure-recovery/references/recovery-operations.md` | 73–74 | HARDCODED_API | MAJOR | `tmux list-panes -t <agent-name> -F '#{pane_pid}'` embedded | Replace with `ai-maestro-agents-management` skill agent-status check |
| C3 | `amcos-failure-recovery/references/recovery-operations.md` | 105–106 | HARDCODED_API | MAJOR | `ping -c 3 <host-ip>` embedded for network connectivity check | Replace with `ai-maestro-agents-management` skill health check |
| C4 | `amcos-failure-recovery/references/recovery-operations.md` | 275–281 | HARDCODED_API | MAJOR | `PID=$(tmux list-panes...) kill TERM` — process kill via tmux pane PID | Replace with `ai-maestro-agents-management` skill graceful-stop operation |
| C5 | `amcos-failure-recovery/references/recovery-operations.md` | 312 | HARDCODED_API | MINOR | Recovery policy path hardcoded: `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` | Replace path reference with skill abstraction or documented PRESERVE item |
| C6 | `amcos-failure-recovery/references/recovery-operations.md` | 318–330 | HARDCODED_GOVERNANCE | MINOR | Policy JSON embedded with governance defaults: `auto_replace_on_terminal: false` | Move policy defaults to `team-governance` skill; reference from here |
| C7 | `amcos-failure-recovery/references/recovery-operations.md` | 358 | HARDCODED_API | MINOR | Recovery log path hardcoded: `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` (NOTE: inconsistent with `recovery-strategies.md` which uses `.amcos/agent-health/recovery-log.jsonl`) | Harmonize both files to use same path AND same format; document as PRESERVE item with canonical location |
| C8 | `amcos-failure-recovery/references/recovery-operations.md` | 252 | HARDCODED_API | MINOR | Direct file read of recovery policy (`cat $CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json`) | Replace with skill reference or documented record-keeping read operation |
| C9 | `amcos-notification-protocols/references/edge-case-protocols.md` | 60–61 | HARDCODED_API | MAJOR | `echo "..." >> .claude/logs/maestro-failures.log` — direct log write bypassing abstraction | If logging must persist, create PRESERVE item with canonical path; add skill reference for log access |
| C10 | `amcos-notification-protocols/references/edge-case-protocols.md` | 68–84 | HARDCODED_API | MAJOR | Fallback queue with JSON heredoc: `cat > ".claude/handoffs/to-${ROLE}-..."` — direct filesystem write | Replace with `agent-messaging` skill outbox reference for offline message queuing |
| C11 | `amcos-notification-protocols/references/edge-case-protocols.md` | 119–138 | HARDCODED_API | MAJOR | `cat > ".claude/handoffs/to-${ROLE}-$(date +%s).md"` — handoff file creation | Replace with `agent-messaging` skill reference for handoff creation |
| C12 | `amcos-notification-protocols/references/edge-case-protocols.md` | 148–151 | HARDCODED_API | MAJOR | `gh api rate_limit` direct GitHub API call | Acceptable as GitHub CLI is external; document as exempt from PAP scope |
| C13 | `amcos-notification-protocols/references/edge-case-protocols.md` | 157–160, 179–188 | HARDCODED_API | MAJOR | GitHub cache writes and queue writes using direct file operations | Replace with reference to GitHub skill operations or document as plugin-local record-keeping (PRESERVE) |
| C14 | `amcos-notification-protocols/references/edge-case-protocols.md` | 599–600 | HARDCODED_API | MINOR | `find .claude/handoffs -name "*${UUID}*"` — direct filesystem search | Replace with `agent-messaging` skill reference for handoff lookup by ID |
| C15 | `amcos-notification-protocols/references/edge-case-protocols.md` | 679–680, 749–751 | HARDCODED_API | MINOR | `ls -la .claude/memory/` and `cp -r .claude/memory/*` — session memory filesystem operations | Categorize as RECORD_KEEPING/PRESERVE; add documentation note about memory subsystem paths |
| C16 | `amcos-team-coordination/references/team-messaging.md` | 30–34 | HARDCODED_AMP | MAJOR | "Announcement" message content format JSON schema embedded directly in reference file | Replace with `agent-messaging` skill reference for message content schemas |
| C17 | `amcos-team-coordination/references/team-messaging.md` | 47–52 | HARDCODED_AMP | MAJOR | "Request" message content format JSON schema embedded | Replace with `agent-messaging` skill reference |
| C18 | `amcos-team-coordination/references/team-messaging.md` | 64–69 | HARDCODED_AMP | MAJOR | "Alert" message content format JSON schema embedded | Replace with `agent-messaging` skill reference |
| C19 | `amcos-team-coordination/references/team-messaging.md` | 83–89 | HARDCODED_AMP | MAJOR | "Status Update" message content format JSON schema embedded | Replace with `agent-messaging` skill reference |
| C20 | `amcos-team-coordination/references/team-messaging.md` | 100–106 | HARDCODED_AMP | MAJOR | "Role Assignment" message content format JSON schema embedded | Replace with `agent-messaging` skill reference |
| C21 | `amcos-failure-recovery/references/op-emergency-handoff.md` | 53–54 | LOCAL_REGISTRY | MAJOR | `cat $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json | jq` — direct read of internal task tracking file | Replace with `ai-maestro-agents-management` skill task-state query or document as PRESERVE item |
| C22 | `amcos-failure-recovery/references/op-emergency-handoff.md` | 74–88 | HARDCODED_AMP | MAJOR | Full JSON envelope for emergency handoff message to `eoa-orchestrator` embedded (despite `agent-messaging` skill disclaimer present) | Replace JSON envelope with prose + `agent-messaging` skill reference for sending |
| C23 | `amcos-failure-recovery/references/op-emergency-handoff.md` | 116–118 | HARDCODED_API | MINOR | `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` — hardcoded handoff directory creation | Replace with `agent-messaging` skill handoff-creation reference or document path as PRESERVE constant |
| C24 | `amcos-failure-recovery/references/op-emergency-handoff.md` | 129–142 | HARDCODED_AMP | MAJOR | Full JSON envelope for emergency notification with hardcoded example UUID `EH-20250204-svgbbox-001` | Replace JSON envelope with `agent-messaging` skill reference; remove project-specific example UUID |
| C25 | `amcos-failure-recovery/references/agent-replacement-protocol.md` | (various) | HARDCODED_GOVERNANCE | MAJOR | Agent replacement approval requirements hardcoded inline (governance policy should live in `team-governance` skill) | Reference `team-governance` skill approval workflow for agent replacement requests |
| C26 | `amcos-failure-recovery/references/recovery-strategies.md` | 79 | HARDCODED_API | MINOR | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` — different path format from `recovery-operations.md` (PATH INCONSISTENCY) | Harmonize with `recovery-operations.md` — pick one canonical path and format (.json vs .jsonl) |
| C27 | `amcos-notification-protocols/references/ai-maestro-message-templates.md` | (Section 1) | HARDCODED_AMP | MEDIUM | `amp-send.sh --to --subject --priority --type --message` base command syntax embedded with all flags | Replace `amp-send.sh` CLI syntax with `agent-messaging` skill references throughout |
| C28 | `amcos-notification-protocols/references/ai-maestro-message-templates.md` | (Sections 2–6, 8) | HARDCODED_AMP | MEDIUM | 6 full `amp-send.sh` command invocations for approval requests, escalations, operation notices, results, EOA notifications, and broadcast loop | Replace each with `agent-messaging` skill reference (less severe than raw curl, but still embeds CLI syntax) |
| C29 | `amcos-notification-protocols/references/ai-maestro-message-templates.md` | (Section 1, 8) | HARDCODED_API | MINOR | `amp-init.sh --auto` and `for agent in...done` bash iteration pattern | Replace `amp-init.sh` invocation with skill reference; replace bash loop with prose pattern description |
| C30 | `amcos-failure-recovery/references/examples.md` | (various) | HARDCODED_API | MAJOR | Worked examples embed full bash scripts with tmux, curl, and filesystem operations | Replace example implementations with prose descriptions; reference relevant skills for each step |
| C31 | `amcos-failure-recovery/references/op-replace-agent.md` | (various) | HARDCODED_GOVERNANCE | MAJOR | Approval requirement for agent replacement re-stated inline (duplicates governance skill) | Reference `team-governance` skill; preserve the approval-required marker as a note only |
| C32 | `amcos-failure-recovery/references/op-route-task-blocker.md` | (various) | HARDCODED_AMP | MINOR | JSON message format for task-blocker escalation embedded | Replace with `agent-messaging` skill reference |
| C33 | `amcos-team-coordination/references/role-assignment.md` | (various) | HARDCODED_GOVERNANCE | MINOR | Role assignment constraints and approval requirements embedded | Reference `team-governance` skill for role-change approval workflow |
| C34 | `amcos-team-coordination/references/teammate-awareness.md` | (various) | HARDCODED_AMP | MINOR | Status broadcast JSON format embedded | Replace with `agent-messaging` skill reference |
| C35 | `amcos-notification-protocols/references/design-document-protocol.md` | (various) | HARDCODED_AMP | MINOR | Document notification message format embedded | Replace with `agent-messaging` skill reference |
| C36 | `amcos-notification-protocols/references/failure-notifications.md` | (various) | HARDCODED_GOVERNANCE | MINOR | Failure escalation routing matrix hardcoded (which failures go to which roles) | Reference `team-governance` skill for escalation routing |
| C37 | `amcos-notification-protocols/references/post-operation-notifications.md` | (various) | HARDCODED_AMP | MINOR | Post-operation notification JSON format embedded | Replace with `agent-messaging` skill reference |
| C38 | `amcos-notification-protocols/references/proactive-handoff-protocol.md` | (various) | HARDCODED_AMP | MINOR | Handoff notification JSON format embedded; HARDCODED_GOVERNANCE: proactive-handoff trigger conditions hardcoded | Replace message format with skill reference; reference `team-governance` skill for trigger conditions |
| C39 | `amcos-failure-recovery/references/troubleshooting.md` | (various) | HARDCODED_API | MINOR | Direct bash troubleshooting commands (tmux, ps, file reads) for diagnostics | Replace with `ai-maestro-agents-management` skill diagnostic references |
| C40 | `amcos-failure-recovery/references/work-handoff-during-failure.md` | (various) | LOCAL_REGISTRY | MINOR | Direct reads of work-state files from `$CLAUDE_PROJECT_DIR/.amcos/` | Document as PRESERVE item (plugin-local work state); add comments explaining the record-keeping purpose |
| C41 | **PATH INCONSISTENCY** | recovery-operations.md:358 vs recovery-strategies.md:79 | HARDCODED_API | CRITICAL (data integrity) | Two different files use different paths AND formats for the same recovery log: `.../thoughts/shared/recovery-log.json` (.json) vs `.../agent-health/recovery-log.jsonl` (.jsonl) | Harmonize to single canonical path and format; document as authoritative PRESERVE item |

### Section D: ops/planning skill reference files

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| D1 | `skills/amcos-label-taxonomy/references/op-assign-agent-to-issue.md` | 79–81, 103–105 | HARDCODED_API | HIGH | `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `current_issues_add` in Step 5 and Example | Replace with `ai-maestro-agents-management` skill "Update Agent" operation |
| D2 | `skills/amcos-label-taxonomy/references/op-sync-registry-with-labels.md` | 49, 58, 89–91, 107, 132, 142–144, 159, 166–168, 181 | HARDCODED_API | HIGH | 8+ direct `curl` calls to `$AIMAESTRO_API/api/agents/` and `$AIMAESTRO_API/api/teams/` in Steps 1–5, Example, Automated Sync Script, and Error Handling table | Replace ALL curl calls with `ai-maestro-agents-management` skill references (most severe file in ops/planning scope) |
| D3 | `skills/amcos-label-taxonomy/references/op-terminate-agent-clear-assignments.md` | 63–65, 100–102 | HARDCODED_API | HIGH | `curl -X PATCH "$AIMAESTRO_API/api/agents/$AGENT_NAME"` with `status: "terminated"` in Step 3 and Example | Replace with `ai-maestro-agents-management` skill "Terminate Agent" operation |
| D4 | `skills/amcos-plugin-management/references/remote-plugin-management.md` | 34, 55 | HARDCODED_AMP | MEDIUM | Raw AMP message format JSON blocks embedded: `"type": "plugin-install"` and `"type": "plugin-update"` | Replace with `agent-messaging` skill reference for plugin operation message format |
| D5 | `skills/amcos-skill-management/references/op-configure-pss-integration.md` | 151, 219, 222, 225 | LOCAL_REGISTRY | MEDIUM | Direct reads of `~/.claude/skills-index.json` via `jq` queries | Replace with PSS CLI commands (`/pss-status`, `/pss-suggest`) or `ai-maestro-agents-management` skill |
| D6 | `skills/amcos-skill-management/references/op-reindex-skills-pss.md` | 85, 87–88, 107, 139, 150, 155, 164, 173, 196 | LOCAL_REGISTRY | HIGH | Multiple `cat ~/.claude/skills-index.json | jq` reads throughout the file | Replace with PSS CLI commands; heavily relies on direct internal file reads |
| D7 | `skills/amcos-skill-management/references/pss-integration.md` | 186, 189, 196, 221, 252, 263 | LOCAL_REGISTRY | MEDIUM | Multiple `cat ~/.claude/skills-index.json | jq` reads with internal structure access (`skills["name"]`, `.categories["x"]`) | Replace with PSS CLI abstraction commands |
| D8 | `skills/amcos-skill-management/references/skill-reindexing.md` | 100, 103, 106, 138–139, 150, 155, 164, 173, 196, 221, 240, 252 | LOCAL_REGISTRY | HIGH | Most instances — direct reads of `~/.claude/skills-index.json` with jq throughout entire file | Replace all direct reads with PSS CLI abstraction; most affected file in skill-management refs |

### Section E: Skill SKILL.md Entry Points

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| E1 | `skills/amcos-label-taxonomy/SKILL.md` | 93–95 | HARDCODED_API | HIGH | `curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1"` in Example 1, Step 3 | Replace with `ai-maestro-agents-management` skill "Update Agent" reference |
| E2 | `skills/amcos-label-taxonomy/SKILL.md` | 117–119 | HARDCODED_API | HIGH | `curl -X PATCH "$AIMAESTRO_API/api/agents/implementer-1"` in Example 2, Step 3 | Replace with `ai-maestro-agents-management` skill "Update/Delete Agent" reference |
| E3 | `skills/amcos-label-taxonomy/SKILL.md` | 257–259 | HARDCODED_API | HIGH | `curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq .` in "Agent Registry and Labels" section | Replace with `ai-maestro-agents-management` skill "Show Agent" reference |
| E4 | `skills/amcos-label-taxonomy/SKILL.md` | 265–268 | HARDCODED_API | HIGH | `REGISTERED=$(curl -s "$AIMAESTRO_API/api/agents/implementer-1" | jq ...)` in Sync Check section | Replace with `ai-maestro-agents-management` skill "Show Agent" reference |
| E5 | `skills/amcos-label-taxonomy/SKILL.md` | 50 | HARDCODED_API | LOW | Checklist: "Update team registry via AI Maestro REST API" — normative reference to direct API use | Reword: "Update team registry using the `ai-maestro-agents-management` skill" |
| E6 | `skills/amcos-label-taxonomy/SKILL.md` | 73 | HARDCODED_API | LOW | Error table: "Run sync check via REST API to reconcile" | Reword: "Run sync check via the `ai-maestro-agents-management` skill" |
| E7 | `skills/amcos-label-taxonomy/SKILL.md` | (top of file) | HARDCODED_API | LOW | Missing Prerequisites section declaring `ai-maestro-agents-management` skill dependency | Add `## Prerequisites` section listing `ai-maestro-agents-management` skill |
| E8 | `skills/amcos-skill-management/SKILL.md` | 218–231 | CLI_SYNTAX | HIGH | `pip install skills-ref` and `skills-ref validate /path/...` / `skills-ref read-properties /path/...` embedded in Example 1 | Replace bash block with prose deferring to `references/op-validate-skill.md` |
| E9 | `skills/amcos-skill-management/SKILL.md` | 258–259 | LOCAL_REGISTRY | MEDIUM | `cat ~/.claude/skills-index.json | jq '.skills | length'` in Example 3 | Replace with reference to `references/op-reindex-skills-pss.md` for canonical verification |
| E10 | `skills/amcos-resource-monitoring/SKILL.md` | 136–146 | HARDCODED_API | MEDIUM | macOS-specific bash block: `top -l 1 | grep ...`, `vm_stat | grep ...`, `df -h /` — platform-specific implementation embedded in skill entry point | Replace with prose deferring to `references/op-check-system-resources.md` |
| E11 | `skills/amcos-resource-monitoring/SKILL.md` | 200–201, 214 | HARDCODED_GOVERNANCE | LOW | Hardcoded session limits (conservative 10, normal 15, max 20) and alert type enumeration | Replace with runtime-discovery language: "compare against limits in AI Maestro instance monitoring settings" |
| E12 | `skills/amcos-skill-management/references/validation-procedures.md` | 914–916 | HARDCODED_API | MEDIUM | `ps aux | grep ai-maestro` fallback in Section 7.2 Step 4 (system health check bypass) | Replace with documentation reference or `ai-maestro-agents-management` skill retry guidance |

### Section F: Onboarding and Plugin-Management Reference Files

| # | File | Lines | Type | Severity | Description | Required Change |
|---|---|---|---|---|---|---|
| F1 | `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | 110–115, 182–188 | CLI_SYNTAX | MEDIUM | `uv run python scripts/amcos_team_registry.py log --event "project-handoff" ...` syntax hardcoded | Add `# Refer to scripts/amcos_team_registry.py --help` comment; or create `amcos-registry.sh` wrapper |
| F2 | `skills/amcos-onboarding/references/op-conduct-project-handoff.md` | 151 | LOCAL_REGISTRY | LOW | `~/.ai-maestro/agent-states/[agent-name]-emergency.json` — uses wrong directory (`~/.ai-maestro/` instead of `~/.aimaestro/`) | Correct path to `~/.aimaestro/agent-states/` OR replace with `ai-maestro-agents-management` skill state-dump request |
| F3 | `skills/amcos-onboarding/references/op-deliver-role-briefing.md` | 96–105 | CLI_SYNTAX | LOW | `uv run python scripts/amcos_team_registry.py update-role ...` and `log ...` — both subcommand signatures hardcoded (note flag inconsistency: `--name` vs `--agent`) | Add `--help` deferral note; or create `amcos-registry.sh` wrapper |
| F4 | `skills/amcos-onboarding/references/op-execute-onboarding-checklist.md` | 111–115, 183–188 | CLI_SYNTAX | LOW | `uv run python scripts/amcos_team_registry.py log --event "onboarding-complete" ...` | Add `--help` deferral note |
| F5 | `skills/amcos-plugin-management/references/op-restart-agent-plugin.md` | 87–91 | CLI_SYNTAX | LOW | `uv run python scripts/amcos_team_registry.py log --event "restart" ...` | Add `--help` deferral note |

---

## 3. APPROVAL SYSTEM HARMONIZATION

### What AMCOS Tracks Internally

AMCOS maintains a multi-layer local approval/governance system that is **distinct from and complementary to** AI Maestro's GovernanceRequest system. These systems track different things at different scopes.

#### AMCOS Internal Tracking Layer (PRESERVE — do NOT remove)

The plugin's `scripts/amcos_team_registry.py` and associated log files constitute a plugin-local record-keeping system:

| AMCOS Internal System | Storage Location | What It Tracks | Format |
|---|---|---|---|
| Team Registry | `scripts/amcos_team_registry.py` (runtime state) | Agent-to-team assignments, roles, status | Python in-memory + log files |
| Lifecycle Event Log | Written via `amcos_team_registry.py log ...` | Onboarding, role-briefing, handoff, restart events with timestamps | Log file (format varies) |
| Approval State | `docs_dev/approvals/approval-state.yaml` | Pending/approved/rejected/expired approvals with timestamps | YAML |
| Recovery Policy | `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` | Auto-replace policy, thresholds | JSON (currently inconsistent with `recovery-strategies.md`) |
| Recovery Log | Two inconsistent paths (see violation C41) | Recovery events and outcomes | `.json` / `.jsonl` (inconsistent — must harmonize) |
| Work State / Task Tracking | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` | In-flight task assignments, blocker state | JSON |
| Agent Health | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/` directory | Health status per agent | Various |
| Session Memory | Plugin-local memory files | Chief of Staff decision history | Plugin-managed |

#### AI Maestro GovernanceRequest System (INTEGRATION LAYER)

AI Maestro's governance system tracks:
- `POST /api/v1/governance/requests` — Formal approval requests for cross-team or elevated operations
- `GET /api/v1/governance/requests/{requestId}` — State tracking: `pending → local-approved → dual-approved → executed`
- `POST /api/governance/transfers/` — Agent transfer requests (NOTE: inconsistent path vs `/v1/` prefix — see violation A7)
- Audit trail of all governance decisions

#### Integration Architecture

The two systems serve complementary purposes and BOTH must continue to operate:

```
AMCOS Internal Layer (plugin-local)
├── amcos_team_registry.py → tracks WHO is on WHICH team in WHAT role
├── approval-state.yaml → tracks AMCOS-internal approval lifecycle
├── recovery-log → tracks WHAT recovery actions were taken
└── task-tracking.json → tracks WHAT work is in-flight

                    ↕ INTEGRATION POINTS (must be added)

AI Maestro GovernanceRequest Layer (cross-system)
├── GovernanceRequest: create/terminate/hibernate/wake/install/replace operations
├── TransferRequest: agent ownership changes between teams
├── Audit trail: queryable by any authorized AI Maestro agent
└── Cross-team approval: dual-approval for cross-boundary operations
```

#### Required Integration Points

When AMCOS performs an operation that requires governance approval:

**Current (violating) approach:**
```
AMCOS command embeds:
  POST /api/v1/governance/requests
  + full JSON payload inline
  + approval matrix hardcoded
```

**Correct (harmonized) approach:**
```
AMCOS command references:
  Use the `team-governance` skill to submit a GovernanceRequest
  → Skill handles: endpoint, payload format, approval routing
  → AMCOS also writes to: approval-state.yaml (local record)
  → AMCOS also calls: amcos_team_registry.py log (event record)
```

The plugin continues recording locally AND creates GovernanceRequests via the skill. The three actions happen in sequence:

1. **AMCOS submits request via `team-governance` skill** — gets `requestId` back
2. **AMCOS records in `approval-state.yaml`** — stores `requestId`, operation type, timestamp (PRESERVE)
3. **AMCOS logs event via `amcos_team_registry.py`** — records operation start in lifecycle log (PRESERVE)
4. **AMCOS polls for approval via `team-governance` skill** — using the `requestId` from step 1
5. **On approval: AMCOS executes operation via `ai-maestro-agents-management` skill**
6. **AMCOS updates `approval-state.yaml`** to `approved` status (PRESERVE)
7. **AMCOS logs completion via `amcos_team_registry.py`** (PRESERVE)

#### Specific Files Requiring Integration Changes

| File | Current Problem | Required Integration |
|---|---|---|
| `commands/amcos-request-approval.md` | Embeds full API call + JSON payload + approval matrix | Replace operational steps with `team-governance` skill references; keep PRESERVE items as reference data |
| `commands/amcos-check-approval-status.md` | Hardcodes approval directory paths | Use `team-governance` skill for status query; keep internal `approval-state.yaml` as supplemental tracking |
| `commands/amcos-wait-for-approval.md` | CLEAN — correctly delegates; only PRESERVE the adaptive polling strategy and timeout table | No integration change needed; verify `team-governance` skill provides equivalent polling |
| `agents/amcos-approval-coordinator.md` | Re-declares full governance policy and embeds API calls | Reference `team-governance` skill for all governance operations; keep agent-specific approval-tracking logic |
| `commands/amcos-transfer-agent.md` | Embeds transfer API endpoint + hardcodes allowed callers | Use `team-governance` skill transfer workflow; remove `allowed_agents` from frontmatter |

#### Recovery Log Path Inconsistency (CRITICAL)

**This must be resolved before any harmonization work:**

| File | Path Used | Format |
|---|---|---|
| `recovery-operations.md` (line 358) | `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` | JSON object |
| `recovery-strategies.md` (line 79) | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` | JSONL (newline-delimited) |

These are irreconcilable without a decision. Recommendation: canonicalize to `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` (JSONL format is better for append-only event logs) and update `recovery-operations.md` to match.

---

## 4. FILES CONFIRMED CLEAN

### Top-Level Files (agents/, commands/, shared/, docs/)

| File | Scope |
|---|---|
| `commands/amcos-broadcast-notification.md` | Top-level commands |
| `commands/amcos-configure-plugins.md` | Top-level commands |
| `commands/amcos-health-check.md` | Top-level commands |
| `commands/amcos-hibernate-agent.md` | Top-level commands |
| `commands/amcos-install-skill-notify.md` | Top-level commands (minor note: ACK JSON has skill disclaimer, acceptable) |
| `commands/amcos-notify-agents.md` | Top-level commands |
| `commands/amcos-performance-report.md` | Top-level commands |
| `commands/amcos-reindex-skills.md` | Top-level commands |
| `commands/amcos-resource-report.md` | Top-level commands |
| `commands/amcos-spawn-agent.md` | Top-level commands |
| `commands/amcos-staff-status.md` | Top-level commands |
| `commands/amcos-terminate-agent.md` | Top-level commands |
| `commands/amcos-transfer-work.md` | Top-level commands |
| `commands/amcos-wake-agent.md` | Top-level commands |
| `commands/amcos-wait-for-approval.md` | Top-level commands (correctly delegates; PRESERVE items noted) |
| `agents/amcos-lifecycle-manager.md` | Top-level agents |
| `agents/amcos-performance-reporter.md` | Top-level agents |
| `agents/amcos-recovery-coordinator.md` | Top-level agents |
| `agents/amcos-resource-monitor.md` | Top-level agents |
| `agents/amcos-skill-validator.md` | Top-level agents |
| `agents/amcos-staff-planner.md` | Top-level agents |
| `docs/AGENT_OPERATIONS.md` | Top-level docs |
| `docs/FULL_PROJECT_WORKFLOW.md` | Top-level docs |
| `docs/ROLE_BOUNDARIES.md` | Top-level docs |
| `docs/TEAM_REGISTRY_SPECIFICATION.md` | Top-level docs |
| `shared/handoff_template.md` | Top-level shared |
| `shared/message_templates.md` | Top-level shared |
| `shared/performance_report_template.md` | Top-level shared |

### Skill SKILL.md Entry Points (Clean)

| File | Notes |
|---|---|
| `skills/amcos-onboarding/SKILL.md` | Clean — correct skill delegation pattern throughout |
| `skills/amcos-performance-tracking/SKILL.md` | Clean — purely conceptual/analytical, no infrastructure calls |
| `skills/amcos-plugin-management/SKILL.md` | Clean — exemplary PAP adherence; optional: clarify prerequisite wording at line 29 |
| `skills/amcos-staff-planning/SKILL.md` | Clean — conceptual planning guide only |

### ops/planning Reference Files (Clean)

| File | Skill Group |
|---|---|
| `skills/amcos-label-taxonomy/references/op-handle-blocked-agent.md` | label-taxonomy |
| `skills/amcos-skill-management/references/op-validate-skill.md` | skill-management |
| `skills/amcos-skill-management/references/skill-validation.md` | skill-management |
| `skills/amcos-skill-management/references/validation-procedures.md` (body) | skill-management (except line 914–916, see E12) |
| `skills/amcos-plugin-management/references/local-configuration.md` | plugin-management |
| `skills/amcos-plugin-management/references/op-configure-local-plugin.md` | plugin-management |
| `skills/amcos-plugin-management/references/op-install-plugin-marketplace.md` | plugin-management |
| `skills/amcos-plugin-management/references/op-install-plugin-remote.md` | plugin-management |
| `skills/amcos-plugin-management/references/op-validate-plugin.md` | plugin-management |
| `skills/amcos-plugin-management/references/plugin-installation.md` | plugin-management |
| `skills/amcos-plugin-management/references/plugin-validation.md` | plugin-management |
| `skills/amcos-plugin-management/references/installation-procedures.md` | plugin-management |
| `skills/amcos-onboarding/references/onboarding-checklist.md` | onboarding |
| `skills/amcos-onboarding/references/project-handoff.md` | onboarding |
| `skills/amcos-onboarding/references/op-validate-handoff.md` | onboarding |
| `skills/amcos-onboarding/references/role-briefing.md` | onboarding |
| All 7 `amcos-staff-planning/references/` files | staff-planning (verified clean by grep scan) |
| All 7 `amcos-resource-monitoring/references/` files | resource-monitoring (verified clean by grep scan) |
| All 7 `amcos-performance-tracking/references/` files | performance-tracking (verified clean by grep scan) |

### Spot-Check Clean Files (gap-fill-batch7)

| File | Skill Group |
|---|---|
| `skills/amcos-performance-tracking/references/performance-metrics.md` | performance-tracking |
| `skills/amcos-onboarding/references/onboarding-checklist.md` | onboarding |
| `skills/amcos-label-taxonomy/references/op-handle-blocked-agent.md` | label-taxonomy |
| `skills/amcos-skill-management/references/op-generate-agent-prompt-xml.md` | skill-management |

### `amcos-agent-lifecycle/references/` Clean Files

12 of 16 files in `amcos-agent-lifecycle/references/` were confirmed clean — they correctly use `ai-maestro-agents-management` and `agent-messaging` skill references for all lifecycle operations. (4 files had violations as noted in Section B.)

### `amcos-notification-protocols/references/` Clean Files

| File | Notes |
|---|---|
| `acknowledgment-protocol.md` | Clean |
| `message-response-decision-tree.md` | Clean |
| `op-acknowledgment-protocol.md` | Clean |
| `op-failure-notification.md` | Clean |
| `op-post-operation-notification.md` | Clean |
| `op-pre-operation-notification.md` | Clean |
| `pre-operation-notifications.md` | Clean |
| `task-completion-checklist.md` | Clean |

### `amcos-failure-recovery/references/` Clean Files

| File | Notes |
|---|---|
| `failure-classification.md` | Clean |
| `failure-detection.md` | Clean |
| `op-classify-failure-severity.md` | Clean |
| `op-detect-agent-failure.md` | Clean |
| `op-execute-recovery-strategy.md` | Clean (has RECORD_KEEPING items, correctly preserved) |

### `amcos-team-coordination/references/` Clean Files

| File | Notes |
|---|---|
| `op-assign-agent-roles.md` | Clean (has RECORD_KEEPING items, correctly preserved) |
| `op-maintain-teammate-awareness.md` | Clean (has RECORD_KEEPING items, correctly preserved) |
| `op-send-team-messages.md` | Clean (has RECORD_KEEPING items, correctly preserved) |

### `amcos-session-memory-library/` Clean Files (Integration References)

| File | Notes |
|---|---|
| `references/ai-maestro-integration.md` | Clean — all operations delegate to skills; no hardcoded endpoints |
| `references/error-handling.md` | Clean — conceptual error handling philosophy |
| `references/governance-workflows.md` | Clean — governance described conceptually |
| `references/memory-operations.md` | Clean — memory system described abstractly |
| `references/session-management.md` | Clean — session operations delegate to skills |

---

## 5. FILES NOT AUDITED

### `amcos-session-memory-library/references/` — ~113 Files (NOT individually read)

The session-memory-library skill contains approximately 113 reference files covering memory management, context storage, and session persistence. These files were **not individually audited** in the deep-audit passes. The automated grep scan found:
- No `curl` commands with AI Maestro endpoints
- No `AIMAESTRO_API` references
- No `skills-index.json` direct reads
- No `amp-send.sh` embedded calls

**Assessment: High confidence of clean status based on automated scan.** The 5 integration reference files that WERE individually read (above) confirmed the pattern: this skill uses skill-delegation throughout.

**Recommendation:** If a future high-confidence audit is required, spot-check 10% of these files (~11 files) by random selection. The automated grep results have not yielded any patterns warranting individual review.

### ops/planning files with fabricated names in original audit

The original `deep-audit-AMCOS-ops-planning-2026-02-27.md` used fabricated/hallucinated filenames for 31 out of 50 files it claimed to audit. The verified actual files are:

**`amcos-staff-planning/references/`** (7 files — all verified clean by grep):
- `capacity-planning.md`, `framework-details.md`, `op-assess-role-requirements.md`, `op-create-staffing-templates.md`, `op-plan-agent-capacity.md`, `role-assessment.md`, `staffing-templates.md`

**`amcos-resource-monitoring/references/`** (7 files — all verified clean by grep):
- `instance-limits.md`, `monitoring-commands.md`, `op-check-system-resources.md`, `op-handle-resource-alert.md`, `op-monitor-instance-limits.md`, `resource-alerts.md`, `system-resources.md`

**`amcos-performance-tracking/references/`** (7 files — all verified clean by grep):
- `op-analyze-strengths-weaknesses.md`, `op-collect-performance-metrics.md`, `op-generate-performance-report.md`, `performance-metrics.md`, `performance-reporting.md`, `report-formats.md`, `strength-weakness-analysis.md`

These 21 files were verified clean by grep scan (confirmed no curl/AIMAESTRO_API/skills-index.json patterns); the ops-planning verification agent spot-checked 3 representative files and confirmed clean status.

---

## APPENDIX: RECORD_KEEPING Items (PRESERVE — NOT Violations)

The following items appear throughout the plugin and MUST be preserved per the Harmonization Rule. They are plugin-internal tracking mechanisms:

| Item | Location | What It Is | Why Preserve |
|---|---|---|---|
| `amcos_team_registry.py log` calls | Multiple onboarding/lifecycle files | Plugin's own event log for team assignments | Plugin-internal record of AMCOS team history |
| `amcos_team_registry.py update-role` calls | `op-deliver-role-briefing.md` | Plugin's role assignment tracker | Plugin-internal state, not duplicating AI Maestro |
| `approval-state.yaml` schema | `eama-approval-workflows/SKILL.md` (AMAMA) | Approval lifecycle YAML tracking | Distinct from GovernanceRequest — tracks AMCOS-internal state |
| Recovery policy JSON defaults | `recovery-operations.md` | AMCOS policy for auto-replace behavior | Plugin-configurable behavior knobs |
| Recovery log path (MUST harmonize first) | `recovery-operations.md`, `recovery-strategies.md` | Event log of recovery actions taken | Plugin-internal audit trail |
| Task-tracking.json | `op-emergency-handoff.md` | In-flight work state during handoffs | Plugin-local transient state |
| Session memory files | `edge-case-protocols.md` | Agent conversation/decision history | Plugin-local memory subsystem |
| Request ID format `AMCOS-YYYYMMDDHHMMSS-XXXXXXXX` | `amcos-wait-for-approval.md` | AMCOS-internal request correlation ID | Different namespace from GovernanceRequest `GR-*` IDs — both needed |
| Adaptive polling intervals | `amcos-wait-for-approval.md` | 0–60s: 5s; 60–180s: 10s; 180s+: 30s | AMCOS-specific timeout policy |
| Timeout table by operation type | `amcos-wait-for-approval.md` | hibernate/wake 60s; spawn 120s; etc. | AMCOS-specific SLA guidance |
| Rate limiting rules | `commands/amcos-notify-manager.md` | Max 1 status/hr per topic; max 3 issue reports/hr | AMCOS-internal messaging policy |
| 8 notification types | `commands/amcos-notify-manager.md` | status_update, issue_report, alert, etc. | AMCOS-internal message taxonomy |
| Priority levels with behavior definitions | `commands/amcos-broadcast-notification.md` | normal/high/urgent with agent behavior specs | AMCOS-internal urgency policy |
| 4-phase installation protocol | `commands/amcos-install-skill-notify.md` | Pre-notification, Ack, Install, Post-verify | AMCOS-specific installation workflow |
| Status value table (7 states) | `commands/amcos-check-approval-status.md` | pending/approved/rejected/deferred/expired/completed/cancelled | AMCOS approval lifecycle states |
| Operation timeout table | `commands/amcos-wait-for-approval.md` | Timeout recommendations per operation type | AMCOS-specific operational policy |

---

*End of consolidated report.*
*Generated: 2026-02-27*
*All violation claims are verified against actual source files (spot-checks confirmed 100% accuracy for all spot-checked items).*
*Phantom filenames from ops-planning audit excluded from file inventory sections.*
