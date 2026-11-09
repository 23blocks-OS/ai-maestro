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

- Does presence also fail for some agents? For example remote agents, Codex and other programs, or a missing hook. The report says "no idea at all", which may mean the header doesn't show "Working" either. **Answered after the deploy, for remote agents: yes, the other way round. They show Working while idle. See section 8.**
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

## 8. Reopened: an agent on another host shows Working while idle

Added 2026-11-08, after v0.106.112 was deployed.

### What shipped in v0.106.112

Steps 1, 4 and 5 of section 4, a "Delivered" from `chat:sent` (sent after the submit check, not a new `chat:delivered` event), "Not delivered yet" with Retry, "still working, N min", and the same in the app. Not done: the hook detail from the snapshot (step 2.1) and keeping the detail between tools.

### What went wrong

Dahlia (`operario-dev`, on mac-mini) was idle, but opened from this Mac she showed Working with moving dots, then flickered to Ready and back. At the same minute:

| Feed | `operario-dev` |
|---|---|
| mac-mini, its own `/api/sessions/activity` | `status: idle`, `hookStatus: waiting_for_input`, `notificationType: idle_prompt` |
| this Mac, `/api/sessions/activity` | `status: active`, no hook status |

How this Mac gets `active`:

1. Opening a remote agent's chat or terminal makes this Mac proxy the socket to the other host (`server.mjs` ~1218–1330; the chat-only proxy at ~1910).
2. The proxy calls `sessionActivity.set(sessionName, Date.now())` on connect and on **every message** from the other host (~1305, ~1326): idle screen redraws, chat history replies, anything 3 characters or longer.
3. `getActivity` (`services/sessions-service.ts` ~700–731) finds no hook state for the agent, because the hook's state file is on the other host's disk. So it uses terminal output: a message in the last 3 seconds means `active`.
4. Presence is therefore "Working" whenever the socket is busy. Since v0.106.112 the dots follow presence, so they move too.

The other host's status was already being fetched, then thrown away: `services/status-snapshots-service.ts` `refreshRemote` calls `GET <host>/api/sessions/activity?local=true` every 15 s for the snapshots, and keeps only `data.snapshots`, not `data.activity`.

### The rule

**An agent's status comes from the host where the agent lives.** A host that only proxies the agent's socket measures nothing about it: the proxy traffic is screen redraws and chat replies, not work.

### Code review of this plan (2026-11-08)

The first version of this section only removed the proxy's writes and merged the other host's feed. A review against the code found that this would stop the flicker but would not give the right status:

1. **Cloud agents use the same proxy.** `handleRemoteWorker` also serves `deployment.type === 'cloud'` agents (`server.mjs` ~2088). They have no host feed, so their proxy traffic is the only activity signal they have. Removing the writes everywhere would leave them never Working.
2. **The other host's own status is wrong while a terminal or chat is open.** That is exactly the case when this Mac opens the agent, because the other host then has a PTY for it. The hook writes its state file under the folder the agent is in at the moment (`input.cwd`, `ai-maestro-hook.cjs` ~1204). Dahlia has 12 state files, one per subfolder. With a PTY, `getActivity` (`sessions-service.ts` ~705) reads only the file for the agent's top folder and ignores `hookStatusMap`. That map is keyed by agent (the hook resolves the agent from `AIM_AGENT_ID`) and is right. So an agent that changes folder can show Ready while it works, or Working long after it stopped. The no-PTY branch (~765) already takes the newer of the two; the PTY branch does not.
3. **The transcript's modified time is not proof of work.** `transcriptResumedSince` (`sessions-service.ts` ~1496) compares the file's mtime with the hook report. On mac-mini at 02:43 UTC, 3m-gm, 3m-support, tct-hr and tct-gm showed `status: active` with `hookStatus: waiting_for_input` / `idle_prompt`. 3m-gm's last entry is `turn_duration` at 01:00:15 (her Stop), but the file's mtime is 02:05:39: it was modified with no new turn. She has been Working since, while idle. Merging the remote feed would show that on every host. This also affects agents on this host.
4. **The remote copy can go stale and loop.** `refreshRemote` sets `entry.at` in `finally`, also after a failed request, and keeps the last copy. A host that drops off would keep its agents' last status (maybe Working) indefinitely. And if `?local=true` requests also merged remote entries, two hosts would keep passing each other's copies back.

### The fix

1. **Keep the other host's activity.** `refreshRemote` keeps `data.activity` beside `data.snapshots` (the same request, no new traffic), and records `okAt`, the time of the last successful fetch, separately from `at`.
2. **Use it in the feed, with limits.** `getActivity` (used by the route and the headless router) adds each remote host's entries for agents this host has none for. A local entry always wins. Not for `?local=true` requests. A host's copy older than 60 s (`okAt`) is dropped, so its agents fall back to no status (Ready while online) instead of a frozen one.
3. **The proxy stops writing status for agents on a peer host.** `handleRemoteWorker` gets an option for that: the peer-host callers (~1920 chat-only, ~2066 terminal) turn the `sessionActivity.set` calls off; the cloud caller (~2088) keeps them.
4. **The PTY branch takes the newest hook report.** In `getActivity`'s PTY branch, use the newer of the top-folder state file and a fresh `hookStatusMap` entry, as the no-PTY branch already does. The file still gives the transcript path when it is the one used.
5. **"Resumed" means a new entry, not a newer mtime.** `transcriptResumedSince` reads the last few KB of the transcript and compares the **timestamp of the last entry** with the hook report (+3 s). A file modified without a new entry is not a resume. Use the mtime only as a quick skip (mtime not newer = no resume).
6. **No change in the views.** They keep reading `presenceOf(agent)`; the fix is at the server (the single-source rule).

Trade-off: a remote agent's status is as fresh as the last fetch, so up to about 15 s behind on the server, plus up to 30 s in the browser's snapshot poll. A turn of a few seconds may not show at all. "Delivered" still comes at once. Late but correct is better than live and wrong. If it is too slow, the next step is for each host to listen to its peers' `/status` sockets, which is a separate change.

Known limit, not changed here: an agent on this host and one on another host with the same name share one status entry (the feed is keyed by name first).

### Files

| Area | Files |
|---|---|
| Keep remote activity | `services/status-snapshots-service.ts` (`refreshRemote`: keep `activity`, add `okAt`; an accessor for fresh remote activity) |
| Merge into the feed | `services/sessions-service.ts` `getActivity` (a `localOnly` option); callers: `app/api/sessions/activity/route.ts`, `services/headless-router.ts` (~698) |
| Newest hook report | `services/sessions-service.ts` `getActivity` PTY branch (~700–731) |
| Resume check | `services/sessions-service.ts` `transcriptResumedSince` (~1496) |
| Proxy | `server.mjs` `handleRemoteWorker`: an option that turns off `sessionActivity.set`, used by the peer-host callers only |

### Tests

- Unit: an agent with only proxy traffic from a peer host (no hook state) is not `active`. A cloud agent with proxy traffic still is.
- Unit: a remote host's `idle` / `active` / `waiting` entry reaches the merged feed; a local entry with the same name wins; `localOnly` gets no remote entries.
- Unit: a remote copy older than 60 s (failed fetches) is dropped, not kept.
- Unit: PTY branch: a top-folder file that says `idle_prompt` and a newer `hookStatusMap` entry that says `active` give `active`, and the reverse gives idle.
- Unit: a transcript whose mtime is newer than the report but whose last entry is older (the 3m-gm case) is not a resume. A new `user` / `assistant` entry after the report is.
- Manual, after deploy:
  - Dahlia (or any mac-mini agent) opened from this Mac, idle, with the chat and the terminal open: Ready, no dots, no flicker for 2 minutes. Send her a message: Working within about 45 s, Ready after the reply.
  - mac-mini's own feed: 3m-gm, 3m-support, tct-hr and tct-gm show idle.
  - An agent that works in a subfolder: Working during the turn, Ready after, on its own host with its terminal open.
- Canary: tmux count before and after.

### Done when

- An idle agent on another host shows Ready on every host that opens it, with its chat or terminal open, and never flickers.
- A working agent on another host shows Working, no more than about 45 s late.
- No agent on any host shows `status: active` with an idle hook report unless its transcript has a newer entry.
- Cloud agents still show Working from their proxy traffic.
- Version bump, CHANGELOG, deploy to all three hosts, and the same fix to the public repo (it has v0.106.112 too).

Size: M (1–2 days with the tests and the host checks).
