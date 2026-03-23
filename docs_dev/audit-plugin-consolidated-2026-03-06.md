# Consolidated Plugin Audit Report — 2026-03-06

**Source reports:** 7 audit reports covering AMP scripts, agent scripts, docs/graph/memory scripts, hooks, skills, manifest/README, and cross-references.

---

## CRITICAL (must fix — broken functionality, security issues)

### CRIT-1: `messaging-helper.sh` does not exist — multi-host agent resolution is dead
- **Source:** agent-scripts
- **Files:** `agent-helper.sh:50-54`, `agent-helper.sh:799-832`
- **Issue:** `agent-helper.sh` tries to source `messaging-helper.sh` (which does not exist anywhere in the codebase). `search_agent_all_hosts()` is called in `resolve_agent()` Phase 3 but is never defined. The `type` guard makes the code silently dead. Multi-host agent resolution is completely non-functional.
- **Fix:** Either create `messaging-helper.sh` with `search_agent_all_hosts()` or remove the dead reference and document that multi-host resolution is not implemented.

### CRIT-2: Hook sends invalid status values — Notification/PermissionRequest broadcasts silently fail in full mode
- **Source:** hooks
- **Files:** `ai-maestro-hook.cjs:318,338`, `app/api/sessions/activity/update/route.ts:29`
- **Issue:** Hook sends `'waiting_for_input'` and `'permission_request'` statuses but the Next.js route only accepts `['active','idle','busy','offline','error','waiting','stopped']`. Every Notification and PermissionRequest hook invocation silently fails to broadcast status updates in full (non-headless) mode.
- **Fix:** Add `'waiting_for_input'` and `'permission_request'` to `VALID_STATUSES` in the activity update route, or map them to `'waiting'`.

### CRIT-3: `PermissionRequest` handler is dead code — not registered in hooks.json
- **Source:** hooks
- **Files:** `ai-maestro-hook.cjs:260-329`, `hooks.json`
- **Issue:** 70 lines of PermissionRequest logic exist in the hook script, but `hooks.json` does not register a `PermissionRequest` hook event. Claude Code never invokes this code path.
- **Fix:** Either register `PermissionRequest` in `hooks.json` or remove the dead code.

### CRIT-4: Helper fallback path is broken in ALL docs/graph/memory helpers
- **Source:** docs-graph-memory
- **Files:** `docs-helper.sh:9`, `graph-helper.sh:9`, `memory-helper.sh:9`
- **Issue:** The fallback source path `${SCRIPT_DIR}/../scripts/shell-helpers/common.sh` does not resolve to a valid file. If the installed copy at `~/.local/share/aimaestro/shell-helpers/common.sh` is missing, ALL docs/graph/memory scripts will fail.
- **Fix:** Fix the fallback path to resolve correctly, or add a more informative error message.

### CRIT-5: `graph-index-delta.sh` uses raw curl with potentially empty `API_BASE`
- **Source:** docs-graph-memory
- **Files:** `graph-index-delta.sh:30-33`
- **Issue:** Uses raw `curl` with `${API_BASE}` variable instead of `api_query()`. `API_BASE` defaults to empty string unless `AIMAESTRO_API_BASE` is set, so this will curl an empty base URL and fail silently.
- **Fix:** Use `api_query()` from the helper like other scripts do.

### CRIT-6: URL encoding vulnerability in `docs-helper.sh`
- **Source:** docs-graph-memory
- **Files:** `docs-helper.sh:47`
- **Issue:** Uses `python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))"` — single quotes in query break the Python string and could cause code injection. Fallback sends raw unencoded query.
- **Fix:** Use `jq -sRr @uri` like `memory-search.sh:66` does (portable and safe).

---

## HIGH (should fix — significant bugs, wrong behavior)

### HIGH-1: `amp-reply.sh` empty thread_id breaks message threading
- **Source:** amp-scripts
- **Files:** `amp-reply.sh:114,140`
- **Issue:** When replying to a message without a `thread_id`, empty string is passed as `--thread-id ""` to amp-send.sh. The empty string IS provided (not absent), so the default-to-own-ID logic is bypassed. Reply thread_id becomes empty string.
- **Fix:** Check for empty thread_id and omit the `--thread-id` flag when empty.

### HIGH-2: `base64 -d` usage fails on older macOS (3 files)
- **Source:** amp-scripts, cross-refs
- **Files:** `amp-fetch.sh:258`, `amp-read.sh:162`, installed `amp-inbox.sh` (outdated copy)
- **Issue:** Uses GNU-specific `base64 -d` instead of portable `jq -Rr '@base64d'`. Source `amp-inbox.sh` has the fix but the installed copy is outdated.
- **Fix:** Use `jq -Rr '@base64d'` consistently across all scripts. Re-run `install-messaging.sh` to update installed copies.

### HIGH-3: Standalone scripts (`list-agents.sh`, `export-agent.sh`, `import-agent.sh`) use python3 (undeclared dependency) and duplicate CLI functionality
- **Source:** agent-scripts
- **Files:** `list-agents.sh`, `export-agent.sh`, `import-agent.sh`
- **Issue:** These scripts depend on `python3` (not listed as a dependency) for JSON parsing and duplicate functionality already in `aimaestro-agent.sh`. They also use a completely different export/import API endpoint (ZIP-based) versus the CLI's `.agent.json` approach. Two incompatible export mechanisms exist.
- **Fix:** Either consolidate into the CLI or deprecate/remove the standalone scripts.

### HIGH-4: JSON injection in `import-agent.sh`
- **Source:** agent-scripts
- **Files:** `import-agent.sh:165-169`
- **Issue:** `NEW_ALIAS` from user input is interpolated unsafely into JSON via string concatenation. A crafted alias can inject arbitrary JSON fields.
- **Fix:** Use `jq` for JSON construction instead of string concatenation.

### HIGH-5: Duplicate `check_dependencies()` function — tmux check is bypassed
- **Source:** agent-scripts
- **Files:** `agent-helper.sh:33-42`, `agent-core.sh:50-59`
- **Issue:** `agent-helper.sh` defines `check_dependencies()` checking only `curl`/`jq` and calls it immediately during sourcing. `agent-core.sh` redefines it to also check `tmux`, but this version is only called later. The function name collision is confusing.
- **Fix:** Rename one function or combine into a single definition.

### HIGH-6: Duplicate Transfer Protocol sections in team-governance skill with contradictory auth patterns
- **Source:** skills
- **Files:** team-governance SKILL.md lines 345-404 and 486-552
- **Issue:** Two sections document the same transfer operations with different auth patterns: one uses `Authorization: Bearer` + `X-Agent-Id`, the other uses only `X-Agent-Id` with `requestedBy` in body. Contradictory and confusing.
- **Fix:** Keep one canonical pattern, remove the duplicate.

### HIGH-7: `docs-list.sh` `--limit` parameter is dead code
- **Source:** docs-graph-memory
- **Files:** `docs-list.sh:11-30`
- **Issue:** `LIMIT` variable is parsed but never passed to the API call.
- **Fix:** Wire the limit parameter through to `docs_list()` or remove the flag.

### HIGH-8: `docs-list.sh` uses inconsistent JSON field names
- **Source:** docs-graph-memory
- **Files:** `docs-list.sh:56`
- **Issue:** Uses camelCase (`.docId`) without fallback, while `docs-search.sh` and `docs-find-by-type.sh` use snake_case with camelCase fallback. Will show "null" if API returns snake_case.
- **Fix:** Add the `// .doc_id` fallback pattern like other scripts use.

### HIGH-9: README.md is only 9 lines with wrong skill count
- **Source:** manifest-readme
- **Files:** `plugin/plugins/ai-maestro/README.md`
- **Issue:** Claims 6 skills (actual: 7), does not describe any skills/scripts/hooks, insufficient for a plugin with 7 skills, 44 scripts, 4 hook events.
- **Fix:** Regenerate README with accurate counts and add at minimum a table of skills and their purposes.

---

## MEDIUM (should fix — correctness, consistency)

### MED-1: `sign_message()` temp file leak on interruption
- **Source:** amp-scripts
- **File:** `amp-helper.sh:737-758`
- **Issue:** No trap for cleanup on SIGTERM/SIGINT. `verify_signature()` correctly uses `trap ... RETURN` but `sign_message()` does not.
- **Fix:** Add `trap '_sign_cleanup' RETURN` like `verify_signature()` does.

### MED-2: Replay DB race condition — no file locking
- **Source:** amp-scripts
- **File:** `amp-helper.sh:1006-1064`
- **Issue:** Flat text file with read-modify-write cycle, no `flock`. Concurrent delivery can corrupt entries.
- **Fix:** Add `flock` to replay DB operations.

### MED-3: Local filesystem delivery doesn't verify sender identity
- **Source:** amp-scripts
- **File:** `amp-send.sh:571-605`
- **Issue:** Any local agent can write to any other agent's inbox. Messages are signed but signature is not verified on local delivery.
- **Fix:** Add signature verification on local message read.

### MED-4: `curl` stderr mixed with response body in multiple AMP scripts
- **Source:** amp-scripts
- **Files:** `amp-send.sh:366-370`, `amp-init.sh:192-195`, `amp-register.sh:240-247`
- **Issue:** `curl -s -w "\n%{http_code}" ... 2>&1` mixes stderr with stdout. Connection errors can cause wrong HTTP code parsing.
- **Fix:** Redirect stderr to `/dev/null` or a separate FD, not stdout.

### MED-5: Triplicated auto-registration code
- **Source:** amp-scripts
- **Files:** `amp-init.sh:180-236`, `amp-send.sh:478-546`, `amp-helper.sh:1863-1922`
- **Issue:** Three near-identical registration blocks. Bug fix requires updating 3 places.
- **Fix:** Extract to a single shared function in amp-helper.sh.

### MED-6: API endpoint format differs between AMP and external providers
- **Source:** amp-scripts
- **Files:** `amp-fetch.sh:123-126`, `amp-send.sh:665`
- **Issue:** AI Maestro registrations store `/api/v1` in apiUrl; external providers don't. Fragile dual convention.
- **Fix:** Normalize the stored apiUrl format.

### MED-7: `index.json` race condition on concurrent hook writes
- **Source:** hooks
- **File:** `ai-maestro-hook.cjs:108-115`
- **Issue:** Read-modify-write cycle without locking. Two simultaneous hooks can lose entries.
- **Fix:** Use atomic file write (write to temp then rename) or file locking.

### MED-8: `SessionStart` setTimeout may never fire (process killed by hook timeout)
- **Source:** hooks
- **File:** `ai-maestro-hook.cjs:414-420`
- **Issue:** 3-second setTimeout after readStdin (up to 5s) can exceed the 5-second hook timeout.
- **Fix:** Reduce readStdin timeout to 2s or run message check synchronously.

### MED-9: `readStdin` timeout never cleared on success
- **Source:** hooks
- **File:** `ai-maestro-hook.cjs:42`
- **Issue:** 5-second setTimeout not cleared when 'end' event resolves the promise.
- **Fix:** Clear the timeout on successful resolution.

### MED-10: `plugin load` word-splits paths on whitespace
- **Source:** agent-scripts
- **File:** `agent-plugin.sh:552`
- **Issue:** `for p in $plugin_path` — unquoted variable expansion. Paths with spaces break.
- **Fix:** Use an array instead of string concatenation.

### MED-11: `cmd_plugin_load` builds shell commands with unescaped paths
- **Source:** agent-scripts
- **File:** `agent-plugin.sh:561-566`
- **Issue:** `plugin_dir_flags` built via string concatenation with embedded quotes. Special characters in paths break.
- **Fix:** Use an array.

### MED-12: `cmd_delete` --keep-folder/--keep-data flags silently ignored
- **Source:** agent-scripts
- **File:** `agent-commands.sh:532-605`
- **Issue:** Flags are parsed but never included in the DELETE API call.
- **Fix:** Either implement the flags in the API or remove them with a deprecation warning.

### MED-13: `export-agent.sh`/`import-agent.sh` API endpoints not documented in SKILL.md
- **Source:** agent-scripts
- **Files:** `export-agent.sh:79`, `import-agent.sh:186`
- **Issue:** ZIP-based export/import endpoints (`GET /api/agents/:id/export`, `POST /api/agents/import`) not documented.
- **Fix:** Document or deprecate these endpoints.

### MED-14: Missing `--help` in 6 graph scripts
- **Source:** docs-graph-memory
- **Files:** `graph-describe.sh`, `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`
- **Issue:** Running `script.sh --help` treats "--help" as a component name argument.
- **Fix:** Add `--help`/`-h` check before positional argument processing.

### MED-15: Source vs installed script divergence
- **Source:** cross-refs
- **Files:** `aimaestro-agent.sh` (108 vs 3877 lines), `amp-send.sh`, `amp-inbox.sh`
- **Issue:** Plugin source uses modular architecture; installed copies are bundled monoliths. `amp-inbox.sh` installed copy is outdated (missing base64 portability fix).
- **Fix:** Re-run `install-messaging.sh`. Establish a build/sync process for aimaestro-agent.sh.

### MED-16: Two different API base URL resolution mechanisms
- **Source:** cross-refs
- **Files:** `amp-helper.sh` (AMP_MAESTRO_URL), `common.sh` (get_api_base/AIMAESTRO_API_BASE)
- **Issue:** AMP scripts default to localhost:23000; agent scripts discover dynamically from hosts.json. Custom URL in hosts.json won't be used by AMP scripts.
- **Fix:** Unify or document the difference.

### MED-17: Misleading "Message any agent (AMP)" in team-governance permission matrix
- **Source:** skills
- **File:** team-governance SKILL.md line 213
- **Issue:** First permission matrix shows messaging allowed for ALL roles including Normal Agent, but later Message Filtering Rules clearly restrict normal closed-team agents.
- **Fix:** Correct the permission matrix to reflect actual restrictions.

### MED-18: Wrong source path `plugin/src/scripts/` in 4 skills
- **Source:** skills (systemic, also docs-graph-memory)
- **Files:** docs-search, graph-query, memory-search, ai-maestro-agents-management SKILL.md files
- **Issue:** All reference `plugin/src/scripts/` which doesn't exist. Actual path: `plugin/plugins/ai-maestro/scripts/`.
- **Fix:** Update all 4 skills.

### MED-19: `InstructionsLoaded` overwrites instructionFiles instead of appending
- **Source:** hooks
- **File:** `ai-maestro-hook.cjs:445`
- **Issue:** Code replaces `prevState.instructionFiles` instead of appending. If InstructionsLoaded fires multiple times, only the last batch is preserved.
- **Fix:** Use `[...prevState.instructionFiles, ...input.files]`.

### MED-20: Governance request examples missing/inconsistent auth
- **Source:** skills
- **Files:** team-governance SKILL.md lines 654-669
- **Issue:** Cross-host governance examples omit `password` field (required per line 299). Approve uses inconsistent auth patterns.
- **Fix:** Ensure all examples include correct auth fields.

---

## LOW (nice to fix — style, minor improvements)

### amp-helper.sh / AMP scripts
- `amp-reply.sh` missing `set -e` before sourcing amp-helper.sh (1.1)
- `delete_message()` in amp-helper.sh never called — dead code (5.2)
- Legacy `.metadata.status` backward compat scattered across scripts (5.3)
- Empty "Initialization Check" section header (5.4)
- `is_organization_set()` and `require_organization()` never called (9.2, 9.3)
- SKILL.md address format doesn't mention "default" fallback (8.1)
- SKILL.md shows `~/.agent-messaging/agents/<agent-name>/` but actual uses UUIDs (8.3)
- API key storage in plaintext (acceptable for Phase 1) (10.3)
- `amp-fetch.sh` accepts failed-signature messages with "untrusted" wrapper (10.5)
- `amp-delete.sh` interactive prompt bypasses `set -e` when stdin not a terminal (10.2)
- amp-send.sh signing uses argument variables not envelope values — fragile coupling (12.2)
- amp-fetch.sh dual message ID validation is confusing (12.3)
- amp-download.sh `$?` check is dead code with `set -e` (12.4)
- All 12 scripts source amp-helper.sh without existence check (7.1)
- SKILL.md shows commands without `.sh` suffix; IDENTITY.md shows with `.sh` (6.2)

### agent scripts
- `cmd_list` pipe subshell loses `agent_count` variable (M-2)
- `cmd_list` table formatting has extra empty column (M-3)
- `cmd_show` uses raw curl instead of `_api_request()` helper (M-4)
- No --help in `cmd_plugin_enable`/`cmd_plugin_disable` (M-5)
- `safe_json_edit` nested `cleanup_tmp()` pollutes global namespace (M-8)
- `list-agents.sh` hardcodes ANSI colors without terminal check (M-11)
- SKILL.md help output doesn't list `restart` command (I-4)
- SKILL.md table output format doesn't match actual output (I-3/M-13)
- `--yes` vs `--confirm` inconsistency between rename and delete (I-5)
- `cmd_export` --include-data/--include-folder flags parsed but unused (D-2)
- `plugin clean` orphaned entries check is a stub (D-4)
- Mixed `[ ]` and `[[ ]]` in standalone scripts (B-1)
- Standalone scripts missing `set -u`/`pipefail` (B-2, B-3)
- Glob pattern in empty directory (B-4)
- `AIMAESTRO_API_BASE` exported but never set (D-1)
- API base URL detection differs between standalone and modular scripts (M-1)
- Model validation regex overly permissive (S-2)
- Directory whitelist check prefix match edge case (S-3)
- `escape_regex` incomplete metacharacter list (S-4)

### docs/graph/memory scripts
- `docs-helper.sh` `docs_query()` uses `$@` unquoted (M1)
- `graph-helper.sh` `graph_query()` same issue (M2)
- `graph-index-delta.sh` missing --help (M3)
- `memory-search.sh` and `docs-list.sh` silently ignore unknown flags (M6)
- `docs-search.sh` SKILL.md shows incorrect flag syntax (M7)
- `api_query` double error checking in callers (M8)
- `docs-index-delta.sh` bypasses helper for direct api_query call (M9)
- `docs-stats.sh` no --help support (L1)
- SKILL.md installer path references differ across skills (L2)
- `graph-find-path.sh` hardcodes 5-hop limit in help text (L3)
- `memory-search.sh` help exits with code 1 (L4)
- `graph-find-related.sh` inline functions could be in helper (L5)
- `docs-search.sh` jq expression is very long single line (L6)
- `graph-describe.sh` exits with 0 on "not found" (H3 — arguable design choice)
- Error messages reference installer scripts with inconsistent paths (H4)
- `docs-helper.sh` `docs_find_by_type` uses action "find" not "find-by-type" (L8)

### hooks
- `hook-debug.log` grows unbounded (m1)
- MD5 hash for cwd — weak but acceptable (m2)
- `process.exit(0)` in catch handler swallows errors (m3)
- No `SessionEnd` hook — stale state after session ends (m5)
- No `SubagentCompleted`/`PreToolUse`/`PostToolUse` hooks (m6)
- Agent matching by workingDirectory is bidirectional/overly broad (M5)
- Duplicated agent-lookup logic in 3 functions (M6)

### skills
- Missing `user-invocable: true` on 6 of 7 skills (CS3)
- Script naming: `.sh` vs no extension inconsistency across skills (CS1)
- Version format `"1.0"` vs `"1.0.0"` inconsistency (F7.1)
- `amp-security.sh` undocumented in agent-messaging skill (F1.3)
- Stale CLAUDE.md persistence suggestion in agent-messaging (F1.4)
- `ai-maestro-agents-management` version `2.0.0` vs others at `1.0.0` (F2.5)
- Installer reference paths inconsistent (F3.2, F4.2)

### manifest/readme
- `plugin.json` missing `description` field (validator warning)
- No LICENSE file in plugin directory (validator check)
- No .gitignore in plugin directory (validator check)
- 16 scripts not referenced by any skill or hooks.json
- Broken nested submodule reference for `plugins/amp-messaging`
- Build date stale (2026-02-20 vs latest changes 2026-03-05)

### cross-refs
- `/api/teams/names` missing from headless-router.ts (parity issue) (F3)
- `get_api_base()` defined outside plugin submodule — plugin not self-contained (F8)
- Several env vars undocumented (F9)

---

## DEDUPLICATION

| Merged Finding | Reports That Found It |
|---|---|
| `base64 -d` portability issue | amp-scripts (11.1, 11.2), cross-refs (F5 — installed amp-inbox.sh outdated) |
| Wrong source path `plugin/src/scripts/` | skills (CS2), docs-graph-memory (L2, I4) |
| Standalone scripts (`list-agents.sh`, `export-agent.sh`, `import-agent.sh`) issues | agent-scripts (C-4, C-5, M-1, M-9, M-10, M-11), skills (F2.3, F2.4), manifest-readme (unreferenced scripts) |
| Helper fallback path broken | docs-graph-memory (C1) — affects ALL 3 helper scripts |
| Missing `--help` in graph scripts | docs-graph-memory (M3, M4, M5) — affects 6+ scripts |
| Script `.sh` extension inconsistency | amp-scripts (6.2), skills (CS1, F1.2) |
| `user-invocable: true` missing | skills (CS3) — affects 6 skills |
| Installer path references inconsistent | docs-graph-memory (H4, L2), skills (F3.2, F4.2) |
| Two different API base URL mechanisms | cross-refs (F7), agent-scripts (M-1) |
| Transfer protocol auth contradictions | skills (F7.4, F7.5, F7.6) — single issue, multiple symptoms |

---

## STATISTICS

### By Severity

| Severity | Count |
|---|---|
| CRITICAL | 6 |
| HIGH | 9 |
| MEDIUM | 20 |
| LOW | 60+ |
| **Total** | **~95** |

### By Domain

| Domain | CRIT | HIGH | MED | LOW |
|---|---|---|---|---|
| AMP Scripts | 0 | 2 | 5 | 15 |
| Agent Scripts | 1 | 3 | 4 | 18 |
| Docs/Graph/Memory | 3 | 3 | 4 | 12 |
| Hooks | 2 | 0 | 4 | 7 |
| Skills | 0 | 1 | 3 | 8 |
| Manifest/README | 0 | 1 | 0 | 6 |
| Cross-refs | 0 | 0 | 2 | 3 |

### Top 10 Priority Fixes

1. **CRIT-2**: Fix invalid hook status values (silent broadcast failures in full mode)
2. **CRIT-1**: Fix/remove `messaging-helper.sh` dependency and dead `search_agent_all_hosts()`
3. **CRIT-5**: Fix `graph-index-delta.sh` empty API_BASE
4. **CRIT-6**: Fix URL encoding vulnerability in `docs-helper.sh`
5. **HIGH-1**: Fix `amp-reply.sh` empty thread_id propagation
6. **HIGH-2**: Fix `base64 -d` portability across all scripts + reinstall
7. **HIGH-4**: Fix JSON injection in `import-agent.sh`
8. **HIGH-6**: Deduplicate Transfer Protocol in team-governance skill
9. **MED-15**: Sync installed scripts with source (re-run installer)
10. **CRIT-3/CRIT-4**: Clean up dead PermissionRequest code and fix helper fallback paths
