# B033 — A person's message shows a unique id, not their name

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-05

## Description

Reported by Juan. A message sent by a person from the app appears in the agent's inbox as
`p-580dcebd-ac31-4b86-99a7-4abed9fdff57@rnd23blocks.aimaestro.local`, not "Juan Pelaez". The same id shows in `amp-inbox`,
`amp-read`, the hook notice ("You have a new message from p-580dcebd-…") and the dashboard's message list.

Expected: the person's name, with the address available if needed.

The registration has the name: `GET /api/people` returns `displayName: "Juan Pelaez"`. **It is not carried:**

- `sendAsPerson` (`services/person-messages-service.ts`) sets `from` to `personAddress(id)`, which is `p-<id>@…`. Nothing in the
  envelope carries a name (`from_alias` and `from_name` are empty on the stored message).
- `lib/messageQueue.ts` sets `from` and `fromAlias` from `extractAgentNameFromAddress(envelope.from)`, the id.
- `amp-inbox.sh` and `amp-read.sh` print `from` as it is. The hook notice does the same.

The signature is fine: it verifies as a person on an approved device.

## Why It's Needed

An agent cannot tell who wrote to it, and neither can a person reading the inbox. Agents address people by name, and may treat
an unknown id as a stranger.

## Business Case

People talking to agents from the app is a core flow. It looks broken on the first message.

## Implementation Plan

Do not fix this with a lookup per message. The cause is that hosts share no directory, so the name exists on one host only:
see [docs/SPEC-MESH-ENTITIES.md](../docs/SPEC-MESH-ENTITIES.md).

- Depends on F089 step 1. Then every view reads the name from the local directory, by address.
- The name comes from the directory, never from text the sender wrote. Unknown: show the address.
- Agents have the milder form of this: messages show `ai-maestro-app`, not "Dahlia". Same fix.
- `amp-inbox.sh` and `amp-read.sh` come from `agentmessaging/claude-plugin`, read local files and know no directory. Option: at
  delivery, AI Maestro writes `local.from_name` (unsigned, local only) and the scripts print it when present. That change goes
  upstream first, or the next plugin build reverts it.
- Test: a person and an agent show their names in each place; an unknown sender shows the address; a name in the message text
  changes nothing.
- Effort: S after F089.
