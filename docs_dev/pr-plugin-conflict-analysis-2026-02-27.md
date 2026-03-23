# PR Conflict Analysis: feature/team-governance vs 3 External Plugins

**Date:** 2026-02-27
**PR Branch:** feature/team-governance
**Plugins Analyzed:** AMAMA v1.1.3, AMCOS v1.3.5, PSS v1.9.5

---

## Executive Summary

> **Design principle:** Plugin skills should reference AI Maestro's global skills by name (not embed API syntax). Plugin hooks should call global scripts (not curl). See [docs/PLUGIN-ABSTRACTION-PRINCIPLE.md](../docs/PLUGIN-ABSTRACTION-PRINCIPLE.md).

The `feature/team-governance` PR introduces a complete governance system (22 new API endpoints, team ACL, agent authentication, transfer system, GovernanceRequest state machine). Cross-referencing with the 3 external plugins reveals **7 structural conflicts** and **12 required plugin changes** to achieve compatibility.

**Critical finding:** None of the 3 plugins currently call ANY of the new governance/teams/transfer APIs. They operate on a pre-governance model using:
- AMP messaging for ad-hoc approvals (not GovernanceRequest system)
- Local `.emasoft/team-registry.json` files (not `/api/teams`)
- No authentication headers (no `X-Agent-Id`, no `Authorization: Bearer`)
- Direct tmux session creation for agents (bypassing governance gates)

**Important note on abstraction model:** AI Maestro provides 3 installed skills that serve as the canonical abstraction layer for all agent operations: `team-governance` (team CRUD, COS assignment, governance requests, transfers), `ai-maestro-agents-management` (agent lifecycle via `aimaestro-agent.sh` CLI), and `agent-messaging` (inter-agent messaging via `amp-*` scripts + team discovery). Plugin updates should instruct agents to USE these installed skills rather than reimplementing raw API calls in plugin scripts. The governance skill already teaches the correct curl patterns with proper authentication headers.

---

## Conflict Matrix

| # | Conflict | Severity | AMAMA | AMCOS | PSS | PR Element |
|---|---------|----------|-------|-------|-----|------------|
| C1 | Parallel team registries | CRITICAL | YES | YES | — | `/api/teams` vs `.emasoft/team-registry.json` |
| C2 | No agent auth headers | HIGH | YES | YES | — | `lib/agent-auth.ts` (Authorization: Bearer) |
| C3 | Agent creation bypasses governance | HIGH | YES | YES | — | GovernanceRequest for `create-agent` |
| C4 | Approval system mismatch | HIGH | YES | YES | — | `/api/v1/governance/requests` vs AMP messages |
| C5 | COS assignment not integrated | MEDIUM | YES | — | — | `POST /api/teams/[id]/chief-of-staff` |
| C6 | Transfer system not integrated | MEDIUM | — | YES | — | `POST /api/governance/transfers` |
| C7 | No governance context awareness | LOW | — | — | YES | Governance APIs for skill context |

---

## Conflict Details

### C1: Parallel Team Registries (CRITICAL)

**What the PR introduces:**
- Team data stored in `~/.aimaestro/teams/` (per-team JSON files)
- Full CRUD via `/api/teams` endpoints
- Team types: `open` (anyone joins) and `closed` (ACL-restricted)
- Team membership tracked via `agentIds[]` array
- COS tracked via `chiefOfStaffId` field
- Team ACL enforcement in `lib/team-acl.ts`

**What the plugins use instead:**
- Both AMAMA and AMCOS maintain `.emasoft/team-registry.json` in the project working directory
- AMCOS writes team composition, agent assignments, roles directly to this local file
- AMCOS label-taxonomy skill syncs `.emasoft/team-registry.json` with GitHub labels
- AMCOS agent-lifecycle skill updates `.emasoft/team-registry.json` on spawn/terminate

**Why it conflicts:**
- Two team registries exist simultaneously with different data models
- Changes in AI Maestro teams (via dashboard) don't reflect in `.emasoft/team-registry.json`
- Changes in `.emasoft/team-registry.json` (via AMCOS) don't reflect in AI Maestro
- Team ACL checks in the PR reference AI Maestro's team registry, not `.emasoft/`

**Required plugin changes:**

**AMAMA:**
- Instruct AMAMA agents to use the `team-governance` skill for all team operations. The skill teaches the correct API patterns with proper authentication headers.
- Remove `.emasoft/team-registry.json` usage entirely.
- The `team-governance` skill covers: team creation (`POST /api/teams`), team listing (`GET /api/teams`), membership updates (`PUT /api/teams/{id}`), and COS assignment.

**AMCOS:**
- Instruct AMCOS agents to use the `team-governance` skill for team operations instead of reading/writing `.emasoft/team-registry.json`.
- Update `ecos-label-taxonomy`, `ecos-agent-lifecycle`, and `ecos-team-coordination` skill descriptions to reference the `team-governance` skill patterns.
- The `team-governance` skill teaches proper auth headers and ACL-compliant team management.

---

### C2: No Agent Authentication Headers (HIGH)

**What the PR introduces:**
- `lib/agent-auth.ts`: `authenticateAgent()` reads `Authorization: Bearer <api-key>` header
- `X-Agent-Id` header for agent identity
- API key comes from AMP registration (`~/.agent-messaging/registrations/`)
- Without headers → treated as "web UI" (bypasses ACL but also bypasses identity)
- With headers → agent identity established, ACL enforced

**What the plugins do instead:**
- AMAMA: No auth headers on any API call
- AMCOS: Only call is `curl -s "http://localhost:23000/api/sessions"` — no auth
- PSS: No API calls at all

**Why it conflicts:**
- The new team creation restriction (added in this PR) checks `requestingAgentId` which comes from `authenticateAgent()`. If no Bearer token is sent, `requestingAgentId` is undefined → treated as web UI → allowed. This means the governance restriction is ineffective for plugins that don't send auth.
- Closed team ACL only applies if `X-Agent-Id` is present. Without it, plugins bypass all team restrictions.
- The governance system can't distinguish between "user via dashboard" and "unauthorized agent" since both lack headers.

**Required plugin changes:**

**AMAMA:**
- The `team-governance` skill already teaches the correct authentication pattern (`Authorization: Bearer <api-key>` + `X-Agent-Id` headers). AMAMA agents gain auth headers by following skill instructions — no plugin script changes needed for the curl pattern itself.
- AMAMA's session-start hook should ensure the agent has AMP registration (via `amp-init.sh --auto` from the `agent-messaging` skill) so the API key exists.

**AMCOS:**
- Same as AMAMA: the `team-governance` skill teaches auth headers. AMCOS agents should reference this skill for all API calls.
- Ensure AMP registration exists on startup so credentials are available.

---

### C3: Agent Creation Bypasses Governance (HIGH)

**What the PR introduces:**
- GovernanceRequest type `create-agent` for cross-host agent creation
- For closed teams: creating an agent that joins a closed team should go through governance
- `POST /api/v1/governance/requests` with `type: "create-agent"` and `payload.teamId`

**What the plugins do instead:**
- AMAMA `eama-ecos-coordination` skill: creates ECOS by directly running tmux commands:
  ```bash
  SESSION_NAME="ecos-chief-of-staff-one"
  tmux new-session -d -s $SESSION_NAME
  cp -r /path/to/emasoft-chief-of-staff ~/agents/$SESSION_NAME/.claude/plugins/
  ```
- AMCOS `ecos-agent-lifecycle` skill: creates agents via `ai-maestro-agents-management` skill + tmux
- Neither creates a GovernanceRequest

**Why it conflicts:**
- Agents created this way exist in tmux but may not be registered in AI Maestro's agent registry
- No governance approval flow happens
- The agent is not added to any AI Maestro team
- The manager doesn't formally approve the creation

**Required plugin changes:**

**AMAMA:**
- For agent creation, AMAMA should continue using `aimaestro-agent.sh` (from the `ai-maestro-agents-management` skill) for the actual agent lifecycle.
- For governance approval before creation in closed teams, the `team-governance` skill teaches the GovernanceRequest pattern. AMAMA's skill descriptions should instruct agents to follow the `team-governance` skill workflow.
- After creation, use the `team-governance` skill pattern to add the agent to the team.

**AMCOS:**
- Same approach: use `aimaestro-agent.sh` for agent creation, `team-governance` skill for governance approval and team registration.
- AMCOS skill descriptions should instruct agents to submit a GovernanceRequest (as taught by `team-governance` skill) before spawning agents for closed teams.

---

### C4: Approval System Mismatch (HIGH)

**What the PR introduces:**
- Formal GovernanceRequest system:
  - `POST /api/v1/governance/requests` — create request
  - `POST /api/v1/governance/requests/{id}/approve` — approve with governance password
  - `POST /api/v1/governance/requests/{id}/reject` — reject with reason
  - State machine: pending → local-approved/remote-approved → dual-approved → executed
  - Stored in `~/.aimaestro/governance-requests.json`

**What the plugins use instead:**
- AMCOS `ecos-permission-management` skill: sends AMP messages for approval requests
  - Type: `approval-request` via `amp-send.sh`
  - Response: type `approval-response` via AMP
  - No formal state tracking beyond AMP message history
- AMAMA `eama-approval-workflows` skill: receives AMP approval requests, presents to user, sends AMP response
  - No GovernanceRequest creation
  - No governance password involvement

**Why it conflicts:**
- The PR's governance system is entirely separate from the plugin's AMP-based approval system
- Approvals granted via AMP don't create GovernanceRequests → not tracked, not auditable
- The governance password is never used by plugins → the security gate is bypassed
- Cross-host governance (which requires GovernanceRequest + host signatures) is unreachable via AMP messages alone

**Required plugin changes:**

**AMCOS:**
- Replace AMP-based approval flow with the GovernanceRequest system as taught by the `team-governance` skill.
- AMCOS skill descriptions should instruct agents to use the `team-governance` skill for creating/checking GovernanceRequests instead of AMP approval messages.
- Keep AMP messaging (via `agent-messaging` skill) as a notification layer to alert agents of status changes.

**AMAMA:**
- Replace AMP-based approval handling with the `team-governance` skill's GovernanceRequest workflow.
- AMAMA skill descriptions should instruct agents to check pending GovernanceRequests and approve/reject them using the patterns from the `team-governance` skill.
- The governance password (taught by the skill) provides the security gate that AMP messaging lacks.

---

### C5: COS Assignment Not Integrated (MEDIUM)

**What the PR introduces:**
- `POST /api/teams/{id}/chief-of-staff` — assign COS with governance password
- Auto-closes team (type becomes `closed`) when COS assigned
- Auto-opens team when COS removed
- Rate-limited: 5 attempts per 15 minutes per team

**What AMAMA does instead:**
- Creates ECOS agent via tmux session
- Sends AMP initialization-check message
- Does NOT call the COS assignment API
- The agent runs as "ECOS" by convention, not by formal assignment

**Why it conflicts:**
- ECOS agent exists but is not formally assigned as COS in AI Maestro's team
- Team remains `open` type (COS assignment triggers `closed` type)
- Team ACL doesn't enforce COS privileges because the assignment never happened
- Other API callers don't see ECOS as the team's COS

**Required AMAMA changes:**
- The `team-governance` skill teaches the COS assignment endpoint and its authentication requirements.
- After creating ECOS and verifying it's running, AMAMA should guide the user to assign COS via the dashboard, or use the `team-governance` skill's COS assignment pattern if the user provides the governance password.
- AMAMA cannot store the governance password — this is a user-controlled security gate.

---

### C6: Transfer System Not Integrated (MEDIUM)

**What the PR introduces:**
- `POST /api/governance/transfers` — create transfer request (agent moves between teams)
- Transfer states: pending → approved/rejected
- Source team COS or manager must approve
- Stored in `~/.aimaestro/governance-transfers.json`

**What AMCOS does instead:**
- `ecos-failure-recovery` skill: handles work handoff via AMP messages (emergency-handoff type)
- Agent replacement done by terminating old agent + spawning new one
- No formal transfer between teams

**Why it conflicts:**
- Moving an agent between closed teams requires a formal transfer request
- AMCOS's AMP-based handoff doesn't create transfer requests
- The source team COS never formally approves the transfer

**Required AMCOS changes:**
- When moving an agent between teams, AMCOS should use the transfer workflow taught by the `team-governance` skill.
- The skill teaches `POST /api/governance/transfers` with proper authentication.
- If source team is closed, the source COS approval is handled through the governance system.
- Keep AMP emergency-handoff as a notification mechanism alongside the formal transfer.

---

### C7: No Governance Context Awareness (LOW)

**What the PR introduces:**
- `GET /api/governance` — governance status (hasPassword, hasManager, managerId)
- `GET /api/governance/reachable?agentId=<uuid>` — reachable agents
- `GET /api/teams` — team list with types and membership

**What PSS does instead:**
- PSS operates as a standalone skill suggestion engine
- No team/governance awareness
- Cannot tailor suggestions based on governance context

**This is NOT a breaking conflict** — PSS works fine without governance integration. However, PSS could optionally:
- Check if the agent is in a team → suggest team-specific skills
- Check if governance is enabled → suggest governance-related skills
- Use team context to filter skill relevance

**Required PSS changes (OPTIONAL):**
- PSS could optionally use the `agent-messaging` skill's team discovery patterns (`GET /api/teams`) to enrich suggestion context.
- This is entirely optional and non-breaking.

---

## Proposed AI Maestro Server Changes

The following server-side changes would reduce plugin migration friction:

### P1: Add Team-by-Name Lookup (NEW)

Both AMAMA and AMCOS reference teams by name, not UUID. Add:
```
GET /api/teams/by-name/{name} → { team: Team }
```
This avoids plugins needing to list all teams and filter.

### P2: Add Agent Registration Event Hook (NEW)

When an agent registers with AI Maestro (via tmux discovery or explicit registration), emit an event that governance can react to. This would allow:
- Auto-adding newly registered agents to their designated team
- Triggering COS notification when new team members appear

### P3: Add GovernanceRequest Webhook/AMP Notification (NEW)

When a GovernanceRequest changes status (created, approved, rejected), send an AMP notification to the requesting agent. This avoids polling.

---

## Migration Priority Matrix

| Priority | Plugin | Change | Effort | Impact |
|----------|--------|--------|--------|--------|
| 1 | AMAMA+AMCOS | Adopt `team-governance` skill (includes auth headers) (C2) | Low | Unlocks all governance features |
| 2 | AMCOS | Switch from .emasoft/ to /api/teams (C1) | High | Eliminates dual registry |
| 3 | AMAMA | Switch from .emasoft/ to /api/teams (C1) | Medium | Eliminates dual registry |
| 4 | AMCOS | Use GovernanceRequest for approvals (C4) | High | Formal approval tracking |
| 5 | AMAMA | Use GovernanceRequest for approvals (C4) | Medium | Formal approval tracking |
| 6 | AMAMA | COS assignment integration (C5) | Low | Formal COS role |
| 7 | AMCOS | Transfer API integration (C6) | Medium | Formal transfers |
| 8 | AMAMA+AMCOS | GovernanceRequest for agent creation (C3) | Medium | Governance compliance |
| 9 | PSS | Optional governance context (C7) | Low | Better suggestions |

---

## Impact on Existing Audit Reports

The RC (Required Change) items already added to the 3 audit reports cover most of these conflicts:

| Conflict | AMAMA Audit RC | AMCOS Audit RC | PSS Audit RC |
|----------|---------------|----------------|--------------|
| C1 (team registry) | RC-7 (status endpoints) | RC-7 (REST API migration) | — |
| C2 (auth headers) | RC-5 (X-Agent-Id) | RC-3 (emasoft naming includes auth patterns) | — |
| C3 (agent creation) | RC-8 (.agent.toml) | RC-8 (PSS config workflow) | RC-2 (apply-agent-toml) |
| C4 (approval mismatch) | RC-6 (approve-plan modernize) | RC-6 (transfer model fix) | — |
| C5 (COS assignment) | RC-2 (COS endpoint fix) | RC-2 (COS verification) | — |
| C6 (transfer system) | — | RC-6 (transfer model fix) | — |
| C7 (governance context) | — | — | RC-4 (AI Maestro discovery) |

**Gaps not covered by existing RCs:**
- C1 is partially covered but no RC explicitly says "remove .emasoft/team-registry.json usage"
- C2 has no RC that provides the exact header pattern to use
- C4 has no RC that describes the full GovernanceRequest migration path

These gaps should be addressed in the "Required Plugin Changes" sections of each audit report.

---

## Conclusion

The PR introduces a robust governance system, but the 3 plugins still operate on a pre-governance model. The primary conflicts are:

1. **Dual team registries** (plugins use local files, server uses API) — CRITICAL
2. **No authentication** (plugins don't send auth headers) — HIGH
3. **Parallel approval systems** (plugins use AMP, server uses GovernanceRequest) — HIGH

Without plugin updates, the governance system works for the dashboard UI but is invisible to plugin-driven agents. The plugins will continue to work (they won't crash), but they bypass all governance controls.

**Recommendation:** Update plugins incrementally. First, ensure agents have AMP registration (`amp-init.sh --auto`). Then update plugin skill descriptions to reference the `team-governance` skill for governance operations, `ai-maestro-agents-management` skill for agent lifecycle, and `agent-messaging` skill for messaging. The skills already teach the correct API patterns — plugins should leverage them rather than reimplementing raw API calls.

---

Generated: 2026-02-27
