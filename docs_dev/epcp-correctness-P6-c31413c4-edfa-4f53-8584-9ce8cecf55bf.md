# Code Correctness Report: services

**Agent:** epcp-code-correctness-agent
**Domain:** services
**Files audited:** 31
**Date:** 2026-02-22T21:41:00Z

## MUST-FIX

### [CC-P6-A1-001] Command injection via shell interpolation in help-service.ts
- **File:** /Users/emanuelesabetta/ai-maestro/services/help-service.ts:160
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The launch command for the assistant agent uses `$(cat ${promptFile})` inside a string passed to `runtime.sendKeys` with `literal: true` and `enter: true`. While `promptFile` is constructed from `tmpdir()` (which is safe), the `SYSTEM_PROMPT` content is written to the file and then expanded via `$(cat ...)` shell command substitution. If the SYSTEM_PROMPT constant ever contains backticks, `$(...)`, or other shell metacharacters, they would be interpreted by the shell. Currently the SYSTEM_PROMPT is a hardcoded constant so this is not exploitable from user input, but the pattern is dangerous and fragile.

  More critically, the `sendKeys` with `literal: true` sends the string character-by-character to tmux. The `$(cat ${promptFile})` will be interpreted by the **shell running inside the tmux session**, not by tmux itself. If the prompt file content contains shell metacharacters, they will be executed.

- **Evidence:**
  ```typescript
  // Line 160
  const launchCmd = `claude --model ${ASSISTANT_MODEL} --tools ${ASSISTANT_TOOLS} --permission-mode bypassPermissions --system-prompt "$(cat ${promptFile})"`
  await runtime.sendKeys(ASSISTANT_NAME, launchCmd, { literal: true, enter: true })
  ```
- **Fix:** Use `--system-prompt-file` flag if the CLI supports it, or base64-encode the prompt and decode it in the command, or use `runtime.sendKeys` to first write an environment variable via `runtime.setEnvironment`, then reference that variable in the command. The current approach of shell command substitution inside sendKeys is fragile.

### [CC-P6-A1-002] SSRF in hosts-service checkRemoteHealth -- accepts arbitrary user-controlled URL
- **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:~460-535
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `checkRemoteHealth` function accepts a `hostUrl` string parameter and makes HTTP requests to it (via `makeHealthCheckRequest`, `fetchVersionInfo`, `fetchDockerInfo`). The URL comes from the API route which reads it from query parameters or request body. There is no validation that the URL points to a known host or uses an allowed scheme. An attacker with localhost access could use this endpoint to probe internal network services (SSRF).

  The `agents-transfer-service.ts` has proper SSRF protection at lines 1016-1037 (validates against known hosts from hosts.json). The `agents-docker-service.ts` has SSRF protection at lines 63-70. But `hosts-service.ts` lacks this.

- **Evidence:**
  ```typescript
  // hosts-service.ts ~line 460+
  export async function checkRemoteHealth(hostUrl: string): Promise<ServiceResult<any>> {
    // ... validates URL format only
    const parsedUrl = new URL(normalizedUrl)
    // ... no check against known hosts, no internal network blocking
    const result = await makeHealthCheckRequest(parsedUrl, 10000)
  ```
- **Fix:** Add the same internal network IP blocking used in `plugin-builder-service.ts:validateGitUrl` (blocks localhost, 127.0.0.1, 10.x, 192.168.x, 172.16-31.x, ::1, .local). Optionally also validate against known hosts from hosts.json.

### [CC-P6-A1-003] Hardcoded localhost URL in config-notification-service.ts bypasses host configuration
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:80
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `notifyGovernanceRequestOutcome` function hardcodes `http://localhost:23000` for the AMP send-message API call, instead of using `getSelfHost()` from `@/lib/hosts-config`. This will fail if AI Maestro is running on a different port, or if the URL configuration has changed. Other services correctly use `getSelfHost()` for self-referencing HTTP calls (e.g., `agents-docs-service.ts:264`).

- **Evidence:**
  ```typescript
  // Line 80
  const sendResponse = await fetch('http://localhost:23000/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
  ```
- **Fix:** Replace `'http://localhost:23000'` with `getSelfHost().url`:
  ```typescript
  import { getSelfHost } from '@/lib/hosts-config'
  // ...
  const selfHost = getSelfHost()
  const sendResponse = await fetch(`${selfHost.url}/api/messages`, {
  ```

### [CC-P6-A1-004] sessions-service.ts uses shell-based execAsync for Docker container discovery
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:275-276
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `fetchLocalSessions` function uses `execAsync` (which is `promisify(exec)` -- shell-based) to run Docker commands. While the command string is hardcoded and not user-controllable, using `exec` (shell) instead of `execFile` (no shell) is inconsistent with the security patterns elsewhere in the codebase. The same file correctly uses `execFileAsync` (no shell) for tmux commands at lines 320-321.

  The Docker command at line 275 includes shell features (`2>/dev/null`, `||`, pipe-like format strings) that require a shell. However, these features should be replaced with `execFileAsync` patterns for consistency.

- **Evidence:**
  ```typescript
  // Line 275
  const { stdout: dockerOutput } = await execAsync(
    "docker ps --filter 'name=aim-' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo ''"
  )
  ```
- **Fix:** Use `execFileAsync('docker', ['ps', '--filter', 'name=aim-', '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'])` wrapped in a try/catch instead of shell redirection and `|| echo ''`.

## SHOULD-FIX

### [CC-P6-A1-005] config-service.ts uses shell-based exec for PTY debug commands
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:515-524
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `getDebugPtyInfo` function uses `execSync` with shell commands (`sysctl`, `ls`, `lsof | awk | sort | uniq | head`). While these are all hardcoded strings with no user input, using `execSync` (shell-based) is inconsistent with the project's security patterns. The commands include shell pipe chains that legitimately need a shell, but the comment at line 514 acknowledges this: "Safe: fixed command strings with no user input; shell piping required for data processing".

- **Evidence:**
  ```typescript
  // Lines 515-524
  const limitOutput = execSync('sysctl -n kern.tty.ptmx_max 2>/dev/null || echo 511', { encoding: 'utf8' })
  const ptyCountOutput = execSync('ls /dev/ttys* 2>/dev/null | wc -l', { encoding: 'utf8' })
  const lsofOutput = execSync(
    "lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
    { encoding: 'utf8' }
  )
  ```
- **Fix:** The existing comment documents the justification. For additional hardening, consider wrapping in `execFileSync('/bin/sh', ['-c', ...])` to make the shell invocation explicit, or extract to a dedicated shell script.

### [CC-P6-A1-006] config-service.ts uses shell-based execAsync for Docker version check
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:578-580
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `getDockerInfo` function uses `execAsync("docker version --format '{{.Server.Version}}'")` which invokes a shell. While the command is hardcoded, `execFileAsync` should be used for consistency. The `--format` flag's Go template syntax doesn't require shell quoting when passed as a separate argument.

- **Evidence:**
  ```typescript
  // Line 578-580
  const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
    timeout: 5000,
  })
  ```
- **Fix:** Use `execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000 })`.

### [CC-P6-A1-007] agents-chat-service.ts reads entire JSONL files synchronously into memory
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts:92
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `getConversationMessages` function uses `fs.readFileSync` to read the entire JSONL conversation file into memory at once. Claude Code conversation files can grow to tens or hundreds of megabytes. This blocks the event loop during the synchronous read and could cause OOM for very large files. The function already has a `limit` parameter but reads the entire file before applying it.

- **Evidence:**
  ```typescript
  // Line 92
  const fileContent = fs.readFileSync(currentConversation.path, 'utf-8')
  const lines = fileContent.split('\n').filter(line => line.trim())
  ```
- **Fix:** Use a streaming approach with `readline` or `fs.createReadStream` to process lines incrementally, especially when `since` is set (skip early lines) or when only the last N messages are needed.

### [CC-P6-A1-008] messages-service.ts casts priority without validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:~160
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The messages service casts the `priority` parameter directly to a union type without validating it against the allowed values. If an invalid priority string is passed, it will be stored as-is, potentially causing display or sorting issues downstream.

- **Evidence:**
  ```typescript
  params.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined
  ```
- **Fix:** Validate against a whitelist before use:
  ```typescript
  const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
  const priority = VALID_PRIORITIES.includes(params.priority as any) ? params.priority : 'normal'
  ```

### [CC-P6-A1-009] agents-playback-service.ts has parseInt without radix for potential NaN
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts:~98
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** In the playback service, `sessionId` is parsed with `parseInt(sessionId, 10)` which is correct syntactically, but if `sessionId` is not a valid numeric string, `parseInt` returns `NaN`, and `NaN === anyNumber` is always false, so the check `agent.sessions?.some(s => s.index === parseInt(sessionId, 10))` would silently fail. This is a Phase 5 placeholder service so impact is low.

- **Evidence:**
  ```typescript
  agent.sessions?.some(s => s.index === parseInt(sessionId, 10))
  ```
- **Fix:** Validate sessionId is numeric before parsing, or use `Number(sessionId)` with an explicit `isNaN` check.

### [CC-P6-A1-010] sessions-service.ts cloud agent rename has non-atomic file operation
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:730-735
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** The `renameSession` function for cloud agents writes the new agent file, then deletes the old one. If the process crashes between these two operations, both files will exist. Additionally, the agent config is read, modified in-memory (id, name, alias all set to newName), and written -- but `id` should be a UUID, not a human name.

- **Evidence:**
  ```typescript
  // Lines 730-735
  const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
  agentConfig.id = newName    // <-- setting id to the name, not a UUID
  agentConfig.name = newName
  agentConfig.alias = newName
  fs.writeFileSync(newAgentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
  fs.unlinkSync(oldAgentFilePath)
  ```
- **Fix:** (1) Use atomic write pattern: write to temp file, then rename. (2) Do not overwrite `agentConfig.id` with the new name -- the UUID should remain stable.

### [CC-P6-A1-011] agents-docs-service.ts background indexing does not validate agentId in URL
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:267
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** LIKELY
- **Description:** The `triggerBackgroundDocsDeltaIndexing` function constructs a URL with `agentId` interpolated directly: `` `${selfHost.url}/api/agents/${agentId}/docs` ``. The `agentId` parameter comes from `queryDocs` which receives it from the API route. If agentId contains URL-special characters (e.g., `../`), it could potentially alter the URL path. However, the agent is looked up via `agentRegistry.getAgent(agentId)` before this function is called, which likely rejects invalid IDs.

- **Evidence:**
  ```typescript
  // Line 267
  const response = await fetch(`${selfHost.url}/api/agents/${agentId}/docs`, {
  ```
- **Fix:** Add `encodeURIComponent(agentId)` or validate agentId format before URL construction.

### [CC-P6-A1-012] amp-service.ts uses non-null assertions on auth.agentId without prior check
- **File:** /Users/emanuelesabetta/ai-maestro/services/amp-service.ts:1173, 1206, 1249, 1377, 1417, 1445, 1469
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple functions in amp-service.ts use `auth.agentId!` (non-null assertion) after checking `auth.authenticated`. While `authenticated === true` likely implies `agentId` is set, the TypeScript type system doesn't guarantee this. If `authenticateRequest` has a bug that returns `authenticated: true` without setting `agentId`, these would all throw at runtime.

- **Evidence:**
  ```typescript
  // Line 1173
  const result = getPendingMessages(auth.agentId!, effectiveLimit)
  // Line 1206
  const acknowledged = acknowledgeMessage(auth.agentId!, messageId)
  // Line 1377
  const agent = getAgent(auth.agentId!)
  ```
- **Fix:** Either (a) refine the return type of `authenticateRequest` to use a discriminated union where `authenticated: true` guarantees `agentId: string`, or (b) add explicit null checks before each use.

## NIT

### [CC-P6-A1-013] agents-graph-service.ts has excessive use of `any` type
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts:multiple
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The graph service uses `let result: any = {}` at the top of query functions and `(r: any[])` for CozoDB row mappings. This is a pragmatic choice since CozoDB returns untyped rows, but it eliminates all type-safety guarantees within the function body.

- **Evidence:**
  ```typescript
  let result: any = {}
  // and
  const componentsResult = await agentDb.run(...)
  result = componentsResult.rows.map((r: any[]) => ({ name: r[0], file: r[1] }))
  ```
- **Fix:** Consider defining typed interfaces for each query result shape, or at minimum use `Record<string, unknown>` instead of `any` for the outer result.

### [CC-P6-A1-014] shared-state-bridge.mjs uses magic number 1 for WebSocket.OPEN
- **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:44
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The ESM bridge uses `ws.readyState === 1` with a comment `// WebSocket.OPEN`, while the TypeScript counterpart (`shared-state.ts:101`) correctly uses the named constant `WS_OPEN = 1`. The ESM file should define the same constant for consistency.

- **Evidence:**
  ```javascript
  // shared-state-bridge.mjs:44
  if (ws.readyState === 1) { // WebSocket.OPEN
  ```
- **Fix:** Add `const WS_OPEN = 1` at the top of the file and use it.

### [CC-P6-A1-015] agents-core-service.ts sessionName-derived agentId not UUID-validated
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:~812
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When creating an agent from a session (without an explicit body.id), the agentId is derived from the session name via sanitization (`sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')`). This produces a non-UUID identifier. The code does use `path.basename(agentId)` at line 823 for path traversal prevention, but the agent registry may expect UUIDs in some code paths.

- **Evidence:**
  ```typescript
  // ~Line 766
  agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')
  // vs Line 812 (when body.id is provided)
  if (!isValidUuid(body.id)) { return { error: 'Invalid agent ID format', status: 400 } }
  ```
- **Fix:** Consider generating a proper UUID for session-derived agents instead of using the sanitized session name as the ID.

### [CC-P6-A1-016] webhooks-service.ts createNewWebhook does not validate URL scheme
- **File:** /Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts:89-93
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The webhook creation validates URL format with `new URL(body.url)` but does not restrict the scheme. A webhook URL with `file://`, `javascript:`, or `data:` scheme would pass validation. While `fetch` would reject non-HTTP schemes, it's better to validate explicitly.

- **Evidence:**
  ```typescript
  // Lines 89-93
  try {
    new URL(body.url)
  } catch {
    return { error: 'Invalid URL format', status: 400 }
  }
  ```
- **Fix:** Add scheme validation: `if (!body.url.startsWith('http://') && !body.url.startsWith('https://')) { return { error: 'Only HTTP/HTTPS URLs allowed', status: 400 } }`

### [CC-P6-A1-017] Inconsistent error handling in sessions-service.ts renameSession for cloud agents
- **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:720-738
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The cloud agent rename path at lines 720-738 checks for existing agent files to detect cloud agents, but does not validate the `oldName` or `newName` against path traversal. While the session name regex check at line 716 (`/^[a-zA-Z0-9_-]+$/.test(newName)`) prevents dangerous characters in `newName`, `oldName` is not similarly validated in this code path (it comes from the URL path parameter).

- **Evidence:**
  ```typescript
  // Lines 721-723 - oldName used directly in path construction
  const oldAgentFilePath = path.join(agentsDir, `${oldName}.json`)
  const newAgentFilePath = path.join(agentsDir, `${newName}.json`)
  const isCloudAgent = fs.existsSync(oldAgentFilePath)
  ```
- **Fix:** Validate `oldName` with the same regex check used for `newName`: `if (!/^[a-zA-Z0-9_-]+$/.test(oldName)) return { error: 'Invalid session name', status: 400 }`.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts -- Good path traversal protection, UUID validation, atomic writes. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-directory-service.ts -- Clean, simple service with proper error handling. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts -- Good SSRF protection, shell injection prevention via execFileAsync, volume mount validation. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-memory-service.ts -- Good error handling, proper async patterns. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-messaging-service.ts -- Good timeout handling, proper email normalization. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-repos-service.ts -- Good path validation, uses execFileSync throughout. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts -- Good governance RBAC, skill name validation, UUID validation. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-subconscious-service.ts -- Clean, simple service. No issues.
- /Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts -- Good Zip Slip protection, SSRF validation against known hosts, execFileSync. No issues.
- /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts -- Good TOCTOU protection, host signature verification, forces pending status on received requests. No issues.
- /Users/emanuelesabetta/ai-maestro/services/domains-service.ts -- Clean UUID validation, proper error codes. No issues.
- /Users/emanuelesabetta/ai-maestro/services/governance-service.ts -- Good rate limiting, password validation, UUID validation throughout. No issues.
- /Users/emanuelesabetta/ai-maestro/services/headless-router.ts -- Good body size limits, double-resolve prevention. No issues.
- /Users/emanuelesabetta/ai-maestro/services/marketplace-service.ts -- Clean, simple service. No issues.
- /Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts -- Excellent security: SSRF protection, path traversal prevention, concurrency guards, symlink skipping. No issues.
- /Users/emanuelesabetta/ai-maestro/services/shared-state.ts -- Clean shared state pattern with proper WS_OPEN constant. No issues.
- /Users/emanuelesabetta/ai-maestro/services/teams-service.ts -- Good governance ACL, circular dependency detection, control character stripping. No issues.

## Test Coverage Notes

The following new/modified code paths appear to lack dedicated test coverage (tests may exist in another domain -- flagging for awareness):
- `checkConfigGovernance()` in agents-skills-service.ts -- RBAC logic for local/user/project scope
- `triggerBackgroundDocsDeltaIndexing()` in agents-docs-service.ts -- re-entrancy guard logic
- `checkRemoteHealth()` in hosts-service.ts -- URL validation and SSRF prevention
- `createAssistantAgent()` in help-service.ts -- assistant lifecycle management
- `renameSession()` cloud agent path in sessions-service.ts -- non-atomic file operations
- `broadcastStatusUpdate()` in shared-state.ts -- WebSocket broadcast with readyState check

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference (or noted "missing code" for absence findings)
- [x] For each finding, I included the actual code snippet as evidence (or described what is expected but absent)
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P6-A1-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P6-c31413c4-edfa-4f53-8584-9ce8cecf55bf.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output, full details in report file only)
