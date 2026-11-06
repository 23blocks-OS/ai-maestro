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

- Show the name by looking up the sender on the receiving side: `personIdFromAddress` → the person's `displayName`. The
  name comes from the registry, never from text the sender wrote.
- Other hosts: a person's record lives on one host, so the receiver may not have it. It has `personName` in the device
  registry as a snapshot, and can ask the person's home host. Fall back to the address when it is unknown.
- Where: `convertAMPToMessage` (dashboard and API), the hook notice, and the pane push.
- `amp-inbox.sh` and `amp-read.sh` come from `agentmessaging/claude-plugin`: they read local files and know no people
  registry. Option: at delivery, AI Maestro writes `local.from_name` in the stored message (unsigned, local only), and the
  scripts print it when present. That change goes upstream first, or the next plugin build reverts it.
- Do the same check for the reverse direction: an agent's reply to `p-…` in the app.
- Test: a person's message shows the name in each place; an unknown person shows the address; a name in the message text
  changes nothing.
- Effort: S-M.
