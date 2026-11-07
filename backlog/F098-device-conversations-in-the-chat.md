# F098 — Device conversations show in the agent's chat

**Status:** Todo
**Type:** Feature
**Created:** 2026-11-07

## Description

What a person says or types at a device, and what the agent says back there, appear in the agent's chat, clearly labeled with the device. For example:

> At MacBook (someone said): "Hey Lola, …"
> Lola, at MacBook: "Heard you, …"

Today neither shows. The words reach the agent as a message from the device (`lib/device-events.ts`, `sendFromUI` with an unverified sender), and the reply goes back with `adp-device.sh say`, not into the chat. The phone app's companion mode is different: the person's words go into the chat as theirs, so they show.

**Decision (Juan, 2026-11-07):** the chat must have no holes in the conversation flow. Every turn at a device shows there as a device message, both what the person said or typed and what the agent said back, in order with the rest of the chat.

## Why It's Needed

Juan could not see his kiosk conversations in the chat, while his phone conversations were there (2026-11-07). The history of an agent is split, and nobody can review what was said at a device.

## Business Case

- One history per agent, wherever a person talked to it.
- Trust stays visible: device words are labeled as someone at a device, never as the operator.

## Implementation Plan

- Display only. **The trust rule does not change:** device words stay untrusted data, because a device cannot know who is speaking. Do not turn them into the person's own chat turns.
- The chat (`lib/chat-transcript.mjs`, `lib/transcript-records.mjs`) recognises the device message (`context.source: 'device'`, the wrapped text) and shows it as a device bubble with the device name, and whether it was said or typed.
- The agent's `say` to a device is shown as the agent's words at that device. It needs a record the chat can read, for example a transcript note written by `invokeAgentDevice` for `speaker.say`.
- Both chat views (`ChatView.tsx`, `MobileChatView.tsx`) and the app's chat feed. Tell the app team the entry type.
- Search (F093) finds them.
- Tests: a device message shows as a device bubble, never as the person; a reply at the device shows once; an agent with no devices shows nothing new.
- Related: F082, F096, B024 (system text that looked like the person). Effort: S to M.
