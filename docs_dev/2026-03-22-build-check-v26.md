# Build Check v26 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:697:32
Type error: Cannot find name 'ExecError'.

 695 |     })
 696 |
 697 |     const execError = error as ExecError
     |                                ^
 698 |     const exitCode = execError.code
 699 |     let message = execError.message || String(error)
 700 |     if (execError.stderr) message += `\nStderr: ${execError.stderr}`
```

## Summary

The build fails due to a TypeScript type error in `services/plugin-builder-service.ts` at line 697. The type `ExecError` is referenced but not defined or imported. This is the only compilation error; the rest of the output consists of ESLint warnings (missing React Hook dependencies, `<img>` vs `<Image />` suggestions, etc.) which do not block the build.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across ~15 components
- Multiple `@next/next/no-img-element` warnings across ~10 components
- 1 `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
- 1 `react-hooks/exhaustive-deps` unnecessary dependency warning in SkillPicker.tsx
