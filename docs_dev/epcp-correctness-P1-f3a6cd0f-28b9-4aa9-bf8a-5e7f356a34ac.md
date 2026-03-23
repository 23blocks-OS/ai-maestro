# Code Correctness Report: services-core

**Agent:** epcp-code-correctness-agent
**Domain:** services-core
**Files audited:** 4
**Date:** 2026-02-22T17:00:00Z

## MUST-FIX

### [CC-P1-A1-001] Command injection via tmux display-message in config-notification-service
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:107-110
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `sendTmuxNotification` function escapes double quotes but does not escape backticks, `$()`, or other shell metacharacters. The `sessionName` parameter and `message` (derived from user-controllable fields like `operation` and `targetName`) are interpolated into a shell command. An attacker who can set an agent name or operation string containing backticks or `$(...)` can achieve command injection.
- **Evidence:**
  ```typescript
  // line 107
  const escaped = truncated.replace(/"/g, '\\"')
  // line 110
  await execAsync(`tmux display-message -t "${sessionName}" "[GOVERNANCE] ${escaped}"`, { timeout: 5000 })
  ```
  If `sessionName` is `foo$(rm -rf /)`, the command becomes: `tmux display-message -t "foo$(rm -rf /)" "..."` -- the shell will execute the subcommand.
- **Fix:** Use `execFile` (which does not invoke a shell) instead of `exec`, passing arguments as an array. Alternatively, use the runtime abstraction that the rest of the codebase uses (e.g., `runtime.sendKeys`). If `exec` must be used, apply proper shell escaping to both `sessionName` and `escaped` (replace all `'` with `'\''` and wrap in single quotes, or use a library like `shell-escape`).

### [CC-P1-A1-002] `registerAgent` writes user-controlled `agentId` to filesystem without UUID validation
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:764-817
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In the WorkTree branch (line 764), `agentId` is derived from `sessionName` via regex replacement but is NOT validated as a UUID. The value is then used to construct a file path at line 816: `path.join(agentsDir, \`${agentId}.json\`)`. While the regex removes most special chars, it allows hyphens and alphanumeric chars, which could still enable path traversal on some edge-case systems. More critically, in the cloud agent branch (line 805), `agentId = body.id` is used directly with NO sanitization whatsoever, and this value is written to the filesystem at line 816-817. A malicious `body.id` like `../../etc/evil` would write to `~/.aimaestro/agents/../../etc/evil.json`.
- **Evidence:**
  ```typescript
  // line 764 (WorkTree branch)
  agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')
  // line 805 (Cloud branch)
  agentId = body.id  // No sanitization!
  // line 816
  const agentFilePath = path.join(agentsDir, `${agentId}.json`)
  fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
  ```
- **Fix:** Validate `agentId` as a UUID (using the same `UUID_PATTERN` regex used in `agents-skills-service.ts`) before using it in a file path. Also apply `path.basename()` as an additional safeguard.

## SHOULD-FIX

### [CC-P1-A1-003] `updateSkills` uses wrong governance operation type for removals
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:101
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `updateSkills` function performs a single governance check with operation `'add-skill'` at line 101, but the function also handles skill removals (body.remove) and AI Maestro config updates. When a caller only passes `body.remove`, the governance check still evaluates as `'add-skill'`, which is semantically incorrect. While both operations currently have the same RBAC logic (COS or MANAGER), this is a logic flaw that could cause incorrect behavior if different RBAC rules are added per operation type in the future.
- **Evidence:**
  ```typescript
  // line 101 -- always checks 'add-skill' even when removing
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'add-skill')
  ```
- **Fix:** Determine the correct operation type based on which fields are present in `body`. If `body.remove` is present and `body.add` is not, use `'remove-skill'`. If both are present, check both operations or use a combined operation type.

### [CC-P1-A1-004] `saveSkillSettings` uses `'update-hooks'` operation type instead of a skill-settings operation
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:292
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `saveSkillSettings` function uses `'update-hooks'` as its governance operation type, which is semantically wrong -- it's saving skill settings, not updating hooks. This means the audit trail and any operation-specific RBAC logic would be misleading.
- **Evidence:**
  ```typescript
  // line 292
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'update-hooks')
  ```
- **Fix:** Either add a dedicated operation type for skill settings (e.g., `'update-skill-settings'`), or use `'bulk-config'` which is a more general operation type.

### [CC-P1-A1-005] `deleteAgentById` auto-rejection only targets `configure-agent` requests, not other governance request types
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:720-721
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When an agent is deleted, the code auto-rejects pending governance requests but only those of type `'configure-agent'`. Other governance request types that reference the deleted agent (e.g., `'add-to-team'`, `'assign-cos'`, `'transfer-agent'`, `'create-agent'`) would remain pending indefinitely, even though the target agent no longer exists.
- **Evidence:**
  ```typescript
  // line 720-721
  const pendingForAgent = file.requests.filter((r: ...) =>
    r.type === 'configure-agent' && r.status === 'pending' && r.payload.agentId === id
  )
  ```
- **Fix:** Remove the `r.type === 'configure-agent'` filter (or expand it to include all governance request types), so that ALL pending requests targeting the deleted agent are auto-rejected.

### [CC-P1-A1-006] `deployConfigToAgent` uses agent's `workingDirectory` to resolve `.claude/` path without validating it exists
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:55-60
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The function resolves the `.claude/` directory from `agent.workingDirectory` or `agent.sessions?.[0]?.workingDirectory`, but does not validate that this directory actually exists on the filesystem before attempting to create files/directories inside it. If the workingDirectory points to a non-existent or stale path, the deployment will silently create the directory tree at an unexpected location.
- **Evidence:**
  ```typescript
  // lines 55-60
  const workingDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!workingDir) {
    return { error: `Agent '${agentId}' has no working directory configured`, status: 400 }
  }
  const claudeDir = path.join(workingDir, '.claude')
  ```
- **Fix:** Add a check that `workingDir` exists on the filesystem before proceeding with deployment. Return a 400 error if it doesn't exist.

### [CC-P1-A1-007] `deployBulkConfig` always uses `deployAddSkill` for skills, never `deployRemoveSkill`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:443-448
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `deployBulkConfig` function calls `deployAddSkill` when `config.skills` is present, but the original `config.operation` might be `'bulk-config'` with the intent to remove skills. There is no way for the bulk config to remove skills -- it always adds them. Similarly for plugins (line 450-455, always `deployAddPlugin`). This makes `bulk-config` asymmetric: it can add but never remove.
- **Evidence:**
  ```typescript
  // line 443-448
  if (config.skills && config.skills.length > 0) {
    const skillResult = await deployAddSkill(claudeDir, config, deployedBy)
    // ...
  }
  ```
- **Fix:** Add a mechanism to indicate add vs remove intent for each section in the bulk config payload (e.g., separate `skillsToAdd`/`skillsToRemove` fields, or inspect `config.operation`).

### [CC-P1-A1-008] `notifyConfigRequestOutcome` accesses `request.payload.configuration?.operation` but type shows `configuration` is optional
- **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:29
- **Severity:** SHOULD-FIX
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The function accesses `request.payload.configuration?.operation` with optional chaining, which means `operation` could be `undefined`. It falls back to the string `'configure'`. However, line 25 already checks `request.type !== 'configure-agent'` and returns early, so for `configure-agent` type requests, `configuration` should always be present. The logic is not wrong, but if `configuration` is somehow missing on a `configure-agent` request (corrupt data), the notification will use the generic fallback `'configure'`, which is misleading. The bigger concern: line 28 accesses `request.payload.agentId` without checking if `request.payload` exists at all (though the type guarantees it).
- **Evidence:**
  ```typescript
  // line 29
  const operation = request.payload.configuration?.operation || 'configure'
  ```
- **Fix:** This is acceptable as defensive coding, but consider logging a warning when `configuration` is missing for a `configure-agent` request, as it indicates data corruption.

### [CC-P1-A1-009] SSRF incomplete mitigation in `proxyHealthCheck` -- known hosts bypass private IP check
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1619-1643
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `proxyHealthCheck` function correctly blocks requests to private IPs (line 1619) and non-known hosts (line 1645). However, the check at line 1641 allows requests to private IPs if the host is "known" (in `hosts.json`). Since `hosts.json` is writable via the `/api/hosts` endpoints, an attacker who can modify `hosts.json` (e.g., via another API call) could add a private IP as a known host and then use `proxyHealthCheck` as an SSRF proxy. This is a defense-in-depth concern given that the app is localhost-only (Phase 1).
- **Evidence:**
  ```typescript
  // line 1641 -- private IPs allowed if in known hosts
  if (isPrivateIP && !isKnownHost) {
    return { error: 'URL target is not a known peer host', status: 403 }
  }
  ```
- **Fix:** Consider whether private IPs should ALWAYS be blocked in the health check proxy regardless of `hosts.json` configuration, or document this as an accepted risk for the localhost-only Phase 1 architecture.

## NIT

### [CC-P1-A1-010] `getStartupInfo` return type is `ServiceResult<any>`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1577
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The return type uses `any` instead of a properly typed interface, which defeats TypeScript's type checking for callers of this function.
- **Evidence:**
  ```typescript
  export function getStartupInfo(): ServiceResult<any> {
  ```
- **Fix:** Define a proper interface for the startup status data and use it instead of `any`.

### [CC-P1-A1-011] `proxyHealthCheck` return type is `ServiceResult<any>`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1594
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Same as above -- the return type uses `any`.
- **Evidence:**
  ```typescript
  export async function proxyHealthCheck(url: string): Promise<ServiceResult<any>> {
  ```
- **Fix:** Type the expected health check response shape.

### [CC-P1-A1-012] `RegisterAgentParams` uses `[key: string]: any` index signature
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:124
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `[key: string]: any` index signature on `RegisterAgentParams` defeats TypeScript's type narrowing for the entire interface. Any property access will be typed as `any`.
- **Evidence:**
  ```typescript
  export interface RegisterAgentParams {
    sessionName?: string
    workingDirectory?: string
    id?: string
    deployment?: { cloud?: { websocketUrl: string } }
    [key: string]: any // Allow additional fields for cloud config
  }
  ```
- **Fix:** Use a separate `cloudConfig?: Record<string, unknown>` field instead of an index signature.

### [CC-P1-A1-013] Dead code: memory settings check in `saveSkillSettings` does nothing
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:301-306
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The code checks if `settings.memory` is truthy and retrieves the subconscious, but does nothing with it besides logging. This appears to be a placeholder for future functionality that was never implemented.
- **Evidence:**
  ```typescript
  if ((settings as any).memory) {
    const subconscious = agent.getSubconscious()
    if (subconscious) {
      console.log(`[Skills Service] Updated memory settings for agent ${agentId.substring(0, 8)}`)
    }
  }
  ```
- **Fix:** Either implement the intended behavior (e.g., pass the new memory settings to the subconscious), or remove this dead code block.

### [CC-P1-A1-014] Inconsistent agent registry API usage: sync `getAgent` from `agent-registry` vs async `agentRegistry.getAgent` from `agent.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts:95 vs 251
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** The file uses two different agent lookup methods: the synchronous `getAgent` from `@/lib/agent-registry` (lines 95, 165, 212) and the async `agentRegistry.getAgent` from `@/lib/agent` (lines 251, 286). These are two different agent systems (file-based vs in-memory) that may return different results. Functions like `getSkillSettings` and `saveSkillSettings` use the async version, while `updateSkills`, `addSkill`, and `removeSkill` use the sync version.
- **Evidence:**
  ```typescript
  // line 95 (sync, file-based registry)
  const agent = getAgent(agentId)
  // line 251 (async, in-memory agent class)
  const agent = await agentRegistry.getAgent(agentId)
  ```
- **Fix:** Standardize on one agent lookup method within the file, or document why different methods are used for different functions.

### [CC-P1-A1-015] `agents-config-deploy-service.ts` does not validate `agentId` as UUID
- **File:** /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts:38-44
- **Severity:** NIT
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** Unlike `agents-skills-service.ts` (which validates UUID format at lines 246-248 and 281-283), the `deployConfigToAgent` function does not validate that `agentId` is a valid UUID. The `agentId` is not used directly in filesystem paths here (the `workingDirectory` from the registry is used instead), so this is lower severity. However, it's an inconsistency in input validation.
- **Evidence:**
  ```typescript
  export async function deployConfigToAgent(
    agentId: string,
    config: ConfigurationPayload,
    deployedBy?: string
  ): Promise<ServiceResult<ConfigDiff>> {
    const agent = getAgent(agentId)  // No UUID validation
  ```
- **Fix:** Add UUID validation consistent with other service files.

## CLEAN

Files with no issues found:
- (None -- all files had at least one finding)

## Test Coverage Notes

- No test files were found specifically for these four service files. All four services (`agents-skills-service.ts`, `agents-core-service.ts`, `agents-config-deploy-service.ts`, `config-notification-service.ts`) appear to lack dedicated unit test coverage.
- Key areas needing test coverage:
  - `checkConfigGovernance` RBAC logic in agents-skills-service (all branches)
  - `deployConfigToAgent` path traversal prevention
  - `registerAgent` cloud agent path with arbitrary `body.id`
  - `sendTmuxNotification` shell escaping
  - `deleteAgentById` auto-rejection of pending governance requests
  - `proxyHealthCheck` SSRF mitigations
  - `deployBulkConfig` partial failure handling (first sub-operation succeeds, second fails)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P1-A1-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P1-f3a6cd0f-28b9-4aa9-bf8a-5e7f356a34ac.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (noted that none were fully clean)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
