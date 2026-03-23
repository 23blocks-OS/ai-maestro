# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:27.221Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P1-services-governance.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown /Users/emanuelesabetta/ai-maestro/docs_dev/epcp-fixes-done-P1-services-governance.md
# Fix Report: P1 services-governance domain
Generated: 2026-02-22T17:26:00Z

## Files Modified
- `services/headless-router.ts` -- MF-003, SF-011, SF-012, SF-024, SF-025
- `services/cross-host-governance-service.ts` -- SF-013, NT-010, NT-011
- `lib/governance-request-registry.ts` -- SF-024
- `app/api/v1/governance/requests/route.ts` -- SF-024

## Issues Fixed

### MF-003 (MUST-FIX) -- Config deploy allows unauthenticated access
**File:** services/headless-router.ts:830-836
**Fix:** Added `if (!auth.agentId)` guard after the `auth.error` check. Returns 401 with descriptive message when agent identity is missing.

### SF-011 (SHOULD-FIX) -- Config deploy sends 403 for auth errors
**File:** services/headless-router.ts:832
**Fix:** Changed `sendJson(res, 403, ...)` to `sendJson(res, auth.status || 401, ...)` to be consistent with other auth-gated routes (e.g., line 1204 pattern).

### SF-012 (SHOULD-FIX) -- Config deploy body fallback uses loose falsy check
**File:** services/headless-router.ts:835
**Fix:** Changed `body.configuration || body` to `body.configuration !== undefined ? body.configuration : body` for strict check.

### SF-013 (SHOULD-FIX) -- configure-agent execution silent success on failure
**File:** services/cross-host-governance-service.ts:483-498
**Fix:** Added explanatory comment documenting that 'executed' status means "execution was attempted," not "succeeded." The deploy error is already logged. Adding a 'failed' status would require GovernanceRequest type changes and is out of scope.

### SF-024 (SHOULD-FIX) -- type query parameter silently ignored
**Files:** lib/governance-request-registry.ts, services/cross-host-governance-service.ts, services/headless-router.ts, app/api/v1/governance/requests/route.ts
**Fix:**
1. Added `type?: string` to the filter interface in `listGovernanceRequests`
2. Added filter logic: `if (filter.type && r.type !== filter.type) return false`
3. Updated `listCrossHostRequests` signature to accept `type`
4. Both headless router and Next.js route now extract `type` from query params and pass it through

### SF-025 (SHOULD-FIX) -- COS auto-rejection missing in headless mode
**File:** services/headless-router.ts
**Fix:** Added `POST /api/teams/:id/chief-of-staff` endpoint to the headless router. Replicates full logic from `app/api/teams/[id]/chief-of-staff/route.ts` including:
- UUID validation
- Password verification with rate limiting
- COS removal with auto-reject of pending configure-agent requests (11a safeguard)
- COS assignment with team type upgrade
- TeamValidationException handling
- All validation and error handling

### NT-010 (NIT) -- Lazy import may be unnecessary
**File:** services/cross-host-governance-service.ts:491
**Fix:** Added comment explaining the lazy import: "Lazy import: agents-config-deploy-service imports getAgent which imports governance, creating a potential circular dependency chain. Keep lazy to be safe."

### NT-011 (NIT) -- Duplicate lazy import of notifyConfigRequestOutcome
**File:** services/cross-host-governance-service.ts:213,293,348
**Fix:** Extracted `safeNotifyConfigOutcome()` helper at module level. Replaced all 3 inline try/catch blocks with calls to the helper.

## TypeScript Verification
All modified files compile cleanly (0 errors). Pre-existing test file errors are unrelated.

```