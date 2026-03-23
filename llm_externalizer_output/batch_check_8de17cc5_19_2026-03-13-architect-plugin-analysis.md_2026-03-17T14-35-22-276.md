# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:22.276Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-architect-plugin-analysis.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-architect-plugin-analysis.md
Line 5: **Plugin**: `ai-maestro-architect-agent` v2.1.3
Line 6: **Location**: `/Users/emanuelesabetta/Code/EMASOFT-ARCHITECT-AGENT/ai-maestro-architect-agent`
Line 7: **Repo**: `https://github.com/Emasoft/ai-maestro-architect-agent`
Line 10: `ai-maestro-architect-agent/`
Line 11: ├── .claude-plugin/plugin.json          # Marketplace manifest (v2.1.3)
Line 12: ├── agents/                             # 6 agent definitions
Line 13: │   ├── amaa-architect-main-agent.md    # Main architect (model: opus)
Line 14: │   ├── amaa-planner.md                 # Planning agent (model: sonnet)
Line 15: │   ├── amaa-documentation-writer.md    # Doc writer (model: opus)
Line 16: │   ├── amaa-api-researcher.md          # API research (model: opus)
Line 17: │   ├── amaa-modularizer-expert.md      # Module decomposition (model: opus)
Line 18: │   └── amaa-cicd-designer.md           # CI/CD design (model: opus)
Line 20: │   ├── amaa-start-planning.md          # /amaa-start-planning
Line 21: │   ├── amaa-add-requirement.md         # /amaa-add-requirement
Line 22: │   ├── amaa-modify-requirement.md      # /amaa-modify-requirement
Line 23: │   └── amaa-remove-requirement.md      # /amaa-remove-requirement
Line 24: ├── hooks/hooks.json                    # 1 hook: Stop (exit blocker)
Line 25: ├── skills/                             # 13 skills × 2 (each has -ops variant) = 26 skill dirs
Line 26: ├── scripts/                            # ~55 Python scripts (mix of plugin-specific + CPV tooling)
Line 27: ├── lib/                                # Shared Python lib (cross_platform, thresholds, report_utils)
Line 28: ├── docs/                               # 4 reference docs (AGENT_OPERATIONS, ROLE_BOUNDARIES, etc.)
Line 29: └── tests/                              # 2 test files
Line 42: 2. Runs `/amaa-start-planning` — creates `.claude/orchestrator-plan-phase.local.md` state file
Line 43: 3. Uses `/amaa-add-requirement`, `/amaa-modify-requirement`, `/amaa-remove-requirement` to track plan items
Line 44: 4. Delegates to sub-agents:
Line 45:    - `amaa-planner` — Creates roadmaps with risk assessments
Line 46:    - `amaa-api-researcher` — Researches external APIs, produces 5-file documentation sets
Line 47:    - `amaa-modularizer-expert` — Decomposes into modules with dependency graphs
Line 48:    - `amaa-cicd-designer` — Designs CI/CD pipelines
Line 49:    - `amaa-documentation-writer` — Writes technical docs using templates (Module Spec, API Contract, ADR)
Line 51: 6. Validation via `amaa_design_validate.py` checks frontmatter compliance
Line 52: 7. Handoff doc created in `docs_dev/design/handoff-{uuid}.md`
Line 54: **Key scripts**:
Line 55: - `amaa_design_create.py` — Create design document from template
Line 56: - `amaa_design_validate.py` — Validate frontmatter compliance
Line 57: - `amaa_design_search.py` — Search by UUID, type, status, keyword
Line 58: - `amaa_design_lifecycle.py` — Manage state transitions
Line 59: - `amaa_design_handoff.py` — Export/sanitize design docs for GitHub issue attachment
Line 60: - `amaa_design_uuid.py` — Generate/validate UUIDs
Line 61: - `amaa_design_transition.py` — Handle state transitions
Line 62: - `amaa_design_version.py` — Version management
Line 63: - `amaa_design_export.py` — Export design documents
Line 64: - `amaa_compile_handoff.py` — Compile handoff packages
Line 65: - `amaa_requirement_analysis.py` — Requirement analysis tooling
Line 71: **Python wrappers**:
Line 72: - `amaa_send_message.py` — Wraps `amp-send` with argparse CLI
Line 73: - `amaa_check_inbox.py` — Wraps `amp-inbox` with filtering/formatting
Line 75: **Compliance with Plugin Abstraction Principle**: **GOOD** — The scripts call `amp-send` and `amp-inbox` CLI commands (Layer 2 scripts), not the AI Maestro API directly. No hardcoded `curl` commands to `localhost:23000`.
Line 77: **Message templates** (defined in `skills/amaa-design-communication-patterns/references/ai-maestro-message-templates.md`):
Line 104: - Verify its role permissions via the AI Maestro governance API
Line 105: - Query the `team-governance` skill for authorization rules
Line 106: - Validate that it has been properly assigned to a team
Line 107: - Check governance approval status before sending handoffs
Line 108: - Use AI Maestro's team/governance endpoints
Line 112: - "PROJECT-LINKED: One AMAA per project"
Line 113: - "AMCOS-ONLY COMMS: Receive work from AMCOS only. Report back to AMCOS only"
Line 114: - "NO TASK ASSIGNMENT: You do NOT assign tasks. That's AMOA's job"
Line 116: **Role boundary docs** (`docs/ROLE_BOUNDARIES.md`, `docs/FULL_PROJECT_WORKFLOW.md`, `docs/TEAM_REGISTRY_SPECIFICATION.md`) define the theoretical hierarchy but are purely informational — no runtime enforcement.
Line 122: | Message templates (`ai-maestro-message-templates.md`) | `ecos` as AMCOS recipient | Hardcodes the AMCOS session name instead of looking it up from team registry |
Line 123: | `AGENT_OPERATIONS.md` | `orchestrator-master` as AMCOS recipient | Different hardcoded name than templates — inconsistency |
Line 124: | `op-send-ai-maestro-message.md` | `orchestrator-master`, `helper-agent-generic`, `amia-integrator-main-agent` | Multiple hardcoded target names |
Line 125: | `amaa_send_message.py` | Falls back to `"architect-agent"` | Hardcoded fallback sender name |
Line 126: | `amaa_check_inbox.py` | Falls back to `"architect-agent"` | Hardcoded fallback sender name |
Line 128: **Critical inconsistency**: The message templates use `ecos` as the AMCOS target, while AGENT_OPERATIONS.md uses `orchestrator-master`. These are two different agents (AMCOS vs AMOA). The templates are correct (AMAA→AMCOS), but AGENT_OPERATIONS.md incorrectly sends to AMOA directly.
Line 134: | Plan state file | `.claude/orchestrator-plan-phase.local.md` |
Line 135: | Session state | `.claude/amaa-session-state.local.md` |
Line 136: | Design index | `docs_dev/design/index.json` |
Line 137: | Team registry | `.ai-maestro/team-registry.json` |
Line 139: ### 5.3 Hardcoded Status Labels
Line 141: `amaa_github_sync_status.py` hardcodes status labels: `status:draft`, `status:review`, `status:approved`, etc. These should