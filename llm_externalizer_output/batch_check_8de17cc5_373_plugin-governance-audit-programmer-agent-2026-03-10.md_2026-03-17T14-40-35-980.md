# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:35.980Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-programmer-agent-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-programmer-agent-2026-03-10.md
Line 1: # Plugin Governance Audit: ai-maestro-programmer-agent
Line 3: **Repo**: https://github.com/Emasoft/ai-maestro-programmer-agent
Line 5: **Audited against**: AI Maestro Plugin Abstraction Principle (docs/PLUGIN-ABSTRACTION-PRINCIPLE.md)
Line 9: The plugin is **substantially compliant** with the Plugin Abstraction Principle but has **3 concrete violations** that must be fixed before the plugin can be considered fully aligned. Additionally, the plugin.json manifest is missing two fields required for proper dependency declaration.
Line 22: **Why it is a violation**: Skill files must NOT embed API syntax, endpoint URLs, or specific host:port addresses. The hardcoded `localhost:23000` and the `curl` diagnostic command directly reference the AI Maestro API endpoint. If the port or host changes in AI Maestro, this skill breaks silently. The skill should instead instruct the agent to use the `agent-messaging` skill's built-in health check or status check, rather than calling the API directly with curl.
Line 33: **Why it is a violation**: While README files are not skills, this diagnostic instruction teaches users to call service APIs directly with curl using hardcoded patterns. This conflicts with the Plugin Abstraction Principle's intent that all API interactions go through abstraction scripts. If a dedicated `check-mcp-status.sh` script existed in AI Maestro's global scripts, the README should reference that instead.
Line 48: **Why it is a violation**: Per Rule 4, the manifest description mentions "AI Maestro ecosystem" but does not formally declare the `agent-messaging` skill as a required dependency. Any installer or validator will not know to check for the prerequisite. The agent definition at `agents/ampa-programmer-main-agent.md` line 27 explicitly says `agent-messaging` skill MUST be globally installed, but this constraint is invisible at the manifest level.
Line 66: (Exact field names should conform to whatever schema AI Maestro's marketplace validator uses; the key point is the dependency on `agent-messaging` must be declared.)
Line 71: In `skills/ampa-handoff-management/SKILL.md:56`, the error handler instructs a direct `curl` health check against the AI Maestro API. No globally installed script wraps this operation (unlike `amp-inbox.sh`, `amp-send.sh`, etc.). A `aimaestro-status.sh` or similar script should be added to AI Maestro's global scripts, and the skill should reference that instead.
Line 80: > *"This is a shared cross-plugin document defining role boundaries for all agents in the AI Maestro ecosystem. It is distributed with each agent plugin for reference."*
Line 82: This is NOT a violation of Rule 3 by itself, because the document is read-only reference material and the agent is explicitly instructed to use the globally installed `agent-messaging` skill for all actual messaging operations (not to enforce its own permission matrix).
Line 84: However, the concern is: **if governance rules change in AI Maestro's `team-governance` skill, this static copy becomes stale**. The plugin would then contain outdated role boundary information. Per Rule 3, governance rules should be discovered at runtime from the `team-governance` skill.
Line 87: **Recommendation**: Remove `docs/ROLE_BOUNDARIES.md` from the plugin and replace the reference in the main agent with an instruction to read the globally installed `team-governance` skill for role boundary information. Or, at minimum, add a note that this document is informational only and the authoritative source is the `team-governance` skill.
Line 93: 1. **All 5 skill SKILL.md files do NOT embed curl commands, API URLs, or HTTP headers** (except the one violation in `ampa-handoff-management/SKILL.md`). Skills correctly defer to the globally installed `agent-messaging` skill using natural language references like "use the `agent-messaging` skill to send a message."
Line 97: 2. **Reference files in skills use natural language instructions**, not curl patterns. For example, `skills/ampa-orchestrator-communication/references/op-notify-completion.md` includes a JSON block showing message content but explicitly notes: *"The structure below shows the conceptual message content. Use the `agent-messaging` skill to send messages - it handles the exact API format automatically."*
Line 103: 4. **scripts/ directory contains only validation tooling** (CPV scripts, linters, validators). The two `localhost` string literals found in `validate_mcp.py` are used as URL prefix patterns for a security classification check (local vs. remote MCP servers), not as actual API calls. The `curl` commands in `lint_files.py` are for installing toolchain packages (rustup), not for calling AI Maestro APIs.
Line 106: 5. **The main agent definition** (`agents/ampa-programmer-main-agent.md`) consistently references `agent-messaging` skill by name for all inter-agent communication and explicitly forbids direct contact with other agents.
Line 109: 6. **All communication examples across all reference files** use the pattern "Send using the `agent-messaging` skill" rather than embedding curl commands.
Line 120:   "description": "General-purpose programmer agent that writes code, runs tests, and creates PRs. Works standalone or as part of the AI Maestro ecosystem. Ships 5 bundled skills and uses SERENA MCP for code navigation. In orchestrated mode, requires the globally installed 'agent-messaging' skill.",
Line 130: The field names `globalSkills` and `mcpServers` should be adjusted to match whatever schema the AI Maestro marketplace validator expects. The key requirement is that `agent-messaging` must be declared as a dependency.
Line 139: > is the globally installed `team-governance` skill. This copy may be outdated.
```