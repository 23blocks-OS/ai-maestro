# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:40.121Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-aimaestro-violations-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/consolidated-aimaestro-violations-2026-02-27.md
Line 15: | AI Maestro Plugin | 9/10 | 1 active (curl in skill) + 1 documented exception (hook) |
Line 18: | AI Maestro Server | n/a (provider) | Missing API endpoint + missing script command |
Line 22: These changes are required in the AI Maestro server codebase to fully support the Plugin Abstraction Principle and to enable the AMCOS/AMAMA harmonization described in Section 4.
Line 38: **Purpose:** Replace the only remaining direct `curl` example in the AI Maestro skills layer.
Line 41: Modified File | `plugin/plugins/ai-maestro/scripts/agent-helper.sh` |
Line 42: Replaces | `curl -s "http://localhost:23000/api/governance" \| jq .` |
Line 49:   local api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"
Line 50:   curl -s "${api_base}/api/governance" | jq '{
Line 56: **Purpose:** Remove the only direct API curl example from any AI Maestro skill.
Line 59: Modified File | `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` |
Line 60: Current (WRONG) | `curl -s "http://localhost:23000/api/governance" \| jq .` |
Line 61: New (CORRECT) | `aimaestro-agent.sh role` |
Line 78: Modified File | `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` |
Line 82: ```javascript
Line 83: /**
Line 84:  * PLUGIN ABSTRACTION EXCEPTION: This hook uses direct fetch() calls instead of
Line 85:  * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
Line 97: | S2 | `aimaestro-agent.sh role` subcommand | `plugin/.../scripts/agent-helper.sh` | HIGH | TODO |
Line 98: | S3 | Update agents-management skill | `plugin/.../skills/ai-maestro-agents-management/SKILL.md` | HIGH | TODO (after S2) |
Line 101: | S6 | Document hook fetch exception | `plugin/.../scripts/ai-maestro-hook.cjs` | LOW | TODO |
Line 105: The AI Maestro plugin is the **provider** of the abstraction layer (Rule 4 in PLUGIN-ABSTRACTION-PRINCIPLE.md). It is fundamentally sound (9/10). Changes needed:
Line 110: | Hooks (`ai-maestro-hook.cjs`) | 8/10 | 6 direct fetch() calls — acceptable due to hook constraints; need documentation |
Line 112: | Skills | 9/10 | One `curl` example remains in governance skill |
Line 114: **File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
Line 118: The `skills/ai-maestro-agents-management/SKILL.md` currently teaches:
Line 120: curl -s "http://localhost:23000/api/governance" | jq .
Line 122: This is the only direct API curl example in any skill — a violation of Rule 1 of the Plugin Abstraction Principle.
Line 125: **Fix:** Add the `role` subcommand (see S2 above), then update the skill to teach:
Line 127: aimaestro-agent.sh role
Line 133: **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
Line 135: **Violation type:** Layer 0 (hook) makes 6 direct `fetch()` API calls with no explanation.
Line 150: **Fix:** Add JSDoc exception comment (see S6 above). No code changes.
Line 153: **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
Line 175: | `scripts/agent-helper.sh` | 9/10 | IS the abstraction layer (missing `role` command only) |
Line 274: - **Zero** curl calls to `localhost:23000` across all files
Line 300: Already documented in S2 above. Required by AMAMA and AMCOS agents to check their own governance role at runtime without embedding curl. Without this command, any plugin agent that needs to self-check its role must violate Rule 1.
Line 321: | HIGH | S2+P1 | Plugin + Server | Add `aimaestro-agent.sh role` + update skill | `scripts/agent-helper.sh`, `skills/ai-maestro-agents-management/SKILL.md` | Small |
Line 327: | LOW | S6+P2 | Plugin | Document hook fetch exception | `scripts/ai-maestro-hook.cjs` | Tiny (docs only) |
Line 328: | LOW | P3 | Plugin | Extract agent lookup helper | `scripts/ai-maestro-hook.cjs` | Small |
Line 333: 1. **S2**: Add `aimaestro-agent.sh role` subcommand to `agent-helper.sh`
Line 334: 2. **S3/P1**: Update `ai-maestro-agents-management/SKILL.md` to teach `aimaestro-agent.sh role`
Line 337: 4. **S6/P2**: Add exception JSDoc to `ai-maestro-hook.cjs`
Line 349: | Zero curl in skills | All plugin skills | `grep -r "curl " plugin/plugins/*/skills/` returns nothing |
Line 350: | `aimaestro-agent.sh role` works | agent-helper.sh | Returns valid JSON role object |
Line 353: | Hook exception documented | `ai-maestro-hook.cjs` | JSDoc block visible at top of file |
```