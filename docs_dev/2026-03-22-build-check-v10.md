# Build Check v10 - 2026-03-22

## Result: FAILED

### Fatal Error

```
./services/agents-core-service.ts:496:13
Type error: Type '{ status: "online"; tmuxSessionName: string; workingDirectory: string | undefined; lastActivity: string | undefined; windows: number | undefined; hostId: string; hostName: string; } | { ...; }' is not assignable to type 'LiveAgentSessionStatus'.
  Object literal may only specify known properties, and 'hostId' does not exist in type 'LiveAgentSessionStatus'.

 494 |             lastActivity: onlineSession.lastActive,
 495 |             windows: onlineDiscoveredSession?.windows,
>496 |             hostId,
     |             ^
 497 |             hostName,
 498 |           }
 499 |         : {
```

### Root Cause

`services/agents-core-service.ts` at line 496 adds `hostId` and `hostName` properties to an object literal typed as `LiveAgentSessionStatus`, but that type does not include those fields. The type needs to be extended to include `hostId: string` and `hostName: string`, or the properties need to be moved outside the `LiveAgentSessionStatus` object.

### Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (using `<img>` instead of `next/image`)
- `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
- Critical dependency warnings for dynamic imports in cerebellum/voice-subsystem.ts and memory/claude-provider.ts
- `baseline-browser-mapping` data over two months old
- `url.parse()` deprecation warning (DEP0169)
