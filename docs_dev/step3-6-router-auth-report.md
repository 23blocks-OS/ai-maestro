# Steps 3 & 6: Wire Auth Into Skills Routes + Config Deploy Endpoint
Generated: 2026-02-22

## Changes Made

### Step 3a: headless-router.ts - Auth wired into 4 mutating skills routes
- PUT /api/agents/:id/skills/settings (line 803-806): Added authenticateAgent, pass agentId to saveSkillSettings
- PATCH /api/agents/:id/skills (line 811-814): Added authenticateAgent, pass agentId to updateSkills
- POST /api/agents/:id/skills (line 816-819): Added authenticateAgent, pass agentId to addSkill
- DELETE /api/agents/:id/skills (line 821-823): Added authenticateAgent, pass agentId to removeSkill (with undefined for type param)
- GET routes left unchanged (no auth for reads)

### Step 3b: app/api/agents/[id]/skills/route.ts - Auth wired into PATCH, POST, DELETE
- Added `import { authenticateAgent } from '@/lib/agent-auth'`
- PATCH handler: auth extracted before updateSkills call
- POST handler: auth extracted before addSkill call
- DELETE handler: auth extracted before removeSkill call
- GET handler left unchanged

### Step 3c: app/api/agents/[id]/skills/settings/route.ts - Auth wired into PUT
- Added `import { authenticateAgent } from '@/lib/agent-auth'`
- PUT handler: auth extracted before saveSkillSettings call
- GET handler left unchanged

### Step 6a: headless-router.ts - Config deploy route added
- Added `import { deployConfigToAgent } from '@/services/agents-config-deploy-service'` after skills-service import
- New route: POST /api/agents/:id/config/deploy (lines 826-836)
- Route requires auth (returns 403 on failure), passes agentId to deployConfigToAgent

### Step 6b: Next.js config deploy route created
- New file: app/api/agents/[id]/config/deploy/route.ts
- POST handler with auth gate (403 on failure), JSON body parsing, delegates to deployConfigToAgent

## Files Modified
1. services/headless-router.ts - 4 skills route auth + 1 import + 1 new route
2. app/api/agents/[id]/skills/route.ts - import + 3 auth blocks
3. app/api/agents/[id]/skills/settings/route.ts - import + 1 auth block
4. app/api/agents/[id]/config/deploy/route.ts - NEW file
