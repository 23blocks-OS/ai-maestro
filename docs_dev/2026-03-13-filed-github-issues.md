# GitHub Issues Filed - 2026-03-13

## Summary
Created 8 GitHub issues across 4 role-agent repositories to address governance system compliance and stale documentation.

## Issues Created

### Repo 1: Emasoft/ai-maestro-architect-agent
- **Issue #2**: Missing .agent.toml and wrong main-agent naming
  - URL: https://github.com/Emasoft/ai-maestro-architect-agent/issues/2
  - Labels: bug
  - Fix: Create `ai-maestro-architect-agent.agent.toml`, rename agent with `amaa-` prefix to full name

- **Issue #3**: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
  - URL: https://github.com/Emasoft/ai-maestro-architect-agent/issues/3
  - Labels: bug, documentation
  - Fix: Update docs to use EAMA naming, team-scoped CoS, governance titles

### Repo 2: Emasoft/ai-maestro-orchestrator-agent
- **Issue #2**: Missing .agent.toml and wrong main-agent naming
  - URL: https://github.com/Emasoft/ai-maestro-orchestrator-agent/issues/2
  - Labels: bug
  - Fix: Create `ai-maestro-orchestrator-agent.agent.toml`, rename agent with `amoa-` prefix

- **Issue #3**: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
  - URL: https://github.com/Emasoft/ai-maestro-orchestrator-agent/issues/3
  - Labels: bug, documentation

### Repo 3: Emasoft/ai-maestro-integrator-agent
- **Issue #2**: Missing .agent.toml and wrong main-agent naming
  - URL: https://github.com/Emasoft/ai-maestro-integrator-agent/issues/2
  - Labels: bug
  - Fix: Create `ai-maestro-integrator-agent.agent.toml`, rename agent with `amia-` prefix

- **Issue #3**: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
  - URL: https://github.com/Emasoft/ai-maestro-integrator-agent/issues/3
  - Labels: bug, documentation

### Repo 4: Emasoft/ai-maestro-programmer-agent
- **Issue #2**: Missing .agent.toml and wrong main-agent naming
  - URL: https://github.com/Emasoft/ai-maestro-programmer-agent/issues/2
  - Labels: bug
  - Fix: Create `ai-maestro-programmer-agent.agent.toml`, rename agent with `ampa-` prefix

- **Issue #3**: Stale ROLE_BOUNDARIES.md references pre-v0.26.0 governance model
  - URL: https://github.com/Emasoft/ai-maestro-programmer-agent/issues/3
  - Labels: bug, documentation

## Common Issues Addressed

### Issue Pattern A: Governance System Compliance (4 issues)
All 4 role-agent repos are missing compliance with the quad-match rule for Role-Plugin identification:
- Missing `.agent.toml` files at repo root
- Main agent files use abbreviated prefixes instead of full plugin names
- Requires renaming agents and creating TOML configuration files

### Issue Pattern B: Documentation Updates (4 issues)
All 4 repos have stale `ROLE_BOUNDARIES.md` files that reference the pre-v0.26.0 governance model:
- Old naming convention: AMAMA instead of EAMA
- Old scope model: project-independent instead of team-scoped CoS
- Missing: governance titles (manager/chief-of-staff/member)
