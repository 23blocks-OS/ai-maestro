# Build Check v11 - 2026-03-22

## Result: FAILED

## Error

**File:** `services/agents-core-service.ts:516:9`

**Type error:** `Type 'string | undefined' is not assignable to type 'string'. Type 'undefined' is not assignable to type 'string'.`

```
 514 |         // Use the actual lastActive from the online session rather than the current timestamp
 515 |         // so the field reflects true last activity, not the polling time
> 516 |         lastActive: onlineSession ? onlineSession.lastActive : agent.lastActive,
      |         ^
 517 |       }
```

The `lastActive` field is typed as `string` but `onlineSession.lastActive` or `agent.lastActive` can be `undefined`.

## Warnings (non-blocking)

- Critical dependency warnings in `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Multiple `react-hooks/exhaustive-deps` warnings
- Multiple `@next/next/no-img-element` warnings (use `<Image />` from next/image)
- `baseline-browser-mapping` data over two months old

## Full Build Output

```
yarn run v1.22.22
$ NEXT_PRIVATE_SKIP_LOCKFILE_CHECK=1 next build
  ▲ Next.js 14.2.35

   Creating an optimized production build ...
 ⚠ Compiled with warnings

   Linting and checking validity of types ...

Failed to compile.

./services/agents-core-service.ts:516:9
Type error: Type 'string | undefined' is not assignable to type 'string'.
  Type 'undefined' is not assignable to type 'string'.

 514 |         // Use the actual lastActive from the online session rather than the current timestamp
 515 |         // so the field reflects true last activity, not the polling time
> 516 |         lastActive: onlineSession ? onlineSession.lastActive : agent.lastActive,
      |         ^
 517 |       }

Next.js build worker exited with code: 1 and signal: null
error Command failed with exit code 1.
```
