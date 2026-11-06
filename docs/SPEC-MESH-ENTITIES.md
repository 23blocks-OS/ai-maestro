# Spec: What lives where in the mesh (concepts and patterns)

Status: draft for Juan's review, 2026-11-06. Audit of the code and of three live hosts (MacBook, mac-mini, mini-lola). Nothing
here is built. Backlog: [F089](../backlog/F089-mesh-directory-one-pattern.md), B033, B034, B035. Touches F057, F074, F075, F078.

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
   (3metas, 23blocks) inside it. F074 and F075 mix them.
5. **Names are not shared.** Directory entries have no label, so "Dahlia" is known only on Dahlia's host. Messages show
   `ai-maestro-app`, as they show `p-<id>` for a person.

## 3. The concepts

- **Organization.** The trust and naming boundary: one per mesh. A host is in it or not. Its name forms addresses.
- **Host.** A machine in the organization. It holds things and runs things; it has no identity beyond that.
- **Entity.** Something with its own identity: an agent, a person, a team, a project. It is known across the organization, whichever
  host holds it. A person is not "on" a host, and neither is a team.
- **Id and name.** Every entity has a stable id that never changes, and a display name that can. Machines use ids. People see names.
  An address is built from something stable.
- **Owner host.** Each entity has exactly one host that writes it. It is where the entity lives, not what it is.
- **Directory.** Every host keeps a read copy of what the organization knows about every entity: id, name, type, owner host, address,
  public key, last seen. Reading needs no network.
- **Delivery.** Something sent to an entity is stored and forwarded until it arrives. It never depends on the owner being up at
  that moment.

## 4. The one pattern: owner host + directory

For every entity that is known across the organization:

1. **One writer.** Only the owner host changes the record, so nothing ever has to be merged. This keeps the benefit the people design
   wanted.
2. **Everyone reads locally.** A host answers from its directory, with no call to a peer.
3. **Copies are only for reading.** A write goes to the owner host. When it is down, the write fails and says so.
4. **One sync, for all types.** Hosts exchange changes on a timer and on change, by version, using the peer exchange that hosts
   already use. One mechanism and one code path, with the type as a field.
5. **Honest age.** A copy says when it was last confirmed. A view can show that an owner is unreachable.
6. **Deletes are remembered**, as tombstones, so an old copy cannot bring something back.
7. **Ownership can move.** Agents already move between hosts; a person or team can too, so nothing is stuck on a laptop.

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

## 7. Decisions needed

1. **Two organizations.** Is the tenant *the* organization, with `org:` groups as something inside it (units or clients)? This spec
   assumes yes. F074 and F075 then need different words for each.
2. **One writer, or replicated records?** This spec chooses one writer: simple and nothing to merge, but a record cannot change while its
   owner is off. The alternative is every host writing, last write wins: always editable, but changes can be lost silently. For
   people and teams, which change rarely, one writer with ownership that can move looks right.
3. **Where should a person live by default?** A laptop is a poor owner. Prefer an always-on host, chosen by the operator?
4. **Should the directory hold public keys?** It would let a host verify a sender with its owner offline, which delivery needs. It also makes
   key revocation a sync problem: how fast must it reach every host?
