# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:06.509Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/deep-audit-AMCOS-lifecycle-2026-02-27.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/deep-audit-AMCOS-lifecycle-2026-02-27.md
- Line 25: The AMCOS agent-lifecycle reference files show **strong compliance** with Plugin Abstraction Principle in the primary agent interaction layer — they correctly use `ai-maestro-agents-management` and `agent-messaging` skill references instead of embedding CLI syntax. However, there are **two clear categories of violations** and one significant category that needs **harmonization rather than removal** (the local record-keeping system).
- Line 30: - **COMPLIANT areas:** Agent lifecycle operations (create/hibernate/wake/terminate) correctly delegate to global skills. Messaging operations correctly use `agent-messaging` skill references. The refactoring to skill references appears substantially complete.
- Line 34: - **PRESERVE area:** The local record-keeping system (lifecycle log, approval log, team assignments log, agent-registry.json) is a DISTINCT layer from the AI Maestro GovernanceRequest API — it tracks AMCOS-internal state that does NOT exist in AI Maestro. This must be preserved but harmonized.
- Line 44: 1. **Rule 1 — No embedded API syntax in plugin skills**: Plugin skills must reference global AI Maestro skills by name, not embed `curl` commands or endpoint URLs.
- Line 45: 2. **Rule 2 — No direct API calls in plugin hooks/scripts**: Plugin hooks must call globally-installed scripts (`aimaestro-agent.sh`, `amp-send.sh`, etc.), never `curl`.
- Line 48: The `team-governance` skill IS the canonical reference. It embeds full `curl` syntax with `localhost:23000` URLs because it IS the AI Maestro-provided skill (Rule 4 exception: "AI Maestro's Own Plugin Is the Exception"). External plugins must REFERENCE this skill, not duplicate it.
- Line 56: All lifecycle examples correctly instruct the agent to "use the `ai-maestro-agents-management` skill." No curl commands, no hardcoded endpoints, no embedded CLI syntax. The file appropriately defers all operations to the global skill.
- Line 59: - Line 21: "Use the `ai-maestro-agents-management` skill to create a new agent"
- Line 60: - Line 51: "Use the `ai-maestro-agents-management` skill to terminate agent"
- Line 66: The entire file uses skill-delegation language consistently. All 12 operation sections (create, terminate, hibernate, wake, restart, update, list, show, state management, error handling, workflows) reference the `ai-maestro-agents-management` skill exclusively.
- Line 69: - Line 332: `tmux list-sessions | grep <agent-name>` — This is a valid raw tmux diagnostic command, not an AI Maestro API call. Acceptable per the principle (not an API bypass).
- Line 89: **What it should do instead:** Reference the `agent-messaging` skill or replace with a note such as: "Use the `ai-maestro-agents-management` skill to hibernate the agent (see op-hibernate-agent.md for detailed procedure)."
- Line 110: The file describes a local file-based storage path (`design/memory/agents/<agent-id>/hibernate/`) and a specific JSON registry entry format with `wake_triggers` field. This format is inconsistent with the AI Maestro registry format documented in `record-keeping.md` (which uses `~/.ai-maestro/agent-states/`). The storage paths are hardcoded and contradictory across files:
- Line 114: - `hibernation-procedures.md` uses: `design/memory/agents/code-impl-01/hibernate/`
- Line 115: - `op-hibernate-agent.md` uses: `~/.ai-maestro/agent-states/<session-name>-hibernation.json`
- Line 116: - `success-criteria.md` uses: `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
- Line 117: - `record-keeping.md` uses: `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/<agent_name>-<timestamp>.json`
- Line 159: Retry, or use `curl -s "$AIMAESTRO_API/api/teams"` to verify state
- Line 166: **What it should do instead:** "Check team registry via the `team-governance` skill (List All Teams operation)" or simply remove the raw curl hint.
- Line 172: The file references `~/.ai-maestro/agent-states/` as the state storage location in three places, but this is inconsistent with `success-criteria.md` (which uses `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/`). The storage path is not a plugin-level concern and should be encapsulated by the skill or script, not embedded in reference procedures.
- Line 189: **What it should do instead:** This step should use the `ai-maestro-agents-management` skill to list online agents (which is already described correctly in `cli-examples.md` section 1.4). The broadcast example embeds a raw script call when the agent should be instructed to use the appropriate skill.
- Line 191: **Suggested fix:** Replace with: "Use the `ai-maestro-agents-management` skill to list all online agents, then for each agent..."
- Line 220: Team registry API is accessible (`$AIMAESTRO_API/api/teams`)
- Line 224: **What it should do instead:** This is a prerequisite check, so it uses the environment variable `$AIMAESTRO_API` correctly (not hardcoded `localhost:23000`). The severity is LOW because `$AIMAESTRO_API` is the correct pattern to avoid hardcoding. However, the raw curl API path check should still be replaced with a skill-based check.
- Line 230: The error handling table (line 163) references: `tmux kill-session -t <name>` — this is an acceptable raw tmux command for a "session stuck" error recovery scenario. Not a violation.
- Line 266: Team exists in AI Maestro (verify with `curl -s "$AIMAESTRO_API/api/teams"`)
- Line 269: curl -s "$AIMAESTRO_API/api/teams" | jq '.[] | {name: .name, members: (.members | length)}'
- Line 275: The `publish` subcommand of `amcos_team_registry.py` internally sends AMP messages. This is an indirect violation — the AMP message format is embedded within the script's internal implementation and called from reference procedures. The AMP messaging should go through the `agent-messaging` skill, not through a registry script's side-effect.
- Line 309: This path (`~/.ai-maestro/agent-states/`) conflicts with:
- Line 310: - `success-criteria.md` which uses `$CLAUDE_PROJECT_DIR/.ai-maestro/hibernated-agents/<agent-name>/context.json`
- Line 311: - `record-keeping.md` which uses `$CLAUDE_PROJECT_DIR/docs_dev/chief-of-staff/hibernation/`
- Line 312: - `hibernation-procedures.md` which uses `design/memory/agents/`
- Line 320: This file defines the AMCOS-internal record keeping system. It has no curl violations (uses `$AIMAESTRO_API` variable correctly where it does use curl). However, it defines structures that overlap with and diverge from the AI Maestro GovernanceRequest API.
- Line 326: 1. **Lifecycle Log** (`docs_dev/amcos-team/agent-lifecycle.log`) — SPAWN, TERMINATE, HIBERNATE, WAKE, TEAM_ADD, TEAM_REMOVE, STATUS_CHANGE, FAILURE, ROLLBACK events. This is an **append-only audit trail** for AMCOS's own accountability. This does NOT exist in AI Maestro.
- Line 328: 2. **Approval Requests Log** (`docs_dev/chief-of-staff/approvals/approval-requests-YYYY-MM.log`) — Tracks approval requests to EAMA, decisions, execution results. The AI Maestro GovernanceRequest API tracks cross-host governance requests; AMCOS's approval log tracks its internal EAMA-based approvals, which are a different layer.
- Line 334: 5. **Agent Registry** (`docs_dev/chief