# F111 — Chat beside every terminal

**Status:** In Progress
**Type:** Feature
**Created:** 2026-11-11

## Description

Every view that shows an agent's terminal also offers the agent's chat. A **Chat | Terminal** switch is placed where the terminal is. The chat is the default, as on the main dashboard.

Views that have a terminal and no chat today:

| View | Where | Today |
|---|---|---|
| Zoom (agent grid, expanded card) | `/zoom`, `components/zoom/AgentCardView.tsx` | Tabs Terminal, Messages, Profile, Memory |
| Team meeting room | `/team-meeting`, `components/team-meeting/MeetingTerminalArea.tsx` | The active agent's terminal only |
| Companion | `/companion`, `app/companion/page.tsx` | The avatar, and its own xterm beside it |
| Immersive | `/immersive`, `app/immersive/page.tsx` | A full-screen xterm |

The main dashboard (`app/page.tsx`) and the mobile and tablet dashboards have both already.

## Why It's Needed

The chat now does more than the terminal for most work: it renders questions and permission cards, sends text reliably (pane readback), shows tool calls, files, images and secret and SQL cards, and searches the conversation. In the meeting room and the Zoom view, the operator has to read raw terminal output, or leave the view to answer a question. Juan: "all the experiences that have a terminal view, like zoom meetings, need to have a chat as well, now that the chat is very good".

## Business Case

- One way to talk to an agent, wherever it appears. Less switching between views.
- The meeting room becomes usable for running a crew: read each agent's chat and answer its questions in place.
- New users meet the chat first, not a raw terminal.

## Implementation Plan

Spec: [docs/SPEC-CHAT-EVERYWHERE.md](../docs/SPEC-CHAT-EVERYWHERE.md).

- **Shared switch:** `components/ChatTerminalSwitch.tsx`, with the choice kept per view in localStorage.
- **Each view:** keep its terminal mounted, hidden with `visibility: hidden` (terminal rules), and mount `ChatView` for the agent. Only the visible chat is active (`isActive`), so one chat socket is open per view.
- **Effort:** S–M (one cycle day).
