# EPCP P10 Fix Report: Components & Hooks

**Generated:** 2026-02-27
**Review:** P10 Run c7f26c53
**Assigned files:** RoleBadge.tsx, TeamMembershipSection.tsx, Header.tsx, AgentSkillEditor.tsx, MessageCenter.tsx, BuildAction.tsx, PluginComposer.tsx, MeetingRoom.tsx, TerminalView.tsx, useGovernance.ts

---

## Fixes Applied

### MUST-FIX (2/2 fixed)

| ID | File | Fix |
|----|------|-----|
| MF-013 | components/team-meeting/MeetingRoom.tsx | Moved `creatingMeetingRef.current = false` from catch-only to a `finally` block so it resets on both success and failure paths |
| MF-014 | hooks/useGovernance.ts | Applied `mutationAbortRef` pattern consistently to all 6 mutation methods: `addAgentToTeam`, `removeAgentFromTeam`, `submitConfigRequest`, `resolveConfigRequest`, `requestTransfer`, `resolveTransfer`. Each now aborts previous controller and creates a new AbortController before calling `refresh()` |

### SHOULD-FIX (4/4 fixed)

| ID | File | Fix |
|----|------|-----|
| SF-044 | components/MessageCenter.tsx | Added bounds check `selectedSuggestionIndex < filteredAgents.length` before accessing `filteredAgents[selectedSuggestionIndex]` in Enter key handler |
| SF-045 | components/team-meeting/MeetingRoom.tsx | Added documentation comment explaining the race between the two effects and how `creatingTeamRef` guard (MF-012) prevents duplicate team creation |
| SF-046 | components/marketplace/AgentSkillEditor.tsx | Updated comment to include TODO with Phase 2 tracking reference for replacing hardcoded `canApprove = true` |
| SF-047 | components/TerminalView.tsx | Added SF-047 comments documenting why `storageId` is intentionally omitted from deps (stable per component instance in tab architecture) |

### NIT (2/2 actionable fixed, 3 no-action-needed acknowledged)

| ID | File | Fix |
|----|------|-----|
| NT-028 | components/Header.tsx | No action needed (trivial computation, per review) |
| NT-029 | components/governance/RoleBadge.tsx | No action needed (correctly defensive, per review) |
| NT-030 | components/plugin-builder/PluginComposer.tsx | Added `default` case with `never` exhaustiveness check to both `getSkillDisplayName` and `getSkillSubtitle` |
| NT-031 | components/plugin-builder/BuildAction.tsx | No action needed (trivial, per review) |
| NT-032 | components/governance/TeamMembershipSection.tsx | Added success feedback `setInfoMessage('Successfully left team')` in handleLeave success path |

---

## Not in scope (assigned to other agents)

- SF-048, SF-049: Test files (tests/use-governance-hook.test.ts) -- not in assigned file list
- NT-033: Multiple test files -- not in assigned file list

## Summary

**8/8 actionable findings fixed** across 6 files. 3 NITs correctly required no action per review guidance.
