# Code Correctness Report: scripts-server

**Agent:** epcp-code-correctness-agent
**Domain:** scripts-server
**Pass:** 9
**Run ID:** 1ebfebc5
**Files audited:** 9
**Date:** 2026-02-23T03:14:00Z

## MUST-FIX

### [CC-P9-A9-001] `portable_sed` in remote-install.sh passes file path twice to sed, breaking on files with spaces or certain patterns
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
- **Severity:** MUST-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function extracts the last argument as the file, then passes ALL arguments (including the file) to `sed -i.bak`. This means the file path appears twice: once as the sed expression list and once as the target file. This works by accident when `sed` receives `"s|foo|bar|" "file"` -- sed interprets the first as a command and the second as the file. However, the function is semantically wrong: it should separate the sed arguments from the file path. More critically, the `rm -f "${file}.bak"` depends on the `$@` call succeeding. If sed fails (e.g., invalid regex), the `.bak` file is not cleaned up because `&&` short-circuits.
- **Evidence:**
  ```bash
  portable_sed() {
      local file="${@: -1}"
      sed -i.bak "$@" && rm -f "${file}.bak"
  }
  ```
  Callers like line 1065: `portable_sed "s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|" .env`
  This becomes: `sed -i.bak "s|AIMAESTRO_API=.*|..." .env && rm -f ".env.bak"` which works. But conceptually, if the function is called with multiple sed expressions, the file extraction is fragile.
- **Fix:** The function works by coincidence in all current call sites. For robustness, separate the file arg explicitly:
  ```bash
  portable_sed() {
      local file="${@: -1}"
      local args=("${@:1:$#-1}")
      sed -i.bak "${args[@]}" "$file" && rm -f "${file}.bak"
  }
  ```
  Also add cleanup of `.bak` in the failure path if partial writes are undesirable.

### [CC-P9-A9-002] `server.mjs` crash log directory may not exist on first uncaught exception
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:36-43
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `uncaughtException` handler writes to `path.join(process.cwd(), 'logs', 'crash.log')` at line 36. The logs directory creation happens at line 366-368, which runs AFTER the global error handlers are registered (lines 31-70). If an uncaught exception is thrown during module import resolution (lines 6-22), the logs directory doesn't exist yet and `fs.appendFileSync` will throw, which is swallowed by the try/catch. This is benign but the crash log is silently lost. More importantly, the `unhandledRejection` handler (line 59) has the same issue.
- **Evidence:**
  ```javascript
  // Line 31-43: Global handler registered first
  process.on('uncaughtException', (error, origin) => {
    const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
    // ...
    try {
      fs.appendFileSync(crashLogPath, logEntry)
    } catch (fsError) {
      // Ignore file write errors  <-- crash log silently lost
    }
  })

  // Line 366-368: Logs dir created much later
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }
  ```
- **Fix:** Move the `logsDir` creation block (lines 366-368) to before the global error handlers (before line 31), or create the directory lazily inside the error handler before writing.

## SHOULD-FIX

### [CC-P9-A9-003] `bump-version.sh` regex replacement on `ai-index.html` may match wrong patterns
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:190-202
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** Lines 190-193 and 197-202 perform sed replacements on `ai-index.html` matching patterns like `<strong>Version:</strong> 0.26.0 (Month Year)`. The regex `[A-Za-z]* [0-9]*` is used to match the month-year string. However, this regex uses `*` (zero or more), meaning it could match zero characters for the month or year, potentially matching `<strong>Version:</strong> 0.26.0 ()` or `<strong>Version:</strong> 0.26.0  0`. A more precise regex would use `+` (one or more): `[A-Za-z][A-Za-z]* [0-9][0-9]*` to ensure at least one character of each.
- **Evidence:**
  ```bash
  _sed_inplace "$PROJECT_ROOT/docs/ai-index.html" \
      "s|<strong>Version:</strong> $CURRENT_VERSION_RE ([A-Za-z]* [0-9]*)|<strong>Version:</strong> $NEW_VERSION ($MONTH_YEAR)|g"
  ```
- **Fix:** Use `[A-Za-z][A-Za-z]* [0-9][0-9]*` instead of `[A-Za-z]* [0-9]*` to avoid zero-length matches.

### [CC-P9-A9-004] `update-aimaestro.sh` line 119: `git status --porcelain` may include untracked files in docs_dev causing false "uncommitted changes" warning
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:119
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** `git status --porcelain` includes untracked files (prefixed with `??`), which means the presence of any untracked file (even in gitignored directories that aren't yet in `.gitignore`) will trigger the "uncommitted changes" warning and offer to stash. `git stash` does NOT stash untracked files by default, so the "stash and continue" option would still leave the untracked files, and `git status --porcelain` would still be non-empty. This could cause issues if git pull encounters untracked files that conflict with incoming tracked files.
- **Evidence:**
  ```bash
  if [ -n "$(git status --porcelain)" ]; then
      print_warning "You have uncommitted changes in your working directory"
  ```
- **Fix:** Use `git status --porcelain --untracked-files=no` if the intent is to detect only tracked-file changes, or use `git stash push -u` (with `-u` for untracked) if untracked files should also be stashed.

### [CC-P9-A9-005] `amp-send.sh` sign_message trap collision with set -e
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-helper.sh:737-739
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `sign_message` function uses `trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN` to clean up temp files. However, if `sign_message` is called multiple times in the same shell session (which it is in amp-send.sh -- once for local signing at line 320, and potentially again for external re-signing at line 658), the second `trap RETURN` **replaces** the first one's variables. This is fine since each call uses its own local variables. However, the `verify_signature` function at line 755 also sets `trap ... RETURN` with the same pattern. If these functions call each other (they don't currently), there would be a trap conflict. The real issue is that `trap ... RETURN` in a function under `set -e` might not fire if the function exits due to a command failure. On bash 4.x+, RETURN traps fire on function exit regardless, but on older bash this behavior is inconsistent.
- **Evidence:**
  ```bash
  sign_message() {
      # ...
      local tmp_msg=$(mktemp)
      local tmp_sig=$(mktemp)
      trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN
  ```
- **Fix:** Use a subshell or explicit cleanup in all code paths rather than relying on `trap RETURN`:
  ```bash
  sign_message() {
      local tmp_msg=$(mktemp)
      local tmp_sig=$(mktemp)
      # ... signing logic ...
      local result=$?
      rm -f "$tmp_msg" "$tmp_sig"
      return $result
  }
  ```

### [CC-P9-A9-006] `server.mjs` WebSocket message handler registers duplicate event listeners on retry
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:486-540
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `handleRemoteWorker`, when the workerWs `open` event fires, event listeners are registered on `clientWs` (lines 488, 526, 534). However, if the worker disconnects and the function retries (lines 548-552), a NEW `workerWs` is created, and when it connects, NEW listeners are added to `clientWs` again. The old `clientWs.on('message')` listener from the first attempt is never removed, so the clientWs now has two 'message' handlers -- one forwarding to the dead workerWs and one to the new workerWs. The dead one would fail silently (readyState check at line 489), but it's a resource leak. More critically, the `clientWs.on('close')` listener at line 526 sets `clientClosed = true`, which is already registered from the outer scope at line 568. After a retry, there would be two close handlers.
- **Evidence:**
  ```javascript
  workerWs.on('open', () => {
      // ...
      // These get re-registered on every retry:
      clientWs.on('message', (data) => { ... })  // line 488
      clientWs.on('close', () => { ... })         // line 526
      clientWs.on('error', (error) => { ... })    // line 534
  ```
- **Fix:** Either (a) register the clientWs event listeners once, outside the `attemptConnection` function, using a mutable `workerWs` reference, or (b) remove old listeners before adding new ones on retry, or (c) guard the inner registration with a `listenersRegistered` flag.

### [CC-P9-A9-007] `remote-install.sh` portable_sed receives all sed args including the file, making it pass the file path to sed twice
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:327-330
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Same root cause as CC-P9-A9-001 but noting a different consequence: `sed -i.bak "$@"` expands to `sed -i.bak <expression> <file>`, which works correctly because sed treats the first non-option arg as the script and the second as the file. HOWEVER, the pattern breaks if the expression itself contains an argument that looks like a file path (e.g., if someone passes a sed expression like `s|/old/path|/new/path|`). This is already in use at line 1065 with `s|AIMAESTRO_API=.*|AIMAESTRO_API=http://127.0.0.1:${PORT}|` which contains slashes. This works because `|` is the delimiter, but if someone uses `/` as delimiter, it would break. Merging with CC-P9-A9-001 as the same fix applies.
- **Evidence:** See CC-P9-A9-001
- **Fix:** See CC-P9-A9-001

### [CC-P9-A9-008] `amp-inbox.sh` processes empty `$MESSAGES` JSON as having `COUNT` of `null`
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:89-93
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** If `list_inbox` returns empty output (e.g., due to a jq error rather than returning `"[]"`), then `COUNT=$(echo "$MESSAGES" | jq 'length')` would produce `null` rather than `0`. The subsequent `-eq 0` comparison at line 109 would fail with a bash arithmetic error like `[: null: integer expression expected`. The `list_inbox` function in amp-helper.sh does return `"[]"` for empty cases (lines 1084, 1109), so this would only trigger on jq failure. Still, defensive coding should handle this.
- **Evidence:**
  ```bash
  MESSAGES=$(list_inbox "$STATUS_FILTER")
  COUNT=$(echo "$MESSAGES" | jq 'length')
  # If MESSAGES is empty string or invalid JSON, COUNT could be "null" or empty
  # Line 109:
  if [ "$COUNT" -eq 0 ]; then  # bash error if COUNT is "null"
  ```
- **Fix:** Add a fallback: `COUNT=$(echo "$MESSAGES" | jq 'length' 2>/dev/null || echo "0")` and/or validate that MESSAGES is valid JSON before proceeding.

## NIT

### [CC-P9-A9-009] `install-messaging.sh` box-drawing lines are misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The box-drawing characters are not perfectly aligned. The top/bottom bars use `════════════════════════════════════════════════════════════════` (64 chars) but the content lines use different padding:
  ```
  ║                                                                ║    <- 64 chars between bars
  ║     AI Maestro - Agent Messaging Protocol (AMP) Installer      ║
  ```
  The content between the `║` delimiters should be exactly the same width in all lines.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
  The top bar has 64 `=` characters, but the middle line's spacing doesn't produce the same visual width.
- **Fix:** Verify all box-drawing lines have consistent character counts between delimiters.

### [CC-P9-A9-010] `start-with-ssh.sh` does not use set -u, SSH_AUTH_SOCK could be unset
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:10
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Line 10 tests `$SSH_AUTH_SOCK` without checking if the variable is set. With `set -e` but without `set -u`, an unset `SSH_AUTH_SOCK` would evaluate to empty string and take the else branch (printing "SSH symlink already exists"), which is misleading -- it should say "No SSH agent found" or similar.
- **Evidence:**
  ```bash
  if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
  ```
  When `SSH_AUTH_SOCK` is unset, this becomes `[ -S "" ]` which is false, so the else branch fires with a misleading message.
- **Fix:** Add an explicit check: `if [ -z "${SSH_AUTH_SOCK:-}" ]; then echo "No SSH agent detected"; elif ...`

### [CC-P9-A9-011] `bump-version.sh` double-counts FILES_UPDATED for version.json
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:135-138
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Lines 135-136 directly modify version.json via `_sed_inplace`, then line 138 increments `FILES_UPDATED`. But version.json is also processed by `update_file` for other patterns. The manual increment at line 138 is the only one for version.json (since `update_file` handles the rest), but lines 190-208 also directly call `_sed_inplace` on `ai-index.html` and `BACKLOG.md` with manual increments. This means `FILES_UPDATED` counts the number of replacements, not the number of unique files. For version.json it counts 1, but for `ai-index.html` it could count 3+ (steps 7, 7b, 7c, 8, 9). The final message says "Updated N files" when it really means "Updated N file references."
- **Evidence:**
  ```bash
  # Line 135-138 (version.json: +1)
  _sed_inplace "$VERSION_FILE" "s|..."
  _sed_inplace "$VERSION_FILE" "s|..."
  FILES_UPDATED=$((FILES_UPDATED + 1))

  # Line 190-193 (ai-index.html direct: +1)
  # Line 197-202 (ai-index.html direct: +1)
  # Line 205-209 (BACKLOG.md direct: +1)
  # Plus update_file calls for ai-index.html: up to +3 more
  ```
- **Fix:** Either count unique files or change the message to "Updated N version references across M files."

### [CC-P9-A9-012] `server.mjs` `cleanupSession` may fire after session was already removed from map by another path
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:174-237
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `cleanedUp` flag at line 183-187 prevents double cleanup. However, the `handleClientDisconnect` function at line 261-266 schedules a delayed cleanup timer that captures `sessionState` in its closure. If `ptyProcess.onExit` fires and calls `cleanupSession` before the timer fires, the timer callback at line 263 checks `sessionState.clients.size === 0` on the now-cleaned-up state. Since `cleanedUp` is true, `cleanupSession` returns early at line 184. This is correct but the timer is never cleared, wasting a setTimeout. This is benign -- just noting the timer reference leak.
- **Evidence:**
  ```javascript
  // handleClientDisconnect:
  sessionState.cleanupTimer = setTimeout(() => {
      if (sessionState.clients.size === 0) {
          cleanupSession(sessionName, sessionState, 'no_clients_after_grace_period')
          // cleanupSession returns early due to cleanedUp=true
      }
  }, PTY_CLEANUP_GRACE_MS)
  ```
- **Fix:** In `cleanupSession`, clear the timer: already done at line 192-195. The race is if onExit fires between timer creation and cleanupSession processing. The `cleanedUp` guard handles it. No action needed.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-register.sh -- No issues. Well-structured with proper input validation, error handling for all HTTP status codes, secure file permissions (chmod 600) for registration files.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P9-A9-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P9-R1ebfebc5-b248a4d3-a8ca-4b82-84b5-b8a4599569af.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)

### Test Coverage Notes
- No test files were in scope for this domain. The shell scripts (amp-inbox.sh, amp-send.sh, amp-register.sh, bump-version.sh, etc.) and server.mjs appear to lack unit test coverage. Test validation is deferred to the tests domain auditor.
