# Skeptical Review Report

**Agent:** epcp-skeptical-reviewer-agent
**PR:** #1 (23blocks-OS/ai-maestro-plugins)
**Date:** 2026-02-16T03:25:00Z
**Verdict:** APPROVE WITH NITS

## 1. First Impression

**Scope:** 13 files changed, 431 additions, 94 deletions. Moderate PR touching 2 shell scripts (published + source) and 11 SKILL.md documentation files across 7 skills. The scope is appropriate for a single PR -- it's a documentation/audit-fix batch with one meaningful code change (security scanner backport).

**Description quality:** B+. Clear structure with categorized changes. Explains WHAT was changed per file. Could better explain WHY some changes were made (e.g., why "First-Launch Behavior" docs were removed). The companion PR reference is helpful.

**Concern:** The claim "Both published and source copies updated in sync" is the main thing to verify, and it turns out to be **partially false** (see SR-001).

## 2. Code Quality

### Strengths

- **Security scanner is well-designed (B+):** The `scan_skill_security()` function covers meaningful attack vectors (base64+pipe, curl|bash, credential exfil, prompt injection, dynamic eval). The pattern set is practical, not theatrical. The two-tier severity system (critical=block, warning=proceed) is sensible.

- **CLAUDECODE unset in subshell is correct (A):** `(cd "$work_dir" && unset CLAUDECODE && ...)` correctly scopes the unset to the subshell. I verified `CLAUDECODE=1` is the real environment variable used by Claude Code. The comment explains WHY and references the originating issue.

- **Installer filename typo fix is accurate (A):** `install-docs-tools.sh` -> `install-doc-tools.sh` -- verified the actual file on disk is `install-doc-tools.sh`. Good catch.

- **First-Launch Behavior docs removal is justified (A-):** The resume-flag stripping code was removed from the main repo in PR #205 (commit 6830fef). Removing the documentation that described this non-existent behavior is correct. Would have been even better with a note like "Removed in v0.22.3" but not necessary.

- **Helper Scripts documentation pattern is consistent (B+):** All 7 SKILL.md files now document their internal helper dependencies in a standardized format. This is a genuine improvement for troubleshooting.

- **Program whitelist expansion (A):** Adding `gemini` and `opencode` to the allowed_programs list is a clean, non-breaking additive change.

### Issues Found

#### SHOULD-FIX

##### [SR-001] Published vs. Source SKILL.md Files Are NOT Fully In Sync (4 files diverge)
- **Severity:** SHOULD-FIX
- **Category:** consistency
- **Description:** The PR claims "Both published and source copies updated in sync" but 4 out of 6 paired SKILL.md files have a deliberate difference in the Helper Scripts section. The published copies (`plugins/`) reference `plugin/plugins/ai-maestro/scripts/` as the source path, while the source copies (`src/`) reference `plugin/src/scripts/`. This is likely intentional (each copy references its own location), but it contradicts the "in sync" claim and means these files have different content.
- **Evidence:** Affected files (diff between published and source after this PR):
  - `ai-maestro-agents-management/SKILL.md` line 926 (published) vs line 926 (source)
  - `docs-search/SKILL.md` line 214 (published) vs line 214 (source)
  - `graph-query/SKILL.md` line 145 (published) vs line 145 (source)
  - `memory-search/SKILL.md` line 137 (published) vs line 137 (source)
- **Impact:** Minor. The divergence is only in the "source path" portion of the helper script docs. Users looking at the published copy see `plugin/plugins/ai-maestro/scripts/` and users looking at source see `plugin/src/scripts/`. Both are correct for their context. However, the PR description's claim of "in sync" is technically false.
- **Recommendation:** Either (a) acknowledge the intentional divergence in the PR description, or (b) use a unified path reference like "the scripts directory alongside the published (or source) skill files."

##### [SR-002] `--no-scan` Flag Referenced in Error Message But Not Implemented
- **Severity:** SHOULD-FIX
- **Category:** missing-implementation
- **Description:** When `scan_skill_security()` blocks a skill installation, it prints: `"To bypass (NOT recommended): remove the scan or use --no-scan flag"`. However, the `cmd_skill_install()` function's argument parser has no `--no-scan` case. The flag does not exist.
- **Evidence:** `src/scripts/aimaestro-agent.sh` line 155 (error message) vs lines 2012-2070 (argument parser with no `--no-scan` handler).
- **Impact:** Users who encounter a blocked skill and follow the suggested `--no-scan` flag will get "Unknown option: --no-scan" error. Frustrating UX -- the tool suggests a solution that does not work.
- **Recommendation:** Either (a) implement `--no-scan` as a flag in `cmd_skill_install` and `cmd_plugin_install`, or (b) remove the `--no-scan` suggestion from the error message and say "To bypass (NOT recommended): review the skill manually and install the files directly."

##### [SR-003] Inaccurate Function Docstring: "Returns 2 (warning)" But Actually Returns 0
- **Severity:** SHOULD-FIX
- **Category:** documentation-accuracy
- **Description:** The `scan_skill_security()` comment says "Returns 0 (safe), 1 (critical - block), 2 (warning - proceed with caution)". But when warnings are detected, the function returns 0, not 2. Return code 2 is never used.
- **Evidence:** `src/scripts/aimaestro-agent.sh` line 55 (comment: "Returns ... 2 (warning)") vs the actual `elif $has_warning` branch at the end of the function which executes `return 0`.
- **Impact:** Developers reading the function contract will expect return code 2 for warnings. If they write calling code like `if [[ $? -eq 2 ]]; then echo "warnings"; fi`, it will never trigger.
- **Recommendation:** Change the comment to "Returns 0 (safe or warnings only), 1 (critical - block)".

##### [SR-004] Misleading Comment: "Uses mcp-scan if available" But Never Does
- **Severity:** SHOULD-FIX
- **Category:** documentation-accuracy
- **Description:** The function comment says "Uses mcp-scan if available, falls back to built-in pattern checks." There is no code in the function that checks for or invokes mcp-scan. The function only does built-in grep pattern matching.
- **Evidence:** `src/scripts/aimaestro-agent.sh` line 55. The string "mcp-scan" appears nowhere else in the file except this comment.
- **Impact:** Developers may believe there is an mcp-scan integration path. Contributors might not implement it thinking it already exists.
- **Recommendation:** Remove the mcp-scan reference from the comment, or add a TODO comment: `# TODO: Add mcp-scan integration as primary scanner when available`.

#### NIT

##### [SR-005] Planning SKILL.md Hardcodes `docs_dev/` in Examples Despite Env Var Override
- **Severity:** NIT
- **Category:** documentation-accuracy
- **Description:** The planning SKILL.md correctly introduces the `AIMAESTRO_PLANNING_DIR` environment variable override (priority 1), with `docs_dev/` as default (priority 2). However, all subsequent examples and troubleshooting commands hardcode `docs_dev/task_plan.md`:
  ```
  cat docs_dev/task_plan.md | head -50
  grep -E "^\s*-\s*\[" docs_dev/task_plan.md
  ```
  If a user sets `AIMAESTRO_PLANNING_DIR=marketing/`, these troubleshooting commands will fail silently.
- **Evidence:** `plugins/ai-maestro/skills/planning/SKILL.md` and `src/skills/planning/SKILL.md`, multiple locations.
- **Impact:** Minor. Most users will use the default. But it's inconsistent to introduce an env var then ignore it in examples.
- **Recommendation:** Use `${AIMAESTRO_PLANNING_DIR:-docs_dev}/task_plan.md` in the example commands, or add a note saying "replace `docs_dev/` with your configured `AIMAESTRO_PLANNING_DIR` if set."

##### [SR-006] Security Scanner Uses `echo "$content" | grep` Pattern (Not Robust)
- **Severity:** NIT
- **Category:** design
- **Description:** The security scanner reads the entire SKILL.md into a variable then uses `echo "$content" | grep` 11 times. On large files or files with unusual characters (null bytes, extremely long lines), `echo` can misbehave. Using `grep` directly on the file would be simpler and more robust.
- **Evidence:** `src/scripts/aimaestro-agent.sh` lines 82-151, pattern: `echo "$content" | grep -qiE '...'` repeated 11 times.
- **Impact:** Unlikely to cause real problems with typical SKILL.md files, but it is a code smell. A malicious skill could potentially exploit `echo` behavior differences across shells.
- **Recommendation:** Replace `echo "$content" | grep -qiE '...'` with `grep -qiE '...' "$skill_md"` throughout. This reads the file once per grep but avoids the echo pipeline.

##### [SR-007] agent-messaging SKILL.md Has No `src/` Counterpart
- **Severity:** NIT
- **Category:** consistency
- **Description:** The `agent-messaging` skill exists in `plugins/ai-maestro/skills/` but not in `src/skills/`. All other 5 skills have both published and source copies. This asymmetry is not explained.
- **Impact:** No functional impact. Likely intentional (agent-messaging may be managed differently). But worth documenting why.
- **Recommendation:** No action needed unless this is unintentional.

## 3. Risk Assessment

**Breaking changes:** None. All changes are additive (new docs sections, new function, expanded whitelist). The `unset CLAUDECODE` in the subshell is behavior-changing but correctly scoped and fixes a real bug.

**Data migration:** None needed.

**Performance:** The security scanner adds 11 grep invocations per skill install. Negligible overhead for a one-time operation.

**Security:** The `scan_skill_security()` function is a positive security addition. The patterns are reasonable. However, it is easily bypassable via Unicode homoglyphs, split commands across lines, or markdown code block boundaries. This is acknowledged -- it's a first-pass defense, not a sandbox. The `rm -rf "$target_dir"` cleanup on failure (line ~2174) is safe since `$target_dir` was just created by the install process.

## 4. Test Coverage Assessment

**What's tested well:** The PR includes a test plan with 3 checkboxes:
- Verify SKILL.md markdown structure
- Verify aimaestro-agent.sh accepts gemini/opencode
- Verify Helper Scripts sections reference existing files

**What's NOT tested:**
- The `scan_skill_security()` function has no automated tests. Given it's a security feature, it should have test cases for each of the 11 patterns (both positive and negative matches).
- The `unset CLAUDECODE` change has no test.
- The post-install plugin scanning code path (lines ~2454-2477) has no test.
- The `--no-scan` flag referenced in error messages is not tested (because it does not exist).

**Test quality:** The test plan is manual. No automated test changes in this PR. For a docs+script PR this is acceptable, but the security scanner deserves automated tests.

## 5. Verdict Justification

This is a solid documentation-and-audit-fix PR. The changes are well-organized, the scope is appropriate, and the core improvements (security scanner backport, program whitelist expansion, CLAUDECODE unset, helper script documentation) are all genuine improvements.

The "SHOULD-FIX" issues are real but not blocking. The `--no-scan` ghost flag (SR-002) is the most user-facing problem -- it promises a bypass that does not exist, which will frustrate users who encounter it. The inaccurate function docstring (SR-003) and misleading mcp-scan comment (SR-004) create false expectations for contributors. The cross-file sync claim (SR-001) is technically false but the divergence is intentional and contextually correct.

None of these issues break existing functionality. All can be fixed in a follow-up. The PR improves the codebase more than it harms it. I recommend merging with the understanding that SR-002 should be addressed promptly (either implement `--no-scan` or remove the suggestion from the error message).
