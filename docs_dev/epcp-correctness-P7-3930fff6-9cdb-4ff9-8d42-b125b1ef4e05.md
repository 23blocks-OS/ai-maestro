# Code Correctness Report: api-other

**Agent:** epcp-code-correctness-agent
**Domain:** api-other
**Files audited:** 52
**Date:** 2026-02-22T22:25:00Z
**Pass:** 7

## MUST-FIX

No MUST-FIX issues found.

## SHOULD-FIX

### [CC-P7-A3-001] Outer catch in plugin-builder routes misattributes service errors as "Invalid request body" (400)
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/build/route.ts`:13-31
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `POST` handler wraps both `request.json()` and `buildPlugin(body)` in a single try/catch. If `buildPlugin` throws an unexpected error (e.g., filesystem failure not caught by its internal try/catch), the outer catch returns `{ error: 'Invalid request body' }` with status 400, which is misleading -- the request body was valid, the service failed. The same pattern exists in `scan-repo/route.ts` (lines 11-46) and `push/route.ts` (lines 12-70), though those at least log the actual error via `console.error`.
- **Evidence:**
  ```typescript
  // build/route.ts lines 13-31
  export async function POST(request: NextRequest) {
    try {
      const body = await request.json()        // JSON parse error
      const result = await buildPlugin(body)    // Service error
      // ...
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },      // Both error types get this message
        { status: 400 }
      )
    }
  }
  ```
- **Fix:** Separate the JSON parsing try/catch from the service call, similar to how other routes in this codebase do it:
  ```typescript
  export async function POST(request: NextRequest) {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const result = await buildPlugin(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }
  ```
  Apply the same fix to `scan-repo/route.ts` and `push/route.ts`.

## NIT

### [CC-P7-A3-002] Non-null assertion on `result.data!` in AMP v1 routes
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/v1/health/route.ts`:19, `/Users/emanuelesabetta/ai-maestro/app/api/v1/info/route.ts`:19, `/Users/emanuelesabetta/ai-maestro/app/api/v1/messages/pending/route.ts`:28,43,63, `/Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts`:37, `/Users/emanuelesabetta/ai-maestro/app/api/v1/register/route.ts`:28
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Seven locations use `result.data!` non-null assertion after an `if (result.error)` early return. While the runtime behavior is correct (the service layer always sets `data` on success paths), the TypeScript compiler cannot narrow `data` from `T | undefined` to `T` after an `error` check because `ServiceResult<T>` uses optional fields (`data?: T; error?: string`). The `!` assertions bypass type safety. This is a known design limitation of the current `ServiceResult` type (noted in prior passes as a type design improvement, not a bug).
- **Evidence:**
  ```typescript
  // health/route.ts:19
  return NextResponse.json(result.data!, { status: result.status, headers: result.headers })
  ```
- **Fix:** This would be eliminated by switching to a discriminated union `ServiceResult` type:
  ```typescript
  type ServiceResult<T> =
    | { data: T; status: number; headers?: Record<string, string>; error?: never }
    | { error: string; status: number; headers?: Record<string, string>; data?: never }
  ```
  This is a codebase-wide refactor, not specific to these routes.

## CLEAN

Files with no issues found:
- `app/api/config/route.ts` -- No issues
- `app/api/conversations/[file]/messages/route.ts` -- No issues
- `app/api/conversations/parse/route.ts` -- No issues
- `app/api/debug/pty/route.ts` -- No issues
- `app/api/docker/info/route.ts` -- No issues
- `app/api/domains/[id]/route.ts` -- No issues
- `app/api/domains/route.ts` -- No issues
- `app/api/export/jobs/[jobId]/route.ts` -- No issues
- `app/api/hosts/[id]/route.ts` -- No issues
- `app/api/hosts/exchange-peers/route.ts` -- No issues
- `app/api/hosts/health/route.ts` -- No issues (SSRF allowlist correctly implemented)
- `app/api/hosts/identity/route.ts` -- No issues
- `app/api/hosts/register-peer/route.ts` -- No issues
- `app/api/hosts/route.ts` -- No issues
- `app/api/hosts/sync/route.ts` -- No issues
- `app/api/marketplace/skills/[id]/route.ts` -- No issues
- `app/api/marketplace/skills/route.ts` -- No issues
- `app/api/meetings/[id]/route.ts` -- No issues (UUID validation, auth, ?? pattern safe)
- `app/api/meetings/route.ts` -- No issues
- `app/api/messages/forward/route.ts` -- No issues
- `app/api/messages/meeting/route.ts` -- No issues
- `app/api/messages/route.ts` -- No issues (auth, sender spoofing prevention correct)
- `app/api/organization/route.ts` -- No issues
- `app/api/plugin-builder/builds/[id]/route.ts` -- No issues
- `app/api/sessions/[id]/command/route.ts` -- No issues
- `app/api/sessions/[id]/rename/route.ts` -- No issues
- `app/api/sessions/[id]/route.ts` -- No issues
- `app/api/sessions/activity/route.ts` -- No issues
- `app/api/sessions/activity/update/route.ts` -- No issues (status validation correct)
- `app/api/sessions/create/route.ts` -- No issues (absolute path validation present)
- `app/api/sessions/restore/route.ts` -- No issues
- `app/api/sessions/route.ts` -- No issues
- `app/api/subconscious/route.ts` -- No issues
- `app/api/v1/agents/me/route.ts` -- No issues
- `app/api/v1/agents/resolve/[address]/route.ts` -- No issues
- `app/api/v1/agents/route.ts` -- No issues
- `app/api/v1/auth/revoke-key/route.ts` -- No issues
- `app/api/v1/auth/rotate-key/route.ts` -- No issues
- `app/api/v1/auth/rotate-keys/route.ts` -- No issues
- `app/api/v1/federation/deliver/route.ts` -- No issues (structural validation present)
- `app/api/v1/health/route.ts` -- Clean (see NIT CC-P7-A3-002 for `data!`)
- `app/api/v1/info/route.ts` -- Clean (see NIT CC-P7-A3-002 for `data!`)
- `app/api/v1/messages/[id]/read/route.ts` -- No issues
- `app/api/v1/messages/pending/route.ts` -- No issues (NaN guard correct)
- `app/api/v1/register/route.ts` -- No issues
- `app/api/v1/route/route.ts` -- No issues (role attestation headers forwarded)
- `app/api/webhooks/[id]/route.ts` -- No issues
- `app/api/webhooks/[id]/test/route.ts` -- No issues
- `app/api/webhooks/route.ts` -- No issues
- `app/api/plugin-builder/push/route.ts` -- See CC-P7-A3-001
- `app/api/plugin-builder/scan-repo/route.ts` -- See CC-P7-A3-001
- `app/api/plugin-builder/build/route.ts` -- See CC-P7-A3-001

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P7-A3-001, -002
- [x] My report file uses the UUID filename: epcp-correctness-P7-3930fff6-9cdb-4ff9-8d42-b125b1ef4e05.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
