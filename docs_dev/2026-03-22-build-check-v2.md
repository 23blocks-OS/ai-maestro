# Build Check v2 - 2026-03-22

**Command:** `yarn build`
**Result:** FAILED (exit code 1)
**Branch:** feature/team-governance

## Errors

### Error 1: Duplicate `getSkillKey` definition in SkillPicker.tsx

**File:** `components/plugin-builder/SkillPicker.tsx`

The name `getSkillKey` is defined multiple times:
1. **Line 8:** Imported from `@/types/plugin-builder`
2. **Line 22:** Locally exported function definition
3. **Line 324:** Another local function definition (duplicate of line 22)

The function is defined twice in the file (lines 22-31 and lines 324-331) AND imported from `@/types/plugin-builder` (line 8), creating a triple conflict.

Additionally, the marketplace `onClick` handler (lines 253-267) has duplicate `name` properties in the object literal:
```
name: skill.name,  (line 260)
name: skill.name,  (line 261 - duplicate)
name: skill.name,  (line 264 - triplicate)
```

### Error 2: Syntax error in plugin-builder-service.ts

**File:** `services/plugin-builder-service.ts`

**Line 360:** `Expected a semicolon` at the `finally` block.

The `try/catch/finally` structure around lines 357-363 has a syntax issue. The `finally` keyword is unexpected, suggesting a malformed try/catch block (possibly a missing `try` or mismatched braces).

```
357 |   fs.rm(buildDir, { recursive: true, force: true }).catch(...)
358 |       }
359 |     }
360 |   } finally {    <-- ERROR: Expected a semicolon
361 |     isEvicting = false
362 |   }
363 | }
```

## Import Trace

Both errors are imported by:
- `SkillPicker.tsx` <- `app/plugin-builder/page.tsx`
- `plugin-builder-service.ts` <- `app/api/plugin-builder/build/route.ts`

## Full Build Output

```
yarn run v1.22.22
$ NEXT_PRIVATE_SKIP_LOCKFILE_CHECK=1 next build
  Next.js 14.2.35
   Creating an optimized production build ...
Failed to compile.

> Build failed because of webpack errors
error Command failed with exit code 1.
```
