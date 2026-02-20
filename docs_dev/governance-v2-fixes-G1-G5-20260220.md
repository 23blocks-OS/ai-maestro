# Governance v2 Rule Fixes G1-G5
Generated: 2026-02-20T04:26:11Z

## Task
Apply v2 governance rule fixes (G1-G5) across 4 files to align with Governance Rules v2.

## Changes Made

### G1: COS can message open-team agents (lib/message-filter.ts)
- Added check before COS denial: if recipient is NOT in any closed team, allow the message
- Uses existing `recipientInClosed` variable (line 78)
- Implements v2 Rule 6: COS can send/receive messages from agents in open teams

### G2: COS cannot be in >1 closed team (lib/team-registry.ts)
- Removed COS exemptions from multi-closed-team constraint in `validateTeamMutation()`
- Removed: `if (agentId === effectiveCOS) continue`
- Removed: `const isCOSAnywhere = teams.some(...)` + `if (isCOSAnywhere) continue`
- Only MANAGER remains exempt (v2 Rule 20 vs v2 Rule 21)

### G3: COS eligibility check (lib/team-registry.ts)
- Added new validation: agent already serving as COS of another team cannot be assigned as COS
- Returns 409 with descriptive error message naming the conflicting team
- Placed after COS-on-open-team check and before COS Membership Invariant

### G4: Open team memberships revoked on closed-team join (lib/team-registry.ts)
- In `createTeam()`: after saving, iterates all agents in new closed team and removes them from open teams
- In `updateTeam()`: captures `previousAgentIds` before mutation, then only revokes open memberships for NEWLY added agents
- MANAGER is exempt from revocation (v2 Rule 20)

### G5: Auto-downgrade closed team when COS removed (lib/team-registry.ts)
- Replaced hard error ("A closed team must have a Chief-of-Staff assigned") with auto-downgrade
- Now sets `sanitized.type = 'open'` instead of returning validation error
- Implements v2 Rule 14

### Fixture fix (tests/test-utils/fixtures.ts)
- Added `type: 'open' as const` to `makeTeam()` default return object

## Files Modified
1. `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` - G1
2. `/Users/emanuelesabetta/ai-maestro/lib/team-registry.ts` - G2, G3, G4, G5
3. `/Users/emanuelesabetta/ai-maestro/tests/test-utils/fixtures.ts` - fixture fix
