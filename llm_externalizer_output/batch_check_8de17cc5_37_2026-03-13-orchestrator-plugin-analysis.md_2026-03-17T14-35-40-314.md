# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:35:40.314Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-orchestrator-plugin-analysis.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/2026-03-13-orchestrator-plugin-analysis.md
Line 1: # Orchestrator Plugin (AMOA) -- AI Maestro Integration Analysis
Line 2: **Date**: 2026-03-13
Line 3: **Plugin**: `ai-maestro-orchestrator-agent` v1.5.3
Line 4: **Location**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/`
Line 5: **Scope**: Research-only analysis of all integration points with AI Maestro
Line 7: ## Table of Contents
Line 10: 7. [Gaps: What AI Maestro Features AMOA Should Use But Doesn't](#7-gaps-what-ai-maestro-features-amoa-should-use-but-doesnt)
Line 29: AMOA is project-linked (one per project), receives work from AMCOS, distributes to implementers, reports back to AMCOS.
Line 49: ### 2.2 AI Maestro's Kanban System: File-Based Task Registry
Line 51: AI Maestro has its own built-in kanban with a **5-status system** stored in `~/.aimaestro/teams/tasks-{teamId}.json`.
Line 70: **Task fields (AI Maestro):**
Line 88: ### 2.3 Comparison: AMOA vs AI Maestro Kanban
Line 90: | Dimension | AMOA (GitHub Projects) | AI Maestro (Built-in) |
Line 91: |-----------|----------------------|----------------------|
Line 92: | **Storage** | GitHub Projects V2 API | JSON files on disk |
Line 93: | **Columns/Statuses** | 8 columns | 5 statuses |
Line 94: | **Missing in AI Maestro** | AI Review, Human Review, Merge/Release, Blocked | -- |
Line 95: | **Missing in AMOA** | -- | Pending (separate from Backlog) |
Line 96: | **Task Identity** | GitHub Issue # | UUID |
Line 97: | **Assignment** | GitHub labels (`assign:*`) + assignee | `assigneeAgentId` |
Line 98: | **Dependencies** | Issue references + state files | `blockedBy` array with cycle detection |
Line 99: | **Labels** | Rich taxonomy (status, priority, type, component, effort, platform, toolchain, review) | None (only status + priority number) |
Line 100: | **Integration** | Needs `gh` CLI + OAuth scopes | Native REST API |
Line 101: | **Visibility** | Public GitHub board | Dashboard UI only |
Line 102: | **Sync** | Manual script (`amoa_sync_kanban.py`) | Real-time via polling (5s) |
Line 104: **Critical gap:** AMOA does not use AI Maestro's kanban API at all. It has a completely independent task management system on GitHub Projects.
Line 108: **A. Via the `agent-messaging` skill (recommended in docs/skills)**
Line 109: The plugin extensively references the `agent-messaging` skill (the global AI Maestro skill) for natural-language messaging. This is the **correct abstraction layer** per the Plugin Abstraction Principle. Found in:
Line 114: **B. Via direct API calls (VIOLATION of Plugin Abstraction Principle)**
Line 116: 1. **`scripts/amoa_notify_agent.py`** -- Calls `POST {AIMAESTRO_API}/api/messages` directly via curl subprocess
Line 117:    - Hardcodes `DEFAULT_API_URL = "http://localhost:23000"`
Line 118:    - Falls back to `AIMAESTRO_API` env var
Line 122: 2. **`scripts/amoa_confirm_replacement.py`** -- Calls both:
Line 123:    - `GET {AIMAESTRO_API}/api/messages?agent={agent}&action=list&status=unread` (read inbox)
Line 124:    - `POST {AIMAESTRO_API}/api/messages` (send message)
Line 125:    - Hardcodes `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")`
Line 127: **These two scripts violate the Plugin Abstraction Principle** which states: "Plugin hooks/scripts MUST NOT call the API directly. They call globally-installed AI Maestro scripts (`amp-send.sh`, `amp-inbox.sh`, etc.)."
Line 158: **No.** The plugin does NOT use the globally-installed AMP scripts (`amp-send.sh`, `amp-inbox.sh`, `amp-read.sh`). The two scripts that need programmatic messaging call the API directly via curl. The rest of the plugin relies on the `agent-messaging` skill (which is correct for agent-level messaging in natural language context).
Line 164: - No references to `/api/governance` endpoints
Line 165: - No role permission checks via the governance API
Line 166: - No team membership validation via governance
Line 167: - The word "governance" appears exactly once in the entire plugin, in a generic reference to "audit and governance requirements" in an archive structure doc
Line 175: These rules are **duplicated as static text** in the plugin, not queried from AI Maestro's governance API at runtime.
Line 196: ### 5.2 References to AI Maestro Agent Management
Line 197: AMOA references the `ai-maestro-agents-management` skill (the global skill) in 10 places:
Line 203: This is the **correct abstraction** per the Plugin Abstraction Principle -- referencing the global skill rather than embedding API calls.
Line 206: AMOA maintains its own agent state in local files:
Line 207: - `.claude/orchestrator-exec-phase.local.md` -- YAML frontmatter with registered agents, assignments, verification status
Line 208: - `.ai-maestro/orchestration-state.json` -- JSON state for replacement workflow
Line 209: - `.ai-maestro/team-registry.json` -- Team contacts (expected to be git-tracked in the project repo)
Line 211: This is **separate from** AI Maestro's agent registry (`~/.aimaestro/agents/registry.json`).
Line 217: All other API references use `AIMAESTRO_API` env var or delegate to the `agent-messaging` skill.
Line 230: The entire role boundary matrix is hardcoded in `docs/ROLE_BOUNDARIES.md` and repeated across multiple agent definitions and skill references. These are **static text**, not dynamically queried.
Line 245: ### 7. Gaps: What AI Maestro Features AMOA Should Use But Doesn't
Line 248: **Gap**: AMOA uses GitHub Projects V2 exclusively for kanban. It does NOT use AI Maestro's built-in task management API (`/api/teams/{id}/tasks`).
Line 250: **Impact**:
Line 251: - Tasks on the AI Maestro dashboard kanban board are completely disconnected from AMOA's GitHub kanban
Line 252: - The dashboard shows empty kanban for teams managed by AMOA
Line 253: - No way to view AMOA's task state from the dashboard without going to GitHub
Line 254: - Dependency tracking is duplicated (AI Maestro has `blockedBy` + cycle detection; AMOA uses issue references)
Line 256: **Recommendation**: AMOA should **sync** its GitHub Project state to AI Maestro's task API, or use AI Maestro as the authoritative task store and sync TO GitHub Projects. The `amoa_sync_kanban.py` script already syncs modules to GitHub -- a reverse sync to AI Maestro would close this gap.
Line 260: **Status mapping needed:**
Line 262: | AMOA Column | AI Maestro Status |
Line 263: |-------------|-------------------|
Line 264: | backlog | `backlog` |
Line 265: | todo | `pending` |
Line 266: | in-progress | `in_progress` |
Line 267: | ai-review | `review` |
Line 268: | human-review |