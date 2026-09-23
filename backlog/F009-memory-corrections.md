# F009 — Corrections as their own kind of memory

**Status:** Done
**Type:** Feature
**Created:** 2026-09-23

## Description

When the user corrects the agent ("no, that bucket is production", "that
makes no sense, use service discovery"), that is the most valuable thing to
remember and the rarest. Each user turn is judged by Jev against what the agent
said just before it ("is the user correcting the assistant?"). Corrections get
into memory on a lower bar, the summarizer states the right way (action
`corrected`), recall ranks them slightly higher, and the session-start primer
includes them.

## Why It's Needed

Repeating a mistake the user already corrected is the most frustrating thing an
agent can do, and the plain "durable / important" questions scored casual
corrections ("no, the other one") too low to keep.

## Business Case

Direct user-trust win; also the best raw material for F008 (skills).

## Implementation Plan

Shipped in v0.43.0: `CORRECTION_QUESTION` + `MIN_CORRECTION` (0.75, calibrated
on 74 real turns) in lib/memory/jev-provider.ts; previous-reply context in
passages; harness notifications stripped; summarizer instructions; `corrected`
action; recall bonus and primer; hook label. Open: measure how often recalled
corrections prevent a repeat (F007).
