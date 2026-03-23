# Build Check v15 - 2026-03-22

## Result: FAILED

## Error

```
./services/headless-router.ts:713:21
Type error: Cannot redeclare block-scoped variable 'options'.

  711 |       const contentType = getHeader(req, 'content-type') || ''
  712 |       const rawBody = await readRawBody(req)
> 713 |       const { file, options } = parseMultipart(rawBody, contentType)
      |                     ^
  714 |
  715 |       if (!file) {
  716 |         // Use sendServiceResult for consistent error-response formatting across all routes
```

**File:** `services/headless-router.ts`
**Line:** 713
**Issue:** `const { file, options }` redeclares a block-scoped variable `options` that already exists in the same scope.

## Warnings (non-blocking)

- Critical dependency warnings in `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Multiple React hooks exhaustive-deps warnings across components
- Multiple `<img>` vs `<Image />` warnings
- `aria-expanded` not supported by textbox role in `MessageCenter.tsx`

## Exit Code

1 (failure)
