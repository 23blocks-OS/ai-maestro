# Build & Test Results

**Timestamp:** 2026-02-20 23:31 UTC
**Branch:** feature/team-governance

## Build Result: FAILED

```
./components/governance/RoleAssignmentDialog.tsx:32:5
Type error: Type '"normal"' is not assignable to type 'AgentRole'.
```

**Root cause:** `AgentRole` in `types/agent.ts` is `'manager' | 'chief-of-staff' | 'member'`, but `RoleAssignmentDialog.tsx` line 32 uses `'normal'` which is not a valid member of that union type.

**Fix:** Replace `'normal'` with `'member'` at line 32 of `components/governance/RoleAssignmentDialog.tsx` (and update the label/description if desired).

## Test Result: SKIPPED

Tests were not run because the build failed.
