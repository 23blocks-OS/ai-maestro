# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:06.343Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P4-53421286-89e6-4941-9c8b-c90e6e0c5fac.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-claims-P4-53421286-89e6-4941-9c8b-c90e6e0c5fac.md
L100: | 14 | "CLI governance: check_config_governance() in agent-helper.sh, wired into skill/plugin scripts" | `plugin/plugins/ai-maestro/scripts/agent-helper.sh:141` -- function defined; `plugin/plugins/ai-maestro/scripts/agent-skill.sh:300,458` and `plugin/plugins/ai-maestro/scripts/agent-plugin.sh:161,289` -- wired into install/remove commands | VERIFIED |
```