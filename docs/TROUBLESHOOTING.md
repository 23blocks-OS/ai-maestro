# AI Maestro - Troubleshooting Guide

This guide addresses common issues when using AI Maestro with Claude Code and other AI agents.

---

## Scrollback Issues with Claude Code

### Problem: Can't Scroll Back When Using Claude Code

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

## Agent Discovery Issues

### Problem: Agents Don't Appear in Dashboard

**Symptom**: You created a tmux session but it doesn't show up in AI Maestro.

**Solutions**:

1. **Wait for auto-refresh** (dashboard refreshes every 10 seconds)

2. **Manually refresh** the browser page

3. **Check tmux session exists**:
   ```bash
   tmux list-sessions
   ```

4. **Verify agent name format**:
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

## SSH and Git Issues

### Problem: "Permission denied (publickey)" in tmux Sessions

**Symptom**: Git operations fail with:
```
git@gitlab.com: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**Why This Happens**:

The SSH agent socket path (`SSH_AUTH_SOCK`) changes between system restarts. tmux sessions (especially those started at boot via LaunchAgent) don't automatically get the updated socket path, leaving them unable to access your SSH keys.

**Permanent Solution: Configure Stable SSH Symlink**

This is the recommended setup for all AI Maestro users who use git/SSH.

**Step 1: Add to `~/.tmux.conf`**
```bash
# SSH Agent Configuration - AI Maestro
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock
```

**Step 2: Add to `~/.zshrc` (or `~/.bashrc`)**
```bash
# SSH Agent for tmux - AI Maestro
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
```

**Step 3: Apply immediately**
```bash
# Create symlink
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock

# Reload tmux config
tmux source-file ~/.tmux.conf

# Reload shell
source ~/.zshrc
```

**Quick Fix for Existing Sessions**:

If you need SSH to work RIGHT NOW in your current session:

```bash
# Option 1: Restart the shell (picks up new config)
exec $SHELL

# Option 2: Export manually (temporary until shell restarts)
export SSH_AUTH_SOCK=~/.ssh/ssh_auth_sock
```

**Verify It's Working**:

```bash
# Should show your SSH keys
ssh-add -l

# Should authenticate successfully
ssh -T git@github.com
# or
ssh -T git@gitlab.com

# Now git should work
git push
```

**Troubleshooting SSH Setup**:

1. **Check symlink exists**:
   ```bash
   ls -la ~/.ssh/ssh_auth_sock
   # Should show symlink to /private/tmp/com.apple.launchd.*/Listeners
   ```

2. **Check tmux is using it**:
   ```bash
   tmux show-environment | grep SSH_AUTH_SOCK
   # Should show: SSH_AUTH_SOCK=/Users/you/.ssh/ssh_auth_sock
   ```

3. **Check SSH agent is running**:
   ```bash
   ssh-add -l
   # Should list keys, not "Could not open a connection"
   ```

4. **If still not working, recreate everything**:
   ```bash
   # Remove old symlink
   rm ~/.ssh/ssh_auth_sock

   # Create fresh symlink
   ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock

   # Reload tmux
   tmux source-file ~/.tmux.conf

   # Restart your shell in the session
   exec $SHELL
   ```

**Why This Works**:

- SSH agent creates socket at changing path: `/private/tmp/com.apple.launchd.XXXXX/Listeners`
- Your shell maintains stable symlink: `~/.ssh/ssh_auth_sock` → current socket
- tmux uses the stable path: `~/.ssh/ssh_auth_sock`
- Result: SSH works in all sessions, even after restart

For complete details, see [OPERATIONS-GUIDE.md - Section 8: SSH Configuration](./OPERATIONS-GUIDE.md#8-ssh-configuration-for-git-operations).

---

## PATH Issues in tmux Sessions

### Problem: "command not found" for Scripts in ~/.local/bin

**Symptom**: Scripts installed in `~/.local/bin/` (like `send-aimaestro-message.sh`, `check-and-show-messages.sh`) are not found in tmux sessions, even though they work in regular terminal windows.

```bash
# In tmux session:
send-aimaestro-message.sh
# Returns: command not found: send-aimaestro-message.sh

# But this works:
which send-aimaestro-message.sh
# Returns nothing or "not found"

# Must use full path:
/Users/username/.local/bin/send-aimaestro-message.sh
# Works!
```

**Why This Happens**:

tmux captures its environment when the **tmux server starts**, not when you create sessions. The tmux server uses a **non-interactive shell** to capture environment variables, and non-interactive shells have different initialization behavior:

**Shell Initialization Order:**
1. `.zshenv` - Runs for **ALL** shells (interactive, non-interactive, login, etc.)
2. `.zprofile` - Login shells only
3. `.zshrc` - **Interactive shells only** ← tmux server doesn't run this!
4. `.zlogin` - Login shells only

**The Problem:**
- Your PATH is set in `.zshrc` (line ~173)
- tmux server spawns **non-interactive** shell to capture environment
- Non-interactive shells **skip** `.zshrc` completely
- tmux server captures PATH **without** `~/.local/bin`
- All new tmux sessions inherit this incomplete PATH

**Permanent Solution: Use `.zshenv` for PATH**

This is the **correct** solution for tmux-compatible PATH configuration.

**Step 1: Create `~/.zshenv`**

```bash
# Create or edit ~/.zshenv
cat > ~/.zshenv << 'EOF'
# ============================================
# PATH Configuration - AI Maestro
# ============================================
# This file is read by ALL zsh shells (including tmux's environment capture)
# Put PATH exports here so tmux sessions have correct PATH

# Add custom bin directory for AI Maestro scripts
export PATH="$HOME/.local/bin:$PATH"
EOF
```

**Step 2: Verify `.zshenv` is created**

```bash
cat ~/.zshenv
# Should show the PATH export
```

**Step 3: Create new tmux sessions to test**

```bash
# Create a test session
tmux new-session -d -s path-test

# Check if script is found
tmux send-keys -t path-test 'which send-aimaestro-message.sh' Enter
sleep 0.5
tmux capture-pane -t path-test -p

# Should show: /Users/username/.local/bin/send-aimaestro-message.sh
```

**Step 4: Clean up test session**

```bash
tmux kill-session -t path-test
```

**For Existing Sessions**:

Existing tmux sessions already have the old PATH frozen. You need to either:

**Option 1: Restart the shell in each session**
```bash
# Inside the tmux session:
exec $SHELL
```

**Option 2: Export PATH manually (temporary)**
```bash
# Inside the tmux session:
export PATH="$HOME/.local/bin:$PATH"
```

**Option 3: Recreate the sessions**
- Exit and kill the old sessions
- Create new sessions (they'll have the correct PATH)

**Why .zshenv Works**:

- `.zshenv` is the **only** shell initialization file that runs for ALL shell invocations
- tmux server's non-interactive shell **does** read `.zshenv`
- PATH set in `.zshenv` is captured by tmux and inherited by all sessions
- Works across system restarts and tmux server restarts

**Verification**:

After creating `.zshenv`, verify it works in new tmux sessions:

```bash
# Create new tmux session
tmux new-session -s test

# Inside the session:
echo $PATH
# Should contain: /Users/username/.local/bin

which send-aimaestro-message.sh
# Should output: /Users/username/.local/bin/send-aimaestro-message.sh

# Test the script
send-aimaestro-message.sh
# Should show usage/help, not "command not found"
```

---

### Related Problem: "Device not configured" or "forkpty" Errors

**Symptom**: When trying to create new tmux sessions or terminal windows, you get:

```
[forkpty: Device not configured]
[Could not create a new process and open a pseudo-tty.]
```

Or:

```
create window failed: fork failed: Device not configured
```

**Why This Happens**:

You've exhausted the system's **pseudo-terminal (PTY) limit**. Every terminal window, tmux pane, SSH connection, and interactive shell needs a PTY. macOS has a default limit of **511 PTYs**.

**Check Current PTY Usage**:

```bash
# Check the limit
sysctl kern.tty.ptmx_max
# Default: 511

# Count allocated PTYs
ls /dev/ttys* 2>/dev/null | wc -l
# If this is >= the limit, you're out of PTYs
```

**Check What's Using PTYs**:

```bash
# See which applications are using PTYs
lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn

# Common culprits:
# - zsh (orphaned shell processes)
# - Terminal.app (many windows/tabs open)
# - tmux (many sessions/panes)
# - VS Code / IDEs with integrated terminals
# - SSH connections
```

**Solution 1: Increase PTY Limit** (Recommended)

```bash
# Increase to 640 (safe value that macOS accepts)
sudo sysctl -w kern.tty.ptmx_max=640

# Or try higher (may fail on some macOS versions):
sudo sysctl -w kern.tty.ptmx_max=1024
```

**Note**: If you get "Invalid argument" error, the value is too high. Try smaller increments (640, 768, 896, etc.).

**Make Limit Permanent**:

```bash
# Create or edit /etc/sysctl.conf (requires sudo)
echo "kern.tty.ptmx_max=640" | sudo tee -a /etc/sysctl.conf
```

**Solution 2: Clean Up Orphaned Processes**

If you can't or don't want to increase the limit, close unused terminals:

```bash
# Find orphaned zsh shells
ps -eo pid,ppid,comm | awk '$3 == "zsh" {print $1, $2}' | wc -l

# Close Terminal windows/tabs you're not using
# Close IDE integrated terminals you're not using
# Kill old tmux sessions:
tmux list-sessions
tmux kill-session -t <unused-session>
```

**Solution 3: Force Quit and Restart** (Last Resort)

If terminal is completely broken:

1. **Force Quit Terminal**: Cmd + Option + Esc → Select Terminal → Force Quit
2. **Try Alternative Terminal**:
   - Use VS Code's integrated terminal (Ctrl + `)
   - Install and use iTerm2
   - Use Script Editor to run: `do shell script "pkill -9 tmux" with administrator privileges`
3. **Restart Mac** - Guaranteed to fix PTY exhaustion

**Prevention**:

- Don't leave hundreds of terminal tabs open
- Close old tmux sessions you're not using
- Use `tmux attach` instead of creating new sessions
- Set a higher PTY limit proactively (640-1024)
- Monitor PTY usage: `ls /dev/ttys* | wc -l`

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

3. **Close unused agents**:
   ```bash
   tmux kill-session -t <unused-agent>
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

# SSH Agent Configuration (CRITICAL for git operations)
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock

# Optional: Easier prefix key
# unbind C-b
# set -g prefix C-a
```

### Recommended ~/.zshenv for AI Maestro (CRITICAL for tmux)

**This file is required for scripts to work in tmux sessions:**

```bash
# ============================================
# PATH Configuration - AI Maestro
# ============================================
# This file is read by ALL zsh shells (including tmux's environment capture)
# Put PATH exports here so tmux sessions have correct PATH

# Add custom bin directory for AI Maestro scripts
export PATH="$HOME/.local/bin:$PATH"
```

### Recommended ~/.zshrc additions for AI Maestro

```bash
# SSH Agent for tmux - AI Maestro Configuration
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
```

Apply changes:
```bash
# Create .zshenv if it doesn't exist (CRITICAL for tmux PATH)
cat > ~/.zshenv << 'EOF'
# PATH Configuration - AI Maestro
export PATH="$HOME/.local/bin:$PATH"
EOF

# Reload tmux config
tmux source-file ~/.tmux.conf

# Reload shell config
source ~/.zshrc

# Create initial SSH symlink
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
```

---

## Windows (WSL2) Specific Issues

### Issue: Can't Access http://localhost:23000 from Windows Browser

**Symptoms**:
- AI Maestro is running in WSL2
- Terminal shows "Ready on http://0.0.0.0:23000"
- Windows browser can't connect to localhost:23000

**Causes & Solutions**:

**1. Windows Firewall Blocking WSL2**

```powershell
# In PowerShell as Administrator
New-NetFirewallRule -DisplayName "WSL2 AI Maestro" -Direction Inbound -LocalPort 23000 -Protocol TCP -Action Allow
```

**2. Try Using WSL2 IP Directly**

```bash
# In WSL2 terminal, get your IP
ip addr show eth0 | grep inet | awk '{print $2}' | cut -d/ -f1
# Example output: 172.20.10.5

# Then in Windows browser, use:
http://172.20.10.5:23000
```

**3. Ensure AI Maestro Binds to 0.0.0.0**

Check `server.mjs` line 11:
```javascript
const hostname = process.env.HOSTNAME || '0.0.0.0'
```

If you've set `HOSTNAME=localhost` in `.env.local`, change it to `0.0.0.0` for Windows access.

---

### Issue: WSL2 IP Address Changes After Restart

**Symptoms**:
- After restarting Windows, the WSL2 IP changes
- Saved bookmarks/URLs stop working

**Solution**:

**Option 1: Always Use localhost (Recommended)**
```
http://localhost:23000
```
This works automatically with WSL2's port forwarding.

**Option 2: Use Tailscale for Stable IPs**

See the main README's [Mobile Access section](../README.md#-access-from-mobile-devices) for Tailscale setup.

**Option 3: Create a Helper Script**

```bash
# In WSL2: ~/get-maestro-url.sh
#!/bin/bash
IP=$(ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
echo "AI Maestro: http://$IP:23000"
```

---

### Issue: tmux Sessions Lost After Restarting Windows

**Symptoms**:
- All tmux sessions disappear after Windows restart
- AI Maestro shows no agents

**Cause**: WSL2 VM completely shuts down when Windows restarts. tmux sessions don't persist across VM restarts.

**This is expected behavior** - tmux sessions are in-memory only.

**Solutions**:

**1. Keep WSL2 Running** (Prevents shutdown)
```powershell
# In PowerShell, keep WSL2 alive
wsl --exec tail -f /dev/null
```

**2. Use pm2 to Auto-Restart AI Maestro**
```bash
# In WSL2
npm install -g pm2
cd ~/ai-maestro
pm2 start yarn --name "ai-maestro" -- dev
pm2 save
pm2 startup
```

**3. Accept the Workflow**: Create agents as needed after restart. Use meaningful agent names with hyphens for organization.

---

### Issue: Git SSH Keys Don't Work in tmux Sessions

**Symptoms**:
```
Permission denied (publickey)
git@github.com: Permission denied (publickey)
```

**Solution**: Configure SSH agent for tmux (already in Windows Installation Guide)

```bash
# Add to ~/.tmux.conf
cat << 'EOF' >> ~/.tmux.conf

# SSH Agent Configuration - AI Maestro
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock
EOF

# Add to ~/.bashrc (or ~/.zshrc)
cat << 'EOF' >> ~/.bashrc

# SSH Agent for tmux - AI Maestro
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
EOF

# Apply
source ~/.bashrc
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
tmux source-file ~/.tmux.conf

# Test
ssh -T git@github.com
```

---

### Issue: Slow File System Performance

**Symptoms**:
- `yarn install` takes forever
- AI Maestro is sluggish
- tmux sessions lag

**Cause**: Working on Windows drives (`/mnt/c/`) instead of WSL2's native file system.

**Solution**: Always work in WSL2's home directory

```bash
# ❌ SLOW - Cross-boundary access
cd /mnt/c/Users/YourName/projects/ai-maestro

# ✅ FAST - Native WSL2 file system
cd ~/ai-maestro
```

**Move your project:**
```bash
# Copy from Windows to WSL2
cp -r /mnt/c/Users/YourName/projects/ai-maestro ~/ai-maestro

# Or clone fresh in WSL2
cd ~
git clone https://github.com/23blocks-OS/ai-maestro.git
```

**Performance difference**: 5-10x faster on native WSL2 file system!

---

### Issue: High Memory Usage from WSL2

**Symptoms**:
- WSL2 consuming 4-8GB of RAM
- Windows slows down

**Solution**: Limit WSL2 memory usage

Create `C:\Users\YourUsername\.wslconfig`:

```ini
[wsl2]
memory=4GB           # Limit to 4GB (adjust based on your RAM)
processors=2         # Limit CPU cores
swap=2GB
localhostForwarding=true
```

Restart WSL2:
```powershell
wsl --shutdown
wsl
```

---

### Issue: "wsl --install" Command Not Found

**Symptoms**:
```
'wsl' is not recognized as an internal or external command
```

**Cause**: Running an older version of Windows 10.

**Solution**:

**1. Update Windows**
- Settings > Update & Security > Windows Update
- Install all available updates
- Requires Windows 10 version 2004 (Build 19041) or later

**2. Manual Installation**

Follow Microsoft's guide:
[https://docs.microsoft.com/en-us/windows/wsl/install-manual](https://docs.microsoft.com/en-us/windows/wsl/install-manual)

---

### Issue: WSL2 Running as WSL1

**Symptoms**:
```bash
wsl --list --verbose
# Shows VERSION 1 instead of 2
```

**Solution**:

```powershell
# In PowerShell as Administrator
wsl --set-default-version 2
wsl --set-version Ubuntu 2

# Verify
wsl --list --verbose
# Should show VERSION 2
```

---

### Issue: Port 23000 Already in Use in WSL2

**Symptoms**:
```
Error: listen EADDRINUSE: address already in use :::23000
```

**Solution**:

```bash
# Find what's using port 23000
lsof -i :23000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3000 yarn dev
```

---

### Issue: Can't Copy/Paste Between Windows and WSL2

**Symptoms**:
- Can't paste into WSL2 terminal
- Can't copy from WSL2 terminal

**Solution**:

**Use Windows Terminal** (not cmd.exe or PowerShell):

```powershell
# Install Windows Terminal
winget install Microsoft.WindowsTerminal
```

Windows Terminal has native WSL2 clipboard integration:
- **Copy**: Select text (auto-copies)
- **Paste**: Right-click or Ctrl+Shift+V

**Command-line clipboard access**:

```bash
# Copy from WSL2 to Windows clipboard
echo "Hello" | clip.exe

# Paste from Windows clipboard to WSL2
powershell.exe Get-Clipboard
```

---

### Issue: VS Code Can't Connect to WSL2

**Symptoms**:
- "Could not establish connection to WSL"
- "WSL connection timed out"

**Solution**:

**1. Install WSL Extension**
- Open VS Code on Windows
- Install "Remote - WSL" extension by Microsoft

**2. Connect from VS Code**
```
Ctrl+Shift+P > "WSL: Connect to WSL"
```

**3. Or Open from WSL2 Terminal**
```bash
cd ~/ai-maestro
code .
```

---

### Issue: Windows Defender Scanning Slows WSL2

**Symptoms**:
- File operations are slow
- CPU spikes during `yarn install`
- High disk usage from "Antimalware Service Executable"

**Solution**: Exclude WSL2 from Windows Defender scanning

**⚠️ Warning**: Only do this if you trust all code in your WSL2 environment.

**Steps**:

1. Open Windows Security
2. Virus & threat protection > Manage settings
3. Exclusions > Add an exclusion
4. Add folder: `%USERPROFILE%\AppData\Local\Packages\CanonicalGroupLimited.Ubuntu_*\LocalState\ext4.vhdx`

**Alternate approach** (exclude specific directory):
```bash
# In WSL2
pwd
# Copy the path

# In Windows, add exclusion for:
\\wsl$\Ubuntu\home\your-username\ai-maestro
```

---

### Issue: WSL2 Network Issues After VPN Connect

**Symptoms**:
- Can't access internet from WSL2 after connecting to VPN
- DNS resolution fails

**Solution**:

**1. Restart WSL2 Networking**
```powershell
# In PowerShell as Administrator
wsl --shutdown
wsl
```

**2. Fix DNS Resolution**
```bash
# In WSL2, create /etc/wsl.conf
sudo tee /etc/wsl.conf > /dev/null <<EOF
[network]
generateResolvConf = false
EOF

# Set custom DNS
sudo rm /etc/resolv.conf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf > /dev/null
echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf > /dev/null

# Restart WSL2
wsl --shutdown
wsl
```

---

## More Help for Windows Users

See the comprehensive [Windows Installation Guide](./WINDOWS-INSTALLATION.md) for:
- Complete WSL2 setup instructions
- Performance optimization tips
- File system best practices
- SSH configuration
- Auto-start configuration
- And much more

---

## Still Having Issues?

Open an issue with:
- Description of the problem
- Steps to reproduce
- Error messages (server and browser console)
- Your environment:
  - **macOS**: macOS version, Node.js version, tmux version
  - **Windows**: Windows version, WSL version (`wsl --list --verbose`), Node.js version, tmux version
  - **Linux**: Distribution, Node.js version, tmux version

[Report Issue on GitHub](https://github.com/23blocks-OS/ai-maestro/issues)
