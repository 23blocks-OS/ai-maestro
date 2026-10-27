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
