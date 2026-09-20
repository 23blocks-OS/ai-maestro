# B005 — Listener network posture (bind address / firewall)

**Status:** Wontfix
**Type:** Bug
**Created:** 2026-09-20
**Decided:** 2026-09-20 — no authentication is by design (Juan)

## Decision

**Wontfix, by design.** AI Maestro deliberately runs without application-level
authentication: it is meant to run on **local networks with Tailscale**, and the
trust boundary is the network, not app auth. The `0.0.0.0:23000` bind is
therefore intentional — LAN reachability is the feature that lets a tablet or
phone on the same network open the dashboard (SECURITY.md documents exactly
this). "An unauthenticated listener on all interfaces" is the design, not a gap.

This file is kept (not deleted) so the record shows the concern was raised,
considered, and decided — not silently dropped.

## What was originally raised

During the GHSA-2vm8 RCE work, mini-lola was verified as:

```
ss -ltn | awk '$4 ~ /23000$/'   ->  LISTEN 0.0.0.0:23000
ufw status                      ->  Status: inactive
```

The concern (mine, echoing pas-lola) was that patching the RCE removed one
exploit without shrinking the unauthenticated attack surface, and that binding to
the tailscale interface + ufw would collapse the blast radius of any *future*
unauth bug. That reasoning treated the unauthenticated LAN listener as a gap. Per
the design decision above, it is not — it is the intended access model.

## What survives the decision

Two narrow things, neither of which reopens the auth question:

1. **The RCE fix (v0.38.27) stands on its own.** Network trust protects against
   outsiders, not against a malformed request from a device legitimately on the
   network. Input validation is correct whether or not there is auth in front of
   it, so `lib/tmux-safe.mjs` was worth doing regardless of posture.

2. **"Local network" excludes the public internet.** A host must not port-forward
   23000 through its router — that is outside the trust boundary the design
   assumes. This is a one-line deployment note (candidate for SECURITY.md /
   host-setup docs), not a code or config change, and it does not challenge the
   design; it marks the edge of it.

## Not doing

- Adding authentication — explicitly against the design.
- Forcing a `127.0.0.1` or tailscale-only bind by default — would break the
  intended tablet/phone LAN access.
- Enabling `ufw` as part of the deploy — the LAN listener is intended.
