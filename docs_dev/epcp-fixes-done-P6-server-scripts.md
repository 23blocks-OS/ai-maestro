# Fix Report: P6 Server Scripts Domain
Generated: 2026-02-22T22:08:00Z

## Findings Fixed: 7/7

### MF-025: Replace deprecated url.parse() with WHATWG URL API
**File:** `server.mjs`
- Removed `import { parse } from 'url'` (line 2)
- Replaced `parse(req.url, true)` in createServer handler (line 377) with `new URL()` + `Object.fromEntries(searchParams)` to produce a Next.js-compatible `{ pathname, query, search, href }` object
- Replaced `parse(request.url, true)` in upgrade handler (line 759) with `new URL()` + `Object.fromEntries(searchParams)` for plain-object query compatibility with downstream handlers
- All `query.name`, `query.host`, `query.agent`, `query.socket` access patterns preserved via Object.fromEntries conversion

### MF-026: Session name validation before PTY spawn
**File:** `server.mjs` (after line 800)
- Added regex validation `!/^[a-zA-Z0-9_@.-]+$/.test(sessionName)` before PTY spawn
- Closes WebSocket with 1008 (Policy Violation) and 'Invalid session name' message on invalid names
- Prevents command injection via tmux attach session name parameter

### NT-023: start-with-ssh.sh hardening
**File:** `scripts/start-with-ssh.sh`
- Added `set -e` at top (fail on any error)
- Changed `./node_modules/.bin/tsx server.mjs` to `tsx server.mjs` (use PATH resolution)

### NT-024: Escape dots in version patterns for sed
**File:** `scripts/bump-version.sh`
- Added `CURRENT_VERSION_RE` variable that escapes dots in version string (`0.21.25` -> `0\.21\.25`)
- Updated `update_file()` to use `grep -qF` (fixed-string match) and regex-escaped version in sed
- Updated all direct `_sed_inplace` calls to use `$CURRENT_VERSION_RE` instead of `$CURRENT_VERSION` in regex patterns
- Affected: version.json, ai-index.html (Version display, Current Version display), BACKLOG.md

### NT-025: Document session creation vs existing session branch logic
**File:** `server.mjs` (around line 910)
- Added detailed block comment explaining the two-path branching logic:
  - Path A: existing session state (another client created it during retry) -- skip creation, add client
  - Path B: new session -- create PTY handlers, log stream, client set, register in terminalSessions map

### NT-026a: Portable sed in remote-install.sh
**File:** `scripts/remote-install.sh` (lines 319-326)
- Replaced OS-branching portable_sed (`if macos; sed -i ''; else sed -i`) with universal `sed -i.bak` + `rm .bak` pattern
- Same pattern already used in bump-version.sh's `_sed_inplace`

### NT-026b: Idiomatic error check in amp-send.sh
**File:** `plugin/plugins/ai-maestro/scripts/amp-send.sh` (lines 234-236)
- Replaced `att_meta=$(...); if [ $? -ne 0 ]` with `if ! att_meta=$(...)`
- Avoids fragile $? check that can be clobbered by intervening commands

### NT-026c: Base64 encoding assumption comment in amp-inbox.sh
**File:** `plugin/plugins/ai-maestro/scripts/amp-inbox.sh` (line 130)
- Added comment explaining that each message is base64-encoded on a single line (no wraps) so `read -r` can consume it as one token, and that the API guarantees this format

## Skipped (per task instructions)
- NT-027: Adding `set -u` to all scripts (too broad and risky)

## Validation
- All 6 modified files pass syntax checking (`node -c`, `bash -n`)
- No remaining references to `import { parse } from 'url'` in server.mjs
- All `JSON.parse()` calls (unrelated) preserved correctly
