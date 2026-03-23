# Code Correctness Report: plugin-builder (upstream additions)

**Agent:** epcp-code-correctness-agent
**Domain:** plugin-builder
**Files audited:** 10
**Date:** 2026-02-22T11:56:00Z
**Pass:** 10
**Finding ID Prefix:** CC-P10-A0

## MUST-FIX

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

## SHOULD-FIX

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

## NIT

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

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/types/plugin-builder.ts` -- Well-structured types, clear tagged union, no issues
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/build/route.ts` -- Clean thin wrapper, proper error handling
- `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/builds/[id]/route.ts` -- Clean, correct params handling
- `/Users/emanuelesabetta/ai-maestro/components/Header.tsx` -- Simple navigation addition, no issues

## Test Coverage Notes

- No test files found for any of the plugin-builder domain files
- `plugin-builder-service.ts` contains significant business logic (validation, manifest generation, build orchestration, git operations) that should have unit tests
- `generateManifest()` is a pure function and is highly testable
- The validation functions (`validateGitUrl`, `validateGitRef`, `validatePluginName`, `validateSkillPath`, `validateBuildConfig`) are pure functions and should be tested
- Client components could benefit from integration tests for the build polling flow

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P10-A0-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P10-4eb0b463-6a5f-4c16-8bc0-5acded1c514d.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
