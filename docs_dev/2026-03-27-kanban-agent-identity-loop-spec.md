# Kanban → Agent → Identity → Governance Loop

**Date:** 2026-03-27
**Status:** Architecture spec — integration of kanban, agent creation, identity, and governance

## The Full Loop

```
COS creates kanban task
  → COS creates/assigns agent to task
    → Agent proves identity (Ed25519)
      → Agent reports progress (authenticated API call)
        → COS verifies progress came from assigned agent
          → COS updates kanban status
```

## Step-by-Step Flow

### 1. COS Creates Kanban Task
- COS uses team-kanban skill: `POST /api/teams/{id}/tasks`
- Task has: title, description, assigneeId (agent to do the work), status=pending
- Auth: COS includes `Authorization: Bearer <token>` + `X-Agent-Id: <cos-id>`
- API verifies: COS is COS of this team (via `checkTeamAccess()`)

### 2. COS Creates Agent for Task (or Assigns Existing)
- COS uses agents-management skill: `POST /api/agents` or assigns existing agent
- For new agent: `aimaestro-agent.sh create <name> --dir <path> --program <client>`
- COS requires GovernanceRequest approval from MANAGER
- After creation/assignment: COS updates task `assigneeId`

### 3. Agent Identity Initialization
- **Claude agent**: Identity created during `aid-init.sh --auto` (part of agent startup)
- **Non-Claude agent**: Identity created by `cross-client-skill-service.ts` during skill install
- Result: Ed25519 keypair at `~/.agent-messaging/agents/<name>/`
- Agent registered with AI Maestro provider: `POST /api/v1/register`

### 4. Agent Executes Task
- Agent reads task assignment via team-kanban skill
- Agent works on the task in its working directory
- Agent must authenticate ALL API calls with its identity

### 5. Agent Reports Progress
- Agent calls: `POST /api/teams/{id}/tasks/{taskId}` with status update
- Headers: `Authorization: Bearer <token>`, `X-Agent-Id: <agent-id>`
- API verifies:
  1. Agent identity valid (Bearer token matches agent)
  2. Agent is member of the team (team-acl check)
  3. Agent is the assignee of this task (new check needed!)
  4. Status transition is valid (pending→in_progress→review→completed)

### 6. COS Verifies Progress
- COS polls task board or receives AMP notification from agent
- Progress is authenticated — COS knows it came from the assigned agent
- COS can approve (move to completed) or send back (move to in_progress)

## Identity Requirements by Role

| Role | Identity | Auth Method | Can Create Agents | Can Assign Tasks |
|------|----------|-------------|:-:|:-:|
| MANAGER | Ed25519 + role-plugin | Bearer + X-Agent-Id | Yes (except COS) | Yes (any team) |
| COS | Ed25519 + role-plugin | Bearer + X-Agent-Id | Yes (needs MGR approval) | Yes (own team) |
| MEMBER | Ed25519 + skills | Bearer + X-Agent-Id | No | No (can update own) |

## What Each Skill Must Teach

### team-kanban skill (ALL agents)
- How to read your assigned tasks
- How to update task status with authenticated API calls
- How to include identity headers in every request
- That progress updates are verified against your identity

### agent-messaging skill (ALL agents)
- How to sign messages with Ed25519
- How to initialize identity if not done
- That the server blocks messages violating team boundaries
- How to route inter-team requests through COS

### team-governance skill (COS/MANAGER)
- How COS creates GovernanceRequests for agent operations
- How MANAGER approves/rejects GovernanceRequests
- That COS assignment is USER-only (MANAGER cannot assign COS)
- How to verify agent identity before trusting reports

### agents-management skill (COS/MANAGER)
- How to create agents with correct client type
- That non-Claude agents get skills auto-installed
- That identity is auto-initialized for all agents
- How to assign agents to tasks after creation

## Parallel Task Execution

COS creates multiple tasks on kanban → assigns different agents to each → agents work in parallel → each reports progress independently → COS tracks all via kanban board.

```
Team "backend-core" (closed, COS: Alice)
├── Task: Implement auth API → Bob (codex, MEMBER)
├── Task: Write tests → Carol (claude, MEMBER)
├── Task: Deploy staging → Dave (gemini, MEMBER)
└── Task: Update docs → Eve (aider, MEMBER)
```

Each agent:
1. Has Ed25519 identity (auto-initialized)
2. Has governance skills installed (client-appropriate)
3. Reports to kanban with authenticated API calls
4. Messages COS for questions/blockers (AMP with signature)
5. Cannot message other teams' agents (server-enforced)

## Missing Implementation: Task Assignee Verification

Currently the task update API (`PATCH /api/teams/{id}/tasks/{taskId}`) checks team membership but does NOT verify the caller is the task assignee. This means any team member could update any task's status.

**Fix needed:** Add assignee verification:
```typescript
// In task update handler
if (body.status && task.assigneeId && requestingAgentId !== task.assigneeId) {
  // Only the assignee or COS/MANAGER can change task status
  if (!isManager(requestingAgentId) && !isChiefOfStaff(requestingAgentId, teamId)) {
    return { error: 'Only the assigned agent or COS/MANAGER can update task status', status: 403 }
  }
}
```

## Action Items

1. [TODO] Add task assignee verification to task update API
2. [TODO] Ensure team-kanban skill teaches authenticated task updates
3. [TODO] Ensure agent-messaging skill covers identity initialization for all clients
4. [TODO] Verify cross-client skill installer includes ALL required skills (governance, messaging, kanban)
5. [TODO] Update 6 role-plugins to reference identity skills correctly
6. [DONE] Auto-init AMP identity for non-Claude agents in cross-client installer
7. [DONE] Message filter enforces team boundaries server-side
8. [DONE] MANAGER/COS = Claude-only enforcement
