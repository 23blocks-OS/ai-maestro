# B044 - Any web page in the operator's browser can reach the server (no Origin check)

**Status:** Done (audit mode in 0.106.225, `enforce` the default in 0.106.234)
**Type:** Bug (security)
**Created:** 2026-11-18
**Source:** found while checking the lolad review (lolad refuses cross-origin writes with Go's `http.CrossOriginProtection`, `internal/web/web.go` line 152).

## Description

`server.on('upgrade')` (`server.mjs` line 1999) accepts every WebSocket path, including `/term` (types into a terminal), with no `Origin` check. POST routes accept form-like bodies from any origin, and CORS is `*` on `/api/*` (`next.config.js` line 32). So a page on any web site that the operator opens can type into an agent's terminal at `localhost:23000` (Cross-Site WebSocket Hijacking), and DNS rebinding reaches LAN hosts.

## Why It's Needed

The network boundary keeps other machines out, not the operator's own browser. This is the one path from the internet into the fleet that the no-auth model does not cover.

## Business Case

Closes the path without auth and without changing who on the network can connect. Non-browser clients (curl, scripts, other hosts, the hook) send no `Origin` and keep working.

## Implementation Plan

`lib/origin-guard.mjs`: allow no Origin, same origin, known hosts, `AIMAESTRO_TRUSTED_ORIGINS`; refuse other origins on WebSocket upgrades and non-GET requests; refuse unknown `Host` names. Audit mode for one release (log only, Doctor shows origins, record what the phone app sends), then enforce. Size S to M.
