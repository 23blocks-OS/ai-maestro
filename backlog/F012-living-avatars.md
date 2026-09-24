# F012 — Agents that look alive (animated avatars)

**Status:** Blocked (paid video key)
**Type:** Feature
**Created:** 2026-09-23

## Description

Each agent's avatar becomes a short seamless loop that matches its live state,
the way Meta's Muse shows a working agent "typing away on a laptop":
idle (breathing, blinking), working (looking down at a screen, typing out of
frame), waiting for you (looking at the camera), asleep (hibernated, eyes
closed). Loops live in the agent's directory, so they move with the agent.

First three: Titania (23blocks-iac, `women_62.png`), Lola (pas-lola on
mini-lola, `women_43.png`), Jarvis (`23blocks-api-jarvis`, label Zaiden,
`men_39.png`; crop its white frame).

## Status (2026-09-23)

- **Prepared, never run:** `scripts/avatars/generate-veo-loops.mjs`. Veo 3.1
  Lite via the Gemini API (`predictLongRunning`), image-to-video, the portrait
  as both first and last frame for a seamless 4 s loop, 9:16 input (portrait at
  the bottom, the photo's own backdrop edge stretched above it: flat padding
  showed as bands, a blurred copy as ghost faces), cropped back to a 512×512
  square, audio stripped. 4 states × 3 agents = 12 clips.
- **Blocked on:** a Gemini API key with billing (Veo has no free tier). Key goes
  to `~/.aimaestro/gemini.key` (0600) from the user's own terminal, never chat.
  Get it at https://aistudio.google.com/apikey and set up billing on its project.
- Plan: generate Titania idle first, review quality, then the rest.

## Why It's Needed

"I want those agents to look alive." Agents are presented as employees with a
face; a face that reacts to what the agent is doing makes the fleet readable at
a glance and makes the product feel alive (Meta Muse, OpenMuse set the bar).

## Business Case

Highly visible, demo-able differentiation for low cost (a few dollars of video
generation per agent, once; regenerated only when the look changes).

## Implementation Plan

1. Run the script (above) once billing exists; review.
2. Serve loops per agent (`/api/agents/:id/avatar/:state`, from the agent dir).
3. `<LiveAvatar>` component: plays the loop for the agent's state (working /
   waiting / permission / hibernated, already known from hooks), falls back to
   the still image; used in the sidebar, the shared header, team views.
4. Free interim: CSS/SVG live status around the still avatar (breathing, state
   ring, typing badge, sleep overlay).
