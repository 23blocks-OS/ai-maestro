# EPCP Merged Report (Pre-Deduplication)

**Generated:** 2026-02-22-120320
**Pass:** 10
**Reports merged:** 4
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review
**Status:** INTERMEDIATE — awaiting deduplication by epcp-dedup-agent

---

## Raw Counts (Pre-Dedup)

| Severity | Raw Count |
|----------|-----------|
| **MUST-FIX** | 2 |
| **SHOULD-FIX** | 9 |
| **NIT** | 7 |
| **Total** | 24 |

**Note:** These counts may include duplicates. The epcp-dedup-agent will produce final accurate counts.

---

## MUST-FIX Issues


### [CC-P10-A0-001] Command injection via unsanitized `body.url` and `body.ref` in headless router scan-repo route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED (traced code flow)
- **Description:** The headless router's `scan-repo` route passes `body.url` and `body.ref` directly to `scanRepo()` without any type or presence check on the route side. While the `scanRepo` function itself validates both, the issue is that `body.ref` is passed as-is and when `body.ref` is `undefined`, `scanRepo` receives it as the second argument. However, the `scanRepo` function has a default parameter `ref: string = 'main'` which handles this correctly. **UPDATE after tracing: This is actually safe because the service-layer validation catches undefined/invalid values.** Downgrading -- not a MUST-FIX after all.

*Self-correction: After full trace, the service layer validates properly. Removing this from MUST-FIX.*

### [CC-P10-A0-002] `activeOps` double-decrement race condition in `buildPlugin`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:307-388
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED (traced code flow)
- **Description:** In `buildPlugin()`, when the async `runBuild` promise is launched at line 367, its `.finally()` handler at line 378 decrements `activeOps`. However, if the *outer* try block (lines 319-387) throws AFTER `runBuild` has already been kicked off but BEFORE it resolves, the `catch` block at line 383-385 ALSO decrements `activeOps`. This creates a double-decrement scenario.

  Specifically, the flow is:
  1. `activeOps++` at line 323
  2. `runBuild(...)` launched at line 367 with `.finally(() => activeOps--)` at line 378-380
  3. If any code between line 367 and return at line 382 throws (unlikely but possible if `buildResults.set` somehow fails), the catch at line 383-385 decrements `activeOps`
  4. Later, `runBuild`'s `.finally()` also decrements `activeOps`

  In practice, there is no code between line 367 (`runBuild(...).catch(...).finally(...)`) and line 382 (`return`) that can throw, so the risk is very low. But the pattern is structurally fragile.
- **Evidence:**
  ```typescript
  // Line 323
  activeOps++
  // ... setup ...
  // Line 367-380: runBuild launched with .finally decrement
  runBuild(buildId, buildDir, manifest).catch(err => {
    // ...
  }).finally(() => {
    activeOps = Math.max(0, activeOps - 1)  // decrement #1
  })
  // Line 382
  return { data: result, status: 202 }
  } catch (error) {
    activeOps = Math.max(0, activeOps - 1)  // decrement #2
    // ...
  }
  ```
- **Fix:** Move the `activeOps++` to just before the `runBuild` call, and remove the decrement from the outer catch block. Or use a `try/finally` with a flag to track whether ownership of the decrement was transferred to `runBuild`.


No MUST-FIX issues found.


None.


---

## SHOULD-FIX Issues


### [CC-P10-A0-003] Headless router `scan-repo` does not validate `body.ref` default like Next.js route does
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/scan-repo/route.ts`:22
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The Next.js API route at `scan-repo/route.ts:22` passes `body.ref || 'main'` to `scanRepo()`, providing a sensible default. The headless router at line 1664 passes `body.ref` directly (no default). When `body.ref` is undefined, `scanRepo` still works because the function signature has `ref: string = 'main'`. However, if `body.ref` is explicitly an empty string `""`, the Next.js route would fallback to `'main'` (because `'' || 'main'` is `'main'`), but the headless route would pass `""` through, which would then fail the `validateGitRef` check ("Git ref is required"). This is an inconsistency between the two entry points.
- **Evidence:**
  ```typescript
  // Next.js route (scan-repo/route.ts:22)
  const result = await scanRepo(body.url, body.ref || 'main')

  // Headless route (headless-router.ts:1664)
  sendServiceResult(res, await scanRepo(body.url, body.ref))
  ```
- **Fix:** Change headless route to: `scanRepo(body.url, body.ref || 'main')` to match the Next.js route behavior.

### [CC-P10-A0-004] Headless router `push` route skips input validation present in Next.js route
- **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1666-1668 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/push/route.ts`:16-28
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The Next.js `push` route validates `body.forkUrl` and `body.manifest` exist before calling `pushToGitHub(body)`. The headless route passes `body` directly to `pushToGitHub()`. While `pushToGitHub()` does its own validation internally (lines 468-477), the Next.js route provides earlier, more specific error messages. This is not a bug per se since the service layer catches it, but it is an API behavior inconsistency -- the error message format differs between the two entry points.
- **Evidence:**
  ```typescript
  // Next.js route validates forkUrl and manifest first
  if (!body.forkUrl || typeof body.forkUrl !== 'string') {
    return NextResponse.json({ error: 'Fork URL is required' }, { status: 400 })
  }
  // Headless route skips this
  sendServiceResult(res, await pushToGitHub(body))
  ```
- **Fix:** This is acceptable since the service layer validates. But for consistency, either remove the duplicate validation from the Next.js route (since it is redundant) or add it to the headless route as well.

### [CC-P10-A0-005] `PluginComposer.tsx` `getSkillDisplayName` returns empty string for malformed marketplace skill IDs
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/PluginComposer.tsx`:214
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `getSkillDisplayName`, for marketplace skills, the code does `skill.id.split(':')[2] || skill.id`. If the skill ID has fewer than 3 colon-separated parts (e.g., `"marketplace:plugin"` with no third part), `split(':')[2]` is `undefined`, so it falls back to `skill.id`. This works. However, if the ID is `"marketplace:plugin:"` (trailing colon), `split(':')[2]` returns `""` (empty string), which is falsy in JS, so it still falls back. This is actually handled correctly. **Self-correction: This is fine.** Removing.

### [CC-P10-A0-006] `RepoScanner` key mismatch with `getSkillKey` for deduplication check
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/RepoScanner.tsx`:127 vs `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`:268-276
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `RepoScanner.tsx`, line 127, the key for checking if a repo skill is already selected is computed as:
  ```typescript
  const key = `repo:${url}:${skill.path}`
  ```
  But in `SkillPicker.tsx`, the canonical `getSkillKey` function for repo skills is:
  ```typescript
  case 'repo':
    return `repo:${skill.url}:${skill.skillPath}`
  ```
  The `RepoScanner` uses `url` (local state, untrimmed) and `skill.path` (the `RepoSkillInfo.path` field). Meanwhile, `getSkillKey` uses `skill.url` (the `PluginSkillSelection` `url` field, which is trimmed at line 63: `url: url.trim()`) and `skill.skillPath`.

  Since `RepoSkillInfo.path` maps directly to `PluginSkillSelection.skillPath` (see line 65: `skillPath: skill.path`), the `skill.path` vs `skill.skillPath` difference is consistent.

  However, the `url` in `RepoScanner` is the *untrimmed* local state, while `getSkillKey` uses the *trimmed* url that was stored in the `PluginSkillSelection`. If the user enters a URL with leading/trailing whitespace, `RepoScanner`'s key (`repo:  https://...`) won't match the selected skill's key (`repo:https://...`), causing the "already added" check to fail -- the button won't be disabled even though the skill is already selected.
- **Evidence:**
  ```typescript
  // RepoScanner.tsx:127 -- uses untrimmed `url`
  const key = `repo:${url}:${skill.path}`

  // RepoScanner.tsx:63 -- trims url when creating the selection
  url: url.trim(),

  // SkillPicker.tsx:275 -- uses trimmed url from the selection
  return `repo:${skill.url}:${skill.skillPath}`
  ```
- **Fix:** Change RepoScanner line 127 to use `url.trim()`:
  ```typescript
  const key = `repo:${url.trim()}:${skill.path}`
  ```

### [CC-P10-A0-007] `findScriptsInDir` `isSymbolicLink()` check may not work with `readdir({ withFileTypes: true })`
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:670
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** At line 670, the code checks `entry.isFile() && !entry.isSymbolicLink()`. In Node.js, `readdir({ withFileTypes: true })` returns `Dirent` objects. For symlinks, `entry.isFile()` returns `false` and `entry.isSymbolicLink()` returns `true`. So a symlink to a file would already be excluded by `entry.isFile()` alone. The `!entry.isSymbolicLink()` check is redundant but not harmful. However, there is a subtle issue: on some platforms/filesystems with `readdir`, a symlink to a file may report `isFile() === true` and `isSymbolicLink() === true` simultaneously (this was the behavior before Node.js 20.1). In that case, both checks are needed. Since the code supports Node.js 20+, this is fine. **Self-correction: The check is correct and defensive. Not a bug.**

### [CC-P10-A0-008] `scanRepo` error message leaks internal URL in 404 response
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:454
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** When `git clone` fails with exit code 128, the error message includes the URL: `Repository not found or access denied: ${url}`. While the URL was already provided by the user, in a multi-user scenario this could be used to confirm whether specific repositories exist on allowed hosts (SSRF-like oracle). This is low severity since Phase 1 is localhost-only and the URL comes from the user, but it is worth noting for defense-in-depth.
- **Evidence:**
  ```typescript
  return { error: `Repository not found or access denied: ${url}`, status: 404 }
  ```
- **Fix:** Remove the URL from the error message: `'Repository not found or access denied'`

### [CC-P10-A0-009] `pushToGitHub` error message leaks internal error details
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:546
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `pushToGitHub` catch block returns the raw error message to the client: `Failed to push to GitHub: ${message}`. This could expose internal paths, git error details, or credential-related errors to the client.
- **Evidence:**
  ```typescript
  return { error: `Failed to push to GitHub: ${message}`, status: 500 }
  ```
- **Fix:** Log the detailed error server-side (already done at line 545) but return a generic message to the client: `'Failed to push to GitHub'`

### [CC-P10-A0-010] `scanRepo` error message also leaks internal error details
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:457
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Same pattern as CC-P10-A0-009. The `scanRepo` catch block returns: `Failed to scan repository: ${message}` which could contain internal paths or git error output.
- **Evidence:**
  ```typescript
  return { error: `Failed to scan repository: ${message}`, status: 500 }
  ```
- **Fix:** Return generic message to client, keep detailed error in server logs.


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


None.


---

## Nits & Suggestions


### [CC-P10-A0-011] `SkillPicker.tsx` passes no-op `onSkillsFound` to `RepoScanner`
- **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`:255
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** At line 255, `onSkillsFound` is passed as `() => {}` (no-op). The `RepoScanner` component calls this callback after a successful scan at line 50. While this is not a bug (the callback is optional behavior), it suggests either: (a) the callback is unnecessary and could be removed from `RepoScanner`'s interface, or (b) the `SkillPicker` should use it for something (e.g., showing a notification).
- **Evidence:**
  ```typescript
  <RepoScanner
    onSkillsFound={() => {}}
    onAddSkill={onAddSkill}
    selectedSkillKeys={selectedKeys}
  />
  ```
- **Fix:** Either make `onSkillsFound` optional in `RepoScannerProps` (with `?`) or implement useful behavior.

### [CC-P10-A0-012] Version validation regex does not support pre-release with `+` build metadata
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:61
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `SEMVER_RE` regex `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` accepts pre-release versions like `1.0.0-beta.1` but does not support build metadata like `1.0.0+build.123` or `1.0.0-beta.1+build.123`, which are valid semver. This is fine for plugin versioning (build metadata is rarely needed) but worth noting.
- **Evidence:**
  ```typescript
  const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
  ```
- **Fix:** If full semver support is desired: `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/`

### [CC-P10-A0-013] `page.tsx` client-side validation regex does not validate version format
- **File:** `/Users/emanuelesabetta/ai-maestro/app/plugin-builder/page.tsx`:46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The client-side validation at line 44-47 checks that version is non-empty but does not check that it matches semver format. The server-side `validateBuildConfig` does check semver. This means the user can type an invalid version (e.g., "abc") and the Build button will be enabled, but the build will fail with a 400 error. A better UX would be to validate semver on the client side too.
- **Evidence:**
  ```typescript
  const isValid = name.trim().length > 0
    && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
    && version.trim().length > 0  // no semver check
    && skills.length > 0
  ```
- **Fix:** Add `&& /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)` to the client-side validation.

### [CC-P10-A0-014] `buildPlugin` logs array overwrites previous logs on error
- **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:375
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In the `.catch` handler of `runBuild` at line 372-377, the error updates `logs` to `[err instanceof Error ? err.message : String(err)]`, replacing any logs that may have been added by `runBuild` internally. However, since `runBuild` also does its own error handling (line 600-612) and sets logs there, this `.catch` handler is only reached for truly unexpected errors (like if `runBuild` throws synchronously before setting up its own try/catch). In that case, replacing logs is acceptable. This is a minor observation.
- **Evidence:**
  ```typescript
  .catch(err => {
    const r = buildResults.get(buildId)
    if (r && r.status === 'building') {
      buildResults.set(buildId, {
        ...r,
        status: 'failed',
        logs: [err instanceof Error ? err.message : String(err)], // overwrites
      })
    }
  })
  ```
- **Fix:** Consider preserving existing logs: `logs: [...r.logs, err instanceof Error ? err.message : String(err)]`


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


None.


---

## Source Reports

- `epcp-correctness-P10-4eb0b463-6a5f-4c16-8bc0-5acded1c514d.md`
- `epcp-correctness-P10-c1adbedc-06b2-49ff-b7ae-c24515a2b2a5.md`
- `epcp-claims-P10-282c7b23-2b20-4293-9867-e933cb7551f4.md`
- `epcp-review-P10-1d1655d9-89e3-47fc-a143-dcf35ca5ad6a.md`

