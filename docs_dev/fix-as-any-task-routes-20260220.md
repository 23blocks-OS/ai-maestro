# Fix `as any` Type Casts in Task Route Files (CC-006)

**Date:** 2026-02-20
**Issue:** `as any` casts in task API route files bypassed type safety

## Changes

### File 1: `app/api/teams/[id]/tasks/route.ts`
- Imported `CreateTaskParams` from `@/services/teams-service`
- Changed `{ ...body, requestingAgentId } as any` to `{ ...body, requestingAgentId } as CreateTaskParams`

### File 2: `app/api/teams/[id]/tasks/[taskId]/route.ts`
- Imported `UpdateTaskParams` from `@/services/teams-service`
- Changed `{ ...body, requestingAgentId } as any` to `{ ...body, requestingAgentId } as UpdateTaskParams`

## Verification
- Both interfaces (`CreateTaskParams`, `UpdateTaskParams`) are exported from `services/teams-service.ts` (lines 68-85)
- Both include `requestingAgentId?: string` field, matching the spread pattern
- `npx tsc --noEmit` produces zero errors specific to the modified files
