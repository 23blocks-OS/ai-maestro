# Implementation Report: CC-003 ACL Denial Tests for team-api.test.ts
Generated: 2026-02-20T15:46:00Z

## Task
Add tests exercising the `checkTeamAccess` denial path for PUT and DELETE in team-api.test.ts, as identified by audit finding CC-003.

## Changes Made

### 1. Added `checkTeamAccess` import (line 70)
```typescript
import { checkTeamAccess } from '@/lib/team-acl'
```

### 2. Added `renameSync` and `unlinkSync` to fs mock (lines 24-33)
Pre-existing issue: team-registry.ts uses `renameSync` for atomic writes and `unlinkSync` for cleanup, but the fs mock was missing these. Added both to fix 11 pre-existing test failures.

### 3. PUT ACL denial test (CC-003)
```typescript
// CC-003: ACL denial path - checkTeamAccess returns { allowed: false } for PUT
it('returns 403 when ACL denies access', async () => { ... })
```
- Creates a team, mocks `checkTeamAccess` to return `{ allowed: false, reason: 'Not a member' }`
- Makes PUT request with `X-Agent-Id: outsider-agent` header
- Verifies 403 response with correct error message
- STATUS: PASSING

### 4. DELETE ACL denial test (CC-003)
```typescript
// CC-003: ACL denial path - checkTeamAccess returns { allowed: false } for DELETE
it('returns 403 when ACL denies access', async () => { ... })
```
- Creates a team, mocks `checkTeamAccess` to return `{ allowed: false, reason: 'Not a member' }`
- Makes DELETE request with `X-Agent-Id: outsider-agent` header
- Verifies 403 response with correct error message
- STATUS: FAILING (expected) -- `deleteTeamById` does NOT yet call `checkTeamAccess`. Will pass once the teams-service.ts fix agent adds `checkTeamAccess` to `deleteTeamById`.

## Test Results
- Total: 24 tests
- Passed: 23
- Failed: 1 (DELETE ACL denial -- awaiting parallel teams-service.ts fix)

## Notes
- The fs mock fix (renameSync/unlinkSync) resolved 11 pre-existing failures unrelated to CC-003
- The PUT ACL test passes because `updateTeamById` already calls `checkTeamAccess` unconditionally
- The DELETE ACL test is a valid TDD "red" test that will turn green when `deleteTeamById` gets `checkTeamAccess` added
