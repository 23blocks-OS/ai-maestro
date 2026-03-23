# Build Check v17 — 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:1000:36
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.

   998 |   { method: 'PUT', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (req, res, params) => {
   999 |     const body = await readJsonBody(req)
> 1000 |     const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
       |                                    ^
  1001 |     sendServiceResult(res, await saveSkillSettings(params.id, body, auth.error ? null : auth.agentId))
  1002 |   }},
```

**Root cause:** `getHeader(req, 'Authorization')` returns `string | undefined`, but `authenticateAgent()` expects `string | null` as its first parameter. The same issue applies to the second `getHeader()` call.

**Fix:** Either:
1. Change `getHeader()` return type to `string | null`
2. Or coalesce: `getHeader(req, 'Authorization') ?? null`
3. Or update `authenticateAgent()` signature to accept `string | undefined`

## Warnings (non-blocking)

- Critical dependency warnings for `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Multiple `react-hooks/exhaustive-deps` warnings across components
- Multiple `@next/next/no-img-element` warnings (use `<Image />` instead of `<img>`)
- `baseline-browser-mapping` data is over two months old
- `url.parse()` deprecation warning
