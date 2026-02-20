# SF-02 Fix: Timing-safe hash comparison in amp-auth.ts

**Date:** 2026-02-20
**File:** lib/amp-auth.ts
**Severity:** HIGH SHOULD-FIX

## Problem
Hash string comparisons using `===` are not constant-time, making them vulnerable to timing attacks.

## Changes

1. **Import**: Added `timingSafeEqual` to the existing crypto import (line 14)
2. **verifyApiKeyHash()** (line 89-95): Replaced `===` with `Buffer.from()` + `timingSafeEqual()`
3. **validateApiKey()** (line 169-180): Replaced `k.key_hash === keyHash` with constant-time comparison
4. **rotateApiKey()** (line 233-237): Replaced `k.key_hash === oldKeyHash` with constant-time comparison
5. **revokeApiKey()** (line 278-282): Replaced `k.key_hash === keyHash` with constant-time comparison

All 4 hash comparison sites now use `timingSafeEqual` with a length guard to prevent throws on mismatched buffer sizes.

## Verification
- `npx tsc --noEmit` shows 0 errors related to amp-auth.ts
- No surrounding code was refactored
