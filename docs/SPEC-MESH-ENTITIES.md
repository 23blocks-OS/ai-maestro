# Spec: What lives where in the mesh (concepts and patterns)

Status: draft, decisions in sections 7 and 8, 2026-11-06. Audit of the code and of three live hosts (MacBook, mac-mini, mini-lola). Nothing
here is built. Backlog: [F089](../backlog/F089-mesh-directory-one-pattern.md), B033, B034, B035. Touches F057, F074, F075, F078.
Research: [RESEARCH-DIRECTORY-REPLICATION.md](RESEARCH-DIRECTORY-REPLICATION.md).

## 1. Why this exists

A person's message showed an id, not a name (B033). Asking why led here: the mesh has no single rule for how something that
lives on one host is known on the others. Each entity solved it its own way, or did not.

Rule from Juan (2026-11-06): **if agents sync between hosts, humans do too. The concepts and patterns come first.**

## 2. What the audit found

| Entity | Stored | How other hosts know it | Live today |
|---|---|---|---|
| Hosts | every host | **Synced**: peer exchange, with propagation ids | Works. The only entity that really syncs |
| Tenant name (`organization`) | `hosts.json` on every host | Adopted from a peer only when missing | `rnd23blocks` on all three. Two different names are never reconciled |
| Agents | the host it lives on | **Asked at the moment of need**: a browser asks each host; routing asks peers (`checkMeshAgentExists`) | No host knows another's agents |
| Agent directory | `agent-directory.json` | **Dead code.** `startDirectorySync` was added in #147 and nothing ever calls it. `syncWithPeers` runs only by hand | 0 remote entries on all three hosts |
| People | the host the operator used | Asked at the moment of need, in the browser (`collectPeople`) and by `personHostFor` | Juan's record is on the MacBook; 0 people on the others |
| Teams | `teams/teams.json`, one host | Not shared | 46 on the MacBook, 0 elsewhere |
| Meetings | `teams/meetings.json`, one host | Not shared | |
| Projects | the owner agent's host | Asked at the moment of need | 1, on the MacBook |
| Tasks | with their agent, team or project | Follow their parent | |
| Organizations (`org:`) | tags on agents; optional records in `organizations/` | Derived from agents | 0 records on all three |
| A person's devices | per host, by design | Each host records the app connected to it | Correct as it is |
| A person's mailbox | the host holding the person | Forwarded there | |
| An agent's mailbox | its folder on its host | Forwarded there | |

### What that means

1. **Agents do not sync.** The code and comments say they do. Agents and people use the same approach, asking peers when needed. It
   looks like it works because hosts are usually up.
2. **Everything depends on the owning host being awake.** When it is down, what it holds does not exist for the mesh.
3. **Delivery follows the same limit.** Routing must find the recipient by asking peers. If its host is down, no peer can answer,
   so the recipient is unknown: 404 "not found". The relay queue is reached only when a host answered the lookup and then failed.
   Read from the code, not tested with a host down. This is B034, and it applies to agents as well as to people.
4. **"Organization" means two things.** A tenant name that forms addresses (`@rnd23blocks.aimaestro.local`), and `org:` groups
   (3metas, 23blocks) inside it. F074 and F075 mix them. Settled in section 7.
5. **Names are not shared.** Directory entries have no label, so "Dahlia" is known only on Dahlia's host. Messages show
   `ai-maestro-app`, as they show `p-<id>` for a person.

## 3. The concepts

- **Organization.** The tenant: the trust and naming boundary, one per mesh. A host is in it or not. Its name forms addresses.
- **Unit.** An `org:` group inside the organization, such as a client or company. Working name.
- **Host.** A machine in the organization. It holds things and runs things; it has no identity beyond that.
- **Entity.** Something with its own identity: an agent, a person, a team, a project. It is known across the organization, whichever
  host holds it. A person is not "on" a host, and neither is a team.
- **Id and name.** Every entity has a stable id that never changes, and a display name that can. Machines use ids. People see names.
  An address is built from something stable.
- **Home host.** Where an entity's data and mailbox live: an agent runs there, a person's messages are kept there. It is where the entity
  lives, not what it is, and not the only host that can change its identity data.
- **Directory.** Every host keeps a read copy of what the organization knows about every entity: id, name, type, owner host, address,
  public key, last seen. Reading needs no network.
- **Delivery.** Something sent to an entity is stored and forwarded until it arrives. It never depends on the owner being up at
  that moment.

## 4. The one pattern: a directory on every host

For every entity that is known across the organization:

1. **Any host writes identity data,** with per-field stamps, so it merges by itself (section 8). What runs is written only by the host
   running it.
2. **Everyone reads locally.** A host answers from its directory, with no call to a peer.
3. **A write never waits for another host.** It is made locally and spreads through the sync.
4. **One sync, for all types.** Hosts exchange changes on a timer and on change, by version, using the peer exchange that hosts
   already use. One mechanism and one code path, with the type as a field.
5. **Honest age.** A copy says when it was last confirmed. A view can show that an owner is unreachable.
6. **Deletes are remembered**, as tombstones, so an old copy cannot bring something back.
7. **A home can move.** Agents already move between hosts; a person's mailbox or a team's files can too, so nothing is stuck on a laptop.

Not everything goes in the directory. Only what is needed to find, name and verify. A conversation, task list or memory stays with its
owner and is fetched when needed.

| Entity | In the directory | Stays with the owner |
|---|---|---|
| Agent | id, name, label, address, public key, host, status | Everything else |
| Person | id, display name, address, public keys, org | Phone, email, notes |
| Team | id, name, members | Tasks, documents |
| Project | id, name, owner agent | Tasks |
| Host | as today | |
| Organization (`org:`) | id, name | |

A person's devices, an agent's devices, tasks, meetings and messages do not need their own entry: they belong to an entity above.

### Delivery

1. **Know the recipient from the directory**, so a sleeping host is no longer "not found".
2. **The sender's host holds the message and retries** until the recipient's host accepts it. It is reported as queued, never as
   delivered.
3. **Same path for agents and people.** A person differs only in where it is stored and in being notified by push.
4. Limits: a maximum age, and a visible state for what never arrived.

### Display names

Every view takes a name from the local directory, by id or address. **A name never comes from what the sender wrote**, so nobody can
claim to be someone else. Unknown: show the address.

## 5. What stays different between agents and people

Being consistent does not mean being identical. These differences are correct:

- A person signs on their device; an agent signs with its key on its host.
- A person's address uses an id (names repeat and change); an agent's uses its unique name.
- A person is told by push; an agent is woken.
- An agent runs; a person does not.

## 6. Order of work

| Step | Contents | Fixes |
|---|---|---|
| 1 | Directory: one generic sync with agents and people, and labels. Replaces the dead `startDirectorySync` | B033, B035 |
| 2 | Routing reads the directory; store and forward for agents and people | B034 |
| 3 | Names in every view from the directory | B033, the agent label |
| 4 | Teams, projects and `org:` groups into the directory | The rest of section 2 |
| 5 | Organization: name the two meanings, and merging when a host joins (F075), then F074 | |

Devices (F078) and the conversation view (F087) should build on step 1.

## 7. Decisions

Made by Juan, 2026-11-06:

1. **The tenant is the organization.** There is one, and its name forms addresses. `org:` groups (3metas, 23blocks) are something else,
   inside it, and need their own word: **unit** is used here until Juan chooses. F074 is about units; F075 is about the organization.
2. **Every host writes identity data; what runs stays with its host.** Section 8. Juan first chose one writer, then chose this after the research.
3. **mac-mini is the default home** for people, instead of the machine the operator happens to be on. The operator can choose another.
4. **The directory holds public keys,** so a host can verify a sender while its home is offline. A revoked key must reach every host at
   once, and a revocation cannot be undone by a sync: a key once revoked stays revoked, whatever the clocks say.

## 8. Every host writes (decision 2)

Juan's question: what if each host can write, and the last update wins when they sync? Research:
[RESEARCH-DIRECTORY-REPLICATION.md](RESEARCH-DIRECTORY-REPLICATION.md). This is what Active Directory does, and it answers the one weakness of
a single writer: a record that cannot be edited while its owner sleeps.

**Decided by Juan, 2026-11-06.** Identity data is multi-master, and live state stays with its host:

- **Any host writes the identity fields** of a person, team, project or agent's label. Each field has its own stamp: version, then
  time, then host id. **Version first**: a clock is only a tiebreak, as in AD. A time too far in the future is refused.
- **Sets merge per value:** team members and a person's keys are added and removed one at a time, so two adds both survive.
- **What runs stays single-writer, by nature:** an agent's sessions, status and folder belong to the host it runs on. Only that host
  knows them. This is the "one writer" of decision 2, kept where it is true.
- **Sync:** each host keeps a vector of the highest change it has seen from every host, and asks a peer for what it lacks. A change
  reaches a host through any peer, and a sleeping host catches up. A periodic full compare repairs anything missed.
- **Deletes are tombstones,** kept for 180 days. A host away longer must rejoin clean, not resend what it has.
- **A restored host takes a new incarnation id**, or peers ignore it silently.
- **Name clashes keep both and show them.** Ids are UUIDs, so records never collide. Two agents with one name are a visible conflict, not a
  silent winner.
- **Single-master on purpose (like FSMO),** held by the anchor host, mac-mini by default, movable by the operator: naming the organization,
  and accepting a host into it. Rare, and wrong to do twice at once.
- **Revocation** is the exception to every rule above: it always wins, and is pushed at once.

Cost: per-field stamps, a vector per host, tombstones. On a small organization this is one small module and a few hundred KB; it needs no
database product. **No consensus** (Raft, etcd): it needs a majority awake, and laptops sleep.
