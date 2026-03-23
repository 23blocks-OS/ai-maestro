# Implementation Report: Governance Enforcement on Agent CRUD
Generated: 2026-02-21T00:30:00Z

## Task
Add Layer 6 governance enforcement to agent create/update/delete operations in agents-core-service.ts.

## Changes Made

### 1. types/agent.ts
- Added `AgentConfiguration` interface (skills, mcpServers, hooks, model, programArgs) after `AgentRole` type at line ~411

### 2. services/agents-core-service.ts
- Added imports: `isManager`, `isChiefOfStaffAnywhere` from `@/lib/governance`, `loadTeams` from `@/lib/team-registry`
- `createNewAgent(body, requestingAgentId?)`: Only MANAGER or COS can create agents when agent identity is provided
- `updateAgentById(id, body, requestingAgentId?)`: MANAGER, global COS, self, or owning COS of a closed team can update
- `deleteAgentById(id, hard, requestingAgentId?)`: Only MANAGER can delete when agent identity is provided

### 3. services/headless-router.ts
- POST `/api/agents`: Extracts auth via `authenticateAgent`, passes `auth.agentId` to `createNewAgent`
- PATCH `/api/agents/[id]`: Extracts auth, passes to `updateAgentById`
- DELETE `/api/agents/[id]`: Extracts auth, passes to `deleteAgentById`
- Metadata routes (PATCH/DELETE `/api/agents/[id]/metadata`) left unchanged (no governance enforcement)

### Backward Compatibility
- All new parameters are optional (`requestingAgentId?: string | null`)
- When no auth headers present, `authenticateAgent` returns `{}` (no agentId) -> governance not enforced
- Web UI calls (no auth headers) continue to work without restrictions
- Next.js API routes (`app/api/agents/`) call without requestingAgentId -> no governance enforcement

## Compilation
- `npx tsc --noEmit`: 0 errors in modified files, 0 new errors introduced
