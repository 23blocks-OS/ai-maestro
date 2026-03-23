# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:02.241Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-assistant-manager-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-assistant-manager-2026-02-27.md
Line 35:   "name": "ai-maestro-assistant-manager-agent",
Line 50: The `ai-maestro-assistant-manager-agent` (AMAMA) is a Claude Code plugin implementing the **manager** governance role in the AI Maestro multi-agent ecosystem.
Line 192: Or during development:
Line 194: claude --plugin-dir /path/to/ai-maestro-assistant-manager-agent
Line 195: There is NO `claude --agent ai-maestro-assistant-manager` shorthand documented.
Line 254: IMPORTANT: This plugin (`ai-maestro-assistant-manager-agent`) is an **independent** plugin, NOT related to the `emasoft-assistant-manager-agent` plugin in the emasoft-plugins marketplace.
Line 261: This plugin ships with AI Maestro. It is installed automatically when AI Maestro provisions an Assistant Manager agent.
Line 274: This skill is NOT bundled in the plugin — it must be globally installed by AI Maestro.
Line 289: - ai-maestro-agents-management  # External global skill
Line 300: - Full governance model (3 roles, authority matrix)
Line 301: - COS assignment procedure via API
Line 302: - Cross-host GovernanceRequest handling
Line 303: - Governance password management
Line 304: - Team type handling (open/closed)
Line 305: - AMP messaging patterns with full session name format
Line 306: - Required message types and priority levels
Line 310: - POST /api/teams for team creation
Line 311: - PATCH /api/teams/[id]/chief-of-staff for COS assignment
Line 312: - POST /api/v1/governance/requests/[id]/approve with governance password
Line 313: - ~/.aimaestro/governance-peers/ for cross-host peer state
Line 339: - AMAMA assigns COS role to agent via PATCH /api/teams/{id}/chief-of-staff
Line 340: - AMAMA sends `work_request` messages to AMCOS (via AMP)
Line 341: - AMCOS sends `approval_request` messages to AMAMA (via AMP)
Line 342: - AMAMA responds with `approval_decision` (approve/deny/defer)
Line 343: - AMCOS sends `status_report` and `operation_complete` to AMAMA
Line 344: - AMAMA sends `autonomy_grant` / `autonomy_revoke` to AMCOS
Line 345: - Health check via `ping` / `pong` (AMAMA pings AMCOS every 10 minutes during active sessions)
Line 353: - Approval decisions: 30 seconds
Line 354: - Work requests: 60 seconds
Line 355: - Health pings: 30 seconds
Line 356: - Status queries: 30 seconds
Line 358: AMAMA does NOT directly communicate with specialist agents (AMAA, AMOA, AMIA). All goes through AMCOS.
Line 365: Indirect only — routed via AMCOS. AMAMA identifies "design/plan/architect" user intents and sends `work_request` to AMCOS specifying "architect specialization" target. AMAMA does not communicate directly with AMAA agents.
Line 369: Same pattern as AMAA — indirect via AMCOS only.
Line 372: AMAMA uses `gh` CLI for GitHub issue/PR operations via the `amama-github-routing` and `amama-label-taxonomy` skills.
Line 380: C3 | **External skill dependency (`ai-maestro-agents-management`) not bundled**: COS assignment and agent lifecycle management will fail if AI Maestro is not installed globally. No fallback or graceful degradation documented. | COS management non-functional without AI Maestro | `agents/amama-assistant-manager-main-agent.md:14` |
Line 387: H2 | **No marketplace registration for v2**: The new plugin is not in any marketplace, making it impossible to install via `claude plugin install`. It can only be loaded via `--plugin-dir` or automatic AI Maestro provisioning. | Cannot be installed by users | Missing in emasoft-plugins marketplace |
Line 400: RC-1 | CRITICAL | Add commands + hooks to plugin.json | plugin.json | ALL |
Line 401: RC-2 | HIGH | Fix COS assignment endpoint | docs/*.md | Flow 2 |
Line 402: RC-3 | HIGH | Implement Stop hook inbox check | amama_stop_check.py | ALL |
Line 403: RC-4 | HIGH | Fix session start memory path | amama_session_start.py | ALL |
Line 404: RC-5 | MEDIUM | Add auth headers to scripts | scripts/*.py | Flows 1,3,9 |
Line 405: RC-6 | MEDIUM | Modernize approve-plan command | amama-approve-plan.md | Flows 6,9 |
Line 406: RC-7 | MEDIUM | Fix status reporting endpoints | amama-status-reporting/SKILL.md | Monitoring |
Line 407: RC-8 | LOW | Add .agent.toml awareness | agent persona .md | Flows 6,9 |
Line 408: RC-9 | LOW | Remove v1 legacy references | amama-approve-plan.md | Housekeeping |
Line 409: RC-10 | LOW | Update authority matrix docs | ROLE_BOUNDARIES.md | All |
Line 415:   "name": "ai-maestro-assistant-manager-agent",
Line 436: Required change: Replace ALL instances of `POST /api/teams/{id}/cos` with `POST /api/teams/{id}/chief-of-staff`. The actual AI Maestro server endpoint is `POST /api/teams/[id]/chief-of-staff` with body `{ agentId, password }`.
Line 467: 1. Determine the agent's UUID from the AI Maestro registry: `GET $AIMAESTRO_API/api/agents?name=$SESSION_NAME`
Line 478: Files: All scripts that call the AI Maestro API
Line 480: - Authorization: Bearer <amp-api-key> (from AMP registration)
Line 481: - X-Agent-Id: <manager-agent-uuid> (from agent registry)
Line 484: Current state: The agent persona instructs the LLM to use these headers, but the Python hook scripts (which run outside the LLM context) do NOT include them. Scripts that call `/api/teams`, `/api/governance/*`, or `/api/agents` must authenticate.
Line 486: Why: The new team creation restriction (G1) requires `X-Agent-Id` to identify the caller as MANAGER. Without this header, the server treats the request as a web UI call (which is allowed, but the audit trail is incomplete — no requestingAgentId is logged).
Line 496: - The command should list pending GovernanceRequests: `GET /api/v1/governance/requests?status=pending`
Line 498: - Allow the user to approve or reject: `PUT /api/v1/governance/requests/{id}` with `{ action: "approve", password: "<governance-password>" }`
Line 510: - GET /api/agents/health — does NOT exist (no `/api/agents/health` route)
Line 511: - GET /api/v1/health — does NOT exist as documented (AI Maestro has `/api/sessions` as health check, not `/api/v1/health`)
Line 513: Fix: Replace `/api/agents/health` with per-agent health checks via the session list: `GET /api/sessions` returns all active sessions. An agent is "healthy" if it appears in the session list with `status: 'online'`.
Line 515: Replace `/api/v1/health` with `/api/sessions` (the documented health check for AI Maestro).
Line 524: 1. When creating agents, AMAMA can instruct COS to use `/pss-setup-agent` for optimal configuration
Line 527: 3. AMAMA should include `.agent.toml` recommendations in `work_request` messages to COS when specifying design requirements
Line 528: 4. Example: