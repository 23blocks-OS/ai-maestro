# Audit: Plugin Documentation, Graph, and Memory Scripts
**Date:** 2026-03-06
**Scope:** All docs-*, graph-*, and memory-* scripts + their SKILL.md files in `plugin/plugins/ai-maestro/scripts/`

---

## CRITICAL FINDINGS

### C1. Helper fallback path is broken (ALL helpers)
**Files:** `docs-helper.sh:9`, `graph-helper.sh:9`, `memory-helper.sh:9`
**Issue:** The fallback source path `${SCRIPT_DIR}/../scripts/shell-helpers/common.sh` does not resolve to a valid file when `SCRIPT_DIR` is `plugin/plugins/ai-maestro/scripts/`. That path resolves to `plugin/plugins/ai-maestro/scripts/../scripts/shell-helpers/common.sh` = `plugin/plugins/ai-maestro/scripts/shell-helpers/common.sh`, which does not exist. The actual `common.sh` lives at `scripts/shell-helpers/common.sh` (project root). This means if the installed copy at `~/.local/share/aimaestro/shell-helpers/common.sh` is missing, ALL scripts will fail with "common.sh not found".

### C2. `graph-index-delta.sh` bypasses helper's `api_query` function (direct curl)
**File:** `graph-index-delta.sh:30-33`
**Issue:** Uses raw `curl` with `${API_BASE}` variable instead of the `api_query()` function from common.sh. The `API_BASE` variable is set to empty string at line 72 of common.sh (`API_BASE="${AIMAESTRO_API_BASE:-}"`), so unless `AIMAESTRO_API_BASE` is set, this will curl an empty base URL. All other scripts correctly use `api_query()` or helper functions that call it, which internally calls `get_api_base()`. This is a bug that will cause `graph-index-delta.sh` to fail silently or hit the wrong endpoint.

### C3. URL encoding vulnerability in `docs-helper.sh`
**File:** `docs-helper.sh:47`
**Issue:** The python3-based URL encoding uses single-quote interpolation: `python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))"`. If the query contains single quotes, this breaks the Python string and could cause injection. The fallback (`|| echo "$query"`) sends the raw unencoded query, which will break URLs with spaces/special chars. Compare with `memory-search.sh:66` which uses the safer `jq -sRr @uri` approach.

---

## HIGH SEVERITY FINDINGS

### H1. `docs-list.sh` parses but never uses `--limit` parameter
**File:** `docs-list.sh:11-30`
**Issue:** The `LIMIT` variable is parsed from `--limit` flag (default 50) but never passed to `docs_list()`. The function call on line 35 is just `docs_list "$AGENT_ID"` with no limit parameter. The `docs_list()` helper function in `docs-helper.sh:63-71` also has no limit parameter support -- it only supports an optional `doc_type`. The `--limit` flag is dead/misleading.

### H2. `docs-list.sh` uses inconsistent JSON field names vs `docs-search.sh`
**File:** `docs-list.sh:56` vs `docs-search.sh:86`
**Issue:** `docs-list.sh` uses `.docId`, `.docType`, `.filePath` (camelCase). `docs-search.sh` uses `.doc_id // .docId`, `.doc_type // .docType`, `.file_path // .filePath` (snake_case with camelCase fallback). The list script will silently show "null" if the API returns snake_case fields. `docs-find-by-type.sh:53` also uses the fallback pattern like search does. This inconsistency suggests `docs-list.sh` was not updated when the API response format changed.

### H3. `graph-describe.sh` exits with 0 on "not found"
**File:** `graph-describe.sh:48`
**Issue:** When a component is not found (`found == false`), the script exits with code 0 (success). This is inconsistent -- a "not found" result should arguably be a non-zero exit, especially for scripted usage. Same pattern in `graph-find-path.sh:47` and `graph-find-related.sh:86`. While arguably a design choice, it makes error handling in pipelines unreliable.

### H4. Error message references wrong installer scripts
**Files:**
- `docs-helper.sh:12` says `Run install-doc-tools.sh to fix` -- but the actual installer is `install-doc-tools.sh` at the project root, not in the scripts dir. At least it does exist.
- `graph-helper.sh:12` says `Run install-graph-tools.sh to fix` -- installer exists at project root.
- `memory-helper.sh:12` says `Run install-memory-tools.sh to fix` -- installer exists at project root.
- The SKILL.md files also reference `./install-doc-tools.sh`, `~/ai-maestro/install-graph-tools.sh`, `./install-memory-tools.sh` with inconsistent path styles.

### H5. `graph-find-path.sh` uses shell variable `PATH` as a variable name
**File:** `graph-find-path.sh:55-61`
**Issue:** The line `PATHS=$(echo "$RESULT" | jq '.paths')` stores into `PATHS`, but then line 56 does `PATH_COUNT=$(echo "$PATHS" | jq 'length')`. While `PATHS` is safe, the variable name is dangerously close to the `PATH` environment variable. Not a bug, but a maintenance risk.

---

## MEDIUM SEVERITY FINDINGS

### M1. `docs-helper.sh` `docs_query()` uses `$@` unquoted for params
**File:** `docs-helper.sh:21`
**Issue:** `local params="$@"` collapses all remaining args into a single string. If any param contains spaces, word splitting occurs. Should use `local params="$*"` for this use case (concatenation into single string), though ideally would use an array.

### M2. `graph-helper.sh` `graph_query()` same `$@` issue
**File:** `graph-helper.sh:21`
**Issue:** Same as M1. `local params="$@"` in graph_query().

### M3. No `--help` flag in `graph-index-delta.sh`
**File:** `graph-index-delta.sh`
**Issue:** Unlike most other scripts (docs-index-delta.sh, docs-search.sh, etc.), `graph-index-delta.sh` does not support `--help` or `-h`. It silently accepts a positional argument but has no help text. Arguments after the first positional are ignored.

### M4. `graph-describe.sh` missing `--help` flag
**File:** `graph-describe.sh:14`
**Issue:** Exits with code 1 when no arg given and shows usage, but does not check for `--help` or `-h` explicitly. Running `graph-describe.sh --help` would try to describe a component named "--help". Same issue in: `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`.

### M5. `graph-find-by-type.sh` has explicit --help check but others in graph family don't
**File:** `graph-find-by-type.sh:14` has the proper help check.
**Issue:** Inconsistency across graph scripts. Only `graph-find-by-type.sh` and `graph-find-path.sh` handle `--help` properly. Six other graph scripts (`graph-describe.sh`, `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`) only check `[ -z "$1" ]` without a `--help`/`-h` check, meaning `--help` gets treated as a component name.

### M6. `memory-search.sh` silently ignores unknown flags
**File:** `memory-search.sh:56-58`
**Issue:** The `*) shift ;;` catch-all in the while loop silently discards any unrecognized argument. A typo like `--mod semantic` would silently ignore `--mod` and treat `semantic` as QUERY on the next iteration, but since QUERY was already set from `$1`, `semantic` would also be silently ignored. Same pattern in `docs-list.sh:27`.

### M7. `docs-search.sh` SKILL.md shows incorrect flag syntax
**File:** SKILL.md (docs-search) line 87
**Issue:** The skill doc shows `docs-search.sh "Z" --keyword` but the actual script expects `--keyword` BEFORE the query (it's a flag, not a positional modifier). Running `docs-search.sh "Z" --keyword` would set QUERY="Z" first, then set KEYWORD_MODE=true, which actually works due to the while loop, but it's misleading documentation.

### M8. `api_query` in common.sh does double error checking
**File:** `common.sh:373-382`
**Issue:** The `api_query()` function already checks for `success == false` and prints an error + returns 1. But then every calling script ALSO checks `echo "$RESPONSE" | jq -e '.success == false'`. Since `api_query` returns 1 on failure, `RESPONSE` will be empty on error (due to `set -e`), and the calling script's error check is redundant -- or worse, if `set -e` is active, the script exits before the caller's error check runs. The double-checking is inconsistent: some scripts use `api_query` through helpers (which call it), others check the response again.

### M9. `docs-index-delta.sh` calls `api_query` directly instead of through helper
**File:** `docs-index-delta.sh:50`
**Issue:** Calls `api_query "POST" "/api/agents/${AGENT_ID}/docs"` directly instead of using `docs_index()` from the helper. The helper's `docs_index()` function does the same thing. This creates maintenance divergence -- if the API endpoint changes, both `docs-index.sh` (which uses the helper) and `docs-index-delta.sh` (which bypasses it) need updating.

---

## LOW SEVERITY FINDINGS

### L1. `docs-stats.sh` has no `--help` support
**File:** `docs-stats.sh`
**Issue:** No argument parsing at all. Running `docs-stats.sh --help` just ignores the flag and proceeds normally. Minor since it takes no arguments, but inconsistent with all other scripts.

### L2. SKILL.md files reference different installer scripts
- `docs-search/SKILL.md:214` says helper is in `plugin/src/scripts/` but actual location is `plugin/plugins/ai-maestro/scripts/`
- `graph-query/SKILL.md:145` says helper is in `plugin/src/scripts/` -- same wrong path
- `memory-search/SKILL.md:137` says helper is in `plugin/src/scripts/` -- same wrong path

### L3. `graph-find-path.sh` hardcodes 5-hop limit in help text
**File:** `graph-find-path.sh:53`
**Issue:** Says "The path is longer than 5 hops (limit)" but this limit is server-side and could change. The script doesn't pass any max-depth parameter.

### L4. `memory-search.sh` shows help and exits with code 1 (not 0)
**File:** `memory-search.sh:31-33`
**Issue:** When `--help` is provided, exits with 1 instead of 0. Help output is not an error. `docs-search.sh:40` correctly exits with 0.

### L5. `graph-find-related.sh` defines functions inside the script
**File:** `graph-find-related.sh:40-63`
**Issue:** Defines `display_list()` and `display_assocs()` helper functions inline. These could be in `graph-helper.sh` for reuse, but this is minor since no other script needs them currently.

### L6. `docs-search.sh:86` jq expression is very long single line
**File:** `docs-search.sh:86`
**Issue:** The jq formatting expression is 175+ characters on a single line, making it hard to maintain. Not a bug but a readability concern.

### L7. `graph-describe.sh` checks for `$1 = "--help"` inconsistently
**File:** `graph-describe.sh:14`
**Issue:** Only checks `[ -z "$1" ]` but not `--help`. See M4 above.

### L8. `docs-helper.sh` `docs_find_by_type` uses action "find" not "find-by-type"
**File:** `docs-helper.sh:85`
**Issue:** `docs_query "$agent_id" "find" "&type=${doc_type}"` -- uses action `find` while the function is named `docs_find_by_type`. This may or may not match the API endpoint. If the API expects `action=find-by-type` this would fail silently. Without checking the API, this is flagged as a potential issue.

---

## INCONSISTENCIES BETWEEN SKILLS AND SCRIPTS

### I1. `docs-search/SKILL.md` lists `docs-list.sh` as supporting `--limit` but the limit is not wired through
The skill doc shows `docs-list.sh` supports `--limit N` (line 23 of script), but as noted in H1, the limit is parsed but never sent to the API.

### I2. `graph-query/SKILL.md` says "There is no separate graph-index.sh script" (line 96)
This is correct -- there is only `graph-index-delta.sh`. The skill correctly documents this. However, the docs-search skill mentions both `docs-index.sh` and `docs-index-delta.sh`, which is correct for docs. No issue here, just noting the asymmetry.

### I3. `memory-search/SKILL.md` documents `--mode symbol` but script treats it as just another string
**File:** `memory-search.sh:38` defaults to `hybrid`, passes MODE as a query parameter.
**Issue:** The skill describes rich behavior for `symbol` mode (lines 95-112) suggesting it "understands code identifiers and matches them across different contexts." In reality, the script just passes `mode=symbol` as a query param -- all intelligence is server-side. This is not a bug but the skill over-promises what the script does.

### I4. All three SKILL.md files reference `plugin/src/scripts/` as source location
**Issue:** The actual source location is `plugin/plugins/ai-maestro/scripts/`. The `plugin/src/` path does not exist.

---

## SUMMARY TABLE

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 3 | Broken fallback path in all helpers, graph-index-delta uses raw curl with empty API_BASE, URL encoding vulnerability |
| HIGH | 5 | docs-list --limit is dead code, inconsistent JSON field names, wrong exit codes, wrong installer references |
| MEDIUM | 9 | Unquoted $@, missing --help in 6 graph scripts, silent flag ignoring, double error checking, bypassed helper |
| LOW | 8 | Minor inconsistencies, readability, documentation path errors |
| Skill/Script inconsistencies | 4 | Wrong source paths in all skills, dead --limit documented, symbol mode over-described |

**Total findings: 29**
