# Changelog

All notable changes to AI Maestro are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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
