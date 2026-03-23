# Code Correctness Report: types

**Agent:** epcp-code-correctness-agent
**Domain:** types
**Files audited:** 8
**Date:** 2026-02-23T02:29:00Z
**Pass:** 8
**Run ID:** 57d244f7
**Finding ID Prefix:** CC-P8-A6

## MUST-FIX

No MUST-FIX issues found.

## SHOULD-FIX

### [CC-P8-A6-001] ServiceResult<T> allows simultaneous `data` and `error` -- no discriminated union
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:10-15
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `ServiceResult<T>` has both `data` and `error` as optional fields. This means callers can construct an object with both `data` AND `error` set, or neither set. TypeScript will not catch misuse. A discriminated union pattern (`{ ok: true; data: T } | { ok: false; error: string }`) would make invalid states unrepresentable.
- **Evidence:**
  ```typescript
  export interface ServiceResult<T> {
    data?: T
    error?: string
    status: number
    headers?: Record<string, string>
  }
  ```
  Callers (e.g., `agents-memory-service.ts`) already use `ServiceResult<any>` extensively (tracked as NT-031). The loose typing means a caller can accidentally return `{ data: result, error: "something", status: 200 }` and TypeScript won't flag it.
- **Fix:** Consider refactoring to a discriminated union:
  ```typescript
  export type ServiceResult<T> =
    | { data: T; error?: undefined; status: number; headers?: Record<string, string> }
    | { data?: undefined; error: string; status: number; headers?: Record<string, string> }
  ```
  This is a cross-cutting change affecting 15+ service files, so it should be a dedicated refactor task.

### [CC-P8-A6-002] GovernanceConfig version field is literal `1` but JSON.parse returns `number`
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:28
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `version: 1` literal type on `GovernanceConfig` is intended as a strict discriminant for future schema migrations. However, `JSON.parse()` (used in `lib/governance.ts:41`) returns `number`, not the literal `1`. If a file on disk has `"version": 2`, TypeScript won't catch it at compile time because the cast is `const parsed: GovernanceConfig = JSON.parse(data)`. The same issue exists in `TransfersFile` (line 63) and `GovernanceRequestsFile` (`governance-request.ts:118`), and `TeamsFile` (`team.ts:42`), and `MeetingsFile` (`team.ts:64`).
- **Evidence:**
  ```typescript
  // types/governance.ts:28
  version: 1   // Strict literal type

  // lib/governance.ts:41 -- no runtime check
  const parsed: GovernanceConfig = JSON.parse(data)
  return parsed
  ```
- **Fix:** Add a runtime version check after parsing:
  ```typescript
  const parsed = JSON.parse(data) as GovernanceConfig
  if (parsed.version !== 1) {
    throw new Error(`Unsupported governance config version: ${parsed.version}`)
  }
  ```
  This applies to all file-format interfaces with `version: 1`.

## NIT

### [CC-P8-A6-003] parseSessionName does not guard against empty string input
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:93-99
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseSessionName("")` returns `{ agentName: "", index: 0 }`. While callers in practice always receive non-empty tmux session names, the function's JSDoc doesn't document this precondition and there's no assertion.
- **Evidence:**
  ```typescript
  export function parseSessionName(tmuxName: string): { agentName: string; index: number } {
    const match = tmuxName.match(/^(.+)_(\d+)$/)
    if (match) {
      return { agentName: match[1], index: parseInt(match[2], 10) }
    }
    return { agentName: tmuxName, index: 0 }
  }
  ```
- **Fix:** Either add a runtime guard (`if (!tmuxName) throw new Error(...)`) or document the precondition in the JSDoc. Low risk since tmux never produces empty session names, but defensive coding would be preferable.

### [CC-P8-A6-004] RESTORE_MEETING action passes redundant `teamId` alongside `meeting` which already has `teamId`
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:112
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `RESTORE_MEETING` action includes both `meeting: Meeting` (which has `teamId: string | null`) and a separate `teamId: string | null`. The consumer in `MeetingRoom.tsx:229` passes `meeting.teamId` for both, so they're always identical. The redundant field is unused in the reducer handler (line 165-181) -- it only reads from `action.meeting`.
- **Evidence:**
  ```typescript
  // types/team.ts:112
  | { type: 'RESTORE_MEETING'; meeting: Meeting; teamId: string | null }

  // MeetingRoom.tsx:229
  dispatch({ type: 'RESTORE_MEETING', meeting, teamId: meeting.teamId })

  // MeetingRoom.tsx:165-181 -- only uses action.meeting, never action.teamId
  case 'RESTORE_MEETING': {
    const agentIds = Array.isArray(action.meeting.agentIds) ? action.meeting.agentIds : []
    // ... no reference to action.teamId
  }
  ```
- **Fix:** Remove the redundant `teamId` from the action type, or if it's needed for a case where `teamId` should differ from `meeting.teamId`, document why.

### [CC-P8-A6-005] Deprecated `type` field on Host interface lacks runtime migration or validation
- **File:** /Users/emanuelesabetta/ai-maestro/types/host.ts:55-58
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** LIKELY
- **Description:** The `type` field is marked DEPRECATED with a comment saying "will be removed". No runtime migration strips this field from loaded configs, meaning old hosts.json files continue carrying it. This is cosmetic but could confuse consumers who see `type: 'local'` and assume it's meaningful.
- **Evidence:**
  ```typescript
  // DEPRECATED: type field is no longer meaningful
  // In a mesh network, all hosts are equal. Use isSelf for self-detection.
  // Kept for backward compatibility during migration - will be removed.
  type?: 'local' | 'remote'
  ```
- **Fix:** Either schedule removal (track as a task) or add migration code in the host loader to strip the field and write back.

### [CC-P8-A6-006] `EmailTool` has deprecated single-address fields without a migration plan
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:350-354
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `EmailTool.address` and `EmailTool.provider` are marked `@deprecated` with a comment "Remove after all agents migrated to addresses[]" but no migration code or removal timeline is specified. Similar to CC-P8-A6-005.
- **Evidence:**
  ```typescript
  // DEPRECATED: Legacy single-address fields (kept for migration)
  // Remove after all agents migrated to addresses[]
  address?: string              // @deprecated Use addresses[] instead
  provider?: 'local' | 'smtp'   // @deprecated Gateway concern, not identity
  ```
- **Fix:** Track removal as a backlog task with criteria for when migration is complete.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/plugin-builder.ts` -- No issues. Clean type-only file with well-structured tagged unions and interfaces.
- `/Users/emanuelesabetta/ai-maestro/types/session.ts` -- No issues. Simple interface with appropriate optional fields.

## Test Coverage Notes

- `parseSessionName`, `computeSessionName`, and `parseNameForDisplay` (types/agent.ts) are utility functions that would benefit from dedicated unit tests. They are tested indirectly through integration tests in `agents-core-service.ts` callers.
- The type files are mostly interfaces/types (no runtime logic to test) except for the three helper functions in agent.ts.
- `DEFAULT_GOVERNANCE_CONFIG` and `DEFAULT_GOVERNANCE_REQUESTS_FILE` are tested through `tests/governance.test.ts`.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A6-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-9c2ed7e0-b82e-44d6-9cee-21a6d97d0674.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (6 total)
- [x] My return message to the orchestrator is exactly 1-2 lines
