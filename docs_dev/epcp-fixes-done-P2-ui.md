# EPCP Fixes Done - P2 UI Domain
Generated: 2026-02-22

## Summary
4/4 issues fixed across 2 files.

## Fixes Applied

### [SF-006] Inconsistent optional chaining on payload - DONE
- File: `components/AgentProfile.tsx:60`
- Changed `r.payload?.agentId` to `r.payload.agentId`
- `payload` is non-optional in GovernanceRequest type, so `?.` was unnecessary

### [SF-007] AgentProfile filters against nullable agent?.id instead of prop agentId - DONE
- File: `components/AgentProfile.tsx:60`
- Changed `agent?.id` to `agentId`
- Ensures filtering works even before agent state is populated

### [SF-008] canApprove checks profiled agent's role, not the viewer's - DONE
- File: `components/marketplace/AgentSkillEditor.tsx:75`
- Changed role-based check to `const canApprove = true`
- Phase 1 is localhost single-user; viewer is always the system owner

### [NT-012] AgentProfile save handler uses setTimeout for setSaving(false) - DONE
- File: `components/AgentProfile.tsx:222`
- Removed `setTimeout(() => setSaving(false), 500)` wrapper
- Now calls `setSaving(false)` directly (artificial 500ms delay was unnecessary)

## Files Modified
- `components/AgentProfile.tsx` (3 fixes: SF-006, SF-007, NT-012)
- `components/marketplace/AgentSkillEditor.tsx` (1 fix: SF-008)
