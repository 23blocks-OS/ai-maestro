# F058 - Optional access token for instances exposed to the internet (experiment)

**Status:** Todo
**Type:** Feature
**Created:** 2026-10-31

## Description

An opt-in, single shared access token for an AI Maestro that is reachable from the internet. It is off by default. A server without a token set behaves exactly as today: no login, open to the local network and Tailscale.

With a token set (for example `AIMAESTRO_ACCESS_TOKEN`, or a file in `~/.aimaestro/`):

- Every HTTP request and every WebSocket upgrade must carry the token, or it gets 401 / a closed socket.
- **Browser:** a small page asks for the token once. The server then sets an HttpOnly, Secure cookie, which also carries the WebSockets (terminal, status, chat, stream-chat).
- **Mobile app:** the token travels with the host's pairing details (QR code or manual entry) and is sent as `Authorization: Bearer <token>`, on both REST and WebSockets.
- **Other hosts:** a peer that talks to a protected host keeps that host's token in its hosts config and sends it on every cross-host call (lists, proxies, people, diagnostics).

It is one token per instance, not user accounts. It is a gate, not an identity system.

## Why It's Needed

Juan, 2026-10-31: people want to secure their orgs with a very simple auth so they can put an AI Maestro on the internet and connect from the app or a browser "without being just totally open". Our own Google Cloud instance is the first case: it has no LAN or Tailscale around it, so today it is either unreachable or open to anyone.

This does not reverse the no-auth design (see B005, Wontfix). The local network and Tailscale stay the trust boundary and stay tokenless. The token is for the case that design never covered: a host with no trusted network around it.

## Business Case

- **Adoption:** cloud VMs (Google Cloud, a VPS) become a supported way to run AI Maestro, not an unsafe one. Teams without Tailscale can still use the app.
- **Risk:** an AI Maestro reachable from the internet with no gate means remote command execution on that host, through the terminal sockets. A token closes that for the people who are already exposing instances anyway.
- **Cost:** small, and invisible to everyone who does not set a token.

## Implementation Plan

- **One check, in `server.mjs`:** run it before handing a request to Next and in the `upgrade` handler, so every WebSocket is covered. Next middleware alone would miss the sockets.
- **Comparison:** constant time (`crypto.timingSafeEqual`). Slow down repeated failures from one address.
- **Local tools:** the Claude hook, the `amp-*.sh` scripts, the statusline and `aimaestro-call.sh` all call `localhost:23000` without a token. Two options; decide one:
  1. They read the token from a `0600` file in `~/.aimaestro/`.
  2. Loopback requests skip the check. Unsafe when a reverse proxy on the same machine forwards internet traffic, because every proxied request then arrives from loopback. If chosen, skip only when there is no `X-Forwarded-For` / `Forwarded` header.
  Option 1 is safer.
- **AMP federation (`/api/v1/*`, `/.well-known/agent-messaging.json`):** these messages are already signed. Decide whether they stay open, so other providers can deliver mail, or also need the token.
- **TLS:** the token is only as good as HTTPS. Document running behind Caddy, a Cloudflare Tunnel or the Google Cloud load balancer. Warn at startup when a token is set but requests arrive over plain HTTP from a non-loopback address.
- **Hosts config:** an optional `token` per host in `hosts.json`, sent by every cross-host fetch and WebSocket proxy. Find the call sites with `grep` for the hosts fan-out helpers.
- **Mobile app:** coordinate with ai-maestro-app (Dahlia) on the pairing payload and on sending the header on WebSockets.
- **Headless mode:** `services/headless-router.ts` serves the same API, so the same check must sit in front of it.
- **Tests:**
  - with no token set, nothing changes;
  - with a token: REST and WebSocket are refused without it, accepted with it, and the cookie works;
  - a peer with the token reaches the host;
  - local tools still work.
- **Effort:** M (2-3 days) for the server, browser and peers. The app side is separate.
- **First user:** the Google Cloud instance.
