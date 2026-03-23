# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:23.447Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-60800534-557b-4f15-989d-205b9731c60b.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-60800534-557b-4f15-989d-205b9731c60b.md
Line 1: # Code Correctness Report: lib
Line 1: # Code Correctness Report: lib
Line 2: **Agent:** epcp-code-correctness-agent (A5)
Line 3: **Domain:** lib
Line 4: **Files audited:** 26 (1 of 27 requested files does not exist: lib/tmux-discovery.ts)
Line 19: - **File:** /Users/emanuelesabetta/ai-maestro/lib/hosts-config.ts:20-79
Line 20: - **Severity:** MUST-FIX
Line 21: - **Category:** logic
Line 22: - **Confidence:** CONFIRMED
Line 23: - **Description:** `hosts-config.ts` implements its own `acquireLock`/`releaseLock`/`withLock` functions (lines 20-79), separate from and with different behavior than the canonical `file-lock.ts`. Crucially, the hosts-config lock has a **5-second timeout** (vs 30 seconds in file-lock.ts), uses a different queue structure (object with resolve/reject vs function callbacks), and critically: when the timeout fires in `acquireLock()`, the `findIndex` comparison uses function reference equality on the `resolve` wrapper (line 35: `item.resolve === resolve`), but the stored `resolve` (line 43) is a **wrapper** around the promise's `resolve`, not the raw promise resolver. This means the wrapper reference might not match `resolve` from the outer closure depending on how the variable is captured. Let me re-verify: the `resolve` referenced on line 35 refers to the parameter of the Promise executor, and line 43 wraps it. On line 35 `item.resolve === resolve` compares the *wrapped* function (stored) with the *raw* resolve -- these will never be equal because line 43 assigns a new function. This means timed-out waiters will never be removed from the queue, causing a memory leak and phantom lock grants.
Line 48: - **Fix:** The `findIndex` on timeout should compare by a stable identifier (e.g., store the timeout ID or use a unique index), or store the raw `resolve` alongside the wrapper. Alternatively, migrate to using the canonical `withLock` from `file-lock.ts` with a 'hosts-config' lock name.
Line 50: ### [CC-P9-A5-002] index-delta.ts acquireIndexSlot references `entry` before it is declared
Line 51: - **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:51
Line 52: - **Severity:** MUST-FIX
Line 53: - **Category:** logic
Line 54: - **Confidence:** CONFIRMED
Line 55: - **Description:** In `acquireIndexSlot()`, the timeout callback on line 51 references `entry.timestamp`, but `entry` is declared on line 56 (5 lines later). JavaScript hoists `const` declarations but does not initialize them, so accessing `entry.timestamp` in the timeout would throw a `ReferenceError: Cannot access 'entry' before initialization` if the timeout fires before `entry` is assigned. In practice, since the timeout is asynchronous (at least 60 seconds), `entry` will always be initialized by the time the callback fires. However, this is a temporal dead zone (TDZ) hazard -- if `INDEX_SLOT_TIMEOUT_MS` were ever set to 0 or the event loop were starved, it could crash.
Line 69: - **Fix:** Move the `entry` declaration before the `setTimeout` call, or capture `entry.timestamp` in a separate variable declared before the timeout.
Line 71: ### [CC-P9-A5-003] amp-auth.ts validateApiKey mutates shared cache without lock protection
Line 72: - **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:216-246
Line 73: - **Severity:** MUST-FIX
Line 74: - **Category:** race-condition
Line 75: - **Confidence:** CONFIRMED
Line 76: - **Description:** `validateApiKey()` is synchronous and intentionally lock-free. It calls `_loadApiKeysRaw()` which returns the shared cache reference (line 216). When the debounce interval passes, it mutates `record.last_used_at` in-place (line 243) and then calls `saveApiKeys(keys)` (line 244) which writes ALL keys to disk. If two concurrent HTTP requests both hit the debounce window simultaneously, both will call `saveApiKeys(keys)` with the same array reference -- the second write will overwrite the first. This is a data race on the `last_used_at` field. While the comment on line 209-211 acknowledges this, the actual risk is not just lost `last_used_at` updates -- if `createApiKey` or `revokeApiKey` runs between the two saves, the second `saveApiKeys` call in `validateApiKey` will overwrite the newly created/revoked key because it holds a stale snapshot. The in-memory cache prevents this from being visible but disk state can diverge from cache after TTL expiry.
Line 90: - **Fix:** Either: (a) wrap the `saveApiKeys` call inside `withLock('amp-api-keys')` (making that part async), or (b) schedule the lastUsed write via a debounced async callback that acquires the lock, re-reads from cache, updates `last_used_at`, and saves.
Line 93: ### [CC-P9-A5-004] messageQueue.ts deleteMessage has no lock protection for concurrent access
Line 94: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:857-868
Line 95: - **Severity:** SHOULD-FIX
Line 96: - **Category:** race-condition
Line 97: - **Confidence:** CONFIRMED
Line 98: - **Description:** `deleteMessage()` calls `findMessagePath()` (which resolves the agent and finds the file) and then calls `fs.unlink()` without any lock. Unlike `markMessageAsRead` (line 777) and `archiveMessage` (line 828) which both use `withLock('msg-${messageId}')`, deleteMessage has no lock. If a concurrent `markMessageAsRead` or `archiveMessage` is writing to the same file, the delete could race with the write, potentially causing an error on the write side (ENOENT after unlink) or deleting a file that was just updated.
Line 110: - **Fix:** Wrap the unlink in `withLock('msg-${messageId}', async () => { ... })` to match the pattern used by `markMessageAsRead` and `archiveMessage`.
Line 112: ### [CC-P9-A5-005] governance-peers.ts savePeerGovernance has no file lock
Line 113: - **File:** /Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts:60-68
Line 114: - **Severity:** SHOULD-FIX
Line 115: - **Category:** race-condition
Line 116: - **Confidence:** CONFIRMED
Line 117: - **Description:** `savePeerGovernance()` writes to `~/.aimaestro/governance-peers/{hostId}.json` using atomic write (temp+rename), but without any lock. If two governance sync messages arrive from the same peer simultaneously, both will write to the same file. The atomic rename prevents corruption, but the last writer wins, potentially losing the earlier update if it contained newer data. Unlike other registries that use `withLock`, peer governance writes are unprotected.
Line 129: - **Fix:** Use `withLock('governance-peers-' + hostId, ...)` to serialize writes per peer host.
Line 131: ### [CC-P9-A5-006] message-filter.ts passes alias strings into checkMessageAllowed where UUIDs are expected
Line 132: - **File:** /Users/emanuelesabetta/ai-maestro/lib/message-send.ts:180-187
Line 133: - **Severity:** SHOULD-FIX