# P9 Review Fixes: Components & Hooks

**Date:** 2026-02-26
**Branch:** feature/team-governance

## MUST-FIX

### MF-012: MeetingRoom.tsx - Duplicate team creation guard
- Added `creatingTeamRef = useRef(false)` guard
- First useEffect (createMeetingRecord): checks `creatingTeamRef.current` before team creation, sets true before POST, resets in finally
- Second useEffect (team ID resolution): same guard pattern, resets in .finally()

### MF-013: MeetingRoom.tsx - handleStartMeeting stale state.teamName
- Captured `effectiveTeamName` in local variable before dispatch
- Used local variable in notification body instead of stale `state.teamName`

### MF-014: MessageCenter.tsx - compose priority/type reset
- Already fixed in prior pass: both forward and regular send paths reset `composePriority('normal')` and `composeType('request')` after clearing other fields

## SHOULD-FIX

### SF-040: useGovernance.ts - refresh() fire-and-forget
- Added `mutationAbortRef` (AbortController ref) aborted on unmount
- All three mutation callbacks (setPassword, assignManager, assignCOS) now create a fresh AbortController and pass its signal to refresh()

### SF-041: useWebSocket.ts - connect/disconnect missing from useEffect deps
- Added `connect` and `disconnect` to the dependency array
- Removed eslint-disable comment (no longer needed)

### SF-042: MeetingRoom.tsx - AGENT_JOINED duplicates
- Added `includes()` guard in reducer: `if (state.joinedAgentIds.includes(action.agentId)) return state`

### SF-043: TerminalView.tsx - localStorage writes lack try/catch
- Already fixed in prior pass: all localStorage.setItem calls are wrapped in try/catch

### SF-044: useTeam.ts - validKeys mismatch
- Removed 'type', 'chiefOfStaffId', 'managerId' from validKeys (not in updateTeam function signature)

### SF-045: RoleAssignmentDialog.tsx - COS assignment sequential
- Replaced sequential for-loop with Promise.allSettled for parallel execution
- Added partial failure reporting (same pattern as COS removal above)

### SF-059: AgentSkillEditor.tsx - canApprove hardcoded true
- Updated comment to SF-059 tag with Phase 1/Phase 2 explanation

## NIT

### NT-021: TerminalView.tsx - session.id stability comment
- Added detailed comment explaining why empty deps is safe (tab architecture keys by session.id)

### NT-022: RoleBadge.tsx - never assertion
- Added `const _exhaustive: never = role` in default case for compile-time exhaustiveness check

### NT-023: app/teams/page.tsx - debounce deferred comment
- Added comment noting synchronous validation is fine for current checks, debounce deferred to Phase 2

## Files Modified
- components/team-meeting/MeetingRoom.tsx (MF-012, MF-013, SF-042)
- hooks/useGovernance.ts (SF-040)
- hooks/useWebSocket.ts (SF-041)
- hooks/useTeam.ts (SF-044)
- components/governance/RoleAssignmentDialog.tsx (SF-045)
- components/marketplace/AgentSkillEditor.tsx (SF-059)
- components/TerminalView.tsx (NT-021)
- components/governance/RoleBadge.tsx (NT-022)
- app/teams/page.tsx (NT-023)
