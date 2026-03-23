# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-messaging-templates/references/task-lifecycle-templates.md`
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

The user wants me to analyze the messaging templates from the AI Maestro Orchestrator Agent (AMOA). Let me extract the required information from the provided markdown file.

Let me go through each section and extract:

1. MESSAGE TEMPLATES: Exact message templates with all fields and placeholders
2. NOTIFICATION TYPES: What types of notifications exist?
3. MESSAGE PRIORITY: How are messages prioritized? What priority levels?
4. DELIVERY METHOD: Does it use AMP (amp-send.sh) or direct API calls?
5. RESPONSE PROTOCOLS: What responses are expected from agents?
6. LIFECYCLE MESSAGES: Messages for each task state transition

Let me analyze the file:

## 1. MESSAGE TEMPLATES

### Task Cancellation (AMOA to Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Cancelled: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Task <task-id> is cancelled. Reason: <reason-description>. Stop all work on this task. Provide a summary of work completed so far, files modified, and any pull requests created.",
    "data": {
      "task_id": "<task-id>",
      "action": "cancel",
      "reason": "<requirements_changed|task_superseded|project_cancelled>",
      "reason_detail": "<human-readable explanation of why the task is cancelled>",
      "work_summary_required": true,
      "superseded_by": "<new-task-id-if-applicable-or-null>"
    }
  }
}
```

### Agent Responds: Cancellation Acknowledgment
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Cancel: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> cancellation acknowledged. Work summary: <brief-description-of-what-was-done>. All work stopped.",
    "data": {
      "task_id": "<task-id>",
      "status": "cancelled",
      "work_summary": {
        "completed_items": ["<item-1>", "<item-2>"],
        "files_modified": ["<path/to/file-1>", "<path/to/file-2>"],
        "pull_requests": ["<pr-url-if-any>"],
        "uncommitted_work": "<description-of-any-uncommitted-changes-or-none>",
        "time_spent_description": "<brief estimate of effort spent>"
      }
    }
  }
}
```

### Task Pause (AMOA to Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Paused: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Pause work on task <task-id>. Reason: <reason-description>. Save your current state and report a checkpoint so work can be resumed later. Expected pause duration: <duration>.",
    "data": {
      "task_id": "<task-id>",
      "action": "pause",
      "reason": "<dependency_blocked|priority_shift|resource_constraint>",
      "reason_detail": "<human-readable explanation of why the task is paused>",
      "expected_duration": "<estimated time until resume, e.g. '2 hours', '1 day', 'unknown'>",
      "blocking_dependency": "<task-id-or-resource-that-is-blocking, or null>"
    }
  }
}
```

### Agent Responds: Pause Acknowledgment with State Checkpoint
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Pause: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> paused. State checkpoint saved. Progress: <percent>%. Ready to resume when unblocked.",
    "data": {
      "task_id": "<task-id>",
      "status": "paused",
      "state_checkpoint": {
        "progress_percent": 45,
        "current_step": "<description of what the agent was doing when paused>",
        "next_step_planned": "<description of what the agent would do next upon resume>",
        "uncommitted_work_location": "<path to branch, stash, or working directory with uncommitted changes>",
        "checkpoint_notes": "<any additional context needed to resume, such as decisions made, assumptions held>"
      }
    }
  }
}
```

### Task Resume (AMOA to Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Resumed: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Resume work on task <task-id>. The blocker has been resolved. Updated context: <description-of-any-changes-since-pause>. Resume from your last checkpoint.",
    "data": {
      "task_id": "<task-id>",
      "action": "resume",
      "updated_context": "<description of any changes that occurred while the task was paused, such as new commits by others, changed requirements, updated dependencies>",
      "resume_from": "<checkpoint reference from the agent's pause acknowledgment>",
      "blocker_resolution": "<description of how the blocker was resolved>"
    }
  }
}
```

### Agent Responds: Resume Confirmation (Ready)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Resume: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> resumed. Checkpoint loaded. Continuing from: <next-step-description>. Updated context incorporated.",
    "data": {
      "task_id": "<task-id>",
      "status": "in-progress",
      "checkpoint_loaded": true,
      "resuming_from_step": "<description of the step the agent is resuming from>",
      "context_adjustments": "<description of any adjustments made based on updated_context, or 'none'>"
    }
  }
}
```

### Agent Responds: Resume Failure (State Lost)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Resume Failed: <task-id>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "Cannot resume task <task-id>. State checkpoint not found or not loadable. Reason: <explanation>. Requesting fresh task assignment.",
    "data": {
      "task_id": "<task-id>",
      "status": "resume_failed",
      "checkpoint_loaded": false,
      "failure_reason": "<session_restarted|checkpoint_corrupted|state_outdated>",
      "failure_detail": "<human-readable explanation of why the checkpoint cannot be loaded>",
      "request": "fresh_assignment"
    }
  }
}
```

### Agent Stop Work Notification (AMOA to Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Stop Work: <task-id>",
  "priority": "urgent",
  "content": {
    "type": "request",
    "message": "Stop all work on task <task-id> immediately. Urgency: <urgency-level>. <handoff-instruction>. Save current state and report what you have.",
    "data": {
      "task_id": "<task-id>",
      "action": "stop",
      "urgency": "<graceful|immediate>",
      "reason": "<human-readable explanation of why work must stop>",
      "handoff_required": true,
      "handoff_to": "<replacement-agent-name-or-null>"
    }
  }
}
```

### Agent Responds: Stop Work Acknowledgment
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Stop: <task-id>",
  "priority": "urgent",
  "content": {
    "type": "acknowledgment",
    "message": "Work stopped on task <task-id>. <handoff-status>. Current state snapshot provided.",
    "data": {
      "task_id": "<task-id>",
      "status": "stopped",
      "work_state_snapshot": {
        "progress_percent": 30,
        "current_branch": "<git-branch-name>",
        "last_commit": "<commit-hash>",
        "uncommitted_changes": "<description of any uncommitted work, or 'none'>",
        "handoff_document": "<path to handoff doc if handoff_required was true, or null>"
      },
      "stopped_cleanly": true
    }
  }
}
```

### Broadcast Message (AMOA to All Active Agents)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Broadcast <broadcast-id>: <subject-line>",
  "priority": "<normal|high|urgent>",
  "content": {
    "type": "notification",
    "message": "<broadcast-message-body>",
    "data": {
      "broadcast_id": "<unique-broadcast-identifier, e.g. 'bcast-20260208-001'>",
      "scope": "<all|role-specific|project-specific>",
      "scope_filter": "<role name or project name if scope is not 'all', otherwise null>",
      "action_required": "<true if agents must do something, false if informational only>",
      "action_description": "<what agents must do, if action_required is true, otherwise null>",
      "action_deadline": "<deadline for action, if applicable, otherwise null>"
    }
  }
}
```

### Agent Responds: Broadcast Acknowledgment
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Broadcast: <broadcast-id>",
  "priority": "low",
  "content": {
    "type": "acknowledgment",
    "message": "Broadcast <broadcast-id> received and understood. <action-taken-or-noted>",
    "data": {
      "broadcast_id": "<broadcast-id>",
      "acknowledged": true,
      "action_taken": "<description of action taken if action_required was true, or 'noted' if informational>"
    }
  }
}
```

## 2. NOTIFICATION TYPES

The system supports several distinct notification categories: task cancellation, pausing, resuming, immediate work stoppage, and broadcast messaging to multiple agents.

## 3. MESSAGE PRIORITY

Messages are assigned urgency levels that determine processing order: "high" for cancellation, pause, and resume operations; "urgent" for stop work commands and their acknowledgments; "normal" for standard acknowledgments; and "low" for broadcast confirmations.

## 4. DELIVERY METHOD

The `agent-messaging` skill handles all message transmission, managing the AI Maestro API format automatically.

## 5. RESPONSE PROTOCOLS

Recipients must send acknowledgments back to the orchestrator, with the acknowledgment type matching the original message (ACK Cancel, ACK Pause, ACK Resume, ACK Stop, or ACK Broadcast).

## 6. LIFECYCLE MESSAGES

The task state machine progresses through: assigned, in-progress, paused, resumed, cancelled, stopped, and done states.
# AI Maestro Orchestrator Agent (AMOA) - Messaging Templates Analysis

## File: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-messaging-templates/references/task-lifecycle-templates.md`

---

## 1. MESSAGE TEMPLATES

### 1.1 Task Cancellation (AMOA → Agent)

**AMOA Sends: Cancel Task**
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Cancelled: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Task <task-id> is cancelled. Reason: <reason-description>. Stop all work on this task. Provide a summary of work completed so far, files modified, and any pull requests created.",
    "data": {
      "task_id": "<task-id>",
      "action": "cancel",
      "reason": "<requirements_changed|task_superseded|project_cancelled>",
      "reason_detail": "<human-readable explanation of why the task is cancelled>",
      "work_summary_required": true,
      "superseded_by": "<new-task-id-if-applicable-or-null>"
    }
  }
}
```

**Agent Responds: Cancellation Acknowledgment**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Cancel: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> cancellation acknowledged. Work summary: <brief-description-of-what-was-done>. All work stopped.",
    "data": {
      "task_id": "<task-id>",
      "status": "cancelled",
      "work_summary": {
        "completed_items": ["<item-1>", "<item-2>"],
        "files_modified": ["<path/to/file-1>", "<path/to/file-2>"],
        "pull_requests": ["<pr-url-if-any>"],
        "uncommitted_work": "<description-of-any-uncommitted-changes-or-none>",
        "time_spent_description": "<brief estimate of effort spent>"
      }
    }
  }
}
```

---

### 1.2 Task Pause (AMOA → Agent)

**AMOA Sends: Pause Task**
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Paused: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Pause work on task <task-id>. Reason: <reason-description>. Save your current state and report a checkpoint so work can be resumed later. Expected pause duration: <duration>.",
    "data": {
      "task_id": "<task-id>",
      "action": "pause",
      "reason": "<dependency_blocked|priority_shift|resource_constraint>",
      "reason_detail": "<human-readable explanation of why the task is paused>",
      "expected_duration": "<estimated time until resume, e.g. '2 hours', '1 day', 'unknown'>",
      "blocking_dependency": "<task-id-or-resource-that-is-blocking, or null>"
    }
  }
}
```

**Agent Responds: Pause Acknowledgment with State Checkpoint**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Pause: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> paused. State checkpoint saved. Progress: <percent>%. Ready to resume when unblocked.",
    "data": {
      "task_id": "<task-id>",
      "status": "paused",
      "state_checkpoint": {
        "progress_percent": 45,
        "current_step": "<description of what the agent was doing when paused>",
        "next_step_planned": "<description of what the agent would do next upon resume>",
        "uncommitted_work_location": "<path to branch, stash, or working directory with uncommitted changes>",
        "checkpoint_notes": "<any additional context needed to resume, such as decisions made, assumptions held>"
      }
    }
  }
}
```

---

### 1.3 Task Resume (AMOA → Agent)

**AMOA Sends: Resume Task**
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Resumed: <task-id>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Resume work on task <task-id>. The blocker has been resolved. Updated context: <description-of-any-changes-since-pause>. Resume from your last checkpoint.",
    "data": {
      "task_id": "<task-id>",
      "action": "resume",
      "updated_context": "<description of any changes that occurred while the task was paused, such as new commits by others, changed requirements, updated dependencies>",
      "resume_from": "<checkpoint reference from the agent's pause acknowledgment>",
      "blocker_resolution": "<description of how the blocker was resolved>"
    }
  }
}
```

**Agent Responds: Resume Confirmation (Ready)**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Resume: <task-id>",
  "priority": "normal",
  "content": {
    "type": "acknowledgment",
    "message": "Task <task-id> resumed. Checkpoint loaded. Continuing from: <next-step-description>. Updated context incorporated.",
    "data": {
      "task_id": "<task-id>",
      "status": "in-progress",
      "checkpoint_loaded": true,
      "resuming_from_step": "<description of the step the agent is resuming from>",
      "context_adjustments": "<description of any adjustments made based on updated_context, or 'none'>"
    }
  }
}
```

**Agent Responds: Resume Failure (State Lost)**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Resume Failed: <task-id>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "Cannot resume task <task-id>. State checkpoint not found or not loadable. Reason: <explanation>. Requesting fresh task assignment.",
    "data": {
      "task_id": "<task-id>",
      "status": "resume_failed",
      "checkpoint_loaded": false,
      "failure_reason": "<session_restarted|checkpoint_corrupted|state_outdated>",
      "failure_detail": "<human-readable explanation of why the checkpoint cannot be loaded>",
      "request": "fresh_assignment"
    }
  }
}
```

---

### 1.4 Agent Stop Work Notification (AMOA → Agent)

**AMOA Sends: Stop Work**
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Stop Work: <task-id>",
  "priority": "urgent",
  "content": {
    "type": "request",
    "message": "Stop all work on task <task-id> immediately. Urgency: <urgency-level>. <handoff-instruction>. Save current state and report what you have.",
    "data": {
      "task_id": "<task-id>",
      "action": "stop",
      "urgency": "<graceful|immediate>",
      "reason": "<human-readable explanation of why work must stop>",
      "handoff_required": true,
      "handoff_to": "<replacement-agent-name-or-null>"
    }
  }
}
```

**Agent Responds: Stop Work Acknowledgment**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Stop: <task-id>",
  "priority": "urgent",
  "content": {
    "type": "acknowledgment",
    "message": "Work stopped on task <task-id>. <handoff-status>. Current state snapshot provided.",
    "data": {
      "task_id": "<task-id>",
      "status": "stopped",
      "work_state_snapshot": {
        "progress_percent": 30,
        "current_branch": "<git-branch-name>",
        "last_commit": "<commit-hash>",
        "uncommitted_changes": "<description of any uncommitted work, or 'none'>",
        "handoff_document": "<path to handoff doc if handoff_required was true, or null>"
      },
      "stopped_cleanly": true
    }
  }
}
```

---

### 1.5 Broadcast Message (AMOA → All Active Agents)

**AMOA Sends: Broadcast**
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Broadcast <broadcast-id>: <subject-line>",
  "priority": "<normal|high|urgent>",
  "content": {
    "type": "notification",
    "message": "<broadcast-message-body>",
    "data": {
      "broadcast_id": "<unique-broadcast-identifier, e.g. 'bcast-20260208-001'>",
      "scope": "<all|role-specific|project-specific>",
      "scope_filter": "<role name or project name if scope is not 'all', otherwise null>",
      "action_required": "<true if agents must do something, false if informational only>",
      "action_description": "<what agents must do, if action_required is true, otherwise null>",
      "action_deadline": "<deadline for action, if applicable, otherwise null>"
    }
  }
}
```

**Agent Responds: Broadcast Acknowledgment**
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "ACK Broadcast: <broadcast-id>",
  "priority": "low",
  "content": {
    "type": "acknowledgment",
    "message": "Broadcast <broadcast-id> received and understood. <action-taken-or-noted>",
    "data": {
      "broadcast_id": "<broadcast-id>",
      "acknowledged": true,
      "action_taken": "<description of action taken if action_required was true, or 'noted' if informational>"
    }
  }
}
```

---

## 2. NOTIFICATION TYPES

| Type | Description | Direction |
|------|-------------|-----------|
| `task-cancelled` | Permanent termination of a task | AMOA → Agent |
| `task-paused` | Temporary suspension of task work | AMOA → Agent |
| `task-resumed` | Unpausing a previously paused task | AMOA → Agent |
| `stop-work` | Immediate or graceful work cessation | AMOA → Agent |
| `broadcast` | Message to multiple agents | AMOA → All/Role/Project |
| `acknowledgment` | Agent response to any AMOA message | Agent → AMOA |
| `response` | Agent response with status/failure info | Agent → AMOA |

---

## 3. MESSAGE PRIORITY

| Priority Level | Used For |
|----------------|----------|
| `urgent` | Stop Work (Section 4), Stop Work ACK |
| `high` | Task Cancelled, Task Paused, Task Resumed, Resume Failed |
| `normal` | All acknowledgment messages (Cancel ACK, Pause ACK, Resume ACK) |
| `low` | Broadcast Acknowledgment |

---

## 4. DELIVERY METHOD

> **All messages should be sent using the `agent-messaging` skill**, which handles the AI Maestro API format automatically.

The document explicitly states:
- Use the `agent-messaging` skill to send messages
- The JSON structure shows the message content
- No mention of AMP (`amp-send.sh`) or direct API calls in this file

---

## 5. RESPONSE PROTOCOLS

| Original Message | Expected Response | Subject Pattern |
|------------------|-------------------|-----------------|
| Cancel Task | Cancellation Acknowledgment | `ACK Cancel: <task-id>` |
| Pause Task | Pause Acknowledgment with State Checkpoint | `ACK Pause: <task-id>` |
| Resume Task | Resume Confirmation OR Resume Failure | `ACK Resume: <task-id>` or `Resume Failed: <task-id>` |
| Stop Work | Stop Work Acknowledgment | `ACK Stop: <task-id>` |
| Broadcast | Broadcast Acknowledgment | `ACK Broadcast: <broadcast-id>` |

**Response Requirements:**
- All responses must include the original `task_id` or `broadcast_id`
- Responses must include `status` field indicating current state
- Checkpoint/state data must be included in pause/resume/stop responses
- Work summaries required for cancellation acknowledgments

---

## 6. LIFECYCLE MESSAGES

### Task State Transitions

| State | Trigger | AMOA Message | Agent Response |
|-------|---------|--------------|----------------|
| **assigned** | Initial task assignment | Task Assignment (from `message-templates.md`) | ACK Assignment |
| **in-progress** | Agent starts work | (implicit - no message) | Status Update |
| **paused** | Temporary blocker | `Task Paused` (Section 2) | `ACK Pause` with `state_checkpoint` |
| **resumed** | Blocker resolved | `Task Resumed` (Section 3) | `ACK Resume` or `Resume Failed` |
| **cancelled** | Task no longer needed | `Task Cancelled` (Section 1) | `ACK Cancel` with `work_summary` |
| **stopped** | Urgent work halt | `Stop Work` (Section 4) | `ACK Stop` with `work_state_snapshot` |
| **done** | Task completed | (from `message-templates.md`) | Completion Report |

### Decision Trees Provided

1. **Cancel vs Pause vs Reassign** (Section 6): Determines which action when task needs stopping
2. **Broadcast vs Targeted** (Section 7): Determines whether to broadcast or send direct messages

---

## Summary: Key Fields in All Messages

| Field | Required | Description |
|-------|----------|-------------|
| `from` | Yes | Sender identifier (`orchestrator` or `<agent-name>`) |
| `to` | Yes | Recipient identifier |
| `subject` | Yes | Descriptive subject line with identifiers |
| `priority` | Yes | `urgent`, `high`, `normal`, or `low` |
| `content.type` | Yes | `request`, `notification`, `acknowledgment`, or `response` |
| `content.message` | Yes | Human-readable message body |
| `content.data` | Yes | Structured data with action, task_id, and action-specific fields |