# F006 — Memory cards and an entity graph (the agent summarizes its own memory)

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-22

## Description

v0.39.4 stores each memory as a verbatim passage that Jev classified. That is
evidence, not a memory: an agent reading it gets a paragraph of transcript, and
the graph can only link passages to passages.

Next phase:

1. **Memory card + pointer.** Each memory becomes a short card: a one-line
   `statement`, `category` (Jev), a fixed-vocabulary `action`
   (decided, rejected, fixed, discovered, prefers, depends_on, replaced, …),
   typed `entities`, and a pointer to the source message ids in the agent's own
   CozoDB `messages` table. The verbatim passage stays as the card's evidence.
2. **Entities as graph nodes.** Entities come back from the summarizer with a
   type (file, service, host, agent, person, product, concept) and a canonical
   name; deterministic candidates (file paths, `identifiers`, PR numbers,
   versions, hosts, URLs, registry agent/host names) seed and check them. Jev
   types candidates and answers "same thing?" for alias merging
   ("mini-lola" = "Lola's host" = 100.76.17.128). The graph becomes entities
   as nodes and typed relations with memories as evidence, linkable to the
   code graph that graph-query already builds.
3. **Graph-walking recall.** "What do we know about mini-lola" follows the
   entity's edges, not only nearest-text matches.

## Why It's Needed

Juan, 2026-09-22: storing verbatim "does not seem to have much sense; store the
memory in some memory format and point to the verbatim conversation", and
"identify entities, actions, etc, so we can build a proper graph." The goal
behind all of it: agents check memory before files. A card an agent can read at
a glance, and a graph that answers "what do we know about X", are what make
that worth doing.

## Business Case

- Retention: memory that reads well is memory agents actually use.
- Cost: no new key. Summarization runs on the agent host's own Claude
  subscription.
- Reliability: Claude Code deletes transcripts after 30 days
  (`cleanupPeriodDays`); pointers into our own message store survive that,
  pointers into `.jsonl` files do not.

## Implementation Plan

**Summarizer (verified 2026-09-22 on Claude Code 2.1.280):**

```
cd ~/.aimaestro/memory-worker &&   # neutral cwd: no CLAUDE.md, no project transcript
claude -p --model haiku --tools "" --no-session-persistence --strict-mcp-config \
  --settings '{"disableAllHooks":true}' --output-format json \
  --system-prompt "<card instructions>" --json-schema '<cards schema>' "<excerpts>"
```

- Measured: claude-haiku-4-5 via subscription OAuth (no ANTHROPIC_API_KEY in
  env), 6.5 s, ~$0.004 API-equivalent, **no transcript written**.
- **Not `--bare`**: bare mode reads only ANTHROPIC_API_KEY, never the
  subscription login.
- Context per flagged passage: the whole exchange (user turn + full reply) plus
  the preceding exchange; flagged passages marked `>>>`. Batch one
  conversation's flagged passages per call (10–20) to amortize the ~6 s start.
- `action` and entity `type` are enums in the JSON schema, not free text
  (the unconstrained test returned prose for `action` and noisy entities).
- Faithfulness gate: one Jev call per card ("is this statement supported by the
  excerpt?"); unfaithful cards are dropped and the verbatim memory is kept.
- Runs in the agent's nightly slot on its own host. On a usage-limit error,
  cards are deferred to the next night; Jev classification still stores the
  verbatim memory, so nothing is lost.

**Steps, in order:**

1. (S) Pointers + retention: record `source_message_ids` for each memory; exclude
   messages that back a memory from `pruneShortTermMemory`. Independent and
   urgent because of the 30-day deletion.
2. (M) Schema: `entities {entity_id => name, type, aliases}`,
   `memory_entities {memory_id, entity_id => role}`,
   `entity_relations {from, predicate, to => memory_id, confidence}`;
   `memories` gains `statement`, `action`, `card_status`.
3. (M) Summarizer worker (`lib/memory/summarizer.ts`): batch builder, the
   `claude -p` invocation, schema validation, the Jev faithfulness gate, deferral
   on limits; plus a backfill pass that turns existing verbatim memories into cards.
4. (M) Entity canonicalization: deterministic candidates + Jev typing + Jev
   same-thing merge + embedding match.
5. (M) UI: the card as the primary view with the evidence expandable; graph view
   with entities as nodes, memories on hover.
6. (S) Recall: the hook injects card statements (much shorter than passages, so
   more fit); `memory-search.sh` gains "about <entity>".

**Open questions:**
- Hosts where Claude Code is not logged in: skip cards and keep verbatim, or
  fall back to a BYO key?
- Faithfulness threshold for the Jev gate: calibrate on real cards, the same
  way the recall distance was calibrated.
- How much of the preceding exchange fits before a batch gets too big: measure.
