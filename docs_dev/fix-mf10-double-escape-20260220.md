# Fix MF-10: Double Single-Quote Escaping in notification-service.ts

**Date:** 2026-02-20
**File:** `lib/notification-service.ts`

## Issue

Line 54 had `message.replace(/'/g, "'\\''")` which escapes single quotes before passing to `sendKeys()`. But `sendKeys()` in `agent-runtime.ts` line 181 already does the exact same escape when `literal: true`. Result: double-escaping garbles messages containing single quotes.

## Fix Applied

1. Removed the redundant single-quote escape from `notification-service.ts`
2. Added control character stripping (`[\x00-\x1F\x7F]`) as defense-in-depth against terminal injection
3. Added comments explaining why escaping is NOT done here (delegated to `sendKeys`)

## Verification

- `npx tsc --noEmit` passes with no errors for this file
- Change is minimal and targeted (2 lines changed in place)
