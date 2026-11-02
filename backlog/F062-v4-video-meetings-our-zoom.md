# F062 - V4: Video meetings in AI Maestro (our own Zoom)

**Status:** Todo (after V2 and V3)
**Type:** Feature
**Created:** 2026-11-02

Stage 4 of 5 in F050. Takes the rest of F054.

## Description

V3 with video: people show their cameras, agents show their faces (V2), and the Zoom view becomes a real meeting grid where each tile is a person's camera or an agent's face, with the agent's state, its current task and its terminal one click away. Screen sharing for people; agents share a canvas or a terminal as their "screen".

## Why It's Needed

It joins the two things AI Maestro already has, a grid of agents and their live work, with a real meeting. Nobody else can show an agent's terminal next to its face in a call.

## Business Case

The demo that sells the product. Built on V2 and V3, so the extra cost is mostly UI: our faces are drawn on each viewer's device, so agents add no video bandwidth unless a photoreal avatar is used.

## Implementation Plan

1. Video tracks in the V3 room (LiveKit handles them) and a grid layout in the Zoom view (M).
2. Agent tiles: the V2 face drawn locally from the agent's audio track, plus state and task (S).
3. Agent "screen share": a canvas page or the terminal view as a tile (S).
4. Photoreal avatar tiles only when a user brings an avatar key (V2 step 4).
5. Bandwidth limits and simulcast settings for phones (S).

Effort: about one 6-day cycle after V3.
