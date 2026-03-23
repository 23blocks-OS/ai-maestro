# Consolidated Audit Findings — 2026-03-13

Summarized from:
1. `2026-03-13-cross-platform-input-sanitization-audit.md`
2. `2026-03-13-role-plugin-governance-audit.md`
3. `2026-03-13-agent-profile-panel-ux-audit.md`

Excludes already-fixed findings: quad-match rule, title/role distinction, path.resolve validation.

---

## CRITICAL — Must Fix Before PR

### FILE: `services/agent-local-config-service.ts`

**[IS-1] Path traversal via `pluginName` from untrusted `plugin.json`**
- Line ~257: `pluginName` read from `plugin.json` (`m.name`) is used directly in `path.join(pluginPath, \`${pluginName}.agent.toml\`)` and `path.join(pluginPath, 'agents', \`${mainAgentName}.md\`)`, both of which call `fs.readFileSync`.
- A malicious `plugin.json` with `name: "../../etc/passwd"` enables arbitrary file reads.
- Fix: `pluginName = path.basename(m.name)` — strip all path components before use.

**[CP-3] Tilde (`~`) in plugin paths resolves to wrong directory**
- Lines ~314-318: `path.isAbsolute('~/foo')` returns `false`, so tilde paths are resolved relative to the project dir, producing bogus paths like `/project/~/foo`.
- Fix: Before the `isAbsolute` check, expand `~/` to `os.homedir()`.

---

### FILES: External Role-Plugin Repos (all 6 Emasoft repos)

**[RP-1] Missing `.agent.toml` in ALL 6 repos**
- 0/6 repos have a `.agent.toml` file at the plugin root. The `scanPlugins` logic in `services/agent-local-config-service.ts` looks for `<pluginName>.agent.toml` — none will be found.
- Repos affected: `ai-maestro-chief-of-staff`, `ai-maestro-architect-agent`, `ai-maestro-orchestrator-agent`, `ai-maestro-integrator-agent`, `ai-maestro-programmer-agent`, `code-auditor-agent`.
- Fix: Create `<plugin-name>.agent.toml` at root of each repo with `[agent].name` matching `plugin.json` `name`.

**[RP-2] Main-agent filename/name mismatch with plugin name (5/6 repos)**
- All 5 non-auditor repos use abbreviated prefixes (`amcos-`, `amaa-`, `amoa-`, `amia-`, `ampa-`) instead of the full plugin name. Governance and spawn logic expects `<plugin-name>-main-agent`.
- Fix: Rename agent files to `<plugin-name>-main-agent.md` and update frontmatter `name` to match.

**[RP-3] `code-auditor-agent` has no main-agent file at all**
- The repo has 11 specialized sub-agents but no `*-main-agent.md`. This breaks any `--agent` invocation.
- Fix: Create `code-auditor-agent-main-agent.md` with appropriate frontmatter.

**[RP-4] CoS spawning skill references wrong agent names**
- `skills/amcos-agent-spawning/SKILL.md` references `eoa-orchestrator-main-agent`, `eaa-architect-main-agent`, `eia-integrator-main-agent`, `epa-programmer-main-agent` — but the actual names are `amoa-`, `amaa-`, `amia-`, `ampa-`. All `--agent` spawns from CoS will fail.
- Fix: Update `amcos-agent-spawning/SKILL.md` to use the actual `am*` prefixes (or the new canonical names after RP-2 is resolved).

---

### FILE: `components/AgentProfilePanel.tsx`

**[UX-6] Role tab has no action when no Role-Plugin is assigned**
- Lines 241-247: empty state is passive text + icon only. No `[Assign Role-Plugin]` button exists.
- Fix: Add a dropdown button with available role-plugins + "Create new Role-Plugin + Persona with Haephestos" option. This is the entry point for the most common user workflow.

**[UX-7] Settings tab missing critical agent fields**
- Currently shows only `workingDirectory`, `lastScanned`, and raw settings JSON. Missing: agent Name, Title (manager/chief-of-staff/member), Program, Model, Program Args, Tags, Role-Plugin toggle.
- `AgentConfigPanel` already has these as structured `InfoRow` components (lines 218-224). The same pattern must be applied here.
- Fix: Restructure Settings tab into: Identity section (Name, Title, Working Dir), Runtime section (Program, Model, Args), Tags section, Role-Plugin toggle, and a collapsible Advanced section for raw settings.

---

## IMPORTANT — Should Fix

### FILE: `services/agent-local-config-service.ts`

**[IS-5] Plugin paths from `settings.json` reach `fs.readFileSync` without scope validation**
- Lines ~296-301: absolute plugin paths from settings JSON are used as-is, allowing a corrupted/malicious `settings.json` to point plugin paths at `/etc/` or `~/.ssh/`.
- Fix: After resolving, check `resolved.startsWith(path.resolve(workDir)) || resolved.startsWith(os.homedir())`. Skip and warn if outside scope.

**[CP-1] `workDir` not normalized before `path.join`**
- Line ~46: `workDir` from the agent registry may contain forward slashes on Windows in a mixed-separator context.
- Fix: Apply `path.resolve(workDir)` early, before any `path.join`.

### FILES: External Role-Plugin Repos (4 repos)

**[RP-5] Stale `ROLE_BOUNDARIES.md` in 4 repos (architect, orchestrator, integrator, programmer)**
- These repos still use the pre-v0.26.0 model: "AMAMA" instead of "EAMA", "project-independent (one per org)" instead of "team-scoped (one per team)", no mention of governance titles.
- Agents operating under these docs will use incorrect assumptions about team scope and manager identity.
- Fix: Replace `docs/ROLE_BOUNDARIES.md` in all 4 repos with content matching the CoS version (updated governance model, EAMA naming, team-scoped CoS, governance titles: manager/chief-of-staff/member).

**[RP-6] API abstraction violations in 4 repos (curl commands and endpoint URLs in skills)**
- Most severe: `ai-maestro-chief-of-staff/skills/amcos-transfer-management/references/transfer-procedures-and-examples.md` — contains 6+ raw `curl` commands with full API URLs, headers, and JSON payloads.
- Other violations: CoS skills embed `POST /api/v1/governance/requests`, `GET /api/teams`, `DELETE /api/agents/{id}`, `GET /api/teams/{id}/agents`, `POST /api/teams/{id}/agents`. Orchestrator embeds `http://localhost:23000`. Programmer embeds `curl -s "http://localhost:23000/api/health"`.
- Fix: Remove all curl commands and endpoint URLs. Replace with references to global scripts (`aimaestro-agent.sh`, governance wrapper scripts) per the Plugin Abstraction Principle.

### FILE: `components/AgentProfilePanel.tsx`

**[UX-1] No "Add" / "Create new..." affordance on any tab**
- All 7 list tabs (Plugins, Skills, Agents, Hooks, Rules, Commands, MCPs) show read-only lists. Empty states show passive text with no call-to-action.
- Fix: Add `[+ Add]` button at top of each list tab. Empty states must become `[+ Add First X]` buttons. Add functionality must use dropdowns of known options — not free-text fields.

**[UX-3] No helper text or explanatory guidance anywhere**
- Zero tooltips, zero explanatory text, zero empty-state guidance in the entire component.
- Fix: Add panel-level subtitle ("Live configuration from .claude/ folder"), tab tooltips, Role tab explanation ("Role-Plugins define this agent's persona..."), and actionable empty states for all tabs.

**[UX-8] No install/uninstall/remove actions wired up**
- The design spec defines `POST /api/agents/{id}/local-config/install` and `POST /api/agents/{id}/local-config/uninstall` endpoints. The component has no integration with these and no Remove buttons on any list item.
- Fix: Add remove buttons to list items and wire install/uninstall to the API endpoints. Add mutation callbacks to component props.

---

## NICE-TO-HAVE — Can Defer

### FILE: `services/agent-local-config-service.ts`

**[IS-2] Agent ID not URL-encoded in client fetch**
- `hooks/useAgentLocalConfig.ts` line 21: `fetch(\`/api/agents/${agentId}/local-config\`)` — `agentId` not wrapped in `encodeURIComponent()`. Currently safe (UUID format), but defense-in-depth gap.
- Fix: `fetch(\`/api/agents/${encodeURIComponent(agentId)}/local-config\`)`.

**[IS-3] Unescaped regex interpolation in `extractFrontmatterField`**
- Line ~386: `new RegExp(\`^\\\\s*${field}:...\`)` — `field` is always a hardcoded literal today but is a latent ReDoS risk.
- Fix: Escape `field` with `field.replace(/[.*+?^${}()|[\]\\\\]/g, '\\\\$&')` before interpolation.

**[IS-4] Unescaped regex interpolation in `parseTOMLArray`**
- Line ~326: same pattern as IS-3 with `key` parameter.
- Fix: Same escaping approach.

**[CP-2] Windows backslash separators in plugin paths from settings JSON**
- A `settings.json` authored on Windows with backslash paths would not resolve correctly on macOS/Linux.
- Fix: Normalize before resolving — `plugin.path.replace(/\\\\/g, path.sep)`.

### FILE: `components/AgentProfilePanel.tsx`

**[UX-4] Count badges show nothing for 0 items (ambiguous: empty vs. unscanned)**
- Fix: Show a "0" badge always so users know the tab has been scanned and found empty.

**[UX-5-MCP] MCP tab missing connection status**
- The design spec requires showing connection status per MCP server.
- Fix: Requires backend support; add a status indicator once the backend exposes it.

**[UX-2] `[Edit in Haephestos]` button has no tooltip explaining implications**
- Fix: Add tooltip: "Opens Haephestos to edit this Persona's Role-Plugin. Changes apply to all Personas using this Role-Plugin."

**[UX-9] LSP servers tucked into Settings tab (inconsistent with tab-per-type pattern)**
- Fix: Either give LSP servers their own tab or document this as intentional for small counts.

### External Role-Plugin Repos

**[RP-7] `code-auditor-agent` repo name breaks `ai-maestro-*` naming convention**
- 5/6 repos use `ai-maestro-*`. `code-auditor-agent` does not.
- Fix (low priority): Rename repo to `ai-maestro-code-auditor-agent` for consistency.

---

## Files Grouped by Change Required

| File | Findings |
|------|----------|
| `services/agent-local-config-service.ts` | IS-1 (CRITICAL), CP-3 (CRITICAL), IS-5 (IMPORTANT), CP-1 (IMPORTANT), IS-2 (NICE), IS-3 (NICE), IS-4 (NICE), CP-2 (NICE) |
| `components/AgentProfilePanel.tsx` | UX-6 (CRITICAL), UX-7 (CRITICAL), UX-1 (IMPORTANT), UX-3 (IMPORTANT), UX-8 (IMPORTANT), UX-4 (NICE), UX-5-MCP (NICE), UX-2 (NICE), UX-9 (NICE) |
| `hooks/useAgentLocalConfig.ts` | IS-2 (NICE) |
| **External repo:** `ai-maestro-chief-of-staff` | RP-1 (CRITICAL), RP-2 (CRITICAL), RP-4 (CRITICAL), RP-6 (IMPORTANT) |
| **External repo:** `ai-maestro-architect-agent` | RP-1 (CRITICAL), RP-2 (CRITICAL), RP-5 (IMPORTANT) |
| **External repo:** `ai-maestro-orchestrator-agent` | RP-1 (CRITICAL), RP-2 (CRITICAL), RP-5 (IMPORTANT), RP-6 (IMPORTANT) |
| **External repo:** `ai-maestro-integrator-agent` | RP-1 (CRITICAL), RP-2 (CRITICAL), RP-5 (IMPORTANT), RP-6 (IMPORTANT) |
| **External repo:** `ai-maestro-programmer-agent` | RP-1 (CRITICAL), RP-2 (CRITICAL), RP-5 (IMPORTANT), RP-6 (IMPORTANT) |
| **External repo:** `code-auditor-agent` | RP-1 (CRITICAL), RP-3 (CRITICAL), RP-7 (NICE) |
