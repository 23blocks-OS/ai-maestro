# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:20.760Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-assistant-manager-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-assistant-manager-2026-03-10.md
Line 1: # Plugin Governance Audit: AI Maestro Assistant Manager Agent (AMAMA)
Line 2: **Repo**: https://github.com/Emasoft/ai-maestro-assistant-manager-agent
Line 10: The AMAMA plugin is **substantially aligned** with the Plugin Abstraction Principle but has **2 confirmed violations** and **3 advisory issues**. The violations are in skill reference files (Rule 1) and in one hook script (Rule 2). The plugin correctly references global AI Maestro skills by name in most places and avoids hardcoding governance rules.
Line 27: **`skills/amama-amcos-coordination/references/creating-amcos-instance.md`** — lines 58-64, 83-87, 161-170:
Line 34: **Why this matters**: When AI Maestro changes its API (endpoint paths, new headers required, changed request bodies), every one of these reference files must be updated manually. This defeats the Plugin Abstraction Principle whose point is that only AI Maestro's own skill files should contain the canonical API syntax.
Line 37: **What the rule requires**: Plugin skill files (including their reference documents) should NOT contain curl commands or endpoint URLs. They should describe what operations are available and reference the global `team-governance` skill by name for the canonical syntax.
Line 42: **File**: `scripts/amama_stop_check.py` — lines 42-49
Line 43: api_base = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
Line 44: session_name = os.environ.get("AIMAESTRO_AGENT", "")
Line 49: This hook script, which runs on the Stop event, calls the AI Maestro API directly with `curl` instead of using the global `amp-inbox.sh` script.
Line 51: The `amp-inbox.sh` script is already installed globally by AI Maestro and provides the correct inbox-checking behavior with proper error handling and format. The hook should call `amp-inbox.sh` instead of constructing its own curl command.
Line 60:   "name": "ai-maestro-assistant-manager-agent",
Line 66: Missing fields compared to what the Plugin Abstraction Principle recommends:
Line 67: - No `requiredSkills` array listing globally-required AI Maestro skills (e.g., `"team-governance"`, `"agent-messaging"`, `"ai-maestro-agents-management"`)
Line 68: - No `minimumAIMaestroVersion` field (the README states `>= 0.26.0` but this is not machine-readable in the manifest)
Line 70: The README correctly documents the `AI Maestro >= 0.26.0` dependency and the `ai-maestro-agents-management` external skill requirement. However, these are only in prose form, not in a structured `plugin.json` field that tooling can read.
Line 74: **File**: `agents/amama-assistant-manager-main-agent.md` — lines 84, 94-97, 101-102, 111, 142
Line 83: These appear in the "Key Constraints" and "Governance Awareness" sections as documentation of what the MANAGER role can do, not as executable instructions. This is borderline: it is reasonable for an agent's system prompt to describe its own capabilities using API paths as shorthand, but strictly speaking the agent should be told "use the `team-governance` skill for COS assignment" rather than "call `PATCH /api/teams/[id]/chief-of-staff`".
Line 90: - `skills/amama-amcos-coordination/SKILL.md` — lines 25-27: `PATCH /api/teams/$TEAM_ID/chief-of-staff`, `POST /api/agents/register`, `POST /api/teams`
Line 92: These SKILL.md files list API paths in their Instructions sections. Unlike the reference files (Violation 1 above), these are not full curl commands — just path references. However, they still embed endpoint knowledge that should be in the global `team-governance` skill.
Line 94: The clean skills (e.g., `amama-role-routing`, `amama-user-communication`, `amama-session-memory`) correctly avoid embedding API paths and just describe behavior at a high level. The approval-workflows and amcos-coordination skills should follow the same pattern.
Line 104: Hooks reference global scripts | Partial | `amama_notify_agent.py` correctly calls `amp-send`; `amama_stop_check.py` does not (Violation 2) |
Line 107: `ai-maestro-agents-management` external skill | Declared in agent | Only in prose, not in plugin.json |
Line 110: Legacy API references (pre-v0.26) | None found | All endpoints look current |
Line 117: 2. **`amama_notify_agent.py`** — Uses `amp-send` CLI (globally installed), not a direct API call. Correct.
Line 119: 3. **`amama_session_start.py` and `amama_session_end.py`** — Pure file I/O, no API calls. Correct.
Line 121: 4. **`amama-user-communication` SKILL.md** — No API paths, no curl. Clean reference to other skills by name.
Line 123: 5. **`amama-role-routing` SKILL.md** — No API paths, no curl. Uses skill references correctly.
Line 125: 6. **`amama-session-memory` SKILL.md** — References `$AIMAESTRO_API/api/memory/` only as a documentation note in Resources, not as an embedded instruction.
Line 127: 7. **Agent skill list** (`amama-assistant-manager-main-agent.md`) — Correctly lists `ai-maestro-agents-management` as an external dependency with a clear prose warning that it must be globally installed.
Line 129: 8. **`skills/amama-amcos-coordination/references/success-criteria.md`** — Correctly refers to the `ai-maestro-agents-management` skill by name for agent listing, not curl.
Line 131: 9. **`skills/amama-user-communication/references/amcos-monitoring.md`** — Uses `agent-messaging` skill and `ai-maestro-agents-management` skill by name for all monitoring actions.
Line 146: **File**: `scripts/amama_stop_check.py`, function `check_ai_maestro_inbox()` (lines 39-57)
Line 159: Update `.claude-plugin/plugin.json` to add machine-readable dependency declarations:
Line 162:   "name": "ai-maestro-assistant-manager-agent",
Line 164:   "description": "User's right hand - sole interlocutor with user, directs other roles. Requires AI Maestro for inter-agent messaging.",
Line 165:   "minimumAIMaestroVersion": "0.26.0",
Line 167:     "ai-maestro-agents-management",
Line 172:   "repository": "https://github.com/Emasoft/ai-maestro-assistant-manager-agent",
Line 188: | MEDIUM | Replace curl in amama_stop_check.py with amp-inbox.sh | `scripts/amama_stop_check.py:47` | Rule 2 |
Line 192: | LOW | Refactor agent Key Constraints to use skill references | `agents/amama-assistant-manager-main-agent.md` | Rule 1 |
```