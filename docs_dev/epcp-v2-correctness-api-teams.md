# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 6
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

No must-fix issues found.

## SHOULD-FIX

### [CC-001] Missing try/catch in DELETE /api/teams/[id]/tasks/[taskId]
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts:93-114
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The DELETE handler does not wrap its body in a try/catch block. If `await params`, `getTeam()`, `checkTeamAccess()`, or `deleteTask()` throw an unexpected exception, Next.js will return an opaque 500 error with no JSON body. The PUT handler in the same file has a try/catch, so this is an inconsistency within the same route file.
- **Evidence:**
```typescript
// Line 93-114: No try/catch
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  const team = getTeam(id)
  // ... no error boundary ...
  const deleted = deleteTask(id, taskId)
  if (!deleted) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
```
- **Fix:** Wrap the DELETE handler body in a try/catch with a `console.error` and a 500 JSON response, matching the pattern used in the PUT handler.

### [CC-002] Missing try/catch in GET /api/teams/[id]/tasks
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:7-25
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET handler does not wrap its body in a try/catch block. If `resolveTaskDeps()` or any other called function throws (e.g., JSON parse error in loadTasks, loadAgents failure in resolveTaskDeps), the error is unhandled at the route level. The POST handler in the same file has a try/catch, so this is inconsistent.
- **Evidence:**
```typescript
// Line 7-25: No try/catch
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const team = getTeam(id)
  // ...
  const tasks = loadTasks(id)
  const resolved = resolveTaskDeps(tasks) // can throw if loadAgents fails
  return NextResponse.json({ tasks: resolved })
}
```
- **Fix:** Wrap the GET handler body in a try/catch with a `console.error` and a 500 JSON response, matching the POST handler's pattern in the same file.

## NIT

### [CC-003] Unused import: TeamType in teams/route.ts
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts:5
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `TeamType` is imported from `@/types/governance` but never used in this file. The `type` field from the request body is passed as-is to `createTeam()`, which handles the TeamType validation internally via `validateTeamMutation`.
- **Evidence:**
```typescript
// Line 5: Imported but never referenced in file
import type { TeamType } from '@/types/governance'
```
- **Fix:** Remove the unused import: `import type { TeamType } from '@/types/governance'`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts` — No issues. Clean GET endpoint returning team and agent names.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts` — No issues. All three handlers (GET, PUT, DELETE) have proper try/catch, ACL checks, validation, and TeamValidationException handling.
- `/Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts` — No issues. Proper password verification, null handling for COS removal, agent existence check, TeamValidationException handling.

## Summary

The API team routes are well-structured with consistent patterns for validation, error handling, ACL checks, and business rule enforcement. The two should-fix findings are minor consistency gaps where some handlers lack try/catch blocks that peer handlers in the same file already have. The one nit is an unused type import. No security issues, no type safety issues, no logic bugs found. This is a clean codebase that has already addressed prior review findings effectively.
