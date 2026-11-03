# F069 - Doctor: one page that checks agents, hosts and installs, and offers the fix

**Status:** In Progress (spec: [docs/SPEC-DOCTOR.md](../docs/SPEC-DOCTOR.md); step 1, the server, in 0.106.63)
**Type:** Feature
**Created:** 2026-11-03

## Description

There is a start: `services/diagnostics-service.ts` (`GET /api/diagnostics`). It checks tmux,
node-pty, disk, Node version, registry writable, AMP identity uniqueness, channel wake, shared
folders, and whether each peer host answers. It runs at startup into the log and on request with
curl. No page shows it, it does not look at agents one by one, and it does not fix anything.

The missing parts:

1. **Agent checks, per agent**, each with the agent named:
   - The folder exists, and no other agent owns it (this one is `shared-folders` today).
   - The name hint in `.claude/settings.local.json` matches the agent.
   - The AMP directory and keys exist, and the address matches the name.
   - The registry's session links point to tmux sessions that exist, and no live tmux session is
     left without an agent.
   - Ghost agents: an orphan registered from a test or hand-started session that has never run
     (`zz-canary-exact-bar`), or an agent that is offline with no folder and no session.
   - The agent runs outside AI Maestro (`runningOutsideTmux`): report it, but never wake it.
2. **Host and install checks**, for every host on the host's own local endpoint (never a peer's
   `/api/diagnostics`, see the 0.106.21 loop):
   - The AI Maestro version against the other hosts.
   - The hook copy and the plugin version, and whether `amp-*.sh` scripts drifted (F005).
   - pm2 runs the expected process, and logrotate is set.
   - Backups of deleted agents still on disk, and their size.
3. **A Doctor page** in Settings that shows every host. Each finding has a status, the agent or
   host it is about, and a one-line cause.
4. **Fixes the person approves**, one at a time, through the existing services: delete a ghost,
   set a folder, re-link a session, remove old backups. Never kill a tmux session, and never
   change an agent that runs outside AI Maestro.
5. **A CLI command**, `aimaestro-agent.sh doctor`, that prints the same report for agents and
   for hosts without the UI.

## Why It's Needed

The 2026-11-02 cleanup (#758, B023) was a doctor run done by hand: curl diagnostics on three hosts,
read the registry, find six agents in one folder, ghost agents and 2.9 GB of backups of deleted
agents. Each problem showed as "agent offline" and took an hour to trace. The checks exist only in
the code and in one person's memory.

## Business Case

- Support load: "my agent shows offline" and "messages go to the wrong agent" are mostly
  configuration drift that a check finds in seconds.
- Retention: users with 20+ agents across hosts reach this drift first, and they are the users
  who stay.
- Reliability: it finds version and plugin drift across hosts before it breaks message delivery.

## Implementation Plan

- Extend `services/diagnostics-service.ts`. Keep it cached (`runDiagnostics`, once a minute), and
  return per-agent findings as `{ check, status, agentId?, hostId?, message, fix? }`.
- Fleet view: the page asks each host for its local report. Add a local-only endpoint, or call
  `/api/diagnostics` with remote checks turned off. A host must not call its peers' full report.
- Page: `app/settings` tab plus a component. Fix actions call the existing agent and registry
  services. They are not new write paths.
- Route it in `services/headless-router.ts` too.
- Related: F005 (script drift), F045 (tmux self-check, a check to add here), F067 (governance
  weekly check, which can run on this).
- Effort: L. Split it: (1) agent checks plus the per-agent report shape, M; (2) the page and the
  fleet view, M; (3) fixes and the CLI, M.
