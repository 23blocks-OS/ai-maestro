# Unread Messages Feature - Implementation Plan

## Problem Statement

**Current Behavior:**
When agents check their messages, they retrieve ALL messages every time, including messages they've already read. This creates:
1. **Noise**: Agents see the same messages repeatedly
2. **Inefficiency**: Agents waste time processing old messages
3. **Confusion**: Hard to distinguish new messages from old ones

**Desired Behavior:**
1. Agents should only see **unread messages** when checking inbox
2. Messages should be automatically marked as **read** after the agent retrieves them
3. Agents should have explicit control over when a message is marked as read

---

## Current Architecture Analysis

### ✅ What Already Works

1. **Message Status Field**: Messages already have a `status` field with values: `unread`, `read`, `archived`
2. **Mark as Read API**: API endpoint exists: `PATCH /api/messages?agent=X&id=Y&action=read`
3. **Status Filtering**: `listInboxMessages()` already supports filtering by status:
   ```typescript
   listInboxMessages(sessionName, { status: 'unread' })
   ```

### ❌ What's Missing

1. **No CLI tool for checking unread messages only**
   - Agents use `ls ~/.aimaestro/messages/inbox/...` which shows ALL message files
   - No convenient way to filter for unread messages from command line

2. **No auto-mark-as-read mechanism**
   - When an agent retrieves a message, it stays `unread` forever
   - Agent must manually call PATCH endpoint to mark as read

3. **No script to retrieve message content**
   - Agents must manually `cat` JSON files
   - No tool to fetch AND mark as read in one operation

---

## Proposed Solution

### Part 1: New CLI Script - `check-aimaestro-messages.sh`

Create a script that:
1. Lists **only unread messages** for the current session
2. Displays messages in a readable format
3. **Optionally** marks messages as read after displaying them

**Usage:**
```bash
# List unread messages (does NOT mark as read)
check-aimaestro-messages.sh

# List unread messages and mark them as read
check-aimaestro-messages.sh --mark-read

# Get a specific message by ID and mark it as read
check-aimaestro-messages.sh --id msg-123 --mark-read
```

**Output Format:**
```
📬 You have 3 unread messages

[1] From: backend-architect | Priority: high | 2025-01-29 13:45
    Subject: API endpoint ready
    Preview: The POST /api/auth/login endpoint is now...

[2] From: frontend-dev | Priority: normal | 2025-01-29 14:20
    Subject: Need help with styling
    Preview: Can you review the CSS for the navigation...

[3] From: orchestrator | Priority: urgent | 2025-01-29 14:50
    Subject: Breaking change in Auth API
    Preview: URGENT: The authentication API has been...
```

### Part 2: New CLI Script - `read-aimaestro-message.sh`

Create a script that:
1. Retrieves a specific message by ID
2. Displays the full message content
3. **Automatically** marks the message as read

**Usage:**
```bash
# Read message by ID (automatically marks as read)
read-aimaestro-message.sh msg-123

# Read message WITHOUT marking as read (for peeking)
read-aimaestro-message.sh msg-123 --no-mark-read
```

**Output Format:**
```
═══════════════════════════════════════════════════
📧 Message: API endpoint ready
═══════════════════════════════════════════════════

From:     backend-architect
To:       frontend-dev
Date:     2025-01-29 13:45:00
Priority: high
Type:     response

─────────────────────────────────────────────────

The POST /api/auth/login endpoint is now deployed and ready for integration.

Details:
- Endpoint: POST http://localhost:3000/api/auth/login
- Accepts: { email: string, password: string }
- Returns: { token: string, user: { id, email, name } }
- Error codes: 401 (invalid credentials), 400 (validation error)

Let me know if you need any changes!

─────────────────────────────────────────────────
Context:
{
  "endpoint": "/api/auth/login",
  "methods": ["POST"],
  "authentication": "none"
}

✅ Message marked as read
```

---

## Implementation Details

### Script 1: check-aimaestro-messages.sh

**Location**: `~/.local/bin/check-aimaestro-messages.sh`

**Logic:**
1. Get current tmux session name
2. Call API: `GET /api/messages?agent=X&status=unread&box=inbox`
3. Display formatted list with IDs, sender, priority, timestamp, subject, preview
4. If `--mark-read` flag:
   - For each message: `PATCH /api/messages?agent=X&id=Y&action=read`
   - Show confirmation

**Key Features:**
- Only shows unread messages (solves the noise problem)
- Optional mark-as-read (gives agent control)
- Shows priority indicators (🔴 urgent, 🟠 high, 🔵 normal, ⚪ low)
- Compact format for quick scanning

### Script 2: read-aimaestro-message.sh

**Location**: `~/.local/bin/read-aimaestro-message.sh`

**Logic:**
1. Get current tmux session name
2. Call API: `GET /api/messages?agent=X&id=Y&box=inbox`
3. Display full message with formatting
4. Unless `--no-mark-read` flag:
   - Call: `PATCH /api/messages?agent=X&id=Y&action=read`
   - Show confirmation

**Key Features:**
- Full message display (not just preview)
- Auto mark-as-read by default (solves the "messages stay unread forever" problem)
- Optional peek mode with `--no-mark-read`
- Shows context, attachments, forwarding info if present

---

## Agent Workflow Examples

### Example 1: Check for new messages at task start

**Agent:** "Check my messages"

**Claude Code (with skills):**
```bash
check-aimaestro-messages.sh
```

**Output:**
```
📬 You have 2 unread messages

[1] msg-167... | From: backend-architect | Priority: high
    Subject: API changes
    Preview: Breaking changes in the authentication API...

[2] msg-167... | From: orchestrator | Priority: normal
    Subject: Task assignment
    Preview: Please implement the user profile page...
```

**Agent:** "Read the first message"

**Claude Code:**
```bash
read-aimaestro-message.sh msg-167...
```

**Output:**
```
[Full message displayed]
✅ Message marked as read
```

### Example 2: Agent workflow with auto-mark-read

**CLAUDE.md instruction for agents:**
```markdown
## Message Checking Protocol

At the start of each task:
1. Run: `check-aimaestro-messages.sh --mark-read`
2. Review all unread messages
3. Prioritize urgent/high priority messages
4. Messages are automatically marked as read after checking
```

### Example 3: Peek without marking as read

**Agent:** "Show me my messages but don't mark them as read yet"

**Claude Code:**
```bash
check-aimaestro-messages.sh  # Lists unread without marking
```

**Agent:** "Now read the urgent one"

**Claude Code:**
```bash
read-aimaestro-message.sh msg-123  # Reads and marks as read
```

---

## Edge Cases & Considerations

### 1. **What if agent crashes mid-read?**
- **Solution**: Messages are only marked as read AFTER successful API call
- If script crashes before marking as read, message stays unread
- Agent will see it again on next check

### 2. **What if multiple agents read same message?**
- **Not applicable**: Messages are per-recipient
- Each agent has their own inbox with their own copies

### 3. **What about replied/archived messages?**
- **Replied**: Still marked as read (separate from reply status)
- **Archived**: Moved to archived folder, no longer in inbox

### 4. **Can agents un-read a message?**
- **Not implemented**: No use case identified yet
- Could add `--mark-unread` flag if needed

### 5. **Should dashboard UI auto-mark as read?**
- **No**: Dashboard viewing doesn't auto-mark as read
- User must explicitly click "Mark as Read" or Archive button
- Prevents accidental marking when just browsing

---

## Migration Path

### Phase 1: Add CLI Scripts (Non-Breaking)
- Add `check-aimaestro-messages.sh`
- Add `read-aimaestro-message.sh`
- Update `AGENT-MESSAGING-GUIDE.md` with new scripts
- Old methods still work (backward compatible)

### Phase 2: Update Documentation
- Add examples to guide showing unread-only workflow
- Add CLAUDE.md template for agents to check messages
- Show comparison: old way vs new way

### Phase 3: Optional - Make unread-only the default
- Could change `ls` examples to recommend new scripts
- Document old method as "manual mode" for debugging

---

## Benefits

### For Agents:
✅ **Less noise**: Only see new messages
✅ **Clear state**: Know what's been handled vs what needs attention
✅ **Automatic cleanup**: Messages marked as read without manual effort
✅ **Flexibility**: Can still peek without marking as read

### For Developers:
✅ **Better UX**: Agents focus on new information
✅ **Scalability**: Inbox doesn't grow indefinitely with "read" messages
✅ **Debugging**: Can distinguish between "checked" and "not checked"

### For System:
✅ **Backward compatible**: Old methods still work
✅ **Progressive enhancement**: Opt-in to new behavior
✅ **Simple implementation**: Uses existing API endpoints

---

## Testing Plan

1. **Script 1 - check-aimaestro-messages.sh**
   - [ ] Shows only unread messages
   - [ ] Formats output correctly
   - [ ] `--mark-read` marks all messages as read
   - [ ] Works when no unread messages
   - [ ] Handles API errors gracefully

2. **Script 2 - read-aimaestro-message.sh**
   - [ ] Retrieves and displays full message
   - [ ] Marks message as read by default
   - [ ] `--no-mark-read` prevents marking
   - [ ] Shows context/attachments if present
   - [ ] Handles invalid message ID

3. **Integration Testing**
   - [ ] Agent workflow: check → read → verify marked as read
   - [ ] Check count decreases after marking as read
   - [ ] Dashboard UI shows correct unread count
   - [ ] Multiple sequential checks show only new messages

---

Generated: 2025-10-29
Purpose: Implementation plan for unread messages filtering and auto-mark-as-read
