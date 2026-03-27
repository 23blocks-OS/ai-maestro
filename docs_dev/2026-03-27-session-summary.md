# Session Summary — 2026-03-26/27

## Branch: feature/team-governance (Emasoft/ai-maestro fork)

---

## COMPLETED — Plugin Ecosystem (9 repos)

### CPV Validation
- All 9 repos: 82 MAJOR → 0, 215 MINOR → 0
- All SKILL.md restructured: 7 required sections, scoped Bash, TOC embedding, <4000 chars
- Skills split where needed (COS +27, orchestrator +4)
- Strict quality gate (exit 3 blocks MINOR) deployed to all 9 repos
- All repos version-bumped, tagged, pushed, CI green

### Final Versions
| Repo | Version |
|------|---------|
| ai-maestro-plugin | v2.1.4 |
| programmer-agent | v1.0.22 |
| orchestrator-agent | v1.6.6 |
| integrator-agent | v1.2.6 |
| architect-agent | v2.4.1 |
| chief-of-staff | v2.12.5 |
| assistant-manager | v2.6.4 |
| claude-plugin (fork) | v0.1.4 |
| agent-identity (fork) | v0.1.1 |

### CI Infrastructure
- `MARKETPLACE_DISPATCH_TOKEN` secret set on all 9 repos
- Notify Marketplace workflow fixed → targets Emasoft/ai-maestro-plugins
- Validation workflows re-enabled on all repos
- All latest runs = success

---

## COMPLETED — Main Repo Features

### Role-Plugin Marketplace Migration
- Default 6 role-plugins installed on-demand from ai-maestro-plugins GitHub marketplace
- Local ~/agents/role-plugins/ only for Haephestos custom plugins
- `listRolePlugins()` merges marketplace manifest + local sources
- `syncDefaultRolePlugins()` registers marketplace (no auto-install)
- `installPluginLocally()` uses `claude plugin install --scope local` for marketplace
- Files: `services/role-plugin-service.ts`, 6 API routes

### Governance Title → Role-Plugin Auto-Assignment
- MANAGER → ai-maestro-assistant-manager-agent (auto-installed, locked)
- CHIEF-OF-STAFF → ai-maestro-chief-of-staff (auto-installed, locked)
- MEMBER → any role-plugin (user choice)
- Auto-install triggers in: manager route, COS route, governance-service, teams-service
- New API: `GET /api/agents/role-plugins/required?title=<title>`
- MANAGER/COS = Claude-only enforcement (non-Claude rejected)

### Auto-COS Chain on Closed Team Creation
- `POST /api/teams` with `type=closed + chiefOfStaffId` → auto-installs COS plugin
- Returns `needsChiefOfStaff: true` when no COS provided

### Multi-Client Support
- `lib/client-capabilities.ts`: ClientType detection for Claude, Codex, Gemini, Aider
- AgentProfilePanel filters config tabs per client capabilities
- Skills Explorer with agent selector + client-type-aware install + duplicate detection
- Cross-client skill installer (`services/cross-client-skill-service.ts`)
  - Downloads from GitHub, copies to .codex/skills/, .gemini/skills/, skills/ (aider)
  - Auto-installs `aider-skills` package in project venv via `uv pip install`
  - Auto-initializes AMP identity (`aid-init.sh --auto`) for all non-Claude agents
  - Skips already-installed skills (duplicate prevention)

### UI Features
- New Session / Resume Session buttons before CLI args field
- Sends keystrokes via `POST /api/sessions/{id}/command`
- Disabled when client already running
- RoleTab dropdown locked when title mandates specific plugin
- "custom" badge for local Haephestos plugins

### Security Fixes (Fork Audit)
- `deleteTeamById` requires governance password (USER-only)
- Task assignee verification: only assignee, COS, or MANAGER can update status
- `handleSwitchPlugin` + `handleSwitch`: title-lock guards at function level
- Explicit `scope: 'local'` in all role-plugin install calls
- Cross-client installer: skip already-installed skills

### Installer Updates
- Client detection: checks for claude/codex/gemini at startup
- Plugin install conditional on Claude being present
- External dependency plugins: CPV, PSS, CAA, LLM-ext, serena, agentika
- Non-Claude systems skip plugin installation entirely

### Documentation Updates
- CLAUDE.md: Role-Plugin Marketplace Architecture section
- README.md: governance corrections (MANAGER/COS restrictions, USER-only ops)
- README.md: Plugin Ecosystem section
- governance-design-rules.md: R3.4 fixed (COS = 1 team only)
- Memory files updated

### Governance Screening (LLM Externalizer)
- 6 governance reports saved (all role-plugin repos screened)
- 4 CPV compliance reports saved
- 2 kanban audit reports (COS + orchestrator)
- Fork audit spec + safety spec created

### Role Boundary Decision (RESOLVED)
- Orchestrator: creates tasks, assigns agents to tasks, tracks progress
- COS: creates/deletes agents, manages team roster, installs role-plugins
- Orchestrator requests COS to create agents when needed

---

## COMPLETED — Upstream PR Preparation

### Fork Branches (NOT opened as PRs yet)
- `Emasoft/ai-maestro-plugins` → `feat/manifest-only-marketplace` (9 plugins in manifest)
- `Emasoft/claude-plugin` → `feat/add-marketplace-workflows` (CPV + validation)
- `Emasoft/agent-identity` → `feat/add-marketplace-workflows` (CPV + validation)

---

## PENDING — Next Session

### High Priority
1. **Full governance compliance audit** of all 6 role-plugin skill files
   - Spec: `docs_dev/2026-03-26-governance-compliance-audit-spec.md`
   - Use `check_against_specs` with `governance_rules_v2.md`
   - Fix violations in agent .md files and skill .md files

2. **COS role-plugin fixes** (3 HIGHs from kanban audit):
   - Agent creation examples: add `--program <client>` flag
   - Quick reference: add GovernanceRequest requirement
   - Non-Claude agent handling in plugin configurator

3. **Orchestrator role-plugin**: document how it requests COS for new agents

4. **MANAGER governance violations** in orchestrator + integrator agent files
   - Messaging boundary issues flagged in screening reports
   - `docs_dev/gov-screen-orchestrator.md` + `gov-screen-integrator.md`

### Medium Priority
5. **Agent creation wizard audit** — verify reflects new plugin install flow
6. **`--dangerously-skip-permissions`** default for Claude agents in programArgs
7. **Architect minor governance overclaim** (1 issue from screening)
8. **Clean up stale worktree branch refs** (task #264)

### Low Priority
9. **Open upstream PRs** — 3 fork branches ready, user will approve timing
10. **Main repo PR** — squash commits, user will approve
11. **Mixed-client governance spec** — deeper design for Codex subagent governance

### Specs Ready for Next Session
- `docs_dev/2026-03-26-governance-compliance-audit-spec.md` — full audit procedure
- `docs_dev/cpv-compliance-spec.md` — CPV rules for check_against_specs
- `docs_dev/fork-audit-spec.md` — safety rules for fork audit
- `docs_dev/2026-03-27-kanban-agent-identity-loop-spec.md` — kanban→identity flow
- `docs_dev/2026-03-27-mixed-client-governance-spec.md` — multi-client teams
- `docs_dev/2026-03-26-cross-client-skill-install-spec.md` — skill install per client
- `docs_dev/2026-03-26-multi-client-profile-panel-spec.md` — UI per client
