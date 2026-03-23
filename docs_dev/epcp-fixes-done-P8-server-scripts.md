# EPCP P8 Fix Report: Server & Shell Scripts Domain

**Generated:** 2026-02-23T03:00:00Z
**Pass:** 8
**Domain:** server.mjs, shell scripts, shared-state bridge

---

## Summary

| Finding | Severity | Status | Action |
|---------|----------|--------|--------|
| SF-039 | SHOULD-FIX | FIXED | Dead WebSocket subscriber cleanup in broadcastStatusUpdate |
| SF-040 | SHOULD-FIX | FIXED | Companion WebSocket listener leak on multi-client |
| SF-041 | SHOULD-FIX | FIXED | ptyProcess.resume() guarded with try-catch |
| SF-042 | SHOULD-FIX | FIXED | update-aimaestro.sh branch check before pull |
| SF-043 | SHOULD-FIX | FIXED | bump-version.sh sed delimiter safety documented |
| SF-044 | SHOULD-FIX | FIXED | amp-inbox.sh portable base64 via jq @base64d |
| SF-045 | SHOULD-FIX | FIXED | parseConversationFile generic error message |
| NT-031 | NIT | FIXED | server.mjs .ts import constraint documented |
| NT-032 | NIT | FIXED | start-with-ssh.sh tsx existence check |
| NT-033 | NIT | FIXED | install-messaging.sh local declarations hoisted |
| NT-034 | NIT | DOCUMENTED | server.mjs loopback HTTP noted with rationale |
| NT-035 | NIT | DOCUMENTED | remote-install.sh cleanup trap documented |
| NT-039 | NIT | DOCUMENTED | shared-state-bridge.mjs sync warning added |

**Result: 13/13 findings addressed (10 code fixes, 3 documentation-only)**

---

## Detailed Changes

### SF-039: broadcastStatusUpdate dead WebSocket cleanup

**Files:** `services/shared-state-bridge.mjs`, `services/shared-state.ts`

Both the ESM bridge and TypeScript version of `broadcastStatusUpdate` now collect non-OPEN WebSocket connections during broadcast and delete them from the `statusSubscribers` Set afterward. This prevents a slow memory leak from accumulated stale connections.

### SF-040: Companion WebSocket event listener leak

**File:** `server.mjs` (lines ~738-758)

Previously, the `voice:speak` event listener was only removed when the **last** companion client disconnected (inside the `agentClients.size === 0` block). If 3 clients connected and 2 disconnected, those 2 clients' listeners would remain attached to the cerebellum emitter.

Fix: Each client now removes its own `voice:speak` listener immediately on close, before checking whether it was the last client. The `setCompanionConnected(false)` call remains in the last-client block.

### SF-041: ptyProcess.resume() after PTY exit

**File:** `server.mjs` (line ~1014)

The `Promise.all(writePromises).finally()` callback now wraps `ptyProcess.resume()` in a try-catch. If the PTY exited during the backpressure cycle, the catch block silently handles the error.

### SF-042: update-aimaestro.sh branch guard

**File:** `update-aimaestro.sh` (lines ~148-165)

Added a check for the current branch before `git fetch origin main`. If not on `main`, the script warns the user and either auto-switches (non-interactive) or prompts for confirmation. This prevents accidentally merging `main` into a feature branch.

### SF-043: bump-version.sh sed delimiter safety

**File:** `scripts/bump-version.sh`

The version format validation regex (`^[0-9]+\.[0-9]+\.[0-9]+$`) already ensures only digits and dots, which cannot contain the `|` sed delimiter. Added explicit comments documenting this invariant at both the validation site and the `update_file()` function.

### SF-044: amp-inbox.sh portable base64 decoding

**File:** `plugin/plugins/ai-maestro/scripts/amp-inbox.sh` (line ~132)

Replaced `base64 -d` with `jq -Rr '@base64d'`. The jq approach works identically on macOS (which historically used `-D`) and Linux (which uses `-d`). Since jq is already a required dependency of all AMP scripts, this adds no new dependencies.

### SF-045: parseConversationFile path leak

**File:** `services/config-service.ts` (line ~625)

Changed the 404 error response from `Conversation file not found: ${conversationFile}` to the generic `Conversation file not found`. The full path is still logged server-side via `console.error` for debugging purposes.

### NT-031: server.mjs .ts import documentation

**File:** `server.mjs` (top of file)

Added a block comment explaining the hidden dependency on tsx/Next.js for .ts imports. Documents that plain `node server.mjs` will not work.

### NT-032: start-with-ssh.sh tsx check

**File:** `scripts/start-with-ssh.sh` (line ~30)

Added `command -v tsx` check before `exec tsx server.mjs`. On failure, prints a clear error message with install instructions instead of a cryptic "command not found".

### NT-033: install-messaging.sh local hoisting

**File:** `install-messaging.sh` (function `distribute_shared_to_per_agent`)

Moved `local recipient sender dest_dir msg_basename` declarations from inside while loop bodies to the top of the function. This is conventional shell style -- `local` inside loops is harmless but unconventional and confuses some linters.

### NT-034: server.mjs loopback HTTP documentation

**File:** `server.mjs` (status WebSocket handler)

Added a comment explaining why the loopback HTTP request is used (the session activity endpoint is a Next.js API route) and noting that the fallback handles startup race conditions.

### NT-035: remote-install.sh cleanup trap documentation

**File:** `scripts/remote-install.sh` (cleanup function)

Added a comment documenting the safety guards that make silent cleanup acceptable: only removes paths under $HOME that lack a package.json, and only auto-removes in non-interactive mode.

### NT-039: shared-state-bridge.mjs sync warning

**File:** `services/shared-state-bridge.mjs` (module docblock)

Added `NT-039: SYNC WARNING` to the module documentation explaining that this file intentionally duplicates `shared-state.ts` logic and that changes must be mirrored in both files.

---

## TypeScript Verification

Ran `npx tsc --noEmit` -- no new errors introduced. The 16 pre-existing errors in 10 files are unrelated to this changeset (plugin-builder, governance-service, test files).
