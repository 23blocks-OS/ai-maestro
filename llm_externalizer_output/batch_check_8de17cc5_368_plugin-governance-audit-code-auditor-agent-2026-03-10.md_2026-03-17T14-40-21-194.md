# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:21.194Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-code-auditor-agent-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-code-auditor-agent-2026-03-10.md
20: The `code-auditor-agent` plugin (formerly `ai-maestro-code-auditor-agent`, renamed per CHANGELOG) is a code auditing dependency plugin that provides two pipelines: a six-phase PR review pipeline and a ten-phase codebase audit pipeline. It installs 11 agents, 3 skills, and 1 slash command.
174: **Minor accuracy note:** The README states the plugin was formerly named `ai-maestro-code-auditor-agent` (confirmed in CHANGELOG: "Renamed plugin from ai-maestro-code-auditor-agent to code-auditor-agent"). If there are any installed references in AI Maestro configuration that still use the old name, those would need updating.
```