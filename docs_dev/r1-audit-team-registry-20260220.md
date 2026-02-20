# Code Correctness Report: team-registry

**Agent:** epcp-code-correctness-agent
**Domain:** lib/team-registry.ts (+ supporting files: types/team.ts, types/governance.ts, lib/file-lock.ts, services/teams-service.ts, api routes)
**Files audited:** 7
**Date:** 2026-02-20T00:00:00Z

## Verification of Requested Fixes

### G5 Auto-Downgrade (validateTeamMutation sets sanitized.type, createTeam applies it)
**Status: CONFIRMED WORKING**

Traced end-to-end:
1. `validateTeamMutation` line 130-132: When `effectiveType === 'closed' && !effectiveCOS`, sets `sanitized.type = 'open'` and updates `effectiveType = 'open'`
2. `createTeam` line 282: `(result.sanitized.type as TeamType) ?? data.type ?? 'open'` correctly picks up sanitized value first
3. The `effectiveType` update at line 132 ensures the multi-closed-team check (line 168) uses the downgraded type, preventing false rejections

### G4 COS Exemption in BOTH createTeam and updateTeam
**Status: CONFIRMED WORKING**

- `createTeam` line 298: `if (agentId === team.chiefOfStaffId) continue` -- present and correct
- `updateTeam` line 360: `if (agentId === updatedTeam.chiefOfStaffId) continue` -- present and correct
- Both also exempt MANAGER (lines 296, 358)

### effectiveType changed from const to let
**Status: CONFIRMED WORKING**

Line 124: `let effectiveType = ...` -- correctly declared as `let`
Line 132: `effectiveType = 'open'` -- correctly updated after G5 auto-downgrade
This prevents false multi-closed-team rejections when G5 downgrades a team from closed to open.

### Atomic Writes in saveTeams()
**Status: CONFIRMED WORKING WITH MINOR ISSUE (see CC-003)**

Lines 246-248: temp-file-then-rename pattern correctly implemented.
Error handling catches both writeFileSync and renameSync failures.
Minor: orphaned .tmp file on renameSync failure (self-healing on next save -- acceptable).

### Single Save in createTeam G4 Block
**Status: CONFIRMED WORKING**

Line 311: Single `saveTeams(teams)` call after both team creation AND G4 open-team revocations.
The old double-save was consolidated correctly.

## MUST-FIX

### [CC-001] saveTeams() return value never checked -- silent data loss on write failure
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:311, 348, 370
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `saveTeams()` returns `false` on failure, but `createTeam()` (line 311), `updateTeam()` (lines 348, 370), and `deleteTeam()` (line 383) never check the return value. If a file write fails (disk full, permissions, etc.), the function returns a team object as if the operation succeeded, but data was never persisted. The caller and API client believe the operation worked.
- **Evidence:**
  ```typescript
  // line 311 in createTeam:
  saveTeams(teams)  // return value ignored
  return team       // returns as if successful

  // line 348 in updateTeam:
  saveTeams(teams)  // return value ignored

  // line 383 in deleteTeam:
  saveTeams(filtered)  // return value ignored
  return true          // returns as if successful
  ```
- **Fix:** Either (a) make `saveTeams` throw on failure instead of returning false, or (b) check the return value and throw `TeamValidationException` or a new `TeamPersistenceException` on failure. Option (a) is simpler and consistent with a fail-fast approach:
  ```typescript
  export function saveTeams(teams: Team[]): void {
    ensureTeamsDir()
    const file: TeamsFile = { version: 1, teams }
    const tmpFile = TEAMS_FILE + '.tmp'
    fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
    fs.renameSync(tmpFile, TEAMS_FILE)
    // Let exceptions propagate -- callers are inside withLock try/catch
  }
  ```

## SHOULD-FIX

### [CC-002] updateTeam has double-save (inconsistency window between saves)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:348, 370
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** Unlike `createTeam` which was consolidated to a single save, `updateTeam` still has TWO save calls: line 348 (after applying updates) and line 370 (after G4 open-team revocations). Between these two saves, the on-disk state is inconsistent: the team is marked closed but agents haven't been removed from open teams yet. A crash between the two saves would leave this inconsistent state permanently. An external process (or another Node process in a multi-process deployment) reading the file between saves would see inconsistent data.
- **Evidence:**
  ```typescript
  // line 348 - first save: team updated but G4 revocations not yet applied
  saveTeams(teams)

  // lines 352-370 - G4 revocations applied, then second save
  const updatedTeam = teams[index]
  if (updatedTeam.type === 'closed' && updates.agentIds) {
    // ... mutates teams array in place ...
    if (openTeamsChanged) saveTeams(teams)  // line 370 - second save
  }
  ```
- **Fix:** Move the G4 revocation logic BEFORE the first save, then do a single save (same pattern as createTeam):
  ```typescript
  // Apply G4 revocations to teams array
  if (teams[index].type === 'closed' && updates.agentIds) {
    // ... revocation logic ...
  }
  // Single save: includes both team update + G4 revocations
  saveTeams(teams)
  return teams[index]
  ```

### [CC-003] loadTeams() migration writes outside of file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:229-232
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** LIKELY
- **Description:** `loadTeams()` is called both inside locks (`createTeam`, `updateTeam`, `deleteTeam`) and outside locks (`getTeam` at line 257). The migration at lines 229-232 calls `saveTeams()` which could race with a locked write operation from another async context. The comment claims idempotency makes this safe ("both produce the same result"), which is true for the migration itself. However, the unlocked `saveTeams` could overwrite a concurrent locked write that includes non-migration changes (e.g., a team create in progress).
- **Evidence:**
  ```typescript
  // getTeam (line 257) -- no lock:
  export function getTeam(id: string): Team | null {
    const teams = loadTeams()  // could trigger migration save
    return teams.find(t => t.id === id) || null
  }

  // loadTeams migration (line 229-232) -- no lock:
  if (needsSave && !migrationDone) {
    migrationDone = true
    saveTeams(teams)  // could race with locked createTeam/updateTeam
  }
  ```
- **Fix:** The `migrationDone` flag mitigates this for repeat calls, but the FIRST call through `getTeam` could still race. Either: (a) have `getTeam` acquire the lock, or (b) run migration on startup before any API requests, or (c) accept the risk with a comment explaining it only happens once per process. Option (c) is pragmatically acceptable since the migration only adds default 'open' type values and the window is extremely small (first request only).

### [CC-004] deleteTeamById reads team outside lock, then deletes inside lock (TOCTOU)
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:244-267
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `deleteTeamById` calls `getTeam(id)` at line 244 (outside any lock) to check existence and do governance checks, then calls `deleteTeam(id)` at line 267 (which acquires the 'teams' lock). Between these calls, the team could be modified by another request (e.g., type changed from closed to open, or COS changed), which would invalidate the governance check done on stale data.
- **Evidence:**
  ```typescript
  export async function deleteTeamById(id: string, requestingAgentId?: string) {
    const team = getTeam(id)  // line 244 -- READ outside lock
    if (!team) { return ... }

    // Governance checks on potentially stale 'team' object
    if (team.type === 'closed') {
      if (requestingAgentId !== managerId && team.chiefOfStaffId !== requestingAgentId) {
        return { error: 'Only MANAGER or the team Chief-of-Staff can delete a closed team', status: 403 }
      }
    }

    const deleted = await deleteTeam(id)  // line 267 -- WRITE inside lock (team may have changed)
  }
  ```
- **Fix:** Move the governance check inside `deleteTeam` (or create a `deleteTeamWithGovernance` that does the check inside the lock), or have `deleteTeam` accept governance parameters and validate inside the lock.

## NIT

### [CC-005] Redundant type validation in teams-service.ts
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:143-145
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `createNewTeam` validates `params.type` at lines 143-145, but `validateTeamMutation` (called inside `createTeam`) already validates this at lines 116-120 of team-registry.ts with the same check and a more detailed error message. The service-level check is redundant but harmless.
- **Evidence:**
  ```typescript
  // teams-service.ts:143-145
  if (params.type && params.type !== 'open' && params.type !== 'closed') {
    return { error: 'type must be "open" or "closed"', status: 400 }
  }

  // team-registry.ts:116-120
  if (data.type !== undefined) {
    if (data.type !== 'open' && data.type !== 'closed') {
      return { valid: false, error: `Invalid team type: "${data.type}" (must be "open" or "closed")`, code: 400 }
    }
  }
  ```
- **Fix:** Remove the service-level check since the registry validates comprehensively. Or keep it as defense-in-depth with a comment.

### [CC-006] `any` type used in ServiceResult generics
- **File:** /Users/emanuelesabetta/ai-maestro/services/teams-service.ts:121, 131, 171, 197, etc.
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Multiple service functions use `ServiceResult<{ teams: any[] }>`, `ServiceResult<{ team: any }>` instead of proper types like `ServiceResult<{ teams: Team[] }>`. This eliminates type checking on the returned data.
- **Evidence:**
  ```typescript
  export function listAllTeams(): ServiceResult<{ teams: any[] }> { ... }
  export async function createNewTeam(params: ...): Promise<ServiceResult<{ team: any }>> { ... }
  export function getTeamById(id: string, ...): ServiceResult<{ team: any }> { ... }
  ```
- **Fix:** Replace `any` with proper types: `Team`, `Team[]`, etc.

### [CC-007] chiefOfStaffId type mismatch in createTeam team construction
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:283-285
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** The `chiefOfStaffId` assignment uses a ternary that produces `string | undefined`, but the Team type declares `chiefOfStaffId?: string | null`. When `result.sanitized.chiefOfStaffId` is undefined and `data.chiefOfStaffId` is also undefined, the field is set to `undefined`. TypeScript allows this (optional field), but the intent is clearly to use `null` for "no COS." The inconsistency between `null` and `undefined` for "no COS" could cause subtle bugs in downstream code that checks `team.chiefOfStaffId === null` vs `team.chiefOfStaffId === undefined`.
- **Evidence:**
  ```typescript
  chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
    ? (result.sanitized.chiefOfStaffId as string | undefined)
    : data.chiefOfStaffId,
  ```
- **Fix:** Normalize to `null` when no COS:
  ```typescript
  chiefOfStaffId: result.sanitized.chiefOfStaffId !== undefined
    ? (result.sanitized.chiefOfStaffId as string | null)
    : (data.chiefOfStaffId ?? null),
  ```

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/types/team.ts -- No issues (well-typed, complete interface)
- /Users/emanuelesabetta/ai-maestro/types/governance.ts -- No issues (clean type definitions)
- /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts -- No issues (correct in-process mutex, proper queue management, lock ordering documented)
- /Users/emanuelesabetta/ai-maestro/app/api/teams/[id]/chief-of-staff/route.ts -- No issues (rate limiting, UUID validation, proper error handling)
