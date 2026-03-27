# Fork Audit Safety Specification

Every changed service/API file must satisfy ALL of these rules.

## Identity & Authentication
- Every governance-protected API endpoint must call authenticateAgent() from request headers
- X-Agent-Id without Authorization header must be REJECTED (401, spoofing prevention)
- Agent identity must be verified before any write operation on teams, tasks, agents, governance
- Message routing must verify Ed25519 signature before delivery

## Title-Based Access Control
- MANAGER title: only ONE agent, can manage all teams, cannot assign COS (USER-only)
- COS title: scoped to ONE closed team, requires GovernanceRequest approval from MANAGER for destructive ops
- MEMBER title: no governance powers, can only update own assigned tasks
- Creating/deleting teams is USER-ONLY (requires governance password)
- Assigning/removing COS is USER-ONLY (requires governance password)
- MANAGER and COS must be Claude-only (role-plugins are Claude-only)

## Team Governance
- Closed teams MUST have a COS at all times (R1.4 invariant)
- Removing COS from closed team MUST downgrade to open (R1.5)
- Normal agents can belong to max ONE closed team (R4.1)
- COS can lead max ONE closed team (R3.4)
- MANAGER can belong to unlimited teams

## Messaging Isolation
- Normal closed-team member: can ONLY message same-team + own COS
- COS: can message own team + other COS + MANAGER + open-world
- MANAGER: unrestricted
- Outside sender: CANNOT reach closed-team agents
- Message filter MUST be called before every local delivery

## Task/Kanban Security
- Task status updates must verify caller is assignee OR COS OR MANAGER
- Task creation requires team membership
- Task assignment requires COS or MANAGER role

## Role-Plugin Safety
- autoAssignRolePluginForTitle() must REJECT non-Claude agents for MANAGER/COS
- Role-plugins always installed with --scope local
- Only one role-plugin active per agent at a time
- MANAGER locked to ai-maestro-assistant-manager-agent plugin
- COS locked to ai-maestro-chief-of-staff plugin

## Cross-Client Safety
- Non-Claude agents get skills via cross-client installer (not plugins)
- Aider agents get aider-skills package in project venv (not global)
- Identity auto-initialized for all non-Claude agents
- Skills Explorer checks for duplicates before installing (plugin + standalone)

## API Consistency
- All service functions return ServiceResult<T> pattern
- All errors include descriptive messages
- All destructive operations have confirmation guards
- No raw error details exposed to clients (use generic messages)
