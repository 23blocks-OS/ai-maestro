# Agent Actions Protocol (AAP) v1.0

**Status**: v1.0 — Ratified
**Date**: 2026-05-18
**Authors**: Juan Pelaez
**Website**: [agentactions.org](https://agentactions.org)

---

## Abstract

The Agent Actions Protocol (AAP) defines a standard for delivering structured user interactions from agent-rendered UIs back to AI agents. When an agent produces an HTML canvas, users interact with it — clicking buttons, submitting forms, selecting options. AAP captures those interactions as structured JSON records, stores them immutably, and notifies the agent.

---

## 1. Introduction

AI agents increasingly render rich HTML interfaces — dashboards, forms, reports, interactive tools. Users interact with these UIs, but the interactions have no standard way to flow back to the agent. AAP solves this with a minimal, open protocol.

**Design principles:**
- **Minimal** — One bridge script, one message format, one storage pattern
- **Structured** — Every interaction is a typed JSON record, not raw DOM events
- **Immutable** — Interactions are append-only files, never modified
- **Agent-notified** — The agent is told when something happens, in real time

---

## 2. Terminology

| Term | Definition |
|------|-----------|
| **Canvas** | Agent-authored HTML rendered in a sandboxed iframe |
| **Action** | A discrete user interaction (click, submit, change, etc.) |
| **Element** | Identifier of the UI element acted upon |
| **Interaction** | The complete record of an action (action + element + data + metadata) |
| **Bridge** | JavaScript injected into canvas HTML that provides `maestro.send()` |
| **Provider** | The system that receives, stores, and delivers interactions (e.g., AI Maestro) |

---

## 3. How It Works

```
Agent writes HTML  -->  Dashboard renders in iframe  -->  User clicks button
                                                              |
Agent reads JSON   <--  File written + notification   <--  postMessage to parent
                                                              |
                                                         HTTP POST to API
```

### Step-by-step:

1. **Agent creates HTML** with `maestro.send()` calls on interactive elements
2. **Dashboard injects the bridge script** and renders HTML in a sandboxed iframe
3. **User interacts** — click, submit, select, toggle, etc.
4. **Bridge calls `postMessage`** with structured action data
5. **Parent window catches it**, POSTs to `/api/agents/:id/canvas/interactions`
6. **Server stores interaction** as a JSON file and notifies the agent via terminal
7. **Agent reads the interaction** file and processes it

---

## 4. Bridge Script

The bridge MUST be injected into canvas HTML by the provider. It provides a single global function:

```javascript
window.maestro = {
  send: function(action, element, data) {
    window.parent.postMessage({
      type: 'canvas:interaction',
      action: action,
      element: element || null,
      data: data || null
    }, '*');
  }
};
```

Canvas authors use `maestro.send(action, element, data)` — never raw `postMessage`.

### Example usage in canvas HTML:

```html
<button onclick="maestro.send('click', 'approve-btn', { approved: true })">
  Approve
</button>

<form onsubmit="event.preventDefault(); maestro.send('submit', 'feedback-form', {
  rating: document.getElementById('rating').value,
  comment: document.getElementById('comment').value
})">
  <input id="rating" type="number" min="1" max="5" />
  <textarea id="comment"></textarea>
  <button type="submit">Submit</button>
</form>
```

---

## 5. Action Message Format

The `postMessage` payload sent from iframe to parent:

```json
{
  "type": "canvas:interaction",
  "action": "submit",
  "element": "approve-button",
  "data": { "comments": "Looks good", "rating": 5 }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"canvas:interaction"` |
| `action` | string | Yes | Action verb (see Standard Actions) |
| `element` | string | No | Element identifier (id, name, label) |
| `data` | object | No | Arbitrary key-value payload |

---

## 6. Standard Action Vocabulary

| Action | Use case |
|--------|----------|
| `click` | Button press, link activation |
| `submit` | Form submission |
| `change` | Input value changed |
| `select` | Option selected from dropdown/list |
| `toggle` | Boolean switch toggled |
| `dismiss` | Modal/notification dismissed |
| `navigate` | In-canvas navigation (tab switch, page change) |
| `custom` | Application-specific action (use `data` for details) |

Custom actions beyond this vocabulary are allowed — the `action` field is freeform.

---

## 7. Interaction Record Format

The stored interaction (server-side):

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-05-18T15:30:00.000Z",
  "canvasFile": "reports/dashboard.html",
  "action": "submit",
  "element": "approve-button",
  "data": { "comments": "Looks good" },
  "summary": "User submit 'approve-button' on reports/dashboard.html with data: {comments: Looks good}"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique interaction identifier |
| `timestamp` | ISO 8601 | Yes | When the interaction occurred |
| `canvasFile` | string | Yes | Relative path of the canvas HTML file |
| `action` | string | Yes | The action verb |
| `element` | string | No | Element identifier |
| `data` | object | No | Arbitrary payload |
| `summary` | string | Yes | Human-readable summary for the agent |

---

## 8. Storage

- **Path**: `~/.aimaestro/agents/<agentId>/canvas/interactions/`
- **Filename**: `<ISO-timestamp>-<UUID>.json` (with `:` and `.` replaced by `-`)
- **One file per interaction** (append-only, immutable)
- **Sorted by filename** = sorted by time

Example filename:
```
2026-05-18T15-30-00-000Z-a1b2c3d4-e5f6-7890-abcd-ef1234567890.json
```

---

## 9. Transport

```
Canvas iframe
  | window.parent.postMessage()
  v
Parent window (Dashboard)
  | POST /api/agents/:id/canvas/interactions
  v
Provider API
  | Write JSON file + tmux notification
  v
Agent
```

---

## 10. API Endpoints

### Submit Interaction

```
POST /api/agents/:id/canvas/interactions
Content-Type: application/json

{
  "action": "submit",
  "element": "approve-button",
  "canvasFile": "reports/dashboard.html",
  "data": { "comments": "Looks good" }
}
```

**Responses:**

```
201 Created
{ "id": "a1b2c3d4-...", "summary": "User submit 'approve-button' on reports/dashboard.html" }

400 Bad Request
{ "error": "missing_field", "message": "action is required" }

404 Not Found
{ "error": "not_found", "message": "Agent 'xyz' not found" }
```

### List Interactions

```
GET /api/agents/:id/canvas/interactions?limit=50
```

**Response:**

```json
{
  "interactions": [
    {
      "id": "a1b2c3d4-...",
      "timestamp": "2026-05-18T15:30:00.000Z",
      "action": "submit",
      "element": "approve-button",
      "canvasFile": "reports/dashboard.html",
      "data": { "comments": "Looks good" },
      "summary": "User submit 'approve-button' on reports/dashboard.html with data: {comments: Looks good}"
    }
  ]
}
```

---

## 11. Agent Notification

When an interaction is stored, the provider SHOULD notify the agent:

```
[CANVAS] reports/dashboard.html: User submit 'approve-button' on reports/dashboard.html with data: {comments: Looks good}
```

Notification is fire-and-forget. Failure to notify does not affect interaction storage.

---

## 12. Security Considerations

- Canvas HTML runs in `sandbox="allow-scripts"` iframe (no same-origin, no forms, no popups)
- Bridge uses `postMessage('*')` — parent validates `event.data.type` before processing
- No credentials, tokens, or authentication data should be sent via `data` payload
- `data` is stored as-is — providers SHOULD sanitize before displaying
- Canvas files are read-only to the user — only the agent can write them
- Path traversal protection: canvas file paths must not contain `..` or be absolute

---

## 13. Implementer Checklist

For building an AAP-compatible provider:

- [ ] Inject bridge script into canvas HTML before rendering
- [ ] Listen for `postMessage` with `type: 'canvas:interaction'`
- [ ] Validate `action` field is present
- [ ] Generate UUID and ISO timestamp
- [ ] Build human-readable summary
- [ ] Store interaction as JSON (recommended: file-per-interaction)
- [ ] Notify agent (optional, provider-specific mechanism)
- [ ] Expose API for listing interactions (optional)

---

## 14. Data-Driven Interactive Canvas (Best Practice)

Canvas pages SHOULD embed structured data and render it dynamically with JavaScript. This enables sorting, filtering, search, and real-time interaction — all within the sandboxed iframe.

### Pattern: Embedded JSON + JS Rendering

```html
<!-- Data block — structured, parseable, separate from presentation -->
<script type="application/json" id="page-data">
{
  "tests": [
    { "name": "auth-login", "status": "passed", "duration": 1.2 },
    { "name": "api-users", "status": "failed", "duration": 0.8, "error": "timeout" }
  ],
  "summary": { "total": 142, "passed": 135, "failed": 7 }
}
</script>

<!-- Rendering logic — reads data, builds interactive UI -->
<script>
    const DATA = JSON.parse(document.getElementById('page-data').textContent);
    // Build tables, charts, filters from DATA
    // Attach maestro.send() to interactive elements
</script>
```

### Why This Pattern

| Approach | Problem |
|----------|---------|
| Static HTML tables | No sorting, filtering, or search; data locked in markup |
| Fetch from external API | Violates sandbox; requires CORS; adds latency |
| Inline JS literals | Hard to parse; no separation of data and presentation |
| **Embedded JSON** | Clean separation; parseable; enables full interactivity |

### Data Types

Different data types call for different interactive features:

| Data Type | Interactive Features |
|-----------|---------------------|
| Tables / lists | Sort by column, filter by status, search, pagination |
| Metrics / KPIs | Expand details on click, compare periods |
| Forms / config | Validation, submit via `maestro.send('submit', ...)` |
| Workflows | Step navigation, approve/reject actions |
| Trees / hierarchies | Expand/collapse, drill-down |

### Canvas File Storage

Canvas HTML files are stored at:
```
~/.aimaestro/agents/<agentId>/canvas/<filename>.html
```

Subdirectories are allowed (e.g., `reports/q1-summary.html`). The agent writes files here; the provider reads and renders them.

---

## 15. Relationship to AMP & AID

- **AAP is independent** — does not require AMP or AID
- **Complementary**: AAP handles user-to-agent UI actions; AMP handles agent-to-agent messaging; AID handles agent authentication
- All three use the same agent directory structure (`~/.aimaestro/agents/<id>/`)
- AAP interactions can trigger AMP messages (e.g., "user approved the report" -> send notification to another agent)

---

## 15. Roadmap

| Version | Scope |
|---------|-------|
| **v1.0** (current) | One-way canvas interactions (user -> agent) |
| **v1.1** | Bidirectional — agents push updates back to canvas (refresh, replace content) |
| **v1.2** | Interaction acknowledgment — agent confirms receipt |
| **v2.0** | Agent-defined UI components (widgets, forms, controls beyond raw HTML) |

---

## License

This specification is released under the MIT License.

Copyright 2026 Juan Pelaez / 23blocks.
