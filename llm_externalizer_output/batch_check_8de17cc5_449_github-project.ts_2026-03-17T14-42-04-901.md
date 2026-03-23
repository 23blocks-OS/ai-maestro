# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:42:04.901Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/lib/github-project.ts`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:1:14: * AI Maestro kanban acts as a browser/GUI for GitHub Projects v2.
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:145:70: id: string // PVTI_... node ID (used as task ID in AI Maestro)
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:192:7: // Convert "In Progress" → "in_progress", "To Do" → "to_do", etc.
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:204:47: // Any other single-select field → store in customFields
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:210:3: // ── Parse labels with AMOA prefix taxonomy ──
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:220:7: // assign:<agent-name> → assigneeAgentId (AMOA convention)
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:251:3: // ── Parse acceptance criteria from issue body (AMOA convention) ──
/Users/emanuelesabetta/ai-maestro/lib/github-project.ts:291:5: id: item.id, // GitHub Project item node_id as task ID
```