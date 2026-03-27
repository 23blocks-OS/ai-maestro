# Role Boundary Decision Needed: Task Assignment

**Date:** 2026-03-27
**Issue:** COS and Orchestrator have conflicting claims about who assigns agents to tasks.

## Conflict

**COS agent says** (ai-maestro-chief-of-staff-main-agent.md):
> "NO TASK ASSIGNMENT | You create agents and assign them to your team. AMOA assigns tasks, NOT you."

**Kanban spec says:**
> COS creates/assigns agent to task. COS updates task assigneeId.

## Options

### Option A: COS assigns tasks (full control)
- COS creates kanban tasks, creates agents, assigns agents to tasks
- Orchestrator only coordinates execution (not assignment)
- Simpler — one authority for staffing AND task assignment

### Option B: Orchestrator assigns tasks (current COS agent design)
- COS creates agents and adds to team
- Orchestrator creates tasks and assigns agents to them
- COS focuses on team composition, orchestrator on task management
- More distributed — separation of staffing vs scheduling

### Option C: Split responsibility
- COS creates high-level epics/milestones and agents
- Orchestrator decomposes into tasks and assigns agents
- COS approves orchestrator's assignments

## Recommendation
Option B matches the current COS agent design. The orchestrator is the "project manager" who knows the work breakdown, while COS is the "HR manager" who manages the team roster.

## Also Needed
- COS agent creation examples must include `--program <client>` flag
- COS quick reference must mention GovernanceRequest requirement
- Orchestrator must document how it requests COS to create new agents
- Non-Claude agent handling in plugin configurator
