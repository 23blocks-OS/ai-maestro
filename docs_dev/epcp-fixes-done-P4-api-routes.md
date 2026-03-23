# EPCP Fixes Done - Pass 4 - API Routes Domain
Generated: 2026-02-22T18:45:00Z

## Summary
5/5 findings fixed across 2 files.

## Fixes Applied

### SF-001: Validate requestedByRole and payload in governance requests POST
**File:** `app/api/v1/governance/requests/route.ts`
**Change:** Added validation after existing field checks (lines 80-93):
- `requestedByRole` must be one of `manager`, `chief-of-staff`, `member` (using module-level `VALID_REQUESTED_BY_ROLES` Set)
- `payload` must be a non-array object
- `payload.agentId` must be a string

### SF-002: Fix HOSTNAME_RE regex to allow single-character hostnames
**File:** `app/api/v1/governance/requests/route.ts`
**Change:** Regex changed from `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,253}[a-zA-Z0-9]$/` to `/^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/`
- Old regex required minimum 3 chars (start + middle + end)
- New regex allows single char (`a`) via optional group, and correctly caps total at 253 chars

### NT-001: Move HOSTNAME_RE to module level
**File:** `app/api/v1/governance/requests/route.ts`
**Change:** Moved `HOSTNAME_RE` from inline in GET handler (line 129) to module-level constant (line 122), alongside `VALID_GOVERNANCE_REQUEST_STATUSES`, `VALID_GOVERNANCE_REQUEST_TYPES`, and new `VALID_REQUESTED_BY_ROLES`.

### NT-002: Add auth comment to GET handler
**File:** `app/api/agents/[id]/skills/settings/route.ts`
**Change:** Added comment above GET export: `// Phase 1: no auth required for reads (localhost-only). Phase 2 should add auth for sensitive settings.`

### NT-003: Stop leaking error details in 500 responses
**File:** `app/api/agents/[id]/skills/settings/route.ts`
**Change:** Both GET and PUT 500 catch blocks changed from `error instanceof Error ? error.message : 'Unknown error'` to just `'Internal server error'`. Server-side `console.error` logging retained for debugging.

## Files Modified
1. `app/api/v1/governance/requests/route.ts` - SF-001, SF-002, NT-001
2. `app/api/agents/[id]/skills/settings/route.ts` - NT-002, NT-003
