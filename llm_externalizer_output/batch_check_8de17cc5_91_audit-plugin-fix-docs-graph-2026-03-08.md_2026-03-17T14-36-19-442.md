# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:19.442Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-docs-graph-2026-03-08.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-docs-graph-2026-03-08.md
Line 24: Problem: Fallback path `${SCRIPT_DIR}/../scripts/shell-helpers/common.sh` resolved to `plugin/plugins/ai-maestro/scripts/shell-helpers/common.sh` which does not exist. The `../scripts/` went up one level from `scripts/` and back into `scripts/`, adding a spurious parent traversal.
Line 68: 1. `plugin/plugins/ai-maestro/scripts/docs-helper.sh` - CRIT-4 (fallback path), CRIT-6 (URL encoding), HIGH-7 (limit param in docs_list)
Line 69: 2. `plugin/plugins/ai-maestro/scripts/graph-helper.sh` - CRIT-4 (fallback path)
Line 70: 3. `plugin/plugins/ai-maestro/scripts/memory-helper.sh` - CRIT-4 (fallback path)
Line 71: 4. `plugin/plugins/ai-maestro/scripts/graph-index-delta.sh` - CRIT-5 (raw curl replaced with api_query)
Line 72: 5. `plugin/plugins/ai-maestro/scripts/docs-list.sh` - HIGH-7 (wire LIMIT), HIGH-8 (docId fallback)
Line 76: 1. `plugin/plugins/ai-maestro/scripts/graph-describe.sh`
Line 77: 2. `plugin/plugins/ai-maestro/scripts/graph-find-related.sh`
Line 78: 3. `plugin/plugins/ai-maestro/scripts/graph-find-associations.sh`
Line 79: 4. `plugin/plugins/ai-maestro/scripts/graph-find-serializers.sh`
Line 80: 5. `plugin/plugins/ai-maestro/scripts/graph-find-callees.sh`
Line 81: 6. `plugin/plugins/ai-maestro/scripts/graph-find-callers.sh`
Line 100: 1. `plugin/plugins/ai-maestro/scripts/docs-helper.sh` - CRIT-4, CRIT-6, HIGH-7
Line 101: 2. `plugin/plugins/ai-maestro/scripts/graph-helper.sh` - CRIT-4
Line 102: 3. `plugin/plugins/ai-maestro/scripts/memory-helper.sh` - CRIT-4
Line 103: 4. `plugin/plugins/ai-maestro/scripts/graph-index-delta.sh` - CRIT-5
Line 104: 5. `plugin/plugins/ai-maestro/scripts/docs-list.sh` - HIGH-7, HIGH-8
Line 105: 6. `plugin/plugins/ai-maestro/scripts/graph-describe.sh` - MED-14
Line 106: 7. `plugin/plugins/ai-maestro/scripts/graph-find-related.sh` - MED-14
Line 107: 8. `plugin/plugins/ai-maestro/scripts/graph-find-associations.sh` - MED-14
Line 108: 9. `plugin/plugins/ai-maestro/scripts/graph-find-serializers.sh` - MED-14
Line 109: 10. `plugin/plugins/ai-maestro/scripts/graph-find-callees.sh` - MED-14
Line 110: 11. `plugin/plugins/ai-maestro/scripts/graph-find-callers.sh` - MED-14
```