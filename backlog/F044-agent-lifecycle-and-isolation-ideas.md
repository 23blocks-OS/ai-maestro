# F044 - Agent lifecycle and isolation: ideas from lolad to check against what we have

**Status:** Todo (a checklist, not a design; each line needs a look at our code first)
**Type:** Feature / hardening
**Created:** 2026-10-27
**Source:** `CamiloCaceres/lolad` README and `docs/` (read 2026-10-27; not run).

lolad does these for a few long-running agents. For each: check whether we already do it, then decide.

1. **Write-only secrets:** the API says whether a value is set and its length, never the value. (We have `aim-secret`; check the API surface.)
2. **Environment kept out of the command line:** a helper reads the agent's environment from a 0600 file, deletes it, and starts the program. We build tmux commands with argument lists; check whether secrets can show in a process list.
3. **Per-agent settings isolation:** agents do not load the global `~/.claude/settings.json` hooks (`--setting-sources project,local`). Check what a global hook does to our agents.
4. **Daily fresh conversation:** each agent can rotate to a new conversation at a set time; a crash resumes instead.
5. **Wake on message:** a stopped agent starts when mail arrives. Done in 0.106.254 as an opt-in per agent (`preferences.wakeOnMessage`, F073 step 1).
6. **Failed state:** six crashes in 30 minutes mark the agent failed instead of looping forever; backoff 5 s to 5 min.
7. **Pending-restart marker:** a setting change that needs a restart shows a "Restart to apply" button.
8. **Startup-blocked report:** after two minutes without a ready prompt the agent shows `startup blocked: <first line>` (a missing login, a provider prompt) instead of unknown.
9. **Remote access:** a second, authenticated listener with device pairing codes and QR for the phone. This runs against our "network is the trust boundary" rule; only note it.

## Update 2026-11-20

- **Item 3, the hook part, is done (0.106.245):** an agent with its own Claude folder (`config-dir` credential) gets the AI Maestro hook in that folder at each start, and the Doctor checks it. Not done: keeping machine-wide `~/.claude` hooks out of other agents (`--setting-sources`), and installing the plugin in such a folder.
## Update 2026-11-20: item 6, crash restart

Built (`lib/crash-restart.ts`, `services/crash-restart-service.ts`, started in `server.mjs`):

- Once a minute, a local **Claude Code** agent whose pane is at a bare shell is restarted in the same conversation (`restartAgentResuming`), when its last hook report is not `ended`. Only Claude Code reports a deliberate quit (SessionEnd), so other programs are not touched.
- It never acts on an agent it has not seen running during this server run (a crash from before a deploy is left alone), never while someone typed in that terminal in the last minute, and restarts at most 3 agents a minute.
- Backoff 30 s, 1, 2, 4, 5 minutes. After 6 restarts in 30 minutes the agent is marked failed (`crashFailedAt`), the person gets a "needs you" push, the Doctor's `crashed-agents` check fails, and it is not restarted again until its program runs again.
- `AIMAESTRO_CRASH_RESTART=0` turns it off.

Not done: a "failed" state in the dashboard's status (the Doctor and the push carry it for now).

## Update 2026-11-20: item 8, startup blocked

Built (`lib/startup-watch.ts`, `services/startup-watch-service.ts`):

- Every wake that starts the program (a wake, a restore, a restart, a crash restart, a credential move) is noted. If no hook report arrives within 2 minutes, the pane's visible screen is read once a minute, with escapes, so the dim hint in an empty input box is not taken for text.
- An input box on screen means Ready, and the watch ends. A menu holding the keyboard (`❯ 1. Yes, proceed`, a login method), or no input box at all, gives "startup blocked: <first line on the screen>". That lasts until a hook report arrives or the input box shows.
- The status feed reports a blocked startup, and an agent stopped after repeated crashes (item 6), as `waiting` with the reason in `blocked`. So the card says Needs you instead of Ready. The Doctor's `startup-blocked` check lists them.

Not done: showing the `blocked` reason on the card itself (the Doctor shows it).
