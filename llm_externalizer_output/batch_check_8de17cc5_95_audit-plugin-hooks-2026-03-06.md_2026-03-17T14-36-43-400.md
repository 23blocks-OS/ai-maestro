# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:43.400Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-hooks-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-hooks-2026-03-06.md
- Line 2: # Audit: AI Maestro Plugin Hook System — 2026-03-06
- Line 4: - `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` (464 lines)
- Line 5: - `plugin/plugins/ai-maestro/hooks/hooks.json` (50 lines)
- Line 6: - `plugin/plugins/ai-maestro/.claude-plugin/plugin.json` (9 lines)
```