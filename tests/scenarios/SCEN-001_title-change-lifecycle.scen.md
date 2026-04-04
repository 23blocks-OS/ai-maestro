---
number: 1
name: Title Change Lifecycle
version: "1.0"
description: >
  Tests the full governance title change lifecycle through the UI:
  creating a test agent, assigning titles (ORCHESTRATOR, ARCHITECT),
  verifying role-plugin auto-install/swap/removal, verifying singleton
  constraints (disabled options in dialog), and reverting to AUTONOMOUS.
  Validates the ChangeTitle 23-gate pipeline end-to-end via browser.
subsystems:
  - governance (ChangeTitle pipeline)
  - role-plugins (auto-install, auto-uninstall, singleton enforcement)
  - agent-registry (governanceTitle field)
  - element-management-service
ui_sections:
  - Sidebar → Agents tab → Agent list
  - Agent Profile → Overview tab → Governance Title
  - Agent Profile → Config tab → Role Plugin
  - Title Assignment Dialog (radio cards, password prompt)
  - Governance Password Dialog
data_produced:
  - 1 test agent (temporary, created and deleted)
  - Plugin settings.local.json modifications (temporary, cleaned up)
  - Agent registry entry (temporary, deleted)
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
  - At least 1 existing team with available slots
commit: TBD
author: AI Maestro Team
---

# Title Change Lifecycle Scenario

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint — Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/title-change-lifecycle_<timestamp>/`
- **Goal:** Copies of settings.json, registry.json, teams.json, governance.json saved
- **Creates:** Backup directory with config copies
- **Modifies:** nothing
- **Verify:** Backup files exist and match originals (hash comparison)

#### S003: Build and verify server
- **Action:** `yarn build && pm2 restart ai-maestro`, wait 4s, check `/api/sessions`
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
- **Verify:** Screenshot saved

## Phase 1: Create Test Agent (0-IMPACT)

#### S006: Click "Create new agent" button
- **Action:** Click the "+" button in sidebar header
- **Goal:** Agent creation wizard opens
- **Creates:** nothing (wizard only)
- **Modifies:** nothing
- **Verify:** Wizard dialog visible with client selection step

#### S007: Select Claude Code as client
- **Action:** Click "Claude Code" option in client selector
- **Goal:** Claude Code selected
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Option highlighted/selected

#### S008: Click Next
- **Action:** Click Next button
- **Goal:** Advances to avatar/name step
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Avatar picker and name input visible

#### S009: Enter test agent name
- **Action:** Type `scen-test-title-agent` in the name field
- **Goal:** Name entered, unique on this host
- **Creates:** nothing (not created yet)
- **Modifies:** nothing
- **Verify:** Name field shows `scen-test-title-agent`

#### S010: Click Next through remaining wizard steps
- **Action:** Click Next through team selection (skip/no team), title (leave as default), finish
- **Goal:** Agent created as AUTONOMOUS with no team
- **Creates:** Agent `scen-test-title-agent` in registry
- **Modifies:** Agent registry (new entry)
- **Verify:** New agent appears in sidebar agent list

#### S011: Click on the new test agent in sidebar
- **Action:** Click `scen-test-title-agent` in agent list
- **Goal:** Profile panel shows the new agent's details
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel heading shows `scen-test-title-agent`, title is AUTONOMOUS

## Phase 2: Assign ORCHESTRATOR Title

#### S012: Click "ASSIGN TITLE" button in profile panel
- **Action:** Click the title button/badge showing current title
- **Goal:** Title Assignment Dialog opens with radio cards
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows AUTONOMOUS and MANAGER options (agent is not in a team → standalone titles only)

#### S013: Verify only standalone titles are shown
- **Action:** Inspect dialog options
- **Goal:** Only AUTONOMOUS and MANAGER should be visible (agent has no team → team titles hidden)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** No ORCHESTRATOR/ARCHITECT/INTEGRATOR/MEMBER/COS options shown

#### S014: Cancel dialog and add agent to existing team first
- **Action:** Cancel title dialog, click "Reassign" button next to Team field, select an existing team
- **Goal:** Agent joins a team, title auto-transitions to MEMBER
- **Creates:** nothing (joining existing team)
- **Modifies:** Team membership (agent added), agent title (→ MEMBER)
- **Verify:** Team name shown in profile, title badge shows MEMBER

#### S015: Click title badge (now showing MEMBER)
- **Action:** Click the MEMBER title button
- **Goal:** Title dialog opens with team-specific titles
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows MEMBER, CHIEF-OF-STAFF, ORCHESTRATOR, ARCHITECT, INTEGRATOR

#### S016: Select ORCHESTRATOR
- **Action:** Click ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR selected, Confirm button enabled
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Blue border on ORCHESTRATOR card, Confirm not disabled

#### S017: Click Confirm
- **Action:** Click Confirm button
- **Goal:** Password dialog appears
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** "Enter Governance Password" dialog with input field

#### S018: Enter governance password and submit
- **Action:** Type governance password, click Confirm
- **Goal:** Title changes to ORCHESTRATOR, role-plugin installed
- **Creates:** Plugin entry in agent's settings.local.json
- **Modifies:** Agent governanceTitle in registry, plugin state
- **Verify:** Profile shows ORCHESTRATOR badge, plugin banner shows `ai-maestro-orchestrator-agent`

## Phase 3: Swap to ARCHITECT

#### S019: Click ORCHESTRATOR title badge
- **Action:** Click the title button showing ORCHESTRATOR
- **Goal:** Title dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog shows with ORCHESTRATOR pre-selected

#### S020: Select ARCHITECT and confirm with password
- **Action:** Select ARCHITECT, click Confirm, enter password, submit
- **Goal:** Title swaps to ARCHITECT, plugin swaps to architect
- **Creates:** nothing (plugin swap)
- **Modifies:** Agent title (→ ARCHITECT), plugin (orchestrator → architect)
- **Verify:** Profile shows ARCHITECT badge, plugin banner shows `ai-maestro-architect-agent`

#### S021: Verify only ONE role-plugin installed
- **Action:** Click Config tab in profile panel
- **Goal:** Only `ai-maestro-architect-agent` in plugin list, no orchestrator plugin
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Config tab shows exactly 1 role-plugin: architect

## Phase 4: Revert to MEMBER (no plugin)

#### S022: Click ARCHITECT title badge → select MEMBER → password
- **Action:** Open title dialog, select MEMBER, confirm with password
- **Goal:** Title reverts to MEMBER, ALL role-plugins removed
- **Creates:** nothing
- **Modifies:** Agent title (→ MEMBER, stored as null), plugins (all removed)
- **Verify:** Profile shows MEMBER badge, plugin banner shows "No Role Plugin"

#### S023: Verify Config tab shows no role-plugins
- **Action:** Click Config tab
- **Goal:** No role-plugins in the plugin section
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Config tab shows empty or "No Role Plugin" for the role section

## Phase 5: Singleton Constraint Check

#### S024: Assign ORCHESTRATOR to test agent again
- **Action:** Open title dialog, select ORCHESTRATOR, password
- **Goal:** Test agent is now ORCHESTRATOR
- **Creates:** Plugin entry
- **Modifies:** Agent title, plugin
- **Verify:** ORCHESTRATOR badge visible

#### S025: Switch to a DIFFERENT agent in the same team
- **Action:** Click on another agent that is in the same team
- **Goal:** Profile panel shows the other agent
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Different agent's profile loaded

#### S026: Open title dialog for the other agent
- **Action:** Click their title badge
- **Goal:** Title dialog opens
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog visible

#### S027: Verify ORCHESTRATOR option is DISABLED
- **Action:** Inspect ORCHESTRATOR radio card
- **Goal:** ORCHESTRATOR is grayed out / not selectable, with explanation text
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** ORCHESTRATOR card shows disabled state with message like "Only one Orchestrator allowed"

#### S028: Close the dialog
- **Action:** Click Cancel
- **Goal:** Dialog dismissed
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Dialog gone

## Phase CLEANUP: Restore Original State

#### S029: Switch back to test agent
- **Action:** Click `scen-test-title-agent` in sidebar
- **Goal:** Test agent's profile shown
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Profile panel shows test agent

#### S030: Revert title to AUTONOMOUS
- **Action:** Open title dialog, leave team first (click "Leave team"), then verify title auto-reverts
- **Goal:** Agent removed from team, title becomes AUTONOMOUS, all plugins removed
- **Creates:** nothing
- **Modifies:** Team membership (removed), agent title (→ AUTONOMOUS), plugins (cleared)
- **Verify:** Title shows AUTONOMOUS, no team, no role-plugin

#### S031: Delete test agent
- **Action:** Click delete button in profile panel, confirm deletion
- **Goal:** Test agent fully removed from registry
- **Creates:** nothing
- **Modifies:** Agent registry (entry removed)
- **Verify:** Agent no longer appears in sidebar, API returns 404 for agent ID

#### S032: STATE-WIPE — Restore configuration files
- **Action:** Compare current config files with backups from S002. If any differ, restore from backup.
- **Goal:** All config files match pre-test state
- **Creates:** nothing
- **Modifies:** Config files (restored to backup state)
- **Verify:** File hash comparison — all match

#### S033: Take post-test screenshot and compare with S005
- **Action:** `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S005 screenshot — sidebar, agent list, profile panel unchanged
