# F036 - Pi and OpenClaw: from "runs in the terminal" to real support

**Status:** Todo (Pi launch shipped in 0.67.4; findings from a live check on mac-mini, 2026-10-12)
**Type:** Feature
**Created:** 2026-10-12
**Requested by:** Juan, 2026-10-12

## Description

Pi ([pi.dev](https://pi.dev), MIT) and OpenClaw should be usable and listed in AI Maestro. Today both launch and run in the terminal tab. Neither has a chat view, a working/idle status or approval cards, and a full conversation turn has not been tested for either.

## What the mac-mini check showed (Pi 1.1.0, Intel Mac, Node via nvm)

- AI Maestro launches `pi` correctly: the command is typed into the session and Pi starts.
- **Node:** Pi 1.x needs `zlib.createZstdDecompress`, which exists in Node 22.15+ and 23.8+. Pi declares `>=22.19`, so Node 23.5.0 passes the check and then crashes at startup with `zlib.createZstdDecompress is not a function`. mac-mini's Node 22.11 is too old too. Its login shell runs Node 16. A current Node 22 (22.23.3) installed beside the others fixed it. Pi's own installer can set up a private Node for Pi.
- **False "did not start":** the 4-second launch check reported a failure although Pi appeared about 8 seconds later (slow shell startup plus Node start). Fixed in 0.67.6: grace period 12 seconds, `AIM_LAUNCH_GRACE_MS` overrides it.
- **Typing and Enter work:** a message reaches Pi's input box and a slash command (`/session`) runs. A plain message with no model login is swallowed silently, so AI Maestro correctly refused to claim delivery ("reached the agent's input box but was never submitted").
- **Not tested:** a real model turn (needs a login), the reply path, and whether delivery confirmation works once the message becomes a visible turn.
- Pi does not ask approval before tool calls, so there are no approval cards to build.

## Work

1. **[x] Finish the end-to-end test (2026-10-28, Gemini on Vertex; see docs/AGENT-PROGRAMS.md).** Original text: **Finish the end-to-end test.** Log in to Pi on one host (`pi`, then `/login`; the person does this, never the agent), send a message through AI Maestro, confirm the delivery check passes and the reply appears. Record the result in `docs/AGENT-PROGRAMS.md`.
2. **[x] A Node check before launch (reads the Pi crash from the pane, in `findLaunchError`; a predictive check was rejected because the server cannot reproduce the pane's environment).** Original text: **A Node check before launch.** For kind `pi`, find a Node that has zstd (22.15+, 23.8+ or 24+) and either use it or say plainly which Node the session would use and why that fails. Today the failure is only visible in the terminal.
3. **[x] Pi install helper (`scripts/install-pi.sh`: own Node plus a wrapper; Vertex option).** Original text: **Pi install helper on the hosts.** Decide between Pi's own installer (private Node) and a documented step; do not change the hosts' default Node (AI Maestro and its native modules run on Node 20).
4. **Pi chat reader and status.** - [x] Reader (`lib/transcript-pi.mjs`, tests in `tests/transcript-pi.test.ts`, real Pi 1.2.0 fixtures in `tests/fixtures/pi/`; no model login was involved, a local fake model server fed Pi). - [x] Status wiring (`piSessionStatus`, with a 10 minute age limit on "working") and a check on a live Pi agent in the chat view with a real model. Sessions are JSONL under `~/.pi/agent/sessions/--<cwd>--/<timestamp>_<id>.jsonl` (documented format). Pi also has a JSON event mode and an RPC mode. Start with the reader, as for Grok (F028).
5. **OpenClaw.** Run the same end-to-end check. AI Maestro already discovers its tmux sessions on a custom socket. A reader for its sessions (`~/.openclaw/agents/<id>/sessions/<id>.jsonl` per third-party docs; verify on the OpenClaw docs or a live install) is the first upgrade.
6. **Listing.** Keep `docs/AGENT-PROGRAMS.md` and the website at the level actually tested.

## Related

F028 (Grok Build support, the template), F031/F032 (the lesson about claiming support without testing), F027 (message wake).

## Findings, Pi 1.4.0 on a cloud Linux VM with Vertex AI (2026-10-28)

- **Install:** `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` under Node 22.23.3 (nvm, beside the host's Node 20; the default Node was not changed). `pi --version` gives 1.4.0.
- **Vertex provider:** Pi has a built-in `google-vertex` provider. Its documented auth is a Google API key, `gcloud auth application-default login`, or a service-account key file, plus `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`.
- **No key on a cloud VM:** a Google Compute Engine VM gets its identity from the metadata server, with no login file and no key file. With the project and location set, `pi --provider google-vertex ...` stops with "No API key found for google-vertex" before any request. So Pi's readiness check does not see ambient VM credentials. Workaround to test: a custom provider in `models.json` whose key is a shell command that prints a short-lived token (`gcloud auth print-access-token`), pointed at Vertex's OpenAI-compatible endpoint.
- **Models:** Gemini models answer on the Vertex OpenAI-compatible endpoint with the `global` location only (the same names fail in a European region). Claude and open models (Qwen, DeepSeek) return 404 until they are enabled per project in Model Garden.
- **Still to do for item 1:** a model turn through AI Maestro with a Gemini model, then items 2 to 4 as listed above.

## Still open after 2026-10-28
- `aimaestro-agent.sh create --program` rejects `pi` (also `grok`, `openclaw`, `copilot`): the allowed list is in the plugin (`plugin/src/scripts/agent-commands.sh`), fixed through the plugin pipeline.
- Status wiring has not been watched across a Pi restart or crash on a live host.
- OpenClaw (item 5) and the website listing (item 6).
- Upstream: Pi's Vertex readiness check ignores cloud metadata credentials; worth a Pi issue or PR.
