# Build Check v9 - 2026-03-22

## Result: FAILED

## Error

```
./components/plugin-builder/SkillPicker.tsx:213:41
Type error: Argument of type '{ type: "marketplace"; id: string; marketplace: string; plugin: string; }' is not assignable to parameter of type 'PluginSkillSelection'.
  Property 'name' is missing in type '{ type: "marketplace"; id: string; marketplace: string; plugin: string; }' but required in type '{ type: "marketplace"; id: string; marketplace: string; plugin: string; name: string; description?: string | undefined; }'.

  211 |               filteredMarketplaceSkills.map(skill => {
  212 |                 // Use getSkillKey so the React list key matches the identifier used in selectedKeys
> 213 |                 const key = getSkillKey({ type: 'marketplace', id: skill.id, marketplace: skill.marketplace, plugin: skill.plugin })
      |                                         ^
  214 |                 const isSelected = selectedKeys.has(key)
  215 |                 // Single toggle handler reused by both onClick and onKeyDown
  216 |                 const handleMarketplaceToggle = () => {
```

## Analysis

The `getSkillKey` function at line 213 of `SkillPicker.tsx` is called with an object missing the required `name` property. The `PluginSkillSelection` type requires `name: string` (and optionally `description?: string`), but the call only passes `type`, `id`, `marketplace`, and `plugin`.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (use `<Image />` instead of `<img>`)
- Critical dependency warnings for `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- `baseline-browser-mapping` data is over two months old
