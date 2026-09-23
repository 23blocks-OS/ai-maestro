# F011 — Each agent has its own browser, and you can watch it work

**Status:** Todo (exploration)
**Type:** Feature
**Created:** 2026-09-23

## Description

Give each agent a browser that belongs to it and that people can watch live,
with many agents browsing at the same time, the way each agent already has
its own terminal.

Built on [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)
(Apache-2.0, native CLI, ships its own skill; 0.26.0 already installed on this
Mac), which provides every piece:
- **Per-agent isolation:** `--session <agent>`; persistent state with
  `--profile ~/.aimaestro/agents/<id>/browser` (logins, cookies, storage), so
  the agent's browser identity lives in the agent's directory and moves with it.
- **Live view with input ("pair browsing"):** every session runs a WebSocket
  stream (`ws://localhost:<port>`): `frame` messages (base64 JPEG + viewport
  metadata, seq/ack pacing), `url` messages, and input events accepted back.
  Quality/size tunable (1280×720 q80 ≈ 54 KB/frame; 640×360 q20 ≈ 9 KB).
- **Agent-friendly pages:** accessibility-tree snapshot with element refs
  (`@e2`), reads as markdown, annotated screenshots.
- **Safety:** encrypted credential vault (the model never sees passwords),
  domain allowlist, action policy / confirmation for sensitive actions,
  content boundary markers.

Contrast: OpenMuse (CopilotKit/openmuse) has one shared browser service per
install, sessions per task, max 3 active, screenshot-and-click "take control".

## Why It's Needed

Agents increasingly need the web (dashboards, consoles, docs, SaaS admin) and
today they browse blind or not at all. Watching an agent browse is also the
fastest way to trust it, and to take over when it needs a login or a decision.

## Business Case

"Agents you can watch work" in the browser, per agent and in parallel, is a
visible, demo-able capability that fits AI Maestro's model (each agent owns its
tools) better than a single shared browser. Low build cost: the browser, the
stream and the skill already exist.

## Implementation Plan (to explore)

1. Spike: one agent, `agent-browser --session <name> --profile <agent dir>`,
   read its stream port (`stream status`), proxy the WebSocket through
   server.mjs like `/term`, render frames in a canvas.
2. **Browser tab** next to Terminal/Chat: live view, URL bar (read-only),
   "take control" (forward mouse/keyboard), activity feed of the agent's
   browser commands.
3. Skill: install agent-browser's skill for agents with the browser enabled,
   with `AGENT_BROWSER_SESSION` / profile set per agent (env in the tmux
   session, like AIM_AGENT_NAME).
4. Fleet view: thumbnails of every agent's live browser.

Questions: headless + stream (preferred on hosts) vs `--headed` windows; how
many parallel Chromes a host can run (memory); stream only while someone is
watching; remote hosts (proxy the stream over the mesh like terminals); which
agents get the skill (per-agent skill switch like memory). Effort: M-L.
