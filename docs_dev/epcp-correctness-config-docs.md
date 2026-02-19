# Code Correctness Report: config-docs

**Agent:** epcp-code-correctness-agent
**Domain:** config-docs
**Files audited:** 10
**Date:** 2026-02-16T20:31:00Z

## MUST-FIX

### [CC-001] ai-index.html has stale hardcoded version "0.19.26" in two places
- **File:** /Users/emanuelesabetta/ai-maestro/docs/ai-index.html:91, 390
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `bump-version.sh` script only updates the JSON-LD `softwareVersion` field in `docs/ai-index.html` (step 7), but the file also contains two hardcoded text references to the version that are NOT updated by the script. Line 91: `<p><strong>Version:</strong> 0.19.26 (January 2026)</p>` and line 390: `<li><strong>Current Version:</strong> 0.19.26 (January 2026)</li>`. The current version should be `0.23.11` (per `version.json`), so these are stale from months ago. The JSON-LD `softwareVersion` on line 35 IS correctly `0.23.11`.
- **Evidence:**
  ```html
  <!-- Line 91 - STALE -->
  <p><strong>Version:</strong> 0.19.26 (January 2026)</p>
  <!-- Line 390 - STALE -->
  <li><strong>Current Version:</strong> 0.19.26 (January 2026)</li>
  <!-- Line 35 JSON-LD - CORRECT -->
  "softwareVersion": "0.23.11",
  ```
- **Fix:** Two changes needed:
  1. Update `docs/ai-index.html` lines 91 and 390 to say `0.23.11` (and update the date from "January 2026" to "February 2026").
  2. Add two new `update_file` calls to `scripts/bump-version.sh` so future bumps catch these text references. For example:
     ```bash
     update_file "$PROJECT_ROOT/docs/ai-index.html" \
         "Version:<\/strong> $CURRENT_VERSION" \
         "Version:<\/strong> $NEW_VERSION" \
         "docs/ai-index.html (text version)"
     update_file "$PROJECT_ROOT/docs/ai-index.html" \
         "Current Version:<\/strong> $CURRENT_VERSION" \
         "Current Version:<\/strong> $NEW_VERSION" \
         "docs/ai-index.html (quick facts version)"
     ```

### [CC-002] remote-install.sh: `${PORT}` inside single-quoted sed pattern is literal, not expanded
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:1061
- **Severity:** MUST-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** On line 1061, the sed replacement string `'s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|'` uses single quotes. Inside single quotes, `${PORT}` is NOT expanded by bash -- it remains the literal string `${PORT}`. This means the `.env` file will contain `AIMAESTRO_API=http://127.0.0.1:${PORT}` literally instead of the resolved port number (e.g., `http://127.0.0.1:23000`). Note that line 1063 (the `echo` in the `else` branch) uses double quotes and DOES expand correctly, so the behavior is inconsistent between the two branches.
- **Evidence:**
  ```bash
  # Line 1061 - BUG: single quotes prevent ${PORT} expansion
  portable_sed 's|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|' .env
  # Line 1063 - CORRECT: double quotes allow expansion
  echo "AIMAESTRO_API=http://127.0.0.1:${PORT}" >> .env
  ```
- **Fix:** Change line 1061 to use double quotes: `portable_sed "s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|" .env`

## SHOULD-FIX

### [CC-003] install-messaging.sh: verification loop does not check `team-governance` or `ai-maestro-agents-management` skills
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:827
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `OTHER_SKILLS` array on line 756 includes `"team-governance"` and `"ai-maestro-agents-management"`, so these skills are installed. However, the verification loop on line 827 only checks: `agent-messaging graph-query memory-search docs-search planning`. The two newly added skills (`team-governance`, `ai-maestro-agents-management`) are not verified, so installation failures for these skills would go unreported.
- **Evidence:**
  ```bash
  # Line 756 - installs 6 skills
  OTHER_SKILLS=("graph-query" "memory-search" "docs-search" "planning" "ai-maestro-agents-management" "team-governance")

  # Line 827 - only verifies 5 of the 7 total skills
  for skill in agent-messaging graph-query memory-search docs-search planning; do
  ```
- **Fix:** Update the verification loop on line 827 to include `ai-maestro-agents-management` and `team-governance`:
  ```bash
  for skill in agent-messaging graph-query memory-search docs-search planning ai-maestro-agents-management team-governance; do
  ```

### [CC-004] install-messaging.sh: Unicode box drawing borders are misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The top/bottom box borders (`╔═══...═══╗` and `╚═══...═══╝`) are 66 visible characters wide (including the corners). The inner lines (`║ ... ║`) are a different visible width -- some have more padding than needed, and importantly the text line on line 67 ("AI Maestro - Agent Messaging Protocol (AMP) Installer") and line 69 ("Email for AI Agents - Local First") are NOT padded to align the closing `║` with the borders. The byte-level measurement confirms the lines have different byte lengths (199 vs 71 vs 70 bytes). This causes visual misalignment in terminals.
- **Evidence:**
  ```
  ╔════════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║      AI Maestro - Agent Messaging Protocol (AMP) Installer    ║
  ║                                                                ║
  ║              Email for AI Agents - Local First                ║
  ```
  The padding-only lines (66, 68, 70) have a different number of spaces than what's needed to match the border width.
- **Fix:** Recount and align all inner lines to the same visible width. Each inner line between `║` and `║` should have the same number of visible characters.

### [CC-005] remote-install.sh: Unquoted `${PORT}` in curl URLs (SC2086)
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:1105, 1126, 1161, 1198, 1233
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Multiple curl commands use `http://localhost:${PORT}/api/...` without quoting the entire URL. If `PORT` contained spaces or special characters (unlikely but possible via the `AIMAESTRO_PORT` env var), the URL would be split by the shell. ShellCheck rule SC2086 recommends quoting all variable expansions.
- **Evidence:**
  ```bash
  # Line 1105 - unquoted URL with variable
  if curl -s http://localhost:${PORT}/api/sessions 2>/dev/null | grep -q '"sessions"'; then
  # Line 1198
  curl -s -X POST http://localhost:${PORT}/api/sessions/create \
  ```
- **Fix:** Quote the URLs: `curl -s "http://localhost:${PORT}/api/sessions"` etc.

### [CC-006] docs/BACKLOG.md has contradictory version references
- **File:** /Users/emanuelesabetta/ai-maestro/docs/BACKLOG.md:6, 10, 17
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The BACKLOG.md header correctly says `**Current Version:** v0.23.11` (updated by bump-version.sh), but the rest of the document refers to planned releases as `v0.5.0`, `v0.6.0`, `v0.7.0+`, `v0.8.0+` -- which are all LOWER than the current version. This appears to be a legacy planning document that was written when the project was at a much earlier version. The section titles like "Now (Next Release - v0.5.0)" are now highly misleading since the project is far past v0.5.0. The bump-version.sh script only updates the header line, not the body.
- **Evidence:**
  ```
  **Current Version:** v0.23.11     ← line 6 (correct)
  ## Now (Next Release - v0.5.0)    ← line 10 (misleading: v0.5.0 << v0.23.11)
  **Version:** v0.5.0               ← line 17 (misleading)
  ```
- **Fix:** Either (a) archive BACKLOG.md as a historical document and create a new one with current milestones, or (b) update the version references in section headers to reflect actual upcoming versions.

## NIT

### [CC-007] install-messaging.sh bottom box borders also misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:837-839
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Same Unicode box misalignment issue as CC-004, also present in the "Installation Complete!" box at the bottom of the script.
- **Evidence:**
  ```
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                    Installation Complete!                      ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  ```

### [CC-008] bump-version.sh does not update ai-index.html date text references
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The hardcoded date "(January 2026)" on ai-index.html lines 91 and 390 is not updated by bump-version.sh. While the version number is the primary concern (CC-001), the date is also stale.
- **Fix:** Either update the date to be derived from `version.json`'s `releaseDate` field, or keep it as a manual update (since the current date format "Month Year" differs from the ISO date in version.json).

### [CC-009] governance-design-rules.md has no code correctness issues
- **File:** /Users/emanuelesabetta/ai-maestro/docs_dev/governance-design-rules.md
- **Severity:** NIT
- **Category:** N/A
- **Confidence:** CONFIRMED
- **Description:** This is a design rules document with no executable code. The document is internally consistent and well-structured.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/version.json -- Version 0.23.11 correctly set, valid JSON
- /Users/emanuelesabetta/ai-maestro/package.json -- Version 0.23.11 matches, valid structure, dependencies reasonable
- /Users/emanuelesabetta/ai-maestro/README.md -- Version badge 0.23.11 matches, no broken patterns
- /Users/emanuelesabetta/ai-maestro/docs/index.html -- JSON-LD softwareVersion 0.23.11 correct, display version v0.23.11 correct
- /Users/emanuelesabetta/ai-maestro/yarn.lock -- Valid lockfile v1 format, 5941 lines, no structural issues
- /Users/emanuelesabetta/ai-maestro/docs_dev/governance-design-rules.md -- Design doc, no code issues

## Version Consistency Summary

| File | Expected (0.23.11) | Actual | Status |
|------|-------------------|--------|--------|
| version.json | 0.23.11 | 0.23.11 | MATCH |
| package.json | 0.23.11 | 0.23.11 | MATCH |
| README.md (badge) | 0.23.11 | 0.23.11 | MATCH |
| remote-install.sh | 0.23.11 | 0.23.11 | MATCH |
| docs/index.html (schema) | 0.23.11 | 0.23.11 | MATCH |
| docs/index.html (display) | 0.23.11 | 0.23.11 | MATCH |
| docs/ai-index.html (schema) | 0.23.11 | 0.23.11 | MATCH |
| docs/ai-index.html (text line 91) | 0.23.11 | **0.19.26** | **MISMATCH** |
| docs/ai-index.html (text line 390) | 0.23.11 | **0.19.26** | **MISMATCH** |
| docs/BACKLOG.md (header) | 0.23.11 | 0.23.11 | MATCH |
