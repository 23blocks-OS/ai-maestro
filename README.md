# Claude Code Dashboard

A browser-based terminal dashboard for managing multiple Claude Code sessions running in tmux on your local Mac.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Node](https://img.shields.io/badge/node-%3E%3D18.17-green)

---

## Overview

Claude Code Dashboard provides a unified web interface for interacting with multiple Claude Code AI assistant sessions. Instead of switching between terminal windows and tmux panes, view all your sessions in one place with full terminal functionality.

### Key Features

- 🖥️ **Browser-Based Terminal** - Full xterm.js terminal with proper rendering
- 🔄 **Auto-Discovery** - Automatically detects tmux sessions running Claude Code
- ⚡ **Instant Switching** - Click between sessions without losing context
- 🎯 **Session Management** - View, organize, and interact with multiple sessions
- 🌐 **WebSocket Streaming** - Real-time terminal I/O with low latency
- 💻 **macOS Optimized** - Native performance on Mac

### Phase 1 Scope (Current)

- ✅ Local tmux session discovery and interaction
- ✅ Localhost-only access (no authentication required)
- ✅ Real-time terminal streaming via WebSocket
- ✅ Session status indicators and metadata
- ❌ Session creation from UI (manual tmux creation only)
- ❌ Remote SSH sessions (local Mac only)

---

## Quick Start

### Prerequisites

- macOS 12.0+ (Monterey or later)
- Node.js 18.17+ or 20.x
- tmux 3.0+
- Claude Code CLI installed and authenticated

### Installation

```bash
# Clone or navigate to the project
cd /Users/juanpelaez/23blocks/webApps/agents-web

# Install dependencies
yarn install

# Start the dashboard
yarn dev
```

### Create Your First Session

```bash
# In a new terminal, create a tmux session
cd ~/projects/my-app
tmux new-session -s my-app-dev

# Start Claude Code inside tmux
claude

# Detach from tmux (Ctrl+B, then D)
# Open dashboard: http://localhost:3000
```

Your session will automatically appear in the sidebar!

---

## Documentation

### Getting Started

1. **[Requirements](./docs/REQUIREMENTS.md)** - System requirements and installation
2. **[Operations Guide](./docs/OPERATIONS-GUIDE.md)** - How to create and manage sessions
3. **[Quick Reference](#quick-reference)** - Essential commands

### Technical Documentation

- **[Technical Specifications](./docs/TECHNICAL-SPECIFICATIONS.md)** - System architecture and design
- **[UX Specifications](./docs/UX-SPECIFICATIONS.md)** - User experience and interface design
- **[Frontend Implementation](./docs/FRONTEND-IMPLEMENTATION.md)** - React/Next.js implementation guide

### Additional Resources

- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[API Documentation](./docs/API.md)** - REST and WebSocket API reference
- **[Contributing Guide](./CONTRIBUTING.md)** - How to contribute to this project

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌─────────────┐        ┌──────────────────┐   │
│  │  React UI   │◄──────►│  xterm.js        │   │
│  │  (Next.js)  │        │  Terminal        │   │
│  └─────────────┘        └──────────────────┘   │
│         │                        │               │
│         │ HTTP                   │ WebSocket     │
└─────────┼────────────────────────┼───────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│         Custom Next.js Server (server.mjs)      │
│  ┌──────────────┐      ┌────────────────────┐  │
│  │ HTTP Server  │      │ WebSocket Server   │  │
│  │ (API Routes) │      │ (Terminal Stream)  │  │
│  └──────────────┘      └────────────────────┘  │
│         │                        │               │
│         │                        │               │
│  ┌──────┴────────────────────────┴────────────┐ │
│  │         Session Auto-Discovery             │ │
│  │         (tmux ls + node-pty)               │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│            Local tmux Sessions                   │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  session-1   │  │  session-2   │            │
│  │  (Claude)    │  │  (Claude)    │  ...       │
│  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘
```

### Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, Tailwind CSS
- **Terminal:** xterm.js with WebGL rendering
- **Backend:** Custom Node.js server with WebSocket support
- **Session Management:** node-pty for PTY interaction
- **Communication:** WebSocket for bidirectional terminal I/O

---

## Project Structure

```
agents-web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Main dashboard page
│   ├── globals.css               # Global styles
│   └── api/                      # API routes
│       └── sessions/
│           └── route.ts          # Session discovery endpoint
├── components/                   # React components
│   ├── SessionList.tsx           # Sidebar session list
│   ├── TerminalView.tsx          # Terminal display
│   └── ...
├── hooks/                        # Custom React hooks
│   ├── useWebSocket.ts           # WebSocket connection
│   ├── useTerminal.ts            # xterm.js management
│   └── useSessions.ts            # Session data fetching
├── lib/                          # Utilities
│   ├── websocket.ts              # WebSocket helpers
│   ├── terminal.ts               # Terminal utilities
│   └── api.ts                    # API client
├── types/                        # TypeScript definitions
│   ├── session.ts                # Session types
│   ├── terminal.ts               # Terminal types
│   └── websocket.ts              # WebSocket types
├── docs/                         # Documentation
│   ├── REQUIREMENTS.md
│   ├── OPERATIONS-GUIDE.md
│   ├── TECHNICAL-SPECIFICATIONS.md
│   ├── UX-SPECIFICATIONS.md
│   └── FRONTEND-IMPLEMENTATION.md
├── server.mjs                    # Custom server (HTTP + WS)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md                     # This file
```

---

## Quick Reference

### Essential Commands

```bash
# Dashboard
yarn dev                          # Start development server
yarn build                        # Build for production
yarn start                        # Start production server
open http://localhost:3000        # Open dashboard

# Session Management
tmux new-session -s name          # Create new session
tmux list-sessions                # List all sessions
tmux attach -t name               # Attach to session
tmux kill-session -t name         # Kill specific session

# Inside tmux
Ctrl+B, D                         # Detach from session
Ctrl+B, $                         # Rename session
exit                              # Exit Claude (ends session)
```

### Keyboard Shortcuts (in Dashboard)

- `Cmd/Ctrl + 1-9` - Switch to session 1-9
- `Cmd/Ctrl + [/]` - Previous/Next session
- `Cmd/Ctrl + R` - Refresh session list
- `Esc` - Return focus to terminal

---

## Development

### Running in Development Mode

```bash
# Install dependencies
yarn install

# Start with hot reload
yarn dev

# The dashboard will be available at:
# http://localhost:3000
```

### Building for Production

```bash
# Build optimized production bundle
yarn build

# Start production server
yarn start
```

### Environment Variables

Create `.env.local` for custom configuration:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# WebSocket Configuration
WS_RECONNECT_DELAY=3000
WS_MAX_RECONNECT_ATTEMPTS=5

# Terminal Configuration
TERMINAL_FONT_SIZE=14
TERMINAL_SCROLLBACK=10000
```

---

## Troubleshooting

### Dashboard Won't Start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Use different port
PORT=3001 yarn dev
```

### Sessions Not Appearing

```bash
# Verify tmux sessions exist
tmux ls

# Refresh browser page (Cmd+R)

# Check dashboard logs for errors
```

### Terminal Not Responsive

1. Click directly in the terminal area
2. Refresh the browser page
3. Check if Claude Code is still running in tmux
4. Check browser console for errors (F12)

See [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for more solutions.

---

## Roadmap

### Phase 1 (Current) ✅
- Local tmux session auto-discovery
- Real-time terminal interaction
- Session status indicators
- Basic session management

### Phase 2 (Planned)
- [ ] Create new sessions from UI
- [ ] Session grouping and organization
- [ ] Search and filter sessions
- [ ] Session templates
- [ ] Enhanced keyboard shortcuts

### Phase 3 (Future)
- [ ] Remote SSH session support
- [ ] Session sharing and collaboration
- [ ] Session recording and playback
- [ ] AI-generated session summaries
- [ ] Custom themes and layouts

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

## License

[MIT License](./LICENSE)

---

## Support

- 📖 **Documentation:** See [docs/](./docs/) directory
- 🐛 **Bug Reports:** Open an issue on GitHub
- 💡 **Feature Requests:** Open an issue with the `enhancement` label
- 💬 **Questions:** Check existing issues or create a new one

---

## Acknowledgments

- **Claude Code CLI** by Anthropic
- **xterm.js** - Terminal emulator for the web
- **Next.js** - React framework
- **tmux** - Terminal multiplexer

---

**Built with ❤️ for developers who love AI pair programming**

