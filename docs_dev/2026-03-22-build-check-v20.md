# Build Check v20 - 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:1291:63
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.

  1289 |     const body = await readJsonBody(req)
  1290 |     const authHeader = getHeader(req, 'Authorization')
> 1291 |     await sendServiceResult(res, await registerAMPAgent(body, authHeader))
       |                                                               ^
  1292 |   }},
  1293 |   { method: 'POST', pattern: /^\/api\/v1\/route$/, paramNames: [], handler: async (req, res) => {
  1294 |     const body = await readJsonBody(req)
```

The `getHeader()` function returns `string | undefined`, but `registerAMPAgent()` expects `string | null` for the `authHeader` parameter. The fix is to coerce `undefined` to `null`: `authHeader ?? null`.

## Warnings (non-blocking)

- Critical dependency warnings for `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (using `<img>` instead of `<Image />`)
- `baseline-browser-mapping` data over two months old

## Command

```bash
yarn build
```

## Exit Code: 1
