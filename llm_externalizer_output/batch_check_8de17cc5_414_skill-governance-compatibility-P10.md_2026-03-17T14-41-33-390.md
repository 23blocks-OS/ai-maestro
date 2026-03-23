# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:33.390Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/skill-governance-compatibility-P10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown /Users/emanuelesabetta/ai-maestro/docs_dev/skill-governance-compatibility-P10.md
# Skill-Governance Compatibility Analysis (P10)

**Date:** 2026-02-22
**Plugin commits:** 6e9a764 -> a249c66
**Skill files analyzed:** 6
**Governance files analyzed:** 4 (types/governance.ts, lib/governance.ts, services/governance-service.ts, lib/message-filter.ts)
**Additional files checked:** services/amp-service.ts, lib/message-send.ts, services/agents-core-service.ts, services/teams-service.ts

---

## Executive Summary

The 6 updated plugin skills are **COMPATIBLE** with the team governance system. No bypass vectors were found. The skills operate as CLI wrappers that route through the AI Maestro API, which enforces governance at the server layer. There are **3 advisory observations** (no action required) and **0 blocking issues**.

---

## Check 1: Agent-Messaging Skill -- Message Filtering Bypass

**VERDICT: NO BYPASS**

The `agent-messaging` skill instructs agents to use `amp-send`, `amp-reply`, and other AMP CLI commands. These commands route through:

1. **Local send path** (`lib/message-send.ts`): Calls `checkMessageAllowed()` at line 176 before delivering any message. If the filter returns `allowed: false`, the function throws with the governance reason. This applies to both direct and forwarded messages (line 420).

2. **AMP route path** (`services/amp-service.ts`): The `/api/v1/route` endpoint calls `checkMessageAllowed()` at line 1104 for all incoming routed messages, including mesh-forwarded ones with Layer 2 role attestation.

3. **Closed-team isolation** (`lib/message-filter.ts`): The filter enforces:
   - R6.1: Normal closed-team members can only message within their team + their COS
   - R6.2: COS can reach MANAGER, other COS, own team members, open-world agents
   - R6.3: MANAGER can message anyone
   - R6.4: Open-world agents freely communicate with each other
   - R6.5: Open-world agents cannot reach normal closed-team members
   - Step 1b: Alias-based sends from closed-team members are denied (prevents UUID bypass)

The skill's AMP commands cannot bypass these server-side checks because they ultimately hit the API layer. The skill does not provide any direct file-system message injection path.

**Note:** The skill mentions sending messages with `--type`, `--priority`, `--context` flags. None of these parameters affect the governance filter -- the filter operates solely on sender/recipient identity and team membership.

---

## Check 2: Agent-Management Skill -- CRUD Governance Checks

**VERDICT: NO BYPASS (with advisory note)**

The `ai-maestro-agents-management` skill uses `aimaestro-agent.sh` commands that call the AI Maestro API. The API enforces governance:

- **Create agent** (`services/agents-core-service.ts:602-610`): When `requestingAgentId` is provided via header, only MANAGER or COS can create agents. Returns 403 otherwise.
- **Update agent** (`services/agents-core-service.ts:656-662`): When `requestingAgentId` is provided, only MANAGER, COS, or the agent itself can update. Returns 403 otherwise.
- **Delete agent** (`services/agents-core-service.ts:702-707`): When `requestingAgentId` is provided, only MANAGER can delete. Returns 403 otherwise.

### Advisory Note (A1): Phase 1 Opt-In Enforcement

The governance checks in `agents-core-service.ts` are **opt-in** (gated by `if (requestingAgentId)`). When no `X-Agent-Id` or `Authorization` header is provided, governance is skipped. This is documented as "Phase 1 behavior" (SF-058).

The `aimaestro-agent.sh` CLI script calls the API endpoints. Whether it passes the requesting agent's identity depends on the CLI implementation. If the CLI does not include an agent identity header, governance checks are bypassed. This is **by design** for Phase 1 (localhost-only, single-user), but should be tightened in Phase 2.

**Impact:** LOW -- This is a known Phase 1 design decision, not a skill defect. The skill document does not instruct agents to bypass headers.

---

## Check 3: Governance-Gated Operations Not Mentioned in Skills

**VERDICT: NO ISSUES**

Operations that should be governance-gated and their coverage:

| Operation | Governance Gate | Skill Reference | Status |
|-----------|----------------|-----------------|--------|
| Send message | `checkMessageAllowed()` in message-send.ts and amp-service.ts | agent-messaging | GATED |
| Create agent | MANAGER/COS check in agents-core-service.ts | agents-management | GATED (Phase 1 opt-in) |
| Update agent | MANAGER/COS/self check | agents-management | GATED (Phase 1 opt-in) |
| Delete agent | MANAGER-only check | agents-management | GATED (Phase 1 opt-in) |
| Set manager | Password-protected in governance-service.ts | (not in any skill) | GATED |
| Create/update team | Team ACL in teams-service.ts | (not in any skill) | GATED |
| Transfer agent | MANAGER/COS check in governance-service.ts | (not in any skill) | GATED |
| COS assignment | Team ACL in teams-service.ts | (not in any skill) | GATED |

The `docs-search`, `graph-query`, `memory-search`, and `planning` skills are **read-only** -- they search documentation, code graphs, conversation history, and manage planning files. None of these interact with agent CRUD, messaging, team management, or governance configuration. They are inherently safe.

---

## Check 4: Team Isolation / RBAC / Transfer Protocol Circumvention

**VERDICT: NO CIRCUMVENTION VECTORS FOUND**

### Team Isolation
- The message filter (`lib/message-filter.ts`) is the single enforcement point for team isolation.
- All message paths (local send, AMP route, mesh forward) go through `checkMessageAllowed()`.
- The skill's `amp-send` command has no alternative path that skips the filter.
- Alias-based sends from closed-team members are explicitly blocked (Step 1b, line 90-98).

### Role-Based Access Control
- MANAGER role: Set via `POST /api/governance/manager` with password verification and rate limiting. No skill provides a way to self-promote.
- COS role: Set via team API with ACL checks. No skill provides a way to self-assign COS.
- The agent-management skill's `session exec` command sends tmux keystrokes to an agent's session. This could theoretically be used to have another agent make API calls, but this is already possible without the skill (via `tmux send-keys`). It does not constitute a governance bypass since the API still enforces checks.

### Transfer Protocol
- Transfer creation requires MANAGER or COS role (`governance-service.ts:253`).
- Transfer resolution requires source-team COS or MANAGER (`governance-service.ts:349`).
- No skill provides transfer-related commands. Transfers are only accessible via the governance API.

---

## Check 5: AMP Commands and Governance-Enhanced Message Routing

**VERDICT: COMPATIBLE**

The AMP commands used by the `agent-messaging` skill interact correctly with governance-enhanced routing:

1. **`amp-send`** -> Calls `POST /api/v1/route` or internal send -> `checkMessageAllowed()` applied
2. **`amp-reply`** -> Same routing path as send -> `checkMessageAllowed()` applied
3. **`amp-inbox` / `amp-read`** -> Read-only, no governance gate needed (agents can read their own inbox)
4. **`amp-fetch`** -> Fetches from external providers, messages delivered locally via the same governance-gated path
5. **`amp-register`** -> Registers with external provider, does not affect local governance
6. **`amp-delete`** -> Deletes own messages, no governance implications

The skill's message types (`notification`, `request`, `response`, `task`, `status`, `alert`, `update`, `handoff`, `ack`, `system`) and priority levels (`urgent`, `high`, `normal`, `low`) are metadata fields that do not influence the governance filter