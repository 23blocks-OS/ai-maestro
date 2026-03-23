# Code Correctness Report: types

**Agent:** epcp-code-correctness-agent
**Domain:** types
**Files audited:** 8
**Date:** 2026-02-23T03:15:00Z
**Pass:** 9
**Run ID:** 1ebfebc5
**Finding ID Prefix:** CC-P9-A7

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P9-A7-001] assertValidServiceResult is defined but never called
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:27
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `assertValidServiceResult()` runtime guard was introduced as defense-in-depth for SF-024 (ServiceResult allows simultaneous `data` and `error`). The comment at line 25 says "Use in route handlers after service calls for defense-in-depth." However, a codebase-wide search confirms this function is never imported or called by any route handler or service. Multiple route handlers use the unsafe `result.data ?? {}` pattern without checking `result.error` first (e.g., `app/api/v1/health/route.ts:22`, `app/api/v1/info/route.ts:22`, `app/api/v1/route/route.ts:38`), which is exactly the bug class this guard was designed to catch.
- **Evidence:**
  ```typescript
  // types/service.ts:27-33
  export function assertValidServiceResult<T>(result: ServiceResult<T>, context?: string): void {
    if (result.data !== undefined && result.error !== undefined) {
      const ctx = context ? ` [${context}]` : ''
      console.error(`[ServiceResult]${ctx} BUG: result has both data and error set. error="${result.error}" status=${result.status}`)
    }
  }
  ```
  Grep for `assertValidServiceResult` across `**/*.ts` returns only the definition in `types/service.ts` -- zero call sites.
- **Fix:** Either (a) add `assertValidServiceResult(result, 'contextName')` calls in route handlers that consume ServiceResult, or (b) document that this guard is deferred to Phase 2 alongside the discriminated union refactor. The current state is misleading: the guard exists but provides zero protection.

## NIT

### [CC-P9-A7-002] ServiceResult data+error ambiguity documented but not enforced at type level
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:10-20
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** SF-024 documents that `ServiceResult<T>` allows simultaneous `data` and `error` fields and that a discriminated union refactor is tracked for Phase 2. This is acknowledged and well-documented. Noting here for completeness that the current type permits `{ data: T, error: string, status: 200 }` which callers must guard against manually. The runtime guard (CC-P9-A7-001) exists but is unused.
- **Evidence:**
  ```typescript
  export interface ServiceResult<T> {
    data?: T
    error?: string
    status: number
    headers?: Record<string, string>
  }
  ```
- **Fix:** Phase 2 discriminated union refactor as already planned. No action needed now beyond CC-P9-A7-001.

### [CC-P9-A7-003] Deprecated fields in Agent/AgentSummary lack JSDoc @deprecated annotation
- **File:** /Users/emanuelesabetta/ai-maestro/types/agent.ts:198-199, 472-475
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Several deprecated fields use only `// DEPRECATED:` comments instead of proper JSDoc `@deprecated` annotations. The `EmailTool.address` and `EmailTool.provider` fields (lines 359-362) correctly use `/** @deprecated ... */`, but the `Agent.alias` (line 199), `AgentSummary.alias` (line 473), `AgentSummary.displayName` (line 474), `AgentSummary.currentSession` (line 475), `CreateAgentRequest.alias` (line 501), `CreateAgentRequest.displayName` (line 502), `UpdateAgentRequest.alias` (line 524), and `UpdateAgentRequest.displayName` (line 525) use plain comments. TypeScript IDEs only show strikethrough for `@deprecated` JSDoc tags.
- **Evidence:**
  ```typescript
  // line 198-199 (Agent)
  // DEPRECATED: alias - use 'name' instead (kept temporarily for migration)
  alias?: string

  // line 359-362 (EmailTool) - correct pattern
  /** @deprecated Use addresses[] instead. Removal: Phase 2. */
  address?: string
  ```
- **Fix:** Change `// DEPRECATED:` comments to `/** @deprecated ... */` JSDoc annotations for IDE support.

### [CC-P9-A7-004] Host.type deprecated field lacks removal timeline
- **File:** /Users/emanuelesabetta/ai-maestro/types/host.ts:55-58
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `Host.type` field is marked as deprecated with comments explaining it's kept for backward compatibility during migration, but unlike `EmailTool.address` (which has "Removal: Phase 2"), there is no target removal version or phase specified.
- **Evidence:**
  ```typescript
  // DEPRECATED: type field is no longer meaningful
  // In a mesh network, all hosts are equal. Use isSelf for self-detection.
  // Kept for backward compatibility during migration - will be removed.
  type?: 'local' | 'remote'
  ```
- **Fix:** Add a removal target (e.g., "Phase 2" or "v1.0") and convert to `/** @deprecated */` JSDoc.

### [CC-P9-A7-005] GovernanceSyncMessage.payload typed as Record<string, unknown> loses type safety
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:77
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceSyncMessage.payload` is typed as `Record<string, unknown>` rather than a discriminated union based on the `type` field. For example, when `type` is `'manager-changed'`, the payload should contain `managerId`, `managerName`, `teams`, etc. The consuming code in `governance-sync.ts:206-209` manually casts with `as { managerId: string | null; managerName: string | null; teams: PeerTeamSummary[] }`, bypassing type checking.
- **Evidence:**
  ```typescript
  // types/governance.ts:73-78
  export interface GovernanceSyncMessage {
    type: GovernanceSyncType
    fromHostId: string
    timestamp: string
    payload: Record<string, unknown>  // type-specific data
  }

  // lib/governance-sync.ts:206-209 (consumer)
  const { managerId, managerName, teams } = rawPayload as {
    managerId: string | null
    managerName: string | null
    teams: PeerTeamSummary[]
  }
  ```
- **Fix:** Consider a discriminated union for the payload based on `type`, e.g.: `GovernanceSyncMessage = { type: 'manager-changed'; payload: ManagerChangedPayload } | { type: 'team-updated'; payload: TeamUpdatedPayload } | ...`. This would eliminate the unsafe `as` cast in consumers. Low priority given the small number of sync types currently.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/host.ts` -- Well-structured interface with clear documentation. Deprecated `type` field noted in NIT (CC-P9-A7-004) but functionally clean.
- `/Users/emanuelesabetta/ai-maestro/types/plugin-builder.ts` -- Clean tagged union design for `PluginSkillSelection`. All interfaces are straightforward data shapes. No logic, no functions, no issues.
- `/Users/emanuelesabetta/ai-maestro/types/session.ts` -- Minimal interface with clear field documentation. `SessionStatus` correctly derived from `Session['status']`.
- `/Users/emanuelesabetta/ai-maestro/types/team.ts` -- Well-designed state machine types for meeting reducer. `TeamMeetingAction` discriminated union is exhaustive. `Team.chiefOfStaffId` nullable design is intentional and handled correctly at conversion sites.
- `/Users/emanuelesabetta/ai-maestro/types/governance-request.ts` -- Clean cross-host governance types. `ConfigurationPayload` optional fields are intentional with runtime validation documented. `DEFAULT_GOVERNANCE_REQUESTS_FILE` const is correctly typed.

## Test Coverage Notes

- `parseSessionName`, `computeSessionName`, `parseNameForDisplay` (from `types/agent.ts`) have comprehensive tests in `tests/agent-utils.test.ts` including edge cases and inverse property tests.
- `assertValidServiceResult` (from `types/service.ts`) has zero test coverage (and is never called -- see CC-P9-A7-001).
- Type-only files (`host.ts`, `plugin-builder.ts`, `session.ts`, `team.ts`, `governance.ts`, `governance-request.ts`) export interfaces/types that are consumed by service and lib files with their own tests. No runtime functions to test directly in these files.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A7-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-23246459-ab12-46fe-b831-acdf810ee936.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
