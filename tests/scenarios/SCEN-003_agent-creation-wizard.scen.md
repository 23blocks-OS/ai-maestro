---
number: 3
name: Agent Creation Wizard with Title and Role-Plugin
version: "1.0"
description: >
  Tests the agent creation wizard end-to-end: creating agents with
  specific governance titles (INTEGRATOR, MEMBER) and verifying that
  role-plugins are auto-enforced for locked titles and user-selectable
  for MEMBER. Creates a test team first, then creates two agents via
  the wizard -- one INTEGRATOR (locked plugin) and one MEMBER (with
  the default programmer plugin or a custom plugin if available).
  Validates wizard flow, plugin auto-enforcement, profile panel
  display, and Config tab correctness.
  Covers Phases 9-10 of the original integration test plan.
subsystems:
  - governance (title assignment via wizard)
  - role-plugins (auto-enforcement for locked titles, custom plugin selection)
  - agent-registry (agent creation, team membership)
  - teams-service (team creation for test context)
  - agent-creation-wizard (multi-step wizard flow)
ui_sections:
  - Sidebar -> Agents tab -> "+" Create Agent button
  - Agent Creation Wizard -> Step 1 Client
  - Agent Creation Wizard -> Step 2 Avatar + Name
  - Agent Creation Wizard -> Step 3 Team
  - Agent Creation Wizard -> Step 4 Title
  - Agent Creation Wizard -> Step 5 Role-Plugin
  - Agent Creation Wizard -> Step 6 Summary
  - Sidebar -> Teams tab -> Create Team modal
  - Agent Profile -> Overview tab -> Governance Title
  - Agent Profile -> Config tab -> Role Plugin
data_produced:
  - 1 test team (temporary, created and deleted)
  - 2 test agents (temporary, created and deleted)
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
  - Role-plugin defaults synced (ai-maestro-integrator-agent, ai-maestro-programmer-agent available)
commit: TBD
author: AI Maestro Team
---

# Agent Creation Wizard with Title and Role-Plugin Scenario

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint -- Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/agent-creation-wizard_<timestamp>/`
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

## Phase 1: Create Test Team (0-IMPACT)

#### S006: Switch to Teams tab
- **Action:** Click "Teams" tab in sidebar
- **Goal:** Teams view shown with "Create Team" button
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows "Create Team" button visible

#### S007: Create test team for wizard agents
- **Action:** Click "+ Create Team", fill name `scen-test-wizard-team`, description `Scenario 003 wizard test team`. Do NOT select any agents. Click "Create Team".
- **Goal:** Empty team created (agents will be added via wizard)
- **Creates:** Team `scen-test-wizard-team` in teams registry
- **Modifies:** Teams registry (new entry)
- **Verify:** Team card appears in sidebar showing name `scen-test-wizard-team` with count 0

## Phase 2: Create Agent via Wizard -- INTEGRATOR

#### S008: Open agent creation wizard
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens at Step 1 (Client)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S009: Select Claude Code as client
- **Action:** Click "Claude Code" option in client selector
- **Goal:** Claude Code selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected

#### S010: Advance to Step 2
- **Action:** Click Next
- **Goal:** Step 2 shown: Avatar picker and Name input
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar grid and name text field visible

#### S011: Select avatar and enter name
- **Action:** Click any robot avatar image. Type `scen-test-integrator-rex` in the Name field.
- **Goal:** Avatar selected, name entered
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar highlighted, name field shows `scen-test-integrator-rex`

#### S012: Advance to Step 3
- **Action:** Click Next
- **Goal:** Step 3 shown: Team selection dropdown
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team dropdown or selection list visible

#### S013: Select test team
- **Action:** Select `scen-test-wizard-team` from team dropdown/list
- **Goal:** Team selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team name shown as selected

#### S014: Advance to Step 4
- **Action:** Click Next
- **Goal:** Step 4 shown: Title selection (filtered by team membership)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title options visible: MEMBER, CHIEF-OF-STAFF, ORCHESTRATOR, ARCHITECT, INTEGRATOR

#### S015: Select INTEGRATOR title
- **Action:** Click INTEGRATOR option
- **Goal:** INTEGRATOR selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** INTEGRATOR option highlighted/selected

#### S016: Advance to Step 5
- **Action:** Click Next
- **Goal:** Step 5 shown: Role-plugin selection
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Role-plugin picker visible

#### S017: Verify role-plugin is auto-enforced
- **Action:** Inspect the role-plugin selection
- **Goal:** `ai-maestro-integrator-agent` is auto-selected and locked (INTEGRATOR title enforces this plugin)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin shown as pre-selected, possibly with lock icon or "Required by INTEGRATOR" text. User cannot change selection.

#### S018: Complete wizard
- **Action:** Click Next to reach Summary (Step 6), then click Create/Finish
- **Goal:** Agent created with INTEGRATOR title, plugin installed, added to team
- **Creates:** Agent `scen-test-integrator-rex` in registry, plugin entry in settings.local.json
- **Modifies:** Agent registry (new entry), team agentIds (agent added)
- **Verify:** Wait 5s, wizard closes

#### S019: Verify agent in sidebar
- **Action:** Look for `scen-test-integrator-rex` in the agent list under `scen-test-wizard-team`
- **Goal:** Agent card visible under team grouping
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows agent card under team header

#### S020: Verify agent profile -- title
- **Action:** Click on `scen-test-integrator-rex` in the agent list
- **Goal:** Profile panel opens, title is INTEGRATOR
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows "INTEGRATOR"

#### S021: Verify agent profile -- role-plugin
- **Action:** Click "Config" tab in profile panel
- **Goal:** Role Plugin section shows `ai-maestro-integrator-agent` locked by INTEGRATOR
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name displayed with lock indicator

## Phase 3: Create Agent via Wizard -- MEMBER with Role-Plugin

#### S022: Check for available custom role-plugins
- **Action:** Verify `~/agents/role-plugins/` for custom plugins compatible with MEMBER title (via API: `GET /api/agents/role-plugins?title=MEMBER&client=claude-code` or filesystem check)
- **Goal:** Determine if a custom plugin is available, or if the default `ai-maestro-programmer-agent` will be used
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Record the plugin name to use (custom if available, otherwise `ai-maestro-programmer-agent`)

#### S023: Open agent creation wizard
- **Action:** Click the "+" button in sidebar header
- **Goal:** Wizard opens at Step 1
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Wizard dialog visible

#### S024: Select Claude Code as client
- **Action:** Click "Claude Code" option
- **Goal:** Client selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Claude Code highlighted

#### S025: Enter avatar and name
- **Action:** Click Next, select any avatar, type `scen-test-member-zeta` in Name field
- **Goal:** Avatar and name set
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar highlighted, name shows `scen-test-member-zeta`

#### S026: Select team
- **Action:** Click Next, select `scen-test-wizard-team` from team dropdown
- **Goal:** Team selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Team name shown

#### S027: Select MEMBER title
- **Action:** Click Next, select MEMBER from title options
- **Goal:** MEMBER selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** MEMBER option highlighted

#### S028: Select role-plugin
- **Action:** Click Next to reach role-plugin step. If a custom plugin was found in S022, select it. Otherwise, verify `ai-maestro-programmer-agent` is available as default and select it.
- **Goal:** Role-plugin selected (custom or default programmer)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin shown as selected. Unlike INTEGRATOR, MEMBER title allows user choice (not locked).

#### S029: Complete wizard
- **Action:** Click Next to Summary, then Create/Finish
- **Goal:** Agent created with MEMBER title and selected role-plugin
- **Creates:** Agent `scen-test-member-zeta` in registry, plugin entry in settings.local.json
- **Modifies:** Agent registry (new entry), team agentIds (agent added)
- **Verify:** Wait 5s, wizard closes

#### S030: Verify agent in sidebar
- **Action:** Look for `scen-test-member-zeta` in agent list under `scen-test-wizard-team`
- **Goal:** Agent card visible under team grouping
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows agent card under team header

#### S031: Verify agent profile -- title
- **Action:** Click on `scen-test-member-zeta`
- **Goal:** Profile panel opens, title is MEMBER
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Title badge shows "MEMBER"

#### S032: Verify agent profile -- role-plugin
- **Action:** Click "Config" tab
- **Goal:** Role Plugin section shows the selected plugin (custom or `ai-maestro-programmer-agent`)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name displayed. If MEMBER, plugin is NOT locked (user can change it later).

## Phase 4: Verify Plugin Elements in Config Tab

#### S033: Inspect Config tab for scen-test-integrator-rex
- **Action:** Click on `scen-test-integrator-rex` in sidebar, click "Config" tab
- **Goal:** Config tab loads with all plugin element sections
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Role Plugin, Skills, Agents, Hooks, Rules, Commands, MCP Servers sections visible

#### S034: Verify Skills section
- **Action:** Expand "Skills" section in Config tab
- **Goal:** Skills from the `ai-maestro-integrator-agent` plugin listed with counts
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Skills count matches what the plugin actually contains

#### S035: Verify other element sections
- **Action:** Expand Agents, Hooks, Rules, Commands, MCP Servers sections
- **Goal:** Each section shows correct element count from the plugin (may be 0 for some)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Element counts are accurate (cross-reference with plugin contents if needed)

## Phase CLEANUP: Restore Original State

#### S036: Delete scen-test-integrator-rex
- **Action:** Click on `scen-test-integrator-rex` in sidebar, click delete button in profile panel, confirm deletion
- **Goal:** Agent fully removed from registry and team
- **Creates:** nothing
- **Modifies:** Agent registry (entry removed), team agentIds (agent removed)
- **Verify:** Agent no longer appears in sidebar

#### S037: Delete scen-test-member-zeta
- **Action:** Click on `scen-test-member-zeta` in sidebar, click delete button in profile panel, confirm deletion
- **Goal:** Agent fully removed from registry and team
- **Creates:** nothing
- **Modifies:** Agent registry (entry removed), team agentIds (agent removed)
- **Verify:** Agent no longer appears in sidebar

#### S038: Delete scen-test-wizard-team
- **Action:** Switch to "Teams" tab, find `scen-test-wizard-team` team card, click delete icon, confirm deletion
- **Goal:** Test team fully removed from teams registry
- **Creates:** nothing
- **Modifies:** Teams registry (entry removed)
- **Verify:** Team card no longer appears in sidebar

#### S039: STATE-WIPE -- Restore configuration files
- **Action:** Compare current config files with backups from S002. If any differ, restore from backup.
- **Goal:** All config files match pre-test state
- **Creates:** nothing
- **Modifies:** Config files (restored to backup state if changed)
- **Verify:** File hash comparison -- all match

#### S040: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot -- sidebar, agent list, team list unchanged
