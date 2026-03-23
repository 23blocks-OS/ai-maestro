# Build Check v13 — 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:452:19
Type error: Cannot find name 'resolved'.

 450 |     sendJson(res, result.status || 500, { error: result.error }, result.headers)
 451 |   } else {
> 452 |     sendJson(res, resolved.status || 200, resolved.data, resolved.headers)
     |                   ^
 453 |   }
 454 | }
 455 |
```

Line 452 references `resolved` but the variable is not defined in scope. It should likely be `result` instead of `resolved`.

## Warnings (non-blocking)

- Critical dependency warnings: `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- ~50 React Hook dependency warnings across multiple components
- ~20 `<img>` vs `<Image />` warnings
- 1 `aria-expanded` warning in `MessageCenter.tsx`
- `baseline-browser-mapping` outdated data warning

## Next.js version

Next.js 14.2.35
