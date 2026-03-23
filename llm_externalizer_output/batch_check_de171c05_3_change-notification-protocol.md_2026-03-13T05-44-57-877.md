# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/references/change-notification-protocol.md`
- **Task**: You are analyzing messaging templates and notification protocols from the "AI Maestro Orchestrator Agent" (AMOA). The orchestrator uses these to notify programmer agents, the integrator, and the chief-of-staff about task assignments, status changes, and progress updates.

For each file, extract:
1. MESSAGE TEMPLATES: Exact message templates with all fields and placeholders
2. NOTIFICATION TYPES: What types of notifications exist? (task-assigned, status-change, blocker-reported, review-requested, etc.)
3. MESSAGE PRIORITY: How are messages prioritized? What priority levels?
4. DELIVERY METHOD: Does it use AMP (amp-send.sh) or direct API calls? What format?
5. RESPONSE PROTOCOLS: What responses are expected from agents after receiving notifications?
6. LIFECYCLE MESSAGES: Messages for each task state transition (assigned, in-progress, review, done, blocked)

Extract EXACT templates and formats - these are what AI Maestro needs to replicate.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the messaging templates and notification protocols from the "AI Maestro Orchestrator Agent" (AMOA). Let me extract the required information from the provided markdown file.

Let me go through each requirement:

1. MESSAGE TEMPLATES: Exact message templates with all fields and placeholders
2. NOTIFICATION TYPES: What types of notifications exist?
3. MESSAGE PRIORITY: How are messages prioritized? What priority levels?
4. DELIVERY METHOD: Does it use AMP (amp-send.sh) or direct API calls?
5. RESPONSE PROTOCOLS: What responses are expected from agents after receiving notifications?
6. LIFECYCLE MESSAGES: Messages for each task state transition

Let me analyze the file:

## 1. MESSAGE TEMPLATES

### Toolchain Update
```json
{
  "type": "change-notification",
  "category": "toolchain",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "tool": "python",
      "old_version": "3.11",
      "new_version": "3.12",
      "action_required": "Update local environment"
    },
    {
      "tool": "ruff",
      "old_version": "0.3.0",
      "new_version": "0.8.0",
      "action_required": "Run ruff check with new rules"
    }
  ],
  "effective_immediately": true
}
```

### Specification Update
```json
{
  "type": "change-notification",
  "category": "specification",
  "urgency": "medium",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "affected_tasks": ["GH-42", "GH-45"],
  "changes": [
    {
      "spec_file": "docs/api-spec.md",
      "section": "Authentication",
      "summary": "JWT expiry changed from 7d to 24h",
      "diff_url": "https://github.com/.../commit/abc123"
    }
  ],
  "action_required": "Review and adjust implementation"
}
```

### Priority Change
```json
{
  "type": "change-notification",
  "category": "priority",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "task_id": "GH-42",
      "old_priority": "normal",
      "new_priority": "critical",
      "reason": "Security vulnerability discovered"
    }
  ],
  "action_required": "Pause current work, focus on GH-42"
}
```

### Dependency Update
```json
{
  "type": "change-notification",
  "category": "dependency",
  "urgency": "medium",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "package": "shared-utils",
      "old_version": "1.2.0",
      "new_version": "2.0.0",
      "breaking_changes": true,
      "migration_guide": "See CHANGELOG.md"
    }
  ]
}
```

### Agent Response / Acknowledgment
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "acknowledged",
  "impact_assessment": "Will need to update 3 test files",
  "questions": []
}
```

### Reminder Notification Format
```json
{
  "type": "change-notification",
  "notification_id": "notif-123",
  "reminder": true,
  "reminder_count": 1,
  "original_sent_at": "2025-12-31T10:00:00Z",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "message": "REMINDER: Acknowledge toolchain update before continuing work"
}
```

### Error Response Format
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "error",
  "error": {
    "code": "cannot-apply-change",
    "reason": "Python 3.12 not available in container",
    "current_environment": {
      "python_version": "3.11.5",
      "os": "Ubuntu 22.04",
      "container": true
    },
    "assistance_needed": true,
    "suggested_action": "Update container image to python:3.12-slim"
  }
}
```

### Partial Application Response
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "partial",
  "applied": [
    "ruff upgraded to 0.8.0",
    "mypy upgraded to 1.14.0"
  ],
  "failed": [
    {
      "change": "Python upgrade to 3.13",
      "reason": "Not available in current package manager"
    }
  ],
  "assistance_needed": true
}
```

### Broadcast (All Agents)
```json
{
  "type": "change-notification",
  "broadcast": true,
  "target_agents": [],
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"]
}
```

### Targeted (Specific Agents)
```json
{
  "type": "change-notification",
  "broadcast": false,
  "target_agents": ["dev-agent-1", "dev-agent-2"],
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"]
}
```

## 2. NOTIFICATION TYPES

1. **toolchain** - When project toolchain changes (Python version, linters, etc.)
2. **specification** - When requirements change
3. **priority** - When task priorities shift
4. **dependency** - When shared dependencies change

## 3. MESSAGE PRIORITY

Urgency Levels:
- `critical` - Stop work immediately, apply change before continuing
- `high` - Complete current task, then apply change before starting next task
- `medium` - Apply change at next checkpoint (after current file/function/test)
- `low` - Apply change when convenient (next session or task break)

## 4. DELIVERY METHOD

The file doesn't explicitly mention AMP (amp-send.sh) or direct API calls. It mentions:
- "Link to `echo-acknowledgment-protocol.md` for response handling"
- "Log all notifications in session memory"
- "Track which agents acknowledged"
- Uses message inbox pattern

So the delivery method appears to be via message inbox, but the specific mechanism (AMP vs API) is not detailed in this file.

## 5. RESPONSE PROTOCOLS

Agents must acknowledge change notifications with:
- `change-acknowledgment` response type
- Include `notification_id`
- Status can be: `acknowledged`, `error`, or `partial`
- Include `impact_assessment` and any `questions`

Error states:
- `cannot-apply-change` - Agent unable to comply
- `breaking-change-detected` - Change breaks current work
- `incompatible-environment` - Local env can't support change
- `no-acknowledgment-after-reminders` - No response after multiple reminders
- `partial-application` - Some changes applied, some failed

## 6. LIFECYCLE MESSAGES

The file focuses on change notifications rather than task lifecycle. However, it references:
- "For detailed mid-task update message formats, see `mid-task-update-templates.md`"

This suggests there are additional lifecycle messages in other files, but this particular file is about change notifications, not task state transitions.

Let me provide a comprehensive response.
# Analysis: Change Notification Protocol

## 1. MESSAGE TEMPLATES

### Toolchain Update Notification
```json
{
  "type": "change-notification",
  "category": "toolchain",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "tool": "python",
      "old_version": "3.11",
      "new_version": "3.12",
      "action_required": "Update local environment"
    },
    {
      "tool": "ruff",
      "old_version": "0.3.0",
      "new_version": "0.8.0",
      "action_required": "Run ruff check with new rules"
    }
  ],
  "effective_immediately": true
}
```

### Specification Update Notification
```json
{
  "type": "change-notification",
  "category": "specification",
  "urgency": "medium",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "affected_tasks": ["GH-42", "GH-45"],
  "changes": [
    {
      "spec_file": "docs/api-spec.md",
      "section": "Authentication",
      "summary": "JWT expiry changed from 7d to 24h",
      "diff_url": "https://github.com/.../commit/abc123"
    }
  ],
  "action_required": "Review and adjust implementation"
}
```

### Priority Change Notification
```json
{
  "type": "change-notification",
  "category": "priority",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "task_id": "GH-42",
      "old_priority": "normal",
      "new_priority": "critical",
      "reason": "Security vulnerability discovered"
    }
  ],
  "action_required": "Pause current work, focus on GH-42"
}
```

### Dependency Update Notification
```json
{
  "type": "change-notification",
  "category": "dependency",
  "urgency": "medium",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "changes": [
    {
      "package": "shared-utils",
      "old_version": "1.2.0",
      "new_version": "2.0.0",
      "breaking_changes": true,
      "migration_guide": "See CHANGELOG.md"
    }
  ]
}
```

### Agent Acknowledgment Response
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "acknowledged",
  "impact_assessment": "Will need to update 3 test files",
  "questions": []
}
```

### Reminder Notification
```json
{
  "type": "change-notification",
  "notification_id": "notif-123",
  "reminder": true,
  "reminder_count": 1,
  "original_sent_at": "2025-12-31T10:00:00Z",
  "urgency": "high",
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"],
  "message": "REMINDER: Acknowledge toolchain update before continuing work"
}
```

### Error Response (Cannot Apply Change)
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "error",
  "error": {
    "code": "cannot-apply-change",
    "reason": "Python 3.12 not available in container",
    "current_environment": {
      "python_version": "3.11.5",
      "os": "Ubuntu 22.04",
      "container": true
    },
    "assistance_needed": true,
    "suggested_action": "Update container image to python:3.12-slim"
  }
}
```

### Partial Application Response
```json
{
  "type": "change-acknowledgment",
  "notification_id": "notif-123",
  "status": "partial",
  "applied": [
    "ruff upgraded to 0.8.0",
    "mypy upgraded to 1.14.0"
  ],
  "failed": [
    {
      "change": "Python upgrade to 3.13",
      "reason": "Not available in current package manager"
    }
  ],
  "assistance_needed": true
}
```

### Broadcast vs Targeted Formats
```json
// Broadcast (All Agents)
{
  "type": "change-notification",
  "broadcast": true,
  "target_agents": [],
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"]
}

// Targeted (Specific Agents)
{
  "type": "change-notification",
  "broadcast": false,
  "target_agents": ["dev-agent-1", "dev-agent-2"],
  "config_location": "design/config/",
  "affected_files": ["project-context.md", "standards.md"]
}
```

---

## 2. NOTIFICATION TYPES

| Type | Category | Description |
|------|----------|-------------|
| 1 | `toolchain` | Project toolchain changes (Python version, linters, formatters) |
| 2 | `specification` | Requirements/specification changes |
| 3 | `priority` | Task priority shifts |
| 4 | `dependency` | Shared dependency updates |

---

## 3. MESSAGE PRIORITY (Urgency Levels)

| Level | Action Required |
|-------|-----------------|
| `critical` | Stop work immediately, apply change before continuing |
| `high` | Complete current task, then apply change before starting next task |
| `medium` | Apply change at next checkpoint (after current file/function/test) |
| `low` | Apply change when convenient (next session or task break) |

### Escalation Criteria

| Urgency | Escalate When |
|---------|---------------|
| `critical` | After 2nd reminder with no acknowledgment |
| `high` | After 2nd reminder with no acknowledgment |
| `medium` | After 3rd reminder with no acknowledgment (optional) |
| `low` | No escalation needed (log warning only) |

---

## 4. DELIVERY METHOD

**Not explicitly specified in this file.** The protocol references:
- Message inbox pattern for delivery
- Session memory for logging notifications
- Integration with `echo-acknowledgment-protocol.md` for response handling
- Integration with `messaging-protocol.md` for priority levels

The specific delivery mechanism (AMP/amp-send.sh vs direct API) is **not defined** in this document. It references other files for complete integration.

---

## 5. RESPONSE PROTOCOLS

### Expected Agent Response
Agents must send a `change-acknowledgment` message with:
- `notification_id` - Must match the original notification
- `status` - One of: `acknowledged`, `error`, `partial`
- `impact_assessment` - Description of effect on work
- `questions` - Array of clarifying questions (can be empty)

### Error States

| Error Code | Meaning |
|------------|---------|
| `cannot-apply-change` | Agent unable to comply |
| `breaking-change-detected` | Change breaks current work |
| `incompatible-environment` | Local env can't support change |
| `no-acknowledgment-after-reminders` | No response after multiple reminders |
| `partial-application` | Some changes applied, some failed |

### Acknowledgment Flow
1. Send notification to target agent(s)
2. Log notification in session memory with `pending` status
3. Monitor for acknowledgment via message inbox
4. On acknowledgment: update status to `acknowledged`, log response
5. If no acknowledgment: send reminder with `reminder: true` flag
6. If still no acknowledgment: escalate per urgency criteria

---

## 6. LIFECYCLE MESSAGES

**This file does NOT contain task lifecycle state transition messages.** It focuses specifically on **change notifications** (toolchain, specification, priority, dependency changes).

The document explicitly references another file for lifecycle messages:
> "For detailed mid-task update message formats, see `mid-task-update-templates.md`."

The decision trees provided show:
- **Module Modification Notification Dispatch** - When to notify agents about module changes
- **Priority Change Notification Dispatch** - How priority changes trigger notifications

---

## Integration References

This protocol integrates with:
- `echo-acknowledgment-protocol.md` - Acknowledgment pattern
- `task-instruction-format.md` - Config section (Project Configuration)
- `messaging-protocol.md` - Priority levels and message envelope
- `session-memory/` - Track agent acknowledgments
- `artifact-sharing-protocol.md` - Config files as artifacts
- `mid-task-update-templates.md` - Mid-task update formats (separate file)