# Agent-to-Agent Messaging System + Terminal Improvements (v0.2.0 → v0.2.3)

## Overview
This PR introduces a complete agent-to-agent messaging system and fixes critical terminal rendering and scrollback issues. The changes span from v0.2.0 (messaging system) through v0.2.3 (terminal perfection).

---

## 🎯 Major Features

### 1. Agent-to-Agent Messaging System (v0.2.0)
**New capability for Claude Code agents to communicate across tmux sessions**

#### Architecture
- **File-based message queue**: Messages stored in `~/.aimaestro/messages/` for persistence and simplicity
- **REST API**: Full CRUD operations for messages via Next.js API routes
- **Real-time updates**: Polling-based unread message tracking with visual badges
- **Session-aware**: Messages can be sent to specific sessions or broadcast to all

#### UI Components
- **MessageCenter**: Inbox view with compose modal, message list, and unread filtering
- **Tab Navigation**: Switch between Terminal and Messages views per session
- **Unread Badges**: Red notification badges in sidebar showing message count
- **Dark Theme**: Consistent styling matching the AI Maestro dashboard design

#### Technical Implementation
```typescript
// Message structure
interface Message {
  id: string           // Unique UUID
  from: string         // Sender session name
  to: string           // Recipient session name
  content: string      // Message body
  timestamp: number    // Unix timestamp
  read: boolean        // Read status
}
```

#### API Endpoints
- `GET /api/messages?session=<name>` - Fetch messages for a session
- `POST /api/messages` - Send new message
- `GET /api/messages/unread-count?session=<name>` - Get unread count
- `PATCH /api/messages/[id]` - Mark message as read
- `DELETE /api/messages/[id]` - Delete message

---

## 🐛 Critical Bug Fixes

### 2. Terminal Scrollback Buffer (v0.2.1 - v0.2.3)
**Fixed the most critical issue: History wasn't being added to scrollback**

#### Root Cause
tmux's `-e` flag included escape sequences with cursor positioning commands. When xterm.js received these, it interpreted them as "move cursor to position X,Y" instead of "add line to buffer", causing the cursor to reposition within the current viewport rather than adding lines to scrollback.

#### Solution (v0.2.3)
```javascript
// server.mjs - Removed -e flag from tmux capture
tmux capture-pane -t ${sessionName} -p -S -50000 -J  // No -e flag!

// Format with proper line endings
const lines = historyContent.split('\n')
const formattedHistory = lines.map(line => line + '\r\n').join('')
```

**Why \r\n?** Terminal line endings require both:
- `\r` (carriage return): Move cursor to start of line
- `\n` (line feed): Move cursor down AND add to scrollback buffer

Plain `\n` only moves the cursor down without creating scrollback history.

#### Performance Improvements (v0.2.3)
- Removed `STABILIZATION_PERIOD` (1500ms delay) - no longer needed with pre-calculated dimensions
- Reduced ResizeObserver debounce from 150ms → 50ms
- Removed conflicting container overflow scroll

---

### 3. Terminal Rendering Fixes (v0.2.2)

#### Text Selection Layer
**Problem**: First selection after page load showed yellow highlighting instead of proper selection colors.

**Solution**: Call `terminal.refresh(0, terminal.rows - 1)` after history loads to force complete re-render of all xterm.js layers (selection, scrollbar, canvas).

#### Content Formatting
**Problem**: Extra spaces appeared on every line due to tmux adding artificial wrapping.

**Solution**: Added `-J` flag to `tmux capture-pane` to join wrapped lines, removing tmux's internal width-based wrapping.

#### Scrollbar Updates
**Problem**: Scrollbar position/size didn't update when scrolling through history.

**Solution**: `terminal.refresh()` forces scrollbar layer to recalculate based on buffer state.

#### Session-Switching Race Conditions
**Problem**: Fast session switching caused terminal operations on wrong session.

**Solution**: Added session-specific initialization tracking:
```typescript
const currentSessionRef = useRef<string | null>(null)

// Verify session hasn't changed after async init
if (currentSessionRef.current !== session.id) {
  cleanup() // Discard stale terminal
  return
}
```

---

### 4. Line Ending Issues (v0.2.1)

#### Claude Code Status Updates
**Problem**: Status updates like "✳ Thinking..." created new lines instead of overwriting.

**Solution**: Set `convertEol: false` in terminal config. PTY and tmux handle line endings correctly - xterm.js shouldn't convert them.

```typescript
new Terminal({
  convertEol: false,  // CRITICAL for PTY connections
  // ...
})
```

#### Why This Matters
Claude Code uses carriage returns (`\r`) to overwrite status lines. With `convertEol: true`, xterm.js converts `\n` to `\r\n`, but the PTY has already handled this, causing character duplication.

---

### 5. Scroll-to-Bottom Timing (latest)

#### Problem
After loading large history buffers (458KB+, 11,590 lines), the terminal prompt wasn't visible - user had to resize browser to trigger scroll.

#### Root Cause
xterm.js processes `terminal.write()` asynchronously. When `scrollToBottom()` was called immediately, the buffer wasn't fully populated yet, so xterm.js didn't know where "bottom" was.

#### Solution
```typescript
setTimeout(() => {
  term.refresh(0, term.rows - 1)
  term.scrollToBottom()
}, 100)
```

The 100ms delay allows xterm.js to finish processing large history writes before attempting to scroll.

---

## 📊 Technical Improvements

### Diagnostic Logging
Added comprehensive logging to track terminal data flow:
- `📨 [WS-MESSAGE]` - Every WebSocket message with byte count
- `✍️ [TERMINAL-WRITE]` - Data being written to terminal
- `📊 [BEFORE-WRITE]` / `📊 [AFTER-WRITE]` - Buffer length tracking
- `📜 [HISTORY-SEND]` - Server-side history line count
- `📊 [HISTORY-COMPLETE]` - Client-side buffer state after scroll

This logging was instrumental in identifying the scrollback buffer issue.

### Pre-Calculated Terminal Dimensions
Calculate exact cols/rows BEFORE xterm.js initializes to eliminate race conditions:
```typescript
function calculateTerminalDimensions(width, height, fontSize, fontFamily) {
  // Measure character dimensions in offscreen element
  const measureElement = document.createElement('div')
  // ... measure actual character width/height ...

  // Calculate cols/rows that fit exactly
  const cols = Math.floor(usableWidth / cellWidth)
  const rows = Math.floor(usableHeight / cellHeight)

  return { cols, rows }
}
```

This prevents layout oscillations (795→694→686→771→795 cols) that were causing dimension mismatches.

---

## 🎨 UI/UX Improvements

### Tab Navigation
Clean tab switching between Terminal and Messages with visual active state:
```tsx
<button className={`${activeTab === 'terminal'
  ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
  : 'text-gray-400 hover:text-gray-300'
}`}>
  <Terminal className="w-4 h-4" />
  Terminal
</button>
```

### Message Composition
Modal dialog with:
- Session selector (dropdown of all available sessions)
- Message textarea with character count
- Send and Cancel actions
- Keyboard shortcuts (Esc to close)

### Unread Message Badges
Red circular badges showing unread count in sidebar:
```tsx
{unreadCount > 0 && (
  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
    {unreadCount > 9 ? '9+' : unreadCount}
  </span>
)}
```

---

## 🔧 Configuration Changes

### Terminal Settings
```typescript
{
  scrollback: 50000,           // Large scrollback buffer
  convertEol: false,           // Let PTY handle line endings
  windowsMode: false,          // We're on Unix/macOS
  macOptionIsMeta: true,       // Proper Mac keyboard handling
  rightClickSelectsWord: true, // Better text selection
}
```

### Server Settings
```javascript
// tmux capture without escape sequences
tmux capture-pane -t ${sessionName} -p -S -50000 -J

// Format with proper terminal line endings
lines.map(line => line + '\r\n').join('')
```

---

## 📈 Version History

### v0.2.3 (latest)
- ✅ Fixed scrollback buffer not populating
- ✅ Removed unnecessary timing delays
- ✅ Added diagnostic logging
- ✅ Performance improvements

### v0.2.2
- ✅ Fixed text selection layer
- ✅ Fixed content formatting (extra spaces)
- ✅ Fixed scrollbar updates
- ✅ Fixed session-switching race conditions

### v0.2.1
- ✅ Fixed terminal scrollback loading
- ✅ Fixed text selection interference
- ✅ Fixed Claude Code status updates
- ✅ Fixed layout issues

### v0.2.0
- ✅ Agent-to-agent messaging system
- ✅ MessageCenter UI
- ✅ Tab navigation
- ✅ Unread message badges

---

## 🧪 Testing

### Terminal Scrollback
1. Load session with large history (11,590+ lines)
2. Verify buffer length grows from terminal height (e.g., 25) to full history size
3. Verify Shift+PageUp/Down scrolls through history
4. Verify text selection works across multiple pages

### Messages
1. Send message from one session to another
2. Verify unread badge appears in recipient's sidebar
3. Open Messages tab and verify message appears in inbox
4. Mark as read and verify badge disappears
5. Reply to message and verify round-trip communication

### Performance
1. Switch between sessions rapidly
2. Verify no race conditions or stale terminals
3. Resize browser window
4. Verify terminal dimensions update within 50ms
5. Type in terminal and verify no input lag

---

## 🚀 Breaking Changes

None. All changes are backward compatible. Existing sessions continue to work without modification.

---

## 📝 Notes

### Why File-Based Messages?
- **Simplicity**: No database setup required
- **Persistence**: Messages survive server restarts
- **Portability**: Easy to backup, migrate, or inspect
- **Performance**: Fast reads/writes for small message volumes

### Why Not WebSocket for Messages?
Current polling approach (refresh every 5s) is sufficient for:
- Low message frequency (agents don't chat constantly)
- Small message payloads (< 1KB typically)
- Simple architecture (no WebSocket management complexity)

Can migrate to WebSocket later if real-time updates become critical.

### Known Limitations
- Message history not paginated (loads all messages)
- No message search or filtering beyond unread/read
- No message threading or conversations
- No file attachments or rich media

These can be addressed in future iterations based on user needs.

---

## 🎓 Lessons Learned

### Terminal Escape Sequences Matter
The `-e` flag seemed harmless ("just colors and formatting"), but it included cursor positioning that broke scrollback. Always test with and without escape sequences.

### Async Operations Need Time
xterm.js processes writes asynchronously. Immediate operations after `write()` may see stale state. Use timeouts or callbacks to ensure data is processed.

### Pre-Calculate Everything
Calculating terminal dimensions BEFORE xterm.js initializes eliminates race conditions and oscillations. Measure twice, render once.

### requestAnimationFrame ≠ Data Processing Time
RAF only waits for next browser paint frame (~16ms). Large data processing (458KB) needs more time (~100ms). Use setTimeout for data-heavy operations.

---

## 🙏 Credits

**Concept by**: Juan Peláez (@jkpelaez) @ 23blocks
**Implementation**: Claude (Anthropic) via Claude Code
**Version**: 0.2.3
**Date**: January 2025
