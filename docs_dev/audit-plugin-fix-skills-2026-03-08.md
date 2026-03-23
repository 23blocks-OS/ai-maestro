# Plugin Skills Fixes Report
Generated: 2026-03-08

## Fixes Applied

### HIGH-6: Duplicate Transfer Protocol sections in team-governance/SKILL.md
- **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- **Issue:** Two Transfer Protocol sections existed (lines 345-404 and 486-552) with contradictory auth patterns. The first section used `Authorization: Bearer` + `X-Agent-Id` (canonical API pattern). The second section used only `X-Agent-Id` and included `requestedBy`/`resolvedBy` in the body (non-canonical).
- **Fix:** Removed the second duplicate section (former lines 486-552) entirely. The first section (lines 342-404) is retained as the canonical reference.
- **Verification:** grep confirms zero occurrences of `## Transfer Protocol` remain (the first section uses `## Agent Transfers (Between Teams)` as its heading).

### MED-17: Permission matrix shows unrestricted messaging for Normal Agent
- **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- **Line:** 213
- **Issue:** Permission matrix showed "Yes" for Normal Agent in "Message any agent (AMP)" row, but the Message Filtering Rules section later restricts normal agents in closed teams (R6.1, R6.5).
- **Fix:** Changed `Yes` to `Yes*` with a footnote explaining that closed-team members have restricted messaging per the Message Filtering Rules.
- **Verification:** Line 213 now reads `| Message any agent (AMP) | Yes* | Yes | Yes | Yes |` followed by the footnote.

### MED-20: Cross-host governance examples missing password field
- **File:** `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md`
- **Lines:** ~587-610 (Layer 3: Cross-Host Governance Requests)
- **Issue:** The cross-host governance request submission example omitted `password`, `requestedBy`, and `requestedByRole` fields, which are all required per the GovernanceRequest schema (see line ~299). The approve example also omitted `approverAgentId` and `password`.
- **Fix:** Added all required fields to both examples:
  - Submit request: added `password`, `requestedBy`, `requestedByRole`
  - Approve request: added JSON body with `approverAgentId` and `password` (matching the canonical approve pattern from lines 318-324)
- **Verification:** grep confirms `password` appears at lines 593 and 608 in the cross-host examples.

### MED-18: Wrong source path in 4 skill files
- **Files:**
  1. `plugin/plugins/ai-maestro/skills/docs-search/SKILL.md` (line 214)
  2. `plugin/plugins/ai-maestro/skills/graph-query/SKILL.md` (line 145)
  3. `plugin/plugins/ai-maestro/skills/memory-search/SKILL.md` (line 137)
  4. `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` (line 953)
- **Issue:** All four files referenced `plugin/src/scripts/` as the source location for helper scripts. This path does not exist. The correct path is `plugin/plugins/ai-maestro/scripts/`.
- **Fix:** Replaced all occurrences of `plugin/src/scripts/` with `plugin/plugins/ai-maestro/scripts/` in each file.
- **Verification:** grep confirms zero occurrences of `plugin/src/scripts/` remain across all skill files.

## Files Modified

1. `plugin/plugins/ai-maestro/skills/team-governance/SKILL.md` - HIGH-6, MED-17, MED-20
2. `plugin/plugins/ai-maestro/skills/docs-search/SKILL.md` - MED-18
3. `plugin/plugins/ai-maestro/skills/graph-query/SKILL.md` - MED-18
4. `plugin/plugins/ai-maestro/skills/memory-search/SKILL.md` - MED-18
5. `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` - MED-18

## Verification Summary

| Check | Result |
|-------|--------|
| No duplicate Transfer Protocol sections | PASS |
| Permission matrix footnote for Normal Agent messaging | PASS |
| Cross-host examples include password field | PASS |
| Zero occurrences of `plugin/src/scripts/` in skill files | PASS |
