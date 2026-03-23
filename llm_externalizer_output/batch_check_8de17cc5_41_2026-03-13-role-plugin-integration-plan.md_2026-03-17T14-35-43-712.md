# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:43.712Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-role-plugin-integration-plan.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-role-plugin-integration-plan.md
- Line 255: | ai-maestro-chief-of-staff | #1-#5 | .agent.toml, stale docs, PAP violations, governance hardcoding, kanban+Haephestos |
- Line 256: | ai-maestro-assistant-manager-agent | #1-#5 | .agent.toml, stale docs, 50+ embedded curl, missing team-governance dep, kanban+Haephestos |
- Line 257: | ai-maestro-orchestrator-agent | #2-#6 | .agent.toml, stale docs, PAP violations, governance hardcoding, GitHub-only kanban |
- Line 258: | ai-maestro-architect-agent | #2-#6 | .agent.toml, stale docs, governance+hardcoded names, kanban+duplicate docs, memory system |
- Line 259: | ai-maestro-integrator-agent | #2-#6 | .agent.toml, stale docs, PAP violations, governance, kanban+task system |
- Line 260: | ai-maestro-programmer-agent | #2-#6 | .agent.toml, stale docs, PAP violation, kanban mismatch, no task read-back |
```