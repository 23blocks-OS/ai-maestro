# Build Check v16 - 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:755:7
Type error: Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'.
  Type 'undefined' is not assignable to type 'string | null'.

  753 |     // Layer 5: optional governance enforcement when agent identity is provided
  754 |     const auth = authenticateAgent(
> 755 |       getHeader(req, 'Authorization'),
      |       ^
  756 |       getHeader(req, 'X-Agent-Id')
  757 |     )
  758 |     // If auth credentials were provided but invalid, reject immediately — consistent with other governed routes.
```

## Summary

`yarn build` fails with a TypeScript type error in `services/headless-router.ts` at line 755. The `getHeader()` function returns `string | undefined`, but `authenticateAgent()` expects `string | null`. The fix is to coerce undefined to null (e.g., `getHeader(req, 'Authorization') ?? null`).

## Warnings (non-blocking)

- 3 critical dependency warnings (cerebellum voice-subsystem, claude-provider, huggingface transformers)
- ~40 React Hook dependency warnings across various components
- ~20 `<img>` vs `<Image />` warnings
- 1 aria-expanded role warning in MessageCenter.tsx
