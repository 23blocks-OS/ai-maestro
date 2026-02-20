# Code Correctness Report: Governance G1-G5 Fixes

**Agent:** epcp-code-correctness-agent
**Domain:** governance-g1g5-fixes
**Files audited:** 3
**Date:** 2026-02-20T12:41:00Z

## MUST-FIX

### [CC-001] createTeam ignores G5 sanitized.type — closed team without COS saved as closed
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:278
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createTeam()` builds the team object using `data.type ?? 'open'` at line 278, ignoring the `result.sanitized.type` that `validateTeamMutation` may have set to `'open'` (G5 auto-downgrade at line 131). When a caller creates a team with `type: 'closed'` but no `chiefOfStaffId`, validation passes (G5 downgrades internally), but the created team is stored as `'closed'` because `data.type` is `'closed'` and takes precedence over the sanitized override. This violates the G5 invariant (v2 Rule 14: closed team without COS must downgrade to open).
- **Evidence:**
  ```typescript
  // line 278 in createTeam():
  type: data.type ?? 'open',   // BUG: ignores result.sanitized.type
  ```
  Compare with `updateTeam()` which correctly applies sanitized:
  ```typescript
  // line 333 in updateTeam():
  const finalUpdates = { ...updates, ...result.sanitized }  // CORRECT: applies G5 downgrade
  ```
- **Fix:** Apply `result.sanitized.type` to the team object in `createTeam()`:
  ```typescript
  type: (result.sanitized.type as TeamType) ?? data.type ?? 'open',
  ```

### [CC-002] G4 open-team revocation does not exempt COS agents — violates v2 Rule 21
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:288-303 (createTeam) and 343-362 (updateTeam)
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The G4 revocation logic removes agents from all open teams when they join a closed team. It correctly exempts the MANAGER (v2 Rule 20), but does NOT exempt COS agents. Per v2 Rule 21 (governance doc line 21): "The agents with the CHIEF-OF-STAFF title can belong to any number of open teams, but can only belong to one closed team at any time." So when a COS is assigned to a closed team, their open team memberships should be preserved.
- **Evidence:**
  ```typescript
  // createTeam G4 (lines 288-303):
  for (const agentId of team.agentIds) {
    if (agentId === managerId) continue  // Only MANAGER exempt
    // COS NOT exempted — their open team memberships are revoked!
    for (const otherTeam of teams) { ... }
  }
  ```
  Same pattern in `updateTeam` G4 (lines 350-359).
- **Fix:** Add COS exemption in both `createTeam` and `updateTeam` G4 blocks:
  ```typescript
  if (agentId === managerId) continue
  if (agentId === team.chiefOfStaffId) continue  // COS keeps open team memberships (v2 Rule 21)
  ```

## SHOULD-FIX

### [CC-003] validateTeamMutation G5 does not update effectiveType after auto-downgrade
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:130-131, 167
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When G5 auto-downgrade fires (line 130-131, sets `sanitized.type = 'open'`), the `effectiveType` variable remains `'closed'`. The subsequent multi-closed-team check at line 167 (`if (effectiveType === 'closed')`) still runs, potentially rejecting agents who should be allowed to join the team (since it's being downgraded to open). While this scenario is unlikely in practice (creating a closed team without COS is unusual), the code behavior is logically inconsistent.
- **Evidence:**
  ```typescript
  const effectiveType = (data.type ?? existingTeam?.type ?? 'open') as string  // line 124
  if (effectiveType === 'closed' && !effectiveCOS) {
    sanitized.type = 'open'  // G5: downgrade — but effectiveType is still 'closed'!
  }
  // ...
  if (effectiveType === 'closed') {  // line 167: still 'closed', should be 'open' after G5
    for (const agentId of finalAgentIds) { ... }
  }
  ```
- **Fix:** Change `effectiveType` from `const` to `let` and update it after G5:
  ```typescript
  let effectiveType = (data.type ?? existingTeam?.type ?? 'open') as string
  if (effectiveType === 'closed' && !effectiveCOS) {
    sanitized.type = 'open'
    effectiveType = 'open'  // Update local variable to match
  }
  ```

### [CC-004] COS denial message does not mention open-team messaging after G1 fix
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:121
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** After the G1 fix (lines 114-118) allows COS to message agents not in any closed team, the denial reason at line 121 is now incomplete/misleading. It says "Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, and own team members" but omits that COS can also message agents not in any closed team (open-team agents, unaffiliated agents).
- **Evidence:**
  ```typescript
  // G1 fix (lines 114-118) — allows COS → open-world agents
  if (!recipientInClosed) {
    return { allowed: true }
  }
  // Denial message (line 121) — doesn't mention open-world agents
  return {
    allowed: false,
    reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, and own team members',
  }
  ```
- **Fix:** Update the reason to:
  ```typescript
  reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, own team members, and agents not in any closed team',
  ```

### [CC-005] Open-world agents cannot message COS — contradicts governance permissions matrix
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:145-151
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The governance permissions matrix (doc lines 62-63) states that normal agents in open/no team CAN send to MANAGER (YES) and send to other COS (YES). However, the message filter denies this at Step 6 (lines 148-151). When an open-world agent sends to a COS who is in a closed team, the code reaches Step 6 and returns "Cannot message agents in closed teams from outside". The G1 fix only addressed COS→open direction, not open→COS direction.

  Note: This appears to be a pre-existing issue, not introduced by the G1-G5 fixes. The G1 fix addressed COS outbound to open agents, but the inbound path (open agents to COS) was not addressed.
- **Evidence:**
  Code path for open agent → COS:
  - Step 2: `!senderInClosed && !recipientInClosed` = `true && false` = `false` → skip
  - Step 3: sender is MANAGER? No → skip
  - Step 4: sender is COS? No → skip
  - Step 5: sender in closed? No → skip
  - Step 6: returns `{ allowed: false, reason: 'Cannot message agents in closed teams from outside' }`

  Governance matrix says: NORMAL (open/no team) → Send to other COS: YES
- **Fix:** Add a check before Step 6: if recipient is COS or MANAGER, allow the message from open-world agents:
  ```typescript
  // Between Step 5 and Step 6:
  // Open agents can reach the MANAGER and any COS (governance matrix row 62-63)
  if (!senderInClosed && recipientInClosed) {
    if (agentIsManager(recipientAgentId) || agentIsCOS(recipientAgentId)) {
      return { allowed: true }
    }
  }
  ```

## NIT

### [CC-006] G4 in createTeam saves twice when open team revocation occurs
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:285, 303
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createTeam()` calls `saveTeams(teams)` at line 285 (after pushing the new team), then potentially calls `saveTeams(teams)` again at line 303 (after G4 revocation). Both writes operate on the same `teams` array (the new team was already pushed). The G4 revocation modifies in-place via `splice`, so the second save includes all changes. The first save is redundant when G4 fires. This is functionally correct but wastes an I/O operation.
- **Fix:** Move the initial `saveTeams(teams)` to after the G4 block, or combine into a single save.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts — `makeTeam()` correctly includes `type: 'open' as const`. All three `makeTeam` definitions (fixtures.ts, validate-team-mutation.test.ts:44, team-registry.test.ts:62) are consistent and compatible with the `Team` type which requires `type: TeamType`.
