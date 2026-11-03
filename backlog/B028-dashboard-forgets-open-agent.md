# B028 — The dashboard forgets which agent was open and opens another one

**Status:** Done (0.106.67)
**Type:** Bug
**Created:** 2026-11-03

## Description

When the person refreshes the dashboard, or comes back to it from another page (for example from the org
chart to home), it opens a different agent than the one they were talking to. A person who keeps typing
then sends the message to the wrong agent: messages get crossed.

Cause, from the code (`app/page.tsx`):

- `activeAgentId` lives only in React state. Nothing stores it (no URL update, no localStorage).
- Only a `?agent=` (or legacy `?session=`) link sets it on load.
- Otherwise an effect (around line 308) selects **the first online agent** as soon as agents load. That is
  the "random agent": whichever is first in the list at that moment.

Expected: after a refresh or a return, the same agent is open. If that agent no longer exists, show no
agent selected (or a clear choice), never a silent pick that the next message goes to.

## Why It's Needed

A message sent to the wrong agent is acted on by the wrong agent: work done twice, private context sent to
the wrong crew, or a task lost.

## Business Case

Trust and safety of the main interaction. The chat is where people instruct agents; it must never switch
the recipient behind their back.

## Implementation Plan

- Save the open agent per browser (localStorage, keyed by host so several dashboards do not mix) when it
  changes; restore it on load before the auto-select runs. Keep `?agent=` links winning over the saved one.
- Consider also writing `?agent=<id>` into the URL (replaceState) so a refresh or a shared link keeps it.
- Change the auto-select: only when nothing was saved and nothing is in the URL. If the saved agent is gone,
  select nothing and say so.
- The phone layout keeps its own agent (`phoneLink`); apply the same rule there. The mobile app is
  separate: tell ai-maestro-app.
- Pages that link back to the dashboard (org chart, Zoom, people) should link with `?agent=` when they
  know the agent.
- Tests: the restore order (URL, then saved, then nothing).
- Effort: S. GitHub issue: #773.
