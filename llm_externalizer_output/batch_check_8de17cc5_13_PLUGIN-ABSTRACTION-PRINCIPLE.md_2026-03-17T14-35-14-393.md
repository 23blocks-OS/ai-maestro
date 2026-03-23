# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:14.393Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs/PLUGIN-ABSTRACTION-PRINCIPLE.md
- Line 49: | `ai-maestro-agents-management` | Agent lifecycle: create, list, show, update, delete, rename, hibernate, wake, plugin/skill management | `~/.claude/skills/ai-maestro-agents-management/` |
- Line 55: | `aimaestro-agent.sh` | Agent lifecycle CLI (delegates to agent-*.sh modules) | `~/.local/bin/` |
- Line 110: The AI Maestro plugin (`plugin/plugins/ai-maestro/`) IS the provider of these abstractions. Its skills contain the canonical syntax. Its scripts make the actual API calls. This is by design.
- Line 122:   "description": "Team management plugin. Requires AI Maestro skills: team-governance, ai-maestro-agents-management, agent-messaging."
- Line 130: - `ai-maestro-agents-management` — For agent lifecycle management
- Line 160: 4. **Replace with global script calls**: `aimaestro-agent.sh`, `amp-send.sh`, etc.
- Line 182: *This principle is foundational to the AI Maestro plugin ecosystem. All plugins submitted to the marketplace should follow these rules.*
```