# Changelog

All notable changes to AI Maestro are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.24.6] - 2026-02-16

### Fixed
- Double-paste on desktop terminals (Cmd+V fired both custom handler and native paste event)
- Outdated `pm2 start server.mjs` examples in OPERATIONS-GUIDE.md

### Changed
- Made `tsx` a production dependency (was devDependency — `yarn install --production` would break)
- `start-with-ssh.sh` uses direct `./node_modules/.bin/tsx` instead of `npx tsx`

## [0.24.0] - 2026-02-16

### Added
- **Service layer architecture** — 23 service files, all ~100 API routes are thin wrappers
- **Headless mode** (`MAESTRO_MODE=headless`) — API-only server, no Next.js, ~1s startup
- Headless router serving all endpoints via standalone HTTP router
- Shared state bridge pattern (`globalThis._sharedState`) for server.mjs/API route interop
- `ServiceResult<T>` return type across all services
- 486 tests (281 service tests + 205 existing)

### Changed
- Extracted all business logic from API routes into `services/` directory
- Abstract agent runtime (`lib/agent-runtime.ts`) replacing direct tmux/PTY calls

## [0.23.9] - 2026-02-15

### Changed
- Replaced help embedding system with AI Maestro Assistant agent

## [0.23.8] - 2026-02-15

### Added
- Essential keys toolbar for mobile terminal mode

### Fixed
- Query param left in URL when switching from Immersive to Dashboard

## [0.23.7] - 2026-02-15

### Added
- 3-tier responsive experience (phone/tablet/desktop)
- Mobile chat view with touch copy/paste
- ToxicSkills defense for skill/plugin install

### Fixed
- AIM-222: Consolidated fix for 65+ issues across memory, terminal, installers, skills, and API

## [0.23.4] - 2026-02-08

### Fixed
- Intermittent terminal attachment failures with PTY spawn retry logic

## [0.23.3] - 2026-02-08

### Added
- Speech history, adaptive cooldown, event classification, template fallbacks
- OpenAI TTS provider

## [0.23.2] - 2026-02-07

### Added
- Voice commands for companion input
- Enhanced Cerebellum voice subsystem

## [0.23.1] - 2026-02-07

### Added
- Cerebellum subsystem coordinator
- FaceTime-style companion with pop-out window

## [0.22.4] - 2026-02-01

### Added
- Create Agent dropdown with Advanced mode
- Docker container support for agents
- AIM environment variables

## [0.22.2] - 2026-01-31

### Changed
- Removed root clutter (.aimaestro/ and .claude-plugin/)

## [0.22.1] - 2026-01-31

### Fixed
- Graceful shutdown no longer kills tmux sessions

## [0.22.0] - 2026-01-29

### Added
- Composable plugin system with dedicated marketplace repo

### Fixed
- Replaced old messaging script references with AMP commands

## [0.21.39] - 2026-01-28

### Added
- First-class team management with documents and dashboard

## [0.21.38] - 2026-01-27

### Changed
- Full-bleed avatar cards in meeting sidebar

## [0.21.37] - 2026-01-27

### Added
- Sidebar view switcher, agent pop-out

### Fixed
- Session cascade fix

## [0.21.32] - 2026-01-26

### Changed
- Project review phase 2 — tests, error boundaries, dependency fixes

## [0.21.31] - 2026-01-26

### Changed
- Project review phase 1 — tests, cleanup, dependency fixes

## [0.21.30] - 2026-01-25

### Fixed
- AMP messaging stabilization — UUID migration, delivery paths, security hardening

## [0.21.25] - 2026-01-24

### Fixed
- CLI agent resolvers consolidated, HOST_URLS crash, BSD sed compatibility

## [0.21.24] - 2026-01-24

### Changed
- Eliminated resource waste in subconscious delta indexing

## [0.21.23] - 2026-01-23

### Fixed
- Inbox/sent resolved by agent UUID, not name

## [0.21.22] - 2026-01-23

### Fixed
- Mesh alias propagation in peer-exchange, cross-host test inbox

## [0.21.21] - 2026-01-23

### Fixed
- `getHostById` now checks aliases for mesh-forwarded auth

## [0.21.20] - 2026-01-22

### Fixed
- Include programArgs in Agent Profile save payload

## [0.21.19] - 2026-01-22

### Added
- AMP address collection

## [0.21.15] - 2026-01-21

### Added
- AMP protocol compliance — agent management, WebSocket, federation

## [0.21.14] - 2026-01-21

### Fixed
- Comprehensive messaging system hardening

## [0.21.12] - 2026-01-20

### Fixed
- Prevent git repo name from poisoning agent identity

## [0.21.11] - 2026-01-20

### Changed
- Unified messaging — one route, one deliver, one storage

## [0.21.10] - 2026-01-19

### Fixed
- AMP-only messaging, unified routing, plugin hardening

## [0.21.8] - 2026-01-18

### Fixed
- Cross-host mesh routing and local delivery

## [0.21.6] - 2026-01-18

### Fixed
- Auto-register on send, prevent black-hole delivery

## [0.21.1] - 2026-01-17

### Fixed
- Read inbox/sent from per-agent AMP directories

### Added
- Kanban board with 5-column drag-and-drop task management
- Unified programArgs with first-launch resume stripping
- War room mode for multi-agent coordination

## [0.19.4] - 2026-01-10

### Fixed
- Cross-host notifications

## [0.19.3] - 2026-01-10

### Fixed
- Mobile empty state duplicate messages

## [0.18.10] - 2026-01-07

### Added
- Push notifications for message delivery (replaced polling)

## [0.11.0] - 2025-12-20

### Added
- Agent Intelligence documentation

## [0.10.0] - 2025-12-18

### Added
- Comprehensive work mode documentation

## [0.9.0] - 2025-12-15

### Added
- Conversation detail viewer with side panel

## [0.8.0] - 2025-12-12

### Added
- Settings UI with host management wizard
- Session persistence and WorkTree support

## [0.7.0] - 2025-12-08

### Added
- Deployment tracking and UI indicators for agents
- Migration banner and status API

## [0.5.0] - 2025-12-01

### Added
- Unread messages and auto-mark-as-read

## [0.4.0] - 2025-11-25

### Added
- Agent-to-agent communication
- SSH configuration for tmux sessions

### Fixed
- Critical PTY leak causing system resource exhaustion

## [0.3.0] - 2025-11-18

### Changed
- Tab-based multi-terminal architecture (visibility toggling, no unmount/remount)

### Fixed
- Terminal width and selection issues

## [0.2.0] - 2025-11-10

### Added
- Agent-to-agent messaging system
- Session logging with global control

## [0.1.0] - 2025-11-01

### Added
- Initial release — tmux auto-discovery, real-time terminal streaming, WebSocket-PTY bridge
- Hierarchical agent sidebar with dynamic colors
- Space Grotesk branding as "AI Maestro"
