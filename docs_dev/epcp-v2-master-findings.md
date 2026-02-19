# EPCP V2 — Master Findings List

## Phase 1: Correctness Swarm — 53 findings

### MUST-FIX (4)

| ID | Report | Issue | File |
|---|---|---|---|
| TL-001 | types-lib | task-registry: No withLock on write ops — race condition | lib/task-registry.ts |
| AG-001 | api-gov | params type non-Promise in transfer route | app/api/agents/[id]/transfer/route.ts |
| AG-002 | api-gov | Transfer resolve: approved before dest team check | app/api/governance/transfers/[id]/resolve/route.ts |
| AG-003 | api-gov | saveTeams() return value ignored in transfer resolve | app/api/governance/transfers/[id]/resolve/route.ts |

### SHOULD-FIX (19)

| ID | Report | Issue | File |
|---|---|---|---|
| TL-002 | types-lib | deleteTeam: no UUID validation on task file cleanup | lib/team-registry.ts:310 |
| TL-003 | types-lib | COS not in agentIds invisible to filter | lib/message-filter.ts:52 |
| TL-004 | types-lib | verifyPassword: timing info leak (no-password fast return) | lib/governance.ts:66 |
| AG-004 | api-gov | 'message_blocked' not in AMPErrorCode union | app/api/v1/route/route.ts:574 |
| AG-005 | api-gov | Content-Length spoofable payload check | app/api/v1/route/route.ts:302 |
| AG-006 | api-gov | Rate limiter unbounded growth from many agents | app/api/v1/route/route.ts:93 |
| AG-007 | api-gov | Reachable cache no invalidation on governance changes | app/api/governance/reachable/route.ts |
| AT-001 | api-teams | Missing try/catch in DELETE /api/teams/[id]/tasks/[taskId] | app/api/teams/[id]/tasks/[taskId]/route.ts |
| AT-002 | api-teams | Missing try/catch in GET /api/teams/[id]/tasks | app/api/teams/[id]/tasks/route.ts |
| HK-001 | hooks | Stale refresh() when agentId changes rapidly | hooks/useGovernance.ts |
| HK-002 | hooks | addAgentToTeam/removeAgent read-modify-write race | hooks/useGovernance.ts |
| HK-003 | hooks | Unnecessary managerId in addAgentToTeam deps | hooks/useGovernance.ts:196 |
| HK-004 | hooks | useTeam optimistic update no revert on network error | hooks/useTeam.ts:43 |
| UG-001 | ui-gov | Double-click password confirm fires multiple times | GovernancePasswordDialog.tsx:79 |
| UG-002 | ui-gov | Partial failure in sequential role-change | RoleAssignmentDialog.tsx:139 |
| UG-003 | ui-gov | Stale info message after transfer request | TeamMembershipSection.tsx:88 |
| UT-001 | ui-teams | Regular send doesn't refresh sent messages | MessageCenter.tsx:231 |
| UT-002 | ui-teams | Priority colors light-theme in dark UI | MessageCenter.tsx:537 |
| CD-001 | config | Literal \n in gateway list sed (remote-install.sh) | scripts/remote-install.sh:1225 |
| CD-002 | config | Unused SCRIPTS_OK variable (install-messaging.sh) | install-messaging.sh:810 |
| TE-001 | tests | Missing type field in makeTeam helpers | validate-team-mutation.test.ts + team-registry.test.ts |
| TE-002 | tests | COS-not-in-agentIds test represents impossible state | message-filter.test.ts:174 |

### NIT (28)

| ID | Report | Issue | File |
|---|---|---|---|
| TL-005 | types-lib | UUID regex allows invalid UUIDs (not 8-4-4-4-12) | lib/task-registry.ts:25 |
| TL-006 | types-lib | (s: any) type in message-send.ts | lib/message-send.ts:306,510 |
| TL-007 | types-lib | unsafe Record<string,unknown> cast in updateTeam | lib/team-registry.ts:284 |
| TL-008 | types-lib | ISO string comparison in cleanupOldTransfers | lib/transfer-registry.ts:127 |
| AG-008 | api-gov | Request instead of NextRequest in transfer route | app/api/agents/[id]/transfer/route.ts:32 |
| AG-009 | api-gov | importResult.agent may be undefined | app/api/agents/[id]/transfer/route.ts:143 |
| AG-010 | api-gov | requestedBy not validated as existing agent | app/api/governance/transfers/route.ts:47 |
| AT-003 | api-teams | Unused import TeamType in teams/route.ts | app/api/teams/route.ts:5 |
| HK-005 | hooks | refresh() doesn't use agentId in body | hooks/useGovernance.ts |
| HK-006 | hooks | useTeam loading starts true when teamId null | hooks/useTeam.ts:16 |
| HK-007 | hooks | 6 setters in refresh (React 17 concern) | hooks/useGovernance.ts:80 |
| UG-004 | ui-gov | No Escape key handler on GovernancePasswordDialog | GovernancePasswordDialog.tsx |
| UG-005 | ui-gov | No Escape key handler on RoleAssignmentDialog | RoleAssignmentDialog.tsx |
| UG-006 | ui-gov | GovernanceRole re-export chain too long | TeamMembershipSection.tsx:6 |
| UG-007 | ui-gov | Only first closed source team used for transfer | TeamMembershipSection.tsx:82 |
| UT-003 | ui-teams | AgentProfileTab fetches repos eagerly | AgentProfileTab.tsx:74 |
| UT-004 | ui-teams | MetricCard trend prop inconsistency | AgentProfileTab.tsx vs AgentProfile.tsx |
| UT-005 | ui-teams | cosDisplay shows raw UUID fallback | TeamOverviewSection.tsx:37 |
| UT-006 | ui-teams | TeamDashboard loading conflates with not-found | teams/[id]/page.tsx:31 |
| CD-003 | config | SC2155 declare and assign separately | install-messaging.sh:401 |
| CD-004 | config | SC2088 tilde in quotes (cosmetic only) | install-messaging.sh:679 |
| CD-005 | config | "5 skills" should be "7 skills" in docs | ai-index.html + README.md |
| CD-006 | config | Dots not escaped in version regex | scripts/bump-version.sh:108 |
| TE-003 | tests | Shared uuidCounter fragile coupling | task-registry.test.ts:26 |
| TE-004 | tests | as any type bypass in governance.test.ts | governance.test.ts:240 |
| TE-005 | tests | Transitive fs mock in document-api.test.ts | document-api.test.ts |
| TE-006 | tests | Missing empty-string assigneeAgentId edge case | task-registry.test.ts |

## Phase 2: Claim Verification — PENDING
## Phase 3: Skeptical Review — PENDING
