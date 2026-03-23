# Build Check v22 — 2026-03-22

## Result: FAILED

## Error

```
./services/marketplace-service.ts:19:15
Type error: Duplicate identifier 'ServiceResult'.

  17 | } from '@/lib/marketplace-skills'
  18 | import type { SkillSearchParams } from '@/types/marketplace'
> 19 | import type { ServiceResult } from '@/types/service-result'
     |               ^
  20 |
  21 | // ---------------------------------------------------------------------------
  22 | // Types
```

**Root cause:** `ServiceResult` is imported from `@/types/service-result` at line 19, but a local type with the same name `ServiceResult` is also defined within `services/marketplace-service.ts` (likely in the `// Types` section starting at line 22). This causes a TypeScript duplicate identifier error.

## Warnings (non-blocking)

- Critical dependency warnings for `voice-subsystem.ts`, `claude-provider.ts`, `@huggingface/transformers`
- Many `react-hooks/exhaustive-deps` warnings across components
- Many `@next/next/no-img-element` warnings (using `<img>` instead of `<Image />`)
- `baseline-browser-mapping` data over two months old

## Build Command

```bash
yarn build
```

Exit code: 1
