# Audit: Agent Management Scripts
**Date:** 2026-03-06
**Scope:** All `agent-*.sh` scripts, `aimaestro-agent.sh`, `list-agents.sh`, `export-agent.sh`, `import-agent.sh`, and SKILL.md

---

## CATEGORY 1: CRITICAL ISSUES

### C-1: `messaging-helper.sh` does not exist anywhere in the codebase
**File:** `agent-helper.sh:50-54`
**Severity:** CRITICAL

`agent-helper.sh` tries to source `messaging-helper.sh` from two locations:
- `${SCRIPT_DIR}/messaging-helper.sh`
- `${HOME}/.local/share/aimaestro/shell-helpers/messaging-helper.sh`

Neither file exists in the repository. The fallback chain then tries `common.sh` which does exist. However, the comment on line 51 says "Source Helper Files" suggesting `messaging-helper.sh` was expected to provide additional functions. If `messaging-helper.sh` ever provided `search_agent_all_hosts()`, that function is now completely missing from the codebase (see C-2).

### C-2: `search_agent_all_hosts()` referenced but never defined
**File:** `agent-helper.sh:799-832`
**Severity:** CRITICAL

`resolve_agent()` Phase 3 calls `search_agent_all_hosts "$agent_part"` and reads its output variables `SEARCH_COUNT`, `SEARCH_RESULTS`, `SEARCH_IS_FUZZY`. This function does not exist in `common.sh` or anywhere in the live script files -- only in diff/doc files. The `type search_agent_all_hosts &>/dev/null` guard on line 799 means this code path is silently dead. Multi-host agent resolution is completely non-functional.

### C-3: Duplicate `check_dependencies()` function definition
**File:** `agent-helper.sh:33-42` and `agent-core.sh:50-59`
**Severity:** HIGH

Both files define `check_dependencies()`. The version in `agent-helper.sh` only checks for `curl` and `jq`. The version in `agent-core.sh` checks for `curl`, `jq`, AND `tmux`. Since `agent-core.sh` is sourced after `agent-helper.sh` (per `aimaestro-agent.sh:61`), the `agent-core.sh` version wins when called from `aimaestro-agent.sh`. But `agent-helper.sh` also calls its own version immediately at line 44 (`check_dependencies || exit 1`), which runs during sourcing and does NOT check for `tmux`. This means:
1. `agent-helper.sh` will exit early if `curl`/`jq` are missing (before core is loaded)
2. `aimaestro-agent.sh:74` calls `check_dependencies` which is now the core version (checks tmux too)
3. The function name collision is confusing and the double invocation is wasteful.

### C-4: `list-agents.sh`, `export-agent.sh`, `import-agent.sh` use Python3 for JSON parsing
**File:** `list-agents.sh:30,49-98`, `export-agent.sh:87,131-145`, `import-agent.sh:142-160,189,196-224,235-255`
**Severity:** HIGH

These three standalone scripts depend on `python3` for JSON parsing and display, but `python3` is not listed as a dependency and is not checked before use. The rest of the CLI uses `jq` consistently. If `python3` is unavailable, these scripts fail with unhelpful errors. Also, `python3` is unnecessary since `jq` can handle everything these scripts need.

### C-5: `list-agents.sh` and `export-agent.sh` / `import-agent.sh` are entirely redundant
**File:** `list-agents.sh`, `export-agent.sh`, `import-agent.sh`
**Severity:** HIGH

These standalone scripts duplicate functionality that already exists in `agent-commands.sh`:
- `list-agents.sh` → `aimaestro-agent.sh list`
- `export-agent.sh` → `aimaestro-agent.sh export` (partially -- this one exports ZIP via a different API)
- `import-agent.sh` → `aimaestro-agent.sh import` (partially -- this one imports ZIP via a different API)

The standalone scripts use a completely different API endpoint pattern (`/api/agents/${AGENT_ID}/export` returning ZIP) versus the `cmd_export`/`cmd_import` functions (which create/read `.agent.json` files). This is a significant inconsistency -- there are TWO different export/import mechanisms with different formats.

---

## CATEGORY 2: MODERATE ISSUES

### M-1: API base URL detection differs between scripts
**Files:** `list-agents.sh:11-18`, `export-agent.sh:16-23`, `import-agent.sh:22-29` vs `agent-helper.sh` / `common.sh`
**Severity:** MODERATE

The standalone scripts use `AIMAESTRO_API` (via identity API or hostname fallback). The modular scripts use `get_api_base()` from `common.sh` which uses `AIMAESTRO_API_BASE`. Different variable names, different resolution logic. Inconsistent behavior.

### M-2: `cmd_list` table output uses subshell pipe, agent_count is lost
**File:** `agent-commands.sh:154-173`
**Severity:** LOW-MODERATE

The `while IFS='|' read` loop is on the right side of a pipe (`jq ... | while ...`), which runs in a subshell. The `agent_count` variable incremented inside never propagates back to the parent. The count is never used anyway, so this is currently harmless but misleading code.

### M-3: `cmd_list` table formatting has extra empty column
**File:** `agent-commands.sh:172`
**Severity:** LOW

The printf on line 172 has `%b%-12s %-8s %s` where `status_display` is printed via `%b` (interpreting escape codes) but then an extra empty string `""` is printed for `%-12s`. The column alignment is broken because of this extra field.

### M-4: `cmd_show` does not use `_api_request()` helper
**File:** `agent-commands.sh:216`
**Severity:** LOW-MODERATE

`cmd_show` uses raw `curl -s --max-time 30` instead of `_api_request()` which provides proper HTTP status code checking. If the API returns a 500 error with a JSON body, `cmd_show` would try to parse it as valid agent data.

### M-5: No `--help` support in `cmd_plugin_enable` and `cmd_plugin_disable`
**File:** `agent-plugin.sh:579-622, 624-667`
**Severity:** LOW

These are the only plugin subcommands without `--help` / `-h` support. All other subcommands have it.

### M-6: `plugin load` command word-splits paths on whitespace
**File:** `agent-plugin.sh:552`
**Severity:** MODERATE

`for p in $plugin_path` uses unquoted variable expansion, splitting on whitespace. Paths with spaces will break. The `plugin_path` variable is built by string concatenation (line 531) instead of using an array.

### M-7: `cmd_plugin_load` builds shell commands with unescaped paths
**File:** `agent-plugin.sh:561-566`
**Severity:** MODERATE

`plugin_dir_flags` is built via string concatenation with embedded `\"` quotes. If paths contain special characters, the displayed command will be incorrect. Should use an array.

### M-8: `safe_json_edit` defines a nested function `cleanup_tmp()`
**File:** `agent-core.sh:466-471`
**Severity:** LOW-MODERATE

Bash doesn't have proper function scoping. The nested `cleanup_tmp()` function pollutes the global namespace. If another function defines `cleanup_tmp()` before or after, they'll collide. Also, this function is never registered as a trap -- it's only called manually at error points, which means interrupted execution (SIGTERM during the function) could leak temp directories.

### M-9: `export-agent.sh` and `import-agent.sh` reference API endpoints not present in SKILL.md
**File:** `export-agent.sh:79`, `import-agent.sh:186`
**Severity:** MODERATE

These scripts use:
- `GET /api/agents/${AGENT_ID}/export` (returns ZIP)
- `POST /api/agents/import` (multipart form upload)

Neither endpoint is documented in SKILL.md, which only documents the `.agent.json` export/import via `cmd_export`/`cmd_import`.

### M-10: `import-agent.sh` builds JSON by string concatenation
**File:** `import-agent.sh:165-169`
**Severity:** MODERATE (potential injection)

```bash
OPTIONS_JSON="{\"newId\":$NEW_ID,\"skipMessages\":$SKIP_MESSAGES,\"overwrite\":$OVERWRITE"
if [ ! -z "$NEW_ALIAS" ]; then
    OPTIONS_JSON="$OPTIONS_JSON,\"newAlias\":\"$NEW_ALIAS\""
fi
```

`NEW_ALIAS` comes from user input and is not sanitized before being interpolated into JSON. A carefully crafted alias like `foo","admin":true,"x":"` could inject arbitrary JSON fields. Should use `jq` for JSON construction.

### M-11: `list-agents.sh` hardcodes colors without terminal check
**File:** `list-agents.sh:22-26`
**Severity:** LOW

Unlike `agent-helper.sh` which checks terminal capabilities, `list-agents.sh` always sets ANSI color variables. When piped, this produces escape codes in output.

### M-12: SKILL.md says `restart` command is section "8a" but the help text mentions it independently
**File:** SKILL.md lines 388-414, `aimaestro-agent.sh:97`
**Severity:** LOW

`restart` is documented under "8a" as a subsection of "Wake". It's actually a top-level command in the dispatcher. The SKILL.md help header says "## PART 1" lists only up to `export/import` but `restart` is a peer command.

### M-13: SKILL.md table output format shows box-drawing characters not matching actual output
**File:** SKILL.md lines 109-116
**Severity:** LOW

SKILL.md shows `list` output with Unicode box drawing (`┌─┬─┐` etc.) but the actual `cmd_list` in `agent-commands.sh` uses simple `─` dashes without box corners. The documented output format does not match reality.

### M-14: `cmd_delete` sends `--keep-folder`/`--keep-data` flags but never passes them to the API
**File:** `agent-commands.sh:532-605`
**Severity:** MODERATE

The `delete` command accepts `--keep-folder` and `--keep-data` flags and sets boolean variables, but never includes them in the DELETE API call (line 595). These flags are silently ignored. SKILL.md acknowledges this ("reserved for future API support") but the flags should either be removed or clearly warn the user they are not implemented.

---

## CATEGORY 3: INCONSISTENCIES BETWEEN SKILL.md AND SCRIPTS

### I-1: SKILL.md documents `list` output columns as "NAME | STATUS | WORKING DIRECTORY | TAGS"
**File:** SKILL.md line 109 vs `agent-commands.sh:143`
**Severity:** LOW

Actual table headers are "NAME | STATUS | SESSIONS | WORKING DIRECTORY" -- no Tags column, added Sessions column.

### I-2: SKILL.md installation section references `./install-agent-cli.sh`
**File:** SKILL.md line 57
**Severity:** LOW

The actual installer script exists at the project root, but SKILL.md doesn't specify the path. Since skills are read by agents who may not be in the project root, this could be confusing.

### I-3: SKILL.md section "Script Architecture" says modules are in `plugin/src/scripts/`
**File:** SKILL.md line 953
**Severity:** LOW

The actual path is `plugin/plugins/ai-maestro/scripts/`. The `plugin/src/scripts/` path also exists as a copy. This could confuse developers about which is the source of truth.

### I-4: `cmd_help` lists commands in different order than `main()` case statement
**File:** `agent-commands.sh:24-38` vs `aimaestro-agent.sh:87-103`
**Severity:** LOW

`cmd_help` does not list `restart` command. It is only accessible via the main dispatcher. Help output is incomplete.

### I-5: SKILL.md documents `--yes` as "Required for rename (safety flag)"
**File:** SKILL.md line 330
**Severity:** LOW

The actual behavior (line 765-768 of agent-commands.sh) is that `--yes` is required only in non-interactive mode. The `confirm()` function in agent-helper.sh would also work for interactive confirmation, but rename does not use it -- it simply errors if `--yes` is not provided. Inconsistent with `delete` which uses `--confirm`.

---

## CATEGORY 4: DEAD CODE AND CLEANUP OPPORTUNITIES

### D-1: `AIMAESTRO_API_BASE` exported but never set by any script
**File:** `agent-helper.sh:18`
**Severity:** LOW

`export AIMAESTRO_API_BASE="${AIMAESTRO_API_BASE:-}"` defaults to empty. The actual API base comes from `get_api_base()` in `common.sh`. This export line is only useful if the user sets it as an environment variable externally.

### D-2: `cmd_export` `--include-data` and `--include-folder` flags parsed but never used
**File:** `agent-commands.sh:839-840, 854-855`
**Severity:** LOW

Variables `include_data` and `include_folder` are set but never referenced in the function body.

### D-3: `validate_import_file` extracts `.agent` with `-e` flag but discards the value
**File:** `agent-helper.sh:1067-1070`
**Severity:** LOW

The `has_agent` variable captures the full JSON object just to check if it's non-empty. A simpler `jq -e '.agent' "$file" >/dev/null 2>&1` would suffice without storing the value.

### D-4: `plugin clean` orphaned entries check is a stub
**File:** `agent-plugin.sh:964-967`
**Severity:** LOW

The comment says "full implementation would cross-reference" but only prints a message and does nothing. Either implement it or remove the misleading message.

---

## CATEGORY 5: SECURITY OBSERVATIONS

### S-1: `run_claude_command` unsets CLAUDECODE in subshell
**File:** `agent-core.sh:317`
**Severity:** INFO

Documented as fixing issue 9.1 (nesting detection bypass). This is intentional but worth noting -- it allows arbitrary Claude Code execution from within a Claude Code session, bypassing the nesting guard.

### S-2: `cmd_create` model validation regex is overly permissive
**File:** `agent-commands.sh:410`
**Severity:** LOW

The regex `^(claude-)?(sonnet|opus|haiku)(-[0-9]+(-[0-9]+)?(-[0-9]{8})?)?$` allows model names like just `sonnet` or `haiku` without the `claude-` prefix. This may not match actual API expectations depending on how the server validates.

### S-3: `cmd_create` directory whitelist check can be bypassed
**File:** `agent-commands.sh:440`
**Severity:** LOW

The check `$resolved_dir != "$resolved_home"*` uses shell globbing prefix match. On macOS where HOME is `/Users/foo`, a directory like `/Users/foobar/evil` would also pass this check since it starts with the HOME path prefix. However, since `realpath -m` is used and directories must actually be created, the practical risk is minimal.

### S-4: `escape_regex` in agent-core.sh has incomplete metacharacter list
**File:** `agent-core.sh:46`
**Severity:** LOW

The `sed` pattern `s/[][\/.^$*+?{}|()]/\\&/g` handles most PCRE metacharacters but may miss some edge cases depending on the regex engine consuming the result. In practice this is used with `jq`'s `test()` which uses PCRE, so coverage is adequate.

---

## CATEGORY 6: BASH BEST PRACTICES ISSUES

### B-1: Mixed use of `[ ]` and `[[ ]]` in standalone scripts
**Files:** `list-agents.sh`, `export-agent.sh`, `import-agent.sh`
**Severity:** LOW

These use `#!/bin/bash` but mix POSIX `[ ]` with bash-specific `[[ ]]` tests. Not a bug, but inconsistent with the modular scripts that consistently use `[[ ]]`.

### B-2: `export-agent.sh` and `import-agent.sh` use `#!/bin/bash` without `-euo pipefail`
**Files:** `export-agent.sh:1`, `import-agent.sh:1`
**Severity:** LOW

Only `set -e` is used. No `set -u` (unbound variable check) or `pipefail`. The modular scripts use `set -euo pipefail` (in `aimaestro-agent.sh`) or `set -uo pipefail` (in `agent-helper.sh`).

### B-3: `list-agents.sh` has no `set -u` or `pipefail`
**File:** `list-agents.sh:8`
**Severity:** LOW

Only `set -e`.

### B-4: `for mp_dir in "$cache_dir"/*/` pattern when directory is empty
**File:** `agent-plugin.sh:363, 915`
**Severity:** LOW

If `$cache_dir` has no subdirectories, the glob `"$cache_dir"/*/` will not expand and the loop body runs once with the literal glob pattern. The `[[ ! -d "$mp_dir" ]] && continue` guard on line 916 handles this, but the pattern on line 363 lacks this guard. If `$cache_dir` itself doesn't exist, the glob will also not expand correctly.

---

## SUMMARY

| Category | Count |
|----------|-------|
| Critical Issues | 5 |
| Moderate Issues | 14 |
| SKILL.md Inconsistencies | 5 |
| Dead Code | 4 |
| Security Observations | 4 |
| Bash Best Practices | 4 |
| **Total** | **32** |

**Top 3 Action Items:**
1. **Fix or remove `messaging-helper.sh` dependency and `search_agent_all_hosts()` dead code** (C-1, C-2) -- multi-host resolution is completely broken
2. **Consolidate or deprecate standalone scripts** (`list-agents.sh`, `export-agent.sh`, `import-agent.sh`) -- they duplicate CLI functionality with different API endpoints and weaker security (C-4, C-5)
3. **Fix JSON injection in `import-agent.sh`** (M-10) -- user-supplied alias is interpolated unsafely into JSON string
