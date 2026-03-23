# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:08.803Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P8-R57d244f7-a4e5e1b4-1f08-4c99-9291-ef7fe92886d0.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P8-R57d244f7-a4e5e1b4-1f08-4c99-9291-ef7fe92886d0.md
47: | 16 | "CLI governance: check_config_governance() in agent-helper.sh" | `plugin/plugins/ai-maestro/scripts/agent-helper.sh:141` -- function exists | VERIFIED |
```