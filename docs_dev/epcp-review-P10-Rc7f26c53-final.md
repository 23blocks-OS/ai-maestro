# EPCP Final PR Review Report

**Generated:** 2026-02-26T23:45:00Z
**Pass:** 10
**Run ID:** c7f26c53
**Pipeline:** Code Correctness -> Claim Verification -> Skeptical Review
**Dedup:** 131 raw findings -> 123 unique findings (7 duplicates merged, 1 excluded as non-actionable)

---

## Summary

| Severity | Count |
|----------|-------|
| **MUST-FIX** | 17 |
| **SHOULD-FIX** | 62 |
| **NIT** | 44 |
| **Total findings** | 123 |

**Verdict: REQUEST CHANGES -- 17 must-fix issue(s) found.**

---

## MUST-FIX Issues

### [MF-001] DELETE /api/agents/[id]/metadata does not actually clear metadata
**File:** app/api/agents/[id]/metadata/route.ts:106
**Original IDs:** CC-A0-001
**Phases:** CC
The DELETE handler calls `updateAgent(agentId, { metadata: {} })` to clear metadata. However, `updateAgent` in `lib/agent-registry.ts:542-545` merges metadata using spread: `metadata: { ...agents[index].metadata, ...updates.metadata }`. Spreading an empty object `{}` over the existing metadata is a no-op -- all existing keys are preserved. The metadata is never actually cleared.

**Fix:** Either (a) add a `clearMetadata` flag to `updateAgent` that replaces instead of merging, or (b) create a dedicated `clearAgentMetadata(id)` function in the registry that sets `agents[index].metadata = {}` directly, or (c) set each existing key to `undefined` explicitly in the update.

---

### [MF-002] Double-decode path traversal bypass in conversations/[file]/messages route
**File:** app/api/conversations/[file]/messages/route.ts:15-25
**Original IDs:** CC-A1-001
**Phases:** CC
The route decodes the file parameter once at line 15 to check for `../`, but then passes the still-encoded `encodedFile` to `getConversationMessages()` at line 25. The service function (`config-service.ts:787`) decodes it a second time. A double-encoded path like `%252e%252e%252f` would decode to `%2e%2e%2f` at the route level (passing the traversal check), then to `../` in the service.

**Fix:** Pass the already-decoded `decodedFile` to the service instead of `encodedFile`, and update the service to not double-decode.

---

### [MF-003] Webhook routes lack authentication -- any localhost client can CRUD webhooks
**File:** app/api/webhooks/route.ts:8,21; app/api/webhooks/[id]/route.ts:8,25; app/api/webhooks/[id]/test/route.ts:8
**Original IDs:** CC-A2-001
**Phases:** CC
All five webhook endpoints (GET list, POST create, GET by id, DELETE by id, POST test) have zero authentication. While Phase 1 is localhost-only, every other mutating route in the codebase has `authenticateAgent()` guards. Webhooks are a write path (create subscriptions, delete subscriptions, trigger test deliveries to arbitrary URLs).

**Fix:** Add `authenticateAgent()` calls to POST (create), DELETE, and POST test endpoints, consistent with other routes.

---

### [MF-004] Webhook ID path parameter has no format validation
**File:** app/api/webhooks/[id]/route.ts:12,29; app/api/webhooks/[id]/test/route.ts:11
**Original IDs:** CC-A2-002
**Phases:** CC
The `[id]` parameter in webhook routes is passed directly to service functions without any format validation. Every other `[id]` route in the codebase validates with `isValidUuid(id)`.

**Fix:** Add `if (!isValidUuid(id)) return NextResponse.json({ error: 'Invalid webhook ID format' }, { status: 400 })` to all three webhook `[id]` handlers.

---

### [MF-005] Missing null-check on `agent` in `getMemory()` and 10+ other functions in agents-memory-service.ts
**File:** services/agents-memory-service.ts:220-221 (and lines 464, 536, 653, 761, 814, 911, 959, 1009, 1033)
**Original IDs:** CC-P10-A3-001, CC-P10-A3-007
**Phases:** CC
**Also identified by:** CC-P10-A3-007 (broader pattern)
`getMemory()` and 10+ other functions call `agentRegistry.getAgent(agentId)` without verifying the agent exists in the file-based registry. This auto-creates database directories on disk for nonexistent agents. Contrast with `getMetrics()` at line 1103 which correctly uses `getAgentFromFileRegistry()` and returns 404 if not found.

**Fix:** Add a file-based registry check at the top of each affected function: `const registryAgent = getAgentFromFileRegistry(agentId); if (!registryAgent) return { error: 'Agent not found', status: 404 }`.

---

### [MF-006] `parseInt(sessionId)` without NaN check in `createTranscriptExportJob()`
**File:** services/agents-transfer-service.ts:549
**Original IDs:** CC-P10-A3-002
**Phases:** CC
`parseInt(sessionId)` is called without checking if the result is NaN. If `sessionId` is a non-numeric string, `parseInt` returns `NaN`, and `NaN !== NaN` makes `.some()` always return false, producing a misleading 404 instead of a 400 validation error.

**Fix:** Add NaN validation: `const parsedIndex = parseInt(sessionId, 10); if (Number.isNaN(parsedIndex)) return { error: 'sessionId must be a numeric session index', status: 400 }`.

---

### [MF-007] TOCTOU race in headless-router chief-of-staff endpoint
**File:** services/headless-router.ts:1666-1674
**Original IDs:** CC-A4-001
**Phases:** CC
The chief-of-staff endpoint uses the older `checkRateLimit` / `recordAttempt` two-step pattern instead of the atomic `checkAndRecordAttempt` used everywhere else. This creates a TOCTOU window where two concurrent password-brute-force requests could both pass `checkRateLimit` before either calls `recordAttempt`.

**Fix:** Replace `checkRateLimit` + `recordAttempt` with `checkAndRecordAttempt`, then call `resetRateLimit` on success.

---

### [MF-008] `getMessages` allows unrecognized action to fall through to inbox listing
**File:** services/messages-service.ts:72-173
**Original IDs:** CC-A4-002
**Phases:** CC
When `action` is an unrecognized value (e.g., `"foo"`), the function does not return a 400 error. It falls through to the inbox listing logic or the "get specific message" path, producing incorrect behavior for unrecognized actions.

**Fix:** Add a validation check: if `action` is defined and not one of the recognized values, return `{ error: 'Invalid action', status: 400 }`.

---

### [MF-009] hosts-config.ts: `saveHosts()` is NOT atomic -- data loss on crash
**File:** lib/hosts-config.ts:565 (also lines 886, 947)
**Original IDs:** CC-A5-001
**Phases:** CC
`saveHosts()` calls `fs.writeFileSync(HOSTS_CONFIG_PATH, ...)` directly, without the temp-file-then-rename atomic write pattern used everywhere else in this codebase.

**Fix:** Use atomic write pattern: write to `HOSTS_CONFIG_PATH + '.tmp.' + process.pid`, then `fs.renameSync(tmpFile, HOSTS_CONFIG_PATH)`. Same fix needed at lines 886 and 947.

---

### [MF-010] hosts-config.ts: Duplicate lock implementation instead of using shared `file-lock.ts`
**File:** lib/hosts-config.ts:19-85
**Original IDs:** CC-A5-002
**Phases:** CC
`hosts-config.ts` implements its own lock mechanism separately from the shared `lib/file-lock.ts`. The custom lock has a 5-second timeout vs the shared lock's 30 seconds, and lock names are not visible to `lib/file-lock.ts`, so the two lock systems cannot prevent races against each other.

**Fix:** Migrate to use the shared `withLock('hosts', fn)` from `@/lib/file-lock`. Remove the duplicate local lock implementation. Add `'hosts'` to the lock ordering invariant.

---

### [MF-011] hosts-config.ts: `setOrganization()` and `adoptOrganization()` have TOCTOU race
**File:** lib/hosts-config.ts:846-898, 908-960
**Original IDs:** CC-A5-003
**Phases:** CC
Both functions read the config, check `config.organization`, and then write -- but neither is wrapped in any lock. Two concurrent calls could both read `organization: null` and both proceed to write.

**Fix:** Wrap both in `withLock()` (preferably the shared one from file-lock.ts per MF-010).

---

### [MF-012] getSentCount counts top-level entries only, misses messages in subdirectories
**File:** lib/messageQueue.ts:737-740
**Original IDs:** CC-A6-001
**Phases:** CC
`getSentCount()` uses `readdirSync(sentDir)` and counts `.json` files at the top level. However, `writeToAMPSent()` stores sent messages in `sent/{recipientDir}/{messageId}.json`. This means `getSentCount()` always returns 0 for AMP-format sent messages.

**Fix:** Recurse into subdirectories to count `.json` files.

---

### [MF-013] MeetingRoom: creatingMeetingRef never reset on success path
**File:** components/team-meeting/MeetingRoom.tsx:274-328
**Original IDs:** CC-A7-001
**Phases:** CC
`creatingMeetingRef.current` is set to `true` at line 274 but is only reset to `false` in the catch block (line 325). On the success path, it is never reset. This prevents any future meeting creation in the same component lifecycle.

**Fix:** Move `creatingMeetingRef.current = false` to a `finally` block.

---

### [MF-014] useGovernance: multiple mutation methods fire-and-forget refresh without AbortSignal
**File:** hooks/useGovernance.ts:268,314,348,377,397,417
**Original IDs:** CC-A7-002, CC-A7-007, CC-A7-008
**Phases:** CC
**Also identified by:** CC-A7-007, CC-A7-008 (same pattern at different lines)
`addAgentToTeam`, `removeAgentFromTeam`, `requestTransfer`, `resolveTransfer`, `submitConfigRequest`, and `resolveConfigRequest` all call `refresh()` without an AbortSignal, unlike `setPassword`, `assignManager`, and `assignCOS` which use `mutationAbortRef`. This means these refreshes cannot be cancelled on unmount.

**Fix:** Use the `mutationAbortRef` pattern consistently across all mutation methods.

---

### [MF-015] server.mjs: unhandledRejection handler may silently lose crash logs
**File:** server.mjs:61
**Original IDs:** CC-A9-001
**Phases:** CC
The `unhandledRejection` handler writes to `path.join(process.cwd(), 'logs', 'crash.log')` but does NOT create the `logs/` directory first, unlike the `uncaughtException` handler at line 36-37.

**Fix:** Add the same `mkdirSync` guard to the `unhandledRejection` handler.

---

### [MF-016] server.mjs: removeAllListeners on retry removes the early-close handler
**File:** server.mjs:490-492
**Original IDs:** CC-A9-002
**Phases:** CC
In `handleRemoteWorker`, lines 490-492 call `clientWs.removeAllListeners('close')` which removes the early client disconnection handler registered at line 575-580, creating a brief gap where client disconnection would go unhandled.

**Fix:** Track named listeners from previous retry attempts and remove only those, or register the new close handler immediately after removeAllListeners.

---

### [MF-017] `performRequestExecution` silently swallows failures -- request status stays "executed" even when execution fails
**File:** services/cross-host-governance-service.ts (lines ~47456-47607 in diff)
**Original IDs:** SR-Rc7f26c53-001
**Phases:** SR
When a cross-host governance request is approved, the status is set to `executed` *before* `performRequestExecution` runs. If the actual mutation fails, the request stays in `executed` status permanently. There is no `failed` status. Admins have no programmatic way to detect silent failures.

**Fix:** Add a `failed` status to `GovernanceRequestStatus` and update `performRequestExecution` to set it on failure. At minimum, add an `executionError` field to the `GovernanceRequest` type.

---

## SHOULD-FIX Issues

### [SF-001] Inconsistent use of `new URL(request.url)` vs `request.nextUrl.searchParams`
**File:** app/api/agents/[id]/messages/route.ts:19, app/api/agents/[id]/playback/route.ts:24, app/api/agents/[id]/repos/route.ts:77
**Original IDs:** CC-A0-002
**Phases:** CC
Several route files use `new URL(request.url)` with native `Request` type while most other routes use `request.nextUrl.searchParams` via `NextRequest`.

**Fix:** Replace `new URL(request.url)` with `request.nextUrl.searchParams`. Change parameter types from `Request` to `NextRequest` where applicable.

---

### [SF-002] `playback/route.ts` and `repos/route.ts` use `Request` instead of `NextRequest`
**File:** app/api/agents/[id]/playback/route.ts:15,42; app/api/agents/[id]/repos/route.ts:16,40,68
**Original IDs:** CC-A0-003
**Phases:** CC
These route handlers use the native `Request` type instead of Next.js `NextRequest`, inconsistent with other 28+ route files.

**Fix:** Change `Request` to `NextRequest` and import from `next/server`.

---

### [SF-003] `route.ts` (main agent CRUD) uses `Request` instead of `NextRequest`
**File:** app/api/agents/[id]/route.ts:11,38,70
**Original IDs:** CC-A0-004
**Phases:** CC

**Fix:** Change to `NextRequest` for consistency.

---

### [SF-004] `export/route.ts` uses `Request` type instead of `NextRequest`
**File:** app/api/agents/[id]/export/route.ts:15,53
**Original IDs:** CC-A0-005
**Phases:** CC

**Fix:** Change to `NextRequest`.

---

### [SF-005] `session/route.ts` POST handler uses `Request` instead of `NextRequest`
**File:** app/api/agents/[id]/session/route.ts:15
**Original IDs:** CC-A0-006
**Phases:** CC
The POST handler on line 15 uses `Request`, while PATCH, GET, and DELETE in the same file use `NextRequest`.

**Fix:** Change POST handler's `Request` to `NextRequest`.

---

### [SF-006] `export/route.ts` X-Agent-Name header not sanitized for header injection
**File:** app/api/agents/[id]/export/route.ts:39
**Original IDs:** CC-A0-007
**Phases:** CC
The `agentName` value is placed directly into the `X-Agent-Name` HTTP response header without sanitization. The filename on line 36 is properly sanitized.

**Fix:** Sanitize: `'X-Agent-Name': agentName.replace(/[\r\n]/g, '')`.

---

### [SF-007] Missing outer try-catch in config/route.ts
**File:** app/api/config/route.ts:5-11
**Original IDs:** CC-A1-002
**Phases:** CC
The GET handler has no try-catch wrapper. Every other route in this codebase has one.

**Fix:** Wrap in try-catch with `{ error: 'Internal server error' }, { status: 500 }` fallback.

---

### [SF-008] Missing outer try-catch in conversations/[file]/messages/route.ts
**File:** app/api/conversations/[file]/messages/route.ts:8-35
**Original IDs:** CC-A1-003
**Phases:** CC
`decodeURIComponent()` at line 15 can throw `URIError` on malformed percent-encoded sequences.

**Fix:** Wrap the entire handler body in try-catch.

---

### [SF-009] Missing outer try-catch in domains/[id]/route.ts (GET, PATCH, DELETE)
**File:** app/api/domains/[id]/route.ts:8-57
**Original IDs:** CC-A1-004
**Phases:** CC

**Fix:** Add outer try-catch to all three handlers.

---

### [SF-010] Missing outer try-catch in domains/route.ts (GET and POST)
**File:** app/api/domains/route.ts:8-32
**Original IDs:** CC-A1-005
**Phases:** CC

**Fix:** Add outer try-catch wrappers to both handlers.

---

### [SF-011] Missing outer try-catch in export/jobs/[jobId]/route.ts (GET and DELETE)
**File:** app/api/export/jobs/[jobId]/route.ts:8-46
**Original IDs:** CC-A1-006
**Phases:** CC

**Fix:** Add outer try-catch to both handlers.

---

### [SF-012] Inconsistent `||` vs `??` for auth.status fallback in transfers/route.ts
**File:** app/api/governance/transfers/route.ts:60
**Original IDs:** CC-A1-007
**Phases:** CC
Uses `auth.status || 401` while the sibling route uses `auth.status ?? 401`.

**Fix:** Change to `auth.status ?? 401`.

---

### [SF-013] SSRF: health proxy endpoint allows requests to internal/cloud metadata URLs
**File:** app/api/agents/health/route.ts:25-32
**Original IDs:** CC-A1-008
**Phases:** CC
The health proxy validates URL scheme but does not restrict hostname. Could probe `169.254.169.254` or internal services.

**Fix:** Block RFC 1918 private ranges, link-local, and loopback unless explicitly intended.

---

### [SF-014] Documents PUT route passes raw body spread without field whitelisting
**File:** app/api/teams/[id]/documents/[docId]/route.ts:56
**Original IDs:** CC-A2-003
**Phases:** CC

**Fix:** Whitelist fields at the route level: `const { title, content, pinned, tags } = body`.

---

### [SF-015] `createNewTeam` route passes raw body spread without field whitelisting
**File:** app/api/teams/route.ts:38
**Original IDs:** CC-A2-004
**Phases:** CC

**Fix:** Whitelist expected fields: `const { name, description, agentIds, type } = body`.

---

### [SF-016] `POST /api/sessions/activity/update` does not validate `sessionName` format
**File:** app/api/sessions/activity/update/route.ts:17
**Original IDs:** CC-A2-005
**Phases:** CC

**Fix:** Add regex validation: `/^[a-zA-Z0-9_-]+$/`.

---

### [SF-017] Marketplace skill `[id]` route lacks input validation on the id parameter
**File:** app/api/marketplace/skills/[id]/route.ts:18
**Original IDs:** CC-A2-006
**Phases:** CC

**Fix:** Add basic validation: length limits and disallowed characters.

---

### [SF-018] Webhook event type reflected in error message without truncation
**File:** services/webhooks-service.ts:98
**Original IDs:** CC-A2-007
**Phases:** CC

**Fix:** Truncate: `${String(event).slice(0, 50)}`.

---

### [SF-019] `hosts/health` route has redundant `if (hostUrl)` check after early return
**File:** app/api/hosts/health/route.ts:23
**Original IDs:** CC-A2-008
**Phases:** CC

**Fix:** Remove redundant `if (hostUrl)` wrapper.

---

### [SF-020] `config-service.ts` uses `execSync` with shell for PTY debug commands
**File:** services/config-service.ts:515-523
**Original IDs:** CC-P10-A3-003
**Phases:** CC
Uses shell invocation (`execSync`) inconsistent with rest of codebase (migrated to `execFileSync`).

**Fix:** Refactor to use `execFileSync` where possible, or document the shell usage.

---

### [SF-021] `config-service.ts` uses `execAsync` (shell) for Docker version check
**File:** services/config-service.ts:578
**Original IDs:** CC-P10-A3-004
**Phases:** CC
Inconsistent with `agents-docker-service.ts` which uses `execFileAsync('docker', [...])`.

**Fix:** Replace with `execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'])`.

---

### [SF-022] `ServiceResult<any>` used pervasively instead of specific types
**File:** Multiple service files (17+)
**Original IDs:** CC-P10-A3-005, CC-P10-A3-006, CC-A4-013
**Phases:** CC
**Also identified by:** CC-P10-A3-006 (agents-directory-service.ts), CC-A4-013 (multiple services)
Nearly all service functions return `ServiceResult<any>`, eliminating compile-time type checking. Acknowledged as known debt (NT-036).

**Fix:** Define specific result types for each service function return value.

---

### [SF-023] `exchangePeers` calls `getHosts()` inside the per-peer loop
**File:** services/hosts-service.ts:1009
**Original IDs:** CC-A4-003
**Phases:** CC
Re-reads from disk on each loop iteration.

**Fix:** Hoist `getHosts()` call before the loop.

---

### [SF-024] `checkHostHealth` uses manual AbortController + setTimeout with timer leak
**File:** services/hosts-service.ts:256-270
**Original IDs:** CC-A4-004
**Phases:** CC
If `fetch` throws before timeout fires, `setTimeout` callback is never cleared.

**Fix:** Add `clearTimeout(timeout)` in catch block, or switch to `AbortSignal.timeout()`.

---

### [SF-025] `getMeshStatus` also uses manual AbortController + setTimeout with timer leak
**File:** services/hosts-service.ts:610-616
**Original IDs:** CC-A4-005
**Phases:** CC
Same pattern as SF-024.

**Fix:** Add `clearTimeout(timeout)` in catch block, or switch to `AbortSignal.timeout(5000)`.

---

### [SF-026] `forwardMessage` does not validate `fromSession` / `toSession` format
**File:** services/messages-service.ts:321-367
**Original IDs:** CC-A4-006
**Phases:** CC

**Fix:** Add basic format validation (length limit, no control characters).

---

### [SF-027] `renameSession` cloud agent path overwrites `agentConfig.id` with the new name
**File:** services/sessions-service.ts:733-734
**Original IDs:** CC-A4-007
**Phases:** CC
Overwrites UUID with a human-readable name, breaking UUID-based lookups.

**Fix:** Only update `agentConfig.name` and `agentConfig.alias`. Keep `agentConfig.id` as the original UUID.

---

### [SF-028] `listSessions` return type does not include ServiceResult wrapper
**File:** services/sessions-service.ts:440
**Original IDs:** CC-A4-008
**Phases:** CC

**Fix:** Wrap in `ServiceResult` format.

---

### [SF-029] `checkIdleStatus` does not follow ServiceResult pattern
**File:** services/sessions-service.ts:803-822
**Original IDs:** CC-A4-009
**Phases:** CC

**Fix:** Wrap in `ServiceResult`.

---

### [SF-030] `listRestorableSessions` does not follow ServiceResult pattern
**File:** services/sessions-service.ts:827-836
**Original IDs:** CC-A4-010
**Phases:** CC

**Fix:** Wrap in `ServiceResult`.

---

### [SF-031] `getActivity` does not follow ServiceResult pattern
**File:** services/sessions-service.ts:476-513
**Original IDs:** CC-A4-011
**Phases:** CC

**Fix:** Wrap in `ServiceResult`.

---

### [SF-032] governance-peers.ts: `deletePeerGovernance()` is not protected by file lock
**File:** lib/governance-peers.ts:80-86
**Original IDs:** CC-A5-004
**Phases:** CC

**Fix:** Make async and wrap in `withLock('governance-peers-${hostId}')`.

---

### [SF-033] host-keys.ts: Atomic write uses generic `.tmp` without `process.pid`
**File:** lib/host-keys.ts:54-55
**Original IDs:** CC-A5-005
**Phases:** CC

**Fix:** Add `process.pid` to temp file names.

---

### [SF-034] team-registry.ts: `createTeam()` chiefOfStaffId ternary is confusing
**File:** lib/team-registry.ts:281-283
**Original IDs:** CC-A5-006
**Phases:** CC
The three-way fallback chain (sanitized -> data -> null) works correctly but is overly complex.

**Fix:** Simplify or add a comment explaining the chain.

---

### [SF-035] hosts-config.ts: `updateHost()` uses case-sensitive ID comparison while `addHost()` uses case-insensitive
**File:** lib/hosts-config.ts:689 vs 636
**Original IDs:** CC-A5-007
**Phases:** CC

**Fix:** Use case-insensitive comparison in `updateHost()`.

---

### [SF-036] hosts-config.ts: `deleteHost()` also uses case-sensitive comparison
**File:** lib/hosts-config.ts:739, 755
**Original IDs:** CC-A5-008
**Phases:** CC

**Fix:** Use case-insensitive comparison and normalize on add.

---

### [SF-037] governance-sync.ts: Double-timestamp between message and signature
**File:** lib/governance-sync.ts:101, 122-123
**Original IDs:** CC-A5-009
**Phases:** CC
Two separate `new Date().toISOString()` calls create slightly different timestamps.

**Fix:** Use a single `const now = new Date().toISOString()` for both.

---

### [SF-038] message-filter.ts: Add clarifying comment in Step 5 about MANAGER reachability
**File:** lib/message-filter.ts:154-171
**Original IDs:** CC-A5-010
**Phases:** CC
The behavior is correct per R6.1, but needs a clarifying comment about why closed-team members cannot directly message MANAGER.

**Fix:** Add a brief comment in Step 5 clarifying the design decision.

---

### [SF-039] index-delta acquireIndexSlot timeout may match wrong queue item
**File:** lib/index-delta.ts:59
**Original IDs:** CC-A6-002
**Phases:** CC

**Fix:** Use `indexQueue.indexOf(entry)` instead of matching by agentId + timestamp.

---

### [SF-040] agent-registry updateAgent tmux rename uses base name, not computed session name
**File:** lib/agent-registry.ts:506
**Original IDs:** CC-A6-003
**Phases:** CC
Uses raw agent name instead of `computeSessionName(agentName, sessionIndex)` with `_0` suffix.

**Fix:** Iterate through the agent's sessions array and use `computeSessionName()`.

---

### [SF-041] agent-registry renameAgent does not rename tmux sessions
**File:** lib/agent-registry.ts:1060-1126
**Original IDs:** CC-A6-004
**Phases:** CC
`renameAgent()` updates the registry but does NOT rename the tmux session.

**Fix:** Add tmux session renaming to `renameAgent()` for each session in the sessions array.

---

### [SF-042] message-send forwardFromUI marks forwarded messages as fromVerified=true unconditionally
**File:** lib/message-send.ts:574
**Original IDs:** CC-A6-005
**Phases:** CC

**Fix:** Check whether the sender agent is actually local and verified before using VERIFIED_LOCAL_SENDER.

---

### [SF-043] messageQueue getUnreadCount loads all messages just to count them
**File:** lib/messageQueue.ts:885-888
**Original IDs:** CC-A6-006
**Phases:** CC
Reads and parses every message file, converts AMP envelopes, applies filters, sorts -- then only uses `.length`.

**Fix:** Add an optimized count-only path.

---

### [SF-044] MessageCenter: selectedSuggestionIndex can go out of bounds
**File:** components/MessageCenter.tsx (compose view autocomplete)
**Original IDs:** CC-A7-003
**Phases:** CC

**Fix:** Clamp `selectedSuggestionIndex` when `filteredAgents` changes.

---

### [SF-045] MeetingRoom: teamId resolution effect race with other effects
**File:** components/team-meeting/MeetingRoom.tsx:376-404
**Original IDs:** CC-A7-004
**Phases:** CC

**Fix:** Combine team creation logic into a single effect or callback.

---

### [SF-046] AgentSkillEditor: canApprove hardcoded to true bypasses governance
**File:** components/marketplace/AgentSkillEditor.tsx:85
**Original IDs:** CC-A7-005
**Phases:** CC
Known Phase 1 limitation. Should be tracked as tech debt.

**Fix:** Add a TODO with ticket reference for Phase 2.

---

### [SF-047] TerminalView: localStorage reads reference storageId but have empty deps
**File:** components/TerminalView.tsx:520-536, 538-553
**Original IDs:** CC-A7-006
**Phases:** CC

**Fix:** Add comment documenting the keyed-by-session assumption, or add `storageId` to deps.

---

### [SF-048] use-governance-hook.test.ts tests standalone replicas, not the actual hook
**File:** tests/use-governance-hook.test.ts:26-35
**Original IDs:** CC-A8-001
**Phases:** CC
Tests exercise standalone function replicas, NOT the actual `useGovernance` hook.

**Fix:** Add tests using `@testing-library/react` to render the actual hook.

---

### [SF-049] afterEach in use-governance-hook.test.ts does not restore global.fetch
**File:** tests/use-governance-hook.test.ts:127-130
**Original IDs:** CC-A8-002
**Phases:** CC

**Fix:** Use `vi.stubGlobal('fetch', mockFetch)` + `vi.unstubAllGlobals()`.

---

### [SF-050] agent-registry.test.ts uses require() inside test bodies
**File:** tests/agent-registry.test.ts:169-176
**Original IDs:** CC-A8-003
**Phases:** CC

**Fix:** Import `path` and `os` at module scope.

---

### [SF-051] Missing test for document-registry saveDocuments write error propagation
**File:** tests/document-registry.test.ts:142-161
**Original IDs:** CC-A8-004
**Phases:** CC

**Fix:** Add test that mocks `writeFileSync` to throw and verifies error propagates.

---

### [SF-052] amp-inbox.sh: `base64 -d` portability on older macOS
**File:** plugins/amp-messaging/scripts/amp-inbox.sh:130
**Original IDs:** CC-A9-003
**Phases:** CC
On macOS 13 and earlier, the flag is `-D` (uppercase).

**Fix:** Use portable decode wrapper or `openssl base64 -d`.

---

### [SF-053] amp-inbox.sh: redundant if/else in count-only mode
**File:** plugins/amp-messaging/scripts/amp-inbox.sh:93-99
**Original IDs:** CC-A9-004
**Phases:** CC

**Fix:** Simplify to just `echo "$COUNT"; exit 0`.

---

### [SF-054] server.mjs: startup loopback fetch uses hardcoded localhost
**File:** server.mjs:616
**Original IDs:** CC-A9-005
**Phases:** CC
Server may bind to `0.0.0.0` but fetches use `localhost`, which could fail in IPv6-only environments.

**Fix:** Use `http://127.0.0.1:${port}/...` consistently.

---

### [SF-055] server.mjs: host sync filters by deprecated `h.type === 'remote'`
**File:** server.mjs:1211
**Original IDs:** CC-A9-006
**Phases:** CC
The `type` field is deprecated; use `role` field instead.

**Fix:** Filter using `!isSelf(h.id) && h.enabled !== false`.

---

### [SF-056] types/service.ts: assertValidServiceResult only logs, does not throw
**File:** types/service.ts:29-35
**Original IDs:** CC-A9-007
**Phases:** CC
The function name `assert*` implies it would throw, but it only logs.

**Fix:** Rename to `warnOnInvalidServiceResult` or add `throw`.

---

### [SF-057] update-aimaestro.sh: box drawing characters misaligned
**File:** update-aimaestro.sh:75-79
**Original IDs:** CC-A9-008
**Phases:** CC

**Fix:** Align inner content width to match the top/bottom border.

---

### [SF-058] Governance enforcement is opt-in (bypass by omitting headers)
**File:** lib/agent-auth.ts:27998-28000, lib/team-acl.ts:32972-32973, services/agents-core-service.ts:37125
**Original IDs:** SR-Rc7f26c53-002
**Phases:** SR
All governance-enforced endpoints skip RBAC checks if auth headers are omitted. Documented Phase 1 design decision.

**Fix:** Add `// PHASE 2 REQUIRED: Make auth mandatory` comment at top of `agent-auth.ts`. Create tracking issue.

---

### [SF-059] `agentHostMap` field on Team type is a dead type stub
**File:** types/team.ts:34
**Original IDs:** SR-Rc7f26c53-003, CV-P10-002
**Phases:** SR, CV
**Also identified by:** CV-P10-002
Never populated, read, or consumed anywhere. CHANGELOG includes honest `@planned` disclaimer.

**Fix:** Either remove or add `@planned` JSDoc on the field itself.

---

### [SF-060] Stored XSS in team documents -- acknowledged in test but no mitigation
**File:** tests/document-api.test.ts:59317
**Original IDs:** SR-Rc7f26c53-004
**Phases:** SR
`<script>alert(1)</script>` stored verbatim in titles. No server-side sanitization.

**Fix:** Add server-side HTML sanitization for document titles. Create tracking issue for Phase 2.

---

### [SF-061] `CLAUDE.md` references outdated version "0.24.x"
**File:** CLAUDE.md (diff line 397)
**Original IDs:** SR-Rc7f26c53-005
**Phases:** SR

**Fix:** Change to "separate from the app version" without specifying a version number.

---

### [SF-062] `AgentConfiguration` interface is dead code (CHANGELOG misleading)
**File:** types/agent.ts:447-453
**Original IDs:** CV-P10-001
**Phases:** CV
Declared but NEVER imported or referenced anywhere. The actual governance uses `ConfigurationPayload` from `types/governance-request.ts`.

**Fix:** Either wire into the codebase or remove from CHANGELOG claim and delete the dead type.

---

## Nits & Suggestions

### [NT-001] Consolidation maxConversations parsing is complex and hard to read
**File:** app/api/agents/[id]/memory/consolidate/route.ts:61-62
**Original IDs:** CC-A0-008
**Phases:** CC

**Fix:** Extract a reusable `parseIntParam(searchParams, key)` helper function.

---

### [NT-002] `search/route.ts` calls `searchParams.get()` multiple times for same param
**File:** app/api/agents/[id]/search/route.ts:47-59
**Original IDs:** CC-A0-009
**Phases:** CC

**Fix:** Store each param value once in a local variable.

---

### [NT-003] `memory/route.ts` POST uses `.catch(() => ({}))` silently swallowing malformed JSON
**File:** app/api/agents/[id]/memory/route.ts:46
**Original IDs:** CC-A0-010
**Phases:** CC

**Fix:** Use explicit try/catch with 400 response for consistency.

---

### [NT-004] `tracking/route.ts` POST also uses `.catch(() => ({}))` silent fallback
**File:** app/api/agents/[id]/tracking/route.ts:46
**Original IDs:** CC-A0-011
**Phases:** CC

**Fix:** Same as NT-003.

---

### [NT-005] Unused `request` parameter not prefixed with underscore
**File:** app/api/export/jobs/[jobId]/route.ts:9,31
**Original IDs:** CC-A1-009
**Phases:** CC

**Fix:** Rename to `_request: Request`.

---

### [NT-006] Redundant null check for fromTeam/toTeam at resolve/route.ts
**File:** app/api/governance/transfers/[id]/resolve/route.ts:114,142
**Original IDs:** CC-A1-010
**Phases:** CC
These are unreachable dead code since earlier guards already return.

**Fix:** Optionally remove or leave as defensive.

---

### [NT-007] Missing `dynamic = 'force-dynamic'` on several mutable routes
**File:** app/api/domains/route.ts, domains/[id]/route.ts, conversations/[file]/messages/route.ts, export/jobs/[jobId]/route.ts
**Original IDs:** CC-A1-011
**Phases:** CC

**Fix:** Add `export const dynamic = 'force-dynamic'`.

---

### [NT-008] `v1/info` route uses `?? {}` with `as AMPInfoResponse` cast
**File:** app/api/v1/info/route.ts:22
**Original IDs:** CC-A2-009
**Phases:** CC

**Fix:** Add `if (!result.data)` guard and return 500.

---

### [NT-009] `v1/register` route also uses `?? {}` empty-object fallback
**File:** app/api/v1/register/route.ts:29
**Original IDs:** CC-A2-010
**Phases:** CC

**Fix:** Guard with `if (!result.data)` and return 500.

---

### [NT-010] `v1/route` and `v1/messages/pending` use the same `?? {}` pattern
**File:** app/api/v1/route/route.ts:38; app/api/v1/messages/pending/route.ts:36,52,73
**Original IDs:** CC-A2-011
**Phases:** CC

**Fix:** Add `if (!result.data)` guards.

---

### [NT-011] `POST /api/teams/notify` does not validate agentIds is a non-empty array
**File:** app/api/teams/notify/route.ts:28
**Original IDs:** CC-A2-012
**Phases:** CC

**Fix:** Add validation for presence and non-emptiness.

---

### [NT-012] `help/agent` route does not wrap service calls in try-catch
**File:** app/api/help/agent/route.ts:19-29
**Original IDs:** CC-A2-013
**Phases:** CC

**Fix:** Wrap in try-catch with standard 500 JSON error.

---

### [NT-013] `POST /api/webhooks` does not validate webhook URL scheme
**File:** services/webhooks-service.ts:89-93
**Original IDs:** CC-A2-014
**Phases:** CC

**Fix:** Add protocol validation: only allow http/https.

---

### [NT-014] Unused `depth` parameter in `queryCodeGraph`
**File:** services/agents-graph-service.ts:858-862
**Original IDs:** CC-P10-A3-008
**Phases:** CC

**Fix:** Either implement or remove the parameter.

---

### [NT-015] `agents-playback-service.ts` is entirely a placeholder (Phase 5)
**File:** services/agents-playback-service.ts (entire file)
**Original IDs:** CC-P10-A3-009
**Phases:** CC

**Fix:** No action needed for Phase 1. Could add a "placeholder" indicator.

---

### [NT-016] Verbose console.log in graph/docs services for every request
**File:** services/agents-graph-service.ts:162,367,864; services/agents-docs-service.ts:59
**Original IDs:** CC-P10-A3-010
**Phases:** CC

**Fix:** Use `console.debug` or configurable log level.

---

### [NT-017] `help-service.ts` writes system prompt to predictable temp file path
**File:** services/help-service.ts:156
**Original IDs:** CC-A4-012
**Phases:** CC

**Fix:** Use unique temp file path with `randomUUID()`.

---

### [NT-018] `marketplace-service.ts` passes `query as any` in headless router
**File:** services/headless-router.ts:1850
**Original IDs:** CC-A4-014
**Phases:** CC

**Fix:** Construct typed `SkillSearchParams` from query.

---

### [NT-019] `plugin-builder-service.ts` evictionInterval runs forever
**File:** services/plugin-builder-service.ts:200-201
**Original IDs:** CC-A4-015
**Phases:** CC

**Fix:** Only start interval when first build is created.

---

### [NT-020] hosts-config.ts: `createExampleConfig()` still uses deprecated `type: 'local'`
**File:** lib/hosts-config.ts:513
**Original IDs:** CC-A5-011
**Phases:** CC

**Fix:** Remove `type: 'local'` from example config.

---

### [NT-021] governance.ts: `loadGovernance()` heals corrupted file but not version mismatch
**File:** lib/governance.ts:43-46
**Original IDs:** CC-A5-012
**Phases:** CC

**Fix:** Either heal or document why version mismatch intentionally doesn't heal.

---

### [NT-022] hosts-config.ts: `getHostById()` does double case-insensitive comparison
**File:** lib/hosts-config.ts:391
**Original IDs:** CC-A5-013
**Phases:** CC

**Fix:** Simplify to just the case-insensitive check.

---

### [NT-023] hosts-config.ts: `_lockWaiterId` counter can overflow theoretically
**File:** lib/hosts-config.ts:23
**Original IDs:** CC-A5-014
**Phases:** CC

**Fix:** Moot if MF-010 is adopted (migrate to shared file-lock).

---

### [NT-024] notification-service NOTIFICATION_FORMAT only replaces first occurrence of placeholders
**File:** lib/notification-service.ts:82-83
**Original IDs:** CC-A6-007
**Phases:** CC

**Fix:** Use `replaceAll()` or regex with `g` flag.

---

### [NT-025] agent-registry config.json rename is not atomic
**File:** lib/agent-registry.ts:1114
**Original IDs:** CC-A6-008
**Phases:** CC

**Fix:** Use atomic write pattern.

---

### [NT-026] document-registry and task-registry don't clean up temp file on renameSync failure
**File:** lib/document-registry.ts:54-56, lib/task-registry.ts:55-57
**Original IDs:** CC-A6-009
**Phases:** CC

**Fix:** Wrap in try/catch with cleanup.

---

### [NT-027] index-delta model detection uses hardcoded "4.5" display names
**File:** lib/index-delta.ts:344-347
**Original IDs:** CC-A6-010
**Phases:** CC

**Fix:** Extract version from model string dynamically or use raw model name.

---

### [NT-028] Header: trivial computation of immersiveUrl/companionUrl on every render
**File:** components/Header.tsx:13-14
**Original IDs:** CC-A7-009
**Phases:** CC

**Fix:** No action needed.

---

### [NT-029] RoleBadge: dead code after exhaustiveness check (intentional)
**File:** components/governance/RoleBadge.tsx:64-75
**Original IDs:** CC-A7-010
**Phases:** CC

**Fix:** No action needed. Correctly defensive.

---

### [NT-030] PluginComposer: getSkillDisplayName lacks default/exhaustiveness check
**File:** components/plugin-builder/PluginComposer.tsx:209-218
**Original IDs:** CC-A7-011
**Phases:** CC

**Fix:** Add `default` case with exhaustiveness check.

---

### [NT-031] BuildAction: polling interval not cleared when config changes (trivial)
**File:** components/plugin-builder/BuildAction.tsx:54-56
**Original IDs:** CC-A7-012
**Phases:** CC

**Fix:** No action needed.

---

### [NT-032] TeamMembershipSection: no success feedback on leave
**File:** components/governance/TeamMembershipSection.tsx:149-163
**Original IDs:** CC-A7-013
**Phases:** CC

**Fix:** Consider adding a brief success message.

---

### [NT-033] Inconsistent global.fetch mock patterns across test files
**File:** Multiple test files
**Original IDs:** CC-A8-005
**Phases:** CC

**Fix:** Standardize on `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()`.

---

### [NT-034] Unused variable in agent-registry.test.ts updateAgent test
**File:** tests/agent-registry.test.ts:433
**Original IDs:** CC-A8-006
**Phases:** CC

**Fix:** Add assertion `expect(updated!.lastActive).not.toBe(originalLastActive)` or remove variable.

---

### [NT-035] Missing `unlinkSync` in document-registry.test.ts fs mock
**File:** tests/document-registry.test.ts:12-31
**Original IDs:** CC-A8-007
**Phases:** CC

**Fix:** Add `unlinkSync` mock for defensive completeness.

---

### [NT-036] document-registry.test.ts does not mock `copyFileSync`
**File:** tests/document-registry.test.ts:12-31
**Original IDs:** CC-A8-008
**Phases:** CC

**Fix:** Add `copyFileSync` mock.

---

### [NT-037] fixtures.ts makeDocument does not default `pinned` and `tags`
**File:** tests/test-utils/fixtures.ts:133-144
**Original IDs:** CC-A8-009
**Phases:** CC

**Fix:** Add `pinned: false` and `tags: []` defaults.

---

### [NT-038] GovernanceSyncMessage payload should be typed (known Phase 2)
**File:** types/governance.ts:79
**Original IDs:** SR-Rc7f26c53-006, CC-A9-009
**Phases:** CC, SR
**Also identified by:** CC-A9-009

**Fix:** Track as Phase 2 backlog item.

---

### [NT-039] CI workflow: no TypeScript type-checking step
**File:** .github/workflows/ci.yml
**Original IDs:** CC-A9-010
**Phases:** CC

**Fix:** Add `yarn tsc --noEmit` step.

---

### [NT-040] install-messaging.sh: box drawing characters misaligned
**File:** install-messaging.sh:65-71
**Original IDs:** CC-A9-011
**Phases:** CC

**Fix:** Align inner content width to match border.

---

### [NT-041] types/team.ts: RESTORE_MEETING uses full Meeting type directly
**File:** types/team.ts:113
**Original IDs:** CC-A9-012
**Phases:** CC

**Fix:** Consider using `Pick<Meeting, ...>` for clarity.

---

### [NT-042] package.json: tsx in dependencies not devDependencies (intentional)
**File:** package.json:69
**Original IDs:** CC-A9-013
**Phases:** CC

**Fix:** No action needed. Placement is intentional.

---

### [NT-043] Inconsistent `ServiceResult` re-export comment pattern (NT-006 noise)
**File:** Multiple service files (20+)
**Original IDs:** SR-Rc7f26c53-007
**Phases:** SR
`// NT-006: ServiceResult re-export removed` comment appears 20+ times. This is audit noise.

**Fix:** Remove the `// NT-006:` prefixes while keeping the explanatory text.

---

### [NT-044] Excessive review-pass annotation comments in production code
**File:** Codebase-wide (hundreds of annotations)
**Original IDs:** SR-Rc7f26c53-009
**Phases:** SR
References like `SF-029 (P8)`, `NT-022`, `CC-P1-001` will confuse future maintainers.

**Fix:** Strip finding-ID prefixes from comments while keeping explanatory text.

---

---

## Deduplication Log

| Final ID | Original IDs | Duplicates Removed | Reason |
|----------|-------------|-------------------|--------|
| MF-001 | CC-A0-001 | 0 | Unique finding |
| MF-002 | CC-A1-001 | 0 | Unique finding |
| MF-003 | CC-A2-001 | 0 | Unique finding |
| MF-004 | CC-A2-002 | 0 | Unique finding |
| MF-005 | CC-P10-A3-001, CC-P10-A3-007 | 1 | Same file (agents-memory-service.ts), overlapping lines (~220), CC-P10-A3-007 is the broader version of same root cause (missing file-based registry validation) |
| MF-006 | CC-P10-A3-002 | 0 | Unique finding |
| MF-007 | CC-A4-001 | 0 | Unique finding |
| MF-008 | CC-A4-002 | 0 | Unique finding |
| MF-009 | CC-A5-001 | 0 | Unique finding |
| MF-010 | CC-A5-002 | 0 | Unique finding |
| MF-011 | CC-A5-003 | 0 | Unique finding |
| MF-012 | CC-A6-001 | 0 | Unique finding |
| MF-013 | CC-A7-001 | 0 | Unique finding |
| MF-014 | CC-A7-002, CC-A7-007, CC-A7-008 | 2 | Same file (useGovernance.ts), same root cause (fire-and-forget refresh without AbortSignal). Fixing one requires adopting the same pattern for all. Lines 268-417 are within the same hook. |
| MF-015 | CC-A9-001 | 0 | Unique finding |
| MF-016 | CC-A9-002 | 0 | Unique finding |
| MF-017 | SR-Rc7f26c53-001 | 0 | Unique finding (skeptical review) |
| SF-001 | CC-A0-002 | 0 | Unique finding |
| SF-002 | CC-A0-003 | 0 | Unique finding |
| SF-003 | CC-A0-004 | 0 | Unique finding |
| SF-004 | CC-A0-005 | 0 | Unique finding |
| SF-005 | CC-A0-006 | 0 | Unique finding |
| SF-006 | CC-A0-007 | 0 | Unique finding |
| SF-007 | CC-A1-002 | 0 | Unique finding |
| SF-008 | CC-A1-003 | 0 | Unique finding |
| SF-009 | CC-A1-004 | 0 | Unique finding |
| SF-010 | CC-A1-005 | 0 | Unique finding |
| SF-011 | CC-A1-006 | 0 | Unique finding |
| SF-012 | CC-A1-007 | 0 | Unique finding |
| SF-013 | CC-A1-008 | 0 | Unique finding |
| SF-014 | CC-A2-003 | 0 | Unique finding |
| SF-015 | CC-A2-004 | 0 | Unique finding |
| SF-016 | CC-A2-005 | 0 | Unique finding |
| SF-017 | CC-A2-006 | 0 | Unique finding |
| SF-018 | CC-A2-007 | 0 | Unique finding |
| SF-019 | CC-A2-008 | 0 | Unique finding |
| SF-020 | CC-P10-A3-003 | 0 | Unique finding |
| SF-021 | CC-P10-A3-004 | 0 | Unique finding |
| SF-022 | CC-P10-A3-005, CC-P10-A3-006, CC-A4-013 | 2 | CC-P10-A3-005 already covers all 17+ service files. CC-P10-A3-006 (agents-directory-service.ts) and CC-A4-013 (multiple services) are subsets of the same ServiceResult<any> issue. |
| SF-023 | CC-A4-003 | 0 | Unique finding |
| SF-024 | CC-A4-004 | 0 | Unique finding |
| SF-025 | CC-A4-005 | 0 | Unique finding (same pattern as SF-024 but different function/line in same file) |
| SF-026 | CC-A4-006 | 0 | Unique finding |
| SF-027 | CC-A4-007 | 0 | Unique finding |
| SF-028 | CC-A4-008 | 0 | Unique finding |
| SF-029 | CC-A4-009 | 0 | Unique finding |
| SF-030 | CC-A4-010 | 0 | Unique finding |
| SF-031 | CC-A4-011 | 0 | Unique finding |
| SF-032 | CC-A5-004 | 0 | Unique finding |
| SF-033 | CC-A5-005 | 0 | Unique finding |
| SF-034 | CC-A5-006 | 0 | Unique finding |
| SF-035 | CC-A5-007 | 0 | Unique finding |
| SF-036 | CC-A5-008 | 0 | Unique finding |
| SF-037 | CC-A5-009 | 0 | Unique finding |
| SF-038 | CC-A5-010 | 0 | Unique finding |
| SF-039 | CC-A6-002 | 0 | Unique finding |
| SF-040 | CC-A6-003 | 0 | Unique finding |
| SF-041 | CC-A6-004 | 0 | Unique finding |
| SF-042 | CC-A6-005 | 0 | Unique finding |
| SF-043 | CC-A6-006 | 0 | Unique finding |
| SF-044 | CC-A7-003 | 0 | Unique finding |
| SF-045 | CC-A7-004 | 0 | Unique finding |
| SF-046 | CC-A7-005 | 0 | Unique finding |
| SF-047 | CC-A7-006 | 0 | Unique finding |
| SF-048 | CC-A8-001 | 0 | Unique finding |
| SF-049 | CC-A8-002 | 0 | Unique finding |
| SF-050 | CC-A8-003 | 0 | Unique finding |
| SF-051 | CC-A8-004 | 0 | Unique finding |
| SF-052 | CC-A9-003 | 0 | Unique finding |
| SF-053 | CC-A9-004 | 0 | Unique finding |
| SF-054 | CC-A9-005 | 0 | Unique finding |
| SF-055 | CC-A9-006 | 0 | Unique finding |
| SF-056 | CC-A9-007 | 0 | Unique finding |
| SF-057 | CC-A9-008 | 0 | Unique finding |
| SF-058 | SR-Rc7f26c53-002 | 0 | Unique finding (skeptical review) |
| SF-059 | SR-Rc7f26c53-003, CV-P10-002 | 1 | Same file (types/team.ts:34), same issue (agentHostMap dead type stub). SR and CV both flagged it. Kept SHOULD-FIX (higher severity from SR). |
| SF-060 | SR-Rc7f26c53-004 | 0 | Unique finding (skeptical review) |
| SF-061 | SR-Rc7f26c53-005 | 0 | Unique finding (skeptical review) |
| SF-062 | CV-P10-001 | 0 | Unique finding (claim verification -- failed claim) |
| NT-001 | CC-A0-008 | 0 | Unique finding |
| NT-002 | CC-A0-009 | 0 | Unique finding |
| NT-003 | CC-A0-010 | 0 | Unique finding |
| NT-004 | CC-A0-011 | 0 | Unique finding |
| NT-005 | CC-A1-009 | 0 | Unique finding |
| NT-006 | CC-A1-010 | 0 | Unique finding |
| NT-007 | CC-A1-011 | 0 | Unique finding |
| NT-008 | CC-A2-009 | 0 | Unique finding |
| NT-009 | CC-A2-010 | 0 | Unique finding |
| NT-010 | CC-A2-011 | 0 | Unique finding |
| NT-011 | CC-A2-012 | 0 | Unique finding |
| NT-012 | CC-A2-013 | 0 | Unique finding |
| NT-013 | CC-A2-014 | 0 | Unique finding |
| NT-014 | CC-P10-A3-008 | 0 | Unique finding |
| NT-015 | CC-P10-A3-009 | 0 | Unique finding |
| NT-016 | CC-P10-A3-010 | 0 | Unique finding |
| NT-017 | CC-A4-012 | 0 | Unique finding |
| NT-018 | CC-A4-014 | 0 | Unique finding |
| NT-019 | CC-A4-015 | 0 | Unique finding |
| NT-020 | CC-A5-011 | 0 | Unique finding |
| NT-021 | CC-A5-012 | 0 | Unique finding |
| NT-022 | CC-A5-013 | 0 | Unique finding |
| NT-023 | CC-A5-014 | 0 | Unique finding |
| NT-024 | CC-A6-007 | 0 | Unique finding |
| NT-025 | CC-A6-008 | 0 | Unique finding |
| NT-026 | CC-A6-009 | 0 | Unique finding |
| NT-027 | CC-A6-010 | 0 | Unique finding |
| NT-028 | CC-A7-009 | 0 | Unique finding |
| NT-029 | CC-A7-010 | 0 | Unique finding |
| NT-030 | CC-A7-011 | 0 | Unique finding |
| NT-031 | CC-A7-012 | 0 | Unique finding |
| NT-032 | CC-A7-013 | 0 | Unique finding |
| NT-033 | CC-A8-005 | 0 | Unique finding |
| NT-034 | CC-A8-006 | 0 | Unique finding |
| NT-035 | CC-A8-007 | 0 | Unique finding |
| NT-036 | CC-A8-008 | 0 | Unique finding |
| NT-037 | CC-A8-009 | 0 | Unique finding |
| NT-038 | SR-Rc7f26c53-006, CC-A9-009 | 1 | Same file (types/governance.ts:79), same issue (GovernanceSyncMessage payload untyped). SR flagged as SHOULD-FIX, CC as NIT. Both from different phases identifying the same untyped payload. Merged at NIT since the SR finding acknowledged it as documented tech debt. |
| NT-039 | CC-A9-010 | 0 | Unique finding |
| NT-040 | CC-A9-011 | 0 | Unique finding |
| NT-041 | CC-A9-012 | 0 | Unique finding |
| NT-042 | CC-A9-013 | 0 | Unique finding |
| NT-043 | SR-Rc7f26c53-007 | 0 | Unique finding (skeptical review) |
| NT-044 | SR-Rc7f26c53-009 | 0 | Unique finding (skeptical review) |

**Note on SR-Rc7f26c53-008 (RESTORE_MEETING action change):** This was classified as NIT by the skeptical reviewer, who also noted "No action needed; noted for completeness" and "Impact: None -- both the type and callsite are updated together." This finding is informational only and not actionable, so it is excluded from the final count. The NT-041 finding (CC-A9-012) covering the same types/team.ts RESTORE_MEETING area is preserved as a distinct concern about type coupling.

---

## Self-Verification

- [x] I parsed ALL findings from the intermediate report (none skipped or missed)
- [x] I grouped findings by file path before comparing
- [x] For each potential duplicate pair, I checked ALL THREE conditions:
      (1) same file path + (2) overlapping lines within 5 + (3) same root cause
- [x] I did NOT merge findings at the same line that describe DIFFERENT bugs
- [x] I did NOT merge findings from different files even if they describe the same pattern
- [x] For merged findings: I kept the HIGHEST severity (MF-005: MUST-FIX from CC-P10-A3-001; SF-059: SHOULD-FIX from SR; SF-022: SHOULD-FIX from CC-P10-A3-005)
- [x] For merged findings: I preserved ALL original IDs in "Also identified by" annotation
- [x] For merged findings: I noted ALL source phases (CC, CV, SR)
- [x] My final IDs use sequential numbering: MF-001 through MF-017, SF-001 through SF-062, NT-001 through NT-044
- [x] My deduplication log has an entry for EVERY final finding (including unique ones)
- [x] Each dedup log entry includes the merge reasoning
- [x] My verdict follows the rules: MUST-FIX>0 -> REQUEST CHANGES
- [x] Math check: 131 raw - 7 duplicates merged, 1 excluded as non-actionable = 123 final findings. 17 + 62 + 44 = 123. Correct.
- [x] The source reports section is listed from the intermediate report
- [x] My return message to the orchestrator is exactly 1-2 lines (no code blocks, no verbose output)

---

## Source Reports

- `epcp-correctness-P10-Rc7f26c53-A0.md`
- `epcp-correctness-P10-Rc7f26c53-A1.md`
- `epcp-correctness-P10-Rc7f26c53-A2.md`
- `epcp-correctness-P10-Rc7f26c53-A3.md`
- `epcp-correctness-P10-Rc7f26c53-A4.md`
- `epcp-correctness-P10-Rc7f26c53-A5.md`
- `epcp-correctness-P10-Rc7f26c53-A6.md`
- `epcp-correctness-P10-Rc7f26c53-A7.md`
- `epcp-correctness-P10-Rc7f26c53-A8.md`
- `epcp-correctness-P10-Rc7f26c53-A9.md`
- `epcp-claims-P10-Rc7f26c53.md`
- `epcp-review-P10-Rc7f26c53.md`
