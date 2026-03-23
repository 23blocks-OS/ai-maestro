# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:15.713Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-amp-2026-03-08.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-amp-2026-03-08.md
- Line 106: All files under: `plugin/plugins/ai-maestro/scripts/`
- Line 148:   - `scripts/amp-helper.sh` -- new function + simplified `require_init()`
```