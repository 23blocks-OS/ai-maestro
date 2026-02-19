# Quick Fix: Add file locking to task-registry.ts write operations
Generated: 2026-02-17T00:43

## Change Made
- File: `lib/task-registry.ts`
  - Line 13: Added `import { withLock } from '@/lib/file-lock'`
  - Lines 96-125: `createTask` now returns `Promise<Task>`, body wrapped in `withLock('tasks', () => { ... })`
  - Lines 135-179: `updateTask` now returns `Promise<{ task: Task | null; unblocked: Task[] }>`, body wrapped in `withLock('tasks', () => { ... })`
  - Lines 184-198: `deleteTask` now returns `Promise<boolean>`, body wrapped in `withLock('tasks', () => { ... })`
  - Read-only functions (`loadTasks`, `saveTasks`, `resolveTaskDeps`, `getTask`, `wouldCreateCycle`) left synchronous

- File: `app/api/teams/[id]/tasks/route.ts`
  - Line 73: `createTask(...)` changed to `await createTask(...)`

- File: `app/api/teams/[id]/tasks/[taskId]/route.ts`
  - Line 66: `updateTask(...)` changed to `await updateTask(...)`
  - Line 108: `deleteTask(...)` changed to `await deleteTask(...)`

## Verification
- Pattern followed: Same `withLock` pattern as `lib/team-registry.ts` and `lib/transfer-registry.ts`
- All callers are in async route handlers, so `await` works correctly

## Files Modified
1. `lib/task-registry.ts` - Added withLock import, wrapped 3 write functions
2. `app/api/teams/[id]/tasks/route.ts` - Added await to createTask call
3. `app/api/teams/[id]/tasks/[taskId]/route.ts` - Added await to updateTask and deleteTask calls
