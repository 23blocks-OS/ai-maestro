# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:18.943Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-skills-2026-03-08.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-fix-skills-2026-03-08.md
- Line 18: - **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- Line 41: - **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- Line 60: - **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- Line 75:   1. `plugin/plugins/ai-maestro/skills/docs-search/SKILL.md` (line 214)
- Line 76:   2. `plugin/plugins/ai-maestro/skills/graph-query/SKILL.md` (line 145)
- Line 77:   3. `plugin/plugins/ai-maestro/skills/memory-search/SKILL.md` (line 137)
- Line 78:   4. `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` (line 953)
- Line 81: - **Fix:** Replaced all occurrences of `plugin/src/scripts/` with `plugin/plugins/ai-maestro/scripts/` in each file.
- Line 86: 1. `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` - HIGH-6, MED-17, MED-20
- Line 87: 2. `plugin/plugins/ai-maestro/skills/docs-search/SKILL.md` - MED-18
- Line 88: 3. `plugin/plugins/ai-maestro/skills/graph-query/SKILL.md` - MED-18
- Line 89: 4. `plugin/plugins/ai-maestro/skills/memory-search/SKILL.md` - MED-18
- Line 90: 5. `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` - MED-18
```