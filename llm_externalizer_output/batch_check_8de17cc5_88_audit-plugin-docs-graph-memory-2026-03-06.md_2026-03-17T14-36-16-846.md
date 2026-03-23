# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:16.846Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-docs-graph-memory-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-docs-graph-memory-2026-03-06.md
14: **Scope:** All docs-*, graph-*, and memory-* scripts + their SKILL.md files in `plugin/plugins/ai-maestro/scripts/`
20: **Files:** `docs-helper.sh:9`, `graph-helper.sh:9`, `memory-helper.sh:9`
21: **Issue:** The fallback source path `${SCRIPT_DIR}/../scripts/shell-helpers/common.sh` does not resolve to a valid file when `SCRIPT_DIR` is `plugin/plugins/ai-maestro/scripts/`. That path resolves to `plugin/plugins/ai-maestro/scripts/../scripts/shell-helpers/common.sh` = `plugin/plugins/ai-maestro/scripts/shell-helpers/common.sh`, which does not exist. The actual `common.sh` lives at `scripts/shell-helpers/common.sh` (project root). This means if the installed copy at `~/.local/share/aimaestro/shell-helpers/common.sh` is missing, ALL scripts will fail with "common.sh not found".
30: **File:** `graph-index-delta.sh:30-33`
31: **Issue:** Uses raw `curl` with `${API_BASE}` variable instead of the `api_query()` function from common.sh. The `API_BASE` variable is set to empty string at line 72 of common.sh (`API_BASE="${AIMAESTRO_API_BASE:-}"`), so unless `AIMAESTRO_API_BASE` is set, this will curl an empty base URL. All other scripts correctly use `api_query()` or helper functions that call it, which internally calls `get_api_base()`. This is a bug that will cause `graph-index-delta.sh` to fail silently or hit the wrong endpoint.
35: **File:** `docs-helper.sh:47`
36: **Issue:** The python3-based URL encoding uses single-quote interpolation: `python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))"`. If the query contains single quotes, this breaks the Python string and could cause injection. The fallback (`|| echo "$query"`) sends the raw unencoded query, which will break URLs with spaces/special chars. Compare with `memory-search.sh:66` which uses the safer `jq -sRr @uri` approach.
43: **File:** `docs-list.sh:11-30`
44: **Issue:** The `LIMIT` variable is parsed from `--limit` flag (default 50) but never passed to `docs_list()`. The function call on line 35 is just `docs_list "$AGENT_ID"` with no limit parameter. The `docs_list()` helper function in `docs-helper.sh:63-71` also has no limit parameter support -- it only supports an optional `doc_type`. The `--limit` flag is dead/misleading.
46: **File:** `docs-list.sh:56` vs `docs-search.sh:86`
47: **Issue:** `docs-list.sh` uses `.docId`, `.docType`, `.filePath` (camelCase). `docs-search.sh` uses `.doc_id // .docId`, `.doc_type // .docType`, `.file_path // .filePath` (snake_case with camelCase fallback). The list script will silently show "null" if the API returns snake_case fields. `docs-find-by-type.sh:53` also uses the fallback pattern like search does. This inconsistency suggests `docs-list.sh` was not updated when the API response format changed.
49: **File:** `graph-describe.sh:48`
50: **Issue:** When a component is not found (`found == false`), the script exits with code 0 (success). This is inconsistent -- a "not found" result should arguably be a non-zero exit, especially for scripted usage. Same pattern in `graph-find-path.sh:47` and `graph-find-related.sh:86`. While arguably a design choice, it makes error handling in pipelines unreliable.
52: **Files:**
53: - `docs-helper.sh:12` says `Run install-doc-tools.sh to fix` -- but the actual installer is `install-doc-tools.sh` at the project root, not in the scripts dir. At least it does exist.
54: - `graph-helper.sh:12` says `Run install-graph-tools.sh to fix` -- installer exists at project root.
55: - `memory-helper.sh:12` says `Run install-memory-tools.sh to fix` -- installer exists at project root.
56: - The SKILL.md files also reference `./install-doc-tools.sh`, `~/ai-maestro/install-graph-tools.sh`, `./install-memory-tools.sh` with inconsistent path styles.
58: **File:** `graph-find-path.sh:55-61`
59: **Issue:** The line `PATHS=$(echo "$RESULT" | jq '.paths')` stores into `PATHS`, but then line 56 does `PATH_COUNT=$(echo "$PATHS" | jq 'length')`. While `PATHS` is safe, the variable name is dangerously close to the `PATH` environment variable. Not a bug, but a maintenance risk.
65: **File:** `docs-helper.sh:21`
66: **Issue:** `local params="$@"` collapses all remaining args into a single string. If any param contains spaces, word splitting occurs. Should use `local params="$*"` for this use case (concatenation into single string), though ideally would use an array.
68: **File:** `graph-helper.sh:21`
69: **Issue:** Same as M1. `local params="$@"` in graph_query().
71: **File:** `graph-index-delta.sh`
72: **Issue:** Unlike most other scripts (docs-index-delta.sh, docs-search.sh, etc.), `graph-index-delta.sh` does not support `--help` or `-h`. It silently accepts a positional argument but has no help text. Arguments after the first positional are ignored.
74: **File:** `graph-describe.sh:14`
75: **Issue:** Exits with code 1 when no arg given and shows usage, but does not check for `--help` or `-h` explicitly. Running `graph-describe.sh --help` would try to describe a component named "--help". Same issue in: `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`.
77: **File:** `graph-find-by-type.sh:14` has the proper help check.
78: **Issue:** Inconsistency across graph scripts. Only `graph-find-by-type.sh` and `graph-find-path.sh` handle `--help` properly. Six other graph scripts (`graph-describe.sh`, `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`) only check `[ -z "$1" ]` without a `--help`/`-h` check, meaning `--help` gets treated as a component name.
80: **File:** `memory-search.sh:56-58`
81: **Issue:** The `*) shift ;;` catch-all in the while loop silently discards any unrecognized argument. A typo like `--mod semantic` would silently ignore `--mod` and treat `semantic` as QUERY on the next iteration, but since QUERY was already set from `$1`, `semantic` would also be silently ignored. Same pattern in `docs-list.sh:27`.
83: **File:** SKILL.md (docs-search) line 87
84: **Issue:** The skill doc shows `docs-search.sh "Z" --keyword` but the actual script expects `--keyword` BEFORE the query (it's a flag, not a positional modifier). Running `docs-search.sh "Z" --keyword` would set QUERY="Z" first, then set KEYWORD_MODE=true, which actually works due to the while loop, but it's misleading documentation.
86: **File:** `common.sh:373-382`
87: **Issue:** The `