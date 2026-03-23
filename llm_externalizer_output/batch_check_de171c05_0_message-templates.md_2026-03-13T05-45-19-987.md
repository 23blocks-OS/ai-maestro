# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-messaging-templates/references/message-templates.md`
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

The user wants me to analyze the messaging templates from the AI Maestro Orchestrator Agent (AMOA). Let me extract the information requested:

1. MESSAGE TEMPLATES: Exact message templates with all fields and placeholders
2. NOTIFICATION TYPES: What types of notifications exist?
3. MESSAGE PRIORITY: How are messages prioritized? What priority levels?
4. DELIVERY METHOD: Does it use AMP (amp-send.sh) or direct API calls? What format?
5. RESPONSE PROTOCOLS: What responses are expected from agents after receiving notifications?
6. LIFECYCLE MESSAGES: Messages for each task state transition

Let me go through the document carefully:

## 1. MESSAGE TEMPLATES

The document provides 11 message templates:

### 2.1 Task Assignment (AMOA → Remote Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Assignment: <task-title>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "You are assigned: <task-description>. Success criteria: <criteria>. Report status when starting and when complete.",
    "data": {
      "task_id": "<task-id>",
      "issue_number": "<github-issue-number>",
      "handoff_doc": "docs_dev/handoffs/<handoff-filename>.md"
    }
  }
}
```

### 2.2 Task Completion Report (Agent → AMOA)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Task Complete: <task-title>",
  "priority": "normal",
  "content": {
    "type": "response",
    "message": "[DONE] <task-id> - <brief-result>. Details: <output-location>",
    "data": {
      "task_id": "<task-id>",
      "status": "complete",
      "output_file": "docs_dev/reports/<report-filename>.md"
    }
  }
}
```

### 2.3 Status Request (AMOA → Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Status Request: <task-id>",
  "priority": "normal",
  "content": {
    "type": "request",
    "message": "What is your current status on <task-id>? Report progress, blockers, and next steps.",
    "data": {
      "task_id": "<task-id>"
    }
  }
}
```

### 2.4 Status Response (Agent → AMOA)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Status: <task-id>",
  "priority": "normal",
  "content": {
    "type": "response",
    "message": "[IN_PROGRESS] <task-id> - <progress-description>. Blockers: <none|blocker-list>. Next: <next-step>",
    "data": {
      "task_id": "<task-id>",
      "status": "in-progress",
      "progress_percent": 60,
      "blockers": []
    }
  }
}
```

### 2.5 Approval Request (AMCOS → AMAMA)
```json
{
  "from": "chief-of-staff",
  "to": "assistant-manager",
  "subject": "Approval Required: <operation-type>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Requesting approval to <operation-description>. Risk level: <low|medium|high>. Justification: <reason>",
    "data": {
      "operation": "<spawn|terminate|hibernate|wake>",
      "target": "<agent-name>",
      "risk_level": "medium",
      "justification": "<reason>"
    }
  }
}
```

### 2.6 Approval Response (AMAMA → AMCOS)
```json
{
  "from": "assistant-manager",
  "to": "chief-of-staff",
  "subject": "Approval Decision: <operation-type>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "<APPROVED|REJECTED>: <operation-description>. <rationale>",
    "data": {
      "decision": "approved|rejected",
      "operation": "<operation-type>",
      "rationale": "<reason>"
    }
  }
}
```

### 2.7 Escalation (Any Agent → AMCOS/AMAMA)
```json
{
  "from": "<agent-name>",
  "to": "chief-of-staff",
  "subject": "Escalation: <issue-summary>",
  "priority": "high",
  "content": {
    "type": "notification",
    "message": "Escalating: <issue-description>. Attempted: <what-was-tried>. Need: <what-is-needed>",
    "data": {
      "task_id": "<task-id>",
      "blocker_type": "<technical|resource|approval|external>",
      "attempted_solutions": ["<solution-1>", "<solution-2>"],
      "required_action": "<what-is-needed>"
    }
  }
}
```

### 2.8 Acknowledgment (Any Agent)
```json
{
  "from": "<agent-name>",
  "to": "<sender-name>",
  "subject": "ACK: <original-subject>",
  "priority": "low",
  "content": {
    "type": "acknowledgment",
    "message": "Received and understood. Will <action>.",
    "data": {
      "original_subject": "<original-subject>",
      "action_planned": "<what-agent-will-do>"
    }
  }
}
```

### 2.9 Design Handoff (AMAA → AMOA)
```json
{
  "from": "architect",
  "to": "orchestrator",
  "subject": "Design Complete: <project-name>",
  "priority": "high",
  "content": {
    "type": "notification",
    "message": "Architecture design complete for <project-name>. Handoff document ready. Modules: <count>. Ready for implementation planning.",
    "data": {
      "handoff_doc": "docs_dev/design/handoffs/<handoff-id>.md",
      "architecture_doc": "docs_dev/design/architecture.md",
      "module_count": 5,
      "adr_count": 3
    }
  }
}
```

### 2.10 Integration Request (AMOA → AMIA)
```json
{
  "from": "orchestrator",
  "to": "integrator",
  "subject": "Integration Request: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Review and verify PR #<pr-number>: <pr-title>. Run full verification workflow. Report pass/fail with details.",
    "data": {
      "pr_number": 123,
      "pr_url": "https://github.com/owner/repo/pull/123",
      "request_type": "full_verification"
    }
  }
}
```

### 2.11 Integration Result (AMIA → AMOA)
```json
{
  "from": "integrator",
  "to": "orchestrator",
  "subject": "Integration Result: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "[<PASS|FAIL>] PR #<pr-number>. <summary>. Details: <report-location>",
    "data": {
      "pr_number": 123,
      "result": "pass|fail",
      "ci_status": "passing",
      "review_status": "approved",
      "report_file": "docs_dev/integration/reports/pr-123-verification.md"
    }
  }
}
```

## 2. NOTIFICATION TYPES

The system supports several notification categories: task assignments, completion reports, status checks, approval workflows, escalations, acknowledgments, design handoffs, and integration requests.

## 3. MESSAGE PRIORITY

Messages are classified into three priority tiers: high for critical operations like assignments and escalations, normal for standard status updates and responses, and low for simple acknowledgments.

## 4. DELIVERY METHOD

The `agent-messaging` skill handles all message transmission using the AI Maestro API format.

## 5. RESPONSE PROTOCOLS

Recipients must send acknowledgments within 2 minutes of receiving task assignments. Status updates arrive every 15 minutes, with escalation triggered after two consecutive missed updates. Approval requests expect responses marked as approved or rejected, while completion reports flow through integration requests to the integrator.

## 6. LIFECYCLE MESSAGES

Tasks progress through distinct phases: assignment initiates the workflow, in-progress status reflects active development, review occurs via integration requests, completion is marked by done status, and blockers trigger escalation messages.
# AI Maestro Orchestrator Agent (AMOA) - Messaging Templates Analysis

## 1. MESSAGE TEMPLATES

### 2.1 Task Assignment (AMOA → Remote Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Task Assignment: <task-title>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "You are assigned: <task-description>. Success criteria: <criteria>. Report status when starting and when complete.",
    "data": {
      "task_id": "<task-id>",
      "issue_number": "<github-issue-number>",
      "handoff_doc": "docs_dev/handoffs/<handoff-filename>.md"
    }
  }
}
```

### 2.2 Task Completion Report (Agent → AMOA)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Task Complete: <task-title>",
  "priority": "normal",
  "content": {
    "type": "response",
    "message": "[DONE] <task-id> - <brief-result>. Details: <output-location>",
    "data": {
      "task_id": "<task-id>",
      "status": "complete",
      "output_file": "docs_dev/reports/<report-filename>.md"
    }
  }
}
```

### 2.3 Status Request (AMOA → Agent)
```json
{
  "from": "orchestrator",
  "to": "<agent-name>",
  "subject": "Status Request: <task-id>",
  "priority": "normal",
  "content": {
    "type": "request",
    "message": "What is your current status on <task-id>? Report progress, blockers, and next steps.",
    "data": {
      "task_id": "<task-id>"
    }
  }
}
```

### 2.4 Status Response (Agent → AMOA)
```json
{
  "from": "<agent-name>",
  "to": "orchestrator",
  "subject": "Status: <task-id>",
  "priority": "normal",
  "content": {
    "type": "response",
    "message": "[IN_PROGRESS] <task-id> - <progress-description>. Blockers: <none|blocker-list>. Next: <next-step>",
    "data": {
      "task_id": "<task-id>",
      "status": "in-progress",
      "progress_percent": 60,
      "blockers": []
    }
  }
}
```

### 2.5 Approval Request (AMCOS → AMAMA)
```json
{
  "from": "chief-of-staff",
  "to": "assistant-manager",
  "subject": "Approval Required: <operation-type>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Requesting approval to <operation-description>. Risk level: <low|medium|high>. Justification: <reason>",
    "data": {
      "operation": "<spawn|terminate|hibernate|wake>",
      "target": "<agent-name>",
      "risk_level": "medium",
      "justification": "<reason>"
    }
  }
}
```

### 2.6 Approval Response (AMAMA → AMCOS)
```json
{
  "from": "assistant-manager",
  "to": "chief-of-staff",
  "subject": "Approval Decision: <operation-type>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "<APPROVED|REJECTED>: <operation-description>. <rationale>",
    "data": {
      "decision": "approved|rejected",
      "operation": "<operation-type>",
      "rationale": "<reason>"
    }
  }
}
```

### 2.7 Escalation (Any Agent → AMCOS/AMAMA)
```json
{
  "from": "<agent-name>",
  "to": "chief-of-staff",
  "subject": "Escalation: <issue-summary>",
  "priority": "high",
  "content": {
    "type": "notification",
    "message": "Escalating: <issue-description>. Attempted: <what-was-tried>. Need: <what-is-needed>",
    "data": {
      "task_id": "<task-id>",
      "blocker_type": "<technical|resource|approval|external>",
      "attempted_solutions": ["<solution-1>", "<solution-2>"],
      "required_action": "<what-is-needed>"
    }
  }
}
```

### 2.8 Acknowledgment (Any Agent)
```json
{
  "from": "<agent-name>",
  "to": "<sender-name>",
  "subject": "ACK: <original-subject>",
  "priority": "low",
  "content": {
    "type": "acknowledgment",
    "message": "Received and understood. Will <action>.",
    "data": {
      "original_subject": "<original-subject>",
      "action_planned": "<what-agent-will-do>"
    }
  }
}
```

### 2.9 Design Handoff (AMAA → AMOA)
```json
{
  "from": "architect",
  "to": "orchestrator",
  "subject": "Design Complete: <project-name>",
  "priority": "high",
  "content": {
    "type": "notification",
    "message": "Architecture design complete for <project-name>. Handoff document ready. Modules: <count>. Ready for implementation planning.",
    "data": {
      "handoff_doc": "docs_dev/design/handoffs/<handoff-id>.md",
      "architecture_doc": "docs_dev/design/architecture.md",
      "module_count": 5,
      "adr_count": 3
    }
  }
}
```

### 2.10 Integration Request (AMOA → AMIA)
```json
{
  "from": "orchestrator",
  "to": "integrator",
  "subject": "Integration Request: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "request",
    "message": "Review and verify PR #<pr-number>: <pr-title>. Run full verification workflow. Report pass/fail with details.",
    "data": {
      "pr_number": 123,
      "pr_url": "https://github.com/owner/repo/pull/123",
      "request_type": "full_verification"
    }
  }
}
```

### 2.11 Integration Result (AMIA → AMOA)
```json
{
  "from": "integrator",
  "to": "orchestrator",
  "subject": "Integration Result: PR #<pr-number>",
  "priority": "high",
  "content": {
    "type": "response",
    "message": "[<PASS|FAIL>] PR #<pr-number>. <summary>. Details: <report-location>",
    "data": {
      "pr_number": 123,
      "result": "pass|fail",
      "ci_status": "passing",
      "review_status": "approved",
      "report_file": "docs_dev/integration/reports/pr-123-verification.md"
    }
  }
}
```

---

## 2. NOTIFICATION TYPES

| Type | Description | Direction |
|------|-------------|-----------|
| **task-assigned** | Implementation task assignment | AMOA → Agent |
| **task-complete** | Task completion report | Agent → AMOA |
| **status-request** | Polling for agent status | AMOA → Agent |
| **status-response** | Agent status update | Agent → AMOA |
| **approval-request** | Request for approval (spawn/terminate/hibernate/wake) | AMCOS → AMAMA |
| **approval-response** | Approval decision | AMAMA → AMCOS |
| **escalation** | Blocker/issue escalation | Any Agent → AMCOS/AMAMA |
| **acknowledgment** | ACK receipt of message | Any Agent |
| **design-handoff** | Architecture design complete | AMAA → AMOA |
| **integration-request** | Code review/integration request | AMOA → AMIA |
| **integration-result** | Integration verification result | AMIA → AMOA |

---

## 3. MESSAGE PRIORITY

| Priority Level | Used For | Templates |
|----------------|----------|-----------|
| **high** | Critical operations, task assignments, escalations, approvals, integration | 2.1, 2.5, 2.6, 2.7, 2.9, 2.10, 2.11 |
| **normal** | Standard responses, status updates, completion reports | 2.2, 2.3, 2.4 |
| **low** | Acknowledgments only | 2.8 |

---

## 4. DELIVERY METHOD

**Method:** `agent-messaging` skill (handles AI Maestro API format automatically)

**Format:** JSON structure with the following top-level fields:
- `from`: Sender identifier (orchestrator, chief-of-staff, architect, integrator, or `<agent-name>`)
- `to`: Recipient identifier
- `subject`: Message subject line
- `priority`: Priority level (high, normal, low)
- `content`: Object containing:
  - `type`: Message type (request, response, notification, acknowledgment)
  - `message`: Human-readable message text
  - `data`: Structured data object with scenario-specific fields

**Note:** The document explicitly states to use the `agent-messaging` skill — no mention of AMP (amp-send.sh) or direct API calls in this file.

---

## 5. RESPONSE PROTOCOLS

| Trigger | Expected Response | Timeout |
|---------|-------------------|---------|
| **Task Assignment (2.1)** | Acknowledgment (2.8) within 2 min | 2 min, then retry once, then escalate |
| **Status Request (2.3)** | Status Response (2.4) | 3 min, then retry after 2 min, then mark unresponsive & escalate |
| **Approval Request (2.5)** | Approval Response (2.6) with decision | Not specified |
| **Task Completion (2.2)** | Integration Request (2.10) to AMIA | Not specified |
| **Integration Request (2.10)** | Integration Result (2.11) | Not specified |

**Decision Tree Protocols:**

1. **Task Assignment Flow:**
   - Send template 2.1 → Wait for ACK (2.8)
   - ACK within 2 min → Mark task "in-progress" on kanban
   - No ACK within 2 min → Retry once
   - Still no ACK → Escalate to AMCOS

2. **Status Check Flow (every 15 min):**
   - Send template 2.3 → Response within 3 min
   - Progress = 0% (stalled) → 2nd consecutive stall → Direct inquiry about blockers
   - No response → Retry after 2 min → Mark agent unresponsive → Escalate

3. **Completion Report Flow:**
   - Receive template 2.2 → Validate required fields
   - Tests pass + checklist complete → Move to "ai-review" → Send Integration Request (2.10)
   - AMIA accepts → Move to "merge-release" → Notify AMCOS
   - AMIA rejects → Send Rework Assignment (template 2.7) back to agent

---

## 6. LIFECYCLE MESSAGES

| Task State | Message Template | Direction | Trigger |
|------------|------------------|-----------|---------|
| **Assigned** | 2.1 Task Assignment | AMOA → Agent | New task created |
| **In Progress** | 2.4 Status Response | Agent → AMOA | Agent starts work, reports progress |
| **Review** | 2.10 Integration Request | AMOA → AMIA | Task complete, tests pass, checklist complete |
| **Done** | 2.2 Task Completion Report | Agent → AMOA | Agent finishes task |
| **Blocked** | 2.7 Escalation | Any Agent → AMCOS | Blocker encountered requiring escalation |

**State Transition Flow:**
```
ASSIGNED → IN_PROGRESS → REVIEW → DONE
              ↓
          BLOCKED → ESCALATION → (resolution) → IN_PROGRESS
```