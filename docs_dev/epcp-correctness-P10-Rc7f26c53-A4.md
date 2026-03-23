# Code Correctness Report: A4-services-2

**Agent:** epcp-code-correctness-agent
**Domain:** services-2 (14 service files)
**Files audited:** 14
**Date:** 2026-02-26T12:00:00Z
**Run:** P10 / RUN_ID c7f26c53

## MUST-FIX

### [CC-A4-001] TOCTOU race in headless-router chief-of-staff endpoint: checkRateLimit + recordAttempt are separate calls
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1666-1674
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The chief-of-staff endpoint in headless-router.ts uses the older `checkRateLimit` / `recordAttempt` two-step pattern instead of the atomic `checkAndRecordAttempt` used everywhere else in this codebase (governance-service.ts:74, cross-host-governance-service.ts:73, etc.). This creates a TOCTOU window where two concurrent password-brute-force requests could both pass `checkRateLimit` before either calls `recordAttempt`, bypassing the rate limit for one attempt.
- **Evidence:**
  ```typescript
  // headless-router.ts:1666-1674
  const rateCheck = checkRateLimit(rateLimitKey)    // <-- separate check
  if (!rateCheck.allowed) { ... }
  if (!(await verifyPassword(password))) {
    recordAttempt(rateLimitKey)                      // <-- separate record
    sendJson(res, 401, { error: 'Invalid governance password' })
    return
  }
  ```
  Compare with governance-service.ts:74:
  ```typescript
  const rateCheck = checkAndRecordAttempt('governance-manager-auth')  // <-- atomic
  ```
- **Fix:** Replace `checkRateLimit` + `recordAttempt` with `checkAndRecordAttempt`, then call `resetRateLimit` on success, matching the pattern in governance-service.ts, cross-host-governance-service.ts, and all other callers.

### [CC-A4-002] `getMessages` allows action=null to fall through to inbox listing without agent validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:72-173
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `getMessages`, when `action` is an unrecognized value (e.g., `"foo"`), the function does not return a 400 error. It falls through to the inbox listing logic (line 149+), where it correctly requires `agentIdentifier`. However, if both `agentIdentifier` and `messageId` are provided but `action` is garbage, the function takes the "get specific message" path (line 116-122), which is likely not the caller's intent. This is not a crash, but it produces incorrect behavior for unrecognized actions -- the caller gets a message lookup instead of an error.
- **Evidence:**
  ```typescript
  // lines 81-148: a chain of if statements with specific action values
  // but no final else/default for unrecognized actions
  if (action === 'resolve' && agentIdentifier) { ... }
  if (action === 'search' && agentIdentifier) { ... }
  if (agentIdentifier && messageId) { ... }  // <-- falls through here
  if (action === 'unread-count' && agentIdentifier) { ... }
  // ... etc
  ```
- **Fix:** Add a validation check before the fallthrough: if `action` is defined and not one of the recognized values (`resolve`, `search`, `unread-count`, `sent-count`, `stats`, `agents`, `sessions`, `list`), return `{ error: 'Invalid action', status: 400 }`.

## SHOULD-FIX

### [CC-A4-003] `exchangePeers` calls `getHosts()` inside the per-peer loop, re-reading the file on each iteration
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:1009
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Inside the `exchangePeers` function's `for (const peerHost of uniqueHosts)` loop (line 987-1019), each iteration calls `getHosts()` at line 1009 to check for URL duplicates. Since `getHosts()` reads from disk (or cache), and the loop itself adds hosts via `addHostAsync` (line 1059) which invalidates the cache (line 1069), this results in repeated file reads. The call should be hoisted before the loop and updated only when needed.
- **Evidence:**
  ```typescript
  for (const peerHost of uniqueHosts) {
    // ...
    // Check if URL already exists
    const hosts = getHosts()  // <-- re-read on every iteration
    const hostWithSameUrl = hosts.find(h => h.url === peerHost.url && !isSelf(h.id))
    // ...
  }
  ```
- **Fix:** Hoist `getHosts()` call before the loop and maintain a local URL set that gets updated when a host is added.

### [CC-A4-004] `checkHostHealth` uses manual AbortController + setTimeout instead of `AbortSignal.timeout()`
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:256-270
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `checkHostHealth` creates a manual `AbortController` + `setTimeout` combination for timeouts, but if `fetch` throws before the timeout fires (e.g., DNS failure), the `setTimeout` callback is never cleared. The same file's `makeHealthCheckRequest` (line 164) uses `AbortSignal.timeout()` which handles cleanup automatically. This is inconsistent and can leak timers.
- **Evidence:**
  ```typescript
  async function checkHostHealth(url: string, timeoutMs: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(`${url}/api/config`, { signal: controller.signal })
      clearTimeout(timeout)  // only reached on success
      return response.ok
    } catch {
      return false  // timeout never cleared on error path
    }
  }
  ```
- **Fix:** Either add `clearTimeout(timeout)` in the catch block, or switch to `AbortSignal.timeout(timeoutMs)` like the other fetch calls in the same file.

### [CC-A4-005] `getMeshStatus` also uses manual AbortController + setTimeout with the same timer leak
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:610-616
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-A4-004. Inside `getMeshStatus`'s `healthChecks` map, a manual `AbortController` + `setTimeout` is used. On `fetch` failure (catch block), `clearTimeout` is never called, leaking the timer.
- **Evidence:**
  ```typescript
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  const response = await fetch(`${peer.url}/api/config`, { signal: controller.signal })
  clearTimeout(timeout)
  // ...
  } catch {
    return { ... reachable: false ... }  // timeout not cleared
  }
  ```
- **Fix:** Add `clearTimeout(timeout)` at the top of the catch block, or switch to `AbortSignal.timeout(5000)`.

### [CC-A4-006] `forwardMessage` does not validate `fromSession` / `toSession` format
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:321-367
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** `forwardMessage` validates that `fromSession !== toSession` but does not validate the format of `fromSession` or `toSession`. These strings are passed directly to `forwardFromUI` which will use them as agent identifiers for file system lookups. While `forwardFromUI` likely resolves them safely through the agent registry, the service layer should validate inputs before passing them downstream.
- **Evidence:**
  ```typescript
  export async function forwardMessage(params: ForwardMessageParams): Promise<ServiceResult<any>> {
    const { messageId, originalMessage, fromSession, toSession, forwardNote } = params
    if ((!messageId && !originalMessage) || !fromSession || !toSession) {
      return { error: '...', status: 400 }
    }
    if (fromSession === toSession) {
      return { error: '...', status: 400 }
    }
    // No format validation on fromSession/toSession
    const result = await forwardFromUI({ ... })
  ```
- **Fix:** Add basic format validation (e.g., length limit, no control characters) for `fromSession` and `toSession` before passing them to `forwardFromUI`.

### [CC-A4-007] `renameSession` cloud agent path overwrites `agentConfig.id` with the new name, corrupting the UUID
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:733-734
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When renaming a cloud agent, the code sets `agentConfig.id = newName` and `agentConfig.name = newName`. If the agent's `id` field is supposed to be a UUID (as it is for all other agents in the registry), this overwrites the UUID with a human-readable name, breaking any UUID-based lookups or cross-references (e.g., team membership `agentIds`, governance requests, etc.).
- **Evidence:**
  ```typescript
  const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
  agentConfig.id = newName      // <-- overwrites UUID with name string
  agentConfig.name = newName
  agentConfig.alias = newName
  ```
- **Fix:** Only update `agentConfig.name` and `agentConfig.alias` with the new name. Keep `agentConfig.id` as the original UUID. Also update the agent registry via `renameAgentSession` (which is called on line 741) rather than directly manipulating JSON files.

### [CC-A4-008] `listSessions` return type does not include ServiceResult wrapper
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:440
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `listSessions` returns `Promise<{ sessions: Session[]; fromCache: boolean }>` instead of `Promise<ServiceResult<{ sessions: Session[]; fromCache: boolean }>>`. This is inconsistent with every other public function in the services layer, which all return `ServiceResult<T>`. The headless-router likely wraps this manually, but any new callers expecting `ServiceResult` will get type errors.
- **Evidence:**
  ```typescript
  export async function listSessions(): Promise<{ sessions: Session[]; fromCache: boolean }> {
  ```
  Compare with other functions in the same file:
  ```typescript
  export async function createSession(params: CreateSessionParams): Promise<ServiceResult<...>> {
  ```
- **Fix:** Wrap the return in `ServiceResult` format: `return { data: { sessions, fromCache }, status: 200 }`.

### [CC-A4-009] `checkIdleStatus` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:803-822
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `checkIdleStatus` returns a raw object instead of `ServiceResult<T>`. Same issue as CC-A4-008.
- **Evidence:**
  ```typescript
  export async function checkIdleStatus(sessionName: string): Promise<{
    sessionName: string; exists: boolean; idle: boolean; ...
  }> {
  ```
- **Fix:** Wrap in `ServiceResult` to match the pattern.

### [CC-A4-010] `listRestorableSessions` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:827-836
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A4-008 and CC-A4-009 -- raw return instead of `ServiceResult`.
- **Evidence:**
  ```typescript
  export async function listRestorableSessions(): Promise<{ sessions: any[]; count: number }> {
  ```
- **Fix:** Wrap in `ServiceResult`.

### [CC-A4-011] `getActivity` does not follow ServiceResult pattern
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:476-513
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Same issue as CC-A4-008 -- raw return instead of `ServiceResult`.
- **Evidence:**
  ```typescript
  export async function getActivity(): Promise<Record<string, SessionActivityInfo>> {
  ```
- **Fix:** Wrap in `ServiceResult`.

## NIT

### [CC-A4-012] `help-service.ts` writes system prompt to a predictable temp file path without uniqueness
- **File:** /Users/emanuelesabetta/ai-maestro/services/help-service.ts:156
- **Severity:** NIT
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The system prompt is written to `join(tmpdir(), 'aim-assistant-prompt.txt')` -- a predictable path. If another process writes to this path between `writeFileSync` and the `cat` command, the assistant could get a different prompt. This is Phase 1 (localhost-only) so the risk is minimal, but a unique temp file (e.g., using `mkdtemp` or appending a random suffix) would be safer.
- **Evidence:**
  ```typescript
  const promptFile = join(tmpdir(), 'aim-assistant-prompt.txt')
  writeFileSync(promptFile, SYSTEM_PROMPT)
  const launchCmd = `claude --model ${ASSISTANT_MODEL} ... --system-prompt "$(cat ${promptFile})"`
  ```
- **Fix:** Use a unique temp file path (e.g., `join(tmpdir(), `aim-assistant-prompt-${randomUUID()}.txt`)`) and clean it up after launch.

### [CC-A4-013] Inconsistent use of `any` return types in multiple services
- **File:** multiple files
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Several service functions use `ServiceResult<any>` instead of concrete types: `hosts-service.ts:listHosts` (line 298), `hosts-service.ts:addNewHost` (line 338), `hosts-service.ts:checkRemoteHealth` (line 485), `messages-service.ts:getMessages` (line 72), `messages-service.ts:sendMessage` (line 201), `teams-service.ts:createNewTeam` (line 141), etc. While this is not a bug, it defeats TypeScript's type checking at the service boundary.
- **Fix:** Replace `ServiceResult<any>` with concrete response types for each function.

### [CC-A4-014] `marketplace-service.ts` passes `query as any` to `listMarketplaceSkills` in headless router
- **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1850
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The headless router casts the query object to `any` when calling `listMarketplaceSkills`:
  ```typescript
  sendServiceResult(res, await listMarketplaceSkills(query as any))
  ```
  The `SkillSearchParams` type expected by `listMarketplaceSkills` may not match the shape of the raw `query` object (which is `Record<string, string>`).
- **Fix:** Explicitly construct a `SkillSearchParams` object from the query parameters instead of casting.

### [CC-A4-015] `plugin-builder-service.ts` evictionInterval runs forever even if no builds are active
- **File:** /Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts:200-201
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The eviction interval fires every 10 minutes unconditionally. While `.unref()` prevents it from blocking process exit, it still triggers `evictStaleBuildResults()` repeatedly even when `buildResults` is empty. This is a minor inefficiency.
- **Evidence:**
  ```typescript
  const evictionInterval = setInterval(evictStaleBuildResults, 10 * 60 * 1000)
  evictionInterval.unref()
  ```
- **Fix:** Consider only starting the interval when the first build is created, or adding an early-return check in `evictStaleBuildResults` when the map is empty.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/services/domains-service.ts -- No issues. Clean CRUD with UUID validation on all ID operations.
- /Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts -- No issues. Clean CRUD with proper validation, secret stripping, and error handling.
- /Users/emanuelesabetta/ai-maestro/services/shared-state.ts -- No issues. Clean globalThis bridge with proper WebSocket cleanup.
- /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs -- No issues. ESM mirror of shared-state.ts with matching behavior.

## Test Coverage Notes

- The chief-of-staff endpoint in headless-router.ts (CC-A4-001) should have a test verifying concurrent rate limiting behavior.
- The `renameSession` cloud agent path (CC-A4-007) needs a test verifying the agent ID is preserved as UUID after rename.
- The `getMessages` action validation gap (CC-A4-002) should have a test with an unrecognized action value.
- Sessions-service functions without ServiceResult wrappers (CC-A4-008 through CC-A4-011) should be tested via the headless router to verify correct response formatting.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A4-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P10-Rc7f26c53-A4.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
