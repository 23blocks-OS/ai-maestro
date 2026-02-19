# Governance UI — Code Review Issues

Generated: 2026-02-16

## Critical Issues

### ISSUE 1: Duplicate `GovernanceRole` type definition (SSOT violation)
- **Files**: `hooks/useGovernance.ts:7`, `components/governance/RoleBadge.tsx:5`
- Both export `type GovernanceRole = 'manager' | 'chief-of-staff' | 'normal'`
- `RoleAssignmentDialog` imports from `useGovernance`, `TeamMembershipSection` imports from `RoleBadge`
- **Fix**: Remove from RoleBadge.tsx, have all consumers import from `useGovernance.ts`
- [x] Fixed

### ISSUE 2: Nested overlay in GovernancePasswordDialog inside RoleAssignmentDialog
- **File**: `components/governance/RoleAssignmentDialog.tsx:310-317`
- When `phase === 'password'`, GovernancePasswordDialog renders inside the RoleAssignmentDialog's motion.div
- GovernancePasswordDialog has its OWN `fixed inset-0 bg-black/70 backdrop-blur-sm` overlay
- Result: DOUBLE dark overlay + the role dialog's motion.div collapses to empty since its only child is fixed-positioned
- **Fix**: Render GovernancePasswordDialog outside the role dialog overlay when phase is 'password'
- [x] Fixed

### ISSUE 3: COS team reassignment doesn't remove old COS assignments
- **File**: `components/governance/RoleAssignmentDialog.tsx:141-151`
- When currentRole is 'chief-of-staff' and user selects COS with different teams, the code:
  - Assigns COS to each new selectedTeamIds (line 147-150)
  - Does NOT remove COS from previously assigned teams that are NOT in selectedTeamIds
- Agent ends up COS of BOTH old AND new teams
- **Fix**: Before assigning new teams, remove COS from all cosTeams not in selectedTeamIds
- [x] Fixed

### ISSUE 4: Pending transfers shown for ALL agents, not filtered by current agent
- **File**: `components/governance/TeamMembershipSection.tsx:183-221`
- `governance.pendingTransfers` contains ALL pending transfers in the system
- The section displays all of them regardless of which agent's profile is open
- A COS viewing agent A's profile sees pending transfers for agents B, C, etc.
- **Fix**: Filter pendingTransfers to only those where `transfer.agentId === agentId` OR where the viewing agent is the source team COS
- [x] Fixed

## Medium Issues

### ISSUE 5: Missing click-outside handler for Join Team dropdown
- **File**: `components/governance/TeamMembershipSection.tsx:121-143`
- Dropdown stays open when user clicks elsewhere on the page
- Other dropdowns in codebase use click-outside detection patterns
- **Fix**: Add useEffect with click-outside event listener
- [x] Fixed

### ISSUE 6: ForwardDialog.tsx is orphaned — not imported by any component
- **File**: `components/ForwardDialog.tsx`
- Component exists but is never used (MessageCenter uses inline forward flow)
- The `reachableAgentIds` prop we added is dead code
- **Fix**: Note only; not introduced by our changes

## Low / Documentation-Only Issues

### ISSUE 7: Race condition in transfer-registry file operations
- **File**: `lib/transfer-registry.ts`
- load→modify→save pattern without file locking
- Consistent with team-registry.ts and agent-registry.ts patterns in the codebase
- Acceptable for Phase 1 (localhost, single-user)

### ISSUE 8: Reachable endpoint iterates all agents × file reads
- **File**: `app/api/governance/reachable/route.ts`
- Each `checkMessageAllowed` call reads governance.json + teams.json from disk
- With 100+ agents, this is 200+ file reads per request
- Low priority since current agent count is small

### ISSUE 9: No loading state on transfer approve/reject buttons
- **File**: `components/governance/TeamMembershipSection.tsx:199-212`
- Approve/reject buttons have no disabled/spinner state during network requests
- Could lead to double-clicks
- [x] Fixed
