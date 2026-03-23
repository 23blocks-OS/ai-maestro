# Cross-Platform Audit: AI Maestro Plugin Scripts

**Date:** 2026-03-23
**Scope:** All recently modified scripts in `plugin/plugins/ai-maestro/scripts/` plus SKILL.md files
**Platforms:** macOS (Darwin), Linux (Ubuntu/Debian/RHEL), WSL2

---

## Executive Summary

The scripts are **generally well-written for cross-platform use**. The codebase already handles several platform differences (e.g., `date` formatting in `amp-helper.sh`, `realpath` fallback in `agent-commands.sh`). However, **12 issues** were found across 3 severity levels.

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH     | 3     | Will break on certain platforms |
| MEDIUM   | 5     | May cause unexpected behavior |
| LOW      | 4     | Minor portability concerns |

---

## HIGH Severity Issues

### H1. `realpath -m` not available on macOS (agent-core.sh:210,212)

**File:** `agent-core.sh`, function `validate_cache_path()`
**Lines:** 210, 212

```bash
resolved=$(realpath -m "$path" 2>/dev/null) || return 1
cache_resolved=$(realpath -m "$cache_base" 2>/dev/null) || return 1
```

**Problem:** macOS does not ship `realpath` by default (it's available via `brew install coreutils` as `grealpath`). Even when installed, macOS's BSD `realpath` does not support the `-m` (--canonicalize-missing) flag. The `|| return 1` means this silently fails validation on macOS, potentially blocking legitimate cache path operations.

**Contrast:** `agent-commands.sh:429-434` already handles this correctly with a fallback:
```bash
if command -v realpath >/dev/null 2>&1; then
    resolved_dir=$(realpath -m "$dir" 2>/dev/null) || resolved_dir="$dir"
else
    resolved_dir=$(cd -P -- "$(dirname "$dir")" 2>/dev/null && pwd)/$(basename -- "$dir") ...
fi
```

**Fix:** Add the same fallback pattern used in `agent-commands.sh`, or use `python3 -c "import os; print(os.path.realpath('$path'))"` as a universal fallback. Note: for `-m` (missing path), the Python equivalent would be `os.path.normpath(os.path.join(os.getcwd(), path))`.

---

### H2. `sed` with `\x1b` escape is not portable (agent-core.sh:259)

**File:** `agent-core.sh`, function `sanitize_for_display()`
**Line:** 259

```bash
printf '%s' "$input" | tr -cd '[:print:][:space:]' | sed 's/\x1b\[[0-9;]*m//g'
```

**Problem:** BSD `sed` (macOS) does not interpret `\x1b` as an escape character in the regex pattern. This means ANSI escape codes will NOT be stripped on macOS. GNU `sed` on Linux handles `\x1b` fine.

**Fix:** Use `$'\x1b'` (bash ANSI-C quoting) or a literal ESC character:
```bash
printf '%s' "$input" | tr -cd '[:print:][:space:]' | sed $'s/\x1b\\[[0-9;]*m//g'
```
Or use `tr` alone (which already removes non-printable chars including ESC on line before sed).

**Note:** The `tr -cd '[:print:][:space:]'` before the `sed` already removes ESC (0x1b) since it's not in `[:print:]`, making the `sed` redundant on macOS. But the intent is belt-and-suspenders, so fixing `sed` for correctness is recommended.

---

### H3. `stat -f '%Sp'` in SKILL.md is macOS-only (debug-hooks SKILL.md:99)

**File:** `skills/debug-hooks/SKILL.md`, line 99

```bash
stat -f '%Sp' /path/to/my-hook.sh
```

**Problem:** This uses macOS BSD `stat` format. On Linux, the equivalent is `stat -c '%A'`. Since SKILL.md files serve as instructions for Claude Code agents that may run on Linux, agents following these instructions will get errors on Linux.

**Fix:** Replace with a cross-platform alternative:
```bash
ls -la /path/to/my-hook.sh | awk '{print $1}'
```
Or document both forms:
```bash
# macOS: stat -f '%Sp' /path/to/my-hook.sh
# Linux: stat -c '%A' /path/to/my-hook.sh
```

---

## MEDIUM Severity Issues

### M1. `${name,,}` lowercase syntax requires bash 4.0+ (agent-helper.sh:789, agent-commands.sh:400)

**Files:**
- `agent-helper.sh:789` — `local name_lower="${name,,}"`
- `agent-commands.sh:400` — `local program_lower="${program,,}"`

**Problem:** The `${var,,}` parameter expansion for case conversion was introduced in bash 4.0. macOS ships with bash 3.2 (due to GPLv3 licensing). While the scripts use `#!/usr/bin/env bash` shebangs and `agent-helper.sh` documents "Requires: bash 4.0+", this requirement is **not enforced at runtime**. On macOS with default bash, these lines will produce a "bad substitution" error.

**Status:** The scripts' shebangs use `#!/usr/bin/env bash` which will pick up a Homebrew-installed bash 4+ if it's first in PATH. This is acceptable IF users install a modern bash, which is common for developers. The scripts already document the bash 4.0+ requirement in comments.

**Fix (recommended):** Add a runtime bash version check at the top of `agent-helper.sh`:
```bash
if (( BASH_VERSINFO[0] < 4 )); then
    echo "Error: bash 4.0+ required. macOS ships bash 3.2." >&2
    echo "Install with: brew install bash" >&2
    exit 1
fi
```

---

### M2. `declare -g` requires bash 4.2+ (agent-helper.sh:563-567)

**File:** `agent-helper.sh`, lines 563-567

```bash
declare -g RESOLVED_AGENT_ID=""
declare -g RESOLVED_ALIAS=""
declare -g RESOLVED_HOST_ID=""
declare -g RESOLVED_HOST_URL=""
declare -g RESOLVED_NAME=""
```

**Problem:** The `-g` flag for `declare` (declare variable as global from within a function context) was introduced in bash 4.2. On bash 3.2 (macOS default), this will error. However, these are at the top level (not inside a function), where `-g` is a no-op — so in practice this works on bash 3.2 as long as the lines are sourced at top level.

**Risk:** Low in current usage, but if the file is ever sourced from within a function, this will break on bash 3.2.

---

### M3. `find ... -print0 | xargs -0 ls -t` pipe loses sort order (agent-core.sh:503-504)

**File:** `agent-core.sh`, lines 503-504

```bash
find "$backup_dir" -maxdepth 1 -name "$backup_pattern" -type f -print0 2>/dev/null | \
    xargs -0 ls -t 2>/dev/null | tail -n +6 | while IFS= read -r old_backup; do
```

**Problem:** This is a cross-platform concern: `xargs -0 ls -t` works correctly on both macOS and Linux, **BUT** if the number of files exceeds `xargs`' argument limit, `xargs` will invoke `ls -t` multiple times, and the results from each invocation will be sorted independently — not globally. This means the "keep last 5" logic could delete the wrong backups.

**Fix:** Use `stat` for portable mtime sorting, or limit backup count differently. In practice this is unlikely to matter (would need thousands of backup files), so severity is MEDIUM.

---

### M4. `python3 -c` dependency for URL encoding (docs-helper.sh:47)

**File:** `docs-helper.sh`, line 47

```bash
encoded_query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))" 2>/dev/null || echo "$query")
```

**Problem:** This has a **shell injection vulnerability** — if `$query` contains single quotes, it will break the Python string or execute arbitrary Python code. The fallback `|| echo "$query"` means unencoded queries are sent to the API, which may work but is fragile.

**Cross-platform concern:** `python3` is available on most systems but not guaranteed. On some minimal Linux installs (Alpine, some Docker images), only `python` exists. However, this has a fallback so it's not fatal.

**Fix for injection:** Use stdin instead of argument interpolation:
```bash
encoded_query=$(printf '%s' "$query" | python3 -c "import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read()))" 2>/dev/null || echo "$query")
```
Or use `jq -sRr @uri` which is already used elsewhere in the codebase (agent-helper.sh:649):
```bash
encoded_query=$(printf '%s' "$query" | jq -sRr @uri 2>/dev/null || echo "$query")
```

---

### M5. `ls -lh | awk '{print $5}'` for file size is fragile (export-agent.sh:134)

**File:** `export-agent.sh`, line 134

```bash
FILE_SIZE=$(ls -lh "$OUTPUT_PATH" | awk '{print $5}')
```

**Problem:** The column position of file size in `ls -l` output can vary between systems. On macOS, the group name column can have spaces (e.g., "staff" vs "wheel"), and some Linux systems use different `ls` output formats. Some locales change the output format entirely.

**Fix:** Use `stat` with platform detection, or `wc -c` for byte count:
```bash
# Portable file size (bytes)
FILE_SIZE=$(wc -c < "$OUTPUT_PATH" | tr -d ' ')
# Or du for human-readable
FILE_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
```

---

## LOW Severity Issues

### L1. `hostname` fallback varies across platforms (common.sh:46, export-agent.sh:21)

**Files:**
- `common.sh:46` — `_SELF_HOST_ID=$(hostname | tr '[:upper:]' '[:lower:]')`
- `export-agent.sh:21` — `AIMAESTRO_API="http://$(hostname | tr '[:upper:]' '[:lower:]'):23000"`
- `list-agents.sh:16`, `import-agent.sh:27` — same pattern

**Problem:** On macOS, `hostname` returns the local hostname (e.g., `juans-macbook-pro.local`), while on Linux it returns just `juans-macbook-pro`. The `.local` suffix on macOS means the constructed URL `http://juans-macbook-pro.local:23000` will work via mDNS on the local network but may behave differently on Linux.

**Status:** This is only a fallback path (identity API is tried first), and it's used for display/local networking which tolerates this difference. Low risk.

---

### L2. `echo -e` for ANSI colors (agent-helper.sh:91-95)

**File:** `agent-helper.sh`, lines 91-95

```bash
print_error() { echo -e "${RED}Error: $1${NC}" >&2; }
```

**Problem:** `echo -e` is a bashism. POSIX `echo` does not guarantee `-e` support. However, since these scripts require bash 4.0+ (documented) and use `#!/usr/bin/env bash`, this is safe. The code also includes a comment acknowledging this: "LOW-1: echo -e is bash-specific, acceptable since script requires bash 4.0+".

**Status:** Already documented and mitigated. No action needed.

---

### L3. `local -a` for array declaration (agent-core.sh:301, agent-session.sh:132, agent-commands.sh:317)

**Files:**
- `agent-core.sh:301` — `local -a cmd_args=("$@")`
- `agent-session.sh:132` — `local -a cmd_args=()`
- `agent-commands.sh:317` — `local -a program_args=()`

**Problem:** `local -a` works in bash 3.2+ (it's supported), so no actual breakage. However, some shell linters flag it as a portability concern since it's not POSIX `sh` compatible.

**Status:** Safe. All scripts use bash shebangs. No action needed.

---

### L4. `brew install` in error messages (agent-skill.sh:305, amp-helper.sh:83)

**Files:**
- `agent-skill.sh:305` — `"Install it: brew install unzip"`
- `amp-helper.sh:83` — `"brew install openssl@3"`

**Problem:** `brew` (Homebrew) is macOS-specific. On Linux, the package managers are `apt`, `yum`, `dnf`, `pacman`, etc. These error messages will confuse Linux users.

**Fix:** Show platform-appropriate install instructions:
```bash
if [[ "$(uname)" == "Darwin" ]]; then
    echo "Install with: brew install unzip"
else
    echo "Install with: sudo apt install unzip  # or your distro's package manager"
fi
```
Similarly for `common.sh:222` which says `"Install with: brew install jq"`.

---

## Already-Handled Cross-Platform Patterns (Good Practices Found)

The codebase already handles several cross-platform concerns correctly:

1. **Date formatting in `amp-helper.sh`** (lines 1265-1274): Has a 3-way fallback: `gdate` (macOS coreutils) -> GNU `date -d` (Linux) -> BSD `date -j -f` (macOS native). Excellent.

2. **Date arithmetic in `amp-helper.sh`** (lines 1465-1468): 4-way fallback: BSD `date -v` -> GNU `date -d` -> `gdate` -> `python3`. Comprehensive.

3. **`realpath` fallback in `agent-commands.sh`** (lines 429-434): Checks `command -v realpath` and provides a `cd -P && pwd` fallback. Correct pattern.

4. **Color support detection in `agent-helper.sh`** (lines 72-88): Checks `-t 1`, `$TERM`, and falls back to empty strings. POSIX-aware.

5. **Shell RC detection in `common.sh`** (lines 410-431): Detects zsh vs bash vs fallback, checks `.bashrc` vs `.bash_profile` for macOS. Solid.

6. **`#!/usr/bin/env bash`** shebangs on all sourced scripts (agent-helper.sh, agent-core.sh, agent-commands.sh, agent-session.sh, aimaestro-agent.sh): Correct for finding Homebrew bash on macOS.

7. **Timestamp generation** using `date -u +%Y-%m-%dT%H:%M:%SZ`: This format is POSIX-portable. Used consistently throughout.

8. **No use of `grep -P`**: None of the scripts use Perl-compatible regex with grep, which would fail on macOS.

9. **No use of `sed -i`**: None of the audited scripts use in-place sed editing, avoiding the macOS/Linux `sed -i` incompatibility.

10. **No use of `readlink -f`**: The scripts avoid this Linux-only flag entirely.

---

## Summary of Recommended Fixes

| ID  | File | Line(s) | Fix |
|-----|------|---------|-----|
| H1  | agent-core.sh | 210,212 | Add `realpath` availability check + fallback (like agent-commands.sh:429) |
| H2  | agent-core.sh | 259 | Use `sed $'s/\x1b\\[[0-9;]*m//g'` (bash ANSI-C quoting) |
| H3  | debug-hooks SKILL.md | 99 | Replace `stat -f` with `ls -la` or document both platform forms |
| M1  | agent-helper.sh | top | Add runtime bash version check (BASH_VERSINFO) |
| M4  | docs-helper.sh | 47 | Use `jq -sRr @uri` instead of `python3` for URL encoding (fixes injection too) |
| M5  | export-agent.sh | 134 | Use `du -h | cut -f1` instead of `ls -lh | awk` |
| L4  | agent-skill.sh, amp-helper.sh, common.sh | various | Add Linux package manager alternatives to error messages |

---

## Files Audited

### Scripts (12 target files)
- `graph-describe.sh` — No issues found
- `graph-find-associations.sh` — No issues found
- `graph-find-by-type.sh` — No issues found
- `graph-find-callees.sh` — No issues found
- `graph-find-callers.sh` — No issues found
- `graph-find-path.sh` — No issues found
- `graph-find-related.sh` — No issues found
- `graph-find-serializers.sh` — No issues found
- `graph-index-delta.sh` — No issues found
- `export-agent.sh` — M5 (ls -lh parsing)
- `docs-stats.sh` — No issues found
- `agent-core.sh` — H1 (realpath -m), H2 (sed \x1b), M3 (xargs sort)

### Helper files (sourced by target scripts)
- `graph-helper.sh` — No issues found
- `docs-helper.sh` — M4 (python3 URL encoding)
- `agent-helper.sh` — M1 (bash 4.0 not enforced), M2 (declare -g)
- `common.sh` — L1 (hostname), L4 (brew install in error msg)

### SKILL.md files (9 files spot-checked)
- `debug-hooks/SKILL.md` — H3 (stat -f macOS-only)
- All others — No platform-specific commands in examples

### Additional files flagged by grep
- `agent-commands.sh` — Has `realpath -m` with proper fallback (no issue)
- `amp-helper.sh` — Excellent date handling with multi-platform fallbacks
- `list-agents.sh`, `import-agent.sh` — L1 (hostname fallback, same as common.sh)
