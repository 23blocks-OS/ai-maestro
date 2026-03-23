# EPCP Fixes Done - Pass 6: UI Hooks & Components

**Generated:** 2026-02-22T22:08:00Z
**Domain:** ui-hooks-components
**Review Report:** docs_dev/pr-review-P6-2026-02-22-215300.md

## Summary

13 out of 13 applicable findings fixed (NT-012 skipped per instructions as major refactor).

## Fixes Applied

### MUST-FIX

| ID | File | Fix |
|----|------|-----|
| MF-008 | `hooks/useWebSocket.ts:179-191` | Added `reconnectAttemptsRef.current = 0` in `disconnect()` to reset reconnect counter |
| MF-009 | `components/zoom/AgentProfileTab.tsx:179` | Changed `updateField` value parameter from `any` to `string \| string[] \| undefined` |

### SHOULD-FIX

| ID | File | Fix |
|----|------|-----|
| SF-016 | `hooks/useGovernance.ts:210-283` | Added `isMutatingRef` guard to `addAgentToTeam` and `removeAgentFromTeam` with early return + finally block |
| SF-017 | `components/MessageCenter.tsx:171` | Added `if (loading) return` guard at start of `sendMessage` |
| SF-018 | `components/TerminalView.tsx:52-61` | Wrapped `localStorage.getItem` in try/catch with fallback for private browsing |
| SF-019 | `components/AgentProfile.tsx:792` | Changed `key={idx}` to `key={repo.remoteUrl \|\| repo.localPath \|\| idx}` |
| SF-020 | `components/marketplace/AgentSkillEditor.tsx:73` | Removed dead `selectedSkill` state, `setSelectedSkill`, `SkillDetailModal` import and render |
| SF-021 | `components/governance/RoleAssignmentDialog.tsx:109-123` | Added AbortController to sessions fetch useEffect with cleanup |
| SF-022 | `components/plugin-builder/BuildAction.tsx:78-107` | Added `pollAbortRef` AbortController for polling fetch, abort on clearPoll and unmount |
| SF-023 | `hooks/useGovernance.ts:68-136` | Added `isMountedRef` tracking, checked in refresh state setters, cleanup on unmount/agentId change |

### NIT

| ID | File | Fix |
|----|------|-----|
| NT-010 | `hooks/useWebSocket.ts` + `components/TerminalView.tsx` | Added comments documenting which message types each layer handles |
| NT-011 | `components/governance/GovernancePasswordDialog.tsx:82-83` | Changed `res.text()` to `res.json().catch(() => null)` and extract `.error` field |
| NT-012 | -- | SKIPPED (major refactor, per instructions) |
| NT-013 | `components/TerminalView.tsx:476-479` | Removed empty if block in `handleTouchEnd`, kept just `isTouchingTerminal = false` |

## Type Check

All modified files pass `tsc --noEmit` with zero errors. Pre-existing test-only type errors remain unchanged.

## Files Modified

1. `hooks/useWebSocket.ts` - MF-008, NT-010
2. `components/zoom/AgentProfileTab.tsx` - MF-009
3. `hooks/useGovernance.ts` - SF-016, SF-023
4. `components/MessageCenter.tsx` - SF-017
5. `components/TerminalView.tsx` - SF-018, NT-010, NT-013
6. `components/AgentProfile.tsx` - SF-019
7. `components/marketplace/AgentSkillEditor.tsx` - SF-020
8. `components/governance/RoleAssignmentDialog.tsx` - SF-021
9. `components/plugin-builder/BuildAction.tsx` - SF-022
10. `components/governance/GovernancePasswordDialog.tsx` - NT-011
