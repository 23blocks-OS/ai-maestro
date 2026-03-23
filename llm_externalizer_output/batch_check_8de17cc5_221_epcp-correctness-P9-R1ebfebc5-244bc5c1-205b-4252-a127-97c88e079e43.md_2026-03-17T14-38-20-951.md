# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:38:20.951Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-244bc5c1-205b-4252-a127-97c88e079e43.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P9-R1ebfebc5-244bc5c1-205b-4252-a127-97c88e079e43.md
Line 13: # Code Correctness Report: services
Line 16: **Domain:** services
Line 29: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:783-787
Line 42: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:730-735
Line 55: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:620-627
Line 75: - **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1182, 1188-1189
Line 90: - **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:330
Line 105: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:186
Line 119: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts:653-661 vs /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:185-199
Line 132: - **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1498-1501
Line 146: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1633-1669
Line 160: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-core-service.ts:1387-1418
Line 175: - **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts:1149
Line 189: - **File:** Multiple files (agents-core-service.ts:74-75, sessions-service.ts:47-48, governance-service.ts:30-31)
Line 202: - **File:** /Users/emanuelesabetta/ai-maestro/services/headless-router.ts (sendServiceResult helper -- around line 390-410 based on pattern)
Line 215: - **File:** /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts:861, 1022-1126
Line 229: - **File:** /Users/emanuelesabetta/ai-maestro/services/amp-service.ts:1631
Line 242: - **File:** /Users/emanuelesabetta/ai-maestro/services/sessions-service.ts (inferred from summary, package.json read)
Line 254: - /Users/emanuelesabetta/ai-maestro/services/shared-state.ts -- Clean, well-typed, proper WebSocket cleanup. No issues.
Line 255: - /Users/emanuelesabetta/ai-maestro/services/shared-state-bridge.mjs -- Clean ESM mirror with proper NT-039 sync warning.
Line 256: - /Users/emanuelesabetta/ai-maestro/services/webhooks-service.ts -- Clean, proper secret stripping, event validation.
Line 257: - /Users/emanuelesabetta/ai-maestro/services/agents-config-deploy-service.ts -- Clean, proper validation and error handling.
Line 258: - /Users/emanuelesabetta/ai-maestro/services/agents-docker-service.ts -- Clean, uses execFile for safety.
Line 259: - /Users/emanuelesabetta/ai-maestro/services/agents-docs-service.ts -- Clean, proper governance ACL.
Line 260: - /Users/emanuelesabetta/ai-maestro/services/agents-playback-service.ts -- Clean, straightforward playback state management.
Line 261: - /Users/emanuelesabetta/ai-maestro/services/agents-repos-service.ts -- Clean, proper validation.
Line 262: - /Users/emanuelesabetta/ai-maestro/services/agents-skills-service.ts -- Clean, proper file-based CRUD.
Line 263: - /Users/emanuelesabetta/ai-maestro/services/agents-subconscious-service.ts -- Clean, proper lifecycle management.
Line 264: - /Users/emanuelesabetta/ai-maestro/services/agents-chat-service.ts -- Clean, proper input validation.
Line 265: - /Users/emanuelesabetta/ai-maestro/services/agents-directory-service.ts -- Clean, proper host synchronization.
Line 266: - /Users/emanuelesabetta/ai-maestro/services/agents-transfer-service.ts -- Clean, proper zip handling and security checks.
Line 267: - /Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts -- Clean.
Line 268: - /Users/emanuelesabetta/ai-maestro/services/config-service.ts -- Clean.
Line 269: - /Users/emanuelesabetta/ai-maestro/services/cross-host-governance-service.ts -- Clean, proper host signature verification.
Line 270: - /Users/emanuelesabetta/ai-maestro/services/domains-service.ts -- Clean, proper CRUD.
Line 271: - /Users/emanuelesabetta/ai-maestro/services/help-service.ts -- Clean.
Line 272: - /Users/emanuelesabetta/ai-maestro/services/hosts-service.ts -- Clean, proper concurrent health checks and peer exchange.
Line 273: - /Users/emanuelesabetta/ai-maestro/services/marketplace-service.ts -- Clean.
Line 274: - /Users/emanuelesabetta/ai-maestro/services/messages-service.ts -- Clean.
Line 275: - /Users/emanuelesabetta/ai-maestro/services/plugin-builder-service.ts -- Clean, strong SSRF protection, proper concurrency control.
Line 276: - /Users/emanuelesabetta/ai-maestro/services/governance-service.ts -- Clean, proper rate limiting with atomic check-and-record, proper password verification flow.
Line 277: - /Users/emanuelesabetta/ai-maestro/services/agents-memory-service.ts -- Clean, proper CozoScript injection prevention via escapeForCozo, proper delta indexing.
Line 278: - /Users/emanuelesabetta/ai-maestro/services/agents-graph-service.ts -- Minor nit (depth unused), otherwise clean.
Line 283: - No test files were observed in this domain (services/ directory). The service layer is a pure business logic extraction from API routes, and test coverage appears to be handled by integration tests elsewhere.
```