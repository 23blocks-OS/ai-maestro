---
number: 4
name: Haephestos Role-Plugin Creation Pipeline
version: "1.0"
description: >
  Tests the full Haephestos 8-step role-plugin creation pipeline through the UI:
  waking Haephestos, uploading description files, generating TOML via PSS,
  verifying the TOML preview panel shows compatible-titles/clients badges,
  building the plugin, validating with CPV, publishing to the local marketplace,
  and verifying cleanup (session killed, workspace deleted, plugin appears
  in the role-plugin list). Also verifies the mp4 animation loops while
  on the Haephestos page and stops when switching away.
subsystems:
  - creation-helper (Haephestos session lifecycle, persona, permissions)
  - role-plugins (plugin generation, marketplace registration, quad-identity)
  - agent-registry (Haephestos agent entry, workspace cleanup)
  - toml-preview (TOML viewer with compatible-titles/clients badges)
ui_sections:
  - Sidebar → Agents tab → HELPERS section → Haephestos card
  - Haephestos Embedded View (terminal + TOML preview + raw materials panel)
  - TOML Preview Panel (rich view with badges, raw view)
  - Raw Materials Panel (3 file upload slots)
  - Agent Profile → Config tab → Role Plugin list (to verify published plugin)
prerequisites:
  - AI Maestro server running at http://localhost:23000
  - Chrome browser open with DevTools accessible via CDP
  - PSS plugin installed (perfect-skill-suggester in plugin cache)
  - CPV plugin installed (claude-plugins-validation in plugin cache)
  - No pre-existing ~/agents/haephestos/ directory (clean state)
data_produced:
  - Haephestos tmux session (temporary, killed during cleanup)
  - ~/agents/haephestos/ workspace (temporary, deleted during cleanup)
  - 1 test role-plugin in ~/agents/role-plugins/ (temporary, deleted during cleanup)
  - Marketplace manifest update (temporary, reverted during cleanup)
required_tools:
  - mcp__chrome-devtools__navigate_page
  - mcp__chrome-devtools__take_snapshot
  - mcp__chrome-devtools__take_screenshot
  - mcp__chrome-devtools__click
  - mcp__chrome-devtools__fill
  - mcp__chrome-devtools__wait_for
  - mcp__chrome-devtools__type_text
  - mcp__chrome-devtools__upload_file
  - mcp__chrome-devtools__press_key
governance_password: "mYkri1-xoxrap-gogtan"
commit: TBD
author: AI Maestro Team
---

# Haephestos Role-Plugin Creation Pipeline Scenario

## Phase 0: SAFE-SETUP

#### S001: Commit current state
- **Action:** Run `git status` and commit any uncommitted changes
- **Goal:** Clean git state with known commit hash
- **Creates:** nothing
- **Modifies:** git history (new commit if needed)
- **Verify:** `git status` shows clean working tree

#### S002: STATE-WIPE Checkpoint — Save configuration
- **Action:** Backup config files to `tests/scenarios/state-backups/haephestos-plugin_<timestamp>/`
- **Goal:** Copies of: `~/.claude/settings.json`, `~/.claude/settings.local.json`, `~/.aimaestro/agents/registry.json`, `~/agents/role-plugins/.claude-plugin/marketplace.json`
- **Creates:** Backup directory with config copies
- **Modifies:** nothing
- **Verify:** Backup files exist and match originals (hash comparison)

#### S003: Ensure clean workspace
- **Action:** Verify `~/agents/haephestos/` does not exist. If it does, run `POST /api/agents/creation-helper/cleanup` to wipe it.
- **Goal:** No stale Haephestos workspace from previous runs
- **Creates:** nothing
- **Modifies:** nothing (or cleanup of stale state)
- **Verify:** `~/agents/haephestos/` does not exist

#### S004: Build and verify server
- **Action:** `yarn build && pm2 restart ai-maestro`, wait 4s, check `GET /api/sessions` returns 200
- **Goal:** Server running and healthy with latest code
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API returns session list (HTTP 200)

#### S005: Navigate to dashboard
- **Action:** `navigate_page` to `http://localhost:23000`
- **Goal:** Dashboard loads with sidebar and agent list
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot shows AI Maestro dashboard

#### S006: Prepare test input files on disk
- **Action:** Write two test .md files that will be uploaded via the browser in Phase 2:
  - `/tmp/scen-test-role-desc.md`: "Test Role: Scenario Test Agent. Specializes in writing unit tests. Languages: TypeScript, Python. Frameworks: vitest, pytest."
  - `/tmp/scen-test-project-type.md`: "Project Type: Node.js CLI Application. Uses npm, TypeScript, ESLint, vitest."
- **Goal:** Test input files exist on disk, ready for browser upload
- **Creates:** 2 temp files in /tmp/
- **Modifies:** nothing
- **Verify:** Both files exist on disk

#### S007: Take pre-test screenshot (baseline)
- **Action:** `take_screenshot` of full page
- **Goal:** Baseline image for CLEAN-AFTER-YOURSELF verification
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot saved

## Phase 1: Select and Wake Haephestos

#### S008: Find Haephestos in the HELPERS section
- **Action:** In the sidebar agent list, scroll to the bottom. Find the "HELPERS" group section. Click on the Haephestos agent card (`_aim-creation-helper`).
- **Goal:** Haephestos page loads in hibernated state (not yet awake)
- **Creates:** nothing
- **Modifies:** Active agent selection
- **Verify:** Snapshot shows the Haephestos embedded view with terminal area showing a "Wake up" button (agent is offline/hibernated)

#### S009: Verify animation is playing while on page
- **Action:** `take_screenshot` — look for the mp4 video element (not the static .jpg avatar)
- **Goal:** The haephestos-animation.mp4 is playing in a loop in the top-right corner (always on while page is active)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot shows video frame (animated content), not the static haephestos.jpg

#### S010: Wake Haephestos
- **Action:** Click the "Wake up" button in the center of the terminal view. Wait for the session to start (max 30s).
- **Goal:** Haephestos tmux session created, Claude Code launched, agent transitions to online
- **Creates:** Haephestos tmux session `_aim-creation-helper`, agent entry in registry
- **Modifies:** Agent registry, tmux sessions
- **Verify:** Terminal shows Claude prompt or Haephestos greeting. Status indicator shows "Online" or "Active".

#### S011: Verify TOML preview panel is visible
- **Action:** `take_snapshot` to check for "Rich"/"Raw" tabs or TOML preview area
- **Goal:** The left panel with TOML viewer is present
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows TOML preview panel (may show "No TOML file found" initially)

## Phase 2: Provide Input Files via UI

#### S012: Upload role description via UI
- **Action:** `take_snapshot` to find the "Agent Description" upload slot in the Raw Materials panel. Click the browse button for the "Agent Description" slot. Use `upload_file` to select `/tmp/scen-test-role-desc.md`.
- **Goal:** File appears in the "Agent Description" slot
- **Creates:** nothing (file copied to temp upload dir by server)
- **Modifies:** nothing
- **Verify:** Snapshot shows filename in the Agent Description slot

#### S013: Upload project type via UI
- **Action:** Click the browse button for the "Project Design Requirements" slot. Use `upload_file` to select `/tmp/scen-test-project-type.md`.
- **Goal:** File appears in the "Project Design Requirements" slot
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows filename in the Project Design Requirements slot

#### S014: Inject files and instruct Haephestos
- **Action:** Click the "Inject into Chat" button (or equivalent) in the Raw Materials panel to send the files to Haephestos. Then type in the browser terminal input: "Please read the uploaded files and generate a TOML profile for this agent role." Press Enter.
- **Goal:** Haephestos receives the instruction and uploaded file references
- **Creates:** nothing initially
- **Modifies:** nothing
- **Verify:** Terminal shows Haephestos acknowledging the files and starting work

## Phase 3: TOML Generation and Review

#### S015: Wait for TOML to appear in preview panel
- **Action:** Wait up to 120s, watching the TOML preview panel on the left side of the UI. Use `wait_for` with text like `[agent]` or `name =` to detect when the TOML content appears.
- **Goal:** PSS has generated the .agent.toml and the preview panel shows it
- **Creates:** `~/agents/haephestos/toml/<name>.agent.toml`
- **Modifies:** nothing
- **Verify:** TOML preview panel shows parsed content with `[agent]` section visible

#### S016: Take screenshot of TOML preview (rich view)
- **Action:** `take_screenshot` of the page
- **Goal:** Verify the TOML preview panel shows the parsed profile with skill badges
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot shows skills badges, agent section, dependencies in the rich view

#### S017: Verify compatible-titles/clients NOT yet present
- **Action:** Click the "Raw" tab in the TOML preview panel. `take_snapshot` and search for "compatible-titles" text.
- **Goal:** At this stage (before Haephestos Step 6), these fields should NOT be present (PSS doesn't add them)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Raw TOML view does NOT contain "compatible-titles" or "compatible-clients"

#### S018: Approve the TOML via terminal
- **Action:** Click on the terminal input area. Type "Looks good, approved. Please build the plugin." and press Enter.
- **Goal:** Haephestos proceeds to build, add compat fields, validate, and publish
- **Creates:** nothing yet
- **Modifies:** nothing
- **Verify:** Terminal shows Haephestos acknowledging approval and starting build

## Phase 4: Build, Validate, Publish (observe via UI)

#### S019: Wait for build + compat fields (observe terminal)
- **Action:** Watch the terminal output for Haephestos reporting build completion and compatible-titles/clients injection. Use `wait_for` with text like "compatible-titles" or "quad-identity" (max 120s).
- **Goal:** Haephestos has built the plugin and added AI Maestro compat fields
- **Creates:** `~/agents/haephestos/build/<plugin-name>/` with full structure
- **Modifies:** Built plugin's .agent.toml (compat fields added)
- **Verify:** Terminal shows successful build + compat field injection

#### S020: Verify compatible-titles in TOML preview
- **Action:** The TOML preview panel may have updated to show the built plugin's TOML. Click "Rich" tab. `take_snapshot` and look for gold "Titles" badges and blue "Clients" badges.
- **Goal:** The new compatible-titles/clients badges are visible in the rich view
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Snapshot shows "Titles" and "Clients" badge sections (or verify via raw tab)

#### S021: Wait for CPV validation (observe terminal)
- **Action:** Watch terminal for CPV validation output. Use `wait_for` with text like "Plugin Validation" or "PASS" or "cpv-report" (max 180s — CPV can be slow).
- **Goal:** Haephestos ran /cpv-validate-plugin and optionally /cpv-fix-validation
- **Creates:** `~/agents/haephestos/build/cpv-report.md`
- **Modifies:** Plugin files (if fixer ran)
- **Verify:** Terminal shows validation result. Verify via API: `GET /api/agents/creation-helper/toml-preview?path=~/agents/haephestos/build/cpv-report.md` returns `exists: true`

#### S022: Wait for publish completion (observe terminal)
- **Action:** Watch terminal for "published" or "created" message. Also poll signal file via API: `GET /api/agents/creation-helper/toml-preview?path=~/agents/haephestos/creation-signal.json` (max 120s).
- **Goal:** Haephestos called publish-plugin API and wrote completion signal
- **Creates:** `~/agents/haephestos/creation-signal.json`, plugin copied to marketplace
- **Modifies:** Local marketplace manifest
- **Verify:** Signal file has `status: "complete"` and `pluginName` field
- **Goal:** Haephestos has called the publish-plugin API and written the completion signal
- **Creates:** `~/agents/haephestos/creation-signal.json`
- **Modifies:** Local marketplace (plugin copied to `~/agents/role-plugins/`)
- **Verify:** Signal has `status: "complete"` and `pluginName` field

## Phase 5: Verify Published Plugin

#### S023: Verify plugin appears in marketplace
- **Action:** `GET /api/agents/role-plugins` and check the plugin name from the signal is in the list
- **Goal:** The published plugin is discoverable by the system
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** API response includes the test plugin name

#### S024: Verify plugin has compatible-titles and compatible-clients
- **Action:** Read the published plugin's `.agent.toml` from `~/agents/role-plugins/<name>/`
- **Goal:** The marketplace copy has the required fields
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** File contains `compatible-titles = [` and `compatible-clients = [`

#### S025: Verify plugin in wizard filter
- **Action:** `GET /api/agents/role-plugins?title=AUTONOMOUS&client=claude-code` and check the test plugin appears
- **Goal:** The plugin is filterable by title and client
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Plugin name appears in the filtered results

## Phase 6: Verify Cleanup

#### S026: Check Haephestos session was killed
- **Action:** Run `tmux list-sessions` and check `_aim-creation-helper` is NOT present. If still running (UI cleanup may take 3s), manually trigger `POST /api/agents/creation-helper/cleanup`.
- **Goal:** Haephestos tmux session terminated
- **Creates:** nothing
- **Modifies:** Session cleanup
- **Verify:** `_aim-creation-helper` not in tmux session list

#### S027: Check workspace was deleted
- **Action:** Verify `~/agents/haephestos/` does NOT exist
- **Goal:** Ephemeral workspace was cleaned up
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Directory does not exist

#### S028: Verify animation stops when switching away
- **Action:** Navigate to `http://localhost:23000` (main dashboard, away from Haephestos). Take screenshot.
- **Goal:** The mp4 video is no longer playing (Haephestos component unmounted)
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Screenshot shows normal dashboard without the forge animation

## Phase CLEANUP: Restore Original State

#### S029: Delete the test plugin from marketplace
- **Action:** Remove `~/agents/role-plugins/<test-plugin-name>/` directory. Update marketplace manifest to remove the entry.
- **Goal:** Test plugin fully removed
- **Creates:** nothing
- **Modifies:** Marketplace manifest, plugins directory
- **Verify:** Plugin no longer appears in `GET /api/agents/role-plugins`

#### S030: Delete Haephestos agent from registry (if still present)
- **Action:** Check if `_aim-creation-helper` exists in agent registry. If so, `DELETE /api/agents/<id>`.
- **Goal:** No stale Haephestos agent entry
- **Creates:** nothing
- **Modifies:** Agent registry
- **Verify:** Agent not in registry

#### S031: Kill Haephestos tmux session (if still running)
- **Action:** `tmux kill-session -t _aim-creation-helper 2>/dev/null`
- **Goal:** No stale tmux sessions
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Session not in tmux list

#### S032: Delete Haephestos workspace (if still present)
- **Action:** `rm -rf ~/agents/haephestos/` (if exists)
- **Goal:** Clean filesystem
- **Creates:** nothing
- **Modifies:** Filesystem cleanup
- **Verify:** Directory does not exist

#### S033: STATE-WIPE — Restore configuration files
- **Action:** Compare current config files with backups from S002. If any differ, restore from backup.
- **Goal:** All config files match pre-test state
- **Creates:** nothing
- **Modifies:** Config files (restored to backup state if changed)
- **Verify:** File hash comparison — all match

#### S034: Take post-test screenshot and compare with S007
- **Action:** Navigate to `http://localhost:23000`, `take_screenshot` of full page
- **Goal:** UI looks identical to pre-test baseline
- **Creates:** nothing
- **Modifies:** nothing
- **Verify:** Visual comparison with S006 screenshot — sidebar, agent list unchanged
