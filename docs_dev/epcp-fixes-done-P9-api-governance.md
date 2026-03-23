# P9 Fixes: API Governance Routes

**Date:** 2026-02-26

## SHOULD-FIX

| ID | File | Fix |
|----|------|-----|
| SF-053 | `app/api/governance/transfers/[id]/resolve/route.ts:32` | Replaced `auth.status \|\| 401` with `auth.status ?? 401` |
| SF-054 | `app/api/governance/route.ts:12` | Replaced `?.name \|\| null` with `?.name ?? null` |
| SF-055 | `app/api/v1/governance/requests/route.ts:89-128` | Wrapped local submission path in try-catch |
| SF-056 | `app/api/governance/transfers/[id]/resolve/route.ts:113,146` | Replaced `fromTeam!` and `toTeam!` non-null assertions with explicit null checks |
| SF-057 | `app/api/v1/governance/requests/route.ts:138,146` | Truncated reflected query param values to max 50 chars via `.slice(0, 50)` |

## NIT

| ID | File | Fix |
|----|------|-----|
| NT-028 | `app/api/governance/manager/route.ts:60` | Changed `agent.name \|\| agent.alias` to `agent.name ?? agent.alias` |
| NT-029 | `app/api/governance/transfers/[id]/resolve/route.ts:159` | Added `console.error` for saveError before revert |
| NT-030 | `app/api/governance/trust/[hostId]/route.ts` | Added `export const dynamic = 'force-dynamic'` |
| NT-031 | `app/api/v1/governance/sync/route.ts:32` | Moved validSyncTypes to module-scope `VALID_SYNC_TYPES` Set |
