# AMP Scripts Audit Report - 2026-03-06

## Scope

All 13 AMP messaging scripts in `plugin/plugins/ai-maestro/scripts/` plus the `agent-messaging` SKILL.md.

---

## Category 1: Bash Syntax / Safety Issues

### 1.1 `amp-reply.sh` missing `set -e`
- **File:** `amp-reply.sh:14`
- **Issue:** Comment says "set -e is inherited from amp-helper.sh" but amp-helper.sh is sourced on line 18. Between lines 1-17, there is no `set -e`. If amp-helper.sh fails to source, there's no error protection. Every other script has its own `set -e` before sourcing.
- **Severity:** Low (sourcing failure would error anyway, but inconsistent)

### 1.2 `amp-download.sh` subshell variable scope in `download_single_attachment`
- **File:** `amp-download.sh:145-191`
- **Issue:** `download_single_attachment` modifies `DOWNLOADED` and `FAILED` counters. When called via `while read ... done < <(...)` on line 197-199, the function runs in the main shell so this is actually OK. However, the function also uses `return 1` on lines 161, 168 which means the _caller_ loop continues but the error is silently swallowed.
- **Severity:** Low (cosmetic - counts are still correct)

### 1.3 `sign_message` trap vs manual cleanup inconsistency
- **File:** `amp-helper.sh:737-758`
- **Issue:** `sign_message()` uses a custom `_sign_cleanup()` function with a `_cleanup_done` guard, but does NOT use a trap. If the function is interrupted (e.g., kill signal), temp files remain. Compare with `verify_signature()` at line 769 which correctly uses `trap 'rm -f ...' RETURN`.
- **Severity:** Medium (temp file leak on interruption, potential security issue with signing data)

### 1.4 Unquoted variable in `amp-helper.sh:1728`
- **File:** `amp-helper.sh:1728`
- **Issue:** `resolved_path=$(cd "$(dirname "$local_candidate")" 2>/dev/null && pwd -P)/$(basename "$local_candidate") 2>/dev/null || true` - the `2>/dev/null` after the closing paren redirects stderr for the _assignment_, not the command substitution. If `dirname` or `pwd` fails, the error is suppressed but `$resolved_path` could end up malformed.
- **Severity:** Low (edge case, `|| true` handles failure)

### 1.5 `amp-security.sh` uses global `content_lower` variable unnecessarily
- **File:** `amp-security.sh:64`
- **Issue:** `local content_lower=$(echo "$content" | LC_ALL=C tr ...)` - this is fine, but the loop at line 74 then does `grep -qiE` which is already case-insensitive. The `content_lower` transformation is redundant since `grep -i` handles case-insensitivity.
- **Severity:** Negligible (performance - double lowercasing, but no bug)

---

## Category 2: Hardcoded Paths

### 2.1 No hardcoded path issues found
- All paths properly use `$HOME`, `$AMP_DIR`, `$AMP_MAESTRO_URL` etc.
- The `~/.agent-messaging/` base path is constructed from `$HOME` at line 105.
- All API URLs use the `$AMP_MAESTRO_URL` variable (defaults to `http://localhost:23000`).

---

## Category 3: API Endpoint Inconsistencies

### 3.1 AI Maestro vs External provider endpoint patterns differ
- **Files:** `amp-fetch.sh:123-126`, `amp-send.sh:665`
- **Issue:** For AI Maestro local provider, the `apiUrl` stored in registration includes `/api/v1` suffix, so endpoints are `${API_URL}/messages/pending`. For external providers, `apiUrl` does NOT include the path, so endpoints are `${API_URL}/v1/inbox`. This dual convention works but is fragile - if registration saves the wrong format, routing breaks silently.
- **Severity:** Medium (architectural debt, no current bug if conventions are followed)

### 3.2 amp-register.sh uses `${API_URL}/v1/register` (external) but amp-init.sh uses `${AMP_MAESTRO_URL}/api/v1/register` (local)
- **File:** `amp-register.sh:240,245` vs `amp-init.sh:192`
- **Issue:** The external provider registration uses `${API_URL}/v1/register` while local AI Maestro uses `${AMP_MAESTRO_URL}/api/v1/register`. This is correct because external providers follow the AMP spec path while AI Maestro prefixes `/api`. But if someone passes an AI Maestro URL as an external provider, the path would be wrong.
- **Severity:** Low (by design, but worth documenting)

---

## Category 4: Missing/Undefined Functions or Variables

### 4.1 `format_file_size` referenced in `amp-send.sh:51-52` before amp-helper.sh is fully loaded
- **File:** `amp-send.sh:50-52`
- **Issue:** `show_help()` references `format_file_size` and `AMP_MAX_ATTACHMENTS`/`AMP_MAX_ATTACHMENT_SIZE` from amp-helper.sh. Since `show_help` is only _called_ after sourcing (line 95), this works. But if someone runs `amp-send --help` and amp-helper.sh fails to source, these will produce errors.
- **Severity:** Low (unlikely scenario)

### 4.2 `require_init` in amp-helper.sh is defined but has no function header section
- **File:** `amp-helper.sh:1347-1348`
- **Issue:** There are two "Initialization Check" section headers (lines 1347 and 1822) with `require_init` only at 1825. The first section header at 1347 is empty - looks like dead/leftover structure.
- **Severity:** Negligible (cosmetic)

---

## Category 5: Outdated Code / Dead Code

### 5.1 Duplicate auto-registration code (acknowledged TODO)
- **File:** `amp-helper.sh:1826-1828`
- **Issue:** There's a TODO comment acknowledging that auto-registration logic in `require_init()` (lines 1863-1922) duplicates code from `amp-send.sh` (lines 458-548). Three near-identical registration blocks exist: `amp-init.sh:180-236`, `amp-send.sh:478-546`, and `amp-helper.sh:1863-1922`.
- **Severity:** Medium (maintenance burden - fixing a bug requires updating 3 places)

### 5.2 `amp-helper.sh` `delete_message()` function is never called
- **File:** `amp-helper.sh:1212-1233`
- **Issue:** `delete_message()` is defined but `amp-delete.sh` implements its own deletion logic (lines 94-148) using `find_message_file` directly instead of calling `delete_message()`. Dead code.
- **Severity:** Low (unused function, no bug)

### 5.3 Legacy `.metadata.status` support scattered everywhere
- **Files:** `amp-helper.sh:1126-1131`, `amp-read.sh:123`, `amp-inbox.sh:141`
- **Issue:** Multiple places check both `.metadata.status` (old) and `.local.status` (new) for backward compatibility. The old format should be migrated or dropped.
- **Severity:** Low (technical debt)

### 5.4 Empty "Initialization Check" section header
- **File:** `amp-helper.sh:1347-1348`
- **Issue:** Section header `# Initialization Check` with nothing beneath it (the actual `require_init` is at line 1825 under a duplicate header). Leftover from refactoring.
- **Severity:** Negligible (cosmetic)

---

## Category 6: Missing --help or Inconsistent Help Text

### 6.1 All scripts have --help support
- All 13 scripts implement `--help|-h` flags consistently. No issues found.

### 6.2 Minor inconsistency: SKILL.md shows `amp-send` without `.sh` suffix, IDENTITY.md shows `amp-send.sh`
- **Files:** SKILL.md throughout, `amp-helper.sh:358-382` (IDENTITY.md template)
- **Issue:** SKILL.md documents commands without `.sh` extension (`amp-send`, `amp-inbox`), while the IDENTITY.md template generated by `create_identity_file()` uses `.sh` suffixes (`amp-send.sh`, `amp-inbox.sh`). Both work since the scripts are installed to `~/.local/bin/` with `.sh` extensions, but the inconsistency could confuse users.
- **Severity:** Low (documentation inconsistency)

---

## Category 7: Sourcing amp-helper.sh Without Existence Check

### 7.1 All scripts source amp-helper.sh without checking existence
- **Files:** All 12 scripts (excluding amp-helper.sh itself and amp-security.sh)
- **Issue:** Every script does `source "${SCRIPT_DIR}/amp-helper.sh"` without first checking `[ -f "${SCRIPT_DIR}/amp-helper.sh" ]`. If amp-helper.sh is missing, bash will error with a cryptic message. Compare with how amp-helper.sh itself checks for amp-security.sh at lines 20-22 with a proper `if [ -f ... ]` guard.
- **Severity:** Low (amp-helper.sh being missing is catastrophic anyway, but a friendlier error message would be helpful)

---

## Category 8: SKILL.md vs Script Reality Discrepancies

### 8.1 SKILL.md address format description is misleading
- **File:** SKILL.md:65
- **Issue:** SKILL.md says `alice` resolves to `alice@<your-org>.aimaestro.local` but only if the organization is configured. If org is "default", it becomes `alice@default.aimaestro.local`. The SKILL.md doesn't mention the "default" fallback which is quite common.
- **Severity:** Low (documentation gap)

### 8.2 SKILL.md documents `amp-register -p crabmail.ai -t mycompany` but script may reject missing user-key
- **File:** SKILL.md line mentions `--tenant` for legacy providers, but the registration flow in SKILL.md primarily shows user-key auth.
- **Issue:** `amp-register.sh:133-151` - If provider is `crabmail.ai`, `--user-key` is required. If neither `--user-key` nor `--tenant` is given for unknown providers, it errors. The SKILL.md's legacy `--tenant` example could confuse users about which providers accept which auth.
- **Severity:** Low (edge case documentation)

### 8.3 SKILL.md shows `~/.agent-messaging/agents/<agent-name>/` but actual path uses UUIDs
- **File:** SKILL.md:356
- **Issue:** SKILL.md storage diagram shows `~/.agent-messaging/agents/<agent-name>/` but the actual implementation uses UUID-based directories with name-to-UUID index resolution (`amp-helper.sh:106-163`). The name-based path is only a legacy fallback.
- **Severity:** Low (documentation outdated)

---

## Category 9: Dead Code / Unused Functions / Commented-out Code

### 9.1 No commented-out code blocks found
- The codebase is clean of commented-out code. Good.

### 9.2 `is_organization_set()` function never called
- **File:** `amp-helper.sh:263-267`
- **Issue:** `is_organization_set()` is defined but never called by any script. Only `get_organization()` is used.
- **Severity:** Negligible (dead code)

### 9.3 `require_organization()` function never called
- **File:** `amp-helper.sh:549-565`
- **Issue:** `require_organization()` is defined but never called by any script. All scripts use `get_organization()` with fallback to "default" instead.
- **Severity:** Negligible (dead code)

---

## Category 10: Security Issues

### 10.1 Replay DB is a flat text file with no locking
- **File:** `amp-helper.sh:1006-1064`
- **Issue:** `replay_db` is a simple text file that gets appended to and rewritten. No file locking (`flock`) is used. If two messages arrive simultaneously (e.g., via concurrent amp-fetch + API delivery), the file could become corrupted with lost entries.
- **Severity:** Medium (race condition on concurrent message delivery)

### 10.2 `amp-delete.sh` interactive prompt bypasses `set -e`
- **File:** `amp-delete.sh:128`
- **Issue:** `read -p "Are you sure?" -n 1 -r` - if stdin is not a terminal (e.g., piped input), `read` will return non-zero, and `set -e` will cause the script to exit silently. The script should check if stdin is a terminal first.
- **Severity:** Low (edge case - scripts are typically run interactively)

### 10.3 API keys stored in plaintext JSON files
- **Files:** Registration files in `${AMP_REGISTRATIONS_DIR}/*.json`
- **Issue:** API keys are stored as plaintext in JSON files. While `chmod 600` is set, the keys are not encrypted. This is acceptable for Phase 1 localhost-only security model but worth noting.
- **Severity:** Low (by design for Phase 1, documented in CLAUDE.md)

### 10.4 `amp-send.sh` local filesystem delivery doesn't verify sender identity
- **File:** `amp-send.sh:571-605`
- **Issue:** When falling back to filesystem delivery (no AMP registration), any agent can write to any other agent's inbox directory by constructing the path. The message is signed, but the recipient doesn't verify the signature on local delivery. Content security wrapping IS applied (`apply_content_security` at line 588), but signature verification at read time is not implemented (as noted in `amp-security.sh:245-249`).
- **Severity:** Medium (local agents can forge messages from other local agents)

### 10.5 `amp-fetch.sh` accepts messages with failed signature verification
- **File:** `amp-fetch.sh:176-218`
- **Issue:** When signature verification fails (line 211), the message is still saved to inbox with `sig_valid="false"`. The content security module wraps it as "untrusted" but the message is still delivered. This is documented behavior but worth noting - agents could process untrusted messages.
- **Severity:** Low (by design - content wrapping provides defense)

### 10.6 `curl` stderr mixed with response body
- **Files:** Multiple (amp-send.sh:366-370, amp-init.sh:192-195, amp-register.sh:240-247)
- **Issue:** Pattern `curl -s -w "\n%{http_code}" ... 2>&1` redirects curl's stderr (error messages) to stdout, which then gets mixed with the response body. If curl encounters a connection error, the error text becomes part of `$BODY`, and `tail -n1` for HTTP code might capture an error line instead. The `|| true` mitigates exit but not the parsing.
- **Severity:** Medium (connection errors could cause wrong HTTP code parsing, leading to unexpected behavior)

---

## Category 11: Cross-Platform Compatibility

### 11.1 `base64 -d` vs `base64 -D` inconsistency
- **File:** `amp-fetch.sh:258`
- **Issue:** `amp-fetch.sh` uses `base64 -d` for decoding attachment metadata at line 258. On older macOS, this should be `base64 -D`. However, `amp-inbox.sh:134` correctly uses `jq -Rr '@base64d'` for portable decoding. Inconsistent approach.
- **Severity:** Medium (will fail on older macOS versions without coreutils)

### 11.2 `amp-read.sh` also uses `base64 -d`
- **File:** `amp-read.sh:162`
- **Issue:** Same as 11.1 - uses `base64 -d` which may fail on older macOS. Should use `jq -Rr '@base64d'` like `amp-inbox.sh` does.
- **Severity:** Medium (same as above)

---

## Category 12: Logic / Correctness Issues

### 12.1 `amp-reply.sh` passes empty `--thread-id` when original has no thread
- **File:** `amp-reply.sh:114,140`
- **Issue:** `ORIGINAL_THREAD=$(echo "$ORIGINAL" | jq -r '.envelope.thread_id // empty')` - if the original message has no `thread_id`, this returns empty string. The reply then passes `--thread-id ""` to amp-send.sh. In amp-send.sh, `create_message` at line 935 does `local thread_id="${explicit_thread_id:-$id}"` which means empty string won't trigger the default (it IS provided, just empty). So the thread_id in the reply will be empty string, not the reply message's own ID.
- **Severity:** Medium (threading broken when replying to messages without thread_id)

### 12.2 `amp-send.sh` signing uses argument variables, not envelope values
- **File:** `amp-send.sh:315-319`
- **Issue:** The signing data uses `$PRIORITY` and `$REPLY_TO` from the script's argument variables, not from the message JSON envelope. If `create_message()` transforms these values (e.g., defaults), the signature won't match what a verifier computes from the envelope. Currently `create_message` preserves the input values, so this works, but it's fragile coupling.
- **Severity:** Low (works now but fragile)

### 12.3 `amp-fetch.sh` message ID validation has OR condition with different format
- **File:** `amp-fetch.sh:158`
- **Issue:** `if ! validate_message_id "$msg_id" 2>/dev/null && [[ ! "$msg_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$ ]]; then` - This accepts either the strict `msg_*` format OR a relaxed server-assigned UUID-like format. The relaxed regex `^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$` is quite permissive and would accept strings like `../../path` if they were 4-64 chars of allowed characters. Since the ID is used in file paths (`${msg_id}.json`), it's safe because the regex blocks `/` and `.`, but the dual validation is confusing.
- **Severity:** Low (safe but confusing logic)

### 12.4 `amp-download.sh:184` checks `$?` after variable assignment
- **File:** `amp-download.sh:182-184`
- **Issue:** `result=$(download_attachment ...)` followed by `if [ $? -eq 0 ]; then`. With `set -e` active, if `download_attachment` returns non-zero, the script exits before reaching the `if`. The `if` check is dead code.
- **Severity:** Low (the `set -e` behavior is correct, but the code is misleading)

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| Medium   | 7     | 1.3, 3.1, 5.1, 10.1, 10.4, 10.6, 11.1/11.2, 12.1 |
| Low      | 15    | Various |
| Negligible | 4   | Cosmetic/dead code |

### Top 5 Actionable Items (by impact)

1. **Fix `amp-reply.sh` empty thread_id propagation** (12.1) - Breaks message threading
2. **Fix `base64 -d` usage in `amp-fetch.sh` and `amp-read.sh`** (11.1, 11.2) - Use `jq -Rr '@base64d'` like `amp-inbox.sh` does
3. **Add file locking to replay_db** (10.1) - Prevents corruption on concurrent delivery
4. **Fix curl stderr mixing with response body** (10.6) - Separate stderr to prevent HTTP code parsing errors
5. **Consolidate 3 copies of auto-registration code** (5.1) - Maintenance burden, acknowledged TODO

### Positive Observations

- Consistent `set -e` usage (except amp-reply.sh which relies on inheritance)
- Good input validation: message IDs, attachment IDs, filenames all validated against path traversal
- Security module (amp-security.sh) is well-designed with injection pattern detection
- Proper `chmod 600/700` on sensitive files (keys, registration, attachments)
- All scripts have `--help` support
- MIME type blocking for executables and scripts
- Digest verification on attachment download
- Content wrapping for external/untrusted messages
- No eval or other dangerous shell patterns found
