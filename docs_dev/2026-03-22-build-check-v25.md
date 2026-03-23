# Build Check v25 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:453:13
Type error: Cannot find name 'relativeStagingPath'.

  451 |       description: `Skills from ${group.plugin} plugin (${group.marketplace} marketplace)`,
  452 |       type: 'local',
> 453 |       path: relativeStagingPath,
      |             ^
  454 |       map,
  455 |     })
  456 |   }
```

## Warnings (non-blocking)

- Critical dependency warnings in `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- React Hook dependency warnings in multiple components (companion, immersive, plugin-builder, etc.)
- `<img>` vs `<Image />` warnings in multiple components
- `aria-expanded` not supported by role `textbox` in `MessageCenter.tsx`

## Exit Code: 1
