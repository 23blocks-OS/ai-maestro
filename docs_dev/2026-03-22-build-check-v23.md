# Build Check v23 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:431:48
Type error: Property 'marketplaceSkillId' does not exist on type '{ type: "marketplace"; id: string; marketplace: string; plugin: string; name: string; description?: string | undefined; }'.

 429 |   const marketplaceGroups = new Map<string, { marketplace: string; marketplaceSkillId: string; skills: Extract<PluginSkillSelection, { type: 'marketplace' }>[] }>()
 430 |   for (const skill of marketplaceSkills) {
 431 |     const key = `${skill.marketplace}\0${skill.marketplaceSkillId}` // NUL separator avoids colon conflicts
     |                                                ^
 432 |     const group = marketplaceGroups.get(key) || { marketplace: skill.marketplace, marketplaceSkillId: skill.marketplaceSkillId, skills: [] }
 433 |     group.skills.push(skill)
 434 |     marketplaceGroups.set(key, group)
```

## Summary

The build fails due to a TypeScript type error in `services/plugin-builder-service.ts` at line 431. The code references `skill.marketplaceSkillId` but the `PluginSkillSelection` type (for `type: 'marketplace'`) does not include a `marketplaceSkillId` property. The type only has: `type`, `id`, `marketplace`, `plugin`, `name`, and optional `description`.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across various components
- Multiple `@next/next/no-img-element` warnings (suggesting `<Image />` usage)
- One `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
