# Code Correctness Report: server-scripts

**Agent:** epcp-code-correctness-agent
**Domain:** server-scripts
**Files audited:** 10
**Date:** 2026-02-23T02:27:00Z
**Pass:** 8
**Run ID:** 57d244f7
**Finding ID Prefix:** CC-P8-A9

## MUST-FIX

### [CC-P8-A9-001] `portable_sed` passes all args to `sed` including the file, causing double file specification
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:322-325
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function extracts the last argument as the file (for `.bak` removal) but then passes ALL arguments (`"$@"`) to `sed -i.bak`, which means `sed` receives the original arguments unmodified. The function is called like `portable_sed "s|foo|bar|" file.env` -- `sed -i.bak "s|foo|bar|" file.env` works. However, it's also called as `portable_sed "s|AIMAESTRO_API=.*|...|" .env` from `act3_clone_and_build` at line 1060. The issue: `sed -i.bak "$@"` means `sed` gets `-i.bak` as its FIRST flag, then all the original arguments. But `sed -i.bak` is the in-place flag, and then `"$@"` expands to the pattern + file. So `sed` receives `sed -i.bak s|pattern|replacement| file` -- this means sed interprets `-i.bak` as in-place edit with `.bak` suffix AND then it sees the pattern and file. On GNU sed, `-i.bak` is not valid (it expects `-i .bak` or `-i.bak` depending on version). On BSD sed, `sed -i.bak expr file` is also ambiguous.

  Actually, upon careful re-tracing: `sed -i.bak "$@"` expands to `sed -i.bak "s|pattern|" "file"`. On macOS BSD sed, this works as: in-place edit creating `.bak` backup, apply expression to file. On GNU sed, `-i.bak` means in-place with `.bak` suffix. So the command itself is correct. BUT: the `&& rm -f "${file}.bak"` uses the last argument, which works correctly. Let me re-check -- actually this works because `"$@"` doesn't include `-i.bak` (that's hardcoded). So `sed -i.bak "s|pattern|" "file"` is the final expansion. This is actually fine.

  **RETRACTED** -- On closer analysis, this function works correctly. The `-i.bak` flag is added by the function, `"$@"` expands to the caller's original arguments (pattern + file). The last argument extraction for cleanup is also correct.

## SHOULD-FIX

### [CC-P8-A9-002] `broadcastStatusUpdate` does not clean up dead WebSocket subscribers
- **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:43-47
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `broadcastStatusUpdate` function iterates over `statusSubscribers` and sends to clients whose `readyState === 1` (OPEN). However, it never removes dead/closed connections from the Set. While the `statusWss.on('connection')` handler in `server.mjs:616-624` removes clients on 'close' and 'error' events, if a WebSocket becomes unusable without firing those events (e.g., network drop without TCP FIN), the subscriber stays in the Set forever and `ws.send()` is silently skipped each broadcast cycle. Over time, this is a minor memory leak.
- **Evidence:**
  ```javascript
  // shared-state-bridge.mjs:43-47
  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(message)
    }
    // No cleanup of non-OPEN sockets
  })
  ```
- **Fix:** Add cleanup of non-OPEN sockets in the broadcast loop:
  ```javascript
  statusSubscribers.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(message)
    } else if (ws.readyState > 1) { // CLOSING or CLOSED
      statusSubscribers.delete(ws)
    }
  })
  ```

### [CC-P8-A9-003] Companion WebSocket event listener leak when multiple companion clients connect to the same agent
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:659-698
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a companion WebSocket connects, a new `voice:speak` event listener is registered on the cerebellum at line 677. This listener is stored on `ws._companionCleanup` for cleanup. However, the cleanup logic at lines 738-757 only removes the listener when the `agentClients` Set becomes empty (size === 0). If multiple companion clients connect, each registers a new listener, but only the LAST one to disconnect triggers the cleanup block. The earlier clients' listeners are never removed because `agentClients.size > 0` when they disconnect.
- **Evidence:**
  ```javascript
  // line 677 - each client adds a listener
  cerebellum.on('voice:speak', listener)
  ws._companionCleanup = { listener, agentId }

  // line 738-757 - cleanup only when set is empty
  ws.on('close', () => {
    const agentClients = companionClients.get(agentId)
    if (agentClients) {
      agentClients.delete(ws)
      if (agentClients.size === 0) { // <-- only cleans up here
        // Only THIS ws's listener is removed
        if (ws._companionCleanup?.listener) {
          cerebellum.off('voice:speak', ws._companionCleanup.listener)
        }
      }
    }
  })
  ```
- **Fix:** Move the listener cleanup outside the `size === 0` check, so each client removes its own listener on close, and only the `companionClients.delete(agentId)` and `setCompanionConnected(false)` remain inside the empty-check:
  ```javascript
  ws.on('close', () => {
    // Always clean up THIS client's listener
    if (ws._companionCleanup?.listener) {
      import('./lib/agent.ts').then(({ agentRegistry }) => {
        const agent = agentRegistry.getExistingAgent(agentId)
        const cerebellum = agent?.getCerebellum()
        if (cerebellum) {
          cerebellum.off('voice:speak', ws._companionCleanup.listener)
        }
      }).catch(() => {})
    }
    const agentClients = companionClients.get(agentId)
    if (agentClients) {
      agentClients.delete(ws)
      if (agentClients.size === 0) {
        companionClients.delete(agentId)
        // Notify cerebellum no companion connected
        // ...
      }
    }
  })
  ```

### [CC-P8-A9-004] `ptyProcess.resume()` called even if process has already exited
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1014-1016
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** In the PTY `onData` handler, `ptyProcess.pause()` is called at line 953 and `ptyProcess.resume()` is called at line 1015 in a `.finally()` callback. If the PTY process exits while the backpressure cycle is in progress (i.e., between `pause()` and `resume()`), calling `resume()` on a dead PTY will throw an error. Since this is inside a `.finally()`, the error will become an unhandled promise rejection caught by the global handler, but it creates noise in the crash log.
- **Evidence:**
  ```javascript
  // line 951-1016
  ptyProcess.onData((data) => {
    ptyProcess.pause()  // line 953
    // ... process data ...
    Promise.all(writePromises).finally(() => {
      ptyProcess.resume()  // line 1015 - PTY may be dead
    })
  })
  ```
- **Fix:** Wrap `resume()` in a try-catch or check if session is cleaned up:
  ```javascript
  Promise.all(writePromises).finally(() => {
    try { ptyProcess.resume() } catch { /* PTY already exited */ }
  })
  ```

### [CC-P8-A9-005] `update-aimaestro.sh` always fetches from `origin/main` even when on a different branch
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:149-151
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The update script hardcodes `git fetch origin main` and `git pull origin main` at lines 149 and 188. If the user is on a different branch (e.g., `feature/team-governance` as shown in git status), the script will pull `main` into whatever branch is currently checked out, potentially causing merge conflicts or unwanted commits on a feature branch.
- **Evidence:**
  ```bash
  # line 149
  git fetch origin main
  # line 151
  COMMITS_BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")
  # line 188
  git pull origin main
  ```
- **Fix:** Either: (a) check that the current branch is `main` before proceeding, or (b) switch to `main` before pulling, or (c) warn the user that they're not on `main` and ask for confirmation.

### [CC-P8-A9-006] `bump-version.sh` regex replacement in `update_file` may fail for patterns containing special sed characters
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:114-116
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The `update_file` function creates a regex pattern by replacing `$CURRENT_VERSION` with `$CURRENT_VERSION_RE` (dot-escaped) inside the `$pattern` string using bash string substitution at line 115. However, `$replacement` is used directly in the sed substitution at line 116. If the replacement string happens to contain the sed delimiter `|` (unlikely for version strings but possible for other patterns), the sed command will break.

  More importantly, the `grep -qF "$pattern"` check at line 113 uses the *original* pattern (with literal dots) for a fixed-string grep, while the actual replacement uses the *regex* pattern. If the file contains a string that matches the fixed-string pattern but the regex-escaped version finds additional matches, there could be unexpected substitutions. In practice, for version strings, this is safe, but the logic is fragile.
- **Evidence:**
  ```bash
  # line 113-116
  if grep -qF "$pattern" "$file" 2>/dev/null; then
      local regex_pattern="${pattern//$CURRENT_VERSION/$CURRENT_VERSION_RE}"
      _sed_inplace "$file" "s|$regex_pattern|$replacement|g"
  ```
- **Fix:** This is a minor fragility. For robustness, use `sed` with escaped dots in the replacement as well, or validate that version strings can never contain `|`.

### [CC-P8-A9-007] `amp-inbox.sh` base64 decoding is not portable across macOS and Linux
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:132
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script uses `base64 -d` to decode (line 132). On macOS, the `base64` command uses `-D` for decoding (not `-d`). The `-d` flag is the GNU coreutils convention. If run on macOS without GNU coreutils installed, `base64 -d` will fail with an error.

  However, macOS 12+ ships with a `base64` that supports `-d` as an alias for `-D`, so this may work on modern macOS. But on older macOS versions or non-standard systems, this could fail.
- **Evidence:**
  ```bash
  # line 132
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use a portable decode: `base64 -d 2>/dev/null || base64 -D` or check the platform. Alternatively, since jq's `@base64d` filter can decode, consider using that: `msg=$(echo "$msg_b64" | jq -Rr '@base64d')`.

## NIT

### [CC-P8-A9-008] `server.mjs` imports `.ts` files directly, relying on runtime transpilation
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:583,651,684,856,872,1045,1224
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** Multiple `import()` calls in `server.mjs` import `.ts` files directly (e.g., `import('./lib/amp-websocket.ts')`, `import('./lib/agent.ts')`, `import('./lib/agent-runtime.ts')`). This relies on the runtime environment supporting TypeScript transpilation (via `tsx` or Next.js's module resolution). While this works in the current setup (headless mode uses `tsx`, full mode uses Next.js), it creates a hidden dependency on the runtime transpiler. If `server.mjs` is ever run with plain `node`, these imports will fail.
- **Evidence:**
  ```javascript
  // line 583
  const { handleAMPWebSocket } = await import('./lib/amp-websocket.ts')
  // line 651
  const { agentRegistry } = await import('./lib/agent.ts')
  ```
- **Fix:** This is intentional per the codebase architecture but worth documenting as a constraint.

### [CC-P8-A9-009] `start-with-ssh.sh` uses `exec tsx server.mjs` but tsx is not checked for existence
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:30
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script calls `exec tsx server.mjs` at line 30 without checking whether `tsx` is available on PATH. If `tsx` is not installed, the `exec` will fail with a cryptic "command not found" error after the SSH setup has already been completed.
- **Evidence:**
  ```bash
  # line 30
  exec tsx server.mjs
  ```
- **Fix:** Add a check before exec: `command -v tsx &>/dev/null || { echo "[AI Maestro] Error: tsx not found"; exit 1; }`

### [CC-P8-A9-010] `install-messaging.sh` uses `local` keyword inside `while` loop body within `distribute_shared_to_per_agent`
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:273-274
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** In the function `distribute_shared_to_per_agent`, the `local` keyword is used inside a `while` loop for `recipient` and `sender` (lines 273-276). In bash, `local` inside a loop works but is technically re-declaring the variable on each iteration. This is harmless but unconventional -- typically `local` declarations are placed at the top of the function.
- **Evidence:**
  ```bash
  while IFS= read -r msg_file; do
      local recipient            # Re-declares on each iteration
      recipient=$(_extract_recipient "$msg_file")
      local sender
      sender=$(_extract_sender "$msg_file")
  ```
- **Fix:** Move `local recipient sender msg_basename` declarations to the top of the function, before the while loop.

### [CC-P8-A9-011] `server.mjs` status WebSocket initial fetch uses loopback HTTP
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:600
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When a new status WebSocket subscriber connects, the server fetches initial data via `fetch(\`http://localhost:${port}/api/sessions/activity\`)` (line 600). This creates a loopback HTTP request from the server to itself, which adds unnecessary overhead and can fail if the server is still starting up. It would be more efficient to call the handler function directly.
- **Evidence:**
  ```javascript
  // line 600
  const response = await fetch(`http://localhost:${port}/api/sessions/activity`)
  ```
- **Fix:** Consider importing and calling the activity handler directly instead of making a loopback HTTP request. The fallback at lines 606-613 already shows the alternative approach of computing activity from the in-memory `sessionActivity` map.

### [CC-P8-A9-012] `remote-install.sh` cleanup trap removes partial installation in non-interactive mode without user confirmation
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:166-169
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In non-interactive mode, the cleanup trap at lines 166-169 automatically removes the install directory on failure. While the path is validated to be under `$HOME`, this is a destructive action that happens silently. The safety guard is good (checking `package.json` absence and `$HOME` prefix), but the deletion of a directory could still destroy user files if they had pre-existing content in `~/ai-maestro` that isn't an AI Maestro installation.
- **Evidence:**
  ```bash
  if [ "$NON_INTERACTIVE" = true ]; then
      rm -rf "$INSTALL_DIR"
      maestro_info "Removed partial installation at $INSTALL_DIR"
  ```
- **Fix:** The existing guards (`! -f "$INSTALL_DIR/package.json"` and `$HOME/*` check) are adequate. This is just a documentation note.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-register.sh -- No issues (well-structured, proper error handling, validates user key format, secures registration file with chmod 600)
- /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-send.sh -- No issues beyond what is covered by CC-P8-A9-007 regarding portability (overall well-structured with proper signing, routing, and security)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P8-A9-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P8-R57d244f7-f50ce148-d927-4c71-aa56-cde8ad13838f.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (no tests exist for these scripts per CLAUDE.md)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines

## Test Coverage Notes

Per the project's CLAUDE.md: "No other automated tests yet. Phase 1 focuses on getting the core working." None of the shell scripts in this domain have automated tests. The server.mjs file has no unit tests for its WebSocket handling, PTY management, or session cleanup logic. This is a significant gap but is acknowledged by the project's current phase.

## Notes

- CC-P8-A9-001 was initially flagged but RETRACTED after careful analysis showed the function works correctly.
- Three files from the original domain list (`scripts/amp-inbox.sh`, `scripts/amp-register.sh`, `scripts/amp-send.sh`) do not exist at those paths. They exist in the plugin submodule at `plugin/plugins/ai-maestro/scripts/`. I audited them from their actual location.
- The `amp-helper.sh` file was read as a dependency to verify function calls made by `amp-inbox.sh`, `amp-register.sh`, and `amp-send.sh`.
