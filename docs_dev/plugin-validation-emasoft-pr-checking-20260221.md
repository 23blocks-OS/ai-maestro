# Plugin Validation Report: emasoft-pr-checking-plugin

**Date:** 2026-02-21T14:05:00
**Plugin:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/`
**Validator:** Plugin Validator Agent
**Overall Result:** PASS with 1 MAJOR, 4 MINOR issues

---

## Summary

| Category | Status | Details |
|----------|--------|---------|
| Plugin manifest (plugin.json) | PASS (with warnings) | All required fields present; components not declared |
| Agents (3) | PASS | All 3 agents have valid frontmatter, examples, output format |
| Skills (2) | PASS (with warnings) | pr-review: excellent; pr-review-and-fix: missing Instructions section |
| Scripts (1) | PASS (with 1 MAJOR) | Syntax valid, executable, shellcheck clean; regex incompatible with pass-prefixed IDs |
| Privacy check | PASS | No private paths or usernames leaked |
| Cross-references | PASS | All agents referenced in skills, script referenced correctly |
| README | PASS | All expected sections present |
| LICENSE | PASS | MIT, consistent across plugin.json and skill frontmatters |

---

## MAJOR Issues (1)

### [PV-001] Merge script finding ID regex incompatible with pass-prefixed IDs

- **File:** `scripts/epcp-merge-reports.sh:108`
- **Severity:** MAJOR
- **Category:** Logic bug
- **Description:** The finding ID extraction regex is `\[[A-Z]{2}-[0-9]+\]` which matches patterns like `[CC-001]` and `[SR-002]`. However, the `pr-review-and-fix` skill (v1.1.0) uses pass-prefixed IDs like `[CC-P1-001]`, `[CV-P2-003]`, `[SR-P1-001]`. The regex will NOT match these, causing the merge script to fail to count or deduplicate findings from multi-pass runs.
- **Impact:** When using the `pr-review-and-fix` skill (iterative review+fix loop), the merged report will show 0 findings even when findings exist, because the finding IDs are not extracted.
- **Fix:** Change the regex to: `\[[A-Z]{2}(-P[0-9]+)?-[0-9]+\]` to match both `[CC-001]` and `[CC-P1-001]` formats.
- **Evidence:**
  ```bash
  # Line 108 in epcp-merge-reports.sh:
  finding_id=$(echo "$line" | grep -oE '\[[A-Z]{2}-[0-9]+\]' | head -1)
  # Should be:
  finding_id=$(echo "$line" | grep -oE '\[[A-Z]{2}(-P[0-9]+)?-[0-9]+\]' | head -1)
  ```

---

## MINOR Issues (4)

### [PV-002] Version mismatch between plugin.json and pr-review-and-fix skill

- **File:** `.claude-plugin/plugin.json` vs `skills/pr-review-and-fix/SKILL.md`
- **Severity:** MINOR
- **Description:** `plugin.json` declares version `1.0.0`. The `pr-review` skill declares `1.0.0` (match). The `pr-review-and-fix` skill declares `1.1.0` (mismatch). While skill-level versioning can be independent, this may confuse users about which version of the plugin they have.
- **Recommendation:** Either bump plugin.json to 1.1.0 or document that skill versions are independent from the plugin version.

### [PV-003] plugin.json does not declare agents, skills, or scripts

- **File:** `.claude-plugin/plugin.json`
- **Severity:** MINOR
- **Description:** The manifest lists only `name`, `version`, `description`, `author`, `license`, and `keywords`. It does not declare the plugin's `agents`, `skills`, or `scripts` arrays. While Claude Code can auto-discover these from the directory structure, explicit declaration improves discoverability and allows marketplace tools to display available components without scanning the filesystem.
- **Recommendation:** Add component declarations to plugin.json:
  ```json
  {
    "agents": [
      "agents/epcp-claim-verification-agent.md",
      "agents/epcp-code-correctness-agent.md",
      "agents/epcp-skeptical-reviewer-agent.md"
    ],
    "skills": [
      "skills/pr-review",
      "skills/pr-review-and-fix"
    ],
    "scripts": [
      "scripts/epcp-merge-reports.sh"
    ]
  }
  ```

### [PV-004] Missing .gitignore (`.DS_Store` files present)

- **File:** Plugin root
- **Severity:** MINOR
- **Description:** Two `.DS_Store` files found (root and `skills/`). No `.gitignore` exists. If this plugin is published to a git repo, these macOS metadata files will be included.
- **Recommendation:** Add a `.gitignore` with at minimum: `.DS_Store`

### [PV-005] pr-review-and-fix skill missing explicit "Instructions" section

- **File:** `skills/pr-review-and-fix/SKILL.md`
- **Severity:** MINOR
- **Description:** The `pr-review` skill has a clear `## Instructions` section with a numbered step-by-step protocol. The `pr-review-and-fix` skill documents the same information spread across `## PROCEDURE 1` and `## PROCEDURE 2` sections but lacks a consolidated `## Instructions` section. While the content is complete and thorough, the missing section header reduces consistency between the two skills.
- **Recommendation:** Add a brief `## Instructions` section with a top-level summary (the loop flow is already documented well in the overview diagram).

---

## CLEAN Checks (No Issues)

### Privacy Check
- No private usernames or home directory paths found in any plugin file.
- Username `emanuelesabetta` does not appear anywhere in plugin content.

### Shell Script (epcp-merge-reports.sh)
- Bash syntax: VALID (`bash -n` passes)
- Shellcheck: CLEAN (zero warnings)
- Executable: YES (`chmod +x` set)
- `set -eo pipefail`: PRESENT
- Temp file cleanup via `trap EXIT`: PRESENT
- Color output with fallback: PRESENT
- Exit codes documented and implemented correctly (0=clean, 1=must-fix, 2=error)

### Agent Files (3/3 pass)

| Agent | Frontmatter | Examples | Output Format | Critical Rules |
|-------|-------------|----------|---------------|----------------|
| epcp-claim-verification-agent | name, description, capabilities | 2 | YES | YES |
| epcp-code-correctness-agent | name, description, capabilities | 2 | YES | YES |
| epcp-skeptical-reviewer-agent | name, description, capabilities | 2 | YES | YES |

All agents include:
- Clear WHY section explaining their purpose
- Structured input/output format specifications
- Minimal reporting rules for orchestrator context preservation
- Concrete examples with realistic scenarios

### Skill Files (2/2 pass core requirements)

| Skill | Frontmatter | Use When | Overview | Prerequisites | Output | Error Handling | Examples |
|-------|-------------|----------|----------|---------------|--------|----------------|----------|
| pr-review | FULL | YES | YES | YES | YES | YES | YES |
| pr-review-and-fix | FULL | YES | YES | YES | YES | YES | YES |

Both skills include:
- `$CLAUDE_PLUGIN_ROOT` references for portable script/agent paths
- Detailed spawning patterns with prompt templates
- Phase ordering constraints documented
- Report naming conventions

### Cross-Reference Consistency

| Reference | pr-review | pr-review-and-fix |
|-----------|-----------|-------------------|
| epcp-code-correctness-agent | 3 refs | 2 refs |
| epcp-claim-verification-agent | 5 refs | 2 refs |
| epcp-skeptical-reviewer-agent | 4 refs | 2 refs |
| epcp-merge-reports.sh | 1 ref | 1 ref |

All components correctly reference each other. No orphaned or missing references.

### README Completeness

All expected sections present: Installation, Agents, Skills, Pipeline, Reports, License.

### License Consistency

MIT license declared consistently in: plugin.json, LICENSE file, pr-review SKILL.md, pr-review-and-fix SKILL.md.

---

## Recommendations (Non-Blocking)

1. **Add CHANGELOG.md** - Track changes across versions, especially since skills already have different versions.
2. **Add references/ directories to skills** - While optional, these can hold supplementary documentation, prompt fragments, or configuration templates.
3. **Consider adding hooks/** - A `PreToolUse` hook could auto-trigger the review pipeline when `gh pr create` is detected, making the workflow even more seamless.

---

## Verdict

**PASS** - The plugin is well-structured and ready for use. The 1 MAJOR issue (finding ID regex) should be fixed before the `pr-review-and-fix` skill is used in multi-pass mode, as it will cause silent data loss in the merged report. The `pr-review` skill (single-pass, non-prefixed IDs) works correctly as-is.
