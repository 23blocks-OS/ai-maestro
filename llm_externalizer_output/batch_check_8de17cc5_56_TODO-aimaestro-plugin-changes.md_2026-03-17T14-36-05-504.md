# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:05.504Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:10:The AI Maestro plugin scores 9/10 for compliance with the Plugin Abstraction Principle. Three changes are needed:
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:15:TODO-P2 | Update `ai-maestro-agents-management/SKILL.md` to use `aimaestro-agent.sh role` | P1 (HIGH) | TODO (depends on TODO-P1 / TODO-S2) |
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:16:TODO-P3 | Document hook fetch exception in `ai-maestro-hook.cjs` | P3 (LOW) | TODO |
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:21:- **File:** `plugins/ai-maestro/scripts/agent-helper.sh`
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:25:- **Current:** `agent-helper.sh` provides governance utility functions (`check_config_governance`, `_resolve_caller_agent_id`) but does NOT expose a user-facing `role` subcommand. Any caller wanting to check the agent's governance role must call `curl -s "http://localhost:23000/api/governance" | jq .` directly — a Rule 1 violation.
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:27:- **Change:** Add a new public function `get_governance_role()` to `agent-helper.sh` that:
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:28:  1. Reads `AIMAESTRO_API_BASE` (with fallback to `http://localhost:23000`)
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:33:  5. Is also wired as the `role` subcommand in `aimaestro-agent.sh` (the main CLI dispatcher, which sources this file)
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:36:  # Get the governance role of the current agent.
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:39:  get_governance_role() {
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:40:    local api_base
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:41:    api_base=$(get_api_base 2>/dev/null) || api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:43:    local agent_id
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:44:    agent_id=$(_resolve_caller_agent_id 2>/dev/null) || agent_id=""
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:46:    local gov_resp
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:47:    gov_resp=$(curl -s --max-time 10 "${api_base}/api/governance" 2>/dev/null) || {
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:50:    local has_manager manager_id has_password
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:51:    has_manager=$(echo "$gov_resp" | jq -r '.hasManager // false')
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:52:    manager_id=$(echo "$gov_resp" | jq -r '.managerId // empty')
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-plugin-changes.md:53:    has_password=$(echo "$gov_resp" | jq -r '.hasPassword // false')
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:55:    local role="unset"
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:56:    if [[ "$has_manager" == "true" && -n "$manager_id" ]]; then
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:57:      if [[ -n "$agent_id" && "$agent_id" == "$manager_id" ]]; then
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:58:        role="manager"
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:60:        role="member"
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:63:    jq -n --arg role "$role" --argjson hp "$has_password" --arg mid "${manager_id:-}" \
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:64:      '{"role":$role,"hasPassword":$hp,"managerId":($mid | if . == "" then null else . end)}'
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:65:  }
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:67:  Then in `aimaestro-agent.sh` (the main CLI script that sources `agent-helper.sh`), add `role` to the command dispatcher:
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:71:- **Verify:**
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:72:  1. Run `aimaestro-agent.sh role` with AI Maestro running — it must return valid JSON with `role`, `hasPassword`, `managerId` fields
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:73:  2. Run with `AIMAESTRO_API_BASE=http://localhost:23000 aimaestro-agent.sh role`
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:74:  3. Run without AI Maestro running — it must return `{"role":"unset","hasPassword":false,"managerId":null}` (graceful fallback), not an error
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:75:  4. Run `grep -r 'curl.*localhost:23000/api/governance' plugin/plugins/ai-maestro/skills/` — must return nothing after TODO-P2 is applied
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:78:### TODO-P2: Replace Direct `curl` Example in `ai-maestro-agents-management/SKILL.md`
/Users/emanuelesabetta/docs_dev/TODO-aimaestro-plugin-changes.md:79:- **File:** `plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
/Users/emanuelesabetta/docs