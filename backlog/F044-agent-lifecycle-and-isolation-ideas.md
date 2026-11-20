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
5. **Wake on message:** a stopped agent starts when mail arrives. (Check what the wake-on-message path does here.)
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
