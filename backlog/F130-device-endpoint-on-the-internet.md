# F130 — The device endpoint on the internet through a Cloudflare tunnel

**Status:** Todo
**Type:** Feature
**Category:** Mobile toy (Bruce)
**Created:** 2026-11-23

## Description

Publish the device hub's encrypted endpoint (`/v1/secure`) at a public host name through a Cloudflare tunnel, so a board on any network (a hotel, an office, a phone hotspot) reaches its agent. The board connects with `wss://` to the host name; inside, the S003 key exchange and encryption run end to end with the pinned keys, so Cloudflare carries only encrypted frames.

Protocol work: ADP [F011](https://github.com/agentmessaging/agent-device-protocol/blob/main/docs/wiki/backlog/F011-controller-from-anywhere.md) (S003 amendment, board TLS).

## Why It's Needed

Juan, 2026-11-23: "the Cloudflare tunnel is an awesome idea so the toy can work in any place." Bruce's board connects to `ws://10.0.0.223:23112`, which exists only on the home network, and boards cannot run Tailscale.

## Business Case

- Without it, the mobile toy works only at home.
- The meeting room (F108) already runs a Cloudflare tunnel, so the operations pattern is known.

## Implementation Plan

- **Do not point the tunnel at the hub's loopback port.** `lib/device-host.mjs` listens on `127.0.0.1:23112`, and a connection from loopback is trusted like Tailscale. Through a tunnel, a plain `/v1/connect` would get the full profile with no encryption. Instead: a separate listener for the tunnel (its own port), which accepts `/v1/secure` only and treats every connection as public (the same limits as a home address, before encryption).
- Settings: turn the public endpoint on, the host name, and the tunnel command or token (in the vault). Off by default. This is the opt-in exception to "the network is the trust boundary", the same as F058's internet access token.
- The board learns its addresses at pairing: the home address first, the public name second. Later, the list can be sent with F129.
- Only the device endpoint is published, never the dashboard. Cloudflare rate limits; unknown device keys are refused before the upgrade, as today.
- Tests: `/v1/connect` through the tunnel listener is refused; `/v1/secure` works; a board on a phone hotspot speaks and sends a talk clip.
- Effort: M.
