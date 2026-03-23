# AMP Plugin Script Fixes - 2026-03-08

## Summary

Fixed 8 issues across 7 AMP plugin shell scripts. All syntax checks pass.

## Fixes Applied

### 1. amp-reply.sh - HIGH-1: Empty thread_id passed to amp-send.sh
- **Problem**: When `thread_id` was empty (extracted via `jq -r '.envelope.thread_id // empty'`), the script passed `--thread-id ""` to amp-send.sh, bypassing its default thread generation logic.
- **Fix**: Check if `ORIGINAL_THREAD` is non-empty before adding `--thread-id` to `SEND_ARGS`.
- **Lines**: 132-146 (replaced inline array entry with conditional append)

### 2. amp-reply.sh - LOW: Missing set -e
- **Problem**: Comment claimed `set -e` was inherited from amp-helper.sh, but sourcing a file that has `set -e` does propagate it, so this was technically fine -- however the comment was misleading and inconsistent with other scripts.
- **Fix**: Added explicit `set -e` before sourcing, matching the pattern in all other AMP scripts. Removed misleading comment.
- **Line**: 14

### 3. amp-fetch.sh - HIGH-2: base64 -d fails on older macOS
- **Problem**: `base64 -d` is GNU coreutils syntax. macOS ships with BSD `base64` which uses `-D`.
- **Fix**: `base64 -D 2>/dev/null || base64 -d 2>/dev/null` (try macOS first, fall back to GNU).
- **Line**: 259 (attachment decoding)

### 4. amp-fetch.sh - MED-4: curl stderr mixed with stdout
- **Problem**: `2>&1` on curl mixed stderr (connection errors, TLS warnings) into the response body, corrupting HTTP code extraction via `tail -n1`.
- **Fix**: Changed `2>&1` to `2>/dev/null`.
- **Line**: 133

### 5. amp-read.sh - HIGH-2: base64 -d fails on older macOS
- **Problem**: Same as #3.
- **Fix**: Same macOS-first fallback pattern.
- **Line**: 163 (attachment decoding)

### 6. amp-helper.sh - MED-1: sign_message() temp file leak
- **Problem**: `sign_message()` used manual `_sign_cleanup()` calls but had no trap, so temp files would leak if the function was interrupted or hit an unexpected error path.
- **Fix**: Replaced manual cleanup with `trap 'rm -f "$tmp_msg" "$tmp_sig"' RETURN`, matching the `verify_signature()` pattern. Removed `_cleanup_done` flag and `_sign_cleanup()` function.
- **Lines**: 737-749

### 7. amp-helper.sh - BONUS: verify_signature() base64 -d macOS compat
- **Problem**: `verify_signature()` also used `base64 -d` on line 772 (same macOS issue).
- **Fix**: Applied same macOS-first fallback: `{ base64 -D 2>/dev/null || base64 -d 2>/dev/null; }`.
- **Line**: 765

### 8. amp-send.sh - MED-4: curl stderr mixed with stdout (2 locations)
- **Problem**: `send_via_api()` and auto-registration curl both used `2>&1`.
- **Fix**: Changed to `2>/dev/null` in both locations.
- **Lines**: 370 (send_via_api), 494 (auto-registration)

### 9. amp-init.sh - MED-4: curl stderr mixed with stdout
- **Problem**: Registration curl used `2>&1`.
- **Fix**: Changed to `2>/dev/null`.
- **Line**: 195

### 10. amp-register.sh - MED-4: curl stderr mixed with stdout
- **Problem**: Both curl calls (with and without auth header) used `2>&1`.
- **Fix**: Changed to `2>/dev/null` for both.
- **Lines**: 243, 247

## Files Modified

| File | Changes |
|------|---------|
| `scripts/amp-reply.sh` | set -e added; empty thread_id guard |
| `scripts/amp-fetch.sh` | base64 macOS compat; curl stderr fix |
| `scripts/amp-read.sh` | base64 macOS compat |
| `scripts/amp-helper.sh` | sign_message trap cleanup; verify_signature base64 compat |
| `scripts/amp-send.sh` | curl stderr fix (2 locations) |
| `scripts/amp-init.sh` | curl stderr fix |
| `scripts/amp-register.sh` | curl stderr fix (2 locations) |

## Verification

All 7 files pass `bash -n` syntax check.

## Base Path

All files under: `plugin/plugins/ai-maestro/scripts/`

---

## Batch 2: MED-2 and MED-5 Fixes (2026-03-09)

### 11. amp-helper.sh - MED-2: Replay DB race condition

- **Problem**: The `save_to_inbox()` function reads `replay_db`, checks for duplicate message IDs, then appends new IDs -- all without file locking. Concurrent delivery (e.g., two messages arriving simultaneously via parallel curl requests) can corrupt entries or allow replay of a message that was being written concurrently.
- **Fix**: Wrapped the replay DB check-and-write in a `flock -x` exclusive lock block using fd 200. The subshell exits with code 1 if a replay is detected, code 0 if the message is new (and records it + prunes old entries). The lock file is `${replay_db}.lock`. Moved the pruning logic inside the lock to prevent concurrent awk/mv operations on the same file.
- **Lines**: 998-1022 in `amp-helper.sh` (`save_to_inbox()`)
- **Pattern**: `(flock -x 200; ...) 200>"${replay_db}.lock" || _replay_rc=$?`

### 12. amp-helper.sh + amp-init.sh + amp-send.sh - MED-5: Triplicated auto-registration code

- **Problem**: Three near-identical auto-registration blocks existed in:
  - `amp-init.sh` (lines 180-267): Registration during `amp-init`
  - `amp-send.sh` (lines 478-552): Auto-registration fallback when sending without registration
  - `amp-helper.sh` (lines 1856-1915, inside `require_init()`): Auto-init registration
  Each block: builds JSON request, calls `/api/v1/register`, parses response, writes registration file. Differences were minor (variable naming, error messages, 409 handling).

- **Fix**: Created `auto_register_with_maestro()` function in `amp-helper.sh` (inserted before `require_init()`). The function:
  1. Checks if already registered (scans `${AMP_REGISTRATIONS_DIR}/*.json` for aimaestro/.local providers)
  2. Reads public key from `${AMP_KEYS_DIR}/public.pem`
  3. Reads fingerprint from config if not provided as argument
  4. Calls `POST /api/v1/register` with agent name, tenant, public key
  5. On success (200/201): saves registration file, sets `AUTO_REG_API_KEY` and `AUTO_REG_ROUTE_URL` globals
  6. On 409: checks for existing local registration file, populates outputs if found
  7. On unreachable (000) or error: prints warning, returns 1

  Then replaced all 3 inline blocks with calls to `auto_register_with_maestro()`:
  - `amp-init.sh`: `auto_register_with_maestro "$NAME" "$TENANT" "$FINGERPRINT" "$ADDRESS"`
  - `amp-send.sh`: `auto_register_with_maestro "$AUTO_REG_NAME" "$AUTO_REG_TENANT"` (uses `AUTO_REG_ROUTE_URL`/`AUTO_REG_API_KEY` outputs for immediate send)
  - `amp-helper.sh require_init()`: `auto_register_with_maestro "$_agent_name" "$_tenant" "$_fingerprint" "$_address"`

- **Files modified**:
  - `scripts/amp-helper.sh` -- new function + simplified `require_init()`
  - `scripts/amp-init.sh` -- replaced ~100 lines with ~10-line call
  - `scripts/amp-send.sh` -- replaced ~75 lines with ~12-line call

## Batch 2 Verification

All 3 files pass `bash -n` syntax check after changes.
