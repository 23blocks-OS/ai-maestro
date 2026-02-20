# Code Correctness Report: team-registry

**Agent:** epcp-code-correctness-agent
**Domain:** team-registry (independent second-pass audit)
**Files audited:** 6
**Date:** 2026-02-20T16:21:00Z

## Files Audited

- `lib/team-registry.ts` (395 lines) -- primary target
- `types/team.ts` (99 lines)
- `types/governance.ts` (55 lines)
- `lib/governance.ts` (167 lines)
- `lib/file-lock.ts` (85 lines)
- `services/teams-service.ts` (647 lines) -- caller context
- `app/api/teams/[id]/chief-of-staff/route.ts` (83 lines) -- caller context
- `app/api/governance/transfers/[id]/resolve/route.ts` (203 lines) -- caller context

---

## MUST-FIX

### [CC-001] updateTeam() saves BEFORE G4 revocation, creating a window of inconsistency
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:348-370
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** `updateTeam()` calls `saveTeams(teams)` at line 348, then checks for G4 open-team revocation at lines 352-371. If newly-added agents exist in open teams, it mutates those teams and calls `saveTeams(teams)` again at line 370. Between the first save (line 348) and the second save (line 370), the on-disk state has the agent in BOTH the new closed team AND their old open teams. If the server crashes or another concurrent reader loads during this window, they see an inconsistent state that violates R4.1/G4. By contrast, `createTeam()` correctly does a single save AFTER G4 revocations (line 311).
- **Evidence:**
  ```typescript
  // line 348 - first save (agent is now in both closed + open teams on disk)
  saveTeams(teams)

  // lines 352-370 - G4 revocation happens AFTER first save
  if (updatedTeam.type === 'closed' && updates.agentIds) {
    ...
    if (openTeamsChanged) saveTeams(teams)  // second save
  }
  ```
- **Fix:** Move the first `saveTeams(teams)` call to AFTER the G4 revocation block (remove line 348, move it to after line 371), matching the pattern used in `createTeam()`. There should be exactly one `saveTeams()` call that captures both the team update and the G4 revocations atomically.

### [CC-002] updateTeam() G4 revocation only triggers when `updates.agentIds` is provided, misses type-change scenario
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:352
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** The G4 revocation block at line 352 has the condition `if (updatedTeam.type === 'closed' && updates.agentIds)`. This means if a team is changed from `open` to `closed` (via `updateTeam(id, { type: 'closed', chiefOfStaffId: cosId })`) WITHOUT explicitly passing `agentIds`, the G4 open-team revocation is skipped entirely. All existing members of the now-closed team will retain their open team memberships, violating G4 (v2 Rule 22).
- **Evidence:**
  ```typescript
  // line 352 - requires updates.agentIds to be explicitly provided
  if (updatedTeam.type === 'closed' && updates.agentIds) {
  ```
  The chief-of-staff route (line 70) calls: `updateTeam(id, { chiefOfStaffId: cosAgentId, type: 'closed' }, managerId)` -- this does NOT pass `agentIds`, so G4 revocation is skipped when promoting a team from open to closed via COS assignment.
- **Fix:** Change the condition to trigger G4 revocation when the team IS closed (regardless of whether `agentIds` was in the update payload). When the type itself changes to 'closed', all existing members (except MANAGER and COS) should have their open memberships revoked. Something like:
  ```typescript
  if (updatedTeam.type === 'closed') {
    const agentsToCheck = updates.agentIds
      ? updatedTeam.agentIds.filter(aid => !previousAgentIds.includes(aid))  // newly added
      : (previousType !== 'closed' ? updatedTeam.agentIds : [])              // type changed to closed: check all members
  ```

---

## SHOULD-FIX

### [CC-003] validateTeamMutation() multi-closed-team check skips agents already in the team, even if the team is changing FROM open TO closed
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:170-171
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** At line 171, the multi-closed-team constraint check skips agents already in `existingTeam.agentIds`. This makes sense for a team that is ALREADY closed (you don't want to re-check existing members). But if an open team is being converted to closed (type change from 'open' to 'closed'), the existing members have never been checked against the multi-closed constraint. An agent could be in another closed team AND in this (currently open) team. When this team becomes closed, that agent would be in two closed teams -- violating R4.1.
- **Evidence:**
  ```typescript
  // line 171 - skips ALL existing members, even when team type is changing
  if (existingTeam?.agentIds.includes(agentId)) continue
  ```
- **Fix:** Only skip existing members when the team is already closed. If the team type is changing from open to closed, existing members must be validated too:
  ```typescript
  if (existingTeam?.type === 'closed' && existingTeam.agentIds.includes(agentId)) continue
  ```

### [CC-004] createTeam() chiefOfStaffId can be set to undefined instead of null due to type coercion
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:283-285
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED (traced the code)
- **Description:** At lines 283-285, when `result.sanitized.chiefOfStaffId` is `undefined` (i.e., the key was never set in the sanitized object) and `data.chiefOfStaffId` is also `undefined`, the ternary evaluates to `undefined`. The Team type declares `chiefOfStaffId?: string | null`, so `undefined` is valid TypeScript, but this creates inconsistency: some teams will have `chiefOfStaffId: undefined` (absent from JSON) while others have `chiefOfStaffId: null`. Code like `team.chiefOfStaffId === null` would fail to match `undefined`.
- **Evidence:**
  ```typescript
  chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
    ? (result.sanitized.chiefOfStaffId as string | undefined)  // type assertion to string|undefined, but could be null
    : data.chiefOfStaffId,  // if data.chiefOfStaffId is undefined, team gets undefined
  ```
- **Fix:** Explicitly default to `null` when no COS is provided: `data.chiefOfStaffId ?? null`

### [CC-005] G2 (COS max 1 closed team) is NOT enforced
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:164-188
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** The comment on line 166 says "COS is NOT exempt from multi-closed-team constraint (v2 Rule 21: max 1 closed team)". However, line 171 skips agents already in the existing team. If an agent is being assigned as COS of a closed team they're already a member of, they pass this check. The G3 check (line 141-146) only prevents being COS of two teams simultaneously -- it does NOT prevent a COS from being a regular MEMBER of another closed team. Therefore: an agent could be a member of closed team A, then become COS of closed team B (passing the multi-closed check because they weren't "newly added" to B if they were already a member). They'd now be in two closed teams (as member of A, COS of B). The multi-closed-team constraint for COS is claimed but not fully enforced.
- **Note:** This is a nuanced edge case. The G3 check prevents being COS of TWO teams. But the comment says COS can only be in "max 1 closed team" total (as COS OR member). If COS is meant to be exempt from the multi-closed constraint as a MEMBER (like MANAGER), the comment is misleading.

### [CC-006] loadTeams() migration race condition with saveTeams()
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:229-232
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** The `loadTeams()` function performs a migration (adding `type: 'open'` to teams without it) and calls `saveTeams()` without holding the 'teams' lock. The comment on line 228 says "safe without lock — worst case is a redundant write." However, `loadTeams()` is also called from within `withLock('teams', ...)` blocks (in `createTeam`, `updateTeam`, `deleteTeam`). If a concurrent `getTeam()` call triggers the migration while `createTeam()` is mid-write, the migration's `saveTeams()` could overwrite `createTeam()`'s changes. The `migrationDone` flag mitigates this for in-process races after the first call, but the very first concurrent access is still vulnerable.
- **Evidence:**
  ```typescript
  // line 229-232: saveTeams called from loadTeams without lock
  if (needsSave && !migrationDone) {
    migrationDone = true
    saveTeams(teams)  // can race with locked operations
  }
  ```
- **Fix:** The risk is low (happens only once, on first server startup, and only if teams.json was from a pre-governance version). But the correct fix would be to set `migrationDone = true` at module load if the file already has all types set, or acquire the lock in loadTeams when migration is needed.

### [CC-007] Transfer resolve route allows COS of source team to be exempt from multi-closed check
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/governance/transfers/[id]/resolve/route.ts`:110
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced the code)
- **Description:** At line 110, the transfer resolve route checks `isChiefOfStaffAnywhere(agentId)` to determine if the transferred agent is "privileged" and exempt from the multi-closed-team constraint. But `isChiefOfStaffAnywhere` returns true if the agent is COS of ANY closed team -- including the source team they're leaving. If an agent is COS of the source team and being transferred to another closed team as a regular member, they're treated as privileged and bypass the multi-closed check. After the transfer completes, they're no longer COS anywhere (they were removed from the source team), but they're now in the destination closed team. This could leave the source team without a COS (depending on how COS removal is handled).
- **Evidence:**
  ```typescript
  const isPrivileged = agentId === managerId || isChiefOfStaffAnywhere(agentId)
  ```
- **Fix:** Check if the agent is COS of a team OTHER than the source team: `isChiefOfStaffAnywhere(agentId) && teams.some(t => t.chiefOfStaffId === agentId && t.id !== fromTeam.id)`

---

## NIT

### [CC-008] deleteTeam task/doc file cleanup uses both UUID validation and path.basename -- belt-and-suspenders
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:386-392
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The UUID regex check at line 386 already prevents path traversal. The `path.basename()` call at line 387 is redundant defense-in-depth. While not wrong, it suggests uncertainty about which check is sufficient. Both are fine to keep, but a comment explaining the layering would help maintainability.
- **Fix:** The current code is fine. Add a brief comment: "// Both UUID regex and path.basename are intentional defense-in-depth"

### [CC-009] Type assertion `as string | undefined` on line 284 is misleading
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:284
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The type assertion `result.sanitized.chiefOfStaffId as string | undefined` on a `Record<string, unknown>` value could also be `null` (since `validateTeamMutation` passes through `data.chiefOfStaffId` which is `string | null`). The assertion narrows to `string | undefined` but the value could actually be `null`, making the assertion technically incorrect.
- **Fix:** Change to `as string | null | undefined` or better yet, handle all three cases explicitly.

### [CC-010] validateTeamMutation COS Removal Guard (R4.7) only triggers when existingTeam has a COS
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts`:156
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The R4.7 guard at line 156 checks `existingTeam?.chiefOfStaffId` as a precondition. This means on CREATE (where existingTeam is null), the guard is skipped. This is correct for create -- you can't "remove" a COS from a team that doesn't exist yet. But the guard also skips if `existingTeam.chiefOfStaffId` is `null`. Combined with the fact that `data.chiefOfStaffId` could be set to a new COS in the same mutation that removes them from `data.agentIds`, this guard would miss: "set COS to X and agentIds to [Y, Z]" (where X is not in agentIds). However, the R4.6 auto-add block at lines 149-153 would catch this by adding X to agentIds. So the R4.7 guard is technically redundant in that scenario, but the code is fragile -- if R4.6 order changed, R4.7 would silently fail.
- **Fix:** Consider reordering R4.7 to check AFTER R4.6 auto-add, or checking `cosAfterMutation` without the `existingTeam?.chiefOfStaffId` precondition.

---

## CLEAN

Files with no issues found:
- `types/team.ts` -- No issues. Type definitions are clean and consistent.
- `types/governance.ts` -- No issues. Clean type definitions.
- `lib/file-lock.ts` -- No issues. Simple in-process mutex with correct acquire/release semantics. No deadlock detection but documented as Phase 1 limitation. Lock ordering invariant is clearly documented.

---

## Scenario Trace Results

### Scenario 1: Create closed team without COS -> should auto-downgrade to open
**Result: WORKS CORRECTLY**
- `createTeam({ name: 'X', type: 'closed', agentIds: ['a1'] })` calls `validateTeamMutation`
- Line 130: `effectiveType === 'closed' && !effectiveCOS` -> sets `sanitized.type = 'open'`
- Line 282: `createTeam` picks up `sanitized.type` as `'open'`
- Team is created as open. G5 auto-downgrade works.

### Scenario 2: Assign agent to closed team -> should revoke open team memberships (except MANAGER and COS)
**Result: PARTIALLY BROKEN (see CC-001, CC-002)**
- In `createTeam()`: Works correctly. Single save after G4 revocations (line 311).
- In `updateTeam()`: Double-save bug (CC-001). First save at line 348 writes inconsistent state.
- When changing team type from open to closed via COS assignment: G4 revocation is SKIPPED because `updates.agentIds` is not provided (CC-002).

### Scenario 3: Assign COS who is already COS elsewhere -> should reject
**Result: WORKS CORRECTLY**
- `validateTeamMutation` line 141-146: checks `teams.find(t => t.chiefOfStaffId === effectiveCOS && t.id !== teamId)`
- Returns `{ valid: false, error: 'Agent is already Chief-of-Staff of team "..."', code: 409 }`

### Scenario 4: Delete team while another operation is in progress
**Result: WORKS CORRECTLY (within Phase 1 constraints)**
- `deleteTeam()` uses `withLock('teams', ...)` -- serialized with other team operations
- Race between `deleteTeamById` pre-check (getTeam outside lock at service layer line 244) and the actual delete (inside lock) is a TOCTOU but benign: the lock'd `deleteTeam` returns false if team was already deleted, and the service returns 404.
