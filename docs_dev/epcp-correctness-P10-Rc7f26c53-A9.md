# Code Correctness Report: types-scripts-server-config (A9)

**Agent:** epcp-code-correctness-agent
**Domain:** types, scripts, server, config
**Files audited:** 20
**Date:** 2026-02-26T00:00:00Z
**Run ID:** c7f26c53
**Finding prefix:** CC-A9

## MUST-FIX

### [CC-A9-001] server.mjs: unhandledRejection handler may silently lose crash logs
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:61
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `unhandledRejection` handler (line 56-72) writes to `path.join(process.cwd(), 'logs', 'crash.log')` but does NOT create the `logs/` directory first, unlike the `uncaughtException` handler at line 36-37 which explicitly calls `fs.mkdirSync(logsDir, { recursive: true })`. If an unhandled rejection occurs before the module-level `fs.mkdirSync` at line 369-371 runs (e.g., during a top-level import that rejects), the `appendFileSync` fails and the rejection is silently lost. While the try-catch at line 65-69 prevents a crash, the primary purpose of this handler (logging crash info for debugging) is defeated.
- **Evidence:**
  ```javascript
  // Line 56-72 (unhandledRejection) -- no mkdir:
  const crashLogPath = path.join(process.cwd(), 'logs', 'crash.log')
  fs.appendFileSync(crashLogPath, logEntry) // ENOENT if logs/ doesn't exist yet

  // Line 31-46 (uncaughtException) -- has mkdir:
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  ```
- **Fix:** Add the same `mkdirSync` guard to the `unhandledRejection` handler:
  ```javascript
  const logsDir = path.join(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const crashLogPath = path.join(logsDir, 'crash.log')
  ```

### [CC-A9-002] server.mjs: removeAllListeners on retry removes the early-close handler
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:490-492
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** In the `handleRemoteWorker` function, when a successful WebSocket connection to the remote worker opens (line 478), lines 490-492 call `clientWs.removeAllListeners('message')`, `clientWs.removeAllListeners('close')`, `clientWs.removeAllListeners('error')` to clean up listeners from previous retry attempts. However, this also removes the **early client disconnection handler** registered at line 575-580 (before `attemptConnection()` is called). That early-close handler sets `clientClosed = true` and terminates in-progress connections. After `removeAllListeners`, if the client disconnects and the remote worker also disconnects, there's no close handler on `clientWs` until the new one at line 533 is registered. The gap is minimal since the new handler is registered immediately after, but it's semantically incorrect to strip the fallback handler.
- **Evidence:**
  ```javascript
  // Line 574-580: Early close handler (registered before retries)
  clientWs.on('close', () => {
    clientClosed = true
    if (workerWs && workerWs.readyState === WebSocket.CONNECTING) {
      workerWs.terminate()
    }
  })

  // Line 490-492: Removes ALL listeners including the one above
  clientWs.removeAllListeners('message')
  clientWs.removeAllListeners('close')  // <-- removes the early handler
  clientWs.removeAllListeners('error')

  // Line 533-538: New close handler registered after
  clientWs.on('close', () => { ... })
  ```
- **Fix:** Instead of `removeAllListeners`, track named listeners from previous retry attempts and remove only those, or move the early-close handler registration inside the `on('open')` callback (since it's re-registered each time anyway). Alternatively, keep the removeAllListeners but register the new close handler immediately afterwards (which is actually what happens -- the gap is negligible in practice, so this could be downgraded to SHOULD-FIX if confirmed acceptable).

## SHOULD-FIX

### [CC-A9-003] amp-inbox.sh: `base64 -d` portability on older macOS
- **File:** /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-inbox.sh:130
- **Severity:** SHOULD-FIX
- **Category:** shell
- **Confidence:** LIKELY
- **Description:** `base64 -d` is used for decoding. On macOS 13 and earlier, the flag is `-D` (uppercase), not `-d`. macOS 14+ added `-d` as an alias. Users on Ventura or earlier would get an error. This also affects `amp-helper.sh:537` and `amp-security.sh:262`.
- **Evidence:**
  ```bash
  # amp-inbox.sh:130
  msg=$(echo "$msg_b64" | base64 -d)
  ```
- **Fix:** Use a portable decode wrapper:
  ```bash
  _base64_decode() {
    base64 -d 2>/dev/null || base64 -D 2>/dev/null
  }
  ```
  Or use `openssl base64 -d` which is portable across all platforms (and openssl is already a prerequisite).

### [CC-A9-004] amp-inbox.sh: redundant if/else in count-only mode
- **File:** /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-inbox.sh:93-99
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Both branches of the if/else at lines 93-98 do the same thing (`echo "$COUNT"`). The conditional check for `$STATUS_FILTER` is unnecessary in count-only mode.
- **Evidence:**
  ```bash
  if [ "$COUNT_ONLY" = true ]; then
      if [ "$STATUS_FILTER" = "unread" ]; then
          echo "$COUNT"
      else
          echo "$COUNT"  # identical to the above branch
      fi
      exit 0
  fi
  ```
- **Fix:** Simplify to just `echo "$COUNT"; exit 0`.

### [CC-A9-005] server.mjs: startup loopback fetch uses hardcoded localhost, ignores HOSTNAME binding
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:616
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Several startup tasks use `fetch(`http://localhost:${port}/...`)` (lines 616, 1173, 1191, 1209, 1216) but the server may be bound to `0.0.0.0` (via `HOSTNAME=0.0.0.0`). While `localhost` still resolves on most systems, on some Linux setups (especially Docker/containers) with IPv6-only localhost, this could fail. The `hostname` variable is already available (line 82) and should be used consistently.
- **Evidence:**
  ```javascript
  // Line 82
  const hostname = process.env.HOSTNAME || '127.0.0.1'
  // Line 616 -- uses hardcoded 'localhost' instead of hostname
  const response = await fetch(`http://localhost:${port}/api/sessions/activity`)
  ```
- **Fix:** Use `http://127.0.0.1:${port}/...` for all loopback fetches (or create a `loopbackUrl` constant). Using `127.0.0.1` is more reliable than `localhost` which may resolve to `::1` on IPv6 systems.

### [CC-A9-006] server.mjs: host sync filters by deprecated `h.type === 'remote'`
- **File:** /Users/emanuelesabetta/ai-maestro/server.mjs:1211
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The startup host sync at line 1211 filters hosts using `h.type === 'remote'`. However, the `type` field is deprecated on `Host` (types/host.ts:55-58: `@deprecated Use 'role' field instead`). The CLAUDE.md also states "In a mesh network, all hosts are equal." New hosts added via peer registration may not have `type: 'remote'` set, causing them to be silently excluded from startup sync.
- **Evidence:**
  ```javascript
  // server.mjs:1211
  const remoteHosts = (hostsData.hosts || []).filter(h => h.type === 'remote' && h.enabled)
  ```
  ```typescript
  // types/host.ts:55-58
  /** @deprecated Use 'role' field instead. Removal: v1.0.0
   *  In a mesh network, all hosts are equal. Use isSelf for self-detection. */
  type?: 'local' | 'remote'
  ```
- **Fix:** Filter using `!isSelf(h.id) && h.enabled !== false` instead of relying on the deprecated `type` field.

### [CC-A9-007] types/service.ts: assertValidServiceResult only logs, does not throw
- **File:** /Users/emanuelesabetta/ai-maestro/types/service.ts:29-35
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `assertValidServiceResult` function is named as an assertion but only logs an error via `console.error` without throwing. The function name `assert*` implies it would throw on invalid state. Callers using this for "defense-in-depth" (as documented in the JSDoc) may assume it will halt execution on bugs. As-is, the bug is merely logged and execution continues with an ambiguous result.
- **Evidence:**
  ```typescript
  export function assertValidServiceResult<T>(result: ServiceResult<T>, context?: string): void {
    if (result.data !== undefined && result.error !== undefined) {
      const ctx = context ? ` [${context}]` : ''
      console.error(`[ServiceResult]${ctx} BUG: result has both data and error set...`)
      // In this ambiguous state, error takes precedence -- callers using `if (result.error)` are correct
    }
    // No throw, no return value change
  }
  ```
- **Fix:** Either rename to `warnOnInvalidServiceResult` (to match behavior) or add `throw new Error(...)` to match the `assert` naming convention. If throwing is too disruptive, at minimum document that this is a soft assertion (logging only).

### [CC-A9-008] update-aimaestro.sh: box drawing characters misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/update-aimaestro.sh:75-79
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The box-drawing decorative header has mismatched widths. The `╔═══╗` top line uses 64 `═` characters, but the middle `║` lines have content that doesn't fill to 64 characters, and the `║` right edges don't align with the `╗`. The same issue exists at lines 358-363.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"  # <-- wider than the top line
  echo "║                 AI Maestro - Full Updater                      ║"
  echo "║                                                                ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  ```
  Counting: the top/bottom lines have 64 `═` + `╔╗` = 66 chars. The middle lines have more spaces than needed, making the right `║` extend past the box border.
- **Fix:** Align the inner content to match exactly 64 characters between the side `║` bars.

## NIT

### [CC-A9-009] types/governance.ts: GovernanceSyncMessage payload should be typed
- **File:** /Users/emanuelesabetta/ai-maestro/types/governance.ts:79
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** `GovernanceSyncMessage.payload` is `Record<string, unknown>` with a Phase 2 comment saying to refactor to a discriminated union. This is documented as intentional tech debt, but the `Record<string, unknown>` type provides no type safety for consumers. This is a known design decision per the inline comment.
- **Evidence:**
  ```typescript
  // Phase 2: Refactor to discriminated union keyed on `type`
  payload: Record<string, unknown>  // type-specific data
  ```
- **Fix:** Track as Phase 2 backlog item. No immediate action needed.

### [CC-A9-010] CI workflow: no TypeScript type-checking step
- **File:** /Users/emanuelesabetta/ai-maestro/.github/workflows/ci.yml
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The CI workflow runs `yarn test` and `yarn build` but has no explicit `tsc --noEmit` step to catch type errors independently of the build. The build does invoke `next build` which runs TypeScript compilation, but Next.js may skip certain type checks or only report a subset of errors. A dedicated `tsc --noEmit` step would catch type errors more reliably.
- **Evidence:**
  ```yaml
  - name: Run tests
    run: yarn test
  - name: Build
    run: |
      mkdir -p data
      touch data/.help-build-success
      yarn build
  ```
- **Fix:** Consider adding a `yarn tsc --noEmit` step before the build, or add it as an npm script.

### [CC-A9-011] install-messaging.sh: box drawing characters misaligned
- **File:** /Users/emanuelesabetta/ai-maestro/install-messaging.sh:65-71
- **Severity:** NIT
- **Category:** shell
- **Confidence:** CONFIRMED
- **Description:** Same box alignment issue as CC-A9-008. The middle `║` lines are wider than the `╔═══╗` frame.
- **Evidence:**
  ```bash
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║                                                                ║"
  ```
- **Fix:** Align inner content width to match the top/bottom border.

### [CC-A9-012] types/team.ts: TeamMeetingAction RESTORE_MEETING uses Meeting type directly
- **File:** /Users/emanuelesabetta/ai-maestro/types/team.ts:113
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `RESTORE_MEETING` action embeds an entire `Meeting` object in the action payload. This couples the reducer to the full Meeting schema. If Meeting grows, every action dispatch must include all fields. A `Pick<Meeting, ...>` with only the fields needed for restoration would be more robust.
- **Evidence:**
  ```typescript
  | { type: 'RESTORE_MEETING'; meeting: Meeting }
  ```
- **Fix:** Minor concern. The current approach works correctly. Could be improved to `Pick<Meeting, 'id' | 'teamId' | 'agentIds' | 'status' | 'sidebarMode' | ...>` for clarity, but this is purely a design preference.

### [CC-A9-013] package.json: tsx is in dependencies, not devDependencies
- **File:** /Users/emanuelesabetta/ai-maestro/package.json:69
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `tsx` (TypeScript executor) is listed in `dependencies` rather than `devDependencies`. Since `tsx` is used to run `server.mjs` in production (`yarn start` uses `tsx server.mjs`), this is actually correct for this project's architecture. However, it's unconventional -- `tsx` is typically a dev tool. This is a documented design decision per CLAUDE.md ("In headless mode `tsx server.mjs` must be used").
- **Evidence:**
  ```json
  "dependencies": {
    ...
    "tsx": "~4.21.0",
    ...
  }
  ```
- **Fix:** No action needed. The placement is intentional because the production server requires tsx to run TypeScript imports from `.mjs`. Document this in package.json comments if desired.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/types/agent.ts -- Well-structured, complete type definitions, proper deprecation markers, guard against empty input in parseSessionName
- /Users/emanuelesabetta/ai-maestro/types/governance-request.ts -- Clean type definitions, proper import of AgentRole, default constant provided
- /Users/emanuelesabetta/ai-maestro/types/host.ts -- Clean, well-documented interface with proper optional fields and deprecation notice
- /Users/emanuelesabetta/ai-maestro/types/plugin-builder.ts -- Clean tagged union types, well-structured interfaces
- /Users/emanuelesabetta/ai-maestro/types/session.ts -- Clean, properly typed
- /Users/emanuelesabetta/ai-maestro/scripts/bump-version.sh -- Robust: set -e, version format validation, regex escaping, portable sed, early exit on no-op
- /Users/emanuelesabetta/ai-maestro/scripts/start-with-ssh.sh -- Clean: set -e, SSH_AUTH_SOCK guard, tsx existence check before exec
- /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-register.sh -- Clean: proper input validation, auth flow, error handling for all HTTP status codes, chmod 600 on registration file
- /Users/emanuelesabetta/ai-maestro/plugins/amp-messaging/scripts/amp-send.sh -- Clean: validates priority/type/context, proper signing, handles both API and filesystem delivery
- /Users/emanuelesabetta/ai-maestro/version.json -- Clean, matches package.json version
- /Users/emanuelesabetta/ai-maestro/scripts/remote-install.sh -- Robust: OS detection, cleanup trap, partial install removal, portable sed

Note: `scripts/amp-inbox.sh`, `scripts/amp-register.sh`, `scripts/amp-send.sh` do not exist at those paths. The actual files are at `plugins/amp-messaging/scripts/amp-*.sh` and `plugin/plugins/ai-maestro/scripts/amp-*.sh`. The latter is a git submodule. I audited the `plugins/amp-messaging/scripts/` copies.

## Test Coverage Notes

- No test files were provided in this domain. The following code paths appear to lack test coverage:
  - `parseSessionName()`, `computeSessionName()`, `parseNameForDisplay()` in types/agent.ts -- pure functions ideal for unit tests
  - `assertValidServiceResult()` in types/service.ts -- should have tests for both valid and invalid states
  - PTY spawn retry logic in server.mjs (lines 877-933) -- complex branching with race conditions
  - Remote worker WebSocket proxy in server.mjs (lines 430-584) -- retry/reconnection logic

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A9-001, -002, ...
- [x] My report file uses the correct filename: epcp-correctness-P10-Rc7f26c53-A9.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (13 total)
- [x] My return message to the orchestrator is exactly 1-2 lines
