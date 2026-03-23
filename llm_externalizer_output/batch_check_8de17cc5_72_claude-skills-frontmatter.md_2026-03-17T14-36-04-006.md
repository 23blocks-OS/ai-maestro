# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:04.006Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-skills-frontmatter.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-skills-frontmatter.md
- Line 1: # Claude Code: Skills Frontmatter Reference
- Line 3: Quick-reference tables for defining skills in `.claude/skills/<name>/SKILL.md`.
- Line 6: <td><a href="../">← Back to Claude Code Best Practice</a></td>
- Line 48: | **File location** | `.claude/skills/<name>/SKILL.md` | `.claude/agents/<name>.md` | `.claude/commands/<name>.md` |
- Line 66: - PR diff: !`gh pr diff`
- Line 67: - Issue details: !`gh issue view $0`
- Line 82: | Personal (`~/.claude/skills/`) | All your projects | 2 |
- Line 83: | Project (`.claude/skills/`) | This project only | 3 |
- Line 86: Skills from `.claude/commands/` still work. If a skill and a command share the same name, the skill takes precedence.
- Line 101: - [Use skills — Claude Code Docs](https://code.claude.com/docs/en/skills)
- Line 102: - [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
```