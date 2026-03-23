# Integrator Plugin (ai-maestro-integrator-agent) - Full Analysis

**Date**: 2026-03-13
**Version Analyzed**: 1.1.17
**Location**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent`
**Repo**: `https://github.com/Emasoft/ai-maestro-integrator-agent`

---

## 1. Plugin Overview

The Integrator Agent (AMIA) is the **quality gatekeeper** in the Emasoft agent hierarchy. It handles:

- PR code review (two-stage gates: spec compliance + quality)
- Quality gate enforcement (TDD, tests, coverage, linting, type checks, security)
- Branch protection (blocking direct pushes to main/master)
- Issue closure gates (merged PR + checkboxes + evidence + TDD)
- Release management (version bumping, changelogs, tagging)
- CI/CD failure diagnosis and debugging
- GitHub Projects V2 synchronization
- Post-merge integration verification

### Architecture

- **1 main agent** (`amia-integrator-main-agent.md`) -- orchestrator type, Opus model
- **10 sub-agents** -- specialized workers (Sonnet model), each read-only evaluators or task agents
- **20 skills** -- progressive discovery pattern (SKILL.md < 4000 chars + `references/` for details)
- **3 hooks** -- PreToolUse (branch protection, issue closure gate) + Stop (incomplete work check)
- **60+ Python scripts** -- all support `--output-file` for token-efficient output
- **4 docs** -- AGENT_OPERATIONS, ROLE_BOUNDARIES, FULL_PROJECT_WORKFLOW, TEAM_REGISTRY_SPECIFICATION
- **Shared module** -- `shared/thresholds.py` (timeouts, GitHub thresholds, output helpers)

---

## 2. Integration Workflow -- How It Merges Work from Multiple Agents

### 5-Phase Integration Pipeline

1. **Request Reception** -- Checks AI Maestro inbox for messages from AMOA (Orchestrator). Parses request type (PR_REVIEW, CI_FIX, CODE_REVIEW, TESTING, RELEASE, ISSUE_CLOSURE).
2. **Routing Decision** -- Routes to appropriate sub-agent based on task category (see routing table below). Creates status tracking file.
3. **Delegation** -- Sends task to sub-agent via AI Maestro messaging. Waits for acknowledgment (30s timeout).
4. **Monitor Completion** -- Polls inbox for sub-agent response. Validates `[DONE/FAILED]` format. Updates status file.
5. **Report to AMOA** -- Sends minimal status report (under 5 lines) back to orchestrator. Escalates blockers with urgency.

### Sub-Agent Routing Table

| Task | Sub-Agent | Model |
|------|-----------|-------|
| GitHub API operations | `amia-api-coordinator` | Sonnet |
| Code quality review | `amia-code-reviewer` | Opus |
| PR readiness evaluation | `amia-pr-evaluator` | Opus |
| Post-merge integration testing | `amia-integration-verifier` | Sonnet |
| Bug/CI failure investigation | `amia-bug-investigator` | Sonnet |
| GitHub sync / git write ops | `amia-github-sync` | Sonnet |
| Git commits with metadata | `amia-committer` | Sonnet |
| Visual regression analysis | `amia-screenshot-analyzer` | Sonnet |
| Complex CI/CD debugging | `amia-debug-specialist` | Sonnet |
| TDD enforcement / test coverage | `amia-test-engineer` | Sonnet |

### Record Keeping

- **Routing log**: `docs_dev/integration/routing-log.md` -- all routing decisions with timestamps
- **Status files**: `docs_dev/integration/status/[task-id].md` -- per-task lifecycle tracking
- **Quality reports**: `docs_dev/integration/reports/[task-id]-report.md` -- detailed findings

---

## 3. PR Management

### PR Creation/Review

AMIA does NOT create PRs (that is the implementer agent's job). AMIA **reviews** PRs using a multi-gate system:

1. **Gate 0**: Requirement Compliance -- verifies PR implements what USER_REQUIREMENTS.md specifies
2. **Gate 0.5**: TDD Compliance -- verifies RED-GREEN-REFACTOR commit sequence in git history
3. **Gate 1**: Comprehensive Test Execution -- runs pytest, lint, type checks
4. **Gate 2**: Quality and Security Checks -- coverage thresholds, security scanning
5. **Gate 3**: Build Verification -- ensures the project builds cleanly

### PR Evaluation Flow

- `amia-pr-evaluator` runs tests in **isolated environments** (git worktree or Docker container)
- `amia-code-reviewer` performs two-stage gate analysis (8-dimension quality review)
- Evidence-based decisions: every finding must include test name, expected vs actual, stack traces
- Verdicts: APPROVE, REQUEST CHANGES, REJECT

### PR Merge

- `amia-api-coordinator` handles the actual GitHub API merge call
- 5 quality gates block merge if not approved
- Merge strategies supported: squash, merge, rebase (configurable)
- Pre-merge checks: CI status, conflicts, approvals

### Tools Used

- **`gh` CLI** -- all GitHub operations (PRs, issues, projects)
- **`git worktrees`** -- parallel PR processing in isolated environments
- **Python scripts** -- validation, quality gate checks, CI diagnosis
- **GitHub Actions** -- CI/CD with plugin validation workflow
- **GitHub Projects V2** -- GraphQL-based kanban sync

---

## 4. Messaging -- AMP Integration

### How It Coordinates with Other Agents

AMIA uses AI Maestro's **`agent-messaging` skill** for ALL inter-agent communication. The plugin is designed around the messaging pattern documented in `amia-integration-protocols/references/ai-maestro-message-templates.md`.

### Communication Hierarchy

```
AMOA (Orchestrator) --> sends integration-request --> AMIA (main agent)
AMIA --> delegates task via agent-messaging --> Sub-agents (code-reviewer, etc.)
Sub-agents --> report results via agent-messaging --> AMIA
AMIA --> sends integration-status --> AMOA
```

### Message Types Used

| Message Type | Direction | Purpose |
|-------------|-----------|---------|
| `integration-request` | AMOA -> AMIA | PR review, CI fix, release tasks |
| `task-delegation` | AMIA -> sub-agents | Route work to specialists |
| `integration-status` | AMIA -> AMOA | Success/failure/in-progress reports |
| `blocker-escalation` | AMIA -> AMOA | Critical blockers requiring decision |
| `merge-decision` | AMIA -> AMOA | Approved/rejected merge notification |
| `release-ready` | AMIA -> AMOA | Release candidate ready for tagging |
| `handoff-rejected` | AMIA -> AMOA | Invalid handoff document |

### AMP Compliance

- All messaging is done through the `agent-messaging` skill (abstraction layer)
- **No hardcoded `amp-send.sh` or `amp-inbox.sh` calls** in agent definitions or skill SKILL.md files
- Message templates reference the skill by name, not by implementation
- Content always uses the `{type, message}` JSON object format as required by AMP

### VIOLATION: Direct API Call in Script

**`skills/amia-github-projects-sync/scripts/ci_webhook_handler.py`** (lines 41-79):
- Hardcodes `AIMAESTRO_API = os.environ.get("AIMAESTRO_API", "http://localhost:23000")`
- Makes direct `urllib.request` POST to `{AIMAESTRO_API}/api/messages`
- This VIOLATES the Plugin Abstraction Principle (should use `amp-send.sh` or `amp-*` scripts)
- The `_send_maestro_message()` function constructs raw API payloads

**`skills/amia-github-projects-sync/scripts/amia_kanban_sync.py`** (line 36):
- Imports from `aimaestro_notify` module (which wraps the direct API)
- This is a secondary violation through the same pattern

### VIOLATION: Phase Procedures Reference Direct curl

**`skills/amia-integration-protocols/references/phase-procedures.md`** (lines 95, 145):
- "Execute curl POST to AI Maestro API" -- describes direct API calls instead of using `agent-messaging` skill or `amp-send.sh`

---

## 5. Governance -- Role Checks and Permissions

### Role Boundary Enforcement

AMIA has strict role boundaries enforced through:

1. **Agent markdown instructions** -- each agent file explicitly lists WHAT IT CAN and CANNOT do
2. **Plugin mutual exclusivity** -- AMIA only loads `ai-maestro-integrator-agent`, never other role plugins
3. **Communication hierarchy** -- AMIA only receives from AMOA, reports to AMOA, routes to sub-agents
4. **Read-only enforcement** -- most sub-agents (code-reviewer, pr-evaluator, test-engineer, integration-verifier) are explicitly forbidden from using the Edit tool

### What AMIA CAN Do

- Review PRs, merge/reject PRs, enforce quality gates
- Monitor CI/CD, investigate failures, tag releases
- Comment on PRs, request sub-agents, verify issue closure

### What AMIA CANNOT Do

- Assign tasks (AMOA only)
- Create agents (AMCOS only)
- Create projects (AMAMA only)
- Make architecture decisions (AMAA only)
- Talk to user (AMAMA only)
- Modify kanban tasks (AMOA only, AMIA is read-only)
- Close issues directly (must verify first, AMOA closes after AMIA approval)

### Governance Compliance

- Role boundaries are documented in `docs/ROLE_BOUNDARIES.md` (synchronized across all plugins)
- Full workflow documented in `docs/FULL_PROJECT_WORKFLOW.md` (also synchronized)
- Team registry spec in `docs/TEAM_REGISTRY_SPECIFICATION.md` (also synchronized)
- AGENT_OPERATIONS.md is marked as "SINGLE SOURCE OF TRUTH" for AMIA operations

### What Is MISSING

- **No runtime governance enforcement** -- role boundaries are purely instructional (in .md files). There is no API call to AI Maestro's governance system to verify permissions at runtime.
- **No `team-governance` skill reference** -- the plugin does not reference or discover AI Maestro's `team-governance` skill for permission checks, COS assignment, or governance requests.
- **No governance request flow** -- if AMIA needs to do something outside its role, it sends an AI Maestro message manually rather than using the governance request API.

---

## 6. Hardcoded Assumptions

### API URLs and Endpoints

| Location | Hardcoded Value | Issue |
|----------|----------------|-------|
| `ci_webhook_handler.py:41` | `http://localhost:23000` | Direct API default (should use env var only, or `amp-send.sh`) |
| `ci_webhook_handler.py:72` | `/api/messages` | Hardcoded endpoint path |
| `phase-procedures.md:95,145` | "Execute curl POST to AI Maestro API" | References direct API calls in documentation |

### Governance Rules

| Location | Hardcoded Rule | Issue |
|----------|---------------|-------|
| All agent .md files | Role permission matrices | Governance rules are textual instructions, not discovered from `team-governance` skill |
| `docs/ROLE_BOUNDARIES.md` | AMCOS/AMOA/AMIA/AMAA permission tables | Hardcoded and synchronized manually across plugins |
| `docs/FULL_PROJECT_WORKFLOW.md` | 8-column kanban system | Column names/codes hardcoded (should match AI Maestro's kanban config) |

### Agent Names

| Location | Hardcoded Name | Issue |
|----------|---------------|-------|
| Message templates | `orchestrator-amoa` | Recipient name hardcoded in examples and templates |
| Message templates | `ai-maestro-integrator` | Self-reference hardcoded |
| `TEAM_REGISTRY_SPECIFICATION.md` | `amcos-chief-of-staff`, `amama-assistant-manager` | Organization agent names hardcoded |

### Technology Assumptions

- Python 3.8+ required for all scripts
- `gh` CLI must be installed and authenticated
- `uv` for running Python scripts
- GitHub Projects V2 (GraphQL API)
- Git worktrees for parallel PR processing

### Path Assumptions

- Working directory: `~/agents/<session-name>/`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}` (properly using env var)
- Team registry: `.emasoft/team-registry.json` (convention)
- Logs: `docs_dev/integration/` subdirectories
- Evidence files: `/tmp/integration-verification-*`

---

## 7. What AI Maestro Features AMIA SHOULD Use But Does Not

### 7.1 Team Governance Skill (CRITICAL)

The plugin does NOT reference the `team-governance` skill at all. It should:
- **Discover governance rules at runtime** by reading `team-governance` skill instead of hardcoding role boundaries
- **Request governance approval** through the governance API before performing sensitive operations (merge to main, release tagging)
- **Check team membership** before accepting tasks -- verify the requesting agent is actually in the same team

### 7.2 AI Maestro Agent Management API

The plugin documents agent creation through AMCOS (correctly), but:
- Does NOT use `aimaestro-agent.sh` CLI for any agent lifecycle operations
- Sub-agents are Claude Code `--agent` sub-agents, not separately managed AI Maestro agents
- There is no health check or liveness probe for sub-agents via AI Maestro

### 7.3 AI Maestro Task System

The plugin has its own file-based task tracking (`docs_dev/integration/status/`) but:
- Does NOT use AI Maestro's built-in task system (`~/.aimaestro/teams/tasks-{teamId}.json`)
- Does NOT use the `useTasks` hook or `/api/teams/tasks` endpoints
- The kanban skill syncs with GitHub Projects V2 but NOT with AI Maestro's internal kanban

### 7.4 AMP Scripts for Messaging

While agent definitions correctly reference the `agent-messaging` skill (good abstraction), the Python scripts violate this:
- `ci_webhook_handler.py` makes direct HTTP calls to `/api/messages`
- Should use `amp-send.sh` from `~/.local/bin/` instead

### 7.5 Agent Subconscious / Memory

- The plugin has its own `amia-session-memory` skill for session state persistence
- Does NOT integrate with AI Maestro's subconscious memory system (`maintainMemory`, `triggerConsolidation`)
- Does NOT use CozoDB for semantic search of past reviews

### 7.6 Push Notifications

- The plugin uses polling to check for messages (Phase 4: "Poll AI Maestro inbox")
- Should leverage AI Maestro's push notification system instead (tmux notifications)

### 7.7 `.agent.toml` Profile

- The plugin has NO `.agent.toml` file
- Per the Role-Plugin Architecture (CLAUDE.md memory), every plugin should define an agent called `main-agent` via `.agent.toml`
- The main agent is `amia-integrator-main-agent.md` (follows old naming, not `main-agent`)

### 7.8 Multi-Host Awareness

- `ci_webhook_handler.py` enforces localhost-only (`AIMAESTRO_API` must be localhost/127.0.0.1/::1)
- Does NOT support cross-host messaging or multi-host governance
- The team registry spec mentions `host` field per agent but the plugin itself does not use it for routing

---

## 8. Summary of Compliance with Plugin Abstraction Principle

| Rule | Status | Details |
|------|--------|---------|
| Plugin skills MUST NOT embed API syntax | PASS (mostly) | Agent .md files and skill SKILL.md reference `agent-messaging` by name |
| Plugin hooks/scripts MUST NOT call API directly | **FAIL** | `ci_webhook_handler.py` calls `/api/messages` directly |
| Governance rules discovered at runtime | **FAIL** | Role boundaries hardcoded in .md files, not discovered from `team-governance` skill |
| AI Maestro plugin is the exception | N/A | This is NOT the AI Maestro plugin, so violations apply |

---

## 9. Recommendations

### Priority 1 (Critical)
1. **Replace direct API calls** in `ci_webhook_handler.py` with `amp-send.sh` calls
2. **Add `team-governance` skill reference** to agents -- discover governance rules at runtime instead of hardcoding
3. **Add `.agent.toml`** file with `main-agent` definition per Role-Plugin Architecture

### Priority 2 (Important)
4. **Integrate with AI Maestro task system** instead of file-based `docs_dev/integration/status/`
5. **Update `phase-procedures.md`** to reference `agent-messaging` skill instead of "curl POST to AI Maestro API"
6. **Support push notifications** instead of polling for message check in Phase 4

### Priority 3 (Nice to Have)
7. **Integrate with subconscious memory** for persistent cross-session review context
8. **Add multi-host support** for cross-host messaging in webhook handler
9. **Align kanban columns** with AI Maestro's internal task system (5 statuses vs 8 columns)
10. **Rename main agent** from `amia-integrator-main-agent` to `main-agent` per convention

---

## 10. File Inventory

### Agents (11)
- `agents/amia-integrator-main-agent.md` -- Main orchestrator (Opus)
- `agents/amia-api-coordinator.md` -- GitHub API specialist (Sonnet)
- `agents/amia-code-reviewer.md` -- Code quality reviewer (Opus)
- `agents/amia-pr-evaluator.md` -- PR readiness evaluator (Opus)
- `agents/amia-integration-verifier.md` -- Post-merge verifier (Sonnet)
- `agents/amia-bug-investigator.md` -- Bug investigator (Sonnet)
- `agents/amia-github-sync.md` -- GitHub sync + git write ops (Sonnet)
- `agents/amia-committer.md` -- Commit creator (Sonnet)
- `agents/amia-screenshot-analyzer.md` -- Image/screenshot analyzer (Sonnet)
- `agents/amia-debug-specialist.md` -- CI/CD debugger (Sonnet)
- `agents/amia-test-engineer.md` -- TDD enforcement specialist (Sonnet)

### Skills (20)
amia-code-review-patterns, amia-ai-pr-review-methodology, amia-multilanguage-pr-review, amia-quality-gates, amia-tdd-enforcement, amia-ci-failure-patterns, amia-release-management, amia-github-pr-workflow, amia-github-pr-merge, amia-github-pr-checks, amia-github-pr-context, amia-github-issue-operations, amia-github-thread-management, amia-github-integration, amia-github-projects-sync, amia-kanban-orchestration, amia-git-worktree-operations, amia-integration-protocols, amia-label-taxonomy, amia-session-memory

### Hooks (3)
- `amia-branch-protection` (PreToolUse/Bash) -- blocks push to main/master
- `amia-issue-closure-gate` (PreToolUse/Bash) -- verifies before `gh issue close`
- `amia-stop-check` (Stop) -- blocks exit with incomplete work

### Key Scripts
- `amia_pre_push_hook.py` -- Branch protection enforcement
- `amia_pre_issue_close_hook.py` -- Issue closure gate with TDD verification
- `amia_stop_hook.py` -- Exit prevention for incomplete work
- `amia_github_pr_gate.py` / `amia_github_pr_gate_checks.py` -- PR gate checks
- `amia_github_lifecycle.py` / `amia_github_lifecycle_core.py` -- GitHub lifecycle management
- `amia_github_report.py` / `amia_github_report_formatters.py` -- Report generation
- `amia_sync_github_issues.py` -- Issue synchronization
- `ci_webhook_handler.py` -- GitHub webhook server (VIOLATES abstraction principle)
- `validate_plugin.py` -- Plugin structure validation (0 issues)

### Docs (4)
- `docs/AGENT_OPERATIONS.md` -- Single source of truth for AMIA operations
- `docs/ROLE_BOUNDARIES.md` -- Strict role permission matrix
- `docs/FULL_PROJECT_WORKFLOW.md` -- Complete 6-phase project workflow
- `docs/TEAM_REGISTRY_SPECIFICATION.md` -- Team registry format and conventions

---

**END OF ANALYSIS**
