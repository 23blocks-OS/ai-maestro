# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:56.867Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-server-changes.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/TODO-aimaestro-server-changes.md
- Line 48: - Check your governance role: `curl -s "http://localhost:23000/api/governance" | jq .`
- Line 107: - File: `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- Line 110: - Current: `agent-helper.sh` has no `role` subcommand. The only way for an agent to check its own governance role is via raw `curl -s "http://localhost:23000/api/governance" | jq .` — which is explicitly taught in `skills/ai-maestro-agents-management/SKILL.md` line 48 and is the sole remaining direct API curl example in any AI Maestro skill, violating Rule 1 of the Plugin Abstraction Principle.
- Line 119: api_base=$(get_api_base 2>/dev/null) || {
- Line 123: agent_id=$(_resolve_caller_agent_id 2>/dev/null) || agent_id=""
- Line 126: gov_resp=$(curl -s --max-time 10 "${api_base}/api/governance" 2>/dev/null) || {
- Line 127: print_error "Governance API unreachable at ${api_base}/api/governance" >&2
- Line 130: echo "$gov_resp" | jq --arg agent_id "$agent_id" '{
- Line 144: Then, in the `case "$COMMAND" in` dispatch block inside `aimaestro-agent.sh` (or wherever subcommands are routed), add a `role` case that calls `get_governance_role "$@"`. Check how existing subcommands like `session`, `config`, etc. are dispatched in `aimaestro-agent.sh` and follow the same pattern.
- Line 147: With AI Maestro running: `aimaestro-agent.sh role` outputs a JSON object like `{"role":"member","hasPassword":false,"managerId":null}`.
- Line 148: With `AIMAESTRO_API_BASE=http://localhost:23000 aimaestro-agent.sh role` — same result (respects env var).
- Line 149: With AI Maestro NOT running: `aimaestro-agent.sh role` prints an error and exits non-zero.
- Line 150: `grep -r "curl.*localhost:23000.*governance" plugin/plugins/ai-maestro/skills/` — should return nothing after S3 is also applied.
- Line 153: Without this command, any external plugin agent (AMAMA, AMCOS) that needs to self-check governance role at runtime must violate Rule 1 by embedding curl syntax.
- Line 160: - File: `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
- Line 163: - Current: Line 48 reads:
- Line 165: - Check your governance role: `curl -s "http://localhost:23000/api/governance" | jq .`
- Line 168: - Change: Replace line 48 with:
- Line 170: - Check your governance role: `aimaestro-agent.sh role`
- Line 173: `grep -r 'curl.*localhost:23000' plugin/plugins/ai-maestro/skills/` returns no output (zero curl examples in any skill).
- Line 175: `aimaestro-agent.sh role` works as verified in TODO-S2.
- Line 177: Required to complete H3. After this change, `grep -r "curl " plugin/plugins/ai-maestro/skills/` should return nothing, achieving 100% Plugin Abstraction compliance for the AI Maestro plugin's skills layer.
- Line 184: - File: `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
- Line 187: - Current: The file has a plain header comment (lines 1–14) documenting supported events and state file location. It contains 6 direct `fetch()` calls to `localhost:23000` API endpoints (~lines 50, 69, 127, 143, 169, 200) with no explanation of why the Plugin Abstraction Principle is not followed here. Future maintainers may incorrectly flag these as violations or attempt to wrap them in shell scripts (which would break the hook entirely).
- Line 202: * wrapping them in aimaestro-* scripts. This is an acceptable exception because:
- Line 213: * Direct fetch() calls in hooks are therefore the correct implementation pattern
- Line 230: `node --check plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` exits 0 (valid syntax — no code changes, only a comment was added).
- Line 232: `grep -n "PLUGIN ABSTRACTION EXCEPTION" plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` returns the inserted line.
- Line 275: Zero curl in skill files | `grep -r "curl " plugin/plugins/ai-maestro/skills/` | No output
- Line 276: `aimaestro-agent.sh role` works | `aimaestro-agent.sh role` | Returns valid JSON `{"role":..., "hasPassword":..., "managerId":...}`
- Line 277: Team-by-name returns 200 | `curl -s http://localhost:23000/api/teams/by-name/AMAMA` | Returns full team object (assuming team exists)
- Line 278: Team-by-name returns 404 | `curl -s http://localhost:23000/api/teams/by-name/nonexistent` | `{"error":"Team not found"}` with HTTP 404
- Line 279: Hook exception documented | `grep -n "PLUGIN ABSTRACTION EXCEPTION" plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs` | Returns line number in file
- Line 282: Governance skill complete | Check `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` | GovernanceRequests + Transfers + Auth + Discovery sections present (already done this session)
- Line 287: **S2**: Add `get_governance_role` function + `role` subcommand dispatch to `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
- Line 288: **S3**: Replace curl example with `aimaestro-agent.sh role` in `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`
- Line 291: **S6**: Insert JSDoc exception comment at top of `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
```