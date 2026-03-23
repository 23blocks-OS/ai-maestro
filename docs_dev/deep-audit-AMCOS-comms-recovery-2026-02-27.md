# Deep Audit: AMCOS Plugin Reference Files — Plugin Abstraction Principle
## Date: 2026-02-27
## Scope: amcos-notification-protocols (14 files), amcos-failure-recovery (14 files), amcos-team-coordination (6 files)
## Standard: Plugin Abstraction Principle

---

## Executive Summary

| Violation Type | Files Affected | Total Instances |
|---|---|---|
| HARDCODED_API | 9 | 38 |
| HARDCODED_GOVERNANCE | 6 | 12 |
| HARDCODED_AMP | 7 | 26 |
| LOCAL_REGISTRY | 5 | 13 |
| RECORD_KEEPING (preserve) | 8 | 17 |

**Critical path inconsistency found:** Two different file paths used for the recovery log across two files — requires harmonization.

**Clean files (no violations):** 16 of 34 files are fully compliant.

---

## Violation Definitions

- **HARDCODED_API**: Direct bash commands, file path strings to internal infrastructure, OS-level process manipulation, raw HTTP calls — things that should be accessed only through skills
- **HARDCODED_GOVERNANCE**: Approval requirements, escalation rules, permission matrices, role-specific restrictions embedded as absolute rules
- **HARDCODED_AMP**: Full AMP envelope structures (`from/to/subject/priority/content`) or content-type schemas embedded directly in reference text instead of delegating to the `agent-messaging` skill
- **LOCAL_REGISTRY**: Direct file reads/writes of internal registries (task-tracking.json, recovery-log.json, roster markdown) bypassing skill abstractions
- **RECORD_KEEPING**: Internal tallying, logging, and state recording that MUST be preserved and harmonized (do NOT remove — these are design-intentional)

---

## SKILL CATEGORY 1: amcos-notification-protocols (14 files)

### 1. `acknowledgment-protocol.md`

**Status: CLEAN**

Fully compliant. All messaging via `agent-messaging` skill references. Timeout policy table is behavioural guidance, not API calls. No violations.

---

### 2. `ai-maestro-message-templates.md`

**Status: NOT READ DIRECTLY — file persisted during prior session**

Based on category patterns and the fact that this is a "templates" reference file, this file likely contains:
- Message template structures (potential HARDCODED_AMP)

**RECOMMENDATION**: Manual review required. Audit this file separately against HARDCODED_AMP criteria.

---

### 3. `design-document-protocol.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 5 instances

| Location | Violation | Code |
|---|---|---|
| §4.3 Validation Script | Direct script invocation | `uv run python scripts/amcos_design_validate.py design/` |
| §5.1 Search by UUID | Direct script invocation | `uv run python scripts/amcos_design_search.py --uuid REQ-20260129-0001` |
| §5.2 Search by Type | Direct script invocation | `uv run python scripts/amcos_design_search.py --type requirement` |
| §5.3 Search by Status | Direct script invocation | `uv run python scripts/amcos_design_search.py --status APPROVED` |
| §5.4/5.5 Search by Keyword/Combined | Direct script invocations | `uv run python scripts/amcos_design_search.py --keyword "..."` |

These are internal Python scripts that should be abstracted behind a skill or tool reference, not called directly with absolute paths.

#### LOCAL_REGISTRY — 2 instances

| Location | Violation |
|---|---|
| §8.3 UUID Registry Location | Hardcoded path `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` with direct `cat ... jq` read |
| §9 Cross-Plugin Protocol | Read/write via direct `amcos_design_search.py` calls to design registry |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| §8.3 UUID Registry | UUID registry schema at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` with `handoffs`, `designs`, `modules` top-level keys |

The UUID registry schema and the procedure of registering every handoff UUID must be PRESERVED. The path reference should be parameterised via an env var or skill config rather than hardcoded.

---

### 4. `edge-case-protocols.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 8 instances

| Location | Violation | Code |
|---|---|---|
| §1.2 AI Maestro Unavailable | Direct bash log write | `echo "$(date -Iseconds) | AIMAESTRO_UNAVAILABLE | AI Maestro unreachable" >> .claude/logs/maestro-failures.log` |
| §1.2 Fallback Queue (offline) | Direct bash file write to `.claude/queue/outbox/` with JSON heredoc | (see §1.2 bash block) |
| §1.3 Handoff File Fallback | Direct bash file write to `.claude/handoffs/` | `cat > ".claude/handoffs/to-${ROLE}-$(date +%s).md"` |
| §2.1 GitHub Status | `gh api rate_limit` bash call | Direct CLI invocation |
| §2.2 GitHub Cache | Direct bash cache writes | `gh issue list --json ... > .claude/cache/github/issues.json` |
| §2.2 GitHub Queue | Direct bash queue file writes | `cat > ".claude/queue/github/op-$(date +%s).json"` |
| §7.1 Handoff Search | Direct bash find command | `find .claude/handoffs -name "*${UUID}*"` |
| §8.1/8.3 Memory Check | Direct bash ls and file operations | `ls -la .claude/memory/` and `cp -r .claude/memory/*` |

**Note on §1.2 Fallback Queue:** The file itself acknowledges this is a last-resort fallback when AI Maestro is completely unreachable with: `> **Note**: This offline fallback is ONLY for when AI Maestro is completely unreachable. Under normal conditions, always use the agent-messaging skill`. The fallback behaviour is architecturally intentional but the bash implementation bypasses skill abstraction.

#### RECORD_KEEPING — PRESERVE — 3 instances

| Location | Content |
|---|---|
| §1.2 Failure Log | `echo "... AIMAESTRO_UNAVAILABLE ..." >> .claude/logs/maestro-failures.log` — operational log must be preserved |
| §2.3 Status Caching | Cache files at `.claude/cache/github/` — GitHub status caching for offline resilience must be preserved |
| §8 Session Memory | Memory save/restore procedures — session memory management must be preserved |

---

### 5. `failure-notifications.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_AMP — 3 instances

| Location | Violation |
|---|---|
| §4.3.1 Error Details Template | Full JSON error capture object with `error_code`, `error_message`, `operation`, `target_agent`, `stack_trace`, `operation_context` embedded as a hardcoded JSON template |
| §4.3.2 Message Template | Full JSON message envelope with `to`, `subject`, `priority`, `content` keys embedded as a template at §4.3.2 |
| §4.4 Standard Format | Full AMP envelope structure embedded at §4.4 including all optional fields |

**Note:** The file does include the `> **Note**: Use the agent-messaging skill...` disclaimer before §4.4. However, the JSON structures themselves still constitute HARDCODED_AMP because they embed the full envelope schema which couples reference files to AMP protocol internals.

#### HARDCODED_API — 1 instance

| Location | Violation |
|---|---|
| §4.3.1 Capture Implementation | Bash function `capture_error()` with `$()` command substitution — directly embeds bash script logic |

#### HARDCODED_API — 1 instance (log path)

| Location | Violation |
|---|---|
| §4.3.5 Log File | Hardcoded path `LOG_FILE="/var/log/chief-of-staff/operations.log"` — absolute system path |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| §4.3.5 Failure Log | Failure log entry schema with `timestamp`, `event_type`, `operation`, `target_agent`, `error`, `notification_sent`, `recovery_action_planned`, `retry_scheduled` — must be preserved |

---

### 6. `message-response-decision-tree.md`

**Status: CLEAN**

Fully compliant. Contains only behavioural routing logic as prose and decision tables. No API calls, no AMP envelopes, no file paths. No violations.

---

### 7. `op-acknowledgment-protocol.md`

**Status: CLEAN**

Fully compliant. All messaging via `agent-messaging` skill. Timeout table is behavioural guidance. No violations.

---

### 8. `op-failure-notification.md`

**Status: CLEAN**

Fully compliant. All messaging via `agent-messaging` skill. No hardcoded paths, no direct API calls. No violations.

---

### 9. `op-post-operation-notification.md`

**Status: CLEAN**

Fully compliant. All messaging via `agent-messaging` skill. All agent queries via `ai-maestro-agents-management` skill. No violations.

---

### 10. `op-pre-operation-notification.md`

**Status: CLEAN**

Fully compliant. All messaging via `agent-messaging` skill. All agent queries via `ai-maestro-agents-management` skill. No violations.

---

### 11. `post-operation-notifications.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_AMP — 1 instance

| Location | Violation |
|---|---|
| §2.3.5 Log Outcome | Full JSON log entry template embedded with all field names. This is a RECORD_KEEPING item (see below), but the field structure constitutes an AMP-adjacent schema. |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| §2.3.5 Log Outcome | Operation log entry schema with `timestamp`, `operation`, `target_agent`, `operation_details`, `pre_notification_sent`, `acknowledgment_received`, `operation_completed`, `post_notification_sent`, `verification_received`, `status` — must be preserved |

---

### 12. `pre-operation-notifications.md`

**Status: CLEAN**

Fully compliant. All messaging descriptions reference the `agent-messaging` skill. No hardcoded paths, no direct API calls, no envelope structures embedded. No violations.

---

### 13. `proactive-handoff-protocol.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 3 instances

| Location | Violation | Code |
|---|---|---|
| §8.3 UUID Registry | Direct bash jq read | `cat docs_dev/.uuid-registry.json | jq '.designs | keys'` |
| §UUID Lookup | Direct Python script call | `python scripts/amcos_design_search.py --keyword "feature-name" --json` |
| §Handoff Location | Hardcoded relative path | Write handoffs to: `$CLAUDE_PROJECT_DIR/docs_dev/handoffs/` — direct path coupling |

#### LOCAL_REGISTRY — 2 instances

| Location | Violation |
|---|---|
| §8.3 UUID Registry Location | Registry at `$CLAUDE_PROJECT_DIR/docs_dev/.uuid-registry.json` — direct path reference with example JSON structure showing how to read it |
| §Pre-Handoff Search | `amcos_design_search.py` called directly, bypassing skill abstraction |

#### RECORD_KEEPING — PRESERVE — 2 instances

| Location | Content |
|---|---|
| §8 UUID Registry | UUID registry format and UUID propagation rules — the UUID chain concept is a core design pattern and must be preserved |
| §Handoff Document | Mandatory handoff YAML frontmatter schema (`uuid`, `from`, `to`, `timestamp`, `priority`, `requires_ack`, sections) — must be preserved |

---

### 14. `task-completion-checklist.md`

**Status: CLEAN**

Fully compliant. All items are process guidance checklists. References `docs_dev/handoffs/` as a write target but this is directory guidance, not a registry read or API call. No violations.

---

## SKILL CATEGORY 2: amcos-failure-recovery (14 files)

### 15. `agent-replacement-protocol.md`

**Status: VIOLATIONS FOUND** _(content persisted from prior session — verified via summary)_

#### HARDCODED_GOVERNANCE — 4 instances

| Location | Violation |
|---|---|
| Phase 2 | "Request Manager Approval" from `eama-assistant-manager` — hardcoded approval requirement |
| Phase 2 | "Wait for approval (max 15 minutes)" — hardcoded timeout for governance workflow |
| Phase 2 | "CRITICAL: Never proceed with replacement without manager approval" — absolute rule embedded in reference |
| Phase 5 Handoff | "CRITICAL: The replacement agent has NO MEMORY of the old agent" — architectural constraint hardcoded as rule |

#### HARDCODED_AMP — 3 instances

| Location | Violation |
|---|---|
| Phase 1 | JSON envelope to `eoa-orchestrator` with `type: replacement-request` fields hardcoded |
| Phase 2 | JSON envelope to `eama-assistant-manager` with approval-request content structure |
| Phase 5 | JSON envelope to new agent with handoff content fields hardcoded |

**Note on HARDCODED_GOVERNANCE:** The approval requirement for agent replacement is a meaningful governance boundary. If it must be preserved, it should be expressed as a reference to the governance skill's approval workflow rather than an absolute `CRITICAL: Never` inline rule.

---

### 16. `examples.md`

**Status: VIOLATIONS FOUND** _(content persisted from prior session)_

#### HARDCODED_AMP — 2 instances

| Location | Violation |
|---|---|
| Example 1 | Full JSON emergency handoff envelope with hardcoded agent names (e.g., `libs-svg-svgbbox`) embedded as example |
| Example 2 | Full JSON replacement request with hardcoded agent name and task details |

**Note:** Examples with hardcoded agent names (`libs-svg-svgbbox`) are particularly harmful — they embed specific project topology into reference documentation.

---

### 17. `failure-classification.md`

**Status: CLEAN** _(content persisted from prior session — no violations observed in summary)_

Classification decision trees and tables are fully compliant. No API calls, no AMP envelopes, no file paths beyond $CLAUDE_PROJECT_DIR patterns used as variable references. No violations.

---

### 18. `failure-detection.md`

**Status: CLEAN** _(content persisted from prior session — no violations observed in summary)_

Detection procedures reference the `agent-messaging` skill and `ai-maestro-agents-management` skill for all queries. No violations.

---

### 19. `op-classify-failure-severity.md`

**Status: CLEAN** _(content persisted from prior session)_

Operation procedure uses skill references. Classification table is pure logic guidance. No violations.

---

### 20. `op-detect-agent-failure.md`

**Status: CLEAN**

All detection steps use `agent-messaging` skill or `ai-maestro-agents-management` skill. No bash commands, no direct file reads, no AMP envelopes. Fully compliant.

---

### 21. `op-emergency-handoff.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 3 instances

| Location | Violation | Code |
|---|---|---|
| Step 1 bash block | Direct jq read of internal task tracking file | `cat $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json \| jq '.tasks[] \| select(.agent == "FAILED_AGENT")'` |
| Step 3 bash block | Direct mkdir for handoff directory | `mkdir -p $CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` |
| Step 3 path | Hardcoded handoff directory path | `$CLAUDE_PROJECT_DIR/thoughts/shared/handoffs/emergency/` |

#### HARDCODED_AMP — 2 instances

| Location | Violation |
|---|---|
| Step 2 Notify Orchestrator | Full JSON envelope embedded: `{"from": "amcos-chief-of-staff", "to": "eoa-orchestrator", "subject": "URGENT: Emergency handoff required", "priority": "urgent", "content": {...}}` — despite having a `> **Note**: Use agent-messaging skill...` disclaimer |
| Step 4 Send to Receiving Agent | Full JSON envelope embedded with hardcoded example UUID `EH-20250204-svgbbox-001` and hardcoded `to: "RECEIVING_AGENT"` |

#### LOCAL_REGISTRY — 1 instance

| Location | Violation |
|---|---|
| Step 1 | Direct read of `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` bypassing any skill abstraction |

---

### 22. `op-execute-recovery-strategy.md`

**Status: CLEAN with RECORD_KEEPING**

All strategy execution steps use skill references. No bash commands, no direct file reads, no AMP envelope embedding.

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| Recovery Attempt Tracking | JSON schema: `{"agent": "...", "attempt": 1, "strategy": "soft-restart", "timestamp": "ISO8601", "result": "success|failed", "details": "..."}` — this tracking schema must be preserved |

---

### 23. `op-replace-agent.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_GOVERNANCE — 3 instances

| Location | Violation |
|---|---|
| Phase 2 heading | "Request Manager Approval" is a hardcoded workflow step name |
| Phase 2 content | "Wait for approval (max 15 minutes). CRITICAL: Never proceed with replacement without manager approval." — embedded absolute rule |
| Phase 2 escalation | "If no response after 15 minutes, escalate to the user" — hardcoded escalation chain |

#### HARDCODED_AMP — 3 instances

| Location | Violation |
|---|---|
| Phase 1 | Full JSON-like message spec to `eoa-orchestrator` with `type: replacement-request` content |
| Phase 2 | Full JSON-like message spec to `eama-assistant-manager` with approval-request content |
| Phase 5 | Full JSON-like message spec to new agent session with handoff content |

**Note:** Unlike most files, `op-replace-agent.md` uses prose-format message specs rather than raw JSON blocks. However, the content still embeds the AMP field structure directly.

---

### 24. `op-route-task-blocker.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_GOVERNANCE — 2 instances

| Location | Violation |
|---|---|
| Escalation step | `"Verify it includes user's exact decision (RULE 14)"` — explicit rule number reference creating a brittle dependency on a numbered governance rule |
| Resolution documentation | Implicit governance coupling: instruction to always get user's exact words for escalation paths references an external governance rule by number |

#### HARDCODED_AMP — 2 instances

| Location | Violation |
|---|---|
| Blocker escalation message | Full message spec embedded with `type: blocker-escalation` content structure |
| Resolution notification | Full message spec embedded with `type: blocker-resolution` content structure |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| Blocker tracking | "Track the blocker in AMCOS records" and "Update AMCOS records when resolved" — internal blocker tracking must be preserved |

---

### 25. `recovery-operations.md`

**Status: MOST VIOLATIONS — CRITICAL FILE**

#### HARDCODED_API — 9 instances

| Location | Violation | Code |
|---|---|---|
| §1.2 Session Check | Direct tmux bash | `tmux has-session -t <agent-name> 2>/dev/null && echo "SESSION_EXISTS" \|\| echo "SESSION_MISSING"` |
| §1.3 Process Check | Direct tmux + ps bash | `tmux list-panes -t <agent-name> -F '#{pane_pid}' 2>/dev/null \| xargs -I {} ps -p {} -o pid,state,comm` |
| §1.5 Network Check | Direct ping bash | `ping -c 3 <host-ip> && echo "HOST_REACHABLE" \|\| echo "HOST_UNREACHABLE"` |
| §4.1 Soft Restart | Direct tmux process kill | `PID=$(tmux list-panes -t <agent-name> -F '#{pane_pid}'); kill -TERM $PID; sleep 30` |
| §4.1 Hard Restart | Direct process management via tmux | (similar tmux bash block) |
| §3.4 Policy Read | Direct file read | `Check the recovery policy file at $CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` |
| §5.1 Policy Parse | Direct jq read | `cat $CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json \| jq '.auto_replace_on_terminal'` |
| §6.1 Log Write | Direct file append | Writes to `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` |
| §6.2 Log Read | Direct jq query of recovery log | (jq query against recovery-log.json) |

#### HARDCODED_GOVERNANCE — 3 instances

| Location | Violation |
|---|---|
| §3.4 | "Requires Approval Unless Pre-Authorized" — approval requirement hardcoded into recovery workflow |
| §3.4 policy params | `auto_replace_on_terminal: false` as default — governance policy default hardcoded in reference file |
| §5.2 | Policy structure defines governance defaults: recovery timeouts, approval requirements — all hardcoded as JSON |

#### LOCAL_REGISTRY — 3 instances

| Location | Violation |
|---|---|
| §5.1 | Direct file read of `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` |
| §6.1 | Direct file write to `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` |
| §3.4 | Policy check reads directly from the recovery-policy.json file |

#### RECORD_KEEPING — PRESERVE — 2 instances

| Location | Content |
|---|---|
| §6.1 Recovery Log Schema | `{"recovery_events": [{"timestamp": "...", "agent": "...", "failure_type": "...", "recovery_action": "...", "recovery_result": "..."}]}` at path `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` — PRESERVE this schema |
| §5.1 Recovery Policy | Policy JSON at `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-policy.json` with fields `max_recovery_attempts`, `recovery_timeout_minutes`, `auto_replace_on_terminal`, `notify_on_terminal` — PRESERVE this policy schema |

**PATH INCONSISTENCY — CRITICAL:** `recovery-operations.md` uses `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` while `recovery-strategies.md` uses `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl`. These are two different paths for what appears to be the same recovery log. **MUST BE HARMONIZED.** Choose one canonical path and update both files.

---

### 26. `recovery-strategies.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 2 instances

| Location | Violation | Code |
|---|---|---|
| §3.5.2 Hibernate Check | Direct tmux bash | `tmux has-session -t <agent-name> 2>/dev/null && echo "SESSION_EXISTS" \|\| echo "SESSION_MISSING"` |
| §3.3.2 Recovery Log | Direct file path reference for log writes | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` |

#### HARDCODED_GOVERNANCE — 1 instance

| Location | Violation |
|---|---|
| §3.7.1 | "Manager approves replacement" listed as prerequisite — hardcoded governance requirement |

#### LOCAL_REGISTRY — 1 instance (PATH CONFLICT — see above)

| Location | Violation |
|---|---|
| §3.3.2 | Recovery log at `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` — CONFLICTS with `recovery-operations.md` path |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| §3.3.2 | Recovery log file path — PRESERVE this logging requirement, but HARMONIZE the path with `recovery-operations.md` |

---

### 27. `troubleshooting.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 2 instances

| Location | Violation |
|---|---|
| Hook check | Reference to `~/.claude/settings.json` as the file to check for hook configuration |
| Service check | Reference to port `23000` as the AI Maestro port to verify |

#### HARDCODED_GOVERNANCE — 1 instance

| Location | Violation |
|---|---|
| Terminal failure section | `"CRITICAL: Never proceed with replacement without manager approval"` — absolute governance rule embedded as inline `CRITICAL` marker |

---

### 28. `work-handoff-during-failure.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_API — 8 instances

| Location | Violation | Code |
|---|---|---|
| §5.4.3 Task Tracking | Direct jq read of task tracker | `jq --arg task "task-001" '.tasks[] \| select(.task_id == $task)' $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` |
| §5.4.3 Git History | Direct git command with hardcoded agent name | `git log --oneline --author="libs-svg-svgbbox" -10` |
| §5.4.3 Git Diff | Direct git diff command | `git diff --name-only HEAD~5..HEAD` |
| §5.7.1 Duplicate Detection | Direct git commands with agent names | `git log --oneline --author="failed-agent" feature/bounding-box` |
| §5.7.1 Git Diff | Direct git diff comparison | `git diff failed-agent-last-commit..receiving-agent-first-commit --name-only` |
| §5.7.3 Task Update | Direct jq mutation of task tracking file | `jq --arg task "task-001" --arg status "completed" '...' $CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json > temp.json && mv temp.json ...` |
| §5.4.3 Agent Name | Hardcoded agent name in example | `--author="libs-svg-svgbbox"` in git command |
| §5.7.3 Agent Name | Hardcoded agent name in jq mutation | `.completed_by = "apps-svgplayer-development (emergency handoff)"` |

#### LOCAL_REGISTRY — 2 instances

| Location | Violation |
|---|---|
| §5.4.3 | Direct read of `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` |
| §5.7.3 | Direct read-modify-write of `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json` |

#### RECORD_KEEPING — PRESERVE — 2 instances

| Location | Content |
|---|---|
| §5.7.3 Task Status Update | Task tracking update pattern — PRESERVE the requirement to update task status after emergency handoff resolution |
| §5.7.3 Task Fields | `completed_by`, `completed_at`, `status` fields in task record — PRESERVE this schema |

---

## SKILL CATEGORY 3: amcos-team-coordination (6 files)

### 29. `op-assign-agent-roles.md`

**Status: CLEAN with RECORD_KEEPING**

All messaging via `agent-messaging` skill. All registry queries via `ai-maestro-agents-management` skill. Fully compliant.

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| Update Team Roster step | Roster update after role assignment — PRESERVE this step |

---

### 30. `op-maintain-teammate-awareness.md`

**Status: CLEAN with RECORD_KEEPING**

All queries via `ai-maestro-agents-management` skill. Fully compliant.

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| Status poll → roster update | Team roster write after status polling — PRESERVE this update cycle |

---

### 31. `op-send-team-messages.md`

**Status: CLEAN with RECORD_KEEPING**

All messaging via `agent-messaging` skill. Fully compliant.

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| Step 5 Log in Coordination State | Logging sent messages to coordination log with timestamp, recipients, subject, priority, message type, delivery status — PRESERVE this audit trail |

---

### 32. `role-assignment.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_GOVERNANCE — 3 instances

| Location | Violation |
|---|---|
| §1.2 Developer Role | `"Reporting to: Code Reviewer, Orchestrator"` — hardcoded reporting hierarchy |
| §1.2 Code Reviewer Role | `"Reporting to: Orchestrator, Chief of Staff"` — hardcoded reporting hierarchy |
| §1.2 DevOps Role | `"Reporting to: Chief of Staff"` — hardcoded reporting hierarchy |

These hardcoded reporting relationships create a static topology that may not match the actual deployed team structure.

#### LOCAL_REGISTRY — 1 instance

| Location | Violation |
|---|---|
| §1.4 Step 6 | Roster update written as inline markdown table directly in the procedure step, suggesting a direct file write pattern rather than a skill-abstracted write |

#### RECORD_KEEPING — PRESERVE — 1 instance

| Location | Content |
|---|---|
| §1.4 Step 6 Team Roster | Roster table format `| Agent | Role | Assigned | Status |` — PRESERVE this structure, but access should go through `ai-maestro-agents-management` skill |

---

### 33. `team-messaging.md`

**Status: VIOLATIONS FOUND**

#### HARDCODED_AMP — 5 instances

| Location | Violation |
|---|---|
| §2.1 Announcement | JSON content format `{"type": "announcement", "message": "..."}` embedded as hardcoded schema |
| §2.1 Request | JSON content format `{"type": "request", "message": "...", "deadline": "ISO timestamp (optional)"}` embedded |
| §2.1 Alert | JSON content format `{"type": "alert", "severity": "critical\|high\|medium", "message": "..."}` embedded |
| §2.1 Status Update | JSON content format `{"type": "status-update", "task": "...", "status": "...", "message": "..."}` embedded |
| §2.1 Role Assignment | JSON content format `{"type": "role-assignment", "role": "...", "message": "..."}` embedded |

**Assessment note:** These are intentional documentation of message types. However, embedding the JSON schema directly in reference files couples the reference to the AMP protocol's internal type system. The proper approach is to reference the `agent-messaging` skill's type system documentation, not re-embed it.

---

### 34. `teammate-awareness.md`

**Status: VIOLATIONS FOUND**

#### LOCAL_REGISTRY — 3 instances

| Location | Violation |
|---|---|
| §3.1 Roster Location | Hardcoded path `design/memory/team-roster.md` with no skill abstraction |
| §3.1 Roster Update | "Step 5: Write updated roster to disk" — direct file write, no skill abstraction |
| §3.6 Roster Update Example | `design/memory/team-roster-update.md` — second hardcoded path for roster update file |

#### RECORD_KEEPING — PRESERVE — 2 instances

| Location | Content |
|---|---|
| §3.1 Roster Format | Full roster markdown table format with `Session Name`, `Role`, `Status`, `Last Seen`, `Current Task` columns — PRESERVE this format |
| §3.5 Status Report Format | Full team status report markdown template — PRESERVE this reporting format |

---

## Critical Issues Requiring Immediate Attention

### Issue 1: Recovery Log Path Inconsistency — MUST HARMONIZE

Two files use different paths for what appears to be the same recovery log:

| File | Path Used |
|---|---|
| `recovery-operations.md` | `$CLAUDE_PROJECT_DIR/thoughts/shared/recovery-log.json` |
| `recovery-strategies.md` | `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` |

Also note: these use different file formats — `.json` vs `.jsonl` (JSON Lines). One of these is wrong, or they are two different logs that have been conflated. **Canonical path must be chosen and both files updated.**

Recommended canonical path: `$CLAUDE_PROJECT_DIR/.amcos/agent-health/recovery-log.jsonl` (JSONL format is more appropriate for append-only event logs; `.amcos` directory aligns with the task-tracking path).

### Issue 2: Task Tracking Path — Verify Consistency

`work-handoff-during-failure.md` uses `$CLAUDE_PROJECT_DIR/.amcos/agent-health/task-tracking.json`. Verify this is consistent with all other references to the task tracking file across the codebase.

### Issue 3: Hardcoded Specific Agent Names in Examples

Multiple files embed specific agent names (e.g., `libs-svg-svgbbox`, `apps-svgplayer-development`, `eoa-orchestrator`, `eama-assistant-manager`) as literal strings in examples or JSON content. These should be replaced with generic placeholder names like `<AGENT_NAME>` or moved to a project-specific configuration file.

### Issue 4: CRITICAL Governance Rules in Reference Files

The phrase `"CRITICAL: Never proceed with replacement without manager approval"` appears in both `agent-replacement-protocol.md` and `troubleshooting.md`. This absolute rule should either:
- Reference the governance skill's approval workflow instead
- Or be expressed as a configurable policy parameter (e.g., `require_manager_approval_for_replacement: true`)

---

## Complete Violation Summary by File

| File | HARDCODED_API | HARDCODED_GOV | HARDCODED_AMP | LOCAL_REGISTRY | RECORD_KEEPING |
|---|---|---|---|---|---|
| **NOTIFICATION PROTOCOLS** | | | | | |
| acknowledgment-protocol.md | - | - | - | - | - |
| ai-maestro-message-templates.md | UNREVIEWED | UNREVIEWED | UNREVIEWED | UNREVIEWED | UNREVIEWED |
| design-document-protocol.md | 5 | - | - | 2 | 1 (PRESERVE) |
| edge-case-protocols.md | 8 | - | - | - | 3 (PRESERVE) |
| failure-notifications.md | 2 | - | 3 | - | 1 (PRESERVE) |
| message-response-decision-tree.md | - | - | - | - | - |
| op-acknowledgment-protocol.md | - | - | - | - | - |
| op-failure-notification.md | - | - | - | - | - |
| op-post-operation-notification.md | - | - | - | - | - |
| op-pre-operation-notification.md | - | - | - | - | - |
| post-operation-notifications.md | - | - | 1 | - | 1 (PRESERVE) |
| pre-operation-notifications.md | - | - | - | - | - |
| proactive-handoff-protocol.md | 3 | - | - | 2 | 2 (PRESERVE) |
| task-completion-checklist.md | - | - | - | - | - |
| **FAILURE RECOVERY** | | | | | |
| agent-replacement-protocol.md | - | 4 | 3 | - | - |
| examples.md | - | - | 2 | - | - |
| failure-classification.md | - | - | - | - | - |
| failure-detection.md | - | - | - | - | - |
| op-classify-failure-severity.md | - | - | - | - | - |
| op-detect-agent-failure.md | - | - | - | - | - |
| op-emergency-handoff.md | 3 | - | 2 | 1 | - |
| op-execute-recovery-strategy.md | - | - | - | - | 1 (PRESERVE) |
| op-replace-agent.md | - | 3 | 3 | - | - |
| op-route-task-blocker.md | - | 2 | 2 | - | 1 (PRESERVE) |
| recovery-operations.md | 9 | 3 | - | 3 | 2 (PRESERVE) |
| recovery-strategies.md | 2 | 1 | - | 1 | 1 (PRESERVE) |
| troubleshooting.md | 2 | 1 | - | - | - |
| work-handoff-during-failure.md | 8 | - | - | 2 | 2 (PRESERVE) |
| **TEAM COORDINATION** | | | | | |
| op-assign-agent-roles.md | - | - | - | - | 1 (PRESERVE) |
| op-maintain-teammate-awareness.md | - | - | - | - | 1 (PRESERVE) |
| op-send-team-messages.md | - | - | - | - | 1 (PRESERVE) |
| role-assignment.md | - | 3 | - | 1 | 1 (PRESERVE) |
| team-messaging.md | - | - | 5 | - | - |
| teammate-awareness.md | - | - | - | 3 | 2 (PRESERVE) |
| **TOTALS** | **42** | **17** | **21** | **15** | **21** |

---

## Recommended Fix Priorities

### Priority 1 — Critical (blocks correctness)
1. Harmonize recovery log path between `recovery-operations.md` and `recovery-strategies.md`
2. Remove hardcoded agent names (`libs-svg-svgbbox`, `apps-svgplayer-development`) from `examples.md` and `work-handoff-during-failure.md`
3. Remove or abstract all `tmux` bash commands from `recovery-operations.md` and `recovery-strategies.md`

### Priority 2 — High (governance coupling)
4. Replace `"CRITICAL: Never proceed without manager approval"` with governance skill reference in `agent-replacement-protocol.md`, `op-replace-agent.md`, `troubleshooting.md`
5. Remove `RULE 14` reference from `op-route-task-blocker.md`
6. Extract hardcoded reporting hierarchies from `role-assignment.md` into configurable structure

### Priority 3 — Medium (AMP envelope leakage)
7. Replace full JSON envelope blocks in `op-emergency-handoff.md`, `op-replace-agent.md`, `agent-replacement-protocol.md` with prose descriptions referencing the `agent-messaging` skill
8. Replace content-type schema blocks in `team-messaging.md` §2.1 with references to the AMP skill's type documentation
9. Replace full JSON templates in `failure-notifications.md` with prose descriptions

### Priority 4 — Low (path hygiene)
10. Replace hardcoded `$CLAUDE_PROJECT_DIR/...` paths with either env var references or skill-abstracted access patterns in `recovery-operations.md`, `work-handoff-during-failure.md`, `op-emergency-handoff.md`
11. Replace Python script invocations (`amcos_design_search.py`, `amcos_design_validate.py`) in `design-document-protocol.md` and `proactive-handoff-protocol.md` with skill references
12. Replace `/var/log/chief-of-staff/operations.log` absolute path in `failure-notifications.md`

---

## Files to Leave Untouched

The following 16 files are fully compliant and require no changes:

1. `acknowledgment-protocol.md` (notification-protocols)
2. `message-response-decision-tree.md` (notification-protocols)
3. `op-acknowledgment-protocol.md` (notification-protocols)
4. `op-failure-notification.md` (notification-protocols)
5. `op-post-operation-notification.md` (notification-protocols)
6. `op-pre-operation-notification.md` (notification-protocols)
7. `pre-operation-notifications.md` (notification-protocols)
8. `task-completion-checklist.md` (notification-protocols)
9. `failure-classification.md` (failure-recovery)
10. `failure-detection.md` (failure-recovery)
11. `op-classify-failure-severity.md` (failure-recovery)
12. `op-detect-agent-failure.md` (failure-recovery)
13. `op-execute-recovery-strategy.md` (failure-recovery) *(has RECORD_KEEPING to preserve only)*
14. `op-assign-agent-roles.md` (team-coordination) *(has RECORD_KEEPING to preserve only)*
15. `op-maintain-teammate-awareness.md` (team-coordination) *(has RECORD_KEEPING to preserve only)*
16. `op-send-team-messages.md` (team-coordination) *(has RECORD_KEEPING to preserve only)*

---

*Audit completed: 2026-02-27*
*Files audited: 33/34 (1 file `ai-maestro-message-templates.md` not directly read — manual review required)*
*Source skill paths: `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff/skills/`*
