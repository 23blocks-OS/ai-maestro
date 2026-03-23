# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:08.524Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-c31413c4-edfa-4f53-8584-9ce8cecf55bf.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-c31413c4-edfa-4f53-8584-9ce8cecf55bf.md
Line 1: # Code Correctness Report: services
Line 15: - **File:** /Users/emanuelesabetta/ai-maestro/services/help-service.ts:160
Line 38: - **File:** /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts:~460-535
Line 50: The `agents-transfer-service.ts` has proper SSRF protection at lines 1016-1037 (validates against known hosts from hosts.json). The `agents-docker-service.ts` has SSRF protection at lines 63-70. But `hosts-service.ts` lacks this.
Line 66: - **File:** /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts:80
Line 70: The `notifyGovernanceRequestOutcome` function hardcodes `http://localhost:23000` for the AMP send-message API call, instead of using `getSelfHost()` from `@/lib/hosts-config`. This will fail if AI Maestro is running on a different port, or if the URL configuration has changed. Other services correctly use `getSelfHost()` for self-referencing HTTP calls (e.g., `agents-docs-service.ts:264`).
Line 88: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:275-276
Line 107: - **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:515-524
Line 127: - **File:** /Users/emanuelesabetta/ai-maestro/services/config-service.ts:578-580
Line 143: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts:92
Line 158: - **File:** /Users/emanuelesabetta/ai-maestro/services/messages-service.ts:~160
Line 173: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts:~98
Line 188: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:730-735
Line 208: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts:267
Line 223: - **File:** /Users/emanuelesabetta/ai-maestro/services/amp-service.ts:1173, 1206, 1249, 1377, 1417, 1445, 1469
Line 243: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts:multiple
Line 258: - **File:** /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs:44
Line 273: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:~812
Line 289: - **File:** /Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts:89-93
Line 304: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:720-738
Line 321: - /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts -- Good path traversal protection, UUID validation, atomic writes. No issues.
Line 322: - /Users/emanuelesabetta/ai-maestro/services/agents-directory-service.ts -- Clean, simple service with proper error handling. No issues.
Line 323: - /Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts -- Good SSRF protection, shell injection prevention via execFileAsync, volume mount validation. No issues.
Line 324: - /Users/emanuelesabetta/ai-maestro/services/agents-memory-service.ts -- Good error handling, proper async patterns. No issues.
Line 325: - /Users/emanuelesabetta/ai-maestro/services/agents-messaging-service.ts -- Good timeout handling, proper email normalization. No issues.
Line 326: - /Users/emanuelesabetta/ai-maestro/services/agents-repos-service.ts -- Good path validation, uses execFileSync throughout. No issues.
Line 327: - /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts -- Good governance RBAC, skill name validation, UUID validation. No issues.
Line 328: - /Users/emanuelesabetta/ai-maestro/services/agents-subconscious-service.ts -- Clean, simple service. No issues.
Line 329: - /Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts -- Good Zip Slip protection, SSRF validation against known hosts, execFileSync. No issues.
Line 330: - /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts -- Good TOCTOU protection, host signature verification, forces pending status on received requests. No issues.
Line 331: - /Users/emanuelesabetta/ai-maestro/services/domains-service.ts -- Clean UUID validation, proper error codes. No issues.
Line 332: - /Users/emanuelesabetta/ai-maestro/services/governance-service.ts -- Good rate limiting, password validation, UUID validation throughout. No issues.
Line 333: - /Users/emanuelesabetta/ai-maestro/services/headless-router.ts -- Good body size limits, double-resolve prevention. No issues.
Line 334: - /Users/emanuelesabetta/ai-maestro/services/marketplace-service.ts -- Clean, simple service. No issues.
Line 335: - /Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts -- Excellent security: SSRF protection, path traversal prevention, concurrency guards, symlink skipping. No issues.
Line 336: - /Users/emanuelesabetta/ai-maestro/services/shared-state.ts -- Clean shared state pattern with proper WS_OPEN constant. No issues.
Line 337: - /Users/emanuelesabetta/ai-maestro/services/teams-service.ts -- Good governance ACL, circular dependency detection, control character stripping. No issues.
Line 341: - `checkConfigGovernance()` in agents-skills-service.ts -- RBAC logic for local/user/project scope
Line 342: - `triggerBackgroundDocsDeltaIndexing()` in agents-docs-service.ts -- re-entrancy guard logic
Line 343: - `checkRemoteHealth()` in hosts-service.ts -- URL validation and SSRF prevention
Line 344: - `createAssistantAgent()` in help-service.ts -- assistant lifecycle management
Line 345: - `renameSession()` cloud agent path in sessions-service.ts -- non-atomic file operations
Line 346: - `broadcastStatusUpdate()` in shared-state.ts -- WebSocket broadcast with readyState check
```