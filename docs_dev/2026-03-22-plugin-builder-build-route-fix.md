# Fix Report: app/api/plugin-builder/build/route.ts
Date: 2026-03-22

## Reported Finding (rck-20260322_171538_606726)

BUG: Missing 'description' field for 'core' skill type in `validateSkillSelection`.

### Analysis

The finding was a false positive. The `PluginSkillSelection` type in `types/plugin-builder.ts` defines the `core` union member as `{ type: 'core'; name: string }` with no `description` field. Only the `marketplace` member declares `description?: string`. Adding `description` to the `core` branch would violate the TypeScript type contract and cause a compile error. The existing code returning `{ type: 'core', name: s.name }` is correct and matches the type definition exactly.

## Real Bug Fixed: `author` and `homepage` silently dropped in `validateBuildConfig`

`PluginBuildConfig` declares two optional fields: `author?: { name: string }` and `homepage?: string`. The original `validateBuildConfig` function:
1. Never validated their types when provided (any malformed value was silently accepted).
2. Never included them in the returned `config` object (valid values sent by the client were silently discarded, meaning the service never received them).

### Fix Applied

Added validation and forwarding for both fields in `validateBuildConfig` (lines 106-125 of the updated file):

- `author`: validated as a non-null object with a `string` name property when provided; forwarded via spread.
- `homepage`: validated as a string when provided; forwarded via spread.

This matches the existing validation pattern used for `description` and `includeHooks`.

## File Modified

`/Users/emanuelesabetta/ai-maestro/app/api/plugin-builder/build/route.ts`
