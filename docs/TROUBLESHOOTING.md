# AI Maestro - Troubleshooting Guide

This guide addresses common issues when using AI Maestro with Claude Code and other AI agents.

---

## Scrollback Issues with Claude Code

### Problem: Can't Scroll Back During Claude Code Sessions

**Symptom**: When Claude Code is running, you can only scroll back 1-2 pages, then you see shell history instead of Claude's responses.

**Why This Happens**:

Claude Code (like vim, less, and other full-screen applications) runs in tmux's **alternate screen buffer**. This is a separate screen that:
- Doesn't mix with your normal shell history
- Doesn't have traditional scrollback accessible from the terminal emulator
- Is designed for full-screen interactive applications

When you try to scroll, you're seeing the **normal buffer** (your shell history before Claude started), not the **alternate buffer** (Claude's output).

This is NOT a bug - it's how tmux and alternate screen buffers work by design.

**Solution 1: Enable Mouse Mode in tmux** (Recommended)

Run our setup script:
```bash
./scripts/setup-tmux.sh
```

Or manually add to `~/.tmux.conf`:
```bash
# Enable mouse support for scrolling
set -g mouse on

# Increase history to 50,000 lines
set -g history-limit 50000
```

Then reload tmux:
```bash
tmux source-file ~/.tmux.conf
```

**With mouse mode enabled**, you can scroll with:
- Mouse wheel (works directly)
- Trackpad scrolling
- Shift + mouse wheel (in some terminals)

**Solution 2: Use tmux Copy Mode** (Keyboard)

1. Press `Ctrl-b [` to enter copy mode
2. Use arrow keys or Page Up/Down to scroll
3. Press `q` to exit copy mode

**Solution 3: Use Keyboard Shortcuts in xterm.js**

These work in the browser terminal:
- `Shift + PageUp/PageDown` - Scroll by page
- `Shift + Arrow Up/Down` - Scroll 5 lines
- `Shift + Home/End` - Jump to top/bottom

Note: These scroll the xterm.js buffer, not tmux's alternate screen. They're most useful BEFORE Claude Code enters alternate screen mode.

---

### Problem: "Thinking..." Animation Creates Multiple Lines

**Symptom**: Every time Claude Code updates its "thinking" status, it creates a new line instead of updating the same line.

**Why This Happens**:

Claude Code sends carriage return (`\r`) to update the same line. If you're seeing multiple lines, it means either:
1. tmux mouse mode is interfering with terminal output
2. Terminal is in the wrong mode
3. There's an issue with control character handling

**Solutions**:

**Option 1: Restart the tmux session**
```bash
# Detach from current session: Ctrl-b d
# Kill the session
tmux kill-session -t <session-name>

# Recreate it
tmux new-session -s <session-name>
claude
```

**Option 2: Check tmux terminal type**

Ensure tmux is using the correct terminal type:
```bash
# Inside tmux, check:
echo $TERM
# Should show: screen-256color or tmux-256color
```

If it's wrong, add to `~/.tmux.conf`:
```bash
set -g default-terminal "screen-256color"
```

**Option 3: Verify xterm.js configuration**

The dashboard should have `convertEol: false` in `hooks/useTerminal.ts`. This was fixed in recent updates. Restart the dev server:
```bash
yarn dev
```

---

## Session Discovery Issues

### Problem: Sessions Don't Appear in Dashboard

**Symptom**: You created a tmux session but it doesn't show up in AI Maestro.

**Solutions**:

1. **Wait for auto-refresh** (dashboard refreshes every 10 seconds)

2. **Manually refresh** the browser page

3. **Check tmux session exists**:
   ```bash
   tmux list-sessions
   ```

4. **Verify session name format**:
   - Must be alphanumeric with hyphens/underscores only
   - Examples: `project-backend`, `my_agent`, `test123`
   - Invalid: `project backend` (spaces not allowed)

---

## Connection Issues

### Problem: "WebSocket Connection Error"

**Solutions**:

1. **Check the server is running**:
   ```bash
   # Should see: > Ready on http://...
   yarn dev
   ```

2. **Check the port is not blocked**:
   ```bash
   curl http://localhost:23000
   # Should return HTML, not "connection refused"
   ```

3. **Try a different port**:
   ```bash
   PORT=3000 yarn dev
   ```

4. **Check firewall settings** (macOS):
   ```bash
   # System Preferences > Security & Privacy > Firewall
   # Allow incoming connections for Node
   ```

---

## Performance Issues

### Problem: Slow Terminal Rendering

**Solutions**:

1. **Check WebGL is enabled**:
   - Open browser console (F12)
   - Look for WebGL errors
   - If WebGL fails, xterm.js falls back to canvas (slower)

2. **Reduce scrollback buffer**:
   In `hooks/useTerminal.ts`, you can reduce `scrollback: 50000` to `10000`

3. **Close unused sessions**:
   ```bash
   tmux kill-session -t <unused-session>
   ```

4. **Check CPU usage**:
   ```bash
   top
   # Look for high CPU from node or tmux
   ```

---

## Security Issues

### Problem: Can't Access from Local Network

If you're running with `HOSTNAME=localhost` but want network access:

1. **Change to network mode**:
   ```bash
   # In .env.local:
   HOSTNAME=0.0.0.0
   ```

2. **Restart the server**:
   ```bash
   yarn dev
   ```

3. **Find your IP**:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

4. **Access from other device**:
   ```
   http://192.168.1.100:23000  # Use your actual IP
   ```

⚠️ **Warning**: This allows anyone on your network to access your terminals. Only use on trusted networks.

---

## Known Limitations

### 1. Alternate Screen Scrollback

- When Claude Code (or vim, less, etc.) is active, traditional scrollback doesn't work
- This is a tmux design limitation, not an AI Maestro bug
- Solution: Use tmux mouse mode or copy mode (see above)

### 2. Terminal Size Synchronization

- Terminal size is synced when you connect, not when you resize windows
- If terminal looks wrong, refresh the browser page

### 3. No Session History Persistence

- When you close the dashboard, terminal history is lost
- tmux sessions continue running (preserving state)
- Reconnecting shows current state, not full history

### 4. Mouse Selection in Alternative Screen

- Text selection with mouse may not work in all terminals
- Use tmux copy mode for reliable text selection

---

## Debug Mode

To see raw WebSocket messages:

1. Open browser console (F12)
2. Go to Network tab
3. Filter by WS (WebSocket)
4. Click on the connection
5. View Messages tab

This shows raw terminal output including control codes.

---

## Getting Help

If none of these solutions work:

1. **Check the logs**:
   ```bash
   # Server logs in the terminal where you ran `yarn dev`
   ```

2. **Check browser console**:
   - F12 → Console tab
   - Look for errors

3. **Test with a simple session**:
   ```bash
   # Create a minimal test case
   tmux new-session -s test
   echo "Hello World"
   # Try to access from dashboard
   ```

4. **Report the issue**:
   - Include error messages
   - Include browser and OS versions
   - Include steps to reproduce

---

## Quick Reference: tmux Scrolling Commands

| Action | Command |
|--------|---------|
| Enter copy mode | `Ctrl-b [` |
| Exit copy mode | `q` |
| Scroll up | `Arrow Up` or `PageUp` |
| Scroll down | `Arrow Down` or `PageDown` |
| Search forward | `/` then type search term |
| Search backward | `?` then type search term |
| Start selection | `Space` |
| Copy selection | `Enter` |
| Paste | `Ctrl-b ]` |

---

## Configuration Quick Fixes

### Recommended ~/.tmux.conf for AI Maestro

```bash
# Mouse support (CRITICAL for scrolling in Claude Code)
set -g mouse on

# Large scrollback buffer
set -g history-limit 50000

# Better colors
set -g default-terminal "screen-256color"

# Optional: Easier prefix key
# unbind C-b
# set -g prefix C-a
```

Apply changes:
```bash
tmux source-file ~/.tmux.conf
```

---

## Still Having Issues?

Open an issue with:
- Description of the problem
- Steps to reproduce
- Error messages (server and browser console)
- Your environment: macOS version, Node.js version, tmux version

[Report Issue on GitHub](https://github.com/23blocks-OS/ai-maestro/issues)
