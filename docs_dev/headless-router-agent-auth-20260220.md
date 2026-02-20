# Headless Router: Agent Auth Migration
Generated: 2026-02-20T15:56Z

## Task
Replace raw `X-Agent-Id` header extraction with `authenticateAgent()` in all 13 team/governance handlers in `services/headless-router.ts`.

## Changes Made

1. Added import: `import { authenticateAgent } from '../lib/agent-auth'`
2. Replaced 13 handlers that had `getHeader(req, 'X-Agent-Id') || undefined` with the auth pattern:
   - PUT /api/teams/:id/tasks/:taskId
   - DELETE /api/teams/:id/tasks/:taskId
   - GET /api/teams/:id/tasks
   - POST /api/teams/:id/tasks
   - GET /api/teams/:id/documents/:docId
   - PUT /api/teams/:id/documents/:docId
   - DELETE /api/teams/:id/documents/:docId
   - GET /api/teams/:id/documents
   - POST /api/teams/:id/documents
   - GET /api/teams/:id
   - PUT /api/teams/:id
   - DELETE /api/teams/:id
   - POST /api/teams
3. Updated POST /api/governance/transfers/:id/resolve to use auth and override `resolvedBy` with authenticated identity: `const resolvedBy = auth.agentId || body.resolvedBy`

## Verification
- Zero remaining `getHeader(req, 'X-Agent-Id') || undefined` patterns
- All 14 handlers now use `authenticateAgent()` with early-return on auth failure
- No new TypeScript errors introduced (pre-existing path alias errors unrelated)
