# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:40:44.606Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-orchestrator-agent-2026-03-10.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/plugin-governance-audit-orchestrator-agent-2026-03-10.md
Line 1: # Plugin Governance Audit: ai-maestro-orchestrator-agent
Line 2: **Date**: 2026-03-10
Line 3: **Repo**: https://github.com/Emasoft/ai-maestro-orchestrator-agent
Line 5: **Auditor**: Claude Code (automated audit)
Line 6: **Reference standard**: docs/PLUGIN-ABSTRACTION-PRINCIPLE.md in ai-maestro repo
Line 9: The plugin is a large, mature orchestration agent with 16 skills, 15 commands, 6 agents, and 4 hooks. The majority of the plugin follows the Plugin Abstraction Principle correctly: skills reference the `agent-messaging` skill by name instead of embedding curl syntax, hooks trigger Python scripts (not raw API calls), and governance rules are not hardcoded.
Line 12: However, there are **3 confirmed violations** of the Plugin Abstraction Principle that require fixes:
Line 14: 1. **Rule 2 (CRITICAL)**: Two Python scripts call the AI Maestro API directly with curl, bypassing the official `amp-send.sh` / `amp-inbox.sh` abstraction layer.
Line 15: 2. **Rule 1 (MINOR)**: One SKILL.md file embeds a hardcoded `http://localhost:23000` URL in its prerequisites section.
Line 16: 3. **Rule 4 (MINOR)**: `plugin.json` declares the AI Maestro dependency in prose but does not use a structured `dependencies` field.
Line 18: No hardcoded governance rules, permission matrices, or role restriction tables were found in skills or commands.
Line 24: AI Maestro running (`http://localhost:23000`), GitHub CLI (`gh`) authenticated.
Line 26: This hardcodes the AI Maestro API base URL directly in a skill file's Prerequisites section. Per the Plugin Abstraction Principle, skills must not embed endpoint URLs, curl commands, or HTTP syntax. The URL is the provider's internal address and will break if the port or host changes.
Line 32: Generic examples in changelog/tutorial reference files (not AI Maestro API calls): `skills/amoa-orchestration-patterns/references/changelog-writing-guidelines.md`, `skills/amoa-orchestration-patterns/references/orchestrator-no-implementation.md`, `skills/amoa-orchestration-patterns/references/orchestrator-guardrails-part3-scenarios.md`
Line 34: Third-party tool installation instructions (Rust, bun, uv, Go linter): multiple files under `skills/amoa-remote-agent-coordinator/templates/toolchain/` and `references/`
Line 35: Docker health-check examples targeting project-specific services (not the AI Maestro API): `skills/amoa-verification-patterns/references/docker-troubleshooting.md`
Line 36: The `localhost` references in `skills/amoa-verification-patterns/` refer to user project services, not AI Maestro
Line 38: All messaging operations in skill files correctly reference the `agent-messaging` skill by name:
Line 40: # Use the agent-messaging skill to send messages.
Line 41: This pattern appears across 70+ locations and is fully compliant.
Line 46: This script directly calls the AI Maestro API at `http://localhost:23000/api/messages` using `subprocess.run(["curl", ...])`.
Line 50: DEFAULT_API_URL = "http://localhost:23000"
Line 56: Impact: This bypasses `amp-send.sh`. If the AI Maestro API endpoint, port, or authentication scheme changes, this script silently breaks without the update propagating from the official AMP abstraction layer.
Line 64: AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")
Line 75: Impact: Same as Violation 1. Both operations (inbox polling and message sending) have official AMP script equivalents: `amp-inbox.sh` and `amp-send.sh`.
Line 79: Hooks (`hooks/hooks.json`) trigger only internal Python scripts (`amoa_stop_check/main.py`, `amoa_check_verification_status.py`, `amoa_check_polling_due.py`, `amoa_file_tracker.py`). None of these were found to call the AI Maestro API directly.
Line 82: Uses `curl` only for generic file downloads from arbitrary URLs (not the AI Maestro API). This is **not a violation**.
Line 90: The plugin correctly references AMCOS, AMAMA, and AMOA roles by name as coordination roles, but does not define the permission matrix for those roles inline. Governance authority is deferred to the AI Maestro `team-governance` skill which is loaded at runtime.
Line 98: description: "Task distribution, agent coordination, progress monitoring - executes plans via subagents. Requires AI Maestro for inter-agent messaging.",
Line 101: Positive: The description text states "Requires AI Maestro for inter-agent messaging."
Line 104: - `agent-messaging` (the global AI Maestro skill this plugin relies on)
Line 107: This means automated dependency resolution (if implemented in the marketplace) would have no machine-readable declaration to work from.
Line 109: The README correctly lists "AI Maestro messaging system for inter-agent communication" as a requirement and mentions the `agent-messaging` skill is used throughout. This is good documentation but does not substitute for a structured `dependencies` field in the manifest.
Line 119: V1 | Rule 1 | Minor | `skills/amoa-orchestration-patterns/SKILL.md` | 85 | Hardcoded `http://localhost:23000` URL in Prerequisites |
Line 120: V2 | Rule 2 | Critical | `scripts/amoa_notify_agent.py` | 48, 87–119 | Direct curl call to `/api/messages` bypassing `amp-send.sh` |
Line 121: V3 | Rule 2 | Critical | `scripts/amoa_confirm_replacement.py` | 68, 159–165, 384–393 | Direct curl calls to `/api/messages` bypassing `amp-send.sh`/`amp-inbox.sh` |
Line 122: V4 | Rule 4 | Minor | `.claude-plugin/plugin.json` | whole file | No structured `dependencies` field; dependency on `agent-messaging` skill only declared in description prose |
Line 128: AI Maestro running (`http://localhost:23000`), GitHub CLI (`gh`) authenticated.
Line 132: AI Maestro running and accessible (check `$AIMAESTRO_API` or default port), GitHub CLI (`gh`) authenticated.
Line 136: AI Maestro installed and running, GitHub CLI (`gh`) authenticated.
Line 138: Never embed specific URL/port in skill files.
Line 149: return False, "amp-send.sh not found -- install AI Maestro AMP scripts"
Line 153: Note: `amp-send.sh` may need `--priority` and `--type` flags added if the official script supports them. Check `~/.local/bin/amp-send.sh` usage.
Line 155: Alternatively, if the script must remain Python-only (e.g. for portability), it should at minimum read the API URL exclusively from `$AIMAESTRO_API` without any hardcoded fallback to `localhost:23000`, and the calling convention should be documented as requiring that env var to be set.
Line 177: Adjust version floor to match the minimum AI Maestro version where AMP was introduced.
Line 183: Skills reference `agent-messaging` by name: All 70+ messaging operations in skills use the pattern `# Use the agent-messaging skill to send messages.` — fully compliant with Rule 1.
Line 190: No hardcoded governance rules: The plugin correctly treats governance authority as externally defined, delegating to AMCOS without embedding permission tables.
Line 192: `op-send-message.md` and `op-check-inbox.md` are model examples