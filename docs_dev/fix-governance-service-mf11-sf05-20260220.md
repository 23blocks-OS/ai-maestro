# Fix Report: governance-service.ts MF-11 + SF-05

**Date:** 2026-02-20
**File:** `services/governance-service.ts`

## MF-11: 409 duplicate response breaks sendServiceResult (MUST-FIX)

**Problem:** Line 291 returned both `data` and `error` in the 409 duplicate transfer case, causing `sendServiceResult` to discard the error message and only send the data.

**Fix:** Removed the `data: { existingRequest: duplicate } as any` field, returning error-only for the 409 case. The inner-lock catch block (line 299-301) was already correct (error-only).

**Before:**
```typescript
return { data: { existingRequest: duplicate } as any, error: 'A transfer request...', status: 409 }
```

**After:**
```typescript
return { error: 'A transfer request for this agent between these teams already exists', status: 409 }
```

## SF-05: resolved! non-null assertion fragile (SHOULD-FIX)

**Problem:** Line 438 used `resolved!` non-null assertion. While guaranteed non-null by the early return at line 378, the `!` assertion is fragile if code is refactored later.

**Fix:** Added explicit null guard before the return statement, replacing the `!` assertion.

**Before:**
```typescript
return { data: { success: true, request: resolved! }, status: 200 }
```

**After:**
```typescript
if (!resolved) {
  return { error: 'Internal error: transfer resolution failed', status: 500 }
}
return { data: { success: true, request: resolved }, status: 200 }
```
