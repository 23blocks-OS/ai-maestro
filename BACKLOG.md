# AI Maestro — Backlog

Index of features and bugs. Each entry links to a detail file under [`backlog/`](./backlog/).

## Naming Convention

- **Features:** `F###-short-description.md`
- **Bugs:** `B###-short-description.md`
- IDs are zero-padded, sequential, and never reused.

## Status Legend

- `Todo` — Not started
- `In Progress` — Actively being worked on
- `Blocked` — Waiting on a dependency or decision
- `Done` — Shipped / merged
- `Wontfix` — Decided not to pursue

## Features

- **F001** — [A shared filesystem agents and humans can both reach](./backlog/F001-shared-agent-filesystem.md) — `Todo`
- **F002** — [AWS Lambda MicroVM as an agent deployment mode](./backlog/F002-microvm-agent-deployment.md) — `Todo`
- **F003** — [Native iOS selection and paste in the terminal](./backlog/F003-ios-terminal-selection.md) — `Todo`
- **F004** — [Codex chat support (multi-provider transcript reader)](./backlog/F004-codex-chat-transcript.md) — `Done` (history+live+status; approval cards deferred, TUI-only)
- **F005** — [Warn when a host's AMP scripts drift from the fleet](./backlog/F005-host-amp-script-staleness.md) — `Todo`
- **F006** — [Memory cards and an entity graph (the agent summarizes its own memory)](./backlog/F006-memory-cards-entity-graph.md) — `Done` (v0.40.1)
- **F007** — [Measure whether recalled memory changes what an agent does](./backlog/F007-measure-memory-use.md) — `Todo`
- **F008** — [Lessons become skills (procedural memory)](./backlog/F008-lessons-become-skills.md) — `Todo`
- **F009** — [Corrections as their own kind of memory](./backlog/F009-memory-corrections.md) — `Done` (v0.43.0)
- **F010** — [Deliver AMP messages through Claude Code's own session inbox](./backlog/F010-cross-session-inbox-delivery.md) — `Todo`
- **F011** — [Each agent has its own browser, and you can watch it work](./backlog/F011-agent-browser.md) — `Todo`
- **F012** — [Agents that look alive (animated avatars)](./backlog/F012-living-avatars.md) — `In Progress`

## Bugs

- **B001** — [Two browsers on one agent fight over the terminal size](./backlog/B001-multi-client-terminal-sizing.md) — `Todo`
- **B002** — [wterm and ws are behind](./backlog/B002-wterm-and-ws-updates.md) — `Todo`
- **B003** — [Clicking a question option may not confirm it](./backlog/B003-option-click-missing-enter.md) — `Todo`
- **B004** — [Audit remaining shell-string external commands (git, aws) for injection](./backlog/B004-shell-string-external-command-audit.md) — `Todo`
- **B005** — [Listener network posture (bind address / firewall)](./backlog/B005-listener-network-posture.md) — `Wontfix` (no auth is by design)
- **B006** — [AMP signature refusals (403) leave no readable record](./backlog/B006-amp-refusals-not-recorded.md) — `Todo`

## Unfiled

Pre-dating this structure, kept verbatim. Convert to `F###`/`B###` when picked up.

- [ ] Create configuration system for app options (e.g., default working directory for new sessions)
- [ ] Host Sync Phase 3: Retry queue for offline hosts
  - Queue failed sync attempts when remote hosts are offline
  - Exponential backoff retry (5min → 15min → 1hr → 4hrs)
  - Background worker to process pending syncs
  - Persist queue state across server restarts
  - See `docs/HOST-SYNC-PLAN.md` for full details
