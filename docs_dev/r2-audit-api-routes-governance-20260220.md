# Code Correctness Report: API Routes (Governance + Messages)

**Agent:** epcp-code-correctness-agent (Round 2 - Independent Fresh Audit)
**Domain:** api-routes-governance-messages
**Files audited:** 9
**Date:** 2026-02-20T00:00:00Z

## File Inventory

| # | File | Handlers | LOC |
|---|------|----------|-----|
| 1 | app/api/governance/route.ts | GET | 16 |
| 2 | app/api/governance/manager/route.ts | POST | 65 |
| 3 | app/api/governance/password/route.ts | POST | 63 |
| 4 | app/api/governance/reachable/route.ts | GET | 63 |
| 5 | app/api/governance/transfers/route.ts | GET, POST | 144 |
| 6 | app/api/governance/transfers/[id]/resolve/route.ts | POST | 203 |
| 7 | app/api/messages/route.ts | GET, POST, PATCH, DELETE | 79 |
| 8 | app/api/agents/[id]/transfer/route.ts | POST | 33 |
| 9 | lib/agent-auth.ts | (support) | 69 |

---

## Identity & Authentication Matrix

| File | Handler | Auth Mechanism | Identity Source | Body Trust Issues |
|------|---------|---------------|-----------------|-------------------|
| governance/route.ts | GET | NONE | N/A (read-only) | None |
| governance/manager/route.ts | POST | Password in body | `body.agentId` (target), password proves authority | agentId from body is OK - it's the *target*, not the *actor* |
| governance/password/route.ts | POST | `body.currentPassword` for change | N/A (no identity needed) | None - password proves authority |
| governance/reachable/route.ts | GET | NONE | `query.agentId` (read-only lookup key) | Not an auth issue for reads |
| governance/transfers/route.ts | GET | NONE | N/A (read-only) | None |
| governance/transfers/route.ts | POST | NONE (authority via `body.requestedBy`) | `body.requestedBy` **TRUSTED FROM BODY** | **MUST-FIX** - see CC-001 |
| transfers/[id]/resolve/route.ts | POST | Bearer token + X-Agent-Id | `auth.agentId` (from token) | **CLEAN** - resolvedBy from auth |
| messages/route.ts | POST | Optional Bearer token | `auth.agentId` overrides `body.from` | Partially clean - see CC-002 |
| messages/route.ts | GET/PATCH/DELETE | NONE | query params | See CC-003 |
| agents/[id]/transfer/route.ts | POST | NONE | N/A | See CC-004 |

---

## MUST-FIX

### [CC-001] Transfer POST: `requestedBy` comes from untrusted body - privilege escalation vector
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:50-68`
- **Severity:** MUST-FIX
- **Confidence:** CONFIRMED (traced full code path)
- **Category:** security / api-contract
- **Description:** The POST handler reads `requestedBy` directly from the request body (line 50) and uses it for the authority check at line 67. There is NO authentication — no Bearer token, no password, no session verification. Any HTTP client can set `requestedBy` to the manager's UUID or any COS UUID and create transfer requests impersonating that privileged agent.

  Compare with `transfers/[id]/resolve/route.ts` which correctly uses `authenticateAgent()` to derive `resolvedBy` from a Bearer token (lines 27-48). The POST handler lacks this pattern entirely.

- **Evidence:**
  ```typescript
  // Line 50: requestedBy comes directly from untrusted body
  const { agentId, fromTeamId, toTeamId, requestedBy, note } = body

  // Line 67: Used for authorization check — but anyone can set this to any UUID
  if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
    return NextResponse.json({ error: 'Only MANAGER or Chief-of-Staff can request transfers' }, { status: 403 })
  }
  ```

- **Fix:** Add `authenticateAgent()` to the POST handler (same pattern as resolve/route.ts). Derive `requestedBy` from `auth.agentId`, not from body. If no auth headers are present, either reject or treat as system-owner action. Example:
  ```typescript
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const requestedBy = auth.agentId
  if (!requestedBy) {
    return NextResponse.json({ error: 'Agent authentication required' }, { status: 401 })
  }
  ```

### [CC-002] Messages POST: Unauthenticated requests can send as anyone via `body.from`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts:33-52`
- **Severity:** MUST-FIX
- **Confidence:** CONFIRMED (traced full code path)
- **Category:** security
- **Description:** When no `Authorization` and no `X-Agent-Id` headers are present, `authenticateAgent()` returns `{}` (no error, no agentId) — this is the "system owner / web UI" path. The code then proceeds with `body.from` as-is (line 47 only triggers when `auth.agentId` is truthy). This means any unauthenticated HTTP request can set `body.from` to any agent ID and send messages impersonating that agent.

  The code comment on lines 28-31 says "treated as coming from the system owner / web UI, and body.from is used as-is" — this is by design for the web UI. However, there is no way to distinguish the legitimate web UI from any other unauthenticated caller. In Phase 1 (localhost-only) this is acceptable, but the code currently sets `body.fromVerified = true` only for authenticated agents, which means unauthenticated messages get `fromVerified = undefined/false`, providing a weak signal. The concern is that the message filter (`checkMessageAllowed`) uses `fromAgent?.agentId || null` meaning a spoofed `from` field with a valid agent UUID would pass governance checks.

- **Evidence:**
  ```typescript
  // Line 37-43: authenticateAgent returns {} for no-headers case (no error)
  const auth = authenticateAgent(...)
  if (auth.error) { return ... }

  // Line 46-49: Only overrides body.from when authenticated
  if (auth.agentId) {
    body.from = auth.agentId
    body.fromVerified = true
  }
  // Otherwise body.from is used as-is with fromVerified = undefined
  ```

- **Fix:** For Phase 2 readiness, either:
  (a) Require authentication for all message sends (reject if no auth headers), or
  (b) When unauthenticated, force `body.from` to a well-known system identity (e.g., `"system"`) rather than trusting the body value, or
  (c) At minimum, add a comment/TODO and ensure message-filter treats unverified senders differently.

---

## SHOULD-FIX

### [CC-003] Messages GET/PATCH/DELETE: No authentication or authorization
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/messages/route.ts:8-78`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The GET, PATCH, and DELETE handlers have zero authentication. Any caller can:
  - Read any agent's inbox/sent messages by setting `?agent=<anyAgentId>`
  - Mark any agent's messages as read via PATCH
  - Delete any agent's messages via DELETE

  Phase 1 (localhost-only) mitigates this, but these handlers should be parity with POST which at least checks for auth headers. Without auth, any local process can silently read or delete another agent's messages.

- **Evidence:**
  ```typescript
  // GET — no auth at all, passes query params straight through
  export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const result = await getMessages({ agent: searchParams.get('agent'), ... })
  }
  // Same for PATCH and DELETE
  ```

- **Fix:** Add optional `authenticateAgent()` check to GET/PATCH/DELETE, at minimum verifying that an authenticated agent can only access their own messages. For the web UI (no auth headers), allow full access.

### [CC-004] agents/[id]/transfer: No authentication, SSRF via `targetHostUrl`
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/agents/[id]/transfer/route.ts:12-31`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED (traced into agents-transfer-service.ts)
- **Category:** security
- **Description:** The transfer endpoint has NO authentication. Any caller can trigger a full agent export+import to an arbitrary URL. In `agents-transfer-service.ts:996-1000`, the `targetHostUrl` is minimally validated (just prefixes http:// if missing) then used in `fetch()` calls to both the local server (line 1004) and the remote server (line 1027). This creates:
  1. **SSRF**: An attacker can set `targetHostUrl` to an internal service URL to exfiltrate agent data
  2. **Data exfiltration**: Agent export ZIP (containing keys, messages, database) is sent to any arbitrary URL
  3. **Agent deletion**: With `mode: 'move'`, the local agent is deleted after successful transfer

- **Evidence:**
  ```typescript
  // agents-transfer-service.ts:996-1000 — minimal URL validation
  let normalizedUrl = targetHostUrl.trim()
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `http://${normalizedUrl}`
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '')

  // Line 1027 — sends agent ZIP to any URL
  const importResponse = await fetch(`${normalizedUrl}/api/agents/import`, {
    method: 'POST',
    body: formData
  })
  ```

- **Fix:** Add authentication to the transfer route. Validate `targetHostUrl` against a whitelist of known hosts (`~/.aimaestro/hosts.json`). Require governance password for `mode: 'move'` operations.

### [CC-005] agents-transfer-service: Path traversal in ZIP extraction
- **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts:236-237`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The `extractZip` function joins `entry.fileName` directly from the ZIP archive with `destDir` without validating that the resulting path stays within `destDir`. A malicious ZIP with entries like `../../../etc/cron.d/evil` could write files outside the intended destination directory (Zip Slip vulnerability).

- **Evidence:**
  ```typescript
  // Line 237 — no path traversal check
  const fullPath = path.join(destDir, entry.fileName)
  // ...
  // Line 255 — writes to potentially escaped path
  const writeStream = fs.createWriteStream(fullPath)
  ```

- **Fix:** Add a path traversal check after computing `fullPath`:
  ```typescript
  const fullPath = path.join(destDir, entry.fileName)
  if (!fullPath.startsWith(destDir + path.sep) && fullPath !== destDir) {
    throw new Error(`Zip entry would escape destination: ${entry.fileName}`)
  }
  ```

### [CC-006] agents-transfer-service: Command injection via git clone
- **File:** `/Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts:195`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The `cloneRepository` function interpolates `repo.remoteUrl` and `targetPath` into a shell command string. If `remoteUrl` contains shell metacharacters (e.g., from a malicious agent export), this enables command injection. The `branch` variable is also interpolated without quoting.

- **Evidence:**
  ```typescript
  // Line 195 — shell command with string interpolation
  execSync(`git clone --branch ${branch} "${repo.remoteUrl}" "${targetPath}"`, {
  ```
  While `remoteUrl` and `targetPath` are in double quotes, `branch` is NOT quoted, allowing injection via a crafted `defaultBranch` value like `main; rm -rf /`.

- **Fix:** Quote the `branch` variable: `--branch "${branch}"`. Better yet, use `execFileSync('git', ['clone', '--branch', branch, repo.remoteUrl, targetPath])` to avoid shell interpretation entirely.

### [CC-007] Governance reachable endpoint: No authentication, information disclosure
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:12-57`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The reachable endpoint takes any `agentId` query parameter (validated only as alphanumeric) and returns the full list of agent UUIDs that agent can message. No authentication is required. This leaks the full team structure and agent membership to any caller. An attacker can enumerate all agents and their team relationships by querying with different agent IDs.

- **Evidence:**
  ```typescript
  // Line 12-14 — no auth, just reads agentId from query
  export async function GET(request: NextRequest) {
    const agentId = request.nextUrl.searchParams.get('agentId')
    // ...
    return NextResponse.json({ reachableAgentIds })
  }
  ```

- **Fix:** Add authentication. An agent should only be able to query their own reachable set, verified via Bearer token.

### [CC-008] Governance GET leaks managerId to all callers
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/route.ts:12`
- **Severity:** SHOULD-FIX
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The governance GET endpoint returns `managerId` (a UUID) to all callers without authentication. Combined with CC-001 (transfers POST trusts `requestedBy` from body), this provides the exact UUID needed to impersonate the manager. The comment on line 5 acknowledges this: "Phase 1: Intentionally exposes managerId for localhost-only usage."

- **Evidence:**
  ```typescript
  return NextResponse.json({
    hasPassword: !!config.passwordHash,
    hasManager: !!config.managerId,
    managerId: config.managerId,  // Leaks the manager UUID
    managerName,
  })
  ```

- **Fix:** For Phase 2, remove `managerId` from the unauthenticated response. Return only `hasManager: boolean` and `managerName` for display. The actual UUID should only be available to authenticated privileged agents.

---

## NIT

### [CC-009] password/route.ts: Missing `currentPassword` records a rate-limit failure
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/password/route.ts:34-35`
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** logic
- **Description:** When `currentPassword` is missing or not a string, the code calls `recordFailure()` before returning a 400 error. This means a client that simply forgets to include `currentPassword` in the body burns a rate-limit attempt. While not a security issue, it could lead to legitimate users being rate-limited by accidentally malformed requests.

- **Evidence:**
  ```typescript
  if (!currentPassword || typeof currentPassword !== 'string') {
    recordFailure('governance-password-change')  // Counts as failed attempt
    return NextResponse.json({ error: 'Invalid current password' }, { status: 400 })
  }
  ```

- **Fix:** Only call `recordFailure()` after an actual password mismatch (line 38-39), not for missing/malformed input. Return 400 without recording failure for validation errors.

### [CC-010] transfers/route.ts POST: rejectReason and resolution validated but never used in createTransferRequest
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/route.ts:82-91`
- **Severity:** NIT
- **Confidence:** LIKELY (would need to trace createTransferRequest)
- **Category:** logic
- **Description:** The POST handler validates `body.rejectReason` and `body.resolution` (lines 82-91) but only passes `{ agentId, fromTeamId, toTeamId, requestedBy, note }` to `createTransferRequest()` (line 136). The validated fields are never used. This appears to be dead validation code — possibly left over from a refactor where resolution was merged into the POST endpoint.

- **Evidence:**
  ```typescript
  // Lines 82-91: validates rejectReason and resolution
  if (body.rejectReason !== undefined && body.rejectReason !== null) { ... }
  if (body.resolution !== undefined && body.resolution !== null) { ... }

  // Line 136: only passes 5 fields, not rejectReason/resolution
  const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })
  ```

- **Fix:** Remove the dead validation for `rejectReason` and `resolution` from the POST handler. These belong only in the resolve endpoint.

### [CC-011] Rate limit uses single key for all governance operations of same type
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts:7`
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** security
- **Description:** The rate limiter uses fixed string keys like `'governance-manager-auth'` and `'governance-password-change'`. This means the rate limit is global — all clients share the same counter. In Phase 1 (single user, localhost), this is fine. But it means a legitimate user could be locked out by automated scanning from another local process.

- **Fix:** For Phase 2, consider per-IP or per-session rate limiting instead of global keys.

### [CC-012] reachable/route.ts: agentId format validation too loose for UUID-based system
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/reachable/route.ts:20`
- **Severity:** NIT
- **Confidence:** CONFIRMED
- **Category:** api-contract
- **Description:** The agentId is validated with `/^[a-zA-Z0-9_-]+$/` (alphanumeric + underscore + hyphen), but the rest of the governance system uses `isValidUuid()` for agent IDs. This allows non-UUID agent IDs to be used as lookup keys, which will simply return empty results but wastes computation by iterating all agents.

- **Evidence:**
  ```typescript
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
  }
  ```

- **Fix:** Use `isValidUuid(agentId)` for consistency with the rest of the governance API.

---

## Privilege Escalation Analysis

### Can a non-MANAGER approve transfers?
**No.** The resolve endpoint (`transfers/[id]/resolve/route.ts:87-91`) correctly checks `isSourceCOS` and `isGlobalManager` using `resolvedBy` derived from authenticated Bearer token. A non-privileged agent cannot approve. **CLEAN.**

### Can a non-COS create transfers for agents not in their team?
**YES.** Due to CC-001, `requestedBy` is taken from the untrusted body. Anyone who knows (or guesses) a COS UUID can create transfer requests. The COS UUID can be discovered via the teams API or reachable endpoint. **VULNERABLE via CC-001.**

### Can anyone set themselves as MANAGER without the password?
**No.** The manager/route.ts POST handler correctly requires and verifies the governance password (lines 14-35) with rate limiting before setting the manager. **CLEAN.**

---

## CLEAN

Files with no issues found beyond those already listed:

- `lib/agent-auth.ts` -- Well-structured three-outcome authentication. Correctly rejects X-Agent-Id without Authorization. Verifies X-Agent-Id matches authenticated identity. No issues found.
- `lib/rate-limit.ts` -- Simple, correct in-memory rate limiter. Proper window expiry, cleanup interval, test-safe guard. Minor nit about global keys (CC-011) but functionally correct.
- `lib/validation.ts` -- Clean UUID regex, no issues.
- `app/api/governance/password/route.ts` -- Rate limiting present, bcrypt with proper salt rounds, 72-char limit for bcrypt, current password required for changes. Minor nit (CC-009) but overall clean.
- `app/api/governance/manager/route.ts` -- Password required, rate-limited, agent existence verified. Clean.
- `app/api/governance/transfers/[id]/resolve/route.ts` -- Best-secured endpoint: authenticated identity, lock-based atomicity, compensating action on save failure, notification. Clean for auth concerns.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| MUST-FIX | 2 | CC-001, CC-002 |
| SHOULD-FIX | 6 | CC-003, CC-004, CC-005, CC-006, CC-007, CC-008 |
| NIT | 4 | CC-009, CC-010, CC-011, CC-012 |
| **TOTAL** | **12** | |

### Critical Finding: Asymmetric Authentication
The most significant pattern is that **transfer resolution** (approve/reject) is properly authenticated via Bearer tokens, but **transfer creation** (POST) is not. This creates an odd security posture where it's harder to approve a transfer than to create one. CC-001 is the highest-priority fix.

### Phase 1 vs Phase 2 Assessment
Many SHOULD-FIX items are acceptable for Phase 1 (localhost-only, trusted user) but would become critical vulnerabilities in Phase 2 (remote access). The codebase has good Phase 2 TODO comments in most places. CC-001 is the exception — it should be fixed even in Phase 1 because it undermines the governance model's authority checks.
