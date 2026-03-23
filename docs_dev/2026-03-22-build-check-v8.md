# Build Check v8 - 2026-03-22

## Result: FAILED

## Error

```
./components/plugin-builder/RepoScanner.tsx:245:47
Type error: Cannot find name 'onRemoveSkill'.

 243 |                 </div>
 244 |                 <button
>245 |                   onClick={() => isSelected ? onRemoveSkill(key) : handleAddSkill(skill)}
     |                                               ^
 246 |                   className="ml-2 p-1.5 rounded-md text-cyan-400 hover:bg-cyan-500/10 transition-colors flex-shrink-0"
 247 |                   title={isSelected ? 'Remove skill' : 'Add skill'}
 248 |                 >
Next.js build worker exited with code: 1 and signal: null
```

## Summary

Build fails due to a TypeScript error in `components/plugin-builder/RepoScanner.tsx` at line 245. The identifier `onRemoveSkill` is referenced but not defined or imported in scope. The function `handleAddSkill` exists but `onRemoveSkill` does not.

## Warnings (non-blocking)

- Multiple `react-hooks/exhaustive-deps` warnings across many components
- Multiple `@next/next/no-img-element` warnings (should use next/image)
- One `jsx-a11y/role-supports-aria-props` warning in MessageCenter.tsx
- One unnecessary dependency warning in SkillPicker.tsx
