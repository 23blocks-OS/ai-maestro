# Fix MF-08: requestedBy from untrusted body in transfers POST

**Date:** 2026-02-20
**File:** `app/api/governance/transfers/route.ts`

## Changes

1. Added `import { authenticateAgent } from '@/lib/agent-auth'`
2. Added `authenticateAgent()` call at top of POST handler using Authorization and X-Agent-Id headers
3. Replaced `body.requestedBy` with `auth.agentId` as the `requestedBy` value
4. Removed `requestedBy` from body destructuring
5. Updated required-fields validation to no longer require `requestedBy` in body (now 3 fields: agentId, fromTeamId, toTeamId)
6. Updated string-type validation to check 3 fields instead of 4
7. Preserved existing manager/COS authority check using the authenticated `requestedBy`
8. Pattern matches `app/api/governance/transfers/[id]/resolve/route.ts` authentication approach
