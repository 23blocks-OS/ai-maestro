# Plugin Agent Scripts Fix Report
Generated: 2026-03-08

## CRIT-1: Remove dead `messaging-helper.sh` source and `search_agent_all_hosts()` calls

### Part A: Source block removal
- File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- Lines: 50-54 (old numbering)
- Change: Removed the if/elif block that tried to source `messaging-helper.sh` (file confirmed non-existent anywhere on disk). Simplified to directly source `common.sh` with proper if/elif/else indentation.

### Part B: Multi-host search block removal
- File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- Lines: 789-856 (old numbering), inside `resolve_agent()`
- Change: Removed the entire Phase 3 block that called `search_agent_all_hosts()` (undefined function). Replaced with `# TODO: Multi-host resolution not yet implemented`. Kept the local agent listing fallback for "not found" errors.

## HIGH-5: `check_dependencies()` name collision between agent-helper.sh and agent-core.sh

- File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- Change: Renamed `check_dependencies()` to `check_base_dependencies()`. Updated the call site on the same file.

- File: `plugin/plugins/ai-maestro/scripts/agent-core.sh`
- Change: Updated `check_dependencies()` to delegate to `check_base_dependencies()` for curl/jq checks, then adds the tmux check on top. This eliminates the redefinition conflict while keeping the public API (`check_dependencies`) stable for callers like `aimaestro-agent.sh`.

## HIGH-4: JSON injection in import-agent.sh

- File: `plugin/plugins/ai-maestro/scripts/import-agent.sh`
- Lines: 165-169
- Change: Replaced unsafe string concatenation (`"$OPTIONS_JSON,\"newAlias\":\"$NEW_ALIAS\""`) with `jq -n` for safe JSON construction. The `--arg newAlias` flag ensures user input is properly escaped by jq, preventing injection of arbitrary JSON keys/values.

## Verification
- Syntax check (bash -n): PASS for all 3 files
- Pattern followed: fail-fast, no fallbacks, jq for JSON safety
- No other callers of the renamed function were broken (verified via grep)

## Files Modified
1. `plugin/plugins/ai-maestro/scripts/agent-helper.sh` - CRIT-1 + HIGH-5
2. `plugin/plugins/ai-maestro/scripts/agent-core.sh` - HIGH-5
3. `plugin/plugins/ai-maestro/scripts/import-agent.sh` - HIGH-4

## HIGH-3: Deprecate standalone scripts that duplicate CLI functionality

### Problem
`list-agents.sh`, `export-agent.sh`, and `import-agent.sh` depend on `python3` (undeclared dependency), duplicate functionality already available in `aimaestro-agent.sh` CLI, and use incompatible export/import formats (ZIP vs `.agent.json`).

### Fix Applied
Added deprecation notice block to all three scripts after the `set -e` line:
- Comment block explaining the deprecation and replacement commands
- Runtime stderr warning so users see it when they run the script
- Scripts continue to function normally after the warning

### JSON Injection (import-agent.sh)
Already fixed by prior agent (HIGH-4 above). Lines 164-172 use `jq -n` with `--arg`/`--argjson` for safe JSON construction.

### Files Modified
1. `plugin/plugins/ai-maestro/scripts/list-agents.sh` - Added deprecation notice
2. `plugin/plugins/ai-maestro/scripts/export-agent.sh` - Added deprecation notice
3. `plugin/plugins/ai-maestro/scripts/import-agent.sh` - Added deprecation notice

## MED-10: `agent-plugin.sh` word-splits paths on whitespace

- File: `plugin/plugins/ai-maestro/scripts/agent-plugin.sh`
- Function: `cmd_plugin_load()`
- Change: Replaced `plugin_path=""` (space-delimited string) with `plugin_paths=()` (bash array). The `for p in $plugin_path` loop (unquoted expansion causing word-splitting on whitespace in paths) was replaced with `for p in "${plugin_paths[@]}"` which preserves each path element intact regardless of whitespace or special characters.

## MED-11: `agent-plugin.sh` cmd_plugin_load builds shell commands with unescaped paths

- File: `plugin/plugins/ai-maestro/scripts/agent-plugin.sh`
- Function: `cmd_plugin_load()`
- Change: Replaced `plugin_dir_flags=""` (string concatenation with embedded quotes) with `plugin_dir_flags=()` (bash array with `+=("--plugin-dir" "$p")`). For the display output shown to the user, paths are now properly escaped using `printf '%q'` to handle special characters safely.

## MED-12: `agent-commands.sh` --keep-folder/--keep-data flags silently ignored

- File: `plugin/plugins/ai-maestro/scripts/agent-commands.sh`
- Function: `cmd_delete()`
- Lines: 588-602
- Change: The `keep_folder` and `keep_data` flags were parsed but never forwarded to the API. Added query parameter construction that appends `?keepFolder=true` and/or `&keepData=true` to the DELETE URL when the respective flags are set. Uses `${params:1}` to strip the leading `&` for clean URL formatting.

## Verification (MED-10, MED-11, MED-12)
- Syntax check (bash -n): PASS for both files
- Pattern followed: array-based iteration for safe whitespace/special-char handling, query params for API flag forwarding

## All Files Modified (cumulative)
1. `plugin/plugins/ai-maestro/scripts/agent-helper.sh` - CRIT-1 + HIGH-5
2. `plugin/plugins/ai-maestro/scripts/agent-core.sh` - HIGH-5
3. `plugin/plugins/ai-maestro/scripts/import-agent.sh` - HIGH-4 + HIGH-3
4. `plugin/plugins/ai-maestro/scripts/list-agents.sh` - HIGH-3
5. `plugin/plugins/ai-maestro/scripts/export-agent.sh` - HIGH-3
6. `plugin/plugins/ai-maestro/scripts/agent-plugin.sh` - MED-10 + MED-11
7. `plugin/plugins/ai-maestro/scripts/agent-commands.sh` - MED-12
