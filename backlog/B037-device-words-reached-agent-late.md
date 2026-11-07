# B037 — Words from a device reached the agent 15 seconds after they were ready (to check)

**Status:** Todo
**Type:** Bug
**Created:** 2026-11-07

## Description

In the test of 2026-11-07, the host logged `device.input` from the MacBook at 02:06:41, and the words appeared in Lola's conversation at 02:06:56: 15 seconds later. On the next two turns they appeared within a second. The cause is not known. Lola may have been finishing another turn, or the message path waited.

## Why It's Needed

A person at a device already waits for the agent to think (10 to 12 seconds per turn in the same test). 15 more seconds makes it feel broken.

## Business Case

Talking at a device has to feel like talking to someone.

## Implementation Plan

- Read Lola's transcript and the wake-chain logs around 02:06:41: was she mid-turn, and which delivery path was used (Stop hook, prompt injection, pane push)? See the memory note on the three notification paths.
- If it is the queue behind a busy turn, decide whether device input should interrupt.
- Log the time from `device.input` to the agent's first sight of it, so this can be measured.
- Related: F082, B036. Effort: S to find, unknown to fix.
