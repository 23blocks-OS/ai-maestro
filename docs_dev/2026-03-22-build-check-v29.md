# Build Check v29 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:855:22
Type error: Cannot find name 'stdout'.

 853 |
 854 |     // Combine stdout and stderr so no build output is lost
 855 |     const logs = [...stdout.split('\n'), ...stderr.split('\n')].filter(Boolean)
      |                      ^
 856 |
 857 |     // Parse output for stats
 858 |     const outputPath = path.join(buildDir, manifest.output)
```

## Summary

`yarn build` exits with code 1. The TypeScript compiler cannot resolve the name `stdout` at line 855 of `services/plugin-builder-service.ts`. The variable `stdout` is referenced but not declared or destructured in scope. `stderr` on the same line likely has the same issue but the compiler stops at the first error.

## Warnings (non-blocking)

- Critical dependency warnings for `voice-subsystem.ts`, `claude-provider.ts`, and `@huggingface/transformers`
- ~50 React hook dependency warnings across multiple components
- ~20 `<img>` vs `<Image />` warnings
- 1 `aria-expanded` role warning in `MessageCenter.tsx`

None of the warnings are blocking; only the `stdout` type error causes the build failure.
