# F097 — Speech and hearing on another machine

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-07

## Description

A host can send speech and hearing to a stronger machine on the network, in place of running the models itself. For example, Lola runs on mini-lola, and her voice is made on a faster host. The agent keeps one voice, and the devices and the phone see no difference.

Juan's idea (2026-11-07), a first piece of a "distributed brain".

## Why It's Needed

mini-lola has 4 GB and a slow processor: a sentence takes 2.9 s warm and hearing 3.1 s, and the models take 524 MB on a host already using swap. Speed follows the machine an agent lives on, not the best machine available.

## Business Case

- A better voice and shorter waits on small hosts, without moving the agent or buying a machine for each one.
- Fleets can keep one strong voice host, and keep audio on their own network, at no cost per word.

## Implementation Plan

- `lib/speech-local.mjs` is already the one place that makes speech and hearing, and `POST /api/agents/[id]/speech` already returns a WAV. Add a host setting that names a voice host, and call that host in place of `scripts/voice/serve.py`. Hearing needs a matching route.
- Fall back to local models when the voice host does not answer.
- Measure first: mac-mini was not faster for a first sentence (5.2 s against 3.6 s, cold). The gain needs a machine that is really faster, such as the planned new Mac mini, so this may wait for it.
- The network hop adds to each sentence: measure it over Tailscale.
- Related: F092 (one voice per agent), ElevenLabs, the other way to take this load off a small host.
- Effort: S to M.
