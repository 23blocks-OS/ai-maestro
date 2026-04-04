# Scenario Tests Rules

All UI scenario tests in AI Maestro MUST follow these rules. No exceptions.

---

## Rule 1: CLEAN-AFTER-YOURSELF

The **last phase** of every scenario MUST revert the system to the exact state it was in before the test started. Every team created, title changed, plugin installed, agent created, group added, or setting modified during the test MUST be undone.

**Undo efficiently, not step-by-step.** If you created a plugin in 30 steps (selecting skills, subagents, MCP, rules, hooks, etc.), you undo it in ONE step: delete the plugin. The goal is to reach the original state, not to reverse-replay every action. Find the shortest path to cleanup.

The cleanup phase steps are numbered and verified just like test steps — they are NOT optional. If a cleanup step fails, it MUST be fixed before the scenario is considered complete.

**Verification:** After cleanup, take a screenshot and compare with the pre-test screenshot. The UI must look identical.

---

## Rule 2: 0-IMPACT

**Never use existing user-created resources** (agents, teams, groups, plugins) for testing. Instead:

1. Create NEW elements specifically for the test (with clearly test-prefixed names, e.g. `scen-test-agent-01`, `scen-test-team-alpha`)
2. Use those test elements for all test operations
3. Remove them completely during cleanup (Rule 1)

This prevents test runs from corrupting the user's real configuration, data, or agent state. After a scenario completes, the system must be indistinguishable from one where the test never ran.

**Exception:** Reading existing state is allowed (e.g., checking how many agents exist). Only MUTATION of existing resources is forbidden.

---

## Rule 3: STATE-WIPE

Configuration files can be modified by side effects (settings.json, settings.local.json, governance.json, etc.). These must be captured and restored.

**Two mandatory checkpoints:**

1. **CHECKPOINT-SAVE (before test begins):** Backup the following files:
   - `~/.claude/settings.json`
   - `~/.claude/settings.local.json`
   - `~/.aimaestro/governance.json`
   - `~/.aimaestro/agents/registry.json`
   - `~/.aimaestro/teams/teams.json`
   - `~/.aimaestro/teams/groups.json`
   - Any agent `<agentDir>/.claude/settings.local.json` that will be touched

   Backups are saved to `tests/scenarios/state-backups/<scenario-name>_<timestamp>/`

2. **CHECKPOINT-RESTORE (during cleanup, after Rule 1 steps):** Restore all backed-up files to their original content. Verify file contents match the backup byte-for-byte.

The scenario report MUST include the backup file list and restoration verification.

---

## Rule 4: FIX-AS-YOU-GO

When a step fails due to a bug or unexpected behavior:

1. **STOP** the scenario at that step
2. **DIAGNOSE** the issue (read logs, check state, inspect DOM)
3. **FIX** the code immediately
4. **REBUILD** (`yarn build`) and restart the server if needed
5. **RETRY** the failed step from the exact same state
6. **LOOP** steps 2-5 until the step passes — no limit on attempts
7. **RESUME** the scenario from the next step

Every fix attempt is logged in the report (Rule 5). The scenario is never abandoned — it either completes fully or runs out of context window.

---

## Rule 5: TRACK-AND-REPORT

The scenario report (`tests/scenarios/reports/<scenario-name>_<timestamp>.report.md`) records:

### For every step:
- Step ID and description
- PASS / FAIL / FIXED status
- Screenshot filename (if taken)
- Timestamp

### For every bug found and fixed:
- Step ID where discovered
- Description of the bug
- Root cause analysis
- Files modified to fix
- Fix verified by: (step ID that passed after fix)

### For every issue noticed but not blocking:
- Step ID where noticed
- Description and severity (WARN / INFO)
- Potential impact if left unfixed
- Suggested fix or investigation

### Report header:
- Scenario name and version
- Commit hash at start
- Commit hash at end (if fixes were committed)
- Start/end timestamps
- Total steps: passed / failed / fixed / skipped
- CLEAN-AFTER-YOURSELF verification: PASS / FAIL
- STATE-WIPE verification: PASS / FAIL

---

## Rule 6: STICK-TO-UI

**NEVER bypass the UI** to achieve a step's goal. All interactions must go through the browser:

- Click buttons, fill forms, select options — via Chrome DevTools CDP or Claude-in-Chrome
- Do NOT call API endpoints directly with `curl` (except for state verification AFTER a UI action)
- Do NOT modify settings files directly
- Do NOT run CLI commands to achieve what the UI should do

If the UI cannot accomplish a step, that is a **BUG** — fix it (Rule 4), don't bypass it.

**Exception:** State verification (reading API responses, checking files) is allowed after a UI action to confirm the backend state matches what the UI shows.

---

## Rule 7: SAFE-SETUP

Before starting a scenario:

1. **COMMIT** all uncommitted changes: `git add <files> && git commit -m "pre-scenario: <name>"`
2. **RECORD** the commit hash in the scenario report
3. **OPTIONALLY** run in a git worktree for full isolation: `git worktree add ../scen-<name> HEAD`
4. **BUILD** the project: `yarn build`
5. **START** the server: `pm2 restart ai-maestro` (or `yarn dev`)
6. **VERIFY** the server is healthy: check `GET /api/sessions` returns 200

If running in a worktree, all scenario artifacts (screenshots, reports, backups) are saved inside the worktree, then copied to the main tree on completion.

---

## Rule 8: CHROME-TOOL

Scenario tests use **Chrome DevTools Protocol (CDP)** via the `mcp__chrome-devtools__*` MCP tools. These are preferred over Claude-in-Chrome because:
- CDP works without the Chrome extension installed
- CDP provides reliable element targeting via accessibility tree UIDs
- CDP screenshots capture the actual rendered state

### Required tools:
| Tool | Purpose |
|------|---------|
| `navigate_page` | Navigate to URLs |
| `take_snapshot` | Get accessibility tree (element UIDs) |
| `take_screenshot` | Visual capture for verification |
| `click` | Click buttons, links, cards |
| `fill` | Type into text inputs |
| `wait_for` | Wait for text/state to appear |
| `select_page` | Switch between browser tabs |

### Best practices:
- Always `take_snapshot` before interacting to get fresh UIDs
- Always `take_screenshot` after critical state changes for the report
- Use `wait_for` after actions that trigger async operations (API calls, plugin installs)
- Use `bringToFront: false` on `select_page` to avoid desktop switching

---

## Rule 9: REPORT-FORMAT

The scenario report file follows this exact structure:

```markdown
---
scenario: <scenario-name>
version: <scenario-version>
commit_start: <git-hash>
commit_end: <git-hash-or-same>
started_at: <ISO-timestamp>
completed_at: <ISO-timestamp>
result: PASS | FAIL | PARTIAL
steps_total: <N>
steps_passed: <N>
steps_failed: <N>
steps_fixed: <N>
bugs_found: <N>
bugs_fixed: <N>
issues_noticed: <N>
cleanup_verified: true | false
state_wipe_verified: true | false
---

# Scenario Report: <scenario-name>

## Summary
<1-3 sentence summary of what was tested and the outcome>

## Environment
- Server: http://localhost:23000
- Build: <yarn build output summary>
- Browser: Chrome via CDP

## Steps

### Phase N: <phase-name>

| Step | Action | Expected | Actual | Status | Screenshot |
|------|--------|----------|--------|--------|------------|
| S001 | ... | ... | ... | PASS | scen-001.png |

## Bugs Found & Fixed

### BUG-001: <title>
- **Discovered at:** Step S<NNN>
- **Symptom:** ...
- **Root cause:** ...
- **Fix:** <file>:<lines> — <description>
- **Verified at:** Step S<NNN> (retry)

## Issues Noticed (Non-Blocking)

### ISSUE-001: <title>
- **Noticed at:** Step S<NNN>
- **Severity:** WARN | INFO
- **Description:** ...
- **Suggested fix:** ...

## Cleanup Verification

| Action | Expected | Actual | Status |
|--------|----------|--------|--------|
| Remove test team | Team deleted | Confirmed via API | PASS |
| ... | ... | ... | ... |

## State-Wipe Verification

| File | Backup hash | Restored hash | Match |
|------|-------------|---------------|-------|
| ~/.claude/settings.json | abc123 | abc123 | YES |
| ... | ... | ... | ... |
```

---

## Scenario File Format

Scenario files are saved in `tests/scenarios/` with the naming convention:

```
SCEN-<NNN>_<scenario-name>.scen.md
```

Where `<NNN>` is a zero-padded unique number (001, 002, ...). This allows referencing scenarios by number: "run scenario 14" → `SCEN-014_*.scen.md`.

Example: `SCEN-001_title-change-lifecycle.scen.md`

**Numbering rules:**
- Numbers are assigned sequentially and never reused (even if a scenario is deleted)
- The current highest number is tracked in `tests/scenarios/NEXT_SCEN_NUMBER` (plain text, e.g. `4`)
- Each scenario's number is also in its YAML frontmatter (`number: 1`)

### Frontmatter (YAML):

```yaml
---
number: <unique integer, e.g. 1>
name: <human-readable scenario name>
version: "1.0"
description: >
  <What this scenario tests — which subsystem, which UI sections,
  what data is produced during the test>
subsystems:
  - governance
  - role-plugins
  - agent-registry
ui_sections:
  - Agent Profile → Overview tab → Governance Title
  - Agent Profile → Config tab → Role Plugin
  - Sidebar → Teams tab
  - Title Assignment Dialog
  - Governance Password Dialog
data_produced:
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
  - At least 1 active agent with tmux session
  - Chrome browser open with DevTools accessible
commit: <git-hash>
author: <who wrote the scenario>
---
```

### Step format:

```markdown
### Phase N: <phase-name>

#### S<NNN>: <action-description>
- **Action:** <what to do in the UI>
- **Goal:** <what must be true after this step — verifiable from UI state>
- **Creates:** <list of elements created, or "nothing">
- **Modifies:** <list of existing state modified, or "nothing">
- **Verify:** <how to verify — screenshot, snapshot check, text match>
```

### Cleanup phase (mandatory, always last):

```markdown
### Phase CLEANUP: Restore Original State

#### S<NNN>: Revert <action>
- **Action:** <undo step S<XXX>>
- **Goal:** <element removed / state restored>
- **Removes:** <what is being removed>
- **Verify:** <confirmation>

#### S<LAST>: STATE-WIPE — Restore configuration files
- **Action:** Copy backed-up files back to original locations
- **Goal:** All config files match pre-test state
- **Verify:** File hash comparison
```

---

## Directory Structure

```
tests/scenarios/
  SCENARIOS_TESTS_RULES.md        ← This file
  NEXT_SCEN_NUMBER                ← Next available scenario number (plain text)
  SCEN-001_<name>.scen.md         ← Scenario definition files
  SCEN-002_<name>.scen.md
  reports/
    SCEN-001_<timestamp>.report.md ← Execution reports
  screenshots/
    SCEN-001/                      ← Screenshots per scenario run
      S001-<description>.png
      S002-<description>.png
  state-backups/
    SCEN-001_<timestamp>/          ← Config file backups for STATE-WIPE
```
