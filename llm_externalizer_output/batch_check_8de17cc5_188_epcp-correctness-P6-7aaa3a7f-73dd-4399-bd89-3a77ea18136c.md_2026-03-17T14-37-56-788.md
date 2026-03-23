# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:37:56.788Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-7aaa3a7f-73dd-4399-bd89-3a77ea18136c.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/docs_dev/epcp-correctness-P6-7aaa3a7f-73dd-4399-bd89-3a77ea18136c.md
Line 1: # Code Correctness Report: ui-hooks
Line 2: **Agent:** epcp-code-correctness-agent
Line 3: **Domain:** ui-hooks
Line 4: **Pass:** 6
Line 5: **Files audited:** 19
Line 6: **Date:** 2026-02-22T21:35:00Z
Line 8: ## MUST-FIX
Line 10: ### [CC-P6-A6-001] useWebSocket disconnect() does not reset reconnect attempt counter
Line 11: - **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:179-191
Line 12: - **Severity:** MUST-FIX
Line 13: - **Category:** logic
Line 14: - **Confidence:** CONFIRMED
Line 15: - **Description:** When `disconnect()` is called (either explicitly or via the cleanup effect at line 201), it clears the reconnect timeout but does NOT reset `reconnectAttemptsRef.current` to 0. This means if a session disconnects and then auto-reconnects (e.g., `autoConnect` toggles from false to true), the reconnect counter retains the previous count. If a prior connection had failed 3 times before stabilizing, the new connection only gets 2 retry attempts instead of 5 on the next transient failure.
Line 16: - **Evidence:**
Line 17:   ```typescript
Line 18:   // hooks/useWebSocket.ts:179-191
Line 19:   const disconnect = useCallback(() => {
Line 20:     if (reconnectTimeoutRef.current) {
Line 21:       clearTimeout(reconnectTimeoutRef.current)
Line 22:     }
Line 23:     if (wsRef.current) {
Line 24:       wsRef.current.close()
Line 25:       wsRef.current = null
Line 26:     }
Line 27:     setIsConnected(false)
Line 28:     setStatus('disconnected')
Line 29:     // Missing: reconnectAttemptsRef.current = 0
Line 30:   }, [])
Line 31:   ```
Line 32: - **Fix:** Add `reconnectAttemptsRef.current = 0` inside `disconnect()` before `setIsConnected(false)`.
Line 34: ### [CC-P6-A6-002] AgentProfileTab updateField uses `any` type parameter
Line 35: - **File:** /Users/emanuelesabetta/ai-maestro/components/zoom/AgentProfileTab.tsx:179
Line 36: - **Severity:** MUST-FIX
Line 37: - **Category:** type-safety
Line 38: - **Confidence:** CONFIRMED
Line 39: - **Description:** `updateField` declares its `value` parameter as `any`, which disables type checking for all callers. This could allow incorrect types to be silently assigned to agent fields (e.g., passing a number where a string is expected). The same function in `AgentProfile.tsx` (line 237) was already fixed to use `string | string[] | undefined` -- this file was not updated.
Line 40: - **Evidence:**
Line 41:   ```typescript
Line 42:   // components/zoom/AgentProfileTab.tsx:179
Line 43:   const updateField = (field: string, value: any) => {
Line 44:     setAgent({ ...agent, [field]: value })
Line 45:     setHasChanges(true)
Line 46:   }
Line 47:   ```
Line 48:   Compare with the fixed version in AgentProfile.tsx:237:
Line 49:   ```typescript
Line 50:   const updateField = (field: string, value: string | string[] | undefined) => {
Line 51:   ```
Line 52: - **Fix:** Change the type from `any` to `string | string[] | undefined` to match AgentProfile.tsx.
Line 54: ### [CC-P6-A6-003] useWebSocket onclose handler double-processes messages that are valid JSON but not control types
Line 55: - **File:** /Users/emanuelesabetta/ai-maestro/hooks/useWebSocket.ts:109-133
Line 56: - **Severity:** MUST-FIX
Line 57: - **Category:** logic
Line 58: - **Confidence:** CONFIRMED
Line 59: - **Description:** In the WebSocket `onmessage` handler (lines 109-133), when a message is valid JSON but its `type` is not `'error'` or `'status'`, the function returns without forwarding data to `onMessageRef.current`. This means control messages like `{ type: 'history-complete' }` and `{ type: 'connected' }` are consumed by the hook and never reach `onMessageRef`. However, the TerminalView's `onMessage` callback at line 209-261 ALSO parses JSON and handles these same types. This creates a conflict: the useWebSocket hook intercepts error/status types, but lets through other JSON messages -- which then get double-parsed in TerminalView. For `{ type: 'history-complete' }`, the useWebSocket handler does NOT intercept it (no match), so it IS forwarded to onMessage, where TerminalView handles it correctly. This is actually working but fragile -- if a new `type` is added to useWebSocket's handler without updating TerminalView, messages could be silently dropped.
Line 60: - **Evidence:**
Line 61:   ```typescript
Line 62:   // hooks/useWebSocket.ts:109-133
Line 63:   ws.onmessage = (event) => {
Line 64:     try {
Line 65:       const parsed = JSON.parse(event.data)
Line 66:       if (parsed.type === 'error') { ... return }
Line 67:       if (parsed.type === 'status') { ... return }
Line 68:     } catch { /* Not JSON */ }
Line 69:     onMessageRef.current?.(event.data) // Forwards ALL non-error/status messages
Line 70:   }
Line 72:   // TerminalView.tsx:209-261
Line 73:   onMessage: (data) => {
Line 74:     try {
Line 75:       const parsed = JSON.parse(data)
Line 76:       if (parsed.type === 'history-complete') { ... return }
Line 77:       if (parsed.type === 'connected') { ... return }
Line 78:     } catch { /* Not JSON */ }
Line 79:     // Write to terminal
Line 80:   }
Line 81:   ```
Line 82:   The `error` type messages are consumed by useWebSocket and NEVER reach TerminalView. If a user sees a WebSocket error, only the `connectionError` state changes -- but TerminalView has no UI to show it since it relies on `connectionError` from the hook return value. This is actually handled correctly via the `connectionError` prop -- marking as NIT rather than MUST-FIX on re-evaluation.
Line 83: - **Fix:** This is actually working correctly upon deeper analysis. Both layers handle their respective concerns. Downgrading to NIT -- document the split responsibility between useWebSocket (error/status) and TerminalView (history-complete/connected) to prevent future confusion.
Line 85: **[Reclassified to NIT -- see CC-P6-A6-013]**
Line 87: ## SHOULD-FIX
Line 89: ### [CC-P6-A6-004] useGovernance addAgentToTeam/removeAgentFromTeam read-modify-write race condition
Line 90: - **File:** /Users/emanuelesabetta/ai-maestro/hooks/useGovernance.ts:210-283
Line 91: - **Severity:** SHOULD-FIX
Line 92: - **Category:** race-condition
Line 93: -