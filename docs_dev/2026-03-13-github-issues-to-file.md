# GitHub Issues to File — Role Plugin Integration

## Repos & Existing Issues

| Repo | Existing Issues |
|------|----------------|
| Emasoft/ai-maestro-chief-of-staff | None |
| Emasoft/ai-maestro-assistant-manager-agent | None |
| Emasoft/ai-maestro-orchestrator-agent | #2 (.agent.toml), #3 (stale docs) |
| Emasoft/ai-maestro-architect-agent | #2 (.agent.toml), #3 (stale docs) |
| Emasoft/ai-maestro-integrator-agent | #2 (.agent.toml), #3 (stale docs) |
| Emasoft/ai-maestro-programmer-agent | #2 (.agent.toml), #3 (stale docs) |
| Emasoft/ai-maestro | None for platform integration |

---

## CHIEF-OF-STAFF Issues

### COS-1: Missing .agent.toml and quad-match naming
Same pattern as #2 on other repos. Create `.agent.toml` at repo root. Rename main agent from `amcos-chief-of-staff-main-agent.md` to follow quad-match rule.

### COS-2: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
Same pattern as #3 on other repos. Update docs to use current governance naming and team-scoped CoS model.

### COS-3: Plugin Abstraction Principle violations — direct API calls in scripts
Multiple scripts make direct `urllib`/`curl` calls to the AI Maestro REST API instead of using Layer 2 wrapper scripts:
- `amcos_team_registry.py` — direct urllib to `/api/teams/*`
- `amcos_approval_manager.py` — direct urllib to `/api/v1/governance/requests`
- `amcos_heartbeat_check.py` — direct urllib to AI Maestro API
- `amcos_notify_agent.py` — curl for agent resolution via `/api/agents`
- `amcos_generate_team_report.py` — direct API calls
- Several skill reference docs contain embedded `curl` commands (amcos-failure-detection, amcos-recovery-execution, amcos-agent-replacement, amcos-agent-termination)
- `amcos-request-approval` command embeds API endpoint syntax (`POST /api/v1/governance/requests`)

Fix: Replace all direct API calls with `aimaestro-agent.sh`, `amp-send.sh`, `amp-inbox.sh`, or reference the `team-governance` skill. Remove embedded curl/API syntax from skills and commands.

### COS-4: Hardcoded governance rules — should discover at runtime from team-governance skill
- `amcos_team_registry.py` hardcodes `RoleConstraint` (min/max per role, required plugin name)
- `thresholds.py` hardcodes `VALID_ROLES` (missing "programmer"!) and `ROLE_PREFIX_MAP` (missing "epa-")
- `ROLE_BOUNDARIES.md` hardcodes the 3-role governance model
- `TEAM_REGISTRY_SPECIFICATION.md` hardcodes the 8-column kanban system
- `amcos_approval_manager.py:585` hardcodes manager session name as `ai-maestro-assistant-manager-agent`
- Hardcoded agent naming patterns inconsistent across docs (amcos-orch- vs eoa-orchestrator-main-agent)

Fix: Reference the `team-governance` skill for governance rules. Fix `thresholds.py` to include programmer role. Resolve dynamically instead of hardcoding session names.

### COS-5: Kanban column mismatch (8 vs 5) and missing AI Maestro task system integration
AMCOS's TEAM_REGISTRY_SPECIFICATION.md documents 8 kanban columns (backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked) but AI Maestro's actual task system has 5 statuses (backlog, pending, in_progress, review, completed). These are incompatible.

Additionally, AMCOS has no integration with Haephestos v2 for agent creation — it creates agents via hardcoded plugin-to-role mappings and `aimaestro-agent.sh` without .agent.toml support.

Fix: Align kanban columns with AI Maestro's task system. Add Haephestos/`.agent.toml` integration for agent creation.

---

## ASSISTANT-MANAGER Issues

### AMAMA-1: Missing .agent.toml and quad-match naming
Same pattern as #2 on other repos.

### AMAMA-2: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
Same pattern as #3 on other repos.

### AMAMA-3: Plugin Abstraction Principle violations — 50+ embedded curl commands
CRITICAL: `spawn-failure-recovery.md` contains 15+ hardcoded `http://localhost:23000` URLs. ~50 embedded `curl` commands across skill reference docs:
- `amama-approval-workflows/references/api-endpoints.md` (6 curl)
- `amama-amcos-coordination/references/creating-amcos-procedure.md` (8 curl)
- `amama-amcos-coordination/references/workflow-checklists.md` (4 curl)
- `amama-amcos-coordination/references/spawn-failure-recovery.md` (15+ curl)
- `amama-amcos-coordination/references/creating-amcos-instance.md` (3 curl)
- `amama-status-reporting/references/api-endpoints.md` (8 curl)
- `amama-session-memory/references/handoff-format.md` (1 curl)
- `amama-session-memory/references/memory-triggers.md` (2 curl)
- `amama-session-memory/references/examples.md` (3 curl)
- `amama-approval-workflows/references/examples.md` (5 curl)
- `amama-approval-workflows/references/expiry-workflow.md` (2 curl)
- `amama-approval-workflows/references/governance-password.md` (1 curl)

Also references 5+ non-existent API endpoints: `/api/health`, `/api/memory/store`, `/api/memory/search`, `/api/agents/health`, `/api/agents?status=available`.

Fix: Replace all embedded curl/API syntax with references to `team-governance` skill (for governance/team operations) and `agent-messaging` skill (for messaging). Fix non-existent endpoint references.

### AMAMA-4: Missing team-governance skill dependency
AMAMA declares dependency on `ai-maestro-agents-management` and `agent-messaging` skills but NOT `team-governance`. Despite being the manager role that performs governance operations, it does NOT reference the `team-governance` skill which is the canonical reference for Team CRUD, COS assignment, governance request handling, and auth headers.

Fix: Add `team-governance` as external dependency. Replace embedded API syntax in skills with references to this skill.

### AMAMA-5: Kanban column mismatch (8 vs 5) and session naming convention
`AGENT_OPERATIONS.md` documents 8 kanban columns but AI Maestro has 5 statuses. `shared/message_templates.md` defines session name patterns like `amama-{project}-session` but AI Maestro uses `domain-subdomain-name` format.

Fix: Align kanban columns and session naming conventions with AI Maestro.

---

## ORCHESTRATOR Issues (add to existing #2, #3)

### AMOA-4: Plugin Abstraction Principle violations — 2 scripts with direct API calls
Two scripts call the AI Maestro API directly via curl instead of using AMP wrapper scripts:
- `amoa_notify_agent.py` (line 48: `DEFAULT_API_URL = "http://localhost:23000"`, line 87: `POST /api/messages`)
- `amoa_confirm_replacement.py` (lines 68, 162, 387: direct GET/POST to `/api/messages`, hardcodes `DEFAULT_AMCOS_SESSION = "amcos-controller"`)

Fix: Replace direct curl with `amp-send.sh` and `amp-inbox.sh`. Remove hardcoded API URLs and session names.

### AMOA-5: No governance API integration — all role boundaries hardcoded
Zero governance integration. The word "governance" appears exactly once in the entire plugin. Role boundaries are enforced through documentation only (`docs/ROLE_BOUNDARIES.md`). No runtime checks via AI Maestro's governance API. Team structure, cardinality rules, and organization agent names are all hardcoded.

Fix: Reference `team-governance` skill. Discover governance rules at runtime. Verify role permissions via governance API for sensitive operations.

### AMOA-6: No AI Maestro kanban/task API integration — GitHub Projects only
CRITICAL: AMOA uses GitHub Projects V2 exclusively for its 8-column kanban (backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked). It does NOT use AI Maestro's built-in task management API (`/api/teams/{id}/tasks`).

Impact: Tasks on the AI Maestro dashboard kanban are disconnected from AMOA's GitHub kanban. Dashboard shows empty kanban for teams managed by AMOA. No way to view AMOA's task state without going to GitHub.

Required: AMOA should sync its GitHub Project state to AI Maestro's task API. Status mapping needed (8 GitHub columns -> AI Maestro statuses). The `amoa_sync_kanban.py` already syncs to GitHub — add reverse sync to AI Maestro.

Fix: Add bidirectional sync between GitHub Projects and AI Maestro task API. Use AI Maestro as the authoritative task store (or at least keep them in sync). Align column definitions.

---

## ARCHITECT Issues (add to existing #2, #3)

### AMAA-4: No governance API integration — hardcoded role boundaries
No governance integration at all. Does not use `team-governance` skill, governance API endpoints, or runtime permission checks. Role boundaries are purely instructional (agent markdown + docs). Communication hierarchy is hardcoded.

Critical inconsistency: Message templates use `ecos` as AMCOS recipient, but AGENT_OPERATIONS.md uses `orchestrator-master` (wrong agent!). Multiple hardcoded target names in `op-send-ai-maestro-message.md`.

Fix: Reference `team-governance` skill. Look up AMCOS dynamically from team registry API. Remove hardcoded recipient names. Add governance checks on startup.

### AMAA-5: Kanban column mismatch and duplicate role docs
Both `AGENT_OPERATIONS.md` and `FULL_PROJECT_WORKFLOW.md` hardcode an 8-column kanban system that doesn't match AI Maestro's actual 5-status system. Status labels are hardcoded in `amaa_github_sync_status.py`.

Additionally, `ROLE_BOUNDARIES.md` and `FULL_PROJECT_WORKFLOW.md` duplicate information that should come from AI Maestro's `team-governance` skill. These will inevitably drift.

Fix: Align kanban columns with AI Maestro. Mark role docs as "local copy — authoritative source is team-governance skill" or remove them.

### AMAA-6: Separate memory system — should integrate with AI Maestro subconscious
AMAA has its own session memory system (`.claude/amaa-session-state.local.md`, `docs_dev/design/index.json`) completely separate from AI Maestro's CozoDB memory. Stop hook blocks exit but doesn't notify AMCOS via AMP.

Fix: Evaluate integrating with AI Maestro's subconscious memory. Add AMP notification when stop hook blocks exit.

---

## INTEGRATOR Issues (add to existing #2, #3)

### AMIA-4: Plugin Abstraction Principle violations — direct API calls + embedded curl in docs
- `ci_webhook_handler.py` (line 41: hardcodes `http://localhost:23000`, line 72: direct POST to `/api/messages`)
- `amia_kanban_sync.py` (imports from `aimaestro_notify` which wraps direct API)
- `phase-procedures.md` (lines 95, 145: "Execute curl POST to AI Maestro API")

Fix: Replace `ci_webhook_handler.py` direct calls with `amp-send.sh`. Update `phase-procedures.md` to reference `agent-messaging` skill instead of describing direct curl.

### AMIA-5: No governance API integration — no team-governance skill reference
Plugin does not reference `team-governance` skill at all. All role boundaries are hardcoded in agent `.md` files and `docs/ROLE_BOUNDARIES.md`. No runtime governance enforcement. No governance request flow for sensitive operations (merge to main, release tagging).

Fix: Reference `team-governance` skill for runtime governance discovery. Add governance approval checks before merge and release operations.

### AMIA-6: Kanban mismatch + no AI Maestro task system integration
Plugin has own file-based task tracking (`docs_dev/integration/status/`) but does NOT use AI Maestro's task system (`/api/teams/{id}/tasks`). References 8-column kanban system that doesn't exist in AI Maestro. The kanban sync skill syncs with GitHub Projects but NOT with AI Maestro's internal kanban.

Fix: Integrate with AI Maestro's task API. Report integration results as task status updates. Align kanban columns.

---

## PROGRAMMER Issues (add to existing #2, #3)

### AMPA-4: Plugin Abstraction Principle violation — hardcoded localhost in skill
`skills/ampa-handoff-management/SKILL.md` (lines 24, 56) hardcodes `localhost:23000` and `curl -s "http://localhost:23000/api/health"`. References non-existent `/api/health` endpoint (AI Maestro uses `/api/sessions` for health).

Fix: Remove hardcoded URL. Replace `/api/health` reference with correct endpoint or reference `agent-messaging` skill's connectivity check.

### AMPA-5: Kanban column mismatch — 8 columns documented, AI Maestro has 5
All 4 shared docs (AGENT_OPERATIONS.md, FULL_PROJECT_WORKFLOW.md, ROLE_BOUNDARIES.md, TEAM_REGISTRY_SPECIFICATION.md) document 8-column kanban system (backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked). AI Maestro has 5 statuses (backlog, pending, in_progress, review, completed). AMPA will reference non-existent columns.

Additionally, AMPA has no hooks defined (empty hooks.json) — could benefit from auto-inbox-check hook.

Fix: Update docs to reflect AI Maestro's actual task statuses. Consider adding session-start hook for auto-inbox-check.

### AMPA-6: No task read-back — cannot verify kanban assignments
AMPA receives tasks only through AMP messages. It cannot verify its assignments by reading AI Maestro's kanban board. If AMOA assigns a task on the kanban but forgets to send an AMP message, the task is invisible to AMPA. Task ID format is also mismatched (free-form strings vs AI Maestro UUIDs).

Fix: Add read-only access to AI Maestro's task API (`GET /api/teams/{id}/tasks?assignee={agentId}`) so AMPA can verify its assignments. Standardize task ID format.

---

## AI MAESTRO Platform Issues

### AIM-1: Extended Task Model — add labels, types, due dates, attachments, sub-tasks
Current task model has only: id, teamId, subject, description, status, assigneeAgentId, blockedBy, priority, timestamps.

Missing fields needed for role plugin integration:
- `labels: string[]` — tags/labels for filtering
- `taskType?: string` — feature, bug, chore, epic
- `dueDate?: string` — ISO date deadline
- `estimate?: number` — story points or hours
- `attachments?: string[]` — file paths or URLs to design docs
- `parentTaskId?: string | null` — for sub-tasks
- `externalRef?: string` — link to GitHub issue/PR

Also needed: Task filtering API (`GET /api/teams/{id}/tasks?assignee=X&label=Y&type=Z&status=W`), bulk task creation endpoint.

### AIM-2: Configurable Kanban Columns — per-team column configuration
Current kanban has 5 hardcoded statuses. Role plugins need 8 columns (at minimum, the orchestrator uses: backlog, todo, in-progress, ai-review, human-review, merge-release, done, blocked). GitHub Projects supports unlimited custom columns.

Solution: Add `TeamKanbanConfig` — per-team column configuration with:
- Configurable column list (id, label, color, icon)
- Column-level permissions (e.g., only manager can approve Feature Requests)
- Default column for new tasks
- Status mapping for backward compatibility

UI changes: TaskKanbanBoard reads columns from config instead of hardcoded array. Support arbitrary number of columns.

### AIM-3: Haephestos v2 completion — archive v1 legacy code
Phase A is ~75% complete but v1 legacy code blocks completion:
- `services/creation-helper-service.ts` (698 LOC) — dead terminal parsing code
- `components/AgentCreationHelper.tsx` (931 LOC) — dead v1 custom chat UI
- `app/api/agents/creation-helper/session/route.ts` — v1 session management
- `app/api/agents/creation-helper/chat/route.ts` — v1 message relay
- `app/api/agents/creation-helper/response/route.ts` — v1 response capture
- `tests/services/creation-helper-service.test.ts` — tests for dead service
- `components/AgentList.tsx` — remove `showAdvancedCreateModal` state and `AgentCreationHelper` import
- `services/headless-router.ts` — remove v1 route registrations

### AIM-4: Simple Wizard role selection — 5 predefined roles with plugin installation
AgentCreationWizard needs a role selection step (Phase B):
- Add 5 role buttons: Chief-of-Staff, Architect, Orchestrator, Integrator, Programmer
- When a role is selected, create agent with corresponding role plugin pre-installed
- Create .agent.toml templates for each predefined role
- Add auto-staffing dialog when team created with no agents
