# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:16.015Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/audit-plugin-amp-scripts-2026-03-06.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
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
- **