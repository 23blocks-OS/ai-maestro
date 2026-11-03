# F070 - Notify a person when a long action finishes, and when an agent has a result

**Status:** Todo (idea to shape)
**Type:** Feature
**Created:** 2026-11-03

## Description

Phone pushes exist now (`lib/push-expo.ts`), but they cover only four cases (`PUSH_TYPES` in
`types/person-device.ts`):
- `needs_you`, an agent waits on a question;
- `card_waiting`;
- `call`;
- `message`.

Nothing tells a person that something they started finished or failed, or that an agent has a result
for them.

Two sources, to decide between or to combine:

1. **Events from AI Maestro itself:** actions that take time and that a person or an agent started:
   - create an agent (from the UI, the CLI or another agent);
   - wake or restart;
   - export, import or transfer between hosts;
   - a host update (`update-aimaestro.sh`);
   - a Doctor check that turns to `fail` (F069).

   The push says "done" or "failed" and opens the right screen.
2. **Results from agents:** an agent finished a task. For example:
   - a task-board card moved to done;
   - a long turn ended (the Stop hook after a turn longer than N minutes);
   - the agent says it has a result.

   This is different from `needs_you`: nothing waits on the person, but they want to know.

## Why It's Needed

People start a long action and leave the dashboard, then come back to check. They do not know that an
agent another agent created is ready, that a transfer failed, or that a two-hour task finished. The
push system and the person's phone are already in place. These are the events missing from it.

## Business Case

- Retention: an operator who learns "done" right away gets more out of a fleet that works without them
  watching.
- Support load: a failed long action (transfer, update) is found when it happens, not days later.
- It makes the phone app the place where an operator follows the fleet.

## Implementation Plan

- New push types, for example `action_done` and `agent_result`. Each person chooses which types they
  get (`pushTypes` on the device already exists).
- Source 1: one helper, `pushActionDone({ action, ok, agentId?, startedBy })`, called at the end of
  each long service function. Start with create agent and transfer. Who started it decides who gets the
  push. An agent-started action goes to the agent's operator.
- Source 2: start with task cards moved to done, a clear signal that already exists. A long turn's end
  is noisier: measure it before turning it on.
- Keep the push thin, as `push-expo.ts` requires: the agent's name and a fixed sentence, never content.
  Keep the per-agent cooldown.
- Also show it in the dashboard (the notification list), not only on the phone.
- Open questions:
  - What counts as long, a fixed list of actions or a duration?
  - Should an agent decide when it has a result (a skill or a command), or should the server infer it?
- Effort: M for source 1 (two actions plus the type and the settings), then S for each action after
  that. Source 2: M after the open questions are answered.
