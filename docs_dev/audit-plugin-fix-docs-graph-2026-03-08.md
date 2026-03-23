# Plugin Script Fixes: docs/graph/memory helpers
Generated: 2026-03-08

## CRIT-4: Fallback source path for common.sh (3 files)

**Files:** `scripts/docs-helper.sh`, `scripts/graph-helper.sh`, `scripts/memory-helper.sh`

**Problem:** Fallback path `${SCRIPT_DIR}/../scripts/shell-helpers/common.sh` resolved to `plugin/plugins/ai-maestro/scripts/shell-helpers/common.sh` which does not exist. The `../scripts/` went up one level from `scripts/` and back into `scripts/`, adding a spurious parent traversal.

**Fix:** Changed to `${SCRIPT_DIR}/shell-helpers/common.sh` in all 3 files (lines 9-10).

**Verification:** `common.sh` primary location is `~/.local/share/aimaestro/shell-helpers/common.sh` (installed). Fallback is for dev/repo use where `shell-helpers/` would be a sibling dir inside `scripts/`.

## CRIT-5: Raw curl with empty API_BASE in graph-index-delta.sh

**File:** `scripts/graph-index-delta.sh`

**Problem:** Lines 30-33 used `curl ... "${API_BASE}/api/agents/${AGENT_ID}/graph/code"`. The `API_BASE` variable from `common.sh` line 72 defaults to empty string (`${AIMAESTRO_API_BASE:-}`), causing the curl URL to be `/api/agents/...` (no host). The `api_query()` function in `common.sh` correctly calls `get_api_base()` which resolves dynamically.

**Fix:** Replaced the 18-line raw curl block (lines 30-47) with a single call:
```
RESPONSE=$(api_query "POST" "/api/agents/${AGENT_ID}/graph/code" -H "Content-Type: application/json" -d "$BODY") || exit 1
```
This also eliminates the duplicate error/success checking since `api_query` already handles that.

## CRIT-6: URL encoding vulnerability in docs-helper.sh

**File:** `scripts/docs-helper.sh`

**Problem:** Line 47 used `python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))"` which breaks when `$query` contains single quotes (shell injection / encoding failure).

**Fix:** Replaced with `printf '%s' "$query" | jq -sRr @uri` which safely handles all special characters via stdin pipe (no shell interpolation in the encoding step). This matches the pattern already used in `memory-search.sh:66`.

## HIGH-7: --limit parameter parsed but never used in docs-list.sh

**Files:** `scripts/docs-list.sh`, `scripts/docs-helper.sh`

**Problem:** `docs-list.sh` parsed `--limit` into `LIMIT` variable (line 11-18) but called `docs_list "$AGENT_ID"` without passing it. The `docs_list()` function in `docs-helper.sh` had no limit parameter.

**Fix:**
1. Updated `docs_list()` in `docs-helper.sh` to accept a 3rd `limit` parameter and append `&limit=${limit}` to the API query when provided.
2. Updated `docs-list.sh` call to `docs_list "$AGENT_ID" "" "$LIMIT"` (empty string for doc_type, LIMIT for limit).

## HIGH-8: Missing .doc_id fallback in docs-list.sh jq output

**File:** `scripts/docs-list.sh`

**Problem:** Line 56 used `.docId` without fallback, while `docs-search.sh` and `docs-find-by-type.sh` use `(.doc_id // .docId)` with fallback for both snake_case and camelCase API responses.

**Fix:** Changed jq expression to use `(.doc_id // .docId)`, `(.doc_type // .docType)`, and `(.file_path // .filePath)` with fallbacks, matching the pattern in sibling scripts.

## Files Modified
1. `plugin/plugins/ai-maestro/scripts/docs-helper.sh` - CRIT-4 (fallback path), CRIT-6 (URL encoding), HIGH-7 (limit param in docs_list)
2. `plugin/plugins/ai-maestro/scripts/graph-helper.sh` - CRIT-4 (fallback path)
3. `plugin/plugins/ai-maestro/scripts/memory-helper.sh` - CRIT-4 (fallback path)
4. `plugin/plugins/ai-maestro/scripts/graph-index-delta.sh` - CRIT-5 (raw curl replaced with api_query)
5. `plugin/plugins/ai-maestro/scripts/docs-list.sh` - HIGH-7 (wire LIMIT), HIGH-8 (docId fallback)

## MED-14: Add --help support to 6 graph scripts

**Files:**
1. `plugin/plugins/ai-maestro/scripts/graph-describe.sh`
2. `plugin/plugins/ai-maestro/scripts/graph-find-related.sh`
3. `plugin/plugins/ai-maestro/scripts/graph-find-associations.sh`
4. `plugin/plugins/ai-maestro/scripts/graph-find-serializers.sh`
5. `plugin/plugins/ai-maestro/scripts/graph-find-callees.sh`
6. `plugin/plugins/ai-maestro/scripts/graph-find-callers.sh`

**Problem:** Running `script.sh --help` treated "--help" as a component name argument and passed it to the graph API query, instead of showing help. All 6 scripts had a usage block for empty `$1` (exit 1), but no `--help`/`-h` interception.

**Fix:** Added a `--help`/`-h` check block after `source graph-helper.sh` and before the existing `if [ -z "$1" ]` check in each script. The help block:
- Prints usage line with `$(basename "$0")` for portability
- Shows a concise description specific to each script's purpose
- Lists the required argument and available options
- Exits with code 0 (success, not error)

**Verification:**
- Syntax check (bash -n): PASS on all 6 files
- `--help` flag: PASS on all 6 files (correct output, exit 0)
- `-h` flag: PASS on all 6 files (correct output, exit 0)
- Existing no-argument behavior: unchanged (still shows usage and exits 1)

## Files Modified (cumulative)
1. `plugin/plugins/ai-maestro/scripts/docs-helper.sh` - CRIT-4, CRIT-6, HIGH-7
2. `plugin/plugins/ai-maestro/scripts/graph-helper.sh` - CRIT-4
3. `plugin/plugins/ai-maestro/scripts/memory-helper.sh` - CRIT-4
4. `plugin/plugins/ai-maestro/scripts/graph-index-delta.sh` - CRIT-5
5. `plugin/plugins/ai-maestro/scripts/docs-list.sh` - HIGH-7, HIGH-8
6. `plugin/plugins/ai-maestro/scripts/graph-describe.sh` - MED-14
7. `plugin/plugins/ai-maestro/scripts/graph-find-related.sh` - MED-14
8. `plugin/plugins/ai-maestro/scripts/graph-find-associations.sh` - MED-14
9. `plugin/plugins/ai-maestro/scripts/graph-find-serializers.sh` - MED-14
10. `plugin/plugins/ai-maestro/scripts/graph-find-callees.sh` - MED-14
11. `plugin/plugins/ai-maestro/scripts/graph-find-callers.sh` - MED-14

## Verification
- Syntax check (bash -n): PASS on all 11 files
- Pattern followed: Matched existing conventions from memory-search.sh and docs-search.sh
