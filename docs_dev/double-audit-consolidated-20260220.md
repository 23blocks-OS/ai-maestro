# Double Audit Consolidated Findings — 2026-02-20

## Methodology
- **Round 1**: 9 independent correctness agents across all modified domains
- **Round 2**: 9 independent agents with fresh prompts, no access to R1 findings
- **Cross-reference**: Issues confirmed by BOTH rounds are highest confidence

## MUST-FIX (Confirmed Across Rounds)

### MF-01: amp-service.ts — Unsigned messages accepted in routeMessage
- **R1 CC-001 + R2 CC-001**: Lines 876-901. `else` branch only logs, doesn't reject.
- **Fix**: Reject unsigned messages from non-mesh senders.

### MF-02: amp-service.ts — deliverFederated accepts unsigned messages
- **R1 CC-002 + R2 CC-002**: Lines 1630-1658. If either signature or public_key missing, verification skipped.
- **Fix**: Require signature + public_key for all federated messages.

### MF-03: amp-service.ts — Unverified signature propagated
- **R1 CC-004 + R2 CC-003**: Line 898. When no sender keypair, signature stored unverified.
- **Fix**: Only set envelope.signature inside verified branch, or clear it.

### MF-04: team-registry.ts — saveTeams() return ignored (silent data loss)
- **R1 CC-001**: Lines 311, 348, 370, 383. All callers ignore boolean return.
- **Fix**: Make saveTeams throw on failure instead of returning false.

### MF-05: team-registry.ts — updateTeam() double-save inconsistency
- **R1 CC-002 (SHOULD) + R2 CC-001 (MUST)**: First save at 348, G4 revocation at 352-370, second save.
- **Fix**: Move G4 revocation before save, single save call.

### MF-06: team-registry.ts — G4 revocation skipped on type change to closed
- **R2 CC-002**: Condition `updates.agentIds` skips G4 when type changes without explicit agentIds.
- **Fix**: Check `updatedTeam.type === 'closed'` regardless of agentIds presence.

### MF-07: headless-router.ts — resolvedBy identity spoofing
- **R2 CC-001**: `auth.agentId || body.resolvedBy` allows body fallback when unauthenticated.
- **Fix**: Require auth.agentId, reject if absent (match Next.js route behavior).

### MF-08: governance/transfers + headless-router — requestedBy from untrusted body
- **R1 api-gov CC-002 + R2 api-gov CC-001 + R2 headless CC-002**: All confirm requestedBy spoofable.
- **Fix**: Add authenticateAgent to both Next.js route and headless route.

### MF-09: teams-service.ts — Command injection via teamName
- **R2 CC-001**: Newlines in teamName inject commands via tmux send-keys.
- **Fix**: Strip control characters from teamName before notification.

### MF-10: notification-service.ts — Double single-quote escaping
- **R2 CC-002**: Escapes in notification-service.ts AND agent-runtime.ts = garbled output.
- **Fix**: Remove escape in notification-service.ts; let sendKeys handle it.

### MF-11: governance-service.ts — 409 duplicate response breaks sendServiceResult
- **R2 CC-001**: Both `error` and `data` set; sendServiceResult discards error.
- **Fix**: Return error-only for 409 (no data field).

### MF-12: messages/route.ts — Missing JSON try/catch on POST
- **R1 api-gov CC-001**: `request.json()` not wrapped in try/catch.
- **Fix**: Add try/catch returning 400.

### MF-13: agents/transfer/route.ts — Missing JSON try/catch
- **R1 api-gov CC-004**: Same issue.
- **Fix**: Add try/catch returning 400.

## HIGH-PRIORITY SHOULD-FIX

### SF-01: agent-auth.ts — Empty string bypass + unreachable fallback
- R1 CC-005/CC-006 + R2 CC-005/CC-010: Falsy check treats "" as no auth (system owner).
- Fix: Use `=== null`, change fallback to throw.

### SF-02: amp-auth.ts — Timing-unsafe hash comparison
- R1 CC-003 + R2 CC-004: `===` string comparison, not constant-time.
- Fix: Use crypto.timingSafeEqual.

### SF-03: headless-router.ts — readJsonBody no size limit
- R2 CC-007: No body size limit = potential DoS.
- Fix: Add 1MB limit.

### SF-04: headless-router.ts — sendServiceResult error+data logic
- R2 CC-005: `!result.data` guard masks errors when both fields set.
- Fix: Send error response when error is set, regardless of data.

### SF-05: governance-service.ts — resolved! non-null assertion
- R2 CC-005: Fragile non-null assertion at line 438.
- Fix: Add explicit null guard.

### SF-06: team-registry.ts — validateTeamMutation skip on type change
- R2 CC-003: Existing members not checked against multi-closed when type changes.
- Fix: Only skip when team is already closed.

## Summary

| Priority | Count | Files |
|----------|-------|-------|
| MUST-FIX | 13 | 8 files |
| HIGH SHOULD-FIX | 6 | 5 files |
| Total Fixes | 19 | 11 unique files |
