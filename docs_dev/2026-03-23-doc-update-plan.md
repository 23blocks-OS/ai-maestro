# Documentation Update Plan — 2026-03-23

## Scope

Update all AI Maestro plugin documentation to fully cover every functionality.

### Key Distinction
- **Skills** = use-case oriented: list use cases, for each show the command
- **Help screens** = command oriented: list commands, for each show the use case
- **README** = feature-marketing: what it does, why, quick examples

## Files to Update/Create

### Skills (plugin/plugins/ai-maestro/skills/)

| # | Skill | Status | Action |
|---|-------|--------|--------|
| 1 | agent-messaging | EXISTS (309 lines) | Rewrite — add all AMP commands with use cases |
| 2 | ai-maestro-agents-management | EXISTS (285 lines) | Rewrite — add all agent CLI commands with use cases |
| 3 | docs-search | EXISTS (245 lines) | Review — already well-structured |
| 4 | graph-query | EXISTS (171 lines) | Review — add missing commands |
| 5 | memory-search | EXISTS (159 lines) | Review — add missing commands |
| 6 | planning | EXISTS (306 lines) | Review — already good |
| 7 | team-governance | MISSING from plugin | CREATE — copy from ~/.claude/skills/team-governance/ |
| 8 | team-kanban | MISSING from plugin | CREATE — copy from ~/.claude/skills/team-kanban/ |
| 9 | debug-hooks | MISSING from plugin | CREATE — based on ~/.claude/skills/debug-hooks/ |

### Script Help Screens (plugin/plugins/ai-maestro/scripts/)

| Category | Scripts | Action |
|----------|---------|--------|
| AMP | amp-{send,inbox,read,reply,delete,fetch,init,register,identity,security,status,helper,download}.sh | Verify --help completeness |
| Agent | aimaestro-agent.sh + agent-{core,commands,helper,plugin,session,skill}.sh | Verify --help completeness |
| Docs | docs-{search,find-by-type,get,list,stats,index,index-delta,helper}.sh | Verify --help |
| Graph | graph-{describe,find-associations,find-by-type,find-callees,find-callers,find-path,find-related,find-serializers,helper,index-delta}.sh | Verify --help |
| Memory | memory-{search,helper}.sh | Verify --help |
| Import/Export | export-agent.sh, import-agent.sh | Verify --help |

### README.md
- Update Documentation section with links to all skills
- Add CLI Reference section with aimaestro-agent.sh commands
- Update feature descriptions to match current state

## Execution Plan

### Batch 1: Create missing skills (3 new)
- team-governance — copy from global, adapt for plugin
- team-kanban — copy from global, adapt for plugin
- debug-hooks — based on global, customized for AI Maestro hooks

### Batch 2: Update existing skills (6 existing)
- Each skill gets full use-case coverage with commands and examples
- Agent subagent per skill file

### Batch 3: Script help screens
- Scan all scripts, identify those with incomplete --help
- Fix in parallel batches

### Batch 4: README update
- Single agent to update README with comprehensive feature docs

## Standing Directives
- DO NOT push or create PR
- Squash commits when creating PR
