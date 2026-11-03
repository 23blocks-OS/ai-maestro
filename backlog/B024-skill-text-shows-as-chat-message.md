# B024 — System text (skills, Stop hook feedback, message notices) shows in the chat as the person's message

**Status:** Done (0.106.68)
**Type:** Bug
**Created:** 2026-11-03

## Description

The chat shows text that the system put into the conversation as a message from the person (a blue
bubble on the right). Three kinds, all reported on 2026-11-03:

1. **A loaded skill.** The whole skill body ("Base directory for this skill: …" to the end of SKILL.md).
   Seen on Iris Vance (`tct-product`, mac-mini): agent-messaging, agent-tasks and canvas-actions.
2. **Stop hook feedback.** Our Stop hook's unread-mail notice ("Stop hook feedback: 2 unread AMP
   messages in your inbox: … Read them with amp-read.sh <id> …"). Seen on Blaine (`api-geolocation`).
3. **A message notice typed into the pane.** AI Maestro's push for new mail
   ("[#a3f63b35] [MESSAGE] Re: Ruling copy: … — from tct-gm@rnd23blocks — …", format in
   `lib/notification-service.ts`).

Where each comes from, checked in real transcripts:

- 1 and 2: Claude Code writes them as a `type: 'user'` line with `isMeta: true` (the skill line also has
  `sourceToolUseID`). `lib/chat-transcript.mjs` never looks at `isMeta`.
- 3: AI Maestro types it into the tmux pane, so Claude Code records it as an ordinary prompt with no
  mark. It can only be recognised by its shape: `[#<ref>] [MESSAGE] …` (and the older
  `[MESSAGE] From: …`, as `lib/memory/jev-provider.ts` already parses). The same applies to the other
  pane pushes (`[CANVAS]`, `[TASK <id>]`): check which of them are system text.

**Expected (Juan, 2026-11-03):** these are fine to keep in the chat, but

- shown **only in X-Ray mode** (`chatMode === 'power'`), hidden otherwise;
- attributed to **the system**, not the person;
- drawn **on the left**, with a **different background** from both the person's and the agent's bubbles.

## Why It's Needed

The person sees words in their name that they never wrote, and long system text (a skill is hundreds of
lines) pushes the real conversation off the screen, on the phone most of all.

## Business Case

The chat is the main way people follow an agent, on the web and in the mobile app. Messages that look
like their own but are not make them doubt the whole record.

## Implementation Plan

- Server, `lib/chat-transcript.mjs`: emit these as a new entry type, for example
  `{ type: 'system_notice', kind: 'skill' | 'stop-hook' | 'message-notice', text, timestamp, uuid }`,
  instead of a user message. `isMeta` lines go by the flag (check first which other `isMeta` lines exist
  so nothing a person typed is dropped); pane pushes go by their prefix.
- Web: `groupMessages(messages, chatMode)` in `components/ChatView.tsx` keeps `system_notice` only in
  `'power'` (X-Ray); render it left-aligned with its own background and a "System" label. Check
  `MobileChatView.tsx`, which always groups with `'power'`, and decide whether it gets an X-Ray toggle or
  hides them.
- Make sure the send path's pending-bubble reconciliation and `queue-operation` handling do not treat a
  notice as the person's sent text.
- Mobile app (ai-maestro-app): tell the app team about the new entry type so the phone renders it the
  same way.
- Tests: transcript fixtures for each of the three kinds, and the X-Ray filter.
- Effort: M. GitHub issue: #767.
