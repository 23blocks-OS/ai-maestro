# Build Check v7 - 2026-03-22

## Result: FAILED

## Error

```
./components/plugin-builder/RepoScanner.tsx:6:10
Type error: Module '"./SkillPicker"' has no exported member 'getSkillKey'. Did you mean to use 'import getSkillKey from "./SkillPicker"' instead?

   4 | import { GitBranch, Search, Loader2, AlertCircle, Plus } from 'lucide-react'
   5 | import type { RepoScanResult, RepoSkillInfo, PluginSkillSelection } from '@/types/plugin-builder'
 > 6 | import { getSkillKey } from './SkillPicker'
     |          ^
   7 |
   8 | interface RepoScannerProps {
   9 |   // NT-020: Made optional -- SkillPicker doesn't use the callback (passes no-op)
```

## Summary

The build fails due to a named export mismatch in `components/plugin-builder/RepoScanner.tsx`. The file imports `getSkillKey` as a named export from `./SkillPicker`, but `SkillPicker` exports it as a default export (or does not export it as a named member). The fix is to change the import to a default import or add a named export in `SkillPicker.tsx`.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across various components
- Multiple `@next/next/no-img-element` warnings (should use `next/image`)
- `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
