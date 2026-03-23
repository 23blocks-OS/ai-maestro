# EPCP P8 Fixes: API Agents Routes Domain

**Date:** 2026-02-23T03:01:00Z
**Pass:** 8
**Domain:** app/api/agents/**, app/api/v1/**, app/api/agents/by-name/**, app/api/agents/unified/**

---

## Summary

| Finding | Severity | Status | Files Changed |
|---------|----------|--------|---------------|
| MF-002 | MUST-FIX | FIXED | app/api/agents/[id]/route.ts |
| MF-003 | MUST-FIX | FIXED | 21 route files (see list below) |
| SF-012 | SHOULD-FIX | FIXED | 5 v1 route files |
| SF-019 | SHOULD-FIX | FIXED | app/api/agents/[id]/messages/[messageId]/route.ts |
| SF-020 | SHOULD-FIX | FIXED | app/api/agents/[id]/memory/long-term/route.ts |
| SF-021 | SHOULD-FIX | FIXED | app/api/agents/[id]/memory/long-term/route.ts |
| SF-022 | SHOULD-FIX | FIXED | app/api/agents/[id]/search/route.ts |
| NT-010 | NIT | FIXED | app/api/v1/health/route.ts, app/api/v1/info/route.ts |
| NT-013 | NIT | FIXED | Multiple files (unused request params prefixed with _) |

**Total: 9/9 findings fixed.**

---

## MF-002: Missing try-catch in agents/[id]/route.ts

Added outer try-catch to GET, PATCH, and DELETE handlers in `app/api/agents/[id]/route.ts`.

Pattern:
```typescript
try {
  // existing handler body
} catch (error) {
  console.error('[Agents GET] Error:', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

## MF-003: Missing try-catch in 21 route files

Added outer try-catch to all handlers in:

1. `app/api/agents/[id]/database/route.ts` (GET, POST)
2. `app/api/agents/[id]/graph/code/route.ts` (GET, POST, DELETE)
3. `app/api/agents/[id]/graph/db/route.ts` (GET, POST, DELETE)
4. `app/api/agents/[id]/graph/query/route.ts` (GET)
5. `app/api/agents/[id]/hibernate/route.ts` (POST)
6. `app/api/agents/[id]/index-delta/route.ts` (POST)
7. `app/api/agents/[id]/memory/route.ts` (GET, POST)
8. `app/api/agents/[id]/memory/consolidate/route.ts` (GET, POST, PATCH)
9. `app/api/agents/[id]/memory/long-term/route.ts` (GET, DELETE, PATCH)
10. `app/api/agents/[id]/messages/route.ts` (GET, POST)
11. `app/api/agents/[id]/messages/[messageId]/route.ts` (GET, PATCH, DELETE, POST)
12. `app/api/agents/[id]/metrics/route.ts` (GET, PATCH)
13. `app/api/agents/[id]/search/route.ts` (GET, POST)
14. `app/api/agents/[id]/session/route.ts` (POST, PATCH, GET, DELETE)
15. `app/api/agents/[id]/tracking/route.ts` (GET, POST)
16. `app/api/agents/[id]/wake/route.ts` (POST)
17. `app/api/agents/[id]/amp/addresses/[address]/route.ts` (GET, PATCH, DELETE)
18. `app/api/agents/[id]/email/addresses/route.ts` (GET, POST)
19. `app/api/agents/[id]/email/addresses/[address]/route.ts` (GET, PATCH, DELETE)
20. `app/api/agents/by-name/[name]/route.ts` (GET)
21. `app/api/agents/unified/route.ts` (GET)

Note: `app/api/agents/[id]/amp/addresses/route.ts` already had try-catch (skipped).

## SF-012: Non-null assertion on result.data! in AMP v1 routes

Replaced `result.data!` with `(result.data ?? {}) as <ExpectedType>` in:
- `app/api/v1/health/route.ts`
- `app/api/v1/info/route.ts`
- `app/api/v1/messages/pending/route.ts` (3 occurrences)
- `app/api/v1/register/route.ts`
- `app/api/v1/route/route.ts`

## SF-019: Unsafe type assertion for `box` query parameter

Added runtime validation in `messages/[messageId]/route.ts`:
```typescript
const VALID_BOX_VALUES: readonly string[] = ['inbox', 'sent']
const boxParam = searchParams.get('box') || 'inbox'
if (!VALID_BOX_VALUES.includes(boxParam)) {
  return NextResponse.json({ error: 'Invalid box parameter...' }, { status: 400 })
}
```

## SF-020: Unsafe type assertion for `category` in long-term memory route

Added runtime validation in `memory/long-term/route.ts`:
```typescript
const VALID_CATEGORIES: readonly string[] = ['fact', 'decision', 'preference', 'pattern', 'insight', 'reasoning']
if (categoryParam && !VALID_CATEGORIES.includes(categoryParam)) {
  return NextResponse.json({ error: 'Invalid category parameter...' }, { status: 400 })
}
```

## SF-021: Unsafe type assertion for `tier` in long-term memory route

Added runtime validation in `memory/long-term/route.ts`:
```typescript
const VALID_TIERS: readonly string[] = ['warm', 'long']
if (tierParam && !VALID_TIERS.includes(tierParam)) {
  return NextResponse.json({ error: 'Invalid tier parameter...' }, { status: 400 })
}
```

## SF-022: Unsafe type assertion for `roleFilter` in search route

Added runtime validation in `search/route.ts`:
```typescript
const VALID_ROLES: readonly string[] = ['user', 'assistant', 'system']
if (roleParam && !VALID_ROLES.includes(roleParam)) {
  return NextResponse.json({ error: 'Invalid role parameter...' }, { status: 400 })
}
```

## NT-010: Unused import NextRequest in v1/health and v1/info routes

Changed import from `import { NextRequest, NextResponse }` to `import { NextResponse }` in:
- `app/api/v1/health/route.ts`
- `app/api/v1/info/route.ts`

Also changed parameter type from `NextRequest` to `Request` since no Next.js-specific features are used.

## NT-013: Unused request parameter not prefixed with underscore

Prefixed unused `request` parameters with `_` in:
- `app/api/agents/[id]/database/route.ts` POST handler
- `app/api/agents/[id]/memory/route.ts` GET handler
- `app/api/agents/[id]/memory/consolidate/route.ts` GET handler
- `app/api/agents/[id]/metrics/route.ts` GET handler
- `app/api/agents/[id]/session/route.ts` GET handler
- `app/api/v1/health/route.ts` GET handler
- `app/api/v1/info/route.ts` GET handler

---

## Bonus fixes applied by linter

The linter automatically fixed:
- SF-016/SF-017: Falsy-zero patterns in search/route.ts (NaN-check instead of `|| undefined`)
- SF-018: Falsy-zero pattern in memory/consolidate/route.ts
- NT-012: `any` type in graph/code/route.ts POST body changed to `Record<string, unknown>`

---

## TypeScript verification

After all changes: `npx tsc --noEmit` shows 0 new errors from these changes.
Pre-existing errors (8 in test files and governance-service.ts) remain unchanged.
