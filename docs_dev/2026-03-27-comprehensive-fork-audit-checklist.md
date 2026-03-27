# Comprehensive Fork Audit Checklist

**Date:** 2026-03-27
**Branch:** feature/team-governance

## 1. Install/Update Scripts
- [ ] install-messaging.sh — marketplace install, no standalone skills
- [ ] install-agent-cli.sh — scripts from scripts/, not plugin/
- [ ] install-graph-tools.sh — scripts only
- [ ] install-memory-tools.sh — scripts only
- [ ] install-doc-tools.sh — scripts only
- [ ] install.sh — orchestrates all, installs ai-maestro plugin from marketplace
- [ ] remote-install.sh — uninstall handles plugin + marketplace
- [ ] update-messaging.sh — marketplace update
- [ ] update-aimaestro.sh — plugin update
- [ ] verify-installation.sh — checks plugin, not standalone

## 2. README + Docs
- [ ] README.md — architecture reflects marketplace-first
- [ ] CLAUDE.md — role-plugin section, multi-client, governance
- [ ] docs/OPERATIONS-GUIDE.md — updated for new install flow
- [ ] docs/PLUGIN-ABSTRACTION-PRINCIPLE.md — current

## 3. GitHub Project Kanban (API + Scripts)
- [ ] POST/PUT/DELETE /api/teams/{id}/tasks — auth, assignee check
- [ ] scripts/kanban-*.sh — if any exist
- [ ] team-kanban skill — teaches correct API usage
- [ ] GitHub Projects sync — lib/github-project.ts

## 4. Orchestrator Agent — Kanban Handling
- [ ] Main agent .md references team-kanban skill
- [ ] Task creation workflow documented
- [ ] Agent assignment to tasks documented
- [ ] Parallel task execution documented

## 5. Templates & Handoffs — Full Pipeline
- [ ] Requirements → Backlog → Kanban → Implementation → PR → Integration
- [ ] MANAGER sets requirements
- [ ] COS decomposes into tasks
- [ ] Orchestrator assigns to programmers
- [ ] Programmer implements
- [ ] Integrator reviews + merges
- [ ] Architect reviews design decisions

## 6. COS Auto-Creates Programmer Agents
- [ ] COS skill instructs creating agents for unassigned tasks
- [ ] Default role-plugin for new agents: ai-maestro-programmer-agent
- [ ] Agent creation requires GovernanceRequest to MANAGER

## 7. Design Task → Architect Assignment
- [ ] Tasks tagged as "design" assigned only to architect-plugin agents
- [ ] Skill teaches COS to match task type to role-plugin

## 8. Dangerously Skip Permissions
- [ ] Claude agents: --dangerously-skip-permissions in programArgs
- [ ] Codex: equivalent autonomous mode flag
- [ ] Gemini: equivalent flag
- [ ] Agent creation wizard sets this by default

## 9. Agent Creation Wizard
- [ ] Reflects new plugin installation flow
- [ ] Client type selection
- [ ] Correct API calls for different clients

## 10. Installer Dependencies
- [ ] Detects installed clients (claude, codex, gemini, aider)
- [ ] If Claude present: install marketplace + 3 user-scope plugins
- [ ] If no Claude: skip plugin installation entirely
- [ ] External dependencies:
  - claude-plugins-validation@emasoft-plugins
  - perfect-skill-suggester@emasoft-plugins
  - code-auditor-agent@emasoft-plugins
  - llm-externalizer-plugin@emasoft-plugins
  - serena@claude-plugins-official
  - agentika@agentika-plugins-marketplace
