# B005 — Bind 23000 to the tailscale interface + enable ufw across the fleet

**Status:** Todo
**Type:** Bug
**Created:** 2026-09-20

## Description

AI Maestro binds to `0.0.0.0:23000` with no authentication (documented in
SECURITY.md as the Phase-1 model). Verified on mini-lola 2026-09-20:

```
ss -ltn | awk '$4 ~ /23000$/'   ->  LISTEN 0.0.0.0:23000
ufw status                      ->  Status: inactive
```

So the listener is reachable from the **entire LAN**, not just the tailnet —
every device on the network (phones, IoT, a guest laptop), and the public
internet if the router forwards 23000. This was the true blast radius of the
tmux RCE (GHSA-2vm8-3q4q-wqv3): not "tailnet devices, which are yours" but
"anything that can reach the host on 23000."

That specific exploit is now patched (v0.38.27). This item is about the
**posture the patch does not change**, framed by pas-lola:

> A patch removes one exploit from an unauthenticated listener on all
> interfaces; it does not make the listener authenticated or the interfaces
> fewer. The next unauth bug in that surface has the same blast radius as this
> one did.

## Why It's Needed

Two published advisories in this codebase (GHSA-mf7j, GHSA-2vm8) were the same
class — unauthenticated input reaching a shell primitive — and both were
critical *because* the listener is reachable and unauthenticated. Hardening
individual sinks (done) does not shrink the attack surface; binding to the
tailscale interface does, at a stroke, for every current and future unauth bug.

An assumption that hosts are "tailnet-only" was made and turned out false on the
first host checked. The fix removes the need to make that assumption at all.

## Business Case

- **Risk mitigation:** collapses the blast radius of any future unauth bug from
  "the LAN / possibly the internet" to "the tailnet, which is the operator's."
  This is the single highest-leverage security change available and it is a
  config, not code.
- **Cheap and reversible:** an env/bind-address change plus a firewall rule per
  host; no application changes.
- **Removes a standing assumption:** "which hosts are exposed" stops being a
  question that has to be re-answered correctly every time.

## Implementation Plan

- **Bind address:** make the listen host configurable (env `HOST` / `BIND_ADDR`),
  defaulting to `0.0.0.0` for the documented localhost story but settable to the
  tailscale interface IP (100.x) or `127.0.0.1` per host. `server.mjs` already
  reads `HOSTNAME`/`PORT`; confirm it honours a bind address and that the
  WebSocket upgrade path binds the same.
- **Firewall:** `ufw` recipe per host — allow the tailscale interface / 100.64.0.0/10,
  deny 23000 elsewhere. Ship as a documented step in the host setup / an optional
  flag in `update-aimaestro.sh`, not silently (a firewall change nobody made is
  its own surprise).
- **Per-host verification** (pas-lola's four-second check, make it the acceptance test):
  ```
  ss -ltn | awk '$4 ~ /23000$/'
  ufw status
  ```
- **Docs:** update SECURITY.md — the localhost-only model is the *default*, and
  any host reachable beyond localhost should bind to the tailnet + firewall.
- Effort: **S** per host; **M** to make it a clean configurable default + docs.
- Open question: default to `127.0.0.1` and require opt-in for network exposure
  (safer, but breaks the tablet/phone dashboard access the current default
  enables), or keep `0.0.0.0` default and make tailnet-bind the documented
  recommendation. This is Juan's call — it trades convenience against surface.
