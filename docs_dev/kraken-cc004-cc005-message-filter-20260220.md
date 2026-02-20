# Kraken Fix Report: CC-004 and CC-005 in message-filter.ts

**Date:** 2026-02-20
**File:** /Users/emanuelesabetta/ai-maestro/lib/message-filter.ts

## Changes

### CC-004 (SHOULD-FIX) - Line 121: COS denial message updated
- Old: `'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, and own team members'`
- New: `'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, own team members, and agents not in any closed team'`

### CC-005 (SHOULD-FIX) - Lines 145-152: Open-world agents can now reach MANAGER and COS
- Added Step 5b between Step 5 (closed team member checks) and Step 6 (final deny)
- If recipient is MANAGER: allow
- If recipient is COS of any closed team: allow
- Uses existing `agentIsManager()` and `agentIsCOS()` helpers already in scope
- Only remaining deny case: open-world sender to normal closed-team member (not MANAGER/COS)
