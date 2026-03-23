# TODO: AI Maestro Server-Side Changes
**Generated:** 2026-02-27
**Source:** `docs_dev/consolidated-aimaestro-violations-2026-02-27.md` — Sections 1 & 4
**Purpose:** Step-by-step implementation guide for all required server and plugin changes that are prerequisites for the Plugin Abstraction Principle compliance in external plugins (AMAMA, AMCOS, PSS).

---

## Dependency Order Summary

```
S1 (new API route)          ←— no deps
S2 (agent-helper.sh role)   ←— no deps
S3 (update SKILL.md)        ←— depends on S2
S4 (governance AMP notify)  ←— no deps (FUTURE, Phase 2+)
S5 (agent lifecycle events) ←— no deps (FUTURE, Phase 2+)
S6 (document hook exception)←— no deps
```

Sprint order: **S2 → S3 → S1 → S6** (S4, S5 deferred to Phase 2+)

---

## P1 Changes (Must exist before external plugins can be updated)

---

### TODO-S1: Add Team-by-Name Lookup API Endpoint
- **File:** `app/api/teams/by-name/[name]/route.ts`
- **Lines:** new file
- **Priority:** P1
- **Depends on:** None
- **Current:** Does not exist. Plugins that need to reference a team by canonical name (e.g., "AMAMA" or "COS") must call `GET /api/teams`, receive the full list, and filter client-side. This leaks implementation details into plugin skill text and violates Rule 1 of `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`.
- **Change:** Create a new Next.js App Router route file at `app/api/teams/by-name/[name]/route.ts` that:
  1. Exports `export const dynamic = 'force-dynamic'` (mirrors all other team routes — reads runtime filesystem state).
  2. Implements `GET(request: NextRequest, { params }: { params: Promise<{ name: string }> })`.
  3. Awaits `params` to extract `name` (Next.js 15 async params pattern — match `app/api/teams/[id]/route.ts` line 11).
  4. Calls `loadTeams()` from `@/lib/team-registry` (already exported, see `lib/team-registry.ts` line 208).
  5. Does a case-insensitive `teams.find(t => t.name.toLowerCase() === name.toLowerCase())`.
  6. Returns `NextResponse.json({ team })` with status 200 if found.
  7. Returns `NextResponse.json({ error: 'Team not found' }, { status: 404 })` if not found.
  8. Wraps in try/catch; returns `{ error: 'Internal server error' }` with status 500 on exception.
  9. No authentication required on GET (matches `GET /api/teams` which is also unauthenticated — Phase 1 localhost-only). Add a comment: `// Phase 1: localhost-only, no auth required. TODO: add ACL for Phase 2 remote access`.
  10. Add import: `import { NextRequest, NextResponse } from 'next/server'` and `import { loadTeams } from '@/lib/team-registry'`.

  Full expected shape of the response body (mirrors `GET /api/teams/[id]`):
  ```json
  {
    "team": {
      "id": "...",
      "name": "AMAMA",
      "type": "open|closed",
      "agentIds": [...],
      "chiefOfStaffId": "...|null",
      ...
    }
  }
  ```
- **Verify:**
  1. Run `yarn build` — no TypeScript errors.
  2. Start server and call `curl -s http://localhost:23000/api/teams/by-name/AMAMA` — returns 200 + team JSON (assuming a team named "AMAMA" exists).
  3. Call `curl -s http://localhost:23000/api/teams/by-name/nonexistent` — returns `{"error":"Team not found"}` with status 404.
  4. Name lookup is case-insensitive: `curl -s http://localhost:23000/api/teams/by-name/amama` returns the same team as `AMAMA`.
- **Harmonization note:** Required by H1 (Section 4). Enables AMAMA and AMCOS to use `GET /api/teams/by-name/{name}` in skills instead of embedding client-side filter logic. Also enables the `team-governance` skill's "Team Discovery" section to reference this endpoint as the canonical lookup mechanism.

---

### TODO-S2: Add `role` Subcommand to `agent-helper.sh`
- **File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- **Lines:** Append after line 1076 (current end of file), or insert into the appropriate section before any `# ==== end ====` marker if one exists
- **Priority:** P1
- **Depends on:** None
- **Current:** `agent-helper.sh` has no `role` subcommand. The only way for an agent to check its own governance role is via raw `curl -s "http://localhost:23000/api/governance" | jq .` — which is explicitly taught in `skills/ai-maestro-agents-management/SKILL.md` line 48 and is the sole remaining direct API curl example in any AI Maestro skill, violating Rule 1 of the Plugin Abstraction Principle.
- **Change:** Add the following function to `agent-helper.sh` (after the last existing function, before end of file). The function must:
  1. Resolve `api_base` using the existing `get_api_base` helper (already used throughout the file, e.g., line 157).
  2. Accept an optional `agentId` argument; if not provided, resolve the calling agent's ID from `$AIMAESTRO_AGENT` or `$SESSION_NAME` using the existing `_resolve_caller_agent_id` function (line 207).
  3. Call `GET ${api_base}/api/governance` and pipe through `jq` to produce:
     ```json
     {
       "role": "manager|member|unset",
       "hasPassword": true|false,
       "managerId": "uuid-or-null"
     }
     ```
  4. Use `AIMAESTRO_API_BASE` env var via `get_api_base` — do NOT hardcode `http://localhost:23000`.
  5. Return exit code 0 on success, 1 on API failure.

  Exact function to add:
  ```bash
  # ============================================================================
  # Governance Role
  # ============================================================================

  # Print the calling agent's governance role without requiring manual curl.
  # Usage: get_governance_role [agentId]
  # Output: JSON object with role ("manager"|"member"|"unset"), hasPassword, managerId
  # Returns: 0 on success, 1 on failure
  get_governance_role() {
      local agent_id="${1:-}"
      local api_base
      api_base=$(get_api_base 2>/dev/null) || {
          print_error "Cannot resolve API base URL. Is AI Maestro running?" >&2
          return 1
      }

      # If no agentId argument, resolve from session name
      if [[ -z "$agent_id" ]]; then
          agent_id=$(_resolve_caller_agent_id 2>/dev/null) || agent_id=""
      fi

      local gov_resp
      gov_resp=$(curl -s --max-time 10 "${api_base}/api/governance" 2>/dev/null) || {
          print_error "Governance API unreachable at ${api_base}/api/governance" >&2
          return 1
      }

      # Derive role from response fields
      echo "$gov_resp" | jq --arg agent_id "$agent_id" '{
          role: (
              if .managerId == null or .managerId == "" then "unset"
              elif ($agent_id != "" and .managerId == $agent_id) then "manager"
              else "member"
              end
          ),
          hasPassword: (.hasPassword // false),
          managerId: (.managerId // null)
      }'
  }
  ```

  Then, in the `case "$COMMAND" in` dispatch block inside `aimaestro-agent.sh` (or wherever subcommands are routed), add a `role` case that calls `get_governance_role "$@"`. Check how existing subcommands like `session`, `config`, etc. are dispatched in `aimaestro-agent.sh` and follow the same pattern.
- **Verify:**
  1. `yarn build` passes (no server-side changes, but confirms plugin file is valid bash).
  2. With AI Maestro running: `aimaestro-agent.sh role` outputs a JSON object like `{"role":"member","hasPassword":false,"managerId":null}`.
  3. With `AIMAESTRO_API_BASE=http://localhost:23000 aimaestro-agent.sh role` — same result (respects env var).
  4. With AI Maestro NOT running: `aimaestro-agent.sh role` prints an error and exits non-zero.
  5. `grep -r "curl.*localhost:23000.*governance" plugin/plugins/ai-maestro/skills/` — should return nothing after S3 is also applied.
- **Harmonization note:** Required by H3 (Section 4). Without this command, any external plugin agent (AMAMA, AMCOS) that needs to self-check governance role at runtime must violate Rule 1 by embedding curl syntax.

---

## P2 Changes (Required for full compliance, but not blockers for external plugins)

---

### TODO-S3: Update `ai-maestro-agents-management` Skill to Use `aimaestro-agent.sh role`
- **File:** `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
- **Lines:** Line 48 (the `curl -s "http://localhost:23000/api/governance" | jq .` line)
- **Priority:** P2
- **Depends on:** TODO-S2 (the `role` subcommand must exist before the skill can teach it)
- **Current:** Line 48 reads:
  ```
  - Check your governance role: `curl -s "http://localhost:23000/api/governance" | jq .`
  ```
  This is the only direct API curl example in any AI Maestro skill — a Rule 1 violation of `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`. It hardcodes the server address and exposes the internal `/api/governance` endpoint path.
- **Change:** Replace line 48 with:
  ```
  - Check your governance role: `aimaestro-agent.sh role`
  ```
  No other changes to the file. The surrounding context (lines 33–55) explaining governance enforcement and the Phase 1 note should be preserved as-is.
- **Verify:**
  1. `grep -r 'curl.*localhost:23000' plugin/plugins/ai-maestro/skills/` returns no output (zero curl examples in any skill).
  2. The skill file still loads and renders correctly (no broken markdown formatting).
  3. `aimaestro-agent.sh role` works as verified in TODO-S2.
- **Harmonization note:** Required to complete H3. After this change, `grep -r "curl " plugin/plugins/ai-maestro/skills/` should return nothing, achieving 100% Plugin Abstraction compliance for the AI Maestro plugin's skills layer.

---

### TODO-S6: Document Hook Fetch Exception in `ai-maestro-hook.cjs`
- **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
- **Lines:** Lines 1–17 (insert after the existing header comment block, before `const fs = require('fs')`)
- **Priority:** P2
- **Depends on:** None
- **Current:** The file has a plain header comment (lines 1–14) documenting supported events and state file location. It contains 6 direct `fetch()` calls to `localhost:23000` API endpoints (~lines 50, 69, 127, 143, 169, 200) with no explanation of why the Plugin Abstraction Principle is not followed here. Future maintainers may incorrectly flag these as violations or attempt to wrap them in shell scripts (which would break the hook entirely).
- **Change:** Insert the following JSDoc block immediately after the existing header comment (after line 14, before `const fs = require('fs')`):
  ```javascript
  /**
   * PLUGIN ABSTRACTION EXCEPTION: This hook uses direct fetch() calls instead of
   * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
   *
   * 1. Hooks run in Node.js context only — no shell subprocess is available
   *    (Claude Code invokes hooks as node scripts, not bash scripts)
   * 2. Hooks have strict timeout constraints (~5s before git/Claude Code hangs)
   * 3. No abstraction layer exists yet for hook→API calls in Node.js
   * 4. Subprocess overhead (spawning aimaestro-agent.sh via child_process.exec)
   *    would reliably exceed the timeout budget
   *
   * Direct fetch() calls in hooks are therefore the correct implementation pattern
   * for Phase 1. When hook abstraction is added (Phase 2+), migrate these fetch
   * calls to use the hook-aware Node.js API wrapper instead.
   *
   * Affected endpoints (do not remove without updating this comment):
   *   ~line 50:  GET  /api/agents              (find agent by working directory)
   *   ~line 69:  POST /api/sessions/activity/update (broadcast status update)
   *   ~line 127: GET  /api/agents              (find agent matching CWD)
   *   ~line 143: POST /api/sessions/{name}/command (send message notification)
   *   ~line 169: GET  /api/agents              (check unread messages - agent lookup)
   *   ~line 200: GET  /api/messages?agent=...  (fetch unread messages)
   */
  ```
- **Verify:**
  1. `node --check plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` exits 0 (valid syntax — no code changes, only a comment was added).
  2. The comment block appears at the top of the file, clearly visible to any developer opening the file.
  3. `grep -n "PLUGIN ABSTRACTION EXCEPTION" plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` returns the inserted line.
- **Harmonization note:** Not directly required for harmonization. Low-risk documentation-only change. Prevents future incorrect refactoring attempts that would break hook timing.

---

## P3 Changes (Future — Phase 2+, not blockers)

---

### TODO-S4: GovernanceRequest AMP Notification on Status Change
- **File:** `services/governance-service.ts`
- **Lines:** Identify the `updateGovernanceRequest()` function (search for it; it handles status transitions to `approved`/`rejected`/`pending`)
- **Priority:** P3
- **Depends on:** None (independent server-side feature)
- **Current:** When a governance request's status changes (e.g., manager approves or rejects), no notification is sent to the requesting agent. The requesting agent must poll `GET /api/governance/requests` to discover status changes. This creates pressure on external plugin skills (AMCOS) to embed polling loop logic, which would violate Rule 1.
- **Change:** After a successful `updateGovernanceRequest()` status transition, call `sendMessage()` (from the AMP messaging layer) to notify the requesting agent. The message should include the request ID, new status, and any rejection reason. This is a Phase 2+ task — do not implement without a full design for the AMP send path from server-side TypeScript code.
- **Verify:** After approval/rejection, the requesting agent's AMP inbox contains a new message with the decision details without any polling.
- **Harmonization note:** Required for H5 (Section 4). When implemented, AMCOS agents will receive instant notification on governance decision changes, eliminating any temptation to embed polling loops in plugin skill files.

---

### TODO-S5: Agent Registration Event System
- **File (new):** `services/agent-lifecycle-events.ts`
- **File (modified):** `app/api/agents/register/route.ts`
- **Lines:** new file + integrate into register route's success path
- **Priority:** P3
- **Depends on:** None
- **Current:** `POST /api/agents/register` registers an agent but does not emit any downstream events. New agents are not automatically added to default teams and team managers receive no notification of new registrations.
- **Change:** Create `services/agent-lifecycle-events.ts` that exports an `emitAgentRegistered(agentId: string)` function. This function should: (1) auto-add the agent to the configured default team if one exists, (2) notify team managers via AMP message. Call `emitAgentRegistered()` from the success path of `app/api/agents/register/route.ts`. Full design required before implementation — defer to Phase 2+.
- **Verify:** After `POST /api/agents/register`, the new agent appears in the default team's member list, and the team manager's AMP inbox contains a registration notification.
- **Harmonization note:** Required for H5 (Section 4). Removes the need for AMAMA/AMCOS skills to manually handle new-agent onboarding workflows that belong at the server layer.

---

## Verification Checklist (Run After All P1+P2 Changes)

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| Zero curl in skill files | `grep -r "curl " plugin/plugins/ai-maestro/skills/` | No output |
| `aimaestro-agent.sh role` works | `aimaestro-agent.sh role` | Returns valid JSON `{"role":..., "hasPassword":..., "managerId":...}` |
| Team-by-name returns 200 | `curl -s http://localhost:23000/api/teams/by-name/AMAMA` | Returns full team object (assuming team exists) |
| Team-by-name returns 404 | `curl -s http://localhost:23000/api/teams/by-name/nonexistent` | `{"error":"Team not found"}` with HTTP 404 |
| Hook exception documented | `grep -n "PLUGIN ABSTRACTION EXCEPTION" plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` | Returns line number in file |
| Build passes | `yarn build` | No TypeScript errors |
| Governance skill complete | Check `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` | GovernanceRequests + Transfers + Auth + Discovery sections present (already done this session) |

---

## Sprint Implementation Order

### Sprint N (Immediate — Unblock Plugin Compliance)
1. **S2**: Add `get_governance_role` function + `role` subcommand dispatch to `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
2. **S3**: Replace curl example with `aimaestro-agent.sh role` in `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
3. **S1**: Create `app/api/teams/by-name/[name]/route.ts` with case-insensitive name lookup
4. **S6**: Insert JSDoc exception comment at top of `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

### Sprint N+1 (Phase 2+)
5. **S4**: GovernanceRequest AMP notification hook in `services/governance-service.ts`
6. **S5**: Agent lifecycle event system (`services/agent-lifecycle-events.ts` + register route integration)
