---
number: 5
name: Manager Gate Team Lifecycle
version: "1.0"
description: >
  Tests the MANAGER-gated team lifecycle end-to-end: verifying that teams
  cannot be created without a MANAGER (R9), assigning MANAGER and observing
  team unblocking (R9.6), creating a team with auto-COS (R1.3), adding agents
  with auto-MEMBER title and plugin install (R10, R11), removing agents and
  title reversion, title-requires-team gate (Gate 9), team deletion with
  title reversion, and the MANAGER removal blocking cascade (R9.8).
  Validates governance rules R9, R10, R11 from governance-design-rules.md.
subsystems:
  - governance
  - teams
  - role-plugins
  - agent-registry
  - element-management-service
ui_sections:
  - Sidebar -> Agents tab -> Agent list
  - Sidebar -> Teams tab -> Team list
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Config tab -> Role Plugin
  - Title Assignment Dialog (radio cards, password prompt)
  - Governance Password Dialog
  - Team Creation Dialog
  - Agent Creation Wizard
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

# Manager Gate Team Lifecycle Scenario

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/manager-gate-team-lifecycle_<timestamp>/`
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
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S005-baseline.png`

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
- **Verify:** UI shows error message containing "MANAGER" requirement text (e.g., "Teams require an existing MANAGER first" or similar). No team is created. Screenshot shows the error.

#### S010: Verify existing teams show blocked state (if any exist)
- **Action:** Inspect the teams list for any pre-existing teams
- **Goal:** All existing teams display a "blocked" badge or indicator
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Each team card/row shows a blocked indicator. If no teams exist, note "no teams to verify" and proceed. Screenshot of teams list.

---

## Phase 2: Assign MANAGER

#### S011: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header to open the Agent Creation Wizard
- **Goal:** Agent creation wizard opens
- **Creates:** nothing (wizard only)
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S012: Select Claude Code as client
- **Action:** Click "Claude Code" option in client selector
- **Goal:** Claude Code selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected

#### S013: Click Next to avatar/name step
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S014: Enter test agent name `scen-test-manager`
- **Action:** Type `scen-test-manager` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen-test-manager`

#### S015: Complete wizard steps (AUTONOMOUS, no team)
- **Action:** Click Next through remaining steps: team selection (skip/no team), title (AUTONOMOUS is default), role-plugin (select "No plugin" for AUTONOMOUS), finish
- **Goal:** Agent created as AUTONOMOUS with no team
- **Creates:** Agent `scen-test-manager` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** New agent appears in sidebar agent list

#### S016: Click on `scen-test-manager` in sidebar
- **Action:** Click the agent name in the sidebar
- **Goal:** Profile panel shows the new agent's details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel heading shows `scen-test-manager`, title is AUTONOMOUS

#### S017: Open Title Assignment Dialog
- **Action:** Click the title badge/button showing "AUTONOMOUS" in the profile panel
- **Goal:** Title Assignment Dialog opens with radio cards
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows available titles. Since agent has no team, only AUTONOMOUS and MANAGER should be shown.

#### S018: Select MANAGER title
- **Action:** Click the MANAGER radio card
- **Goal:** MANAGER selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on MANAGER card, Confirm not disabled

#### S019: Confirm and enter governance password
- **Action:** Click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** Title changes to MANAGER, role-plugin installed
- **Creates:** Plugin entry in agent's settings
- **Modifies:** Agent governanceTitle in registry, governance state (hasManager: true), plugin state
- **Verify:** Profile shows MANAGER badge (amber/gold), plugin banner shows `ai-maestro-assistant-manager-agent`

#### S020: Verify MANAGER assignment via API
- **Action:** Check `GET /api/governance` returns `hasManager: true` and `managerId` matches `scen-test-manager`
- **Goal:** Governance state reflects the new MANAGER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response confirms MANAGER exists

#### S021: Verify existing teams are unblocked
- **Action:** Check `GET /api/teams` -- all teams should have `blocked: false`
- **Goal:** Teams unblocked now that MANAGER exists (R9.6)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API shows no blocked teams. If no teams exist, note "no teams to verify unblocking" and proceed.

---

## Phase 3: Create Team with Auto-COS

#### S022: Navigate to Teams tab
- **Action:** Click the "Teams" tab in the sidebar
- **Goal:** Teams list visible
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Teams tab is active

#### S023: Click "Create Team" button
- **Action:** Click the "Create Team" button (or "+" in teams section)
- **Goal:** Team creation dialog opens (should succeed now that MANAGER exists)
- **Creates:** nothing (dialog only)
- **Modifies:** nothing
- **Verify:** Team creation dialog/form is visible with name input

#### S024: Enter team name `scen-test-governance-team`
- **Action:** Type `scen-test-governance-team` in the team name field
- **Goal:** Name entered
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Name field shows `scen-test-governance-team`

#### S025: Submit team creation (no COS specified)
- **Action:** Leave the COS selection empty (or use default "auto-generate"), click Create/Submit
- **Goal:** Team created with an auto-generated COS agent
- **Creates:** Team `scen-test-governance-team` in teams registry, auto-COS agent (robot avatar, cos-* name) in agent registry
- **Modifies:** Teams registry, agent registry
- **Verify:** Team appears in teams list. Wait for creation to complete.

#### S026: Verify team created via API
- **Action:** Check `GET /api/teams` for the new team
- **Goal:** Team `scen-test-governance-team` exists with `blocked: false`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team exists in API response with correct name

#### S027: Verify auto-COS agent created
- **Action:** Check team details -- `chiefOfStaffId` should reference an agent with a `cos-*` prefixed name
- **Goal:** Auto-COS agent exists with CHIEF-OF-STAFF title
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent found in agent registry with `governanceTitle: 'CHIEF-OF-STAFF'`

#### S028: Verify COS has correct plugin
- **Action:** Check the COS agent's installed plugins via `GET /api/agents/<cosId>`
- **Goal:** COS agent has `ai-maestro-chief-of-staff` role-plugin installed (R11)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list includes `ai-maestro-chief-of-staff`

#### S029: Verify COS is in team's agentIds
- **Action:** Check team's `agentIds` array includes the COS agent's ID
- **Goal:** COS is a member of the team (R4.6 invariant)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` contains `chiefOfStaffId`

#### S030: Screenshot of team with COS
- **Action:** `take_screenshot` showing the team details or team list
- **Goal:** Visual record of team creation with auto-COS
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S030-team-with-cos.png`

---

## Phase 4: Add Agent to Team -- MEMBER + Plugin

#### S031: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible

#### S032: Create agent `scen-test-team-member`
- **Action:** Select Claude Code, enter name `scen-test-team-member`, proceed through wizard as AUTONOMOUS with no team, finish
- **Goal:** Agent created as AUTONOMOUS
- **Creates:** Agent `scen-test-team-member` in registry
- **Modifies:** Agent registry
- **Verify:** New agent appears in sidebar, title is AUTONOMOUS

#### S033: Click on `scen-test-team-member` in sidebar
- **Action:** Click the agent in the sidebar
- **Goal:** Profile panel shows agent details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile shows `scen-test-team-member`, title AUTONOMOUS, no team

#### S034: Add agent to test team via profile
- **Action:** Click "Assign to Team" (or "Reassign" next to Team field), select `scen-test-governance-team` from the dropdown
- **Goal:** Agent joins the team
- **Creates:** nothing
- **Modifies:** Team agentIds (agent added), agent title (auto-transition to MEMBER via R4.4)
- **Verify:** Wait for operation to complete

#### S035: Verify title auto-transitioned to MEMBER
- **Action:** Check the profile panel -- title badge should now show MEMBER
- **Goal:** Agent is MEMBER after joining team (R4.4, R11.4)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MEMBER

#### S036: Verify programmer plugin installed
- **Action:** Check Config tab or API for installed role-plugin
- **Goal:** `ai-maestro-programmer-agent` plugin is installed (R11.2)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows `ai-maestro-programmer-agent`

#### S037: Verify agent is in team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should include the test member
- **Goal:** Agent is a member of the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` includes `scen-test-team-member`'s ID

#### S038: Screenshot of agent as MEMBER
- **Action:** `take_screenshot` of the agent profile showing MEMBER title and plugin
- **Goal:** Visual record
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S038-member-with-plugin.png`

---

## Phase 5: Remove Agent from Team -- AUTONOMOUS

#### S039: Click "Leave team" on test member agent
- **Action:** In the profile panel for `scen-test-team-member`, click the "Leave team" button (or remove from team action)
- **Goal:** Agent removed from team
- **Creates:** nothing
- **Modifies:** Team agentIds (agent removed), agent title (reverts to AUTONOMOUS via R11.5)
- **Verify:** Wait for operation to complete

#### S040: Verify title reverted to AUTONOMOUS
- **Action:** Check the profile panel -- title badge should show AUTONOMOUS
- **Goal:** Agent reverted to AUTONOMOUS after leaving team (R11.5)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows AUTONOMOUS

#### S041: Verify no role-plugin installed
- **Action:** Check Config tab or API -- no role-plugin should be present
- **Goal:** Plugin removed when title reverted to AUTONOMOUS (R11.3)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin list shows no role-plugin (or "No Role Plugin" indicator)

#### S042: Verify agent removed from team's agentIds
- **Action:** Check `GET /api/teams/<teamId>` -- `agentIds` should NOT include the test member
- **Goal:** Agent is no longer in the team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** `agentIds` does not contain `scen-test-team-member`'s ID

---

## Phase 6: Title Requires Team (Gate 9)

#### S043: Click on `scen-test-team-member` in sidebar (should be AUTONOMOUS)
- **Action:** Click the agent in sidebar
- **Goal:** Profile panel shows AUTONOMOUS agent not in any team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title is AUTONOMOUS, no team shown

#### S044: Open Title Assignment Dialog
- **Action:** Click the AUTONOMOUS title badge
- **Goal:** Title dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with title options

#### S045: Verify only standalone titles are shown
- **Action:** Inspect the dialog options
- **Goal:** Only AUTONOMOUS and MANAGER should be visible. Team titles (ORCHESTRATOR, ARCHITECT, INTEGRATOR, MEMBER, CHIEF-OF-STAFF) must NOT appear because the agent is not in a team.
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows exactly 2 options: AUTONOMOUS and MANAGER. No team-specific titles. Screenshot saved.

#### S046: Close the dialog
- **Action:** Click Cancel or press Escape
- **Goal:** Dialog dismissed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog gone

---

## Phase 7: Delete Team -- All Agents Revert

#### S047: Navigate to team details for `scen-test-governance-team`
- **Action:** Click on the team in the Teams tab to view its details
- **Goal:** Team details visible, showing COS and any remaining members
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team details panel open

#### S048: Note COS agent name for later verification
- **Action:** Record the auto-COS agent's name/ID from the team details (the cos-* agent)
- **Goal:** Have the COS agent identifier for post-deletion verification
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent name recorded

#### S049: Click Delete Team button
- **Action:** Click "Delete Team" button on the team card/details
- **Goal:** First confirmation dialog appears: "Are you sure you want to delete this Team 'scen-test-governance-team'?"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with Cancel and Delete buttons

#### S049b: Confirm first dialog (are you sure?)
- **Action:** Click "Delete" in the first confirmation dialog
- **Goal:** Second dialog appears: "Do you want to delete also all the agents belonging to the team? (Not deleting them will leave them as AUTONOMOUS titled agents)"
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Second dialog visible with Cancel, Keep Agents, and Delete Agents Too buttons

#### S049c: Choose "Keep Agents" in second dialog
- **Action:** Click "Keep Agents" button
- **Goal:** Team deleted, agents survive as AUTONOMOUS (titles stripped, plugins removed)
- **Creates:** nothing
- **Modifies:** Teams registry (team removed), agent titles (all revert to AUTONOMOUS), plugins (role-plugins removed)
- **Verify:** Wait for deletion to complete, dialog closes

#### S050: Verify team no longer exists
- **Action:** Check `GET /api/teams` -- `scen-test-governance-team` should be gone
- **Goal:** Team fully removed from registry
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API does not include the deleted team

#### S051: Verify auto-COS agent reverted to AUTONOMOUS
- **Action:** Check the COS agent's profile (by name recorded in S048)
- **Goal:** Former COS agent now has AUTONOMOUS title and no role-plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent's `governanceTitle` is AUTONOMOUS (or null), no role-plugin installed

#### S052: Verify no former team agents retain team titles
- **Action:** Check all agents that were in the deleted team via API
- **Goal:** None of them have team-specific titles (MEMBER, COS, ORCHESTRATOR, etc.)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** All former team agents are AUTONOMOUS

#### S053: Screenshot after team deletion
- **Action:** `take_screenshot` of teams list and agent list
- **Goal:** Visual record showing team removed, agents reverted
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S053-team-deleted.png`

---

## Phase 8: Remove MANAGER -- Team Blocking

#### S054: Create a new team for blocking test
- **Action:** Open team creation dialog, enter name `scen-test-blocking-team`, submit
- **Goal:** New team created (MANAGER still exists from Phase 2)
- **Creates:** Team `scen-test-blocking-team` with auto-COS
- **Modifies:** Teams registry, agent registry (new COS agent)
- **Verify:** Team appears in teams list, not blocked

#### S055: Record blocking team COS name
- **Action:** Note the auto-COS agent name for this team
- **Goal:** Have the agent name for cleanup
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** COS agent name recorded

#### S056: Click on `scen-test-manager` in sidebar
- **Action:** Click the MANAGER agent
- **Goal:** Profile panel shows MANAGER agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows MANAGER

#### S057: Open Title Assignment Dialog for MANAGER agent
- **Action:** Click the MANAGER title badge
- **Goal:** Title dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible

#### S058: Change title to AUTONOMOUS (remove MANAGER)
- **Action:** Select AUTONOMOUS, click Confirm, enter governance password `mYkri1-xoxrap-gogtan`, submit
- **Goal:** MANAGER title removed, agent becomes AUTONOMOUS. Blocking cascade triggers (R9.8).
- **Creates:** nothing
- **Modifies:** Agent title (MANAGER -> AUTONOMOUS), governance state (hasManager: false), all teams blocked, team agents hibernated
- **Verify:** Title badge shows AUTONOMOUS, role-plugin removed

#### S059: Verify governance shows no MANAGER
- **Action:** Check `GET /api/governance`
- **Goal:** `hasManager: false`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API confirms no MANAGER

#### S060: Verify teams are blocked
- **Action:** Check `GET /api/teams`
- **Goal:** All teams have `blocked: true` (R9.2)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Every team in API response has `blocked: true`

#### S061: Verify team agents are hibernated
- **Action:** Check the COS agent of `scen-test-blocking-team` via API or UI
- **Goal:** Agent is hibernated (no active tmux session) (R9.4)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent status is offline/hibernated

#### S062: Attempt to wake a team agent
- **Action:** Try to wake the COS agent of the blocked team via UI (click wake/start button if available)
- **Goal:** Wake attempt fails because no MANAGER exists (R10.5)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Error message displayed indicating MANAGER required. Agent remains hibernated.

#### S063: Screenshot of blocked state
- **Action:** `take_screenshot` showing blocked teams and hibernated agents
- **Goal:** Visual record of blocking cascade
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S063-blocked-state.png`

---

## Phase CLEANUP: Restore Original State

#### S064: Re-assign MANAGER to unblock teams for cleanup
- **Action:** Open title dialog for `scen-test-manager`, select MANAGER, enter governance password, confirm
- **Goal:** MANAGER restored so teams can be deleted
- **Removes:** nothing
- **Verify:** `GET /api/governance` shows `hasManager: true`

#### S064b: Delete team `scen-test-blocking-team` with "Delete Agents Too"
- **Action:** Navigate to Teams tab, click delete on `scen-test-blocking-team`. First dialog: "Are you sure?" → click Delete. Second dialog: "Do you want to delete also all the agents belonging to the team?" → click "Delete Agents Too".
- **Goal:** Team AND all its agents (including auto-COS) deleted from registry
- **Removes:** Team `scen-test-blocking-team`, all its agents (auto-COS, any members)
- **Verify:** Team gone from `GET /api/teams`, auto-COS agent gone from `GET /api/agents`

#### S065: Remove MANAGER title from `scen-test-manager`
- **Action:** Open title dialog for `scen-test-manager`, select AUTONOMOUS, enter governance password, confirm
- **Goal:** Agent reverted to AUTONOMOUS, no MANAGER on host
- **Removes:** MANAGER title assignment
- **Verify:** Title shows AUTONOMOUS, `GET /api/governance` shows `hasManager: false`

#### S066: Delete test agent `scen-test-manager`
- **Action:** Click delete button in profile panel for `scen-test-manager`, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Removes:** Agent `scen-test-manager` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S067: Delete test agent `scen-test-team-member`
- **Action:** Click delete button in profile panel for `scen-test-team-member`, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Removes:** Agent `scen-test-team-member` from registry
- **Verify:** Agent no longer in sidebar, API returns 404

#### S068: Delete any remaining auto-COS agents (cos-* prefix)
- **Action:** Check agent list for any agents with `cos-` prefix that were created during this test. Delete each one.
- **Goal:** All auto-generated COS agents from this test removed
- **Removes:** Auto-COS agents created during Phases 3 and 8
- **Verify:** No test-created COS agents remain in registry

#### S069: STATE-WIPE -- Restore configuration files
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

#### S070: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, teams list, profile panel unchanged. Screenshot saved to `tests/scenarios/screenshots/SCEN-005/S070-post-cleanup.png`
