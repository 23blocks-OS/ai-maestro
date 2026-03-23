# EPCP Fixes Done - Pass 1 - Domain: services-core

**Generated:** 2026-02-22
**Pass:** 1
**Files Modified:** 4

---

## Fixes Applied

### MF-001 - DONE
**File:** `services/config-notification-service.ts`
**Fix:** Replaced `exec` (shell-based) with `execFile` (no shell) in `sendTmuxNotification`. Arguments are now passed as an array, eliminating command injection risk via `sessionName` or `message`. Removed the now-unnecessary `escaped` variable since `execFile` passes arguments directly without shell interpretation.

### MF-002 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Added `isValidUuid` import from `@/lib/validation`. In `registerAgent`, added UUID validation for cloud agent IDs (`body.id` path). Used `path.basename(agentId)` when constructing the agent config file path as defense-in-depth against directory traversal.

### SF-004 - DONE
**File:** `services/agents-skills-service.ts`
**Fix:** `updateSkills` now dynamically selects the governance operation type based on which fields are present in the request body: `'remove-skill'` when only `body.remove` is set, `'bulk-config'` when both `body.add` and `body.remove` are set, `'add-skill'` otherwise.

### SF-005 - DONE
**File:** `services/agents-skills-service.ts`
**Fix:** Changed `saveSkillSettings` governance operation from `'update-hooks'` to `'bulk-config'`, which is a more general-purpose operation type that correctly represents skill settings changes.

### SF-006 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Removed the `r.type === 'configure-agent'` filter from `deleteAgentById` auto-rejection logic. Now auto-rejects ALL pending governance requests where `r.payload.agentId === id`, regardless of request type. Updated log message accordingly.

### SF-007 - DONE
**File:** `services/agents-config-deploy-service.ts`
**Fix:** Added `await fs.access(workingDir)` check in `deployConfigToAgent` after resolving the working directory. Returns 400 with descriptive error if directory does not exist on disk.

### SF-008 - DONE
**File:** `services/agents-config-deploy-service.ts`
**Fix:** Added comment documenting the limitation that `deployBulkConfig` always adds (not removes) skills/plugins. To remove, use the specific remove operations.

### SF-009 - DONE
**File:** `services/config-notification-service.ts`
**Fix:** Added `console.warn` when a `configure-agent` request is missing the `configuration` field in its payload, indicating possible data corruption.

### SF-010 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Added comment documenting the SSRF accepted risk for Phase 1 localhost-only architecture. The `hosts.json` being writable via `/api/hosts` means a compromised host entry could act as SSRF proxy. Phase 2 should add private IP blocking regardless of hosts.json.

### NT-004 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Defined `StartupInfo` interface with typed fields (`success`, `discoveredAgents`, `activeAgents`, `agents` array) and replaced `ServiceResult<any>` with `ServiceResult<StartupInfo>` on `getStartupInfo`.

### NT-005 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Defined `HealthCheckResult` interface (open record since shape comes from remote agent) and replaced `ServiceResult<any>` with `ServiceResult<HealthCheckResult>` on `proxyHealthCheck`.

### NT-006 - DONE
**File:** `services/agents-core-service.ts`
**Fix:** Replaced `[key: string]: any` index signature on `RegisterAgentParams` with explicit `cloudConfig?: Record<string, unknown>` field.

### NT-007 - DONE
**File:** `services/agents-skills-service.ts`
**Fix:** Removed dead code block in `saveSkillSettings` that checked `settings.memory` and logged but did nothing useful (the subconscious reference was fetched but never acted upon).

### NT-008 - DONE
**File:** `services/agents-skills-service.ts`
**Fix:** Added comments explaining the two different agent lookup patterns: `getAgent` (sync, file-based registry) for RBAC/governance checks vs `agentRegistry.getAgent` (async, in-memory) for runtime operations.

### NT-009 - DONE
**File:** `services/agents-config-deploy-service.ts`
**Fix:** Added `isValidUuid(agentId)` validation at the start of `deployConfigToAgent`, returning 400 if invalid. Imported `isValidUuid` from `@/lib/validation`.

---

## Summary

| Severity | Fixed | Total |
|----------|-------|-------|
| MUST-FIX | 2 | 2 |
| SHOULD-FIX | 7 | 7 |
| NIT | 6 | 6 |
| **Total** | **15** | **15** |

All 15 findings in the services-core domain have been fixed.
