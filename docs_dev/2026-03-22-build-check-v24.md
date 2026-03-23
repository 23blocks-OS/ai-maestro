# Build Check v24 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:450:22
Type error: Property 'marketplaceSkillId' does not exist on type '{ marketplace: string; plugin: string; skills: { type: "marketplace"; id: string; marketplace: string; plugin: string; name: string; description?: string | undefined; }[]; }'.

 448 |     }
 449 |     sources.push({
>450 |       name: `${group.marketplaceSkillId}-from-${group.marketplace}`,
     |                      ^
 451 |       description: `Skills from ${group.marketplaceSkillId} plugin (${group.marketplace} marketplace)`,
 452 |       type: 'local',
 453 |       path: relativeStagingPath,
```

## Analysis

The build fails with a single TypeScript type error in `services/plugin-builder-service.ts` at line 450. The `group` object (typed as `{ marketplace: string; plugin: string; skills: [...] }`) does not have a `marketplaceSkillId` property. Lines 450-451 reference `group.marketplaceSkillId` but should likely use `group.plugin` instead.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across ~15 components
- Multiple `@next/next/no-img-element` warnings (~14 components using `<img>` instead of `<Image />`)
- 1 `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
- 1 unnecessary dependency warning in SkillPicker.tsx
