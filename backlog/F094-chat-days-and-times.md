# F094 — Days and times in the chat

**Status:** In Progress
**Type:** Feature
**Created:** 2026-11-06

## Description

When a conversation spans days, the chat shows a line where the day changes, as messaging apps do: Today, Yesterday, the weekday, then the date. The view that had no times on its bubbles now shows them.

## Why It's Needed

Older pages load into the same list, so a person cannot tell when a message was written (Juan, 2026-11-06).

## Business Case

- Trust: people can place what an agent said and when.

## Implementation Plan

- `withDividers` and `dayLabel` in `lib/chat-utils.ts`, used by both views. Effort: S.
