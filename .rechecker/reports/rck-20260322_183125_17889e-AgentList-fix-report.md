# AgentList.tsx Bug Fix Report

**Date**: 2026-03-22
**File fixed**: `/Users/emanuelesabetta/ai-maestro/components/AgentList.tsx`
**Findings source**: `rck-20260322_183125_17889e-[LP00002-IT00001-FID00002]-review.md`

## Fixes Applied

### 1. MEDIUM — Hiber status filter incorrectly includes sessionless agents (line 285)

**Before:**
```ts
result = result.filter(a => a.session?.status !== 'online')
```
**After:**
```ts
result = result.filter(a => a.session && a.session.status !== 'online')
```
**Root cause:** Optional chaining `a.session?.status !== 'online'` evaluates to `true` when `a.session` is `null`/`undefined`, so agents with no session at all were incorrectly shown in the HIBER tab. The fix requires `a.session` to exist before checking its status, matching the rendering logic (`isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0`).

---

### 2. HIGH — `process.env?.HOME` used in client-side placeholder (line 2057)

**Before:**
```ts
placeholder={typeof process !== 'undefined' ? process.env?.HOME || '/home/user' : '/home/user'}
```
**After:**
```ts
placeholder="/home/user"
```
**Root cause:** The component is marked `'use client'` and runs in the browser. `process.env` is a Node.js global; in the browser it is either `undefined` or an empty object (Next.js replaces only explicitly referenced `NEXT_PUBLIC_*` vars at build time). The guard `typeof process !== 'undefined'` is always true in Next.js client bundles, but `process.env.HOME` will be `undefined`. The static fallback `/home/user` was already correct; the surrounding condition was dead and misleading.

---

### 3. LOW — No-op `hash = hash & hash` in `getRandomAlias` (line 1868)

**Before:**
```ts
hash = hash & hash
```
**After:**
```ts
hash |= 0  // Coerce to 32-bit signed integer to prevent float overflow
```
**Root cause:** `hash & hash` is a bitwise identity — the value is unchanged. The intended operation, copied from standard JS djb2-style hashers, is `hash |= 0` which coerces the accumulator to a 32-bit signed integer after each iteration, preventing JavaScript's 64-bit float from accumulating imprecise large values for long strings.

---

## Fixes NOT Applied (per instructions)

- Reordering of `CreateAgentModal`, `AgentStatusIndicator`, `HostSelector` — these are module-scope function declarations and are hoisted; they work correctly as-is.
- `AgentBadge` prop type changes — out of scope per instructions.
- Dead accordion state removal — refactoring, not a correctness bug.
- DnD incomplete feature — out of scope.
- Tab counts ignoring host/search filter — out of scope (separate useMemo refactor).
