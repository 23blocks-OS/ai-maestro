# Long-Term Memory

Long-term memory is a skill an AI Maestro agent can have. With it, the agent
remembers what it learned across sessions: the decisions it made and why, the
facts about the systems it works on, and above all **the things it works with
and how they relate**. Before it changes something, it knows what else that
change touches.

This document explains why the skill exists, the ideas behind it, and how it
works, in that order.

---

## Why

### Agents forget, and Claude Code deletes the record

A Claude Code agent starts every session with an empty mind. What it learned
yesterday (which host runs which service, why a migration was done a certain
way, what broke the last time a bucket was moved) is gone unless someone wrote
it into a file.

The conversation itself is kept for a while. Claude Code deletes transcripts
older than `cleanupPeriodDays`, **30 days by default**. After that, the only
record of months of an agent's work is whatever AI Maestro kept. One of our
own agents (IaC, infrastructure) had 422 conversations over ten months; one
transcript was still on disk.

### Some agents need more than one session's context

The agent is the product, and long-term memory is one of its skills. Not every
agent needs it. An agent that answers a question, writes a function or triages
an inbox does fine inside one session.

Other agents act on systems whose structure outlives any conversation:
infrastructure, deployments, data, customer environments. For them the
expensive mistakes are the ones where a change hits something the agent did
not know was connected. They need the **entities** involved (services, hosts,
buckets, repositories, people) and the **relations** between them (runs on,
stores data in, depends on, deploys to), kept current, so they can act with
the consequences in view.

That is what this skill is for.

---

## Concepts

The model follows how human memory is usually described.

| | In people | In an agent |
|---|---|---|
| **Short-term memory** | what you hold in mind right now | the context window: the current session, the files read, the conversation so far. Lost when the session ends or is compacted. |
| **Long-term memory** | what persists | what AI Maestro keeps across sessions |
| · episodic | what happened | the conversations: the transcript, and the agent's message index that outlives it |
| · semantic | what is true | **memory cards** (decisions, facts, preferences, lessons) and the **entity graph** |
| · procedural | how to do things | skills. Not captured automatically yet. |
| **Consolidation** | sleep turns the day into memory | a nightly run (2 AM, and older history until 8 AM) turns conversations into cards and relations |
| **Recall** | a cue brings a memory back | the prompt: memories near it and the relations of entities it names are injected |
| **Strength** | rehearsal makes a memory stronger | recurrence: knowledge that comes up in more sessions weighs more |
| **Forgetting** | unused memories fade | a one-off memory nobody used fades after 30 days, and comes back if it recurs |

Everything consolidation keeps is long-term memory. Recurrence does not move a
memory into a different kind of memory; it makes it stronger.

### A memory card

One self-contained statement of durable knowledge, with the passages it rests
on:

> **fact** · 23blocks-api-authentication has 7 critical vulnerabilities fixed in
> undeployed code (v4.46.0 in prod is vulnerable); the staging environment is
> decommissioned, blocking a safe test and deploy of the fix.
> *entities:* 23blocks-api-authentication · *seen in 1 session* · *evidence:* 2 passages

Cards are written for a future session: "what the agent will need to know",
not "what happened today". Progress reports, narration and task chatter are
not memory.

### Entities and relations

Every card names the specific things it is about. Those become nodes in the
agent's **entity graph**, shared by every card that mentions them. Between
them, cards state **relations**, always directed and always a verb:

```
23blocks-api-crm   depends on      23blocks-api-authentication
winepro            stores data in  products.public
Zoom               runs on         ECS
api                runs on         mini-lola          (no longer)
```

The verbs are fixed, and chosen for consequences: `uses`, `depends_on`,
`runs_on`, `hosts`, `deploys_to`, `stores_data_in`, `reads_from`, `writes_to`,
`calls`, `part_of`, `owns`, `configures`, `requires`, `replaces`, `fixes`,
`breaks`, `affects`, `prefers`, `decided_on`, `rejected`. "Related to" is not a
relation: it says nothing about what a change affects.

A relation **changes over time**. Each statement of it is dated by when it was
said in a conversation, and says whether it holds or has ended ("we moved the
API off mini-lola"). The relation's state is its latest statement. Its
**weight** is the number of sessions behind it.

### Strength and fading

| Level | Meaning |
|---|---|
| **warm** | seen in one session |
| **recurring** | the same knowledge came up in 2 or more separate sessions of this agent |
| **faded** | seen once, never recalled, older than 30 days; kept, not recalled; revived if it comes up again |

One paragraph in one session does not show that something will matter again.
The same knowledge surfacing in another session does. Before a new card is
stored, AI Maestro checks whether an existing memory already states the same
point; if so, the new card reinforces it instead of becoming a duplicate.

Memories belong to one agent. Agents do not share memory, and recurrence
counts only that agent's own sessions.

---

## The skill

Each agent has the skill switched on or off in its profile: **Skills → Long-term
memory**. It is stored in the agent's own directory, so it moves with the agent.

| Switch | Effect |
|---|---|
| **Long-term memory** (default on) | nightly consolidation and history backfill run for this agent |
| **Recall into prompts** (default on) | memories and entity relations are injected into its prompts |

Off means nothing is built and nothing is injected. What was already built is
kept and remains searchable.

The classifier and its key are host-level: **Settings → Memory**.

---

## How it works

```
 conversation ──► message index ──► nightly consolidation ──► memory cards + entity graph
 (transcript,      (every message,    redact → classify →        (agent's own CozoDB)
  deleted at 30d)   kept)              summarize → check →               │
                                       merge → link                      ▼
                                                               recall into the next session
```

### 1. Indexing

Every agent's messages are indexed into its own database (CozoDB, at
`~/.aimaestro/agents/<id>/agent.db`), hourly and on idle. The index keeps full
message text and survives Claude Code's 30-day deletion. This is the episodic
record everything else is built from.

### 2. Consolidation (nightly)

Each agent consolidates once a night at 2 AM (its own schedule, in
`schedule.json`), run on idle transitions or by the server sweep. It reads
every conversation with messages it has not consolidated yet, newest first:
from the transcript when it is still on disk, otherwise rebuilt from the
message index.

1. **Redact.** Secrets are removed before anything leaves the machine or is
   stored: private keys, connection strings, provider tokens, `KEY=value`
   assignments, and values quoted after words like key, salt, secret or
   password. A secret found once is remembered as a SHA-256 hash (never the
   value) and redacted wherever it appears later, even with no hint around it.
2. **Classify.** Each passage (a user turn, or a paragraph of the reply) is
   judged in the context of its exchange by a small classifier ([Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), a System
   One model): is it worth remembering, what kind of knowledge is it, how
   important. A user turn is also judged against what the agent said just
   before it: **is the user correcting the agent?** Corrections are the most
   valuable memory and the rarest, so they are kept on a lower bar, written as
   "the right way" (action `corrected`), ranked higher in recall and put first
   at session start. Most of a conversation is not memory; this step finds the
   candidates cheaply.
3. **Summarize.** The candidates of one session are read together, with their
   exchanges, by the host's own Claude subscription (Haiku, through
   `claude -p` with tools, hooks and thinking off). It writes a few cards:
   about one per three candidates, at most five per call, zero when nothing
   qualifies. Each card has a statement, a category, the entities it names,
   the relations between them (with whether each still holds), and the
   passages it rests on.
4. **Check.** The classifier verifies each card against its evidence (is the
   statement supported?) and that it does not reveal a secret value. Cards that
   fail are dropped.
5. **Merge.** If an existing memory states the same point, the card reinforces
   it (one more session, more evidence) instead of creating a duplicate. The
   check is embedding distance plus a classifier judgement, because "use X" and
   "do not use X" embed close together.
6. **Link.** Entities are resolved to existing nodes (so "mini-lola" and
   "the mini-lola host" are one node), relations are recorded with the date
   they were said, and pairs of entities a card names without stating a verb
   are read by the classifier for the verb the evidence supports.

Budget per run: about 1,000 passages and 10 summarizer calls, typically 3 to
10 conversations (a real run on IaC: 10 conversations, 21 memories, 4 minutes). Progress is saved per conversation, so a run that stops resumes
where it stopped.

### 3. History backfill (nightly)

An agent with months of history would take months at one run per night. When a
run leaves conversations behind, it records that (`memory-backlog.json` in the
agent's directory), and during the night window (2 to 8 AM) the server keeps
consolidating agents with a backlog, one at a time, round-robin, so each gets
its newest history first. An agent whose run makes no progress (a usage limit,
an outage) waits for the next night. Nothing runs during the day; the
**Consolidate now** button in the Memory tab works any time.

### 4. Recall

Memory reaches the agent in two ways.

**Automatically**, through the AI Maestro Claude Code hook:

- **Session start:** the agent's standing decisions, preferences and patterns,
  the ones seen in the most sessions first.
- **Each prompt:**
  - for every entity the prompt names, what the agent knows about it: its
    relations, current ones first, strongest first, "no longer" when one ended;
  - the memories nearest to the prompt, favouring ones seen in more sessions.

Each memory and each entity is injected at most once per session. For
example, a prompt asking to redeploy 23blocks-api-authentication brings:

```
## Memory: what you know about the things this prompt names
**23blocks-api-authentication** (service)
- 23blocks-api-crm depends on 23blocks-api-authentication
- 23blocks-api-sales depends on 23blocks-api-authentication
- 23blocks-api-search depends on 23blocks-api-authentication
- Zoom uses 23blocks-api-authentication
- 23blocks-api-authentication breaks 23blocks-api-platform

## Memory: notes from your past sessions on this topic
- [fact · 2026-07-31] Staging cluster was decommissioned in June 2026 ...
```

**On demand**, through the `memory-search` skill:

```bash
memory-search.sh "staging deploy"            # cards first, then raw history
memory-search.sh --about "products.public"   # an entity's relations and cards
```

### 5. Measuring use

Every injection is appended to the agent's `memory-recalls.jsonl` (time,
session, memory ids, entity names). Consolidation folds it into each memory's
access count. Only injections count; searches made by consolidation itself do
not. This log is the raw data for the open question: does recalled memory
change what the agent does?

---

## Setup

1. **Classifier key.** Settings → Memory: the model URL and API key (each
   user brings their own; stored in `~/.aimaestro/memory-settings.json`, mode
   0600, never sent back to the browser). **Test connection** checks it.
2. **Claude login on the host.** The summarizer uses the host's own Claude Code
   login. On macOS, if the server cannot read the Keychain, it runs the
   summarizer inside a hidden tmux session instead.
3. **The skill.** On by default for every agent. Switch it off for agents that
   do not need it: Agent profile → Skills.

---

## Operations

| | |
|---|---|
| Nightly run | 2 AM per agent; the sweep starts daily tasks until 8 AM |
| History backfill | 2 to 8 AM, one agent at a time, until no backlog |
| Budget per run | ~1,000 passages, 10 summarizer calls |
| Cost | classifier: about $0.06 per 1,800 passages; summarizer: the host's Claude subscription (Haiku) |
| Turn off the sweep | `MEMORY_SWEEP_ENABLED=false` |

**Where it lives** (per agent, `~/.aimaestro/agents/<id>/`):

| File / table | Holds |
|---|---|
| `agent.db` → `messages` | the message index (episodic) |
| `memories`, `memory_cards`, `memory_vec` | the memories, their statements and embeddings |
| `memory_evidence` | the passages each memory rests on, per session |
| `entities`, `memory_entities` | entity nodes and which memories name them |
| `entity_relations`, `relation_statements` | relations, and each dated statement of them (holds / ended) |
| `secret_hashes` | hashes of secret values seen (never the values) |
| `skill-settings.json` | the skill switches |
| `memory-backlog.json` | whether history is left to consolidate |
| `memory-recalls.jsonl` | every injection |

**API:**

| Endpoint | |
|---|---|
| `POST /api/agents/:id/memory/consolidate` | consolidate now |
| `GET /api/agents/:id/memory/long-term` | memories (paged); `?view=stats`, `?view=entity-graph[&focus=name]` |
| `GET /api/agents/:id/memory/recall?q=` | what the hook injects |
| `GET /api/agents/:id/memory/entity?name=` | an entity's relations and memories |
| `POST /api/memory/backlog` | start the night backlog worker (no-op outside 2 to 8 AM) |

**Logs:** `[MEMORY]`, `[CONSOLIDATE]`, `[Memory Sweep]`, `[Memory Backlog]`,
`[Schedule]` in the server log.

---

## Known limits

- **Use is not yet measured.** The recall log records what was injected; whether
  the agent acted on it still has to be judged from its next turns.
- **Procedural memory** (how to do things) is not captured. Skills are the
  natural home for it.
- **The message index is not redacted.** Secrets are removed from memory, not
  from the raw index the history is rebuilt from.
- **Relations are only as good as the conversations.** A dependency nobody
  mentioned is not in the graph.
