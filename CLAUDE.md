# CLAUDE.md

AI Maestro is a dashboard and orchestrator for fleets of AI coding agents
(Claude Code, Codex, others) running in tmux, on one machine or across hosts.
Next.js 14 (App Router) + a custom `server.mjs` (HTTP and WebSockets on one
port), React 18, xterm.js, node-pty, Tailwind, CozoDB per agent. Port **23000**.

How the subsystems work is in `docs/ARCHITECTURE.md`; read the section you need.

## Commands

```bash
yarn install
yarn dev                 # dev server with hot reload, http://localhost:23000
yarn build && yarn start # production
yarn headless:prod       # API-only mode (no UI), used on worker hosts
yarn test                # vitest; CI runs it on every push
pm2 restart ai-maestro   # restart the production server
```

- Is the server up? `curl localhost:23000/api/sessions` (there is no `/api/health`).
- **Never run `yarn build` in the checkout a live server runs from.** It
  replaces `.next/` under the running process, and the UI stops loading (it
  asks for chunks that no longer exist). Build in a separate worktree, or build
  and restart together.

## Versions and pull requests

- Bump with `./scripts/bump-version.sh patch|minor|major`. It updates every
  version reference; do not edit version numbers by hand. Every PR to main
  carries a version bump and a CHANGELOG entry.
- Before a PR: `yarn test` passes, `yarn build` passes (outside the live
  checkout), version bumped.
- `aimaestro-agent.sh` (the agents CLI) has its own `v1.x` version, released
  through the plugin.
- Draft an X post (in `marketing/`, which is gitignored) for **releases** only,
  not for every PR.

## The Claude Code hook has one source of truth

`ai-maestro-hook.cjs` ships from three byte-identical copies. Edit only
`scripts/claude-hooks/ai-maestro-hook.cjs`, then run
`bash scripts/sync-plugin-hook.sh`. `tests/plugin-hook-sync.test.ts` fails CI
if the copies drift.

## The plugin (`plugin/` submodule)

`plugin/` is the **plugin builder** (23blocks-OS/ai-maestro-plugins), not a
plugin. `plugin.manifest.json` lists sources; `build-plugin.sh --clean`
assembles them into `plugin/plugins/ai-maestro/` (build output, committed).

- Local skills and scripts: edit `plugin/src/`, never the build output.
- AMP scripts (`amp-*.sh`, `amp-helper.sh`, `amp-statusline.sh`) and the
  agent-messaging, agent-identity and canvas-actions skills come from
  agentmessaging/* repos at `ref: main`. Fix them upstream and merge, or the
  next build reverts your fix.
- After any plugin change: `cd plugin && ./build-plugin.sh --clean`, commit
  and push the submodule, bump `version` in `plugin.manifest.json` and
  `.claude-plugin/marketplace.json` (otherwise `claude plugin update` ships
  nothing), then `git add plugin` in this repo.
- Skills follow Anthropic's skill best practices: the description says what
  the skill does and when to use it, the body has only what the model doesn't
  know, no shouted rules. `tests/plugin-skill-frontmatter.test.ts` strict-parses
  every skill. Measure trigger changes with `plugin/evals` (see
  `docs/SKILLS-QUALITY.md`).

## Deploying to hosts

Use `./update-aimaestro.sh -y` on each host (pull, submodules, build,
install-hooks, install-plugin, restart). A raw `git reset` + build skips the
hook and plugin installs.

## Agents come first

Agents are the core entity; a tmux session is an optional property of one.

- Agent data (working directory, name, sessions) lives in the registry,
  `~/.aimaestro/agents/registry.json` (`lib/agent-registry.ts`). Read it from
  there: `getAgent(id) || getAgentBySession(name)`.
- Never derive agent properties from tmux. Sessions are discovered and linked
  to registry agents, not the other way round.
- An agent can exist without a session.
- Build tmux commands with `lib/tmux-safe.mjs` (execFile + argv). Session names
  must match `^[a-zA-Z0-9_-]+$`.
- The subconscious (indexing, memory consolidation, inbox polling) runs on the
  host where the agent lives and reads its files directly.

## Agent status has one source

Working / Needs you / Ready / Offline comes only from the server feed
(`services/sessions-service.ts` `getActivity`, normalised by
`lib/agent-presence.ts`) through one browser store,
`hooks/useSessionActivity.ts`, read with `presenceOf(agent)`. No view computes
status from its own data, and no view opens its own status socket. Fix wrong
status at the server, never in a view.

## Messaging (AMP)

Agents message each other with the Agent Messaging Protocol (signed, local by
default, federated optionally). Storage: `~/.agent-messaging/agents/<name>/`.
AI Maestro is also an AMP provider (`/api/v1/*`). Details:
`docs/ARCHITECTURE.md` and the agent-messaging skill.

- Agents learn about new messages three ways: the Stop hook, prompt injection,
  and a push into the tmux pane. Find which path a bug is on before fixing it.
- The inbox poll (`checkMessages`, every 5 minutes) is **on by default**
  (`messagePollingEnabled !== false`). It is the safety net when a push reaches
  the pane but never submits. Do not turn it off unless push is proven on every
  agent.

## The chat has two send paths and three question renderers

Read `docs/CHAT-ARCHITECTURE.md` before touching chat code. In short:

- The chat UI sends through `sendChatMessage` in `server.mjs` (WebSocket
  `chat:send`), not the one in `services/agents-chat-service.ts` (REST).
- Questions render in `ChatView.tsx`, in `MobileChatView.tsx` (also used on
  desktop through a layout override), and from pane scrollback
  (`detectPermissionFromPane`).
- Pane readback (`lib/pane-readback.mjs`): text counts as submitted only when
  it sits above the input box; capture with `-e` and strip dim text; clear
  input with backspaces, not `C-u`. `_lastPermission` is a cache, never an
  authority.

## Terminal rules

- Inactive terminal tabs are hidden with `visibility: hidden` and
  `pointerEvents: none`, never `display: none` (zero size breaks xterm).
- Terminals initialise once on mount (empty dependency array); do not add
  `session.id` to that effect.
- xterm: `convertEol: false`; load addons, then `open()`, then `fitAddon.fit()`.

## Security model

No app-level authentication, by design: the server binds `0.0.0.0` for the
local network and Tailscale, and the network is the trust boundary. Do not
propose auth or a localhost-only bind. Do fix injection: external commands go
through argv, never shell strings.

## Conventions

- Services in `services/` are pure functions returning `ServiceResult<T>`; API
  routes are thin wrappers. Headless mode serves the same functions through
  `services/headless-router.ts`, so new routes need both.
- Next.js 14 route params are a Promise: `{ params: Promise<{ id: string }> }`.
- No nested buttons (hydration errors); use a `div` with `onClick`.
- Category colours are hash-based (`AgentList.tsx`), never hardcoded.
- Marketing content goes in `marketing/` (gitignored).

## Where things are

- `server.mjs` — HTTP + WebSockets (terminal, status, AMP, companion), PTY pool, startup tasks
- `app/` — pages and API routes; `services/` — logic behind the routes
- `lib/` — registry, memory (`lib/memory/`), AMP, tmux, cerebellum, schedules
- `components/`, `hooks/` — UI; `types/` — shared types
- `scripts/` — hook, installers, version bump; `tests/` — vitest suites
- `plugin/` — plugin builder submodule; `channels/` — AMP channel plugin
- `docs/` — architecture and feature docs; `backlog/` + `BACKLOG.md` — features and bugs (use the backlog-management skill; `docs/BACKLOG.md` is the versioned roadmap)
