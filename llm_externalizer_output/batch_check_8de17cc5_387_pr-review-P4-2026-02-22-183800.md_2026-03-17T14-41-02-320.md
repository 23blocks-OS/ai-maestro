# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:41:02.320Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P4-2026-02-22-183800.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```text
/Users/emanuelesabetta/ai-maestro/docs_dev/pr-review-P4-2026-02-22-183800.md
Line 162: The local-submission path (SF-007 validation block, lines 67-79) validates `type`, `password`, `targetHostId`, and `requestedBy`, but does NOT validate `requestedByRole` or `payload` -- both of which are required fields in the `submitCrossHostRequest` service function signature.
Line 207: `handleResolve` awaits `resolveConfigRequest(...)` but never checks the return value `{ success, error }`.
Line 219: When `handleAddSkill` or `handleRemoveSkill` is called multiple times in quick succession, the previous timer is not cleared before setting a new one.
Line 230: The `getQuery()` helper function was replaced in Pass 3 by inline query parsing in `createHeadlessRouter().handle()` (lines 1868-1869).
Line 241: The export route at line 922 constructs a `Content-Disposition` header using `filename` from the service result, derived from `agent.name || agent.alias`.
Line 250: The `readJsonBody` function uses `Object.assign(new Error(...), { statusCode: 413 })` to add a `statusCode` property.
Line 259: The deploy service has a TODO placeholder but the actual ToxicSkills scan is NOT executed during deployment.
Line 268: The extended test file contains exactly 56 `it()` blocks matching the claim.
Line 277: The test count discrepancy is documented in the test file itself (NT-013 comment): vitest counts parameterized expansions, so the 836/841/851 number includes `it.each` expansions, not discrete test functions.
Line 286: The `HOSTNAME_RE` regex is defined inside the `GET` function body, so it's recompiled on every request.
Line 293: The `GET` handler does not perform any authentication check.
Line 300: Both GET and PUT 500 error handlers return `error.message` directly in the response, unlike other routes which return generic messages.
Line 307: `purgeOldRequests` calls `expirePendingRequestsInPlace(filtered, 7)` with a hardcoded 7-day TTL, while the function parameter `maxAgeDays` (default 30) controls the terminal-state purge cutoff.
Line 314: The status `remote-approved` means "source-side approved" which is consistent from the target host's perspective but confusing from the source host's perspective.
Line 321: The test for `listGovernanceRequests` agentId filter relies on `'agent-x'` matching both `payload.agentId` and `requestedBy`.
Line 328: The JSDoc on the replica function says "Mirrors hooks/useGovernance.ts lines 286-309 exactly" but the actual function spans lines 286-316.
Line 335: `useGovernance` hook destructures `agentRole` (line 79) but `agentRole` is never used in the component's render logic or any handler.
Line 342: `canApprove` is hardcoded to `true` with a "Phase 1: localhost single-user" comment.
Line 349: `clearDocs(params.id, query.project)` passes `query.project` which could be `undefined`.
Line 356: The timestamp freshness check `tsAge > 300_000 || tsAge < -60_000` allows 5 minutes in the past but only 60 seconds in the future.
```