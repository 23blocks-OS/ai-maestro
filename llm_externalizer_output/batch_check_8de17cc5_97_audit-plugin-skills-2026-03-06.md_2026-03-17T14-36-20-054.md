# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:20.054Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-skills-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-skills-2026-03-06.md
Line 1: # AI Maestro Plugin Skills Audit Report
Line 14: | ai-maestro-agents-management | 5 |
Line 29: - The actual scripts in `scripts/` are named `amp-identity.sh`, `amp-init.sh`, `amp-send.sh`, etc.
Line 47: ## 2. ai-maestro-agents-management (SKILL.md)
Line 104: - This is the only skill at version `2.0.0`. All others are at `1.0.0` (or `"1.0"` for team-governance). Not necessarily wrong, but worth noting the inconsistency.
Line 120: - The actual installer is at `/Users/emanuelesabetta/ai-maestro/install-doc-tools.sh` (project root). Relative path only works if CWD is the project root.
Line 149: - Line 145 and 153: References `~/ai-maestro/install-graph-tools.sh`. This hardcodes the AI Maestro install location. Should use a more portable reference or note it depends on the install location.
Line 342: - The entire team-governance skill embeds raw `curl` commands with hardcoded `http://localhost:23000` URLs. Per the CLAUDE.md Plugin Abstraction Principle, this is the exception because this IS the AI Maestro plugin providing canonical syntax. However, the skill does not mention that other plugins should NOT copy these patterns -- they should reference this skill by name instead.
Line 354: - docs-search, graph-query, memory-search, ai-maestro-agents-management all reference `plugin/src/scripts/` as the source location. The actual path is `plugin/plugins/ai-maestro/scripts/`. This is a systemic error across 4 skills.
```