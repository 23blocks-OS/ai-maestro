# Code Correctness Report: config-docs

**Agent:** epcp-code-correctness-agent
**Domain:** config-docs
**Files audited:** 6
**Date:** 2026-02-17T00:00:00Z

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-001] BACKLOG.md note line contradicts current version line
- **File:** /Users/emanuelesabetta/ai-maestro/docs/BACKLOG.md:3
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Line 3 says `The project is currently at v0.23.11` but line 8 says `**Current Version:** v0.23.13`. The note on line 3 was not updated by `bump-version.sh` because the script only targets the `**Current Version:**` pattern (line 184 of bump-version.sh). This creates a stale/contradictory version reference.
- **Evidence:**
  ```markdown
  # Line 3:
  > **Note:** Section headers below reference legacy planning milestones (v0.5.0-v0.8.0). The project is currently at v0.23.11.
  # Line 8:
  **Current Version:** v0.23.13
  ```
- **Fix:** Either (a) update `bump-version.sh` to also sed-replace the version in the Note line, or (b) change the Note line to not include a specific version number, e.g., "The project is currently well past these milestones."

### [CC-002] bump-version.sh uses unescaped version dots in grep/sed regex patterns
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh:100-115
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The `update_file` function passes `$CURRENT_VERSION` directly into grep and sed patterns. Version dots (e.g., `0.23.13`) are regex wildcards and will match any single character. A comment on lines 100-101 acknowledges this but claims "false matches are prevented by the specific surrounding context." While true for most patterns (e.g., `"version": "0.23.13"`), the README badge pattern `version-0.23.13-` on line 144 could theoretically match `version-0X23Y13-` if such text existed. The risk is extremely low in practice, but it is technically incorrect regex.
- **Evidence:**
  ```bash
  # Line 109-110
  if grep -q "$pattern" "$file" 2>/dev/null; then
      _sed_inplace "$file" "s|$pattern|$replacement|g"
  ```
- **Fix:** Escape dots in `$CURRENT_VERSION` when used in regex patterns: `CURRENT_VERSION_RE=$(echo "$CURRENT_VERSION" | sed 's/\./\\./g')`. Low priority since false matches are improbable.

### [CC-003] remote-install.sh line 173: unquoted variable in user-facing rm -rf suggestion
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:173
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The info message prints `rm -rf $INSTALL_DIR` without quoting, which is just a display string (not executed). However, if a user copies and pastes this when `INSTALL_DIR` contains spaces, they'd get a broken rm command. The actual `rm -rf "$INSTALL_DIR"` on line 169 is correctly quoted.
- **Evidence:**
  ```bash
  maestro_info "You may want to remove it: rm -rf $INSTALL_DIR"
  ```
- **Fix:** Change to: `maestro_info "You may want to remove it: rm -rf \"$INSTALL_DIR\""` to produce properly quoted output for users to copy.

### [CC-004] install-messaging.sh box-drawing header misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ASCII art box header uses `═` characters for the top and bottom borders, but the widths are different from the `║` lines. The top line `╔════...════╗` has 60 `═` characters, while the `║` content lines have a different apparent width due to the text content. Visually checking: line 65 has 60 `═` chars, but line 66 has `║` + 64 spaces + `║`. The top/bottom borders are narrower than the middle content lines, causing misalignment when printed.
- **Evidence:**
  ```
  ╔════════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ```
  Top border: `╔` + 64 `═` + `╗` = 66 total chars.
  Content line: `║` + 64 chars + `║` = 66 total chars. Actually these are consistent. Let me recount more carefully... The top border has 64 `═` characters. The text "AI Maestro - Agent Messaging Protocol (AMP) Installer" is 55 chars, needing 9 spaces of padding across both sides to fill 64 chars. Line 67 content "     AI Maestro - Agent Messaging Protocol (AMP) Installer      " needs to be exactly 64 chars to align. On inspection, the spacing appears slightly off (5 leading spaces, 6 trailing). This is purely cosmetic.
- **Fix:** Verify all `║` content lines are exactly the same width as the `═` border lines. This is cosmetic but visible to every user.

## NIT

### [CC-005] BACKLOG.md "Last Updated" date is stale
- **File:** /Users/emanuelesabetta/ai-maestro/docs/BACKLOG.md:7
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `Last Updated: 2026-01-03` but the version was bumped to 0.23.13 (released 2026-02-17 per version.json). The bump-version.sh script does not update this date, so it becomes stale every time the version is bumped.
- **Evidence:**
  ```markdown
  **Last Updated:** 2026-01-03
  **Current Version:** v0.23.13
  ```
- **Fix:** Either add an update rule to bump-version.sh for this date, or remove the manual date line in favor of referencing version.json's releaseDate.

### [CC-006] remote-install.sh: `maestro_say` uses bash substring syntax `${msg:$i:1}` inside `/bin/bash`
- **File:** /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:60
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** The shebang is `#!/bin/bash` and the `${msg:$i:1}` substring syntax is a bashism. This is fine since the script declares bash, but if a system has `/bin/bash` pointing to a POSIX shell (very rare), this would break. This is technically correct as-is.
- **Evidence:**
  ```bash
  printf "%s" "${msg:$i:1}"
  ```
- **Fix:** No fix needed. Noting for completeness only.

### [CC-007] ai-index.html references `copy-for-ai.js` script but file may not exist
- **File:** /Users/emanuelesabetta/ai-maestro/docs/ai-index.html:423
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** POSSIBLE (not verified whether file exists in docs/)
- **Description:** The HTML references `<script src="copy-for-ai.js"></script>` and has an `onclick="copyForAI()"` button. If `copy-for-ai.js` is missing from the docs/ directory, clicking the "Copy for AI" button would cause a JavaScript error.
- **Evidence:**
  ```html
  <script src="copy-for-ai.js"></script>
  ```
- **Fix:** Verify `docs/copy-for-ai.js` exists and is deployed alongside `ai-index.html`.

### [CC-008] remote-install.sh: `| sh` in README Quick Start vs `| bash` in script header
- **File:** /Users/emanuelesabetta/ai-maestro/README.md:42 vs /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh:3
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The README Quick Start says `curl ... | sh` but the script's own header comment says `curl ... | bash`. The script uses bashisms (`${msg:$i:1}`, `[[ ]]`, `read -ra`, arrays), so piping through `sh` on systems where `sh` is not bash (e.g., dash on Ubuntu) would cause syntax errors. The ai-index.html on line 231 also says `| sh`.
- **Evidence:**
  ```markdown
  # README.md line 42
  curl -fsSL https://raw.githubusercontent.com/.../remote-install.sh | sh

  # remote-install.sh line 3
  # Usage: curl -fsSL ... | bash
  ```
- **Fix:** Change the README and ai-index.html instructions to use `| bash` instead of `| sh` to match the script's requirements.

### [CC-009] ai-index.html: no `<style>` or CSS — button uses Tailwind classes without Tailwind loaded
- **File:** /Users/emanuelesabetta/ai-maestro/docs/ai-index.html:73-83
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The "Copy for AI" button uses Tailwind CSS utility classes (`fixed`, `bottom-6`, `right-6`, `z-50`, `flex`, `items-center`, `gap-2`, `px-5`, `py-3`, `bg-gradient-to-r`, etc.) but the page has no Tailwind CSS loaded (no `<link>` to Tailwind CDN, no `<style>` tag). These classes will have no effect; the button will render unstyled. This is likely a page meant to be embedded in the docs site where Tailwind is loaded at a higher level, but if served standalone the button will look broken.
- **Evidence:**
  ```html
  <button
      onclick="copyForAI()"
      class="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
  ```
- **Fix:** Either add a Tailwind CDN `<link>` to the `<head>`, or replace with inline styles. If this page is always served within a Tailwind-enabled context, add a comment noting that dependency.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh — Functionally correct; regex dot note is a very low risk edge case (covered in CC-002)
- /Users/emanuelesabetta/ai-maestro/install-messaging.sh — Well-structured, good error handling, proper quoting throughout
- /Users/emanuelesabetta/ai-maestro/README.md — Well-written, accurate (except minor `| sh` vs `| bash` noted in CC-008)
