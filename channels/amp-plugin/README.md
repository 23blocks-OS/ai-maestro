# amp — AI Maestro AMP channel plugin

A Claude Code **channel** (MCP server) that injects AMP inbox messages straight
into a running Claude Code session. An idle agent wakes and processes the
message with **no tmux keystrokes** — fixing the dropped-Enter last-mile that
strands idle agents.

- Source of truth: `../../lib/amp-channel-server.mjs` (dev) → bundled here to
  `server.mjs` (self-contained, no `node_modules` at runtime).
- Delivery side: `../../lib/channel-bridge.mjs` `pushToChannel()`, called from
  `deliver()` in `lib/message-delivery.ts`. It reads `~/.aimaestro/channels/<agentId>.json`
  (written by this server on startup) and POSTs the message in.

## Rebuild the bundle after editing the server

```bash
node_modules/.bin/esbuild lib/amp-channel-server.mjs \
  --bundle --platform=node --format=esm --target=node18 \
  --outfile=channels/amp-plugin/server.mjs
```

## Roll it out to the fleet (unattended, no dev-flag dialog)

1. **Publish** this plugin dir to the `ai-maestro-marketplace` (the `plugin/`
   submodule): copy `channels/amp-plugin/` → `plugins/amp/` and add an entry to
   `plugin/.claude-plugin/marketplace.json`:
   ```json
   { "name": "amp", "source": "./plugins/amp", "version": "0.1.0",
     "description": "AMP channel — reliable idle-agent wake", "author": { "name": "23blocks" },
     "license": "MIT", "category": "productivity" }
   ```
2. **Org allowlist** (you are the org owner). In claude.ai → Admin settings →
   Claude Code, or in managed settings, set:
   ```json
   { "channelsEnabled": true,
     "allowedChannelPlugins": [ { "marketplace": "ai-maestro-marketplace", "plugin": "amp" } ] }
   ```
   This lets agents run `--channels plugin:amp@ai-maestro-marketplace` with **no
   `--dangerously-load-development-channels` flag and no interactive warning**.
3. **Turn it on** — set the launch flag env for the AI Maestro server and restart:
   ```bash
   AIMAESTRO_CHANNEL_FLAG="--channels plugin:amp@ai-maestro-marketplace" pm2 restart ai-maestro --update-env
   ```
   Every agent woken after this boots with the channel; `deliver()` injects
   messages into it, and tmux `send-keys` is used only as a fallback for agents
   that don't have a channel yet.
4. **Relaunch** the fleet (or wake agents) to pick up the flag. Validate one
   agent first, then the rest.

## Local validation (before the org allowlist)

Bare-server dev mode shows a one-time consent dialog (fine for one agent, not
the fleet):

```bash
AIMAESTRO_CHANNEL_FLAG="--dangerously-load-development-channels server:amp"
# plus a user-level ~/.claude.json mcpServers "amp" entry pointing at server.mjs
```
