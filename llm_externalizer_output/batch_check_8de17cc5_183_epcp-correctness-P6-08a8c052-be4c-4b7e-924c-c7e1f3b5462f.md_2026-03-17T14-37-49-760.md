# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:49.760Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-08a8c052-be4c-4b7e-924c-c7e1f3b5462f.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-08a8c052-be4c-4b7e-924c-c7e1f3b5462f.md
Line 19: - **File:** `app/api/hosts/health/route.ts`:24-33
Line 35: - **File:** `app/api/messages/route.ts`:63-83
Line 59: - **File:** `app/api/plugin-builder/push/route.ts`:14
Line 78: - **File:** `app/api/messages/meeting/route.ts`:9-13
Line 97: - **File:** `app/api/sessions/activity/update/route.ts`:17-19
Line 116: - **File:** `app/api/sessions/create/route.ts`:11-20
Line 139: - **File:** `app/api/docker/info/route.ts`:12
Line 157: - **File:** `app/api/plugin-builder/scan-repo/route.ts`:22
Line 176: - **File:** Multiple routes
Line 180:   - `app/api/help/agent/route.ts` uses `{ success: false, error }`
Line 181:   - `app/api/hosts/[id]/route.ts` uses `{ error }`
Line 182:   - `app/api/messages/route.ts` uses `result.data ?? { error: result.error }`
Line 183:   - `app/api/sessions/activity/route.ts` returns `{ error, activity: {} }`
Line 186:   - `app/api/sessions/route.ts`:4-6 (SF-054).
Line 196: - **File:** `app/api/messages/route.ts`:21, `app/api/messages/forward/route.ts`:13
Line 213: - **File:** `app/api/sessions/[id]/rename/route.ts`:25
Line 229: - **File:** `app/api/sessions/[id]/command/route.ts`:5-11, `app/api/sessions/[id]/rename/route.ts`:7-13, `app/api/sessions/[id]/route.ts`:7-13
Line 245: - `app/api/config/route.ts` -- Clean, minimal wrapper with proper error handling
Line 246: - `app/api/conversations/[file]/messages/route.ts` -- Clean, proper path parameter handling, service uses escapeForCozo
Line 247: - `app/api/conversations/parse/route.ts` -- Clean, dual try-catch for JSON and processing errors, service validates path traversal
Line 248: - `app/api/debug/pty/route.ts` -- Clean, proper cache control and error handling
Line 249: - `app/api/domains/[id]/route.ts` -- Clean, proper JSON parsing guard and error handling
Line 250: - `app/api/domains/route.ts` -- Clean
Line 251: - `app/api/export/jobs/[jobId]/route.ts` -- Clean
Line 252: - `app/api/help/agent/route.ts` -- Clean, proper async/error handling
Line 253: - `app/api/hosts/[id]/route.ts` -- Clean, has hostname format validation regex
Line 254: - `app/api/hosts/exchange-peers/route.ts` -- Clean
Line 255: - `app/api/hosts/identity/route.ts` -- Clean
Line 256: - `app/api/hosts/register-peer/route.ts` -- Clean
Line 257: - `app/api/hosts/route.ts` -- Clean
Line 258: - `app/api/hosts/sync/route.ts` -- Clean
Line 259: - `app/api/marketplace/skills/[id]/route.ts` -- Clean
Line 260: - `app/api/marketplace/skills/route.ts` -- Clean
Line 261: - `app/api/organization/route.ts` -- Clean
Line 262: - `app/api/plugin-builder/build/route.ts` -- Clean (catch wraps both JSON parse and build errors)
Line 263: - `app/api/plugin-builder/builds/[id]/route.ts` -- Clean
Line 264: - `app/api/sessions/activity/route.ts` -- Clean
Line 265: - `app/api/sessions/restore/route.ts` -- Clean
Line 266: - `app/api/sessions/route.ts` -- Clean, proper local-only flag handling
Line 267: - `app/api/subconscious/route.ts` -- Clean
Line 268: - `app/api/webhooks/[id]/route.ts` -- Clean
Line 269: - `app/api/webhooks/[id]/test/route.ts` -- Clean
Line 270: - `app/api/webhooks/route.ts` -- Clean
Line 271: - `app/api/sessions/[id]/route.ts` -- Clean (aside from deprecation noted in NIT)
Line 272: - `app/api/sessions/[id]/command/route.ts` -- Clean (aside from deprecation noted in NIT)
```