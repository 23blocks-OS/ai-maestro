# Spec: the chat shows what the agent is doing (B038)

Spec of 2026-11-08. Bug B038. Applies to the tmux chat path (`ChatView.tsx`, `MobileChatView.tsx`) and the phone app. The streaming chat (`StreamingChatView.tsx`) has its own events and is out of scope. Read `docs/CHAT-ARCHITECTURE.md` first.

## 1. The problem

The person sends a message and the chat shows nothing until the reply arrives: no "received", no dots, no "Working". They can't tell whether the agent got the message, is working, or is stuck. So they send the message again or interrupt the agent. The phone app behaves the same way.

## 2. How it works today (read from the code on 2026-11-08, v0.106.111)

The chat has three separate signals, and none of them covers the case on its own:

| Signal | Source | Where it shows | Gap |
|---|---|---|---|
| **Presence** (Working / Needs you / Ready) | The server status feed, through `hooks/useSessionActivity.ts`, read with `presenceOf(agent)`. This is the single status source | The header line only: "Working · Bash · yarn test…" (`ChatView.tsx` ~1020, `MobileChatView.tsx` ~1069–1079) | Small, at the top of the screen, away from where the person is looking (the bottom, next to the message they just sent) |
| **Live activity** (`chat:activity`) | `server.mjs` ~2306–2320: scraped from **PTY output** by `extractPtyActivity`, sent only to chat clients of a session that has a PTY | The bouncing dots in the message list (`ChatView.tsx` ~1389; `MobileChatView.tsx` ~978) | **A chat-only client has no PTY.** `server.mjs` ~1931–1945 creates a stub session with `ptyProcess: null` when the chat connects without a terminal open. No PTY means no `chat:activity` and no dots. That covers the phone app and anyone on the Chat tab without opening the Terminal tab |
| **Local guess** | `ChatView.tsx` `activityState` and `MobileChatView.tsx:663` `isWorking`, worked out from the view's own messages (the last message is from the user, `pendingMessages`, `sending`) | `ChatView` uses it only to *gate* the dots (it needs `'thinking'` **and** `liveActivity`). `MobileChatView` computes `isWorking` and **never uses it** | A per-view status guess, against the single-source rule |

Two smaller gaps:

- **No "received".** The server answers `chat:sent` after the send (`server.mjs` ~2007, ~2514), and `ChatView` ignores it (`case 'chat:sent': break`). So the person never learns that the message reached the agent's input. The pane readback (`lib/pane-readback.mjs`) already knows whether the text was submitted, but the chat doesn't hear it.
- **The dots disappear between tools.** The server clears `chat:activity` whenever new messages arrive (`server.mjs` ~630). In ChatView, the dots need `liveActivity` to be set. So while the model thinks after a tool, which can take tens of seconds, the dots are gone even though the agent is working.

To check during the fix:

- Does presence also fail for some agents? For example remote agents, Codex and other programs, or a missing hook. The report says "no idea at all", which may mean the header doesn't show "Working" either.
- Does the phone app read the same status feed?

## 3. What the person should see

One sequence, the same on desktop, tablet, phone browser and the app:

| Moment | Shown at the bottom of the chat, under the last message |
|---|---|
| Just sent | The message bubble with **Sending…** |
| The text reached the agent's input and was submitted (pane readback, or the Claude Code `UserPromptSubmit` hook) | **Delivered** under the bubble |
| The agent is working (presence `working`) | The dots, with the detail when known: "Bash · yarn test", "Reading · lib/agent.ts", "Thinking". When there is no detail, the dots and **Working** |
| The agent needs the person (presence `needs-you`) | The question or approval card, as today. No dots |
| Done (presence `ready`, the reply is in) | Nothing. The reply is the signal |
| No change for 2 minutes while "working" | Keep the dots, and add **Still working · 2 min**, so a long tool run doesn't look stuck |
| Sent, but no "Delivered" after 15 seconds | **Not delivered yet**, with a **Retry** action. This replaces the silent wait |

The header keeps its status line as it is.

## 4. The design

1. **The dots follow presence, not PTY output.** The in-list indicator shows whenever `presenceOf(agent) === 'working'`. That works for every client, terminal open or not, and on every host, because presence comes from the server feed.
2. **The detail comes from the server, never from a PTY the client may not have.** Order of sources:
   1. the tool and its argument from the hook (`PreToolUse` gives the tool name and input; the feed's snapshot already carries "Bash · yarn test" for the header, so reuse it through `snapshotOf(agent)`)
   2. `chat:activity` when a PTY exists
   3. no detail, just "Working"

   The server keeps the last detail until presence leaves `working`, so the dots don't vanish between tools.
3. **"Delivered" is an event from the server.** After `sendChatMessage` confirms the submit (pane readback or the prompt hook), the server sends `chat:delivered` with the client's message id. The client marks that bubble. `chat:sent` stays as "the server accepted it".
4. **Delete the local guesses.** Remove `isWorking` in `MobileChatView.tsx:663` (unused) and replace `activityState`'s guessing in `ChatView.tsx` with presence. Keep only the parts that are not status (`sending`, the permission card) as they are.
5. **One component for the indicator,** used by `ChatView`, `MobileChatView` and, if it renders chat itself, the app. The rule: one status source, one rendering.

## 5. Files

| Area | Files |
|---|---|
| Indicator | A new `components/chat/ChatWorkingIndicator.tsx`, used by `ChatView.tsx` and `MobileChatView.tsx` |
| Status detail | `services/sessions-service.ts` (`getActivity` and the snapshot: keep the last tool detail while working), `lib/agent-presence.ts`, `hooks/useSessionActivity.ts` (`snapshotOf`) |
| Delivered | `server.mjs` `sendChatMessage` (send `chat:delivered` after the submit check); both chat views mark the bubble |
| Remove | `isWorking` (`MobileChatView.tsx`), `activityState`'s status guesses (`ChatView.tsx`) |
| App | The app's chat screen: same feed, same states. Check its code first |
| Docs | `docs/CHAT-ARCHITECTURE.md`: the working-state section |

## 6. Tests

- Unit: the indicator renders from presence and the snapshot alone, with no `chat:activity` (the chat-only case).
- Unit: the detail persists across a message arriving while presence is still `working`.
- Server: `chat:delivered` is sent once per message, after the submit check, and never on a failed submit.
- Manual, on every one of these:
  - **Chat only:** this Mac's agent, with the Chat tab open and the Terminal tab never opened.
  - **Terminal open:** the same agent, with the Terminal tab also open.
  - **Remote:** an agent on another host, opened from this one.
  - **Phone:** the phone browser.
  - **App:** the phone app.
  - **Codex:** a Codex agent, whose presence comes from its transcript.
- Canary: count tmux sessions before and after the tests (the never-kill rule).

## 7. Done when

- In all six cases above, the person sees **Sending… → Delivered → dots with a detail or "Working" → the reply**, with no gap longer than 2 seconds after the agent starts working.
- No status in a view is computed from that view's own data (`grep` for `isWorking` and `activityState` status guesses finds none).
- Version bump and CHANGELOG entry. Deploy to the hosts with `update-aimaestro.sh`.

Size: M (2–3 days), most of it in testing across hosts and the app.
