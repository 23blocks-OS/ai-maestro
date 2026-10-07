# F030 - Reply to an earlier message in the chat (quote-reply)

**Status:** Todo
**Type:** Feature
**Created:** 2026-10-07
**Requested by:** Juan, 2026-10-07

## Description

As a conversation with an agent moves on, Juan often wants to answer something said earlier, not the last message. Today that means copying the text or retyping a description of it, which is slow and error-prone, especially on the phone.

## Idea

Add a **Reply** action on any message bubble in the chat (desktop `ChatView.tsx` and `MobileChatView.tsx`). Choosing it puts a quoted excerpt of that message above the composer (dismissible, like a messaging app). On send, the quote travels with the message so the agent knows exactly which earlier message is meant.

## Open questions

- **What the agent receives.** The chat sends text into the pane (`sendChatMessage` in `server.mjs`, `chat:send`). The simplest form is a plain-text prefix, for example `> quoted excerpt (first 300 characters)` then a blank line and the reply, which works for every program (Claude Code, Codex, Grok). A longer or tool-heavy message needs a rule for how much to quote.
- **Which messages can be replied to.** Assistant text, the user's own earlier messages, tool results? Probably text bubbles first.
- **AMP.** Agent-to-agent messages already have `inReplyTo` and a thread. Check whether the chat's reply could also carry that id when the quoted message came from an AMP message, so the dashboard thread view and the agent's inbox line up.
- **Selecting part of a message.** Start with the whole bubble; selecting a passage to quote is a later step.
- **Pane readback.** CLAUDE.md rules apply: text counts as submitted only above the input box. A multi-line prefix has to stay inside the paste path used for long messages (check `lib/pane-readback.mjs`).

## Where to look first

`docs/CHAT-ARCHITECTURE.md`, `components/ChatView.tsx`, `components/MobileChatView.tsx`, `sendChatMessage` in `server.mjs`.
