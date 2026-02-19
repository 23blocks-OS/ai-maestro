# Claim Verification Report

**Agent:** epcp-claim-verification-agent
**PR:** feature/team-governance (6 commits against main)
**Date:** 2026-02-16T20:40:00Z
**Claims extracted:** 24
**Verified:** 22 | **Failed:** 0 | **Partial:** 1 | **Unverifiable:** 1

## FAILED CLAIMS (MUST-FIX)

None.

## PARTIALLY IMPLEMENTED (SHOULD-FIX)

### [CV-001] Claim: "8 business rules (R1-R4)"
- **Source:** Commit message 11a5193, line "Add validateTeamMutation() with 8 business rules (R1-R4)"
- **Severity:** SHOULD-FIX (documentation inaccuracy, not code bug)
- **Verification:** PARTIALLY IMPLEMENTED
- **What works:** The validateTeamMutation() function at lib/team-registry.ts:63-182 enforces all the listed rules. However, the commit message lists 7 named rules in the parenthetical ("duplicate name, COS-closed invariant, multi-closed-team constraint, COS membership guard, team type validation, agent name collision, COS removal guard") plus name sanitization validation (length, format, alphanumeric start), which totals 8+ distinct checks.
- **What's ambiguous:** The parenthetical says "(R1-R4)" but the actual code references R1.3, R1.4, R1.7, R1.8, R2.1, R2.2, R2.3, R4.1, R4.3, R4.4, R4.6, R4.7 -- spanning 12 sub-rules across 3 rule groups (R1, R2, R4). The number "8" likely counts the top-level validation branches, which is reasonable (name min-length, name max-length, name format, name uniqueness, agent collision, type validation, COS-closed invariant, COS-open rejection, COS membership auto-add, COS removal guard, multi-closed-team constraint = 11 checks). The "8" is an undercount, not an overcount.
- **Evidence:** lib/team-registry.ts:63-182 contains 11 distinct validation branches
- **Impact:** Low -- the function does MORE than claimed, not less. Documentation-only issue.

## UNVERIFIABLE CLAIMS

### [CV-002] Claim: "All 322 tests pass, clean build"
- **Source:** Commit message 11a5193
- **Verification:** CANNOT VERIFY
- **Reason:** Test execution and build verification require running `yarn test` and `yarn build`, which is outside the scope of static code analysis. The test files exist and appear structurally sound.

## CONSISTENCY ISSUES

None found. All version strings (0.23.11) are consistent across all 7 locations:
- version.json:2 -- `"version": "0.23.11"`
- package.json:3 -- `"version": "0.23.11"`
- README.md:11 -- badge version 0.23.11
- docs/BACKLOG.md:6 -- `v0.23.11`
- docs/index.html:80 -- `"softwareVersion": "0.23.11"`
- docs/index.html:449 -- `v0.23.11`
- docs/ai-index.html:35 -- `"softwareVersion": "0.23.11"`
- scripts/remote-install.sh:32 -- `VERSION="0.23.11"`

## VERIFIED CLAIMS

| # | Claim | File:Line | Status |
|---|---|---|---|
| 1 | "validateTeamMutation() with business rules" | lib/team-registry.ts:63-182 | VERIFIED |
| 2 | "duplicate name check (case-insensitive)" | lib/team-registry.ts:96-101 | VERIFIED |
| 3 | "COS-closed invariant" (closed team must have COS) | lib/team-registry.ts:127-130 | VERIFIED |
| 4 | "multi-closed-team constraint" (normal agents max 1 closed team) | lib/team-registry.ts:152-179 | VERIFIED |
| 5 | "COS membership guard" (auto-add COS to agentIds) | lib/team-registry.ts:136-141 | VERIFIED |
| 6 | "team type validation" (only 'open' or 'closed') | lib/team-registry.ts:115-119 | VERIFIED |
| 7 | "agent name collision" checking | lib/team-registry.ts:103-109 | VERIFIED |
| 8 | "COS removal guard" (cannot remove COS from agentIds) | lib/team-registry.ts:143-150 | VERIFIED |
| 9 | "messaging isolation" for closed teams | lib/message-filter.ts:38-112 (7-step algorithm) | VERIFIED |
| 10 | "COS auto-upgrade/downgrade when assigning/removing COS" | app/api/teams/[id]/chief-of-staff/route.ts:37 (downgrade to open) and :52 (upgrade to closed) | VERIFIED |
| 11 | "real-time name validation" in create team UI | app/teams/page.tsx:64-112 (fetches /api/teams/names, validates on keystroke) | VERIFIED |
| 12 | "New /api/teams/names endpoint" | app/api/teams/names/route.ts:1-16 | VERIFIED |
| 13 | "15 tests for validate-team-mutation" | tests/validate-team-mutation.test.ts (15 `it()` calls counted) | VERIFIED |
| 14 | "10 tests for message-filter" | tests/message-filter.test.ts (10 `it()` calls counted) | VERIFIED |
| 15 | "file locking" in team-registry | lib/team-registry.ts:245,277,303 (createTeam, updateTeam, deleteTeam all use withLock) | VERIFIED |
| 16 | "file locking" in governance | lib/governance.ts:62,87,96 (setPassword, setManager, removeManager all use withLock) | VERIFIED |
| 17 | "file locking" in transfer-registry | lib/transfer-registry.ts:54,97,117 (createTransferRequest, resolveTransferRequest, cleanupOldTransfers all use withLock) | VERIFIED |
| 18 | "COS cannot be transferred" | app/api/governance/transfers/route.ts:72-75 (checks chiefOfStaffId === agentId, returns 400) | VERIFIED |
| 19 | "source != destination" in transfer creation | app/api/governance/transfers/route.ts:51-54 (fromTeamId === toTeamId check) | VERIFIED |
| 20 | "multi-closed-team check on transfer approval" | app/api/governance/transfers/[id]/resolve/route.ts:68-83 | VERIFIED |
| 21 | "destination existence check on transfer approval" | app/api/governance/transfers/[id]/resolve/route.ts:61-64 | VERIFIED |
| 22 | "Strip chiefOfStaffId and type from PUT /api/teams/[id]" | app/api/teams/[id]/route.ts:37-38 (destructures only safe fields) | VERIFIED |
| 23 | "5-second TTL in-memory cache on /api/governance/reachable" | app/api/governance/reachable/route.ts:7-8 (CACHE_TTL_MS = 5_000) | VERIFIED |
| 24 | "AMP tmux notification on transfer resolve" | app/api/governance/transfers/[id]/resolve/route.ts:97-118 (notifyAgent call) | VERIFIED |

## DETAILED VERIFICATION NOTES

### Claim 1-8: validateTeamMutation business rules

Read the full function at lib/team-registry.ts:63-182. Traced each validation branch:

1. **Name length validation** (lines 81-86): Checks min 4, max 64 chars after sanitization. VERIFIED.
2. **Name format** (lines 88-94): Must start with alphanumeric, only safe display chars. VERIFIED.
3. **Duplicate name** (lines 96-101): Case-insensitive comparison, excludes self on update. VERIFIED.
4. **Agent name collision** (lines 103-109): Checks reservedNames parameter. VERIFIED -- and the POST /api/teams route at app/api/teams/route.ts:30-32 actually passes agent names as reservedNames.
5. **TeamType validation** (lines 115-119): Only 'open' or 'closed'. VERIFIED.
6. **COS-closed invariant** (lines 127-130): Closed team requires COS. VERIFIED.
7. **COS on open team rejected** (lines 131-134): COS cannot be set on open team. VERIFIED.
8. **COS auto-add to agentIds** (lines 136-141): If COS not in agentIds, adds them. VERIFIED.
9. **COS removal guard** (lines 143-150): Cannot remove COS from agentIds while active. VERIFIED.
10. **Multi-closed-team constraint** (lines 152-179): Normal agents blocked, MANAGER and COS exempt. VERIFIED -- exemptions at lines 160 (MANAGER), 162 (COS being assigned), 164 (COS anywhere).

### Claim 9: Messaging isolation

Read lib/message-filter.ts:38-112. The 7-step algorithm is implemented exactly as documented:
- Step 1 (line 42-44): Null sender (mesh-forwarded) always allowed
- Step 2 (lines 52-55): Neither in closed team = open world
- Step 3 (lines 57-60): MANAGER can message anyone
- Step 4 (lines 62-80): COS can reach MANAGER, other COS, own team members
- Step 5 (lines 82-100): Normal member can reach same-team and own COS
- Step 6 (lines 102-108): Outside sender denied to closed-team recipient
- Step 7 (lines 110-111): Default allow

Integration verified: checkMessageAllowed is called in both:
- app/api/v1/route/route.ts:568 (AMP routing)
- lib/message-send.ts:154 (Web UI sending)

### Claim 10: COS auto-upgrade/downgrade

Read app/api/teams/[id]/chief-of-staff/route.ts:35-53.
- **Removing COS** (line 37): Sets both `chiefOfStaffId: null` AND `type: 'open'` -- auto-downgrade. VERIFIED.
- **Assigning COS** (line 52): Sets `chiefOfStaffId`, `type: 'closed'`, AND auto-adds COS to agentIds -- auto-upgrade. VERIFIED.

### Claim 11-12: Real-time name validation

Read app/teams/page.tsx:64-112 and app/api/teams/names/route.ts:1-16.
- On dialog open, fetches /api/teams/names to get all team names and agent names
- Client-side validates: length, format, duplicate team name, agent name collision
- All with visual feedback and disabled Create button on error
- /api/teams/names returns both teamNames and agentNames arrays

### Claim 15-17: File locking

lib/file-lock.ts:21-69 implements a proper in-process mutex with acquire/release/withLock pattern. All three registries (team-registry, governance, transfer-registry) use withLock for every mutating operation. VERIFIED by tracing every `withLock` call.

### Claim 21: useGovernance client-side guards

Read hooks/useGovernance.ts:152-222.
- **Multi-closed-team guard** (lines 167-175): Client-side check in addAgentToTeam before calling PUT. VERIFIED.
- **COS removal guard** (lines 204-207): Client-side check in removeAgentFromTeam. VERIFIED.
Both are explicitly labeled as "UX guards" with server enforcement as the real guard.
