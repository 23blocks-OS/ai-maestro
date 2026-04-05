---
number: 6
name: Manager Gate Team Lifecycle (Codex Client)
version: "1.0"
description: >
  Variant of SCEN-005 that uses Codex as the AI client for team member agents.
  Tests the MANAGER-gated team lifecycle end-to-end while verifying that the
  cross-client plugin converter correctly converts Claude Code role-plugins
  to Codex format. The MANAGER agent remains Claude Code (host-level), and
  the auto-COS agent is created by the server with program='claude' (default).
  Team member agents are created with Codex client and receive converted
  plugins. Validates governance rules R9, R10, R11 plus cross-client
  conversion for Codex targets.
subsystems:
  - governance
  - teams
  - role-plugins
  - agent-registry
  - element-management-service
  - cross-client-conversion-service
ui_sections:
  - Sidebar -> Agents tab -> Agent list
  - Sidebar -> Teams tab -> Team list
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Config tab -> Role Plugin
  - Title Assignment Dialog (radio cards, password prompt)
  - Governance Password Dialog
  - Team Creation Dialog
  - Agent Creation Wizard (Step 1 client selector -> Codex)
data_produced:
  - 2 test agents (temporary, created and deleted)
  - 1 auto-COS agent (temporary, created by system with program=claude, deleted)
  - 1 test team (temporary, created and deleted)
  - Plugin settings.local.json modifications (temporary, cleaned up)
  - Agent registry entries (temporary, deleted)
  - Team registry entries (temporary, deleted)
  - Governance state changes (temporary, restored)
  - Cross-client converted plugin files (temporary, cleaned up)
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
  - Codex CLI installed and available on PATH (verify with `which codex`)
governance_password: "mYkri1-xoxrap-gogtan"
commit: TBD
author: AI Maestro Team
---

# Manager Gate Team Lifecycle (Codex Client) Scenario

> **Relation to SCEN-005:** This scenario follows the same governance lifecycle
> as SCEN-005 (Manager Gate Team Lifecycle) but creates team member agents
> with **Codex** as the AI client instead of Claude Code. The key difference
> is that role-plugin installation triggers the cross-client conversion
> pipeline (`services/cross-client-conversion-service.ts`) to convert Claude
> Code plugins into Codex-compatible format.
>
> **Known discrepancy:** The auto-COS agent is always created by the server
> with `program: 'claude'` (the default). This is expected behavior in the
> current implementation — the server does not inherit the team creator's
> client preference. Verify this discrepancy is present and document it.

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/manager-gate-codex-client_<timestamp>/`
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
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-006/S005-baseline.png`

#### S006: Ensure no MANAGER exists (precondition)
- **Action:** Check `GET /api/governance` for `hasManager: false`. If a MANAGER exists, remove MANAGER title via title dialog (set to AUTONOMOUS with password) before proceeding.
- **Goal:** No MANAGER on the host -- required for Phase 1 tests
- **Creates:** nothing
- **Modifies:** Possibly removes existing MANAGER title (will be restored in cleanup)
- **Verify:** `GET /api/governance` returns `hasManager: false`

#### S007: Verify Codex CLI is available
- **Action:** Run `which codex` or `codex --version` to confirm Codex is installed
- **Goal:** Codex binary found on PATH
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Command returns a valid path or version string. If Codex is not installed, abort the scenario with a clear error message.

---

## Phase 1: Verify No-Manager Blocking

#### S008: Verify governance API shows no MANAGER
- **Action:** Verify `GET /api/governance` returns `hasManager: false` and all teams have `blocked: true`
- **Goal:** Confirm the no-MANAGER state is reflected in API
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response shows `hasManager: false`

#### S009: Navigate to Teams tab in sidebar
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible in sidebar
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active, team list visible (may be empty or show blocked teams)

#### S010: Attempt to create a team via UI
- **Action:** Click the "Create Team" button (or "+" button in teams section)
- **Goal:** Error message appears indicating teams require a MANAGER first
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** UI shows error message containing "MANAGER" requirement text (e.g., "Teams require an existing MANAGER first" or similar). No team is created. Screenshot shows the error.

#### S011: Verify existing teams show blocked state (if any exist)
- **Action:** Inspect the teams list for any pre-existing teams
- **Goal:** All existing teams display a "blocked" badge or indicator
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Each team card/row shows a blocked indicator. If no teams exist, note "no teams to verify" and proceed. Screenshot of teams list.

---

## Phase 2: Assign MANAGER (Claude Code Agent -- Host-Level)

> **Note:** The MANAGER title is host-level, not team-level. The MANAGER agent
> is always Claude Code regardless of what client team members use.

#### S012: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header to open the Agent Creation Wizard
- **Goal:** Agent creation wizard opens
- **Creates:** nothing (wizard only)
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S013: Select Claude Code as client (for MANAGER)
- **Action:** Click "Claude Code" option in client selector (Step 1 of wizard)
- **Goal:** Claude Code selected -- MANAGER must be Claude Code
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Claude Code option highlighted/selected

#### S014: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S015: Enter test agent name `scen-codex-manager`
- **Action:** Type `scen-codex-manager` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen-codex-manager`

#### S016: Complete wizard steps (AUTONOMOUS, no team)
- **Action:** Click Next through remaining steps: team selection (skip/no team), title (AUTONOMOUS is default), role-plugin (select "No plugin" for AUTONOMOUS), finish
- **Goal:** Agent created as AUTONOMOUS with no team, program=claude
- **Creates:** Agent `scen-codex-manager` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** New agent appears in sidebar agent list

#### S017: Click on `scen-codex-manager` in sidebar
- **Action:** Click the agent name in the sidebar
- **Goal:** Profile panel shows the new agent's details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel heading shows `scen-codex-manager`, title is AUTONOMOUS

#### S018: Open Title Assignment Dialog
- **Action:** Click the title badge/button showing "AUTONOMOUS" in the profile panel
- **Goal:** Title Assignment Dialog opens with radio cards
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows available titles. Since agent has no team, only AUTONOMOUS and MANAGER should be shown.

#### S019: Select MANAGER title
- **Action:** Click the MANAGER radio card
- **Goal:** MANAGER selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on MANAGER card, Confirm not disabled

#### S020: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to MANAGER, role-plugin installed
- **Creates:** Plugin entry in agent's settings
- **Modifies:** Agent governanceTitle in registry, governance state (hasManager: true), plugin state
- **Verify:** Profile shows MANAGER badge (amber/gold), plugin banner shows `ai-maestro-assistant-manager-agent`

#### S021: Verify MANAGER assignment via API
- **Action:** Check `GET /api/governance` returns `hasManager: true` and `managerId` matches `scen-codex-manager`
- **Goal:** Governance state reflects the new MANAGER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response confirms MANAGER exists

#### S022: Verify existing teams are unblocked
- **Action:** Check `GET /api/teams` -- all teams should have `blocked: false`
- **Goal:** Teams unblocked now that MANAGER exists (R9.6)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API shows no blocked teams. If no teams exist, note "no teams to verify unblocking" and proceed.

---

## Phase 3: Create Team with Auto-COS

> **Known discrepancy:** The auto-COS agent is created by the server with
> `program: 'claude'` (the default). The server does not inherit the team
> creator's client preference or allow specifying a client for auto-COS.
> This step documents and verifies that behavior.

#### S023: Navigate to Teams tab
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active

#### S024: Click "Create Team" button
- **Action:** Click the "Create Team" button (or "+" in teams section)
- **Goal:** Team creation dialog opens (should succeed now that MANAGER exists)
- **Creates:** nothing (dialog only)
- **Modifies:** nothing
- **Verify:** Team creation dialog/form is visible with name input

#### S025: Enter team name `scen-codex-governance-team`
- **Action:** Type `scen-codex-governance-team` in the team name field
- **Goal:** Name entered
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Name field shows `scen-codex-governance-team`

#### S026: Submit team creation (no COS specified)
- **Action:** Leave the COS selection empty (or use default "auto-generate"), click Create/Submit
- **Goal:** Team created with an auto-generated COS agent
- **Creates:** Team `scen-codex-governance-team` in teams registry, auto-COS agent (robot avatar, cos-* name) in agent registry
- **Modifies:** Teams registry, agent registry
- **Verify:** Team appears in teams list. Wait for creation to complete.

#### S027: Verify team created via API
- **Action:** Check `GET /api/teams` for the new team
- **Goal:** Team `scen-codex-governance-team` exists with `blocked: false`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team exists in API response with correct name

#### S028: Verify auto-COS agent created
- **Action:** Check team details -- `chiefOfStaffId` should reference an agent with a `cos-*` prefixed name
- **Goal:** Auto-COS agent exists with CHIEF-OF-STAFF title
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent found in agent registry with `governanceTitle: 'CHIEF-OF-STAFF'`

#### S029: Verify auto-COS agent uses Claude (not Codex)
- **Action:** Check the COS agent's `program` field via `GET /api/agents/<cosId>`
- **Goal:** Auto-COS agent was created with `program: 'claude'` (server default)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent's `program` field is `'claude'`. Document this as a known discrepancy: auto-COS does not inherit the team's intended client. This is expected behavior for v1.0.

#### S030: Verify COS has correct plugin (Claude Code format)
- **Action:** Check the COS agent's installed plugins via `GET /api/agents/<cosId>`
- **Goal:** COS agent has `ai-maestro-chief-of-staff` role-plugin installed in Claude Code format (R11)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list includes `ai-maestro-chief-of-staff` (no cross-client conversion needed since COS is Claude)

#### S031: Verify COS is in team's agentIds
- **Action:** Check team's `agentIds` array includes the COS agent's ID
- **Goal:** COS is a member of the team (R4.6 invariant)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` contains `chiefOfStaffId`

#### S032: Screenshot of team with COS
- **Action:** `take_screenshot` showing the team details or team list
- **Goal:** Visual record of team creation with auto-COS
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-006/S032-team-with-cos.png`

---

## Phase 4: Add Codex Agent to Team -- MEMBER + Cross-Client Plugin Conversion

> **Key test:** This phase creates a Codex agent and adds it to the team.
> The auto-MEMBER title assignment triggers installation of the
> `ai-maestro-programmer-agent` role-plugin, which must be converted from
> Claude Code format to Codex format by the cross-client conversion service.

#### S033: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step (Step 1)

#### S034: Select Codex as client
- **Action:** Click "Codex" option in client selector (Step 1 of wizard)
- **Goal:** Codex selected -- this is the key difference from SCEN-005
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Codex option highlighted/selected (green icon)

#### S035: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S036: Enter test agent name `scen-codex-team-member`
- **Action:** Type `scen-codex-team-member` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen-codex-team-member`

#### S037: Proceed through wizard -- select team and title
- **Action:** Click Next. On the team selection step, select `scen-codex-governance-team`. On the title step, observe that MEMBER is the default for a team agent. On the role-plugin step, verify plugins shown are filtered by `compatible-clients` including Codex (or "No plugin" for non-MEMBER titles).
- **Goal:** Wizard configured with: client=codex, team=scen-codex-governance-team, title=MEMBER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard summary shows correct selections before final confirmation

#### S038: Verify wizard Step 5 filters plugins by Codex client
- **Action:** On the role-plugin selection step (Step 5), inspect the available plugins. Plugins without `"codex"` in `compatible-clients` should either be hidden or show a conversion indicator.
- **Goal:** The plugin list is filtered for Codex compatibility. If `ai-maestro-programmer-agent` does not list Codex in `compatible-clients`, it should still be offered (with cross-client conversion implied) OR the "No plugin" option is available.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot of Step 5 showing plugin options for Codex client. Note which plugins appear and whether conversion indicators are present.

#### S039: Complete wizard -- finish agent creation
- **Action:** Select the appropriate plugin (or "No plugin" if MEMBER auto-assigns), click Finish/Create
- **Goal:** Agent created as MEMBER in the team with program=codex
- **Creates:** Agent `scen-codex-team-member` in registry with `program: 'codex'`
- **Modifies:** Agent registry (new entry), team agentIds (agent added)
- **Verify:** New agent appears in sidebar agent list

#### S040: Click on `scen-codex-team-member` in sidebar
- **Action:** Click the agent in the sidebar
- **Goal:** Profile panel shows agent details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen-codex-team-member`, title MEMBER, team `scen-codex-governance-team`

#### S041: Verify agent program is Codex
- **Action:** Check the profile panel or `GET /api/agents/<agentId>` for the `program` field
- **Goal:** Agent's `program` field is `'codex'` (not `'claude'`)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `program` equals `'codex'` in both UI and API response

#### S042: Verify title is MEMBER
- **Action:** Check the profile panel -- title badge should show MEMBER
- **Goal:** Agent is MEMBER after joining team (R4.4, R11.4)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MEMBER

#### S043: Verify role-plugin installed with cross-client conversion
- **Action:** Check Config tab or API for installed role-plugin. The `ai-maestro-programmer-agent` plugin should be installed, and if the source plugin is Claude-only (`compatible-clients: ["claude-code"]`), the cross-client conversion service should have converted it to Codex format.
- **Goal:** Role-plugin is installed and functional for the Codex client
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows `ai-maestro-programmer-agent` (or its Codex-converted variant). Check the agent's local config for Codex-specific plugin artifacts (e.g., TOML instructions file, Codex-format agent definition).

#### S044: Verify cross-client conversion artifacts (Codex-specific)
- **Action:** Inspect the agent's working directory or plugin directory for Codex-format files. Codex uses TOML-based configuration (`codex.toml` or similar) rather than markdown agents. Check `services/cross-client-conversion-service.ts` output format.
- **Goal:** Converted plugin files exist in the expected Codex format
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** At least one Codex-specific artifact is present. If the conversion service does not yet produce Codex output, document this as a known limitation and note "cross-client conversion to Codex not yet implemented" if applicable.

#### S045: Verify agent is in team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should include the Codex test member
- **Goal:** Codex agent is a member of the team alongside the Claude COS
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` includes `scen-codex-team-member`'s ID

#### S046: Screenshot of Codex agent as MEMBER
- **Action:** `take_screenshot` of the agent profile showing MEMBER title, Codex client, and plugin
- **Goal:** Visual record of cross-client team membership
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-006/S046-codex-member-with-plugin.png`

---

## Phase 5: Remove Codex Agent from Team -- AUTONOMOUS

#### S047: Click "Leave team" on Codex test member agent
- **Action:** In the profile panel for `scen-codex-team-member`, click the "Leave team" button (or remove from team action)
- **Goal:** Agent removed from team
- **Creates:** nothing
- **Modifies:** Team agentIds (agent removed), agent title (reverts to AUTONOMOUS via R11.5)
- **Verify:** Wait for operation to complete

#### S048: Verify title reverted to AUTONOMOUS
- **Action:** Check the profile panel -- title badge should show AUTONOMOUS
- **Goal:** Codex agent reverted to AUTONOMOUS after leaving team (R11.5)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows AUTONOMOUS

#### S049: Verify no role-plugin installed
- **Action:** Check Config tab or API -- no role-plugin should be present
- **Goal:** Plugin removed when title reverted to AUTONOMOUS (R11.3), including any Codex-converted artifacts
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows no role-plugin (or "No Role Plugin" indicator)

#### S050: Verify agent removed from team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should NOT include the Codex test member
- **Goal:** Agent is no longer in the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` does not contain `scen-codex-team-member`'s ID

---

## Phase 6: Title Requires Team (Gate 9) -- Client-Agnostic

> **Note:** Gate 9 (title requires team membership) applies regardless of
> which AI client the agent uses. This phase verifies the same behavior as
> SCEN-005 Phase 6 but with a Codex agent.

#### S051: Click on `scen-codex-team-member` in sidebar (should be AUTONOMOUS)
- **Action:** Click the Codex agent in sidebar
- **Goal:** Profile panel shows AUTONOMOUS Codex agent not in any team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title is AUTONOMOUS, no team shown, program is codex

#### S052: Open Title Assignment Dialog
- **Action:** Click the AUTONOMOUS title badge
- **Goal:** Title dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with title options

#### S053: Verify only standalone titles are shown
- **Action:** Inspect the dialog options
- **Goal:** Only AUTONOMOUS and MANAGER should be visible. Team titles (ORCHESTRATOR, ARCHITECT, INTEGRATOR, MEMBER, CHIEF-OF-STAFF) must NOT appear because the agent is not in a team. This is true regardless of whether the agent is Claude or Codex.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows exactly 2 options: AUTONOMOUS and MANAGER. No team-specific titles. Screenshot saved.

#### S054: Close the dialog
- **Action:** Click Cancel or press Escape
- **Goal:** Dialog dismissed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog gone

---

## Phase 7: Delete Team (Keep Agents) -- Two-Phase Dialog

#### S055: Navigate to team details for `scen-codex-governance-team`
- **Action:** Click on the team in the Teams tab to view its details
- **Goal:** Team details visible, showing COS and any remaining members
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team details panel open

#### S056: Note COS agent name for later verification
- **Action:** Record the auto-COS agent's name/ID from the team details (the cos-* agent)
- **Goal:** Have the COS agent identifier for post-deletion verification
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent name recorded

#### S057: Click Delete Team button
- **Action:** Click "Delete Team" button on the team card/details
- **Goal:** First confirmation dialog appears: "Are you sure you want to delete this Team 'scen-codex-governance-team'?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with Cancel and Delete buttons

#### S058: Confirm first dialog (are you sure?)
- **Action:** Click "Delete" in the first confirmation dialog
- **Goal:** Second dialog appears: "Do you want to delete also all the agents belonging to the team? (Not deleting them will leave them as AUTONOMOUS titled agents)"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Second dialog visible with Cancel, Keep Agents, and Delete Agents Too buttons

#### S059: Choose "Keep Agents" in second dialog
- **Action:** Click "Keep Agents" button
- **Goal:** Team deleted, agents survive as AUTONOMOUS (titles stripped, plugins removed)
- **Creates:** nothing
- **Modifies:** Teams registry (team removed), agent titles (all revert to AUTONOMOUS), plugins (role-plugins removed)
- **Verify:** Wait for deletion to complete, dialog closes

#### S060: Verify team no longer exists
- **Action:** Check `GET /api/teams` -- `scen-codex-governance-team` should be gone
- **Goal:** Team fully removed from registry
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API does not include the deleted team

#### S061: Verify auto-COS agent reverted to AUTONOMOUS
- **Action:** Check the COS agent's profile (by name recorded in S056)
- **Goal:** Former COS agent now has AUTONOMOUS title and no role-plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent's `governanceTitle` is AUTONOMOUS (or null), no role-plugin installed

#### S062: Verify no former team agents retain team titles
- **Action:** Check all agents that were in the deleted team via API
- **Goal:** None of them have team-specific titles (MEMBER, COS, ORCHESTRATOR, etc.)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** All former team agents are AUTONOMOUS

#### S063: Screenshot after team deletion
- **Action:** `take_screenshot` of teams list and agent list
- **Goal:** Visual record showing team removed, agents reverted
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-006/S063-team-deleted.png`

---

## Phase CLEANUP: Restore Original State

#### S064: Remove MANAGER title from `scen-codex-manager`
- **Action:** Open title dialog for `scen-codex-manager`, select AUTONOMOUS, enter governance password `mYkri1-xoxrap-gogtan`, confirm
- **Goal:** Agent reverted to AUTONOMOUS, no MANAGER on host
- **Removes:** MANAGER title assignment
- **Verify:** Title shows AUTONOMOUS, `GET /api/governance` shows `hasManager: false`

#### S065: Delete test agent `scen-codex-manager`
- **Action:** Click delete button in profile panel for `scen-codex-manager`, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Removes:** Agent `scen-codex-manager` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S066: Delete test agent `scen-codex-team-member`
- **Action:** Click delete button in profile panel for `scen-codex-team-member`, confirm deletion
- **Goal:** Codex test agent fully removed from registry
- **Removes:** Agent `scen-codex-team-member` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S067: Delete any remaining auto-COS agents (cos-* prefix)
- **Action:** Check agent list for any agents with `cos-` prefix that were created during this test. Delete each one.
- **Goal:** All auto-generated COS agents from this test removed
- **Removes:** Auto-COS agents created during Phase 3
- **Verify:** No test-created COS agents remain in registry

#### S068: STATE-WIPE -- Restore configuration files
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

#### S069: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, teams list, profile panel unchanged. Screenshot saved to `tests/scenarios/screenshots/SCEN-006/S069-post-cleanup.png`
