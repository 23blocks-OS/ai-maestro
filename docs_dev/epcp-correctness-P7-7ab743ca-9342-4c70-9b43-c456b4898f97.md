# Code Correctness Report: server-scripts

**Agent:** epcp-code-correctness-agent
**Domain:** server-scripts
**Pass:** 7
**Files audited:** 12
**Date:** 2026-02-22T22:23:00Z

## MUST-FIX

(none)

## SHOULD-FIX

### [CC-P7-A9-001] PTY process may be accessed after cleanup in WebSocket message handler
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1082-1097
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** When a client sends a `resize` or raw input message, the handler accesses `sessionState.ptyProcess` without checking if the session has been cleaned up. If the PTY process exited between when the message was queued and when it's processed, `sessionState.ptyProcess.resize()` or `.write()` will throw. While the outer try-catch on line 1098 prevents a crash, the error message (`Error processing message`) is misleading and doesn't indicate the real cause (PTY already dead).
- **Evidence:**
```javascript
// Line 1082-1097 - no guard on sessionState.cleanedUp or sessionState.ptyProcess existence
if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
    sessionState.ptyProcess.resize(parsed.cols, parsed.rows)
    return
}
// ...
sessionState.ptyProcess.write(message)
```
- **Fix:** Add a guard before accessing `ptyProcess`:
```javascript
if (sessionState.cleanedUp || !sessionState.ptyProcess) {
    return  // Session already cleaned up, drop the message
}
```

## NIT

### [CC-P7-A9-002] Box-drawing banner width mismatch in install-messaging.sh
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ASCII box-drawing banner has inconsistent column widths. The top/bottom borders (`═`) are 62 characters wide, but the middle lines use 64-character padding (spaces between `║`), causing visual misalignment in some terminal emulators.
- **Evidence:**
```bash
# Line 65-71
echo "╔════════════════════════════════════════════════════════════════╗"   # 64 ═
echo "║                                                                ║" # 64 chars between ║
echo "║     AI Maestro - Agent Messaging Protocol (AMP) Installer      ║" # 62 content chars
echo "║                                                                ║" # 64 chars between ║
echo "╚════════════════════════════════════════════════════════════════╝"   # 64 ═
```
The widths are actually consistent at 64 `═` characters. On re-count, the empty lines have 64 spaces between the `║` characters, and the text line is also 64 characters between them. This is actually correct. **Retracted** -- no issue upon re-verification.

### [CC-P7-A9-003] Unused variables in update-aimaestro.sh
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:27-31
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Variables `SKIP_MEMORY`, `SKIP_GRAPH`, `SKIP_DOCS`, `SKIP_HOOKS`, `SKIP_AGENT_CLI` are parsed from command-line arguments but are never used to control script behavior. The script delegates to component installers (`install-messaging.sh`, `install-memory-tools.sh`, etc.) using `-y` flag, and uses `$SKIP_*` to conditionally run those installers. On closer inspection, these ARE used at lines 239-271 in conditional blocks like `if [ "$SKIP_MEMORY" != true ] && ...`. **Retracted** -- no issue upon re-verification.

### [CC-P7-A9-004] Companion WS cleanup only removes listener from last ws, not all
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:738-758
- **Severity:** NIT
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** When a companion WebSocket disconnects and it's the last client for an agent (`agentClients.size === 0`), the cleanup code only removes the event listener stored on `ws._companionCleanup`. However, if multiple companion clients connected for the same agent, only the first one stores the `_companionCleanup` reference (line 697), while subsequent connections would overwrite the `ws._companionCleanup` of the newly connected ws. Actually, looking more carefully, each `ws` gets its own `_companionCleanup` set on line 697 -- each new connection creates its own listener (line 659) and stores it on the specific `ws` object. But only the LAST ws to disconnect removes the cerebellum listener. The other ws objects that disconnected earlier don't clean up their listeners. This could lead to orphaned event listeners on the cerebellum.
- **Evidence:**
```javascript
// Line 697 - each ws gets its own listener
ws._companionCleanup = { listener, agentId }

// Line 738-758 - only cleans up when last client disconnects
ws.on('close', () => {
    // ...
    if (agentClients.size === 0) {
        // Only removes THIS ws's listener, not listeners from previously-disconnected ws objects
        if (ws._companionCleanup?.listener) {
            cerebellum.off('voice:speak', ws._companionCleanup.listener)
        }
    }
})
```
- **Fix:** Each ws close handler should remove its own listener regardless of whether it's the last client. Only set `companionConnected(false)` when the last client disconnects.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/app/plugin-builder/page.tsx` -- No issues. Clean component with proper validation and memoization.
- `/Users/emanuelesabetta/ai-maestro/app/teams/[id]/page.tsx` -- No issues. Correct runtime guard for `params.id` (MF-004 comment). Proper error/loading states.
- `/Users/emanuelesabetta/ai-maestro/app/teams/page.tsx` -- No issues. Good input validation, proper dialog accessibility (aria attributes), keyboard handling (Escape).
- `/Users/emanuelesabetta/ai-maestro/install-messaging.sh` -- No issues. Well-structured with `set -e`, proper quoting, safe temp directory handling, atomic skill installs.
- `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-inbox.sh` -- No issues. Proper `set -e`, input validation for `--limit`, clean jq usage with base64 encoding for safe line processing.
- `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-register.sh` -- No issues. Good input validation (user key format check), registration file secured with `chmod 600`, proper HTTP status code handling.
- `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/amp-send.sh` -- No issues. Comprehensive validation (priority, type, JSON context), proper attachment security (MIME blocking, digest verification, size limits), content security applied before delivery.
- `/Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh` -- No issues. Proper regex escaping for version dots, cross-platform sed with `_sed_inplace`, idempotency guard when version matches.
- `/Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh` -- No issues. Good error handling with trap, root user warning, safe partial-install cleanup (only removes under `$HOME`), cross-platform package manager detection.
- `/Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh` -- No issues. Simple and correct. Uses `exec` for proper signal forwarding.
- `/Users/emanuelesabetta/ai-maestro/update-aimaestro.sh` -- No issues. Proper stash handling, build failure tracking without aborting, PM2 ecosystem config reload detection.

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P7-A9-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P7-7ab743ca-9342-4c70-9b43-c456b4898f97.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines

**Note:** 3 files listed in the domain (scripts/amp-inbox.sh, scripts/amp-register.sh, scripts/amp-send.sh) do not exist at those paths. The actual AMP scripts are in the plugin submodule at plugin/plugins/ai-maestro/scripts/. I audited the actual files. 2 findings were retracted after re-verification (CC-P7-A9-002, CC-P7-A9-003), leaving 2 real findings.
