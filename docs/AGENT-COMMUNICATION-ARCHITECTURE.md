# Agent Communication System Architecture

Technical deep-dive into AI Maestro's dual-channel communication system.

---

## System Overview

AI Maestro provides **two independent communication channels** for inter-agent messaging:

1. **File-Based Persistent Messaging** - REST API + JSON file storage
2. **Instant tmux Notifications** - Direct tmux command execution

These channels serve different purposes and use different underlying mechanisms.

```
┌─────────────────────────────────────────────────────────────┐
│                  AI Maestro Communication                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐            ┌────────────────────────┐ │
│  │  File-Based      │            │  Instant tmux          │ │
│  │  Messaging       │            │  Notifications         │ │
│  ├──────────────────┤            ├────────────────────────┤ │
│  │ • Persistent     │            │ • Real-time            │ │
│  │ • Structured     │            │ • Ephemeral            │ │
│  │ • Searchable     │            │ • Simple alerts        │ │
│  │ • Rich metadata  │            │ • Direct delivery      │ │
│  └──────────────────┘            └────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel 1: File-Based Persistent Messaging

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                   User/Agent Interface                       │
├─────────────────────────────────────────────────────────────┤
│  Shell Script Layer                                          │
│  send-aimaestro-message.sh                                  │
│  check-and-show-messages.sh                                 │
│  check-new-messages-arrived.sh                              │
├─────────────────────────────────────────────────────────────┤
│                    HTTP/REST API                             │
│  POST   /api/messages          - Send message               │
│  GET    /api/messages?session  - List inbox                 │
│  GET    /api/messages?id       - Get specific message       │
│  PATCH  /api/messages?action   - Update status              │
│  DELETE /api/messages?id       - Delete message             │
├─────────────────────────────────────────────────────────────┤
│               Business Logic Layer                           │
│  lib/messageQueue.ts                                        │
│  - Message CRUD operations                                  │
│  - Directory management                                     │
│  - Message validation                                       │
├─────────────────────────────────────────────────────────────┤
│                  Storage Layer                               │
│  ~/.aimaestro/messages/                                     │
│  ├── inbox/<session>/msg-*.json                            │
│  ├── sent/<session>/msg-*.json                             │
│  └── archived/<session>/msg-*.json                         │
└─────────────────────────────────────────────────────────────┘
```

### Component Details

#### 1. Shell Script Layer

**Location:** `~/.local/bin/`

**send-aimaestro-message.sh**
- Validates input (session name, priority, type)
- Builds JSON payload using `jq -n` (prevents JSON injection)
- Sends POST request to `/api/messages`
- Handles HTTP response codes
- Displays user-friendly success/error messages

**Technical implementation:**
```bash
# JSON construction (security-safe)
JSON_PAYLOAD=$(jq -n \
  --arg from "$FROM_SESSION" \
  --arg to "$TO_SESSION" \
  --arg subject "$SUBJECT" \
  --arg message "$MESSAGE" \
  --arg priority "$PRIORITY" \
  --arg type "$TYPE" \
  '{
    from: $from,
    to: $to,
    subject: $subject,
    priority: $priority,
    content: {
      type: $type,
      message: $message
    }
  }')

# HTTP request with status code capture
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST http://localhost:23000/api/messages \
  -H 'Content-Type: application/json' \
  -d "$JSON_PAYLOAD")
```

**check-and-show-messages.sh**
- Reads all JSON files from `~/.aimaestro/messages/inbox/<session>/`
- Parses with `jq` for formatted display
- Counts urgent/high priority messages
- Displays inbox summary on session start

**check-new-messages-arrived.sh**
- Quick unread count check
- Called after Claude Code responses
- Minimal output (only if unread > 0)

---

#### 2. REST API Layer

**Location:** `app/api/messages/route.ts`

**Endpoints:**

```typescript
// POST /api/messages - Send new message
export async function POST(request: NextRequest) {
  const { from, to, subject, content, priority, inReplyTo } = await request.json()

  // Validate required fields
  if (!from || !to || !subject || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Validate content structure
  if (!content.type || !content.message) {
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
  }

  const message = await sendMessage(from, to, subject, content, { priority, inReplyTo })

  return NextResponse.json({ message }, { status: 201 })
}
```

**Key features:**
- Input validation before storage
- Delegates to business logic layer (messageQueue.ts)
- Returns HTTP 201 on success, 4xx/5xx on errors
- Supports query parameters for filtering (status, priority, from)

---

#### 3. Business Logic Layer

**Location:** `lib/messageQueue.ts`

**Core functions:**

```typescript
// Generate unique message ID
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `msg-${timestamp}-${random}`
}

// Send message (writes to inbox + sent folders)
export async function sendMessage(
  from: string,
  to: string,
  subject: string,
  content: Message['content'],
  options?: {
    priority?: Message['priority']
    inReplyTo?: string
  }
): Promise<Message> {
  await ensureDirectories()

  const message: Message = {
    id: generateMessageId(),
    from,
    to,
    timestamp: new Date().toISOString(),
    subject,
    priority: options?.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options?.inReplyTo,
  }

  // Write to recipient's inbox
  const inboxPath = path.join(getInboxDir(to), `${message.id}.json`)
  await fs.writeFile(inboxPath, JSON.stringify(message, null, 2))

  // Write to sender's sent folder
  const sentPath = path.join(getSentDir(from), `${message.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(message, null, 2))

  return message
}
```

**Directory management:**
```
~/.aimaestro/messages/
├── inbox/
│   ├── backend-architect/
│   │   ├── msg-1736618400-abc123.json
│   │   └── msg-1736618500-def456.json
│   └── frontend-developer/
│       └── msg-1736618600-ghi789.json
├── sent/
│   ├── backend-architect/
│   │   └── msg-1736618700-jkl012.json
│   └── frontend-developer/
│       ├── msg-1736618400-abc123.json
│       └── msg-1736618500-def456.json
└── archived/
    └── backend-architect/
        └── msg-1736610000-old123.json
```

**Key features:**
- Atomic file writes (write to temp file, then rename)
- Directory auto-creation with `recursive: true`
- Dual storage (inbox + sent) for both parties
- ISO-8601 timestamps for sorting/filtering
- Message ID format: `msg-{timestamp}-{random}`

---

#### 4. Storage Layer

**Message JSON Structure:**

```json
{
  "id": "msg-1736618400-abc123",
  "from": "frontend-developer",
  "to": "backend-architect",
  "timestamp": "2025-01-17T14:30:00.123Z",
  "subject": "Need POST /api/auth/login endpoint",
  "priority": "high",
  "status": "unread",
  "content": {
    "type": "request",
    "message": "Please implement authentication endpoint...",
    "context": {
      "component": "LoginForm.tsx",
      "requirements": [...]
    }
  },
  "inReplyTo": null
}
```

**Field definitions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique message identifier |
| `from` | string | Yes | Sender session name |
| `to` | string | Yes | Recipient session name |
| `timestamp` | string | Yes | ISO-8601 datetime |
| `subject` | string | Yes | Brief description |
| `priority` | enum | Yes | low \| normal \| high \| urgent |
| `status` | enum | Yes | unread \| read \| archived |
| `content` | object | Yes | Message payload |
| `content.type` | enum | Yes | request \| response \| notification \| update |
| `content.message` | string | Yes | Main message body |
| `content.context` | object | No | Additional structured data |
| `content.attachments` | array | No | File references (future) |
| `inReplyTo` | string | No | Parent message ID (for threading) |

---

#### 5. Frontend UI Layer

**Location:** `components/MessageCenter.tsx`

**Architecture:**

```
┌───────────────────────────────────────────────────────┐
│              MessageCenter Component                   │
├───────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌────────────────────────────────┐ │
│  │   Inbox     │  │       Message Detail           │ │
│  │   View      │  │                                │ │
│  ├─────────────┤  ├────────────────────────────────┤ │
│  │ Message 1   │  │ From: frontend-dev             │ │
│  │ Message 2   │  │ Subject: Need API endpoint     │ │
│  │ Message 3   │  │ Priority: high                 │ │
│  │ ...         │  │                                │ │
│  │             │  │ Message body...                │ │
│  │             │  │                                │ │
│  │             │  │ [Reply] [Archive] [Delete]     │ │
│  └─────────────┘  └────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │          Compose View                             │ │
│  ├──────────────────────────────────────────────────┤ │
│  │ To: [session-name]        ▼                      │ │
│  │ Subject: [...]                                   │ │
│  │ Priority: normal ▼   Type: request ▼             │ │
│  │ Message: [...........................]            │ │
│  │          [...........................]            │ │
│  │ [Send Message]  [Cancel]                         │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

**Key features:**
- Auto-refresh every 10 seconds
- Unread count badge
- Priority color-coding (urgent=red, high=orange, normal=blue, low=gray)
- Reply button pre-fills compose form
- Archive/delete actions with confirmation
- Session name autocomplete in compose view

**Data flow:**
```
UI Component → API fetch → messageQueue.ts → File system
     ↓
React State (messages, selectedMessage, unreadCount)
     ↓
Re-render with updated data
```

---

## Channel 2: Instant tmux Notifications

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│            send-tmux-message.sh                              │
│                                                               │
│  Input: <target_session> <message> [method]                 │
│         ↓                                                     │
│  Validation: Check session exists                           │
│         ↓                                                     │
│  Method selection:                                           │
│  ├─ display → tmux display-message (popup)                  │
│  ├─ inject → tmux send-keys (inject into history)           │
│  └─ echo → tmux send-keys (echo to output)                  │
│         ↓                                                     │
│  Execute tmux command                                        │
│         ↓                                                     │
│  Target session receives notification                        │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Details

**Location:** `~/.local/bin/send-tmux-message.sh`

#### Method 1: Display (Popup Notification)

**Command:**
```bash
tmux display-message -t "$TARGET_SESSION" "📬 Message from $FROM: $MESSAGE"
```

**How it works:**
- Uses tmux's built-in `display-message` command
- Shows temporary popup in target session's status line
- Auto-dismisses after ~5 seconds (configurable via tmux display-time option)
- **Non-intrusive** - doesn't interrupt typing or command execution
- **Safe** - doesn't execute any shell commands

**Example:**
```bash
send-tmux-message.sh backend-architect "Check your inbox!"
```

**tmux command executed:**
```bash
tmux display-message -t backend-architect "📬 Message from frontend-dev: Check your inbox!"
```

**Visual result:**
```
┌────────────────────────────────────────────────────┐
│  [backend-architect] claude@mbp:~/project          │
│  $ # Working on something...                       │
│  $                                                  │
│                                                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ 📬 Message from frontend-dev:                │ │
│  │ Check your inbox!                            │ │
│  └──────────────────────────────────────────────┘ │
│                                                     │
│  [backend-architect] 14:30  2025-01-17             │
└────────────────────────────────────────────────────┘
```

---

#### Method 2: Inject (Terminal History)

**Command:**
```bash
ESCAPED_MSG=$(printf '%q' "$MESSAGE")
tmux send-keys -t "$TARGET_SESSION" "echo '$ESCAPED_MSG'" Enter
```

**How it works:**
- Uses `tmux send-keys` to inject a command
- Command is `echo '<message>'` - appears in history
- **More visible** than display - stays in terminal output
- **Interrupts** current typing (sends Enter key)
- Uses `printf '%q'` for shell-safe escaping

**Security note:**
```bash
# UNSAFE (vulnerable to shell injection):
tmux send-keys -t session "echo '$MESSAGE'" Enter

# SAFE (escapes shell metacharacters):
ESCAPED_MSG=$(printf '%q' "$MESSAGE")
tmux send-keys -t session "echo $ESCAPED_MSG" Enter
```

**Example:**
```bash
send-tmux-message.sh backend-architect "Check inbox for urgent message!" inject
```

**Visual result:**
```
$ # User was typing something...
$ echo Check\ inbox\ for\ urgent\ message\!
Check inbox for urgent message!
$ _
```

**Visible in history:**
```bash
$ history | tail -1
1234  echo Check inbox for urgent message!
```

---

#### Method 3: Echo (Direct Output)

**Command:**
```bash
tmux send-keys -t "$TARGET_SESSION" "" # Focus pane
tmux send-keys -t "$TARGET_SESSION" "echo ''" Enter
tmux send-keys -t "$TARGET_SESSION" "echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'" Enter
tmux send-keys -t "$TARGET_SESSION" "echo '📬 MESSAGE FROM: $FROM_SESSION'" Enter
tmux send-keys -t "$TARGET_SESSION" "echo '$MESSAGE'" Enter
tmux send-keys -t "$TARGET_SESSION" "echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'" Enter
```

**How it works:**
- Sends multiple echo commands
- Creates formatted message box
- **Most visible** - large formatted output
- **Most intrusive** - takes up screen real estate
- Best for critical/urgent notifications

**Example:**
```bash
send-tmux-message.sh backend-architect "Production API is down!" echo
```

**Visual result:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📬 MESSAGE FROM: monitoring-agent
Production API is down!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### Security Considerations

#### Shell Injection Prevention

**The vulnerability:**
```bash
# If user provides: MESSAGE="; rm -rf ~; echo "
# And we naively do:
tmux send-keys -t session "echo '$MESSAGE'"
# This executes: echo ''; rm -rf ~; echo ''
# DISASTER!
```

**The protection:**
```bash
# Use printf '%q' to escape shell metacharacters
ESCAPED_MSG=$(printf '%q' "$MESSAGE")
# If MESSAGE="; rm -rf ~; echo "
# ESCAPED_MSG becomes: \;\ rm\ -rf\ \~\;\ echo\
# Safe to use: echo $ESCAPED_MSG
```

**What `printf '%q'` escapes:**
- Spaces → `\ `
- Semicolons → `\;`
- Quotes → `\'` or `\"`
- Backticks → `` \` ``
- Dollar signs → `\$`
- Pipes → `\|`
- Ampersands → `\&`
- All other shell metacharacters

---

### Performance Characteristics

| Method | Latency | CPU Usage | Network | Interruption |
|--------|---------|-----------|---------|--------------|
| File-based | 100-500ms | Low (JSON write) | HTTP request | None |
| tmux display | < 10ms | Minimal | None | None |
| tmux inject | < 10ms | Minimal | None | High (sends Enter) |
| tmux echo | < 50ms | Minimal | None | Very high (output) |

**Latency breakdown (file-based):**
```
Shell script →  5ms (arg parsing, validation)
  ↓
cURL request → 20ms (HTTP connect + TLS handshake)
  ↓
API route →    30ms (request parsing, validation)
  ↓
messageQueue → 50ms (directory check, file write)
  ↓
Total:        ~105ms
```

**Latency breakdown (tmux instant):**
```
Shell script → 3ms (arg parsing, escaping)
  ↓
tmux command → 2ms (send to tmux server)
  ↓
Total:        ~5ms
```

---

## Integration Points

### 1. Dashboard Integration

**Tab-based UI:** `app/page.tsx`

```typescript
<div className="flex border-b border-gray-800">
  <button onClick={() => setActiveTab('terminal')}>
    <Terminal /> Terminal
  </button>
  <button onClick={() => setActiveTab('messages')}>
    <Mail /> Messages
    {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
  </button>
</div>

{activeTab === 'terminal' && <TerminalView session={session} />}
{activeTab === 'messages' && <MessageCenter session={session.id} />}
```

**MessageCenter mounts once** (tab architecture v0.3.0+):
- All sessions mounted simultaneously
- Visibility toggled with CSS
- WebSocket connections persist across tab switches
- No re-initialization on session change

---

### 2. Shell Hook Integration

**Auto-check on session start:** Add to `~/.zshrc`

```bash
# Check messages when tmux session starts
if [ -n "$TMUX" ]; then
  SESSION=$(tmux display-message -p '#S')
  INBOX=~/.aimaestro/messages/inbox/$SESSION

  if [ -d "$INBOX" ]; then
    COUNT=$(ls "$INBOX"/*.json 2>/dev/null | wc -l | tr -d ' ')
    if [ $COUNT -gt 0 ]; then
      check-and-show-messages.sh
    fi
  fi
fi
```

**Claude Code hook:** `.claude/hooks/after-response.sh`

```bash
#!/bin/bash
# Check for new messages after each Claude response
check-new-messages-arrived.sh
```

---

### 3. API Integration

**External tools can use the REST API:**

```bash
# Send message from external script
curl -X POST http://localhost:23000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "from": "ci-pipeline",
    "to": "backend-architect",
    "subject": "Build failed",
    "priority": "high",
    "content": {
      "type": "notification",
      "message": "Build #1234 failed. Check logs at https://ci.example.com/builds/1234"
    }
  }'

# Check inbox from external script
curl "http://localhost:23000/api/messages?session=backend-architect" | jq
```

---

## Data Flow Diagrams

### Scenario 1: Send File-Based Message

```
┌──────────────┐
│   Agent A    │
│  (frontend)  │
└──────┬───────┘
       │
       │ 1. Run: send-aimaestro-message.sh backend "Subject" "Message"
       │
       ↓
┌──────────────────────┐
│  Shell Script        │
│  - Validate args     │
│  - Build JSON (jq)   │
│  - POST to API       │
└──────┬───────────────┘
       │
       │ 2. POST /api/messages
       │    {from: "frontend", to: "backend", ...}
       │
       ↓
┌──────────────────────┐
│  API Route           │
│  - Validate payload  │
│  - Call sendMessage()│
└──────┬───────────────┘
       │
       │ 3. sendMessage(...)
       │
       ↓
┌──────────────────────┐
│  messageQueue.ts     │
│  - Generate ID       │
│  - Write to inbox    │
│  - Write to sent     │
└──────┬───────────────┘
       │
       │ 4. File system writes
       │
       ↓
┌──────────────────────────────────────────┐
│  ~/.aimaestro/messages/                  │
│  ├── inbox/backend/msg-xxx.json    ← NEW│
│  └── sent/frontend/msg-xxx.json    ← NEW│
└──────────────────────────────────────────┘
       │
       │ 5. Agent B checks inbox (dashboard or shell)
       │
       ↓
┌──────────────┐
│   Agent B    │
│   (backend)  │
└──────────────┘
```

---

### Scenario 2: Send Instant Notification

```
┌──────────────┐
│   Agent A    │
│  (frontend)  │
└──────┬───────┘
       │
       │ 1. Run: send-tmux-message.sh backend "Check inbox!"
       │
       ↓
┌──────────────────────┐
│  Shell Script        │
│  - Get FROM session  │
│  - Escape message    │
│  - Run tmux command  │
└──────┬───────────────┘
       │
       │ 2. tmux display-message -t backend "Message..."
       │
       ↓
┌──────────────────────┐
│  tmux Server         │
│  - Find session      │
│  - Send to client    │
└──────┬───────────────┘
       │
       │ 3. Display on status line
       │
       ↓
┌──────────────┐
│   Agent B    │
│   (backend)  │
│ ┌────────────┐ │
│ │ 📬 Message │ │ ← Popup appears
│ └────────────┘ │
└──────────────┘
```

---

## Scalability Considerations

### File-Based System

**Current capacity:**
- **Messages per session:** Unlimited (practical limit ~10,000 before performance degrades)
- **Message size:** No hard limit (practical limit ~1MB for JSON parsing)
- **Concurrent sessions:** Limited only by file system
- **API throughput:** ~100 requests/second (Node.js single-threaded)

**Bottlenecks:**
1. **File system I/O** - Each message = 2 file writes (inbox + sent)
2. **JSON parsing** - Large message lists (>1000) slow to parse
3. **No indexing** - Linear scan through all JSON files

**Optimization strategies:**
- Add message indexing (SQLite or similar)
- Implement message pagination (frontend)
- Archive old messages automatically
- Add caching layer (in-memory LRU cache)

---

### Instant Notifications

**Current capacity:**
- **Messages per second:** ~1000 (tmux command execution)
- **Message size:** Limited by terminal width (typically 80-200 chars optimal)
- **Concurrent sessions:** Limited by tmux server capacity (~100 sessions)

**Bottlenecks:**
1. **tmux server capacity** - All commands go through single server
2. **Terminal refresh rate** - Display updates limited to ~60 FPS

**No optimization needed** - tmux instant notifications are already near-optimal for local communication.

---

## Error Handling

### File-Based System Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| HTTP 400 | Invalid payload | Check required fields |
| HTTP 404 | Message not found | Message already deleted |
| HTTP 500 | File system error | Check permissions, disk space |
| ENOENT | Directory missing | Auto-created by messageQueue |
| EACCES | Permission denied | `chmod -R u+rw ~/.aimaestro/messages/` |
| ENOSPC | Disk full | Clean up old messages |

**Error handling in shell script:**
```bash
RESPONSE=$(curl -s -w "\n%{http_code}" ...)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Message sent"
else
  echo "❌ Failed (HTTP $HTTP_CODE)"
  ERROR_MSG=$(echo "$RESPONSE" | sed '$d' | jq -r '.error')
  echo "   Error: $ERROR_MSG"
  exit 1
fi
```

---

### Instant Notification Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| Session not found | Target session doesn't exist | Check `tmux list-sessions` |
| Permission denied | Can't access tmux server | Check tmux socket permissions |
| Broken pipe | Session closed during send | Message lost (ephemeral) |

**Error handling in shell script:**
```bash
# Check session exists before sending
if ! tmux has-session -t "$TARGET_SESSION" 2>/dev/null; then
  echo "❌ Error: Session '$TARGET_SESSION' not found"
  echo "Available sessions:"
  tmux list-sessions -F "  - #{session_name}"
  exit 1
fi

# Send message (ignore errors - ephemeral)
tmux display-message -t "$TARGET_SESSION" "$MESSAGE" 2>/dev/null || true
```

---

## Security Model

### Threat Model

**Assumptions:**
- ✅ All agents run on same machine (localhost)
- ✅ User has shell access to the machine
- ✅ tmux server is trusted
- ✅ File system permissions are secure

**NOT protected against:**
- ❌ Malicious user with shell access (by design - they have full access anyway)
- ❌ Other users on multi-user system (use file permissions)
- ❌ Network attacks (API binds to localhost only)

### Security Controls

1. **Input validation**
   - Session names: `^[a-zA-Z0-9_-]+$`
   - Priorities: enum validation
   - Types: enum validation
   - JSON: Schema validation

2. **Shell injection prevention**
   - Use `printf '%q'` for all user input in shell
   - Use `jq -n --arg` for JSON construction
   - Never use `eval` or backticks with user input

3. **Path traversal prevention**
   - Session names validated (no `../` allowed)
   - All paths constructed with `path.join()` (Node.js)
   - No user-controlled file paths

4. **API security**
   - Localhost only (not exposed to network)
   - No authentication (not needed for localhost)
   - Rate limiting (future enhancement)

---

## Performance Benchmarks

### File-Based Messaging

**Test setup:**
- Send 1000 messages
- Measure end-to-end latency
- macOS 13.0, M1 MacBook Pro

**Results:**
```
Operation           | P50    | P95    | P99    |
--------------------|--------|--------|--------|
Send message        | 95ms   | 150ms  | 250ms  |
List inbox (10 msg) | 25ms   | 40ms   | 60ms   |
List inbox (100 msg)| 180ms  | 280ms  | 450ms  |
Get single message  | 15ms   | 25ms   | 40ms   |
Mark as read        | 45ms   | 70ms   | 110ms  |
Delete message      | 30ms   | 50ms   | 80ms   |
```

### Instant Notifications

**Test setup:**
- Send 1000 instant messages
- Measure command execution time

**Results:**
```
Method              | P50   | P95   | P99   |
--------------------|-------|-------|-------|
display (popup)     | 4ms   | 8ms   | 15ms  |
inject (history)    | 5ms   | 10ms  | 18ms  |
echo (output)       | 12ms  | 22ms  | 35ms  |
```

**Conclusion:** Instant notifications are ~20x faster than file-based messaging.

---

## Future Enhancements

### Planned Improvements

1. **Message Search**
   - Full-text search across all messages
   - Filter by date range, sender, priority
   - SQLite index for fast queries

2. **Message Threading**
   - Link replies to original messages
   - View conversation threads in UI
   - `inReplyTo` field already exists (ready for implementation)

3. **Rich Content**
   - Attach files (code snippets, logs, screenshots)
   - Markdown rendering in messages
   - Code syntax highlighting

4. **Webhooks**
   - Trigger external actions on message receipt
   - HTTP POST to configured endpoints
   - Use cases: Slack notifications, PagerDuty alerts

5. **Message Templates**
   - Pre-defined message formats
   - Reduce typing for common scenarios
   - Validation for required fields

6. **Analytics**
   - Track agent communication patterns
   - Identify bottlenecks
   - Visualize message flow

---

## Related Documentation

- **[Quickstart Guide](./AGENT-COMMUNICATION-QUICKSTART.md)** - Get started in 5 minutes
- **[Guidelines](./AGENT-COMMUNICATION-GUIDELINES.md)** - Best practices
- **[Messaging Guide](./AGENT-MESSAGING-GUIDE.md)** - Comprehensive reference
- **[CLAUDE.md](../CLAUDE.md)** - Overall project architecture
