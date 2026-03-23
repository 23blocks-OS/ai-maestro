# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:47.997Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-AMCOS-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-AMCOS-2026-02-27.md
Line 1: # Decoupling Changes — AMCOS (ai-maestro-chief-of-staff) v1.3.5
Line 3: > Plugin skills should reference AI Maestro's global skills by name (not embed API syntax).
Line 12: - Team registry access via local files or bespoke scripts instead of the API
Line 16: - `ai-maestro-agents-management` — Agent lifecycle via `aimaestro-agent.sh` CLI
Line 19: - `agent-messaging` — Inter-agent messaging via `amp-*` scripts
Line 22: ### 1. `skills/amcos-transfer-management/SKILL.md`
Line 24: **Violation count: 21 violations (highest in the entire plugin)**
Line 28: This file is the most severely non-compliant file in the plugin. The procedures section (lines 53–130) and the examples section (lines 186–270) both embed raw shell commands directly in the skill body. Violations span three types:
Line 30: - **API_SYNTAX (12 instances):** Raw `curl -X POST "$AIMAESTRO_API/api/governance/transfers/"`, `curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/approve"`, `curl -X POST "$AIMAESTRO_API/api/governance/transfers/{id}/execute"`, `curl -s "$AIMAESTRO_API/api/governance/transfers/{id}"`, and `curl -s "$AIMAESTRO_API/api/messages?agent=..."` embedded across procedure steps and all three examples.
Line 32: - **HARDCODED_AMP (7 instances):** `amp-send.sh "<session>" "subject" "priority" '{"type": "transfer-approval-request", ...}'` calls embedded in procedure steps (lines 77–79, 81–84) and repeated across examples (lines 210, 214, 222, 249, 269).
Line 42: | Step 4 | `curl -X POST "$AIMAESTRO_API/api/governance/transfers/"` with JSON body | "Use the `team-governance` skill to create a TransferRequest, providing the agent ID, source team ID, target team ID, and justification reason." |
Line 43: | Step 6 | `curl -X POST ".../approve"` with source-cos approval body | "Use the `team-governance` skill to submit your source-COS approval on the TransferRequest." |
Line 44: | Step 7 | `amp-send.sh "<source-manager-session>" "Transfer approval needed" ...` | "Use the `agent-messaging` skill to send a high-priority transfer approval request message to your supervising manager." |
Line 45: | Step 8 | `amp-send.sh "<target-cos-session>" "Incoming transfer request" ...` | "Use the `agent-messaging` skill to notify the target COS of the incoming TransferRequest." |
Line 46: | Step 10 | `curl -X POST ".../execute"` | "Once all four approvals are collected, use the `team-governance` skill to execute the transfer." |
Line 50: | Step 2 | `curl -s "$AIMAESTRO_API/api/governance/transfers/{id}"` | "Use the `team-governance` skill to retrieve the full TransferRequest details." |
Line 51: | Step 4 | `curl -X POST ".../approve"` with target-cos body | "Use the `team-governance` skill to submit your target-COS approval on the TransferRequest." |
Line 55: | Rejection step | `curl -X POST ".../approve"` with `"decision": "reject"` | "Use the `team-governance` skill to reject the TransferRequest, providing your role and rejection reason." |
Line 60: - Example 1 (Outbound Transfer): Replace all curl and amp-send.sh blocks with a step-by-step prose walkthrough referencing `team-governance` and `agent-messaging` skills at each step.
Line 65: If raw API examples are required for developer reference, move them to a separate `references/amcos-transfer-api-examples.md` file that is explicitly marked as a developer reference document, not part of the SKILL.md that agents execute.
Line 68: ### 2. `skills/amcos-team-coordination/SKILL.md`
Line 73:   ```bash
Line 74:   curl -s "http://localhost:23000/api/sessions" | jq '.sessions[] | select(.project == "auth-service")'
Line 77: Remove the curl command block from Example 6. Replace with prose:
Line 79: > "Use the `ai-maestro-agents-management` skill to list active agents filtered by project. For example: 'List all agents currently assigned to the auth-service project.'"
Line 83: ### 3. `skills/amcos-permission-management/SKILL.md`
Line 88:   ```
Line 89:   4. POST /api/v1/governance/requests with payload
Line 91:   2. GET /api/v1/governance/requests/{requestId} to poll state
Line 94: - **HARDCODED_GOVERNANCE (lines 52–61 — CRITICAL):** A table titled "When Approval Is Required" hardcodes the full governance approval matrix:
Line 107: - **MISSING_SKILL_REF (lines 212–214 — MODERATE):** Example 1 shows:
Line 110:   operation: spawn, scope: local, agent: worker-impl-03
Line 115: - Step 4: `POST /api/v1/governance/requests with payload` → "Use the `team-governance` skill to submit a GovernanceRequest with the operation, scope, and target agent details."
Line 116: - Step 2 (polling): `GET /api/v1/governance/requests/{requestId} to poll state` → "Use the `team-governance` skill to check the status of the GovernanceRequest until it reaches `local-approved` or `dual-approved`."
Line 121: > "Consult the `team-governance` skill for the current approval matrix. The governance configuration is managed by AI Maestro and may vary by installation. Do not rely on a hardcoded table — query the live configuration."
Line 125: Replace `PROCEDURE 1 → POST /api/v1/governance/requests` with:
Line 127: > "Use the `team-governance` skill to submit a GovernanceRequest: operation=spawn, scope=local, target=worker-impl-03."
Line 130: ### 4. `skills/amcos-agent-lifecycle/SKILL.md`
Line 135: - **API_SYNTAX (lines 461–468 — MODERATE):** A section titled "AI Maestro REST API → Endpoints table" embeds a full REST endpoint reference:
Line 144: - **LOCAL_REGISTRY (lines 287–291 — MODERATE):** The skill body instructs:
Line 146:   uv run python scripts/amcos_team_registry.py <command> [args]
Line 148: - **HARDCODED_GOVERNANCE (lines 299–303 — MODERATE):** A "Resource Limits" table hardcodes:
Line 156: - **API_SYNTAX (line 29 — MINOR):** Prerequisites section references "Team registry accessible via AI Maestro REST API (`/api/teams`)".
Line 160: Remove the "AI Maestro REST API → Endpoints" table entirely from the SKILL.md body. Replace with:
Line 162: > "For all agent lifecycle operations — register, hibernate, wake, terminate, list, health-check — use the `ai-maestro-agents-management` skill. Do not call API endpoints directly."
Line 164: If a developer reference table is needed, move it to `references/amcos-agent-lifecycle-api-ref.md` with a clear note that it is a reference document for contributors, not operational instructions.
Line 167: Remove the `uv run python scripts/am