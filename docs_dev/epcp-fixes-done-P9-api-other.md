# P9 Review Fixes - API Other Routes

**Date:** 2026-02-26

## MUST-FIX (3/3 done)

| ID | File | Fix |
|----|------|-----|
| MF-004 | `app/api/hosts/health/route.ts` | Added early return for empty `hostUrl` param (400) |
| MF-005 | `app/api/hosts/health/route.ts` | Bare hostname alias match now validates port matches host's configured port |
| MF-006 | `app/api/organization/route.ts` | Added `if (result.error)` guard before success return in GET handler |

## SHOULD-FIX (8/8 done)

| ID | File | Fix |
|----|------|-----|
| SF-014 | `app/api/plugin-builder/push/route.ts` | Added `.every()` check that each source is a string |
| SF-015 | `app/api/v1/health/route.ts` | Replaced `?? {}` fallback with explicit `!result.data` error guard |
| SF-016 | `app/api/conversations/parse/route.ts` | Added type+truthy validation for `conversationFile` |
| SF-017 | `app/api/conversations/[file]/messages/route.ts` | Added `../` path traversal check on decoded file param |
| SF-018 | `app/api/sessions/[id]/command/route.ts` | Wrapped `checkIdleStatus` in inner try-catch with proper error response |
| SF-020 | `app/api/sessions/create/route.ts` | Added regex validation `^[a-zA-Z0-9_-]+$` for session name |
| SF-021 | `app/api/sessions/[id]/rename/route.ts` | Added regex validation `^[a-zA-Z0-9_-]+$` for newName |
| SF-022 | `app/api/sessions/[id]/command/route.ts` | Added `!body.command || typeof body.command !== 'string'` check |

## NIT (2/2 done)

| ID | File | Fix |
|----|------|-----|
| NT-011 | `app/api/v1/messages/pending/route.ts` | Extracted `ampError()` helper, documented why both fields get same value |
| NT-013 | `app/api/sessions/restore/route.ts` | Added comment documenting Phase 2 standardization target |
