# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:45.257Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-part1.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-AMCOS-violations-part1.md
Line 107: | RK-22 | `skills/amcos-permission-management/references/approval-tracking.md` | AMCOS-local YAML state at `docs_dev/state/amcos-approval-tracking.yaml` tracking `escalation_count`, `last_reminder_at`, `timeout_at`, `decided_by`, `modifications`, `notes` | Tracks AMCOS-specific approval state fields not stored in AI Maestro GovernanceRequest API. Must be preserved and mirrored to AI Maestro (see harmonization section). |
Line 110: | RK-24 | `skills/amcos-permission-management/references/approval-workflow-engine.md` §10 | Autonomous mode config at `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` with `enabled`, `permissions.{operation_type}.allowed`, `current_hour_count` | Rate limiting and per-operation permission grants for autonomous mode — must be stored somewhere persistent |
Line 111: | RK-25 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Lifecycle Log at `docs_dev/amcos-team/agent-lifecycle.log` — SPAWN, TERMINATE, HIBERNATE, WAKE, TEAM_ADD, TEAM_REMOVE, STATUS_CHANGE, FAILURE, ROLLBACK events (append-only) | No AI Maestro equivalent. AMCOS accountability audit trail for all lifecycle operations. |
Line 112: | RK-26 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Approval Requests Log at `docs_dev/chief-of-staff/approvals/approval-requests-YYYY-MM.log` | Tracks EAMA-based approval decisions — distinct from AI Maestro GovernanceRequest (which handles cross-host governance) |
Line 113: | RK-27 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Team Assignments Log at `docs_dev/chief-of-staff/team-assignments.md` (human-readable, regenerated daily) | Human-readable summary for AMCOS operator — no AI Maestro equivalent |
Line 114: | RK-28 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Operation Audit Trail at `docs_dev/chief-of-staff/operations/operation-YYYY-MM-DD.log` | Per-operation detailed log with request IDs — no AI Maestro equivalent |
Line 115: | RK-29 | `skills/amcos-agent-lifecycle/references/record-keeping.md` | Agent Registry at `docs_dev/chief-of-staff/agent-registry.json` — full lifecycle history per agent including team memberships, hibernation records, timestamps | AMCOS's master record with `spawned_by`, `team_memberships` history — richer than AI Maestro's agent registry |
Line 116: | RK-30 | `skills/amcos-agent-lifecycle/references/success-criteria.md` §186–190 | Approval audit log at `docs_dev/chief-of-staff/approval-audit.log` | Approval request verification log for post-hoc audit |
Line 123: The AMCOS plugin implements a **two-layer, dual-tracking approval system** that is architecturally sound but contains Plugin Abstraction Principle violations in how it calls the AI Maestro API.
Line 125: **Layer 1 — AMCOS-internal approval tracking** (`docs_dev/state/amcos-approval-tracking.yaml`)
Line 127: AMCOS maintains a richer approval state than what AI Maestro's GovernanceRequest API stores. The local YAML tracks:
Line 131: | `operation type` | AMCOS scheme: `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install` | AI Maestro scheme: `create-agent`, `transfer-agent`, `add-to-team` |
Line 132: | `status` | `pending` / `escalated` / `resolved` | `pending` / `approved` / `rejected` / `executed` |
Line 135: | `decided_by` | `eama` / `autonomous` / `timeout` | Via `approverAgentId` |
Line 137: | `rollback_plan` | Yes (workflow engine) | No |
Line 138: | `escalation events` | Audit YAML | No |
Line 139: | `autonomous_directives` | Yes (local JSON) | No |
Line 141: **Layer 2 — AI Maestro GovernanceRequest API** (`$AIMAESTRO_API/api/v1/governance/requests`)
Line 143: AMCOS currently calls this API via hardcoded `curl` commands in `approval-workflow-engine.md` and `op-track-pending-approvals.md`. These calls are functionally correct (the integration intent is right) but violate Rule 2 of the Plugin Abstraction Principle by embedding `curl` directly.
Line 145: **Layer 3 — Escalation and audit logs** (`docs_dev/audit/amcos-escalations-{date}.yaml`, `$CLAUDE_PROJECT_DIR/thoughts/shared/approval-audit.log`)
Line 147: Append-only audit trails that are AMCOS-private and have no AI Maestro equivalent. These must be preserved as-is.
Line 151: Before any abstraction work, three internal consistency bugs must be fixed:
Line 153: **Bug 1 — EAMA recipient name (CRITICAL — functional breakage):** Seven files disagree on the EAMA agent name:
Line 154: - `eama-assistant-manager` — used in: `approval-escalation.md`, `approval-request-procedure.md`, `examples.md`, `op-handle-approval-timeout.md`
Line 155: - `eama-main` — used in: `approval-workflow-engine.md`, `op-request-approval.md`
Line 157: Approval requests sent to `eama-main` will not be received by an agent named `eama-assistant-manager`. Resolution: define a single `EAMA_SESSION_NAME` configurable constant and reference it from all files. Do not hardcode either name.
Line 159: **Bug 2 — Approval type code schema (HIGH — incompatible schemas):** Two sets of type codes are in use:
Line 160: - `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install` — in `approval-types-detailed.md`, `op-request-approval.md`
Line 161: - `agent_spawn`, `agent_terminate`, `agent_replace`, `plugin_install`, `critical_operation` — in `approval-workflow-engine.md`
Line 163: A request created using one schema cannot be processed by components using the other. Resolution: choose one namespace (recommended: prefix with `amcos.` to distinguish from AI Maestro's own GovernanceRequest types, e.g., `amcos.spawn`, `amcos.terminate`).
Line 165: **Bug 3 — Timeout policy contradiction (HIGH):** `approval-escalation.md` says `spawn` → PROCEED on timeout; `approval-workflow-engine.md` says `agent_spawn` → Auto-reject. These are contradictory and both affect the same operation. Resolution: unify in one canonical policy document and reference it from both files.
Line 169: The AMCOS internal approval system and AI Maestro's GovernanceRequest API serve **complementary, not competing purposes**:
Line 174: | AMCOS local YAML | Escalation state, timing, reminder count, rollback plan | AMCOS-internal only |
Line 175: | AI Maestro GovernanceRequest | Formal approval record visible to all AI Maestro components | Cross-system visibility |
Line 177: **Recommended harmonized flow (PRESERVE + EXTEND):**
Line 180:     ├─► CREATE entry in local YAML (pending)        ← preserve as-is
Line 182:     └─► REFERENCE the `team-governance` skill        ← replace direct curl
Line 184:          (for AI Maestro cross-system visibility)
Line 186:     AMCOS tracks escalation locally
Line 187:     (reminds, updates escalation_count, last_reminder_at)  ← preserve as-is
Line 191:     ├─► UPDATE local YAML (resolved + decision)     ← preserve as-is
Line 193:     └─► REFERENCE `team-governance` skill            ←