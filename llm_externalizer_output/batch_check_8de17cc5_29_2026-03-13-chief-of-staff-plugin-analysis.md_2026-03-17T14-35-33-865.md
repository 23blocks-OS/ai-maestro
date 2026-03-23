# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:33.865Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-chief-of-staff-plugin-analysis.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-chief-of-staff-plugin-analysis.md
Line 13: Plugin: `ai-maestro-chief-of-staff` v2.10.2
Line 14: Location: `/Users/emanuelesabetta/Code/EMASOFT-CHIEF-OF-STAFF/ai-maestro-chief-of-staff`
Line 15: Repository: `https://github.com/Emasoft/ai-maestro-chief-of-staff`
Line 46: AMCOS creates agents via `aimaestro-agent.sh` CLI (the `ai-maestro-agents-management` skill wrapper). The flow is:
Line 50: **Plugin install** -- copies plugin from `~/.claude/plugins/cache/ai-maestro/<plugin>/<version>/` to `~/agents/<session>/.claude/plugins/<plugin>/`
Line 52: **Agent creation** -- calls `aimaestro-agent.sh create <name> --dir <path> --task <desc> -- --dangerously-skip-permissions --chrome --add-dir /tmp --plugin-dir <path> --agent <agent-name>`
Line 60: # TODO: Migrate to AI Maestro REST API (POST /api/agents/register, etc.)
Line 61: # Current implementation uses ai-maestro-agents-management skill
Line 83: Similarly, `amcos_approval_manager.py`, `amcos_heartbeat_check.py`, `amcos_notify_agent.py`, and `amcos_generate_team_report.py` all make direct HTTP calls to the AI Maestro API.
Line 97: - **`amcos_approval_manager.py` sends AMP to hardcoded recipient** -- at line 585: `to="ai-maestro-assistant-manager-agent"`. This is a hardcoded session name assumption. The actual manager's session name should be discovered dynamically.
Line 115: - **`/api/v1/governance/requests` endpoint path is hardcoded** in `amcos_approval_manager.py` as `GOVERNANCE_API_PATH = "/api/v1/governance/requests"`. If the AI Maestro governance API version changes, this breaks.
Line 160: All scripts use `$AIMAESTRO_API` env var with `http://localhost:23000` fallback. This is acceptable but the direct API calls themselves violate the abstraction principle.
Line 175: - `amcos_approval_manager.py:585` sends to `"ai-maestro-assistant-manager-agent"` (hardcoded manager name)
Line 185: AMCOS has no concept of `.agent.toml` profiles or the Haephestos creation flow. It creates agents using hardcoded plugin-to-role mappings and `aimaestro-agent.sh`. It should integrate with the Role-Plugin system where `.agent.toml` defines the agent persona and gets converted to a plugin.
Line 192: - `amcos_team_registry.py` -- should use a future `aimaestro-team.sh` or delegate to the `team-governance` skill
Line 194: - `amcos_heartbeat_check.py` -- should use `aimaestro-agent.sh` health check
Line 195: - `amcos_notify_agent.py` -- uses `curl` for agent resolution instead of `aimaestro-agent.sh`
Line 204: The `amcos_spawn_agent.py` and `amcos_terminate_agent.py` scripts contain a TODO to migrate from `aimaestro-agent.sh` CLI to the REST API (`POST /api/agents/register`). However, per the Plugin Abstraction Principle, they should keep using the CLI wrapper -- not migrate to direct API calls. The TODO is misleading.
Line 208: AI Maestro has a `GET /api/teams/stats/` endpoint. AMCOS does not use it for its resource monitoring or performance reporting -- it uses manual file-based state tracking instead.
Line 212: AMCOS has its own memory management (`amcos_memory_manager.py`, `amcos_memory_operations.py`, `amcos_snapshot_memory.py`) with session memory, context management, and progress tracking. It does NOT use AI Maestro's built-in subconscious/CozoDB memory system. This is a parallel implementation that may conflict.
Line 216: AMCOS uses heartbeat polling (`amcos_heartbeat_check.py`) to detect agent health, running on every `UserPromptSubmit` hook. AI Maestro has a push notification system that sends instant tmux notifications when messages arrive. AMCOS should leverage this instead of polling.
Line 224: Direct API calls in scripts | `amcos_team_registry.py`, `amcos_approval_manager.py`, `amcos_heartbeat_check.py`, `amcos_notify_agent.py`, `amcos_generate_team_report.py` | Layer 2: scripts MUST NOT call API directly
Line 254: The doc says EAMA is "1 per organization" but the team registry naming shows `eama-assistant-manager` as a fixed entity. It is unclear how multiple EAMA instances would work in a multi-team scenario.
Line 271: 4. **Parallel memory system** -- Own memory management conflicts with AI Maestro's subconscious
Line 282: 1. **Remove all direct API calls from scripts** -- Replace `urllib` calls in `amcos_team_registry.py`, `amcos_approval_manager.py`, etc. with calls to `aimaestro-agent.sh`, `amp-send.sh`, or future `aimaestro-team.sh` wrappers
Line 290: 6. **Fix hardcoded manager session name** -- Resolve dynamically via team registry or discovery
Line 296: 8. **Evaluate memory system overlap** -- Determine if AMCOS memory should delegate to AI Maestro's subconscious
Line 299: 9. **Use push notifications** -- Replace heartbeat polling with AI Maestro's tmux push notification system
Line 302: 11. **Use `/api/teams/stats/`** -- Leverage existing stats endpoint for resource monitoring
```