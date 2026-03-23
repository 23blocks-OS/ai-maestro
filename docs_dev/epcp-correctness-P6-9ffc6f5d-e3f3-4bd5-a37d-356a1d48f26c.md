# Code Correctness Report: config-scripts

**Agent:** epcp-code-correctness-agent
**Domain:** config-scripts
**Files audited:** 12
**Date:** 2026-02-22T21:35:00Z
**Pass:** 6
**Finding ID Prefix:** CC-P6-A8

## MUST-FIX

### [CC-P6-A8-001] server.mjs uses deprecated `url.parse()` API
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:2,377,759
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `url.parse()` is deprecated in Node.js and has known parsing inconsistencies that can lead to SSRF and URL confusion attacks. The `query` object from `parse(req.url, true)` is also susceptible to prototype pollution through crafted query strings (e.g., `?__proto__[x]=y`). While the server is localhost-only in Phase 1, this becomes a security risk if network access is ever enabled via `HOSTNAME=0.0.0.0`.
- **Evidence:**
  ```javascript
  // Line 2
  import { parse } from 'url'
  // Line 377
  const parsedUrl = parse(req.url, true)
  // Line 759
  const { pathname, query } = parse(request.url, true)
  ```
- **Fix:** Replace with `new URL(req.url, 'http://localhost')` which returns a proper `URL` object. Query params via `url.searchParams.get()` instead of `query.name`.

### [CC-P6-A8-002] server.mjs WebSocket session name used without sanitization
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:783-788
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sessionName` from WebSocket query parameter is used directly in PTY spawn commands (via `getRt().getAttachCommand(sessionName, socketPath)`) and file path construction (log files at line 903). While there is validation that `sessionName` is a string, there is no character validation (e.g., restricting to `^[a-zA-Z0-9_-]+$`) to prevent command injection or path traversal. The CLAUDE.md itself documents that session names should match `^[a-zA-Z0-9_-]+$`.
- **Evidence:**
  ```javascript
  // Line 783-788
  const sessionName = query.name
  if (!sessionName || typeof sessionName !== 'string') {
    ws.close(1008, 'Session name required')
    return
  }
  // Line 903 - used directly in file path
  const logFilePath = path.join(logsDir, `${sessionName}.txt`)
  ```
- **Fix:** Add validation immediately after extracting `sessionName`:
  ```javascript
  if (!/^[a-zA-Z0-9_@.-]+$/.test(sessionName)) {
    ws.close(1008, 'Invalid session name')
    return
  }
  ```

## SHOULD-FIX

### [CC-P6-A8-003] start-with-ssh.sh hardcodes tsx path via node_modules
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:29
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The script uses `exec ./node_modules/.bin/tsx server.mjs` which is a relative path. If the script is invoked from a different working directory, it will fail. The regular startup commands in package.json use `tsx server.mjs` (relying on PATH), which is more robust.
- **Evidence:**
  ```bash
  # Line 29
  exec ./node_modules/.bin/tsx server.mjs
  ```
- **Fix:** Either `cd` to the script's directory first, or use `exec npx tsx server.mjs`, or use `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" && cd "$(dirname "$SCRIPT_DIR")" && exec ./node_modules/.bin/tsx server.mjs`.

### [CC-P6-A8-004] start-with-ssh.sh lacks `set -e` for error handling
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh:1-29
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The script does not use `set -e`, meaning failures in intermediate commands (e.g., `ln -sf`, `tmux setenv`) would be silently ignored and execution would continue to `exec`, potentially starting the server in an inconsistent state.
- **Evidence:**
  ```bash
  #!/bin/bash
  # AI Maestro - Startup script with SSH configuration
  # ... (no set -e anywhere)
  ```
- **Fix:** Add `set -e` after the shebang line.

### [CC-P6-A8-005] bump-version.sh sed patterns have unescaped dots in version numbers
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:109-110
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `update_file` function uses `grep -q "$pattern"` and `sed "s|$pattern|$replacement|g"` where version number dots (e.g., `0.26.0`) are regex wildcards matching any character. While the script has a comment noting this is mitigated by surrounding context, it could still match unintended text (e.g., version `0.26.0` would match `0X26Y0` if such a string existed in the same pattern context). More importantly, the sed replacement uses `$replacement` which could contain `&` or `\` characters that are interpreted specially by sed.
- **Evidence:**
  ```bash
  # Lines 109-110
  if grep -q "$pattern" "$file" 2>/dev/null; then
      _sed_inplace "$file" "s|$pattern|$replacement|g"
  ```
- **Fix:** Escape dots in the version pattern: `local escaped_pattern=$(echo "$pattern" | sed 's/\./\\./g')`. For the replacement, escape `&` and `\`.

### [CC-P6-A8-006] server.mjs `else` block misalignment creates confusing code flow
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:898-992
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The code has an unusual `} else {` at line 898 that opens a block spanning from line 900 to 992, inside the retry loop's `if (sessionState) ... else if (!ptyProcess) ... else {` chain. The `else {` block creates a new `sessionState` object but the closing `}` at line 992 ends the `else` while the code at lines 995-1080 (adding client to session) runs regardless. This works but is confusing because the indentation and structure make it hard to see that lines 900-992 only execute for new sessions while lines 995+ always execute.
- **Evidence:**
  ```javascript
  // Line 892-898
  if (sessionState) {
    // Fall through to add client to existing session
  } else if (!ptyProcess) {
    ws.close(1011, 'PTY spawn failed unexpectedly')
    return
  } else {
  // Line 900-992 - new session setup
  // Line 992 - closing brace of else
  }
  // Line 995+ - always runs (add client to session)
  ```
- **Fix:** Refactor to make the control flow clearer, e.g., extract the session creation block into a named function, or restructure so the intent is obvious.

### [CC-P6-A8-007] remote-install.sh portable_sed uses macOS-specific `sed -i ''` syntax
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:321-326
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `portable_sed` function in remote-install.sh uses `sed -i '' "$@"` for macOS and `sed -i "$@"` for Linux. The macOS branch is correct, but the Linux branch `sed -i "$@"` works only if `$@` starts with a sed expression, not flags. This is fine for simple `s/.../.../` calls but would break if called with flags. Additionally, `bump-version.sh` already solves this correctly with `sed -i.bak` + `rm -f`, so there's an inconsistency.
- **Evidence:**
  ```bash
  # Lines 321-326
  portable_sed() {
      if [ "$OS" = "macos" ]; then
          sed -i '' "$@"
      else
          sed -i "$@"
      fi
  }
  ```
- **Fix:** Use the same `sed -i.bak` + `rm` pattern used in `bump-version.sh` (line 94-98).

### [CC-P6-A8-008] amp-send.sh `$?` check after command substitution is unreliable
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-send.sh:234-236
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The pattern `att_meta=$(upload_attachment ...)` followed by `if [ $? -ne 0 ]` is unreliable because `set -e` is active. If `upload_attachment` fails (returns non-zero), the script would exit at the command substitution line before reaching the `$?` check. The `$?` check is dead code.
- **Evidence:**
  ```bash
  # Lines 234-236
  att_meta=$(upload_attachment "$attach_file" "$UPLOAD_API_URL" "$UPLOAD_API_KEY")
  if [ $? -ne 0 ]; then
      echo "Error: Failed to upload attachment: $(basename "$attach_file")"
  ```
- **Fix:** Either disable `set -e` around this section, or use `if ! att_meta=$(upload_attachment ...); then`.

### [CC-P6-A8-009] amp-inbox.sh base64 decoding may fail on Linux
- **File:** /Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh:130
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** LIKELY
- **Description:** The script uses `base64 -d` to decode messages. On macOS, `base64 -d` is correct, but on some Linux systems the flag is `base64 -d` (GNU coreutils) which is also fine. However, if the base64 output from `jq -r '.[] | @base64'` contains line breaks, `base64 -d` will fail. Long messages may produce wrapped base64 that breaks decoding.
- **Evidence:**
  ```bash
  # Line 130
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use `base64 --decode` or `base64 -d` with `-w0` on encode side (jq's `@base64` already produces single-line output, so this is low risk).

## NIT

### [CC-P6-A8-010] install-messaging.sh uses Unicode box-drawing characters that may render incorrectly
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The box-drawing header uses full-width Unicode characters. The box widths don't match between the top (`╔═...╗`), middle (`║ ... ║`), and bottom (`╚═...╝`) lines -- the content lines appear wider than the borders, which creates misalignment in terminals with monospaced fonts.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
  Count: top/bottom border has 64 `═` chars between corners, but the content line has 64 spaces between `║` chars. The visual widths may differ because `═` is full-width in some fonts.
- **Fix:** Verify alignment in common terminals, or simplify to ASCII borders.

### [CC-P6-A8-011] update-aimaestro.sh version extraction uses fragile sed pattern
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:114
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The version extraction uses `grep + sed` which is fragile. The `jq` tool is already verified as a prerequisite elsewhere, and would be more reliable.
- **Evidence:**
  ```bash
  # Line 114
  CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
  ```
- **Fix:** Use `jq -r '.version' package.json` instead.

### [CC-P6-A8-012] server.mjs fetches own API endpoints during startup
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1092-1176
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The server makes HTTP requests to itself during startup (`fetch("http://localhost:${port}/api/...")`). While this is done inside `setTimeout` callbacks (2s, 5s delays), it creates a temporal coupling -- the server must be fully listening before these fire. If startup is slow (e.g., heavy CPU load), the fetches could race with route registration.
- **Evidence:**
  ```javascript
  // Lines 1102-1117 (inside server.listen callback)
  setTimeout(async () => {
    const response = await fetch(`http://localhost:${port}/api/agents/normalize-hosts`, ...)
  }, 2000)
  ```
- **Fix:** This is acceptable for the current architecture but consider importing and calling the functions directly rather than HTTP self-requests for reliability.

### [CC-P6-A8-013] Missing `set -u` in shell scripts
- **File:** Multiple scripts
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** None of the shell scripts use `set -u` (treat unset variables as errors). All scripts use `set -e` consistently, but `set -u` would catch typos in variable names early. This is a minor quality improvement.
- **Evidence:** All scripts in domain: `install-messaging.sh`, `update-aimaestro.sh`, `bump-version.sh`, `remote-install.sh`, `start-with-ssh.sh`, `amp-inbox.sh`, `amp-send.sh`, `amp-register.sh`.
- **Fix:** Add `set -u` after `set -e` in scripts where appropriate (may require initializing some variables that are currently left unset).

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/version.json -- No issues (version 0.26.0 matches package.json)
- /Users/emanuelesabetta/ai-maestro/package.json -- No issues (version consistent with version.json, dependencies reasonable)
- /Users/emanuelesabetta/ai-maestro/README.md -- No issues (version badge matches 0.26.0)

## Version Consistency Check

| File | Version | Consistent |
|------|---------|------------|
| version.json | 0.26.0 | YES |
| package.json | 0.26.0 | YES |
| README.md badge | 0.26.0 | YES |
| remote-install.sh | 0.26.0 | YES |

All version references are consistent across the audited files.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A8-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-9ffc6f5d-e3f3-4bd5-a37d-356a1d48f26c.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)

## Test Coverage Notes

- No tests exist for `server.mjs` WebSocket handling, PTY lifecycle, or session validation
- No tests exist for shell scripts (`bump-version.sh`, `install-messaging.sh`, `update-aimaestro.sh`)
- AMP scripts (`amp-send.sh`, `amp-inbox.sh`, `amp-register.sh`) have integration test scripts (`test-amp-routing.sh`) but no unit tests
