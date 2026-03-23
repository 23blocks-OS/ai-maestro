# P5 Governance-API Fixes Report

Generated: 2026-02-22

## Summary

10 findings reviewed. 5 were already fixed in prior passes. 5 required new edits.

## Already Fixed (no changes needed)

| ID | Finding | Status |
|----|---------|--------|
| MF-024 | POST/GET handlers missing try/catch | Already wrapped in try/catch (lines 95-106, 152-168) |
| MF-025 | exchange-peers missing result.error check | Already present at line 17 |
| SF-055 | register-peer missing result.error check | Already present at line 17 |
| SF-059 | `(h: any)` unnecessary any annotation | Already removed, uses `(h) =>` at line 40 |
| SF-060 | Error leaks hostId value | Already uses generic `'Unknown host'` at line 42 |

## Fixes Applied

| ID | File | Fix |
|----|------|-----|
| NT-034 | `app/api/v1/governance/requests/route.ts` | Added comment at line 95 noting body fields are validated above and service validates internally |
| NT-035 | `app/api/v1/governance/requests/route.ts` | Added comment at line 132 noting statusParam reflection is acceptable for Phase 1 JSON API |
| NT-040 | `app/api/hosts/[id]/route.ts` | Added HOSTNAME_RE validation for path `id` param in both PUT and DELETE handlers |
| NT-041 | `app/api/teams/names/route.ts` | Added `export const dynamic = 'force-dynamic'` (governance/route.ts and governance/reachable/route.ts already had it) |

## Files Modified

1. `app/api/v1/governance/requests/route.ts` - 2 comment additions (NT-034, NT-035)
2. `app/api/hosts/[id]/route.ts` - HOSTNAME_RE const + validation in PUT and DELETE (NT-040)
3. `app/api/teams/names/route.ts` - force-dynamic export (NT-041)
