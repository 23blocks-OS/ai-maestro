# Build Check v14 — 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:518:7
Type error: Type 'string' is not assignable to type 'Record<string, unknown>'.

 516 |     } else if (headers.includes('name="options"')) {
 517 |       // options is expected to be a UTF-8 JSON string.
> 518 |       options = content.toString('utf8')
     |       ^
 519 |     }
 520 |
 521 |     pos = contentStart + content.length
```

## Summary

The build fails due to a single TypeScript type error in `services/headless-router.ts` at line 518. The variable `options` is typed as `Record<string, unknown>` but is being assigned a raw `string` from `content.toString('utf8')`. The string needs to be parsed with `JSON.parse()` before assignment.

## Warnings (non-blocking)

The build also produced many non-blocking warnings:
- Multiple `react-hooks/exhaustive-deps` warnings across ~15 components
- Multiple `@next/next/no-img-element` warnings (recommending `next/image`)
- One `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx

These warnings do not cause the build to fail.
