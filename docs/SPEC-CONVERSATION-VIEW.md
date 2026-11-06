# Spec: See the conversation of any agent (F087)

Status: draft, 2026-11-05. Backlog: [F087](../backlog/F087-conversation-view-without-tmux.md).

## 1. The idea

Typing into an agent is only possible through tmux. But seeing what an agent is doing does not need tmux. When a person
cannot type into a session, they can still send a message (AMP, email), and seeing the conversation tells them what is
going on and what their next message should be.

So AI Maestro separates two things that are mixed today:

- **See:** read the agent's conversation. Works for every agent that has a transcript on its host.
- **Reach:** get something to the agent. Which way depends on how the agent runs now.

The conversation belongs to the agent, not to tmux. It is the same conversation when the agent moves between tmux, its own
terminal and sleep.

## 2. What exists

| Part | State |
|---|---|
| History | `GET /api/agents/[id]/chat` and `getChatHistory` find the transcript by folder, with no tmux. Tested on an outside agent. |
| Live updates | The `chatOnly` socket (`/term?…&chatOnly=1`) attaches no terminal, creates a stub when no tmux exists, and routes to other hosts. `startJsonlWatcher` is keyed by session name and agent. |
| New conversation | The watcher looks for a newer transcript every 10 s, with a guard against subagent files. |
| Paged history | `chat:requestHistory`. |
| Honest send | `sendChatMessage` refuses when there is no tmux session and says so. |
| How it runs | `session.runtime` (now) and `session.lastRuntime` (last seen), 0.106.71. |
| Other programs | Transcript readers for Claude Code, Codex, Grok, Pi, Copilot. |
| A person's messages | `sendAsPerson`, signed on the device; person-to-agent thread (F032). |

What stops it today: `app/page.tsx` shows the hibernated and "running outside tmux" screens before the chat, and the chat's
input assumes a pane. The app has the same gates.

## 3. Rules

1. **Show history whenever a transcript exists.** Never replace it with an empty screen.
2. **Say how a message will reach the agent, before the person types.** A person must never think they are typing into a
   live session when they are not.
3. **Never claim more than we know.** "Sent" is not "read". Use the proof we have.
4. **One agent, one conversation view.** A move between tmux and outside changes the input, not the screen.
5. **Show only the agent's own session.** Another session in its folder is not the agent's conversation.
6. **Status from one source.** The view reads `runtime` and `lastRuntime` from the server feed; it computes nothing.

## 4. How a person reaches the agent

The input bar changes by state. The server feed gives everything needed:

| State | From | History | Input | Bar says |
|---|---|---|---|---|
| **Live in tmux** | `runtime: terminal` | yes | Types into the pane, as today | (normal chat) |
| **Live streaming** | `runtime: streaming` | yes | SDK path, as today | (normal chat) |
| **Live outside** | `runtime: outside` | yes, live | Sends an AMP message | "Runs in its own terminal. Your message arrives at its next turn." |
| **Stopped outside** | offline, `lastRuntime: outside` | yes | Sends an AMP message | "Stopped. It reads your message when it next runs." |
| **Hibernated** | offline, `lastRuntime: terminal` or `streaming` | yes | Wake, and a message | "Asleep. Wake it, or leave a message." |
| **Never ran here** | offline, `lastRuntime: null` | none | A message | "No conversation on this host yet." |

Other ways to reach an agent go in the same bar when the agent has them, for example its email address. AMP stays the
default. Sending by email or any other route is a choice the person makes, not a fallback that happens silently.

## 5. The cases

### Moves between tmux and outside

**A. Starts alone, then joins tmux.** The agent runs in its own terminal, the person closes it, and later wakes it in AI
Maestro. `runtime` goes `outside` → null → `terminal`. The view stays open and the input changes to the pane. If the wake
resumes the conversation, history continues. If it starts a new one, see case F.

**B. In tmux, then runs alone.** The session is hibernated or closed, then someone runs `claude --continue` in the folder.
The hook reports the new session id; `runtime` becomes `outside`. The input changes to AMP.

**C. Moves while the view is open.** The input bar follows the status feed at once. A half-typed draft stays. If a send is
refused because the state changed, the text stays in the box and the bar says why (the existing rule: never lose what a
person wrote).

**D. Live in both.** Starting a second copy is already refused: wake and the mode switch check `runningOutsideTmux`. If it
happens anyway (a person starts one by hand), the view shows the agent's own session (its `claudeSessionId`), and the
input follows `runtime`, where `terminal` wins because it is the one AI Maestro can reach.

**E. Crash.** An outside process dies with no SessionEnd. `runningOutsideTmux` checks the pid, so `runtime` goes to null,
and `lastRuntime` stays `outside`: Stopped outside. Known limit: a pid reused after a reboot reads as alive, within the
12-hour window.

### Which conversation

**F. A new conversation** (`/clear`, a fresh start, a wake that does not resume). Claude Code starts a new file. The view
switches to it, as the watcher does today, and shows a line: "New conversation". The earlier one is not lost: see
section 7.

**G. Another session in the folder.** The folder lookup takes the newest file, which may not be the agent's: a person
may run a one-off `claude` there. Fix: when the agent has a `claudeSessionId`, prefer `<id>.jsonl`, and fall back to newest
only when that file does not exist. This also ends the subagent flap at its source. This is the one change to how the
transcript is chosen, and it applies to the tmux case too, so it needs care (section 9).

**H. Compaction.** The same file continues. The summary is a system note in X-Ray (B031).

**I. Resume writes a new file.** If resuming changes the session id, the hook's heartbeat updates `claudeSessionId`, and the
view follows. Check on the real version of Claude Code; do not assume.

### Where the transcript is

**J. Runs outside on another machine.** The agent is registered on host A but runs on a laptop that sends heartbeats. The
transcript is on the laptop, so A has nothing. `runtime: outside`, no transcript: the view says "Its conversation is on
another machine." It does not show a stale local file as if it were current: compare the file's time with the last
heartbeat, and warn when the file is much older.

**K. Agent on another host.** `chatOnly` already routes there. Works the same.

**L. Agent moved to another host.** Transcripts live in `~/.claude/projects`, not in the agent's folder, so they stay behind.
The view shows what the new host has. Carrying them is out of scope here; it belongs with agent export (F081 is the model).

**M. Folder changed.** The transcript is keyed by folder, so a new folder means a new, empty history. Say so; do not guess.

**N. A program with no transcript reader** (OpenCode, OpenClaw, a plain shell). "This program has no conversation to show."
The terminal stays as it is for tmux agents.

### What cannot work without a pane

**O. Questions and approvals.** They appear in the transcript, but nothing can press the key. The card shows read-only:
"Waiting for an answer in its terminal." A person may still send a message. It must not offer buttons that do nothing. The
pane-based detection (`detectPermissionFromPane`) does not run, so a card comes only from the transcript.

**P. Status of an outside agent.** Working, Needs you and Ready come from the hook state, which works outside tmux. No change.

**Q. Stop, restart, terminal tab.** Hidden or disabled for outside agents, with the reason. Wake is offered only when
`runtime` is null.

### Messages from the person

**R. The message in the view.** An AMP message appears in the transcript only as a system notice, and only once the agent
reads it. So the view shows the person's own message from the person's sent messages, as an outgoing bubble with its state:
Sent, then Read when the agent reads it. It must not be drawn twice when the notice arrives.

**S. Who sent it.** The agent sees the person's name, not an id (B033).

**T. Wake on message.** A message to a hibernated agent wakes it only by the rules of F073. To a stopped outside agent, it
waits in the inbox (F088 is the idea that changes this).

## 6. Server changes

Small, on purpose:

- `resolveJsonlPath`: prefer the agent's own session file (case G).
- Check that the `chatOnly` path starts the watcher, reads hook state and survives with no pane for each state. Guard
  every pane read (`capturePane`, `detectPermissionFromPane`) with the session's existence.
- `getChatHistory` and the endpoint: add `conversationAge` so the client can warn (case J), and `canAnswer: false` when
  there is no pane.
- No new routes. Next and headless stay as they are.

## 7. Earlier conversations (later)

An agent has many transcript files. First version: only the current one, with paging. Later: a list of earlier
conversations in the view. Reading only; no picker that changes what the agent resumes.

## 8. Client changes

- `app/page.tsx`: outside, stopped and hibernated agents reach the chat view. The Wake button moves into the input bar.
- `ChatView.tsx` and `MobileChatView.tsx`: one small component for the input bar by state, used by both, so the two do not
  drift. Read `docs/CHAT-ARCHITECTURE.md` first.
- Read-only question card.
- The app (ai-maestro-app) follows with the same states; the server contract is the same.

## 9. Risks

- **Choosing the transcript by session id changes the tmux path.** A stale `claudeSessionId` could show an old conversation
  to a live agent. Rule: use the id's file only if it is at least as recent as the newest file in the folder minus the
  60-second guard the watcher uses, or if the session is live. Test on real agents first.
- **Privacy.** The view shows a whole conversation to anyone who can reach the dashboard. This is already true for agents in
  tmux, and it follows the no-auth trust model. It is new for people who run an agent in their own terminal, so the
  agent's profile should say that its conversation is visible in AI Maestro.
- **Cost.** One 1-second file poll per open view, as today. Nothing runs when nobody is watching.

## 10. Tests

- Each state in section 4 shows the right history and input bar.
- Moves: outside → tmux, tmux → outside, while the view is open, with a draft in the box.
- A new conversation switches files, with a line in the view.
- Another session in the folder does not replace the agent's (case G); a stale session id does not hide a live one.
- No transcript, transcript on another machine, program with no reader.
- A question shows read-only; there are no working buttons.
- A person's AMP message shows once, with its state.
- Real check: this agent (outside), a hibernated agent, and an agent moved outside → tmux → outside.

## 11. Delivery

| Step | Contents |
|---|---|
| 1 | Screens reach the chat view; read-only input bar by state; web only. Most of the value. |
| 2 | Sending by AMP from the bar, outgoing messages in the view, read-only cards. |
| 3 | Transcript by session id (case G), stale warning (case J). |
| 4 | The app. |

Effort: M, mostly client.

## 12. Open questions

1. Should a person be able to turn this off for an agent they run privately?
2. Sent, then Read: does the app's thread already show this? Reuse it if so.
