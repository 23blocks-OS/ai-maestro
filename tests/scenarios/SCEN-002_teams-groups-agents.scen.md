---
number: 2
name: Teams, Groups, and Agent Title Lifecycle
version: "1.0"
description: >
  Tests the full team lifecycle through the UI: creating a team with
  test agents, verifying title auto-assignment on team join (MEMBER),
  COS assignment, ORCHESTRATOR title assignment with role-plugin
  auto-install, removing an agent from a team (title reverts to
  AUTONOMOUS, plugin uninstalled), re-adding and re-assigning
  ORCHESTRATOR, and singleton constraint enforcement (COS and
  ORCHESTRATOR slots shown disabled when already taken).
  Covers Phases 1-8 of the original integration test plan.
subsystems:
  - governance (title transitions, singleton constraints)
  - role-plugins (auto-install, auto-uninstall, plugin swap)
  - agent-registry (team membership, governanceTitle field)
  - teams-service (create, edit, add/remove agents)
ui_sections:
  - Sidebar -> Teams tab -> Create Team modal
  - Sidebar -> Teams tab -> Edit Team modal
  - Sidebar -> Agents tab -> Agent list (grouped by team)
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Overview tab -> Team field
  - Agent Profile -> Config tab -> Role Plugin
  - Title Assignment Dialog (radio cards, singleton disable)
  - Governance Password Dialog
data_produced:
  - 2 test agents (temporary, created and deleted)
  - 1 test team (temporary, created and deleted)
  - Agent registry entries (temporary, cleaned up)
  - Team entries (temporary, cleaned up)
  - Plugin settings.local.json modifications (restored)
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
  - ai-maestro-plugins marketplace registered (Emasoft/ai-maestro-plugins)
commit: TBD
author: AI Maestro Team
---

# Teams, Groups, and Agent Title Lifecycle Scenario

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/teams-groups-agents_<timestamp>/`
- **Goal:** Copies of the following saved: `~/.claude/settings.json`, `~/.claude/settings.local.json`, `~/.aimaestro/governance.json`, `~/.aimaestro/agents/registry.json`, `~/.aimaestro/teams/teams.json`, `~/.aimaestro/teams/groups.json`
- **Creates:** Backup directory with config copies
- **Modifies:** nothing
- **Verify:** Backup files exist and match originals (hash comparison)

#### S003: Build and verify server
- **Action:** `yarn build && pm2 restart ai-maestro`, wait 4s, check `GET /api/sessions` returns 200
- **Goal:** Server running and healthy
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API returns session list (HTTP 200)

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
- **Verify:** Screenshot saved

## Phase 1: Create Test Agents (0-IMPACT)

#### S006: Open agent creation wizard
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S007: Create first test agent -- scen-test-agent-alpha
- **Action:** Select "Claude Code" as client, click Next. Enter name `scen-test-agent-alpha`, click Next through remaining steps (no team, default AUTONOMOUS title, no role-plugin). Click Create/Finish.
- **Goal:** Agent `scen-test-agent-alpha` created as AUTONOMOUS with no team
- **Creates:** Agent `scen-test-agent-alpha` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** Agent appears in sidebar agent list

#### S008: Verify scen-test-agent-alpha in sidebar
- **Action:** Click on `scen-test-agent-alpha` in the agent list
- **Goal:** Profile panel shows agent details, title is AUTONOMOUS, no team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile heading shows `scen-test-agent-alpha`, title badge shows AUTONOMOUS, team shows "No team"

#### S009: Open agent creation wizard again
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible

#### S010: Create second test agent -- scen-test-agent-beta
- **Action:** Select "Claude Code" as client, click Next. Enter name `scen-test-agent-beta`, click Next through remaining steps (no team, default AUTONOMOUS title, no role-plugin). Click Create/Finish.
- **Goal:** Agent `scen-test-agent-beta` created as AUTONOMOUS with no team
- **Creates:** Agent `scen-test-agent-beta` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** Agent appears in sidebar agent list

#### S011: Verify scen-test-agent-beta in sidebar
- **Action:** Click on `scen-test-agent-beta` in the agent list
- **Goal:** Profile panel shows agent details, title is AUTONOMOUS, no team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile heading shows `scen-test-agent-beta`, title badge shows AUTONOMOUS

## Phase 2: Team Creation

#### S012: Switch to Teams tab
- **Action:** Click "Teams" tab in sidebar
- **Goal:** Teams view shown with "Create Team" button
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows "Create Team" button visible

#### S013: Open Create Team modal
- **Action:** Click "+ Create Team" button
- **Goal:** Create Team modal opens with Name, Description, and agent multi-select fields
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Modal visible with heading "Create Team", name textbox, description textbox, agent selection list

#### S014: Fill team name
- **Action:** Type `scen-test-team-alpha` in the Name field
- **Goal:** Name field populated
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Name field shows `scen-test-team-alpha`

#### S015: Fill team description
- **Action:** Type `Scenario 002 integration testing team` in the Description field
- **Goal:** Description field populated
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Description field shows entered text

#### S016: Select scen-test-agent-alpha
- **Action:** Click `scen-test-agent-alpha` in the agents multi-select list
- **Goal:** Agent highlighted, selected count = 1
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent button highlighted, count text shows "1 selected"

#### S017: Select scen-test-agent-beta
- **Action:** Click `scen-test-agent-beta` in the agents multi-select list
- **Goal:** Agent highlighted, selected count = 2
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Agent button highlighted, count text shows "2 selected"

#### S018: Submit Create Team
- **Action:** Click "Create Team" submit button
- **Goal:** Modal closes, team created via `POST /api/teams`, team card appears in sidebar
- **Creates:** Team `scen-test-team-alpha` in teams registry
- **Modifies:** Teams registry (new entry), both agents' team membership and title
- **Verify:** Wait 2s, team card visible in sidebar showing name `scen-test-team-alpha` and count "2"

#### S019: Verify team card shows description
- **Action:** Inspect the `scen-test-team-alpha` team card in sidebar
- **Goal:** Description text visible on team card
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows "Scenario 002 integration testing team" on the card

## Phase 3: Agent Title Auto-Assignment on Team Join

#### S020: Switch to Agents tab
- **Action:** Click "Agents" tab in sidebar
- **Goal:** Agent list shown, grouped by team
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows "Agents" tab active

#### S021: Verify team group header
- **Action:** Look for `SCEN-TEST-TEAM-ALPHA` group header in agent list
- **Goal:** Both test agents grouped under the team heading with count 2
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows team name header with count "2"

#### S022: Check scen-test-agent-alpha title
- **Action:** Click on `scen-test-agent-alpha` in the agent list
- **Goal:** Profile panel opens, title auto-transitioned to MEMBER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows "MEMBER" (was AUTONOMOUS before joining team)

#### S023: Verify team membership in profile
- **Action:** Scroll to "Team" section in profile Overview tab
- **Goal:** Team shows `scen-test-team-alpha`
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team field displays `scen-test-team-alpha` (not "No team")

## Phase 4: COS Assignment

#### S024: Check team COS status
- **Action:** Verify team data (via team card or API check) for chiefOfStaffId
- **Goal:** Confirm no COS was auto-created (sidebar quick-create does not set COS)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** chiefOfStaffId is null (expected for sidebar quick-create)

#### S025: Click on scen-test-agent-beta
- **Action:** Click `scen-test-agent-beta` in the agent list
- **Goal:** Profile panel opens for scen-test-agent-beta
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile heading shows `scen-test-agent-beta`

#### S026: Open Title Assignment Dialog
- **Action:** Click the Governance Title badge/button (showing MEMBER)
- **Goal:** Title Assignment Dialog opens with team-specific titles
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows MEMBER, CHIEF-OF-STAFF, ORCHESTRATOR, ARCHITECT, INTEGRATOR options

#### S027: Select CHIEF-OF-STAFF
- **Action:** Click CHIEF-OF-STAFF radio card
- **Goal:** COS selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on CHIEF-OF-STAFF card

#### S028: Enter governance password and confirm
- **Action:** Click Confirm, password dialog appears. Type `<governance-password>`, click Confirm.
- **Goal:** Title changes to CHIEF-OF-STAFF, COS role-plugin auto-installed
- **Creates:** Plugin entry in agent's settings.local.json
- **Modifies:** Agent governanceTitle (MEMBER -> CHIEF-OF-STAFF), team chiefOfStaffId, plugin state
- **Verify:** Profile shows CHIEF-OF-STAFF badge

#### S029: Verify COS role-plugin installed
- **Action:** Click "Config" tab in profile panel
- **Goal:** Role Plugin section shows `ai-maestro-chief-of-staff` with lock indicator
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name `ai-maestro-chief-of-staff` displayed, "Locked by CHIEF-OF-STAFF" text visible

## Phase 5: Assign ORCHESTRATOR Title

#### S030: Click on scen-test-agent-alpha
- **Action:** Click `scen-test-agent-alpha` in the agent list
- **Goal:** Profile panel opens for scen-test-agent-alpha
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile heading shows `scen-test-agent-alpha`

#### S031: Open Title Assignment Dialog
- **Action:** Click the Governance Title badge (showing MEMBER)
- **Goal:** Title Assignment Dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with title options

#### S032: Verify ORCHESTRATOR is available
- **Action:** Inspect ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR option is visible and ENABLED (no one has it yet)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** ORCHESTRATOR card is not grayed out, is clickable

#### S033: Select ORCHESTRATOR and confirm with password
- **Action:** Click ORCHESTRATOR, click Confirm. Enter `<governance-password>` in password dialog, submit.
- **Goal:** Title changes to ORCHESTRATOR, orchestrator role-plugin auto-installed
- **Creates:** Plugin entry in agent's settings.local.json
- **Modifies:** Agent governanceTitle (MEMBER -> ORCHESTRATOR), plugin state
- **Verify:** Profile shows ORCHESTRATOR badge

#### S034: Verify ORCHESTRATOR role-plugin
- **Action:** Click "Config" tab in profile panel
- **Goal:** Role Plugin section shows `ai-maestro-orchestrator-agent` locked by ORCHESTRATOR
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name `ai-maestro-orchestrator-agent` displayed with lock indicator

## Phase 6: Remove Agent from Team

#### S035: Switch to Teams tab
- **Action:** Click "Teams" tab in sidebar
- **Goal:** Teams view shown
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows teams list

#### S036: Open Edit Team modal
- **Action:** Hover over `scen-test-team-alpha` team card, click edit (pencil) icon
- **Goal:** Edit team modal opens with both test agents pre-selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Modal shows `scen-test-agent-alpha` and `scen-test-agent-beta` selected

#### S037: Remove scen-test-agent-alpha from team
- **Action:** Click `scen-test-agent-alpha` to deselect
- **Goal:** Agent unhighlighted, count decreases to 1
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows count "1 selected"

#### S038: Save team changes
- **Action:** Click "Save" / "Update Team" button
- **Goal:** Modal closes, team updated with only scen-test-agent-beta
- **Creates:** nothing
- **Modifies:** Team agentIds (alpha removed), alpha's team membership, alpha's title (-> AUTONOMOUS), alpha's plugin (uninstalled)
- **Verify:** Wait 2s, team card shows count 1

#### S039: Verify scen-test-agent-alpha reverted to AUTONOMOUS
- **Action:** Switch to "Agents" tab, click on `scen-test-agent-alpha`
- **Goal:** Agent's title reverted to AUTONOMOUS, no team, no role-plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows "AUTONOMOUS", team shows "No team"

#### S040: Verify role-plugin removed
- **Action:** Click "Config" tab in profile panel
- **Goal:** No locked role-plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Role Plugin section shows "None" or is empty

## Phase 7: Re-add Agent and Re-assign ORCHESTRATOR

#### S041: Edit team to re-add scen-test-agent-alpha
- **Action:** Switch to "Teams" tab, click edit on `scen-test-team-alpha`, select `scen-test-agent-alpha`, save
- **Goal:** Alpha re-added to team, title auto-transitions to MEMBER
- **Creates:** nothing
- **Modifies:** Team agentIds (alpha added back), alpha's team membership, alpha's title (-> MEMBER)
- **Verify:** Team card shows count 2

#### S042: Verify scen-test-agent-alpha is MEMBER again
- **Action:** Switch to "Agents" tab, click on `scen-test-agent-alpha`
- **Goal:** Title shows MEMBER (auto-assigned on team rejoin)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows "MEMBER"

#### S043: Re-assign ORCHESTRATOR title
- **Action:** Click title badge, select ORCHESTRATOR, confirm with `<governance-password>`
- **Goal:** Title changes back to ORCHESTRATOR, plugin re-installed
- **Creates:** Plugin entry in settings.local.json
- **Modifies:** Agent governanceTitle (MEMBER -> ORCHESTRATOR), plugin state
- **Verify:** Title badge shows "ORCHESTRATOR"

#### S044: Verify role-plugin restored
- **Action:** Click "Config" tab
- **Goal:** Role Plugin shows `ai-maestro-orchestrator-agent` locked by ORCHESTRATOR
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name and lock indicator visible

## Phase 8: Singleton Constraint Checks

#### S045: Open title dialog for scen-test-agent-beta (COS agent)
- **Action:** Click on `scen-test-agent-beta` in agent list, click Governance Title badge
- **Goal:** Title Assignment Dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible with title options

#### S046: Verify ORCHESTRATOR option is DISABLED
- **Action:** Inspect ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR is grayed out / not selectable because scen-test-agent-alpha holds the slot
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** ORCHESTRATOR card shows disabled state with explanation text (e.g. "Already assigned" or "Only one ORCHESTRATOR per team")

#### S047: Verify CHIEF-OF-STAFF shows as current
- **Action:** Inspect CHIEF-OF-STAFF radio card
- **Goal:** COS is shown as the current/active selection (scen-test-agent-beta IS the COS)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** CHIEF-OF-STAFF card shown as active/selected

#### S048: Close title dialog
- **Action:** Click Cancel or close button
- **Goal:** Dialog dismissed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog gone, profile panel visible

## Phase CLEANUP: Restore Original State

#### S049: Delete scen-test-agent-alpha
- **Action:** Click on `scen-test-agent-alpha` in sidebar, click delete button in profile panel, confirm deletion
- **Goal:** Test agent fully removed from registry and team
- **Creates:** nothing
- **Modifies:** Agent registry (entry removed), team agentIds (alpha removed)
- **Verify:** Agent no longer appears in sidebar

#### S050: Delete scen-test-agent-beta
- **Action:** Click on `scen-test-agent-beta` in sidebar, click delete button in profile panel, confirm deletion
- **Goal:** Test agent fully removed from registry and team
- **Creates:** nothing
- **Modifies:** Agent registry (entry removed), team agentIds (beta removed), team chiefOfStaffId (cleared)
- **Verify:** Agent no longer appears in sidebar

#### S051: Delete scen-test-team-alpha
- **Action:** Switch to "Teams" tab, find `scen-test-team-alpha` team card, click delete icon, confirm deletion
- **Goal:** Test team fully removed from teams registry
- **Creates:** nothing
- **Modifies:** Teams registry (entry removed)
- **Verify:** Team card no longer appears in sidebar

#### S052: STATE-WIPE -- Restore configuration files
- **Action:** Compare current config files with backups from S002. If any differ, restore from backup.
- **Goal:** All config files match pre-test state
- **Creates:** nothing
- **Modifies:** Config files (restored to backup state if changed)
- **Verify:** File hash comparison -- all match

#### S053: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, team list unchanged
