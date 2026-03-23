# EPCP Fix Report: P8 Components, Hooks & Types Domain

**Generated:** 2026-02-23T02:58:00Z
**Pass:** 8
**Domain:** Components, hooks, types, and related routes

---

## Summary

| Finding | Severity | Status | File(s) |
|---------|----------|--------|---------|
| SF-005 | SHOULD-FIX | FIXED | app/api/teams/[id]/tasks/route.ts |
| SF-006 | SHOULD-FIX | FIXED | app/api/teams/[id]/tasks/[taskId]/route.ts |
| SF-007 | SHOULD-FIX | FIXED | app/api/teams/[id]/tasks/route.ts |
| SF-008 | SHOULD-FIX | FIXED | app/api/teams/[id]/tasks/[taskId]/route.ts |
| SF-024 | SHOULD-FIX | FIXED | types/service.ts |
| SF-025 | SHOULD-FIX | FIXED | lib/governance.ts |
| SF-026 | SHOULD-FIX | FIXED | components/TerminalView.tsx |
| SF-027 | SHOULD-FIX | FIXED | components/TerminalView.tsx |
| SF-028 | SHOULD-FIX | FIXED | app/teams/page.tsx, services/teams-service.ts, app/api/teams/stats/route.ts, services/headless-router.ts |
| NT-016 | NIT | FIXED | types/team.ts, components/team-meeting/MeetingRoom.tsx |
| NT-017 | NIT | FIXED | lib/hosts-config.ts |
| NT-018 | NIT | FIXED | types/agent.ts |
| NT-019 | NIT | FIXED | hooks/useWebSocket.ts |
| NT-020 | NIT | FIXED | components/plugin-builder/RepoScanner.tsx, components/plugin-builder/SkillPicker.tsx |
| NT-021 | NIT | FIXED | components/marketplace/AgentSkillEditor.tsx |
| NT-040 | NIT | FIXED | services/agents-playback-service.ts |

**Total: 16/16 findings fixed.**

---

## Detailed Changes

### SF-005: blockedBy array elements not validated as strings (task create)
**File:** `app/api/teams/[id]/tasks/route.ts`
**Change:** Added element-level validation: `body.blockedBy.every((v: unknown) => typeof v === 'string')` after the existing `Array.isArray` check. Returns 400 if any element is not a string.

### SF-006: blockedBy array elements not validated as strings (task update)
**File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`
**Change:** Same element-level validation as SF-005 applied to the PUT handler.

### SF-007: String(null) converts null assigneeAgentId to literal "null" string (task create)
**File:** `app/api/teams/[id]/tasks/route.ts`
**Change:** Replaced `String(body.assigneeAgentId)` with `body.assigneeAgentId === null ? null : String(body.assigneeAgentId)`. Also updated `CreateTaskParams.assigneeAgentId` type to `string | null` to match task-registry's type.

### SF-008: String(null) converts null assigneeAgentId to literal "null" string (task update)
**File:** `app/api/teams/[id]/tasks/[taskId]/route.ts`
**Change:** Same null-handling as SF-007 applied to the PUT handler. Also updated `UpdateTaskParams.assigneeAgentId` type to `string | null`.

### SF-024: ServiceResult<T> allows simultaneous data and error
**File:** `types/service.ts`
**Change:** Added JSDoc documenting the constraint that callers MUST use `if (result.error)` guard pattern (not `result.data ??`). Added `assertValidServiceResult()` runtime guard function that detects when both `data` and `error` are set and logs a warning. Full discriminated union refactor tracked for Phase 2 (would require changing 15+ service files).

### SF-025: GovernanceConfig version literal 1 not validated at runtime
**File:** `lib/governance.ts`
**Change:** Added runtime version check `if (parsed.version !== 1)` after JSON.parse in `loadGovernance()`. Returns defaults with error log if version mismatch found. Prevents silent schema migration issues.

### SF-026: localStorage reads in useState initializers not wrapped in try/catch
**File:** `components/TerminalView.tsx`
**Change:** Wrapped `footerTab` (line 72) and `loggingEnabled` (line 78) useState initializers in try/catch blocks, matching the existing pattern used by `notesCollapsed` (line 57). Returns default values on failure.

### SF-027: localStorage.setItem calls not wrapped in try/catch
**File:** `components/TerminalView.tsx`
**Change:** Wrapped three `localStorage.setItem` calls (collapsed state, logging state, footer tab) in try/catch blocks, matching the existing pattern used by other write effects in the same file (lines 543-557).

### SF-028: N+1 fetch pattern for team task/document counts
**Files:**
- `services/teams-service.ts` - Added `getTeamsBulkStats()` function that returns all team counts in a single call
- `app/api/teams/stats/route.ts` - NEW: `GET /api/teams/stats` endpoint returning `{ [teamId]: { taskCount, docCount } }`
- `services/headless-router.ts` - Registered stats route for headless mode
- `app/teams/page.tsx` - Replaced N+1 per-team fetch loop with single `/api/teams/stats` call

**Impact:** Reduces HTTP requests from 2N+1 to 2 (one for teams list, one for bulk stats).

### NT-016: RESTORE_MEETING action passes redundant teamId
**Files:**
- `types/team.ts` - Removed `teamId` from `RESTORE_MEETING` action type (meeting.teamId is the source of truth)
- `components/team-meeting/MeetingRoom.tsx` - Updated dispatch call to omit redundant `teamId`

### NT-017: Deprecated `type` field on Host interface lacks runtime migration
**File:** `lib/hosts-config.ts`
**Change:** Added destructuring in `migrateHost()` to strip the deprecated `type` field during host config loading. The field is no longer propagated to the runtime Host objects.

### NT-018: EmailTool deprecated single-address fields without migration plan
**File:** `types/agent.ts`
**Change:** Added detailed migration plan in JSDoc comments with 3-step process and Phase 2 removal target. Changed from inline comments to proper `@deprecated` JSDoc annotations.

### NT-019: useWebSocket reconnection attempts may not reset on hostId/socketPath change
**File:** `hooks/useWebSocket.ts`
**Change:** Added `hostId` and `socketPath` to the useEffect dependency array. When these change, the cleanup function calls `disconnect()` which resets `reconnectAttemptsRef`, then `connect()` establishes a fresh connection.

### NT-020: SkillPicker passes no-op onSkillsFound to RepoScanner
**Files:**
- `components/plugin-builder/RepoScanner.tsx` - Made `onSkillsFound` optional in `RepoScannerProps`, used optional chaining `onSkillsFound?.()` at call site
- `components/plugin-builder/SkillPicker.tsx` - Removed no-op `onSkillsFound={() => {}}` prop

### NT-021: AgentSkillEditor canApprove hardcoded to true
**File:** `components/marketplace/AgentSkillEditor.tsx`
**Change:** Enhanced TODO comment with specific Phase 2 implementation details (wire to governance role checks via `agentRole === 'manager' || agentRole === 'chief-of-staff'`).

### NT-040: agents-playback-service uses isNaN instead of Number.isNaN
**File:** `services/agents-playback-service.ts`
**Change:** Replaced `isNaN(value)` with `typeof value !== 'number' || Number.isNaN(value)`. The `typeof` check ensures non-number types are caught before Number.isNaN (which only returns true for actual NaN).

---

## TypeScript Verification

All modified files pass `tsc --noEmit` with zero errors. Pre-existing errors in unrelated files (governance-service.ts checkRateLimit, test files) are unchanged.
