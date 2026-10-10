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
- **F013** — [Stall alarm: tell a human when an agent is stuck](./backlog/F013-stall-alarm.md) — `Todo`
- **F014** — [Ambiguity-aware restore: when unsure, do nothing](./backlog/F014-ambiguity-aware-restore.md) — `Todo`
- **F015** — [AMP topics (channels) with replayable offsets](./backlog/F015-amp-topics.md) — `Todo`
- **F016** — [Context budget: agents compact before they get expensive](./backlog/F016-context-budget.md) — `Todo` (status line advice shipped v0.45.9)
- **F017** — [Research: prune stale tool output before a request is sent](./backlog/F017-context-pruning-proxy.md) — `Wontfix` (costs more than it saves; see docs/COST-OPTIMIZATION.md)
- **F018** — [Research: keep the intelligence, give the tool work to cheap models](./backlog/F018-cheap-models-for-tool-work.md) — `Todo` (deprioritized)
- **F019** — [Effort per agent](./backlog/F019-effort-per-agent.md) — `Todo`
- **F020** — [No cold wakes on a large context](./backlog/F020-cold-wakes.md) — `Todo`
- **F021** — [Audit instructions that trigger extra actions](./backlog/F021-action-instruction-audit.md) — `Todo`
- **F022** — [Local models for small agents and AI Maestro's own background jobs](./backlog/F022-local-models.md) — `Blocked` (not ready yet)
- **F023** — [Prompt-cache notes](./backlog/F023-prompt-cache-notes.md) — `Todo` (parked, low gain)
- **F024** — [Agent Files Protocol (AFP) and the agent-files skill, backed by Garage](./backlog/F024-agent-files-afp.md) — `In progress` (spec published, spike running)
- **F025** — [The chat header shows what the terminal status bar shows](./backlog/F025-chat-header-parity.md) — `Done` (0.49.8)

- **F026** — [Agent runtime abstraction (Phase 0), and a Herdr evaluation](./backlog/F026-agent-runtime-abstraction-herdr.md) — `In Progress` (Phase 0 only; Herdr phases parked)
- **F027** — [Every message wakes its agent, on any host, with or without the server](./backlog/F027-reliable-message-wake.md) — `In Progress` (sweeper 0.49.9, on by default 0.50.0; doorbell 0.50.2; one delivery path still open)
- **F028** — [Grok Build agents, and approval cards for Grok and Codex](./backlog/F028-grok-build-support.md) — `Done` (0.60.0; open items listed in the file)
- **F029** — [A test safety net for routes, headless mode and the hook](./backlog/F029-route-and-hook-safety-net.md) — `Done` (0.62.0)
- **F030** — [Reply to an earlier message in the chat (quote-reply)](./backlog/F030-reply-to-an-earlier-message.md) — `Todo`
- **F031** — [Stop advertising Aider; keep it launchable but deprecated](./backlog/F031-retire-aider-from-supported-agents.md) — `Done` (0.62.1)
- **F032** — [Stop claiming GitHub Copilot as a supported agent](./backlog/F032-stop-claiming-github-copilot.md) — `Done` (0.62.1)
- **F033** — [A local secret vault: agents use credentials without the model ever seeing them](./backlog/F033-secret-vault-agents-use-without-seeing.md) — `In Progress` (CLI 0.63.0; Claude Code mod 0.64.0; chat card 0.65.0; agent skill 0.66.0; per-agent scoping open)
- **F034** — [Compare Google's A2UI with the Agent Actions Protocol](./backlog/F034-compare-a2ui-with-agent-actions-protocol.md) — `Todo` (research; pasted summary not yet verified)

## Bugs

- **B001** — [Two browsers on one agent fight over the terminal size](./backlog/B001-multi-client-terminal-sizing.md) — `Todo`
- **B002** — [wterm and ws are behind](./backlog/B002-wterm-and-ws-updates.md) — `Todo`
- **B003** — [Clicking a question option may not confirm it](./backlog/B003-option-click-missing-enter.md) — `Todo`
- **B004** — [Audit remaining shell-string external commands (git, aws) for injection](./backlog/B004-shell-string-external-command-audit.md) — `Todo`
- **B005** — [Listener network posture (bind address / firewall)](./backlog/B005-listener-network-posture.md) — `Wontfix` (no auth is by design)
- **B006** — [AMP signature refusals (403) leave no readable record](./backlog/B006-amp-refusals-not-recorded.md) — `Todo`
- **B007** — [Leftovers from the skills and prompts audit](./backlog/B007-prompt-audit-leftovers.md) — `In Progress`
- **B008** — [GET /api/agents/:id/tracking returns 500 for every agent](./backlog/B008-tracking-endpoint-500.md) — `Done`
- **B009** — [A request for an unknown agent id creates an agent and a database folder](./backlog/B009-unknown-agent-id-creates-agent.md) — `Done` (0.60.4)
- **B010** — [Shell injection and unchecked ids that become file paths](./backlog/B010-injection-and-unchecked-path-ids.md) — `Done` (0.62.0)
- **B011** — [Agent status that is set and never cleared (wakes deferred or dropped)](./backlog/B011-status-set-and-never-cleared.md) — `Done` (0.62.0)
- **B012** — [Headless routes behave differently from the Next.js routes](./backlog/B012-headless-routes-differ-from-next-routes.md) — `Done` (0.62.0)
- **B013** — [Logs that grow without a limit (hook debug log 373 MB, pm2 log 3.4 GB); cap at 50 MB](./backlog/B013-unbounded-logs-need-rotation.md) — `Done` (0.60.5)
- **B014** — [Logs and files that grow without limit across the AI Maestro ecosystem (epic, ranked, one fix per repo)](./backlog/B014-ecosystem-log-and-disk-hygiene.md) — `In Progress` (0.61.0; database retention open)

## Unfiled

Pre-dating this structure, kept verbatim. Convert to `F###`/`B###` when picked up.

- [ ] Create configuration system for app options (e.g., default working directory for new sessions)
- [ ] Host Sync Phase 3: Retry queue for offline hosts
  - Queue failed sync attempts when remote hosts are offline
  - Exponential backoff retry (5min → 15min → 1hr → 4hrs)
  - Background worker to process pending syncs
  - Persist queue state across server restarts
  - See `docs/HOST-SYNC-PLAN.md` for full details
