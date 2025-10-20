# AI Maestro - Product Backlog

**Purpose:** This document tracks planned features, improvements, and ideas for AI Maestro. Items are prioritized into three categories: Now (next release), Next (upcoming releases), and Later (future considerations).

**Last Updated:** 2025-10-19
**Current Version:** v0.4.3

---

## Now (Next Release - v0.5.0)

### 1. Memory Optimization & Leak Prevention

**Status:** Planned
**Priority:** High
**Effort:** Small (1 day)
**Version:** v0.5.0

**Problem:**
After comprehensive memory analysis, several potential memory leaks and inefficiencies were identified:
- Large terminal scrollback buffers (50,000 lines × 11 terminals = 550,000 lines, ~110-200 MB)
- Refresh timeouts not cleaned up on unmount (minor leak)
- Unbounded message buffer growth during slow initialization (edge case)
- Console logging accumulation when DevTools is open (20-50 MB over hours)
- No Node.js heap size limits (can crash with OOM)

**Current Memory Usage (Baseline):**
- Server: 227 MB RSS (healthy)
- Browser: 500-800 MB (acceptable but can be optimized)
- 11 active sessions, 2+ days runtime

**Reference:** See `docs/MEMORY-ANALYSIS.md` for detailed analysis.

---

**Quick Wins (High Priority):**

**1. Reduce Terminal Scrollback Buffer**
```typescript
// hooks/useTerminal.ts:144
scrollback: 10000,  // Reduce from 50,000 → 10,000 lines
```

**Impact:** Saves ~80-100 MB browser memory (11 terminals)

**Justification:**
- Most users don't need 50,000 lines in xterm.js buffer
- Full history accessible via tmux copy mode (Ctrl-b [)
- Claude Code outputs lots of data (thinking steps, diffs, etc.) that fills buffer quickly
- 10,000 lines = ~30-50 MB total for 11 terminals (acceptable)

---

**2. Add Refresh Timeout Cleanup**
```typescript
// components/TerminalView.tsx:165-174
useEffect(() => {
  // ... existing code ...

  return () => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }
  }
}, [isMobile, terminal])
```

**Impact:** Prevents minor timeout leak on rapid session switching

---

**3. Add Message Buffer Size Limit**
```typescript
// components/TerminalView.tsx:177
// Replace: messageBufferRef.current.push(data)
// With:
if (messageBufferRef.current.length < 100) {
  messageBufferRef.current.push(data)
} else {
  console.warn('Message buffer full, dropping oldest')
  messageBufferRef.current.shift()
  messageBufferRef.current.push(data)
}
```

**Impact:** Prevents unbounded growth during slow terminal initialization

---

**Medium Priority:**

**4. Increase Node.js Heap Size**
```json
// package.json
"scripts": {
  "dev": "NODE_OPTIONS='--max-old-space-size=2048' node server.mjs",
  "start": "NODE_OPTIONS='--max-old-space-size=4096' node server.mjs"
}
```

**Impact:** Prevents OOM crashes during heavy usage (default is ~1.4 GB)

---

**5. Add Debug Flag for Console Logging**
```typescript
// Create lib/debug.ts
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true'

export const debug = {
  log: (...args: any[]) => DEBUG && console.log(...args),
  warn: (...args: any[]) => DEBUG && console.warn(...args),
  error: (...args: any[]) => console.error(...args) // Always log errors
}

// Replace throughout codebase:
// console.log('📨 [WS-MESSAGE] ...') → debug.log('📨 [WS-MESSAGE] ...')
```

**Impact:** Reduces DevTools memory usage (no log accumulation when DEBUG=false)

---

**6. Add Memory Monitoring**

**Server-Side Logging:**
```javascript
// server.mjs - Add periodic memory logging
setInterval(() => {
  const used = process.memoryUsage()
  console.log('Memory Stats:', {
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    heapPercent: Math.round((used.heapUsed / used.heapTotal) * 100),
    activeSessions: sessions.size
  })
}, 60000) // Every minute
```

**Health Endpoint:**
```typescript
// app/api/health/route.ts
export async function GET() {
  const used = process.memoryUsage()
  return Response.json({
    uptime: process.uptime(),
    memory: {
      rss: Math.round(used.rss / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapPercent: Math.round((used.heapUsed / used.heapTotal) * 100)
    },
    activeSessions: global.sessions?.size || 0
  })
}
```

**Monitoring Script:**
```bash
# scripts/memory-check.sh
#!/bin/bash
PID=$(pgrep -f "node.*server.mjs" | head -1)
ps -p $PID -o pid,rss,pmem,etime,command
echo "File Descriptors: $(lsof -p $PID 2>/dev/null | wc -l)"
echo "PTY Processes: $(ps aux | grep 'tmux attach-session' | grep -v grep | wc -l)"
```

---

**Expected Results:**

**Before Optimization:**
- Browser: 500-800 MB
- Server: 227 MB

**After Optimization:**
- Browser: 300-500 MB (200-300 MB saved)
- Server: 227 MB (unchanged)

---

**Implementation Checklist:**

**High Priority (Immediate):**
- [ ] Reduce scrollback buffer (50K → 10K) in `hooks/useTerminal.ts:144`
- [ ] Add refresh timeout cleanup in `components/TerminalView.tsx:165-174`
- [ ] Add message buffer limit in `components/TerminalView.tsx:177`

**Medium Priority (This Sprint):**
- [ ] Increase Node.js heap size in `package.json`
- [ ] Create `lib/debug.ts` and replace console.log calls
- [ ] Add memory monitoring to `server.mjs`
- [ ] Create health endpoint at `app/api/health/route.ts`
- [ ] Create `scripts/memory-check.sh` monitoring script

**Documentation:**
- [ ] Update `docs/MEMORY-ANALYSIS.md` with final results
- [ ] Add memory monitoring guide to `docs/OPERATIONS-GUIDE.md`
- [ ] Document optimal scrollback settings in `CLAUDE.md`

---

**Long-Term Improvements (Later):**

Future architectural improvements for v0.6.0+:
- Virtual scrolling for terminals (render only visible portion)
- Lazy terminal mounting (mount only active + 2 most recently used)
- Incremental log loading (load 100 lines initially, fetch more on scroll)
- Session hibernation (auto-hibernate inactive sessions after 10 minutes)
- Log rotation (optional, logs currently small at 2.4 MB after 2 days)

---

### 2. Real-Time Message Read Receipts

**Status:** Planned
**Priority:** High
**Effort:** Medium (2-3 days)
**Version:** v0.5.0

**Problem:**
Currently, when an agent sends a message to another agent, there's no way to know if/when the message was read. This creates uncertainty about whether communication happened and can lead to duplicate messages or missed coordination.

**Proposed Solution:**
Implement a lightweight event system using Node.js EventEmitter + existing WebSocket infrastructure. No external dependencies needed.

**Technical Approach:**

**1. Server-Side Event System**
```typescript
// lib/messageEvents.ts
import { EventEmitter } from 'events';

export const messageEvents = new EventEmitter();

// Emit events for message lifecycle
messageEvents.emit('message:created', { messageId, from, to });
messageEvents.emit('message:read', { messageId, from, to, readAt });
messageEvents.emit('message:deleted', { messageId, from, to });
```

**2. Extend Existing WebSocket Server**
```typescript
// server.mjs - Add message event channel
const messageListeners = new Map(); // sessionName -> Set of WebSocket clients

messageEvents.on('message:read', (event) => {
  // Notify the SENDER via WebSocket
  const senderClients = messageListeners.get(event.from) || new Set();
  senderClients.forEach(ws => {
    ws.send(JSON.stringify({
      type: 'message:read',
      data: event
    }));
  });
});

// WebSocket connection subscribes to message events
wss.on('connection', (ws, req) => {
  const sessionName = getSessionFromUrl(req.url);

  if (!messageListeners.has(sessionName)) {
    messageListeners.set(sessionName, new Set());
  }
  messageListeners.get(sessionName).add(ws);

  ws.on('close', () => {
    messageListeners.get(sessionName)?.delete(ws);
  });
});
```

**3. Update Message API**
```typescript
// app/api/messages/route.ts
export async function PATCH(req: Request) {
  const { messageId, action } = await req.json();

  if (action === 'mark-read') {
    const message = await markAsRead(messageId);

    // Emit event (triggers WebSocket notification)
    messageEvents.emit('message:read', {
      messageId,
      from: message.from,
      to: message.to,
      readAt: new Date().toISOString()
    });

    return Response.json({ success: true, message });
  }
}
```

**4. Update Message Schema**
```typescript
// types/message.ts
export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: MessageContent;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  type: 'request' | 'response' | 'notification' | 'update';
  status: 'unread' | 'read';
  timestamp: string;
  readAt?: string;  // NEW: When message was read
}
```

**5. Frontend Implementation**
```typescript
// hooks/useMessageNotifications.ts
export function useMessageNotifications(sessionName: string) {
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:23000/term?name=${sessionName}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'message:read') {
        // Update UI: show read receipt
        updateMessageStatus(msg.data.messageId, 'read');

        // Show toast notification
        toast.info(`Message read by ${msg.data.to}`, {
          description: `Read at ${new Date(msg.data.readAt).toLocaleTimeString()}`
        });
      }
    };

    return () => ws.close();
  }, [sessionName]);
}
```

**6. UI Updates**
- Add "Read" badge to sent messages
- Show read timestamp on hover
- Add read receipt indicator (✓✓ like WhatsApp)
- Real-time updates without page refresh

**Benefits:**
- **Sender confidence:** Know when message was received
- **Better coordination:** Reduce duplicate messages
- **Real-time feedback:** Instant notification when message is read
- **No polling:** WebSocket-based (existing infrastructure)
- **Zero dependencies:** Uses Node.js EventEmitter + existing WebSocket
- **Extensible:** Foundation for more event types (deleted, archived, etc.)

**Implementation Checklist:**
- [ ] Create `lib/messageEvents.ts` with EventEmitter
- [ ] Extend WebSocket server for message events
- [ ] Add `readAt` field to message schema
- [ ] Update PATCH `/api/messages` endpoint
- [ ] Create `useMessageNotifications` hook
- [ ] Update Messages UI with read receipts
- [ ] Add toast notifications for read events
- [ ] Test real-time updates across sessions
- [ ] Update documentation

---

### 2. Agent Long-Term Memory System

**Status:** Planned
**Priority:** High
**Effort:** Medium (2-3 days)
**Version:** v0.5.0

**Problem:**
AI agents currently have no persistent memory across sessions. When a session restarts, the agent loses all context about:
- Project decisions made
- User preferences learned
- Important facts discovered
- Lessons from previous errors
- Current work context

This forces users to repeat the same context over and over, breaking workflow and wasting time.

**User Request:**
"I want to tell Claude 'remember this' or 'this is important' and have it update a memory file for the agent. Next session, the agent should recall this information automatically."

**Proposed Solution:**
File-based markdown memory system with structured categories and simple bash scripts.

---

**Architecture:**
```
~/.aimaestro/memory/
├── backend-architect/
│   └── memory.md         # Agent's persistent memory
├── frontend-dev/
│   └── memory.md
└── devops-engineer/
    └── memory.md
```

**Memory File Format - Structured Markdown:**
```markdown
---
agent: backend-architect
last_updated: 2025-01-18T15:30:00Z
---

# Agent Memory - backend-architect

## 🎯 Current Context
- Working on: Real-time messaging feature
- Last deployed: v0.4.2 on 2025-01-18
- Active branch: feature/read-receipts

## 📚 Important Facts
- **Project Stack:** Next.js 14, React 18, TypeScript, WebSocket
- **API Base:** http://localhost:23000
- **Message Storage:** ~/.aimaestro/messages/ (file-based, not queue)
- **Database:** None (file-based system)

## 🧠 Key Decisions
- **2025-01-18:** Use EventEmitter over Redis for events (zero dependencies)
- **2025-01-15:** Dual-channel messaging: file-based + tmux notifications
- **2025-01-10:** Sessions auto-discovered from tmux (no config file)

## 👤 User Preferences
- Prefers tabs over spaces
- Uses vim keybindings
- Wants natural language commands (no slash commands)

## 💡 Learnings
- **PTY leaks:** Use 30-second grace period before cleanup (server.mjs:803)
- **tmux PATH issues:** Export PATH in ~/.zshenv not ~/.zshrc
- **Read receipts:** Need WebSocket + EventEmitter, not polling

## 🔗 Related Agents
- Works with: frontend-dev (API integration), devops-engineer (deployment)
- Reports to: project-manager
```

---

**Scripts to Create:**

**1. `remember-this.sh` - Store Memory**
```bash
#!/bin/bash
# Usage: remember-this.sh "Key fact about API design" [category]
# Categories: fact, decision, preference, learning, context

MEMORY_DIR="$HOME/.aimaestro/memory"
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "default")
MEMORY_FILE="$MEMORY_DIR/$SESSION_NAME/memory.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Initialize memory file with template if it doesn't exist
# Add entry to appropriate section based on category
# Update last_updated timestamp

echo "✅ Memory saved: $1"
echo "📁 Location: $MEMORY_FILE"
```

**Examples:**
```bash
# Remember a fact
remember-this.sh "Project uses Next.js 14" fact

# Remember a decision
remember-this.sh "Use EventEmitter for events" decision

# Remember a preference
remember-this.sh "User prefers TypeScript for all new code" preference

# Remember a learning
remember-this.sh "PTY leaks fixed with 30-second grace period" learning

# Update current context
remember-this.sh "Working on read receipts feature" context
```

**2. `recall-memory.sh` - Display Memory**
```bash
#!/bin/bash
# Usage: recall-memory.sh [category]
# Example: recall-memory.sh decisions

SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "default")
MEMORY_FILE="$HOME/.aimaestro/memory/$SESSION_NAME/memory.md"

if [ ! -f "$MEMORY_FILE" ]; then
  echo "No memory file found for session: $SESSION_NAME"
  exit 0
fi

# Show all memory or specific category
cat "$MEMORY_FILE"  # or grep for specific category
```

**3. `update-memory-context.sh` - Quick Context Update**
```bash
#!/bin/bash
# Usage: update-memory-context.sh "Working on feature X"
# Shortcut for updating Current Context section

remember-this.sh "$1" context
```

---

**Claude Code Skill Integration:**

**`skills/agent-memory/SKILL.md`**
```markdown
---
name: Agent Memory Management
description: Store and retrieve important information for this agent session across conversations
allowed-tools: Bash
---

# Agent Memory Management

## Purpose
Persistent memory for this agent session. Information survives session restarts.

## When to Use

**Storing Memory:**
- User says "remember this" or "don't forget"
- User says "this is important"
- User provides context that should persist
- You make an important decision
- User teaches you a preference

**Recalling Memory:**
- Session start (ALWAYS check memory first)
- User asks "what do you remember"
- User asks "what's our context"
- Before making decisions (check for past decisions)

## Commands

### Store Memory
```bash
# Categories: fact, decision, preference, learning, context

remember-this.sh "API uses EventEmitter not Redis" decision
remember-this.sh "User prefers natural language" preference
remember-this.sh "PTY leaks fixed with 30s grace period" learning
remember-this.sh "Message storage is file-based not queue" fact
remember-this.sh "Working on read receipts v0.5.0" context
```

### Recall Memory
```bash
# Show all memory
recall-memory.sh

# Show specific category
recall-memory.sh facts
recall-memory.sh decisions
recall-memory.sh learnings
```

## Best Practices
1. **On session start:** Run `recall-memory.sh` to load context
2. **Important info:** Immediately save with `remember-this.sh`
3. **Categorize correctly:** Use right category for organization
4. **Be concise:** Save key points, not full conversations
5. **Update context:** Keep "Current Context" section fresh
```

---

**Alternative Approaches Evaluated:**

**Option 2: JSON-Based Memory**
- **Pros:** Machine-readable, queryable with jq
- **Cons:** Not human-readable, harder to edit manually
- **Verdict:** ❌ Too complex for MVP, over-engineered

**Option 3: SQLite Database**
- **Pros:** Full querying, relational data, fast search
- **Cons:** Requires SQLite, more complex, overkill
- **Verdict:** ❌ Not aligned with file-based philosophy

**Why File-Based Markdown Wins:**
✅ Simple (just markdown files, no dependencies)
✅ Human-readable (edit with any text editor)
✅ Portable (easy to backup/share/version control)
✅ Consistent (matches messaging system pattern)
✅ Inspectable (`cat` or `less` to view)
✅ Diffable (git can track changes)
✅ Zero dependencies (works everywhere)
✅ Natural Language Ready (Claude reads markdown easily)

---

**UI Integration (v0.6.0):**

Add "Memory" tab to AI Maestro dashboard:
- Display memory file with syntax highlighting
- Edit in-place functionality
- Search within memories
- Export/import memory files
- Memory templates

---

**Implementation Phases:**

**Phase 1: Core Scripts (v0.5.0)**
- [ ] Create `remember-this.sh` script (150 lines)
- [ ] Create `recall-memory.sh` script (50 lines)
- [ ] Create `update-memory-context.sh` helper (30 lines)
- [ ] Add memory template (markdown structure)
- [ ] Add to `install-messaging.sh` installer
- [ ] Test with sample memories across sessions

**Phase 2: Claude Integration (v0.5.0)**
- [ ] Create `skills/agent-memory/SKILL.md` (200 lines)
- [ ] Update Claude Code configuration docs
- [ ] Add memory recall to session start workflow
- [ ] Test "remember this" natural language commands
- [ ] Document best practices

**Phase 3: UI Integration (v0.6.0)**
- [ ] Add Memory tab to dashboard
- [ ] Display memory file with syntax highlighting
- [ ] Edit in-place with auto-save
- [ ] Search within memories
- [ ] Visual category indicators

---

**Benefits:**

**For Agents:**
- Persistent context across sessions
- No need to repeat information
- Learn and improve over time
- Remember user preferences
- Track project decisions

**For Users:**
- Natural "remember this" commands
- No manual note-taking
- Consistent agent behavior
- Knowledge accumulation
- Easy to review what agent knows

**For AI Maestro:**
- Aligns with file-based architecture
- Zero external dependencies
- Simple to implement and maintain
- Extensible (add categories, features later)
- Foundation for agent learning systems

---

**Considerations:**

⚠️ **No automatic deduplication:** Users must manage duplicates (acceptable for MVP)
⚠️ **No size limits:** Memory files could grow large (add pruning in v0.6.0)
⚠️ **Manual categorization:** User must specify category (could auto-categorize with AI later)
⚠️ **No search index:** Use grep for search (acceptable for small files)

---

**Future Enhancements (Later):**

- Memory pruning (remove old/duplicate entries)
- Cross-agent memory sharing (team knowledge base)
- Memory search UI with filters
- Automatic categorization with AI
- Memory export/import (JSON, CSV)
- Memory templates per agent type
- Memory sync across machines
- Memory analytics (what agents remember most)

---

**Files to Create:**

- `messaging_scripts/remember-this.sh` (150 lines)
- `messaging_scripts/recall-memory.sh` (50 lines)
- `messaging_scripts/update-memory-context.sh` (30 lines)
- `skills/agent-memory/SKILL.md` (200 lines)
- `docs/AGENT-MEMORY-GUIDE.md` (comprehensive guide)
- Update `install-messaging.sh` to install memory scripts

---

## Next (v0.6.x)

### 3. Slack Integration for Agent Communication

**Status:** Planned
**Priority:** High
**Effort:** High (5-7 days)
**Version:** v0.6.0

**Problem:**
Users can't communicate with their AI agents when away from the AI Maestro dashboard. There's no way to:
- Send messages to agents from mobile devices
- Receive urgent notifications from agents in real-time
- Coordinate with agents while on the go or in meetings
- Check agent status without opening the dashboard

This limits AI Maestro to desktop-only usage and reduces responsiveness for time-sensitive agent coordination.

**User Request:**
"I want to create scripts, a skill, and Slack integration so I can send and receive messages to agents using Slack."

**Proposed Solution:**
Bidirectional Slack integration enabling users to send messages to agents from Slack and receive agent messages as Slack notifications.

---

**Integration Architecture - Three Approaches:**

**Option 1: Socket Mode (Recommended for AI Maestro)**
- **How it works:** WebSocket connection to Slack (no public endpoint needed)
- **Best for:** Local/private deployments, development, self-hosted scenarios
- **Pros:** Works behind firewalls, no ngrok needed, real-time bidirectional
- **Cons:** Not for Slack Marketplace apps
- **Perfect for AI Maestro:** Localhost-first design, no public server required

```typescript
// Socket Mode Flow
Slack App → calls apps.connections.open → gets WebSocket URL
AI Maestro → connects to WebSocket → receives events
User types: /agent message backend "API ready"
Slack → WebSocket event → AI Maestro → writes to messages/inbox/
Agent reads message → sends response → AI Maestro → chat.postMessage → Slack
```

**Option 2: Events API (For production/marketplace apps)**
- **How it works:** HTTP webhooks to public Request URL
- **Best for:** Production deployments, Slack Marketplace submissions
- **Pros:** Standard Slack integration pattern, reliable
- **Cons:** Requires public endpoint, ngrok for local dev
- **When to use:** If distributing AI Maestro as Slack App Marketplace app

```typescript
// Events API Flow
User types in Slack → Slack HTTP POST → https://your-server.com/api/slack/events
AI Maestro → processes → writes to messages/inbox/
Agent responds → AI Maestro → chat.postMessage → Slack
```

**Option 3: Incoming Webhooks (Send-only, simplest)**
- **How it works:** POST JSON to webhook URL to send messages
- **Best for:** One-way notifications (agents → Slack only)
- **Pros:** Simplest to implement, no server needed
- **Cons:** Can't receive messages from Slack
- **Use case:** Quick notifications, no bidirectional needed

---

**Recommended Implementation: Socket Mode + Slash Commands**

**Why Socket Mode:**
- No public endpoint required (aligns with localhost-first design)
- Works behind corporate firewalls
- Real-time WebSocket connection (perfect for instant messaging)
- Easy local development (no ngrok)
- Full bidirectional communication

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                           Slack App                              │
│  Permissions: chat:write, commands, connections:write            │
└───────────────────────┬─────────────────────────────────────────┘
                        │ WebSocket (Socket Mode)
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                      AI Maestro Server                           │
│  - Socket Mode client (connects to Slack WebSocket)             │
│  - Event handlers (slash commands, messages, interactions)       │
│  - Message bridge (Slack ↔ AI Maestro messaging system)         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│              ~/.aimaestro/messages/inbox/                        │
│  agent-name/                                                     │
│  └── msg_slack_001.json                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

**Bidirectional Communication:**

**1. Slack → AI Maestro (User sends to agent)**

**Slash Commands:**
```
/agent message <agent-name> "<message>"
/agent list
/agent status <agent-name>
/agent urgent <agent-name> "<message>"
```

**Examples:**
```
/agent message backend-architect "API endpoint ready for review"
/agent urgent frontend-dev "Production bug: users can't login"
/agent list
/agent status devops-engineer
```

**Implementation Flow:**
```typescript
// 1. User types slash command in Slack
/agent message backend "API ready"

// 2. Slack sends WebSocket event to AI Maestro
{
  type: 'slash_command',
  command: '/agent',
  text: 'message backend "API ready"',
  user_id: 'U123ABC',
  user_name: 'juan',
  channel_id: 'C456DEF',
  response_url: 'https://hooks.slack.com/...'
}

// 3. AI Maestro parses and creates message file
const message = {
  id: `msg_slack_${Date.now()}`,
  from: 'slack:juan',
  to: 'backend',
  subject: 'Message from Slack',
  content: {
    text: 'API ready',
    format: 'plain'
  },
  priority: 'normal',
  type: 'notification',
  status: 'unread',
  timestamp: new Date().toISOString(),
  metadata: {
    source: 'slack',
    slack_user_id: 'U123ABC',
    slack_channel_id: 'C456DEF'
  }
};

// 4. Write to ~/.aimaestro/messages/inbox/backend/
fs.writeFileSync(messageFile, JSON.stringify(message, null, 2));

// 5. Send tmux notification
execSync(`tmux send-keys -t backend "echo '\n📨 New Slack message from juan: API ready\n'" C-m`);

// 6. Respond to Slack (ephemeral message)
await fetch(response_url, {
  method: 'POST',
  body: JSON.stringify({
    text: `✅ Message sent to backend-architect`,
    response_type: 'ephemeral'
  })
});
```

**2. AI Maestro → Slack (Agent sends notification)**

**New Script: `send-to-slack.sh`**
```bash
#!/bin/bash
# Usage: send-to-slack.sh "#channel or @user" "Message text"
# Example: send-to-slack.sh "@juan" "Backend deployment complete"

SLACK_BOT_TOKEN="${AIMAESTRO_SLACK_BOT_TOKEN}"
SLACK_CHANNEL="$1"
MESSAGE="$2"
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")

curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$SLACK_CHANNEL\",
    \"text\": \"$MESSAGE\",
    \"blocks\": [
      {
        \"type\": \"section\",
        \"text\": {
          \"type\": \"mrkdwn\",
          \"text\": \"*Agent:* \`$SESSION_NAME\`\n$MESSAGE\"
        }
      }
    ]
  }"
```

**Claude Code Skill Integration:**
```markdown
# skills/slack-integration/SKILL.md

User says "notify me on Slack" or "send to Slack":
1. Use send-to-slack.sh to send notification
2. Include agent name and context
3. Confirm delivery

Example:
User: "Let me know on Slack when the build finishes"
Claude: *runs build*
Claude: `send-to-slack.sh "@juan" "Build completed successfully (v0.6.0)"`
```

---

**Technical Implementation:**

**1. Slack App Setup**

**Required OAuth Scopes:**
```
Bot Token Scopes (xoxb-):
- chat:write          # Send messages
- chat:write.public   # Post to channels without joining
- commands            # Slash commands
- connections:write   # Socket Mode WebSocket
- channels:read       # List channels (optional)
- users:read          # Get user info (optional)
```

**App Configuration:**
- Enable Socket Mode
- Create slash command: `/agent`
- Subscribe to events: `message.channels`, `app_mention` (optional)
- Install app to workspace → get Bot Token (xoxb-...)
- Get App-Level Token with `connections:write` scope

**2. Server-Side Implementation**

**New File: `lib/slackClient.ts`**
```typescript
import { WebClient } from '@slack/web-api';
import { SocketModeClient } from '@slack/socket-mode';
import { createMessageFile } from './messaging';

const web = new WebClient(process.env.AIMAESTRO_SLACK_BOT_TOKEN);
const socketMode = new SocketModeClient({
  appToken: process.env.AIMAESTRO_SLACK_APP_TOKEN,
  socketMode: true
});

// Handle slash commands
socketMode.on('slash_command', async ({ payload, ack }) => {
  await ack();

  if (payload.command === '/agent') {
    await handleAgentCommand(payload);
  }
});

async function handleAgentCommand(payload: SlackSlashCommand) {
  const args = payload.text.split(' ');
  const action = args[0]; // 'message', 'list', 'status', 'urgent'

  switch (action) {
    case 'message':
    case 'urgent':
      const agentName = args[1];
      const messageText = args.slice(2).join(' ').replace(/^"|"$/g, '');

      // Create message file
      await createMessageFile({
        from: `slack:${payload.user_name}`,
        to: agentName,
        subject: `Message from Slack`,
        content: { text: messageText, format: 'plain' },
        priority: action === 'urgent' ? 'urgent' : 'normal',
        type: 'notification',
        metadata: {
          source: 'slack',
          slack_user_id: payload.user_id,
          slack_channel_id: payload.channel_id
        }
      });

      // Send tmux notification
      exec(`tmux send-keys -t ${agentName} "echo '\\n📨 Slack: ${messageText}\\n'" C-m`);

      // Respond to user
      await web.chat.postMessage({
        channel: payload.channel_id,
        text: `✅ Message sent to ${agentName}`,
        thread_ts: payload.message_ts // Reply in thread if applicable
      });
      break;

    case 'list':
      const sessions = await getActiveAgents();
      await web.chat.postMessage({
        channel: payload.channel_id,
        text: `Active agents:\n${sessions.map(s => `• ${s.name}`).join('\n')}`
      });
      break;

    case 'status':
      const agent = args[1];
      const status = await getAgentStatus(agent);
      await web.chat.postMessage({
        channel: payload.channel_id,
        text: `Agent: ${agent}\nStatus: ${status.online ? '🟢 Online' : '🔴 Offline'}\nLast active: ${status.lastActive}`
      });
      break;

    default:
      await web.chat.postMessage({
        channel: payload.channel_id,
        text: `Unknown command. Usage:\n/agent message <name> "<text>"\n/agent list\n/agent status <name>`
      });
  }
}

// Start Socket Mode
socketMode.start();
```

**3. Environment Configuration**

**Add to `.env.local`:**
```bash
# Slack Integration (optional)
AIMAESTRO_SLACK_BOT_TOKEN=xoxb-your-bot-token
AIMAESTRO_SLACK_APP_TOKEN=xapp-your-app-level-token
AIMAESTRO_SLACK_ENABLED=true
AIMAESTRO_SLACK_DEFAULT_CHANNEL=#ai-maestro
```

**4. New Scripts**

**`messaging_scripts/send-to-slack.sh`** (50 lines)
```bash
#!/bin/bash
# Send message to Slack channel or user
# Usage: send-to-slack.sh "#channel or @user" "Message"

SLACK_BOT_TOKEN="${AIMAESTRO_SLACK_BOT_TOKEN}"
if [ -z "$SLACK_BOT_TOKEN" ]; then
  echo "❌ Error: AIMAESTRO_SLACK_BOT_TOKEN not set"
  exit 1
fi

CHANNEL="$1"
MESSAGE="$2"
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")

# Send message via Slack Web API
RESPONSE=$(curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"channel\": \"$CHANNEL\",
    \"text\": \"$MESSAGE\",
    \"blocks\": [
      {
        \"type\": \"section\",
        \"text\": {
          \"type\": \"mrkdwn\",
          \"text\": \"*Agent:* \`$SESSION_NAME\`\n$MESSAGE\"
        }
      }
    ]
  }")

# Check response
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Message sent to Slack: $CHANNEL"
else
  echo "❌ Failed to send: $(echo $RESPONSE | jq -r '.error')"
  exit 1
fi
```

**`messaging_scripts/slack-webhook-server.sh`** (100 lines - for Events API alternative)
```bash
#!/bin/bash
# Start simple webhook server for Slack Events API
# Only needed if using Events API instead of Socket Mode

# Run ngrok to expose localhost
ngrok http 23000 &
NGROK_PID=$!

echo "Webhook URL: Check ngrok dashboard"
echo "Configure this URL in Slack App settings"

# Wait for Ctrl+C
trap "kill $NGROK_PID" EXIT
wait
```

**5. Claude Code Skill**

**`skills/slack-integration/SKILL.md`** (200 lines)
```markdown
---
name: Slack Integration
description: Send notifications to Slack and handle messages from Slack
allowed-tools: Bash
---

# Slack Integration

## Purpose
Send notifications and updates to Slack channels/users from AI agents.

## When to Use

**Automatically send to Slack when:**
- User says "notify me on Slack" or "send to Slack"
- Critical events occur (builds fail, deployments complete)
- User explicitly requests Slack notification
- Urgent issues need human attention

**Examples:**
- "Let me know on Slack when the tests finish"
- "If the build fails, ping me on Slack"
- "Send deployment status to #engineering"

## Commands

### Send Notification
```bash
# Send to specific user
send-to-slack.sh "@juan" "Backend deployment complete"

# Send to channel
send-to-slack.sh "#engineering" "Tests passed (247/247)"

# Send urgent notification
send-to-slack.sh "@juan" "🚨 URGENT: Production error in payment API"
```

### Examples in Context
```bash
# After completing task
yarn build
if [ $? -eq 0 ]; then
  send-to-slack.sh "@juan" "✅ Build successful (v0.6.0)"
else
  send-to-slack.sh "@juan" "❌ Build failed - check logs"
fi

# Deployment notification
git push origin main
send-to-slack.sh "#deployments" "Pushed to main - CI/CD running"

# Test results
npm test
send-to-slack.sh "@juan" "Tests: 247 passed, 0 failed"
```

## Best Practices

1. **Be selective:** Don't spam Slack with every action
2. **Use appropriate channels:** Personal DMs for user-specific, channels for teams
3. **Include context:** Agent name, action taken, next steps
4. **Emojis help:** ✅ ❌ 🚨 🎉 make notifications scannable
5. **Handle errors:** Check if Slack token is configured

## Configuration

Requires environment variable:
```bash
export AIMAESTRO_SLACK_BOT_TOKEN=xoxb-your-token
```

Check if configured:
```bash
if [ -z "$AIMAESTRO_SLACK_BOT_TOKEN" ]; then
  echo "Slack integration not configured"
fi
```
```

**6. API Endpoints**

**`app/api/slack/events/route.ts`** (for Events API alternative)
```typescript
export async function POST(req: Request) {
  const body = await req.json();

  // Slack verification challenge
  if (body.type === 'url_verification') {
    return Response.json({ challenge: body.challenge });
  }

  // Handle slash commands
  if (body.type === 'slash_command') {
    await handleSlashCommand(body);
    return Response.json({ ok: true });
  }

  // Handle events
  if (body.type === 'event_callback') {
    await handleEvent(body.event);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown event type' }, { status: 400 });
}
```

---

**Security & Authentication:**

**Best Practices:**

1. **Token Storage**
   - Store tokens in `.env.local` (gitignored)
   - NEVER commit tokens to repository
   - Use environment variables only
   - Rotate tokens periodically

2. **Bot Tokens vs User Tokens**
   - Use Bot Tokens (xoxb-) not User Tokens (xoxp-)
   - Bot tokens don't expire when user logs out
   - More stable for automation

3. **Minimal Scopes**
   - Request only necessary permissions
   - Avoid `*:write` scopes unless needed
   - Review scope list quarterly

4. **Request Verification (Events API only)**
   ```typescript
   import crypto from 'crypto';

   function verifySlackRequest(req: Request) {
     const signature = req.headers.get('x-slack-signature');
     const timestamp = req.headers.get('x-slack-request-timestamp');
     const body = await req.text();

     const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET);
     hmac.update(`v0:${timestamp}:${body}`);
     const computed = `v0=${hmac.digest('hex')}`;

     return crypto.timingSafeEqual(
       Buffer.from(signature),
       Buffer.from(computed)
     );
   }
   ```

5. **Rate Limiting**
   - Slack has tier-based rate limits
   - Implement exponential backoff for retries
   - Cache Slack API responses when possible

---

**Development Setup:**

**Step 1: Create Slack App**
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "AI Maestro", select workspace
4. Navigate to "OAuth & Permissions"
5. Add Bot Token Scopes (listed above)
6. Install app to workspace
7. Copy Bot User OAuth Token (xoxb-...)

**Step 2: Enable Socket Mode**
1. Navigate to "Socket Mode" in app settings
2. Enable Socket Mode
3. Create App-Level Token with `connections:write` scope
4. Copy token (xapp-...)

**Step 3: Create Slash Command**
1. Navigate to "Slash Commands"
2. Click "Create New Command"
3. Command: `/agent`
4. Short Description: "Communicate with AI agents"
5. Usage Hint: `message <agent-name> "<message>"`

**Step 4: Configure AI Maestro**
```bash
# Add to ~/.zshrc or ~/.bashrc
export AIMAESTRO_SLACK_BOT_TOKEN="xoxb-your-bot-token-here"
export AIMAESTRO_SLACK_APP_TOKEN="xapp-your-app-token-here"
export AIMAESTRO_SLACK_ENABLED="true"

# Reload shell
source ~/.zshrc
```

**Step 5: Install Dependencies**
```bash
cd ~/ai-maestro
yarn add @slack/web-api @slack/socket-mode
```

**Step 6: Start AI Maestro with Slack**
```bash
yarn dev
# Socket Mode client will auto-connect
# Check logs: "✅ Slack Socket Mode connected"
```

**Step 7: Test Integration**
```bash
# In Slack, type:
/agent list

# Should respond with active agents

# Send message:
/agent message backend-architect "Testing Slack integration"

# In backend-architect terminal, you'll see:
# 📨 New Slack message from juan: Testing Slack integration
```

---

**Use Cases & Examples:**

**1. Deployment Notifications**
```bash
# Agent completes deployment
git push origin main
send-to-slack.sh "#deployments" "🚀 Deployed v0.6.0 to production"
```

**2. Build Failure Alerts**
```bash
# CI/CD agent monitors builds
npm run build
if [ $? -ne 0 ]; then
  send-to-slack.sh "@juan" "🚨 Build failed on main branch"
fi
```

**3. Remote Agent Coordination**
```
User (on phone, in Slack):
/agent message backend-architect "Can you check the API logs for errors?"

Backend agent receives message in terminal:
📨 New Slack message from juan: Can you check the API logs for errors?

Agent analyzes logs, responds:
send-to-slack.sh "@juan" "Found 3 errors in last hour - all 404s from /old-api route"
```

**4. Team Notifications**
```bash
# Frontend agent completes UI
send-to-slack.sh "#frontend-team" "New login UI ready for review"
```

**5. Urgent Production Issues**
```
User (on laptop):
/agent urgent devops-engineer "Production API returning 500 errors"

Devops agent (immediately notified via tmux):
🚨 URGENT Slack message from juan: Production API returning 500 errors

Agent investigates and responds:
send-to-slack.sh "@juan" "Issue identified: DB connection pool exhausted. Restarting service."
```

---

**Implementation Phases:**

**Phase 1: Send-Only (Quick Win) - 2 days**
- [ ] Create Slack app with bot token
- [ ] Create `send-to-slack.sh` script
- [ ] Add environment variable configuration
- [ ] Create Claude Code skill for Slack notifications
- [ ] Test sending messages to channels/users
- [ ] Update `install-messaging.sh` to include Slack setup

**Phase 2: Receive via Socket Mode - 3 days**
- [ ] Install `@slack/socket-mode` and `@slack/web-api` dependencies
- [ ] Create `lib/slackClient.ts` with Socket Mode connection
- [ ] Implement `/agent` slash command handler
- [ ] Create message file from Slack command
- [ ] Send tmux notification to target agent
- [ ] Test bidirectional communication
- [ ] Add slash command help/usage info

**Phase 3: Advanced Features - 2 days**
- [ ] Agent status command (`/agent status <name>`)
- [ ] List agents command (`/agent list`)
- [ ] Message history in Slack threads
- [ ] Slack workspace join/leave events
- [ ] Rich message formatting (Slack blocks)
- [ ] Error handling and retry logic

**Phase 4: Polish & Documentation - 1 day**
- [ ] Comprehensive error messages
- [ ] Rate limiting and backoff
- [ ] Security audit (token handling)
- [ ] User documentation
- [ ] Video tutorial
- [ ] Slack App Marketplace submission (optional)

---

**Benefits:**

**For Users:**
- Communicate with agents from anywhere (mobile, meetings, coffee shop)
- Real-time notifications for critical events
- No need to keep dashboard open
- Team collaboration (Slack channels)

**For Agents:**
- Reach users instantly
- Deliver notifications reliably
- Work asynchronously (user responds when available)

**For AI Maestro:**
- Extends reach beyond localhost
- Makes agents more accessible
- Enables team collaboration
- Competitive feature (Slack is ubiquitous)

---

**Considerations:**

⚠️ **Security:** Slack tokens grant access to workspace - handle securely
⚠️ **Rate Limits:** Slack has API rate limits - implement backoff/retry
⚠️ **Dependencies:** Adds npm packages (acceptable trade-off for functionality)
⚠️ **Setup Complexity:** Requires Slack app creation (one-time setup)
⚠️ **Internet Required:** Slack integration won't work offline
⚠️ **Slack Workspace:** Requires user to have Slack workspace

**Trade-offs:**

✅ **Socket Mode** (Recommended):
- Pros: No public endpoint, works locally, real-time
- Cons: Not for Slack Marketplace distribution

✅ **Events API**:
- Pros: Standard pattern, marketplace-ready
- Cons: Requires public endpoint (ngrok for dev)

✅ **Incoming Webhooks**:
- Pros: Simplest, no server needed
- Cons: Send-only, no bidirectional

---

**Alternative: Discord Integration**

Similar pattern could be applied to Discord:
- Discord Bot with slash commands
- Gateway WebSocket (like Slack Socket Mode)
- Send notifications via Discord webhooks
- Defer to v0.7.0+ based on user demand

---

**Files to Create:**

- `lib/slackClient.ts` (300 lines) - Socket Mode client and handlers
- `messaging_scripts/send-to-slack.sh` (50 lines) - Send messages to Slack
- `messaging_scripts/slack-webhook-server.sh` (100 lines) - Events API alternative
- `skills/slack-integration/SKILL.md` (200 lines) - Claude Code skill
- `docs/SLACK-INTEGRATION-GUIDE.md` (500 lines) - Complete setup guide
- Update `install-messaging.sh` to offer Slack setup
- Update `package.json` with Slack dependencies
- Update `.env.example` with Slack configuration

---

### 4. Message Threading

**Status:** Idea
**Priority:** Medium
**Effort:** Medium

**Problem:**
Currently, messages are independent. There's no way to track conversation threads or reply chains between agents.

**Proposed Solution:**
Add reply-to relationships and thread grouping:

```json
{
  "id": "msg_002",
  "replyTo": "msg_001",
  "threadId": "thread_001"
}
```

**Benefits:**
- Conversation history
- Thread-based filtering
- "Reply to this message" functionality
- Better context for multi-message exchanges

---

### 5. Broadcast Messages

**Status:** Idea
**Priority:** Medium
**Effort:** Medium

**Problem:**
Currently one-to-one messaging only. No way to notify multiple agents simultaneously.

**Proposed Solution:**
Add group/channel support:

```bash
send-aimaestro-message.sh @all-frontend-agents "Style guide updated"
send-aimaestro-message.sh @project-team "Stand-up in 5 minutes"
```

**Benefits:**
- Team-wide announcements
- Project group coordination
- Reduced message duplication

---

### 6. Message Attachments

**Status:** Idea
**Priority:** Low
**Effort:** Medium-High

**Problem:**
Messages are text-only. Can't share code snippets, logs, or screenshots directly.

**Proposed Solution:**
Add attachment support:

```bash
send-aimaestro-message.sh frontend-dev \
  "API error details" \
  "Getting 500 errors, here's the stack trace" \
  urgent \
  notification \
  --attach ./logs/api-error.log
```

**Technical Considerations:**
- File size limits
- Storage location
- Security (what file types allowed?)
- UI for viewing attachments

---

### 7. Message Forwarding

**Status:** Planned
**Priority:** Medium
**Effort:** Small (1-2 days)
**Version:** v0.6.0

**Problem:**
Currently, when an agent receives a message that should be handled by another agent, there's no easy way to forward it. Users must manually:
1. Read the message
2. Copy the content
3. Compose a new message to the correct agent
4. Reference the original message manually

This creates friction in multi-agent workflows and breaks message context/history.

**User Request:**
"I need to forward messages between agents, like when backend-architect receives a frontend question that should go to frontend-dev."

**Proposed Solution:**
Add forward functionality to the messaging system with preserved context and message history.

---

**Architecture:**

**1. Message Schema Extension**
```typescript
// types/message.ts
export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: MessageContent;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  type: 'request' | 'response' | 'notification' | 'update';
  status: 'unread' | 'read';
  timestamp: string;
  readAt?: string;

  // NEW: Forwarding metadata
  forwardedFrom?: {
    originalMessageId: string;
    originalFrom: string;
    originalTo: string;
    originalTimestamp: string;
    forwardedBy: string;
    forwardedAt: string;
  };
  forwardChain?: string[];  // Track full forward history
}
```

**2. Forward Script**
```bash
#!/bin/bash
# messaging_scripts/forward-aimaestro-message.sh
# Usage: forward-aimaestro-message.sh <message-id> <new-recipient> "[optional note]"

MESSAGE_ID="$1"
NEW_RECIPIENT="$2"
FORWARD_NOTE="$3"
CURRENT_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "unknown")

# Find original message in inbox
INBOX_DIR="$HOME/.aimaestro/messages/inbox/$CURRENT_SESSION"
ORIGINAL_MESSAGE=$(find "$INBOX_DIR" -name "${MESSAGE_ID}.json")

if [ ! -f "$ORIGINAL_MESSAGE" ]; then
  echo "❌ Error: Message $MESSAGE_ID not found"
  exit 1
fi

# Read original message
ORIGINAL_CONTENT=$(cat "$ORIGINAL_MESSAGE")
ORIGINAL_FROM=$(echo "$ORIGINAL_CONTENT" | jq -r '.from')
ORIGINAL_SUBJECT=$(echo "$ORIGINAL_CONTENT" | jq -r '.subject')
ORIGINAL_TEXT=$(echo "$ORIGINAL_CONTENT" | jq -r '.content.text')
ORIGINAL_TIMESTAMP=$(echo "$ORIGINAL_CONTENT" | jq -r '.timestamp')

# Create forwarded message
FORWARDED_MESSAGE_ID="msg_$(date +%s)_$(uuidgen | cut -d'-' -f1)"
INBOX_PATH="$HOME/.aimaestro/messages/inbox/$NEW_RECIPIENT"
mkdir -p "$INBOX_PATH"

# Build forwarded content
FORWARDED_TEXT="--- Forwarded Message ---
From: $ORIGINAL_FROM
Original recipient: $CURRENT_SESSION
Sent: $ORIGINAL_TIMESTAMP
Subject: $ORIGINAL_SUBJECT

$ORIGINAL_TEXT
--- End of Forwarded Message ---"

if [ -n "$FORWARD_NOTE" ]; then
  FORWARDED_TEXT="$FORWARD_NOTE

$FORWARDED_TEXT"
fi

# Create new message with forward metadata
cat > "$INBOX_PATH/${FORWARDED_MESSAGE_ID}.json" <<EOF
{
  "id": "$FORWARDED_MESSAGE_ID",
  "from": "$CURRENT_SESSION",
  "to": "$NEW_RECIPIENT",
  "subject": "Fwd: $ORIGINAL_SUBJECT",
  "content": {
    "text": "$FORWARDED_TEXT",
    "format": "plain"
  },
  "priority": "normal",
  "type": "notification",
  "status": "unread",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "forwardedFrom": {
    "originalMessageId": "$MESSAGE_ID",
    "originalFrom": "$ORIGINAL_FROM",
    "originalTo": "$CURRENT_SESSION",
    "originalTimestamp": "$ORIGINAL_TIMESTAMP",
    "forwardedBy": "$CURRENT_SESSION",
    "forwardedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF

# Send tmux notification to recipient
tmux send-keys -t "$NEW_RECIPIENT" "echo '\n📬 Forwarded message from $CURRENT_SESSION: Fwd: $ORIGINAL_SUBJECT\n'" C-m 2>/dev/null || true

# Move original to sent folder (mark as forwarded)
SENT_DIR="$HOME/.aimaestro/messages/sent/$CURRENT_SESSION"
mkdir -p "$SENT_DIR"
cp "$ORIGINAL_MESSAGE" "$SENT_DIR/fwd_${MESSAGE_ID}.json"

echo "✅ Message forwarded to $NEW_RECIPIENT"
echo "📨 Message ID: $FORWARDED_MESSAGE_ID"
```

---

**3. UI Integration (MessageCenter Component)**

**Add Forward Button:**
```typescript
// components/MessageCenter.tsx
function MessageItem({ message }: { message: Message }) {
  const handleForward = async () => {
    // Show forward dialog
    const recipient = await showForwardDialog(allSessions)
    if (!recipient) return

    // Optional: add forwarding note
    const note = await showForwardNoteDialog()

    // Call forward API
    await forwardMessage(message.id, recipient, note)

    toast.success(`Message forwarded to ${recipient}`)
  }

  return (
    <div className="message-item">
      {/* ... existing message display ... */}

      <div className="message-actions">
        <button onClick={handleReply}>Reply</button>
        <button onClick={handleForward}>Forward</button>
        <button onClick={handleDelete}>Delete</button>
      </div>

      {/* Show forward indicator if message was forwarded */}
      {message.forwardedFrom && (
        <div className="forwarded-badge">
          📬 Forwarded from {message.forwardedFrom.originalFrom}
        </div>
      )}
    </div>
  )
}
```

**Forward Dialog:**
```typescript
function ForwardDialog({
  messageId,
  allSessions,
  onConfirm,
  onCancel
}: ForwardDialogProps) {
  const [selectedRecipient, setSelectedRecipient] = useState('')
  const [forwardNote, setForwardNote] = useState('')

  return (
    <Modal>
      <h3>Forward Message</h3>

      <select
        value={selectedRecipient}
        onChange={(e) => setSelectedRecipient(e.target.value)}
      >
        <option value="">Select recipient...</option>
        {allSessions.map(session => (
          <option key={session.id} value={session.id}>
            {session.name}
          </option>
        ))}
      </select>

      <textarea
        placeholder="Add a note (optional)"
        value={forwardNote}
        onChange={(e) => setForwardNote(e.target.value)}
      />

      <div className="actions">
        <button onClick={() => onConfirm(selectedRecipient, forwardNote)}>
          Forward
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  )
}
```

---

**4. API Endpoint**

```typescript
// app/api/messages/forward/route.ts
export async function POST(req: Request) {
  const { messageId, newRecipient, forwardNote } = await req.json()

  // Validate inputs
  if (!messageId || !newRecipient) {
    return Response.json(
      { error: 'messageId and newRecipient required' },
      { status: 400 }
    )
  }

  // Find original message
  const originalMessage = await findMessage(messageId)
  if (!originalMessage) {
    return Response.json(
      { error: 'Message not found' },
      { status: 404 }
    )
  }

  // Create forwarded message
  const forwardedMessage: Message = {
    id: `msg_${Date.now()}_${generateUUID()}`,
    from: originalMessage.to, // Current recipient becomes sender
    to: newRecipient,
    subject: `Fwd: ${originalMessage.subject}`,
    content: {
      text: buildForwardedContent(originalMessage, forwardNote),
      format: 'plain'
    },
    priority: originalMessage.priority,
    type: 'notification',
    status: 'unread',
    timestamp: new Date().toISOString(),
    forwardedFrom: {
      originalMessageId: originalMessage.id,
      originalFrom: originalMessage.from,
      originalTo: originalMessage.to,
      originalTimestamp: originalMessage.timestamp,
      forwardedBy: originalMessage.to,
      forwardedAt: new Date().toISOString()
    }
  }

  // Save forwarded message to recipient's inbox
  await saveMessage(forwardedMessage, 'inbox', newRecipient)

  // Copy original to sender's sent folder (mark as forwarded)
  await saveMessage(
    { ...originalMessage, status: 'forwarded' },
    'sent',
    originalMessage.to
  )

  // Send tmux notification
  await sendTmuxNotification(
    newRecipient,
    `📬 Forwarded message: ${forwardedMessage.subject}`
  )

  return Response.json({
    success: true,
    forwardedMessageId: forwardedMessage.id
  })
}

function buildForwardedContent(
  original: Message,
  note?: string
): string {
  let content = ''

  // Add forwarding note if provided
  if (note) {
    content += `${note}\n\n`
  }

  // Add forward header
  content += `--- Forwarded Message ---\n`
  content += `From: ${original.from}\n`
  content += `To: ${original.to}\n`
  content += `Sent: ${new Date(original.timestamp).toLocaleString()}\n`
  content += `Subject: ${original.subject}\n\n`
  content += `${original.content.text}\n`
  content += `--- End of Forwarded Message ---`

  return content
}
```

---

**5. Claude Code Skill Integration**

```markdown
# skills/agent-messaging/SKILL.md

## Forwarding Messages

When user says "forward this to X" or "send this to Y instead":

1. Identify the message to forward (usually most recent in context)
2. Use forward script or API
3. Optionally add context/note
4. Confirm forwarding

**Examples:**

User: "Forward that API question to backend-architect"
Claude:
```bash
# Find latest message ID
MESSAGE_ID=$(ls -t ~/.aimaestro/messages/inbox/$SESSION_NAME | head -1 | sed 's/.json//')

# Forward with note
forward-aimaestro-message.sh "$MESSAGE_ID" backend-architect "FYI - this is backend related"
```

User: "This isn't for me, send to frontend-dev"
Claude:
```bash
forward-aimaestro-message.sh msg_123456 frontend-dev "Frontend question - please handle"
```
```

---

**Use Cases:**

**1. Routing Questions to Right Expert**
```
User → General Agent: "How do I optimize database queries?"
General Agent → Backend Architect: [Forwards] "Database optimization question"
```

**2. Escalation**
```
Junior Agent → Senior Agent: [Forwards urgent issue] "Need help with production bug"
```

**3. Team Coordination**
```
Project Manager → DevOps: [Forwards deployment request]
DevOps → Backend: [Forwards] "Backend needs to prepare DB migrations first"
```

**4. Context Preservation**
```
Agent receives complex multi-part question
Forwards to specialist with full context preserved
Specialist has all original information
```

---

**Implementation Checklist:**

**Phase 1: Core Functionality**
- [ ] Extend message schema with `forwardedFrom` metadata
- [ ] Create `forward-aimaestro-message.sh` script
- [ ] Add forward validation (message exists, recipient valid)
- [ ] Test forward preserves all original context
- [ ] Add tmux notification for forwarded messages

**Phase 2: API & UI**
- [ ] Create `/api/messages/forward` POST endpoint
- [ ] Add Forward button to MessageCenter UI
- [ ] Create ForwardDialog component
- [ ] Add forwarded message indicator/badge
- [ ] Test forward flow end-to-end

**Phase 3: Polish**
- [ ] Add forward chain visualization (show full forward history)
- [ ] Keyboard shortcut for forward (e.g., 'F' key)
- [ ] Add "Forward to multiple recipients" option
- [ ] Forward confirmation toast/notification
- [ ] Update documentation

**Phase 4: Claude Integration**
- [ ] Update agent-messaging skill with forward examples
- [ ] Add natural language forward detection
- [ ] Test "forward this to X" commands
- [ ] Add auto-routing suggestions (AI detects wrong recipient)

---

**Benefits:**

**For Users:**
- Quick message routing without copy/paste
- Context preservation (full original message)
- Forward history tracking
- Reduced friction in multi-agent workflows

**For Agents:**
- Easily delegate messages to specialists
- Route questions to correct expert
- Escalate issues with full context
- Coordinate across team

**For AI Maestro:**
- More sophisticated messaging workflows
- Better agent collaboration
- Foundation for smart routing (AI-powered)
- Common email/messaging pattern

---

**Technical Considerations:**

⚠️ **Forward Chain Length:** Unlimited forwards could create very long chains
- Solution: Display "View full forward chain" collapsed by default

⚠️ **Storage:** Each forward creates a new message file
- Solution: Acceptable for file-based system, could deduplicate content later

⚠️ **Permissions:** Should any agent be able to forward to any other?
- Solution: Phase 1 allows all forwards, Phase 2+ could add restrictions

⚠️ **Notification Noise:** Forwarded messages trigger notifications
- Solution: Make forwarded notifications visually distinct (📬 vs 📨)

---

**Future Enhancements:**

- **Smart Routing:** AI suggests best agent for message based on content
- **Auto-Forward Rules:** "All API questions go to backend-architect"
- **Forward with Reply:** Forward message and automatically reply to sender
- **Bulk Forward:** Forward multiple messages at once
- **Forward Templates:** Pre-fill forward note with common patterns

---

**Files to Create/Modify:**

- `messaging_scripts/forward-aimaestro-message.sh` (150 lines)
- `app/api/messages/forward/route.ts` (100 lines)
- `components/MessageCenter.tsx` - Add forward button and dialog
- `components/ForwardDialog.tsx` (100 lines) - New component
- `types/message.ts` - Extend Message interface
- `skills/agent-messaging/SKILL.md` - Add forward examples
- `docs/MESSAGING-GUIDE.md` - Document forward feature

---

## Later (Future Considerations)

### 8. Message Scheduling

**Problem:** No way to send messages at a specific time.

**Solution:** Add scheduling support:

```bash
send-aimaestro-message.sh backend-architect \
  "Don't forget to run migrations" \
  "Reminder: run npm run db:migrate before deploying" \
  normal \
  notification \
  --schedule "2025-01-20T09:00:00"
```

**Requires:**
- Scheduled job system (cron-like)
- Message queue with delayed delivery
- Cancel/edit scheduled messages

---

### 9. Agent Status/Presence

**Problem:** Agents don't know if target is online, busy, or available.

**Solution:** Add presence system:

```typescript
enum AgentStatus {
  ONLINE = 'online',
  BUSY = 'busy',
  AWAY = 'away',
  OFFLINE = 'offline'
}

// Auto-reply support
{
  status: 'busy',
  autoReply: "I'm currently debugging production. Check back in 30 minutes."
}
```

**UI Indicators:**
- Green dot = online
- Yellow dot = away
- Red dot = busy
- Gray dot = offline

---

### 10. Message Search & Filtering

**Problem:** As message volume grows, finding specific messages becomes difficult.

**Solution:** Add full-text search and advanced filtering:

```typescript
// Search API
GET /api/messages/search?q=API&from=backend-architect&priority=urgent

// Filter options
- By sender
- By priority
- By type
- By date range
- By read/unread status
- By content (full-text search)
```

---

### 11. Message Analytics Dashboard

**Problem:** No visibility into messaging patterns, most active agents, or communication bottlenecks.

**Solution:** Analytics dashboard showing:
- Messages sent/received per agent
- Average response time
- Most active communication pairs
- Peak messaging times
- Unread message trends

**Use Case:**
Identify coordination issues, optimize agent collaboration patterns.

---

### 12. External Webhooks (Note: Partially addressed by Feature #3 - Slack Integration)

**Problem:** Can't integrate with external systems (Discord, email, etc.).

**Solution:** Add webhook support for additional platforms:

```typescript
// Trigger external notifications
messageEvents.on('message:urgent', (msg) => {
  // Send to Discord
  fetch('https://discord.com/api/webhooks/...', {
    method: 'POST',
    body: JSON.stringify({
      content: `Urgent message from ${msg.from}: ${msg.subject}`
    })
  });
});
```

**Note:** Slack integration (Feature #3) provides webhook functionality for Slack. This feature would extend it to other platforms.

---

### 13. Multi-User Support

**Problem:** AI Maestro is single-user (localhost only). Can't collaborate with other developers.

**Solution:** Add authentication and multi-user access:
- User accounts
- Session ownership
- Shared sessions (pair programming)
- Permission levels

**Major architectural change - Phase 3 feature.**

---

## Ideas Parking Lot

**Unsorted feature ideas for future consideration:**

- Voice messages (audio clips in messages)
- Message reactions (👍 👎 ✅ like Slack)
- Message editing (edit after sending)
- Message templates (pre-defined message formats)
- Message priority auto-detection (AI determines urgency)
- Cross-project messaging (agents in different projects)
- Message archiving/cleanup (auto-delete old messages)
- Export message history (CSV, JSON)
- Backup/restore messaging system

---

## Completed Features

### v0.4.2 - Complete Installation System
**Released:** 2025-01-18
- Zero-to-hero one-command installer
- Automated prerequisite detection and installation
- Messaging system installer
- Complete documentation with direct code links

### v0.4.1 - Agent Communication System
**Released:** 2025-01-15
- File-based persistent messaging
- Instant tmux notifications
- Claude Code skill integration
- Web UI (inbox/sent/compose)
- Message metadata (priority, type, status)

---

## Contributing Ideas

Have a feature idea? Add it to the "Ideas Parking Lot" section or create an issue on GitHub:
https://github.com/23blocks-OS/ai-maestro/issues

**Feature Request Template:**
- **Problem:** What problem does this solve?
- **Proposed Solution:** How would it work?
- **Benefits:** Why is this valuable?
- **Effort Estimate:** Small / Medium / Large
- **Priority:** High / Medium / Low
