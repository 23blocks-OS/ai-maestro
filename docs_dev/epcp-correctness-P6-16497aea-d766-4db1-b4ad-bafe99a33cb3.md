# Code Correctness Report: api-routes

**Agent:** epcp-code-correctness-agent
**Domain:** api-routes
**Files audited:** 37
**Date:** 2026-02-22T06:13:00Z
**Pass:** 6

## MUST-FIX

### [CC-P6-A0-001] Missing `await` on async `registerAgent()` call -- endpoint returns `null` instead of data
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/register/route.ts:15`
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced from service declaration to route call)
- **Description:** `registerAgent` in `services/agents-core-service.ts:727` is declared as `export async function registerAgent(...)` returning `Promise<ServiceResult<...>>`. However, the route at line 15 calls it without `await`:
  ```typescript
  const result = registerAgent(body)  // line 15 -- result is a Promise, not ServiceResult
  ```
  Because `result` is a Promise object (not the resolved value):
  - `result.error` is `undefined` (Promise has no `.error` property), so the error-path check at line 17 is always skipped.
  - `result.data` is `undefined`, so `NextResponse.json(undefined)` is returned, which serializes as `null`.
  - The endpoint **always returns HTTP 200 with a `null` body** regardless of success or failure.
  - If `registerAgent` throws, the error propagates as an unhandled promise rejection (no try-catch in this handler) and the client gets no response.
- **Evidence:**
  ```typescript
  // app/api/agents/register/route.ts:10-24
  export async function POST(request: Request) {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = registerAgent(body)   // <-- MISSING await

    if (result.error) {                  // <-- Always undefined on a Promise
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)  // <-- result.data is undefined → returns null
  }
  ```
  Service signature:
  ```typescript
  // services/agents-core-service.ts:727
  export async function registerAgent(body: RegisterAgentParams): Promise<ServiceResult<{...}>>
  ```
- **Fix:** Add `await` before the call:
  ```typescript
  const result = await registerAgent(body)
  ```

## SHOULD-FIX

*(none)*

## NIT

*(none)*

## CLEAN

Files with no issues found:
- `app/api/agents/[id]/amp/addresses/[address]/route.ts` — No issues (PATCH and DELETE correctly `await` async service calls; GET calls sync `getAMPAddress`)
- `app/api/agents/[id]/amp/addresses/route.ts` — No issues (POST correctly `await`s `addAMPAddressToAgent`; GET calls sync `listAMPAddresses`)
- `app/api/agents/[id]/database/route.ts` — No issues (both handlers `await` async service calls)
- `app/api/agents/[id]/docs/route.ts` — No issues (all handlers `await` async service calls)
- `app/api/agents/[id]/email/addresses/[address]/route.ts` — No issues (PATCH and DELETE correctly `await` async calls; GET calls sync function)
- `app/api/agents/[id]/email/addresses/route.ts` — No issues (POST correctly `await`s; GET calls sync function)
- `app/api/agents/[id]/graph/code/route.ts` — No issues (all handlers `await` async service calls)
- `app/api/agents/[id]/index-delta/route.ts` — No issues (`await`s async `runDeltaIndex`)
- `app/api/agents/[id]/messages/route.ts` — No issues (both handlers `await` async service calls)
- `app/api/agents/[id]/skills/route.ts` — No issues (GET calls sync `getSkillsConfig`; PATCH/POST/DELETE `await` async calls)
- `app/api/agents/[id]/tracking/route.ts` — No issues (both handlers `await` async service calls)
- `app/api/agents/health/route.ts` — No issues (`await`s async `proxyHealthCheck`)
- `app/api/agents/import/route.ts` — No issues (`await`s async `importAgent`)
- `app/api/agents/unified/route.ts` — No issues (`await`s async `getUnifiedAgents`)
- `app/api/conversations/parse/route.ts` — No issues (calls sync `parseConversationFile`)
- `app/api/governance/reachable/route.ts` — No issues (calls sync `loadAgents` and `checkMessageAllowed`)
- `app/api/governance/route.ts` — No issues (calls sync `loadGovernance` and `getAgent`)
- `app/api/governance/trust/route.ts` — No issues (GET calls sync `listTrustedManagers`; POST `await`s async `addTrust`)
- `app/api/hosts/exchange-peers/route.ts` — No issues (`await`s async `exchangePeers`)
- `app/api/hosts/health/route.ts` — No issues (`await`s async `checkRemoteHealth`)
- `app/api/hosts/register-peer/route.ts` — No issues (`await`s async `registerPeer`)
- `app/api/meetings/[id]/route.ts` — No issues (all handlers call sync functions)
- `app/api/meetings/route.ts` — No issues (all handlers call sync functions)
- `app/api/organization/route.ts` — No issues (both handlers call sync functions)
- `app/api/sessions/[id]/command/route.ts` — No issues (POST `await`s `sendCommand`; GET `await`s `checkIdleStatus`)
- `app/api/sessions/[id]/rename/route.ts` — No issues (`await`s async `renameSession`)
- `app/api/sessions/activity/update/route.ts` — No issues (calls sync `broadcastActivityUpdate`)
- `app/api/sessions/create/route.ts` — No issues (`await`s async `createSession`)
- `app/api/sessions/restore/route.ts` — No issues (GET `await`s `listRestorableSessions`; POST `await`s `restoreSessions`; DELETE calls sync `deletePersistedSession`)
- `app/api/teams/[id]/route.ts` — No issues (GET calls sync `getTeamById`; PUT `await`s async `updateTeamById`; DELETE `await`s async `deleteTeamById`)
- `app/api/teams/[id]/tasks/[taskId]/route.ts` — No issues (PUT `await`s async `updateTeamTask`; DELETE `await`s async `deleteTeamTask`)
- `app/api/teams/[id]/tasks/route.ts` — No issues (GET calls sync `listTeamTasks`; POST `await`s async `createTeamTask`)
- `app/api/v1/auth/revoke-key/route.ts` — No issues (`await`s async `revokeKey`)
- `app/api/v1/auth/rotate-key/route.ts` — No issues (`await`s async `rotateKey`)
- `app/api/v1/governance/requests/route.ts` — No issues (POST `await`s async calls; GET calls sync `listCrossHostRequests`)
- `app/api/webhooks/route.ts` — No issues (both handlers call sync functions)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (confirmed service function is async, route lacks await)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
- [x] My finding IDs use the assigned prefix: CC-P6-A0-001
- [x] My report file uses the UUID filename: epcp-correctness-P6-16497aea-d766-4db1-b4ad-bafe99a33cb3.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (N/A -- tests are in another domain)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
