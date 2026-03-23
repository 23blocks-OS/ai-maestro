# Code Correctness Report: services

**Agent:** epcp-code-correctness-agent
**Domain:** services
**Files audited:** 31
**Date:** 2026-02-22T22:28:00Z
**Pass:** 7 (after 6 prior fix passes)
**Finding ID Prefix:** CC-P7-A4

## MUST-FIX

### [CC-P7-A4-001] CozoDB injection via incorrect manual escaping in agents-graph-service.ts
- **File:** services/agents-graph-service.ts:1033
- **Severity:** MUST-FIX
- **Category:** security
- **Confidence:** CONFIRMED
- **Description:** The `queryCodeGraph` function's `focus-node` action uses manual SQL-style escaping (`nodeId.replace(/'/g, "''")`) instead of the `escapeForCozo()` utility that is imported at line 22 and used correctly ~30 other times in the same file. CozoDB uses backslash escaping (`\'`), not SQL-style double-single-quote (`''`) escaping. The manual escaping also fails to handle backslashes, newlines, carriage returns, and tabs -- all of which `escapeForCozo` handles.

  The vulnerable pattern appears at **4 locations**:
  - Line 1033: `const escapedNodeId = nodeId.replace(/'/g, "''")`
  - Line 1089: `const escapedId = id.replace(/'/g, "''")`
  - Line 1100: `const escapedId = id.replace(/'/g, "''")`
  - Line 1111: `const escapedId = id.replace(/'/g, "''")`

  These escaped values are then interpolated into CozoDB queries with manual quote wrapping (e.g., `'${escapedNodeId}'`), creating an injection vector. For example, a `nodeId` containing a backslash followed by a single quote (`\'`) would:
  1. Pass through the manual escaping unchanged (it only doubles lone `'`)
  2. In CozoDB, the `\` would escape the closing quote, breaking out of the string literal

  The file even contains a comment at line 66-67 acknowledging this was supposed to be fixed:
  ```
  // MF-009: Local escapeString removed -- use escapeForCozo from @/lib/cozo-utils
  // escapeForCozo uses backslash escaping (correct for CozoDB) and wraps in quotes
  ```

  But the `focus-node` action (lines 1013-1127) was missed during that fix.

- **Evidence:**
  ```typescript
  // Line 1033 -- WRONG: SQL-style escaping, manual quote wrapping
  const escapedNodeId = nodeId.replace(/'/g, "''")
  // ...
  const callsOut = await agentDb.run(`?[caller_fn, callee_fn] := *calls{caller_fn, callee_fn}, caller_fn = '${escapedNodeId}'`)

  // Line 383 -- CORRECT: uses escapeForCozo (same file, different action)
  callee_name = ${escapeForCozo(name)},
  ```

  The `escapeForCozo` utility (from `lib/cozo-utils.ts`):
  ```typescript
  export function escapeForCozo(s: string | undefined | null): string {
    if (!s) return 'null'
    return "'" + s
      .replace(/\\/g, '\\\\')   // Escape backslashes first
      .replace(/'/g, "\\'")     // Then escape single quotes
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      + "'"
  }
  ```

- **Fix:** Replace all 4 occurrences of manual escaping with `escapeForCozo()`:
  - Line 1033: Replace `const escapedNodeId = nodeId.replace(/'/g, "''")` and all subsequent `'${escapedNodeId}'` with `${escapeForCozo(nodeId)}`
  - Line 1089: Replace `const escapedId = id.replace(/'/g, "''")` and `'${escapedId}'` with `${escapeForCozo(id)}`
  - Line 1100: Same pattern
  - Line 1111: Same pattern

  Note: `escapeForCozo` returns the value already wrapped in quotes, so the surrounding `'...'` must also be removed from the query strings.

## SHOULD-FIX

(none)

## NIT

(none)

## CLEAN

Files with no issues found:
- services/agents-chat-service.ts -- No issues
- services/agents-core-service.ts -- No issues
- services/agents-config-deploy-service.ts -- No issues
- services/agents-directory-service.ts -- No issues
- services/agents-docker-service.ts -- No issues
- services/agents-docs-service.ts -- No issues
- services/agents-memory-service.ts -- No issues
- services/agents-messaging-service.ts -- No issues
- services/agents-playback-service.ts -- No issues
- services/agents-repos-service.ts -- No issues
- services/agents-skills-service.ts -- No issues
- services/agents-subconscious-service.ts -- No issues
- services/agents-transfer-service.ts -- No issues
- services/amp-service.ts -- No issues
- services/config-notification-service.ts -- No issues
- services/config-service.ts -- No issues
- services/cross-host-governance-service.ts -- No issues
- services/domains-service.ts -- No issues
- services/governance-service.ts -- No issues
- services/headless-router.ts -- No issues
- services/help-service.ts -- No issues
- services/hosts-service.ts -- No issues
- services/marketplace-service.ts -- No issues
- services/messages-service.ts -- No issues
- services/plugin-builder-service.ts -- No issues
- services/sessions-service.ts -- No issues
- services/shared-state-bridge.mjs -- No issues
- services/shared-state.ts -- No issues
- services/teams-service.ts -- No issues
- services/webhooks-service.ts -- No issues

## Self-Verification

- [x] I read every file in my domain COMPLETELY (all lines, not skimmed, not grep-only)
- [x] For each finding, I included the exact file:line reference
- [x] For each finding, I included the actual code snippet as evidence
- [x] I verified each finding by tracing the code flow (not just pattern matching)
- [x] I categorized findings correctly:
      MUST-FIX = crashes, security holes, data loss, wrong results
      SHOULD-FIX = bugs that don't crash but produce incorrect behavior
      NIT = style, convention, minor improvement
- [x] My finding IDs use the assigned prefix: CC-P7-A4-001
- [x] My report file uses the UUID filename: epcp-correctness-P7-8c33016b-be54-42b0-9915-d3a950bab861.md
- [x] I did NOT report issues outside my assigned domain files
- [x] I noted code paths that appear to lack test coverage (tests may be in another domain -- flag, don't verify)
- [x] My report has all required sections: MUST-FIX, SHOULD-FIX, NIT, CLEAN
- [x] I listed CLEAN files explicitly (files with no issues)
- [x] Total finding count in my return message matches the actual count in the report
- [x] My return message to the orchestrator is exactly 1-2 lines
