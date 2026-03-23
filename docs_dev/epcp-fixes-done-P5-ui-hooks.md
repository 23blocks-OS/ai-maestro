# EPCP Fixes Done - P5 UI Hooks & Components

Generated: 2026-02-22

## Task
Fix P5 review findings for UI hooks and components domain.

## Findings Summary

| ID | File | Status | Notes |
|----|------|--------|-------|
| SF-016 | hooks/useWebSocket.ts:174 | ALREADY FIXED | Safe error coercion already present (SF-009 comment) |
| SF-017 | hooks/useTerminal.ts:354-355 | FIXED | Added comment about terminalRef.current not triggering re-renders |
| SF-018 | hooks/useWebSocket.ts:6-8,154-162 | ALREADY FIXED | Exponential backoff array already implemented (SF-011 comment) |
| SF-021 | components/TerminalView.tsx:631-638 | ALREADY FIXED | aria-label and role="status" already present (SF-014 comment) |
| SF-022 | components/TerminalView.tsx:651-724 | ALREADY FIXED | All emoji buttons already have aria-label matching title |
| SF-054 | app/api/sessions/route.ts | FIXED | Added TODO comment about standardizing API error responses |
| SF-056 | app/api/hosts/health/route.ts | FIXED | Added private IP/reserved address SSRF blocking |
| SF-057 | app/api/teams/[id]/tasks/[taskId]/route.ts | ALREADY FIXED | Whitelist pattern with safeParams already present |
| SF-058 | app/api/teams/[id]/tasks/route.ts | ALREADY FIXED | Whitelist pattern with safeParams already present |
| NT-015 | hooks/useTerminal.ts:109-113 | ALREADY FIXED | Expanded comment already present (NT-008) |
| NT-017 | components/TerminalView.tsx:498-519 | NO CHANGE | eslint-disable comments sufficient per task |
| NT-018 | components/governance/RoleBadge.tsx:64-72 | NO CHANGE | CC-P1-708 comment sufficient per task |
| NT-019 | components/zoom/AgentProfileTab.tsx:47-98 | ALREADY FIXED | reposLoaded guard already present (NT-012) |

## Changes Made

### 1. hooks/useTerminal.ts (SF-017)
Added comment at return block (line 354-355):
```
// SF-017: terminalRef.current does not trigger re-renders. Callers must use the
// state-backed `terminal` value (or isReady in TerminalView) as their re-render trigger.
```

### 2. app/api/hosts/health/route.ts (SF-056)
Enhanced SSRF protection to block private/reserved IP addresses:
- localhost, 127.0.0.1, ::1, 0.0.0.0
- 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- 169.254.0.0/16 (link-local)
- .local hostnames

### 3. app/api/sessions/route.ts (SF-054)
Added TODO comment for Phase 2 standardization of API error response shapes.

## Files Modified
- `hooks/useTerminal.ts` - SF-017 comment
- `app/api/hosts/health/route.ts` - SF-056 SSRF private IP blocking
- `app/api/sessions/route.ts` - SF-054 TODO comment
