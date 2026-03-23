# Bug Fixes: services/plugin-builder-service.ts
Date: 2026-03-22

## Fix 1 — copyDir: fs.stat wrapped in try/catch (line ~817)

**Root cause:** `await fs.stat(srcPath)` was called bare. A TOCTOU race (file removed between `readdir` and `stat`) or a permission error would throw, aborting the entire `copyDir` call and any build using it.

**Fix:** Wrapped in try/catch. On failure, `mode` falls back to `0o644` (safe default for non-executable files) and a `console.warn` is emitted so the fallback is visible in logs.

## Fix 2 — evictStaleBuildResults: silent .catch(() => {}) replaced (lines ~195, ~210)

**Root cause:** Both `fs.rm` calls in the TTL eviction loop and the MAX_BUILD_RESULTS eviction loop used `.catch(() => {})`, silently swallowing any removal errors. A persistent failure (permissions, disk full) would leave stale build directories accumulating with no indication.

**Fix:** Both `.catch` handlers now call `console.warn(...)` with the directory path and the error, so operators can observe and act on repeated failures.

## Fix 3 — buildPlugin catch block: silent .catch(() => {}) replaced (line ~422)

**Root cause:** Same silent swallow pattern on the `fs.rm` cleanup call in `buildPlugin`'s main catch block (triggered only when `runBuild` was never dispatched).

**Fix:** `.catch` handler now calls `console.warn(...)` with path and error.

## Skipped findings (per instructions)

- Race condition in activeOps: reviewer self-corrected, logic is correct.
- Incomplete PluginBuildResult update: outer .catch is intentional safety net, not a bug.
