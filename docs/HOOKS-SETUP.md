# AI Maestro Message Notification Hooks

This guide shows how to set up Claude Code hooks to notify about unread messages in your AI Maestro messaging system.

> **Note (v0.18.10+):** AI Maestro now uses **push notifications** to instantly alert agents when messages arrive. These hooks are **complementary** - they help agents catch up on any messages they may have missed while offline or at session startup.

## What are Hooks?

Claude Code hooks are shell commands that run automatically at specific points during your agent's lifecycle. They provide deterministic control - ensuring certain actions **always** happen rather than relying on Claude to remember to do them.

## Message Notification Hook

We'll create a hook that notifies about unread messages:
- **When**: At the start of each agent session
- **What**: Checks `~/.aimaestro/messages/inbox/[your-agent]/`
- **Result**: Notifies Claude if there are any unread messages to catch up on

## Setup Instructions

### Step 1: Create the Hook Configuration

Claude Code looks for hooks in: `~/.config/claude/config.json`

Add this configuration:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'SESSION=$(tmux display-message -p \"#S\" 2>/dev/null); if [ -n \"$SESSION\" ]; then INBOX=~/.aimaestro/messages/inbox/$SESSION; UNREAD=$(ls $INBOX/*.json 2>/dev/null | wc -l | tr -d \" \"); if [ \"$UNREAD\" -gt 0 ]; then echo \"📬 You have $UNREAD unread message(s) in your inbox at: $INBOX\" >&2; fi; fi'"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'SESSION=$(tmux display-message -p \"#S\" 2>/dev/null); if [ -n \"$SESSION\" ]; then INBOX=~/.aimaestro/messages/inbox/$SESSION; UNREAD=$(ls $INBOX/*.json 2>/dev/null | wc -l | tr -d \" \"); if [ \"$UNREAD\" -gt 0 ]; then echo \"💬 Reminder: You have $UNREAD unread message(s). Check ~/.aimaestro/messages/inbox/$SESSION/\" >&2; fi; fi'"
          }
        ]
      }
    ]
  }
}
```

### Step 2: What This Does

**SessionStart Hook:**
- Runs once when Claude Code agent starts
- Checks for unread messages
- Shows notification if any exist

**UserPromptSubmit Hook:**
- Runs every time you send a message to Claude
- Reminds Claude about unread messages
- Helps ensure Claude doesn't forget to check

### Step 3: Alternative - Simpler Hook

If you prefer a cleaner approach, create a separate script first:

```bash
# Create the check script
cat > ~/.local/bin/check-aimaestro-messages.sh << 'EOF'
#!/bin/bash
SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -n "$SESSION" ]; then
  INBOX=~/.aimaestro/messages/inbox/$SESSION
  UNREAD=$(ls $INBOX/*.json 2>/dev/null | wc -l | tr -d ' ')

  if [ "$UNREAD" -gt 0 ]; then
    echo "📬 INBOX: $UNREAD unread message(s)" >&2
    echo "Location: $INBOX" >&2
    echo "" >&2
    echo "To read messages, run:" >&2
    echo "  cat $INBOX/*.json | jq" >&2
  fi
fi
EOF

chmod +x ~/.local/bin/check-aimaestro-messages.sh
```

Then use this simpler hook configuration:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/bin/check-aimaestro-messages.sh"
          }
        ]
      }
    ]
  }
}
```

### Step 4: Enhanced Hook with Auto-Reading

For maximum automation, create a hook that automatically shows Claude the messages:

```bash
# Create enhanced check script
cat > ~/.local/bin/check-and-show-messages.sh << 'EOF'
#!/bin/bash
SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -n "$SESSION" ]; then
  INBOX=~/.aimaestro/messages/inbox/$SESSION
  MESSAGES=$(ls $INBOX/*.json 2>/dev/null)

  if [ -n "$MESSAGES" ]; then
    COUNT=$(echo "$MESSAGES" | wc -l | tr -d ' ')
    echo "📬 You have $COUNT unread message(s):" >&2
    echo "" >&2

    for msg in $MESSAGES; do
      echo "---" >&2
      cat "$msg" | jq -r '"From: \(.from)\nSubject: \(.subject)\nPriority: \(.priority)\nMessage: \(.content.message)"' >&2
      echo "" >&2
    done

    echo "Use the Messages tab in AI Maestro dashboard to read full details and reply." >&2
  fi
fi
EOF

chmod +x ~/.local/bin/check-and-show-messages.sh
```

Hook configuration:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/bin/check-and-show-messages.sh"
          }
        ]
      }
    ]
  }
}
```

## Configuration Location

Edit your Claude Code config:

```bash
# Open config file
nano ~/.config/claude/config.json

# Or use your preferred editor
code ~/.config/claude/config.json
```

If the file doesn't exist, create it with the hook configuration above.

## Testing Your Hook

1. **Restart Claude Code** to load the new hook configuration
2. **Send a test message** via the AI Maestro dashboard
3. **Start a new Claude Code instance** in that tmux session
4. **You should see** the notification about unread messages

## Hook Behavior

### SessionStart Hook
```
$ claude

📬 You have 2 unread message(s) in your inbox at: ~/.aimaestro/messages/inbox/23blocks-apps-aimaestro

Welcome to Claude Code...
```

### UserPromptSubmit Hook
```
You: "Help me implement this feature"

💬 Reminder: You have 2 unread message(s). Check ~/.aimaestro/messages/inbox/23blocks-apps-aimaestro/

Claude: I'll help with that. First, let me check for any messages...
```

## Advanced: Custom Hook Script

For ultimate control, create a comprehensive message handler:

```bash
cat > ~/.local/bin/aimaestro-message-handler.sh << 'EOF'
#!/bin/bash

SESSION=$(tmux display-message -p '#S' 2>/dev/null)
if [ -z "$SESSION" ]; then
  exit 0
fi

INBOX=~/.aimaestro/messages/inbox/$SESSION
MESSAGES=$(ls $INBOX/*.json 2>/dev/null)

if [ -z "$MESSAGES" ]; then
  exit 0
fi

COUNT=$(echo "$MESSAGES" | wc -l | tr -d ' ')
URGENT=0
HIGH=0

# Count priorities
for msg in $MESSAGES; do
  PRIORITY=$(cat "$msg" | jq -r '.priority')
  if [ "$PRIORITY" = "urgent" ]; then
    URGENT=$((URGENT + 1))
  elif [ "$PRIORITY" = "high" ]; then
    HIGH=$((HIGH + 1))
  fi
done

# Show notification
echo "📬 INBOX: $COUNT unread message(s)" >&2
if [ $URGENT -gt 0 ]; then
  echo "   🚨 $URGENT URGENT message(s)" >&2
fi
if [ $HIGH -gt 0 ]; then
  echo "   ⚠️  $HIGH HIGH priority message(s)" >&2
fi
echo "" >&2

# Show urgent messages immediately
if [ $URGENT -gt 0 ]; then
  echo "URGENT MESSAGES:" >&2
  for msg in $MESSAGES; do
    PRIORITY=$(cat "$msg" | jq -r '.priority')
    if [ "$PRIORITY" = "urgent" ]; then
      echo "---" >&2
      cat "$msg" | jq -r '"From: \(.from)\nSubject: \(.subject)\nMessage: \(.content.message)"' >&2
      echo "" >&2
    fi
  done
fi

echo "To read all messages:" >&2
echo "  cat $INBOX/*.json | jq" >&2
echo "Or use the Messages tab in AI Maestro dashboard." >&2
EOF

chmod +x ~/.local/bin/aimaestro-message-handler.sh
```

## Troubleshooting

### Hook Not Running

1. **Check config location**: `cat ~/.config/claude/config.json`
2. **Verify JSON syntax**: `jq . ~/.config/claude/config.json`
3. **Restart Claude Code** after any config changes

### Script Not Found

```bash
# Verify script exists
ls -la ~/.local/bin/check-aimaestro-messages.sh

# Verify it's executable
chmod +x ~/.local/bin/check-aimaestro-messages.sh

# Test it manually
~/.local/bin/check-aimaestro-messages.sh
```

### No Messages Showing

```bash
# Verify messages exist
ls ~/.aimaestro/messages/inbox/$(tmux display-message -p '#S')/

# Test the command manually
bash -c 'SESSION=$(tmux display-message -p "#S" 2>/dev/null); echo "Session: $SESSION"; ls ~/.aimaestro/messages/inbox/$SESSION/'
```

## Security Considerations

**Important**: Hooks run automatically with your current environment's credentials.

- ✅ These hooks only **read** messages (safe)
- ✅ They don't modify files
- ✅ They don't send data externally
- ⚠️ Always review hook scripts before adding them
- ⚠️ Be careful about running untrusted hook code

## Next Steps

Once your hook is working:

1. **Test the workflow**: Send messages between sessions and watch hooks notify you
2. **Add to CLAUDE.md**: Tell Claude to check messages when notified
3. **Automate responses**: Create hooks that help Claude respond to common message types
4. **Share configurations**: Export your hook setup for team members

## Related Documentation

- [AGENT-MESSAGING-GUIDE.md](./AGENT-MESSAGING-GUIDE.md) - Complete messaging system guide
- [Claude Code Hooks Documentation](https://docs.claude.com/en/docs/claude-code/hooks-guide) - Official hooks reference
- [EXTERNAL-SESSION-SETUP.md](../EXTERNAL-SESSION-SETUP.md) - Creating tmux sessions
