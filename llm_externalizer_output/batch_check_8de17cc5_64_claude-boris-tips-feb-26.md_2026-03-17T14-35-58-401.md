# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:58.401Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-boris-tips-feb-26.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-boris-tips-feb-26.md
Line 39: Install from the official Anthropic plugin marketplace, or create your own marketplace for your company. Check the `settings.json` into your codebase to auto-add the marketplaces for your team.
```