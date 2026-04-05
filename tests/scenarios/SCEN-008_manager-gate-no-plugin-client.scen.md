---
number: 8
name: Manager Gate Team Lifecycle (No-Plugin Client)
version: "1.0"
description: >
  Tests the MANAGER-gated team lifecycle when agents use clients that have NO
  plugin support (Gemini CLI, Aider, OpenCode). Validates that governance titles
  work correctly for no-plugin clients: title changes succeed but plugin
  installation is gracefully skipped. Covers mixed-client teams where the
  MANAGER and auto-COS are Claude Code (with plugins) while a Gemini CLI agent
  joins, receives titles, and leaves without plugin install/uninstall operations.
  Validates ChangeTitle Gates 3, 15, 16 skip plugin for non-plugin clients,
  team deletion handles mixed plugin/no-plugin agents, and the wizard Step 5
  shows "No plugin" for non-plugin clients.
subsystems:
  - governance
  - teams
  - role-plugins
  - agent-registry
  - element-management-service
  - client-capabilities
ui_sections:
  - Sidebar -> Agents tab -> Agent list
  - Sidebar -> Teams tab -> Team list
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Config tab -> Role Plugin
  - Title Assignment Dialog (radio cards, password prompt)
  - Governance Password Dialog
  - Team Creation Dialog
  - Agent Creation Wizard (client picker, plugin picker)
data_produced:
  - 2 test agents (temporary, created and deleted)
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
governance_password: "mYkri1-xoxrap-gogtan"
commit: TBD
author: AI Maestro Team
---

# Manager Gate Team Lifecycle (No-Plugin Client) Scenario

This is the NO-PLUGIN CLIENT variant of SCEN-005. The key difference: the test
member agent uses **Gemini CLI** (which has `plugins: false`, `rolePlugins: false`
in `lib/client-capabilities.ts`). Title changes must succeed but plugin
operations must be gracefully skipped.

**Client capabilities reference (from `lib/client-capabilities.ts`):**
- Claude Code: `plugins: true, rolePlugins: true` — full plugin support
- Codex: `plugins: true, rolePlugins: true` — full plugin support
- Gemini CLI: `plugins: false, rolePlugins: false` — NO plugin support
- Aider: no entry — treated as no plugin support
- OpenCode: `plugins: false, rolePlugins: false` — NO plugin support

---

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/manager-gate-no-plugin-client_<timestamp>/`
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
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S005-baseline.png`

#### S006: Ensure no MANAGER exists (precondition)
- **Action:** Check `GET /api/governance` for `hasManager: false`. If a MANAGER exists, remove MANAGER title via title dialog (set to AUTONOMOUS with password) before proceeding.
- **Goal:** No MANAGER on the host -- required for Phase 1 tests
- **Creates:** nothing
- **Modifies:** Possibly removes existing MANAGER title (will be restored in cleanup)
- **Verify:** `GET /api/governance` returns `hasManager: false`

---

## Phase 1: Assign MANAGER (Claude Code Agent)

#### S007: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header to open the Agent Creation Wizard
- **Goal:** Agent creation wizard opens
- **Creates:** nothing (wizard only)
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S008: Select Claude Code as client
- **Action:** Click "Claude Code" option in client selector (purple icon, "Full plugin support" subtitle)
- **Goal:** Claude Code selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected with blue border

#### S009: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S010: Enter test agent name `scen8-manager`
- **Action:** Type `scen8-manager` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen8-manager`

#### S011: Complete wizard steps (AUTONOMOUS, no team)
- **Action:** Click Next through remaining steps: team selection (skip/no team), title (AUTONOMOUS is default), role-plugin (select "No plugin" for AUTONOMOUS), finish
- **Goal:** Agent created as AUTONOMOUS with no team
- **Creates:** Agent `scen8-manager` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** New agent appears in sidebar agent list

#### S012: Click on `scen8-manager` in sidebar
- **Action:** Click the agent name in the sidebar
- **Goal:** Profile panel shows the new agent's details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel heading shows `scen8-manager`, title is AUTONOMOUS

#### S013: Open Title Assignment Dialog
- **Action:** Click the title badge/button showing "AUTONOMOUS" in the profile panel
- **Goal:** Title Assignment Dialog opens with radio cards
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows available titles. Since agent has no team, only AUTONOMOUS and MANAGER should be shown.

#### S014: Select MANAGER title
- **Action:** Click the MANAGER radio card
- **Goal:** MANAGER selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on MANAGER card, Confirm not disabled

#### S015: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to MANAGER, role-plugin installed (Claude supports plugins)
- **Creates:** Plugin entry in agent's settings
- **Modifies:** Agent governanceTitle in registry, governance state (hasManager: true), plugin state
- **Verify:** Profile shows MANAGER badge (amber/gold), plugin banner shows `ai-maestro-assistant-manager-agent`

#### S016: Verify MANAGER assignment via API
- **Action:** Check `GET /api/governance` returns `hasManager: true` and `managerId` matches `scen8-manager`
- **Goal:** Governance state reflects the new MANAGER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response confirms MANAGER exists

---

## Phase 2: Create Team with Auto-COS

#### S017: Navigate to Teams tab
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active

#### S018: Click "Create Team" button
- **Action:** Click the "Create Team" button (or "+" in teams section)
- **Goal:** Team creation dialog opens (should succeed now that MANAGER exists)
- **Creates:** nothing (dialog only)
- **Modifies:** nothing
- **Verify:** Team creation dialog/form is visible with name input

#### S019: Enter team name `scen8-noplugin-team`
- **Action:** Type `scen8-noplugin-team` in the team name field
- **Goal:** Name entered
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Name field shows `scen8-noplugin-team`

#### S020: Submit team creation (no COS specified)
- **Action:** Leave the COS selection empty (or use default "auto-generate"), click Create/Submit
- **Goal:** Team created with an auto-generated COS agent (Claude Code, with plugin)
- **Creates:** Team `scen8-noplugin-team` in teams registry, auto-COS agent (robot avatar, cos-* name) in agent registry
- **Modifies:** Teams registry, agent registry
- **Verify:** Team appears in teams list. Wait for creation to complete.

#### S021: Verify team created via API
- **Action:** Check `GET /api/teams` for the new team
- **Goal:** Team `scen8-noplugin-team` exists with `blocked: false`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team exists in API response with correct name

#### S022: Verify auto-COS agent created with plugin
- **Action:** Check team details -- `chiefOfStaffId` should reference an agent with a `cos-*` prefixed name. Verify it is Claude Code and has the COS role-plugin.
- **Goal:** Auto-COS agent exists with CHIEF-OF-STAFF title AND `ai-maestro-chief-of-staff` plugin installed (Claude Code supports plugins)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent found with `governanceTitle: 'CHIEF-OF-STAFF'` and plugin in installed list. Record COS agent name for Phase 7.

#### S023: Screenshot of team with COS
- **Action:** `take_screenshot` showing the team details or team list
- **Goal:** Visual record of team creation with auto-COS (Claude, with plugin)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S023-team-with-cos.png`

---

## Phase 3: Add Gemini Agent to Team -- MEMBER Title, NO Plugin

#### S024: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client picker

#### S025: Select Gemini CLI as client
- **Action:** Click "Gemini CLI" option in client selector (blue icon, shows "No plugin support" subtitle)
- **Goal:** Gemini CLI selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected. Note the "No plugin support" label visible in the card.

#### S026: Screenshot of Gemini CLI selection showing "No plugin support"
- **Action:** `take_screenshot` of the client picker with Gemini CLI selected
- **Goal:** Visual proof that UI explicitly marks Gemini as "No plugin support"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S026-gemini-selected.png`

#### S027: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S028: Enter test agent name `scen8-gemini-member`
- **Action:** Type `scen8-gemini-member` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen8-gemini-member`

#### S029: Complete wizard -- select team, observe plugin step
- **Action:** Click Next through remaining steps. On team selection, select `scen8-noplugin-team`. On title selection, note MEMBER is auto-selected (team membership). On plugin step (Step 5), observe what is shown for a Gemini CLI agent with MEMBER title.
- **Goal:** Plugin step should show "No plugin (bare agent)" as the only option OR automatically skip the plugin step since Gemini has no plugin support. The wizard should NOT offer to install role-plugins for Gemini CLI.
- **Creates:** nothing (wizard in progress)
- **Modifies:** nothing
- **Verify:** Step 5 shows "No plugin" option. No role-plugin dropdown is available for Gemini. Screenshot of Step 5.

#### S030: Screenshot of wizard Step 5 for Gemini (no plugin options)
- **Action:** `take_screenshot` of the plugin selection step
- **Goal:** Visual proof that the wizard correctly handles no-plugin clients
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S030-wizard-step5-gemini.png`

#### S031: Finish wizard -- create the Gemini agent
- **Action:** Click Create/Finish on the summary step
- **Goal:** Agent created as MEMBER in team with NO plugin installed
- **Creates:** Agent `scen8-gemini-member` in registry with client=gemini
- **Modifies:** Agent registry (new entry), team agentIds (agent added)
- **Verify:** New agent appears in sidebar. Wait for creation to complete.

#### S032: Click on `scen8-gemini-member` in sidebar
- **Action:** Click the agent in the sidebar
- **Goal:** Profile panel shows agent details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen8-gemini-member`

#### S033: Verify title is MEMBER
- **Action:** Check the profile panel title badge
- **Goal:** Agent is MEMBER after joining team (title auto-assigned on team join)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MEMBER

#### S034: Verify NO plugin installed (Gemini has no plugin support)
- **Action:** Check Config tab or API for installed role-plugin. `GET /api/agents/<id>` should show NO role-plugin.
- **Goal:** No `ai-maestro-programmer-agent` plugin installed -- Gemini CLI does not support plugins. ChangeTitle Gate 3 should have detected no compatible plugins for gemini client and Gate 16 should have skipped install.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows NO role-plugin. Profile should indicate "No plugin support for this client" or similar messaging.

#### S035: Verify agent is in team's agentIds via API
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should include the Gemini member
- **Goal:** Agent is a member of the team despite having no plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` includes `scen8-gemini-member`'s ID

#### S036: Screenshot of Gemini agent as MEMBER with no plugin
- **Action:** `take_screenshot` of the agent profile showing MEMBER title and no plugin
- **Goal:** Visual record showing title assigned, plugin absent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S036-gemini-member-no-plugin.png`

---

## Phase 4: Change Gemini Agent Title to ORCHESTRATOR -- NO Plugin Installed

#### S037: Open Title Assignment Dialog for Gemini agent
- **Action:** Click the MEMBER title badge on `scen8-gemini-member` profile
- **Goal:** Title Assignment Dialog opens with radio cards for team titles
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows team-specific titles (MEMBER, ORCHESTRATOR, ARCHITECT, INTEGRATOR). MEMBER is currently selected.

#### S038: Select ORCHESTRATOR title
- **Action:** Click the ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on ORCHESTRATOR card

#### S039: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to ORCHESTRATOR. Plugin installation SKIPPED because Gemini has no plugin support. ChangeTitle pipeline succeeds without error.
- **Creates:** nothing
- **Modifies:** Agent governanceTitle in registry (MEMBER -> ORCHESTRATOR)
- **Verify:** Title badge shows ORCHESTRATOR. No error dialogs. Wait for operation to complete.

#### S040: Verify title changed to ORCHESTRATOR via API
- **Action:** Check `GET /api/agents/<id>` -- `governanceTitle` should be `orchestrator`
- **Goal:** Title persisted correctly in registry
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response shows `governanceTitle: 'orchestrator'`

#### S041: Verify still NO plugin installed after title change
- **Action:** Check Config tab or API for role-plugin
- **Goal:** No role-plugin installed. The ORCHESTRATOR title normally requires `ai-maestro-orchestrator-agent` plugin, but Gemini CLI cannot install plugins. ChangeTitle Gate 3 should log "No compatible plugins found for ORCHESTRATOR" or "No native gemini plugin" and Gates 15-16 should skip install.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** No role-plugin in installed list. No error state in UI.

#### S042: Screenshot of Gemini agent as ORCHESTRATOR with no plugin
- **Action:** `take_screenshot` of the agent profile
- **Goal:** Visual record showing title changed successfully without plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S042-gemini-orchestrator-no-plugin.png`

---

## Phase 5: Verify Plugin Status Messaging

#### S043: Check COS agent has plugin (contrast test)
- **Action:** Click on the auto-COS agent (cos-* prefix, recorded in S022) in the sidebar
- **Goal:** Profile shows COS agent with CHIEF-OF-STAFF title AND plugin installed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows CHIEF-OF-STAFF, Config tab shows `ai-maestro-chief-of-staff` plugin. This confirms Claude Code agents in the same team DO have plugins.

#### S044: Screenshot of COS with plugin (contrast with Gemini)
- **Action:** `take_screenshot` of COS agent profile showing plugin installed
- **Goal:** Side-by-side evidence: Claude agent has plugin, Gemini agent does not
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S044-cos-with-plugin.png`

#### S045: Click back on `scen8-gemini-member` in sidebar
- **Action:** Click the Gemini agent in sidebar
- **Goal:** Profile panel shows the Gemini agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows ORCHESTRATOR title, no plugin

#### S046: Inspect Role tab for no-plugin messaging
- **Action:** Click the Role tab in the agent profile panel
- **Goal:** Role tab should display appropriate messaging for a no-plugin client. This may show "No plugin support for this client", "No Role Plugin", or the Haephestos create option may be absent/disabled.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Role tab does NOT offer to install role-plugins for Gemini. Any messaging about plugin support is clear and not confusing.

#### S047: Screenshot of Role tab for Gemini agent
- **Action:** `take_screenshot` of the Role tab
- **Goal:** Visual record of how the UI handles no-plugin clients in the Role tab
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S047-gemini-role-tab.png`

---

## Phase 6: Remove Gemini Agent from Team -- AUTONOMOUS

#### S048: Click "Leave team" on Gemini agent
- **Action:** In the profile panel for `scen8-gemini-member`, click the "Leave team" button (or remove from team action)
- **Goal:** Agent removed from team. Title reverts to AUTONOMOUS. No plugin uninstall needed (none was installed).
- **Creates:** nothing
- **Modifies:** Team agentIds (agent removed), agent title (reverts to AUTONOMOUS)
- **Verify:** Wait for operation to complete. No errors about plugin uninstall.

#### S049: Verify title reverted to AUTONOMOUS
- **Action:** Check the profile panel -- title badge should show AUTONOMOUS
- **Goal:** Agent reverted to AUTONOMOUS after leaving team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows AUTONOMOUS

#### S050: Verify still no plugin (no uninstall errors)
- **Action:** Check Config tab or API -- no role-plugin should be present (and no errors about failed uninstall)
- **Goal:** Clean state: no plugin before, no plugin after. ChangeTitle pipeline handled the no-plugin path gracefully.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** No role-plugin in list, no error messages

#### S051: Verify agent removed from team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should NOT include the Gemini member
- **Goal:** Agent is no longer in the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` does not contain `scen8-gemini-member`'s ID

---

## Phase 7: Delete Team (Two-Phase Dialog, Delete Agents Too)

#### S052: Navigate to team details for `scen8-noplugin-team`
- **Action:** Click on the team in the Teams tab to view its details
- **Goal:** Team details visible, showing COS (Claude, with plugin) and no other members (Gemini agent already left)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team details panel open. COS agent visible.

#### S053: Click Delete Team button
- **Action:** Click "Delete Team" button on the team card/details
- **Goal:** First confirmation dialog appears: "Are you sure you want to delete this Team 'scen8-noplugin-team'?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with Cancel and Delete buttons

#### S054: Confirm first dialog (are you sure?)
- **Action:** Click "Delete" in the first confirmation dialog
- **Goal:** Second dialog appears: "Do you want to delete also all the agents belonging to the team?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Second dialog visible with Cancel, Keep Agents, and Delete Agents Too buttons

#### S055: Choose "Delete Agents Too" in second dialog
- **Action:** Click "Delete Agents Too" button
- **Goal:** Team deleted. COS agent (Claude, with plugin) is also deleted. Plugin cleanup runs for COS (plugin uninstall). No plugin cleanup needed for Gemini agent (already removed from team).
- **Creates:** nothing
- **Modifies:** Teams registry (team removed), agent registry (COS agent removed), COS plugin state (cleaned)
- **Verify:** Wait for deletion to complete, dialog closes

#### S056: Verify team no longer exists
- **Action:** Check `GET /api/teams` -- `scen8-noplugin-team` should be gone
- **Goal:** Team fully removed from registry
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API does not include the deleted team

#### S057: Verify auto-COS agent deleted
- **Action:** Check `GET /api/agents` -- the COS agent recorded in S022 should be gone
- **Goal:** COS agent removed with the team (chose "Delete Agents Too")
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent not found in API response

#### S058: Verify Gemini agent is still alive (was NOT in team at deletion time)
- **Action:** Check `GET /api/agents` -- `scen8-gemini-member` should still exist as AUTONOMOUS
- **Goal:** The Gemini agent left the team before deletion, so it survives
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent exists with `governanceTitle: 'autonomous'` (or null)

#### S059: Screenshot after team deletion
- **Action:** `take_screenshot` of teams list and agent list
- **Goal:** Visual record showing team removed, COS deleted, Gemini agent survives
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S059-team-deleted.png`

---

## Phase CLEANUP: Restore Original State

#### S060: Remove MANAGER title from `scen8-manager`
- **Action:** Open title dialog for `scen8-manager`, select AUTONOMOUS, enter governance password `mYkri1-xoxrap-gogtan`, confirm
- **Goal:** Agent reverted to AUTONOMOUS, no MANAGER on host
- **Removes:** MANAGER title assignment, manager role-plugin
- **Verify:** Title shows AUTONOMOUS, `GET /api/governance` shows `hasManager: false`

#### S061: Delete test agent `scen8-manager`
- **Action:** Click delete button in profile panel for `scen8-manager`, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Removes:** Agent `scen8-manager` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S062: Delete test agent `scen8-gemini-member`
- **Action:** Click delete button in profile panel for `scen8-gemini-member`, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Removes:** Agent `scen8-gemini-member` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S063: Delete any remaining auto-COS agents (cos-* prefix from this test)
- **Action:** Check agent list for any agents with `cos-` prefix that were created during this test. Delete each one if they still exist (they should have been deleted in S055).
- **Goal:** All auto-generated COS agents from this test removed
- **Removes:** Auto-COS agents created during Phase 2 (if any remain)
- **Verify:** No test-created COS agents remain in registry

#### S064: STATE-WIPE -- Restore configuration files
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

#### S065: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, teams list, profile panel unchanged. Screenshot saved to `tests/scenarios/screenshots/SCEN-008/S065-post-cleanup.png`
