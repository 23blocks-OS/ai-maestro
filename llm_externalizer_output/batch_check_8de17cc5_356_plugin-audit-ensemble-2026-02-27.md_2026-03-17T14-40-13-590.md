# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:13.591Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-ensemble-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown /Users/emanuelesabetta/ai-maestro/docs_dev/plugin-audit-ensemble-2026-02-27.md
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
| E3-1 | **Haephestos runs in an isolated tmux session** | HIGH | The creation-helper-service.ts creates a tmux session with `claude --agent haephestos-creation-helper`. This session does NOT have PSS loaded as a plugin. Haephestos cannot invoke `/pss-setup-agent` because the P