# Plugin Handling Tasks — Pre-Compaction Notes

**Date:** 2026-03-20
**Context:** The user updated CPV (claude-plugins-validation) and PSS (perfect-skill-suggester) plugins with new commands for plugin management. This document captures all planned changes.

## What Changed Externally

### PSS Plugin (perfect-skill-suggester) v2.7.0
- Now generates **complete Claude Code plugins** from `.agent.toml` profiles (not just the TOML)
- Use `/pss-make-plugin-from-profile` to generate a full plugin directory
- The generated plugin is a standard Claude Code plugin but MISSING 3 AI Maestro-specific files:
  1. **Quadruple equality**: `plugin.json` name == plugin dir name == `[agent].name` in TOML == main-agent filename
  2. **Main agent `.md`**: `agents/<plugin-name>-main-agent.md` with frontmatter `name: <plugin-name>-main-agent`
  3. **The `.agent.toml`** file at plugin root: `<plugin-name>.agent.toml`

### CPV Plugin (claude-plugins-validation) v1.11.7+
- Updated commands for plugin lifecycle:
  - `/cpv-install-plugin-from-local-mp` — Install from local marketplace
  - `/cpv-uninstall-plugin-from-local-mp` — Uninstall from local marketplace
  - `/cpv-enable-plugin` — Enable a disabled plugin (smart name resolution + scope control)
  - `/cpv-disable-plugin` — Disable without removing
  - `/cpv-manage-remote-plugins` — Install/update/uninstall/enable/disable from GitHub marketplaces
  - `/cpv-doctor` — Health-check with `--fix`
  - `/cpv-validate-plugin` — Full 32-check validation

## Task 1: Haephestos Plugin Generation Flow

**Current flow (broken):**
1. Haephestos runs PSS agent profiler → generates `.agent.toml`
2. Haephestos calls `POST /api/agents/create-persona` with TOML content
3. `role-plugin-service.ts` `generatePluginFromToml()` creates a minimal plugin:
   - `plugin.json`
   - `agents/<name>-main-agent.md` (persona markdown)
   - `<name>.agent.toml`
   - That's it — no skills, commands, hooks, agents, rules, MCP, LSP

**New flow (to implement):**
1. Haephestos runs PSS agent profiler → generates `.agent.toml`
2. Haephestos runs PSS plugin generator → generates full plugin from the TOML
   - Command: `/pss-make-plugin-from-profile`
   - Output: full plugin directory with skills, commands, hooks, agents, rules, etc.
3. **AI Maestro adds the 3 missing files:**
   - Ensure `plugin.json` name matches plugin dir name (quadruple equality #1)
   - Create `<plugin-name>.agent.toml` at plugin root (quadruple equality #2 + #3)
   - Create `agents/<plugin-name>-main-agent.md` with frontmatter (quadruple equality #4)
4. If CPV is installed, run `/cpv-validate-plugin` on the generated plugin
5. Install the plugin locally via the existing `installPluginLocally()` flow

**Files to modify:**
- `agents/haephestos-creation-helper.md` — Update Step 4 to use PSS plugin generator, Step 5 to add the 3 files
- `services/role-plugin-service.ts` — Update `generatePluginFromToml()` to accept a pre-generated plugin dir instead of creating from scratch, and just add the 3 missing files
- `app/api/agents/create-persona/route.ts` — May need a new parameter for PSS-generated plugin path

## Task 2: Global Plugin Management in Settings

**Current state:**
- Settings → Global Elements shows plugins grouped by marketplace with enable/disable toggles
- Toggles write to `~/.claude/settings.json` `enabledPlugins`
- No element listing (skills, agents, etc.) from enabled plugins

**To implement:**
- Show elements from ENABLED plugins only (skills, sub-agents, hooks, commands, rules, MCP, LSP)
- Each element shows which plugin it belongs to
- Elements are read-only (can't remove individual elements, only enable/disable entire plugins)
- Plugin install/uninstall buttons per marketplace
- Learn from CPV's approach:
  - `cpv-enable-plugin` uses smart name resolution (partial names, marketplace suffix)
  - `cpv-disable-plugin` preserves the plugin but removes from enabled list
  - `cpv-manage-remote-plugins` handles GitHub marketplace install/update/uninstall

**API needed:**
- `GET /api/settings/global-elements` — List all elements from enabled user-scope plugins
  - Scan `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` for each enabled plugin
  - Return: `{ skills: [...], agents: [...], commands: [...], hooks: [...], rules: [...], mcpServers: [...], lspServers: [...] }`
  - Each element includes `{ name, path, sourcePlugin, sourceMarketplace }`

**Files to create/modify:**
- `app/api/settings/global-elements/route.ts` — New API endpoint
- `components/settings/GlobalElementsSection.tsx` — Add element listing below plugin toggles

## Task 3: Agent Profile — Local Plugin Management

**Current state:**
- Agent Profile Overview tab shows local elements (sub-agents, rules, commands, hooks, MCP, LSP)
- Elements from role-plugin shown in green, extras in gray
- No way to enable/disable local plugins from the profile

**To implement:**
- Add a "Plugins" section to the Overview tab (collapsible)
- Show locally installed plugins with enable/disable toggles
- Only show elements from ENABLED local plugins
- This mirrors the global settings behavior but at project scope
- Enable/disable writes to `<agentDir>/.claude/settings.local.json` `enabledPlugins`

**API needed:**
- `POST /api/agents/[id]/local-plugins` — Toggle a local plugin's enabled state
  - Reads/writes `<workDir>/.claude/settings.local.json`

**Files to modify:**
- `components/AgentProfile.tsx` — Add Plugins section, filter elements by enabled plugins
- `app/api/agents/[id]/local-plugins/route.ts` — New API endpoint
- `services/agent-local-config-service.ts` — Add `enabledPlugins` to the scanned config

## Task 4: Cross-Host Plugin Operations

**Principle:** AI Maestro's API must handle plugin operations even if CPV is not installed on the target host. CPV is optional validation, not required infrastructure.

**Operations that must work cross-host:**
- Install a role-plugin on a remote agent
- Uninstall a role-plugin from a remote agent
- Enable/disable a plugin on a remote agent
- List plugins on a remote host

**Implementation approach:**
- AI Maestro API handles the file operations directly (settings.json manipulation, plugin cache management)
- If CPV is installed on the target host, optionally run validation
- The existing `installPluginLocally()` / `uninstallPluginLocally()` already work via API forwarding

**No new files needed** — existing cross-host API forwarding in `agents-core-service.ts` handles this.

## Task 5: Session Preservation During Plugin Operations

**Already done in this PR:**
- `restart_agent()` in CLI script now uses graceful `/exit` + re-launch (not hibernate+wake)
- `handleSwitchPlugin` in AgentProfilePanel sends `/exit` + re-launch via tmux send-keys
- SKILL.md has "Session & Data Preservation Rules" section
- `deleteSession()` changed to soft-delete

**Verify these work correctly with the new plugin flows.**

## Task 6: TOML Schema Compliance

**Current TOML schema (9 sections):**
```
[agent]         — identity
[skills]        — primary, secondary, specialized
[rules]         — recommended
[agents]        — recommended
[commands]      — recommended
[hooks]         — recommended
[mcp]           — recommended
[lsp]           — recommended
[dependencies]  — LAST: plugins, skills, rules, agents, commands, hooks, mcp_servers, lsp_servers, tools, frameworks
```

**PSS profiler generates this format.** Haephestos must:
1. NOT strip any sections (only strip `[requirements]` and `[skills.excluded]`)
2. Write the TOML only ONCE to the preview directory (no intermediate writes)
3. Validate all 9 sections present before writing

**Already done in this PR — verify PSS v2.7.0 generates matching format.**

## Task 7: Terminology Consistency

**Already done in this PR:**
- Title = governance level (MANAGER, CHIEF-OF-STAFF, MEMBER) — ALL CAPS
- Role = role-plugin specialization (kebab-case) — e.g. `architect-agent`
- Persona Name = agent's display name (Capitalized) — e.g. `Peter-Parker`
- Agent ID = internal technical identifier (kebab-case) — e.g. `backend-tester-tommy`

**Components renamed:**
- `RoleBadge` → `TitleBadge` (file + component + props)
- `RoleAssignmentDialog` → `TitleAssignmentDialog` (file + component + props)
- `GovernanceRole` → `GovernanceTitle` (type alias, deprecated alias kept)
- `agentRole` → `agentTitle` in hook + all consumers
- `showRoleDialog` → `showTitleDialog` in AgentProfile + AgentProfileTab
- All UI labels: "Agent Name" → "Agent ID", "Display Label" → "Persona Name"

## Priority Order

1. **Task 2** (Global Elements listing) — User has 5000+ skills, needs filtering NOW
2. **Task 3** (Agent Profile plugin management) — Same filtering at local level
3. **Task 1** (Haephestos PSS integration) — Better plugin generation
4. **Task 4** (Cross-host verification) — Ensure remote operations work
5. **Task 5** (Session preservation verification) — Regression testing
6. **Task 6** (TOML schema verification) — Check PSS v2.7.0 output
7. **Task 7** (Terminology) — Already done, just verify completeness

## Current PR Status (feature/team-governance)

This PR already includes:
- Haephestos animation (in-place video + audio toggle)
- Profile panel consolidation (Overview + Config tabs)
- Role Plugin selector with graceful restart
- Title/Role terminology separation
- Persona Name prominence in UI
- Session preservation for plugin operations
- TOML schema with all 9 sections
- Global Elements settings page (plugin enable/disable)
- Local elements in AgentProfile (green for role-plugin, gray for extras)
- README terminology section

**NOT yet in this PR (separate PR per docs_dev/2026-03-20-persona-first-agent-identity.md):**
- Sidebar grouping by closed teams
- Agent-ID hidden from UI
- Persona Name uniqueness enforcement
- Tag hierarchy removal
