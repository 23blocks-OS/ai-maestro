# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:15.139Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-12-agent-profile-panel-redesign.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-12-agent-profile-panel-redesign.md
L41: Example: plugin `ai-maestro-chief-of-staff`:
L42: - File: `ai-maestro-chief-of-staff.agent.toml` → `[agent].name = "ai-maestro-chief-of-staff"`
L43: - Agent: `agents/ai-maestro-chief-of-staff-main-agent.md` → `name: ai-maestro-chief-of-staff-main-agent`
L44: - Claude CLI: `claude --agent ai-maestro-chief-of-staff-main-agent`
L50: ROLE | Role-Plugin name (specialization) | `ai-maestro-architect`
L288: ai-maestro-chief-of-staff/                              ← plugin name
L290: │   └── plugin.json                                     ← name: "ai-maestro-chief-of-staff"
L291: ├── ai-maestro-chief-of-staff.agent.toml                ← filename stem matches plugin name
L292: ├── agents/
L293: │   └── ai-maestro-chief-of-staff-main-agent.md         ← REQUIRED: <plugin-name>-main-agent.md
```