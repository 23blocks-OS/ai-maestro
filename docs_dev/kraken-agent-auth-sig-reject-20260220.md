# Kraken Implementation Report: Agent Auth + AMP Signature Rejection
Generated: 2026-02-20T15:51:00Z

## Task 1: Create lib/agent-auth.ts
- Created `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts`
- New file with `authenticateAgent()` function and `AgentAuthResult` interface
- Bridges AMP API key auth to governance-restricted internal API calls
- Three outcomes: system owner (no headers), authenticated agent (valid Bearer), rejection (invalid/spoofed)

## Task 2: Fix AMP signature rejection in services/amp-service.ts
- **Route message (line ~888):** Changed `console.warn` on invalid signature to `return { data: AMPError, status: 403 }` -- messages with cryptographically invalid signatures are now rejected
- **Federation deliver (line ~1640):** Changed from silently setting `signatureVerified=false` on invalid sig to returning 403. Also reject on catch (verification error).
- Both fixes preserve backwards compatibility: messages with NO signature (and no key to verify) still pass through with a log warning. Only messages where signature IS present AND public key IS available AND verification FAILS are rejected.

## Files Changed
1. `/Users/emanuelesabetta/ai-maestro/lib/agent-auth.ts` (NEW) - Agent authentication bridge
2. `/Users/emanuelesabetta/ai-maestro/services/amp-service.ts` (MODIFIED) - Two signature rejection fixes
