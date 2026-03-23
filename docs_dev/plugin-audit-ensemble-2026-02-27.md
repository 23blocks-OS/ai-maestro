# Ensemble Audit: AI Maestro 3-Plugin Architecture
Generated: 2026-02-27

---

## Overview

This audit examines the **full ensemble** of the 3 AI Maestro plugins working together:

| Plugin | Role | CLI Invocation | Version |
|--------|------|----------------|---------|
| `ai-maestro-assistant-manager-agent` (AMAMA) | Manager | `claude --agent amama-assistant-manager-main-agent` | 2.0.0 |
| `ai-maestro-chief-of-staff` (AMCOS) | Per-team Chief of Staff | `claude --agent amcos-chief-of-staff-main-agent` | 2.0.0 |
| `perfect-skill-suggester` (PSS) | Utility (skill matching) | `claude plugin install ... --scope user` | 2.1.0 |

The audit tests 5 end-to-end scenarios where these plugins interact.

---

## Scenario 1: Manager Creates a Team and Assigns Chief-of-Staff

### Expected Flow

1. User launches: `claude --agent amama-assistant-manager-main-agent`
2. User tells AMAMA: "Create a team for the web frontend project"
3. AMAMA calls `POST /api/teams` with team config (name, type: closed)
4. AMAMA receives team ID, then asks user to select an agent for COS role
5. User specifies an agent (e.g., `frontend-cos`)
6. AMAMA calls `PATCH /api/teams/{id}/chief-of-staff` with the agent ID
7. The agent assigned as COS loads the AMCOS plugin: `claude --agent amcos-chief-of-staff-main-agent`
8. AMCOS sends `cos-role-accepted` message to AMAMA via AMP
9. Team is now active with manager + chief-of-staff

### Blockers Found

| # | Blocker | Severity | Detail |
|---|---------|----------|--------|
| E1-1 | **API endpoints don't exist** | CRITICAL | `POST /api/teams` exists in AI Maestro but `PATCH /api/teams/{id}/chief-of-staff` does NOT. AMAMA also references `POST /api/teams/{id}/cos` in docs — neither endpoint exists. |
| E1-2 | **COS plugin auto-loading not implemented** | HIGH | After AMAMA assigns the COS role, there is no mechanism in AI Maestro to automatically load the AMCOS plugin onto the assigned agent. The agent would need to be manually restarted with `--agent amcos-chief-of-staff-main-agent`. |
| E1-3 | **AMCOS does not verify its own authorization** | HIGH | When AMCOS starts, it does NOT call `GET /api/teams/{id}` to verify it is the registered COS for its team (Finding H3 in COS audit). Any agent loading the AMCOS plugin could impersonate a COS. |
| E1-4 | **Endpoint naming inconsistency** | MEDIUM | AMAMA uses `PATCH /api/teams/{id}/chief-of-staff` in persona but `POST /api/teams/{id}/cos` in docs (Finding H1 in AMAMA audit). These must be reconciled before implementation. |

### Verdict: **NOT FUNCTIONAL** — requires API implementation and plugin auto-loading mechanism.

---

## Scenario 2: Chief-of-Staff Uses Skill Suggester to Configure a New Team Agent

### Expected Flow

1. AMCOS is running and managing a team
2. AMCOS decides a new agent needs to be added to the team (e.g., a backend developer)
3. AMCOS invokes `/pss-setup-agent /path/to/backend-dev-agent.md --requirements project-prd.md`
4. PSS runs the 6-phase profiling pipeline (gather context → candidates → AI post-filter → external → coherence → write)
5. PSS writes `team/agents-cfg/backend-dev-agent.agent.toml` with tiered skill recommendations
6. AMCOS reads the `.agent.toml` file
7. AMCOS applies the configuration: installs recommended skills, plugins, MCP servers, rules
8. AMCOS spawns the agent in a new tmux session with the applied configuration

### Blockers Found

| # | Blocker | Severity | Detail |
|---|---------|----------|--------|
| E2-1 | **AMCOS has zero `.agent.toml` awareness** | CRITICAL | AMCOS does not reference `.agent.toml` anywhere. It has no code to read, parse, or apply TOML files. The concept does not exist in the AMCOS plugin (Finding H1 in COS audit). |
| E2-2 | **PSS has no apply mechanism** | CRITICAL | PSS generates `.agent.toml` but provides no `apply-agent-toml.sh` script or API to apply it. The file is a recommendation artifact only (Finding C2 in PSS audit). |
| E2-3 | **PSS has no AI Maestro integration** | CRITICAL | PSS doesn't use AMP messaging, the agent registry, or any AI Maestro API. AMCOS cannot "invoke" PSS through any integrated pathway (Finding C3 in PSS audit). |
| E2-4 | **No shared TOML parser** | HIGH | Even if AMCOS could read `.agent.toml`, there is no TOML parser bundled with either plugin. Claude Code's Python runtime (`python3`) has `tomllib` since Python 3.11, but AMCOS's Python scripts don't use it. |
| E2-5 | **PSS /pss-setup-agent requires Task tool** | MEDIUM | The `/pss-setup-agent` command spawns the `pss-agent-profiler` agent via the Task tool. AMCOS would need to have the PSS plugin loaded alongside its own plugin to invoke this command — but each agent can only load ONE role plugin. |

### Integration Path (Not Yet Built)

For this scenario to work, the following bridge needs to be built:

```
AMCOS                              PSS
  │                                  │
  ├─ 1. Writes agent.md file         │
  ├─ 2. Sends work request ──────────┤
  │    (via AMP or Task tool)        │
  │                                  ├─ 3. Runs /pss-setup-agent
  │                                  ├─ 4. Writes .agent.toml
  │    ◄── Returns .toml path ───────┤
  ├─ 5. Reads .agent.toml            │
  ├─ 6. Parses TOML sections         │
  ├─ 7. Maps skills/plugins/mcp      │
  │    to ConfigOperationType calls   │
  ├─ 8. Applies config via API       │
  └─ 9. Spawns configured agent      │
```

**Key missing components:**
- AMCOS: `read-agent-toml` + `apply-agent-toml` commands
- PSS: AMP message handler or shared file protocol
- AI Maestro API: TOML import endpoint or `POST /api/agents/{id}/apply-config`
- Shared: TOML → ConfigOperationType mapping logic

### Verdict: **NOT FUNCTIONAL** — requires substantial integration work across all 3 plugins.

---

## Scenario 3: Haephestos Uses Skill Suggester During Agent Creation Chat

### Expected Flow

1. User opens Agent Creation Helper in the AI Maestro dashboard
2. Haephestos starts as a Claude Code session with the `haephestos-creation-helper` agent persona
3. User describes their agent: "I need a React frontend developer with testing skills"
4. Haephestos invokes PSS: `/pss-setup-agent /tmp/new-agent.md --requirements user-description.md`
5. PSS generates a `.agent.toml` with recommended skills (e.g., `react-frontend`, `jest-testing`, `css-to-svg`)
6. Haephestos parses the TOML and presents suggestions to the user in the chat
7. User approves/modifies, Haephestos outputs final `json:config` blocks
8. The UI applies the config to the agent configuration panel
9. User clicks Accept, the agent is created with the full configuration

### Blockers Found

| # | Blocker | Severity | Detail |
|---|---------|----------|--------|
| E3-1 | **Haephestos runs in an isolated tmux session** | HIGH | The creation-helper-service.ts creates a tmux session with `claude --agent haephestos-creation-helper`. This session does NOT have PSS loaded as a plugin. Haephestos cannot invoke `/pss-setup-agent` because the PSS plugin is not loaded in its session. |
| E3-2 | **PSS is a `--scope user` plugin, not per-agent** | MEDIUM | If PSS is installed globally with `--scope user`, it SHOULD be available in all Claude Code sessions including Haephestos. However, the Haephestos session uses `--permission-mode bypassPermissions` which may not load all hooks. This needs verification. |
| E3-3 | **No `.agent.toml` → `json:config` bridge** | HIGH | Even if Haephestos invokes PSS and gets a `.agent.toml`, there is no code to convert TOML sections into the `json:config` blocks that the `AgentCreationHelper.tsx` UI expects. This mapping must be built. |
| E3-4 | **Haephestos agent persona has no PSS instructions** | MEDIUM | The `haephestos-creation-helper.md` agent persona does not mention PSS, `/pss-setup-agent`, or `.agent.toml`. Haephestos would not know to use PSS without explicit instructions in its persona. |

### Integration Path (Partially Feasible)

If PSS is installed with `--scope user`, the `/pss-setup-agent` command and hook would be available in Haephestos' Claude session. The remaining work:

1. **Add PSS instructions to Haephestos persona** — tell it to invoke `/pss-setup-agent` when the user asks for skill recommendations
2. **Build TOML → json:config converter** — parse `.agent.toml` and emit `ConfigSuggestion[]` objects
3. **Verify hook loading with bypassPermissions** — confirm PSS hook fires in the creation helper session

### Verdict: **PARTIALLY FEASIBLE** — requires persona update + converter code, but no fundamental architecture changes.

---

## Scenario 4: Manager Loads Assistant-Manager Plugin

### Expected Flow

1. AI Maestro provisions a manager agent on the host
2. The agent loads with: `claude --agent amama-assistant-manager-main-agent`
3. AMAMA initializes: session start hook runs, inbox checked, CozoDB memory loaded
4. AMAMA is ready to receive user instructions

### Blockers Found

| # | Blocker | Severity | Detail |
|---|---------|----------|--------|
| E4-1 | **Session start hook loads wrong memory path** | HIGH | `amama_session_start.py` loads from `.claude/amama/` (v1 file path) not `~/.aimaestro/agents/<id>/memory.cozo` (v2 CozoDB). The hook provides stale or no context. (Finding H5 in AMAMA audit) |
| E4-2 | **`ai-maestro-agents-management` skill must be pre-installed** | HIGH | The AMAMA agent lists this as a required skill. It is NOT bundled in the plugin — AI Maestro must install it globally before the manager can function. If missing, COS assignment and agent lifecycle management fail. (Finding C3 in AMAMA audit) |
| E4-3 | **Commands not registered** | CRITICAL | The 4 slash commands (`/amama-approve-plan`, `/amama-orchestration-status`, `/amama-planning-status`, `/amama-respond-to-amcos`) are NOT declared in plugin.json. They will not be available to the agent. (Finding C2 in AMAMA audit) |
| E4-4 | **Stop hook inbox check is a stub** | MEDIUM | `amama_stop_check.py` always returns 0 unread messages. The safety guard (warn before stopping with unread messages) is non-functional. (Finding H4 in AMAMA audit) |

### Verdict: **PARTIALLY FUNCTIONAL** — agent loads and core persona works, but hooks and commands are broken.

---

## Scenario 5: Full Ensemble — Manager + COS + PSS Working Together

### Expected Flow

1. Manager (AMAMA) creates a team
2. Manager assigns a COS (loading AMCOS plugin)
3. COS receives a work request from Manager
4. COS uses PSS to profile and configure a new specialist agent
5. COS spawns the configured agent into the team
6. Agent reports back through COS to Manager
7. Manager reports to user

### Blockers (Cumulative)

All blockers from Scenarios 1-4 apply, plus:

| # | Blocker | Severity | Detail |
|---|---------|----------|--------|
| E5-1 | **No marketplace for these plugins** | CRITICAL | None of the 3 plugins are registered in any marketplace. Users cannot install them via `claude plugin install`. They can only be loaded via `--plugin-dir` (development mode). A marketplace must be created. |
| E5-2 | **PSS cannot be loaded alongside AMCOS** | HIGH | Each agent loads ONE role plugin. AMCOS loads its own plugin. PSS is a utility plugin loaded with `--scope user`. But if PSS is not installed globally, AMCOS has no way to invoke PSS commands. This chicken-and-egg problem requires PSS to be pre-installed globally. |
| E5-3 | **No .agent.toml consumption anywhere** | CRITICAL | PSS produces `.agent.toml` but neither AMAMA nor AMCOS consume it. The TOML file sits on disk with no reader. This is the biggest integration gap in the ensemble. |
| E5-4 | **AMCOS emasoft naming breaks interop expectations** | HIGH | AMCOS references "EAMA" as the manager role name, but AMAMA uses "AMAMA" as its identity. If AMP messages reference "EAMA" as the sender/recipient, they won't match AMAMA's session name. The 548 emasoft naming contamination in AMCOS creates real interop risk. |
| E5-5 | **AI Maestro API coverage gap** | CRITICAL | The ensemble requires 15+ API endpoints that don't exist in the current AI Maestro codebase. See the full list in the individual audit reports. Note: version requirements stated in plugin READMEs are informational only — the plugin spec has no version pinning mechanism. |

### Verdict: **NOT FUNCTIONAL** — fundamental infrastructure (API, marketplace, TOML consumption, naming cleanup) must be built first.

---

## Cross-Cutting Findings

### F1: No Shared Marketplace (CRITICAL)

All 3 plugins reference different distribution mechanisms:
- AMAMA: "Ships with AI Maestro" (no marketplace)
- AMCOS: "Bundled with AI Maestro v0.26.0+" (no marketplace)
- PSS: References `emasoft-plugins` marketplace (WRONG — should be `ai-maestro-plugins`)

**Fix needed**: Create an `ai-maestro-plugins` marketplace and register all 3 plugins there. Update all installation instructions accordingly.

### F2: .agent.toml is Write-Only (CRITICAL)

PSS generates `.agent.toml` files via a sophisticated 6-phase pipeline. But:
- No plugin reads `.agent.toml`
- No AI Maestro API accepts `.agent.toml`
- No script applies `.agent.toml` to a running agent
- No conversion exists from TOML to any other config format

The `.agent.toml` system is an orphan artifact. To close the loop:
1. Build `apply-agent-toml.sh` in PSS or as a shared utility
2. Add `POST /api/agents/{id}/apply-config` endpoint in AI Maestro that accepts the TOML
3. Or: Build TOML → ConfigOperationType mapping that AMCOS can use

### F3: Emasoft Naming Inconsistency (CRITICAL)

| Plugin | Emasoft Contamination |
|--------|----------------------|
| AMAMA | **CLEAN** — 0 references |
| AMCOS | **CONTAMINATED** — 548 references (EAMA, EOA, EAA, EIA, EPA, emasoft) |
| PSS | **CONTAMINATED** — 15+ references (emasoft-plugins marketplace) |

This creates identity confusion and potential interop issues. All emasoft naming must be removed from AMCOS and PSS.

### F4: Plugin Installation Architecture Undefined (HIGH)

The Claude Code plugin spec requires installation via marketplaces. Direct repo installation is not supported. The 3 plugins need:

1. An `ai-maestro-plugins` marketplace repo with `marketplace.json`
2. Each plugin registered with correct version and source
3. Installation commands documented consistently:
   ```bash
   claude plugin marketplace add ai-maestro-plugins --url https://github.com/Emasoft/ai-maestro-plugins
   claude plugin install ai-maestro-assistant-manager-agent@ai-maestro-plugins --scope local
   claude plugin install ai-maestro-chief-of-staff@ai-maestro-plugins --scope local
   claude plugin install perfect-skill-suggester@ai-maestro-plugins --scope user
   ```
4. AMAMA and AMCOS should use `--scope local` (per-agent), PSS should use `--scope user` (global utility)

### F5: Missing API Endpoints (CRITICAL)

Combined API surface required by AMAMA + AMCOS that does NOT exist in AI Maestro:

| Endpoint | Required By | Purpose |
|----------|-------------|---------|
| `PATCH /api/teams/{id}/chief-of-staff` | AMAMA | Assign COS to team |
| `POST /api/agents/register` | AMAMA, AMCOS | Register new agent |
| `POST /api/agents/{id}/hibernate` | AMCOS | Hibernate agent |
| `POST /api/agents/{id}/wake` | AMCOS | Wake hibernated agent |
| `GET /api/agents/{id}/health` | AMAMA, AMCOS | Agent health check |
| `POST /api/v1/governance/requests` | AMAMA, AMCOS | Submit GovernanceRequest |
| `GET /api/v1/governance/requests/{id}` | AMAMA, AMCOS | Poll GovernanceRequest state |
| `POST /api/v1/governance/requests/{id}/approve` | AMAMA | Approve GovernanceRequest |
| `POST /api/governance/password` | AMAMA | Set governance password |
| `POST /api/governance/transfers` | AMAMA | Transfer agent between teams |
| `GET /api/memory/*` | AMAMA | CozoDB memory endpoints |

These represent ~10 new API endpoints that must be implemented in AI Maestro before the ensemble can function.

### F6: plugin.json Incomplete in 2 of 3 Plugins (HIGH)

| Plugin | `commands` in plugin.json | `hooks` reference | Issue |
|--------|--------------------------|-------------------|-------|
| AMAMA | MISSING (4 commands exist) | MISSING | Commands and hooks silently not registered |
| AMCOS | MISSING (23 commands exist) | N/A (hooks.json is correct) | Commands silently not registered |
| PSS | Present (3 commands) | Present (hooks.json) | No issue |

AMAMA and AMCOS must add `commands` arrays to their `plugin.json` manifests.

---

## Priority Action Items

### P0 — Prerequisites (Must exist before any plugin can work)

1. **Implement 10+ API endpoints** in AI Maestro (F5)
2. **Create `ai-maestro-plugins` marketplace** and register all 3 plugins (F1, F4)
3. **Clean emasoft naming** from AMCOS (548 refs) and PSS (15+ refs) (F3)

### P1 — Plugin Structure Fixes

4. **Add `commands` to plugin.json** in AMAMA (4 commands) and AMCOS (23 commands) (F6)
5. **Fix AMAMA session start hook** to load CozoDB memory, not v1 file path (E4-1)
6. **Fix AMAMA stop hook** inbox check stub (E4-4)
7. **Fix AMCOS endpoint naming** — reconcile `chief-of-staff` vs `cos` path (E1-4)
8. **Tag PSS v2.1.0** release in git (H4 in PSS audit)

### P2 — Integration Work

9. **Build `apply-agent-toml` utility** (script or API endpoint) that reads `.agent.toml` and applies the configuration to an agent session (F2)
10. **Add `.agent.toml` reading** to AMCOS — parse TOML, map to `ConfigOperationType` operations (E2-1)
11. **Add PSS instructions to Haephestos persona** — teach it to invoke `/pss-setup-agent` (E3-4)
12. **Build TOML → json:config converter** for Haephestos UI integration (E3-3)
13. **Add COS authorization check** to AMCOS startup (E1-3)
14. **Implement plugin auto-loading** for COS role assignment (E1-2)

### P3 — Polish

15. Verify PSS hook fires in `bypassPermissions` mode (E3-2)
16. Add automated tests for cross-plugin messaging patterns
17. Document the full ensemble workflow with setup instructions
18. Add migration guide from v1 emasoft plugins to v2 ai-maestro plugins

---

### Note on Plugin Version Requirements

The Claude Code plugin specification has no mechanism for plugins to declare platform version requirements. Any version references in plugin README files or documentation are informational only and cannot cause validation failures. Plugins cannot enforce minimum AI Maestro versions.

---

## Summary

| Scenario | Verdict | Blockers |
|----------|---------|----------|
| 1. Manager creates team + assigns COS | NOT FUNCTIONAL | API missing, no plugin auto-loading |
| 2. COS uses PSS to configure agents | NOT FUNCTIONAL | No TOML reading/applying, no integration |
| 3. Haephestos uses PSS during creation | PARTIALLY FEASIBLE | Persona update + converter needed |
| 4. Manager loads AMAMA plugin | PARTIALLY FUNCTIONAL | Hook bugs, commands not registered |
| 5. Full ensemble | NOT FUNCTIONAL | All of the above |

**Overall Assessment**: The 3 plugins are individually well-designed with clear separation of concerns and comprehensive governance models. However, the integration layer between them is entirely missing. The `.agent.toml` system is the intended bridge but it's currently write-only (PSS writes, nobody reads). The most critical blocker is the AI Maestro API gap — ~10 endpoints must be implemented before any governance operations can execute. Secondary is the naming contamination in AMCOS and marketplace setup. Scenario 3 (Haephestos + PSS) is the most achievable near-term integration point, requiring only a persona update and a TOML→config converter.
