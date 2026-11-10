# Spec: one sync channel between hosts

Status: steps 1 to 3 shipped 2026-11-09 (by v0.106.122): audit 0 wrong on all three hosts, both ways; a change crosses in about 210 ms; a host switched off is dropped at once and back within 31 s. Step 4 in progress: snapshots (v0.106.123), owning host and agent by name (v0.106.124), the directory (v0.106.125) moved. Code: `lib/mesh-sync.mjs`. Backlog: F107. Background: [AGENT-STATUS.md](./AGENT-STATUS.md).

## 1. The problem

Every feature that needs data from another host gets it its own way. There are at least ten ways (section 2). Agent status has none, so an agent on another host shows **Ready** when nobody looks at it and **Working** when somebody opens it (AGENT-STATUS.md, section 4). Each way fails in its own manner, so each bug gets fixed once per feature.

## 2. How hosts exchange data today

Read from the code on 2026-11-09.

**The browser asks every host itself** (one request per host, per page, per refresh):

| What | Where |
|---|---|
| Agent list | `hooks/useAgents.ts` `fetchHostAgents` → each host's `/api/agents` |
| Projects, tasks, orgs, teams, task summary | `hooks/useProjects.ts`, `useOpenTasks.ts`, `useOrgs.ts`, `useWorldTeams.ts`, `useTaskSummary.ts` |
| Per-agent pages (memory, docs, graph, skills, canvas, board...) | the agent's own host (`hostUrl`): correct, these are actions on that agent |

**A server asks every host** (on request, or on a timer):

| What | Where | When |
|---|---|---|
| Session list | `services/sessions-service.ts` `fetchRemoteSessions` → `/api/sessions?local=true` | each request |
| Agent search | `services/agents-core-service.ts` `getUnifiedAgents` → `/api/agents` | each request |
| Status snapshots | `services/status-snapshots-service.ts` `refreshRemote` → `/api/sessions/activity?local=true` | every 15 s; the `activity` part is thrown away. **Moved to `/mesh` in v0.106.123** |
| World events | `services/world-events-service.ts` → `/api/world/events?local=1` | each request |
| Manager links | `services/agents-manager-links-service.ts` → `/api/people`, `/api/agents` | each request |
| Agent by name | `lib/agent-registry.ts` ~2595 → `/api/agents/by-name/<name>` | on lookup |
| Owning host | `lib/owning-host.ts` → `/api/agents/<id>` | on lookup |
| Agent directory | `lib/agent-directory.ts` `syncWithPeers` | never started (B035). **Reads `/mesh` since v0.106.125** |
| Email index | `services/agents-messaging-service.ts` → `/api/agents/email-index` | on lookup |

**Not data sync, and not changed here:** the host list exchange (`lib/host-sync.ts`), health checks (`diagnostics-service.ts`), creating agents or sessions on another host, AMP routing (`/api/v1/route`), agent transfer, and the terminal and chat relays (`server.mjs` `handleRemoteWorker`), which carry a screen, not state.

**Status:** no path. The relay writes "activity" on every message it carries, which is what makes a remote agent look busy.

## 3. The rule

**Each host is the only source for its own agents.** Other hosts and browsers keep a read-only copy of what that host tells them, and never work it out themselves.

## 4. The design

**The channel.** Each host serves one WebSocket, `/mesh`. Each host opens one connection to every enabled peer in `hosts.json`.

**Messages, from the host that owns the agents:**

| Message | When | Contents |
|---|---|---|
| `hello` | on connect | host id, version, protocol version |
| `full` | after `hello`, and every 5 min | every local agent: id, name, folder, session alive, status, hook word, snapshot, `at` |
| `change` | the moment one agent changes | the same fields for that agent only, with a sequence number |
| `ping` / `pong` | every 20 s | nothing |

**The copy.** Each host keeps `peerAgents[hostId] = { agents, seq, okAt }`, in memory only.
- A `change` with a gap in the sequence numbers: ask for a `full`.
- No message for 45 s (pings included): drop the socket, mark that host's agents **unknown**, reconnect with backoff (2 s, then up to 30 s).
- A full list every 5 min corrects anything a lost change left wrong.

**What publishes a change.** The owning host sends `change` when an agent is created, deleted, renamed, wakes, sleeps, or when its status or snapshot changes. Status changes come from the hook report (`broadcastActivityUpdate`), which already exists, so the channel adds no new detection.

**What reads the copy.** `getActivity`, the session list and the agent list take remote entries from `peerAgents` instead of fetching. A local entry always wins. `?local=true` requests stay local, so two hosts never pass each other's copies back.

**The browser.** No change in the views. The store keeps talking to one host. That host's `/status` socket also forwards the remote `change` messages, so a remote agent's status reaches the page in under a second. The agent list (`useAgents`) moves from asking every host to asking its own host once (step 3).

**Status fix that comes with it** (AGENT-STATUS.md, section 6): the relay stops writing activity for agents on peer hosts (cloud agents keep it), and the owning host's status comes only from its hook report. The transcript modified-time rule is removed.

## 5. Steps

Each step ships, deploys and passes the audit before the next one starts.

1. **Status on the owning host is right.** Remove the transcript modified-time rule; the per-agent hook report wins over the per-folder file. Check: `scripts/status-audit.mjs` shows 0 wrong on all three hosts. Size S.
2. **The channel, carrying status.** `/mesh`, the copy, the relay change. Check: Dahlia's status is the same on this Mac and on mac-mini within 1 s, with and without her chat open, for 10 min; the audit's `--viewer` column shows 0 wrong. Size M.
3. **Agent list and sessions move to the channel.** Replace `fetchRemoteSessions`, `useAgents` per-host fetches and `getUnifiedAgents` fan-out. Check: switching a host off shows its agents as unknown within 45 s and back within 30 s of it returning. Size M.
4. **The rest.** Snapshots (remove `refreshRemote`), agent by name, owning host, the directory (close B035), manager links, world events. One at a time. Size M.

Projects, tasks, orgs and teams stay as they are until 4 is done; they can move after if the same pattern fits.

## 6. Pros and cons

Pros: one mechanism, so a bug is fixed once; changes in under a second; almost no traffic when nothing changes; a host that goes down is seen within 45 s and only its agents are affected.

Cons: a socket per peer to keep alive (reconnect, ping, full list after each reconnect); a lost `change` is wrong until the next full list (at most 5 min); hosts must speak the same protocol version, so a host on an older version must be shown as "old version", not silently wrong.

## 7. Open questions

- The phone app talks to one host. It gets remote agents through that host after step 3. Check that this is what it does today.
- Does any other repo (ai-maestro-app, the plugin, AMP scripts) read `/api/sessions?local=true` or `/api/agents` from several hosts? If so, those stay supported.
- 3 hosts today. At 10+, a full list to every peer every 5 min is still small (about 100 agents × 1 KB), but measure.

## 8. Done when

- The status audit shows 0 wrong rows on every host, local and `--viewer`, after each deploy.
- No server code fetches another host's agents, sessions or status outside `/mesh`.
- Turning a host off and on is shown correctly on the others, without a restart.
- Same change in the public repo, when Juan says so.
