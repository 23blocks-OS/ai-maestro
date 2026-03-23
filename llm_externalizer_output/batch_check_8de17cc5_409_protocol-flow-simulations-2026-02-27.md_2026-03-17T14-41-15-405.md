# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:15.405Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/protocol-flow-simulations-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/protocol-flow-simulations-2026-02-27.md
L299: orchestrator -> ai-maestro-orchestrator-agent
L300: architect -> ai-maestro-architect-agent
L301: implementer -> ai-maestro-implementer-agent
L302: tester -> ai-maestro-tester-agent
L309: orchestrator | `ai-maestro-orchestrator-agent`
L310: architect | `ai-maestro-architect-agent`
L311: implementer | `ai-maestro-implementer-agent`
L312: tester | `ai-maestro-tester-agent`
L313: reviewer | `ai-maestro-reviewer-agent`
L314: documenter | `ai-maestro-documenter-agent`
```