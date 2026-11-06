# F093 — Search in the chat

**Status:** In Progress
**Type:** Feature
**Created:** 2026-11-06

## Description

A search button in the chat finds a message in the agent's conversation, shows the matches newest first, and jumps to one. The host searches the whole conversation file, because the chat loads only pages of it. Tools, thinking and system notes are not searched.

Not in this version: older conversations of the agent (the chat shows one conversation file), and searching across agents.

## Why It's Needed

With paged history a long conversation holds thousands of messages (Juan, 2026-11-06). Scrolling is no way to find one.

## Business Case

- Retention: the chat becomes a record people can use, not only a live view.

## Implementation Plan

- `searchMessages` in `lib/chat-transcript.mjs`, `chat:search` on both chat sockets, `through` on `chat:requestHistory`, `hooks/useChatFind.ts`, `components/chat/ChatFind.tsx`.
- A socket message works for agents on other hosts, as the chat socket is forwarded.
- Known limit: a jump far back loads everything down to the match. Load a window around it if that is slow on a phone.
- Next: list and search older conversations. Effort: M.
