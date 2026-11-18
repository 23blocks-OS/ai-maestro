# Chat beside every terminal (F111)

Status: building, 2026-11-11. Backlog: [F111](../backlog/F111-chat-beside-every-terminal.md).

## 1. Goal

Wherever AI Maestro shows an agent's terminal, the person can switch to the same agent's chat in the same place. The chat is shown first.

## 2. Views

| View | The switch goes | Default |
|---|---|---|
| Zoom, expanded card (`components/zoom/AgentCardView.tsx`) | A **Chat** tab before **Terminal** | Chat |
| Team meeting room (`components/team-meeting/MeetingTerminalArea.tsx`) | Above the active agent's pane, top right | Chat |
| Companion (`app/companion/page.tsx`) | Above the terminal pane, beside the avatar | Chat |
| Immersive (`app/immersive/page.tsx`) | In its top bar | Terminal: the view exists to show the terminal full-screen |

Not changed: the main dashboard and the mobile and tablet dashboards, which have both already.

## 3. Behaviour

1. **One component.** `components/ChatTerminalSwitch.tsx` is a two-button segmented control, Chat and Terminal, with `aria-pressed`. Shortcut: none (the terminal takes the keys).
2. **The choice is remembered per view**, in localStorage: `aimaestro-view-<view>` = `chat` | `terminal`. It applies to every agent shown in that view.
3. **Both stay mounted.** Whichever view is hidden uses `visibility: hidden` and `pointer-events: none`, never `display: none`, so the terminal keeps its size and scrollback (terminal rules in CLAUDE.md). After switching back to the terminal, the view dispatches a window `resize` so the terminal fits.
4. **One live chat socket per view.** `ChatView` gets `isActive` only while it is visible. In the meeting room, only the active agent's chat is mounted. Changing the active agent remounts the chat with `key={agent.id}`.
5. **Agents on other hosts** work as on the dashboard: `ChatView` reaches the agent through its host (`getAgentBaseUrl`).
6. **Agent with no session.** The chat still shows the conversation history (ChatView reads the transcript); the terminal side keeps the view's own "no session" message.
7. **Status** comes only from the shared store (`useSessionActivity`); the switch adds no status logic.

## 4. Out of scope

- Several chats side by side in the meeting room (one per agent tile). That is a later step, if the single active chat works.
- Streaming mode in these views.

## 5. Tests

- A unit test of the switch: renders both buttons, reports the choice, reads and writes the remembered value.
- A render test per view: the chat is the default and the terminal stays mounted, hidden.
- In a browser (agent-browser, on a build with the change): open the Zoom view and the meeting room, switch, send nothing.
