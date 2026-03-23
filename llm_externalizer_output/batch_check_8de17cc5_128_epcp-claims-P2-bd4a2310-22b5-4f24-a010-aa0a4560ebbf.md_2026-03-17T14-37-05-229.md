# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:05.229Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P2-bd4a2310-22b5-4f24-a010-aa0a4560ebbf.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P2-bd4a2310-22b5-4f24-a010-aa0a4560ebbf.md
Line 22: - **What's missing:** The NEW headless router COS endpoint (`services/headless-router.ts:1588`) uses a GLOBAL rate limit key `'governance-cos-auth'` instead of the per-team `` `governance-cos-auth:${teamId}` ``.
```