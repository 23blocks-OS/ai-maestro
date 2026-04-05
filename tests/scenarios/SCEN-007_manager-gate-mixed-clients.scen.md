---
number: 7
name: Manager Gate Team Lifecycle (Mixed Clients)
version: "1.0"
description: >
  Tests the MANAGER-gated team lifecycle when a team contains agents from
  DIFFERENT AI clients (Claude Code + Codex). Verifies that: (1) MANAGER is
  a Claude Code agent at host level, (2) team creation with auto-COS produces
  a Claude-native COS, (3) adding a Claude agent installs a Claude-native
  MEMBER plugin, (4) adding a Codex agent installs a Codex-converted MEMBER
  plugin, (5) title changes (MEMBER->ORCHESTRATOR, MEMBER->ARCHITECT) produce
  the correct plugin format per client, (6) removing a Codex agent reverts it
  to AUTONOMOUS and strips the converted plugin, (7) team deletion with
  "Keep Agents" reverts all agents regardless of client type.
  Validates cross-client governance rules and plugin format conversion.
subsystems:
  - governance
  - teams
  - role-plugins
  - agent-registry
  - element-management-service
  - cross-client-conversion
ui_sections:
  - Sidebar -> Agents tab -> Agent list
  - Sidebar -> Teams tab -> Team list
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Config tab -> Role Plugin
  - Title Assignment Dialog (radio cards, password prompt)
  - Governance Password Dialog
  - Team Creation Dialog
  - Agent Creation Wizard (client selection step)
data_produced:
  - 3 test agents (temporary, created and deleted)
  - 1 auto-COS agent (temporary, created by system, deleted)
  - 1 test team (temporary, created and deleted)
  - Plugin settings.local.json modifications (temporary, cleaned up)
  - Agent registry entries (temporary, deleted)
  - Team registry entries (temporary, deleted)
  - Governance state changes (temporary, restored)
required_tools:
  - mcp__chrome-devtools__navigate_page
  - mcp__chrome-devtools__take_snapshot
  - mcp__chrome-devtools__take_screenshot
  - mcp__chrome-devtools__click
  - mcp__chrome-devtools__fill
  - mcp__chrome-devtools__wait_for
prerequisites:
  - AI Maestro server running at http://localhost:23000
  - Governance password set
  - Chrome browser open with DevTools accessible via CDP
  - ai-maestro-plugins marketplace registered
  - No MANAGER currently assigned (or willingness to temporarily reassign)
  - Codex CLI installed and available (for Codex agent creation)
governance_password: "mYkri1-xoxrap-gogtan"
commit: TBD
author: AI Maestro Team
---

# Manager Gate Team Lifecycle (Mixed Clients) Scenario

This scenario is the MIXED CLIENTS variant of SCEN-005. Where SCEN-005 tests
governance with all-Claude agents, this scenario specifically tests governance
when a team contains agents from different AI clients (Claude Code + Codex),
verifying that plugin format conversion works correctly per client type.

**Key difference from SCEN-005:** Two client types coexist in the same team.
Each agent must receive the role-plugin in its native format (Claude-native
for Claude Code agents, Codex-converted for Codex agents). Title changes must
trigger format-appropriate plugin swaps.

---

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/manager-gate-mixed-clients_<timestamp>/`
- **Goal:** Copies of all governance-relevant config files saved
- **Creates:** Backup directory with config copies
- **Modifies:** nothing
- **Verify:** Backup files exist and match originals (hash comparison)
- **Files to backup:**
  - `~/.claude/settings.json`
  - `~/.claude/settings.local.json`
  - `~/.aimaestro/governance.json`
  - `~/.aimaestro/agents/registry.json`
  - `~/.aimaestro/teams/teams.json`
  - `~/.aimaestro/teams/groups.json`

#### S003: Build and verify server
- **Action:** `yarn build && pm2 restart ai-maestro`, wait 4s, check `GET /api/sessions`
- **Goal:** Server running, returns 200
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API returns session list

#### S004: Navigate to dashboard
- **Action:** `navigate_page` to `http://localhost:23000`
- **Goal:** Dashboard loads with sidebar and agent list
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot shows AI Maestro dashboard

#### S005: Take pre-test screenshot (baseline)
- **Action:** `take_screenshot` of full page
- **Goal:** Baseline image for CLEAN-AFTER-YOURSELF verification
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S005-baseline.png`

#### S006: Ensure no MANAGER exists (precondition)
- **Action:** Check `GET /api/governance` for `hasManager: false`. If a MANAGER exists, remove MANAGER title via title dialog (set to AUTONOMOUS with password) before proceeding.
- **Goal:** No MANAGER on the host -- required for Phase 1 tests
- **Creates:** nothing
- **Modifies:** Possibly removes existing MANAGER title (will be restored in cleanup)
- **Verify:** `GET /api/governance` returns `hasManager: false`

---

## Phase 1: Verify No-Manager Blocking

#### S007: Verify governance API shows no MANAGER
- **Action:** Verify `GET /api/governance` returns `hasManager: false` and all teams have `blocked: true`
- **Goal:** Confirm the no-MANAGER state is reflected in API
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response shows `hasManager: false`

#### S008: Navigate to Teams tab in sidebar
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible in sidebar
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active, team list visible (may be empty or show blocked teams)

#### S009: Attempt to create a team via UI
- **Action:** Click the "Create Team" button (or "+" button in teams section)
- **Goal:** Error message appears indicating teams require a MANAGER first
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** UI shows error message containing "MANAGER" requirement text. No team is created. Screenshot shows the error.

---

## Phase 2: Assign MANAGER (Claude Agent)

#### S010: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header to open the Agent Creation Wizard
- **Goal:** Agent creation wizard opens
- **Creates:** nothing (wizard only)
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S011: Select Claude Code as client
- **Action:** Click "Claude Code" option in client selector
- **Goal:** Claude Code selected -- this agent will become the host MANAGER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected

#### S012: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S013: Enter test agent name `scen7-manager`
- **Action:** Type `scen7-manager` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen7-manager`

#### S014: Complete wizard steps (AUTONOMOUS, no team)
- **Action:** Click Next through remaining steps: team selection (skip/no team), title (AUTONOMOUS is default), role-plugin (select "No plugin" for AUTONOMOUS), finish
- **Goal:** Agent created as AUTONOMOUS with no team, client=claude-code
- **Creates:** Agent `scen7-manager` in registry with `client: "claude-code"`
- **Modifies:** Agent registry (new entry)
- **Verify:** New agent appears in sidebar agent list

#### S015: Click on `scen7-manager` in sidebar
- **Action:** Click the agent name in the sidebar
- **Goal:** Profile panel shows the new agent's details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel heading shows `scen7-manager`, title is AUTONOMOUS, client is Claude Code

#### S016: Open Title Assignment Dialog
- **Action:** Click the title badge/button showing "AUTONOMOUS" in the profile panel
- **Goal:** Title Assignment Dialog opens with radio cards
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows available titles. Since agent has no team, only AUTONOMOUS and MANAGER should be shown.

#### S017: Select MANAGER title
- **Action:** Click the MANAGER radio card
- **Goal:** MANAGER selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on MANAGER card, Confirm not disabled

#### S018: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to MANAGER, Claude-native role-plugin installed
- **Creates:** Plugin entry in agent's settings
- **Modifies:** Agent governanceTitle in registry, governance state (hasManager: true), plugin state
- **Verify:** Profile shows MANAGER badge (amber/gold), plugin banner shows `ai-maestro-assistant-manager-agent` (Claude-native format)

#### S019: Verify MANAGER assignment via API
- **Action:** Check `GET /api/governance` returns `hasManager: true` and `managerId` matches `scen7-manager`
- **Goal:** Governance state reflects the new MANAGER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response confirms MANAGER exists with correct ID

#### S020: Verify MANAGER plugin is Claude-native format
- **Action:** Check `GET /api/agents/<managerId>` -- verify `client` is `claude-code` and role-plugin is `ai-maestro-assistant-manager-agent` in native Claude Code plugin format (not converted)
- **Goal:** MANAGER agent has Claude-native plugin -- no conversion needed since client matches
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API shows `client: "claude-code"`, plugin is native format

---

## Phase 3: Create Team with Auto-COS

#### S021: Navigate to Teams tab
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active

#### S022: Click "Create Team" button
- **Action:** Click the "Create Team" button (or "+" in teams section)
- **Goal:** Team creation dialog opens (should succeed now that MANAGER exists)
- **Creates:** nothing (dialog only)
- **Modifies:** nothing
- **Verify:** Team creation dialog/form is visible with name input

#### S023: Enter team name `scen7-mixed-team`
- **Action:** Type `scen7-mixed-team` in the team name field
- **Goal:** Name entered
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Name field shows `scen7-mixed-team`

#### S024: Submit team creation (no COS specified)
- **Action:** Leave the COS selection empty (or use default "auto-generate"), click Create/Submit
- **Goal:** Team created with an auto-generated COS agent
- **Creates:** Team `scen7-mixed-team` in teams registry, auto-COS agent (robot avatar, cos-* name) in agent registry
- **Modifies:** Teams registry, agent registry
- **Verify:** Team appears in teams list. Wait for creation to complete.

#### S025: Verify team created via API
- **Action:** Check `GET /api/teams` for the new team
- **Goal:** Team `scen7-mixed-team` exists with `blocked: false`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team exists in API response with correct name

#### S026: Verify auto-COS agent created as Claude Code
- **Action:** Check team details -- `chiefOfStaffId` should reference an agent with `cos-*` prefixed name AND `client: "claude-code"` (server default)
- **Goal:** Auto-COS agent is Claude Code (server default), has CHIEF-OF-STAFF title
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent found in agent registry with `governanceTitle: 'CHIEF-OF-STAFF'` and `client: "claude-code"`

#### S027: Verify COS has Claude-native plugin
- **Action:** Check the COS agent's installed plugins via `GET /api/agents/<cosId>`
- **Goal:** COS agent has `ai-maestro-chief-of-staff` role-plugin in Claude-native format
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list includes `ai-maestro-chief-of-staff` in native Claude Code format (not converted)

#### S028: Verify COS is in team's agentIds
- **Action:** Check team's `agentIds` array includes the COS agent's ID
- **Goal:** COS is a member of the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` contains `chiefOfStaffId`

#### S029: Screenshot of team with COS
- **Action:** `take_screenshot` showing the team details or team list
- **Goal:** Visual record of team creation with auto-COS
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S029-team-with-cos.png`

---

## Phase 4: Add Claude Agent to Team -- MEMBER + Claude-Native Plugin

#### S030: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible

#### S031: Create Claude Code agent `scen7-claude-member`
- **Action:** Select **Claude Code** as client, enter name `scen7-claude-member`, proceed through wizard as AUTONOMOUS with no team, finish
- **Goal:** Agent created as AUTONOMOUS with `client: "claude-code"`
- **Creates:** Agent `scen7-claude-member` in registry
- **Modifies:** Agent registry
- **Verify:** New agent appears in sidebar, title is AUTONOMOUS, client is Claude Code

#### S032: Click on `scen7-claude-member` in sidebar
- **Action:** Click the agent in the sidebar
- **Goal:** Profile panel shows agent details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen7-claude-member`, title AUTONOMOUS, client Claude Code, no team

#### S033: Add agent to test team via profile
- **Action:** Click "Assign to Team" (or "Reassign" next to Team field), select `scen7-mixed-team` from the dropdown
- **Goal:** Agent joins the team
- **Creates:** nothing
- **Modifies:** Team agentIds (agent added), agent title (auto-transition to MEMBER)
- **Verify:** Wait for operation to complete

#### S034: Verify title auto-transitioned to MEMBER
- **Action:** Check the profile panel -- title badge should now show MEMBER
- **Goal:** Agent is MEMBER after joining team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MEMBER

#### S035: Verify Claude-native MEMBER plugin installed
- **Action:** Check Config tab or API for installed role-plugin
- **Goal:** `ai-maestro-programmer-agent` plugin is installed in **Claude-native format** (not converted)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows `ai-maestro-programmer-agent` in native Claude Code format. No conversion artifacts present.

#### S036: Verify agent is in team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should include the test member
- **Goal:** Agent is a member of the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` includes `scen7-claude-member`'s ID

#### S037: Screenshot of Claude agent as MEMBER
- **Action:** `take_screenshot` of the agent profile showing MEMBER title and Claude-native plugin
- **Goal:** Visual record
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S037-claude-member.png`

---

## Phase 5: Add Codex Agent to Team -- MEMBER + Codex-Converted Plugin

#### S038: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S039: Select Codex as client
- **Action:** Click "Codex" option in client selector
- **Goal:** Codex selected -- this agent will be the cross-client test subject
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Codex option highlighted/selected

#### S040: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S041: Enter test agent name `scen7-codex-member`
- **Action:** Type `scen7-codex-member` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen7-codex-member`

#### S042: Complete wizard steps (AUTONOMOUS, no team)
- **Action:** Click Next through remaining steps: team selection (skip/no team), title (AUTONOMOUS is default), role-plugin (select "No plugin" for AUTONOMOUS since wizard Step 5 always shows "No plugin" for non-MEMBER titles), finish
- **Goal:** Agent created as AUTONOMOUS with `client: "codex"`
- **Creates:** Agent `scen7-codex-member` in registry with `client: "codex"`
- **Modifies:** Agent registry
- **Verify:** New agent appears in sidebar, title is AUTONOMOUS, client is Codex

#### S043: Click on `scen7-codex-member` in sidebar
- **Action:** Click the agent in the sidebar
- **Goal:** Profile panel shows agent details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen7-codex-member`, title AUTONOMOUS, client Codex, no team

#### S044: Add Codex agent to test team via profile
- **Action:** Click "Assign to Team" (or "Reassign" next to Team field), select `scen7-mixed-team` from the dropdown
- **Goal:** Agent joins the team, triggering auto-MEMBER title and Codex-converted plugin install
- **Creates:** nothing
- **Modifies:** Team agentIds (agent added), agent title (auto-transition to MEMBER), plugin state (Codex-converted plugin)
- **Verify:** Wait for operation to complete

#### S045: Verify title auto-transitioned to MEMBER
- **Action:** Check the profile panel -- title badge should now show MEMBER
- **Goal:** Codex agent is MEMBER after joining team (same governance rule regardless of client)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MEMBER

#### S046: Verify Codex-converted MEMBER plugin installed
- **Action:** Check Config tab or API for installed role-plugin on `scen7-codex-member`
- **Goal:** `ai-maestro-programmer-agent` plugin is installed in **Codex-converted format** (TOML-based, compatible with Codex agent system)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin or agent configuration shows the programmer role-plugin adapted for Codex. The plugin format differs from the Claude-native version seen in S035. Check for Codex-specific markers (e.g., TOML format, codex-compatible paths).

#### S047: Verify Codex agent is in team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should include the Codex member
- **Goal:** Codex agent is a member of the team alongside the Claude agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` includes both `scen7-claude-member` and `scen7-codex-member`

#### S048: Verify team now has mixed clients
- **Action:** Check team members via API -- confirm at least one `claude-code` agent and one `codex` agent exist in the same team
- **Goal:** Team contains agents from different AI clients
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API shows team members with different `client` values. Screenshot saved.

#### S049: Screenshot of mixed-client team
- **Action:** `take_screenshot` of the team details showing both Claude and Codex agents
- **Goal:** Visual record of mixed-client team composition
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S049-mixed-client-team.png`

---

## Phase 6: Assign ORCHESTRATOR to Claude Agent -- Claude-Format Plugin Swap

#### S050: Click on `scen7-claude-member` in sidebar
- **Action:** Click the Claude agent in the sidebar
- **Goal:** Profile panel shows the Claude MEMBER agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen7-claude-member`, title MEMBER, client Claude Code

#### S051: Open Title Assignment Dialog
- **Action:** Click the MEMBER title badge
- **Goal:** Title Assignment Dialog opens with team-aware title options
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows team titles: MEMBER, ORCHESTRATOR, ARCHITECT, INTEGRATOR (and possibly CHIEF-OF-STAFF). AUTONOMOUS and MANAGER should NOT appear for a team member.

#### S052: Select ORCHESTRATOR title
- **Action:** Click the ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on ORCHESTRATOR card

#### S053: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to ORCHESTRATOR, programmer plugin swapped for orchestrator plugin in Claude-native format
- **Creates:** nothing
- **Modifies:** Agent title (MEMBER -> ORCHESTRATOR), plugin state (programmer -> orchestrator, Claude-native)
- **Verify:** Profile shows ORCHESTRATOR badge, plugin banner shows `ai-maestro-orchestrator-agent`

#### S054: Verify Claude-native ORCHESTRATOR plugin
- **Action:** Check Config tab or API for installed role-plugin on `scen7-claude-member`
- **Goal:** `ai-maestro-orchestrator-agent` plugin installed in **Claude-native format**
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin is `ai-maestro-orchestrator-agent` in native Claude Code format. Previous `ai-maestro-programmer-agent` is uninstalled.

#### S055: Screenshot of Claude ORCHESTRATOR
- **Action:** `take_screenshot` of agent profile showing ORCHESTRATOR title and plugin
- **Goal:** Visual record of successful Claude-format plugin swap
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S055-claude-orchestrator.png`

---

## Phase 7: Assign ARCHITECT to Codex Agent -- Codex-Format Plugin Swap

#### S056: Click on `scen7-codex-member` in sidebar
- **Action:** Click the Codex agent in the sidebar
- **Goal:** Profile panel shows the Codex MEMBER agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen7-codex-member`, title MEMBER, client Codex

#### S057: Open Title Assignment Dialog
- **Action:** Click the MEMBER title badge
- **Goal:** Title Assignment Dialog opens with team-aware title options
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows team titles: MEMBER, ORCHESTRATOR, ARCHITECT, INTEGRATOR

#### S058: Select ARCHITECT title
- **Action:** Click the ARCHITECT radio card
- **Goal:** ARCHITECT selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on ARCHITECT card

#### S059: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to ARCHITECT, programmer plugin swapped for architect plugin in **Codex-converted format**
- **Creates:** nothing
- **Modifies:** Agent title (MEMBER -> ARCHITECT), plugin state (programmer -> architect, Codex-converted)
- **Verify:** Profile shows ARCHITECT badge, plugin banner shows `ai-maestro-architect-agent`

#### S060: Verify Codex-converted ARCHITECT plugin
- **Action:** Check Config tab or API for installed role-plugin on `scen7-codex-member`
- **Goal:** `ai-maestro-architect-agent` plugin installed in **Codex-converted format** (TOML-based, Codex-compatible)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin is `ai-maestro-architect-agent` converted for Codex. Previous `ai-maestro-programmer-agent` (Codex-converted) is uninstalled. Check for Codex-specific markers.

#### S061: Verify both agents coexist in team with different titles and formats
- **Action:** Check `GET /api/teams/<teamId>` and both agent profiles
- **Goal:** Team has: COS (Claude, CHIEF-OF-STAFF), `scen7-claude-member` (Claude, ORCHESTRATOR), `scen7-codex-member` (Codex, ARCHITECT)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API confirms all three agents in team with correct titles and client types

#### S062: Screenshot of Codex ARCHITECT
- **Action:** `take_screenshot` of Codex agent profile showing ARCHITECT title and Codex-format plugin
- **Goal:** Visual record of successful Codex-format plugin swap
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S062-codex-architect.png`

---

## Phase 8: Remove Codex Agent from Team -- AUTONOMOUS, Plugin Stripped

#### S063: Click on `scen7-codex-member` in sidebar (should be ARCHITECT)
- **Action:** Click the Codex agent in the sidebar
- **Goal:** Profile panel shows ARCHITECT agent in team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title is ARCHITECT, team is `scen7-mixed-team`, client is Codex

#### S064: Click "Leave team" on Codex agent
- **Action:** In the profile panel for `scen7-codex-member`, click the "Leave team" button
- **Goal:** Agent removed from team
- **Creates:** nothing
- **Modifies:** Team agentIds (agent removed), agent title (reverts to AUTONOMOUS), plugin state (Codex-converted architect plugin removed)
- **Verify:** Wait for operation to complete

#### S065: Verify title reverted to AUTONOMOUS
- **Action:** Check the profile panel -- title badge should show AUTONOMOUS
- **Goal:** Codex agent reverted to AUTONOMOUS after leaving team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows AUTONOMOUS

#### S066: Verify no role-plugin installed on Codex agent
- **Action:** Check Config tab or API -- no role-plugin should be present
- **Goal:** Codex-converted architect plugin removed when title reverted to AUTONOMOUS
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows no role-plugin (or "No Role Plugin" indicator). No Codex-converted plugin artifacts remain.

#### S067: Verify Codex agent removed from team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should NOT include the Codex agent
- **Goal:** Codex agent is no longer in the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` does not contain `scen7-codex-member`'s ID. Claude agent and COS remain.

#### S068: Screenshot after Codex agent removal
- **Action:** `take_screenshot` of agent profile showing AUTONOMOUS and no plugin
- **Goal:** Visual record of clean plugin removal for Codex agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S068-codex-autonomous.png`

---

## Phase 9: Delete Team (Two-Phase Dialog, Keep Agents)

#### S069: Navigate to team details for `scen7-mixed-team`
- **Action:** Click on the team in the Teams tab to view its details
- **Goal:** Team details visible, showing COS and Claude ORCHESTRATOR agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team details panel open

#### S070: Note COS agent name for later verification
- **Action:** Record the auto-COS agent's name/ID from the team details (the cos-* agent)
- **Goal:** Have the COS agent identifier for post-deletion verification
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent name recorded

#### S071: Click Delete Team button
- **Action:** Click "Delete Team" button on the team card/details
- **Goal:** First confirmation dialog appears: "Are you sure you want to delete this Team 'scen7-mixed-team'?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with Cancel and Delete buttons

#### S072: Confirm first dialog (are you sure?)
- **Action:** Click "Delete" in the first confirmation dialog
- **Goal:** Second dialog appears: "Do you want to delete also all the agents belonging to the team?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Second dialog visible with Cancel, Keep Agents, and Delete Agents Too buttons

#### S073: Choose "Keep Agents" in second dialog
- **Action:** Click "Keep Agents" button
- **Goal:** Team deleted, agents survive as AUTONOMOUS (titles stripped, plugins removed regardless of client type)
- **Creates:** nothing
- **Modifies:** Teams registry (team removed), agent titles (all revert to AUTONOMOUS), plugins (role-plugins removed for both Claude and Codex agents)
- **Verify:** Wait for deletion to complete, dialog closes

#### S074: Verify team no longer exists
- **Action:** Check `GET /api/teams` -- `scen7-mixed-team` should be gone
- **Goal:** Team fully removed from registry
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API does not include the deleted team

#### S075: Verify auto-COS agent reverted to AUTONOMOUS
- **Action:** Check the COS agent's profile (by name recorded in S070)
- **Goal:** Former COS agent now has AUTONOMOUS title, Claude-native COS plugin removed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent's `governanceTitle` is AUTONOMOUS, no role-plugin installed

#### S076: Verify Claude agent (former ORCHESTRATOR) reverted to AUTONOMOUS
- **Action:** Check `scen7-claude-member` profile via API or UI
- **Goal:** Former ORCHESTRATOR agent now has AUTONOMOUS title, Claude-native orchestrator plugin removed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `governanceTitle` is AUTONOMOUS, no role-plugin installed

#### S077: Screenshot after team deletion
- **Action:** `take_screenshot` of teams list and agent list
- **Goal:** Visual record showing team removed, all agents reverted regardless of client type
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S077-team-deleted.png`

---

## Phase CLEANUP: Restore Original State

#### S078: Remove MANAGER title from `scen7-manager`
- **Action:** Open title dialog for `scen7-manager`, select AUTONOMOUS, enter governance password `mYkri1-xoxrap-gogtan`, confirm
- **Goal:** Agent reverted to AUTONOMOUS, no MANAGER on host
- **Removes:** MANAGER title assignment
- **Verify:** Title shows AUTONOMOUS, `GET /api/governance` shows `hasManager: false`

#### S079: Delete test agent `scen7-manager`
- **Action:** Click delete button in profile panel for `scen7-manager`, confirm deletion
- **Goal:** Test MANAGER agent fully removed from registry
- **Removes:** Agent `scen7-manager` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S080: Delete test agent `scen7-claude-member`
- **Action:** Click delete button in profile panel for `scen7-claude-member`, confirm deletion
- **Goal:** Test Claude member agent fully removed from registry
- **Removes:** Agent `scen7-claude-member` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S081: Delete test agent `scen7-codex-member`
- **Action:** Click delete button in profile panel for `scen7-codex-member`, confirm deletion
- **Goal:** Test Codex member agent fully removed from registry
- **Removes:** Agent `scen7-codex-member` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S082: Delete any remaining auto-COS agents (cos-* prefix from this test)
- **Action:** Check agent list for any agents with `cos-` prefix that were created during this test (recorded in S070). Delete each one.
- **Goal:** All auto-generated COS agents from this test removed
- **Removes:** Auto-COS agents created during Phase 3
- **Verify:** No test-created COS agents remain in registry

#### S083: STATE-WIPE -- Restore configuration files
- **Action:** Compare current config files with backups from S002. If any differ, restore from backup.
- **Goal:** All config files match pre-test state
- **Creates:** nothing
- **Modifies:** Config files (restored to backup state)
- **Verify:** File hash comparison -- all match
- **Files to restore:**
  - `~/.claude/settings.json`
  - `~/.claude/settings.local.json`
  - `~/.aimaestro/governance.json`
  - `~/.aimaestro/agents/registry.json`
  - `~/.aimaestro/teams/teams.json`
  - `~/.aimaestro/teams/groups.json`

#### S084: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, teams list, profile panel unchanged. Screenshot saved to `tests/scenarios/screenshots/SCEN-007/S084-post-cleanup.png`
