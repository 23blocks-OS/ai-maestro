# B031 — The compaction summary shows in the chat as the person's message

**Status:** Done (0.106.69)
**Type:** Bug
**Created:** 2026-11-05

## Description

After Claude Code compacts a conversation, it writes a summary ("This session is being continued from a
previous conversation that ran out of context …") as a `user` line. The chat drew it as the person's
message. Reported by Juan on 2026-11-05.

Cause: B024 (0.106.68) turned system text into system notes by Claude Code's `isMeta` mark, but the summary
line is marked differently: `isCompactSummary: true` and `isVisibleInTranscriptOnly: true`, with `isMeta`
unset. Checked on 150 transcripts: the only user lines with `isVisibleInTranscriptOnly` are these summaries.

Expected (as B024): a system note, shown only in X-Ray.

## Why It's Needed

A summary is long, written in the third person about the person, and looks like something they sent.

## Business Case

Same as B024: the chat must show only what the person actually said as theirs.

## Implementation Plan

- `lib/chat-transcript.mjs`: a user line with `isCompactSummary` or `isVisibleInTranscriptOnly` becomes a
  `system_notice` of kind `compact-summary`; `ChatView` labels it "Conversation summary after compaction".
- Test with the real line shape. Checked on 60 real transcripts: 73 summaries now system notes, none left as
  the person's.
- The mobile app already hides every `system_notice` (0.106.68 brief), so it needs no change.
- Effort: S. GitHub issue: #786.
