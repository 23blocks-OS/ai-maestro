# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:14.695Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-aimaestro-plugin-decoupling-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/audit-aimaestro-plugin-decoupling-2026-02-27.md
Line 1: # AI Maestro Plugin Decoupling Audit - 2026-02-27
Line 3: This audit examined the AI Maestro plugin (`/plugin/plugins/ai-maestro/`) for decoupling violations across hooks, scripts, skills, and agent definitions. The plugin serves as the **provider of the abstraction layer**, so direct API calls in scripts (Layer 2) are expected. However, hooks (Layer 0) and skills (Layer 1) have different standards.
Line 5: **Key Finding:** The plugin is **fundamentally SOUND**, but `ai-maestro-hook.cjs` has notable direct API calls that merit discussion about future refactoring.
Line 18: - All hooks call a single command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-maestro-hook.cjs"`
Line 25: ### File: `scripts/ai-maestro-hook.cjs`
Line 50: | 50 | `http://localhost:23000/api/agents` | GET/fetch | Find agent by working directory | Layer 0 hook, context acceptable |
Line 69: | 69 | `http://localhost:23000/api/sessions/activity/update` | POST/fetch | Broadcast status update | Layer 0 hook, context acceptable |
Line 127: | 127 | `http://localhost:23000/api/agents` | GET/fetch | Find agent matching CWD | Layer 0 hook, context acceptable |
Line 143: | 143 | `http://localhost:23000/api/sessions/{sessionName}/command` | POST/fetch | Send message notification | Layer 0 hook, context acceptable |
Line 169: | 169 | `http://localhost:23000/api/agents` | GET/fetch | Check unread messages (agent lookup) | Layer 0 hook, context acceptable |
Line 200: | 200 | `http://localhost:23000/api/messages?agent={id}&box=inbox&status=unread` | GET/fetch | Fetch unread messages | Layer 0 hook, context acceptable |
Line 210: The hook makes direct fetch() calls to AI Maestro HTTP API. This is technically a **violation of strict layering** because:
Line 247: - Line 247: `curl -sf --connect-timeout 2 "${AMP_MAESTRO_URL}/api/organization"` — Fetch organization from AI Maestro
Line 268: | 366 | `/api/v1/route` | POST curl | Send message via AI Maestro (local routing) |
Line 271: | 491 | `/api/v1/register` | POST curl | Auto-register agent with AI Maestro |
Line 272: | 143 | `${AMP_MAESTRO_URL}/api/v1/route` | POST curl | External provider routing |
Line 292: - Line 848: `curl -s --max-time 3 "http://localhost:23000/api/agents"` — List agents for completion
Line 320: #### `skills/ai-maestro-agents-management/SKILL.md`
Line 330: - **Line 48 mentions:** `curl -s "http://localhost:23000/api/governance" | jq .`
Line 336: curl -s "http://localhost:23000/api/governance" | jq .
Line 345: - Create a CLI command: `aimaestro-agent.sh role` to avoid teaching curl directly
Line 346: - Update skill to teach: `aimaestro-agent.sh role` instead of `curl`
Line 370: The plugin does not contain agent definition files. Agent definitions would be stored in `~/.aimaestro/agents/registry.json` (per CLAUDE.md).
Line 380: | Layer 0 | scripts/ai-maestro-hook.cjs | 6 | ⚠️ ACCEPTABLE | Hook context, Node.js only |
Line 383: | Layer 1 | skills/ai-maestro-agents-management/SKILL.md | 1 | ⚠️ MINOR | Teaches curl for governance role check |
Line 393: | `/api/v1/register` | amp-send.sh | POST | Auto-register agent | None |
Line 394: | `/api/v1/route` | amp-send.sh | POST | Route message via AI Maestro | Bearer token |
Line 395: | `/api/agents` | ai-maestro-hook.cjs | GET | List agents | None |
Line 396: | `/api/messages?agent=...&box=...&status=...` | ai-maestro-hook.cjs | GET | Query messages | None |
Line 397: | `/api/sessions/activity/update` | ai-maestro-hook.cjs | POST | Update session activity | None |
Line 398: | `/api/sessions/{sessionName}/command` | ai-maestro-hook.cjs | POST | Send command to session | None |
Line 399: | `/api/organization` | amp-helper.sh | GET | Get organization name | None |
Line 400: | `/api/governance` | ai-maestro-agents-management/SKILL.md (documentation) | GET | Check governance role | None |
Line 426: | `AMP_MAESTRO_URL` | `http://localhost:23000` | amp-helper.sh | AMP subsystem |
Line 437: The hook makes 6 direct API calls, which technically violates strict layering. However:
Line 450: The `ai-maestro-agents-management/SKILL.md` skill teaches:
Line 452: curl -s "http://localhost:23000/api/governance" | jq .
Line 457: aimaestro-agent.sh role
Line 462: Update skill to teach: `aimaestro-agent.sh role`
Line 472: The hook calls `/api/organization` every initialization. Consider:
Line 479: - `ai-maestro-agents-management/SKILL.md` teaches one curl command (governance role check) — marked for improvement above
Line 499: Add this to the top of `ai-maestro-hook.cjs`:
Line 501: /**
Line 502:  * HOOK IMPLEMENTATION EXCEPTION
Line 504:  * This hook makes direct fetch() calls to AI Maestro HTTP API.
Line 505:  * This is normally a decoupling violation, but is acceptable here because:
Line 506:  * 1. Hooks are called by Claude Code's system, not transitively by scripts
Line 507:  * 2. Hooks must respond within ~5 seconds; spawning shell scripts adds overhead
Line 508:  * 3. No abstraction layer is available in Claude Code's hook API
Line 510:  * Future refactoring could extract agent lookup into a Node.js module,
Line 511:  * but the current implementation is pragmatically acceptable.
Line 512:  */
Line 522: The AI Maestro plugin demonstrates **excellent decoupling discipline**:
Line 530: The plugin is **fundamentally SOUND** with one minor improvement opportunity (governance role CLI command).
Line 540: - `scripts/ai-maestro-hook.cjs` (420 lines)
Line 544: - `skills/ai-maestro-agents-management/SKILL.md`
```