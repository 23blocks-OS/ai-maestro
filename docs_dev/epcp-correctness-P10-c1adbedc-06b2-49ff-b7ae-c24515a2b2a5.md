# Code Correctness Report: build-fixes

**Agent:** epcp-code-correctness-agent
**Domain:** build-fixes (type cast fixes after merge)
**Files audited:** 8
**Date:** 2026-02-22T11:56:00Z
**Pass:** 10
**Finding ID prefix:** CC-P10-A1

## MUST-FIX

No MUST-FIX issues found.

## SHOULD-FIX

### [CC-P10-A1-001] Unsafe cast of `payload.context` from `unknown` to `Record<string, unknown>`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:278
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `payload.context` field is typed as `unknown` in the `AMPEnvelopeMsg` interface (line 218). At line 278, it is cast directly to `Record<string, unknown> | undefined` without any runtime validation that it is actually an object. If a malformed AMP message file contains `context: "some string"`, `context: 42`, or `context: [1,2,3]`, the cast will succeed silently but downstream code expecting an object (e.g., `Object.keys(context)` or property access) could produce incorrect results or runtime errors.
- **Evidence:**
  ```typescript
  // AMPEnvelopeMsg interface (line 218):
  payload: {
    type?: string
    message?: string
    context?: unknown    // <-- typed as unknown
  }

  // Line 278 in convertAMPToMessage:
  context: (payload.context || undefined) as Record<string, unknown> | undefined,
  ```
  The `status` field has proper validation (lines 250-253 with `validStatuses.includes()`), and `priority` has a fallback default (line 273 `envelope.priority || 'normal'`), but `context` has no type-shape validation.
- **Fix:** Add a runtime check before casting:
  ```typescript
  context: (payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context))
    ? payload.context as Record<string, unknown>
    : undefined,
  ```

## NIT

### [CC-P10-A1-002] Non-null assertions on `result.data!` rely on implicit convention, not type narrowing
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts:19, /Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts:19, /Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts:28,43,63, /Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts:28, /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:37
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** All 7 uses of `result.data!` across the 5 API route files follow the same pattern: `if (result.error) return ...` followed by `result.data!`. The `ServiceResult<T>` type defines both `data?: T` and `error?: string` as optional, so TypeScript cannot narrow `data` to `T` after checking `error` is falsy. The non-null assertions are **safe at runtime** because:
  1. Every success path in the service functions (verified: `getHealthStatus`, `getProviderInfo`, `registerAgent`, `routeMessage`, `listPendingMessages`, `acknowledgePendingMessage`, `batchAcknowledgeMessages`) always returns `{ data: ..., status: ... }`.
  2. Every error path returns `{ error: ..., status: ... }` which is caught by the guard.

  However, this pattern is fragile: if a service function ever returns `{ status: 200 }` without `data`, the `!` would suppress the TypeScript warning and `NextResponse.json(undefined, ...)` would produce an empty/malformed response.

  A **better pattern** would be a discriminated union for `ServiceResult`:
  ```typescript
  type ServiceResult<T> =
    | { data: T; status: number; headers?: Record<string, string>; error?: never }
    | { error: string; status: number; headers?: Record<string, string>; data?: never }
  ```
  This would let TypeScript narrow `data` automatically after `if (result.error)` checks, eliminating all `!` assertions. This is a design improvement, not a bug -- all current uses are safe.

- **Evidence:**
  ```typescript
  // Example from health/route.ts (identical pattern in all 5 files):
  const result = getHealthStatus()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data!, {  // <-- ! assertion
    status: result.status,
    headers: result.headers
  })
  ```
- **Fix:** Consider refactoring `ServiceResult` to a discriminated union. Low priority since all current usages are verified safe.

### [CC-P10-A1-003] Priority cast relies on `||` fallback but lacks validation like `status` does
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:273
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `priority` field (line 273) uses `(envelope.priority || 'normal')` as a fallback and casts directly to the union type. Compare this with the `status` field (lines 250-253) which has explicit validation with `validStatuses.includes()`. If `envelope.priority` contains an unexpected string (e.g., `"critical"` from a future AMP version or a malformed file), the cast would pass a value that doesn't match any of the union members. This won't cause a runtime crash but could produce unexpected behavior in code that switches/matches on priority values.

  Similarly, `content.type` at line 276 uses `(payload.type || 'notification')` and casts directly without validation.

  The inconsistency between the validated `status` field and the unvalidated `priority` and `content.type` fields suggests a pattern that was partially applied.
- **Evidence:**
  ```typescript
  // Line 250-253: status is VALIDATED before cast
  const rawStatus = ampMsg.metadata?.status || ampMsg.local?.status || 'unread'
  const validStatuses: Message['status'][] = ['unread', 'read', 'archived']
  const status: Message['status'] = validStatuses.includes(rawStatus as Message['status']) ? (rawStatus as Message['status']) : 'unread'

  // Line 273: priority is NOT validated, just cast
  priority: (envelope.priority || 'normal') as 'high' | 'low' | 'normal' | 'urgent',

  // Line 276: content.type is NOT validated, just cast
  type: (payload.type || 'notification') as 'status' | 'system' | 'alert' | 'request' | 'response' | 'notification' | 'update' | 'task' | 'handoff' | 'ack',
  ```
- **Fix:** Apply the same validation pattern used for `status`:
  ```typescript
  const validPriorities: Message['priority'][] = ['low', 'normal', 'high', 'urgent']
  const rawPriority = envelope.priority || 'normal'
  const priority: Message['priority'] = validPriorities.includes(rawPriority as Message['priority'])
    ? (rawPriority as Message['priority']) : 'normal'
  ```

### [CC-P10-A1-004] Union type casts in agents-messaging-service.ts are safe but verbose
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-messaging-service.ts:221,227
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Lines 221 and 227 cast `priority` and `status` parameters (typed as `string` from the route query params) to their respective union types. These casts are **safe** because:
  1. Lines 213-214 validate `status` against `validStatuses` array and return 400 if invalid.
  2. Lines 216-217 validate `priority` against `validPriorities` array and return 400 if invalid.
  3. The function only reaches lines 221/227 after validation passes.

  The casts include `| undefined` in the union which correctly handles the case where the parameter was not provided (since the destructuring defaults are implicit `undefined`).
- **Evidence:**
  ```typescript
  // Validation (lines 210-218):
  const validStatuses = ['unread', 'read', 'archived']
  const validPriorities = ['low', 'normal', 'high', 'urgent']
  const { box = 'inbox', status, priority, from, to } = params
  if (status && !validStatuses.includes(status)) {
    return { error: `Invalid status...`, status: 400 }
  }
  if (priority && !validPriorities.includes(priority)) {
    return { error: `Invalid priority...`, status: 400 }
  }

  // Casts (lines 221, 227):
  const messages = await listAgentSentMessages(agentId, { priority: priority as 'high' | 'low' | 'normal' | 'urgent' | undefined, to })
  const messages = await listAgentInboxMessages(agentId, { status: status as 'unread' | 'read' | 'archived' | undefined, priority: priority as 'high' | 'low' | 'normal' | 'urgent' | undefined, from })
  ```
- **Fix:** No fix needed. The casts are safe after validation. Could be cleaned up with type aliases for readability but this is purely cosmetic.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts -- No issues (non-null assertion is safe, covered in NIT CC-P10-A1-002)
- /Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts -- No issues (same pattern as health, safe)
- /Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts -- No issues (3 non-null assertions, all safe after error guards)
- /Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts -- No issues (non-null assertion safe, has top-level catch)
- /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts -- No issues (non-null assertion safe, has top-level catch)
- /Users/emanuelesabetta/ai-maestro/services/amp-service.ts -- No issues (Agent type annotation at line 621 is correct: `let agent: Agent` matches the type imported from `@/types/agent` at line 66, and `createAgent` at line 646 returns `Promise<Agent>` per agent-registry.ts:349)

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| MUST-FIX | 0 | -- |
| SHOULD-FIX | 1 | Unsafe cast of `payload.context` from `unknown` without shape validation |
| NIT | 3 | Non-null assertions pattern fragility; inconsistent validation for priority/content.type; verbose but safe union casts |

**Overall assessment:** The type cast fixes are safe. The non-null assertions (`result.data!`) in API routes are justified because every service function's error path returns `{ error }` which triggers the early return, and every success path returns `{ data }`. The union type casts in `agents-messaging-service.ts` are safe because they follow validation guards. The `Agent` type annotation fix in `amp-service.ts` is correct. The one SHOULD-FIX is `payload.context` being cast from `unknown` to `Record<string, unknown>` without runtime type checking, which could pass non-object values through silently.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P10-A1-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P10-c1adbedc-06b2-49ff-b7ae-c24515a2b2a5.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (no test files in domain to check)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
