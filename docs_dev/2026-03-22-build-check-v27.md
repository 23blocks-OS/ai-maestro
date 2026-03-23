# Build Check v27 - 2026-03-22

## Result: FAILED

## Error

```
./services/plugin-builder-service.ts:703:73
Type error: Cannot find name 'fullMessage'.

  701 |
  702 |     if (exitCode === 128 || message.includes('not found')) {
> 703 |       return { error: `Repository not found or access denied: ${url}. ${fullMessage}`, status: 404 }
      |                                                                         ^
  704 |     }
  705 |     console.error('Error scanning repo:', error)
  706 |     return { error: `Failed to scan repository: ${fullMessage}`, status: 500 }
```

Variable `fullMessage` is referenced on lines 703 and 706 but is not defined in scope. The variable `message` exists but `fullMessage` does not.

## Warnings (non-blocking)

- Multiple React Hook dependency warnings across ~20 components
- Multiple `<img>` vs `<Image />` warnings across ~12 components
- 1 aria-expanded role warning in MessageCenter.tsx
