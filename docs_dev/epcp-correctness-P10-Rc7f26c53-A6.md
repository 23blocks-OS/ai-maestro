# Code Correctness Report: lib-other (agents, messaging, other)

**Agent:** epcp-code-correctness-agent (A6)
**Domain:** lib-other
**Files audited:** 12 (lib/tmux-discovery.ts does not exist, skipped)
**Date:** 2026-02-26T00:00:00Z
**Run ID:** Rc7f26c53

## MUST-FIX

### [CC-A6-001] getSentCount counts top-level entries only, misses messages in subdirectories
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:737-740
- **Severity:** MUST-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getSentCount()` uses `readdirSync(sentDir)` and counts `.json` files at the top level of the sent directory. However, `writeToAMPSent()` in amp-inbox-writer.ts stores sent messages in `sent/{recipientDir}/{messageId}.json` -- a nested subdirectory structure. The top-level entries in the sent directory are recipient-name subdirectories (e.g., `alice/`, `bob@host/`), not `.json` files. This means `getSentCount()` always returns 0 for AMP-format sent messages.
- **Evidence:**
```typescript
// getSentCount (messageQueue.ts:737-740):
const entries = fsSync.readdirSync(sentDir)
return entries.filter(e => e.endsWith('.json')).length
// ^ Only counts .json at top level -- but messages are in subdirectories

// writeToAMPSent (amp-inbox-writer.ts:388-392) stores messages in subdirectories:
const recipientDir = sanitizeAddressForPath(envelope.to)
const sentRecipientDir = path.join(agentSentDir, recipientDir)
await fs.mkdir(sentRecipientDir, { recursive: true })
// Writes message as: sent/{recipientDir}/{messageId}.json
```
- **Fix:** Recurse into subdirectories to count `.json` files. Example:
```typescript
let count = 0
for (const entry of entries) {
  const entryPath = path.join(sentDir, entry)
  const stat = fsSync.statSync(entryPath)
  if (stat.isDirectory()) {
    const files = fsSync.readdirSync(entryPath)
    count += files.filter(f => f.endsWith('.json')).length
  } else if (entry.endsWith('.json')) {
    count++
  }
}
return count
```

## SHOULD-FIX

### [CC-A6-002] index-delta acquireIndexSlot timeout-rejection entry may match wrong queue item
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:59
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** LIKELY
- **Description:** The timeout handler in `acquireIndexSlot` finds the queue entry by matching both `agentId` and `timestamp` (line 59). If the same agentId happens to call `acquireIndexSlot` twice at the exact same millisecond (e.g., rapid API retries), both entries share `agentId` and `timestamp`, so `findIndex` would return the first one, and the timeout for the second entry could splice the wrong queue item. While unlikely due to `Date.now()` millisecond granularity, it is a correctness concern.
- **Evidence:**
```typescript
const idx = indexQueue.findIndex(q => q.agentId === agentId && q.timestamp === entry.timestamp)
```
- **Fix:** Use the `entry` object reference directly for identification: `const idx = indexQueue.indexOf(entry)`. This is simpler and always correct regardless of timestamp collisions.

### [CC-A6-003] agent-registry updateAgent tmux rename uses base name, not computed session name
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:506
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** In `updateAgent()`, when renaming an agent, the code checks `sessionExistsSync(currentName)` using the raw agent name, not the computed session name (which includes `_0` suffix for session index). The actual tmux session name is computed via `computeSessionName(agentName, sessionIndex)`. So if the session is named `myagent_0`, `sessionExistsSync('myagent')` will return false (tmux has-session doesn't match partial names), and the tmux rename is silently skipped.
- **Evidence:**
```typescript
// agent-registry.ts:506-508
if (sessionExistsSync(currentName)) {
  renameSessionSync(currentName, newName)
  console.log(`[Agent Registry] Renamed tmux session: ${currentName} -> ${newName}`)
}
```
- **Fix:** Iterate through the agent's sessions array and use `computeSessionName(currentName, s.index)` / `computeSessionName(newName, s.index)` for each, similar to how `killAgentSessions()` (line 619-636) iterates `agent.sessions`.

### [CC-A6-004] agent-registry renameAgent does not rename tmux sessions (only updateAgent does)
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:1060-1126
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `renameAgent()` updates the agent name in the registry, updates AMP index, and updates config.json, but does NOT rename the tmux session. The tmux session rename only happens in `updateAgent()` (lines 503-514). So when `renameAgent()` is called directly (e.g., from `renameAgentSession` on line 1144, or from API routes), the tmux session keeps its old name while the registry points to the new name, creating a mismatch.
- **Evidence:**
```typescript
// renameAgent (lines 1060-1126): no tmux rename code
export async function renameAgent(agentId: string, newName: string): Promise<boolean> {
  return withLock('agents', () => {
    // ... updates registry, saves, updates AMP index ...
    // NO call to renameSessionSync anywhere
    return saved
  })
}

// updateAgent (lines 503-514): DOES rename tmux session
if (sessionExistsSync(currentName)) {
  renameSessionSync(currentName, newName)
}
```
- **Fix:** Add tmux session renaming to `renameAgent()` for each session in the agent's sessions array. Iterate through `agents[index].sessions` and call `renameSessionSync(computeSessionName(oldName, s.index), computeSessionName(normalizedNewName, s.index))`.

### [CC-A6-005] message-send forwardFromUI marks forwarded messages as fromVerified=true unconditionally
- **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:574
- **Severity:** SHOULD-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** In `forwardFromUI()`, the forwarded message is always delivered with `senderPublicKeyHex: VERIFIED_LOCAL_SENDER` (line 574). The comment says "Forwards are always from a local verified agent." However, `forwardFromUI` only checks that the sender (`fromAgent`) resolves via `resolveAgentIdentifier`, which resolves any agent including those registered via AMP external API. An externally-registered agent with no cryptographic verification could forward a message, and the forwarded message would be marked as verified.
- **Evidence:**
```typescript
// message-send.ts:574
senderPublicKeyHex: VERIFIED_LOCAL_SENDER,  // CC-P4-008: Forwards are always from a local verified agent
```
- **Fix:** Check whether the sender agent is actually local and verified before using VERIFIED_LOCAL_SENDER. For AMP-external agents, omit the senderPublicKeyHex or use the actual key.

### [CC-A6-006] messageQueue getUnreadCount loads all messages just to count them
- **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:885-888
- **Severity:** SHOULD-FIX
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `getUnreadCount()` calls `listInboxMessages(agentIdentifier, { status: 'unread' })` which reads and parses every message file in the inbox, converts AMP envelopes, applies filters, sorts by timestamp, and then returns an array. `getUnreadCount` only uses `.length`. For agents with many messages, this is very wasteful. Similarly, `getMessageStats()` (line 923) loads all messages just to count them. This is a performance issue that affects responsiveness.
- **Evidence:**
```typescript
export async function getUnreadCount(agentIdentifier: string): Promise<number> {
  const messages = await listInboxMessages(agentIdentifier, { status: 'unread' })
  return messages.length
}
```
- **Fix:** Add an optimized count-only path that reads only the `metadata.status` / `local.status` field from each JSON file without full conversion and sorting.

## NIT

### [CC-A6-007] notification-service NOTIFICATION_FORMAT only replaces first occurrence of placeholders
- **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:82-83
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** `String.replace()` with a string argument (not regex) only replaces the first occurrence. If the user configures `NOTIFICATION_FORMAT` with multiple `{from}` or `{subject}` placeholders, only the first would be replaced.
- **Evidence:**
```typescript
let message = NOTIFICATION_FORMAT
  .replace('{from}', senderWithHost)
  .replace('{subject}', subject)
```
- **Fix:** Use `replaceAll('{from}', ...)` or a regex with `g` flag: `.replace(/\{from\}/g, ...)`. Low impact since the default template only has one of each.

### [CC-A6-008] agent-registry config.json rename is not atomic
- **File:** /Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts:1114
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** When renaming an agent, the AMP `config.json` is updated via direct `writeFileSync` without atomic write (temp+rename). Other files in the codebase use atomic writes consistently (e.g., `saveAgents`, `saveApiKeys`). A crash during this write could corrupt config.json.
- **Evidence:**
```typescript
// line 1114
fs.writeFileSync(configPath, JSON.stringify(configData, null, 2))
```
- **Fix:** Use the same atomic write pattern: write to `configPath + '.tmp.' + process.pid`, then `renameSync`.

### [CC-A6-009] document-registry and task-registry saveDocuments does not clean up temp file on renameSync failure
- **File:** /Users/emanuelesabetta/ai-maestro/lib/document-registry.ts:54-56, /Users/emanuelesabetta/ai-maestro/lib/task-registry.ts:55-57
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** If `fs.writeFileSync(tmpPath, ...)` succeeds but `fs.renameSync(tmpPath, filePath)` fails (e.g., cross-device), the temp file is left on disk. Same pattern in both document-registry.ts and task-registry.ts.
- **Evidence:**
```typescript
const tmpPath = `${filePath}.tmp.${process.pid}`
fs.writeFileSync(tmpPath, JSON.stringify(file, null, 2), 'utf-8')
fs.renameSync(tmpPath, filePath)
// No cleanup of tmpPath on renameSync failure
```
- **Fix:** Wrap in try/catch with cleanup: `try { fs.renameSync(...) } catch(e) { try { fs.unlinkSync(tmpPath) } catch {} throw e }`. Low priority since the same pattern is used across the codebase.

### [CC-A6-010] index-delta model detection uses hardcoded "4.5" display names
- **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:344-347
- **Severity:** NIT
- **Category:** logic
- **Confidence:** CONFIRMED
- **Description:** The model detection hardcodes "Sonnet 4.5", "Haiku 4.5", "Opus 4.5" as display names, but Claude models evolve over time. The current date is 2026-02-26 and newer model names include "claude-opus-4-6" etc. The pattern-matching (`model.includes('sonnet')`, etc.) is loose enough to catch variants, but the display names will always show "4.5".
- **Evidence:**
```typescript
if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
else if (model.includes('opus')) modelSet.add('Opus 4.5')
```
- **Fix:** Extract the version from the model string dynamically, or just use the raw model name: `modelSet.add(model)`.

## CLEAN

Files with no issues found:
- `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` -- Clean, well-structured with clear case analysis and unreachable guard
- `/Users/emanuelesabetta/ai-maestro/lib/agent-runtime.ts` -- Clean, sendKeys properly uses execFileAsync (no shell injection), literal mode works correctly
- `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts` -- Clean, properly handles expired windows, test-safe interval guard with unref()
- `/Users/emanuelesabetta/ai-maestro/lib/types/amp.ts` -- Clean, well-typed interfaces with proper validation in parseAMPAddress
- `/Users/emanuelesabetta/ai-maestro/lib/tmux-discovery.ts` -- File does not exist (listed in task but not present on disk)

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-A6-001, -002, ...
- [x] My report file uses the correct filename: epcp-correctness-P10-Rc7f26c53-A6.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
