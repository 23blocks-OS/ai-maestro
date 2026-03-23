# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:16.169Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-consolidated-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-consolidated-2026-03-06.md
Line 22: - Files: `ai-maestro-hook.cjs:318,338`, `app/api/sessions/activity/update/route.ts:29`
Line 29: - Files: `ai-maestro-hook.cjs:260-329`, `hooks.json`
Line 38: - Files: `graph-index-delta.sh:30-33`
Line 47: - Files: `docs-helper.sh:47`
Line 60: - Files: `amp-reply.sh:114,140`
Line 67: - Files: `amp-fetch.sh:258`, `amp-read.sh:162`, installed `amp-inbox.sh` (outdated copy)
Line 75: - Files: `list-agents.sh`, `export-agent.sh`, `import-agent.sh`
Line 83: - Files: `import-agent.sh:165-169`
Line 90: - Files: `agent-helper.sh:33-42`, `agent-core.sh:50-59`
Line 97: - Files: team-governance SKILL.md lines 345-404 and 486-552
Line 104: - Files: `docs-list.sh:11-30`
Line 111: - Files: `docs-list.sh:56`
Line 118: - Files: `plugin/plugins/ai-maestro/README.md`
Line 129: - File: `amp-helper.sh:737-758`
Line 136: - File: `amp-helper.sh:1006-1064`
Line 143: - File: `amp-send.sh:571-605`
Line 150: - Files: `amp-send.sh:366-370`, `amp-init.sh:192-195`, `amp-register.sh:240-247`
Line 157: - Files: `amp-init.sh:180-236`, `amp-send.sh:478-546`, `amp-helper.sh:1863-1922`
Line 164: - Files: `amp-fetch.sh:123-126`, `amp-send.sh:665`
Line 171: - File: `ai-maestro-hook.cjs:108-115`
Line 178: - File: `ai-maestro-hook.cjs:414-420`
Line 185: - File: `ai-maestro-hook.cjs:42`
Line 192: - File: `agent-plugin.sh:552`
Line 199: - File: `agent-plugin.sh:561-566`
Line 206: - File: `agent-commands.sh:532-605`
Line 213: - Files: `export-agent.sh:79`, `import-agent.sh:186`
Line 220: - Files: `graph-describe.sh`, `graph-find-related.sh`, `graph-find-associations.sh`, `graph-find-serializers.sh`, `graph-find-callees.sh`, `graph-find-callers.sh`
Line 227: - Files: `aimaestro-agent.sh` (108 vs 3877 lines), `amp-send.sh`, `amp-inbox.sh`
Line 234: - Files: `amp-helper.sh` (AMP_MAESTRO_URL), `common.sh` (get_api_base/AIMAESTRO_API_BASE)
Line 241: - File: team-governance SKILL.md line 213
Line 248: - Files: docs-search, graph-query, memory-search, ai-maestro-agents-management SKILL.md files
Line 255: - File: `ai-maestro-hook.cjs:445`
Line 262: - Files: team-governance SKILL.md lines 654-669
Line 270: - `amp-reply.sh` missing `set -e` before sourcing amp-helper.sh (1.1)
Line 271: - `delete_message()` in amp-helper.sh never called — dead code (5.2)
Line 278: - `amp-fetch.sh` accepts failed-signature messages with "untrusted" wrapper (10.5)
Line 279: - `amp-delete.sh` interactive prompt bypasses `set -e` when stdin not a terminal (10.2)
Line 280: - amp-send.sh signing uses argument variables not envelope values — fragile coupling (12.2)
Line 281: - amp-fetch.sh dual message ID validation is confusing (12.3)
Line 282: - amp-download.sh `$?` check is dead code with `set -e` (12.4)
Line 283: - All 12 scripts source amp-helper.sh without existence check (7.1)
Line 288: - `cmd_show` uses raw curl instead of `_api_request()` helper (M-4)
Line 290: - No --help in `cmd_plugin_enable`/`cmd_plugin_disable` (M-5)
Line 291: - `safe_json_edit` nested `cleanup_tmp()` pollutes global namespace (M-8)
Line 292: - `list-agents.sh` hardcodes ANSI colors without terminal check (M-11)
Line 295: - `--yes` vs `--confirm` inconsistency between rename and delete (I-5)
Line 296: - `cmd_export` --include-data/--include-folder flags parsed but unused (D-2)
Line 304: - `docs-helper.sh` `docs_query()` uses `$@` unquoted (M1)
Line 305: - `graph-helper.sh` `graph_query()` same issue (M2)
Line 306: - `graph-index-delta.sh` missing --help (M3)
Line 307: - `memory-search.sh` and `docs-list.sh` silently ignore unknown flags (M6)
Line 308: - `docs-search.sh` SKILL.md shows incorrect flag syntax (M7)
Line 309: - `api_query` double error checking in callers (M8)
Line 310: - `docs-index-delta.sh` bypasses helper for direct api_query call (M9)
Line 311: - `docs-stats.sh` no --help support (L1)
Line 313: - `graph-find-path.sh` hardcodes 5-hop limit in help text (L3)
Line 314: - `memory-search.sh` help exits with code 1 (L4)
Line 315: - `graph-find-related.sh` inline functions could be in helper (L5)
Line 316: - `docs-search.sh` jq expression is very long single line (L6)
Line 317: - `graph-describe.sh` exits with 0 on "not found" (H3 — arguable design choice)
Line 319: - `docs-helper.sh` `docs_find_by_type` uses action "find" not "find-by-type" (L8)
Line 324: - `process.exit(0)` in catch handler swallows errors (m3)
Line 325: - No `SessionEnd` hook — stale state after session ends (m5)
Line 326: - No `SubagentCompleted`/`PreToolUse`/`PostToolUse` hooks (m6)
Line 327: - Agent matching by workingDirectory is bidirectional/overly broad