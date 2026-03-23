# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:29.455Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-integrator-agent-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-integrator-agent-2026-03-10.md:
- Line 1: # Plugin Governance Audit: ai-maestro-integrator-agent
- Line 5: The `ai-maestro-integrator-agent` plugin is a well-structured, large plugin (20 skills, 11 agents, 3 hooks) that largely follows the Plugin Abstraction Principle.
- Line 10: However, **one clear violation was found**: a skill script (`ci_webhook_handler.py`) makes direct REST API calls to `http://localhost:23000/api/messages` using `urllib`. Additionally, two lines in a skill reference document instruct agents to "Execute curl POST to AI Maestro API" without delegating to the global scripts. These are **Rule 2 violations**. Rule 1 is clean. Rule 3 has minor concerns (hardcoded role matrices in docs). Rule 4 is partially satisfied.
- Line 19: **Rule**: Skill SKILL.md files must not contain `curl`, `http://localhost`, endpoint URLs, or HTTP headers targeting the AI Maestro API. They should reference global AI Maestro skills by name.
- Line 24: - No SKILL.md file contains curl commands targeting the AI Maestro API.
- Line 25: - The messaging templates skill (`amia-integration-protocols`) correctly instructs agents to use the `agent-messaging` skill by name for all inter-agent communication:
- Line 26:   - `SKILL.md:119` references `ai-maestro-message-templates.md` — AI Maestro curl command templates (as a named reference file)
- Line 27:   - The actual template file (`references/ai-maestro-message-templates.md`) explicitly states: _"To send a message, use the `agent-messaging` skill with the above fields."_ — no curl embedded.
- Line 28: - Curl commands found in skill reference docs (`amia-release-management`, `amia-git-worktree-operations`, etc.) all target generic external services (e.g., `api.example.com`, `sonar.example.com`), NOT the AI Maestro API. These are legitimate examples in the user's own codebase being reviewed.
- Line 31: **Verdict: PASS** (✓ VERIFIED — all 20 SKILL.md files examined, no AI Maestro API calls embedded)
- Line 35: **Rule**: Hooks and scripts must call global AI Maestro scripts (`aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, etc.) rather than making direct API calls.
- Line 41: **Lines**:
- Line 42: - Line 41: `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")`
- Line 43: - Line 72: `f"{AIMAESTRO_API}/api/messages"` — direct POST to the AI Maestro messages endpoint
- Line 44: - Lines 71–77: Uses `urllib.request.Request` to call the REST API directly instead of delegating to `amp-send.sh`
- Line 55: **Why this is a violation**: This script bypasses the `amp-send.sh` abstraction layer and calls the AI Maestro messaging API directly. If the API changes (e.g., endpoint renamed, auth headers added, payload format changed), this script breaks independently of the global scripts. It should instead call `amp-send.sh` via subprocess, or at minimum accept the API URL/format from the installed global scripts.
- Line 58: **Note**: The script does have a localhost-only SSRF guard (lines 43–46), which is a positive security measure, but the structural violation remains.
- Line 62: These are procedural instructions embedded in a skill reference document telling agents to use `curl` directly to send messages. This contradicts the same skill's own `ai-maestro-message-templates.md` which correctly delegates to the `agent-messaging` skill. The phase-procedures document was not updated when the messaging approach was standardized.
- Line 65: All three hooks (`amia-branch-protection`, `amia-issue-closure-gate`, `amia-stop-check`) invoke Python scripts that use only `subprocess`/`gh` CLI calls. None call the AI Maestro REST API directly.
- Line 70: **Rule**: Plugins must not hardcode governance rules, role restrictions, or permission matrices. These should be discovered at runtime by reading the `team-governance` skill.
- Line 78: **Finding**: No reference to the `team-governance` skill was found anywhere in the plugin. The plugin has no mechanism to discover governance rules dynamically.
- Line 81: **Impact**: If the AI Maestro team governance rules change (e.g., new approval flows, new roles), these local documents will drift out of sync. The agent will operate on stale rules without realizing it.
- Line 83: **Verdict: ADVISORY** — Not a hard violation (role self-documentation is common), but the absence of `team-governance` skill references means the plugin does not benefit from runtime governance discovery.
- Line 88: The description mentions "Requires AI Maestro" in prose, but there is **no structured `dependencies` or `skills` field** declaring which AI Maestro global skills must be pre-installed (`agent-messaging`, `team-governance`, `ai-maestro-agents-management`). A consumer installing this plugin has no programmatic way to know what global skills are required.
- Line 93: - None of the prerequisites sections mention the global AI Maestro skills by name (e.g., `agent-messaging` skill must be installed)
- Line 94: - The `amia-integration-protocols/SKILL.md` states `Prerequisites: None required` but the skill instructs agents to use the `agent-messaging` skill — this is a contradiction
- Line 95: - Skills like `amia-quality-gates` and `amia-session-memory` state `Requires AI Maestro installed` in their YAML frontmatter, which is good, but do not specify which AI Maestro skills are needed
- Line 98: No skill or agent references `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, or other global AI Maestro scripts by name. These are the canonical abstraction layer scripts, and their absence from any prerequisite or instruction means agents have no guided path to them.
- Line 101: **Verdict: PARTIAL PASS** — Prerequisites sections exist but lack structured dependency declarations for global AI Maestro skills/scripts.
- Line 107: **No `dependencies` field in `plugin.json`**: The manifest has `name`, `version`, `description`, `author`, `repository`, `license` — but no `dependencies`, `required_skills`, or `required_scripts` field. This limits automated dependency checking by a plugin installer.
- Line 110: **No reference to global AI Maestro scripts anywhere**: The entire plugin (agents, skills, hooks, scripts) never mentions `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`. The messaging abstraction is partially honored (SKILL.md files reference `agent-messaging` skill) but no script-level abstraction is used.
- Line 113: **`ci_webhook_handler.py` is a standalone webhook server**: This script starts an HTTP server on port 9000. Its purpose (receiving GitHub webhooks) is legitimate, but its direct coupling to the AI Maestro API URL and message format makes it fragile. If the endpoint or message format changes, this server breaks independently of any AI Maestro update.
- Line 117: - `skills/amia-integration-protocols/references/phase-procedures.md` lines 95 and 145 refer to "curl POST to AI Maestro API" — this predates the `agent-messaging` skill abstraction and should be updated to say "use the `agent-messaging` skill".
- Line 119: - `docs/FULL_PROJECT_WORKFLOW.md` and other docs correctly reference the `agent-messaging` skill name, showing the newer pattern is being adopted but not consistently applied.
- Line 122: - The `ai-maestro-message-templates.md` reference document (the key messaging guide) correctly delegates everything to the `agent-messaging` skill and provides no raw curl commands — this is the right pattern.
- Line 124: - The three hook scripts are clean: no AI Maestro API calls, only `gh` CLI and git operations.
- Line 126: - All SKILL.md files follow the progressive disclosure pattern and are compact (under 4000 chars).
- Line 127