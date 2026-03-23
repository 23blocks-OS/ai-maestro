# Advisory A1 Fix - Governance Opt-in Note in Agents Management Skill

**Date:** 2026-02-22
**Advisory:** A1 - Add Phase 1 governance opt-in note to agents-management skill SKILL.md

## Files Edited

1. `plugin/plugins/ai-maestro/skills/ai-maestro-agents-management/SKILL.md` (built copy)
2. `plugin/src/skills/ai-maestro-agents-management/SKILL.md` (source copy)

## Changes Made

### Change 1: New "Governance Enforcement (Phase 1)" section
- **Location:** After line 30 (after "Agent Management Operations" list, before "## CLI Script")
- **Content:** New section documenting governance role checks for CRUD operations
- **Includes:** Table of operations vs. roles, Phase 1 opt-in explanation, practical guidance

### Change 2: Three new rows in "Common Error Messages" table
- **Location:** Line 1227-1229 (appended to existing error table)
- **Content:** Three governance-specific error messages:
  - "Only MANAGER or Chief-of-Staff can create agents"
  - "Only MANAGER can delete agents"
  - "Only MANAGER, owning Chief-of-Staff, or the agent itself can update this agent"

## Verification

- Both files edited at identical line numbers (31 for governance section, 1227 for error rows)
- No existing content modified -- only additions
- Grep confirmed both changes present in both files
