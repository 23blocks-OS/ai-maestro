# EPCP Plugin Scripts Audit Report

**Date:** 2026-02-22
**Auditor:** Claude Opus 4.6
**Directory:** `/Users/emanuelesabetta/ai-maestro/.claude/plugins/emasoft-pr-checking-plugin/scripts/`

---

## Scripts Inventoried

| File | Size | Permissions | Executable | Shebang |
|------|------|-------------|------------|---------|
| `epcp-merge-reports.sh` (v1) | 9,444 bytes | `-rwxr-xr-x` | Yes | `#!/bin/bash` |
| `epcp-merge-reports-v2.sh` (v2) | 11,240 bytes | `-rwxr-xr-x` | Yes | `#!/bin/bash` |

Both files are Bourne-Again shell scripts with UTF-8 encoding and Unix line endings.

---

## Shellcheck Results

Both scripts pass shellcheck at **all** severity levels (`-S info`): **zero warnings, zero errors, zero style issues**.

```
shellcheck -S info epcp-merge-reports.sh    → CLEAN
shellcheck -S info epcp-merge-reports-v2.sh → CLEAN
```

---

## Detailed Manual Audit: epcp-merge-reports.sh (v1)

### Strengths
1. **`set -eo pipefail`** (line 24) -- correct error handling mode
2. **Proper quoting throughout** -- all variable expansions are double-quoted (e.g., `"$OUTPUT_DIR"`, `"$report"`, `"${REPORTS[@]}"`)
3. **Null-safe find** -- uses `find ... -print0 | sort -z` with `read -r -d ''` (lines 46-48), preventing issues with filenames containing spaces/newlines
4. **Trap-based temp file cleanup** (line 75) -- all 5 temp files are cleaned on EXIT
5. **Dedup via composite key** (lines 112-115) -- uses `${report_name}:${finding_id}` to prevent cross-agent ID collisions; well-commented explaining why

### Issues Found

#### MANUAL-V1-001: Temp files created without restrictive permissions [NIT]
- **Lines:** 69-73
- **Issue:** `mktemp` creates files with default umask permissions. On shared systems, other users could read temp files containing PR review findings.
- **Impact:** Low -- script is designed for single-user local use. Only relevant if umask is permissive (e.g., 0022).
- **Fix:** Add `umask 077` before mktemp calls, or use `mktemp --suffix=.epcp` for identification if needed.

#### MANUAL-V1-002: No atomic write for final report [SHOULD-FIX]
- **Lines:** 161-240
- **Issue:** The final report `$FINAL_REPORT` is written directly via `cat >` and successive `>>` appends. If the script is interrupted mid-write (e.g., Ctrl-C, disk full), a partial report exists. The v2 script correctly uses tmp+mv pattern.
- **Impact:** Medium -- a partial report could mislead the dedup agent or user.
- **Fix:** Write to `${FINAL_REPORT}.tmp` then `mv` it to `${FINAL_REPORT}`, matching the v2 pattern.

#### MANUAL-V1-003: Heredoc delimiter `HEADER` not quoted [NIT]
- **Line:** 161
- **Issue:** `cat > "$FINAL_REPORT" << HEADER` -- the heredoc delimiter is unquoted, meaning variable expansion (`${TIMESTAMP}`, `${#REPORTS[@]}`, etc.) happens inside. This is **intentional** here (the variables should expand), so this is correct behavior. However, if anyone later adds a literal `$` in the heredoc, it would be unexpectedly expanded.
- **Impact:** None currently. Just a documentation note.

#### MANUAL-V1-004: `echo "$line" | grep` pattern in hot loop [NIT/PERFORMANCE]
- **Lines:** 88-108
- **Issue:** Each line of each report is piped through multiple `grep` calls (up to 6 per line). For large reports, this spawns many subprocesses. Using bash built-in `[[ "$line" =~ pattern ]]` would be faster.
- **Impact:** Low -- reports are typically <500 lines. Would matter for reports >10K lines.
- **Fix:** Replace `echo "$line" | grep -qiE 'pattern'` with `[[ "${line,,}" =~ pattern ]]` (case-insensitive via `${line,,}` lowering).

#### MANUAL-V1-005: `declare -A` requires bash 4+ [INFO]
- **Line:** 66
- **Issue:** Associative arrays (`declare -A SEEN_FINDINGS`) require bash 4.0+. macOS ships bash 3.2 by default, but Homebrew bash is 5.x which is almost certainly what's being used given shellcheck passes.
- **Impact:** None if Homebrew bash is used. Would fail on stock macOS `/bin/bash` (3.2).
- **Fix:** Either add a bash version check or use `#!/usr/bin/env bash` and ensure Homebrew bash is first in PATH.

#### MANUAL-V1-006: No integrity/size verification of merged output [SHOULD-FIX]
- **Issue:** Unlike v2, v1 does not verify that the merged report contains all source content. It silently succeeds even if content was lost.
- **Impact:** Medium -- silent data loss possible if disk is full or write fails mid-stream.

---

## Detailed Manual Audit: epcp-merge-reports-v2.sh (v2)

### Strengths
1. **`set -eo pipefail`** (line 34) -- correct error handling
2. **Atomic write** (line 242) -- uses `$TMP_REPORT` then `mv` to final path, preventing partial reads
3. **Byte-size integrity verification** (lines 244-278) -- verifies merged >= sum of sources before deleting source files
4. **Proper quoting throughout** -- all variable expansions double-quoted
5. **Null-safe find** (lines 58-71) -- same robust pattern as v1
6. **Trap includes `$TMP_REPORT`** (line 109) -- cleans up the temp file on abnormal exit
7. **Required argument validation** (line 44) -- `${2:?Error: ...}` fails fast if pass_number missing
8. **Source file preservation on failure** (lines 272-278) -- if integrity check fails, source files are NOT deleted and a diagnostic message is printed
9. **Phase ordering** (lines 83-101) -- reports are sorted into correctness->claims->review order before merging

### Issues Found

#### MANUAL-V2-001: Temp files created without restrictive permissions [NIT]
- **Lines:** 104-107
- **Issue:** Same as MANUAL-V1-001. `mktemp` uses default umask.
- **Impact:** Low.

#### MANUAL-V2-002: `echo "$line" | grep` pattern in hot loop [NIT/PERFORMANCE]
- **Lines:** 126-146
- **Issue:** Same as MANUAL-V1-004. Multiple grep subprocess spawns per line.
- **Impact:** Low.

#### MANUAL-V2-003: Integrity check has a logical edge case [NIT]
- **Lines:** 260
- **Issue:** The check `MERGED_SIZE -ge SOURCE_TOTAL` will always pass even if the script wrote ONLY the header and zero finding content, as long as the header is large enough. Example: if all source files are tiny (say 100 bytes each, 3 files = 300 bytes total) but the header alone is 400 bytes, the check passes even if no findings were actually written.
- **Impact:** Very low -- this would only happen if source reports are near-empty, which would indicate a bug in the phase agents rather than the merger. The check is primarily guarding against truncation/disk-full scenarios where it works correctly.
- **Mitigation:** Could additionally verify that each severity section in the merged file contains at least as many `[XX-` finding ID patterns as counted in RAW_* counters.

#### MANUAL-V2-004: `declare -A` not used but `bash 4+` still implicitly required [INFO]
- **Issue:** v2 removed `declare -A` (no dedup), but still uses `[[ ]]` constructs and array syntax that are bash-specific. The `#!/bin/bash` shebang is correct.
- **Impact:** None.

#### MANUAL-V2-005: Source file deletion without confirmation [INFO]
- **Lines:** 267-270
- **Issue:** After integrity check passes, source files are deleted with `rm -f` without user confirmation. This is by design (documented in header comments) and protected by the integrity check, but could surprise users who expect source files to persist.
- **Impact:** None -- documented behavior, and integrity check guards it.

#### MANUAL-V2-006: `$TMP_REPORT` left in trap even after successful `mv` [NIT]
- **Line:** 109 vs 242
- **Issue:** The trap removes `$TMP_REPORT` on EXIT. After the `mv` on line 242, `$TMP_REPORT` no longer exists, so the trap's `rm -f "$TMP_REPORT"` is a harmless no-op. But if someone refactors and the `mv` path changes, the trap could delete the final report.
- **Impact:** None currently. Minor robustness note.
- **Fix:** Could reset the trap after successful mv: `trap 'rm -f "$MUST_FIX_FINDINGS" "$SHOULD_FIX_FINDINGS" "$NIT_FINDINGS" "$CLEAN_FILES"' EXIT`

---

## Cross-Script Comparison

| Feature | v1 | v2 |
|---------|----|----|
| Deduplication | Yes (associative array) | No (delegated to AI agent) |
| Atomic write | **No** (direct write) | **Yes** (tmp+mv) |
| Integrity check | **No** | **Yes** (byte-size) |
| Source file cleanup | **No** | **Yes** (after verification) |
| Required args | 0 (all optional) | 1 (pass_number required) |
| Phase ordering | No (sorted by filename) | Yes (correctness->claims->review) |
| Finding ID pattern | `[XX-NNN]` or `[XX-PN-NNN]` | Extended: `[XX-PN-AHEX-NNN]` |
| Exit code semantics | 0=clean, 1=must-fix, 2=error | 0=always (verdict delegated) |

---

## Summary of Findings

| ID | Script | Severity | Description |
|----|--------|----------|-------------|
| MANUAL-V1-001 | v1 | NIT | Temp files use default umask |
| MANUAL-V1-002 | v1 | SHOULD-FIX | No atomic write for final report |
| MANUAL-V1-003 | v1 | NIT | Unquoted heredoc delimiter (intentional) |
| MANUAL-V1-004 | v1 | NIT | grep subprocess spawning in hot loop |
| MANUAL-V1-005 | v1 | INFO | Requires bash 4+ for `declare -A` |
| MANUAL-V1-006 | v1 | SHOULD-FIX | No integrity verification of merged output |
| MANUAL-V2-001 | v2 | NIT | Temp files use default umask |
| MANUAL-V2-002 | v2 | NIT | grep subprocess spawning in hot loop |
| MANUAL-V2-003 | v2 | NIT | Integrity check edge case with tiny sources |
| MANUAL-V2-004 | v2 | INFO | Bash 4+ implicitly required |
| MANUAL-V2-005 | v2 | INFO | Source deletion without confirmation (by design) |
| MANUAL-V2-006 | v2 | NIT | Stale TMP_REPORT in trap after mv |

**Totals:** 0 MUST-FIX, 2 SHOULD-FIX (both in v1), 6 NIT, 3 INFO

**Verdict:** Both scripts are well-written. v2 is notably more robust than v1 (atomic writes, integrity checks). The two SHOULD-FIX items are both in v1 and relate to missing safety features that v2 already implements. No blocking issues.
