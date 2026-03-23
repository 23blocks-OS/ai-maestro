# AMCOS Consolidated Violations — Part 1 (comms-recovery, approval-transfer, lifecycle)
## Date: 2026-02-27

---

## Violations Table

All violations from the three source audits, de-duplicated, sequentially numbered. Paths are relative to the AMCOS plugin root (i.e., the root of the `ai-maestro-chief-of-staff` repository that contains the `skills/` tree).

| # | File (relative to plugin root) | Violation Type | Severity | Description |
|---|---|---|---|---|
| 1 | `skills/amcos-notification-protocols/references/design-document-protocol.md` | HARDCODED_API | HIGH | Direct invocation of `uv run python scripts/amcos_design_validate.py design/` and `amcos_design_search.py` (5 call sites: validation + 4 search modes) |
| 2 | `skills/amcos-notification-protocols/references/design-document-protocol.md` | LOCAL_REGISTRY | MEDIUM | Hardcoded path `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` with direct `cat ... \| jq` read; also accessed via `amcos_design_search.py` |
| 3 | `skills/amcos-notification-protocols/references/edge-case-protocols.md` | HARDCODED_API | HIGH | Direct bash log write to `.claude/logs/maestro-failures.log`; direct file write to `.claude/queue/outbox/` via JSON heredoc; direct file write to `.claude/handoffs/`; `gh api rate_limit` call; `gh issue list` cache write to `.claude/cache/github/`; GitHub queue file write; `find .claude/handoffs` search; `ls -la .claude/memory/` and `cp -r` memory ops (8 instances) |
| 4 | `skills/amcos-notification-protocols/references/failure-notifications.md` | HARDCODED_AMP | HIGH | Full JSON error capture object schema (`error_code`, `error_message`, `operation`, `target_agent`, `stack_trace`, `operation_context`) embedded; full AMP envelope template (`to`, `subject`, `priority`, `content`) embedded; extended envelope at §4.4 — 3 instances |
| 5 | `skills/amcos-notification-protocols/references/failure-notifications.md` | HARDCODED_API | MEDIUM | Bash function `capture_error()` with `$()` command substitution embedded directly |
| 6 | `skills/amcos-notification-protocols/references/failure-notifications.md` | HARDCODED_API | HIGH | Absolute system path `LOG_FILE="/var/log/chief-of-staff/operations.log"` hardcoded |
| 7 | `skills/amcos-notification-protocols/references/post-operation-notifications.md` | HARDCODED_AMP | LOW | Full JSON log entry template with all field names embedded at §2.3.5 (classified as AMP-adjacent schema) |
| 8 | `skills/amcos-notification-protocols/references/proactive-handoff-protocol.md` | HARDCODED_API | HIGH | Direct `cat docs_dev/.uuid-registry.json \| jq '.designs \| keys'` bash read; direct `python scripts/amcos_design_search.py` call; hardcoded relative path for handoff writes (`$CLAUDE_PROJECT_DIR/docs_dev/handoffs/`) |
| 9 | `skills/amcos-notification-protocols/references/proactive-handoff-protocol.md` | LOCAL_REGISTRY | MEDIUM | UUID registry at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` referenced directly with example JSON; `amcos_design_search.py` called directly bypassing skill abstraction |
| 10 | `skills/amcos-failure-recovery/references/agent-replacement-protocol.md` | HARDCODED_GOVERNANCE | HIGH | "Request Manager Approval" from `eama-assistant-manager` hardcoded; "Wait for approval (max 15 minutes)" hardcoded timeout; "CRITICAL: Never proceed with replacement without manager approval" as absolute rule; "CRITICAL: The replacement agent has NO MEMORY of the old agent" as architectural constraint — 4 instances |
| 11 | `skills/amcos-failure-recovery/references/agent-replacement-protocol.md` | HARDCODED_AMP | HIGH | Full JSON envelopes to `eoa-orchestrator` (type: replacement-request), to `eama-assistant-manager` (approval-request content), to new agent (handoff content fields) — 3 instances |
| 12 | `skills/amcos-failure-recovery/references/examples.md` | HARDCODED_AMP | HIGH | Full JSON emergency handoff envelope with hardcoded agent name `libs-svg-svgbbox`; full JSON replacement request with hardcoded agent name and task details — 2 instances. Hardcoded project-specific agent names are especially harmful. |
| 13 | `skills/amcos-failure-recovery/references/op-emergency-handoff.md` | HARDCODED_API | HIGH | Direct `cat $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json \| jq '...'` read; direct `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/`; hardcoded handoff directory path — 3 instances |
| 14 | `skills/amcos-failure-recovery/references/op-emergency-handoff.md` | HARDCODED_AMP | HIGH | Full JSON envelope to `eoa-orchestrator` (URGENT emergency handoff); full JSON envelope with hardcoded example UUID `EH-20250204-svgbbox-001` and hardcoded `to: "RECEIVING_AGENT"` — 2 instances (both despite having skill disclaimer notes) |
| 15 | `skills/amcos-failure-recovery/references/op-emergency-handoff.md` | LOCAL_REGISTRY | MEDIUM | Direct read of `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` bypassing skill abstraction |
| 16 | `skills/amcos-failure-recovery/references/op-replace-agent.md` | HARDCODED_GOVERNANCE | HIGH | "Request Manager Approval" as hardcoded workflow step; "Wait for approval (max 15 minutes). CRITICAL: Never proceed without manager approval." as embedded absolute rule; "If no response after 15 minutes, escalate to the user" as hardcoded escalation chain — 3 instances |
| 17 | `skills/amcos-failure-recovery/references/op-replace-agent.md` | HARDCODED_AMP | HIGH | Full prose-format message specs embedding AMP field structure: to `eoa-orchestrator` (type: replacement-request); to `eama-assistant-manager` (approval-request content); to new agent (handoff content) — 3 instances |
| 18 | `skills/amcos-failure-recovery/references/op-route-task-blocker.md` | HARDCODED_GOVERNANCE | MEDIUM | `"Verify it includes user's exact decision (RULE 14)"` — explicit brittle dependency on a numbered governance rule; implicit governance coupling for escalation path references numbered rule — 2 instances |
| 19 | `skills/amcos-failure-recovery/references/op-route-task-blocker.md` | HARDCODED_AMP | MEDIUM | Full message spec with `type: blocker-escalation` content structure; full message spec with `type: blocker-resolution` content structure — 2 instances |
| 20 | `skills/amcos-failure-recovery/references/recovery-operations.md` | HARDCODED_API | CRITICAL | Direct tmux bash (`tmux has-session`, `tmux list-panes + ps`); direct ping; direct tmux process kill (TERM signal + sleep); direct tmux hard restart; direct file read of `recovery-policy.json`; direct jq parse of policy; direct file append to `recovery-log.json`; direct jq query of recovery log — 9 instances. Highest-density HARDCODED_API file in the entire codebase. |
| 21 | `skills/amcos-failure-recovery/references/recovery-operations.md` | HARDCODED_GOVERNANCE | HIGH | "Requires Approval Unless Pre-Authorized" hardcoded into recovery workflow; `auto_replace_on_terminal: false` as hardcoded governance default; full policy JSON structure with recovery timeouts and approval requirements as hardcoded JSON — 3 instances |
| 22 | `skills/amcos-failure-recovery/references/recovery-operations.md` | LOCAL_REGISTRY | HIGH | Direct read of `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json`; direct write to `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json`; policy check reads directly from file — 3 instances. PATH CONFLICT: uses `.json` at `thoughts/shared/recovery-log.json` while recovery-strategies.md uses `.jsonl` at `.amcos/agent-health/recovery-log.jsonl`. |
| 23 | `skills/amcos-failure-recovery/references/recovery-strategies.md` | HARDCODED_API | MEDIUM | Direct tmux bash `tmux has-session -t <agent-name>` for hibernate check; direct file path reference for log writes to `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` — 2 instances |
| 24 | `skills/amcos-failure-recovery/references/recovery-strategies.md` | HARDCODED_GOVERNANCE | MEDIUM | "Manager approves replacement" listed as hardcoded prerequisite for agent replacement strategy |
| 25 | `skills/amcos-failure-recovery/references/recovery-strategies.md` | LOCAL_REGISTRY | MEDIUM | Recovery log at `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` — CONFLICTS with `recovery-operations.md` path (`thoughts/shared/recovery-log.json`). Also different format: `.jsonl` vs `.json`. |
| 26 | `skills/amcos-failure-recovery/references/troubleshooting.md` | HARDCODED_API | MEDIUM | Reference to `~/.claude/settings.json` as the file to check for hook configuration; reference to port `23000` as the AI Maestro port to verify — 2 instances |
| 27 | `skills/amcos-failure-recovery/references/troubleshooting.md` | HARDCODED_GOVERNANCE | HIGH | `"CRITICAL: Never proceed with replacement without manager approval"` — absolute governance rule embedded as inline CRITICAL marker |
| 28 | `skills/amcos-failure-recovery/references/work-handoff-during-failure.md` | HARDCODED_API | HIGH | Direct `jq` read of `task-tracking.json`; direct `git log --oneline --author="libs-svg-svgbbox"` with hardcoded agent name; direct `git diff --name-only`; duplicate detection via `git log --oneline --author="failed-agent"`; `git diff` comparison; direct jq read-modify-write of `task-tracking.json` with `temp.json` pattern; hardcoded agent name `libs-svg-svgbbox` in git author flag; hardcoded agent name in jq `.completed_by = "apps-svgplayer-development (emergency handoff)"` — 8 instances |
| 29 | `skills/amcos-failure-recovery/references/work-handoff-during-failure.md` | LOCAL_REGISTRY | HIGH | Direct read of `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json`; direct read-modify-write of same file with `> temp.json && mv temp.json` pattern — 2 instances |
| 30 | `skills/amcos-team-coordination/references/role-assignment.md` | HARDCODED_GOVERNANCE | MEDIUM | `"Reporting to: Code Reviewer, Orchestrator"` in Developer Role; `"Reporting to: Orchestrator, Chief of Staff"` in Code Reviewer Role; `"Reporting to: Chief of Staff"` in DevOps Role — hardcoded static reporting hierarchy for 3 roles |
| 31 | `skills/amcos-team-coordination/references/role-assignment.md` | LOCAL_REGISTRY | MEDIUM | Roster update written as inline markdown table in procedure step, implying direct file write rather than skill-abstracted write |
| 32 | `skills/amcos-team-coordination/references/team-messaging.md` | HARDCODED_AMP | MEDIUM | 5 JSON content-type schemas embedded directly at §2.1: `{"type": "announcement", ...}`, `{"type": "request", ..., "deadline": ...}`, `{"type": "alert", "severity": "critical\|high\|medium", ...}`, `{"type": "status-update", "task": ..., "status": ...}`, `{"type": "role-assignment", "role": ...}` — all couple reference file to AMP protocol internal type system |
| 33 | `skills/amcos-team-coordination/references/teammate-awareness.md` | LOCAL_REGISTRY | MEDIUM | Hardcoded path `design/memory/team-roster.md`; "Step 5: Write updated roster to disk" — direct file write, no skill abstraction; second hardcoded path `design/memory/team-roster-update.md` — 3 instances |
| 34 | `skills/amcos-permission-management/references/approval-escalation.md` | HARDCODED_GOVERNANCE | MEDIUM | Timeout proceed/abort policy table (`spawn → PROCEED`, `terminate → ABORT`, `hibernate → PROCEED`, `plugin_install → ABORT`) hardcoded without runtime override path; directly contradicts `approval-workflow-engine.md` (spawn → Auto-reject) |
| 35 | `skills/amcos-permission-management/references/approval-request-procedure.md` | HARDCODED_GOVERNANCE | LOW | Operational thresholds (`agent idle beyond threshold (default: 30 minutes)`) and per-operation trigger conditions not configurable — embedded as absolute defaults |
| 36 | `skills/amcos-permission-management/references/approval-tracking.md` | LOCAL_REGISTRY | HIGH | Plugin-local YAML state file at `docs_dev/state/amcos-approval-tracking.yaml` tracks approval state independently of AI Maestro GovernanceRequest API; Python code to read/write it is embedded; creates divergent persistence layer invisible to rest of the system |
| 37 | `skills/amcos-permission-management/references/approval-tracking.md` | HARDCODED_GOVERNANCE | MEDIUM | `timeout = submitted_at + 120 seconds` hardcoded in Python with no mechanism to discover or override from governance configuration |
| 38 | `skills/amcos-permission-management/references/approval-workflow-engine.md` | LOCAL_REGISTRY | HIGH | Reads autonomous mode config from `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` via direct `jq` reads; writes back via fragile `jq ... > tmp && mv tmp` pattern — not atomic and not visible to AI Maestro |
| 39 | `skills/amcos-permission-management/references/approval-workflow-engine.md` | HARDCODED_API | HIGH | Multiple direct `curl` calls to `$AIMAESTRO_API/api/v1/governance/requests` with hardcoded endpoint paths and JSON bodies (PATCH approval, PATCH timeout, POST request, GET pending) — 5+ instances. Uses `curl` rather than delegating to the `team-governance` skill. |
| 40 | `skills/amcos-permission-management/references/approval-workflow-engine.md` | HARDCODED_GOVERNANCE | MEDIUM | Approval type taxonomy with timeout policies hardcoded (`agent_spawn → Auto-reject`, `agent_terminate → Auto-reject`, etc.) — internally inconsistent with `approval-escalation.md` |
| 41 | `skills/amcos-permission-management/references/approval-workflow-engine.md` | HARDCODED_AMP | LOW | Content type strings (`"approval_request"`) and EAMA recipient name `eama-main` hardcoded — conflicts with other files that use `eama-assistant-manager` |
| 42 | `skills/amcos-permission-management/references/op-handle-approval-timeout.md` | HARDCODED_API | MEDIUM | Embeds direct `curl -s "$AIMAESTRO_API/api/v1/governance/requests/$REQUEST_ID" \| jq '{...}'` in Step 1 procedure |
| 43 | `skills/amcos-permission-management/references/op-request-approval.md` | HARDCODED_API | HIGH | Step 5 embeds direct `curl -s -X POST "$AIMAESTRO_API/api/v1/governance/requests"` with full JSON body construction to register approval request |
| 44 | `skills/amcos-permission-management/references/op-request-approval.md` | HARDCODED_AMP | MEDIUM | Step 3 constructs full AMP envelope in bash heredoc (`"to": "eama-main"`, `"subject"`, `"priority"`, `"content"` with `type: "approval-request"`) — pre-constructs the envelope the skill should own |
| 45 | `skills/amcos-permission-management/references/op-track-pending-approvals.md` | HARDCODED_API | HIGH | Every procedure step uses direct `curl` to governance API: `GET ?status=pending`, `POST` new request, `GET` pending list, `PATCH $REQUEST_ID`, and others — most pervasive HARDCODED_API violation in permission-management skill |
| 46 | `skills/amcos-permission-management/references/op-track-pending-approvals.md` | HARDCODED_API | HIGH | Uses query parameters `?status=pending&reminder_sent=false&min_age_seconds=60` not documented in the `team-governance` skill — either undocumented API feature (gap in global skill) or speculative usage that may not work |
| 47 | `skills/amcos-permission-management/references/op-track-pending-approvals.md` | HARDCODED_AMP | MEDIUM | References `check_messages_for_request_id "$REQUEST_ID" "approval-response"` undefined function without explaining it should go through the `agent-messaging` skill |
| 48 | `skills/amcos-transfer-management/references/op-approve-transfer-request.md` | HARDCODED_API | CRITICAL | Embeds `POST /api/governance/transfers/{id}/approve` directly — WRONG ENDPOINT: `team-governance` skill documents `POST /api/governance/transfers/{id}/resolve` with `action: "approve"` body. Will cause HTTP 404 at runtime. |
| 49 | `skills/amcos-transfer-management/references/op-approve-transfer-request.md` | HARDCODED_GOVERNANCE | HIGH | Full transfer approval matrix hardcoded (Source COS, Source Manager, Target COS, Target Manager roles and required states); full state transition table hardcoded (lines 37–44) |
| 50 | `skills/amcos-transfer-management/references/op-create-transfer-request.md` | HARDCODED_API | CRITICAL | Embeds `POST /api/governance/transfers/` directly — must delegate to `team-governance` skill instead |
| 51 | `skills/amcos-transfer-management/references/op-create-transfer-request.md` | HARDCODED_GOVERNANCE | HIGH | Prerequisites hardcode `"Requester must have permission to initiate transfers"`; Step 4 hardcodes which roles must be notified (Source COS, source manager, target COS, target manager) without reference to skill |
| 52 | `skills/amcos-agent-lifecycle/references/hibernation-procedures.md` | HARDCODED_AMP | LOW | Python pseudocode with fabricated function names (`send_message()`, `update_registry()`, `get_agent_status()`, `spawn_agent_with_state()`, `await_agent_ready()`) that do not map to any real API or skill syntax — 2 example blocks |
| 53 | `skills/amcos-agent-lifecycle/references/hibernation-procedures.md` | LOCAL_REGISTRY | MEDIUM | Storage path `design/memory/agents/<agent-id>/hibernate/` is inconsistent with all other files: contradicts `op-hibernate-agent.md` (`~/.ai-maestro/agent-states/`), `success-criteria.md` (`$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/`), `record-keeping.md` (`$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/`) |
| 54 | `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` | LOCAL_REGISTRY | HIGH | `amcos_team_registry.py update-status` and `amcos_team_registry.py log` embedded as primary procedure Steps 5 and 6 with raw CLI syntax. Script CLI changes will silently break the procedure. |
| 55 | `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` | HARDCODED_API | LOW | `curl -s "$AIMAESTRO_API/api/teams"` in error handling table row as fallback diagnostic hint |
| 56 | `skills/amcos-agent-lifecycle/references/op-hibernate-agent.md` | LOCAL_REGISTRY | MEDIUM | Storage path `~/.ai-maestro/agent-states/` referenced in 3 places (prerequisites, verify step, Step 3 content) — conflicts with `success-criteria.md` and `record-keeping.md` paths |
| 57 | `skills/amcos-agent-lifecycle/references/op-send-maestro-message.md` | LOCAL_REGISTRY | MEDIUM | `AGENTS=$(uv run python scripts/amcos_team_registry.py list --filter-status running --names-only)` embedded in Team Broadcast example — should use `ai-maestro-agents-management` skill |
| 58 | `skills/amcos-agent-lifecycle/references/op-spawn-agent.md` | LOCAL_REGISTRY | HIGH | `amcos_team_registry.py add-agent` embedded as primary procedure Step 5 with raw CLI syntax; repeated in 2 examples — same blast-radius risk as op-hibernate-agent.md |
| 59 | `skills/amcos-agent-lifecycle/references/op-spawn-agent.md` | HARDCODED_API | LOW | `$AIMAESTRO_API/api/teams` referenced in Prerequisites as a raw URL check |
| 60 | `skills/amcos-agent-lifecycle/references/op-terminate-agent.md` | LOCAL_REGISTRY | HIGH | `amcos_team_registry.py remove-agent` and `amcos_team_registry.py log` embedded as primary procedure Steps 5 and 7 with raw CLI syntax; repeated in example section |
| 61 | `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` | LOCAL_REGISTRY | CRITICAL | Entire file embeds `amcos_team_registry.py` full CLI interface across all primary procedure steps: `add-agent` (Step 2a), `remove-agent` (Step 2b), `update-status` (Step 2c), `log` (Step 2d), `list` (Step 3 verify), `publish` (Step 4); repeated in both examples. This is the canonical reference file for registry updates — blast radius center for any script CLI change. |
| 62 | `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` | HARDCODED_API | LOW | `curl -s "$AIMAESTRO_API/api/teams"` in prerequisites and Step 5 verification — uses env var correctly but still embeds raw curl in agent-facing procedures |
| 63 | `skills/amcos-agent-lifecycle/references/op-update-team-registry.md` | HARDCODED_AMP | LOW | `amcos_team_registry.py publish --broadcast-to "all" --message "..."` internally sends AMP messages as side-effect, bypassing the `agent-messaging` skill |
| 64 | `skills/amcos-agent-lifecycle/references/op-wake-agent.md` | LOCAL_REGISTRY | HIGH | `amcos_team_registry.py list --show-status` (Step 1), `amcos_team_registry.py list --filter-status running --count` (Step 2), `amcos_team_registry.py update-status` (Step 6), `amcos_team_registry.py log` (Step 7) — all primary procedure steps, repeated in example section |
| 65 | `skills/amcos-agent-lifecycle/references/op-wake-agent.md` | HARDCODED_GOVERNANCE | MEDIUM | `MAX_AGENTS=5` hardcoded capacity limit in Step 2 bash block — governance constraint must be discovered at runtime, not hardcoded |
| 66 | `skills/amcos-agent-lifecycle/references/op-wake-agent.md` | LOCAL_REGISTRY | MEDIUM | Storage path `~/.ai-maestro/agent-states/<session-name>-hibernation.json` in prerequisites and Step 1 — third distinct path for hibernation state across files |
| 67 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | LOCAL_REGISTRY | HIGH | All six log/registry file definitions use different base directory (`$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/` and `docs_dev/amcos-team/`) than the paths used in all other op-* files, creating a fragmented audit trail |
| 68 | `skills/amcos-agent-lifecycle/references/spawn-procedures.md` | HARDCODED_AMP | LOW | Python pseudocode `Task()` constructor with `description`, `prompt`, `subagent_type` fields — does not correspond to real skill or API syntax (Section 1.3.3) |
| 69 | `skills/amcos-agent-lifecycle/references/spawn-procedures.md` | HARDCODED_AMP | LOW | Python pseudocode `spawn_agent(spawn_config)` with config dict — same issue as above, Section 1.6 examples |
| 70 | `skills/amcos-agent-lifecycle/references/success-criteria.md` | HARDCODED_API | MEDIUM | Multiple `curl "$AIMAESTRO_API/api/..."` in verification steps for spawn (line 47), terminate (line 72), wake (line 132), team assignment (lines 156–159), and team registry verification (lines 223–226) — uses env var correctly but raw curl in agent-facing criteria |
| 71 | `skills/amcos-agent-lifecycle/references/success-criteria.md` | LOCAL_REGISTRY | HIGH | Hibernation verification path `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json` — fourth distinct path for hibernation state in the codebase |
| 72 | `skills/amcos-agent-lifecycle/references/success-criteria.md` | LOCAL_REGISTRY | MEDIUM | Repeat of path inconsistency in Context Not Saved diagnostic section (lines 239–244) |
| 73 | `skills/amcos-agent-lifecycle/references/success-criteria.md` | LOCAL_REGISTRY | LOW | Log file name references (`approval-requests.log`, `approval-audit.log`) conflict with `record-keeping.md` naming convention (`approval-requests-YYYY-MM.log`) |
| 74 | `skills/amcos-agent-lifecycle/references/termination-procedures.md` | HARDCODED_AMP | LOW | Python pseudocode functions `send_termination_request()`, `await_termination_response()`, `update_registry()`, `notify_chief_of_staff()` — do not map to real skill syntax (Section 2.6 examples) |
| 75 | `skills/amcos-agent-lifecycle/references/termination-procedures.md` | LOCAL_REGISTRY | LOW | `design/memory/agents/code-impl-01/` path for state snapshot — legacy reference using old path not consistent with other files |
| 76 | `skills/amcos-agent-lifecycle/references/workflow-checklists.md` | LOCAL_REGISTRY | HIGH | `amcos_team_registry.py create`, `add-agent`, `remove-agent`, `update-status`, and `list` commands embedded in Forming Team and Updating Registry checklist sections — 7 call sites |
| 77 | `skills/amcos-agent-lifecycle/references/workflow-checklists.md` | HARDCODED_API | LOW | `curl -s "$AIMAESTRO_API/api/teams"` for verify-after-create, before-update health check, and pre-update snapshot — 3 instances using env var correctly but still raw curl |
| 78 | `skills/amcos-agent-lifecycle/references/workflow-checklists.md` | HARDCODED_GOVERNANCE | MEDIUM | `mkdir -p $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/` hardcoded as checklist step — storage path management belongs in skill/script, not checklist |
| 79 | `skills/amcos-agent-lifecycle/references/workflow-checklists.md` | LOCAL_REGISTRY | LOW | `test -f $CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json` hardcoded in pre-wake checks |
| 80 | `skills/amcos-agent-lifecycle/references/workflow-examples.md` | LOCAL_REGISTRY | LOW | `.ai-maestro/team-registry.json` file path reference in Workflow 1 Step 4 — may be outdated; `record-keeping.md` says team registry IS the AI Maestro REST API |

---

## RECORD_KEEPING Items (PRESERVE — do NOT remove)

These are intentional internal tracking and audit mechanisms. They must be preserved and harmonized, not removed.

| # | File | What it records | Why it must stay |
|---|---|---|---|
| RK-01 | `skills/amcos-notification-protocols/references/design-document-protocol.md` §8.3 | UUID registry schema at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` with `handoffs`, `designs`, `modules` top-level keys | UUID chain concept is a core design pattern; every handoff UUID must be registered for traceability |
| RK-02 | `skills/amcos-notification-protocols/references/edge-case-protocols.md` §1.2 | Failure log at `.claude/logs/maestro-failures.log` tracking `AIMAESTRO_UNAVAILABLE` events with ISO timestamps | Operational resilience audit trail — mandatory when AI Maestro is completely unreachable |
| RK-03 | `skills/amcos-notification-protocols/references/edge-case-protocols.md` §2.3 | GitHub status cache at `.claude/cache/github/` | Offline resilience — cached data allows agent to continue operations when GitHub is unavailable |
| RK-04 | `skills/amcos-notification-protocols/references/edge-case-protocols.md` §8 | Session memory save/restore procedures for `.claude/memory/` | Session memory management for continuity across context resets |
| RK-05 | `skills/amcos-notification-protocols/references/failure-notifications.md` §4.3.5 | Failure log entry schema: `timestamp`, `event_type`, `operation`, `target_agent`, `error`, `notification_sent`, `recovery_action_planned`, `retry_scheduled` | Failure audit trail — enables post-incident review and retry scheduling |
| RK-06 | `skills/amcos-notification-protocols/references/post-operation-notifications.md` §2.3.5 | Operation log entry schema: `timestamp`, `operation`, `target_agent`, `operation_details`, `pre_notification_sent`, `acknowledgment_received`, `operation_completed`, `post_notification_sent`, `verification_received`, `status` | End-to-end operation audit trail for accountability and debugging |
| RK-07 | `skills/amcos-notification-protocols/references/proactive-handoff-protocol.md` §8 | UUID registry format and UUID propagation rules | UUID chain design pattern — core to cross-agent handoff traceability |
| RK-08 | `skills/amcos-notification-protocols/references/proactive-handoff-protocol.md` §Handoff Document | Mandatory handoff YAML frontmatter schema: `uuid`, `from`, `to`, `timestamp`, `priority`, `requires_ack`, plus standard sections | Structured handoff format enables reliable context transfer between agents |
| RK-09 | `skills/amcos-failure-recovery/references/op-execute-recovery-strategy.md` | Recovery attempt tracking JSON schema: `{"agent": ..., "attempt": 1, "strategy": "soft-restart", "timestamp": "ISO8601", "result": "success\|failed", "details": "..."}` | Per-attempt tracking enables escalation logic and prevents infinite retry loops |
| RK-10 | `skills/amcos-failure-recovery/references/op-route-task-blocker.md` | "Track the blocker in AMCOS records" and "Update AMCOS records when resolved" | Blocker state tracking is required for work continuity and unblocking coordination |
| RK-11 | `skills/amcos-failure-recovery/references/recovery-operations.md` §6.1 | Recovery log schema at `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json`: `recovery_events` array with `timestamp`, `agent`, `failure_type`, `recovery_action`, `recovery_result` | Recovery audit log — path must be harmonized with recovery-strategies.md |
| RK-12 | `skills/amcos-failure-recovery/references/recovery-operations.md` §5.1 | Recovery policy at `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` with `max_recovery_attempts`, `recovery_timeout_minutes`, `auto_replace_on_terminal`, `notify_on_terminal` | Configurable recovery policy parameters — enables per-deployment tuning |
| RK-13 | `skills/amcos-failure-recovery/references/recovery-strategies.md` §3.3.2 | Recovery log requirement at `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` | Same logging requirement as RK-11 — MUST BE HARMONIZED to one canonical path |
| RK-14 | `skills/amcos-failure-recovery/references/work-handoff-during-failure.md` §5.7.3 | Task tracking update pattern — task status must be updated after emergency handoff resolution | Ensures task ownership is correctly transferred and no work is lost |
| RK-15 | `skills/amcos-failure-recovery/references/work-handoff-during-failure.md` §5.7.3 | Task record fields: `completed_by`, `completed_at`, `status` | Schema definition for task handoff records |
| RK-16 | `skills/amcos-team-coordination/references/op-assign-agent-roles.md` | Roster update after role assignment | Team roster must reflect current role assignments for coordination |
| RK-17 | `skills/amcos-team-coordination/references/op-maintain-teammate-awareness.md` | Team roster write after status polling | Roster must be updated to reflect real-time agent availability |
| RK-18 | `skills/amcos-team-coordination/references/op-send-team-messages.md` Step 5 | Coordination log: `timestamp`, `recipients`, `subject`, `priority`, `message_type`, `delivery_status` | Message audit trail — required for accountability in team coordination |
| RK-19 | `skills/amcos-team-coordination/references/role-assignment.md` §1.4 Step 6 | Team roster format `\| Agent \| Role \| Assigned \| Status \|` | Roster structure must be preserved; access should go through `ai-maestro-agents-management` skill |
| RK-20 | `skills/amcos-team-coordination/references/teammate-awareness.md` §3.1 | Roster format with columns: `Session Name`, `Role`, `Status`, `Last Seen`, `Current Task` | Human-readable team roster format for operational monitoring |
| RK-21 | `skills/amcos-team-coordination/references/teammate-awareness.md` §3.5 | Team status report markdown template | Standardized reporting format for status updates |
| RK-22 | `skills/amcos-permission-management/references/approval-tracking.md` | AMCOS-local YAML state at `docs_dev/state/amcos-approval-tracking.yaml` tracking `escalation_count`, `last_reminder_at`, `timeout_at`, `decided_by`, `modifications`, `notes` | Tracks AMCOS-specific approval state fields not stored in AI Maestro GovernanceRequest API. Must be preserved and mirrored to AI Maestro (see harmonization section). |
| RK-23 | `skills/amcos-permission-management/references/approval-escalation.md` | Escalation audit log at `docs_dev/audit/amcos-escalations-{date}.yaml` | Plugin-local audit trail for escalation events — NOT replaced by AI Maestro GovernanceRequest |
| RK-24 | `skills/amcos-permission-management/references/approval-workflow-engine.md` §10 | Autonomous mode config at `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` with `enabled`, `permissions.{operation_type}.allowed`, `current_hour_count` | Rate limiting and per-operation permission grants for autonomous mode — must be stored somewhere persistent |
| RK-25 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Lifecycle Log at `docs_dev/amcos-team/agent-lifecycle.log` — SPAWN, TERMINATE, HIBERNATE, WAKE, TEAM_ADD, TEAM_REMOVE, STATUS_CHANGE, FAILURE, ROLLBACK events (append-only) | No AI Maestro equivalent. AMCOS accountability audit trail for all lifecycle operations. |
| RK-26 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Approval Requests Log at `docs_dev/chief-of-staff/approvals/approval-requests-YYYY-MM.log` | Tracks EAMA-based approval decisions — distinct from AI Maestro GovernanceRequest (which handles cross-host governance) |
| RK-27 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Team Assignments Log at `docs_dev/chief-of-staff/team-assignments.md` (human-readable, regenerated daily) | Human-readable summary for AMCOS operator — no AI Maestro equivalent |
| RK-28 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Operation Audit Trail at `docs_dev/chief-of-staff/operations/operation-YYYY-MM-DD.log` | Per-operation detailed log with request IDs — no AI Maestro equivalent |
| RK-29 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Agent Registry at `docs_dev/chief-of-staff/agent-registry.json` — full lifecycle history per agent including team memberships, hibernation records, timestamps | AMCOS's master record with `spawned_by`, `team_memberships` history — richer than AI Maestro's agent registry |
| RK-30 | `skills/amcos-agent-lifecycle/references/success-criteria.md` §186–190 | Approval audit log at `docs_dev/chief-of-staff/approval-audit.log` | Approval request verification log for post-hoc audit |

---

## Approval System Harmonization

### How AMCOS's Approval System Works

The AMCOS plugin implements a **two-layer, dual-tracking approval system** that is architecturally sound but contains Plugin Abstraction Principle violations in how it calls the AI Maestro API.

**Layer 1 — AMCOS-internal approval tracking** (`docs_dev/state/amcos-approval-tracking.yaml`)

AMCOS maintains a richer approval state than what AI Maestro's GovernanceRequest API stores. The local YAML tracks:

| Field | AMCOS Tracks | AI Maestro GovernanceRequest Tracks |
|---|---|---|
| `request_id` | Yes | Yes |
| `operation type` | AMCOS scheme: `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install` | AI Maestro scheme: `create-agent`, `transfer-agent`, `add-to-team` |
| `status` | `pending` / `escalated` / `resolved` | `pending` / `approved` / `rejected` / `executed` |
| `escalation_count` (0–3) | Yes | No |
| `last_reminder_at` | Yes | Partial |
| `timeout_at` | Yes | No |
| `decided_by` | `eama` / `autonomous` / `timeout` | Via `approverAgentId` |
| `modifications` | Yes | No |
| `rollback_plan` | Yes (workflow engine) | No |
| `escalation events` | Audit YAML | No |
| `autonomous_directives` | Yes (local JSON) | No |

**Layer 2 — AI Maestro GovernanceRequest API** (`$AIMAESTRO_API/api/v1/governance/requests`)

AMCOS currently calls this API via hardcoded `curl` commands in `approval-workflow-engine.md` and `op-track-pending-approvals.md`. These calls are functionally correct (the integration intent is right) but violate Rule 2 of the Plugin Abstraction Principle by embedding `curl` directly.

**Layer 3 — Escalation and audit logs** (`docs_dev/audit/amcos-escalations-{date}.yaml`, `$CLAUDE_PROJECT_DIR/thoughts/shared/approval-audit.log`)

Append-only audit trails that are AMCOS-private and have no AI Maestro equivalent. These must be preserved as-is.

### Internal Inconsistencies That Must Be Resolved First

Before any abstraction work, three internal consistency bugs must be fixed:

**Bug 1 — EAMA recipient name (CRITICAL — functional breakage):** Seven files disagree on the EAMA agent name:
- `eama-assistant-manager` — used in: `approval-escalation.md`, `approval-request-procedure.md`, `examples.md`, `op-handle-approval-timeout.md`
- `eama-main` — used in: `approval-workflow-engine.md`, `op-request-approval.md`

Approval requests sent to `eama-main` will not be received by an agent named `eama-assistant-manager`. Resolution: define a single `EAMA_SESSION_NAME` configurable constant and reference it from all files. Do not hardcode either name.

**Bug 2 — Approval type code schema (HIGH — incompatible schemas):** Two sets of type codes are in use:
- `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install` — in `approval-types-detailed.md`, `op-request-approval.md`
- `agent_spawn`, `agent_terminate`, `agent_replace`, `plugin_install`, `critical_operation` — in `approval-workflow-engine.md`

A request created using one schema cannot be processed by components using the other. Resolution: choose one namespace (recommended: prefix with `amcos.` to distinguish from AI Maestro's own GovernanceRequest types, e.g., `amcos.spawn`, `amcos.terminate`).

**Bug 3 — Timeout policy contradiction (HIGH):** `approval-escalation.md` says `spawn` → PROCEED on timeout; `approval-workflow-engine.md` says `agent_spawn` → Auto-reject. These are contradictory and both affect the same operation. Resolution: unify in one canonical policy document and reference it from both files.

### How to Add GovernanceRequest Integration Without Replacing the Internal System

The AMCOS internal approval system and AI Maestro's GovernanceRequest API serve **complementary, not competing purposes**:

| System | Authority on | Scope |
|---|---|---|
| AMCOS local YAML | Escalation state, timing, reminder count, rollback plan | AMCOS-internal only |
| AI Maestro GovernanceRequest | Formal approval record visible to all AI Maestro components | Cross-system visibility |

**Recommended harmonized flow (PRESERVE + EXTEND):**

```
AMCOS Request Created
    │
    ├─► CREATE entry in local YAML (pending)        ← preserve as-is
    │    (for escalation tracking, timing, rollback)
    │
    └─► REFERENCE the `team-governance` skill        ← replace direct curl
         to POST /api/v1/governance/requests
         (for AI Maestro cross-system visibility)
              │
    AMCOS tracks escalation locally
    (reminds, updates escalation_count, last_reminder_at)  ← preserve as-is
              │
    Decision received / timeout
              │
    ├─► UPDATE local YAML (resolved + decision)     ← preserve as-is
    │
    └─► REFERENCE `team-governance` skill            ← replace direct curl
         to PATCH /api/v1/governance/requests/{id}
              │
    AMCOS audit log gets final entry                 ← preserve as-is
    AI Maestro governance history shows final status
```

**Key principle:** Replace every direct `curl` call to the GovernanceRequest API with a reference to the `team-governance` skill. Do NOT remove the local YAML tracking layer — it holds AMCOS-specific fields that AI Maestro does not store.

### What the `team-governance` Global Skill Currently Lacks

Before AMCOS can fully delegate GovernanceRequest operations to the global skill, the global skill needs additions:

1. **PATCH / update operations** on GovernanceRequests — currently only POST (create) and GET (list/read) are documented. AMCOS needs to update status to `approved`, `rejected`, `timeout`.
2. **Query parameter documentation** — `reminder_sent` and `min_age_seconds` filters used by `op-track-pending-approvals.md` are not in the skill; either add them or replace with client-side filtering.

These are gaps in the AI Maestro `team-governance` global skill, not in AMCOS, and they block proper delegation.

### What Must Be Preserved (Summary)

1. The local YAML approval tracking file and all its AMCOS-specific fields.
2. The escalation count and reminder state — AMCOS-specific, must NOT be pushed to AI Maestro.
3. The escalation audit log (`docs_dev/audit/amcos-escalations-{date}.yaml`) — plugin-local, appropriate.
4. The approval audit log — plugin-local, appropriate.
5. The autonomous mode configuration concept — move to a more stable/configurable location, but preserve the per-operation permission and rate-limiting logic.
6. The approval type taxonomy (spawn/terminate/hibernate/wake/plugin_install) — AMCOS domain knowledge, appropriate to define here; just needs to be namespaced and unified into one schema.

### What Must Change (Summary)

1. All direct `curl` calls to `$AIMAESTRO_API/api/v1/governance/requests` must be replaced with references to the `team-governance` skill (once that skill gains PATCH support).
2. The EAMA recipient name must become a configurable constant, not a hardcoded string.
3. The approval type code schema must be unified to one consistent set across all files.
4. The timeout policy (proceed vs. auto-reject per operation type) must be unified in one canonical document.
5. The autonomous mode config storage must move from `thoughts/shared/autonomous-mode.json` to a more robust, project-configurable location with explicit documentation that it is AMCOS-private ephemeral state.

---

*Consolidated from:*
- *`deep-audit-AMCOS-comms-recovery-2026-02-27.md` (34 files: notification-protocols + failure-recovery + team-coordination)*
- *`deep-audit-AMCOS-approval-transfer-2026-02-27.md` (14 files: permission-management + transfer-management)*
- *`deep-audit-AMCOS-lifecycle-2026-02-27.md` (16 files: agent-lifecycle)*
- *Reference: `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`*
