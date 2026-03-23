# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:32.421Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/step7-cli-governance-report.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/step7-cli-governance-report.md
100: - `plugin/plugins/ai-maestro/scripts/agent-helper.sh` — Added ~80 lines (two new functions)
101: - `plugin/plugins/ai-maestro/scripts/agent-skill.sh` — Modified 4 functions
102: - `plugin/plugins/ai-maestro/scripts/agent-plugin.sh` — Modified 2 functions
```