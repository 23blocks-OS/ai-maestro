# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:16.981Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P2-7a29a4b1-12d8-4e3f-b905-3c81f72e8d10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P2-7a29a4b1-12d8-4e3f-b905-3c81f72e8d10.md
Line 82: const rateCheck = checkRateLimit('governance-cos-auth')
Line 85: const rateLimitKey = `governance-cos-auth:${id}`
Line 92: Change lines 1588, 1596, and 1600 to use `` `governance-cos-auth:${teamId}` `` to match the Next.js route behavior.
```