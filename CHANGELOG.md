# Changelog

All notable changes to AI Maestro are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.43.1] - 2026-09-23 — One agent header on every tab

The terminal always showed which agent and host you were on; the chat replaced
the agent's name with its activity ("Agent is working…"), and never showed the
host or folder, so in the chat you needed the sidebar open to know which agent
you were talking to.

- New `AgentHeaderBar`, used by the Terminal, Chat and Streaming tabs: status
  dot, `host / agent`, what the agent is doing next to the name (not instead of
  it), the agent's folder (`~`-shortened, on wide screens), and each tab's own
  tools on the right.
- The folder comes from the agent's stored working directory first (the
  registry is the source of truth), then its session, then its default.

## [0.43.0] - 2026-09-23 — Memory: corrections

When the user corrects the agent ("no, that bucket is production", "that makes
no sense, use service discovery"), that is the most valuable thing to remember
and the rarest. The plain durable/important questions scored casual
corrections too low to keep.

- **Detection.** Each user turn is judged by Jev together with what the agent
  said just before it (including across run boundaries): "is the user
  correcting the assistant?" Threshold 0.75, calibrated on 74 real turns: 0.9+
  were plainly corrections; 0.6-0.75 mixed in harness notifications and status.
- **Kept on a lower bar** (correction >= 0.75 and durable >= 0.5).
- **The card writer** sees corrections marked, with what was corrected, and
  states the right way (action `corrected`); a card resting only on corrections
  is always `corrected`; a correction that repeats a known memory marks that
  memory as a correction.
- **Recall.** Corrections get a small ranking edge (like recurrence) and lead
  the session-start primer, labelled `correction` ("do not repeat it").
- **Noise.** Notifications typed into sessions by AI Maestro and the harness
  ("You have a new message from…", "Read the output file…") are no longer
  classified as the user speaking.
- Backlog: F008 (lessons become skills), F009 (corrections).

First real run (copy of IaC): 6 corrections found; e.g. "WinePro app points to
FluidMind box (…), not prod or the developer source; verify the RDS endpoint
before querying".

## [0.42.2] - 2026-09-23 — Docs: link Jev

The memory page and LONG-TERM-MEMORY.md now link Jev, the System One
classifier by TypeSafe AI that decides what an agent remembers.

## [0.42.1] - 2026-09-23 — Windows (WSL): agents get their own Linux folder, and you can find it from Windows

A Windows user who had installed WSL minutes earlier saw an empty Linux home
in the folder picker, could not reach his Windows folders (the picker said
"Access denied"), and did not know where an agent's files would be.

- **An agent without a chosen folder gets its own, `~/agents/<name>`**
  (created). "Skip (use home directory)" actually used the AI Maestro install
  directory (`process.cwd()`), on every platform.
- **The folder is checked when the agent is created.** `~` is expanded; a
  pasted `C:\...` path is translated to `/mnt/c/...` on WSL; a missing or
  relative folder is refused with a plain explanation. Before, a Windows path
  was stored as the agent's working directory while tmux started it somewhere
  else.
- **WSL is detected**, and a folder on a Windows drive gets a warning (not a
  block): agents are much slower there and file watching and git misbehave.
- **Where the files are, from Windows.** After creation the wizard shows
  `\\wsl.localhost\<distro>\...` with a Copy button and a `code .` hint.
- **Folder picker:** type or paste a path (a `C:\` path works on WSL), New
  folder, an empty home explained as normal on a new WSL install, the Windows
  path of the current folder, no silent selection of the bare home, `/mnt`
  reachable on WSL, the allowlist a real prefix check, and it now works on
  headless hosts (`/api/browse` was Next-only). The onboarding wizard uses the
  same picker instead of a free-text field.
- **Installer:** a Windows `node`, `npm`, `yarn` or `claude` visible on the
  WSL PATH (`/mnt/c/...`) no longer counts as installed; the Linux version is
  installed. WSL tips now say where agents' files live and how to open them.
- **Docs:** "Windows in 5 minutes" at the top of the Windows guide; the
  example that cloned a project into `/mnt/c`, the "5-10% slower" claim and the
  "create sessions anywhere" FAQ are gone; `\\wsl.localhost`; README and
  website notes.
- **Memory:** entity recall skips hubs (entities in a quarter or more of the
  agent's memories), whose relations tell the agent nothing.

## [0.42.0] - 2026-09-23 — Long-term memory is a skill: entities, relations and what a change affects

The agent is the product and long-term memory is one of its skills. Not every
agent needs it; agents that act on systems need the entities involved and how
they relate, kept current, so they act with the consequences in view.

- **Per-agent skill.** Agent profile → Skills → Long-term memory (default on)
  and Recall into prompts. Off: no consolidation, no backfill, nothing injected;
  what was built is kept. The old panel's settings (Ollama, Claude model,
  retention) were never read and are gone.
- **History backfill at night.** A run covers about three conversations, so an
  agent with months of history (IaC: 422 conversations, 6 consolidated) would
  take months. A run that leaves history behind records it, and between 2 and
  8 AM the server keeps consolidating agents with a backlog, one at a time,
  round-robin, newest history first. An agent that makes no progress waits for
  the next night. Nothing runs in the day.
- **Relations that change.** Relations are dated by when the conversation said
  them (not when they were processed, since history is backfilled newest first)
  and can be said to have ENDED ("moved off mini-lola"). A relation's state is
  its latest statement; ended ones show as "no longer" and dashed in the graph.
  Weight = sessions behind it. More verbs chosen for consequences: hosts,
  deploys_to, stores_data_in, reads_from, writes_to, requires, affects.
- **Entity recall.** When a prompt names an entity, the agent is told what it
  relates to, current relations first, strongest first. On IaC, a prompt about
  redeploying 23blocks-api-authentication now brings: crm, sales, search and
  onboarding depend on it; it breaks 23blocks-api-platform.
- **Dates are when it was said.** Recalled memories showed the consolidation
  date, so a February decision rebuilt today read as today's.
- **Only injections count as use.** access_count was bumped by consolidation's
  own searches: 918 of 918 memories looked "recalled". The hook now logs every
  injection to the agent's `memory-recalls.jsonl` and consolidation folds it
  in; old counts were reset once.
- **"long" is now "recurring".** Every consolidated memory is long-term memory;
  recurrence is strength. Migrated once.
- **Docs.** `docs/LONG-TERM-MEMORY.md` rewritten from the reasons and concepts
  to the mechanics; the memory-search skill explains cards, the entity graph
  and "check relations before changing something"; new website page.

## [0.41.13] - 2026-09-23 — Memory from months of history, not only surviving transcripts

Consolidation read only Claude Code transcripts, and Claude Code deletes them
after 30 days. The IaC agent had worked for ten months (422 conversations,
47,166 messages kept in its own index) but one transcript survived, so it had 8
memories. Consolidation now rebuilds a conversation from the agent's message
index when its transcript is gone (full text; duplicate index rows dropped),
processes conversations newest first, and keeps index progress under its own
key so a transcript deleted later is neither skipped nor double-counted.
First run on IaC: 8 → 32 memories from 3 conversations (more on later runs).

**Secrets.** That run put a real hardcoded encryption key and salt into a card:
the value was quoted in prose ("key ('…' + salt '…')"), which no pattern caught,
and the summarizer copied it. Redaction now covers quoted values after key /
salt / secret / token / password words, runs on card statements as well as on
transcripts, and the summarizer is told to say a secret exists but never its
value. Each run's scrub now covers cards, evidence and sources too. The same
key then leaked again in parentheses ("key (…)"): a pattern covers that, and
every card now also gets a Jev check, "does this statement contain a secret
value?" (leak 0.72, redacted 0.04, ordinary 0.02); a card that does is dropped.
Then the same key turned up bare ("must retain … because"), which no pattern can
catch. So a value found once (ENV=value, quoted after key/salt, in parentheses)
is learned as a SHA-256 hash per agent, and every token with a known hash is
redacted everywhere: transcripts, cards, evidence. The value itself is never
stored. The model had also listed the key as a graph entity: an entity whose
name is a known secret is never created, and existing ones are removed with
their links.

## [0.41.8] - 2026-09-23 — A real graph viewer for agent memory

- **Cytoscape.js** (already used for the code graph) replaces the hand-drawn
  canvas for the entity graph: relation verbs as edge labels, force layout,
  zoom and pan, hover to highlight a neighbourhood, click to explore, search,
  type filters, "mentioned together" toggle, fit to view. Canvas colours are
  read from the page theme.
- **Space:** the graph takes two thirds of the width and 70% of the height; the
  side panel shows the agent's top entities, or the selected entity's relations
  and memories.
- **Counts:** the stats bar counted faded memories (hidden from the list), so an
  agent showing 8 memories said 15. It now says "8 memories · 7 faded".

## [0.41.7] - 2026-09-23 — A memory graph you can read and walk

The first real entity graph was a hairball: 69 of 93 edges were "mentioned
together", "attachments" was the second-biggest node, the agent's own project
connected to everything, and 352 of 382 memory links were "supports".

- **Nodes:** generic words (config, tests, attachments, users…) and snake_case
  concepts are no longer entities.
- **Edges:** the summarizer must state how entities relate, and `related_to` is
  gone (it was the model's default, like "supports" was Jev's). For every pair
  a card leaves unconnected, Jev reads the verb from the statement and its
  evidence (at ≥ 0.7 confidence; it answers "none" rather than invent). Existing
  memories are backfilled 60 per run.
- **Hubs:** an entity in a quarter of all memories keeps its stated relations
  but not its co-mentions.
- **Memory links:** Jev can now answer "related" (not stored), and "supports"
  needs 0.8 confidence; the old supports links are dropped once and re-judged.
- **Exploring:** click an entity to centre the graph on its neighbourhood, with
  a panel of its relations (clickable) and the memories behind them.

## [0.41.5] - 2026-09-23 — The dashboard no longer "restarts" when a refresh is slow

The agent list refreshes from each host's /api/agents. When this host's own
request failed or passed its 8 s timeout (it takes 1.7-3.6 s normally, more
under load), the refresh dropped every local agent; every agent view unmounted
and remounted on the next good refresh, which looked exactly like the app
restarting. Remote hosts already fell back to cached agents; this host did not.
A failed refresh now keeps each host's last good list, and reports the failure
to the server log ([CLIENT] agents_fetch_failed_kept_previous).

And the reason it was slow: session discovery ran one `tmux display-message`
per session, in series, to read each working directory (36 sessions: 2.65 s).
One `tmux list-sessions -F` now returns every session's name, windows, creation
time and cwd (104 ms, identical results). GET /api/agents drops from ~2.5 s to
~0.1 s.

## [0.41.3] - 2026-09-23 — Memory work at night; agents stay open while in use

- **Dashboard resets after v0.41.0.** The new maintenance sweep ran all day and
  its first passes caught up 26 days of unindexed conversations, embedding
  thousands of messages inside the server process; the dashboard reset while it
  ran. The sweep now runs only between 2 and 8 AM; in the day, indexing happens
  on each agent's idle transition as before. Automatic consolidation (idle
  transitions included) also starts only in that window; the Memory tab's
  Consolidate button is unaffected.
- **Consolidation failing with HTTP 500 "Database not initialized".** A
  multi-minute consolidation lost its database when the 10-slot agent LRU
  evicted that agent to load another. Agents doing consolidation or indexing
  are now pinned; eviction skips them (going over capacity rather than closing
  a database in use).
- **Diagnostics.** Each dashboard page load reports its navigation type, how
  long the previous page lived and its last uncaught error to the server log
  (`[CLIENT]`), so an unexplained reset can be traced.

## [0.41.2] - 2026-09-23 — Security conversations are no longer unrememberable

A firewall in front of the Jev API answers a permanent 403 to text that looks
like SQL injection or path traversal (measured: "' OR 1=1; DROP TABLE" and
"../../etc/passwd" refused; shell injection and <script> accepted). Treated as a
transient error, it made a conversation about security fixes stall at that
passage on every run, retrying for 15 s each time. Now a 403 is retried once
with those sequences defanged (only in the copy sent to the classifier), and a
passage still refused is skipped instead of blocking its conversation.

## [0.41.1] - 2026-09-23 — Daily consolidation reaches every agent, at night

A daily task (consolidation, 2 AM) was only "due" while the local hour WAS 2,
so only agents a sweep or an idle transition happened to reach between 2:00 and
2:59 ever consolidated: 11 of 170 on 2026-09-23. A test enforced it. A daily
task is now due once its most recent scheduled time has passed without a run.
The server sweep starts daily tasks only within 6 hours of their time (2–8 AM),
so the fleet consolidates at night rather than as a daytime backfill; an
agent's own idle transition may still catch up at any time.

## [0.41.0] - 2026-09-23 — Memory weighted by recurrence, delivered, and run for every agent

The first night of v0.40 showed three things: agents received zero memories
(every hook call timed out), only 11 of 170 agents consolidated, and memory kept
15–37% of every conversation. This release fixes the first two and redesigns
the third around one idea: a paragraph never shows that something will matter
again; the same knowledge coming up in another session does.

**A card is the memory; recurrence is its weight.** Jev still flags candidate
passages. The host's own Claude now reads a whole session's candidates and
writes at most a few cards for knowledge a future session needs (zero is a valid
answer); passages are kept as the card's evidence. A card that states what an
existing memory already states reinforces it instead: one more distinct
session, one more piece of evidence. Memories seen in 2+ sessions are promoted
to long-term; one-off memories nobody used fade after 30 days; a faded card
that comes up again is revived. Recall ranks by relevance, then weight; the
session-start primer leads with the most-repeated decisions, preferences and
patterns; the hook tells the agent "seen in N sessions".
Measured on real sessions: 338 passages → 10 memories (was ~22% of passages
kept). Replaying a session under another name: 8 of 12 cards recognised as the
same knowledge and promoted; zero false merges with an unrelated session.
"Same point" = cosine ≤ 0.25 and Jev ≥ 0.5 (≤ 0.12: Jev ≥ 0.35), calibrated
on real cards (true repeats 0.55–0.77, different knowledge 0.02–0.30).

**Existing memories migrate once.** Carded memories become card memories (the
passage becomes evidence); raw passages fade (hidden, not deleted).

**Delivery.** The hook resolved its agent through GET /api/agents, which took
2.1–2.6 s under load against a 1.5 s budget: every inbox check, memory recall
and Stop-path check timed out. It now reads the local registry (1 ms), with
HTTP only as the fallback.

**Coverage.** Agent schedules made consolidation due but it only ran on an idle
transition, and nothing ran the sweep. The server now sweeps 20 agents every 15
minutes (oldest first; MEMORY_SWEEP_ENABLED=false turns it off); the headless
router gained /api/memory/sweep; a per-agent guard stops two consolidations of
the same agent running at once.

**Also.** A transient Jev 403 no longer aborts an agent's whole run (only 401
is fatal).

## [0.40.1] - 2026-09-23 — Agent memory that works: Jev-classified, written as cards, walked as a graph

Long-term memory had never stored a single memory on any agent. It now writes,
reads and explains itself. (0.39.2–0.39.5 shipped the first half; this closes it.)

**Why nothing was ever stored (fixed in 0.39.2–0.39.5).** No provider was
configured; the Memory tab read the wrong error field; memory vectors were
written as `<…>`, which CozoDB cannot parse, so every store and search threw;
conversations were consolidated once and never revisited; a lock from a second
connection could abort the schema migration silently; the stats query was
invalid CozoScript.

**Writing.** A System One classifier (Jev, bring your own key and URL in
Settings → Memory) judges every passage of a conversation in the context of the
request: worth remembering, category, importance. Secrets are redacted before
anything leaves the transcript. The exchange behind each memory is kept in the
agent's own database, because Claude Code deletes its transcripts after 30 days.

**Memory cards (new).** Each memory becomes a card: one statement, an action
(decided, fixed, found bug, discovered…), and the entities it is about. The
host's own Claude subscription writes them (`claude -p`, haiku, thinking off:
~10 s per batch of 12, no transcript, no extra key), reading the whole exchange
and the one before it; Jev rejects any card the excerpt does not support.

**Entity graph (new).** Entities are canonicalised (exact name or alias, then
embedding + a Jev "same thing?" check) and become graph nodes; stated relations
(runs_on, depends_on, part_of, fixes, replaces…) and co-mentions are the edges.
The Memory tab's graph opens on entities.

**macOS + pm2.** A pm2 daemon started outside the login session cannot read the
login Keychain, so `claude` spawned by the server looked logged out while every
agent on the host was logged in. The summarizer detects "Not logged in" and runs
inside a short-lived hidden tmux session instead, the same way agents run.

**Reading.** Agents get a `## Memory:` block at session start and with every
prompt: card statements nearest to the prompt, plus the memories of any entity
the prompt names. `memory-search.sh --about "<entity>"` prints what memory knows
about one host, agent, service or file.

## [0.38.34] - 2026-09-21 — The "hook fires twice" and the 5s timeout — both ours

Chasing the last open item (two hook fires one second apart) and Juan's separate
report of "UserPromptSubmit hook timed out after 5s — output discarded". The
hook's own `hook_received` log already captured its stdin, so no new capture was
needed — the evidence was on disk. Two distinct, real, fixable bugs.

### Fixed
- **The same message was delivered to the pane twice (~1.2s apart).** The
  "duplicate fire" was really a duplicate DELIVERY: two triggers (a routing-time
  push and a near-coincident poll/wake) each called `notifyAgent` for the same
  message, and nothing was keyed to the message, so it was typed and submitted
  twice. Measured on a customer host: 20 duplicates, same session, identical
  prompt. `notifyAgent` now suppresses a re-delivery of the same
  `(agent, messageId)` within a 10s window — comfortably over the observed 1.2s
  and well under the wake-queue's ≥30s retry backoff, so a legitimate later retry
  of a still-unread message is unaffected. The record is written BEFORE the send,
  so two racing triggers collapse to exactly one pane submit.

- **The UserPromptSubmit hook could hang past Claude Code's 5s limit.** The
  injection path fetched the local API on every turn through FOUR fetches
  (`checkUnreadMessages` + `drainMeetingInjectQueue`, each re-fetching
  `/api/agents`) with **no timeout** — while the Stop path had 2.5s timeouts all
  along. A slow or busy server (a build, a restart, load) hung the hook, and
  Claude Code discarded its output with "hook timed out after 5s". Each injection
  fetch now has a 1.5s timeout, and the whole injection step an overall 3.5s
  deadline. A discarded injection is only a delay — the Stop path and the
  5-minute poll both re-deliver — so returning early always beats hanging.

### Added
- 5 tests for the duplicate-delivery guard (first delivers; second suppressed
  with nothing typed; a different message or a different agent is not suppressed;
  two racing triggers collapse to one) with a `__resetDeliveryGuard` test hook.

### Diagnosis note
- The originally-suspected "two panes / two sessions" was ruled out earlier by
  pas-lola (one session_id). The paired events in the log were mostly
  Stop→UserPromptSubmit (normal lifecycle); the genuine duplicates were
  UserPromptSubmit+UserPromptSubmit with byte-identical prompts, which pointed at
  delivery, not at Claude Code double-firing.

## [0.39.1] - 2026-09-22 — A themeable colour system, and the end of hardcoded colour

Infrastructure only. **No visual change**: the default theme reproduces stock
Tailwind exactly — all 33 ramp steps byte-identical — so the app looks as it did.

### Added
- **A design system for colour.** Neutrals (`gray`, `slate`), the accent
  (`blue`) and `white` now resolve from CSS channel variables, plus a semantic
  layer new code should reference instead of a ramp step: `surface`, `raised`,
  `sunken`, `hairline`, `ink`, `ink-muted`, `accent`, `accent-fill`, `ok`,
  `warn`, `danger`. **A theme is one block of variables in `app/globals.css`** —
  no component edits, no sweeps. A complete, working example theme ships in the
  file.
- **The trap, documented where it bites.** `text-white` does not mean white in
  this codebase — it means *foreground*, in roughly 278 places. A theme that
  inverts the ground without setting `--fg-white` blanks its own text. That is
  why `--fg-white` exists and why it is themed.

### Changed
- **Typography.** Space Grotesk retires for **Archivo** (a signage grotesque
  with a real width axis, so one family covers UI and condensed labels) and
  **JetBrains Mono**, confined to code, terminal, ids and quantities.
- **Hardcoded colour is gone.** `AgentList`'s `COLOR_PALETTE` was 56 literal
  `rgb()` values in component code; it now reads eight category identities from
  CSS variables — **the same colours**, one source of truth. The last arbitrary
  hexes (`bg-[#1a1b26]`, `bg-[#0a0a0a]`) became `room-*` tokens at identical
  values.

### Why
An attempted visual redesign was rolled back in full. What it exposed is worth
keeping: colour lived as raw utilities and hex literals across hundreds of
files, so a palette change meant a sweep, and every sweep missed something. This
layer means the next colour change is a one-line edit rather than an afternoon.

## [0.39.0] - 2026-09-22 — Multi-provider chat, and a reliability + security hardening cycle

Milestone release. The headline is that **AI Maestro now works with both main AI
coding CLIs** — Claude Code *and* Codex — in the chat, not just the terminal. It
lands on top of a full cycle of messaging-reliability and security fixes, each
already shipped and deployed across the fleet as a 0.38.x patch and consolidated
here.

### Headline — Codex is a first-class chat citizen (F004)
The chat was a Claude Code transcript viewer, hardcoded to `~/.claude/projects`.
It is now multi-provider through a clean transcript-source seam:
- **History + live updates** — a codex agent's real conversation, read from
  `~/.codex/sessions/**/rollout-*.jsonl`, mapped to the shapes the chat already
  renders. Dispatch by `agent.program` + per-line format detection; both call
  sites (initial load and the live watcher) unchanged. (0.38.35)
- **Live "working" indicator** — derived from codex's own `task_started` /
  `task_complete` turn events, since codex runs no AI Maestro hook. (0.38.36)
- **Sidebar status** — the session dot no longer shows a working codex agent as
  `disconnected`; it reads the same transcript signal. (0.38.37)
- Approval cards were **evaluated and deferred with reason**: codex keeps
  approval state in the TUI only, so cards need a captured prompt sample we do
  not have — the terminal tab handles codex approvals today. The seam admits
  Gemini/Aider next, one adapter each.

### Security
- **Closed a critical unauthenticated tmux command-injection RCE**
  (GHSA-2vm8-3q4q-wqv3) — a bypass of the earlier CVE fix — as a whole class:
  every tmux call now runs through `lib/tmux-safe.mjs` (execFile + argument
  vector, validated session name), plus a validated `/term` WebSocket entry.
  (0.38.27). Confirmed the `gray-matter` RCE (GHSA-g7qj) was already closed.
- **Reply-target safety** — `amp-reply` now enforces "reply to the message you
  just read," closing the `amp-inbox | head -1` misroute that put one party's
  detail in another agent's mailbox. Fixed at the upstream source. It has since
  caught multiple real misroutes in the field. (0.38.29)
- Documented the deliberate **no-auth-by-design** posture (network/Tailscale is
  the trust boundary) with a per-host exposure check. (0.38.31–32)

### Messaging reliability (the notifier arc)
- Inbox notifier no longer re-announces the same message every turn, names the
  message with an id that `amp-read` accepts, and words repeats honestly
  ("Still unread" not "new"). (0.38.24–25)
- The wake queue no longer re-fires a message the agent already read — the actual
  source of the "answered message keeps coming back" reports. (0.38.28)
- Duplicate pane delivery collapsed, and the UserPromptSubmit hook's fetches are
  bounded so a slow server can't blow Claude Code's 5s hook budget. (0.38.34)
- `markMessageAsRead` writes what it claims to; the pane permission card defers
  to transcript identity instead of screen position, so an answered question
  can't resurrect. (0.38.25, 0.38.33)

### Housekeeping
- Backlog restructured to the 23blocks convention (`BACKLOG.md` index +
  `backlog/`), with F001–F004 and B001–B005 filed. (0.38.26)

## [0.38.37] - 2026-09-22 — Codex sidebar status; approval cards evaluated (F004 Phase 2b — complete)

### Fixed
- **The sidebar / session-list dot showed `disconnected` for a codex agent even
  while it was working.** `/api/sessions` read the hook-populated
  `sessionActivity` map, which codex never feeds (no AI Maestro hook).
  `sessions-service` now derives a codex session's status from the same
  transcript signal as the chat (`codexLiveStatus`: working → `active`, idle →
  `idle`) when the agent's program is codex. Verified: Nico now reads `idle`
  there instead of `disconnected`.

### Evaluated, deliberately not shipped
- **Clickable approval cards for codex.** The eval is conclusive and worth
  recording: codex writes **no "waiting for approval" event** to its transcript.
  `turn_context` carries the `approval_policy` and `sandbox_policy`, and under the
  sandbox codex frequently auto-handles a disallowed command rather than
  prompting (observed: `function_call_output` = "approval policy is UnlessTrusted;
  reject command"). When it does need a human, the prompt lives **only in the
  TUI**. Building clickable cards would mean parsing codex's approval menu out of
  the pane, which needs a captured sample of the real format — and Nico runs in
  `auto mode`, which does not prompt. Rather than guess a parser against an
  unobserved menu (the exact "confident finding with no sample" trap we have hit
  before), this is deferred with a concrete build plan in F004. **Codex approvals
  are handled in the terminal tab today.**

### F004 status
- **Done** for what codex's architecture exposes: history, live message updates,
  send, the chat working indicator, and now the sidebar status. Approval cards
  remain deferred (TUI-only) with a documented path to build them once a real
  prompt can be captured.

## [0.38.36] - 2026-09-22 — Codex live "working" indicator (F004 Phase 2a)

Phase 1 gave a codex agent its conversation in the chat. This gives it a live
state: an amber "working" pulse while codex is mid-turn, the same one Claude
agents show.

### Added
- **`codexLiveStatus`** — codex has no AI Maestro hook (that is Claude Code's),
  but it brackets every turn in its own transcript with `event_msg`
  `task_started` … `task_complete`. The LAST such event is the live signal:
  `task_started` with nothing after it → **working**; `task_complete` → idle.
  `codexLiveStatusFromFile` reads only the file tail so a large rollout is not
  re-read every poll.
- Surfaced through the **same seam the chat already uses** for hook state —
  `getChatHistory` (initial) and the 2.5s `broadcastHookState` poll (live) — as
  `hookState.status: 'working'`. Both chat renderers map that to their existing
  amber "working" indicator. No codex config and no per-agent install: it rides
  the Phase 1 transcript watcher, so it updates the moment codex starts or
  finishes a turn.

### Result
- A codex agent's chat now shows working ↔ idle live, not just static history.
  Verified: Nico reads `idle` after a completed turn; the working transition is
  covered by tests.

### Still Phase 2b (not here)
- The **sidebar/session-list dot** still reads the hook-populated
  `sessionActivity` map, so codex can show `disconnected` there — a follow-up
  deriving it from the same `codexLiveStatus`.
- **Approval / permission cards** for codex — a different approval UX than
  Claude's `AskUserQuestion`; needs its own eval on whether codex's prompt is
  readable outside the TUI.

### Tests
- 8 more (`tests/transcript-codex.test.ts`, now 29): last-event-wins across many
  turns, no-turn-event → null, a message whose TEXT contains "task_started" is
  not misread, malformed lines tolerated, and the tail read on a large file.
  Full suite 1532/1532.

## [0.38.35] - 2026-09-22 — Codex chat: AI Maestro now works with both main AI CLIs (F004 Phase 1)

The chat panel showed "no messages" for a codex agent — not because codex has no
conversation (it keeps a full transcript) and not because the chat is gated by
program (it isn't), but because the chat was a **Claude Code transcript viewer**,
hardcoded to `~/.claude/projects/*.jsonl` in Claude's schema. This makes it
multi-provider.

### Added
- **Codex transcript reader** (`lib/transcript-codex.mjs`). Locates a codex
  agent's session under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` by the
  `cwd` in its `session_meta`, and maps codex's `{timestamp, ordinal, type,
  payload}` events onto the SAME message shapes ChatView already renders — so no
  component changes. Handles both tool formats (`custom_tool_call` and the older
  `function_call`), pairs each tool output to its call by `call_id`, and
  correctly drops what should not be shown: `developer`/system setup, injected
  AGENTS.md context, the `event_msg` mirror of the real items, metadata records,
  and codex's **encrypted** reasoning (empty `summary` + `encrypted_content` —
  nothing to display).
- Dispatch at two seams, both call sites unchanged: `resolveJsonlPath(agent)`
  picks the codex locator when `agent.program` is codex; `parseJsonlLines`
  detects the codex envelope **per line** and routes it (required because the
  live watcher passes only the delta, with no `session_meta` header — codex lines
  are self-identifying).

### Result
- A codex agent's Chat tab now shows its real conversation and updates live via
  the existing JSONL watcher. Sending already worked (send-keys is
  program-agnostic). Verified end-to-end against a real codex session.

### Not in this phase (F004 Phase 2)
- The live **status dot, question panels, and permission cards** still require the
  AI Maestro hook, which only Claude Code runs. Codex has its own `hooks.json`
  and a different approval model, so that is a separate, larger piece. A codex
  agent's chat is history + send today, not the live-state affordances.

### Tests
- 21 tests (`tests/transcript-codex.test.ts`) against the real codex schema: the
  mapping of every event type, tool pairing by `call_id`, the skips
  (developer/reasoning/injected/mirror), the locator matching by session cwd, a
  >8KB `session_meta`, newest-wins, and Claude lines still parsing unchanged.

## [0.38.33] - 2026-09-21 — The last target-by-position bug: the pane permission card

From the audit Juan asked for after the reply-by-`head -1` misroute: *do we
resolve conversational targets by position/recency anywhere else?* The sweep came
back almost entirely clean — threading, questions, chat send, tasks, meetings,
wake delivery are all identity-addressed — with exactly one structural residual,
now fixed.

### Fixed
- **The pane-synthesised permission card resolved its target by screen position,
  not identity.** `detectPermissionFromPane` parses whatever menu is on the tmux
  pane and renders a clickable card with `source: 'pane'` and **no `tool_use`
  id**. The transcript's `AskUserQuestion` card is governed by identity
  (`isQuestionAnswered` / `isQuestionCurrent`, keyed on the tool_use id); the pane
  card, having no id, was governed only by "is a menu on screen". So a question
  answered long ago — correctly hidden on the transcript path — could still draw
  from the pane path. Same class as the `amp-inbox | head -1` reply misroute, one
  layer down.

  `paneCardBelongsToTranscriptQuestion(messages, hookState)` recovers the identity
  from what the menu SAYS: it content-matches the pane card's option labels
  (whitespace- and truncation-tolerant) against the transcript's LAST
  `AskUserQuestion`. On a match the card *belongs to that question* — which the
  transcript card already governs by id — so **both renderers now suppress the
  pane card** and defer to the identity-governed one. An answered question is
  hidden on all three renderers at once. A genuine `Allow Edit?` tool-permission
  prompt matches no transcript question and still renders (no id anywhere; this
  card is its only representation).

  MobileChatView suppresses via a derived `showPermission` used for every
  permission-driven layout decision, so a suppressed card also restores the
  composer — a suppressed card must never strand the input.

### Added
- 10 tests (`tests/pane-card-identity.test.ts`): content-match with truncation and
  reflow, last-question-only, genuine-permission-prompt passthrough, and the
  reported answered-question-does-not-resurrect case.

### Audit result (no change needed)
- Reviewed for target-by-position/recency across the board; identity-addressed
  everywhere else: AMP read/reply/delete require explicit ids; threading uses
  `thread_id`/`in_reply_to`; questions match by `tool_use` id; chat send binds an
  explicit session/agent id; bubble reconcile matches by content; tasks are
  id-keyed; meetings route by explicit session; wake delivery keys on `messageId`.
  Two recency uses kept as correct: streaming resume (newest `.jsonl` — "current
  conversation" IS recency) and `find(online session)` (safe under one-session-
  per-agent).

## [0.38.29] - 2026-09-20 — Reply-target safety: reply to the message you actually read

Follow-on from the misroute pas-lola surfaced while we were fixing the notifier.
Nothing was misrouted by AMP — the message was correctly addressed, threaded, and
signed. The bug was that its TARGET was chosen by `amp-inbox | head -1`, which
returns whatever is top of the inbox, not the message being answered. amp-reply
faithfully sent to that message's sender, so one company's internal detail landed
in a different agent's mailbox.

### Fixed (upstream: agentmessaging/claude-plugin#30, bundled here via the plugin)
- **amp-reply now enforces "reply to the message you just read."** `amp-read`
  records the message it surfaced (per-agent, per-terminal); `amp-reply` refuses
  a target that is not that message, printing both ids and both senders. `--force`
  overrides; reading the target first clears it naturally. This is the invariant
  pas-lola argued for — not a blacklist of `head -1`, which the next caller would
  route around.
- **SKILL.md** documents the invariant and shows the dangerous vs correct pattern.
- 8 new upstream unit tests; upstream suite 172/172.

### Note
- The content-security wrapper already made this a disclosure problem, not an
  execution one — the misrouted body arrived `trust="none"` / DATA ONLY. This
  fix addresses the disclosure half: not sending to the wrong recipient at all.
- Plugin submodule bumped to the rebuilt output (ai-maestro-plugins#38, built
  from claude-plugin@main after #30).

## [0.38.28] - 2026-09-19 — The re-fire's actual home: the wake-queue retry loop

pas-lola's third report on the same bug, with the evidence that located it. Her
first report got the injection notice deduped (0.38.24); this is where the
repeats she originally described were really coming from.

### Fixed
- **The wake queue re-delivered messages the agent had already read.** When pane
  readback could not PROVE a notification landed (`!res.verified` — and readback
  is fragile), the wake re-entered the queue and was retyped into the pane, up to
  the retry cap. Nothing in that loop asked whether the message was still
  unread. Measured on her host 2026-09-20: message `9hqvr480` landed as a prompt
  **six times across three minutes**, and the near-miss message `0ycttsw3` six
  times too — long after she had answered them.

  Verification answers "did my keystrokes land." It never answers "does this
  still need delivering." Conflating the two is what made an answered message
  keep coming back. `flushDueWakes` now calls `stillNeedsDelivery(item)` before
  RE-delivering: if the message is no longer unread (or is gone), the retry is
  dropped, however unproven the earlier send was. First attempts
  (`attempts === 0`) are never gated — a just-stored message is unread by
  definition. Status-read failures fail OPEN and deliver: a duplicate is
  recoverable, a dropped real message is not.

### Why this is separate from 0.38.24 / 0.38.25
- 0.38.24 gated the CONTEXT-INJECTION notice (`decideInboxAnnouncement`); 0.38.25
  gave it a message id. This is the ROUTING-TIME PANE PUSH (`notifyAgent` via the
  wake queue) — a third path, which pas-lola correctly predicted my earlier fix
  would not cover, because these repeats never pass through the reminder gate.
  Three paths announce messages; each needed its own honesty fix.

### Added
- 8 wake-queue tests: the first attempt always delivers, an unread retry
  delivers, a READ retry is dropped, a gone message is dropped, an unreadable
  status delivers (fail-open), and a replay of the six-fire loop stopping. All
  verified to fail against the pre-fix code.

### Still open, flagged not fixed
- Two hook invocations one second apart on her host (`00:04:31`/`00:04:32`) —
  pas-lola confirmed it is ONE session, not two panes, so the duplicate is
  inside a single session's handling. Needs the stdin capture to localise;
  Juan owns adding that hook. Not guessed at here.

## [0.38.27] - 2026-09-19 — Security: close the tmux command-injection bypass (GHSA-2vm8-3q4q-wqv3)

Critical, unauthenticated RCE. Reported against v0.37.6; confirmed live on HEAD
before this fix.

### Security
- **`GET /api/sessions/[id]/command` passed its URL path segment into a tmux
  SHELL STRING.** `sessionExists()` ran ``execAsync(`tmux has-session -t
  "${name}" …`)`` — the double quotes are not protection; `$(…)` and backticks
  still evaluate. The server binds `0.0.0.0:23000` with no auth, and the check
  runs before any session lookup, so one request executed arbitrary commands as
  the server user, no valid agent required.

  This is a **bypass** of the CVE-2026-37751 fix, which hardened only the sync
  deletion path (`killSessionSync`) and validated names at agent creation. The
  async path, and every other tmux call, were untouched — which is how the
  bypass was found. So the fix closes the class, not the line:

  1. **No shell for tmux, anywhere.** Every tmux call now goes through
     `lib/tmux-safe.mjs`, which uses `execFile` with an argument vector. A
     session name is one argv entry; there is no parser left to confuse.
     Converted: all of `lib/agent-runtime.ts` (~18 calls), the 11 shell-string
     calls in `server.mjs`, and `lib/schedule-executor.ts`.
  2. **Validation at the choke point.** Every helper rejects a name outside
     `^[a-zA-Z0-9_-]{1,128}$`, and the `/term` WebSocket — a *second*
     unauthenticated path to the same primitive, not named in the advisory —
     now validates before attaching a PTY. Route-by-route validation is what
     failed last time; this cannot be reintroduced by forgetting a route.

  Verified against the live fleet before shipping: 124 registry names and 36
  live tmux sessions across three hosts, none rejected. A functional probe drove
  every converted operation against real tmux (both send-keys modes reach the
  pane, capture/rename/kill/env all work) and confirmed an `evil$(touch …)`
  payload is rejected with no file created.

### Already fixed, confirmed during the sweep
- **GHSA-g7qj-fhxp-6chc** (High — `gray-matter` executable frontmatter RCE in the
  plugin-builder repo scan) is **already closed in code**: `lib/safe-matter.ts`
  overrides the js/coffee engines and both call sites (`plugin-builder-service.ts`,
  `marketplace-skills.ts`) use it. No code change needed; noted here so the state
  is on record.
- **docker** calls use a real single-quote escaper (`shellQuote`) / validated
  container names — not the bare-double-quote guard the advisory defeated — so
  they are safe as-is.

### Added
- `lib/tmux-safe.mjs` and 51 tests (`tests/tmux-safe.test.ts`) covering the
  advisory's PoC payloads, the CVE it bypassed, the real fleet names that must
  keep working, and `splitKeySpec`'s preservation of legacy shell semantics.
- **B004** in the backlog: convert the last two config-fed shell-string calls
  (`git clone`, `aws --profile`) and add a CI guard that fails on any NEW
  shell-string interpolation — the one-time audit does not keep itself fixed.

### Note
- The root exposure — an unauthenticated `0.0.0.0` listener — is unchanged and
  out of scope here. These fixes are defense-in-depth on top of the network
  posture documented in SECURITY.md, not a substitute for it.

## [0.38.26] - 2026-09-19 — Backlog structure, and six items from a competitor read

Planning only. No product code changed.

### Added
- **`backlog/` + `BACKLOG.md` as an index**, per the 23blocks convention — detail
  files carry Description / Why It's Needed / Business Case / Implementation Plan.
  The prior flat checklist is preserved verbatim under *Unfiled*. Not to be
  confused with `docs/BACKLOG.md`, the version-stamped product roadmap.

- Six items, from reading `singledigit/microvm-dev-environment` ("rDev") — a
  browser terminal running Claude Code in per-user AWS Lambda MicroVMs:

  - **F001 — a shared filesystem agents and humans can both reach.** He mounts
    each user's home with `mount -t s3files -o accesspoint=<id>`. The idea worth
    taking is not S3, it is that we keep building *transfer* (AMP attachments,
    agent transfer, uploads) when what is missing is a *shared namespace*. The
    item evaluates five options and flags that S3 Files mount targets are
    VPC-scoped, so the obvious implementation likely does not fit a Tailscale
    mesh of personal machines.
  - **F002 — Lambda MicroVM as a deployment mode.** Firecracker isolation with
    suspended idle cost, which none of tmux/Docker/EC2/ECS gives. Two blockers
    recorded: an 8-hour lifetime ceiling that contradicts the ownership model, and
    unverified GA status (`stages: [preprod]`).
  - **F003 — native iOS selection and paste**, via the `@cocalc/xterm` fork
    carrying xterm.js PR #5961. Flagged that the fork tracks 5.5 while we are on
    6.0, so it may be a downgrade rather than a swap.
  - **B001 — two browsers on one agent fight over terminal size.** Reproduced.
    The first diagnosis was wrong: each WebSocket spawns its own PTY, so **tmux**
    arbitrates via `window-size latest`, not our code. Recorded with the repro and
    three options, including tmux session groups as the real fix.
  - **B002 — `@wterm/*` 0.3.0 → 0.5.0 and `ws` 8.21.0 → 8.21.3.** Every
    `@xterm/*` package and `node-pty` are already current; only the second
    terminal stack has drifted. 0.5 carries a focused-cursor visibility fix that
    is a live defect in that view.
  - **B003 — clicking a question option may not confirm it.** Measured: the number
    key moves the selection while the footer still reads "Enter to select". Likely
    the origin of the whole 15–19 Sep chat investigation.

### Changed
- `CLAUDE.md` points at the backlog and distinguishes it from `docs/BACKLOG.md`.
- `marketing/competitive-landscape-2026.md` gains rDev as profile 26 (gitignored).
## [0.38.25] - 2026-09-19 — Follow-up: tell the messages apart

pas-lola sent a second report with evidence that contradicted part of her own
first one — the notifier fired, she said, while BOTH stores read zero unread.

That specific claim is not supported by the hook's own log: `unread_messages_found`
is only reachable when the API returned one or more messages, and there are twelve
such entries on her host tonight. Every fire had a real unread message behind it.
The zero she sampled was seconds later, after the state changed.

But her instinct that something was still wrong was right, and the second report
contains the detail that explains the near-miss.

### Fixed
- **The notice could not distinguish a new message from a repeat.** It identified
  a message only by sender and subject — and a reply carries `Re: <same subject>`
  from the same sender. So a genuinely new message in a live thread produced a
  notice byte-identical to the repeats around it. Combined with the missing dedup
  fixed in 0.38.24, it was not possible for a reader to tell them apart. The
  notice now names the message id.

- **The id it prints is the one that actually works.** This is pas-lola's
  hyphen/underscore observation, which was harmless where she expected it (both
  sides of the dedup comparison come from the API) and not harmless here:

  ```
  $ amp-read.sh msg-1789863849489-zl8spaj     # the API's form
  Error: Message not found: msg-1789863849489-zl8spaj
  ```

  `ampMessageId()` converts before printing, so the notice ends `Read it with:
  amp-read.sh msg_1789863849489_zl8spaj` — a command that runs.

- **`markMessageAsRead` wrote conditionally and returned `true` regardless.**
  The write was `if (raw.metadata) raw.metadata.status = 'read'` while the read
  path is `metadata?.status || local?.status || 'unread'`. An envelope carrying
  neither section could never be marked read: nothing was written, success was
  reported, and the message stayed unread forever. NOT the cause of the report —
  all 1733 messages on the affected host carry both sections — but it is the same
  unearned-success shape, sitting directly under a bug report about messages that
  stay unread after being read. 8 tests, verified to fail against the old code.

### Notes
- Two hook invocations one second apart (`00:04:31`/`00:04:32`, `00:17:53`/`00:17:54`)
  indicate the hook runs twice per prompt on that host — two sessions on one cwd.
  Left alone pending confirmation rather than fixed on a guess.

## [0.38.24] - 2026-09-19 — The inbox notifier stops crying wolf

Reported by pas-lola, who had the discipline to label her own hypothesis as a
hypothesis. It was wrong, and saying so is the useful part: her lead was an
id-format mismatch (API `msg-1-a` vs AMP `msg_1_a`) defeating the dedup. Both
sides of the Stop path's comparison come from the API, so they match fine.

### Fixed
- **The context-injection path announced every unread message on every user
  turn.** Two paths announce unread AMP messages; only one deduped:

  | path | dedup | fired on 2026-09-19 |
  |---|---|---|
  | Stop hook (`decideStopDelivery`) | ids persisted per cwd | 3 |
  | context injection (`checkUnreadMessages`) | **none** | **39** |

  The path doing 93% of the talking was the one with no dedup. On her host the
  notice went out on every turn from 17:57 to 19:46, `count=1` every time —
  the same message, twenty-odd times, each announced as *"You have a **new**
  message"*.

  The cost was not noise. She had concluded the notifier was unreliable, and so
  nearly skipped `msg_1789863644570_ycttsw3`, which was real and carried the most
  important finding of her day. A notifier that repeats itself trains its reader
  to ignore it, and then the one true alert is the one that gets dismissed.

  `decideInboxAnnouncement` now gates that path: announce once, remind at most
  every 30 minutes (`AIM_INBOX_REMIND_MS`) while a message stays unread, and word
  the repeat as *"Still unread from earlier"* — never *"new"*. A genuinely new
  message is still announced immediately even while an older one is suppressed;
  that case has a test, because it is the near-miss.

  The two dedup stores are deliberately separate. Letting an injection consume
  the Stop path's first-fire would disarm the Stop block, which is the only
  mechanism that can start a turn on an already-idle agent. Share the logic, not
  the state.

### Added
- 14 tests for the injection path — the path that had no tests is the same path
  that had no dedup, which is not a coincidence worth repeating. Includes a
  twenty-turn replay of the measured symptom, and `pruneAnnounced` keeping the
  newest entries by recency so a burst of old ids cannot evict a fresh arrival.

## [0.38.22] - 2026-09-19 — A message sent while the agent is busy

### Fixed
- **F7 — a message sent while the agent was working never cleared its bubble.**
  Found by verifying the v0.38.21 fix against a live agent instead of a fixture.
  The message delivered correctly — `verified: true`, text above the input box —
  and the bubble still spun for 30 seconds and then claimed *"Not confirmed"*.

  Claude Code QUEUES a prompt sent while it is busy, and records it as an
  attachment rather than a user turn:

  ```json
  { "type": "attachment",
    "attachment": { "type": "queued_command", "prompt": "…" } }
  ```

  `ChatView` consumes a `queue-operation` shape in **nine** places. **Nothing ever
  produced it** — the parser passed the attachment straight through. So a queued
  message neither rendered as queued nor reconciled its pending bubble. The live
  transcript held **five** `queued_command` entries, every one invisible to the
  chat.

  This is the most common case in ordinary use, because people type while their
  agent is working. `parseJsonlLines` now emits the `queue-operation` the UI has
  been waiting for since it was written.

### Notes
- Other attachment kinds are untouched — that transcript carried 18 distinct
  subtypes including 330 `total_tokens_reminder` entries, and only
  `queued_command` is a message.
- The audit in v0.38.21 was a code read and found six defects. This one was only
  findable by sending a real message to a real agent and watching what the
  transcript recorded. Both kinds of checking were needed.
- `tests/chat-audit.test.ts` — 5 more cases. 1407 total.

## [0.38.21] - 2026-09-18 — Chat audit: six defects, four of them ours from last week

Reported: a message rendering twice — once real, once still "Sending…". Rather
than patch that one symptom, this is a read of every state transition in the chat
subsystem. Six defects, listed with the direction each one fails in.

### Fixed
- **F1 — a bubble survived every history push after the first.** `chat:history`
  reconciled pending only on initial load, yet **every** history push contains the
  sent message. Any reconnect, tab switch or watcher restart re-rendered the real
  message and left the bubble beside it. Persisting bubbles in v0.38.16 — so the
  Retry button would survive a tab switch — turned a transient duplicate into a
  permanent one. **This is the reported bug.**
- **F2 — the incremental clear required exact string equality.** Text that has
  been through a terminal comes back re-flowed. Matching is whitespace-insensitive
  now.
- **F3 — `MobileChatView` cleared ALL pending on any incoming batch**, so
  unrelated agent output marked a message delivered that may never have landed.
  The same unearned-success pattern this codebase has spent a cycle removing,
  wearing a different hat. Opposite direction to F1, same root: no shared matcher.
- **F4 — the question path reported success before the send happened.** It
  returned `true` and scheduled the send 400ms later; a socket dropping in that
  window failed silently and the bubble spun to "Not confirmed" 30s later with no
  error. Introduced in v0.38.16.
- **F5 — `MobileChatView` dedup let uuid-less messages duplicate.**
  `!m.uuid || !seen.has(m.uuid)` waves every uuid-less message through. It now
  falls back to a content key, as `ChatView` already did.
- **F6 — `permission_request` was sticky on the CLIENT against every later
  state**, including a concrete `waiting_for_input`. One false positive pinned the
  card, clearable only by an assistant message an idle agent never produces — the
  client-side twin of the server deadlock fixed in v0.38.15. Stickiness now
  applies only against `null` (a failed read), not against a contradicting status.

### Changed
- **`lib/pending-reconcile.mjs`** — one matcher, called from both the history and
  incremental paths in both renderers. F1 and F3 were the same missing abstraction
  failing in opposite directions.
- `docs/CHAT-ARCHITECTURE.md` gains an **Optimistic state** section stating the
  five rules, each of which has now been broken at least once in production.

### Notes
- Four of the six were introduced by fixes earlier in the week. Persisting pending
  bubbles, the question free-text path, and both renderer divergences are mine.
- `tests/chat-audit.test.ts` — 12 cases, one per finding plus the behavioural
  matcher tests. 1402 total.

## [0.38.20] - 2026-09-17 — Share the logic, not the shape

The duplication that made a one-symptom day into nine releases, removed — but only
where removing it is actually sound.

### Changed
- **`lib/question-state.mjs`** — one implementation of "is this question answered,
  is it still live", used by both chat renderers. These rules were fixed in
  `ChatView` in v0.38.13 and had to be fixed *again* in `MobileChatView` in
  v0.38.14; in between, the bug was live for anyone whose `layoutOverride` put
  them on the mobile renderer, including on a desktop browser.
- **`lib/chat-verify.mjs`** — one verify/clear/retype loop, used by both send
  paths. It was written twice on the same day, which meant it could only ever be
  fixed in one of them at a time. Delivery is **injected**, so each path keeps its
  own mechanism.

### Deliberately NOT collapsed
- **The two chat components.** `ChatView` and `MobileChatView` are different
  layouts, not an accident. Merging them produces one component full of branching
  markup — worse than two. Only their logic was shared.
- **The two `sendChatMessage` wrappers.** Genuinely different jobs: one resolves an
  agent and guards against a bare shell, the other handles tmux copy-mode and the
  permission cache. They also deliver differently — paste-buffer vs send-keys
  through the mockable runtime — and both are correct for their caller. Only the
  proof was duplicated.

### Notes
- `tests/shared-chat-logic.test.ts` — 15 cases covering both extracted modules,
  including the dim-placeholder trap and the single-retry rule. 1385 total.
- The rule left behind, and written into `docs/CHAT-ARCHITECTURE.md`: **share the
  logic, not the shape.** Every bug on 15 September was a fork of logic; none was
  a fork of markup.

## [0.38.19] - 2026-09-17 — A version match no longer hides an incomplete install

**Contributed by [Javier Moya](https://github.com/nodoyuna) (jaak.ai). Thank
you.** Found while setting up a multi-host mesh over OpenVPN.
[#453](https://github.com/23blocks-OS/ai-maestro/pull/453)

### Fixed
- **`remote-install.sh` returned early whenever `package.json` carried the current
  version — and reported `STATUS: SUCCESS` over an install that produced nothing
  runnable.** A matching version only means the *source* is current.
  `node_modules` and `.next` can still be missing after an interrupted install, a
  pruned checkout, or a fresh clone that never built. The shortcut then skipped
  `yarn install`, `build_app` and the submodule update, and `yarn start` died with
  `tsx: not found`.

  Same failure class as v0.38.7 ("the installer never built the app") — that fix
  added `build_app` to the update branch, and this early return fires before
  reaching it.

  The fast path is now gated on `node_modules` **and** `.next` actually existing;
  when either is missing it says which, and falls through to the repair that was
  already there.

- **A service that never bound the port is no longer called "starting slowly".**
  It reports as a failure with the tail of `startup.log`, `main()` emits
  `STATUS: FAILED`, and the script exits 1. An install that produced nothing
  runnable used to look identical to a good one, in CI log parsing as much as on a
  terminal.

### Notes
- This is the same unearned-success pattern removed from the pane readback, the
  message poll, the program launch and the version bumper this cycle — found
  independently, from outside, on the one path none of us re-ran after it worked
  once.
- Carried onto main by cherry-pick because the branch predated nine releases and
  conflicted on version stamps only; the commit keeps Javier's authorship.
- `tests/remote-install-build.test.ts` — 5 new cases locking in the guard, the
  named-missing output, `STATUS: FAILED`, the non-zero exit, and the log tail.
## [0.38.18] - 2026-09-15 — Write down how the chat actually works

Documentation only. Seven releases went into one user-visible symptom today, and
most of that time was spent fixing the **wrong copy** of the right code. Nothing
in the repository described how the chat is wired, so each fix had to rediscover
it — badly.

### Added
- **`docs/CHAT-ARCHITECTURE.md`** — the map that did not exist:
  - **Two chat paths**, tmux and SDK, side by side, with the reliability ceiling
    of each stated plainly. The tmux path infers agent state by reading a
    terminal as text; that can be made better, not certain.
  - **Two functions named `sendChatMessage`** — `server.mjs` (what the chat UI
    calls) and `services/agents-chat-service.ts` (what the REST endpoint calls).
    Verification was added to the second, tested through REST, seen returning
    `verified: true`, and reported fixed. The chat UI never calls it.
  - **Three places that render a question panel**, only two of which mention
    `AskUserQuestion`. The third synthesises options from 200 lines of pane
    scrollback and never reads the transcript — which is why a question answered
    46 messages earlier kept reappearing.
  - **Pane readback rules**: proof of submission is *position*, not presence;
    capture with `-e` and strip SGR dim or the placeholder lies; clear with
    backspaces because `C-u` is a no-op; a live menu is the last thing on the pane.
  - **`_lastPermission` is a cache, never an authority** — and the deadlock that
    follows from treating it as one.
  - A **debugging checklist** of four commands, each of which would have replaced
    hours of reasoning today.

### Changed
- `CLAUDE.md` — a prominent section above Common Gotchas covering the duplicate
  `sendChatMessage`, the three renderers, and the readback rules.
- `README.md` — links the new document.

### Notes
- Remaining duplication, listed in the doc so it is not rediscovered a third time:
  `sendChatMessage` × 2 and the question renderer × 2. Pane readback was collapsed
  into `lib/pane-readback.mjs` in 0.38.16.

## [0.38.17] - 2026-09-15 — The question panel came from the pane, not the transcript

### Fixed
- **A menu that scrolled into history was still being rendered as a live prompt.**
  This is the actual cause of the question panel that kept reappearing, and it is
  not what the previous four releases fixed.

  `detectPermissionFromPane` scrapes **200 lines of pane scrollback**.
  `parsePermissionMenu` matched a six-option question answered hours earlier, and
  the server **manufactured** a `hookState` carrying `options` — which both chat
  renderers draw as live buttons. That path never consults the transcript, which
  is why the card returned on every reload and every tab switch while the
  transcript plainly recorded the answer 46 messages back.

  The same false positive set `_lastPermission` and deadlocked the chat.

  The old liveness check ran from the menu to the **end of the capture**, so any
  `esc to cancel` or leftover `❯ 1.` selector *below* a dead menu satisfied it. On
  a busy agent with 200 lines of history that is close to guaranteed.

  A live menu is now required to be the **last thing on the pane**: if Claude Code
  has spoken since — `●` assistant, `⎿` tool result, `✻` status, or a submitted
  `❯ <text>` — the menu is over. An empty `❯` is the waiting input box and still
  counts as live.

  Verified against the exact 223-line capture that produced the phantom card: it
  now returns `null`.

### Notes
- Three separate places render an option panel: the transcript card in
  `ChatView`, the same card duplicated in `MobileChatView`, and this
  `hookState.options` path in both. v0.38.13 and v0.38.14 fixed the first two. This
  is the third.
- `tests/pane-permission.test.ts` — 7 new cases: live menu still detected, and
  rejected once an assistant turn, tool result, status line, later prompt, or a
  long conversation appears below it.

## [0.38.16] - 2026-09-15 — Both chat paths, properly

Not another patch on one symptom. The chat failed all afternoon in five different
ways that were really two problems: the tmux path never verified anything, and
the SDK path never learned to answer a question.

### Fixed — the chat people actually use (tmux path)
- **`sendChatMessage` in `server.mjs` now PROVES submission.** It pasted, ran an
  explicitly-advisory probe, sent Enter and returned `ok`. That is why the UI
  said "sent" for messages that sat in the input box until somebody opened a
  terminal. It now reads the pane, requires the text ABOVE the input box, clears
  with backspaces and retypes once if the text is still in the box, and otherwise
  returns an error naming the cause and the fix.

  **The verification already existed** — in `lib/notification-service.ts`, which
  `server.mjs` cannot import. So the file that needed it was the one file without
  it. Now in `lib/pane-readback.mjs`, imported by both; there is nothing left to
  duplicate.

- **A false permission detection could refuse every message forever.**
  `_lastPermission` was believed without re-checking the pane, and only cleared by
  a new assistant message — which cannot arrive while every message is refused.
  The pane is the authority now; stale memory is dropped, not obeyed.

- **Typing now answers a question instead of being refused.** Claude Code's own
  prompt says *"Enter a number, or type your own answer"*, and its free-text field
  sits behind the last option. The chat presses that first, then sends the text.
  No more being pushed to a terminal to say something that is not on the menu.

- **The draft and the Retry bubble survive leaving the chat.** `ChatView` unmounts
  on a tab switch, so unsent text and any pending message — including the one with
  the Retry button — were simply gone. Both are persisted per agent. A bubble
  still marked "sending" from a previous mount returns as *failed*, so it is
  actionable rather than spinning forever.

### Added — the path that can actually be 100% (SDK path)
- **`AskUserQuestion` is answered properly.** `_onCanUseTool` treated every tool
  as a permission: one Allow/Deny card. Answering a question with "allow" returns
  the input unchanged with no `answers` key, so Claude receives **no answer** and
  the turn stalls. Questions now get their own card and resolve in the documented
  shape:

  ```js
  { behavior: 'allow',
    updatedInput: { questions, answers: { "<question text>": "<label or your words>" } } }
  ```

- **Free text is a first-class answer**, per Anthropic's own guidance — the card
  carries the options *and* a text box. A reply that answers no specific question
  goes back as `response`, which Claude reads as "The user responded: …".
- A question can no longer be resolved through the permission path, or the reverse.

### Why the SDK path matters
The tmux path infers state by reading a terminal as text and typing keystrokes
back. Every bug above is a consequence of that: staged text, false permission
detection, a dim placeholder read as real input, `C-u` silently not clearing.
Screen-scraping a TUI can be made *better*; it cannot be made certain. The SDK
path exchanges structured JSON in both directions and has none of those failure
modes. It is now complete enough to be the default.

### Notes
- `tests/streaming-questions.test.ts` (11) and `tests/permission-deadlock.test.ts`
  (8). 1363 total.

## [0.38.15] - 2026-09-15 — The chat could refuse every message forever

### Fixed
- **A false permission detection deadlocked the chat.** `sendChatMessage` in
  `server.mjs` — the function the chat UI actually calls — refused to send
  whenever `sessionState._lastPermission` held a `permission_request`, **without
  checking whether the prompt still existed**. That memory is cleared only when a
  new assistant message appears in the transcript, which cannot happen while
  every message is being refused. Refusal → nothing reaches the agent → no reply
  → refusal.

  Measured on a live agent: a false `permission_request` at 14:14:35 blocked every
  chat message for the rest of the afternoon while the pane sat at an ordinary
  empty prompt, hook state read `waiting_for_input`, and a pane scan found zero
  permission indicators. Only a server restart or driving the agent from a
  terminal could break it.

  The pane is now consulted first and is the authority: if it shows no prompt, the
  remembered state is **stale and gets cleared**, and the send proceeds. The
  refusal fires only on a prompt that is there right now.

- **The same stale memory pinned the question/permission card in the UI.** Chat
  history served `_lastPermission` whenever the state file disagreed, so a false
  positive kept a card on screen across reloads and tab switches — the *"that
  panel is back again"* report. It is now validated against the pane too.

- **The draft is no longer lost when you leave the chat.** `ChatView` unmounts on
  a switch to the terminal tab, so anything typed and not yet sent was gone on the
  way back. The draft is persisted per agent and restored on mount.

### Notes
- Remembered permission state is a **cache, never an authority**. A cache the
  world cannot invalidate is a deadlock waiting to be reported.
- `tests/permission-deadlock.test.ts` — 8 cases asserting the pane is checked
  before the memory, that stale memory is cleared rather than left to block, that
  the refusal is guarded by the live check, and that the draft round-trips.

## [0.38.14] - 2026-09-15 — The answered question is now actually gone

v0.38.13 was two-thirds of a fix. Both remaining thirds are here.

### Fixed
- **`MobileChatView` carries its OWN copy of the question panel, and v0.38.13 only
  fixed `ChatView`.** Same `isQuestionAnswered`, same `useState` Set, same
  transcript search for tool-result blocks the parser had already discarded — and
  none of the v0.38.13 changes. Whichever renderer was on screen kept showing the
  card fully live, which is why it still appeared and was still clickable rather
  than greyed. Both files now share the same logic.

- **An answered question no longer renders as a panel at all.** v0.38.13 set
  `disabled` and `opacity-50`, so the full six-option card still drew itself on
  every reload and every switch back from the terminal — which is what people
  were actually complaining about. It now collapses to a single muted line:
  `✓ <question> · answered`.

- **Liveness no longer trusts hook status alone.** A question counted as current
  if it was the last one and the hook said `waiting_for_input` — but a pane
  reporting `waiting_for_input` with `notificationType: idle_prompt` is sitting at
  an EMPTY prompt, which is indistinguishable from waiting on a menu by that
  signal alone. A question is now live only if **nothing has been said since it
  was asked**. The transcript is the reliable witness; the hook state is not.

### Notes
- Verified in the built client bundle rather than assumed: the marker check
  appears twice (both renderers) and the collapsed label three times (one desktop,
  two mobile render sites).

## [0.38.13] - 2026-09-15 — An answered question came back every time you reloaded

### Fixed
- **A question the conversation had moved past rendered as a live, blocking card
  after every page reload.** Reported against a six-option question that had been
  answered 124 transcript lines earlier.

  The chain: `parseJsonlLines` discarded every tool-result message
  (`if (message.type === 'user' && message.toolUseResult) continue`), while
  `isQuestionAnswered` decided a question was answered by searching those same
  messages for a matching `tool_result` — something the parser had already
  deleted. That branch could never return true. The only working record was
  `answeredQuestions`, a `useState` Set that dies with the page, so a reload
  resurrected every AskUserQuestion in the window as unanswered.

  Verified against the live transcript before writing the fix: the question at
  line 239 of 363 **did** have a matching `tool_result` on disk. The data was
  correct the whole time; the UI could not see it.

  The parser now emits a lightweight `tool_result_marker` for each completed tool
  call — no payload, so raw tool output still never reaches the transcript view —
  and answered-ness is read from disk instead of from browser memory.

- **An old question is no longer actionable at all.** Even unanswered, a question
  the conversation has moved past must not offer buttons: clicking one sends a
  keystroke to a menu that is no longer on screen, which is precisely how a stale
  card appears to "block" the chat. A card is interactive only when it is the
  **last** AskUserQuestion in the transcript **and** the agent is actually waiting
  (`waiting_for_input` / `permission_request`). Everything else renders as history.

### Notes
- `tests/stale-question-card.test.ts` — 9 cases including the reported shape
  (answered, then 124 lines of conversation), several results in one message, and
  confirmation that the raw result payload is still kept out of the chat view.

## [0.38.12] - 2026-09-15 — The chat said "sent" while your words sat in a text box

Reported live: an agent asked a six-option question, the answer did nothing, and
afterwards nothing typed into the chat reached the agent — with no error. The
person had to open a terminal to find out why.

The cause in the pane was Claude Code's own session-feedback survey ("How is
Claude doing this session? 1: Bad 2: Fine 3: Good 0: Dismiss") holding the
keyboard. Everything typed landed in the input box and was never submitted.

### Fixed
- **`sendChatMessage` returned `success: true` without checking anything.** It
  called `sendKeys` and returned. This was the last place in the codebase still
  reporting a delivery it had not verified — and the one a person actually looks
  at. It now proves submission with `paneSubmitted` / `paneStaged`, retries once
  after clearing, and returns a real error naming the cause and the fix.

  That machinery has existed since v0.37.x, built for exactly this failure, and
  had been wired into the AMP notification path and nowhere else.

- **`C-u` does not clear Claude Code's input box.** It was the clear key in both
  recovery paths (`NOTIFICATION_CLEAR_INPUT_KEY`, `COMMAND_CLEAR_INPUT_KEY`).
  Verified by hand against a live agent: a staged line survived two `C-u` and an
  `Escape`; only backspace removed characters. **A clear that does not clear makes
  the retry worse than no retry**, because the retype appends to what is already
  staged — which is exactly the "doubled line" the field data had shown. Clearing
  is now `clearInputKeys()`: backspaces, counted to the text, sent in one
  `tmux send-keys -N` via the new `runtime.repeatKey`.

- **Claude Code's dim placeholder read as staged text.** It renders your previous
  prompt greyed out inside an EMPTY input box. In a plain `capture-pane -p` that
  is indistinguishable from a message stuck in the box — it cost ten minutes of
  live debugging, twice, during this very investigation. Readback now captures
  with `-e` (`runtime.capturePaneRaw`) and drops SGR-dim runs via
  `stripDimPlaceholder()` before looking for anything.

### Notes
- `tests/chat-send-verification.test.ts` — 12 cases: the reported scenario, the
  actionable error, backspace-not-C-u, single retry, recovery, and both readback
  traps (dim placeholder vs genuinely staged).
- Existing notification and wake tests updated: they asserted `C-u`, which was
  asserting a no-op.

## [0.38.11] - 2026-09-15 — A "waiting" badge now expires after a day

### Fixed
- **Stale "needs you" badges.** v0.38.10 made the indicator read hook state, which
  worked — and immediately exposed an inherited assumption. Waiting states never
  expired, because for the wake path that is correct: an agent blocked on a prompt
  is still blocked tomorrow. For a badge it is not. On the first host checked,
  **56 of 67 agents reported "waiting" from reports older than a week, the oldest
  from 12 January**, each rendering as a pulsing amber "needs you" dot.

  Fifty-six permanent amber dots teach a person to ignore amber, which defeats the
  point of having it — the exact failure herdr's *"never hunt for the stuck one"*
  exists to prevent.

  `WAITING_STATE_TTL_MS` (24h) now bounds waiting reports in the indicator.
  Overnight blockage is still flagged in the morning; January stops shouting.
  `active` and `idle` keep the much shorter `HOOK_STATUS_TTL_MS` (15m), because
  "working" is a claim about right now while "blocked" persists until answered.

  **The wake path is untouched** — `getHookState` is private to `getActivity`, and
  `lib/session-idle` reads the shared map directly with its own rules.

- One freshness rule now governs **both** hook stores. Previously a file-derived
  waiting report survived indefinitely while a map-derived one expired in 15
  minutes, so the same agent could appear or vanish depending on which store
  answered.

- The terminal-upgrade path is bounded too: a live, working terminal is no longer
  labelled "waiting" on the strength of a months-old report.

### Notes
- Expiry is on the **age of the report**, not a blocklist. An agent silent for 48
  hours drops out and reappears within a second of its next hook event; nothing is
  cached, and `getActivity` recomputes from both stores on every call. Three tests
  cover that round trip explicitly — file, map, and no-caching.
- **Known limit:** `active` expires after 15 minutes, so a turn longer than that
  with no intervening hook event drops out mid-turn. A `PreToolUse` heartbeat
  throttled to once a minute would close it; not built yet.
- `tests/session-activity-hook-fallback.test.ts` — now 20 cases.

## [0.38.10] - 2026-09-15 — The dashboard could not see an agent working unless you were watching it

Reported against v0.38.9 by an agent on a customer estate, with measurements.
Three independent faults; fixing any one alone would not have shown a working
agent.

### Fixed
- **The indicator only knew about terminal activity.** `getActivity()` iterated
  `sessionActivity` and nothing else. That map is written by the PTY layer, which
  only runs **while somebody has the agent's terminal open in the dashboard** —
  for an autonomous fleet, the unusual case. `GET /api/sessions/activity` returned
  `{"activity":{}}` with fifteen agents running, one of them twelve minutes into a
  turn. Hook state was consulted, but only to *upgrade* an entry terminal activity
  had already created, so an agent nobody was watching could never appear at all.

  It now falls back to what the hook reports, preferring the hook's **state file**
  over the broadcast map: the file is written with `fs.writeFileSync` before any
  network call, so it survives a hook process that exits mid-fetch. The broadcast
  map remains the only source for agents on other hosts. Terminal activity still
  wins where it exists — it is measured, the hook report is merely claimed.

- **The hook never said a turn had started.** `SessionStart` fires once per
  session and `Stop` reports idle at the end; nothing in between reported work.
  `UserPromptSubmit` now writes `active`, and `install-hooks.sh` registers that
  event — it was not registered at all, which also meant the AMP inbox drain in
  that branch, described in its own comment as *"the reliable delivery slot for
  Claude Code"*, had never run in a standard install.

- **Status updates were lost to `process.exit`.** Only one of five `writeState`
  call sites was awaited, and `process.exit(0)` at the end of `run()` kills any
  in-flight fetch. Measured 10–14 Sep on the reporting estate: **0 of 56** Stop
  broadcasts and **0 of 17** SessionStart broadcasts reached the server; 36 of 95
  Notifications survived, by accident of doing more async work first. The comment
  at the single awaited site describes this exact failure — the fix had been
  applied to one site of five.

### Also affected, and not in the original report
- **Agent-owned scheduled tasks depend on this path.** `broadcastActivityUpdate`
  runs due tasks on the transition into idle, and that transition arrives via the
  same broadcast that was being dropped. Scheduled work almost certainly was not
  firing on hosts where terminals were closed.

### Notes
- `tests/session-activity-hook-fallback.test.ts` — 13 cases covering the reported
  scenario, TTL boundaries, terminal-wins precedence, and the distinction between
  the two hook stores (file keyed by cwd hash, map keyed by session name) that the
  original analysis did not separate.
- Plugin submodule bumped: hook copies synced via `scripts/sync-plugin-hook.sh`
  (ai-maestro-plugins#36).

## [0.38.9] - 2026-09-10 — Stale skill backups were being offered to agents as real skills

### Fixed
- **`install-plugin.sh` never deleted the skill backups it created.** Each run
  copies every existing skill to `<skill>.backup-<timestamp>` before replacing it.
  The script runs on every install, every `update-aimaestro.sh`, and every fleet
  deploy, so each pass left 8 more directories behind and none were ever removed.

  Measured across the fleet on 9 September: **313 / 304 / 447** backup
  directories — 41 copies of `planning`, 41 of `memory-search`, the oldest dating
  to 23 February.

  **The cost was not disk (~6 MB).** `~/.claude/skills` is a namespace Claude Code
  *enumerates*, so every stale copy was presented to agents as an invokable skill.
  A session on 9 September was offered `agent-messaging.backup-20260909090251`
  and `graph-query.backup-20260909090251` alongside the current ones. Agents were
  choosing among forty-one versions of the same skill, the oldest describing AMP
  scripts as they behaved seven months earlier.

  `prune_skill_backups` now keeps the two most recent per skill and deletes the
  rest, **after** a successful install so a rollback is never pruned out from
  under itself. Override with `SKILL_BACKUPS_KEEP`.

### Notes
- The backups were close to useless anyway: the install already copies into a
  `mktemp` directory and only removes the old skill once that copy has succeeded,
  making the restore branch nearly unreachable — and the restore reads only the
  newest backup, never the other forty. The comment claimed they "preserve user
  customizations", but an edit buried in one of 41 identically-named directories
  is not recoverable in any practical sense.
- `tests/skill-backup-prune.test.ts` — 10 cases including the real-world 41→2
  pileup, and an assertion that the prune happens after the install rather than
  before it.

## [0.38.8] - 2026-09-09 — The lip-sync claim was true of one voice, not the default

### Fixed
- **README overclaimed lip-sync.** [v0.38.6](https://github.com/23blocks-OS/ai-maestro/releases/tag/v0.38.6)
  added *"live animated faces that lip-sync to what the agent is saying"* with no
  qualifier. That is true only on the OpenAI and ElevenLabs voices, which need an
  API key. `hooks/useTTS.ts:86-92` falls back to `web-speech` whenever a provider
  is unselected or unkeyed, and `web-speech` **cannot** be lip-synced —
  `SpeechSynthesis` renders straight to the output device and exposes no element
  and no `MediaStream` to tap, so the face animates from a synthetic 4–6Hz
  envelope instead.

  The limitation was already documented in this changelog under the release that
  built the feature. The claim was written anyway, without checking, which is
  precisely the unearned-success pattern this project has spent the cycle
  removing — and it is worse in the README, where it is the first thing a new
  user reads and the first thing they can catch us on.

  The README now states which voices give real sync, why the default cannot, and
  that it is a Web Speech API limit rather than a roadmap item.

## [0.38.7] - 2026-09-08 — The installer never built the app

### Fixed
- **`remote-install.sh` — the documented one-liner in the README — never ran a
  build, so every fresh install produced a server that could not start.**

  `.next` is gitignored, so a fresh `git clone --depth 1` has no bundle.
  `ecosystem.config.js` starts AI Maestro with `NODE_ENV=production`, which makes
  `server.mjs:90` set `dev = false`, which makes Next refuse to start:
  *"Could not find a production build in the '.next' directory."* pm2 then
  crash-looped it ten times (`max_restarts: 10`) and gave up. The function
  responsible was even called `act3_clone_and_build`; it only cloned.

  Confirmed by calling `next({ dev: false })).prepare()` against a directory with
  dependencies but no `.next`, which is exactly what the installer produced.

  Existing hosts were unaffected because `update-aimaestro.sh` builds. Only the
  path new users take was broken.

- **The update path left the previous version's bundle in place.** `git pull` with
  no rebuild meant users "updated" and kept running the old UI — the same silent
  staleness as the stale-plugin-scripts bug in 0.36.31.

- **A failed `yarn install` no longer continues.** Both paths ended in
  `|| maestro_warn "yarn install had errors — continuing"`, which is how a broken
  install reached the "success" banner.

### Changed
- The build is verified by **`.next/BUILD_ID` on disk, not by the exit code**. A
  Next build can exit non-zero having written a usable bundle, and can exit zero
  having written nothing; only the artifact settles it. A stale bundle is deleted
  before building so a failed rebuild cannot leave the old version looking valid.
- On failure the installer prints the last 15 lines of the build log and the path
  to the full one, then exits non-zero, instead of reporting success.
- `tests/remote-install-build.test.ts` — 9 tests covering both call sites, the
  removed silent-continue, and the build-verification behaviour including the
  exit-zero-wrote-nothing case.

## [0.38.6] - 2026-09-07 — Say what we already ship

A competitive benchmark against Paseo, Orca, Conductor and Superset turned up an
uncomfortable finding: several capabilities we shipped months ago appear nowhere
in the README, including two that every competitor either charges for or cannot
claim at all.

### Changed
- **README documents what already exists.** No new code — this release closes the
  gap between what AI Maestro does and what a first-time reader can tell it does.
  - **Scheduled work** (shipped 0.37.0) had no entry at all. Timers belong to the
    agent rather than the host, so a schedule follows an agent between machines
    and fires on that agent's idle transition — worth saying out loud.
  - **Voice and live animated faces** (0.38.x) were buried under "custom avatars".
    That section is now *Agent Presence* and says an agent can speak and lip-sync.
  - **Headless worker mode** (`yarn headless`, ~100MB, no UI) was documented only
    in CLAUDE.md, so nobody outside the repo knew worker nodes were a thing.
  - **No account, no telemetry, no per-seat pricing.** Verified before writing it:
    no analytics SDK in the dependency tree, no phone-home in the source, and the
    OTLP endpoint defaults to `localhost:23000`. Competitors advertise this
    heavily; one of them is source-available under a license that forbids running
    it as a service, and another charges $60 per user per month.
- **The mental model is now written down.** AI Maestro is an OS for an AI-first
  company: an agent is an employee that *owns* a product, repo or process, not a
  disposable worker. Because agents own things they do not share a checkout —
  each clones what it owns and integrates through pull requests. That is not a
  missing feature, it is forced by the premise: git worktrees are several working
  directories over one `.git` store on one disk, so they cannot span hosts, and
  our agents live on different machines. New *Mental Model* section in the README
  and an *Agent Ownership* section in `docs/CONCEPTS.md`.
- **Roadmap:** create an agent directly from a repo URL — clone and staff in one
  step. Today agent creation only attaches an existing directory; cloning happens
  only on transfer/import. That is the real gap the ownership model implies.
- **New FAQ entries**: what it costs, whether we collect telemetry, and an honest
  comparison with the parallel-agent IDEs that says plainly where they are the
  better choice.

## [0.38.5] - 2026-09-04 — Paste a screenshot onto an agent (#270)

[#270](https://github.com/23blocks-OS/ai-maestro/issues/270) asked for three things. **The third — file attachments in the messaging system — shipped in [v0.38.0](https://github.com/23blocks-OS/ai-maestro/releases/tag/v0.38.0).** The other two are here.

### Added
- **Paste an image onto a terminal** (Cmd/Ctrl+V) and it goes to the agent. The existing paste handler read `navigator.clipboard.readText()` — **text only** — so an image on the clipboard produced silence, which is precisely what the issue reported. Images arrive as files on the paste event and are now intercepted before xterm sees them; a text paste falls through untouched.
- **Drag and drop files onto a terminal**, with a drop-target overlay. Dragging a file over a terminal previously gave no indication anything would happen.
- `POST /api/agents/{id}/files` (multipart). Remote agents are proxied to their own host — the same pattern the wake route uses, for the same reason: the bytes are useless on the wrong machine.

### The design decision worth stating
**A path, not the bytes.** Agent CLIs read files from disk — Claude Code takes a path and opens it, as do Codex and Aider. Pushing base64 into the pane would be both enormous and wrong: a one-megabyte screenshot becomes 1.3 MB of text typed one keystroke-batch at a time into a TUI that will mangle it.

**Outside the working directory.** Files land in `~/.aimaestro/uploads/<agentId>/`, never in the agent's `workingDirectory`. That directory is usually a git repository someone is working in; screenshots dropped there show up in `git status`, get committed by an agent tidying up, or collide with real files. An absolute path outside the repo reads just as well to every CLI and cannot pollute anything.

### Everything built this week made this safe
- Validation reuses `lib/amp-attachments` — filename sanitising, blocked executables, magic bytes against the declared type, the 25 MB ceiling — rather than growing a second, weaker set of rules for the same job.
- The prompt is delivered through `sendChatMessage`, which carries the **bare-shell guard from 0.37.14**. Without it, pasting a screenshot into an agent whose program never started would have typed the path at a shell, which would try to execute it.
- **Saved and announced are separate outcomes.** A file can land safely while the agent cannot be told — no session, or a program that never started — and reporting that as plain success would be the same unearned claim removed everywhere else this cycle. The UI shows a warning naming the path, so the file is not lost.

### Verified end to end
A real 4×4 PNG posted to a live agent: byte-identical on disk, and the agent's own pane shows it **reading the file** —

```
❯ I've attached a file for you at "/Users/…/uploads/70796e0d-…/shot.png" —
  ⎿  ~/.aimaestro/uploads/70796e0d-…/shot.png
```

Refusals, checked against the same agent:

| file | response |
|---|---|
| ELF binary named `evil.pdf`, declared `application/pdf` | `file is an executable (elf) regardless of its declared type` |
| `run.sh` declared `text/plain` | `blocked file extension: .sh` |

### Notes
- 26 new tests. 1283 passing.

## [0.38.4] - 2026-09-04 — A failed program launch is now visible where people actually are (#441)

[v0.38.0](https://github.com/23blocks-OS/ai-maestro/releases/tag/v0.38.0) made the API report `programStarted: false` with a reason. **Nothing displayed it**, so the dashboard still showed a healthy-looking agent and someone had to read the API response or the server log to find out. That is the half the reporter of [#426](https://github.com/23blocks-OS/ai-maestro/issues/426) would actually have seen.

### Added
- **The first-agent onboarding wizard** shows it on the success screen. This is the most important of the three: it is someone's very first agent, and #426 was reported by a user in exactly that position whose first message was executed by bash. The heading changes from *"ready to help you build amazing things"* to *"created, but its AI program did not start"*, with the reason and what to do next.
- **The agent creation wizard** shows the same warning on its success screen — the agent genuinely exists, so this is a warning rather than a failure, and the wizard no longer implies everything is fine.
- **Waking an agent** raises a 15-second warning toast. The wake path only checked `!response.ok`, so a wake returning **HTTP 200 with `programStarted: false`** was treated as complete success and said nothing at all.

All three name the consequence rather than just the fault: *the terminal is at a shell prompt, so anything sent now would be run as a shell command instead of read.*

### Verified end to end
Creating an agent configured with `aider`, which is not installed on this machine:

```json
{
  "success": true,
  "programStarted": false,
  "programError": "\"aider\" did not start: the program is not on PATH inside the tmux session. tmux starts a non-login shell, so a PATH exported from ~/.bash_profile or ~/.profile is not present — move it to ~/.bashrc (or ~/.zshrc), or check the program is installed at all.",
  "shellSaid": "zsh: command not found: aider"
}
```

Control, with a program that is installed: `programStarted: true`, no warning.

### Notes
- This closes the case that started with a fresh install and ends with a configured-but-missing framework: choosing `aider`, `codex`, `cursor` or a wrapper you have not installed used to be **indistinguishable from a working agent** at every layer — service, API and UI.
- 1257 tests passing.

## [0.38.3] - 2026-09-04 — AMP commands no longer stop at a permission dialog nobody is watching (#337)

[#337](https://github.com/23blocks-OS/ai-maestro/issues/337) reported that Claude Code prompts for approval on every AMP command. The friction is the visible part; the real cost is that **it breaks unattended message handling entirely** — the inbox poll injects "check your inbox", the agent tries to run `amp-inbox.sh`, and the run stops at a dialog nobody is watching. The message stays unread and nothing reports a problem.

Both remedies the issue proposed are implemented.

### Added
- **`install-plugin.sh` offers to configure the permissions, with consent.** It shows exactly what would be added, asks (or applies under `-y`), backs up `settings.json` first, and merges structurally with `node` rather than appending — that file also holds the Stop hook that delivers messages to detached agents, and corrupting it would silence them completely. Re-running reports "already configured" instead of asking again.
- **The AMP skill documents the same setup** as a required step, for anyone not using AI Maestro's installer ([claude-plugin#28](https://github.com/agentmessaging/claude-plugin/pull/28)).

### What is allowed, and what deliberately is not
| | commands | reasoning |
|---|---|---|
| allowed | `amp-inbox`, `amp-read`, `amp-reply`, `amp-send`, `amp-download`, `amp-status`, `amp-fetch`, `amp-identity` | the routine loop an agent must complete without a human |
| **not** | `amp-init`, `amp-register` | they mutate the agent's identity, and after the defects fixed in 0.37.13 that is a boundary worth keeping a human on |
| **not** | `amp-delete` | deleting mail is irreversible, and losing messages is the exact failure this cycle has been about |

Each command is allowed in three invocation forms — bare, `CLAUDE_AGENT_NAME=`, and `AMP_DIR=` — because agents are launched in different ways.

### Notes
- The hand-applied workaround on the dev machine covered **3 of 12** commands and omitted `amp-send.sh`, which agents use constantly. That is the sort of gap a documented-and-installed list closes and a manual one does not.
- Verified against a `settings.json` already containing hand-added entries, a Stop hook and a statusLine: 21 entries merged onto 3, no duplicates, hook and statusLine intact, exclusions honoured, and idempotent on a second run.

## [0.38.2] - 2026-09-04 — The version bumper stops reporting work it did not do (#375)

[#375](https://github.com/23blocks-OS/ai-maestro/issues/375) reported `package.json` frozen at `0.29.16` for fifteen releases while every run printed **"✓ Updated N files"**. That specific case had already been fixed. **The mechanism behind it had not**, and it was still live in three places — including the source of truth.

Reproduced on a scratch checkout with three drifted files. The script reported `Updated 3 files`, exited **0**, and had changed none of them.

### Fixed
- **`update_file` skipped silently on a pattern miss.** A file that had drifted stayed drifted forever and never appeared in the output. It now distinguishes *absent* (a legitimate slim clone — fine) from *present but not matching* (a file that was supposed to be updated and was not — a failure), and **verifies the substitution actually took** rather than assuming `sed` succeeded.
- **`docs/BACKLOG.md` printed a tick unconditionally.** It ran `sed` and claimed success whether or not anything changed — not a silent skip but a false claim, and the reason that header had to be corrected by hand after every single release in this cycle.
- **`version.json` — the source of truth — was updated by an unchecked `sed`** keyed on `"version": "x"`, with a space after the colon. Reformat the file (jq, a merge, an editor) and the pattern stops matching: the version freezes at whatever it was, **every subsequent bump reads that stale value as `CURRENT_VERSION`**, and every release still reports success. It is now updated structurally with `node` — the same fix already applied to `package.json` — and read back to confirm before anything else runs.
- **A partial bump now exits non-zero and names every file it could not update.** A bump that half-applies is worse than one that refuses, because the drift compounds silently across every release that follows. That is exactly how fifteen releases shipped with a frozen `package.json`.

### And it immediately found four more frozen files
The first run of the fixed script on this repo reported four files it could not update — **all stuck at `0.29.16`**, the same version the issue reported for `package.json`:

```
✗ scripts/remote-install.sh
✗ docs/index.html (schema)
✗ docs/index.html (display)
✗ docs/ai-index.html
```

So the reporter found one symptom of a freeze that had actually hit **five** files. `scripts/remote-install.sh` is the public installer, which has been advertising `0.29.16` to every new user since April. All four are repaired here, and the bumper now completes with no misses.

### Notes
- 10 new tests in `tests/bump-version.test.ts`, driving the real script in a scratch checkout. **5 of them fail against the previous version**, including the compact-JSON case that silently froze `version.json`.
- This is the same defect as the rest of this cycle, in the release tooling itself: a step that reports success it has not earned. It was reported in May and the reporter was right about the mechanism, not only the symptom.

## [0.38.1] - 2026-09-04 — The inbox nudge reads properly when the label truncates it

Reported from the receiving end: the notification showed up as

```
Stop hook error: [A
```

Two separate things, and only one of them is ours.

**"Stop hook error" is Claude Code's label** for any Stop hook returning `decision: block`. We cannot change that wording, and it is misleading here — nothing failed. `block` is the documented way for a hook to hand work back to an agent, and it is the only AMP delivery route that needs no tmux pane.

**"[A" was ours.** Claude Code renders the start of the reason string, truncated to the label width, and we led with a bracketed tag — so the characters that survived carried no information at all.

### Changed
- The blocking reason now leads with the count instead of `[AMP]`:

  | width | before | after |
  |---|---|---|
  | 4 | `[AMP` | `1 un` |
  | 12 | `[AMP] You ha` | `1 unread AMP` |
  | 20 | `[AMP] You have 1 unr` | `1 unread AMP message` |

  Urgency still appears in the header (`3 unread AMP messages in your inbox (1 urgent):`), since that is the one thing worth interrupting for.

### Notes
- A reason string that is also a UI label has two audiences: the agent reading the whole thing, and a human reading the first dozen characters. The second one had not been considered.
- Hook synced to both plugin copies per the single-source rule. 1247 tests passing, 4 new pinning the truncation behaviour.

## [0.38.0] - 2026-09-04 — Attachments actually work, and a failed program launch is no longer silent

Two tracks. The first makes agents able to exchange files; the second stops the class of failure that made creating an agent feel broken.

### Added — AMP attachments (provider side)

`amp-send.sh --attach` has existed for a long time and has been getting **404** the whole time: the client implemented the full flow, the endpoints were never built, and the skill advertised it. An agent asked to send a file followed our own documentation into a dead end.

Implemented against the normative text of `agentmessaging/protocol` **`spec/attachment-guide.md` v0.1.2**, so no client change is needed — every agent already running the plugin gains attachments the moment this ships.

**Why there is no S3.** The spec says content is stored "externally by the provider (e.g., in S3 **or equivalent** object storage)". *Equivalent* is the operative word: it constrains the metadata and the flow, never the backend. The client asks for an upload URL and PUTs to whatever it is handed, so a URL on this host is exactly as conformant as a presigned S3 one — and files stay inside the tailnet with no third party in the data path, the same reasoning that ruled out a transport relay.

Storage is content-addressed by the sha256 the client already computes, so a file attached ten times occupies one copy and a partial write can never masquerade as a good one.

**`basic_clean`, not `clean`.** The spec provides a status for a provider that runs the required checks and no antivirus, and requires that provider to declare `"av_scanning": false` in `/v1/info`. We do both. Returning `clean` would have been a claim we had not earned — and the client already understands the honest one, printing *"passed basic checks only (no AV scan)"* to the receiving agent unprompted.

All three MUST checks from section 5 are implemented and apply to **local delivery too** — there is no carve-out anywhere in the spec (`06a-local-networks.md` and `10-local-bus.md` do not mention attachments at all):

| check | on failure |
|---|---|
| size and digest match what was declared | `rejected` |
| blocked MIME types and executables | `rejected` |
| magic bytes match the declared `content_type` at primary-type level | `rejected` |

Primary-type level is deliberate: a DOCX is a zip, and a stricter comparison would reject a legitimate OOXML file.

Download URLs carry a **capability token**, not an API key — the spec requires cross-provider recipients to fetch "without an account on the originating provider", and that URL travels inside a message to another host. Tokens are scoped to one attachment id, signed, expiring, and compared in constant time.

Verified end to end with the real client: `amp-send.sh --attach` → routed message → `amp-download.sh --all` → **byte-identical file**, digest verified on the way in and again on the way out.

### Fixed — a program that never started reported success

`send-keys` returning proves tmux accepted the keystrokes, not that the program exists. So an agent whose program is missing, unauthenticated, or off `PATH` came up looking perfectly healthy with a bare shell behind it — which is how [#426](https://github.com/23blocks-OS/ai-maestro/issues/426) turned a missing `PATH` entry into a confusing half hour, and how configuring a framework you have not installed (`aider`, `codex`, a wrapper) has been indistinguishable from a working agent.

Both the create and wake paths now verify the launch and report `programStarted: false` with the reason.

**Measured, not predicted.** The obvious approach — a preflight `command -v` — cannot work: a tmux pane runs an interactive non-login shell (reads `~/.bashrc`, not `~/.bash_profile`), while a check spawned from the server is non-interactive (reads neither), so it would confidently disagree with the pane it claims to describe. Instead we look at what actually happened: after a grace period the pane either holds the program or a shell, and tmux says which. When it is still a shell we quote the shell's own diagnosis, because it has already said precisely what went wrong.

The common cause gets named in the error, since it is overwhelmingly the same one: tmux starts a non-login shell, so a `PATH` exported from `~/.bash_profile` is absent — the default outcome of an npm-installed CLI on Ubuntu.

Any doubt counts as started. A false "did not start" would tell an operator their working agent is broken, which is worse than staying quiet.

### Notes
- Tracked separately as [#441](https://github.com/23blocks-OS/ai-maestro/issues/441): surfacing this at agent-creation time in the UI.
- 1243 tests passing; 76 new, of which 59 assert the attachment spec's own MUSTs rather than our conveniences.
- Still not implemented, and deliberately not claimed: antivirus and prompt-injection scanning, the 2-hour orphan sweep, and single-use enforcement of attachment ids at `/route`.

## [0.37.16] - 2026-09-02 — Detached agents were never told they had mail

Juan asked the question that broke this open: *"why when you got a message are you not notified? neither by the hook or the poll or whatever it is"*.

The `ai-maestro` agent had been receiving messages all day and had to be told to check its inbox by hand, every single time. Three delivery routes, all correct, all silent.

### The diagnosis
| route | why it could not reach a detached agent |
|---|---|
| push (`notification-service`) | needs a tmux pane. `sessions: 0` — there is nothing to type into |
| 5-min poll (`Agent.checkMessages`) | needs a session name. Same |
| **Stop hook** | needs no pane — but could not work out **which agent it was** |

The hook is the only route that does not need a pane: it returns `{ decision: "block", reason }` and Claude Code renders it. So it is the only route that can reach a session which is not tmux-managed, and it was the one that failed.

### Fixed
- **Two environment variable names for one concept.** The documented detached-session hint in `.claude/settings.local.json` writes **`CLAUDE_AGENT_NAME`** — which is what the AMP tooling reads — while the hook looked only for **`AIM_AGENT_NAME`**, the name its own launcher sets. So the hint was ignored, resolution fell through to matching the working directory, three registered agents shared that directory, and the hook **correctly refused to guess**.

  Correct refusal at every step, and the agent still never heard a thing. The hook now accepts either.

### Verified
Running the hook against a real Stop event, before and after:

```
$ echo '{"hook_event_name":"Stop",...}' | CLAUDE_AGENT_NAME=ai-maestro node ai-maestro-hook.cjs
{"decision":"block","reason":"[AMP] You have 2 unread messages in your inbox: …"}

$ echo '{"hook_event_name":"Stop",...}' | env -u CLAUDE_AGENT_NAME … node ai-maestro-hook.cjs
{}
```

### Notes
- This is not the dropped-Enter class these releases have been about. Nothing was staged, nothing failed to submit; the message simply never had a route. Worth separating, because it means "the wake is unreliable" was covering for a second, unrelated silence.
- Any detached or manually-started Claude Code session sharing a working directory with more than one registered agent had this. Sessions launched by AI Maestro were unaffected — the launcher sets `AIM_AGENT_NAME`.
- Hook synced to both plugin copies per the single-source rule; `tests/plugin-hook-sync.test.ts` covers the drift.
- 1167 tests passing, 7 new on agent resolution.

## [0.37.15] - 2026-09-02 — Correcting the attribution in 0.37.12, and a third writer nobody had counted

3Metas checked a claim I had accepted without checking, and it was wrong. Correcting the record rather than leaving it standing in a shipped release.

### Corrected
- **[0.37.12](https://github.com/23blocks-OS/ai-maestro/releases/tag/v0.37.12) said "seven of eight staged fragments are the poll's wording". That attribution is in doubt, and the doubt is specific.** There is a **third** writer of that sentence, which the grep behind 0.37.12 missed because it covered `lib/` and the writer lives under `scripts/`:

  | writer | string | lands in |
  |---|---|---|
  | `lib/agent.ts` (the 5-min poll) | `…Please check your inbox.` | the **input box**, typed |
  | `scripts/claude-hooks/ai-maestro-hook.cjs:289,296` | `…check your inbox using the agent-messaging skill.` | the **transcript**, rendered |
  | `lib/notification-service.ts` (push) | `[MESSAGE] {subject} — from {from}` | the input box, typed |

  A `{ decision: "block", reason }` return is displayed *by* Claude Code as output. It appears in a pane capture as transcript text and **never as staged input** — so fragments carrying the skill suffix are the hook working correctly, not a nudge that failed to submit.

  The reporters' captures are almost certainly a mix: one pane held `notify counsel about the undefined hours`, which is nobody's nudge and can only have been typed. Which region each fragment occupied is the fact that settles it, and only they can answer it.

- **The Stop hook cannot drop a keystroke, because it never presses one.** Verified: two mentions of tmux in the whole file, both *reading* a session name; delivery is `process.stdout.write` at line 698. It is structurally immune to the entire failure class these releases have been chasing — and the comment at lines 612–617 already said so.
- **"The pane is an unreliable write surface for everyone" was wrong.** The reporters measured their own tooling and have **zero** `send-keys` callers; their inbox poll runs `amp-inbox` inside its own session and reads. The unverified write surface is ours alone, in the two `lib/` paths.

### Unchanged, and worth stating
- **The 0.37.12 recovery is safe regardless.** The `C-u` retype fires only when the readback finds *our own per-message ref* inside the input-box region. Hook transcript text cannot trigger it; with nothing staged it never runs. The code is right where the reasoning was wrong.

### Verified
- Stop hook reachability across all three hosts: wired to the current `ai-maestro-hook.cjs`, with **zero** per-project `settings.local.json` carrying their own `Stop` hook to shadow it. That is configuration, not behaviour — the distinction is the entire subject of these releases and is marked here deliberately.

### Notes
- The methodological failure is worth recording because it is not the obvious one: I accepted the wider, more self-critical conclusion *because* it was wider and more self-critical. Preferring the unflattering story to the checked one is the same error as preferring the flattering one — it just wears better clothes. One message earlier I had praised the reporters for grepping both possible origins instead of the one they expected.
- Heuristic from the same exchange, kept verbatim: **"a number that cannot be true about the measurer is the cheapest control available."** It killed a false alarm of 993 undelivered messages that had every marking of a confirmation — the measuring agent's own inbox showed 327 unread, which it knew was false about itself.

## [0.37.14] - 2026-09-02 — Prose typed into an agent no longer runs as shell commands (#426)

Reported by **@Shadercloud** on a fresh install. They created an agent called Steve, sent it a sentence of ordinary English, and got:

```
david@David-Razer:~$ Steve you will be my second in command. When I say "Hire" an agent I actually mean "Create"…
Steve: command not found
david@David-Razer:~$ The first thing we need to do it setup an HR departmand hire and HR manager.
Command 'The' not found, did you mean: command 'he' from deb node-he (1.2.0-4)
```

**Their prose was executed by bash, one line at a time.** Their question — *"Did I do something wrong in the installation?"* — deserved an answer, and the answer is no.

### Fixed
- **Session status `online` means the tmux session EXISTS, not that an agent is running in it.** Chat and meeting injection checked only that, so a pane sitting at a shell prompt accepted the message and the shell ran it. Both paths now refuse when the pane is visibly at a shell, and say what to do about it instead of failing cryptically.

  The check is deliberately **asymmetric**: it does not try to prove an agent *is* running — there are too many agent CLIs, and a false negative would refuse to deliver to a working agent. It proves a **shell** is running, which is a short closed list (`bash`, `zsh`, `fish`, `login`, the `-bash` login forms…) and the only case that causes harm. Unknown occupants are allowed through, and any failure to introspect the pane allows through too: absence of evidence is not evidence.

### Notes
- The delivery layer behaved correctly throughout — the reporter saw *"Not confirmed — may not have reached the agent"*, which is exactly right and is the honesty work from 0.37.7–0.37.12 doing its job. What was missing was refusing to send at all, and explaining why.
- This does **not** fix the underlying cause of their empty pane: the configured program never started, most likely because `claude` was not installed or not on `PATH` inside that tmux session, and the launch failure is currently swallowed with a warning. Surfacing that at creation time is the real fix and is not in this release — the guard stops the damage and names the likely cause, which is as far as it honestly goes.
- 1160 tests passing, 30 new.

## [0.37.13] - 2026-09-02 — Registration no longer looks like it failed, and a wrong guess stops inventing identities

Reported by **salesland-dev-3metas** (Salesland iCPA, 3Metas) while registering a new agent against a local Maestro. Two bugs, and the root cause of the second turned out to be a directory-creation defect that has been quietly manufacturing garbage identities.

Ships to hosts via [claude-plugin#27](https://github.com/agentmessaging/claude-plugin/pull/27) → [plugins#33](https://github.com/23blocks-OS/ai-maestro-plugins/pull/33) → this submodule bump. The upstream merge alone changes nothing on any machine.

### Fixed
- **A successfully registered agent reported `@default.local` everywhere a human would check.** `amp-register.sh` wrote `registrations/<provider>.json` and `IDENTITY.md` and called back to the Maestro API, but never touched `config.json` — so `amp-statusline`, `amp-identity` and `amp-inbox` all kept the pre-registration identity. The registration had genuinely succeeded; only the evidence of it was missing. Now patched surgically with `jq` (`.agent.tenant`, `.agent.address`, a `provider` block) rather than through `save_config`, which rebuilds the object and would drop `agent.id`, `fingerprint` and `createdAt` — the same destructive shape as the auto-fix removed in 0.37.8.
- **`exit 0` having persisted nothing.** A first invocation could print "Updating identity file…" and exit clean with `registrations/` still empty; only a second run with `--force` worked. `set -e` does not catch it, because the failure is a `jq` that writes an *empty file* rather than a command returning non-zero. The success path now verifies the file exists and contains an `apiKey`, and exits 1 otherwise.
- **The root cause of that: a wrong inference was manufacturing identities.** `amp-helper` resolves the agent from the working directory when nothing more explicit is available — a `.claude/settings.local.json` hint, else the agent that uniquely owns `$PWD`. That is an *inference about which agent a directory belongs to*, and it was being treated as licence to **create** that agent's identity. A hint naming an agent with no entry in this home fell through to the raw name path and auto-created an empty shell: `keys/`, `messages/`, `registrations/`, no config.

  Reproduced from a clean home: **one `amp-init --name foo` produced two directories** — the real UUID one and a stray shell for an unrelated name — because `amp-init` overrides `AMP_DIR` only *after* the helper has already created the wrong one. That is also how a registration can land under one resolution while the operator inspects another.

  These shells are not harmless: a later name-based resolution can select the empty shell over the real identity, which is one of the ways an agent ends up looking unregistered or reading an empty inbox.

### Changed
- **`amp-init` no longer depends on an inference firing.** Requiring the cwd hint to point at an existing identity exposed a latent dependency: init only worked because *something* resolved, so on a genuinely clean home with no project hint it would have failed outright. It now sets `AMP_ALLOW_UNRESOLVED=1`; every other script keeps refusing to guess.
- `--help` documents that `--api-url` must include the API base. The script posts to `{API_URL}/v1/register`, so `http://localhost:23000` returns a 404 that reads like the provider is down — the failure sends you to inspect the wrong system entirely.

### Verified
End to end from a clean home: `amp-init` creates exactly one directory, `amp-register` updates `config.json`, and `amp-identity` reports `Tenant: rnd23blocks` rather than `default` — the reporter's exact symptom.

### Notes
- Upstream suite 211 passing, 13 new tests, including that the config patch preserves `agent.id` and `fingerprint`, and that a cwd hint for an unknown agent creates nothing.
- The reporter's repro was precise enough to work from without a clarifying question. Their `--force` observation — *"since exit 0 is not trustworthy there"* — was the correct read of the failure and is what pointed at the root cause.

## [0.37.12] - 2026-09-02 — The five-minute poll was not the rescue, it was the same failure retried

3Metas captured the verbatim staged text from eight panes this morning, read-only, before anything was cleared:

```
3m-accounts : check the inbox
3m-cmo      : check the inbox
3m-counsel  : check your inbox
3m-growth   : check your inbox
3m-hr       : check your inbox
3m-support  : check inbox
3m-web      : check the inbox
3m-sales    : notify counsel about the undefined hours
```

**Seven of eight are inbox nudges, and "check your inbox" is this poll's wording.** The push path's format is `[MESSAGE] {subject} — from {from}` and contains the phrase nowhere.

So [0.37.10](https://github.com/23blocks-OS/ai-maestro/releases/tag/v0.37.10) had it backwards. The five-minute poll was never a reliable channel quietly rescuing failed pushes — **it is the same dropped keystroke, retried every five minutes, failing identically each time.** That is how one agent stayed deaf from roughly 20:09 to 07:00 with over a hundred attempts, each typing on top of the last.

### Fixed
- **The poll path now recovers, not just reports.** 0.37.10 gave it proof-of-submission and stopped there, so it could see the text staged in the input box and do nothing about it. It now clears with `C-u` and retypes — the recovery the message-wake path got in 0.37.7 — which is the measured fix: *Enter once fails, Enter twice fails, clear-and-retype then Enter succeeds 7 of 7.*

### Added
- **`session_created` in the pane diagnostics.** Their caution, and it is a good one: `pane_current_command` carries the Claude Code version, and **a version field looks like a property while behaving like a timestamp**. Claude Code auto-updates itself with no announcement — they watched it move from 2.1.258 to 2.1.259 between two restart rounds — so a long-running session is pinned to whatever binary existed when it started. They lost real time reading a version column as "these agents share a property" when it only meant "these agents started at the same time". Recording when the session began makes that legible rather than a trap for the next reader.
- **`public/avatars/face-anchors.json`** — the avatar face anchors, served. The mobile app resolves every asset relative to the host URL, so fetching anchors from the host keeps it in sync as avatars are added; a bundled copy goes stale the first time someone adds one. Carries the derivation ratios, the per-set fallbacks and a coverage block. `scripts/calibrate-avatar-rigs.mjs` now emits it alongside the bundled TS.

### Corrected
- **Coverage was misreported.** 245 avatars = **192 measured + 53 on set defaults** (8 men, 1 woman, 44 robots — one robot *is* detected). An earlier note said "45 robots on the default", which does not add up and would have led a consumer to treat a missing anchor as a bug. **A missing entry is expected**, and the JSON says so.

### Notes
- The reporters found the third staged fragment, `"check the inbox"`, in their **own** agent's sent messages — it appears nowhere in our source. The staging failure is therefore not specific to our poll: the pane is an unreliable write surface for anyone who types into it. Their own manager hit it while diagnosing. Our verification covers our paths; theirs is theirs to instrument.
- 1130 tests passing.

## [0.37.11] - 2026-09-02 — Agents that look alive on a call, with lips driven by the actual voice

The call screen had a static portrait and a five-bar "waveform" animating on a timer:

```js
height: [8, 24 + Math.random() * 8, 8]   // driven by a boolean, not by the voice
```

It moved identically for silence, a word and a shout, and the avatar never blinked, breathed or moved. The agent did not look dead because of the mouth — nothing moved at all.

### Added
- **`AgentFace`** — the portrait, animated. A soft jaw warp opens the mouth (three horizontal bands: rigid above the hinge, stretched across the lips, chin displaced), with an inner-mouth shadow that deepens as it opens. Sprites were rejected deliberately: they need an exact mouth position per avatar and there are 245 of them, and a hard-edged sprite three percent out of place looks broken where a soft band still reads as talking.
- **`FaceMotion`** — blink, breathing, micro-sway and gaze, all delta-time driven and pure, so a 120Hz display and a throttled background tab behave identically and a dropped frame never skips a blink. **This is the half that actually creates the illusion**: humans read blink cadence and micro-motion long before they inspect lips.
- **Expression driven by real agent state.** `thinking` drifts the gaze up and away and slows the blink; `waiting` (a permission prompt or a question) holds eye contact; `active` breathes faster. The app already computed this and spent it on a border glow. `offline` is **frozen and desaturated on purpose** — a breathing avatar for an agent that is not running would be the same class of lie as a delivery report nothing verified.
- **Speech level from the real waveform.** A Web Audio `AnalyserNode` taps the TTS `<audio>` element; RMS (not peak, which twitches) through a noise gate and a soft knee drives the jaw. The speech bars now show the same signal.

### Fixed
- **The soft knee clipped.** `min(1, g / (1 + g * 0.45))` crosses 1 at a finite input, so every syllable above 0.36 RMS — ordinary loud speech — pinned the jaw fully open and held it, losing exactly the detail a mouth is meant to show. `g / (1 + g)` approaches 1 asymptotically and stays monotonic at any input.
- **Coming back online never blinked again.** Going offline left the blink timer at `Infinity` and nothing rescheduled it, so a face that returned stayed dead for the session. Caught by a test, not by watching.

### Known limitation
- **`web-speech`, the default TTS provider, cannot be lip-synced at all.** `SpeechSynthesis` renders straight to the output device and exposes no stream — there is no element, no `MediaStream`, no supported way to tap the audio. Those calls get a synthetic 4–6Hz envelope, and the mode is reported as `synthetic` rather than quietly passed off as measurement. Real sync needs the OpenAI or ElevenLabs provider.

### Calibration, because the first approach was wrong
Anchors began as one set per avatar folder, assuming a generated set would be consistently framed. **It is not**: the `women` set alone spans an eye line from 0.337 to 0.411 of image height, and at the wrong end the mouth shadow landed on the chin and the eyelids drew under the eyes.

`scripts/calibrate-avatar-rigs.mjs` now measures every avatar once, offline: eyes via OpenCV Haar cascades, everything else derived from **inter-ocular distance**, which is the standard anthropometric scale and — the point — invariant to crop. Cross-checked against hand-measured mouths on four faces spanning the framing range: `(mouthY − eyeY) / IOD` came out **1.06, 0.99, 1.09, 1.03**, and the derived mouths land within one percent of the measured ones. 191 of 200 human avatars calibrated; robots fall back to a hand-measured default (Haar detects 1 of 45 — many have visors or no face) and get a **damped** jaw, because a rigid faceplate that stretches reads as a rendering bug rather than speech.

### Notes
- The blink took five attempts, four of which were rejected by rendering them and looking. The lesson worth keeping: they were judged at 5× zoom, where every seam is glaring. At the sizes this renders — a 96px circle, a 160px call avatar — the artifacts are a pixel or two and invisible. **Verify at display size, not at zoom.**
- 1125 tests passing; 42 new covering motion cadence, the level curve and rig derivation.

## [0.37.10] - 2026-09-02 — The wake that was actually delivering had no proof at all

3Metas retracted a message tonight, and the retraction was worth more than the claim. They had called four agents deaf using a 2m19s observation window, published it, then found all four had answered at **4m22s–4m31s** — clustered within 9 seconds of each other.

That timing is the finding. **It is a 5-minute poll, and it is ours.**

### Fixed
- **`Agent.checkMessages()` — the 5-minute inbox poll — reported success on HTTP 200.** It POSTs a "you have N unread" prompt to the session command endpoint, and `sendCommand` returned `success: true` the instant `sendKeys` returned. That proves bytes reached tmux and nothing more: it is the identical unearned claim fixed in 0.37.7 for the message-wake path, surviving untouched in a **second implementation nobody had looked at**.

  It matters more than the first one, not less. When a push wake stages in an input box and never submits, **this is what rescues it five minutes later** — which is exactly how the failure stayed invisible for months. Messages did arrive. They arrived up to five minutes late, by a different route than the one everyone was watching.

  `sendCommand` now takes `verify: true` (opt-in, so canvas/chat/meeting injection are unaffected) and returns `submitted` / `staged` from a real pane readback, reusing 0.37.7's proof-of-submission.
- **The poll now names the mechanism**: `✓ Inbox poll wake SUBMITTED — delivered by the 5-min poll, not by push`. Without that, a poll-delivered wake is indistinguishable in the logs from a push-delivered one, so *"push works"* stays an assumption rather than a measurement. Expect this line to be common.

### Corrected documentation that was actively misleading
- `CLAUDE.md` and two comments in `lib/agent.ts` stated message polling was **disabled by default**, "replaced by push notifications". The code has always been `config.messagePollingEnabled !== false` — **on unless explicitly disabled**. Anyone reading the docs would have concluded there was no safety net under push, and would have misread an agent that "eventually" woke. Both now say enabled, with the measurement that proves it.

### The methodological point, kept because it is the actual lesson
3Metas held the number that would have prevented their error — a measured 3m48s response time, which they had quoted to us in writing hours earlier — and chose a 2m19s window for a test of the same phenomenon. Their words:

> A negative result inside a window shorter than the known response time is not a result. It is the clock. We published it as biology. **The window could only say ABSENT, never SLOW — so slow came back as absent.**

That is the same defect this changelog has been about for three releases: an instrument that cannot express the thing it is measuring. Our readback window was 1 second per send, sized against nothing in particular. It is now 12 polls × 250 ms with the reasoning written down beside it, so the next person changing it knows what it has to outlast.

### Notes
- 1078 tests passing. 8 new, covering the poll path's verdicts and specifically that a slow render is not reported as absent.

## [0.37.9] - 2026-09-02 — The fullscreen readback, measured instead of assumed

3Metas raised a concern against the 0.37.7 fix itself, and it was the right question: proof of submission requires the message to appear **above** the input box, and an agent on Claude Code's fullscreen renderer reports `history_size=0`. Their `3m-leads` is in exactly that state — it is their sandboxed manual launch, so it never received `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` — and it owns their live customer contact route.

> your new proof-of-submission readback has no scrollback to read on the one agent that owns our live customer contact route

### Verified
- **It works, and now there is a test proving it.** Reproduced their state locally — a tmux session running Claude Code 2.1.252 launched without the env var: `alternate_on=1, history_size=0, 80x24` — sent a notification through the same two-step send, and captured the pane. Both fixtures in `tests/pane-staged-text.test.ts` are that raw capture. `history_size=0` removes the **scrollback**, not the screen: `capture-pane` still returns the visible screen, the fullscreen renderer draws the submitted prompt above its input box like any other, and the check runs within a second of sending. Submitted classifies as submitted; staged classifies as staged.
- **The subtlety the test pins**: both the echoed prompt and the empty input box begin with `❯`. Splitting at the *first* prompt line would put the submitted message inside the input region and invert the verdict. Splitting at the *last* is what makes it correct — and that is now asserted rather than incidental.

### Known limitation, stated rather than discovered later
- On the alternate screen there is no history to fall back on, so a burst of output that scrolls the message off the visible screen before the poll reads as "not seen". That produces a **duplicate nudge** via the retry queue — never a lost message, and never a spurious clear-and-retype, because the needle is not in the input box.

### Also
- **The width hypothesis from 0.37.8 is disconfirmed.** 3Metas measured it: identical 80x24 geometry on both the clean agent and the deaf ones, and the two *wider* 102-column panes were among the deaf — the wrong direction. Their standing lead is now that the one clean agent was **adopted** rather than created by AI Maestro, so it was started differently. The 0.37.8 instrumentation records `command` (which for Claude Code carries the version) and `hookReport` at failure time, which is the discriminator that hypothesis needs.
- Their caveat is load-bearing and worth repeating: that geometry was measured *now*, not at test time, and a pane can be resized. Recording it at the moment of failure is precisely why 0.37.8 does it there.

### Notes
- 1070 tests passing.

## [0.37.8] - 2026-09-02 — Hosts get the identity fix; staged wakes record what differs

### Fixed
- **Hosts were still running the script that rewrites the identity it reads.** [claude-plugin#26](https://github.com/agentmessaging/claude-plugin/pull/26) merged upstream, but fresh installs (`install-plugin.sh`) and host updates read the **built** submodule, not `claude-plugin` directly — so nothing reached a host until the plugin was rebuilt ([plugins#32](https://github.com/23blocks-OS/ai-maestro-plugins/pull/32)) and the pointer bumped. That is this release. `--id` now beats an inherited `AMP_DIR`, `load_config()` is read-only, repair lives in `amp-init --repair-config` (which keeps keys, id and registrations, unlike `--force`), and `amp-init` completes an existing identity instead of minting a rival directory.

### Added
- **A staged wake now records what was different about the pane.** The failure does not hit every agent, which means something distinguishes the ones it hits — so instead of arguing about it, the warning carries the candidates measured at the moment of failure: `width`, `height`, `alternate_on`, `history_size`, `in_mode`, `command`, plus `hookReport` and `payloadChars`.
  - **width** is the leading hypothesis. A narrow pane wraps the same notification into more lines, and line count is what pushes a TUI into treating input as a multi-line *paste* rather than a typed prompt — different submit semantics, same bytes. Our own fleet is already split 80 vs 101 columns.
  - **alternate_on** would mean the fullscreen renderer, which handles input differently *and* keeps no scrollback — so it breaks the readback as well. Agents launched by hand rather than woken by AI Maestro miss `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`, which is exactly the shape of the sandbox workaround in the field report.
  - **hookReport** distinguishes the two payload shapes: plain text to a live agent TUI, `echo '...'` to anything else. Different length, different quoting, plausibly different handling.
- `describePane()` on the runtime interface, optional so a runtime that cannot introspect its pane reports nothing rather than guessing.

### Notes
- No behaviour change to delivery itself; 0.37.7 already stopped counting staged text as delivered. This makes the *cause* findable from logs instead of reproducible only in production.
- 1066 tests passing.

## [0.37.7] - 2026-09-02 — Field report from a 50-agent estate: four of five findings

A production estate (3Metas, ~50 agents across three hosts) reported five findings from one day of use. Four are fixed here; the fifth is a missing capability and is designed and logged rather than half-built. Every one of the four is the same shape this subsystem keeps producing: **a component reporting something it had not earned.**

### Fixed

- **A wake that stages text in the input box was reported as delivered.** `capture-pane` includes the agent's input box, and the readback looked for the message *anywhere* on the pane — so text typed into an agent and never submitted read back exactly like text the agent had received. The pane adapter returned `confirmed`, which additionally suppressed the retry that would have rescued it. Reported cost: **eight of nine agents on one host holding staged, unsubmitted text, one of them for about eleven hours**, with `stop_reason=end_turn`, clean turn durations and a moving `lastActive` throughout. Seven were recoverable wake nudges — the mail was still in the inbox. **One was a real instruction with no inbox copy, and it was lost.** Proof of delivery is now proof of *submission*: the message must appear **above** the input box, where a TUI echoes what it accepted. Text found still in the box is reported as `staged` — positive evidence of non-delivery, distinct from "unknown" — and routed to the retry queue.
- **Recovery now clears before retyping.** The reporter measured it: Enter once fails, Enter twice fails, **clear-and-retype then Enter succeeds 7 of 7**. Typing again on top of staged text just produces a doubled line. Resends send `C-u` first.
- **The pane route reports `failed`, not `unavailable`, when it typed and the text did not take.** `unavailable` means "this route does not apply"; using it for a route that applied and failed hides a real fault behind a word that means nothing to see here.
- **An unrecognised `program` no longer silently becomes bare Claude Code.** The resolver ended in `return 'claude'`, so any value it did not recognise launched plain Claude Code — the worst possible default, because the one configuration that must never launch bare (a sandboxed wrapper) is exactly what an unrecognised name produced. `lib/program-command.ts` now returns an error and **refuses to launch**, and the wake reports `programStarted: false` with the reason. This also removes a second, slightly different copy of the same ladder in the session-create path.

### Added

- **Wrapper scripts as `program`.** An agent that reads untrusted external mail can now point `program` at an absolute path to an executable — e.g. a `sandbox-exec` wrapper. Previously `program` was a closed whitelist, so the only way to sandbox an agent was to wake with `startProgram:false` and launch it by hand, which held until the next ordinary wake started the program **unsandboxed with nothing to warn anyone**. The reporter built a detector because they could not build a preventer. Wrapper paths are validated (absolute, exists, executable, no shell metacharacters, no whitespace) because `program` is interpolated into a shell command line. A wrapper whose name contains `claude` is treated as Claude Code for flag purposes, so it keeps `--permission-mode`, telemetry and `--channels` — losing `--permission-mode` on a sandboxed agent would be a silent downgrade of exactly the agent that needs it.
- **A `channel-wake` startup diagnostic.** The channel route injects a real turn with no keystrokes and is the only one that works cleanly on an idle agent — and on both of the reporter's hosts `~/.aimaestro/channels/` did not exist. Not empty: **absent.** Nothing was broken and nothing lied; the adapter correctly reports `unavailable` and delivery falls back to the pane. But it was invisible, and cost a day to discover. Startup now says out loud how many online agents have a channel, how many are proven by ack, and which of the three preconditions is missing — including whether `AIMAESTRO_CHANNEL_FLAG` is even set.

### Not fixed — designed and logged

- **Agents cannot run as separate OS users** (`docs/BACKLOG.md` #20). Every agent runs as whoever started the server, so a correctly-scoped per-repo deploy key protects nothing at the filesystem level — `git` refused the reporter's agent access to a repository it then read as a plain directory. There is no `user`/`uid`/`runAs` field anywhere: a missing capability, not a misconfiguration. The fix crosses a privilege boundary (sudoers per agent user, per-user tmux sockets, per-user `$HOME` and AMP home, ~50 existing agents to migrate, two production hosts differing in all of it). **A `runAs` field that appears to isolate and does not would be precisely the defect class this entire release is about**, so it is designed in the backlog rather than shipped unverified. The new wrapper support is a real interim mitigation for the untrusted-input case.

### Upstream (separate repo, not in this release)

- **A read command rewrote the identity of the agent it read** — [agentmessaging/claude-plugin#26](https://github.com/agentmessaging/claude-plugin/pull/26), open and green. `amp-inbox.sh --id <other>` run from an agent session rewrote the target's config to the caller's name and dropped the target's id, and separately `--id` was ignored outright whenever `AMP_DIR` was exported. The reporter ranked it first, correctly: *"it changes the system while appearing to observe it, and it cannot be audited around, because the audit is what causes it."* An agents manager sweeping the fleet to check for identity corruption would have renamed every agent it inspected. **That fix reaches the hosts only after #26 merges and the plugin is rebuilt.**

### Notes
- Verified against the live registry before changing the program resolver: 75 `claude-code`, 8 `Claude Code`, 1 `none`, 1 unset — all still resolve.
- 1066 tests (up from 1017): 11 pinning submitted-vs-staged, 5 the staged recovery flow, 33 the program resolver including command-injection refusals. Upstream: 11 new bats tests, 9 of which fail against the previous code.

## [0.37.6] - 2026-08-28 — Backlog: deferred ideas from the competitor benchmarks

### Added
- **Five backlog entries** capturing what the Paseo / Open Session / opensessions analyses produced but nobody logged. They were living in gitignored benchmark docs and in one session's context, which is where ideas go to die.
  - **#15 QR-code pairing for mobile app → host registration** — Paseo's pairing UX (public key in the URL *fragment*, so the page server never sees it; the host refuses commands until the handshake completes), running over our existing Tailscale transport. Explicitly **not** their relay: Tailscale gives real network identity and ACLs, and their own docs treat it as first-class.
  - **#16 Fresh-context scheduled tasks (`fresh: true`)** — the v0.37.0 scheduler lands every `prompt` in the agent's existing context. Correct for internal maintenance, a prompt-injection surface for anything triggered by external input. Open Session ships both modes and makes the trade explicit.
  - **#17 Read-only agent tier** — `permissionMode` has no "can read, cannot write" level. **Two independent competitors converged on this primitive** (Paseo's committee agents cannot modify files; Open Session has an `ask` mode), which is the strongest signal in the benchmark set.
  - **#18 Agent status push contract** — agent state is inferred from hooks, pane readback, and heuristics that grep the terminal for a trust prompt. That inference is what let a host index **nothing for months** while reporting healthy (0.36.48–0.36.50). Logged with the caveat we already paid for: only *deterministic code* reporting is worth anything — an agent that chooses to report is the same unreliable narrator.
  - **#19 Git worktree isolation per task** — flagged by both Paseo and Open Session; open question is how it squares with `workingDirectory` being a stored agent property.

### Notes
- `docs/BACKLOG.md` header was stale at v0.29.16 / 2026-01-03; refreshed.
- No functional change. Docs only.

## [0.37.5] - 2026-08-28 — Docs viewer shows file names

### Fixed
- **The browse list displayed markdown titles instead of file names.** The label was `doc.title || filename`, and `title` is the document's H1 — so a `CLAUDE.md` beginning `# GM — \`3m-gm\`` rendered as **"GM — 3m-gm"**. Observed across agents: `3m-gm` → `"GM — \`3m-gm\`"`, `3m-sales` → `"Sales Manager / BD — \`3m-sales\`"`. The same file looked like a different one in every agent, extensions were invisible, and there was no way to tell which file you were about to open. File names are now the label (monospace, with extension); the markdown title is shown beside them as secondary context, and omitted when it merely repeats the name.
- **Sorting used the title too**, so files scattered unpredictably — `CLAUDE.md` sorted under "G" because its heading began with "GM". Now sorts by file name.
- The open-document header leads with the file name; the markdown title sits underneath as context.

### Notes
- Search results still lead with the title, which is correct there — you are looking for content, not for a file. Only the browse tree changed.
- Together with 0.37.3 and 0.37.4 this closes out the docs tab behaving like a file browser: real folder names, no pseudo-root, real file names.

## [0.37.4] - 2026-08-28 — Docs viewer behaves like a file browser

### Changed
- **Root-level files are no longer nested inside a pseudo-folder called "Root".** They render as plain top-level rows beneath the real folders, which is what Finder, VS Code and GitHub all do. The `(root)` bucket was an artefact of the grouping implementation leaking into the UI: it looked like a directory, had an expand arrow and a count badge, and did not correspond to anything on disk.
- Folders are listed alphabetically, then root files — no wrapper, nothing to expand to reach a file that sits at the top of the project.
- Dropped the 0.37.3 workaround that auto-expanded the `Root` bucket. It was compensating for the wrong shape rather than fixing it.

### Notes
- `(root)` remains an internal grouping key; it is simply never rendered as a folder. Tests assert it cannot leak into the folder list.

## [0.37.3] - 2026-08-28 — Docs tab: root-level files were hidden behind an absolute-path folder

### Fixed
- **Root-level documents (CLAUDE.md, README.md…) appeared to be missing from the Docs tab.** They were indexed and present in the data the whole time. The folder grouping stripped only the agent's registered `workingDirectory` from each path; when that drifted from the `project_path` the documents were actually indexed under, the prefix never matched, the path stayed **absolute**, and because an absolute path always contains `/`, the `(root)` bucket was never produced at all. Root files were filed under a folder row literally named `/Users/.../jarvis/v2` instead of `Root`. Observed on `23blocks-api-jarvis`: registered at `.../jarvis/api`, docs indexed under `.../jarvis/v2`. Grouping now prefers each document's own `project_path`, falls back to the prop, and when neither matches uses the immediate parent directory name — **never an absolute path as a folder label**. Same stale-binding class as the memory faults fixed in 0.36.48–0.36.49.
- **The browse list silently truncated.** `action=list` orders by `-updated_at` and applies a limit, so anything hidden was disproportionately *stable* files — precisely the ones a reader goes looking for. One agent has 340 documents against a 200 limit. The list endpoint now returns `total` and `truncated`, the UI requests 500, and shows a **"Showing N of M"** badge when the set is cut.

### Changed
- `action=list` returns `projectPath` per document.
- The `Root` folder is expanded by default. Every folder started collapsed, and a single collapsed `Root` row is easy to scan past among a dozen siblings.

### Notes
- The indexer was never at fault: `**/*.md` matches root files under glob 10.3.10, and CLAUDE.md was present in the `documents` relation for every agent checked.
- `23blocks-api-jarvis` still has a genuine binding drift — its registered working directory and its indexed project path disagree. The display now handles it correctly, but re-indexing that agent against its current directory is a separate cleanup.

## [0.37.2] - 2026-08-27 — Agents that were running come back after a server restart

### Fixed
- **Nothing restored running agents after a restart.** The intent was already recorded correctly — `persistSession()` on wake means *"this should be running"*, `unpersistSession()` on hibernate means *"this should stay down"* — and `restoreSessions()` existed behind `POST /api/sessions/restore`. But **nothing ever called it**: zero automatic callers in `server.mjs`, the startup scripts, or the ecosystem config, so it had to be triggered by hand and never was. It now runs at server startup, 5s after listen, non-blocking.
- **Restore would not have brought agents back anyway.** It called `runtime.createSession()`, which opens a **bare tmux session with no program running inside** — worse than staying offline, because the API then shows a healthy session doing nothing. It now re-wakes through the same path `wakeAgent()` uses, relaunching the agent's program.
- **The record lacked what a relaunch needs.** `PersistedSession` held only `id`/`name`/`workingDirectory`. It now also records `program`, `permissionMode` and `sessionIndex` at wake time, falling back to the agent's own settings for pre-0.37.2 entries.
- **Stale records are reconciled, not resurrected.** A record whose agent is no longer in the registry is dropped rather than restored as an orphan session. That is how 73 persisted entries had accumulated against 8 real sessions.

### Changed
- Persistence moved from `~/.ai-maestro/sessions.json` to `~/.aimaestro/sessions.json`, alongside the rest of AI Maestro state — the old path was one hyphen away and easy to confuse. `session-persistence.ts` is the only reader or writer of this file, so nothing else is affected. The legacy file is **deliberately not migrated**: its 73 entries were stale, `agentId`-less, and pointed at the wrong working directory, so importing them would have made boot restore spawn dozens of wrong sessions. It is left in place, untouched.

### Verified live
Woke a throwaway agent (record written with program/permissionMode/sessionIndex), killed its tmux session to simulate a machine restart, restarted the server → `[Restore] 1 agent(s) restored, 0 already running, 0 failed`, session back. Then hibernated it, restarted again → record absent, agent **stayed asleep**. Existing sessions untouched throughout.

## [0.37.1] - 2026-08-27 — Three agent-lifecycle bugs

All three shared the shape that has recurred across this subsystem: an operation reported success it had not earned, so the failure was invisible until someone opened a terminal.

### Fixed
- **`${var,,}` broke agent creation on macOS** ([plugins#31](https://github.com/23blocks-OS/ai-maestro-plugins/pull/31)). macOS ships bash 3.2.57, where `${var,,}` is a runtime *"bad substitution"* error. Two sites used it, and because the scripts run `set -uo pipefail` (no `-e`) neither crashed — both produced a **wrong answer**. `agent-commands.sh:404`: `program_lower` stayed empty, the whitelist test failed, and `aimaestro-agent.sh create` aborted with *"Invalid program: claude"* for a valid program. `agent-helper.sh:790`: `check_agent_exists()` returned non-zero, so the caller read *"no collision"* and the duplicate-name check silently never fired on macOS at all. Both now use `tr '[:upper:]' '[:lower:]'`; verified under `/bin/bash` 3.2.57.
- **`amp-send` reported success for a recipient with no identity directory.** `deliverLocally()` and the federation path both called `deliver()` and **discarded its result** — `grep -c "const .* = await deliver("` returned 0. `deliver()` reports failure by returning `{delivered: false, error}` (no recipient UUID, inbox write failed), so the route answered `200 {status: 'delivered'}` for a message that was never written, and `amp-send` printed a success line with an id it had generated locally. The result is now checked; a failed write returns **502 `delivery_failed`** with the underlying reason, and the success payload carries `verified`.
- **New agents stopped at "Do you trust the files in this folder?" with nothing reporting it.** That prompt blocks before Claude Code can run a hook, so no status is ever reported: tmux shows the session alive, the API shows a healthy agent, and the operator only finds out by opening the terminal. Two changes: AI Maestro now **pre-accepts trust** for the working directory the operator declared when creating the agent (`hasTrustDialogAccepted` in `~/.claude.json`, alongside the existing `writeAgentDirHint` call) — the same stance the docker path already takes for codex; and `GET /api/messages/pending-wakes` now reports `blockedSessions`, detecting startup prompts on sessions that have no hook report.

## [0.37.0] - 2026-08-27 — Agent-owned scheduled tasks

**Minor release.** Agents stop being terminal sessions that happen to be running and become standing entities that carry their own schedule between machines.

Agents are meant to be autonomous entities that can move between machines. Their maintenance therefore has to be *theirs*, not the host's.

### Added
- **`lib/agent-schedule.ts` — schedules live with the agent**, at `~/.aimaestro/agents/<id>/schedule.json`, beside its CozoDB, keys and canvas. Move that directory to another machine and the cadence moves with it; whichever host runs the agent honours it, with no per-machine setup. New agents are seeded with hourly indexing and 02:00 consolidation.
- **The agent's own idle transition is the primary trigger.** The Stop hook already reports, per agent, on whichever host it runs — so when an agent goes idle the server runs whatever that agent is due for. No host timer owns the agent, and work lands exactly when the agent is free rather than competing with it.
- **`lib/agent-schedule-runner.ts`** executes due tasks. Three actions today: `index` (memory delta), `consolidate` (long-term memory), and `prompt` — which delivers through the **wake chain**, so a scheduled instruction gets the same proof-of-arrival as any message: confirmed, deferred while the agent is mid-render, or queued for retry. A schedule that fires into the void would be worse than no schedule.
- **`GET`/`POST /api/agents/[id]/schedule`** — read, replace, or `{"run": true}` to run due tasks now.
- The memory sweep is now the **fallback** executor rather than the mechanism: it runs each agent's own schedule, for agents that stay busy long enough to miss an idle transition. The host still holds no list of its own.

### Why not Claude Code's schedulers
Measured against the requirement, none fit: **Cloud Routines** get a fresh clone with no local file access, but the subconscious must read `~/.claude/projects/*.jsonl` and the agent's local database. **`/loop` / `CronCreate`** are session-scoped and in-memory (*"nothing is written to disk"*, `durable` has no effect), expire after 7 days, and only fire while that one session is open. **Desktop scheduled tasks** persist with local access but are machine-level config — the schedule would not travel with the agent.

### Two decisions worth noting
- A never-run task is due **immediately**, so an agent arriving on a new host starts working instead of idling out a full interval first.
- Daily tasks use a **23-hour window** rather than "today", so a machine asleep at 02:00 still consolidates when it wakes — the exact failure of the old resident-at-2am-or-never design.

### Verified live
Schedule seeded and persisted to the agent's directory; `run` indexed 24 messages; interval correctly suppressed the next run; and forcing a task due then firing the hook's idle transition produced `[Schedule] 633f6cdc ran 1 task(s) on idle`.

## [0.36.50] - 2026-08-27 — Embeddings run on CPU (a whole host had been silently unable to index)

### Fixed
- **`device: 'auto'` selected CUDA on Linux and failed every batch.** `lib/rag/embeddings.ts` passed `device: 'auto'` with a comment claiming *"CPU in Node.js"* — but on Linux, transformers.js offers ONNX Runtime the `cuda` execution provider first, and `onnxruntime-node` ships CPU-only. Session creation threw `sessionOptions.executionProviders[0] is unsupported: 'cuda'` for **every** batch. The model still downloaded and logged `Loading... 100%`, so the host looked healthy while indexing nothing. macOS resolved `'auto'` to CPU, so the identical code worked there and the failure looked host-specific rather than like a bad default. Now explicitly `cpu`, overridable via `AIMAESTRO_EMBEDDING_DEVICE` on a host with a genuine CUDA-enabled build.

  Verified on the affected 4-CPU, no-GPU host: **2,916 messages indexed in 7 minutes**, database `64 KB → 29 MB`, having been empty for months.
- **The memory sweep counted failed runs as successes.** `runIndexDelta` reports failure by *returning* `{success: false}` rather than throwing, so catching exceptions alone was not enough. That is how the broken host reported `17 indexed, 0 failed, 0 messages` — the number that looked fine and hid the outage. The sweep now inspects `success` and surfaces the underlying error.

### Notes
- This was the third distinct fault behind "memory isn't working", after stale project bindings (0.36.48) and ancestor-only bindings (0.36.49). Only the third one had any GPU involvement, and it was not a performance problem: nothing was slow, nothing ran at all. CPU embedding on 4 cores indexes roughly 7 messages/second, which is entirely adequate.

## [0.36.49] - 2026-08-27 — Ancestor bindings no longer count as valid

### Fixed
- **A binding pointing at an ANCESTOR of the agent's working directory was treated as valid**, so the re-discovery added in 0.36.48 never triggered for the most common real case. `pas-lola` is bound to `/home/jpelaez` while working in `/home/jpelaez/lola`: it scanned `~/.claude/projects/-home-jpelaez` (four conversations, all long deleted) and never touched `-home-jpelaez-lola`, where its real 23 conversations live. A fleet sweep after 0.36.48 confirmed it — 17 agents swept, **0 messages indexed**. A binding is now only considered valid if it points **at or below** the working directory.

## [0.36.48] - 2026-08-27 — Agent project bindings: agents can find their own conversations again

A survey of 163 agents across three hosts found **87 with wrong or incomplete memory bindings**. Three defects in `lib/index-delta.ts`, each of which made an agent silently index nothing while reporting success.

### Fixed
- **A dead `claude_dir` skipped a project forever.** Phase 1 did `if (!claudeDir || !fs.existsSync(claudeDir)) continue`. Older records stored a *nested* path — `<project>/<session>/subagents` rather than the project root — and once that directory rotated away the project was skipped on every subsequent run. The agent could never rediscover its own conversations and reported `0 new` indefinitely. Observed on the `maestro` agent: `claude_dir` pointed at a subagents directory that no longer existed while **47 conversations sat unread in the project root**. The correct directory is derivable from `project_path`, so it is now derived, persisted, and used. That one agent went from 0 indexed messages to **3,403 across 47 conversations** on the first run after the fix.
- **Conversations were matched to agents by exact `cwd` equality.** A subagent, or any session started in a child directory, has a deeper `cwd` and so was invisible to the agent that owns it. Matching is now prefix-based — with the nesting case handled: when an outer agent works in `/repo` and an inner one in `/repo/service`, a conversation in `/repo/service` belongs to the **closer** agent rather than being claimed by both.
- **Auto-discovery only ran when an agent had zero projects recorded**, so a wrong binding was permanent. It now also re-runs when the recorded binding no longer reconciles with the agent's current working directory.
- **Stale conversation records are now reported.** A run where recorded conversations no longer exist on disk logs `N/M recorded conversations no longer exist on disk — the binding is entirely stale`, instead of looking like a clean "0 to index".

### Added
- **`scripts/survey-agent-bindings.mjs`** — read-only audit reporting, per agent: working directory, bound project paths, dead conversation records, reachable `.jsonl` files under its own and child slugs, indexed message count, and a verdict (`OK` / `STALE_BINDING` / `UNBOUND` / `MISSING_CHILDREN` / `NO_WD` / `EMPTY`).

### Survey results
| host | agents | needing repair |
|---|---|---|
| local | 128 | 75 |
| mini-lola | 17 | 5 |
| mac-mini | 18 | 7 |

`NO_WD=66` on local are mostly orphaned data directories for agents no longer in the registry — a cleanup opportunity, not a binding fault.

## [0.36.47] - 2026-08-27 — update-aimaestro.sh always syncs the submodule

### Fixed
- **`update-aimaestro.sh` skipped the plugin submodule sync whenever the parent repo was already current.** The sync lived inside the "new commits available" branch, which made submodule freshness conditional on *parent* freshness — two independent things. If the parent was at the right commit but the submodule had drifted (an interrupted run, a manual `git pull` beforehand, a failed fetch), the script printed *"You're already on the latest version!"* and skipped the sync entirely, then reinstalled **stale** scripts and skills with no warning.

  Observed on mini-lola right after v0.36.46: parent at the correct commit, submodule three commits behind, old skill descriptions still installed. Reproduced by rolling the submodule back and re-running — the script reported success and changed nothing.

  The sync now runs on every path, with `git submodule sync --recursive` first in case `.gitmodules` moved, and reports the resulting commit so a stale submodule is visible in the output rather than silent.

### Notes
- This is the same class of bug as the v0.36.31 fix (which *added* the submodule update after `git pull`) — that fix was correct but placed on only one of the two code paths.

## [0.36.46] - 2026-08-27 — Ship the proactive skill descriptions to hosts

0.36.45 fixed the skill descriptions upstream but did not bump the submodule, so nothing reached hosts — installs read the *built* submodule, not the source repo.

### Changed
- **Plugin submodule bumped** `b645bba` → `130508e`, delivering the restored `memory-search` / `graph-query` / `docs-search` descriptions to every host on the next `update-aimaestro.sh`.

### Notes
- The bump was not a fast-forward. The pin carried **four fixes never merged to plugins main** — `session_id` on heartbeat, the full-featured hook superset, cwd-based identity resolution for detached sessions, and the statusline `CLAUDE_AGENT_NAME` fix — while main carried the skill fix. Bumping straight to main would have regressed detached-session identity. Resolved by merging main *into* the pinned lineage ([plugins#30](https://github.com/23blocks-OS/ai-maestro-plugins/pull/30)) and rebuilding, so one commit has both. Diff of built output against the old pin is exactly four files: the three SKILL.md descriptions and a generated README line.
- Plugins main is now ahead of the app's pin for the first time in a while, so future bumps should be clean fast-forwards.

## [0.36.45] - 2026-08-27 — Memory subsystem: honest status, residency-free maintenance, health check

Follow-on to 0.36.44. The audit found three separate reasons memory, the graph and the subconscious "seemed to be ignored" — none of which were the subsystems being broken.

### Fixed
- **The subconscious status endpoint started the subconscious it was reporting on.** `GET /api/agents/[id]/subconscious` called `agentRegistry.getAgent()`, which loads the agent and starts its timers — its own docstring said *"This will initialize the agent if it doesn't exist yet."* So the dashboard indicator was self-fulfilling (opening the UI made agents look active), and every render evicted other agents from the 10-slot LRU to render a badge. It now reports the live object only if the agent is **already** resident, otherwise falls back to the `status.json` that `Agent.writeStatusFile()` has been maintaining for exactly this purpose — with `isRunning` forced false, since an agent absent from the registry is not running whatever the file last claimed. Starting remains a POST: an action, not an observation.
- **Skill descriptions no longer wait to be asked** (in `ai-maestro-plugins`, [PR #29](https://github.com/23blocks-OS/ai-maestro-plugins/pull/29)). `memory-search`, `graph-query` and `docs-search` had their descriptions rewritten during the v0.22.0 plugin refactor from imperatives into keyword matchers — *"Use when the user asks to 'search memory'"* rather than *"search BEFORE starting new work"*. A skill's description is the only thing deciding whether a model reaches for it, so agents stopped consulting memory on their own. Restored the imperative framing while keeping the explicit-request phrases.

### Added
- **`lib/memory/sweep.ts` + `POST /api/memory/sweep`** — maintenance that does not require residency. Indexing only ever needed an agent id (`runIndexDelta` opens the database itself), but it ran from an Agent object's timer, and Agent objects live in a 10-slot LRU. With 125 agents that meant an agent was indexed only if something loaded it, loading the 11th cancelled the 1st's timers, and consolidation — gated on being resident at 2 AM — essentially never ran. The sweep walks agent directories instead: no hydration, no eviction, no LRU pressure. Same shape as Letta's sleep-time agents, where maintenance runs on a lifecycle independent of the primary.
- **`scripts/test-memory-systems.sh`** — the answer to "is there any way to test this?". Checks the things that were actually wrong rather than mere liveness: are ids deterministic, how many databases were written this week, does memory search return results, is the graph populated, **does querying status change status**, and can maintenance run off the LRU.
- **UI**: the subconscious indicator now shows "last active" for inactive agents, distinguishing *never indexed* from *indexed an hour ago, since evicted*.

### Notes
- Running the health check on this host reports 10/127 databases indexed this week and a 4.3 GB database — both expected until the sweep is scheduled and `scripts/dedupe-agent-memory.mjs` is applied. The point is that these are now **visible** rather than silent.
- The plugin submodule pointer is deliberately **not** bumped. The skill fix is merged upstream, but `ai-maestro-plugins` main has since diverged into a marketplace restructure with in-progress branches; adopting it is a reviewed decision, not a side effect of this change.

## [0.36.44] - 2026-08-27 — Deterministic message IDs (agent memory was 8x duplicated)

Investigating why agent memory and the subconscious "seemed to be ignored" led to a 36 GB pile of duplicated data and a one-line cause.

### Fixed
- **Message IDs were random, so nothing ever upserted.** `msgId.message()` built `msg-{ts}-{Math.random()}` (`lib/rag/ingest.ts:192,485`). `:put messages` upserts on `msg_id`, so a random component guaranteed an INSERT — every re-index stored a fresh copy of the message plus its ~26 `msg_terms` rows and its ~1.5 KB embedding. `index-delta` assumes indexing is idempotent; it never was. IDs are now seeded from `(conversation_file, text)` and hashed. Note `lib/rag/id.ts` is titled *"Ensures incremental updates don't create duplicate entries"* and every other generator in it was already content-hashed — messages were the sole exception.

### Added
- **`scripts/dedupe-agent-memory.mjs`** — collapses existing duplicates by their real identity `(conversation_file, ts, text)`, cascades to `msg_terms` / `msg_vec` / `code_symbols`, sweeps pre-existing orphans, then VACUUMs (SQLite frees pages to a freelist; the file only shrinks on VACUUM, which Cozo has no verb for). Dry run by default — the delete is not reversible.
- **`lib/memory/dedupe.ts`** — the same operation callable in-process against an open `AgentDatabase`.

### Measured
On a copy of the worst agent (`8845dd17`):

| | before | after |
|---|---|---|
| `messages` | 451,206 | 57,686 |
| `msg_terms` | 11,914,032 | 1,896,521 |
| file | 3,094.9 MB | **582 MB** |

87% of message rows were duplicates; **81% of the file reclaimed**, VACUUM taking 2.8s. Duplication scales with how often an agent has been indexed — 1.7x on a small agent, 6.8x and 7.8x on long-lived ones.

### Notes
- This is very likely why the `AgentRegistry` LRU cap exists (`maxAgents = 10`, added Jan 2026 as *"prevent memory bloat"*). At post-dedupe sizes the cap may be revisitable, which in turn is what strands the subconscious and consolidation — both only run for resident agents.
- CozoDB was evaluated and **kept**. Last release v0.7.6 (Dec 2023) so it is effectively unmaintained, but it is the only embedded store doing relational + recursive graph + HNSW vector + FTS in one file, the binding is N-API v6 (ABI-stable across Node majors, verified on Node 20), and it has no network surface. The 4 GB was our schema misuse, not the engine.
- Cozo's native `::fts` was evaluated as a replacement for the hand-rolled `msg_terms` index. It works (stemming and stopwords verified) but **does not backfill existing rows** — it indexes on write only. Deferred: the duplication was inflating the per-message index ratio, so the case should be re-measured on deduplicated data.

## [0.36.43] - 2026-08-27 — Legible, uniquely-identified notifications

Field report: an agent appeared to receive the same message over and over. It was eleven different messages — made to look identical by two defects introduced in 0.36.37.

### Fixed
- **`messageRef` was not per-message.** It sliced the FIRST 8 characters of `msg-<timestamp>-<random>`, but all the entropy is at the end, so every message sent within roughly 27 hours produced the identical ref (`msg17878`). Two consequences: the pane readback needle was not unique, so `confirmed` could be satisfied by a **stale ref left on screen from an earlier message** — a false positive in the exact mechanism built to eliminate false positives — and every notification looked like the same message repeating. Now takes the tail of the id.
- **Notifications no longer render as shell commands in an agent's transcript.** Every wake was wrapped in `echo '...'` so a bare shell would not execute it. With a TUI agent in the pane that wrapper is not just cosmetic — it puts `echo '[MESSAGE] ...'` into the agent's transcript on every message. 0.36.42's persisted hook status finally makes the two cases distinguishable: a live hook report means an agent TUI, so the text is sent plainly; no report still means `echo`, since an unnecessary `echo` is ugly but an unquoted message at a shell prompt is a command.
- **Default notification format leads with the subject** (`[MESSAGE] {subject} — from {from}`). Stacked in a transcript, sender-first lines were visually identical with the differentiator truncated off the right edge. `NOTIFICATION_FORMAT` still overrides.

## [0.36.42] - 2026-08-27 — Hook status persistence (closes the idle-gate blind spot)

Closes the known gap from 0.36.41: the idle gate only had a signal while a PTY was attached, so it worked for agents someone was watching in the dashboard and was inert for the rest.

### Added
- **The Claude Code hook's reported state is now persisted, not just broadcast.** The hook already fires on `Stop` / `SessionStart` / `Notification` and knows what the agent is actually doing, but `broadcastActivityUpdate()` only pushed it to WebSocket subscribers and dropped it. It now lands in `shared-state.hookStatus` (sessionName → `{status, notificationType, at}`), and `lib/session-idle.ts` prefers it over PTY recency. **This is the only busy/idle signal that exists for an agent with no attached terminal**, so the idle gate now covers every hooked agent.
- **`idleSignals` on `GET /api/messages/pending-wakes`** — which agents we have a real signal for, what it says, how old it is, and which source answered (`hook` / `pty` / `none`). `source: "none"` is the remaining blind spot: no hook report and no attached terminal.

### Fixed
- **`/api/messages/pending-wakes` was returning a build-time snapshot** — the handler reads only in-memory maps and calls no dynamic API, so Next statically prerendered it at build time and served frozen zeros forever. An endpoint whose entire job is reporting live state reported nothing. Now `force-dynamic`; found while verifying this release rather than by a user.

### Notes
- **Injecting into a permission modal is now impossible by construction.** The two mistakes are not symmetric: deferring a genuinely idle agent delays a wake by one tick, while typing into a `permission_request` **answers the modal**. So only states positively recognised as waiting count as idle — `idle`, and `waiting_for_input` *only* when `notificationType === 'idle_prompt'`. `active`, `permission_request` and anything unrecognised defer.
- Hook reports expire after 15 minutes. An agent that dies mid-turn would otherwise leave `active` as its last word forever and block its own wakes permanently; after the TTL we fall back to PTY recency.

## [0.36.37] – [0.36.41] - 2026-08-27 — Provable message delivery

The long-standing "messages arrive but agents never read them" problem. Root cause was not transport — routing, signing and federation all worked. **Every wake route reported success it had not earned, and one of those false positives suppressed the fallback that would have worked.**

### Fixed
- **Channel pushes no longer claim delivery they cannot prove** [0.36.37] — `pushToChannel()` returning `true` meant only that our local HTTP server took the POST and `mcp.notification()` wrote to the stdio transport. Claude Code never acknowledges channel notifications and [drops them silently](https://code.claude.com/docs/en/channels-reference) when the session did not register the server as a channel. `deliver()` treated that as proof and **skipped the tmux fallback**, so in exactly the configuration a fleet rollout starts from, the message was lost with no delivery at all and the logs said it was fine. The channel server now exposes an `amp_channel_ack` tool and persists `verified: true` into `~/.aimaestro/channels/<agentId>.json`; only `isChannelVerified()` may suppress the fallback. The failure is static per session, so one ack covers its lifetime; until then both routes fire.
- **tmux notifications are read back off the pane** [0.36.37] — `sendTmuxNotification()` returned `void`, so `notified: true` meant "two `send-keys` calls did not throw". It now sends, then captures the pane looking for a per-message ref (`[#abc12345]`, whitespace-normalised so it survives hard-wrap), polling for render lag before resending. Reports honestly: verified / notified-but-unverifiable / not notified. **Readback needs no cooperation from whatever occupies the pane**, so it is the one route that covers a mixed fleet — Claude Code, Codex, Gemini CLI, Aider, or a bare shell.
- **Wakes carry the message, not a pointer** [0.36.37] — the pane notification was `check your inbox`, a step an agent could skip. It now carries the body, single-lined and truncated. Single-lining is load-bearing: a raw newline in `send-keys` submits a TUI early and opens an unterminated quote at a shell prompt. `NOTIFICATION_FORMAT` still owns the header, so custom templates keep working.
- **CI unbroken on Linux runners** [0.36.37] — `tests/agent-dir-hint.test.ts` built its scratch dir under `/private/tmp`, which only exists on macOS. CI had been red on `main` since 0.36.34 for this alone.
- **The channel fix became installable** [0.36.38] — 0.36.37 changed the plugin bundle but not its manifest version, so `claude plugin update` reported "already at the latest version" and kept serving the pre-fix code. Same class of bug as the rest of this release: state claimed without anything backing it up.

### Added
- **Explicit wake-adapter chain** [0.36.39] — `lib/wake-chain.ts`. Routes are now an ordered chain, each reporting one of five statuses (`confirmed` / `sent` / `deferred` / `unavailable` / `failed`) instead of a boolean. **Only `confirmed` stops the chain** — the rule that generalises the whole fix. Order is `stream → channel → pane`: strongest proof first, universal fallback last. WebSocket and webhook stay outside the chain and keep firing unconditionally; `ws.send()` has no application-level ack and its clients are dashboards, not agent loops.
- **Idle-gated pane wakes** [0.36.40] — typing into a mid-render TUI is where notifications get eaten, and sending harder cannot fix it because the send is not what fails, the timing is. A busy pane now defers to `lib/wake-queue.ts` and flushes on the idle transition. One flush per agent per 5s tick, 10-minute TTL, 20-deep cap dropping oldest.
- **Retry and an operator surface for unconfirmed wakes** [0.36.41] — an unconfirmed wake used to be the end of the story. It now re-enters the wake queue with backoff (0s / 30s / 2m / 10m), and **gives up loudly** after four attempts rather than retyping forever. `GET /api/messages/pending-wakes` lists every message that is on disk but unproven, with `reason` (`busy` vs `unconfirmed`), attempt count and retry timer. `DeliveryResult` gained `verified`, `verifiedBy`, `deferred` and `wakeAttempts`, threaded through `sendFromUI` → `messages-service` so API callers can tell "accepted" from "proved".
- **End-to-end wake test** [0.36.41] — `./scripts/test-message-wake.sh` sends a real AMP message to a live local agent and asserts whether anything could prove it landed. Verified in production; the trace `stream:unavailable → channel:sent → pane:confirmed` is the original bug being caught and survived live.

### Notes
- **Known gap: the idle gate is inert for unwatched agents.** `sessionActivity` is only stamped while a PTY is attached, so an agent nobody is watching in the dashboard always reads as idle. Two alternatives were measured and rejected: tmux `#{session_activity}` was 25 minutes stale on a visibly working agent, and diffing pane captures was backwards in both directions. **Closed in 0.36.42** by persisting the hook's reported state.
- **Channels cannot carry the fleet.** `--channels` only accepts Anthropic-allowlisted plugins unless an admin sets `allowedChannelPlugins`, which is Team/Enterprise only; it is also Claude Code-only and Anthropic-auth-only. Treat it as an opportunistic fast path. The pane readback is the route that works everywhere.

## [0.36.35] - 2026-08-19 — Honest agent metrics overview

### Changed
- **Agent profile "Metrics Overview" now shows only real data.** Five of the eight tiles (Messages, Tasks, Uptime, Sessions, Avg Response) had no writer anywhere and were permanently `0`/`N/A` across every agent. Fixed:
  - **Sessions** ← `launchCount` (tracked on every wake; falls back live so existing agents populate immediately).
  - **Active Time** (was "Uptime") ← telemetry `claude_code.active_time.total` — real active time, not calendar age.
  - **Avg Response** ← telemetry `api_request.duration_ms` (running average in the OTLP logs receiver).
  - **Removed Messages and Tasks** — a message counter belongs in a dedicated AMP view (per-agent disk I/O on render or under-counting history), and Tasks is team-meeting-scoped. Both applied to `AgentProfileTab` and `AgentProfile`.
- Result: 6 honest tiles — Sessions, Active Time, Avg Response, API Cost, Tokens Used, API Calls (the last four fill when telemetry is enabled). Verified live end-to-end.

## [0.36.33] - 2026-08-19 — Total API Calls tile (OTLP logs)

### Added
- **Total API Calls telemetry** — completes the metrics tiles. With `AIMAESTRO_TELEMETRY`, agents now also export OTLP *logs* (`OTEL_LOGS_EXPORTER=otlp`); a receiver at `POST /api/telemetry/v1/logs` counts `claude_code.api_request` events per `session.id` and increments the matching agent's `totalApiCalls` (`services/telemetry-service.ts` `parseApiRequestCounts`/`ingestClaudeLogs`). Log batches are deltas, so this increments rather than sets. Verified live end-to-end.

## [0.36.25] – [0.36.32] - 2026-08-19 — Detached-session identity, native Claude Code integration & telemetry

### Added
- **Native Claude Code session names** [0.36.28] — agents launch with `claude --name <agent>` (opt-in `AIMAESTRO_SESSION_NAME`), so Claude Code natively knows the agent's name. It surfaces in the status-line `session_name`, the terminal title, and `claude --resume <name>`. `lib/claude-session-name.ts`, injected into both launch builders (tmux wake + docker).
- **Claude Code `session_id` capture** [0.36.29] — the hook forwards Claude's native `session_id` on the heartbeat and the registry stores it as `Agent.claudeSessionId`, linking an agent to its transcript and enabling native resume + telemetry correlation.
- **OTLP telemetry receiver** [0.36.32] — agents launched with `AIMAESTRO_TELEMETRY` export `claude_code.*` OpenTelemetry metrics to `POST /api/telemetry/v1/metrics`. The receiver attributes token/cost usage to an agent via the `session.id` on each data point (→ `Agent.claudeSessionId`), filling the long-unfed **Tokens Used** and **API Cost** tiles. `lib/claude-telemetry.ts` + `services/telemetry-service.ts`. Cost is also reported live from the status line.

### Fixed
- **Detached (non-tmux) sessions self-identify** [0.36.25–0.36.27] — a Claude Code session started manually (not via tmux) could not tell which agent it was, so the status bar showed a wrong/bogus name and the AMP CLI refused to run ("Multiple AMP agents found"), leaving detached agents unreachable over AMP. AI Maestro now writes a per-project `.claude/settings.local.json` `env.CLAUDE_AGENT_NAME` when it provisions an agent (`createAgent` + `linkSession`), and `amp-helper.sh` / `amp-statusline.sh` resolve identity from it (or the registry's unique owner of the cwd). The status line also stopped scraping `CLAUDE_AGENT_NAME=` out of permission allow-rules.
- **Hook single source of truth** [0.36.27] — `ai-maestro-hook.cjs` shipped from two drifting copies; consolidated to one canonical file + `scripts/sync-plugin-hook.sh` + a CI drift test.

### Build / Pipeline
- **Plugin propagation fixed** [0.36.30–0.36.31] — fresh installs and host updates read the *built* plugin submodule, which had drifted behind upstream `claude-plugin`. Rebuilt it (`build-plugin.sh --clean`) and fixed `update-aimaestro.sh` to run `git submodule update` after `git pull` (it was reinstalling stale scripts). Added a mandatory "propagate plugin" step to the Pre-PR checklist.

### Notes
- Everything above is **off by default** (per-host opt-in env flags) — the fleet is unaffected until enabled.
- **Total API Calls** still needs the OTLP *logs* exporter (`api_request` is an event, not a metric) — a follow-on.

## [0.36.16] – [0.36.24] - 2026-08-04 — AMP identity integrity, DID conformance & security hardening

### Security & Fixed
- **Eliminated shared AMP identities** [0.36.16–0.36.18] — agents had been copying the machine's keypair/address into their own dirs, so dozens of agents shared one Ed25519 identity and signed as the same key. Stopped copying the machine keypair into agent dirs, repaired affected agents, and added structural guards so each agent gets a unique per-agent identity. Enforced AMP signature verification server-side and fixed server-side key contamination.
- **Fingerprint format** — key fingerprints must hash the raw 32-byte Ed25519 key, not the full DER; repair/audit paths corrected.
- **Identity Conflict Detection** [0.36.19–0.36.20] — a key-swap / TOFU (trust-on-first-use) ledger detects when an address's key changes unexpectedly; hardened the ledger and closed a conflict-detection footgun.

### Added
- **AID / DID conformance** [0.36.22–0.36.23] — the runtime adopts a key-derived `did:key` identity and exposes it on the wire; added key revocation lists, replay protection, and an Agent Card `did`, completing DID coverage for the Agent Identity + Messaging protocols.

### Fixed
- **Permission menu drops option 1** [0.36.24] — on tall permission prompts the pane scraper dropped the first option ("Yes"); the parser now finds prompts buried under output and keeps every option. `lib/pane-permission.mjs` + tests.

## [0.36.14] – [0.36.15] - 2026-07-31 — Idle-agent delivery via Channels (fleet rollout)

### Added
- **Fleet rollout of `amp-channel`** [0.36.14] — reliable idle-agent delivery via the Claude Code Channels MCP contract (see [0.36.13]); added the `aimaestro-channels` marketplace manifest so agents can launch with the channel plugin instead of the dev `--dangerously-load-development-channels` flag.

## [0.36.13] - 2026-07-31 — Reliable idle-agent wake via Claude Code Channels

### Added
- **`amp-channel` — the reliable last-mile that fixes idle-agent notifications.** The long-standing failure (a message arriving while an agent sits idle never wakes it, because tmux `send-keys` silently drops the Enter) is solved by **injecting a real turn through the Claude Code Channels MCP contract instead of keystrokes.**
  - `lib/amp-channel-server.mjs` — a self-registering MCP "channel" server (one per agent session): declares the `claude/channel` capability, binds a free localhost port, writes `~/.aimaestro/channels/<agentId>.json`, and cleans up on exit. An HTTP POST to it pushes a `notifications/claude/channel` event → Claude Code injects a turn, even on a fully idle agent.
  - `lib/channel-bridge.mjs` (`pushToChannel`) — the delivery side: reads the registry and POSTs the message into the agent's channel. File-based IPC (the channel server runs in the agent's CLI process, separate from the AI Maestro server).
- **One-hop integration in `deliver()`** (`lib/message-delivery.ts`): every path — the Slack / Discord / Email / WhatsApp gateways **and** agent-to-agent AMP — funnels through `deliver()`, so a single insertion makes them all reliable. The channel push runs alongside the streaming push, and **tmux `send-keys` is now a fallback** used only when the agent has no channel registered (fully backward compatible).
- Verified end-to-end on the production path: an idle agent received a `deliver() → pushToChannel` message, woke with **zero keystrokes**, loaded the agent-messaging skill, and ran `amp-inbox.sh` on its own. Runs on the user's Claude Max subscription, Node (no Bun).

### Notes
- Fleet rollout is the next step: launch agents with `--channels` + the `amp` MCP server. Packaging `amp-channel` as a channel plugin and adding it to the org's `allowedChannelPlugins` drops the `--dangerously-load-development-channels` dev flag (and its interactive warning) for unattended launch.

## [0.36.11] – [0.36.12] - 2026-07-30 — Reliable AMP message delivery (Stop-hook + streaming push)

### Tests & hardening [0.36.12]
- Extracted the Stop-hook delivery decision into a pure `decideStopDelivery()` (+ `filterFreshMessages`, `buildAmpBlockReason`) so the core logic is unit-testable without stdin/fetch plumbing; guarded `main()` behind `require.main === module`. Added `tests/ai-maestro-hook.test.ts` (loop guard, claude-only gate, dedup, urgent formatting, 10-message cap) and `tests/streaming-bridge.test.ts` (push into live session, skip closed/exited, error-swallow). Suite: 812 passing.
- Fixed `scripts/bump-version.sh`: the `package.json` update keyed on the *previous* version string, so once `package.json` drifted it was silently skipped on every bump (it had sat at 0.29.16 for many releases). Now sets the root version via `node` regardless of prior value — never touches dependency versions.


### Fixed
- **AMP notifications now reach agents without manual "check your inbox"** — The single most common daily annoyance: a message would arrive, but the agent wouldn't act on it until the operator manually typed "check your inbox." Root cause: inbox delivery relied on injecting `additionalContext` at the `idle_prompt` notification, which **cannot start a turn on an already-idle agent** — so the nudge sat there unseen. Two fixes:
  - *Terminal agents — Stop-hook block delivery* (`plugin` submodule, `ai-maestro-hook.cjs`): the Stop hook now returns `{ decision: "block", reason }` when genuinely-new unread messages exist, forcing the agent to read and respond via the agent-messaging skill **before** it goes idle. Loop-safe: honors `stop_hook_active` (never blocks twice in a row) and dedups on message IDs in a per-cwd store so each message nudges exactly once. Claude-only (`decision:block` is a Claude Code capability); codex/gemini fall through to idle state as before. This is the reliable path — it fires at a clean turn boundary, not mid-render.
  - *Streaming agents — direct SDK push* (`lib/message-delivery.ts`, `lib/streaming-bridge.mjs`): streaming (Agent SDK) agents have no tmux pane to notify, so an AMP message routed to a streaming agent is now pushed straight into the live SDK input stream via `session.push()`. Reliable regardless of TUI state. The streaming-runtime session map is now backed by `globalThis` so the Next delivery layer and the raw-ESM server share one map (same pattern as `shared-state-bridge`).

### Notes
- The idle unattended-tmux fallback (two-call `send-keys`: text, 150 ms pause, then Enter) was already in place (`notification-service.ts`) and is unchanged.
- Scheduling: AI Maestro already ships its own cron scheduler (`lib/schedule-registry.ts` + `lib/schedule-executor.ts`, standard cron expressions, per-agent prompt on a cadence, full REST API). It is **not** wired to Anthropic's cloud "Routines" or the local `cron_*` tools — those remain a separate, future integration. No UI yet.

## [0.36.6] – [0.36.10] - 2026-07-24 — Permission reliability, terminal scrollback, security

### Security
- **RCE via gray-matter JavaScript frontmatter (GHSA-g7qj-fhxp-6chc)** [0.36.7] — `gray-matter` evaluates `---js`/`---javascript`/`---coffee` frontmatter as executable code. Parsing untrusted `SKILL.md` (from the unauthenticated `POST /api/plugin-builder/scan-repo`, or installed marketplace plugins) with plain `matter()` was a remote-code-execution vector (CWE-94, high severity). Added `lib/safe-matter.ts` which overrides those engines to throw, and replaced both call sites (`plugin-builder-service.ts`, `marketplace-skills.ts`). Reported by tonghuaroot.

### Fixed
- **Chat: permission prompts now show reliably AND button responses land** [0.36.8–0.36.10] — Three stacked bugs that forced users to bounce between chat and terminal to see/answer tool-permission prompts:
  - *Responses never landed:* permission button clicks went through `sendChatMessage`, whose guard **refuses to send while a prompt is pending** — so the answer to the prompt was blocked by the prompt. New `sendPermissionResponse()` bypasses the guard and sends the **raw keystroke** (`chat:permissionResponse` frame) that actually selects a Claude Code menu option, instead of pasting a line.
  - *Session torn down under the chat:* cleanup counted only terminal (PTY) clients, so with the chat open and no terminal attached, the 30s grace cleanup destroyed the session — killing the permission watchers and orphaning the chat ("message sending forever"). Cleanup now fires only when **both** terminal and chat clients are gone; a 2.5s permission poll surfaces prompts regardless of hook/JSONL timing.
  - *Prompts buried under output missed:* the pane detector scanned only the last 18 lines. Rewrote `detectPermissionFromPane()` to anchor on menu **structure** (footer/`❯` selector/"do you want to proceed" + ≥2 short numbered options) over a 45-line region — finds buried menus and AskUserQuestion pickers, rejects prose lists and "working" states. Fixes apply to desktop, mobile, and tablet chat (server-side detection + shared response path).
- **Terminal: scrollback restored** [0.36.6] — Claude Code rolled out its fullscreen/alternate-screen renderer as default (2.1.11x→2.1.20x); on the alt screen nothing is written to the normal buffer, so tmux keeps zero history and scroll does nothing. Agents now launch with `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` (Anthropic's documented opt-out) so output returns to the normal buffer and scrollback works. Verified: plain claude → `alt=1 hist=0`; with the var → `alt=0`, history grows. Escape hatch: `AIMAESTRO_KEEP_ALT_SCREEN=true`. Takes effect on agents woken after the change.

## [0.36.0] – [0.36.5] - 2026-07-23 — Streaming execution mode (Agent SDK)

### Added
- **Streaming agents — Claude via the Agent SDK, no tmux** — A per-agent `stream-json` runtime (`lib/streaming-runtime.mjs`, `@anthropic-ai/claude-agent-sdk`) as an alternative to the terminal: structured chat with token-level streaming, **permission cards** via the SDK `canUseTool` callback (risky tools prompt, safe ones auto-run), native session **resume** (continues the agent's latest conversation), persistent per-agent sessions with buffered replay across reconnects, and identity injection. Runs on the user's subscription (headless token from `~/.aimaestro/claude-oauth-token`).
- **Wake-dialog execution mode** — Choose **Terminal** or **Streaming** when waking a Claude agent; streaming needs no tmux (spawns on connect and resumes the latest conversation). The Terminal tab is disabled with a jump-to-Streaming affordance while an agent runs in streaming mode; a mode badge shows the active mode. Additive — no changes to tmux online-detection; terminal agents untouched.

## [0.35.55] – [0.35.64] - 2026-07-05 — Terminal + chat UX (phase 0)

### Fixed
- **Chat reliability** — Messages wrap inside the viewport (no clipped/overflowing bubbles); send never submits unverified text silently (fails visibly with retry, then reverted the over-strict gate so verified sends aren't dropped); pending bubbles clear only when their own echo lands and expire to a retryable failed state; dedup no longer drops thinking blocks; scroll-stick keeps you in place while reading with a "new messages" pill; reconnect after backgrounding actually reconnects; transcript path handles `.` in project dirs and re-resolves after `/clear`.
- **Terminal reliability** — Fixed an idle-heartbeat false positive that force-reconnected healthy terminals every ~40s (the periodic refresh/flash); unified paste through `terminal.paste()` (no more literal `200~` leaks); copy-on-select is opt-in; async tmux calls on connect (no event-loop stalls); exponential reconnect backoff. Removed a mis-designed tmux copy-mode scroll experiment (`0/0`, swallowed Enter) in favor of plain xterm scrolling.
- **Consolidated** the triplicated JSONL transcript logic into `lib/chat-transcript.mjs`; released the cerebellum ring-buffer on session cleanup.

## [0.35.54] - 2026-06-05

### Reverted
- **Terminal: revert headless xterm.js and parallel addon loading (v0.35.52–v0.35.53)** — The headless xterm.js approach (server-side serialized terminal state) caused terminal initialization failures, broken scrolling, and multi-minute load times on agent switch. Reverted `server.mjs`, `useTerminal.ts`, and `TerminalView.tsx` to the stable v0.35.50 behavior (tmux capture-pane for history, sequential addon loading, blocking WebGL init). Dependencies (node-pty 1.1.0, ws 8.21.0) remain updated.

## [0.35.50] - 2026-06-04

### Fixed
- **Terminal: content duplication on WebSocket reconnect** — When a WebSocket connection dropped (heartbeat timeout, network blip), the client reconnected and the server sent 5000 lines of tmux history — but the terminal buffer was never cleared first. History was appended on top of existing content, causing visible duplication. For high-output agents (e.g., Claude Opus "thinking" animation producing dense ANSI), this created a devastating re-render every 30-40 seconds. Now clears the terminal buffer on reconnect before fresh history arrives.
- **Chat: sending state distinguished from thinking** — Chat activity indicator now shows "Sending..." (blue pulse) while the message is being delivered to the agent, separate from "Thinking..." (amber pulse) when the agent is processing. Applies to both desktop ChatView and MobileChatView.
- **Chat: paste-probe message delivery** — `sendChatMessage()` now uses tmux buffer paste (load-buffer + paste-buffer) instead of send-keys -l, with a poll-based verification loop that confirms the text appeared in the pane before sending Enter. Prevents lost messages when tmux input handling is slow. Also blocks sending when agent is at a permission prompt.
- **Tab validation on load** — Active tab restored from localStorage is now validated against the list of valid tabs. Previously, a stale value (e.g., removed "terminal2") would silently fail to render any tab content.

## [0.35.44] - 2026-05-29

### Added
- **Chat: AskUserQuestion interactive rendering** — Claude Code's multiple-choice questions (AskUserQuestion tool_use) now render as interactive numbered buttons in the chat UI, matching the terminal experience. Users can click options directly instead of typing numbers. Includes "Other" option that focuses the chat input. Buttons disable immediately after selection. Works in both assisted and power modes, desktop and mobile.
- **Chat: live activity indicator from PTY** — Parses real-time PTY output to show what the agent is doing while working. Detects spinner status ("Thinking…", "Reading...", "Searching..."), thinking step progress ([1/418], [2/418]), and tool execution patterns (Running, Writing, Editing). Shows in the chat header (replaces generic "Agent is working...") and as an animated inline bubble at the bottom of the message list. Throttled to 500ms, clears when assistant messages arrive. Works for local agents; remote agents get this with deployment of the same version.

### Fixed
- **Chat: AskUserQuestion messages hidden in assisted mode** — Messages containing only an AskUserQuestion tool_use were incorrectly filtered as "tool-only" messages. Now excluded from tool burst grouping and always visible since they require user interaction.

## [0.35.31] - 2026-05-27

### Fixed
- **Chat view empty for agents with underscores in working directory** — Claude Code converts both `/` and `_` to `-` when naming project directories (e.g., `rag_ingestion` → `rag-ingestion`), but our JSONL path resolution only replaced `/`. Any agent with underscores in its path couldn't find its conversation files. Fixed in `server.mjs`, `agents-chat-service.ts`, and `voice-subsystem.ts`.

## [0.35.30] - 2026-05-27

### Fixed
- **Terminal resize storm causing content to jump/rewrite** — Multiple independent systems (onOpen, history-complete, ResizeObserver, notes toggle) all triggered `fit()` → resize message → PTY resize → tmux full-screen redraw simultaneously. Now: no resize on connect (PTY spawns at correct size via URL params), no resize on history-complete, resize messages gated until history is loaded, deduplicated by tracking last sent cols/rows. Only real user actions (browser window resize, notes panel toggle) trigger a resize.
- **Tab switching causing terminal re-render** — Switching between Terminal and Chat tabs disconnected/reconnected the WebSocket, causing a full history reload + resize storm on return. WebSocket now stays connected across tab switches.
- **ResizeObserver debounce too short** — Increased from 150ms to 300ms so CSS transitions fully settle before refitting, preventing redundant fit→resize cascades.

### Added
- **Agent scheduling system** — Cron-based task scheduling for agents. Schedules stored in `~/.aimaestro/schedules.json`, checked every 60s by a timer in server.mjs. Supports creating tmux sessions for offline agents and sending prompts via send-keys. API: `GET/POST /api/agents/{id}/schedules`, `PATCH/DELETE /api/agents/{id}/schedules/{scheduleId}`, `GET /api/schedules` (global), `POST /api/schedules/{id}/trigger` (manual/webhook). Execution history tracked per schedule.

## [0.35.28] - 2026-05-27

### Fixed
- **Circuit breaker permanently disabling remote hosts** — When a remote host became temporarily unreachable, the circuit breaker tripped after 3 failures and set `enabled: false` in `hosts.json`, permanently disabling the host until manual config editing + server restart. Replaced with a proper half-open circuit breaker pattern: state is now in-memory with exponential backoff (30s → 60s → 120s → 240s → 5min cap). When cooldown expires, the next UI poll probes the host automatically. Success resets everything. `hosts.json` is never modified by the circuit breaker.
- **Reactivate endpoint rejecting circuit-broken hosts** — `/api/hosts/[id]/reactivate` only handled `enabled: false` hosts. Now also handles in-memory circuit-broken hosts (enabled but with open circuit).

### Added
- **Container hardening flags** — Agent Docker containers now launch with `--cap-drop=ALL` (selective `--cap-add` for 6 required capabilities), `--security-opt no-new-privileges`, and `--tmpfs /tmp:noexec,nosuid,size=100m`. Existing containers get these on next `/recreate`.
- **`GET /api/docker/stats`** — New endpoint returning real-time CPU %, memory usage/limit/%, network I/O, and PID count for all running agent containers, mapped to agent IDs.

## [0.35.26] - 2026-05-20

### Fixed
- **Chat: hookState/permission prompts not appearing** — The hook's agent resolution used `find()` on `/api/agents` by working directory, which returned the wrong agent when multiple agents share the same cwd. Now uses a 3-tier resolution: (1) `AIM_AGENT_ID`/`AIM_AGENT_NAME` env vars, (2) `/api/sessions` for active tmux sessions, (3) fallback cwd match. Server-side `broadcastActivityUpdate` also tries agentId-based session lookup when the primary sessionName has no chat clients.
- **Chat: messages overflowing viewport** — Long messages broke out of chat bubbles. Added `min-w-0 overflow-hidden` on bubble containers, `max-w-full` on code blocks, and `overflow-wrap: anywhere` on paragraphs.
- **Chat: duplicate pending messages** — Sent message appeared twice (pending + real) because the `hadNew` flag was set inside React's deferred `setMessages` callback and was always false when checked synchronously. Fixed by clearing pending unconditionally on new JSONL data.

## [0.35.24] - 2026-05-20

### Fixed
- **Chat: production-grade WebSocket reliability** — Replaced 3s polling hack with proper WebSocket architecture based on production best practices: server-side dead connection sweeping (RFC 6455 protocol ping + `_isAlive` flag), client-side pong verification with 45s timeout and forced reconnect, 15s heartbeat on both desktop and mobile.
- **Chat: permission button clicks not working** — Button actions ("y", "1", etc.) were never clearing from pending because permission responses don't appear as `user` messages in the JSONL. Now clears pending on any genuinely new messages from the JSONL watcher.
- **Chat: partial JSONL line race condition** — `broadcastJsonlUpdates` now handles incomplete lines when Claude is mid-write, preventing silently dropped messages.
- **Chat: auto-scroll tracking** — UUID-based tracking instead of message count (always 200 after server cap).
- **MobileChatView: no heartbeat** — Mobile was missing all keepalive/reconnect logic. Now has 15s heartbeat, pong verification, and same pending/scroll fixes as desktop.

## [0.35.21] - 2026-05-19

### Fixed
- **Mesh host cache desync causing lost agents** — The `.mjs` host config module cached hosts forever and filtered disabled hosts at the cache level. When the circuit breaker disabled a host or a host was re-enabled, `server.mjs` never learned about it, causing persistent "Host not found" errors and broken terminal connections for remote agents (e.g., mini-lola).
- **Cross-module cache invalidation** — When the circuit breaker writes to `hosts.json`, both the TypeScript and ESM host config caches are now cleared via a `globalThis` bridge. Previously only the `.ts` cache was invalidated, leaving `server.mjs` with stale data until restart.
- **AMP messages silently routing to disabled hosts** — `message-send.ts` now rejects routing to disabled hosts with a clear error instead of silently timing out.
- **AMP mesh auth trusting disabled hosts** — Disabled forwarding hosts no longer receive automatic authentication trust in `amp-service.ts`.
- **Dead code in websocket-proxy.mjs** — Replaced `host.type === 'local'` (never triggers, property not set in ESM module) with `isSelf(host.id)`.
- **Frontend AbortError cascade** — `useAgents.ts` now skips disabled hosts entirely, preventing timeout-triggered React re-render storms.

### Added
- **TTL cache for host config (30s)** — `hosts-config-server.mjs` re-reads `hosts.json` every 30 seconds instead of caching forever. Hosts re-enabled by sync or manual edit are picked up automatically without server restart.
- **Disabled host visibility in getHostById** — `getHostById()` now finds disabled hosts so callers can give proper error messages ("host is disabled") instead of generic "host not found". `getHosts()` still returns only enabled hosts for backward compatibility.

## [Unreleased]

### Added
- **Call mode session fork** — When a companion voice call starts, the server auto-spawns a temporary `{agentName}__call` tmux session with `--permission-mode bypassPermissions` (full autonomy). Voice transcripts route to this YOLO fork instead of the primary supervised session, so tool-call permission prompts don't block conversational flow. Same agent identity, workdir, and skills — just a disposable autonomous session.
- **Multi-client call session sharing** — Multiple companion clients connecting to the same agent share a single `__call` session. The session is only killed when the last client disconnects.
- **`user_message` routing to call session** — Typed text from the companion UI now also routes to the `__call` session when active, matching `voice:transcript` behavior.
- **Stale call session cleanup** — Orphaned `__call` tmux sessions from server crashes are automatically killed on startup.
- **`computeCallSessionName()` / `isCallSession()` helpers** — Centralized naming convention (`__call` suffix) in `types/agent.ts`, used across all files.
- **Call session integration test** — `scripts/test-call-session.sh` validates the full lifecycle: spawn, sidebar hiding, orphan prevention, transcript routing, disconnect cleanup, multi-client.
- **12 unit tests for call session** — Covers helpers, `parseSessionName` non-collision, `__call` filtering in both `/api/sessions` and `/api/agents` discovery paths.

### Fixed (v0.35.14)
- **Remote terminal blank screen** — Fixed WebSocket proxy not forwarding `cols`, `rows`, and `socket` query parameters to remote hosts. The remote PTY was spawning at default 80x24 instead of the client's actual terminal dimensions, causing blank or broken terminal rendering. Same fix applied to cloud agent container connections.

### Improved
- **Trust level descriptions** — Each permission mode now shows a clear explanation of what it does (e.g., "Asks before every file edit and shell command") plus a detail blurb when selected explaining when to use it.
- **Permission mode only for Claude Code** — The trust level selector in the Wake Agent dialog is now hidden when waking non-Claude programs (Aider, Codex, Cursor, Terminal), since `--permission-mode` is a Claude Code-only flag.
- **Reordered permission modes** — Plan Only now appears second (after Supervised) instead of last, so the list flows from most restrictive to least restrictive.

### Fixed
- **Command injection risk in companion-ws** — Replaced all `execSync` shell-string tmux commands with `execFileSync`/`execFile` (array args, no shell). Agent names validated against `[a-zA-Z0-9_-]+` before use.
- **Event loop blocking on transcript delivery** — Transcript routing now uses async `execFile` instead of blocking `execSync`, preventing WebSocket/HTTP stalls during rapid speech.
- **Voice buffer timing race** — Changed `getBuffer()` to `getOrCreateBuffer()` for voice subsystem attachment, ensuring the buffer exists regardless of PTY observer timing.
- **`__call` sessions leaking into agent discovery** — Added `isCallSession()` filter to both `fetchLocalSessions()` (sessions-service) and `discoverLocalSessions()` (agents-core-service). Without this, `__call` sessions would auto-register as orphan agents in the registry.

## [0.35.11] - 2026-05-17

### Added
- **voice:transcript upstream handler** — Mobile companion can now send spoken text to agents via `/companion-ws`. Transcripts route through the same `sendChatMessage()` pipeline as typed /chat messages, so session resolution, copy-mode cancellation, and tmux key sending all work identically.
- **voice:interrupt upstream handler** — Mobile companion can send barge-in interrupts to cancel in-progress speech generation. The voice subsystem aborts LLM summarization, clears the terminal buffer, and broadcasts a stop signal to all companion clients.
- **Server-initiated interrupt on web companion** — `useCompanionWebSocket` now handles `{type: 'interrupt'}` messages from the server and calls `tts.stop()`, so the web FaceTime UI stops TTS playback when another client (e.g. mobile) triggers a barge-in.
- **`cancelCurrentSpeech()` on VoiceSubsystem** — New method for barge-in support: aborts summarization, clears buffer, emits `voice:interrupt` downstream.

## [0.35.9] - 2026-05-16

### Added
- **Favorites / Speed Dial** — Pin frequently-used agents to a horizontal strip at the top of the sidebar for one-click access. Toggle via context menu ("Add to Favorites" / "Remove from Favorites") or star button on hover in list view. Persisted in localStorage.
- **Chat permission prompts** — When an agent requests permission (e.g., to run a Bash command), the full prompt now appears in the chat with the command preview and clickable option buttons (Yes, Yes and don't ask again, No). Previously only visible in the terminal view.
- **Real-time activity indicators in meeting chat** — Meeting chat now shows "Agent is working..." (spinner) and "Agent is waiting for input" (pulse) using WebSocket-backed session activity instead of naive heuristics.

### Changed
- **X-Ray mode** — Renamed Power/Assisted chat mode to "X-Ray". Single `ScanEye` icon toggles on (amber glow) / off (gray) instead of swapping between two different icons.
- **Permission buttons always visible** — Chat permission action buttons now render in both X-Ray on and off modes. Previously gated to assisted-only, leaving no way to respond in power mode.

### Fixed
- **Hook not sending full hookState** — The `ai-maestro-hook.cjs` was writing permission details (toolName, toolInput, options) to a file but only sending `status` via the WebSocket broadcast. Now includes the full `hookState` object in the payload.
- **Headless router missing hookState** — The headless router's activity update endpoint was not forwarding `body.hookState` to `broadcastActivityUpdate`.
- **Bash commands overflow in chat** — Long commands rendered as a single line overflowing off-screen. Now uses `whitespace-pre-wrap` + `break-all` to wrap within the chat bubble.
- **Meeting chat messages behind textarea** — Added `min-h-0` to the messages container for proper flex overflow constraint.
- **No auto-scroll on permission prompt** — Added scroll trigger when `hookState` changes to `permission_request`.

## [0.35.7] - 2026-05-15

### Added
- **Tool-specific previews in chat** — Collapsed tool headers now show contextual one-line previews: Bash shows the command, Read/Write/Edit show the file path, Grep shows the pattern, Task shows the description. Expanding a tool shows styled content (green mono for Bash, red/green diff for Edit) instead of raw JSON dumps.
- **Collapsible thinking blocks (desktop)** — Thinking blocks render as collapsible purple-tinted cards with 120-char preview. Click to expand/collapse with max-h-64 scroll.
- **Summary dividers** — `compact_boundary` and `microcompact_boundary` system messages now render as centered horizontal-rule dividers instead of being invisible.
- **Power mode / Assisted mode** — The zap/shield toggle now controls chat verbosity. Assisted mode (default) shows only the clean user-agent conversation. Power mode shows the full train of thought: thinking blocks, tool calls, summary dividers.
- **Save to Memory button** — Brain icon on assistant messages opens a popup form to save responses to agent memory with optional instructions (UI only, backend TBD).
- **Tool-result filtering** — JSONL parser now skips invisible `toolUseResult` user messages, effectively doubling the useful message history within the 200-message budget.

### Changed
- **MobileChatView tool badges** — Tool badges now show tool-specific preview text (`Bash ls -la`) instead of generic `Used Bash on ls -la`.

## [0.35.6] - 2026-05-15

### Fixed
- **Chat messages not reaching agents** — WebSocket chat handlers in `server.mjs` used `ptyProcess.write()` which bypassed tmux input handling and failed silently when no terminal tab was open (`ptyProcess: null`). Replaced both handlers (chat-only and full-terminal) with `tmux send-keys -l` using proper single-quote escaping and a 100ms delay before Enter, matching the proven `agent-runtime.ts` pattern.

### Added
- **Host circuit breaker** — Automatically disables unreachable remote hosts after 3 consecutive failures in `getUnifiedAgents()`, eliminating 3s timeout delays per dead host on every poll cycle. Configurable via `CIRCUIT_BREAKER_THRESHOLD` env var.
- **`POST /api/hosts/:id/reactivate`** — New endpoint to manually re-enable a circuit-broken host. Also registered in headless router.
- **Mesh self-healing** — `registerPeer()` auto-re-enables circuit-broken hosts when they come back online and re-register.
- **Disabled hosts in `GET /api/hosts`** — `listHosts()` now appends disabled hosts with `status: 'disabled'` so the settings UI can show them with a "Reactivate" button.
- `offlineReason` and `offlineSince` fields on the `Host` type for tracking circuit breaker metadata.
- `loadAllHostsRaw()` and `updateHostRaw()` in `hosts-config.ts` to operate on the unfiltered host list (bypasses `enabled` filtering).
- `lastSyncSuccess` now populated on every successful remote host fetch.

## [0.35.5] - 2026-05-14

### Fixed
- **Duplicate agent creation from UUID-based session naming** — When `agentId` was passed to `createSession()`, the tmux session was named `uuid@host` instead of the agent's friendly name, causing session discovery to fail matching and triggering phantom agent creation via AMP. Now always uses the normalized agent name for tmux sessions.
- **Orphan session fallback matching** — Session discovery had no fallback when `getAgentBySession()` failed for legacy UUID-named sessions. Added fallback that extracts UUIDs from `uuid@host` session names and looks up the agent by ID directly.

## [0.35.1] - 2026-05-14

### Added
- **Infrastructure type icons** — New `InfraIcon` component displays infrastructure type (Docker, EC2, ECS, Cloud, Standalone) as a small icon next to agent names across all views (sidebar, tablet, mobile). Local agents show no icon to reduce clutter.
- **WebSocket heartbeat** — Client-side ping/pong mechanism (30s interval, 10s timeout) detects dead connections that mobile browsers kill silently without firing close events. Server responds to pings in both terminal and chat-only WebSocket handlers.

### Fixed
- **Mobile WebSocket disconnection** — Mobile browsers (iOS Safari, Android Chrome) silently kill WebSocket connections after a few minutes without triggering close events. The new heartbeat mechanism detects dead connections within 40s and triggers reconnection.
- **Chat messages hidden behind input** — Messages went behind the textarea and send button when sending because auto-scroll only triggered on received messages, not pending messages. Fixed in both desktop and mobile chat views.
- **Non-AWS cloud agents mislabeled** — GCP, Azure, and DigitalOcean agents were incorrectly shown with AWS EC2 icon. Added generic "Cloud" infra type for non-AWS providers.
- **Unsafe type cast in deployment detection** — Replaced `(cloud as Record<string, unknown>).runtime` with proper `runtime?: string` field on `AgentDeployment.cloud` interface.

## [0.35.0] - 2026-05-14

### Added
- **WebSocket-driven chat** — Replaced 5-second file-polling chat with real-time WebSocket architecture. Chat now shows agent activity (tool use, permissions, thinking) instantly instead of lagging behind the terminal. New `chat:*` protocol multiplexed on the existing `/term` WebSocket via lightweight chat-only connections (`/term?name=X&chatOnly=1`). Server-side JSONL file watcher with incremental reads eliminates client polling. Permission prompts appear within 500ms (was 5s+).
- **Mobile and tablet WebSocket chat** — MobileChatView and TabletDashboard now use the same WebSocket chat architecture. Includes visibility API reconnection on tab switch, pending message bubbles with optimistic UI, hookState options display, and queue-operation message rendering.
- **Cloud deployment (AWS)** — Full AWS cloud deployment support for running agents on EC2 and ECS. EC2 native install with automated user_data bootstrap, ECS auto-build with Dockerfile and Terraform configs, Agent Creation Wizard with cloud deployment options, container image with agent-server.js for remote agent management.
- **Meeting inject queue** — Hybrid dispatch with bracketed paste support for reliable message injection during team meetings.
- **Meeting task CLI** — New `scripts/meeting-task.sh` for managing meeting tasks from the command line.
- **Container utilities** — `lib/container-utils.ts` with comprehensive test suite for Docker and cloud container management.
- **AMP canonical JSON** — `lib/amp-canonical-json.ts` for deterministic JSON serialization in message signing.
- **Cloud API routes** — `agents/cloud/create`, `agents/cloud/[id]/status`, `agents/cloud/[id]/destroy` for cloud agent lifecycle.
- **MarkdownRenderer component** — Dedicated `components/chat/MarkdownRenderer.tsx` for chat message rendering.

### Fixed
- **sendKeys split** — Literal sendKeys + Enter now split into separate calls with 100ms delay, preventing race conditions in tmux input handling.
- **Meeting stability** — Discovery reorder, hook reliability improvements, and meeting chat panel fixes.
- **Hosts logging** — Improved logging for host discovery and connection issues.
- **Avatar strip rendering** — Fixed avatar display in compact views.
- **Hibernate heartbeat** — Fixed heartbeat handling for hibernated agents.
- **Hostname resilience** — Cloud environments with dynamic hostnames now handled gracefully.

### Tests
- 755 tests passing (up from 281). New test suites: container-utils (209 tests), agents-docker-service (1589 tests), meeting-inject-queue (179 tests), meeting-inject-utils (54 tests), amp-canonical-json (103 tests).

## [0.29.9] - 2026-04-23

### Fixed
- **WebSocket connection leak causing exponential reconnects** — `connect()` in `useWebSocket.ts` only bailed on `readyState === OPEN`, not `CONNECTING`. On high-latency connections (remote hosts over Tailscale), calling `connect()` while a socket was still connecting created orphaned WebSockets that leaked server-side. Each orphan's `onclose` handler spawned its own reconnect chain, multiplying exponentially. Observed as 177 simultaneous clients from a single browser tab. Fixed in `useWebSocket`, `useCompanionWebSocket`, and `useSessionActivity` — close non-CLOSED sockets before creating new ones, and guard `onclose` against stale closures.
- **Standalone agents now show online in sidebar** — `AgentBadge` and `AgentList` were only checking `agent.sessions[0].status` (persisted session config), ignoring `agent.session.status` (runtime heartbeat status). Standalone agents with no tmux session always appeared offline despite having a valid heartbeat.
- **Duplicate hibernate + standalone overlay on offline agents** — The standalone/offline early-exit blocks in `page.tsx` rendered as normal flow elements alongside the main renderer's `absolute inset-0` overlay, causing both to be visible simultaneously. Now guarded by `!selectableAgents.some()` so they only render when the main renderer won't handle the agent.
- **Heartbeat TTL increased from 2 to 10 minutes** — Standalone agents send heartbeats on Claude Code hook events (`Stop`, `SessionStart`, etc.), but during long tool executions no events fire. The 2-minute TTL caused agents to flicker offline mid-task.

## [0.29.8] - 2026-04-17

### Fixed
- **Terminal content no longer appears "cut off" during active output** — Removed server-side PTY pause/resume backpressure in `server.mjs` that was adding artificial delays between chunks. When tmux redraws the screen (cursor/clear sequences followed by content), these delays made intermediate "cleared" states visible. xterm.js already batches writes via `requestAnimationFrame`, so chunks now flow at their natural rate and render atomically within a single frame.
- **Synchronized Output passthrough for tmux** — Updated `scripts/setup-tmux.sh` to set `default-terminal` to `tmux-256color` (was `screen-256color`) and added `terminal-features` with `sync` flag. This enables DEC mode 2026 (Synchronized Output) passthrough so xterm.js can defer rendering until the end-of-update sequence, making screen redraws truly atomic. Both tmux 3.6a and xterm.js 6.0.0 support this — it just wasn't configured.

## [0.29.3] - 2026-04-17

### Fixed
- **Standalone agents now visible in dashboard sidebar** — The sidebar uses `/api/agents` (agents-core-service), not `/api/sessions`. Heartbeat data was only integrated into the sessions endpoint. Now `listAgents()` checks the `agentActivity` heartbeat map so standalone agents show as online with `session.standalone: true`.
- **Heartbeat ID resolution** — The heartbeat function now resolves agent identifiers by both UUID and name, fixing a mismatch where heartbeats stored under the agent name couldn't be found by UUID lookup in `listAgents()`.
- **Standalone agent terminal view** — Clicking a standalone agent no longer attempts a WebSocket/tmux connection. The dashboard shows a "Standalone Agent" placeholder explaining the agent runs outside tmux. This applies whether the agent is online (recent heartbeat) or offline (expired heartbeat).
- **Persistent standalone flag** — Agents with no tmux sessions and no cloud deployment are marked `standalone: true` even when offline, preventing the "Start Session" prompt for agents that were never meant to have a terminal.

## [0.29.2] - 2026-04-16

### Added
- **Standalone agent presence** — Agents that run outside of tmux (plain terminal, API-only, remote hosts) can now appear live in the dashboard via a heartbeat mechanism. New `POST /api/agents/:id/heartbeat` endpoint lets any agent announce itself periodically. The dashboard discovers standalone agents alongside tmux sessions, Docker containers, and cloud deployments. Agents with a recent heartbeat (< 2 min) show in the sidebar; stale heartbeats auto-expire.
- **Hook-based heartbeat for Claude Code** — The AI Maestro hook now sends a heartbeat on every event (SessionStart, Stop, Notification), so Claude Code sessions automatically register their presence even when running outside tmux. The hook also sends `agentId` alongside `sessionName` in status broadcasts for more precise activity tracking.
- **`agentActivity` shared state** — New in-memory Map tracking standalone agent heartbeat timestamps, shared between server.mjs and API routes via the existing globalThis bridge pattern.
- **Client-side activity by agentId** — The `useSessionActivity` hook now indexes activity updates by both `sessionName` and `agentId`, and `getSessionActivity()` accepts an optional `agentId` parameter for standalone agent lookups.
- **`standalone` flag on Session type** — Sessions discovered via heartbeat carry `standalone: true` so the UI can distinguish them from tmux/Docker/cloud sessions.

### Fixed
- **Hook directory matching bug** — Removed `agentWd.startsWith(cwd + '/')` from all 3 hook copies. This condition caused a parent directory agent to incorrectly match when running from any child directory (e.g., agent in `/project` would match cwd `/project-tools`). Only exact matches and "cwd is inside agent's directory" now count.

## [0.29.1] - 2026-04-16

### Fixed
- **Push notifications now wake Claude reliably** — Real-time AMP inbox notifications previously required the operator to manually click Enter in each agent's terminal before the agent would process the message. Root cause: the tmux `send-keys -l '<text>' \; send-keys C-m` chain delivered the text and the Enter in the same tmux tick, so Claude Code's input handler could receive the submit in the same batch as the text — before the input field had updated — and lose the submit. `lib/notification-service.ts` now splits the text and the Enter into two separate `send-keys` calls with a 150ms shell-level delay between them, so agents process inbound messages without operator intervention.

## [0.29.0] - 2026-04-16

### Added
- **Unified API error format** — All API error responses across the codebase now follow the AMP protocol format: `{ error: 'code', message: 'Human text', field?, details? }`. One consistent shape for all 106 route handlers. (#285, #327 — thanks @mvillmow for the original report)
- **`services/service-errors.ts`** — Single source of truth for `ServiceResult<T>`, `ServiceError`, and `ServiceErrorCode` (30 codes: AMP's 18 + 12 generic). Ships 20+ factory functions (`missingField`, `notFound`, `operationFailed`, `alreadyExists`, `gone`, `invalidState`, etc.) and validation helpers (`requireString`, `requireArray`, `requireNameFormat`).
- **`app/api/_helpers.ts`** — `toResponse()` turns any `ServiceResult` into a `NextResponse` with consistent error formatting.

### Changed
- **25 service files** migrated to shared `ServiceResult` and factories (~305 error returns standardized).
- **88 route files** converted to thin wrappers: `return toResponse(result)`.
- **25 component files** updated to read `data.message || data.error` for backward-compatible error display.
- **5 test files** updated (49 assertions now match structured `ServiceError` shape).
- **`lib/types/amp.ts`** refactored: `AMPErrorCode` is now `Extract<ServiceErrorCode, ...>`, `AMPError extends ServiceError`. `AMPNameTakenError` interface corrected to match runtime shape (`details.suggestions`).
- **`services/headless-router.ts`** — `sendServiceResult()` mirrors `toResponse()` for headless mode.
- Net change: **154 files, +1,365 / −1,977 = −612 lines** despite adding the new foundation.

### Fixed
- `preconditionFailed()` factory now returns **412** (was 400).
- `lookupAgentByName` and `lookupAgentByDirectoryName` catch blocks now propagate real errors via `operationFailed()` instead of silently swallowing failures.
- `toResponse()` defensive fallback preserves caller's 4xx status instead of always overriding to 500.

## [0.27.0] - 2026-04-14

### Added
- **Multi-agent hook support** — AMP inbox notifications now work across Claude Code, Codex CLI, and Gemini CLI. Hook script auto-detects which AI agent is calling it and returns the correct response format (`additionalContext` for Claude, `systemMessage` for Codex/Gemini; normalizes Gemini's `AfterAgent` → `Stop`). Installer auto-detects installed agents and writes hook configs for each, enabling `codex_hooks = true` in Codex's `config.toml`. (#324)
- **Claude Code `additionalContext` for inbox notifications** — Replaced broken tmux `send-keys` notification with Claude Code's native `additionalContext` hook response. Agents now receive inbox notifications as system reminders injected into their conversation context instead of having text typed into their TUI input field. Added standalone fallback via `amp-inbox.sh --count` so notifications still work when AI Maestro is down. (#321, #322, #323)

### Changed
- Removed `sendMessageNotification()` (broken tmux send-keys approach) in favor of hook-based `additionalContext` injection.

## [0.26.6] - 2026-04-06

### Fixed
- **macOS hostname drift in mesh identity** — `isSelf()` now checks cached aliases so machines retain mesh identity after the OS hostname changes. Two-pass lookup (hostname first, then IP alias with exactly-one-match guard) prevents DHCP false positives from claiming remote hosts as self. (#318, #320)

## [0.26.5] - 2026-03-25

### Added
- **Auto-install Claude Code status line** — `install-plugin.sh` now configures the AMP status line automatically, showing agent identity and unread message count in Claude Code's footer. Idempotent and reversible via `amp-statusline.sh --uninstall`.

## [0.26.4] - 2026-03-25

### Fixed
- **AMP mesh routing restored** — `amp-send.sh` was incorrectly using filesystem delivery for remote agents after message migration created local directories. Now checks for `config.json` to distinguish real local agents from migration-created inbox directories (upstream PR #15).
- **AMP fetch URL fix** — `amp-fetch.sh` was missing `/v1/` prefix on fetch and acknowledge endpoints, causing 404s against external providers like Crabmail (upstream PR #14).
- **AMP message ID timestamps** — `generate_message_id()` now uses seconds-precision timestamps per AMP spec (was milliseconds) (upstream PR #14).

## [0.26.3] - 2026-03-24

### Changed
- **AID v0.2.0 — fully independent from AMP** — Agent Identity no longer requires AMP to be installed. New commands: `aid-init` (standalone identity init), `aid-helper` (self-contained helper with OpenSSL auto-detection, Ed25519 signing). All `aid-*` scripts now source `aid-helper.sh` instead of `amp-helper.sh`. If both AMP and AID are installed, they share `~/.agent-messaging/agents/` — one Ed25519 identity serves both protocols. Plugin now ships 50 scripts (was 48).

## [0.26.1] - 2026-03-23

### Changed
- **Renamed `install-messaging.sh` → `install-plugin.sh`** — The installer now reflects its actual scope: all skills, scripts, and CLI tools (not just messaging). Added plugin builder references (repo + website) to the script header and banner. Updated all references across docs, CI, and helper scripts.
- **Auto-discover skills in installer** — Replaced hardcoded skill list with dynamic discovery from the plugin directory. New skills added via the manifest build are automatically installed without modifying the installer.

## [0.26.0] - 2026-03-23

### Added
- **Agent Identity (AID) integration** — Added `agentmessaging/agent-identity` as a new source in the ai-maestro plugin manifest. AID provides passwordless OAuth 2.0 authentication for AI agents using their AMP Ed25519 cryptographic identity — no passwords, no API keys, no secrets to rotate. New commands: `aid-register`, `aid-status`, `aid-token`. New skill: `agent-identity`. Plugin now ships 7 skills and 48 scripts.

## [0.25.16] - 2026-03-23

### Fixed
- **Sync AMP plugin scripts to v0.1.3** — Ran `build-plugin.sh --clean` on `ai-maestro-plugins` to pull latest AMP scripts from upstream via the manifest build system. Includes key rotation proof-of-possession, local fingerprint uniqueness guard, `--id` parameter, client-side UUIDv4, and multiple security fixes.

## [0.25.15] - 2026-03-23

### Added
- **Key rotation with proof-of-possession** — `POST /api/v1/auth/rotate-keys` now accepts an optional body with `new_public_key`, `key_algorithm`, and `proof` fields. When provided, the server verifies the proof (new key signed with old private key) before accepting the rotation. Omitting the body falls back to server-side key generation for backward compatibility.
- **Duplicate public key rejection** — `POST /api/v1/register` now rejects registration when the submitted public key fingerprint is already associated with a different agent (409 `key_already_registered`). Same-agent re-registration with the same key remains allowed.

## [0.25.14] - 2026-03-21

### Added
- **`POST /api/v1/messages/pending/ack`** — Spec-correct path for batch message acknowledgment. Accepts `{ "ids": [...] }` body. The old `POST /api/v1/messages/pending` path is kept as a backward-compatible alias.
- **`GET /api/v1/agents/me/card`** — Returns a signed agent card containing the agent's address, public key, fingerprint, provider, and capabilities. The card is Ed25519-signed for verification by peers.
- **`GET /api/v1/messages`** — Alias for `GET /api/v1/messages/pending`. Some AMP clients use the shorter path to fetch pending messages. Both routes now work identically.

## [0.25.12] - 2026-03-21

### Added
- **Client-provided `agent_id` in AMP registration** — `POST /api/v1/register` now accepts an optional `agent_id` field. If a valid UUIDv4 is provided, the server uses it as the agent's canonical identifier instead of generating one. Supports offline-first agent initialization.

## [0.25.11] - 2026-03-21

### Fixed
- **AMP inbox name→UUID resolution** — `registerAgent()` now calls `initAgentAMPHome()` so `.index.json` maps agent names to UUIDs. Previously, server wrote messages to UUID-based directories but CLI tools resolved via name-based paths, causing delivered messages to be invisible to `amp-inbox.sh`.

## [0.25.10] - 2026-03-21

### Added
- **`DELETE /api/v1/messages/pending/:id`** — Path-param route for acknowledging pending relay messages. Both `DELETE /pending/:id` and `DELETE /pending?id=X` are now supported for client compatibility.

## [0.25.9] - 2026-03-21

### Fixed
- **Terminal overlapping text** — PTY was spawning at hardcoded 80×24 while browser terminal was wider, causing history/output to render at wrong width. Client now passes `cols`/`rows` via WebSocket URL query params so PTY spawns at correct dimensions. WebSocket connection deferred until terminal is initialized.

## [0.25.8] - 2026-03-21

### Fixed
- **`/plan` mode rendering** — Added `@xterm/addon-unicode11` for proper wide character and emoji width calculation in TUI layouts. Without this, box-drawing characters and emoji caused corrupted layouts in Claude Code's `/plan` mode (#279)
- Send immediate resize on WebSocket connect so PTY/tmux starts at correct size

## [0.25.7] - 2026-03-21

### Added
- **Podman dev container** — `Containerfile` and `.containerignore` for running tests, lint, and builds in a reproducible container environment. Six `container:*` scripts in package.json (#296)

## [0.25.6] - 2026-03-21

### Fixed
- **AMP case sensitivity** — Agent name lookups in `.index.json`, server routing, and CLI scripts (`amp-helper.sh`, `amp-fetch.sh`) now normalize to lowercase. Fixes message delivery failures when agent names have mixed case (#298)

## [0.25.5] - 2026-03-21

### Fixed
- **Soft-deleted agents reappearing** — `listAgents()` now filters out agents with `deletedAt` (#292)
- **Wake returns 410 Gone** for soft-deleted agents instead of generic 404 (#294)
- **AMP cleanup on soft-delete** — Removes UUID directory and index entry when agent is soft-deleted (#295)

## [0.25.4] - 2026-03-20

### Fixed
- **Mac Mini WebGL crash** — Recover from WebGL context loss by re-opening terminal element to force canvas renderer fallback. Wraps `scrollToBottom`/`focus` in try-catch to prevent crash when renderer is undefined (#278, #290)

## [0.25.3] - 2026-03-20

### Fixed
- **DJB2 hash consolidation** — Single `djb2Hash()` in `lib/utils.ts` replacing 3 duplicate implementations (#282)
- **Tablet navigation** — Layout toggle and nav button fixes for tablet dashboard (#280)
- **Pin onnxruntime-node** to 1.17.0 via resolutions to prevent build failures (#233)

## [0.25.2] - 2026-03-20

### Fixed
- **CozoDB query injection** — Parameterized all CozoScript queries to prevent injection via agent names (#286)
- **Deduplicate graph aliases** — Prevent duplicate alias rows in agent graph (#284)
- **Debounce subconscious indexing** — Prevent concurrent indexing runs (#283)

## [0.25.1] - 2026-03-20

### Fixed
- **WSL2/NAT agent connectivity** — `isSelf` flag + `getAgentBaseUrl()` helper so dashboard works when browser and server are on different networks (#273-#277)
- **jq compatibility** — Restructured array concatenation in `install-agent-cli.sh` for older jq versions (#268, #272)
- **TerminalView ResizeObserver** — Replaced 20×150ms polling loop with ResizeObserver for terminal container dimension detection (#278)

## [0.25.0] - 2026-03-15

### Changed
- Plugin rebuilt with AMP standard compliance
- Agent Skills standard compliance for all 6 skills (#264)
- Integrated community contributions (#256, #258, #260, #261)
- Reverted premature onnxruntime-node downgrade and ConversationSource abstraction (#263)

### Fixed
- PM2 ecosystem config references (`ecosystem.config.cjs` → `.js`) (#269, #271)
- RCE command injection in tmux session management (v0.24.18)

## [0.24.17] - 2026-02-26

### Added
- **Startup self-diagnostics** — `services/diagnostics-service.ts` runs checks on server start and logs a clear pass/fail/warn summary to console
- **`GET /api/diagnostics` endpoint** — On-demand system health report checking tmux, node-pty, agent registry, Node.js version, disk space, and remote host reachability
- Remote host diagnostics cascade — local startup checks each remote host's `/api/diagnostics` (or `/api/v1/health` fallback) to surface broken hosts (e.g., tmux unavailable on a remote)
- Pre-flight tmux check in `scripts/start-with-ssh.sh` — warns if tmux is missing before starting the server
- Headless router entry for `/api/diagnostics`

## [0.24.13] - 2026-02-25

### Added
- **Toast notification system** — Lightweight toast system (`ToastContext`, `Toast`, `ToastContainer`) using Framer Motion + createPortal with auto-dismiss, progress bar, and max 5 stacking
- **SecretRevealDialog** — Modal for webhook secrets with show/hide toggle (Eye/EyeOff) and copy-to-clipboard feedback
- **Providers wrapper** — Client-side `Providers.tsx` keeps `layout.tsx` as a server component

### Changed
- Replaced all 11 `alert()` calls across 5 files with contextual toast notifications
- Network error toasts now hint at connectivity issues ("The agent host may be unreachable")
- ForwardDialog uses inline validation error instead of browser alert
- WebhooksSection shows secret in a proper modal dialog instead of alert

### Removed
- All browser `alert()` usage eliminated from the codebase

## [0.24.12] - 2026-02-22

### Added
- **Brain inbox** — JSONL-based signal queue (`brain-inbox.ts`) allowing cerebellum and subconscious to surface signals to the cortex via the idle_prompt hook
- **OpenAI TTS in companion UI** — Provider toggle button and API key input for the OpenAI TTS tier ($15/M chars vs ElevenLabs $206/M)
- **Message event type in cerebellum** — `message` classification with 0ms cooldown for AMP notification detection in terminal output
- Brain inbox API endpoint (`/api/agents/[id]/brain-inbox`) + headless route
- Subconscious memory surfacing — after indexing, searches for relevant memories and writes to brain inbox

### Changed
- Hook refactored to single agent lookup (`findAgentByCwd`) shared across all check functions, eliminating 3 redundant `/api/agents` calls per idle_prompt
- Hook sends combined notification (messages + brain signals) as a single prompt to avoid race conditions
- Plugin submodule updated for Anthropic skill compliance

### Fixed
- Plugin builder security hardening, accessibility, and reliability improvements

## [0.24.11] - 2026-02-21

### Added
- **Plugin Builder page** (`/plugin-builder`) — Visual skill composition interface for building Claude Code plugins
- Plugin builder service layer with manifest generation, build execution, and repo scanning
- API routes: build, build status, scan-repo, push-to-github
- Two-column UI: skill picker (left) + plugin composer (right)
- Plugin Builder marketing page (`docs/plugin-builder.html`) with SEO and Schema.org markup
- **Agent roles** — `AgentRole` type (`manager` | `chief-of-staff` | `member`) added to Agent and AgentSummary
- **Team types** — `TeamType` (`open` | `closed`) and `chiefOfStaffId` added to Team type (foundation for AMP routing policy)

## [0.24.10] - 2026-02-20

### Changed
- Plugin submodule updated: `aimaestro-agent.sh` CLI split into 6 focused modules (agent-core, agent-commands, agent-session, agent-skill, agent-plugin + thin dispatcher)

## [0.24.9] - 2026-02-19

### Added
- **OpenClaw agents as first-class citizens** — Auto-register OpenClaw agents in the agent registry on discovery, enabling AMP messaging, kanban task assignment, and team meeting participation
- Auto-query working directory from OpenClaw tmux sessions via `display-message`
- Auto-initialize AMP home directory and set `AMP_DIR`, `AIM_AGENT_NAME`, `AIM_AGENT_ID` environment variables in OpenClaw tmux sessions
- Session name validation (`/^[a-zA-Z0-9_-]+$/`) for OpenClaw-discovered sessions to prevent path traversal

### Changed
- AMP initialization only runs on first agent registration (not every poll cycle)
- Plugin submodule updated: `CLAUDE_AGENT_*` env vars renamed to `AIM_AGENT_*` with backward compatibility fallback
- Plugin README consolidated from root + plugin into single comprehensive document

### Fixed
- CI build: create `data/` directory before touch in workflow

## [0.24.8] - 2026-02-18

### Added
- **OpenClaw tmux session discovery** — Detect agents running in OpenClaw's custom tmux sockets at `/tmp/clawdbot-tmux-sockets/`
- Terminal streaming for OpenClaw sessions via WebSocket

## [0.24.7] - 2026-02-17

### Fixed
- Updater `ecosystem.config.js` detection — fix 5 issues related to PM2 config discovery

## [0.24.6] - 2026-02-16

### Fixed
- Double-paste on desktop terminals (Cmd+V fired both custom handler and native paste event)
- Outdated `pm2 start server.mjs` examples in OPERATIONS-GUIDE.md

### Changed
- Made `tsx` a production dependency (was devDependency — `yarn install --production` would break)
- `start-with-ssh.sh` uses direct `./node_modules/.bin/tsx` instead of `npx tsx`

## [0.24.0] - 2026-02-16

### Added
- **Service layer architecture** — 23 service files, all ~100 API routes are thin wrappers
- **Headless mode** (`MAESTRO_MODE=headless`) — API-only server, no Next.js, ~1s startup
- Headless router serving all endpoints via standalone HTTP router
- Shared state bridge pattern (`globalThis._sharedState`) for server.mjs/API route interop
- `ServiceResult<T>` return type across all services
- 486 tests (281 service tests + 205 existing)

### Changed
- Extracted all business logic from API routes into `services/` directory
- Abstract agent runtime (`lib/agent-runtime.ts`) replacing direct tmux/PTY calls

## [0.23.9] - 2026-02-15

### Changed
- Replaced help embedding system with AI Maestro Assistant agent

## [0.23.8] - 2026-02-15

### Added
- Essential keys toolbar for mobile terminal mode

### Fixed
- Query param left in URL when switching from Immersive to Dashboard

## [0.23.7] - 2026-02-15

### Added
- 3-tier responsive experience (phone/tablet/desktop)
- Mobile chat view with touch copy/paste
- ToxicSkills defense for skill/plugin install

### Fixed
- AIM-222: Consolidated fix for 65+ issues across memory, terminal, installers, skills, and API

## [0.23.4] - 2026-02-08

### Fixed
- Intermittent terminal attachment failures with PTY spawn retry logic

## [0.23.3] - 2026-02-08

### Added
- Speech history, adaptive cooldown, event classification, template fallbacks
- OpenAI TTS provider

## [0.23.2] - 2026-02-07

### Added
- Voice commands for companion input
- Enhanced Cerebellum voice subsystem

## [0.23.1] - 2026-02-07

### Added
- Cerebellum subsystem coordinator
- FaceTime-style companion with pop-out window

## [0.22.4] - 2026-02-01

### Added
- Create Agent dropdown with Advanced mode
- Docker container support for agents
- AIM environment variables

## [0.22.2] - 2026-01-31

### Changed
- Removed root clutter (.aimaestro/ and .claude-plugin/)

## [0.22.1] - 2026-01-31

### Fixed
- Graceful shutdown no longer kills tmux sessions

## [0.22.0] - 2026-01-29

### Added
- Composable plugin system with dedicated marketplace repo

### Fixed
- Replaced old messaging script references with AMP commands

## [0.21.39] - 2026-01-28

### Added
- First-class team management with documents and dashboard

## [0.21.38] - 2026-01-27

### Changed
- Full-bleed avatar cards in meeting sidebar

## [0.21.37] - 2026-01-27

### Added
- Sidebar view switcher, agent pop-out

### Fixed
- Session cascade fix

## [0.21.32] - 2026-01-26

### Changed
- Project review phase 2 — tests, error boundaries, dependency fixes

## [0.21.31] - 2026-01-26

### Changed
- Project review phase 1 — tests, cleanup, dependency fixes

## [0.21.30] - 2026-01-25

### Fixed
- AMP messaging stabilization — UUID migration, delivery paths, security hardening

## [0.21.25] - 2026-01-24

### Fixed
- CLI agent resolvers consolidated, HOST_URLS crash, BSD sed compatibility

## [0.21.24] - 2026-01-24

### Changed
- Eliminated resource waste in subconscious delta indexing

## [0.21.23] - 2026-01-23

### Fixed
- Inbox/sent resolved by agent UUID, not name

## [0.21.22] - 2026-01-23

### Fixed
- Mesh alias propagation in peer-exchange, cross-host test inbox

## [0.21.21] - 2026-01-23

### Fixed
- `getHostById` now checks aliases for mesh-forwarded auth

## [0.21.20] - 2026-01-22

### Fixed
- Include programArgs in Agent Profile save payload

## [0.21.19] - 2026-01-22

### Added
- AMP address collection

## [0.21.15] - 2026-01-21

### Added
- AMP protocol compliance — agent management, WebSocket, federation

## [0.21.14] - 2026-01-21

### Fixed
- Comprehensive messaging system hardening

## [0.21.12] - 2026-01-20

### Fixed
- Prevent git repo name from poisoning agent identity

## [0.21.11] - 2026-01-20

### Changed
- Unified messaging — one route, one deliver, one storage

## [0.21.10] - 2026-01-19

### Fixed
- AMP-only messaging, unified routing, plugin hardening

## [0.21.8] - 2026-01-18

### Fixed
- Cross-host mesh routing and local delivery

## [0.21.6] - 2026-01-18

### Fixed
- Auto-register on send, prevent black-hole delivery

## [0.21.1] - 2026-01-17

### Fixed
- Read inbox/sent from per-agent AMP directories

### Added
- Kanban board with 5-column drag-and-drop task management
- Unified programArgs with first-launch resume stripping
- War room mode for multi-agent coordination

## [0.19.4] - 2026-01-10

### Fixed
- Cross-host notifications

## [0.19.3] - 2026-01-10

### Fixed
- Mobile empty state duplicate messages

## [0.18.10] - 2026-01-07

### Added
- Push notifications for message delivery (replaced polling)

## [0.11.0] - 2025-12-20

### Added
- Agent Intelligence documentation

## [0.10.0] - 2025-12-18

### Added
- Comprehensive work mode documentation

## [0.9.0] - 2025-12-15

### Added
- Conversation detail viewer with side panel

## [0.8.0] - 2025-12-12

### Added
- Settings UI with host management wizard
- Session persistence and WorkTree support

## [0.7.0] - 2025-12-08

### Added
- Deployment tracking and UI indicators for agents
- Migration banner and status API

## [0.5.0] - 2025-12-01

### Added
- Unread messages and auto-mark-as-read

## [0.4.0] - 2025-11-25

### Added
- Agent-to-agent communication
- SSH configuration for tmux sessions

### Fixed
- Critical PTY leak causing system resource exhaustion

## [0.3.0] - 2025-11-18

### Changed
- Tab-based multi-terminal architecture (visibility toggling, no unmount/remount)

### Fixed
- Terminal width and selection issues

## [0.2.0] - 2025-11-10

### Added
- Agent-to-agent messaging system
- Session logging with global control

## [0.1.0] - 2025-11-01

### Added
- Initial release — tmux auto-discovery, real-time terminal streaming, WebSocket-PTY bridge
- Hierarchical agent sidebar with dynamic colors
- Space Grotesk branding as "AI Maestro"
