# Code Correctness Report: api-teams

**Agent:** epcp-code-correctness-agent
**Domain:** api-teams
**Files audited:** 8
**Date:** 2026-02-19T17:30:00Z

## MUST-FIX

### [CC-001] Missing JSON parse error handling in POST /api/teams
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts:16
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `request.json()` is called without a try/catch for malformed JSON. If a client sends an invalid JSON body, this will throw an unhandled exception that falls through to the generic catch block on line 34, returning a 500 error. The PUT handler in `[id]/route.ts:42` correctly wraps this in a try/catch returning 400. The POST route should do the same.
- **Evidence:**
  ```typescript
  // teams/route.ts:16 — no JSON parse protection
  const body = await request.json()

  // Compare with [id]/route.ts:42 — correct pattern
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  ```
- **Fix:** Wrap `request.json()` in a try/catch that returns 400 for invalid JSON, matching the pattern in `[id]/route.ts:42`.

### [CC-002] Missing JSON parse error handling in POST /api/teams/[id]/chief-of-staff
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:13
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-001. `request.json()` is called without a try/catch. A malformed JSON body will return a 500 instead of the correct 400.
- **Evidence:**
  ```typescript
  // chief-of-staff/route.ts:13
  const body = await request.json()
  ```
- **Fix:** Wrap in try/catch returning 400 for invalid JSON.

### [CC-003] Missing JSON parse error handling in POST /api/teams/[id]/tasks
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:49
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-001/CC-002. `request.json()` on line 49 has no JSON parse protection.
- **Evidence:**
  ```typescript
  // tasks/route.ts:49
  const body = await request.json()
  ```
- **Fix:** Wrap in try/catch returning 400 for invalid JSON.

### [CC-004] Missing JSON parse error handling in PUT /api/teams/[id]/tasks/[taskId]
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/[taskId]/route.ts:28
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as above. `request.json()` on line 28 has no JSON parse protection.
- **Evidence:**
  ```typescript
  // tasks/[taskId]/route.ts:28
  const body = await request.json()
  ```
- **Fix:** Wrap in try/catch returning 400 for invalid JSON.

### [CC-005] SSRF vulnerability in agent transfer endpoint — user-controlled URL used for internal fetch
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:56-66
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `targetHostUrl` from the request body is user-controlled and after minimal normalization, used in a `fetch()` call to send the agent export data. An attacker on localhost could set `targetHostUrl` to any internal URL (e.g., `http://169.254.169.254/latest/meta-data/` on cloud, or any other internal service) and the server would POST agent data to it. Additionally, line 66 makes a self-referential fetch to `getSelfHost().url` to export the agent, which is a code smell (the server calls its own API). While Phase 1 is localhost-only, this is still exploitable by any local process.
- **Evidence:**
  ```typescript
  // line 56-61: minimal URL validation
  let normalizedUrl = targetHostUrl.trim()
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `http://${normalizedUrl}`
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '')

  // line 95: attacker-controlled URL used for fetch
  const importResponse = await fetch(`${normalizedUrl}/api/agents/import`, {
    method: 'POST',
    body: formData
  })
  ```
- **Fix:** Validate that `targetHostUrl` matches a known host from `hosts.json` configuration. Reject URLs that don't correspond to registered mesh hosts.

### [CC-006] Missing JSON parse error handling in POST /api/agents/[id]/transfer
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:48
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `request.json()` is called without try/catch on line 48. Malformed JSON body returns 500 instead of 400.
- **Evidence:**
  ```typescript
  const body: HostTransferRequest = await request.json()
  ```
- **Fix:** Wrap in try/catch returning 400 for invalid JSON.

## SHOULD-FIX

### [CC-007] POST /api/teams missing ACL check — inconsistent with GET/PUT/DELETE
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/route.ts:14-33
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST handler in `teams/route.ts` does not extract `X-Agent-Id` from headers or call `checkTeamAccess()`. All other team endpoints (`[id]/route.ts` GET/PUT/DELETE, tasks GET/POST, tasks/[taskId] PUT/DELETE) consistently check ACL. While team creation may intentionally be open, the inconsistency is worth noting. If a non-team-member agent can create teams, this is acceptable; if not, an ACL check is missing.
- **Evidence:**
  ```typescript
  // POST handler — no agentId extraction, no checkTeamAccess
  export async function POST(request: NextRequest) {
    const body = await request.json()
    const { name, description, agentIds, type, chiefOfStaffId } = body
    // ... creates team directly
  ```
- **Fix:** Either add ACL check or add a comment explicitly documenting that team creation is intentionally unrestricted.

### [CC-008] DELETE /api/teams/[id] allows deletion of non-existent team silently when not closed
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/route.ts:80-92
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** On line 80, `getTeam(id)` is called to check if it's a closed team, but if team is null (team not found), the code falls through to line 89 `deleteTeam(id)` which returns false, triggering the 404 on line 91. This works correctly but the flow is convoluted — the team existence check happens twice (once in the closed-team guard, once in deleteTeam). More importantly, if `checkTeamAccess` runs before `getTeam`, it loads the team internally too (line 47 of team-acl.ts), making this 3 loads for the same team.
- **Evidence:**
  ```typescript
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })  // loads team #1
  // ...
  const team = getTeam(id)  // loads team #2
  if (team && team.type === 'closed') { ... }
  const deleted = await deleteTeam(id)  // loads team #3 (inside withLock)
  ```
- **Fix:** Consider caching the team lookup or passing the already-loaded team to avoid triple file reads per DELETE request.

### [CC-009] Transfer endpoint self-fetch creates unnecessary HTTP round-trip
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:65-66
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The transfer handler calls its own server's export API via HTTP (`fetch(selfHost.url/api/agents/${agent.id}/export)`). This creates a full HTTP round-trip to the same process. It should import and call the export logic directly.
- **Evidence:**
  ```typescript
  const selfHost = getSelfHost()
  const exportResponse = await fetch(`${selfHost.url}/api/agents/${agent.id}/export`)
  ```
- **Fix:** Import the export function directly from the export route module instead of making a self-referential HTTP request.

### [CC-010] Transfer endpoint missing `mode` validation
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:49
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The `mode` field from the request body is typed as `'move' | 'clone'` in the interface but never validated at runtime. If a client sends `mode: 'invalid'`, the code proceeds without moving/cloning — it effectively acts as `clone` (no deletion). The interface type only provides compile-time safety, not runtime enforcement.
- **Evidence:**
  ```typescript
  const { targetHostUrl, mode, newAlias, cloneRepositories } = body
  // mode is never validated — if mode !== 'move', the delete block is skipped
  if (mode === 'move') { ... }
  ```
- **Fix:** Add runtime validation: `if (mode !== 'move' && mode !== 'clone') return NextResponse.json({ error: 'mode must be "move" or "clone"' }, { status: 400 })`.

### [CC-011] Rate limit in v1/route uses same function name as lib/rate-limit but different implementation
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:79
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The v1/route handler defines its own `checkRateLimit` function (line 79) with a completely different signature and behavior than `lib/rate-limit.ts`'s `checkRateLimit`. The v1/route version is a sliding window counter; the lib version tracks failures only. This is confusing since `chief-of-staff/route.ts` imports from `lib/rate-limit`. The local function shadowing could cause bugs if someone tries to refactor and moves imports around.
- **Evidence:**
  ```typescript
  // v1/route/route.ts:79 — local definition
  function checkRateLimit(agentId: string): RateLimitResult { ... }

  // lib/rate-limit.ts:13 — module export
  export function checkRateLimit(key, maxAttempts, windowMs): { allowed, retryAfterMs } { ... }
  ```
- **Fix:** Rename the local function in v1/route to `checkAMPRateLimit` or move it to a shared module with a distinct name.

### [CC-012] v1/route rate limiter cleanup triggers conditionally on count modulo, not reliably
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:94
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The cleanup logic on line 94 triggers when `entry.count % 100 === 0 || rateLimitMap.size > 500`. But `entry.count` resets every 60 seconds (window expires), so it never reaches 100 under normal conditions (rate limit is 60/min). The `size > 500` condition is the only effective cleanup trigger, but by then 500+ agent entries have accumulated. Unlike `lib/rate-limit.ts` which has a proper setInterval cleanup, this rate limiter relies on request-triggered cleanup that may never fire.
- **Evidence:**
  ```typescript
  // Line 94: count % 100 === 0 is effectively dead code (max count before window reset = 60)
  if (entry.count % 100 === 0 || rateLimitMap.size > 500) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key)
    }
  }
  ```
- **Fix:** Use a periodic `setInterval` cleanup (like `lib/rate-limit.ts` does) or trigger cleanup on every Nth request regardless of count.

### [CC-013] v1/route accepts body.from without validation, enabling sender address spoofing
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:352-353
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** For non-mesh-forwarded requests, the sender address is derived from the authenticated agent's registry data (line 378-381), which is correct. However, for mesh-forwarded requests, `body.from` is trusted directly (line 376-377). The only mitigation is a `console.warn` on line 363 if tenant doesn't match — but the message is still delivered with the potentially spoofed address. A compromised mesh host could impersonate any sender.
- **Evidence:**
  ```typescript
  // line 376-377: mesh-forwarded from is trusted without enforcement
  if (isMeshForwarded && body.from) {
    senderAddress = body.from
  }
  // line 362-363: only a warning, no rejection
  console.warn(`...possible address spoofing`)
  ```
- **Fix:** Either reject messages where sender tenant doesn't match forwarding host, or mark the message with a `_unverified_sender` flag so the recipient knows the sender address was not verified.

### [CC-014] Governance password rate limit key is global, not per-IP or per-agent
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts:26
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The rate limit key for governance password verification is hardcoded to `'governance-password'`. This means a single attacker making 5 failed attempts will lock out ALL legitimate users from changing the chief-of-staff on ANY team for 60 seconds. In Phase 1 (localhost), this is a denial-of-service vector for any local process.
- **Evidence:**
  ```typescript
  const rateCheck = checkRateLimit('governance-password')
  ```
- **Fix:** Use a per-team-id or per-agent key: `checkRateLimit(\`governance-password-${id}\`)` to limit the blast radius.

## NIT

### [CC-015] Triple file reads per team resource access
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/tasks/route.ts:13-23
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The GET tasks handler calls `getTeam(id)` (loads teams file), then `checkTeamAccess()` (loads teams file again internally), then proceeds. This pattern of double-loading the teams file per request is consistent across all `[id]/*` routes. Not a bug, but wasteful I/O.
- **Evidence:**
  ```typescript
  const team = getTeam(id)           // file read #1
  // ...
  const access = checkTeamAccess(...)  // getTeam called internally — file read #2
  ```
- **Fix:** Consider having `checkTeamAccess` accept the already-loaded team object, or cache the teams file for the duration of a request.

### [CC-016] Inconsistent error message format — some use generic message, some expose error details
- **File:** Multiple files
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Error responses are inconsistent. `[id]/route.ts:25` returns `{ error: 'Internal server error' }` on catch, while `teams/route.ts:41` returns `{ error: error.message }` on catch. `chief-of-staff/route.ts:74` also exposes error messages. Leaking error messages could expose internal paths or implementation details.
- **Evidence:**
  ```typescript
  // [id]/route.ts:25 — generic (good)
  { error: 'Internal server error' }

  // teams/route.ts:41 — exposes error detail
  { error: error instanceof Error ? error.message : 'Failed to create team' }
  ```
- **Fix:** Standardize: always return generic error messages to the client, log details server-side only.

### [CC-017] parseAMPAddress does not validate name or tenant for empty strings
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:117-143
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `parseAMPAddress` returns a result even if `name` is empty (e.g., `@foo.bar.local` would return `{ name: '', tenant: 'foo', ... }`). This could cause downstream issues if the empty name is used as a recipient lookup.
- **Evidence:**
  ```typescript
  const name = address.substring(0, atIndex)  // could be empty string if @ is first char
  // No check: if (!name) return null
  ```
- **Fix:** Add `if (!name) return null` after extracting the name.

### [CC-018] generateMessageId uses Math.random() which is not cryptographically secure
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/v1/route/route.ts:147-149
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `Math.random()` is used for the message ID random component. While message IDs don't need to be secret, using `crypto.randomUUID()` (already available since Node 16) would be more robust and is already the convention elsewhere in the codebase (via `uuid` package).
- **Evidence:**
  ```typescript
  const random = Math.random().toString(36).substring(2, 9)
  return `msg_${timestamp}_${random}`
  ```
- **Fix:** Use `crypto.randomUUID()` or `crypto.randomBytes(8).toString('hex')` since `crypto` is already imported.

### [CC-019] `agent.id` used unsanitized in `fetch()` URL in transfer endpoint
- **File:** /Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:66
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `agent.id` is interpolated into a URL without encoding. While agent IDs are UUIDs from the registry and should be safe, best practice is to use `encodeURIComponent()` to prevent URL injection.
- **Evidence:**
  ```typescript
  const exportResponse = await fetch(`${selfHost.url}/api/agents/${agent.id}/export`)
  ```
- **Fix:** Use `encodeURIComponent(agent.id)` in the URL template literal.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/app/api/teams/names/route.ts — No issues. Simple read-only endpoint with correct structure.
