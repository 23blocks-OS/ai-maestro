# Build Check v21 - 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:1409:54
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.

  1407 |   }},
  1408 |   { method: 'PATCH', pattern: /^\/api\/messages$/, paramNames: [], handler: async (_req, res, _params, query) => {
> 1409 |     sendServiceResult(res, await updateGlobalMessage(query.agent || undefined, query.id || undefined, query.action || undefined))
       |                                                      ^
  1410 |   }},
```

The `updateGlobalMessage` function expects `string | null` for its first parameter, but `query.agent || undefined` produces `string | undefined`.

## Fix

Change `|| undefined` to `|| null` (or use `?? null`) on line 1409 of `services/headless-router.ts`.

## Warnings (non-blocking)

- Deprecation: `url.parse()` (use WHATWG URL API)
- Critical dependency warnings in `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (use `<Image />` from next/image)
- `baseline-browser-mapping` data over two months old
