# Team Staffing Workflow — Feature Design

**Date:** 2026-03-11
**Status:** Planning
**Priority:** High — core workflow for team creation

## Overview

When a user creates a team, AI Maestro should offer automated staffing via a Chief-of-Staff agent that orchestrates the creation of the full team based on 5 predefined agent roles.

## The 5 Predefined Agent Roles

Each role has a ready-made plugin that gets installed at project level:

| Role | Plugin | Limit | Description |
|------|--------|-------|-------------|
| **Chief-of-Staff** | `chief-of-staff-plugin` | 1 per team | Team coordinator, creates and manages other agents |
| **Architect** | `architect-plugin` | 1 per team | Creates actionable project design documents from requirements |
| **Orchestrator** | `orchestrator-plugin` | 1 per team | Breaks down design into tasks, manages kanban workflow |
| **Integrator** | `integrator-plugin` | 1 per team | Integrates components, manages dependencies, CI/CD |
| **Programmer** | `programmer-plugin` | Unlimited | Implements tasks, writes code, tests |

Future implementor roles (same unlimited pattern as Programmer):
- Copywriter, Art Director, 2D Artist, 3D Artist, Sound Editor, Video Editor, Content Writer, Map Creator, Assets Creator

## Team Creation Flow

### Step 1: Team Created (empty)
User creates a team via the Team panel. The team has no agents yet.

### Step 2: Auto-Staffing Prompt
UI shows dialog:
> "The team is currently without staff. Do you want to create a Chief-of-Staff agent for this team and let him create the staff for you, or do you want to create the agents yourself?"
- **Option A**: Auto-staff (creates CoS agent automatically)
- **Option B**: Manual (user creates agents via Haephestos)

### Step 3: Auto-Staff Flow (Option A)

```
User creates team
  → CoS agent created (random nickname, role plugin installed)
  → CoS asks Manager (the user) for the requirements design document
  → User creates/provides the requirements document
  → CoS receives requirements document
  → CoS creates Architect agent (role plugin installed)
  → CoS messages Architect with requirements
  → Architect creates ACTIONABLE project design document
  → Architect returns actionable design doc to CoS
  → CoS invokes pss-agent-profiler to augment ALL agent profiles
     (each profile = role plugin + extra elements from PSS for the project)
  → CoS creates remaining agents (Orchestrator, Integrator, N Programmers)
  → CoS sends actionable design doc to Orchestrator
  → Orchestrator breaks down design into tasks
  → Tasks placed in Kanban TODO column as actionable task requirements
```

## Agent Profile Structure

For each agent, the profile = Role Plugin + PSS Augmentation:

```
.agent.toml
├── [dependencies]           ← Global user-level elements
│   ├── plugins: [ai-maestro]  ← Mandatory (all agents share)
│   ├── skills: [agent-messaging, team-governance, ...]  ← AI Maestro global skills
│   └── mcp_servers: [llm-externalizer, ...]  ← Optional globals Haephestos adds
├── [skills]                 ← Project-level elements (from PSS profiler)
│   ├── primary: [...]
│   ├── secondary: [...]
│   └── specialized: [...]
├── [agents]                 ← Sub-agents for this agent
├── [rules]                  ← Project-specific rules
├── [mcp]                    ← Project-specific MCP servers
└── [lsp]                    ← Language servers for this agent's work
```

## Kanban Column Changes

Current 5 columns:
1. Backlog → 2. Pending → 3. In Progress → 4. Review → 5. Completed

Proposed 6 columns:
0. **Feature Request** (Limbo) → 1. TODO → 2. In Progress → 3. Review → 4. Testing → 5. Completed

### Feature Request Column (Column 0 / Limbo)
- Contains non-actionable design proposals
- Tasks stay here until Manager approves implementation
- Only Manager can move tasks from Feature Request to TODO
- CoS assigns approved features to Architect for transformation
- Architect converts non-actionable proposals into actionable task requirements
- Only actionable task requirements can be placed in TODO

### TODO Column
- Only contains actionable task design requirement documents
- Each task has an attached design requirement document
- Orchestrator is responsible for creating these tasks from the actionable design

## Plugin Installation

Each role agent gets its plugin installed at project scope:
```bash
claude plugin install <role-plugin>@<marketplace> --scope project
```

The main agent is loaded via:
```bash
claude --agent <name-of-main-agent>
```

## Implementation Tasks

### Phase 1: Predefined Role Plugins
- [ ] Create .agent.toml profiles for each of the 5 role plugins
- [ ] Integrate role plugins into AI Maestro (install mechanism)
- [ ] Add 5 role buttons to the simple agent creation wizard (NOT Haephestos — Haephestos is for custom/specialized roles only)

### Phase 2: Team Auto-Staffing
- [ ] Add auto-staffing dialog to team creation panel
- [ ] Implement CoS agent auto-creation flow
- [ ] CoS ↔ Manager requirements handoff
- [ ] CoS → Architect creation + messaging

### Phase 3: Design Document Pipeline
- [ ] Architect: non-actionable → actionable design transformation
- [ ] PSS profiler integration for role plugin augmentation
- [ ] CoS: bulk agent creation with augmented profiles

### Phase 4: Kanban Workflow
- [ ] Add Feature Request column (column 0)
- [ ] Manager-only approval for Feature Request → TODO transitions
- [ ] Orchestrator: actionable design → task breakdown
- [ ] Task design requirement document attachments

### Phase 5: Agent Spawning
- [ ] Plugin installation at project scope (`claude plugin install`)
- [ ] Agent launch via `claude --agent <name>`
- [ ] AMP messaging integration for CoS ↔ Architect ↔ Orchestrator
