# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:47.807Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-aimaestro-server-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-aimaestro-server-2026-02-27.md
Line 13: - **File:** `app/api/teams/by-name/[name]/route.ts` (NEW)
Line 24: - **File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh` (add new subcommand)
Line 35: - **File:** `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
Line 50: - **File:** `services/governance-service.ts` (add notification hook to `updateGovernanceRequest()`)
Line 65: - **File:** `services/agent-lifecycle-events.ts` (NEW - event publisher)
Line 66: - **Modified:** `app/api/agents/register/route.ts` (emit event after registration)
Line 81: - **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
Line 100: | P1 | Team-by-name lookup API | `app/api/teams/by-name/[name]/route.ts` (NEW) | HIGH | TODO |
Line 101: | P2 | aimaestro-agent.sh role command | `plugin/.../scripts/agent-helper.sh` | HIGH | TODO |
Line 102: | P3 | Update agents-management skill | `plugin/.../skills/ai-maestro-agents-management/SKILL.md` | HIGH | TODO |
Line 103: | P4 | GovernanceRequest AMP notifications | `services/governance-service.ts` | MEDIUM | FUTURE |
Line 104: | P5 | Agent registration event system | `services/agent-lifecycle-events.ts` (NEW), `app/api/agents/register/route.ts` (modified) | MEDIUM | FUTURE |
Line 105: | P6 | Document hook fetch exception | `plugin/.../scripts/ai-maestro-hook.cjs` | LOW | TODO |
```