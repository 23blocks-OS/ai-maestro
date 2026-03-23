# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:23.229Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-consolidated-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-consolidated-2026-03-10.md
Line 10: | 1 | ai-maestro-assistant-manager-agent | Team | PARTIAL | 4 | 1 | 0 | 1 | 6 |
Line 11: | 2 | ai-maestro-chief-of-staff | Team | **FAIL** | **8+14** | **4** | 1 | 1 | **28+** |
Line 12: | 3 | ai-maestro-architect-agent | Team | PARTIAL | 2 | 0 | 0 | 1 | 3 |
Line 13: | 4 | ai-maestro-integrator-agent | Team | PARTIAL | 0 | 2 | 1 | 2 | 5 |
Line 14: | 5 | ai-maestro-orchestrator-agent | Team | PARTIAL | 1 | 2 | 0 | 1 | 4 |
Line 15: | 6 | ai-maestro-programmer-agent | Team | PARTIAL | 2 | 0 | 0 | 1 | 3 |
Line 25: 1. **ai-maestro-chief-of-staff** — FAIL — 8 SKILL.md files + 14 reference files embed curl/endpoints, 4 Python hook scripts make direct REST calls. Most work needed.
Line 26: 2. **ai-maestro-assistant-manager-agent** — PARTIAL — 4 reference files embed curl commands, 1 hook script calls API directly.
Line 28: 3. **ai-maestro-integrator-agent** — PARTIAL — 1 critical script (ci_webhook_handler.py) uses urllib directly, docs instruct curl usage.
Line 29: 4. **ai-maestro-orchestrator-agent** — PARTIAL — 2 Python scripts make direct curl calls to /api/messages.
Line 30: 5. **ai-maestro-programmer-agent** — PARTIAL — 2 hardcoded localhost URLs in skill file.
Line 31: 6. **ai-maestro-architect-agent** — PARTIAL — 2 minor hardcoded endpoints in reference docs.
Line 35: ### 1. ai-maestro-assistant-manager-agent (AMAMA)
Line 50: 1. Replace all curl commands in 4 reference files with "Refer to `team-governance` skill" or "Refer to `ai-maestro-agents-management` skill"
Line 55: ### 2. ai-maestro-chief-of-staff (AMCOS)
Line 80: 3. Rewrite 4 Python hook scripts to use `amp-send.sh`, `amp-inbox.sh`, `aimaestro-agent.sh`
Line 84: ### 3. ai-maestro-architect-agent
Line 92: - `.claude-plugin/plugin.json` — missing requiredSkills for `agent-messaging`, `ai-maestro-agents-management`
Line 97: ### 4. ai-maestro-integrator-agent
Line 114: ### 5. ai-maestro-orchestrator-agent
Line 127: ### 6. ai-maestro-programmer-agent
Line 150: **Affected:** ALL 6 team plugins
Line 153: **Fix pattern:** Add to plugin.json description: "Requires AI Maestro skills: team-governance, agent-messaging, ai-maestro-agents-management"
```