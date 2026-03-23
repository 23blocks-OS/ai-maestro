# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:17.808Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P10-4eb0b463-6a5f-4c16-8bc0-5acded1c514d.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P10-4eb0b463-6a5f-4c16-8bc0-5acded1c514d.md
Line 1: # Code Correctness Report: plugin-builder (upstream additions)
Line 2: **Agent:** epcp-code-correctness-agent
Line 3: **Domain:** plugin-builder
Line 11: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664
Line 12: - **Severity:** MUST-FIX
Line 13: - **Category:** security
Line 14: - **Confidence:** CONFIRMED (traced code flow)
Line 15: - **Description:** The headless router's `scan-repo` route passes `body.url` and `body.ref` directly to `scanRepo()` without any type or presence check on the route side. While the `scanRepo` function itself validates both, the issue is that `body.ref` is passed as-is and when `body.ref` is `undefined`, `scanRepo` receives it as the second argument. However, the `scanRepo` function has a default parameter `ref: string = 'main'` which handles this correctly. **UPDATE after tracing: This is actually safe because the service-layer validation catches undefined/invalid values.** Downgrading -- not a MUST-FIX after all.
Line 19: *Self-correction: After full trace, the service layer validates properly. Removing this from MUST-FIX.*
Line 21: ### [CC-P10-A0-002] `activeOps` double-decrement race condition in `buildPlugin`
Line 22: - **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:307-388
Line 23: - **Severity:** MUST-FIX
Line 24: - **Category:** race-condition
Line 25: - **Confidence:** CONFIRMED (traced code flow)
Line 26: - **Description:** In `buildPlugin()`, when the async `runBuild` promise is launched at line 367, its `.finally()` handler at line 378 decrements `activeOps`. However, if the *outer* try block (lines 319-387) throws AFTER `runBuild` has already been kicked off but BEFORE it resolves, the `catch` block at line 383-385 ALSO decrements `activeOps`. This creates a double-decrement scenario.
Line 39: - **Fix:** Move the `activeOps++` to just before the `runBuild` call, and remove the decrement from the outer catch block. Or use a `try/finally` with a flag to track whether ownership of the decrement was transferred to `runBuild`.
Line 41: ## SHOULD-FIX
Line 43: ### [CC-P10-A0-003] Headless router `scan-repo` does not validate `body.ref` default like Next.js route does
Line 44: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1662-1664 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/scan-repo/route.ts`:22
Line 45: - **Severity:** SHOULD-FIX
Line 46: - **Category:** api-contract
Line 47: - **Confidence:** CONFIRMED
Line 48: - **Description:** The Next.js API route at `scan-repo/route.ts:22` passes `body.ref || 'main'` to `scanRepo()`, providing a sensible default. The headless router at line 1664 passes `body.ref` directly (no default). When `body.ref` is undefined, `scanRepo` still works because the function signature has `ref: string = 'main'`. However, if `body.ref` is explicitly an empty string `""`, the Next.js route would fallback to `'main'` (because `'' || 'main'` is `'main'`), but the headless route would pass `""` through, which would then fail the `validateGitRef` check ("Git ref is required"). This is an inconsistency between the two entry points.
Line 56: - **Fix:** Change headless route to: `scanRepo(body.url, body.ref || 'main')` to match the Next.js route behavior.
Line 58: ### [CC-P10-A0-004] Headless router `push` route skips input validation present in Next.js route
Line 59: - **File:** `/Users/emanuelesabetta/ai-maestro/services/headless-router.ts`:1666-1668 vs `/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/push/route.ts`:16-28
Line 60: - **Severity:** SHOULD-FIX
Line 61: - **Category:** api-contract
Line 62: - **Confidence:** CONFIRMED
Line 63: - **Description:** The Next.js `push` route validates `body.forkUrl` and `body.manifest` exist before calling `pushToGitHub(body)`. The headless route passes `body` directly to `pushToGitHub()`. While `pushToGitHub()` does its own validation internally (lines 468-477), the Next.js route provides earlier, more specific error messages. This is not a bug per se since the service layer catches it, but it is an API behavior inconsistency -- the error message format differs between the two entry points.
Line 71: - **Fix:** This is acceptable since the service layer validates. But for consistency, either remove the duplicate validation from the Next.js route (since it is redundant) or add it to the headless route as well.
Line 73: ### [CC-P10-A0-005] `PluginComposer.tsx` `getSkillDisplayName` returns empty string for malformed marketplace skill IDs
Line 74: - **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/PluginComposer.tsx`:214
Line 75: - **Severity:** SHOULD-FIX
Line 76: - **Category:** logic
Line 77: - **Confidence:** CONFIRMED
Line 78: - **Description:** In `getSkillDisplayName`, for marketplace skills, the code does `skill.id.split(':')[2] || skill.id`. If the skill ID has fewer than 3 colon-separated parts (e.g., `"marketplace:plugin"` with no third part), `split(':')[2]` is `undefined`, so it falls back to `skill.id`. This works. However, if the ID is `"marketplace:plugin:"` (trailing colon), `split(':')[2]` returns `""` (empty string), which is falsy in JS, so it still falls back. This is actually handled correctly. **Self-correction: This is fine.** Removing.
Line 83: ### [CC-P10-A0-006] `RepoScanner` key mismatch with `getSkillKey` for deduplication check
Line 84: - **File:** `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/RepoScanner.tsx`:127 vs `/Users/emanuelesabetta/ai-maestro/components/plugin-builder/SkillPicker.tsx`:268-276
Line 85: - **Severity:** SHOULD-FIX
Line 86: - **Category:** logic
Line 87: - **Confidence:** CONFIRMED
Line 88: - **Description:** In `RepoScanner.tsx`, line 127, the key for checking if a repo skill is already selected is computed as:
Line 98: - **Fix:** Change RepoScanner line 127 to use `url.trim()`:
Line 102: ### [CC-P10-A0-007] `findScriptsInDir` `isSymbolicLink()` check may not work with `readdir({ withFileTypes: true })`
Line 103: - **File:** `/Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts`:670
Line 104: - **Severity:** SHOULD-FIX
Line 105: - **Category:** logic
Line 106: - **Confidence:** LIKELY
Line 107: - **Description:** At line 67