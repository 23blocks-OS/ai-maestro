# Quick Fix: Remove SubAgentsSection and .md file hints
Generated: 2026-03-17

## Changes Made

### AgentProfile.tsx
1. **Removed SubAgentsSection usage** (was lines 903-921) - deleted the entire collapsible section block from the JSX
2. **Removed SubAgentsSection function definition** (was lines 1208-1268) - deleted the entire component function and its comment header
3. **Removed `skillSettings: false`** from expandedSections initial state (was line 79)
4. **Cpu import kept** - still used at line 554 (icon for a different field)

### AgentProfilePanel.tsx
5. Updated 6 emptyHint/hint strings to remove references to adding .md files to .claude/ directories:
   - skills: "No skills detected from installed plugins or local config."
   - agents: "No subagents detected from installed plugins or local config."
   - hooks: "No hooks detected from installed plugins or local config."
   - rules: "No rules detected from installed plugins or local config."
   - commands: "No commands detected from installed plugins or local config."
   - mcps: "No MCP servers detected from installed plugins or local config."

## Verification
- No remaining references to `SubAgentsSection` in AgentProfile.tsx
- No remaining references to `skillSettings` in AgentProfile.tsx
- Cpu import preserved (still used elsewhere)
- All hint strings updated consistently

## Files Modified
1. `/Users/emanuelesabetta/ai-maestro/components/AgentProfile.tsx`
2. `/Users/emanuelesabetta/ai-maestro/components/AgentProfilePanel.tsx`
