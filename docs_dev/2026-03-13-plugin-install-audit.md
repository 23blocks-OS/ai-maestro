# Plugin Installation Audit — 2026-03-13

## 1. `agent-plugin.sh` — How `cmd_plugin_install` Works

**File:** `plugin/plugins/ai-maestro/scripts/agent-plugin.sh`

**Entry point:** `cmd_plugin_install()` (line 96)

**Key parameters:**
- `agent` — resolved to `RESOLVED_AGENT_ID` via `resolve_agent`
- `plugin` — format: `plugin-name` or `plugin-name@marketplace-name`
- `scope` — default `local`; accepts `user`, `project`, `local`
- `--no-restart` — skip agent restart after install

**Install flow (lines 155–234):**

1. **Governance check** (line 161): `check_config_governance "$scope" "$RESOLVED_AGENT_ID"` — verifies caller permission for the requested scope.
2. **Working dir lookup** (line 164): `get_agent_working_dir "$RESOLVED_AGENT_ID"` — retrieves agent's project directory from registry.
3. **Core install command** (line 178):
   ```
   run_claude_command "$agent_dir" plugin install "$plugin" --scope "$scope"
   ```
   This `cd`s into the agent's working directory and runs:
   ```
   claude plugin install <plugin> --scope <scope>
   ```
   (`run_claude_command` is defined in `agent-core.sh` line 297; line 316 runs:
   `cd "$work_dir" && unset CLAUDECODE && claude "${cmd_args[@]}"`)

4. **Post-install security scan** (lines 184–201): Scans `~/.claude/skills/<plugin>`, `$agent_dir/.claude/skills/<plugin>`, `~/.claude/plugins/<plugin>` for SKILL.md files; runs `scan_skill_security`. If it fails, immediately uninstalls.
5. **Restart** (lines 206–215): If `no_restart=false`, calls `restart_agent "$RESOLVED_AGENT_ID" 3` for remote agents, or prints manual instructions if the current session is the target.

**Scope → filesystem mapping** (from uninstall/clean code):
- `local` → `$agent_dir/.claude/plugins/`
- `project` → `$agent_dir/.claude/plugins/`
- `user` → `~/.claude/plugins/cache/` + `~/.claude/plugins/installed_plugins.json`

**Marketplace subcommand** (`cmd_plugin_marketplace`, line 995):
- `add`: line 1134: `run_claude_command "$agent_dir" plugin marketplace add "$source"`
- `list`: line 1196: `cd "$agent_dir" && claude plugin marketplace list`
- `remove`: line 1245: `cd "$agent_dir" && claude plugin marketplace remove "$name"` (with force fallback)
- `update`: line 1370: `cd "$agent_dir" && claude plugin marketplace update [name]`

---

## 2. `SKILL.md` — How Plugin Installation Is Documented

**File:** `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`

**Plugin section** (around line 562):
```
aimaestro-agent.sh plugin install <agent> <plugin> [-s|--scope user|project|local] [--no-restart]
```
Documents three scopes: `user` (global), `project` (shared/committed), `local` (default, gitignored).

**Role-Plugin toggle pattern** (lines ~308–315):
- Toggle ON: installs with `--scope local` via API, then adds `--agent <plugin-name>-main-agent` to launch args.
- Toggle OFF: uninstalls (`--scope local`) via API, removes `--agent` from launch args.

**`--agent` flag documentation** (section 3b, line 243):
- `--agent <name>` is **optional** — without it, session starts as standard Claude.
- Format convention: every Role-Plugin must define an agent named `<plugin-name>-main-agent`.
- CLI workflow (lines 268–275):
  1. `aimaestro-agent.sh plugin install my-agent role-plugin --scope local`
  2. `aimaestro-agent.sh create my-agent --dir /path -- --agent my-agent-main-agent`

**Haephestos exception** (line 279): Only agent using `~/.claude/agents/` standalone file instead of a plugin. Auto-installed by `ensure-persona` API endpoint.

---

## 3. `marketplace-service.ts` — What It Does

**File:** `services/marketplace-service.ts` (99 lines total)

This service is **read-only** — it only lists/fetches marketplace skills for the UI. It does NOT install plugins.

- `listMarketplaceSkills(params)` (line 34): Calls `hasClaudePlugins()` to check if `~/.claude/plugins/` exists, then `getAllMarketplaceSkills(params)` from `lib/marketplace-skills`. Returns skill list with marketplace/plugin/stats breakdown.
- `getMarketplaceSkillById(rawId)` (line 69): Validates `marketplace:plugin:skill` ID format, calls `getSkillById(skillId, true)` from `lib/marketplace-skills`.

**No installation logic here.** The marketplace service is purely a discovery/catalog layer for the UI.

---

## 4. `agents-skills-service.ts` — How Plugin/Skill Operations Work

**File:** `services/agents-skills-service.ts`

This service manages **skills** assigned to agents (not plugins directly). It distinguishes three skill types: marketplace skills, custom skills, AI Maestro skills.

**Governance check** (lines 39–73): `checkConfigGovernance(agentId, requestingAgentId, operation, scope)`:
- `requestingAgentId === null` → no enforcement (Phase 1 backward compat, line 46)
- `user`/`project` scope → MANAGER only (lines 49–53)
- `local` scope → MANAGER always allowed; COS allowed only for agents in their team (lines 57–72)

**`updateSkills`** (line 91): Handles bulk add/remove of marketplace skills + AI Maestro config:
- Line 122: `getSkillById(skillId, false)` — validates skill exists in marketplace catalog
- Line 135: `addMarketplaceSkills(agentId, skillsToAdd)` — writes to agent registry
- Line 143: `removeMarketplaceSkills(agentId, body.remove)` — removes from registry
- Line 151: `updateAiMaestroSkills(agentId, body.aiMaestro)` — updates AI Maestro config

**`addSkill`** (line 167): Adds a custom (non-marketplace) skill with content directly:
- Line 199: `addCustomSkill(agentId, { name, content, description })`

**`removeSkill`** (line 219): Auto-detects skill type by presence of `:` in skillId (line 234):
- Marketplace skill → `removeMarketplaceSkills`
- Custom skill → `removeCustomSkill`

**Note:** This service writes to the **agent registry** (`lib/agent-registry.ts`), not to the filesystem plugin directories. It tracks which marketplace skills an agent "has" in its registry metadata, separate from actual `claude plugin install` calls made by `agent-plugin.sh`.

---

## 5. `agent-session.sh` — How Sessions Are Created (Does It Pass `--agent`?)

**File:** `plugin/plugins/ai-maestro/scripts/agent-session.sh`

The `cmd_session_add()` function (line 46) does **NOT** create a tmux session or launch Claude directly. It calls:
```
POST ${api_base}/api/agents/${RESOLVED_AGENT_ID}/session
```
with a JSON payload `{role: "$role"}` (line 72). The actual tmux session creation is handled server-side.

The `--agent` flag is **not passed in `agent-session.sh`**. Session creation is API-delegated.

**Server-side session creation** is in `services/sessions-service.ts`:
- `createSession()` (line 535) accepts `programArgs?: string` in the params.
- Line 665–668: `programArgs` is sanitized and appended to the start command:
  ```
  startCommand = `${startCommand} ${sanitized}`
  ```
- Line 676: `runtime.sendKeys(actualSessionName, startCommand, { enter: true })` — sends the full command (e.g. `claude --agent my-agent-main-agent`) to the tmux session.

So `--agent` is passed via the `programArgs` field when the session is created through the API (either from the UI or from `aimaestro-agent.sh create --args "--agent <name>"`). The shell script `agent-session.sh` does not handle this directly.

**Haephestos special case** (`services/creation-helper-service.ts` line 461–463):
Hard-codes `--agent haephestos-creation-helper` in `launchCmd` array when spawning the creation helper session.

---

## Summary Table

| Component | Role | Where plugin install happens |
|-----------|------|------------------------------|
| `agent-plugin.sh:cmd_plugin_install` (line 178) | CLI entry point | `run_claude_command "$agent_dir" plugin install "$plugin" --scope "$scope"` → `claude plugin install` |
| `agent-core.sh:run_claude_command` (line 316) | Actual claude invocation | `cd "$work_dir" && unset CLAUDECODE && claude plugin install ...` |
| `marketplace-service.ts` | Skill catalog (read-only) | No installation — only lists available skills |
| `agents-skills-service.ts` | Registry-level skill tracking | `addMarketplaceSkills` / `addCustomSkill` write to registry, not filesystem plugins |
| `agent-session.sh:cmd_session_add` (line 71) | Session API wrapper | Delegates to `POST /api/agents/{id}/session`, no `--agent` handling |
| `sessions-service.ts:createSession` (line 665) | Server-side session spawn | Appends `programArgs` (including `--agent`) to `startCommand`, sends via tmux `send-keys` |
