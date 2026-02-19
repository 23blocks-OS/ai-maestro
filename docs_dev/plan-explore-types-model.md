# AI Maestro Type Definitions & Agent Model Report
Generated: 2026-02-16T05:46:00Z

## Summary

Comprehensive analysis of all type definitions relevant to the governance feature across 7 source files: `types/agent.ts`, `types/team.ts`, `types/task.ts`, `types/document.ts`, `lib/types/amp.ts`, `lib/meeting-registry.ts`, `lib/document-registry.ts`.

---

## 1. Agent Type (`types/agent.ts`)

### Agent Interface (lines 152-228)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | YES | UUID |
| `name` | `string` | YES | Agent identity, e.g. "23blocks-apps-website" |
| `label` | `string` | optional | Display override |
| `avatar` | `string` | optional | URL or emoji |
| `ampIdentity` | `AMPAgentIdentity` | optional | Cryptographic identity for messaging |
| `workingDirectory` | `string` | optional | Default working directory |
| `sessions` | `AgentSession[]` | YES | Active/historical sessions |
| `alias` | `string` | optional | DEPRECATED |
| `hostId` | `string` | YES | Host identifier |
| `hostName` | `string` | optional | Human-readable host name |
| `hostUrl` | `string` | optional | Host URL for API/WebSocket |
| `program` | `string` | YES | AI program (e.g. "Claude Code") |
| `model` | `string` | optional | Model version |
| `taskDescription` | `string` | YES | What agent is working on |
| `programArgs` | `string` | optional | CLI arguments |
| `launchCount` | `number` | optional | Times agent has been woken |
| `tags` | `string[]` | optional | e.g. ["backend", "api"] |
| `capabilities` | `string[]` | optional | Technical capabilities |
| **`owner`** | **`string`** | **optional** | **Owner name or email** |
| **`team`** | **`string`** | **optional** | **Team name (e.g. "Backend Team")** |
| `documentation` | `AgentDocumentation` | optional | Links, notes, runbook |
| `metrics` | `AgentMetrics` | optional | Performance & cost tracking |
| **`metadata`** | **`Record<string, any>`** | **optional** | **User-defined key-value pairs** |
| `deployment` | `AgentDeployment` | YES | Local or cloud deployment config |
| `tools` | `AgentTools` | YES | Session, email, AMP, cloud, repos |
| `status` | `AgentStatus` | YES | `'active' \| 'idle' \| 'offline' \| 'deleted'` |
| `createdAt` | `string` | YES | ISO |
| `lastActive` | `string` | YES | ISO |
| `preferences` | `AgentPreferences` | optional | Default workdir, autoStart, notificationLevel |
| `skills` | `AgentSkillsConfig` | optional | Composable capabilities |
| `hooks` | `Record<string, string>` | optional | Event -> script path |
| `session` | `AgentSessionStatus` | optional | Runtime, not persisted |
| `isOrphan` | `boolean` | optional | Runtime |
| `_cached` | `boolean` | optional | Runtime |
| `ampRegistered` | `boolean` | optional | AMP protocol registration |
| `deletedAt` | `string` | optional | Soft-delete timestamp |

**Governance-relevant fields already present:**
- `owner?: string` -- simple string, no structured identity
- `team?: string` -- simple string, no link to Team entity by ID
- `metadata?: Record<string, any>` -- can carry arbitrary governance data but no schema

**Gaps for governance:**
- `team` is a free-text string, NOT a reference to `Team.id`. No team-membership linkage.
- No `role` field on Agent (there is `role?: string` on AgentSession but it's for session-level roles like "coordinator"/"backend")
- No permissions, access control, or governance policy fields
- `owner` is a plain string, not a structured identity with permissions

### AgentSession Interface (lines 139-146)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `index` | `number` | YES | 0 = primary |
| `status` | `'online' \| 'offline'` | YES | Runtime state |
| `workingDirectory` | `string` | optional | Override agent default |
| `role` | `string` | optional | Future: "coordinator", "backend", etc. |
| `createdAt` | `string` | optional | |
| `lastActive` | `string` | optional | |

### CreateAgentRequest (lines 424-445)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | `string` | YES | |
| `label` | `string` | optional | |
| `avatar` | `string` | optional | |
| `program` | `string` | YES | |
| `model` | `string` | optional | |
| `taskDescription` | `string` | YES | |
| `programArgs` | `string` | optional | |
| `tags` | `string[]` | optional | |
| `workingDirectory` | `string` | optional | |
| `createSession` | `boolean` | optional | |
| `sessionIndex` | `number` | optional | |
| `deploymentType` | `DeploymentType` | optional | |
| `hostId` | `string` | optional | |
| **`owner`** | **`string`** | **optional** | |
| **`team`** | **`string`** | **optional** | |
| `documentation` | `AgentDocumentation` | optional | |
| **`metadata`** | **`Record<string, any>`** | **optional** | |
| `alias` | `string` | optional | DEPRECATED |
| `displayName` | `string` | optional | DEPRECATED |

### UpdateAgentRequest (lines 450-467)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | `string` | optional | |
| `label` | `string` | optional | |
| `avatar` | `string` | optional | |
| `model` | `string` | optional | |
| `taskDescription` | `string` | optional | |
| `programArgs` | `string` | optional | |
| `tags` | `string[]` | optional | |
| **`owner`** | **`string`** | **optional** | |
| **`team`** | **`string`** | **optional** | |
| `workingDirectory` | `string` | optional | |
| `documentation` | `Partial<AgentDocumentation>` | optional | |
| **`metadata`** | **`Record<string, any>`** | **optional** | |
| `preferences` | `Partial<AgentPreferences>` | optional | |
| `alias` | `string` | optional | DEPRECATED |
| `displayName` | `string` | optional | DEPRECATED |

### Enums / Union Types

- `AgentStatus = 'active' | 'idle' | 'offline' | 'deleted'`
- `DeploymentType = 'local' | 'cloud'`
- `WebhookEventType = 'agent.email.changed' | 'agent.created' | 'agent.deleted' | 'agent.updated'`

### Supporting Types

- **AMPAgentIdentity** (lines 27-45): fingerprint, publicKeyHex, keyAlgorithm ('Ed25519'), createdAt, ampAddress?, tenant?
- **AMPExternalRegistration** (lines 51-78): provider, apiUrl, agentName, tenant, address, apiKey, providerAgentId, fingerprint, registeredAt
- **AgentDeployment** (lines 232-254): type (local|cloud), local? {hostname, platform}, cloud? {provider, region, ...}
- **AgentTools** (lines 256-276): session?, email?, amp?, cloud?, repositories?
- **AgentPreferences** (lines 361-365): defaultWorkingDirectory?, autoStart?, notificationLevel?
- **AgentDocumentation** (lines 367-377): description?, runbook?, wiki?, notes?, links?[]
- **AgentMetrics** (lines 379-395): performance + cost tracking fields

---

## 2. Team Type (`types/team.ts`)

### Team Interface (lines 8-18)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | YES | UUID |
| `name` | `string` | YES | e.g. "Backend Squad" |
| `description` | `string` | optional | |
| `agentIds` | `string[]` | YES | Agent UUIDs, order = display order |
| `instructions` | `string` | optional | Team-level markdown (like per-team CLAUDE.md) |
| `createdAt` | `string` | YES | ISO |
| `updatedAt` | `string` | YES | ISO |
| `lastMeetingAt` | `string` | optional | Last meeting start time |
| `lastActivityAt` | `string` | optional | Updated on any team interaction |

**Gaps for governance:**
- No `owner` or `lead` field (who owns the team?)
- No `roles` mapping (agent -> role within team)
- No governance/policy fields
- No permissions or access control
- `agentIds` is a flat array -- no role annotation per agent

### TeamsFile (lines 20-23)

| Field | Type | Required |
|-------|------|----------|
| `version` | `1` (literal) | YES |
| `teams` | `Team[]` | YES |

### Meeting Interface (lines 29-40)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | YES | UUID |
| `teamId` | `string \| null` | YES | Link to team for task persistence |
| `name` | `string` | YES | Display name |
| `agentIds` | `string[]` | YES | Participating agent UUIDs |
| `status` | `MeetingStatus` | YES | `'active' \| 'ended'` |
| `activeAgentId` | `string \| null` | YES | Last-viewed agent |
| `sidebarMode` | `SidebarMode` | YES | `'grid' \| 'list'` |
| `startedAt` | `string` | YES | ISO |
| `lastActiveAt` | `string` | YES | ISO |
| `endedAt` | `string` | optional | ISO |

**Gaps for governance:**
- No `agenda` or `purpose` field
- No `initiator` or `chairperson` field
- No decision/outcome tracking fields
- No governance context (who called the meeting, what authority)

### MeetingsFile (lines 42-45)

| Field | Type | Required |
|-------|------|----------|
| `version` | `1` (literal) | YES |
| `meetings` | `Meeting[]` | YES |

### TeamMeetingState (lines 57-69)

| Field | Type | Required |
|-------|------|----------|
| `phase` | `MeetingPhase` | YES |
| `selectedAgentIds` | `string[]` | YES |
| `teamName` | `string` | YES |
| `notifyAmp` | `boolean` | YES |
| `activeAgentId` | `string \| null` | YES |
| `joinedAgentIds` | `string[]` | YES |
| `sidebarMode` | `SidebarMode` | YES |
| `meetingId` | `string \| null` | YES |
| `rightPanelOpen` | `boolean` | YES |
| `rightPanelTab` | `RightPanelTab` | YES |
| `kanbanOpen` | `boolean` | YES |

### TeamMeetingAction (lines 72-91)

Union type with 18 action variants:
- `SELECT_AGENT`, `DESELECT_AGENT`, `LOAD_TEAM`, `START_MEETING`, `AGENT_JOINED`, `ALL_JOINED`, `END_MEETING`, `SET_ACTIVE_AGENT`, `TOGGLE_SIDEBAR_MODE`, `SET_TEAM_NAME`, `SET_NOTIFY_AMP`, `ADD_AGENT`, `REMOVE_AGENT`, `TOGGLE_RIGHT_PANEL`, `SET_RIGHT_PANEL_TAB`, `OPEN_RIGHT_PANEL`, `OPEN_KANBAN`, `CLOSE_KANBAN`, `RESTORE_MEETING`

### Enums / Union Types

- `MeetingStatus = 'active' | 'ended'`
- `MeetingPhase = 'idle' | 'selecting' | 'ringing' | 'active'`
- `SidebarMode = 'grid' | 'list'`
- `RightPanelTab = 'tasks' | 'chat'`

---

## 3. Task Type (`types/task.ts`)

### Task Interface (lines 10-23)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | YES | UUID |
| `teamId` | `string` | YES | Team this task belongs to |
| `subject` | `string` | YES | Task title |
| `description` | `string` | optional | Detailed description |
| `status` | `TaskStatus` | YES | 5-state workflow |
| `assigneeAgentId` | `string \| null` | optional | Assigned agent |
| `blockedBy` | `string[]` | YES | Dependency task IDs |
| `priority` | `number` | optional | 0 = highest |
| `createdAt` | `string` | YES | ISO |
| `updatedAt` | `string` | YES | ISO |
| `startedAt` | `string` | optional | |
| `completedAt` | `string` | optional | |

### TaskWithDeps (lines 25-29)

Extends `Task` with derived fields:

| Field | Type | Notes |
|-------|------|-------|
| `blocks` | `string[]` | Computed: task IDs this blocks |
| `isBlocked` | `boolean` | true if any blockedBy task not completed |
| `assigneeName` | `string` | optional, resolved agent display name |

### TasksFile (lines 31-34)

| Field | Type | Required |
|-------|------|----------|
| `version` | `1` (literal) | YES |
| `tasks` | `Task[]` | YES |

### Enums

- `TaskStatus = 'backlog' | 'pending' | 'in_progress' | 'review' | 'completed'`

**Gaps for governance:**
- No `createdBy` field (who created the task)
- No `approvedBy` field (who approved it)
- No governance-level priority or escalation
- `teamId` links to Team but no meeting context

---

## 4. Document Type (`types/document.ts`)

### TeamDocument Interface (lines 8-17)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | YES | UUID |
| `teamId` | `string` | YES | Team this doc belongs to |
| `title` | `string` | YES | |
| `content` | `string` | YES | Markdown |
| `pinned` | `boolean` | optional | Pinned docs appear first |
| `tags` | `string[]` | optional | Organization tags |
| `createdAt` | `string` | YES | ISO |
| `updatedAt` | `string` | YES | ISO |

### TeamDocumentsFile (lines 19-22)

| Field | Type | Required |
|-------|------|----------|
| `version` | `1` (literal) | YES |
| `documents` | `TeamDocument[]` | YES |

**Gaps for governance:**
- No `createdBy` / `author` field
- No `visibility` or access control
- No version history

---

## 5. AMP Types (`lib/types/amp.ts`)

### AMPEnvelope (lines 109-142)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | `string` | YES | e.g. "amp/0.1" |
| `id` | `string` | YES | msg_{timestamp}_{random} |
| `from` | `string` | YES | Sender AMP address |
| `to` | `string` | YES | Recipient AMP address |
| `subject` | `string` | YES | |
| `priority` | `'low' \| 'normal' \| 'high' \| 'urgent'` | YES | |
| `timestamp` | `string` | YES | ISO 8601 |
| `expires_at` | `string` | optional | ISO 8601 |
| `signature` | `string` | YES | Ed25519 base64 |
| `in_reply_to` | `string` | optional | Original message ID |
| `thread_id` | `string` | YES | First message ID in thread |

### AMPPayload (lines 148-160)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | union (see below) | YES | Message content type |
| `message` | `string` | YES | Main body |
| `context` | `Record<string, unknown>` | optional | Structured metadata |
| `attachments` | `AMPAttachment[]` | optional | File attachments |

**AMPPayload.type values:** `'request' | 'response' | 'notification' | 'alert' | 'task' | 'status' | 'handoff' | 'ack' | 'update' | 'system'`

### AMPRouteRequest (lines 314-348)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `from` | `string` | optional | Original sender (mesh forwarding) |
| `to` | `string` | YES | Recipient address |
| `subject` | `string` | YES | |
| `priority` | `'low' \| 'normal' \| 'high' \| 'urgent'` | optional | |
| `in_reply_to` | `string` | optional | |
| `expires_at` | `string` | optional | |
| `payload` | `AMPPayload` | YES | |
| `signature` | `string` | optional | Client-provided Ed25519 |
| `options` | `{ receipt?: boolean }` | optional | |

### AMPRegistrationRequest (lines 189-223)

| Field | Type | Required |
|-------|------|----------|
| `tenant` | `string` | YES |
| `name` | `string` | YES |
| `public_key` | `string` | YES |
| `key_algorithm` | `'Ed25519' \| 'RSA' \| 'ECDSA'` | YES |
| `alias` | `string` | optional |
| `scope` | `{ platform?, repo? }` | optional |
| `delivery` | `{ webhook_url?, webhook_secret?, prefer_websocket? }` | optional |
| `metadata` | `Record<string, unknown>` | optional |
| `invite_code` | `string` | optional |

**Governance-relevant aspects of AMP:**
- `AMPPayload.context` (`Record<string, unknown>`) could carry governance metadata (team context, authorization, role info) without schema changes
- `AMPPayload.type` already has `'task'` and `'handoff'` which are governance-adjacent
- `AMPEnvelope` has no team/governance fields -- messages are agent-to-agent only
- `AMPRegistrationRequest.scope` has `platform?` and `repo?` but no `team?` or `organization?` beyond `tenant`

### Other AMP Types (for reference)

- **AMPMessage** = `{ envelope: AMPEnvelope, payload: AMPPayload }`
- **AMPPendingMessage** = queued message with sender_public_key, queued_at, expires_at, delivery_attempts
- **AMPRouteResponse** = { id, status: 'delivered'|'queued'|'failed', method?, ... }
- **AMPHealthResponse** = { status, version, provider, federation, agents_online, uptime_seconds }
- **AMPErrorCode** = 17 error codes including 'organization_not_set', 'tenant_access_denied'
- **AMPApiKeyRecord** = stored key with hash, agent_id, tenant_id, status
- **AMPAgentInfo** = { address, alias?, delivery?, fingerprint, registered_at, last_seen_at? }
- **AMPFederationDeliveryRequest** = { envelope, payload, sender_public_key }

---

## 6. Meeting Registry (`lib/meeting-registry.ts`)

**Storage:** `~/.aimaestro/teams/meetings.json`

### Exported Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `loadMeetings()` | `() => Meeting[]` | Auto-prunes ended meetings >7 days |
| `saveMeetings(meetings)` | `(Meeting[]) => boolean` | |
| `getMeeting(id)` | `(string) => Meeting \| null` | |
| `createMeeting(data)` | `({ name, agentIds, teamId, sidebarMode? }) => Meeting` | Generates UUID, sets status='active' |
| `updateMeeting(id, updates)` | `(string, Partial<Pick<Meeting, ...>>) => Meeting \| null` | Updates: name, agentIds, status, activeAgentId, sidebarMode, lastActiveAt, endedAt, teamId |
| `deleteMeeting(id)` | `(string) => boolean` | |

**Internal:**
- `ensureTeamsDir()` - creates `~/.aimaestro/teams/` if missing
- `pruneOldEnded(meetings)` - removes ended meetings older than 7 days
- `PRUNE_DAYS = 7`

**Gaps for governance:**
- `createMeeting` takes no initiator/chairperson
- `updateMeeting` accepts no governance-related updates
- No audit trail of who started/ended meetings

---

## 7. Document Registry (`lib/document-registry.ts`)

**Storage:** `~/.aimaestro/teams/docs-{teamId}.json` (one file per team)

### Exported Functions

| Function | Signature | Notes |
|----------|-----------|-------|
| `loadDocuments(teamId)` | `(string) => TeamDocument[]` | |
| `saveDocuments(teamId, docs)` | `(string, TeamDocument[]) => boolean` | |
| `getDocument(teamId, docId)` | `(string, string) => TeamDocument \| null` | |
| `createDocument(data)` | `({ teamId, title, content, pinned?, tags? }) => TeamDocument` | Generates UUID |
| `updateDocument(teamId, docId, updates)` | `(string, string, Partial<Pick<..., 'title' \| 'content' \| 'pinned' \| 'tags'>>) => TeamDocument \| null` | Auto-updates `updatedAt` |
| `deleteDocument(teamId, docId)` | `(string, string) => boolean` | |

**Gaps for governance:**
- No `createdBy` or author tracking
- No version history / audit trail
- No access control per document

---

## 8. Governance Feature: Where New Fields Would Need to Be Added

### On `Agent` (types/agent.ts)
- Change `team?: string` to `teamIds?: string[]` (array of Team.id references) or add structured team membership
- Add `role?: string` at agent level (not just session level)
- Structure `owner` beyond plain string (e.g., `{ id: string, name: string, type: 'user' | 'team' }`)
- Add governance-related fields to `metadata` schema or create dedicated fields

### On `Team` (types/team.ts)
- Add `ownerId?: string` or `leadAgentId?: string`
- Add `roles?: Record<string, string>` mapping agentId -> role within team
- Add governance policy fields (e.g., `approvalRequired?: boolean`, `votingThreshold?: number`)
- Add `parentTeamId?: string` for team hierarchy

### On `Meeting` (types/team.ts)
- Add `initiatorAgentId?: string`
- Add `agenda?: string`
- Add `decisions?: MeetingDecision[]`
- Add `outcomes?: string`

### On `Task` (types/task.ts)
- Add `createdByAgentId?: string`
- Add `approvedByAgentId?: string`
- Add `meetingId?: string` linking task to originating meeting

### On `TeamDocument` (types/document.ts)
- Add `createdByAgentId?: string`
- Add `visibility?: 'team' | 'public' | 'private'`

### On AMP (lib/types/amp.ts)
- `AMPPayload.context` can carry governance data without schema changes (most flexible)
- Consider adding `team_context?: { teamId: string, meetingId?: string, role?: string }` to AMPEnvelope for protocol-level team awareness
- Add new `AMPPayload.type` values: `'governance'`, `'vote'`, `'approval'`

### On Meeting Registry (lib/meeting-registry.ts)
- `createMeeting` should accept `initiatorAgentId`
- `updateMeeting` should accept governance-related fields
- Add audit logging

### On Document Registry (lib/document-registry.ts)
- `createDocument` should accept `createdByAgentId`
- Add version history tracking
