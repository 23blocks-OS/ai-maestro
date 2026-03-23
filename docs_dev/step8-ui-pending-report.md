# Step 8: Pending Config Request UI - Implementation Report
Generated: 2026-02-22

## Changes Made

### 8a. hooks/useGovernance.ts
- Added import for `GovernanceRequest` from `@/types/governance-request`
- Added `pendingConfigRequests`, `submitConfigRequest`, `resolveConfigRequest` to `GovernanceState` interface
- Added `pendingConfigRequests` state via `useState<GovernanceRequest[]>([])`
- Added 4th parallel fetch in `refresh()` for `GET /api/v1/governance/requests?type=configure-agent&status=pending`
- Updated `Promise.all` handler to include `configReqData` and set `pendingConfigRequests`
- Updated error/reset branch to also clear `pendingConfigRequests`
- Added `submitConfigRequest` callback (POST /api/v1/governance/requests with type='configure-agent')
- Added `resolveConfigRequest` callback (POST /api/v1/governance/requests/:id/approve or reject)
- Added all three new items to return object

### 8b. components/marketplace/AgentSkillEditor.tsx
- Added `Clock`, `XCircle` to lucide-react imports
- Added `useGovernance` import
- Inside component: calls `useGovernance(agentId)`, filters `pendingConfigRequests` for this agent, derives `canApprove`
- Added "Pending Configuration Changes" UI section with amber styling between error section and skills lists
- Each pending request shows operation name, status, and approve/reject buttons (for manager/COS roles)

### 8c. components/AgentProfile.tsx
- Added pending config count badge (amber pill) to the "Skills" collapsible section header
- Badge only renders when there are pending config requests for the current agent
- Uses `governance.pendingConfigRequests` which was already available from existing `useGovernance` call

## Verification
- `npx tsc --noEmit --project tsconfig.json` passes with no errors on modified files
