# PR: Team Governance Enforcement

## Summary

Implements team governance enforcement for AI Maestro's multi-agent messaging system:

- **Team types**: `open` (unrestricted) and `closed` (messaging isolation, COS required)
- **Roles**: MANAGER (global singleton), Chief-of-Staff (per closed team), Normal
- **Message filtering**: 7-step `checkMessageAllowed()` blocks unauthorized cross-team messages for closed teams
- **Resource ACL**: `checkTeamAccess()` enforces read/write permissions based on role
- **Business rules**: `validateTeamMutation()` centralizes 8 rules (R1-R8) for team state transitions
- **Transfer system**: Agents request transfers between teams; MANAGER approves/rejects
- **File locking**: `withLock()` mutex prevents concurrent file corruption
- **UI**: Role badges, team membership panel, governance password dialog, transfer approval workflow
- **Rate limiting**: In-memory sliding window rate limiter on governance password endpoints
- **Async bcrypt**: Non-blocking password hashing/verification

## Commits

1. `87cbac1` - Add team governance: messaging isolation, role-based ACL, closed teams
2. `887b0f4` - Add governance UI: role management, team membership, messaging filters, transfer approvals
3. `da47b4b` - Fix governance UI review issues
4. `ca465a8` - Fix governance code review issues 6-9, add file locking, caching, notifications, and tests
5. `c482df8` - Bump version to 0.23.10
6. `11a5193` - Enforce governance business rules server-side and UI, add tests (v0.23.11)
7. `c39394e` - Fix all PR review findings: 13 MUST-FIX, 32 SHOULD-FIX, 18 NIT (v0.23.12)
8. `3355219` - Fix v2 review findings: 4 MUST-FIX, 19 SHOULD-FIX, 28 NIT (v0.23.13)
9. `ec82db3` - Fix v4 review findings SR-001 through SR-011, bump to v0.23.14

## Key Implementation Details

- Transfer approval flow: constraint checks BEFORE `resolveTransferRequest()` marks transfer as approved, with compensating `revertTransferToPending()` if `saveTeams()` fails
- Closed team deletion requires MANAGER or Chief-of-Staff authority (agents). Web UI (no X-Agent-Id) retains admin privileges for Phase 1.
- `verifyPassword()` is async (non-blocking bcrypt.compare), rate-limited (5 attempts/60s via shared key)
- `loadGovernance()` distinguishes SyntaxError (JSON corruption) from read errors
- Phase 1 design: localhost-only, no authentication. Known limitations documented with Phase 2 TODOs for read-modify-write races and web UI ACL bypass.
- UUID validation on all path parameters to prevent path traversal
- All team mutations go through `validateTeamMutation()` which enforces R1-R8 business rules

## Test Coverage

336 tests passing across 8 test files covering governance, team registry, transfer registry, message filter, team API, validate-team-mutation, document API, task registry, and transfer resolve route.
