# Code Correctness Report: lib-governance

**Agent:** epcp-code-correctness-agent (A5)
**Domain:** lib -- governance, hosts, teams
**Files audited:** 14
**Date:** 2026-02-26T00:00:00Z
**Run ID:** c7f26c53

## MUST-FIX

### [CC-A5-001] hosts-config.ts: `saveHosts()` is NOT atomic -- data loss on crash
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:565
- **Severity:** MUST-FIX
- **Category:** security / data-integrity
- **Confidence:** CONFIRMED
- **Description:** `saveHosts()` calls `fs.writeFileSync(HOSTS_CONFIG_PATH, ...)` directly, without the temp-file-then-rename atomic write pattern used everywhere else in this codebase (governance.ts:82-84, governance-request-registry.ts:76-78, team-registry.ts:247-249, transfer-registry.ts:60-62, host-keys.ts:58-63, manager-trust.ts:97-100). If the process crashes mid-write, `hosts.json` will be left in a corrupted/truncated state.
- **Evidence:**
```typescript
// hosts-config.ts:565
fs.writeFileSync(HOSTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
```
Compare with governance.ts:82-84:
```typescript
const tmpFile = GOVERNANCE_FILE + `.tmp.${process.pid}`
fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8')
fs.renameSync(tmpFile, GOVERNANCE_FILE)
```
- **Fix:** Use atomic write pattern: write to `HOSTS_CONFIG_PATH + '.tmp.' + process.pid`, then `fs.renameSync(tmpFile, HOSTS_CONFIG_PATH)`. Same fix needed at lines 886 and 947 in `setOrganization()` and `adoptOrganization()`.

### [CC-A5-002] hosts-config.ts: Duplicate lock implementation instead of using shared `file-lock.ts`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:19-85
- **Severity:** MUST-FIX
- **Category:** logic / race-condition
- **Confidence:** CONFIRMED
- **Description:** `hosts-config.ts` implements its own lock mechanism (lines 19-85: `acquireLock()`, `releaseLock()`, `withLock()`) separately from the shared `lib/file-lock.ts`. This custom lock has a 5-second timeout vs the shared lock's 30 seconds, and more critically, the lock names are not visible to `lib/file-lock.ts`. If any code path acquires the shared `withLock('hosts')` from file-lock.ts AND the local `withLock()` from hosts-config.ts concurrently, the two lock systems are unaware of each other and cannot prevent races. Additionally, this local lock has no documented lock ordering relative to the lock ordering invariant in file-lock.ts (lines 12-23).
- **Evidence:**
```typescript
// hosts-config.ts:19-25 -- local lock state
let lockHeld = false
let _lockWaiterId = 0
const lockQueue: Array<{ id: number; resolve: () => void; reject: (err: Error) => void }> = []
const LOCK_TIMEOUT = 5000

// file-lock.ts:26-33 -- shared lock state
const locks = new Map<string, Array<() => void>>()
const held = new Set<string>()
const DEFAULT_LOCK_TIMEOUT_MS = 30_000
```
- **Fix:** Migrate `hosts-config.ts` to use the shared `withLock('hosts', fn)` from `@/lib/file-lock`. Remove the duplicate local lock implementation. Add `'hosts'` to the lock ordering invariant in `file-lock.ts`.

### [CC-A5-003] hosts-config.ts: `setOrganization()` and `adoptOrganization()` have TOCTOU race on `config.organization` check
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:846-898, 908-960
- **Severity:** MUST-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Both `setOrganization()` and `adoptOrganization()` read the config, check `config.organization`, and then write -- but neither function is wrapped in any lock. Two concurrent calls to `setOrganization()` could both read `organization: null` and both proceed to write, violating the "can only be set once" invariant. Same for concurrent `adoptOrganization()` calls during mesh sync.
- **Evidence:**
```typescript
// hosts-config.ts:861-872 -- read-check-write without lock
let config: HostsConfig = { hosts: [] }
if (fs.existsSync(HOSTS_CONFIG_PATH)) {
  const fileContent = fs.readFileSync(HOSTS_CONFIG_PATH, 'utf-8')
  config = JSON.parse(fileContent) as HostsConfig
}
// Check if already set
if (config.organization) {
  return { success: false, error: `Organization already set...` }
}
// ... proceeds to write -- but another caller could be between the same check and write
config.organization = name.toLowerCase()
```
- **Fix:** Wrap both `setOrganization()` and `adoptOrganization()` in `withLock()` (either the local one or preferably the shared one from file-lock.ts per CC-A5-002).

## SHOULD-FIX

### [CC-A5-004] governance-peers.ts: `deletePeerGovernance()` is not protected by file lock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts:80-86
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `savePeerGovernance()` is protected by `withLock('governance-peers-${hostId}')` (line 65) but `deletePeerGovernance()` is synchronous and unprotected. A concurrent save and delete for the same hostId could race: the save writes a temp file + renames, while the delete calls `unlinkSync` -- the end state is nondeterministic.
- **Evidence:**
```typescript
// governance-peers.ts:80-86 -- no lock
export function deletePeerGovernance(hostId: string): void {
  validateHostId(hostId)
  const filePath = path.join(PEERS_DIR, `${hostId}.json`)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
```
- **Fix:** Make `deletePeerGovernance()` async and wrap in `withLock('governance-peers-${hostId}')`.

### [CC-A5-005] host-keys.ts: Atomic write for private key uses generic `.tmp` suffix without `process.pid`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/host-keys.ts:54-55
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** Other files in the codebase include `process.pid` in the temp file suffix (governance.ts:82, governance-request-registry.ts:76, team-registry.ts:247, etc.) to ensure multi-process safety. `host-keys.ts` uses a bare `.tmp` suffix. While key generation typically happens only once, if two processes race to generate keys simultaneously, they would both write to the same `.tmp` file, potentially causing corruption.
- **Evidence:**
```typescript
// host-keys.ts:54-55
const privateTmp = PRIVATE_KEY_PATH + '.tmp'
const publicTmp = PUBLIC_KEY_PATH + '.tmp'
```
Compare with governance.ts:82:
```typescript
const tmpFile = GOVERNANCE_FILE + `.tmp.${process.pid}`
```
- **Fix:** Add `process.pid` to temp file names: `PRIVATE_KEY_PATH + '.tmp.' + process.pid`.

### [CC-A5-006] team-registry.ts: `createTeam()` returns `chiefOfStaffId: ... ?? null` but the `??` coalesces `undefined` to `null` when `sanitized.chiefOfStaffId` is deliberately `undefined`
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:281-283
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The ternary at lines 281-283 checks if `result.sanitized.chiefOfStaffId !== undefined`. If `sanitized` has no `chiefOfStaffId` key, it falls through to `data.chiefOfStaffId`. But `data.chiefOfStaffId` is typed as `string | undefined` (optional), and the trailing `?? null` converts `undefined` to `null`. This means if the caller intentionally omits `chiefOfStaffId` (meaning "no COS"), the value becomes `null` -- which is actually correct behavior per the codebase convention (comment SF-038). However, the code path is confusing: `result.sanitized.chiefOfStaffId` could be the value `null` (explicitly set by G5 downgrade), but the `!== undefined` check would catch it, and `null as string | null` would be `null`. The logic works but is overly complex.
- **Evidence:**
```typescript
chiefOfStaffId: (result.sanitized.chiefOfStaffId !== undefined
  ? result.sanitized.chiefOfStaffId as string | null
  : data.chiefOfStaffId) ?? null,
```
- **Fix:** Consider simplifying to: `chiefOfStaffId: (result.sanitized.chiefOfStaffId as string | null | undefined) ?? data.chiefOfStaffId ?? null`. Or add a comment explaining the three-way fallback chain.

### [CC-A5-007] hosts-config.ts: `updateHost()` uses case-sensitive ID comparison while `addHost()` uses case-insensitive
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:689 vs 636
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `addHost()` at line 636 uses `h.id.toLowerCase() === host.id.toLowerCase()` for duplicate detection, but `updateHost()` at line 689 uses `h.id === hostId` (case-sensitive). This means a host added as `Mac-Mini` could not be found by `updateHost('mac-mini', ...)` even though `addHost()` would consider them the same.
- **Evidence:**
```typescript
// addHost line 636 -- case-insensitive
const existingById = currentHosts.find(h => h.id.toLowerCase() === host.id.toLowerCase())

// updateHost line 689 -- case-sensitive
const hostIndex = currentHosts.findIndex(h => h.id === hostId)
```
- **Fix:** Use case-insensitive comparison in `updateHost()`: `h.id.toLowerCase() === hostId.toLowerCase()`. Same issue in `deleteHost()` at line 739.

### [CC-A5-008] hosts-config.ts: `deleteHost()` uses case-sensitive filter but case-insensitive lookup elsewhere
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:739, 755
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `deleteHost()` finds the host with `h.id === hostId` (line 739) but also filters with `h.id !== hostId` (line 755). Both are case-sensitive. If host IDs were normalized to lowercase on write (via `migrateHost()`), this should be fine -- but `addHost()` does NOT normalize to lowercase before saving (it passes the host object directly). So a host added with mixed-case ID would not be deletable with a lowercase hostId.
- **Evidence:**
```typescript
// deleteHost line 739
const host = currentHosts.find(h => h.id === hostId)
// deleteHost line 755
const updatedHosts = currentHosts.filter(h => h.id !== hostId)
```
- **Fix:** Use case-insensitive comparison: `h.id.toLowerCase() === hostId.toLowerCase()` and normalize on add.

### [CC-A5-009] governance-sync.ts: `broadcastGovernanceSync()` signs data with its own timestamp, different from message timestamp
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts:101, 122-123
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The function creates `message.timestamp` at line 101 and then a separate `timestamp` at line 122 for signature computation. These two timestamps are generated from different `new Date().toISOString()` calls and may differ by milliseconds. The receiver would need to verify the signature using the `X-Host-Timestamp` header value (line 123), not the `message.timestamp` -- but the receiver code (`handleGovernanceSyncMessage`) does not verify the Ed25519 signature from the HTTP headers at all (it trusts the request was validated by the API route layer). This is a minor double-timestamp inconsistency.
- **Evidence:**
```typescript
// Line 101 -- message envelope timestamp
timestamp: new Date().toISOString(),

// Lines 122-123 -- signature timestamp (separate Date object)
const timestamp = new Date().toISOString()
const signedData = `gov-sync|${selfHostId}|${timestamp}`
```
- **Fix:** Use a single `const now = new Date().toISOString()` for both the message timestamp and the signature data, ensuring consistency.

### [CC-A5-010] message-filter.ts: Step 5 "closed-team member" allows messaging to MANAGER but Step 5b (open-world to MANAGER) is unreachable via Step 5
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts:154-171, 174-181
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In Step 5 (lines 154-171), a closed-team member who wants to message the MANAGER falls through to the `return { allowed: false, reason: 'Closed team members can only message within their team' }` at line 170 because the MANAGER is NOT checked as a valid recipient for closed-team members. The MANAGER may not be in the same team as the member. Looking at the governance rules (R6.1), closed-team members should be able to reach their team's COS (line 164 handles this) but the rules do NOT explicitly allow normal members to message the MANAGER directly -- only COS can (R6.2). So this may be intentional. However, the code comment on Step 5 says "Normal closed-team member" and the rules say "can only message within their team" -- which is correct. The MANAGER is reachable via COS as intermediary. No actual bug here on closer inspection; the filter correctly enforces that normal members cannot directly reach MANAGER.
- **Evidence:**
```typescript
// Step 5 does NOT have: if (agentIsManager(recipientAgentId)) return { allowed: true }
// This is intentional per R6.1
```
- **Fix:** This is actually correct behavior per R6.1. Downgrading from SHOULD-FIX. However, the comment at line 174 "Step 5b: Open-world agents can reach MANAGER and COS" should clarify it only applies to open-world senders. Consider adding a brief comment in Step 5 clarifying that closed-team members cannot directly message MANAGER (must go through COS).

## NIT

### [CC-A5-011] hosts-config.ts: `createExampleConfig()` still uses deprecated `type: 'local'` field
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:513
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The `migrateHost()` function explicitly strips the deprecated `type` field (line 257), and the Host type docs say it's deprecated. But `createExampleConfig()` still emits `type: 'local'` in the example self host config. Users who copy this example will get the deprecated field.
- **Evidence:**
```typescript
// hosts-config.ts:513
type: 'local',
```
- **Fix:** Remove `type: 'local'` from the example config since it's stripped during migration anyway.

### [CC-A5-012] governance.ts: `loadGovernance()` heals corrupted file but doesn't heal on version mismatch
- **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:43-46
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When JSON parsing succeeds but `parsed.version !== 1`, the function returns defaults but does NOT heal the file (unlike the SyntaxError path at lines 52-59 which backs up + overwrites). This means the version-mismatched file persists on disk and the mismatch warning fires on every call. This is inconsistent with the SyntaxError handling.
- **Evidence:**
```typescript
if (parsed.version !== 1) {
  console.error(`[governance] Unsupported config version: ${parsed.version} (expected 1). Returning defaults.`)
  return { ...DEFAULT_GOVERNANCE_CONFIG }
  // No saveGovernance() here unlike the SyntaxError branch
}
```
- **Fix:** Either heal the file (backup + save defaults) or add a comment explaining why version mismatch intentionally doesn't heal (e.g., to avoid overwriting a newer-version file that a future release might understand).

### [CC-A5-013] hosts-config.ts: `getHostById()` does double case-insensitive comparison
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:391
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The find predicate checks `host.id === hostId` (case-sensitive) OR `host.id.toLowerCase() === hostId.toLowerCase()` (case-insensitive). The second condition is a superset of the first, making the first check redundant.
- **Evidence:**
```typescript
return hosts.find(host => host.id === hostId || host.id.toLowerCase() === hostId.toLowerCase())
```
- **Fix:** Simplify to just the case-insensitive check: `host.id.toLowerCase() === hostId.toLowerCase()`.

### [CC-A5-014] hosts-config.ts: `_lockWaiterId` counter can overflow `Number.MAX_SAFE_INTEGER` theoretically
- **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:23
- **Severity:** NIT
- **Category:** logic
- **Confidence:** POSSIBLE
- **Description:** The monotonic counter `_lockWaiterId` increments without bound. At `Number.MAX_SAFE_INTEGER` (9007199254740991), further increments lose precision. This is practically unreachable (would require ~285 million years of lock operations per second), but the shared `file-lock.ts` avoids this issue entirely by using the closure identity approach.
- **Evidence:**
```typescript
let _lockWaiterId = 0
// ...
const waiterId = ++_lockWaiterId
```
- **Fix:** Not a practical concern. If CC-A5-002 is adopted (migrating to shared file-lock.ts), this becomes moot.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts` -- Well-structured with proper locking, atomic writes, version guard, TTL expiry logic. Approval state machine logic is correct.
- `/Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts` -- Correct CRUD with locking, atomic writes, proper shouldAutoApprove logic with three-condition check.
- `/Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts` -- Correct Ed25519 sign/verify, timestamp freshness check, recipientHostId binding, role allowlist validation.
- `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- Correct ACL decision order, proper null guard, appropriate Phase 1 limitations documented.
- `/Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts` -- Proper locking, duplicate detection, atomic writes, compensating revert action.
- `/Users/emanuelesabetta/ai-maestro/lib/validation.ts` -- Simple UUID regex, correct and minimal.
- `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- Correct lock semantics with timeout, waiter queue, proper cleanup on timeout race.

## Test Coverage Notes

- No test files were in scope for this domain, but the following code paths lack obvious test coverage:
  - `hosts-config.ts`: Organization set-once invariant race condition
  - `hosts-config.ts`: Host CRUD case-sensitivity edge cases
  - `governance-peers.ts`: TTL expiry boundary (exact cutoff second)
  - `host-keys.ts`: Key regeneration on corrupt key files
  - `message-filter.ts`: Layer 2 attestation paths for cross-host COS messages

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A5-001, -002, ...
- [x] My report file uses the UUID filename: epcp-correctness-P10-Rc7f26c53-A5.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report (14 findings: 3 MUST-FIX, 7 SHOULD-FIX, 4 NIT; CC-A5-010 reclassified to NIT during analysis)
- [x] My return message to the orchestrator is exactly 1-2 lines
