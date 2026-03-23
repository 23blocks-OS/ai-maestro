# README.md Documentation Fixes — Iteration 2
**Date:** 2026-03-23
**File:** `/Users/emanuelesabetta/ai-maestro/README.md`
**Findings source:** `.rechecker/reports/rck-20260323_030034_794461-[LP00002-IT00002-FID00001]-review.md`

## Fixes Applied

### Fix 1 — amp-reply.sh message content argument (BUG: Missing CLI command for `amp-reply.sh`)
**Status:** Already correct — no change needed.
Verified at line 292: `amp-reply.sh <message-id> "Acknowledged, deploying now"` was already present with the message content argument. The finding was a false positive for this iteration.

### Fix 2 — Duplicate `[Agent Communication Architecture]` link in "Extending" section
**Status:** FIXED.
The link `[Agent Communication Architecture](./docs/AGENT-COMMUNICATION-ARCHITECTURE.md)` appeared both in the "Going deeper" bullet list (line 221) and again in the "Extending" subsection (line 229). Removed the duplicate from the "Extending" line, which now reads only:
`- [Plugin Development](./plugin/README.md)`

### Fix 3 — Missing description for `graph-index-delta.sh` in Code Intelligence CLI Reference
**Status:** FIXED.
Added an inline comment to the `graph-index-delta.sh` line in the "Code Intelligence" bash block:
`graph-index-delta.sh ~/Code/my-project  # Update the code graph index for a specific project path`

### Fix 4 — Persona naming contradiction (BUG: Inconsistent Persona Naming Convention)
**Status:** SKIPPED — confirmed false positive per instructions.
The README already contains a clear clarification: "Input is case-insensitive — the system normalizes all persona names to lowercase internally... The UI displays persona names capitalized for readability." The examples (`Sammy`, `Peter-Parker`, etc.) correctly reflect UI display format, consistent with the stated behavior. No contradiction exists.

## Summary
- 2 fixes applied (duplicate link removal, graph-index-delta.sh description)
- 1 finding already correct (amp-reply.sh)
- 1 finding skipped as false positive (persona naming)
