# F043 - Pairing with another person's AI Maestro: invite codes, held senders, visible delivery state

**Status:** Todo (idea from reading lolad; relates to F035, the outbox design)
**Type:** Feature
**Created:** 2026-10-27
**Source:** `CamiloCaceres/lolad`, `docs/federation.md`, `docs/federation-proof.md`, `internal/fed` (read 2026-10-27; not run). Their weaknesses are listed so we do not copy them.

## What lolad does

- **Pairing:** an invite code (`lolad-invite:` plus base64url JSON with the inviter's key and a secret). The secret is single use, valid 72 hours, stored hashed, and rate limited (10 failures an hour per source). Keys are pinned on both sides; a fingerprint can be compared out of band.
- **Choosing what to share:** the user picks which agents are visible to the peer. An agent that is not shared answers 404, so it is not revealed.
- **Unknown remote senders are held:** the first message from a new remote sender is held until a person approves or blocks that sender for that recipient. Block sends a signed receipt back. Mail from a peer is never treated as an instruction to the daemon.
- **Durable outbox:** retries for 7 days with backoff (10 s, 30 s, 2 min, 10 min, 30 min, 1 h); messages keep the same id on both sides, so threads cross.
- **Visible state** per message: queued, held, delivered, blocked, failed.

## Weaknesses to avoid (read from their code)

The signature covers timestamp and body, not method, path or provider, so a replay inside the 5-minute window is possible. The login pin is checked only when the header is present. The invite response is not signature-checked. The pair rate limit keys on the remote address, which is the same for every caller behind a proxy. API keys are stored as unsalted sha256.

## For AI Maestro

We already federate between hosts we own and have an outbox design (F035). This item is about the other case: two people. Open questions: do we want it, how an approval fits the existing trust levels, and what "shared agent" means with our registry. Take F035 first; this builds on it.
