# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:04.897Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/plugins_development_links_to_official_documentation.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/plugins_development_links_to_official_documentation.md
- Line 14: - [Discover and install prebuilt plugins through marketplaces](https://code.claude.com/docs/en/discover-plugins.md): Find and install plugins from marketplaces to extend Claude Code with new commands, agents, and capabilities.
- Line 15: - [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces.md): Build and host plugin marketplaces to distribute Claude Code extensions across teams and communities.
```