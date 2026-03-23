# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:52.300Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-aimaestro-plugin-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/decoupling-changes-aimaestro-plugin-2026-02-27.md
Line 1: # Decoupling Changes — AI Maestro Plugin (Provider)
Line 3: The AI Maestro plugin is the **PROVIDER of the abstraction layer**. Its skills contain the canonical API syntax and its scripts make the actual API calls. The plugin IS the exception to the Plugin Abstraction Principle — it provides the layer that others use.
Line 5: Based on audit findings (see: `audit-aimaestro-plugin-decoupling-2026-02-27.md`), the plugin is **fundamentally sound** (9/10 score) with only minor improvements needed.
Line 10: | **Hooks Layer** | 8/10 | Direct API calls acceptable due to hook constraints |
Line 11: | **Scripts Layer** | 10/10 | Excellent API abstraction, env-configurable |
Line 12: | **Skills Layer** | 9/10 | One curl example to fix (governance role check) |
Line 15: ### Change 1: Add `aimaestro-agent.sh role` Command — HIGH PRIORITY
Line 17: **File:** `plugin/plugins/ai-maestro/scripts/agent-helper.sh`
Line 22: The `skills/ai-maestro-agents-management/SKILL.md` skill teaches:
Line 30: Add to `plugin/plugins/ai-maestro/scripts/agent-helper.sh`:
Line 32: ```bash
Line 34: role() {
Line 35:   local api_base="${AIMAESTRO_API_BASE:-http://localhost:23000}"
Line 36:   curl -s "${api_base}/api/governance" | jq '{
Line 42: main() {
Line 43:   local cmd="${1:-}"
Line 44:   case "${cmd}" in
Line 45:     role)
Line 46:       role
Line 47:       ;;
Line 50: **Then Update Skill:**
Line 52: In `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md`, replace:
Line 59: With:
Line 61: ```bash
Line 62: aimaestro-agent.sh role
Line 63: ```
Line 65: **Why This Fixes It:**
Line 66: - Users never need to curl the API directly
Line 67: - Skill teaches CLI command (canonical pattern)
Line 68: - Script provides the HTTP abstraction
Line 69: - Maintains proper layer separation (Layer 1 → Layer 2)
Line 71: **Success Condition:**
Line 72: - `aimaestro-agent.sh role` outputs governance role without requiring manual curl
Line 73: - Skill documentation updated to teach the CLI command
Line 74: - No direct API curl examples remain in any skill
Line 77: ### Change 2: Document Hook Exception — LOW PRIORITY
Line 79: **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
Line 81: **Current State:**
Line 82: - 6 direct fetch() API calls with no comment explaining why
Line 83: - No documentation of why a hook violates layering
Line 85: **Problem:**
Line 86: The hook makes direct HTTP calls to AI Maestro, which technically violates strict decoupling. Without documentation, future maintainers won't understand this is intentional.
Line 88: **Required Change:**
Line 90: Add this JSDoc block at the top of `ai-maestro-hook.cjs` (after the initial comments/requires, before the main event handlers):
Line 92: ```javascript
Line 93: /**
Line 94:  * HOOK IMPLEMENTATION EXCEPTION
Line 95:  *
Line 96:  * This hook makes direct fetch() calls to AI Maestro HTTP API.
Line 97:  * This is normally a decoupling violation, but is acceptable here because:
Line 98:  *
Line 99:  * 1. Hooks are called by Claude Code's system, not transitively by scripts/skills
Line 100:  *    → The hook is never invoked from the abstraction layer
Line 101:  *
Line 102:  * 2. Hooks must respond within ~5 seconds; spawning shell scripts adds overhead
Line 103:  *    → Performance is critical for user experience (session start notifications)
Line 104:  *
Line 105:  * 3. No abstraction layer is available in Claude Code's hook API
Line 106:  *    → Hooks have no way to delegate to shell scripts
Line 107:  *
Line 108:  * 4. One-way dependency only
Line 109:  *    → Claude Code calls the hook; the hook doesn't call back
Line 110:  *
Line 111:  * Future refactoring could:
Line 112:  * - Extract the "find agent by CWD" logic into a reusable Node.js module
Line 113:  * - Consider creating a lightweight agent-lookup service
Line 114:  * - Cache agent lookups to reduce API calls (agent list is static between changes)
Line 115:  */
Line 116: ```
Line 118: **Success Condition:**
Line 119: - Exception is documented at top of hook file
Line 120: - Future maintainers understand this is intentional
Line 121: - No code changes needed, documentation only
Line 124: ### Change 3: Extract Agent Lookup Helper — LOW PRIORITY (FUTURE)
Line 126: **File:** `plugin/plugins/ai-maestro/scripts/ai-maestro-hook.cjs`
Line 128: **Current State:**
Line 129: - Agent lookup by CWD pattern repeated 4 times in the hook
Line 131: **Problem:**
Line 132: Lines ~50, ~127, ~169 all repeat similar logic:
Line 133: ```javascript
Line 134: const agent = (agentsData.agents || []).find(a => {
Line 135:   const agentWd = a.workingDirectory || a.session?.workingDirectory;
Line 136:   return agentWd && cwd.startsWith(agentWd);
Line 137: });
Line 138: ```
Line 140: **Recommendation (Not Required for This Change Spec):**
Line 142: Extract into a reusable function:
Line 143: ```javascript
Line 144: function findAgentByCwd(agents, cwd) {
Line 145:   return (agents || []).find(a => {
Line 146:     const agentWd = a.workingDirectory || a.session?.workingDirectory;
Line 147:     return agentWd && cwd.startsWith(agentWd);
Line 148:   });
Line 149: }
Line 150: ```
Line 152: **Why This Is Low Priority:**
Line 153: - The code is small (single pattern, ~8 lines)
Line 154: - Refactoring is nice-to-have, not critical
Line 155: - Document as future work for post-release cleanup
Line 157: **Success Condition (Future):**
Line 158: - When touched again, extract into helper function
Line 159: - Add unit tests for the extraction logic
Line 160: - Mark as "Refactored" in the next audit
Line 163: ## Already Completed (Previous Session)
Line 165: The following changes were completed in the previous session and documented in `skills/team-governance/SKILL.md`:
Line 174: ## Clean Components (No Changes Needed)
Line 176: The following components have excellent decoupling and require **NO changes**:
Line 181: | **Skills: Messaging** | skills/agent-messaging/SKILL.md | ✓ 10/10 | Teaches CLI only, no API syntax |
Line 182: | **Skills: Planning** | skills/planning