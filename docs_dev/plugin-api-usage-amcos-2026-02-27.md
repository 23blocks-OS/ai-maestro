# AMCOS Plugin (Emasoft Chief of Staff) - AI Maestro API Usage Report
**Generated:** 2026-02-27
**Plugin:** Emasoft Chief of Staff (AMCOS)
**Location:** ~/.claude/plugins/cache/emasoft-plugins/emasoft-chief-of-staff/1.3.5

## Executive Summary

The AMCOS plugin primarily uses:
- **AI Maestro Agent Messaging Protocol (AMP)** for inter-agent communication
- **AI Maestro REST API** for session queries and agent management  
- **CLI-based commands** (aimaestro-agent.sh) for agent operations
- **Local file-based registries** for team, project, and task state

### Key Statistics
- HTTP Endpoints Referenced: 9
- Direct curl Commands: 1
- AMP Commands Used: 7+
- Skills: 14 specialized operational skills
- Hooks: 1 system hook
- Scripts: 20+ Python automation scripts

---

## 1. PRIMARY API ENDPOINTS

### /api/sessions (ACTIVE)
- **Method:** GET
- **Host:** localhost:23000
- **Example:** curl -s "http://localhost:23000/api/sessions" | jq '.sessions[]'
- **Purpose:** Query active AI Maestro agent sessions/tmux sessions
- **Response:** JSON array of session objects with name, id, status, created, workingDirectory, project
- **Used By:** ecos-team-coordination skill for team status awareness
- **Auth:** None (localhost-only, Phase 1)

### Secondary Endpoints (Documentation References Only)
- /api/auth - Authentication service
- /api/auth/login - Login endpoint
- /api/auth/routes - Route definitions
- /api/users - User management

**Note:** These are in documentation examples, not confirmed in active code.

---

## 2. AGENT MESSAGING PROTOCOL (AMP)

### AMP Commands (7 instances found)
Scripts using amp-send for team communication:
- ecos_failure_recovery.py - Recovery notifications
- ecos_stop_check.py - Shutdown notifications
- ecos_approval_manager.py - Approval requests
- ecos_notify_agent.py - Generic notifications
- ecos_notification_protocol.py - Protocol notifications
- ecos_reindex_skills.py - Skill reindexing
- ecos_team_registry.py - Registry changes

### AMP Message Format
{
  "to": "<agent-name>",
  "subject": "<subject>",
  "priority": "normal|high|urgent",
  "content": {
    "type": "<message-type>",
    "message": "<body>"
  }
}

### Message Types Used
- role-assignment: Assign roles to agents
- role-acceptance: Agent role acceptance
- announcement: Team announcements
- recovery-notification: Failure recovery
- approval-request: Request approvals
- health-check: Agent health ping
- notification: Generic notifications

---

## 3. AIMAESTRO-AGENT.SH CLI INTEGRATION

### Commands Used
- aimaestro-agent.sh list - List all agents
- aimaestro-agent.sh status <agent> - Get agent status
- aimaestro-agent.sh messages <agent> --unread - Get unread messages

### Response Formats
- Sessions: JSON array with agent metadata
- Status: Enum (online|offline|idle|busy)
- Messages: JSON array with id, from, subject, timestamp, content

---

## 4. AMCOS SKILLS (14 Total)

| Skill | Purpose | APIs Used |
|-------|---------|-----------|
| ecos-agent-lifecycle | Spawn, terminate, hibernate agents | AMP, aimaestro-agent.sh |
| ecos-failure-recovery | Recover from agent failures | AMP, aimaestro-agent.sh status |
| ecos-label-taxonomy | Label management | AMP, file registry |
| ecos-multi-project | Multi-project coordination | AMP, /api/sessions |
| ecos-notification-protocols | Notification delivery | AMP |
| ecos-onboarding | Agent onboarding | AMP, file registry |
| ecos-performance-tracking | Performance metrics | AMP, files |
| ecos-permission-management | Permission enforcement | AMP, registry |
| ecos-plugin-management | Plugin lifecycle | AMP, aimaestro-agent.sh |
| ecos-resource-monitoring | Resource tracking | aimaestro-agent.sh, AMP |
| ecos-session-memory-library | Session memory sync | File I/O only |
| ecos-skill-management | Skill lifecycle | AMP, registry |
| ecos-staff-planning | Staff planning | AMP, registry |
| ecos-team-coordination | Team coordination | AMP, /api/sessions |

---

## 5. HTTP HEADERS & AUTHENTICATION

### Current Implementation (Phase 1 - Localhost)
- No explicit headers found
- No authentication required
- Content-Type: Implicit JSON
- User-Agent: Standard curl/CLI defaults

### Future Headers (Phase 2+)
- X-Agent-Id: Agent UUID
- X-Governance-Password: Governance enforcement
- Authorization: Bearer token
- Content-Type: application/json

---

## 6. REQUEST BODY PATTERNS

### AMP Message Body (Most Common)
{
  "to": "agent-name",
  "subject": "Message Subject",
  "priority": "normal",
  "content": {
    "type": "message-type",
    "message": "Message content"
  }
}

### Role Assignment
{
  "to": "target-agent",
  "subject": "Role Assignment: Backend Developer",
  "priority": "high",
  "content": {
    "type": "role-assignment",
    "message": "Assigned as Backend Developer for project X"
  }
}

---

## 7. RESPONSE FORMATS

### /api/sessions Response
{
  "sessions": [
    {
      "name": "agent-name",
      "id": "session-id",
      "status": "active",
      "created": "2026-02-27T10:30:00Z",
      "workingDirectory": "/path/to/work",
      "project": "project-name"
    }
  ]
}

### AMP Message Response
{
  "id": "message-id",
  "from": "sender-agent",
  "to": "recipient-agent",
  "subject": "Subject",
  "priority": "normal",
  "content": {"type": "msg-type", "message": "Content"},
  "timestamp": "2026-02-27T10:30:00Z",
  "delivered": true
}

### Agent Status Response
{
  "agent": "agent-name",
  "status": "online|offline|idle",
  "lastSeen": "2026-02-27T10:30:00Z",
  "sessionId": "session-id",
  "working": true
}

---

## 8. HOOKS

### Found: 1 Hook Script
Location: hooks/ directory
Purpose: System lifecycle event handling
Triggers: Agent start/stop, initialization, shutdown

---

## 9. LOCAL STATE (File-Based, Not APIs)

~/.aimaestro/
├── agents/registry.json - Agent metadata
~/.emasoft/
├── team-registry.json - Team composition
├── project-state.json - Multi-project tracking
├── chief-of-staff-state.md - AMCOS state

---

## 10. ENVIRONMENT VARIABLES

AIMAESTRO_API=http://localhost:23000
AIMAESTRO_AGENT=<current-agent-name>
AIMAESTRO_POLL_INTERVAL=10

---

## 11. SECURITY NOTES

### Current (Phase 1)
- Localhost-only binding
- No remote attacks possible
- OS-level user isolation
- Signed AMP messages (Ed25519)

### Gaps (Phase 2+)
- No mutual TLS for inter-host
- No API key management
- No rate limiting
- No audit trail

---

## 12. INTEGRATION CHECKLIST

- [x] /api/sessions endpoint
- [x] AMP message routing
- [x] aimaestro-agent.sh CLI tool
- [x] Local message storage
- [x] Push notifications
- [x] Priority levels support
- [ ] Cross-host federation (Phase 2+)
- [ ] Governance enforcement headers (Phase 2+)
- [ ] Fine-grained permissions (Phase 2+)

---

## 13. API CALL FREQUENCY

### Most Used
1. AMP message sending (amp-send) - 7+ scripts
2. Session listing (/api/sessions) - team-coordination skill
3. Agent status checks (aimaestro-agent.sh status) - health monitoring

### Occasionally Used
- Message inbox polling (amp-inbox)
- Individual message reads (amp-read)

### Rarely/Never
- /api/auth endpoints (examples only)
- /api/users endpoints (examples only)

---

## 14. Summary Table

| Endpoint | Method | Purpose | Frequency | Auth | Status |
|----------|--------|---------|-----------|------|--------|
| /api/sessions | GET | Query agents | High | None | Active |
| amp-send | CLI | Send messages | Very High | Ed25519 | Active |
| aimaestro-agent.sh list | CLI | List agents | High | None | Active |
| aimaestro-agent.sh status | CLI | Health check | High | None | Active |
| amp-inbox | CLI | Check inbox | Medium | Ed25519 | Active |
| amp-read | CLI | Read message | Low | Ed25519 | Active |
| /api/auth/* | GET/POST | Examples only | None | N/A | Documentation |
| /api/users* | GET/PUT | Examples only | None | N/A | Documentation |

---

## 15. SCRIPT-TO-API MAPPING

- ecos_failure_recovery.py: amp-send, aimaestro-agent.sh status/messages
- ecos_stop_check.py: amp-send
- ecos_approval_manager.py: amp-send
- ecos_notify_agent.py: amp-send
- ecos_notification_protocol.py: amp-send
- ecos_reindex_skills.py: amp-send
- ecos_team_registry.py: amp-send, /api/sessions
- ecos_session_start.py: aimaestro-agent.sh
- ecos_resource_monitor.py: aimaestro-agent.sh status

---

## Findings Summary

**Total API Touchpoints Identified:**
- 1 active HTTP endpoint (/api/sessions)
- 7+ active AMP commands (amp-send, amp-inbox, amp-read)
- 3 CLI tools (aimaestro-agent.sh list/status/messages)
- 0 explicit headers/authentication
- 1 hook script for lifecycle events

**Most Critical Integration Points:**
1. /api/sessions - Session discovery
2. AMP messaging - Team coordination
3. aimaestro-agent.sh - Agent management

---

Generated: 2026-02-27
