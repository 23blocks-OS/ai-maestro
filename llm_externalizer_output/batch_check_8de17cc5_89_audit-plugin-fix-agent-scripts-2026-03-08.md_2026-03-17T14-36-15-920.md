# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:15.921Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-agent-scripts-2026-03-08.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-agent-scripts-2026-03-08.md
1: - File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
15: - File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
20: - File: `plugin/plugins/ai-maestro/scripts/agent-core.sh`
25: - File: `plugin/plugins/ai-maestro/scripts/import-agent.sh`
40: 1. `plugin/plugins/ai-maestro/scripts/agent-helper.sh` - CRIT-1 + HIGH-5
41: 2. `plugin/plugins/ai-maestro/scripts/agent-core.sh` - HIGH-5
42: 3. `plugin/plugins/ai-maestro/scripts/import-agent.sh` - HIGH-4
52: - File: `plugin/plugins/ai-maestro/scripts/list-agents.sh` - Added deprecation notice
53: - File: `plugin/plugins/ai-maestro/scripts/export-agent.sh` - Added deprecation notice
54: - File: `plugin/plugins/ai-maestro/scripts/import-agent.sh` - Added deprecation notice
58: - File: `plugin/plugins/ai-maestro/scripts/agent-plugin.sh`
64: - File: `plugin/plugins/ai-maestro/scripts/agent-plugin.sh`
70: - File: `plugin/plugins/ai-maestro/scripts/agent-commands.sh`
80: 1. `plugin/plugins/ai-maestro/scripts/agent-helper.sh` - CRIT-1 + HIGH-5
81: 2. `plugin/plugins/ai-maestro/scripts/agent-core.sh` - HIGH-5
82: 3. `plugin/plugins/ai-maestro/scripts/import-agent.sh` - HIGH-4 + HIGH-3
83: 4. `plugin/plugins/ai-maestro/scripts/list-agents.sh` - HIGH-3
84: 5. `plugin/plugins/ai-maestro/scripts/export-agent.sh` - HIGH-3
85: 6. `plugin/plugins/ai-maestro/scripts/agent-plugin.sh` - MED-10 + MED-11
86: 7. `plugin/plugins/ai-maestro/scripts/agent-commands.sh` - MED-12
```