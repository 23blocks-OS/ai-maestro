# Agent Communication Guidelines

Best practices for Claude Code agents using the AI Maestro communication system.

---

## 📝 About This Guide

**Command-line examples:** This guide shows bash commands (Manual Mode) for clarity and precision.

**Using Claude Code with skills?** You can use **natural language** instead:
- Instead of: `amp-send backend "Subject" "Message"`
- Just say: "Send a message to backend with subject 'Subject' saying 'Message'"

See the [Quickstart Guide](./AGENT-COMMUNICATION-QUICKSTART.md) for details on both modes.

---

## Guiding Principles

### 1. **Check Inbox First**
Before starting any task, check for messages. Another agent may have context or requests that affect your work.

### 2. **Communicate Proactively**
Don't wait to be asked. If you need help, have updates, or discover issues, send messages immediately.

### 3. **Respond Promptly**
If you receive a `request` message, acknowledge it and respond when complete. Never leave requests hanging.

### 4. **Use the Right Channel**
File-based for details, instant for urgency. Use both when appropriate.

### 5. **Provide Context**
Every message should include enough information for the recipient to act without asking follow-ups.

---

## When to Use File-Based vs Instant Messaging

### Use File-Based Messages When:

- ✅ **Message contains details** - Code snippets, requirements, specifications
- ✅ **Recipient might need to reference later** - Implementation details, API specs
- ✅ **You want a record** - Decisions, progress updates, task completion
- ✅ **Message is structured** - Has priority, type, context fields
- ✅ **Not time-critical** - Recipient can read within next hour

**Example:**
```bash
amp-send backend-architect \
  "Implement POST /api/auth/login" \
  "Need endpoint accepting {email, password}, returning JWT token. Should validate credentials against database and return 401 on failure." \
  high \
  request
```

### Use Instant Notifications When:

- ✅ **Urgent attention needed** - Production issues, blocking problems
- ✅ **Quick FYI** - "Check your inbox", "Build finished", "Ready for review"
- ✅ **Recipient might miss file message** - They're focused on another task
- ✅ **Time-sensitive** - Needs attention in next few minutes
- ✅ **Simple alert** - No complex details needed

**Example:**
```bash
send-tmux-message.sh backend-architect "🚨 API tests failing - check inbox for details"
```

### Use BOTH When:

- ✅ **Urgent AND detailed** - Send instant alert first, then detailed message
- ✅ **Important decision** - Alert + provide full context in file
- ✅ **Blocking another agent** - Make sure they see it immediately

**Example:**
```bash
# 1. Get their attention immediately
send-tmux-message.sh frontend-dev "⚠️  Urgent: API contract changed"

# 2. Provide full details
amp-send frontend-dev \
  "BREAKING: Auth API contract changed" \
  "Changed POST /api/auth/login response format. Now returns {token, user: {id, email}} instead of just {token}. Update your frontend to handle new format." \
  urgent \
  notification
```

---

## Message Type Selection

### `request` - You need someone to do something

**Use when:**
- Asking another agent to implement something
- Requesting help with a problem
- Delegating a task
- Asking for code review

**Structure:**
- **Subject:** What you need (be specific)
- **Message:** Why you need it + any requirements
- **Priority:** How urgent (be realistic)
- **Context:** Relevant files, code, or data

**Example:**
```bash
amp-send database-specialist \
  "Add users table migration" \
  "Building user auth system. Need migration for users table with: id (UUID), email (unique), password_hash, created_at, updated_at. Should include indexes on email." \
  high \
  request
```

**Recipient responsibilities:**
1. Acknowledge receipt (optional but nice)
2. Complete the request
3. Send `response` message when done

---

### `response` - You're answering a request

**Use when:**
- Completing work requested by another agent
- Answering a question
- Providing requested information

**Structure:**
- **Subject:** Start with "Re: " + original subject
- **Message:** What you did + results
- **Priority:** Match or lower than original
- **Context:** File paths, line numbers, relevant details

**Example:**
```bash
amp-send frontend-dev \
  "Re: Add users table migration" \
  "Migration created at db/migrations/20250117_create_users.sql. Includes all requested fields plus unique constraint on email and indexes. Tested locally - ready to apply." \
  normal \
  response
```

**Best practices:**
- Always respond to `request` messages
- Include file locations and line numbers
- Mention any deviations from the request
- Indicate if partially complete

---

### `notification` - FYI, no action needed

**Use when:**
- Informing about completed work (not requested)
- Alerting about issues discovered
- Sharing relevant information
- Broadcasting status updates

**Structure:**
- **Subject:** What happened
- **Message:** Details and impact
- **Priority:** Reflects importance, not urgency
- **Context:** Additional info if relevant

**Example:**
```bash
amp-send team-orchestrator \
  "User dashboard deployed to staging" \
  "Deployed version 2.3.0 to staging environment. All tests passing. Ready for QA review." \
  normal \
  notification
```

**Best practices:**
- Don't overuse - only send if recipient needs to know
- Make subject line informative
- Include "next steps" if applicable

---

### `update` - Progress report on ongoing work

**Use when:**
- Long-running task (> 1 hour)
- Periodic status updates to orchestrator
- Encountered blockers or delays
- Milestone reached

**Structure:**
- **Subject:** Task name + progress indicator
- **Message:** What's done, what's next, any blockers
- **Priority:** normal (unless blocked)
- **Context:** Relevant metrics or details

**Example:**
```bash
amp-send project-lead \
  "User auth system: 60% complete" \
  "✅ Database schema done
✅ Registration endpoint done
🔄 Login endpoint in progress
⏳ Password reset pending

ETA: 2 hours. No blockers." \
  normal \
  update
```

**Best practices:**
- Send updates every 2-4 hours for long tasks
- Always include ETA or next steps
- Flag blockers immediately with higher priority

---

## Priority Level Guidelines

### `urgent` 🚨 - Drop everything

**Use when:**
- Production is down
- Data loss risk
- Security vulnerability discovered
- Blocking multiple agents
- User-facing critical bug

**Response time expected:** < 15 minutes

**Example:**
```bash
amp-send backend-architect \
  "🚨 Production API returning 500 errors" \
  "All /api/users/* endpoints failing since 3:45pm. Error logs show database connection timeout. ~100 users affected." \
  urgent \
  notification
```

**⚠️ Warning:** Don't cry wolf. Overusing `urgent` trains agents to ignore it.

---

### `high` ⚠️ - Address as soon as current task completes

**Use when:**
- Blocking your work (but not critical)
- Important feature needed soon
- Bug affecting functionality
- Time-sensitive request

**Response time expected:** < 1 hour

**Example:**
```bash
amp-send api-developer \
  "Need pagination for /api/users endpoint" \
  "Building user list UI. Current endpoint returns all 10k users causing browser crash. Need pagination (limit/offset) before I can continue." \
  high \
  request
```

---

### `normal` 📋 - Handle in regular workflow

**Use when:**
- Standard feature request
- Regular progress update
- Routine notification
- Non-blocking issue

**Response time expected:** Within 4 hours or end of work session

**Example:**
```bash
amp-send frontend-dev \
  "User profile component complete" \
  "Finished UserProfile.tsx with edit/save functionality. Located at components/UserProfile.tsx:1-150. Ready for review." \
  normal \
  notification
```

**This is the default.** Use `normal` when in doubt.

---

### `low` 💡 - Handle when you have free time

**Use when:**
- Nice-to-have improvements
- Documentation updates
- Refactoring suggestions
- Optional enhancements

**Response time expected:** Whenever convenient, or never

**Example:**
```bash
amp-send code-quality \
  "Consider refactoring auth utils" \
  "auth.ts has some duplicated validation logic that could be extracted into separate functions. Not urgent, but would improve maintainability." \
  low \
  notification
```

---

## Subject Line Best Practices

### ✅ Good Subject Lines

- **Specific:** "Need POST /api/users endpoint" (not "Need help")
- **Actionable:** "Review LoginForm.tsx for accessibility" (not "Question about login")
- **Complete:** "User table migration ready for review" (not "Migration done")
- **Contextualized:** "Re: API auth changes" (when replying)

### ❌ Bad Subject Lines

- ❌ "Help" - Too vague
- ❌ "Question" - What about?
- ❌ "FYI" - FYI about what?
- ❌ "Urgent!" - Says it's urgent but not what
- ❌ "Re: Re: Re: Task" - Losing original context

### Format Templates

```
# Request pattern
<Action> <specific item> [for <reason>]
Examples:
- "Implement POST /api/auth/login endpoint"
- "Review UserProfile.tsx for performance"
- "Add error handling to payment flow"

# Notification pattern
<Item> <status/outcome>
Examples:
- "User dashboard deployed to production"
- "Tests failing in auth module"
- "Database migration completed successfully"

# Update pattern
<Task name>: <progress>% complete
Examples:
- "Payment integration: 75% complete"
- "Bug fixes: 3/5 completed"
- "User auth refactor: blocked on database"

# Response pattern
Re: <original subject>
Examples:
- "Re: Need POST /api/users endpoint"
- "Re: Review needed for LoginForm"
```

---

## Context Inclusion Patterns

### Always Include:

1. **File locations** - When referring to code
   ```
   "LoginForm component at components/auth/LoginForm.tsx:45-120"
   ```

2. **Line numbers** - For specific code sections
   ```
   "See validation logic at utils/auth.ts:78-95"
   ```

3. **Error messages** - When reporting issues
   ```
   "Getting error: 'Cannot read property id of undefined' in UserProfile.tsx:67"
   ```

4. **Requirements** - When requesting work
   ```
   "Need endpoint that:
   - Accepts: {email, password}
   - Returns: {token, user}
   - Validates against database
   - Returns 401 on failure"
   ```

5. **Impact/Why** - Helps recipient prioritize
   ```
   "Blocking frontend work - can't implement login UI without this endpoint"
   ```

### Optional but Helpful:

6. **Related messages** - If part of thread
   ```
   "Following up on yesterday's discussion about auth flow"
   ```

7. **Deadline** - If time-sensitive
   ```
   "Need by EOD for demo tomorrow"
   ```

8. **Alternatives considered** - Shows you tried
   ```
   "Tried implementing client-side, but need server validation for security"
   ```

### Example with Good Context:

```bash
amp-send backend-api \
  "Add rate limiting to /api/auth endpoints" \
  "Currently no rate limiting on /api/auth/login (routes/auth.ts:45).

Observed 1000+ login attempts from single IP in last hour - likely brute force attack.

Need:
- Rate limit: 5 attempts per 15 minutes per IP
- Return 429 status code when exceeded
- Log rate limit violations

This is blocking production deploy (can't go live without this protection).

Suggested implementation: Use express-rate-limit middleware." \
  urgent \
  request
```

**Why this is good:**
- ✅ Specific file and line number
- ✅ Explains the problem (brute force attack)
- ✅ Clear requirements
- ✅ States impact (blocking production)
- ✅ Suggests solution (helpful but not prescriptive)

---

## Response Time Expectations

### As a Sender:

| Priority | Expected Response |  You Should |
|----------|-------------------|------------|
| `urgent`  | < 15 min         | Follow up with instant alert if no response after 5 min |
| `high`    | < 1 hour         | Check back after 1 hour, send reminder if needed |
| `normal`  | < 4 hours        | Give them time, assume they're working on it |
| `low`     | Whenever         | Don't expect immediate response, maybe never |

### As a Recipient:

| Priority | You Should | Maximum Time |
|----------|-----------|--------------|
| `urgent`  | Drop everything, acknowledge immediately | Start within 5 min |
| `high`    | Finish current task, then switch | Start within 30 min |
| `normal`  | Add to queue, work through normally | Start within 2 hours |
| `low`     | Add to backlog, do when free time | Anytime or never |

**Acknowledge receipt** for `urgent` and `high` priority:
```bash
amp-send sender-session \
  "Re: Urgent API issue" \
  "Acknowledged. Investigating now. Will update in 15 min." \
  urgent \
  response
```

---

## Message Cleanup Protocols

### When to Archive:

- ✅ You've read the message and taken action
- ✅ Message is resolved/completed
- ✅ Message is for reference only (keep in inbox 24h, then archive)
- ✅ Conversation thread is finished

**Via Dashboard:**
1. Open Messages tab
2. Click message
3. Click Archive icon

**Via CLI:**
```bash
# Using AMP delete command
amp-delete <message-id>

# Or manually move message files
mv ~/.agent-messaging/messages/inbox/msg-*.json \
   ~/.agent-messaging/messages/archived/
```

### When to Delete:

- ✅ Message is spam or test message
- ✅ Message is obsolete (feature cancelled, requirements changed)
- ✅ Duplicate message
- ⚠️ Generally prefer archive over delete (keeps history)

**Via Dashboard:**
1. Open Messages tab
2. Click message
3. Click Delete icon (trash can)

---

## Anti-Patterns: What NOT to Do

### ❌ Don't Spam

**Bad:**
```bash
# Sending 10 messages in 5 minutes
amp-send backend "Update 1" "Starting..."
amp-send backend "Update 2" "Still working..."
amp-send backend "Update 3" "Almost done..."
# ... 7 more messages
```

**Good:**
```bash
# Send meaningful updates at reasonable intervals
amp-send backend "User auth: started" "..." normal update
# ... work for 2 hours ...
amp-send backend "User auth: 50% complete" "..." normal update
# ... work for 2 more hours ...
amp-send backend "User auth: complete" "..." normal response
```

---

### ❌ Don't Abuse `urgent` Priority

**Bad:**
```bash
amp-send backend "Add new button to UI" "..." urgent request
# This is not urgent!
```

**Good:**
```bash
amp-send backend "Add new button to UI" "..." normal request
# Or high if it's blocking you, but never urgent
```

**Rule of thumb:** If not production down, data loss, or security issue, it's probably not `urgent`.

---

### ❌ Don't Leave Requests Hanging

**Bad:**
```bash
# Receive request message
# Work on it
# Complete it
# Never send response
```

**Good:**
```bash
# Receive request message
# Work on it
# Complete it
# Send response:
amp-send requester \
  "Re: Original request" \
  "Completed. Details..." \
  normal \
  response
```

---

### ❌ Don't Send Vague Messages

**Bad:**
```bash
amp-send backend "Problem" "Something's not working" normal notification
# What problem? Where? What's not working?
```

**Good:**
```bash
amp-send backend \
  "TypeError in LoginForm.tsx:67" \
  "Getting 'Cannot read property id of undefined' when submitting login form. Error occurs in handleSubmit function. User object appears to be undefined when calling user.id." \
  high \
  notification
```

---

### ❌ Don't Ignore Your Inbox

**Bad practice:**
- Never checking messages
- Letting urgent messages sit for hours
- Not responding to requests

**Good practice:**
- Check inbox at start of each task
- Respond to urgent/high priority immediately
- Acknowledge receipt of requests
- Set up auto-check (see [Automation](#automation-tips))

---

## Communication Patterns

### Pattern 1: Request-Response (Sequential)

**Use for:** One agent needs work from another

```
Frontend → Backend: "Need API endpoint" (request)
[Backend works on it]
Backend → Frontend: "Endpoint ready" (response)
```

Example:
```bash
# Frontend agent
amp-send backend-api \
  "Need GET /api/users endpoint" \
  "Building user list UI. Need endpoint returning array of users with {id, name, email}. Pagination optional but nice-to-have." \
  high \
  request

# Backend agent (after completing)
amp-send frontend-ui \
  "Re: GET /api/users endpoint" \
  "Endpoint ready at routes/users.ts:120. Returns {users: Array<User>, total: number, page: number}. Includes pagination (query params: ?page=1&limit=20)." \
  normal \
  response
```

---

### Pattern 2: Broadcast (Parallel)

**Use for:** One agent delegates to multiple agents

```
Orchestrator → Backend: "Implement API" (request)
Orchestrator → Frontend: "Implement UI" (request)
Orchestrator → Database: "Create schema" (request)
[All work in parallel]
Backend → Orchestrator: "API done" (response)
Frontend → Orchestrator: "UI done" (response)
Database → Orchestrator: "Schema done" (response)
```

Example:
```bash
# Orchestrator broadcasts
amp-send backend-api "Implement user CRUD API" "..." high request
amp-send frontend-ui "Build user management UI" "..." high request
amp-send database-migrations "Create users table" "..." high request
```

---

### Pattern 3: Progress Updates (Long-Running)

**Use for:** Tasks taking > 1 hour

```
Agent → Requester: "Task started" (update)
[30 minutes later]
Agent → Requester: "50% complete" (update)
[30 minutes later]
Agent → Requester: "Task complete" (response)
```

Example:
```bash
# Start
amp-send project-lead "Payment integration: started" "..." normal update

# Middle
amp-send project-lead "Payment integration: 50% complete" "Stripe API integrated. Working on webhook handling. ETA: 1 hour." normal update

# Complete
amp-send project-lead "Payment integration: complete" "All done. Stripe integration at lib/stripe.ts. Webhook handling at api/webhooks/stripe.ts." normal response
```

---

### Pattern 4: Emergency Alert (Urgent)

**Use for:** Production issues, critical bugs

```
Agent discovers issue
Agent → Team: Instant notification "🚨 Check inbox!"
Agent → Team: Detailed message with `urgent` priority
```

Example:
```bash
# Step 1: Get attention immediately
send-tmux-message.sh team-lead "🚨 Production API down - check inbox NOW!"
send-tmux-message.sh backend-oncall "🚨 Production API down - check inbox NOW!"

# Step 2: Provide details
amp-send team-lead \
  "🚨 Production: All API endpoints returning 500" \
  "Started at 14:30 PST. All /api/* endpoints failing. Server logs show: 'Connection pool exhausted'. ~500 users affected. Need immediate attention." \
  urgent \
  notification

amp-send backend-oncall \
  "🚨 Production: Database connection pool exhausted" \
  "All API requests failing with 'Connection pool exhausted'. Check api/database.ts:12 - maxConnections may be too low. Current: 10, should be 50+." \
  urgent \
  request
```

---

## Automation Tips

### Auto-check on Session Start

Add to `~/.zshrc`:

```bash
# Check messages when entering tmux session
if [ -n "$TMUX" ]; then
  amp-inbox
fi
```

### Periodic Check with Claude Code Hooks

Add to `.claude/hooks/before-response.sh`:

```bash
#!/bin/bash
# Check for new messages before each Claude response
amp-inbox --unread
```

### Notification on New Message

Create `~/.local/bin/watch-inbox.sh`:

```bash
#!/bin/bash
INBOX=~/.agent-messaging/messages/inbox

# Watch for new files
fswatch -0 "$INBOX" | while read -d "" event; do
  if [[ "$event" == *".json" ]]; then
    SESSION=$(tmux display-message -p '#S')
    send-tmux-message.sh "$SESSION" "📬 New message received!" display
  fi
done
```

Run in background:
```bash
~/.local/bin/watch-inbox.sh &
```

---

## Summary: Quick Decision Guide

| Situation | Priority | Type | Channel |
|-----------|----------|------|---------|
| Need work from another agent | high | request | File-based |
| Answering a request | normal | response | File-based |
| Production is down | urgent | notification | BOTH (instant + file) |
| Progress update (long task) | normal | update | File-based |
| FYI about completed work | normal | notification | File-based |
| Quick alert "check your inbox" | - | - | Instant only |
| Blocking another agent | high | request | BOTH |
| Optional improvement | low | notification | File-based |

---

## Related Documentation

- **[Quickstart Guide](./AGENT-COMMUNICATION-QUICKSTART.md)** - Get started in 5 minutes
- **[Messaging Guide](./AGENT-MESSAGING-GUIDE.md)** - Comprehensive reference
- **[Architecture](./AGENT-COMMUNICATION-ARCHITECTURE.md)** - Technical deep-dive
