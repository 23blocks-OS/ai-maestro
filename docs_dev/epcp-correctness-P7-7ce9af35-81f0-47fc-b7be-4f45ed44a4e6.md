# Code Correctness Report: lib

**Agent:** epcp-code-correctness-agent
**Domain:** lib
**Pass:** 7
**Finding ID Prefix:** CC-P7-A5
**Files audited:** 25 (tmux-discovery.ts does not exist)
**Date:** 2026-02-22T22:27:00Z

## MUST-FIX

(none found)

## SHOULD-FIX

### [CC-P7-A5-001] saveTeams atomic write uses shared tmp filename without process.pid
- **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:247
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveTeams()` uses `TEAMS_FILE + '.tmp'` as a fixed temp file path, unlike every other registry in the codebase which uses `+ '.tmp.' + process.pid` (e.g., task-registry.ts:55, governance-request-registry.ts:76, amp-auth.ts:85, governance-peers.ts:66). If two concurrent callers invoke `saveTeams()` simultaneously (even within the same process via event loop interleaving between the `writeFileSync` and `renameSync` calls), the second caller's `writeFileSync` could overwrite the first caller's temp file before the first caller's `renameSync` completes, potentially leading to data loss. This is a real risk because `saveTeams` is called inside `withLock` in `createTeam`/`updateTeam`/`deleteTeam`, but it is also called WITHOUT a lock in the `loadTeams` migration path (line 233).
- **Evidence:**
  ```typescript
  // team-registry.ts:247-249
  const tmpFile = TEAMS_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, TEAMS_FILE)
  ```
  Compare with the pattern used in every other registry:
  ```typescript
  // task-registry.ts:55
  const tmpPath = `${filePath}.tmp.${process.pid}`
  ```
- **Fix:** Change `TEAMS_FILE + '.tmp'` to `` TEAMS_FILE + `.tmp.${process.pid}` `` to match the pattern used throughout the rest of the codebase.

### [CC-P7-A5-002] transfer-registry.ts atomic write uses shared tmp filename without process.pid
- **File:** /Users/emanuelesabetta/ai-maestro/lib/transfer-registry.ts:60
- **Severity:** SHOULD-FIX
- **Category:** race-condition
- **Confidence:** CONFIRMED
- **Description:** `saveTransfers()` uses `` `${TRANSFERS_FILE}.tmp` `` (no process.pid suffix), same issue as CC-P7-A5-001. Although `saveTransfers` is always called inside `withLock('transfers')`, the fixed temp filename is inconsistent with the codebase pattern and could cause issues if the code is ever refactored to allow concurrent callers.
- **Evidence:**
  ```typescript
  // transfer-registry.ts:60
  const tmpFile = `${TRANSFERS_FILE}.tmp`
  ```
- **Fix:** Change to `` `${TRANSFERS_FILE}.tmp.${process.pid}` `` for consistency and future safety.

## NIT

### [CC-P7-A5-003] amp-auth.ts createApiKey body not indented under withLock
- **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:162-183
- **Severity:** NIT
- **Category:** style
- **Confidence:** CONFIRMED
- **Description:** The body of `createApiKey()` has the code inside `withLock()` not indented to the lock callback level. Lines 163-182 are at the same indentation as the `return withLock(...)` line, making it visually unclear that all logic runs under the lock. This is a cosmetic/readability issue only; the code is functionally correct.
- **Evidence:**
  ```typescript
  export async function createApiKey(...): Promise<string> {
    // SF-004: Serialize read-modify-write on the API keys file
    return withLock('amp-api-keys', () => {
    const apiKey = generateApiKey()   // <-- should be indented one more level
    const keyHash = hashApiKey(apiKey)
    // ...
    return apiKey
    }) // end withLock('amp-api-keys')
  }
  ```
- **Fix:** Indent the body of the `withLock` callback by one additional level.

## CLEAN

Files with no issues found:
- /Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/agent-runtime.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/file-lock.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/governance.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/host-keys.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/message-send.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/team-acl.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/types/amp.ts -- No issues
- /Users/emanuelesabetta/ai-maestro/lib/validation.ts -- No issues

Files not found:
- /Users/emanuelesabetta/ai-maestro/lib/tmux-discovery.ts -- File does not exist on disk

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P7-A5-001, -002, -003
- [x] My report file uses the UUID filename: epcp-correctness-P7-7ce9af35-81f0-47fc-b7be-4f45ed44a4e6.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
