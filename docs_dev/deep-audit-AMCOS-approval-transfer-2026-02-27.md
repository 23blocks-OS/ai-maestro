# Deep Audit: AMCOS Approval & Transfer Reference Files
## Plugin Abstraction Principle Compliance Audit

**Date:** 2026-02-27
**Auditor:** Deep audit task agent
**Governance Reference:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` + `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Scope:** 12 permission-management + 2 transfer-management reference files in the AMCOS plugin

---

## SUMMARY

This audit covers all 14 files in the AMCOS plugin's reference directories:

| File | Total Violations | Severity Breakdown |
|------|-----------------|-------------------|
| `approval-escalation.md` | 1 | 1 MEDIUM |
| `approval-request-procedure.md` | 1 | 1 LOW |
| `approval-tracking.md` | 2 | 1 HIGH, 1 MEDIUM |
| `approval-types-detailed.md` | 0 | — |
| `approval-workflow-engine.md` | 4 | 1 HIGH, 1 HIGH, 1 MEDIUM, 1 LOW |
| `examples.md` | 0 | — |
| `op-handle-approval-timeout.md` | 1 | 1 MEDIUM |
| `op-request-approval.md` | 2 | 1 HIGH, 1 MEDIUM |
| `op-track-pending-approvals.md` | 3 | 2 HIGH, 1 MEDIUM |
| `rule-14-enforcement.md` | 0 | — |
| `op-approve-transfer-request.md` | 2 | 1 CRITICAL, 1 HIGH |
| `op-create-transfer-request.md` | 2 | 1 CRITICAL, 1 HIGH |

**APPROVAL SYSTEM STATUS:** The AMCOS plugin has a sophisticated, two-layer approval system that is LARGELY WELL-DESIGNED. It tracks approvals locally (YAML state files + audit logs) AND routes through AI Maestro's GovernanceRequest API. This dual-tracking must be PRESERVED. See Section 4 for detailed harmonization analysis.

---

## SECTION 1: FINDINGS BY FILE

---

### FILE 1: `skills/amcos-permission-management/references/approval-escalation.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/approval-escalation.md`

#### Finding 1.1

- **Violation type:** HARDCODED_GOVERNANCE (partial)
- **Severity:** MEDIUM
- **Lines:** 88–96 (timeout action decision table)
- **What it currently does:** Hardcodes the per-operation "proceed vs abort" decision table directly in the reference file:
  ```
  | spawn         | PROCEED  |
  | terminate     | ABORT    |
  | hibernate     | PROCEED  |
  | wake          | PROCEED  |
  | plugin_install| ABORT    |
  ```
- **Problem:** These timeout policies are governance configuration. They should be discoverable at runtime from the governance system or configurable by the manager, not hardcoded in the plugin's reference files.
- **What it should do instead:** The table can remain as a **documented default** (i.e., "these are the defaults if the governance config does not specify otherwise"), but the file should include a note: "Before applying these defaults, check if the AMCOS autonomous-mode configuration or an active manager directive specifies a different timeout policy for this operation type. Follow the `team-governance` skill to discover current governance configuration." The harmonization approach is to treat this table as a fallback, not an absolute rule.

**Status of other checks in this file:**
- **HARDCODED_API:** None. All messaging is delegated to the `agent-messaging` skill. ✓ VERIFIED
- **HARDCODED_AMP:** None. All AMP messaging is properly delegated to the `agent-messaging` skill with structured content fields. ✓ VERIFIED
- **LOCAL_REGISTRY:** None. ✓ VERIFIED
- **APPROVAL_SYSTEM:** The escalation audit log at `docs_dev/audit/amcos-escalations-{date}.yaml` is a PLUGIN-LOCAL audit trail (not AI Maestro's GovernanceRequest). This is intentional and correct — see Section 4.
- **REDUNDANT_OPERATIONS:** None significant.

---

### FILE 2: `skills/amcos-permission-management/references/approval-request-procedure.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/approval-request-procedure.md`

#### Finding 2.1

- **Violation type:** HARDCODED_GOVERNANCE (minor)
- **Severity:** LOW
- **Lines:** 43–110 (Section 1.2, "When to Request Approval")
- **What it currently does:** Lists specific trigger conditions for each operation type (e.g., "agent idle beyond threshold (default: 30 minutes)"). This is governance configuration embedded in the plugin.
- **What it should do instead:** The 30-minute idle threshold and similar operational thresholds should be described as defaults that can be configured or overridden by manager directives. Add a note: "These triggers represent default AMCOS behavior. A manager directive (via EAMA) may specify different thresholds. Always check for active directives before applying defaults."

**Status of other checks in this file:**
- **HARDCODED_API:** None. Step 4 (Section 1.3.4) correctly uses the `agent-messaging` skill. ✓ VERIFIED
- **HARDCODED_AMP:** None. Section 1.4 specifies message structure without embedding AMP envelope syntax — it describes fields for the skill to handle. ✓ VERIFIED
- **LOCAL_REGISTRY:** None. ✓ VERIFIED
- **APPROVAL_SYSTEM:** Correctly describes the full approval workflow lifecycle. The request tracking in this file is conceptual, pointing to the concrete implementation in `approval-tracking.md`. ✓ VERIFIED

---

### FILE 3: `skills/amcos-permission-management/references/approval-tracking.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/approval-tracking.md`

#### Finding 3.1

- **Violation type:** LOCAL_REGISTRY (state file)
- **Severity:** HIGH
- **Lines:** 263–375 (Section 2.4, "State File Format")
- **What it currently does:** Defines a plugin-local YAML state file at `docs_dev/state/amcos-approval-tracking.yaml` with full Python code to read/write it. The state tracks all active and resolved approval requests independently of AI Maestro's GovernanceRequest system.
- **Problem:** This creates a parallel persistence layer that diverges from AI Maestro's canonical approval state stored at `/api/v1/governance/requests`. If AI Maestro restarts or another agent checks governance state, the plugin's YAML file is invisible to the rest of the system.
- **What it should do instead (HARMONIZATION — NOT REMOVAL):** The local YAML state file serves a valid purpose: it tracks AMCOS-internal state fields that AI Maestro's GovernanceRequest API may not store (e.g., `escalation_count`, `last_reminder_at`, `decided_by`, `modifications`, `notes`). The harmonized approach is:
  - **Keep the local YAML** as the authoritative source for AMCOS-specific tracking fields (escalation state, timing, local decisions).
  - **Mirror the canonical state to AI Maestro** by calling `POST /api/v1/governance/requests` when creating a new request, and `PATCH /api/v1/governance/requests/{id}` when updating status.
  - The local file remains for AMCOS-specific fields not exposed in the AI Maestro API.
  - Add a note in Section 2.4: "This state file tracks AMCOS-internal fields. The canonical approval status is mirrored to AI Maestro's GovernanceRequest API at `$AIMAESTRO_API/api/v1/governance/requests`. Always update both."

#### Finding 3.2

- **Violation type:** HARDCODED_GOVERNANCE (minor)
- **Severity:** MEDIUM
- **Lines:** 95–122 (Section 2.3.1, `register_request` Python code)
- **What it currently does:** Hardcodes `timeout = submitted_at + 120 seconds` in Python code with no mechanism to discover or override this from governance configuration.
- **What it should do instead:** Add a comment noting that the 120-second timeout is the default configurable timeout. Before using it, check if an autonomous directive or manager config specifies a different timeout. Reference the `team-governance` skill for discovering current governance configuration.

**Status of other checks in this file:**
- **HARDCODED_API:** None. ✓ VERIFIED — the tracking file does not embed any API calls directly; it describes a Python state machine.
- **HARDCODED_AMP:** None. ✓ VERIFIED
- **APPROVAL_SYSTEM:** Fully analyzed above. This IS the approval tracking system. See Section 4 for harmonization architecture.

---

### FILE 4: `skills/amcos-permission-management/references/approval-types-detailed.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/approval-types-detailed.md`

No violations found. This file is a conceptual reference describing the five approval operation types (spawn, terminate, hibernate, wake, plugin_install) with justification requirements and EAMA decision options. It contains no API calls, no curl commands, no hardcoded governance rules beyond defining the approval taxonomy itself.

The approval taxonomy (spawn/terminate/hibernate/wake/plugin_install) is AMCOS-domain knowledge and is appropriate to define in this plugin.

---

### FILE 5: `skills/amcos-permission-management/references/approval-workflow-engine.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/approval-workflow-engine.md`

#### Finding 5.1

- **Violation type:** HARDCODED_API + LOCAL_REGISTRY (autonomous mode config)
- **Severity:** HIGH
- **Lines:** 140–160 (Section 1.4), 641–724 (Section 10)
- **What it currently does:** Reads autonomous mode configuration from a local file at `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` using direct `jq` file reads:
  ```bash
  autonomous_file="$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json"
  enabled=$(jq -r '.enabled' "$autonomous_file")
  allowed=$(jq -r ".permissions.${operation_type}.allowed" "$autonomous_file")
  ```
  Also writes to this file directly to increment counters:
  ```bash
  jq ".permissions.${operation_type}.current_hour_count += 1" "$autonomous_file" > tmp && mv tmp "$autonomous_file"
  ```
- **What it should do instead:** The autonomous mode configuration, if it is to be persisted, should either use AI Maestro's API to store and retrieve it (e.g., via agent metadata or a governance configuration endpoint), or remain as a plugin-local file with clear documentation that it is AMCOS-private state not visible to AI Maestro. The direct `jq` file manipulation for state updates is fragile (the `> tmp && mv tmp` pattern is not atomic). The harmonized approach:
  - Either store autonomous-mode config in AI Maestro agent metadata via `PUT /api/agents/{id}` (preferred for cross-session persistence)
  - Or clearly document this as AMCOS-private ephemeral state that resets when the agent session ends
  - Either way, the file should NOT be read by external agents or governance queries — this is purely AMCOS-internal

#### Finding 5.2

- **Violation type:** HARDCODED_API (direct curl to governance API)
- **Severity:** HIGH
- **Lines:** 242–279 (Section 3), 362–373 (Section 5.3), 480–489 (Section 7.4), 497–505 (Section 8.1), 390–403 (Section 6.2)
- **What it currently does:** Uses direct `curl` calls to `$AIMAESTRO_API/api/v1/governance/requests` with hardcoded endpoint paths and JSON bodies:
  ```bash
  curl -s -X PATCH "$AIMAESTRO_API/api/v1/governance/requests/AR-1706795200-abc123" \
    -H "Content-Type: application/json" \
    -d '{"status": "approved"}'
  ```
  ```bash
  curl -s -X PATCH "$AIMAESTRO_API/api/v1/governance/requests/AR-xxx" \
    -H "Content-Type: application/json" \
    -d '{"status": "timeout"}'
  ```
- **Assessment:** Per the Plugin Abstraction Principle, plugin hooks/scripts MUST NOT call the API directly. However, there is an important nuance: this file references these calls while explicitly labeling them "Uses AI Maestro REST API (not file-based)" — suggesting the author was aware this is the proper pattern vs local file reads. The violation is that the curl syntax is embedded directly rather than delegating to a global script.
- **What it should do instead:** The curl calls to the GovernanceRequest API should be wrapped by the `team-governance` skill (for agent-facing operations) or a dedicated `aimaestro-governance.sh` global script (for script/hook contexts). The skill/script would abstract the endpoint, auth headers, and JSON format. Note: as of the current team-governance skill, PATCH operations on governance requests are not explicitly documented — this gap in the global skill needs to be filled before this file can fully delegate. The file should reference: "Follow the `team-governance` skill to manage GovernanceRequest state transitions" rather than embedding curl syntax.

#### Finding 5.3

- **Violation type:** HARDCODED_GOVERNANCE
- **Severity:** MEDIUM
- **Lines:** 181–204 (Section 2)
- **What it currently does:** Hardcodes the complete approval type taxonomy with timeout policies:
  ```
  | agent_spawn     | Auto-reject |
  | agent_terminate | Auto-reject |
  | agent_replace   | Auto-reject |
  | plugin_install  | Auto-reject |
  | critical_operation | Escalate |
  ```
- **Note:** This is different from (and partially conflicts with) the timeout policies in `approval-escalation.md` (which says `spawn` → PROCEED, `hibernate` → PROCEED). This **internal inconsistency** is itself a bug in the plugin that needs resolution independent of the abstraction principle.
- **What it should do instead:** The default timeout policies can remain as documented defaults. Add a cross-reference note pointing to `approval-escalation.md` and flagging the discrepancy for resolution. The canonical policy should be unified in one place.

#### Finding 5.4

- **Violation type:** HARDCODED_AMP (message format embedded)
- **Severity:** LOW
- **Lines:** 284–297 (Section 4.1)
- **What it currently does:** Specifies exact AMP message content structure:
  ```
  Content type: "approval_request"
  Must include: request_id, timeout_seconds: 120
  Recipient: "eama-main"
  ```
  Also hardcodes the EAMA recipient name as `eama-main` in the engine, while other files use `eama-assistant-manager`. This is another internal inconsistency.
- **What it should do instead:** The message to EAMA should be sent via the `agent-messaging` skill without hardcoding the exact content type strings. The skill handles the AMP envelope. The recipient name inconsistency (`eama-main` vs `eama-assistant-manager`) needs to be resolved — one canonical name should be used and stored as a configurable value, not hardcoded in multiple files.

**Status of other checks in this file:**
- **APPROVAL_SYSTEM:** This file IS the workflow engine specification for the approval system. See Section 4 for harmonization architecture.

---

### FILE 6: `skills/amcos-permission-management/references/examples.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/examples.md`

No violations found. All four examples correctly use the `agent-messaging` skill for sending messages. No curl commands or hardcoded API endpoints. The examples are appropriate illustrative patterns.

---

### FILE 7: `skills/amcos-permission-management/references/op-handle-approval-timeout.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/op-handle-approval-timeout.md`

#### Finding 7.1

- **Violation type:** HARDCODED_API
- **Severity:** MEDIUM
- **Lines:** 52–55 (Step 1: Check Request Age)
- **What it currently does:** Embeds a direct curl call to the governance API in the procedure step:
  ```bash
  curl -s "$AIMAESTRO_API/api/v1/governance/requests/$REQUEST_ID" | jq '{...}'
  ```
- **What it should do instead:** The step should say "Follow the `team-governance` skill to query the GovernanceRequest by ID" rather than embedding the curl syntax. The curl command reveals the API endpoint structure which violates the abstraction principle.

**Status of other checks in this file:**
- **HARDCODED_GOVERNANCE:** The timeout action decision table (lines 85–93) is the same hardcoded policy table as in `approval-escalation.md` (Finding 1.1) — same MEDIUM severity finding applies but is not double-counted here as it's a deliberate copy.
- **HARDCODED_AMP:** None. All messaging via `agent-messaging` skill. ✓ VERIFIED
- **LOCAL_REGISTRY:** The audit log reference `docs_dev/audit/amcos-approvals-[DATE].yaml` is a legitimate plugin-local audit trail. ✓ VERIFIED (acceptable per Section 4 analysis)
- **APPROVAL_SYSTEM:** This is a procedure file for handling one workflow step. ✓ VERIFIED

---

### FILE 8: `skills/amcos-permission-management/references/op-request-approval.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/op-request-approval.md`

#### Finding 8.1

- **Violation type:** HARDCODED_API (Step 5 curl command)
- **Severity:** HIGH
- **Lines:** 100–111 (Step 5: Register Pending Approval)
- **What it currently does:** Step 5 registers the approval request via a direct curl POST to the GovernanceRequest API:
  ```bash
  curl -s -X POST "$AIMAESTRO_API/api/v1/governance/requests" \
    -H "Content-Type: application/json" \
    -d "{
      \"request_id\": \"$REQUEST_ID\",
      \"operation\": \"$OPERATION_TYPE\",
      ...
    }"
  ```
- **What it should do instead:** This step should delegate to the `team-governance` skill: "Register the approval with AI Maestro's GovernanceRequest system by following the 'Submit a GovernanceRequest' section of the `team-governance` skill." The curl syntax itself must not appear in a plugin file — it belongs only in global skills/scripts.

#### Finding 8.2

- **Violation type:** HARDCODED_AMP (Step 3 message body construction)
- **Severity:** MEDIUM
- **Lines:** 68–91 (Step 3: Compose Approval Request)
- **What it currently does:** Constructs a raw JSON AMP message body in bash:
  ```bash
  REQUEST_BODY=$(cat <<EOF
  {
    "to": "eama-main",
    "subject": "[APPROVAL REQUIRED] $OPERATION_TYPE: $TARGET",
    "priority": "high",
    "content": {
      "type": "approval-request",
      ...
    }
  }
  EOF
  )
  ```
  This directly embeds the AMP message envelope structure (the `"to"`, `"subject"`, `"priority"`, `"content"` fields) rather than delegating to the `agent-messaging` skill.
- **What it should do instead:** Step 3 should specify the message content fields as parameters, and Step 4 should say "Use the `agent-messaging` skill to send to EAMA." The AMP envelope construction belongs in the skill, not in the plugin. The current Step 4 ("Use the `agent-messaging` skill to send") is correct but Step 3 undermines it by pre-constructing the full envelope.

**Status of other checks in this file:**
- **HARDCODED_GOVERNANCE:** The operation type table (lines 50–57) is definitional for AMCOS domain — this is acceptable as it defines AMCOS operation types, not AI Maestro governance rules.
- **LOCAL_REGISTRY:** None. ✓ VERIFIED
- **APPROVAL_SYSTEM:** This is the procedure for the first step of the approval workflow. ✓ VERIFIED

---

### FILE 9: `skills/amcos-permission-management/references/op-track-pending-approvals.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/op-track-pending-approvals.md`

#### Finding 9.1

- **Violation type:** HARDCODED_API (multiple direct curl calls)
- **Severity:** HIGH
- **Lines:** 51–53 (Step 1), 62–76 (Step 2), 81–91 (Step 3), 95–113 (Step 4), 119–129 (Step 5), 138–150 (Step 6), 155–167 (Step 7), 172–187 (Example)
- **What it currently does:** EVERY step in this procedure file uses direct curl calls to the governance API:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" "$AIMAESTRO_API/api/v1/governance/requests?status=pending"
  curl -s -X POST "$AIMAESTRO_API/api/v1/governance/requests" ...
  curl -s "$AIMAESTRO_API/api/v1/governance/requests?status=pending" ...
  curl -s -X PATCH "$AIMAESTRO_API/api/v1/governance/requests/$REQUEST_ID" ...
  ```
  The file has comments saying "Uses AI Maestro REST API (not file-based)" which shows the author was aware this was correct vs local file, but the API endpoint syntax is still embedded directly in the plugin.
- **What it should do instead:** ALL of these API interactions should be delegated to the `team-governance` skill (for agent contexts) or an `aimaestro-governance.sh` global script (for script/hook contexts). The procedure steps should read: "Use the `team-governance` skill to list pending requests", "Use the `team-governance` skill to register a GovernanceRequest", etc. This is the most pervasive HARDCODED_API violation in the entire permission-management skill.

#### Finding 9.2

- **Violation type:** HARDCODED_API (query parameters not in any global skill)
- **Severity:** HIGH
- **Lines:** 119–129 (Step 5)
- **What it currently does:** Uses query parameters for the governance API that are NOT documented in the `team-governance` skill:
  ```bash
  curl -s "$AIMAESTRO_API/api/v1/governance/requests?status=pending&reminder_sent=false&min_age_seconds=60"
  ```
  The `reminder_sent` and `min_age_seconds` query parameters do not appear in the team-governance SKILL.md. This may indicate:
  a) These parameters exist but are undocumented in the global skill (gap in the skill)
  b) These parameters do not exist and this is speculative API usage
- **What it should do instead:** If these parameters exist on the AI Maestro API, they need to be added to the `team-governance` global skill. If they do not exist, this query pattern needs to be replaced with client-side filtering: fetch all pending requests and filter locally. Either way, the curl command should not appear in the plugin.

#### Finding 9.3

- **Violation type:** HARDCODED_AMP (direct `check_messages_for_request_id` function call)
- **Severity:** MEDIUM
- **Lines:** 102–103 (Step 4)
- **What it currently does:** References an undefined function `check_messages_for_request_id "$REQUEST_ID" "approval-response"` without explaining that this should be done via the `agent-messaging` skill.
- **What it should do instead:** Replace with explicit instruction: "Use the `agent-messaging` skill to check your inbox for unread messages, then filter for messages whose content type is `approval-response` and whose `request_id` matches the expected ID."

---

### FILE 10: `skills/amcos-permission-management/references/rule-14-enforcement.md`

**Plugin-relative path:** `skills/amcos-permission-management/references/rule-14-enforcement.md`

No violations found. This file defines a meta-rule about requirement immutability. It contains no API calls, no governance hardcoding, no AMP structures, and no registry reads. It is pure process documentation.

---

### FILE 11: `skills/amcos-transfer-management/references/op-approve-transfer-request.md`

**Plugin-relative path:** `skills/amcos-transfer-management/references/op-approve-transfer-request.md`

#### Finding 11.1

- **Violation type:** HARDCODED_API
- **Severity:** CRITICAL
- **Lines:** 23 (Step 3: Submit approval)
- **What it currently does:** Embeds a hardcoded API endpoint for approving transfers:
  ```
  Call `POST /api/governance/transfers/{id}/approve` with payload
  ```
  This is a direct API call embedded in the plugin procedure without delegation to the `team-governance` skill.
- **What it should do instead:** Replace with: "Follow the 'Approve or Reject a Transfer' section in the `team-governance` skill. The skill provides the correct endpoint and authentication headers." The `team-governance` skill already documents this endpoint at lines 381–397 — the plugin should reference the skill, not replicate the endpoint.

#### Finding 11.2

- **Violation type:** HARDCODED_GOVERNANCE (approval matrix embedded)
- **Severity:** HIGH
- **Lines:** 13–19 (Approval Matrix table)
- **What it currently does:** Hardcodes the full transfer approval matrix:
  ```
  | Source COS    | Source side | pending              |
  | Source Manager| Source side | pending              |
  | Target COS    | Target side | pending or source-approved |
  | Target Manager| Target side | pending or source-approved |
  ```
  Also hardcodes the full state transition table (lines 37–44).
- **What it should do instead:** Per the Plugin Abstraction Principle, role restrictions and permission matrices should be discovered at runtime from the `team-governance` skill, not hardcoded. The file should say: "Before approving, verify your role using the `team-governance` skill's 'Transfer Protocol' section to understand which roles can approve for each side." The state transition table is acceptable as documentation but should note it reflects current AI Maestro behavior that can be discovered at runtime.
- **Additional note:** The endpoint referenced (`/api/governance/transfers/{id}/approve`) differs from what the `team-governance` skill documents (`/api/governance/transfers/{id}/resolve` with `action: "approve"`). This is a critical inconsistency that could cause runtime failures. The plugin must use the endpoint documented in the global skill.

---

### FILE 12: `skills/amcos-transfer-management/references/op-create-transfer-request.md`

**Plugin-relative path:** `skills/amcos-transfer-management/references/op-create-transfer-request.md`

#### Finding 12.1

- **Violation type:** HARDCODED_API
- **Severity:** CRITICAL
- **Lines:** 16 (Step 3: Submit request)
- **What it currently does:** Embeds a hardcoded API endpoint for creating transfers:
  ```
  Call `POST /api/governance/transfers/` with payload
  ```
  Same issue as `op-approve-transfer-request.md` — direct API call in plugin procedure.
- **What it should do instead:** Replace with: "Follow the 'Request a Transfer' section in the `team-governance` skill, which provides the correct endpoint, authentication headers, and request payload format."

#### Finding 12.2

- **Violation type:** HARDCODED_GOVERNANCE (prerequisites embed role rules)
- **Severity:** HIGH
- **Lines:** 8–12 (Prerequisites section)
- **What it currently does:** Hardcodes prerequisites that embed governance rules:
  ```
  - Requester must have permission to initiate transfers
  ```
  And Step 4 ("Notify approvers — Source COS, source manager, target COS, target manager") hardcodes which roles must be notified without reference to the governance skill.
- **What it should do instead:** The prerequisites should reference the `team-governance` skill for role discovery: "Verify your role using the `team-governance` skill. Only MANAGER or COS agents can initiate transfers." The notification step should reference the skill's broadcast pattern rather than hardcoding the approver roles.

---

## SECTION 2: CROSS-CUTTING VIOLATIONS

### 2.1 EAMA Recipient Name Inconsistency (CRITICAL BUG)

Multiple files use different names for the EAMA recipient:
- `approval-escalation.md`: `eama-assistant-manager`
- `approval-request-procedure.md`: `eama-assistant-manager`
- `approval-tracking.md`: (no direct send, defers to procedure)
- `approval-workflow-engine.md`: `eama-main`
- `examples.md`: `eama-assistant-manager`
- `op-handle-approval-timeout.md`: `eama-assistant-manager`
- `op-request-approval.md`: `eama-main`

**Impact:** AMCOS approval requests sent to `eama-main` will not be received by an EAMA agent named `eama-assistant-manager`, and vice versa. This is a functional bug that will cause the entire approval workflow to break depending on which file is followed.

**Resolution:** Pick one canonical name, store it as a configurable constant in the AMCOS plugin's config (e.g., `EAMA_SESSION_NAME` environment variable or config entry), and reference it throughout. Do not hardcode the EAMA name in any reference file — it should be discoverable from the agent registry or configurable at deployment time.

### 2.2 Approval Type Code Inconsistency

The `approval-workflow-engine.md` defines type codes as `agent_spawn`, `agent_terminate`, `agent_replace`, `plugin_install`, `critical_operation`, but `approval-types-detailed.md` and `op-request-approval.md` use `spawn`, `terminate`, `hibernate`, `wake`, `plugin_install`. These are different schemas that cannot both be correct.

**Impact:** A request created using one schema cannot be processed by components expecting the other schema.

**Resolution:** Unify on one set of type codes and update all files consistently. Given that AI Maestro's GovernanceRequest API uses `create-agent`, `transfer-agent` etc. for its own types, AMCOS's internal types should be clearly namespaced (e.g., `amcos.spawn`, `amcos.terminate`) to avoid confusion with GovernanceRequest types.

### 2.3 Timeout Policy Inconsistency

`approval-escalation.md` says `spawn` → PROCEED on timeout, but `approval-workflow-engine.md` says `agent_spawn` → Auto-reject. These are contradictory policies.

**Resolution:** Unify in one canonical policy document and reference it from all other files.

---

## SECTION 3: FILES WITH NO VIOLATIONS

The following files are fully compliant with the Plugin Abstraction Principle and contain no violations:

1. **`approval-types-detailed.md`** — Purely definitional. No API calls, no hardcoded endpoints.
2. **`examples.md`** — All 4 examples correctly use the `agent-messaging` skill. Clean.
3. **`rule-14-enforcement.md`** — Process governance rule. No violations.

---

## SECTION 4: APPROVAL SYSTEM DEEP ANALYSIS

### 4.1 What AMCOS Tracks Internally

The AMCOS plugin's internal approval tracking system captures the following state, which is RICHER than what AI Maestro's GovernanceRequest API stores:

| Field | AMCOS Tracks | AI Maestro GovernanceRequest | Disposition |
|-------|-------------|------------------------------|-------------|
| `request_id` | Yes | Yes | Mirror both |
| `operation` | Yes (spawn/terminate/etc.) | Yes (create-agent/transfer-agent) | Different schemas, both valid |
| `target` | Yes | Via payload | Mirror |
| `submitted_at`/`requested_at` | Yes | Yes | Mirror |
| `status` | pending/escalated/resolved | pending/approved/rejected/executed | Different state machines, see 4.3 |
| `escalation_count` | Yes (0–3) | No | AMCOS-only, keep local |
| `last_reminder_at` | Yes | Yes (as `reminder_sent`) | Partial mirror |
| `timeout_at` | Yes | No | AMCOS-only, keep local |
| `decided_by` | eama/autonomous/timeout | Via approverAgentId | Different provenance, map |
| `modifications` | Yes | No | AMCOS-only, keep local |
| `rollback_plan` | Yes (workflow engine) | No | AMCOS-only, keep local |
| `escalation events` | Audit YAML | No | AMCOS-only audit trail |
| `autonomous_directives` | Yes (local JSON) | No | AMCOS-only config |

### 4.2 How AMCOS Records Approvals

AMCOS uses a multi-layered approach:

1. **Active request state** — `docs_dev/state/amcos-approval-tracking.yaml` (in-memory + file)
2. **Audit trail** — `docs_dev/audit/amcos-escalations-{date}.yaml` and `$CLAUDE_PROJECT_DIR/thoughts/shared/approval-audit.log` (append-only event log)
3. **Autonomous mode config** — `$CLAUDE_PROJECT_DIR/thoughts/shared/autonomous-mode.json` (rate limiting + permissions)
4. **AI Maestro GovernanceRequest API** — `$AIMAESTRO_API/api/v1/governance/requests` (canonical cross-system state, partially used)

### 4.3 Harmonization Architecture (PRESERVE + EXTEND, NOT REPLACE)

The AMCOS internal approval system is NOT redundant with AI Maestro's GovernanceRequest system. They serve different purposes:

| System | Purpose | Scope |
|--------|---------|-------|
| AMCOS local tracking | Fine-grained lifecycle tracking with escalation state, timing, rollback plans | AMCOS-internal only |
| AI Maestro GovernanceRequest | Cross-system formal approval record visible to all AI Maestro components | Global visibility |

**Recommended harmonization flow:**

```
AMCOS Request Created
    │
    ├─► CREATE local YAML entry (pending) — for escalation tracking
    │
    └─► POST /api/v1/governance/requests  — for AI Maestro visibility
         (via team-governance skill, not direct curl)
              │
              ▼
    AMCOS tracks escalation locally
    (reminds, updates escalation_count, last_reminder_at)
              │
    Decision received / timeout
              │
    ├─► UPDATE local YAML (resolved + decision)
    │
    └─► PATCH /api/v1/governance/requests/{id} (status update)
         (via team-governance skill)
              │
              ▼
    AMCOS audit log gets final entry
    AI Maestro governance history shows final status
```

**Key principle:** The plugin's local tracking is the AMCOS authority on timing and escalation state. AI Maestro's GovernanceRequest is the CROSS-SYSTEM authority on approval outcomes. Both must be updated in parallel. Neither replaces the other.

### 4.4 What Needs to Change (Harmonization TODOs)

1. **Replace all direct curl calls** to GovernanceRequest API with delegation to the `team-governance` skill (for agent contexts) or a new global script `aimaestro-governance.sh` (for automation contexts).
2. **The team-governance skill needs additions** to cover PATCH/update operations on GovernanceRequests — these are currently missing from the global skill.
3. **The autonomous-mode.json file** should be stored in a more robust location (not `thoughts/shared/`) and the path should be a configurable constant, not hardcoded.
4. **The audit log** at `approval-audit.log` is an appropriate plugin-local artifact and should be PRESERVED as-is.
5. **The escalation count** and reminder state in AMCOS's local YAML is AMCOS-specific and should NOT be pushed to AI Maestro. Keep it local.

---

## SECTION 5: TRANSFER MANAGEMENT ANALYSIS

### 5.1 Current State of Transfer Files

The two transfer management reference files (`op-approve-transfer-request.md` and `op-create-transfer-request.md`) are THIN procedure files (43 and 43 lines respectively) that essentially describe calling the AI Maestro transfer API directly.

Unlike the permission management files, these files do NOT have their own local tracking system. They directly wrap AI Maestro API calls without any local state layer.

### 5.2 Critical Endpoint Inconsistency

The `op-approve-transfer-request.md` file references `POST /api/governance/transfers/{id}/approve` but the `team-governance` SKILL.md documents `POST /api/governance/transfers/{id}/resolve` with `action: "approve"` in the body.

This is a FUNCTIONAL BUG that will cause HTTP 404 errors at runtime if the plugin uses the endpoint from `op-approve-transfer-request.md`.

### 5.3 REDUNDANT_OPERATIONS Analysis for Transfers

The transfer management files do NOT create a redundant transfer system parallel to AI Maestro's. They correctly delegate to AI Maestro's `/api/governance/transfers` endpoints. The only violations are:
1. Direct curl call syntax embedded in the plugin (should reference the global skill)
2. Hardcoded role/state matrices (should reference the global skill at runtime)

There is NO case where these files try to implement transfer tracking independently of AI Maestro. The transfer state machine is entirely owned by AI Maestro.

---

## SECTION 6: COMPLETE VIOLATION INVENTORY

### By Severity

#### CRITICAL (2 violations)

| ID | File | Lines | Type | Description |
|----|------|-------|------|-------------|
| C1 | `op-approve-transfer-request.md` | 23 | HARDCODED_API | Embeds `POST /api/governance/transfers/{id}/approve` (wrong endpoint — should be `/resolve`) |
| C2 | `op-create-transfer-request.md` | 16 | HARDCODED_API | Embeds `POST /api/governance/transfers/` directly |

#### HIGH (7 violations)

| ID | File | Lines | Type | Description |
|----|------|-------|------|-------------|
| H1 | `approval-tracking.md` | 263–375 | LOCAL_REGISTRY | Plugin-local YAML state diverges from AI Maestro GovernanceRequest — needs harmonization |
| H2 | `approval-workflow-engine.md` | 140–160, 641–724 | LOCAL_REGISTRY | Autonomous mode config in `thoughts/shared/autonomous-mode.json` with fragile jq writes |
| H3 | `approval-workflow-engine.md` | 242–279, 362–373, 480–505 | HARDCODED_API | Multiple direct curl calls to `$AIMAESTRO_API/api/v1/governance/requests` |
| H4 | `op-request-approval.md` | 100–111 | HARDCODED_API | Step 5 embeds direct POST to GovernanceRequest API |
| H5 | `op-track-pending-approvals.md` | All steps | HARDCODED_API | Every procedure step uses direct curl to governance API |
| H6 | `op-track-pending-approvals.md` | 119–129 | HARDCODED_API | Uses query params (`reminder_sent`, `min_age_seconds`) not in team-governance skill |
| H7 | `op-approve-transfer-request.md` | 13–19 | HARDCODED_GOVERNANCE | Transfer approval matrix and state transitions hardcoded |

#### MEDIUM (5 violations)

| ID | File | Lines | Type | Description |
|----|------|-------|------|-------------|
| M1 | `approval-escalation.md` | 88–96 | HARDCODED_GOVERNANCE | Timeout proceed/abort policy table hardcoded without runtime override path |
| M2 | `approval-tracking.md` | 95–122 | HARDCODED_GOVERNANCE | 120-second timeout hardcoded in Python without governance override |
| M3 | `approval-workflow-engine.md` | 181–204 | HARDCODED_GOVERNANCE | Approval type taxonomy with timeout policies — internally inconsistent with `approval-escalation.md` |
| M4 | `op-handle-approval-timeout.md` | 52–55 | HARDCODED_API | Single curl call to query governance request status |
| M5 | `op-request-approval.md` | 68–91 | HARDCODED_AMP | Constructs full AMP message envelope in bash before sending via skill |

#### LOW (2 violations)

| ID | File | Lines | Type | Description |
|----|------|-------|------|-------------|
| L1 | `approval-request-procedure.md` | 43–110 | HARDCODED_GOVERNANCE | Operational thresholds (30-min idle) not configurable |
| L2 | `approval-workflow-engine.md` | 284–297 | HARDCODED_AMP | Content type strings (`"approval_request"`) and EAMA name hardcoded; conflicts with other files |

#### Additional Cross-Cutting Issues (not individual file violations)

| ID | Type | Description | Severity |
|----|------|-------------|----------|
| X1 | Internal inconsistency | EAMA recipient name: `eama-main` vs `eama-assistant-manager` across 7 files | CRITICAL (functional bug) |
| X2 | Internal inconsistency | Approval type codes: `spawn` vs `agent_spawn` between files | HIGH |
| X3 | Internal inconsistency | Timeout policy: spawn=PROCEED (escalation.md) vs spawn=Auto-reject (workflow-engine.md) | HIGH |

---

## SECTION 7: PRIORITY REMEDIATION PLAN

### Immediate (fix before next release)

1. **Fix X1 (EAMA name):** Decide on canonical EAMA session name, add `EAMA_SESSION_NAME` config constant, update all files.
2. **Fix C1 (wrong endpoint):** `op-approve-transfer-request.md` → change to reference the `team-governance` skill's `/resolve` endpoint pattern.
3. **Fix X3 (timeout policy):** Unify spawn timeout policy between `approval-escalation.md` and `approval-workflow-engine.md`.

### Short-term (sprint)

4. **Fix C2, H4, H5, H6, M4 (direct curl calls):** Replace all direct curl commands in procedure files with references to the `team-governance` skill. This requires the global skill to be updated with PATCH/update operations on GovernanceRequests first.
5. **Fix X2 (type code schema):** Unify approval type codes across all 12 files.
6. **Fix H7, H6-approval-matrix (hardcoded governance):** Transfer approval matrix references should defer to the `team-governance` skill at runtime.

### Medium-term (backlog)

7. **Implement H1 harmonization:** Add `team-governance` skill calls to AMCOS's approval tracking to mirror canonical state to AI Maestro's GovernanceRequest API.
8. **Fix H2 (autonomous mode storage):** Move autonomous mode config to a more robust, configurable storage location.
9. **Fix M5 (AMP envelope construction):** Clean up `op-request-approval.md` Step 3 to not construct the AMP envelope manually.
10. **Add PATCH operations to team-governance skill:** The global skill currently documents POST and GET for GovernanceRequests but not PATCH. This is a gap that blocks proper delegation from AMCOS.

---

*End of audit. Total: 16 file-level violations (2 CRITICAL, 7 HIGH, 5 MEDIUM, 2 LOW) + 3 cross-cutting inconsistencies.*
