# Build Check v31 - 2026-03-22

## Result: FAILED

## Error

TypeScript compilation error in `services/teams-service.ts` at line 265:

```
./services/teams-service.ts:265:39
Type error: Argument of type '{ githubProject?: { owner: string; repo: string; number: number; } | null | undefined; name?: string; description?: string; agentIds?: string[]; lastMeetingAt?: string; instructions?: string; lastActivityAt?: string; }' is not assignable to parameter of type 'Partial<Pick<Team, "name" | "type" | "description" | "chiefOfStaffId" | "agentIds" | "lastMeetingAt" | "instructions" | "lastActivityAt" | "githubProject" | "kanbanConfig">>'.
  Types of property 'githubProject' are incompatible.
    Type '{ owner: string; repo: string; number: number; } | null | undefined' is not assignable to type 'GitHubProjectLink | undefined'.
      Type 'null' is not assignable to type 'GitHubProjectLink | undefined'.
```

### Source Location

```typescript
// services/teams-service.ts lines 263-268
const managerId = getManagerId()
const agentNames = loadAgents().map(a => a.name).filter(Boolean)
const team = await updateTeam(id, finalFields, managerId, agentNames)  // <-- line 265, error on finalFields
if (!team) {
  return { error: 'Team not found', status: 404 }
}
```

### Root Cause

The `githubProject` field in `finalFields` allows `null` values, but the `updateTeam` function's type signature expects `GitHubProjectLink | undefined` (not `null`). The `null` type is not assignable to `undefined`.

### Fix Needed

Either:
1. Convert `null` to `undefined` before passing to `updateTeam`, e.g., `githubProject: finalFields.githubProject ?? undefined`
2. Update the `Team` type to allow `null` for `githubProject`
3. Filter out `null` values from `finalFields` before passing

### Additional Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (using `<img>` instead of `<Image />`)
- These are warnings only and do not block the build
