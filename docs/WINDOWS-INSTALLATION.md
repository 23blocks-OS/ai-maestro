# Windows Installation Guide

AI Maestro runs on Windows through **WSL2 (Windows Subsystem for Linux)**, Microsoft's official solution for running Linux tools on Windows. This gives you the full power of tmux and Linux shell commands while still using your Windows browser and applications.

## Why WSL2?

AI Maestro is built on `tmux`, a powerful terminal multiplexer that has no native Windows equivalent. Rather than building a limited Windows port, we leverage WSL2 to give you the complete, battle-tested Linux experience - the same one macOS and Linux users enjoy.

**Benefits of WSL2:**
- Full tmux support with all features
- Native Linux shell environment (bash, zsh)
- Seamless integration with Windows (access Windows files, use Windows browser)
- Used by millions of developers worldwide
- Microsoft's official recommendation for Linux development on Windows
- No dual-boot or virtual machine needed

---

## Prerequisites

- **Windows 10 version 2004+** (Build 19041+) or **Windows 11**
- **Administrator access** (for WSL2 installation)
- **8GB+ RAM recommended** (4GB minimum)
- **5GB free disk space** for WSL2 + AI Maestro

---

## Installation Steps

### Step 1: Install WSL2

**Option A: Automatic Installation (Recommended - Windows 11 or Windows 10 2004+)**

Open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

This single command:
- Enables WSL and Virtual Machine Platform
- Downloads and installs Ubuntu (default distribution)
- Sets WSL2 as the default version
- Configures everything automatically

**After installation completes:**
1. **Restart your computer** (required)
2. Ubuntu will launch automatically on first boot
3. Create a username and password when prompted (this is your Linux user - remember it!)

**Option B: Manual Installation (if automatic fails)**

If `wsl --install` doesn't work, follow Microsoft's detailed guide:
[https://docs.microsoft.com/en-us/windows/wsl/install-manual](https://docs.microsoft.com/en-us/windows/wsl/install-manual)

---

### Step 2: Verify WSL2 Installation

Open **PowerShell** (no admin needed) and run:

```powershell
wsl --list --verbose
```

**Expected output:**
```
  NAME                   STATE           VERSION
* Ubuntu                 Running         2
```

The `VERSION` column must show `2`. If it shows `1`, upgrade to WSL2:

```powershell
wsl --set-version Ubuntu 2
```

---

### Step 3: Update Ubuntu and Install Prerequisites

Launch Ubuntu from the Start Menu (or type `wsl` in PowerShell). Run these commands:

```bash
# Update package list
sudo apt update

# Install required packages
sudo apt install -y curl git tmux build-essential

# Verify tmux installation
tmux -V
# Should show: tmux 3.x or higher
```

---

### Step 4: Install Node.js and Yarn

**Using nvm (Node Version Manager - Recommended):**

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Load nvm (or restart your terminal)
source ~/.bashrc

# Install Node.js 20 (LTS)
nvm install 20
nvm use 20

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install Yarn globally
npm install -g yarn

# Verify Yarn
yarn --version  # Should show 1.22.x
```

---

### Step 5: Install AI Maestro

**Option A: Automatic Installation (Easiest)**

```bash
# Run the official installer
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh
```

**Unattended installation** (skips all prompts):
```bash
curl -fsSL https://raw.githubusercontent.com/23blocks-OS/ai-maestro/main/scripts/remote-install.sh | sh -s -- -y --auto-start
```

The installer will:
- Detect WSL2 environment
- Clone the repository
- Install dependencies
- Configure tmux
- Set up SSH agent (for git operations)

**Option B: Manual Installation**

```bash
# Clone the repository
cd ~
git clone https://github.com/23blocks-OS/ai-maestro.git
cd ai-maestro

# Install dependencies
yarn install

# Configure tmux for optimal scrolling
./scripts/setup-tmux.sh

# Configure SSH agent (CRITICAL for git operations)
cat << 'EOF' >> ~/.tmux.conf

# SSH Agent Configuration - AI Maestro
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock
EOF

cat << 'EOF' >> ~/.bashrc

# SSH Agent for tmux - AI Maestro
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
EOF

# Apply SSH configuration
source ~/.bashrc
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock 2>/dev/null
tmux source-file ~/.tmux.conf 2>/dev/null || true
```

---

### Step 6: Start AI Maestro

```bash
cd ~/ai-maestro
yarn dev
```

**Expected output:**
```
> Ready on http://0.0.0.0:23000
```

---

### Step 7: Access from Windows Browser

AI Maestro is now running in WSL2, but you can access it from your **Windows browser**:

**Open your browser (Chrome, Edge, Firefox) and navigate to:**

```
http://localhost:23000
```

**That's it!** You should see the AI Maestro dashboard.

---

## Understanding WSL2 File System

WSL2 has its own Linux file system, separate from your Windows files. Here's how they interact:

### Accessing Windows Files from WSL2

Your Windows drives are mounted at `/mnt/`:

```bash
# Access C:\ drive
cd /mnt/c/Users/YourUsername/Documents

# Access D:\ drive
cd /mnt/d/
```

**Example: Clone a repo from Windows Documents folder:**
```bash
cd /mnt/c/Users/YourUsername/Documents
git clone https://github.com/your/project.git
cd project
tmux new-session -s myproject-dev
```

### Accessing WSL2 Files from Windows

Open Windows File Explorer and type in the address bar:

```
\\wsl$\Ubuntu\home\your-linux-username
```

Or navigate to: **Network > \\wsl$\Ubuntu**

**Example paths:**
- AI Maestro code: `\\wsl$\Ubuntu\home\your-username\ai-maestro`
- Session logs: `\\wsl$\Ubuntu\home\your-username\ai-maestro\logs`

**Pro tip:** Pin this location to Quick Access in File Explorer for easy access.

---

## Network Access Configuration

By default, AI Maestro binds to `0.0.0.0:23000`, making it accessible:
- ✅ From Windows: `http://localhost:23000`
- ✅ From other devices on your network: `http://YOUR-PC-IP:23000`

### Localhost-Only Mode (More Secure)

If you want to restrict access to only your Windows machine:

```bash
# Create .env.local in the ai-maestro directory
cd ~/ai-maestro
cat << 'EOF' > .env.local
HOSTNAME=localhost
PORT=23000
EOF

# Restart AI Maestro
yarn dev
```

---

## Auto-Start Configuration (Optional)

To have AI Maestro start automatically when you open WSL2:

### Option 1: Add to ~/.bashrc

```bash
echo '
# Auto-start AI Maestro dashboard (optional)
if ! pgrep -f "node.*server.mjs" > /dev/null; then
    cd ~/ai-maestro && yarn dev &
    echo "AI Maestro started at http://localhost:23000"
fi
' >> ~/.bashrc
```

### Option 2: Use pm2 (Process Manager)

```bash
# Install pm2
npm install -g pm2

# Start AI Maestro with pm2
cd ~/ai-maestro
pm2 start yarn --name "ai-maestro" -- dev

# Save pm2 configuration
pm2 save

# Set pm2 to start on WSL2 launch
pm2 startup
# Follow the instructions shown

# View status
pm2 status
pm2 logs ai-maestro
```

**pm2 commands:**
```bash
pm2 stop ai-maestro      # Stop the dashboard
pm2 restart ai-maestro   # Restart the dashboard
pm2 logs ai-maestro      # View logs
pm2 delete ai-maestro    # Remove from pm2
```

---

## Common WSL2 Issues and Solutions

### Issue 1: "wsl --install" command not found

**Cause:** You're running an older version of Windows 10.

**Solution:**
1. Update Windows to version 2004 or later (Settings > Update & Security > Windows Update)
2. Use the manual installation method: [Microsoft's WSL Manual Install Guide](https://docs.microsoft.com/en-us/windows/wsl/install-manual)

---

### Issue 2: WSL2 is running as WSL1

**Symptoms:**
```bash
wsl --list --verbose
# Shows VERSION 1 instead of 2
```

**Solution:**
```powershell
# In PowerShell as Administrator
wsl --set-default-version 2
wsl --set-version Ubuntu 2
```

---

### Issue 3: Port 23000 already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::23000
```

**Solution:**

```bash
# Check what's using port 23000
lsof -i :23000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3000 yarn dev
```

---

### Issue 4: Can't access localhost:23000 from Windows browser

**Cause:** Windows firewall blocking WSL2 network access.

**Solution:**

**Option A: Allow through Windows Firewall**
1. Open Windows Security > Firewall & network protection
2. Click "Allow an app through firewall"
3. Add Node.js to allowed apps for Private networks

**Option B: Temporarily disable firewall (testing only)**
1. Windows Security > Firewall & network protection
2. Turn off for Private network (re-enable after testing)

**Option C: Use explicit IP**
```bash
# In WSL2, get your WSL2 IP
ip addr show eth0 | grep inet | awk '{print $2}' | cut -d/ -f1

# Use that IP in Windows browser
http://172.x.x.x:23000
```

---

### Issue 5: tmux sessions not persisting after WSL2 restart

**Cause:** WSL2 shuts down when no processes are running.

**Solution:**

```bash
# Option 1: Use tmux detach instead of exiting WSL2
# In tmux: Ctrl+B then D (detach)
# Sessions persist as long as WSL2 is running

# Option 2: Keep WSL2 running
# In PowerShell, this keeps WSL2 alive:
wsl --exec tail -f /dev/null
```

**Note:** tmux sessions are NOT persistent across WSL2 VM restarts. This is expected behavior.

---

### Issue 6: Git SSH keys not working in tmux sessions

**Symptoms:**
```
Permission denied (publickey)
git@github.com: Permission denied (publickey)
```

**Cause:** SSH agent not configured for tmux.

**Solution:**

Already included in Step 5, but verify:

```bash
# Check if SSH agent configuration exists
grep -A2 "SSH_AUTH_SOCK" ~/.tmux.conf
grep -A5 "SSH_AUTH_SOCK" ~/.bashrc

# If missing, add it
cat << 'EOF' >> ~/.tmux.conf

# SSH Agent Configuration - AI Maestro
set-option -g update-environment "DISPLAY SSH_ASKPASS SSH_AGENT_PID SSH_CONNECTION WINDOWID XAUTHORITY"
set-environment -g 'SSH_AUTH_SOCK' ~/.ssh/ssh_auth_sock
EOF

cat << 'EOF' >> ~/.bashrc

# SSH Agent for tmux - AI Maestro
if [ -S "$SSH_AUTH_SOCK" ] && [ ! -h "$SSH_AUTH_SOCK" ]; then
    mkdir -p ~/.ssh
    ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
fi
EOF

# Apply configuration
source ~/.bashrc
mkdir -p ~/.ssh && ln -sf "$SSH_AUTH_SOCK" ~/.ssh/ssh_auth_sock
tmux source-file ~/.tmux.conf

# Test SSH key
ssh -T git@github.com
```

---

### Issue 7: High memory usage

**Symptoms:** WSL2 consuming too much RAM.

**Solution:**

Create `.wslconfig` in your Windows user directory (`C:\Users\YourUsername\.wslconfig`):

```ini
[wsl2]
memory=4GB
processors=2
swap=2GB
```

Restart WSL2:
```powershell
wsl --shutdown
wsl
```

---

### Issue 8: Slow file system performance

**Cause:** Working with files on Windows drives (`/mnt/c/`) instead of WSL2's native file system.

**Solution:**

**Always work in WSL2's native file system for best performance:**

```bash
# ❌ SLOW - Working on Windows drive
cd /mnt/c/Users/YourName/Documents/my-project

# ✅ FAST - Working in WSL2 home directory
cd ~/my-project
```

**Move project to WSL2:**
```bash
# Copy from Windows to WSL2
cp -r /mnt/c/Users/YourName/Documents/my-project ~/my-project

# Or clone fresh in WSL2
cd ~
git clone https://github.com/your/project.git
```

---

### Issue 9: WSL2 IP changes after restart

**Symptoms:** Mobile access URL stops working after restarting Windows.

**Cause:** WSL2 gets a new IP address on each restart.

**Solution:**

**Option 1: Always use localhost (recommended for local access)**
```
http://localhost:23000
```

**Option 2: Get current IP dynamically**
```bash
# In WSL2, run this to get current IP
ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}'

# Or create a helper script
cat << 'EOF' > ~/ai-maestro/get-ip.sh
#!/bin/bash
IP=$(ip addr show eth0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}')
echo "Access AI Maestro at: http://$IP:23000"
EOF
chmod +x ~/ai-maestro/get-ip.sh

# Run it
~/ai-maestro/get-ip.sh
```

**Option 3: Use Tailscale for stable remote access**

See the main README's [Mobile Access section](../README.md#-access-from-mobile-devices) for Tailscale setup.

---

## Performance Tips

### 1. Use WSL2's Native File System

Always work in `~/` instead of `/mnt/c/`:

```bash
# ❌ Slow - Cross-boundary access
cd /mnt/c/Users/YourName/projects

# ✅ Fast - Native WSL2
cd ~/projects
```

### 2. Increase WSL2 Resources

Edit `C:\Users\YourUsername\.wslconfig`:

```ini
[wsl2]
memory=8GB           # Increase for large projects
processors=4         # Match your CPU cores
swap=4GB
localhostForwarding=true
```

### 3. Disable Windows Defender Scanning for WSL2

Windows Defender scanning WSL2 files can slow things down:

1. Open Windows Security
2. Virus & threat protection > Manage settings
3. Exclusions > Add an exclusion
4. Add folder: `%USERPROFILE%\AppData\Local\Packages\CanonicalGroupLimited.Ubuntu_*\LocalState\ext4.vhdx`

**Warning:** Only do this if you trust all code in your WSL2 environment.

---

## Uninstalling

### Remove AI Maestro

```bash
# In WSL2
cd ~
rm -rf ai-maestro

# If using pm2
pm2 delete ai-maestro
pm2 save
```

### Remove WSL2 (Optional)

**In PowerShell as Administrator:**

```powershell
# Unregister Ubuntu
wsl --unregister Ubuntu

# Disable WSL features
dism.exe /online /disable-feature /featurename:Microsoft-Windows-Subsystem-Linux /norestart
dism.exe /online /disable-feature /featurename:VirtualMachinePlatform /norestart

# Restart computer
```

---

## Additional Resources

### Official Documentation
- [Microsoft WSL2 Docs](https://docs.microsoft.com/en-us/windows/wsl/)
- [WSL2 Best Practices](https://docs.microsoft.com/en-us/windows/wsl/setup/environment)
- [tmux Documentation](https://github.com/tmux/tmux/wiki)

### AI Maestro Documentation
- [Main README](../README.md)
- [Operations Guide](./OPERATIONS-GUIDE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [Agent Communication](./AGENT-COMMUNICATION-QUICKSTART.md)

### Community Support
- [GitHub Issues](https://github.com/23blocks-OS/ai-maestro/issues)
- [Feature Requests](https://github.com/23blocks-OS/ai-maestro/issues/new?labels=enhancement)

---

## Tips for Windows Developers

### 1. Use Windows Terminal

[Windows Terminal](https://aka.ms/terminal) is Microsoft's modern terminal:
- Beautiful UI
- Tabs support
- Split panes
- Better rendering than cmd.exe

Install from Microsoft Store or:
```powershell
winget install Microsoft.WindowsTerminal
```

### 2. Configure Windows Terminal for WSL2

Add a custom profile in Windows Terminal settings:

```json
{
  "name": "AI Maestro",
  "commandline": "wsl -d Ubuntu -- bash -c 'cd ~/ai-maestro && bash'",
  "startingDirectory": "//wsl$/Ubuntu/home/your-username/ai-maestro"
}
```

### 3. Git Configuration

Your Windows Git and WSL2 Git are separate. Configure both:

```bash
# In WSL2
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Use your Windows SSH keys in WSL2
ln -s /mnt/c/Users/YourUsername/.ssh ~/.ssh
```

### 4. VS Code Integration

VS Code has excellent WSL2 support:

```bash
# Install VS Code on Windows, then in WSL2:
code ~/ai-maestro

# VS Code will install WSL extension automatically
```

### 5. Clipboard Integration

Copy/paste works seamlessly between Windows and WSL2:

```bash
# Copy to Windows clipboard from WSL2
echo "Hello from WSL2" | clip.exe

# Paste in WSL2 from Windows clipboard
powershell.exe Get-Clipboard
```

---

## FAQ

**Q: Do I need to install anything on Windows besides WSL2?**

A: No. All development tools (Node.js, yarn, tmux, AI Maestro) are installed inside WSL2. You only access the web dashboard from your Windows browser.

---

**Q: Can I use my existing WSL2 installation?**

A: Yes! Just install Node.js, yarn, and tmux inside your existing WSL2 distribution, then follow the AI Maestro installation steps.

---

**Q: Will this affect my Windows performance?**

A: WSL2 uses about 2-4GB of RAM when running. If you have 8GB+ RAM, you won't notice any slowdown.

---

**Q: Can I access Windows files from AI Maestro agents?**

A: Yes! All Windows drives are mounted at `/mnt/c/`, `/mnt/d/`, etc. You can create tmux sessions anywhere:

```bash
cd /mnt/c/Users/YourName/Documents/my-project
tmux new-session -s my-project
```

---

**Q: Do tmux sessions persist after closing Windows Terminal?**

A: Yes! tmux sessions run in WSL2's background. Close Windows Terminal, reopen it, and your sessions are still there. However, sessions are lost if WSL2 shuts down (when no processes running) or if you restart Windows.

---

**Q: Can I use this with Claude Code / Aider / Cursor?**

A: Absolutely! Install your AI agent inside WSL2:

```bash
# Example: Claude Code
# Download and install according to their docs

# Create an agent
tmux new-session -s claude-backend
claude

# Detach: Ctrl+B then D
# View in AI Maestro dashboard
```

---

**Q: Is WSL2 slower than native Linux?**

A: WSL2 file system performance is near-native Linux speed (within 5-10%). Network performance is identical. For terminal-based development, you won't notice any difference.

---

**Q: Can I run multiple Linux distributions?**

A: Yes! You can install Ubuntu, Debian, Fedora, etc., and run AI Maestro in any of them.

---

**Q: What if I already have tmux sessions from before installing AI Maestro?**

A: They'll appear as agents in the dashboard automatically! AI Maestro auto-discovers all tmux sessions.

---

**Q: How do I update AI Maestro?**

```bash
cd ~/ai-maestro
git pull origin main
yarn install
# Restart the dashboard (Ctrl+C, then yarn dev)
```

---

## Support

If you run into issues not covered here:

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Search [existing GitHub issues](https://github.com/23blocks-OS/ai-maestro/issues)
3. Open a [new issue](https://github.com/23blocks-OS/ai-maestro/issues/new) with:
   - Windows version (`winver` in Run dialog)
   - WSL2 version (`wsl --list --verbose` in PowerShell)
   - Error messages
   - Steps to reproduce

---

Made with ♥ in Boulder, Colorado

**Built for developers who love AI pair programming on Windows**
