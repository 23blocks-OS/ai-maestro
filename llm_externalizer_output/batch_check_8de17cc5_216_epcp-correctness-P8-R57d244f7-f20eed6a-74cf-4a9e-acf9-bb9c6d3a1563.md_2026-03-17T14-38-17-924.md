# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:17.924Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P8-R57d244f7-f20eed6a-74cf-4a9e-acf9-bb9c6d3a1563.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P8-R57d244f7-f20eed6a-74cf-4a9e-acf9-bb9c6d3a1563.md
Line 1: # Code Correctness Report: lib
Line 2: **Agent:** epcp-code-correctness-agent
Line 3: **Domain:** lib
Line 4: **Files audited:** 25 (1 file `lib/tmux-discovery.ts` does not exist on disk, 24 files read completely)
Line 5: **Date:** 2026-02-23T02:30:00Z
Line 6: **Pass:** 8
Line 7: **Run ID:** 57d244f7
Line 8: **Finding ID Prefix:** CC-P8-A5
Line 11: ### [CC-P8-A5-001] Notification service shell injection via literal tmux send-keys with embedded echo command
Line 12: - **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:59
Line 22: *After deeper analysis, this is not a MUST-FIX. Moved to NIT.*
Line 24: ### [CC-P8-A5-002] `fromVerified` double nullish coalescing is a no-op
Line 25: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
Line 34: *Revised severity: NIT (no runtime impact, just misleading code)*
Line 36: ## SHOULD-FIX
Line 38: ### [CC-P8-A5-003] `validateApiKey` timing side-channel via early-exit find()
Line 39: - **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:208-216
Line 56: ### [CC-P8-A5-004] `acquireIndexSlot` has no timeout -- queued items wait forever
Line 57: - **File:** /Users/emanuelesabetta/ai-maestro/lib/index-delta.ts:44-54
Line 73: ### [CC-P8-A5-005] `getMessageStats` can increment undefined priority keys
Line 74: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:926-928
Line 85: ### [CC-P8-A5-006] `loadApiKeys` returns cached mutable array -- external mutations corrupt cache
Line 86: - **File:** /Users/emanuelesabetta/ai-maestro/lib/amp-auth.ts:52-75
Line 104: ### [CC-P8-A5-007] `createTeam` chiefOfStaffId may be set to `undefined` instead of omitted
Line 105: - **File:** /Users/emanuelesabetta/ai-maestro/lib/team-registry.ts:279-281
Line 118: ## NIT
Line 120: ### [CC-P8-A5-008] `fromVerified` double nullish coalescing is misleading dead code
Line 121: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:267
Line 129: ### [CC-P8-A5-009] Notification service typing into non-shell programs is a known design limitation
Line 130: - **File:** /Users/emanuelesabetta/ai-maestro/lib/notification-service.ts:52-59
Line 139: ### [CC-P8-A5-010] `_agentCacheSweepInterval` is exported only for test cleanup, clutters module API
Line 140: - **File:** /Users/emanuelesabetta/ai-maestro/lib/messageQueue.ts:496-516
Line 149: ### [CC-P8-A5-011] `loadGovernance` returns defaults on ANY read error, not just corruption
Line 150: - **File:** /Users/emanuelesabetta/ai-maestro/lib/governance.ts:43-59
Line 161: ### [CC-P8-A5-012] Missing file in domain: `lib/tmux-discovery.ts` does not exist
Line 162: - **File:** lib/tmux-discovery.ts
Line 163: - **Severity:** NIT
Line 164: - **Category:** api-contract
Line 165: - **Confidence:** CONFIRMED
Line 166: - **Description:** The file `lib/tmux-discovery.ts` was listed in the FILES domain but does not exist on disk. The tmux discovery functionality lives in `lib/agent-runtime.ts` (TmuxRuntime class). This is likely a stale reference in the audit file list rather than a missing implementation.
Line 167: - **Fix:** Remove from domain file list if the file was renamed/removed.
Line 170: ## CLEAN
Line 173: - `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` -- No issues (delegated to agent-registry for resolution)
Line 174: - `/Users/emanuelesabetta/ai-maestro/lib/agent-registry.ts` -- No issues (thorough agent CRUD with proper locking, path traversal protection)
Line 175: - `/Users/emanuelesabetta/ai-maestro/lib/document-registry.ts` -- No issues (correct UUID validation, atomic writes, proper locking)
Line 176: - `/Users/emanuelesabetta/ai-maestro/lib/file-lock.ts` -- No issues (well-implemented in-process mutex with timeout, proper queue management)
Line 177: - `/Users/emanuelesabetta/ai-maestro/lib/governance-peers.ts` -- No issues (proper path traversal validation, TTL expiry, atomic writes)
Line 178: - `/Users/emanuelesabetta/ai-maestro/lib/governance-request-registry.ts` -- No issues (correct approval state machine, TTL expiry, atomic writes)
Line 179: - `/Users/emanuelesabetta/ai-maestro/lib/governance-sync.ts` -- No issues (proper payload validation, timeout on fetch, fire-and-forget error handling)
Line 180: - `/Users/emanuelesabetta/ai-maestro/lib/governance.ts` -- No issues (proper bcrypt usage, null guards for managerId)
Line 181: - `/Users/emanuelesabetta/ai-maestro/lib/host-keys.ts` -- No issues (proper Ed25519 key management, restrictive permissions, atomic writes)
Line 182: - `/Users/emanuelesabetta/ai-maestro/lib/manager-trust.ts` -- No issues (correct auto-approve logic, corruption handling)
Line 183: - `/Users/emanuelesabetta/ai-maestro/lib/message-filter.ts` -- No issues (comprehensive governance filter with correct step ordering, multi-team COS handling)
Line 184: - `/Users/emanuelesabetta/ai-maestro/lib/message-send.ts` -- No issues (proper governance checks, content security, signature verification)
Line 185: - `/Users/emanuelesabetta/ai-maestro/lib/rate-limit.ts` -- No issues (correct atomic check-and-record, proper cleanup with unref)
Line 186: - `/Users/emanuelesabetta/ai-maestro/lib/role-attestation.ts` -- No issues (correct attestation signing/verification, replay protection)
Line 187: - `/Users/emanuelesabetta/ai-maestro/lib/task-registry.ts` -- No issues (proper cycle detection, dependency cleanup on delete, timestamp management)
Line 188: - `/Users/emanuelesabetta/ai-maestro/lib/team-acl.ts` -- No issues (