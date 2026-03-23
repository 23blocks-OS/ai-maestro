# P9 Review Findings - Fixes Applied

**Date:** 2026-02-26

## MUST-FIX

| ID | File | Fix |
|------|------|------|
| MF-010 | scripts/remote-install.sh:327-331 | `portable_sed` now extracts last arg as file via `${!#}`, passes remaining args array to sed |
| MF-011 | server.mjs:36-37 | Added `logsDir` mkdir with `{ recursive: true }` before crash log write |

## SHOULD-FIX

| ID | File | Fix |
|------|------|------|
| SF-035 | scripts/bump-version.sh:191,199 | Changed `[A-Za-z]*` to `[A-Za-z][A-Za-z]*` and `[0-9]*` to `[0-9][0-9]*` in both regex patterns |
| SF-036 | update-aimaestro.sh:119 | Added `--untracked-files=no` to `git status --porcelain` |
| SF-037 | plugin/.../amp-helper.sh:736-758 | Replaced fragile `trap RETURN` with explicit `_sign_cleanup()` function called in both success and error paths |
| SF-038 | server.mjs:489-492 | Added `clientWs.removeAllListeners('message'/'close'/'error')` before adding new listeners in retry path |
| SF-039 | plugin/.../amp-inbox.sh:90 | Added `2>/dev/null || echo "0"` fallback to jq length call |

## NIT

| ID | File | Fix |
|------|------|------|
| NT-018 | install-messaging.sh:65-71 | Verified correct - all lines are 66 visual chars (64 inner + 2 border). No change needed. |
| NT-019 | scripts/start-with-ssh.sh:10 | Added guard for unset `SSH_AUTH_SOCK` with elif chain |
| NT-020 | scripts/bump-version.sh:212 | Changed message from "Updated N files" to "Applied N replacements across files" |

## Files Modified

- `scripts/remote-install.sh`
- `server.mjs`
- `scripts/bump-version.sh`
- `update-aimaestro.sh`
- `plugin/plugins/ai-maestro/scripts/amp-helper.sh`
- `plugin/plugins/ai-maestro/scripts/amp-inbox.sh`
- `scripts/start-with-ssh.sh`
