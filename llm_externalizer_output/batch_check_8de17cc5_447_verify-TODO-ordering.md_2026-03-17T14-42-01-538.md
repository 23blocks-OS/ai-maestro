# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:42:01.539Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/verify-TODO-ordering.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/verify-TODO-ordering.md
L26: | TODO-S3 | Update `ai-maestro-agents-management` Skill to Use `aimaestro-agent.sh role` | P2 |
L30: | TODO-S6 | Document Hook Fetch Exception in `ai-maestro-hook.cjs` | P2 |
L38: | TODO-P2 | Replace Direct `curl` Example in `ai-maestro-agents-management/SKILL.md` | P1 |
L39: | TODO-P3 | Add JSDoc Exception Comment to `ai-maestro-hook.cjs` | P3 |
L143: - `TODO-S3` — Update skill to use `aimaestro-agent.sh role` (depends on S2)
L147: - `TODO-S6` — Document hook fetch exception (no deps, documentation only)
L151: - `TODO-P3` — Add JSDoc exception comment to hook (independent)
L178: - `TODO-S6` (server file) and `TODO-P3` (plugin file) are the same change described twice.
```