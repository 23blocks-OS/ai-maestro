# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:12.391Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/app/api/agents/role-plugins/install/route.ts`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/app/api/agents/role-plugins/install/route.ts
2: /**
3:  * Role Plugin Install API
4:  *
5:  * POST /api/agents/role-plugins/install   — Install plugin locally into agent dir
6:  * DELETE /api/agents/role-plugins/install  — Uninstall plugin from agent dir
```