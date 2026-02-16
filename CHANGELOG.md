# Changelog

All notable changes to AI Maestro are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.23.10] - 2026-02-16

### Added
- CHANGELOG.md with structured per-version change tracking (Issue #226)

### Fixed
- Auto-trust mechanism: new agents no longer require manual tool approval (Issue #223, plugin PR #4)
- AMP reply routing: `in_reply_to` and `thread_id` fields now tracked in envelope (partial fix for Issue #224)

### Changed
- Documented CLI script versioning policy: `aimaestro-agent.sh` uses independent semver (Issue #225)

## [0.23.9] - 2026-02-15

### Changed
- Replace help embedding system with AI Maestro Assistant agent

## [0.23.8] - 2026-02-15

### Added
- Essential keys toolbar for mobile terminal mode

### Fixed
- Query param left in URL when switching from Immersive to Dashboard (#57)

## [0.23.7] - 2026-02-15

### Added
- 3-tier responsive experience (phone/tablet/desktop)
- Mobile chat view with touch copy/paste
- AIM-222: Consolidated fix for 65+ issues across memory, terminal, installers, skills, and API
- ToxicSkills defense for skill/plugin install

### Changed
- Improved README docs organization, Windows install clarity, AMP example

## [0.23.4] - 2026-02-08

### Fixed
- Intermittent terminal attachment failures with PTY spawn retry logic

### Added
- Cerebellum and plugin documentation

## [0.23.3] - 2026-02-08

### Added
- Speech history, adaptive cooldown, event classification, template fallbacks
- OpenAI TTS provider

### Fixed
- Voice switching and speech prompt improvements

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
- Remove messaging-helper.sh from CI test expectations

## [0.22.0] - 2026-01-29

### Added
- Composable plugin system with dedicated marketplace repo
- Installer and updater now sync marketplace plugin CLAUDE.md

### Fixed
- Replaced old messaging script references with AMP commands
- Removed leftover old messaging scripts that confused agents
