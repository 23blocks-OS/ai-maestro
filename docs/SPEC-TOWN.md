# Spec: The Town (names, first run, joining, merging)

Status: draft, 2026-11-06. Nothing here is built. Decided by Juan: **thing number one is called the Town**; "organization" does not
change; the first host starts with a town already there, with a default name; the analogy runs through the product and the new UX.
Backlog: [F091](../backlog/F091-town-first-run-join-merge.md). Related: [SPEC-MESH-ENTITIES.md](SPEC-MESH-ENTITIES.md), F075, F074, F089.

## 1. Why

Two different things were both called "organization": one built in February for messaging, one in October for companies.

| | Town | Organization |
|---|---|---|
| Example | `rnd23blocks` | 3metas, 23blocks |
| Answers | Which machines trust each other? | Who is this work for? |
| How many | Exactly one per host | Many in a town |
| Today | `organization` in `hosts.json`, the tenant in addresses | `org:` tags on agents, the `/org` page |

An agent's addresses are a separate matter. **Tenant** stays as the AMP word: an address space. An agent can have addresses in several
tenants (`name@rnd23blocks.aimaestro.local`, `name@mytenant.crabmail.ai`), but a host is in one town. A town has a tenant of the same name.

## 2. The analogy

| In the town | What it is | Technical word |
|---|---|---|
| **Town** | The machines that trust each other | Tenant, in AMP; mesh, in old code |
| **Building** | One machine in the town | Host |
| **Town hall** | The building holding the few single-master roles; mac-mini by default | Anchor host |
| **Town registry** | Who exists in the town, known on every host | Directory (F089) |
| **Organization** | A company in the town | `org:` tag |
| **Office** | An organization's presence in one building | Its agents on that host |
| **Agent** | Lives and works in the town | Agent |
| **Person** | A human who works with the agents | Person |
| **Team, Project** | Unchanged | |
| **Home** | An agent's own device (F078) | Agent home |

### Why organizations have offices in buildings

Like a real town: one office building holds many companies, and one company can have offices in several buildings. That matches the data: the MacBook
holds agents of eight organizations, mac-mini six, mini-lola three, and 3metas is on two machines. Juan chose this (2026-11-06) over organization =
neighborhood, which would need a rule that a host belongs to one organization.

3metas has an office in the mac-mini building and one in the MacBook building. Nothing is stored for an office: it is derived, as the `/org` page
derives organizations today.

**Neighborhood** stays free. If it is ever needed, it groups buildings by where they are: home, office, cloud.

### Rules for the analogy

1. **Agent, person, team, project and organization keep their names.** The analogy adds places; it does not rename what already works.
2. **It is the language of the product:** screens, docs, messages, onboarding. All of it, or it reads as a gimmick.
3. **Code and APIs keep plain words** (`host`, `agent`), so nothing breaks and an integrator is not asked to learn a story. New code uses `town`.
4. **Show the plain word once where it helps:** "Building (a machine)". An error a person must act on names the real thing: "The building
   mac-mini is not answering. Check that the machine is on."
5. **Do not stretch it.** No town word for a concept that is clearer without one.

## 3. Default town names

A new install gets a town at once, with a name chosen from a list. The person can rename it before it has residents (section 5).

Decided by Juan (2026-11-06): **names of ancient and historic cities, that nobody can claim as theirs.** Not fictional cities: Gotham, Metropolis and
Wakanda were dropped because DC and Marvel own them.

The list:

- **Greek:** Athens, Sparta, Corinth, Delphi, Thebes, Troy, Ephesus, Knossos, Olympia, Ithaca
- **Roman:** Rome, Pompeii, Ostia, Carthage, Ravenna, Herculaneum
- **Americas:** Machu Picchu, Cusco, Tikal, Palenque, Teotihuacan, Tenochtitlan, Chan Chan
- **Elsewhere:** Alexandria, Babylon, Petra, Persepolis, Angkor, Samarkand, Timbuktu

A name is a lowercase slug, since it goes in addresses: `lola@delphi.aimaestro.local`, `lola@machu-picchu.aimaestro.local`. Shown as written: Machu Picchu.

### The catch: a name is not an identity

With a short list, two strangers will both have a Delphi, and a machine joining would treat them as the same town, because **today the
check compares only the name** (`adoptOrganization`). So:

- Every town has a **town id** (a UUID), made when it is created. It is what hosts compare.
- The name is for people. Two towns with one name are two towns.
- Existing installs get an id on update. Hosts already joined must agree on it: the oldest `organizationSetAt` decides, once.

## 4. Vocabulary of the steps

| Step | Meaning |
|---|---|
| **Install** | Put AI Maestro on a machine |
| **Found a town** | The first building; happens by itself at install |
| **Join a town** | A new machine becomes a building in an existing town |
| **Merge towns** | Two towns with residents become one |
| **Leave a town** | A building goes away cleanly |

## 5. First run and joining

### What is wrong today

The first screen asks for a name that cannot be changed. On a second machine the same screen creates a second town by accident, and
joining then fails with "mismatch". The join starts on the old machine (Add Host), and the new machine has no such idea.

### The new flow

1. **Install.** A town exists at once, with a default name. There is no name screen.
2. **First screen:** "Welcome to Delphi." and two choices: **Start here**, or **Join another town**.
3. **Start here:** the person may rename it, and goes on.
4. **Join another town:** the person gives the address of a machine in that town. It becomes a building: it takes the town's id and name, and its
   default town disappears.

**The rule that makes this work: an empty town costs nothing.** A town with no residents (no agents, no people) can be renamed or dropped freely.
So every install can found a town at once, and joining from an empty one is simple, not a merge. Headless hosts with no screen join by command.

Once a town has residents, its name is in their addresses, so it stops being free to change (section 6).

Joining stays on the network trust model: no app-level auth. Whether a join needs approval from a host already in the town is open (section 8).

### Existing installs

`rnd23blocks` stays. Nothing renames an existing town. Update adds the town id; screens change to the new words. The internal field
`organization` in `hosts.json` and `getOrganization()` can keep their names at first, with a comment.

## 6. Merging towns

The hard case: two towns, both with residents. It is impossible today (join is refused and the name cannot change), and it is what Juan
described for F075: machines started apart that must become one. It needs its own design before code.

What it must answer:

- **Which name survives.** The person chooses. The other town's agents get new addresses.
- **Addresses change.** Old addresses must keep working for a time, so messages in flight and in other agents' contacts still arrive: an alias from
  the old town to the new.
- **Keys and registrations** are tied to the tenant (`registrations/<tenant>.json`).
- **Name clashes** between residents: two agents called `lola`. Both are kept and shown; the person resolves it (the rule in F089).
- **Organizations with the same name** in both towns are the same organization: `org:3metas` merges by itself.
- **Can it be undone?** A backup first, and a clear statement of what changes.

## 7. What changes in other specs

- `docs/SPEC-MESH-ENTITIES.md`: Organization there becomes Town; "unit" goes away.
- F075 splits: the default organization label stays in F075; the town goes to F091.
- F074 is about organizations, and is unchanged.
- Screens later: Settings → Hosts becomes the town's Buildings; `/org` stays Organization.

## 8. Open questions

1. **Does joining need approval** from a building in the town, or is reaching it enough, as today?
2. **Town hall on a one-building town** is that host. When a second one joins, does it move? mac-mini is only our default.
