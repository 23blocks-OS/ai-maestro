# Code Correctness Report: config-docs-scripts

**Agent:** epcp-code-correctness-agent
**Domain:** config-docs-scripts
**Files audited:** 9
**Date:** 2026-02-17T00:19:00Z

## MUST-FIX

No must-fix issues found.

## SHOULD-FIX

### [CC-001] Literal `\n` in gateway list sed substitution (remote-install.sh)
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:1225
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED (tested on macOS)
- **Description:** The `gw_list` variable is built with literal `\n` strings (shell does not expand `\n` in double-quoted string assignment). When `portable_sed` substitutes `{{ACTIVE_GATEWAYS_LIST}}` in MAILMAN-CLAUDE.md, the result is a single line containing `- Slack\n- Discord` literally, rather than separate lines with actual newlines. The template at `scripts/MAILMAN-CLAUDE.md:14` expects a multi-line bullet list.
- **Evidence:**
```bash
# Line 1224-1225:
if [ -n "$gw_list" ]; then
    gw_list="${gw_list}\n- ${gw_display}"
```
On macOS, `"${gw_list}\n- ${gw_display}"` produces the literal string `- Slack\n- Discord`, not `- Slack` + newline + `- Discord`.
- **Fix:** Use `$'\n'` for actual newlines, or use `printf` to build the string:
```bash
gw_list="${gw_list}"$'\n'"- ${gw_display}"
```
Or alternatively use `printf '%s\n' "- ${gw_display}"` to append to the variable.

### [CC-002] Unused `SCRIPTS_OK` variable (install-messaging.sh)
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:810
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `SCRIPTS_OK` is set to `false` when a script verification fails (line 810), but it is never checked afterwards. A user running the installer could see individual failure messages but the script will still report overall success. The verification section should exit non-zero or print a summary warning if any scripts are missing.
- **Evidence:**
```bash
# Line 803-811:
SCRIPTS_OK=true
for script in "${AMP_SCRIPTS[@]}"; do
    if [ -x ~/.local/bin/"$script" ]; then
        print_success "$script"
    else
        print_error "$script not found"
        SCRIPTS_OK=false
    fi
done
# SCRIPTS_OK is never referenced again
```
- **Fix:** After the verification loop, check `$SCRIPTS_OK` and print a warning or exit with error if scripts are missing.

## NIT

### [CC-003] SC2155: Declare and assign separately in install-messaging.sh
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:401,430
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED (shellcheck)
- **Description:** `local BACKUP_DIR="$(date ...)"` and `local SHARED_BACKUP="$(date ...)"` combine declaration with command substitution, masking the return value of the subshell. If `date` fails (extremely unlikely but technically possible), the error code is silently lost.
- **Evidence:**
```bash
# Line 401:
local BACKUP_DIR="$HOME/.aimaestro/messages.backup.$(date +%Y%m%d-%H%M%S)"
# Line 430:
local SHARED_BACKUP="$HOME/.agent-messaging/messages.backup.$(date +%Y%m%d-%H%M%S)"
```
- **Fix:** Declare first, then assign: `local BACKUP_DIR; BACKUP_DIR="$HOME/...$(date ...)"`.

### [CC-004] SC2088: Tilde in quotes does not expand (install-messaging.sh)
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:679
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED (shellcheck)
- **Description:** `"~/.local/bin already in PATH"` uses tilde in quotes, but since this is an informational message string (not a path), it is purely cosmetic. The tilde is displayed as-is, which is actually the intended behavior for a user-facing message.
- **Evidence:**
```bash
print_info "~/.local/bin already in PATH"
```
- **Fix:** No action needed -- this is intentional for display purposes. Suppress the shellcheck warning if desired.

### [CC-005] Documentation says "5 skills" but installer installs 7
- **File:** /Users/emanuelesabetta/ai-maestro/docs/ai-index.html:239 and /Users/emanuelesabetta/ai-maestro/README.md:48
- **Severity:** NIT
- **Category:** documentation
- **Confidence:** CONFIRMED
- **Description:** Both `docs/ai-index.html` line 239 and `README.md` line 48 reference "5 skills", but `install-messaging.sh` installs 7 skills: agent-messaging, graph-query, memory-search, docs-search, planning, ai-maestro-agents-management, and team-governance. The skill count documentation is outdated.
- **Evidence:**
```html
<!-- ai-index.html:239 -->
<p>Installs 5 skills via the Claude Code plugin marketplace.

<!-- README.md:48 -->
- Claude Code plugin with 5 skills and 32 CLI scripts
```
vs. `install-messaging.sh:756`:
```bash
OTHER_SKILLS=("graph-query" "memory-search" "docs-search" "planning" "ai-maestro-agents-management" "team-governance")
# Plus agent-messaging = 7 total
```
- **Fix:** Update both files to say "7 skills". Also update the ai-index.html line 249 which lists only 5 skills (missing ai-maestro-agents-management and team-governance).

### [CC-006] Dots in version regex patterns are not escaped (bump-version.sh)
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:108
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `update_file` function passes version strings like `0.23.12` directly as grep and sed regex patterns. The dots are regex metacharacters matching any character. While false positives are near-impossible given the specific context strings (e.g., `"version": "0.23.12"`), the pattern is technically imprecise.
- **Evidence:**
```bash
# The pattern "version": "0.23.12" in grep/sed treats . as "any char"
# So "0X23Y12" would also match (if it existed)
grep -q "$pattern" "$file"
_sed_inplace "$file" "s|$pattern|$replacement|g"
```
- **Fix:** Escape dots in version strings before passing to grep/sed, e.g., `pattern=$(echo "$pattern" | sed 's/\./\\./g')`. Low priority since the specific surrounding context (e.g., `"version": "`) prevents practical false matches.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/version.json -- No issues (version 0.23.12, consistent)
- /Users/emanuelesabetta/ai-maestro/package.json -- No issues (version 0.23.12, consistent)
- /Users/emanuelesabetta/ai-maestro/docs/index.html -- No issues (version 0.23.12 in schema and display)
- /Users/emanuelesabetta/ai-maestro/docs/BACKLOG.md -- No issues (version header v0.23.12, consistent)

## VERSION CONSISTENCY CHECK

All 9 files show version **0.23.12** consistently:

| File | Location | Version |
|------|----------|---------|
| version.json | `"version"` field | 0.23.12 |
| package.json | `"version"` field | 0.23.12 |
| scripts/remote-install.sh | `VERSION=` variable | 0.23.12 |
| README.md | badge URL | 0.23.12 |
| docs/index.html | schema `softwareVersion` | 0.23.12 |
| docs/index.html | display `<span>v0.23.12</span>` | 0.23.12 |
| docs/ai-index.html | schema `softwareVersion` | 0.23.12 |
| docs/ai-index.html | `Version:` display | 0.23.12 (February 2026) |
| docs/ai-index.html | `Current Version:` display | 0.23.12 (February 2026) |
| docs/BACKLOG.md | `**Current Version:**` | v0.23.12 |
