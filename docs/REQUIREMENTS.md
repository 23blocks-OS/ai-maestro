# Requirements: Claude Code Dashboard

**Version:** 1.0.0
**Last Updated:** 2025-10-09
**Platform:** macOS (Local Development)

---

## Overview

This document outlines all prerequisites and installation steps required to run the Claude Code Dashboard on your local Mac.

---

## 1. System Requirements

### macOS Version
- **Minimum:** macOS 12.0 (Monterey) or later
- **Recommended:** macOS 13.0 (Ventura) or later
- **Tested on:** macOS 14.0+ (Sonoma)

### Hardware
- **RAM:** 8GB minimum, 16GB recommended
- **Disk Space:** 500MB for application and dependencies
- **Display:** 1280x800 minimum resolution (1920x1080 recommended)

---

## 2. Required Software

### 2.1 Node.js and Yarn

The dashboard requires Node.js v18.17+ or v20.x and Yarn package manager.

**Check if already installed:**
```bash
node --version
yarn --version
```

**Installation via Homebrew (Recommended):**
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node@20

# Install Yarn globally
npm install -g yarn
# or
brew install yarn

# Verify installation
node --version  # Should show v20.x.x
yarn --version  # Should show v1.22.x or v3.x.x
```

**Alternative: Official Installer**
1. Download from [nodejs.org](https://nodejs.org/)
2. Choose "LTS" version
3. Run installer
4. Verify installation

### 2.2 tmux

tmux is required for session management.

**Check if already installed:**
```bash
tmux -V
```

**Installation via Homebrew:**
```bash
brew install tmux

# Verify installation
tmux -V  # Should show tmux 3.3a or later
```

**Minimum Version:** tmux 3.0a
**Recommended:** tmux 3.3a or later

### 2.3 Claude Code CLI

**Installation:**
```bash
# Install Claude Code CLI (check official docs for latest method)
npm install -g @anthropics/claude-code

# Or via curl (if available)
curl -fsSL https://claude.ai/install.sh | sh

# Verify installation
claude --version
```

**Authentication:**
```bash
# Login to Claude Code
claude login

# Follow prompts to authenticate
```

**Verify Claude Code works:**
```bash
# Test in a directory
cd ~/projects
claude
# Should start Claude Code CLI
# Type 'exit' or press Ctrl+D to quit
```

---

## 3. Network and Port Requirements

### Required Ports

**Port 3000** - Next.js application (HTTP + WebSocket)
- Bound to `localhost` (127.0.0.1) only
- Not accessible from network
- No firewall configuration needed

**Verify port is available:**
```bash
# Check if port 3000 is in use
lsof -i :3000

# If something is using it, you'll see output
# If empty, port is available
```

### Firewall Settings

**macOS Firewall:** No changes required
- Application only listens on localhost
- Not accessible from network interfaces
- Safe for development use

---

## 4. Development Tools (Optional but Recommended)

### 4.1 iTerm2 (Enhanced Terminal)

**Installation:**
```bash
brew install --cask iterm2
```

**Benefits:**
- Better tmux integration
- Split panes and tabs
- Customizable themes

### 4.2 Git

**Check if installed:**
```bash
git --version
```

**Installation:**
```bash
brew install git
```

---

## 5. Verification Checklist

Run this script to verify all requirements:

```bash
#!/bin/bash

echo "🔍 Checking Claude Code Dashboard Requirements..."
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js: NOT INSTALLED"
fi

# Check Yarn
if command -v yarn &> /dev/null; then
    YARN_VERSION=$(yarn --version)
    echo "✅ Yarn: $YARN_VERSION"
else
    echo "❌ Yarn: NOT INSTALLED"
fi

# Check tmux
if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V)
    echo "✅ tmux: $TMUX_VERSION"
else
    echo "❌ tmux: NOT INSTALLED"
fi

# Check Claude Code CLI
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "installed")
    echo "✅ Claude Code: $CLAUDE_VERSION"
else
    echo "❌ Claude Code: NOT INSTALLED"
fi

# Check port 3000
if lsof -i :3000 &> /dev/null; then
    echo "⚠️  Port 3000: IN USE (you'll need to stop the process or use a different port)"
else
    echo "✅ Port 3000: AVAILABLE"
fi

echo ""
echo "📋 Summary:"
echo "If all items show ✅, you're ready to install the dashboard!"
echo "If any show ❌, install the missing requirements above."
```

Save as `check-requirements.sh`, make executable, and run:
```bash
chmod +x check-requirements.sh
./check-requirements.sh
```

---

## 6. macOS Specific Notes

### Xcode Command Line Tools

Some Node.js packages require build tools. Install if you encounter build errors:

```bash
xcode-select --install
```

### Rosetta 2 (Apple Silicon Macs)

If using Apple Silicon (M1/M2/M3), some packages may need Rosetta 2:

```bash
# Check if Rosetta is installed
/usr/bin/pgrep -q oahd && echo "Rosetta 2 is installed" || echo "Rosetta 2 is NOT installed"

# Install Rosetta 2 if needed
softwareupdate --install-rosetta --agree-to-license
```

### Security & Privacy

When you first run the dashboard, macOS may ask for permissions:

1. **Terminal/iTerm2** - Allow "Automation" in System Preferences
2. **Network** - Allow Node.js to accept incoming connections (localhost only)

---

## 7. Quick Start Installation

Once all requirements are met:

```bash
# Navigate to the project directory
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Install dependencies
yarn install

# Start the dashboard
yarn dev

# Open browser
open http://localhost:3000
```

---

## 8. Troubleshooting

### "Command not found: node"

```bash
# Check PATH
echo $PATH

# If Homebrew is not in PATH, add to ~/.zshrc or ~/.bash_profile:
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "Command not found: tmux"

```bash
# Reinstall tmux
brew reinstall tmux
```

### "Command not found: claude"

```bash
# Check if installed globally
npm list -g @anthropics/claude-code
# or
yarn global list

# Reinstall if needed
npm install -g @anthropics/claude-code
# or
yarn global add @anthropics/claude-code
```

### Port 3000 Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or run the dashboard on a different port
PORT=3001 yarn dev
```

---

## 9. Next Steps

After completing all requirements:

1. ✅ Verify all installations with the verification script
2. 📖 Read [OPERATIONS-GUIDE.md](./OPERATIONS-GUIDE.md) to learn how to start Claude sessions
3. 🚀 Run `yarn install && yarn dev` to start the dashboard
4. 🎯 Create your first tmux session with Claude Code

---

## Support

If you encounter issues:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common problems
- Review [TECHNICAL-SPECS.md](./TECHNICAL-SPECS.md) for architecture details
- Open an issue in the project repository

---

**Document Status:** Ready for Use
**Maintenance:** Update when new requirements are added
