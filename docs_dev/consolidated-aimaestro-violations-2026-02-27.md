# Consolidated AI Maestro & PSS Plugin Abstraction Violations
**Date:** 2026-02-27
**Reference Standard:** `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
**Sources:**
- `docs_dev/decoupling-changes-aimaestro-server-2026-02-27.md`
- `docs_dev/decoupling-changes-aimaestro-plugin-2026-02-27.md`
- `docs_dev/audit-aimaestro-plugin-decoupling-2026-02-27.md`
- `docs_dev/decoupling-audit-PSS-raw.md`
- `docs_dev/deep-audit-PSS-refs-2026-02-27.md`
- `docs_dev/decoupling-changes-PSS-2026-02-27.md`

---

## Executive Summary

| Component | Score | Violations | Priority Fixes |
|-----------|-------|-----------|----------------|
| AI Maestro Plugin | 9/10 | 1 active (curl in skill) + 1 documented exception (hook) | HIGH: add `role` command; LOW: document hook exception |
| PSS Plugin | Mostly Compliant | 2 (both in one skill file) | MODERATE: replace inline index parsing; LOW: simplify gh API paths |
| AI Maestro Server | n/a (provider) | Missing API endpoint + missing script command | HIGH: add team-by-name endpoint + `role` subcommand |

---

## 1. AI MAESTRO SERVER-SIDE CHANGES

These changes are required in the AI Maestro server codebase to fully support the Plugin Abstraction Principle and to enable the AMCOS/AMAMA harmonization described in Section 4.

### S1: Add Team-by-Name Lookup API — HIGH PRIORITY

**Purpose:** Eliminate need for plugins to list all teams and filter by name client-side.

| Field | Value |
|-------|-------|
| Endpoint | `GET /api/teams/by-name/{name}` |
| Returns | Full team object, or 404 if not found |
| New File | `app/api/teams/by-name/[name]/route.ts` |
| Uses | Existing `lib/team-registry.ts` |
| Status | TODO |

**Motivation:** AMAMA and AMCOS must reference teams like "AMAMA" or "COS" by name. Without this endpoint, they must fetch all teams and filter — a pattern that leaks implementation details into plugin skills.

---

### S2: Add `aimaestro-agent.sh role` Subcommand — HIGH PRIORITY

**Purpose:** Replace the only remaining direct `curl` example in the AI Maestro skills layer.

| Field | Value |
|-------|-------|
| Command | `aimaestro-agent.sh role [agentId]` |
| Returns | Agent's governance role (`manager`, `member`, `unset`) |
| Modified File | `plugin/plugins/ai-maestro/scripts/agent-helper.sh` |
| Replaces | `curl -s "http://localhost:23000/api/governance" \| jq .` |
| Status | TODO |

**Implementation sketch:**
```bash
role() {
  local api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"
  curl -s "${api_base}/api/governance" | jq '{
    role: (if .hasManager then (if .managerId == env.AGENT_ID then "manager" else "member" end) else "unset" end),
    hasPassword: .hasPassword,
    managerId: .managerId
  }'
}
```

---

### S3: Update ai-maestro-agents-management Skill — HIGH PRIORITY

**Purpose:** Remove the only direct API curl example from any AI Maestro skill.

| Field | Value |
|-------|-------|
| Modified File | `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` |
| Current (WRONG) | `curl -s "http://localhost:23000/api/governance" \| jq .` |
| New (CORRECT) | `aimaestro-agent.sh role` |
| Status | TODO (depends on S2) |

---

### S4: GovernanceRequest AMP Notification Hook — MEDIUM PRIORITY (FUTURE)

**Purpose:** Notify requesting agents immediately when a governance decision changes status.

| Field | Value |
|-------|-------|
| Trigger | `updateGovernanceRequest()` status change (approved/rejected/pending) |
| Action | Send AMP message to requesting agent via `sendMessage()` |
| Modified File | `services/governance-service.ts` |
| Status | FUTURE (Phase 2+) |

---

### S5: Agent Registration Event System — MEDIUM PRIORITY (FUTURE)

**Purpose:** Automatically integrate newly registered agents into governance and team workflows.

| Field | Value |
|-------|-------|
| Trigger | `POST /api/agents/register` succeeds |
| Actions | Emit `agent:registered` event → auto-add to default team → notify team managers via AMP |
| New File | `services/agent-lifecycle-events.ts` |
| Modified File | `app/api/agents/register/route.ts` |
| Status | FUTURE (Phase 2+) |

---

### S6: Document Hook Fetch Exception in ai-maestro-hook.cjs — LOW PRIORITY

**Purpose:** Clarify for future maintainers why the pre-commit hook is exempt from the Plugin Abstraction Principle.

| Field | Value |
|-------|-------|
| Modified File | `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` |
| Change Type | Documentation (JSDoc block at top of file) |
| Status | TODO |

**Comment to add:**
```javascript
/**
 * PLUGIN ABSTRACTION EXCEPTION: This hook uses direct fetch() calls instead of
 * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
 *
 * 1. Hooks run in Node.js context only (no CLI subprocess available)
 * 2. Hooks have strict timeout constraints (~5s before git hangs)
 * 3. No global abstraction layer exists yet for hook→API calls
 * 4. Subprocess overhead (spawning aimaestro-agent.sh) would exceed timeout
 *
 * When hook abstraction is added (Phase 2+), migrate these fetch calls
 * to use the hook-aware API wrapper instead.
 */
```

---

### Server-Side Summary Table

| # | Change | File(s) | Priority | Status |
|---|--------|---------|----------|--------|
| S1 | Team-by-name lookup API | `app/api/teams/by-name/[name]/route.ts` (NEW) | HIGH | TODO |
| S2 | `aimaestro-agent.sh role` subcommand | `plugin/.../scripts/agent-helper.sh` | HIGH | TODO |
| S3 | Update agents-management skill | `plugin/.../skills/ai-maestro-agents-management/SKILL.md` | HIGH | TODO (after S2) |
| S4 | GovernanceRequest AMP notifications | `services/governance-service.ts` | MEDIUM | FUTURE |
| S5 | Agent registration event system | `services/agent-lifecycle-events.ts` (NEW), `app/api/agents/register/route.ts` | MEDIUM | FUTURE |
| S6 | Document hook fetch exception | `plugin/.../scripts/ai-maestro-hook.cjs` | LOW | TODO |

---

## 2. AI MAESTRO PLUGIN CHANGES

The AI Maestro plugin is the **provider** of the abstraction layer (Rule 4 in PLUGIN-ABSTRACTION-PRINCIPLE.md). It is fundamentally sound (9/10). Changes needed:

### Overall Scores

| Layer | Score | Notes |
|-------|-------|-------|
| Hooks (`ai-maestro-hook.cjs`) | 8/10 | 6 direct fetch() calls — acceptable due to hook constraints; need documentation |
| Scripts (`amp-send.sh`, `agent-helper.sh`, etc.) | 10/10 | Excellent abstraction, env-configurable API base URLs |
| Skills | 9/10 | One `curl` example remains in governance skill |

### P1: Add `role` Subcommand to `agent-helper.sh` — HIGH PRIORITY

**File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh`

**Violation type:** Skill (Layer 1) teaches raw `curl` directly because no CLI wrapper exists yet.

The `skills/ai-maestro-agents-management/SKILL.md` currently teaches:
```bash
curl -s "http://localhost:23000/api/governance" | jq .
```
This is the only direct API curl example in any skill — a violation of Rule 1 of the Plugin Abstraction Principle.

**Fix:** Add the `role` subcommand (see S2 above), then update the skill to teach:
```bash
aimaestro-agent.sh role
```

**Success criteria:**
- `aimaestro-agent.sh role` outputs governance role without requiring manual curl
- Zero curl examples remain in any skill file
- Respects `AIMAESTRO_API_BASE` env var

---

### P2: Document Hook Exception in `ai-maestro-hook.cjs` — LOW PRIORITY

**File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

**Violation type:** Layer 0 (hook) makes 6 direct `fetch()` API calls with no explanation.

| Line | Endpoint | Purpose |
|------|----------|---------|
| ~50 | `GET /api/agents` | Find agent by working directory |
| ~69 | `POST /api/sessions/activity/update` | Broadcast status update |
| ~127 | `GET /api/agents` | Find agent matching CWD |
| ~143 | `POST /api/sessions/{name}/command` | Send message notification |
| ~169 | `GET /api/agents` | Check unread messages (agent lookup) |
| ~200 | `GET /api/messages?agent=...` | Fetch unread messages |

**Why it is an acceptable exception:**
1. Hooks run in Node.js — no shell subprocess available
2. 5-second timeout constraint; spawning scripts would exceed it
3. No abstraction layer exists in Claude Code's hook API
4. The hook is never called transitively (only Claude Code calls it)

**Fix:** Add JSDoc exception comment (see S6 above). No code changes.

---

### P3: Extract Agent Lookup Helper — LOW PRIORITY (FUTURE)

**File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`

The same agent-by-CWD lookup pattern is repeated 3 times (~lines 50, 127, 169). Extract into a reusable `findAgentByCwd(agents, cwd)` function. Deferred to next scheduled maintenance pass.

---

### Clean Components (No Changes Needed)

| Component | Score | Notes |
|-----------|-------|-------|
| `skills/agent-messaging/SKILL.md` | 10/10 | CLI only, no API syntax |
| `skills/planning/SKILL.md` | 10/10 | File-based, no API calls |
| `skills/graph-query/SKILL.md` | 10/10 | CLI commands only |
| `skills/docs-search/SKILL.md` | 10/10 | CLI commands only |
| `skills/memory-search/SKILL.md` | 10/10 | No API calls |
| `scripts/amp-send.sh` | 10/10 | IS the abstraction layer |
| `scripts/amp-helper.sh` | 10/10 | IS the abstraction layer, env-configurable |
| `scripts/agent-helper.sh` | 9/10 | IS the abstraction layer (missing `role` command only) |
| `hooks/hooks.json` | 10/10 | Declarative only, uses `CLAUDE_PLUGIN_ROOT` |

### Already Completed (This Session)

| Change | File | Status |
|--------|------|--------|
| GovernanceRequests section | `skills/team-governance/SKILL.md` | DONE |
| Agent Transfers section | `skills/team-governance/SKILL.md` | DONE |
| Authentication Headers section | `skills/team-governance/SKILL.md` | DONE |
| Governance Discovery section | `skills/team-governance/SKILL.md` | DONE |
| `PLUGIN-ABSTRACTION-PRINCIPLE.md` | `docs/` | DONE |
| Plugin Abstraction section | `CLAUDE.md` | DONE |

---

## 3. PSS PLUGIN CHANGES

The PSS plugin is **substantially compliant** (overall PASS). Of 15 audited files, only **2 violations** exist, both isolated to `skills/pss-agent-toml/SKILL.md`. All scripts, hooks, agents, commands, and reference files are clean.

### V1: Replace Inline Index-Parsing Code — MODERATE SEVERITY (HIGH PRIORITY)

**File:** `skills/pss-agent-toml/SKILL.md`
**Location:** Phase 2, Step 2.2 "Search for additional candidates" (~lines 214–256)
**Violation type:** LOCAL_REGISTRY

**Current (WRONG):**
```bash
cat ~/.claude/cache/skill-index.json | python3 -c "
import json, sys
idx = json.load(sys.stdin)
...
"
```

**Why this violates the principle:**
- Hardcodes the internal cache path (`~/.claude/cache/skill-index.json`)
- Duplicates query logic already in the PSS Rust binary
- If the cache schema or location changes, this code silently breaks
- Bypasses the PSS binary's official query interface

**Required fix:**
1. Add `--search` flag to the PSS Rust binary (PSS maintainer task)
2. Replace the inline Python block with:
```bash
"$BINARY_PATH" --search "<search_term>" [--type=skill|agent|command|rule|mcp|lsp] [--category=<category>] [--language=<lang>]
```

**Acceptance criteria:**
- PSS Rust binary supports `--search` flag
- Skill does not embed raw index-parsing code
- Skill describes WHAT to search for (semantics), not HOW to parse the index

---

### V2: Simplify gh API Endpoint Paths — LOW SEVERITY (MEDIUM PRIORITY)

**File:** `skills/pss-agent-toml/SKILL.md`
**Location:** Phase 4, Steps 4.3 and 4.4 (~lines 406, 407, 419)
**Violation type:** API_SYNTAX (borderline)

**Current (WRONG):**
```
gh api repos/<owner>/<repo>/contents/.claude-plugin/plugin.json
gh api repos/<owner>/<repo>/contents/skills/<name>/SKILL.md
gh api repos/<owner>/<repo>/contents/skills (or /agents)
```

**Note:** `gh api` is a standard globally-installed tool (not the AI Maestro API), so this is borderline. The issue is that embedding full endpoint URL patterns instructs HOW to call the API rather than WHAT to accomplish.

**Required fix:**
Replace specific endpoint paths with prose instruction:
```markdown
Fetch the plugin manifest from the GitHub repository using `gh api` with the repository contents endpoint.
Navigate the skills/ and agents/ directories to extract SKILL.md and agent definitions.
```

**Acceptance criteria:**
- No explicit `/repos/<owner>/<repo>/contents/<path>` patterns in skill text
- Instructions describe goal, not API path

---

### PSS Clean Files (No Changes Required)

| File | Status | Notes |
|------|--------|-------|
| `skills/pss-usage/SKILL.md` | CLEAN | Purely instructional, PSS commands only |
| `agents/pss-agent-profiler.md` | CLEAN | Calls PSS binary via `${BINARY_PATH}` |
| `commands/pss-setup-agent.md` | CLEAN | Internal path resolution only |
| `commands/pss-status.md` | CLEAN | Local filesystem checks, no API calls |
| `commands/pss-reindex-skills.md` | CLEAN | Plugin-local scripts and OS tools only |
| `scripts/pss_hook.py` | CLEAN | Calls PSS Rust binary via subprocess |
| `scripts/pss_discover.py` | CLEAN | Local filesystem reads only |
| `scripts/pss_setup.py` | CLEAN | Calls cargo and PSS binary only |
| `scripts/pss_generate.py` | CLEAN | Pure filesystem operations |
| `scripts/pss_build.py` | CLEAN | cargo, cross, docker only |
| `scripts/pss_cleanup.py` | CLEAN | Pure filesystem operations |
| `scripts/pss_merge_queue.py` | CLEAN | Atomic file merge, no network |
| `hooks/hooks.json` | CLEAN | Calls `pss_hook.py` (plugin-local) |
| `.claude-plugin/plugin.json` | CLEAN | Standard manifest |
| PSS reference files (3 files) | CLEAN | Full compliance (2 optional style notes only) |

### PSS Notable Compliance

- **Zero** curl calls to `localhost:23000` across all files
- **Zero** AI Maestro API endpoints embedded anywhere
- **Zero** hardcoded governance rules (roles, policies, approval chains)
- **Zero** AMP messaging calls (`amp-send.sh`, etc.) — correct, PSS doesn't need messaging
- **Zero** Bearer token or API key patterns
- Hooks call plugin-local scripts only (`pss_hook.py`) — correct architecture
- Scripts call globally-installed tools (cargo, cross, docker) or plugin-local binary — correct pattern
- `CLAUDE_PLUGIN_ROOT` used consistently for plugin-relative paths

---

## 4. SERVER-SIDE CHANGES NEEDED FOR HARMONIZATION

These changes are required to support AMCOS and AMAMA plugin harmonization. They extend AI Maestro's server and global skill/script surface so external plugins can follow the Plugin Abstraction Principle for governance and team operations.

### H1: `GET /api/teams/by-name/{name}` Endpoint

Already documented in S1 above. Specifically enables AMAMA and AMCOS to reference their own teams by canonical name without client-side filtering. Required before AMAMA/AMCOS can fully follow Rule 1 (no API syntax embedding) for team operations.

### H2: GovernanceRequest Endpoints in Global Skill

The `team-governance` skill (already updated this session) now documents GovernanceRequest creation and approval workflows. This provides the "WHAT to do" canonical reference that AMCOS must use when requesting governance approvals — instead of embedding the `POST /api/governance/requests` curl syntax directly in AMCOS plugin skills.

**Already completed:** `skills/team-governance/SKILL.md` now includes:
- GovernanceRequests section
- Agent Transfers section
- Authentication Headers section
- Governance Discovery section

### H3: `aimaestro-agent.sh role` Command

Already documented in S2 above. Required by AMAMA and AMCOS agents to check their own governance role at runtime without embedding curl. Without this command, any plugin agent that needs to self-check its role must violate Rule 1.

### H4: Authentication Header Propagation

The `team-governance` skill now teaches the `X-Manager-Token` and `X-Manager-Password` header patterns. Any AMAMA/AMCOS operation that requires manager-level authentication must route through this skill reference — not embed the header names and values in plugin skill text.

**Status:** DONE (skill updated this session).

### H5: GovernanceRequest AMP Webhook (Future)

Documented as S4 above. When implemented, AMCOS agents will receive instant notification on governance decision changes instead of polling. This removes any temptation for AMCOS to embed polling loop logic in plugin skills.

### H6: Cross-Plugin Team Discovery

Once S1 (team-by-name API) is live and documented in the `team-governance` skill, AMAMA and AMCOS can discover each other's teams using:
```bash
# Via skill reference — no curl needed in plugin
"Follow the team-governance skill → Team Discovery section to look up teams by name."
```

---

## Master Priority Queue

All changes consolidated and ranked:

| Priority | ID | Component | Change | Files | Effort |
|----------|----|-----------|--------|-------|--------|
| HIGH | S1 | Server | Add `GET /api/teams/by-name/{name}` | `app/api/teams/by-name/[name]/route.ts` (NEW) | Medium |
| HIGH | S2+P1 | Plugin + Server | Add `aimaestro-agent.sh role` + update skill | `scripts/agent-helper.sh`, `skills/ai-maestro-agents-management/SKILL.md` | Small |
| HIGH | V1 | PSS | Replace inline index-parsing code | `skills/pss-agent-toml/SKILL.md` (+ PSS binary `--search` flag) | Medium |
| MEDIUM | V2 | PSS | Simplify gh API endpoint paths | `skills/pss-agent-toml/SKILL.md` | Small |
| MEDIUM | S4 | Server | GovernanceRequest AMP notifications | `services/governance-service.ts` | Large |
| MEDIUM | S5 | Server | Agent registration event system | `services/agent-lifecycle-events.ts` (NEW), `app/api/agents/register/route.ts` | Large |
| LOW | S6+P2 | Plugin | Document hook fetch exception | `scripts/ai-maestro-hook.cjs` | Tiny (docs only) |
| LOW | P3 | Plugin | Extract agent lookup helper | `scripts/ai-maestro-hook.cjs` | Small |

---

## Implementation Sequence

### Sprint N (Immediate — Unblock Plugins)
1. **S2**: Add `aimaestro-agent.sh role` subcommand to `agent-helper.sh`
2. **S3/P1**: Update `ai-maestro-agents-management/SKILL.md` to teach `aimaestro-agent.sh role`
3. **S1**: Add `GET /api/teams/by-name/{name}` route
4. **S6/P2**: Add exception JSDoc to `ai-maestro-hook.cjs`

### Sprint N+1 (PSS Plugin)
5. **PSS binary**: Add `--search` flag to Rust binary (PSS maintainer)
6. **V1**: Update `pss-agent-toml/SKILL.md` to use binary search
7. **V2**: Simplify gh API path references to prose

### Sprint N+2 (Future — Phase 2+)
8. **S4**: GovernanceRequest AMP notification hook
9. **S5**: Agent registration event system with auto-team-add
10. **P3**: Extract agent lookup helper refactor

---

## Verification After Changes

| Check | Target | Pass Criteria |
|-------|--------|---------------|
| Zero curl in skills | All plugin skills | `grep -r "curl " plugin/plugins/*/skills/` returns nothing |
| `aimaestro-agent.sh role` works | agent-helper.sh | Returns valid JSON role object |
| Team-by-name API returns 200 | `/api/teams/by-name/AMAMA` | Returns full team object |
| PSS binary `--search` flag | PSS Rust binary | Returns candidates without index parsing |
| Hook exception documented | `ai-maestro-hook.cjs` | JSDoc block visible at top of file |
| Governance skill covers all ops | `team-governance/SKILL.md` | GovernanceRequests + Transfers + Auth + Discovery sections present |

---

*Consolidated from 6 source documents. All findings verified against `docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`.*
