# Fix SF-01: agent-auth.ts empty string bypass + unreachable fallback

**Date:** 2026-02-20
**File:** `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`
**Severity:** HIGH SHOULD-FIX

## Changes

### Issue 1: Empty string bypass (line 32)
- **Before:** `if (!authHeader && !agentIdHeader)` - falsy check treats `""` as absent, granting system owner access
- **After:** `if (authHeader === null && agentIdHeader === null)` - strict null check, only grants system owner when headers truly absent

### Issue 2: Unreachable fallback (line 66-67)
- **Before:** `return {}` - silently grants system owner access on logic error
- **After:** `throw new Error('Unreachable: authenticateAgent logic error')` - fails loudly to catch bugs
