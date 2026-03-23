# P3 Fix Report: hooks/useGovernance.ts & AgentSkillEditor.tsx

**Date:** 2026-02-22
**Pass:** 3
**Files changed:** 2

## Fixes Applied

### MF-001: resolveConfigRequest sends wrong request body (FIXED)
- **File:** `hooks/useGovernance.ts` line 318-319
- **Change:** Updated function signature to `(requestId, approved, password, resolverAgentId, reason?)`. Approve sends `{ approverAgentId, password }`, reject sends `{ rejectorAgentId, password, reason }`.

### MF-002: submitConfigRequest sends incomplete request body (FIXED)
- **File:** `hooks/useGovernance.ts` line 287
- **Change:** Updated function signature to `(targetAgentId, config, password, requestedBy, requestedByRole, targetHostId?)`. Body now includes `targetHostId`, `requestedBy`, `requestedByRole`, `password`.

### SF-003: AgentSkillEditor calls resolveConfigRequest without auth fields (FIXED)
- **File:** `components/marketplace/AgentSkillEditor.tsx` lines 33-38, 50-54, 79, 88-97
- **Change:** Added `governancePassword` optional prop. Added `managerId` to useGovernance destructure. `handleResolve` now validates password presence and passes `(requestId, approved, governancePassword, resolverAgent)`.

### NT-004: Inconsistent error handling — add logging when JSON parse fails (FIXED)
- **File:** `hooks/useGovernance.ts` lines 302-305 and 332-335
- **Change:** Both `.catch(() => ({}))` replaced with `.catch((parseErr) => { console.warn(...); return {} })` in both `submitConfigRequest` and `resolveConfigRequest`.

### NT-011: setSaveSuccess setTimeout cleanup (FIXED)
- **File:** `components/marketplace/AgentSkillEditor.tsx` lines 63-67, 148, 169
- **Change:** Added `saveSuccessTimerRef` with `useRef`, cleanup in `useEffect` return. Both `setTimeout` calls now store ID in ref.

## Summary
- 2 MUST-FIX resolved (MF-001, MF-002)
- 1 SHOULD-FIX resolved (SF-003)
- 2 NIT resolved (NT-004, NT-011)
- **5/5 issues fixed**
