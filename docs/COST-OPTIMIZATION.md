# Cost optimization: where an agent's money goes, and what we do about it

*2026-09-30. Research and plan; nothing in this file is built yet unless marked.*

Agents run out of weekly subscription usage and days of work stop. This file
records what we measured, what Anthropic's own guidance says, and the plan
that follows from both. Backlog items: F016, F017, F018, F019, F020 and F021.

## Sources

- Anthropic, `claude-api` skill, **Cost Optimization**:
  [`skills/claude-api/shared/cost-optimization.md`](https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/cost-optimization.md)
  and **Cost-reduction search**:
  [`shared/evals/cost-hillclimb.md`](https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/evals/cost-hillclimb.md).
- Claude Code docs:
  [hooks](https://code.claude.com/docs/en/hooks),
  [prompt caching](https://code.claude.com/docs/en/prompt-caching),
  [environment variables](https://code.claude.com/docs/en/env-vars)
  (`CLAUDE_CODE_PROMPT_CACHE_TTL`) and `claude --help` (`--effort`).
- Our own transcripts, measured with `scripts/cost-breakdown.mjs`.

## What we measured

`node scripts/cost-breakdown.mjs` reads the API usage that every request
records in a Claude Code transcript.

- **Weights.** Shares are in base-input-token equivalents: cache read 0.1,
  one-hour cache write 2.0, output 5.0.
- **What the shares are not.** They are proportions of each session's cost,
  not dollars. Anthropic does not publish how a subscription weighs usage.
- **Long context.** The long-context premium above 200k tokens raises every
  part alike, so it doesn't change the shares.
- **Cold wake.** A request after more than an hour of silence that wrote
  over 50k tokens to the cache.

The largest sessions on this Mac, last 10 days:

| Session | Requests | Avg context | Context re-read | Cold wakes | Other cache writes | Output (visible) | Thinking |
|---|---|---|---|---|---|---|---|
| observerhub-vg (vg-64) | 5,784 | 534k | 71% | 18% | 5% | 3.9% | 1.5% |
| agents-web (earlier) | 2,751 | 543k | 70% | 18% | 7% | 4.1% | 1.5% |
| 23b-gm | 3,025 | 514k | 59% | 21% | 15% | 4.4% | 1.0% |
| agents-web (the session that wrote this) | 1,202 | 528k | 74% | 15% | 5% | 4.9% | 1.6% |
| IaC | 2,703 | 235k | 56% | 25% | 14% | 4.0% | 1.3% |
| 23b-hr | 2,162 | 494k | 53% | 27% | 14% | 4.8% | 1.2% |
| salesland | 2,395 | 529k | 69% | 19% | 6% | — | — |

What this says:

1. **Context size is the bill.**
   - Re-reading the context on every step is 53–74% of the cost.
   - The average request carries about half a million tokens.
   - Each step is cheap per token (cached) but enormous in volume.
2. **Cold wakes are the second cost: 15–27%.**
   - An agent idles past the one-hour cache lifetime and is woken by a
     message, a scheduled task or the user.
   - Its whole context, often 600–850k tokens, is then written to the cache
     again before it does anything.
   - Every session above has 12–64 of them.
3. **What the agent writes is small: 4–6% of the cost.** That includes code,
   commands and thinking. Our earlier idea that the agent "writing too much
   code" was the cost (F018) was wrong. Those scripts cost money mainly
   because they then sit in the context and are re-read, and that is
   point 1.
4. **Thinking is about 1–1.6% directly.** Lower effort would still cut fewer
   steps, and every step re-reads the context.

The earlier measurement of tool output vs tool inputs (F018) counted
transcript characters. These figures count the billed usage and supersede it.

## What Anthropic's guidance says, applied to us

The guide measures **cost per completed task, not cost per token**. It
applies changes in a fixed order: changes that cost no quality first
(caching, sending less, loop hygiene, output, batching), then trade-offs
(effort, budgets), and **changing the model last**.

| The guide says | Our case | Verdict |
|---|---|---|
| Compaction "took roughly a third off the bill" on long runs and nothing on short ones | Our sessions are long and run at around 500k context | **Applies: the biggest lever.** F016 |
| Match the cache lifetime to how long a session idles | Claude Code already uses a one-hour cache on a subscription; the gaps that hurt are longer than an hour | **Applies:** the fix is a smaller context before a long idle, not a longer cache. F020 |
| Clearing old tool results "is a context-window tool, not a savings lever": in the measured run it cost more than it saved. On current models a client-side prune also breaks the model's earlier reasoning, with no workaround | That is F017's proxy | **F017 is Wontfix** |
| Switching models mid-conversation restarts the cache (caches are per model) and can drop the earlier reasoning | Per-request routers (jev-router, claude-code-router) | **Rejected** (F018) |
| Lower the effort before changing the model. Research and knowledge work shows almost no quality loss; long coding is a real trade-off. Effort scales thinking and tool-call depth | `--effort` per agent is possible today through the agent's `programArgs` (empty on all 94 agents) | **Applies, mainly through fewer steps.** F019 |
| Cost comes from the actions an instruction triggers, not prompt length: "verify twice" +48%, "be maximally thorough" +39% | Our hooks, skills and CLAUDE.md files carry action-triggering instructions | **Applies.** F021 |
| A planner delegating to cheaper workers pays only with bulk to hand off. On one chain of dependent steps, the smart model alone at lower effort came out ahead | The "scriptwriter" tools agent (F018) | **Deprioritized:** output is 4–6% of cost |
| A subagent for a self-contained bulky step, optionally cheaper; skip when the decider needs the intermediates | Same | Use case by case; not a fleet feature |
| Batch API is 50% off for work no one waits on | API only, not Claude Code sessions | Later, for AI Maestro's own background jobs if they move to the API |
| Look at the most expensive tasks, not the typical one: 2 of 20 tasks carried 43% of one run's spend | vg-64 | Applies: watch the outliers |

In-repo evidence that thinking matters for one-shot jobs:
`lib/memory/summarizer.ts` measured 12–16k hidden thinking tokens per
summary with thinking on, about 1k with it off. It runs with thinking off.

## The plan

The order follows the guide. Each step is applied on its own and measured
with `scripts/cost-breakdown.mjs` (cost shares, average context, cold wakes)
before the next one.

### Step 0: measurement (done)

`scripts/cost-breakdown.mjs`. Next: a per-agent weekly figure in AI Maestro,
fed from the same transcript usage the script reads.

### Step 1: keep the context small (F016), the biggest lever

- **Budget.** Compact at a natural break once the context passes a budget
  (default 150k). Jev decides "natural break".
- **Expected saving.** Re-reads scale with context. Bringing an average of
  ~500k down to ~150k cuts the largest cost (53–74%) by about two thirds.
  That is our estimate; Anthropic measured a third off.
- **What compaction loses.** Detail. The memory skill exists to recall it.
- **Status.** The status line advice shipped in v0.45.9.

### Step 2: no cold wakes on a large context (F020)

- **Before a long idle.** When an agent goes idle with a context over the
  budget, compact it then, so a later wake re-writes ~30k tokens, not ~800k.
  This is the same mechanism as step 1, with idle as the natural break.
- **What wakes agents.** Find out what triggers the wakes (AMP push, the
  5-minute inbox poll, scheduled tasks, the user). Hold non-urgent
  wake-ups so several arrive together.
- **Expected saving.** Up to the 15–27% that cold wakes cost now.

### Step 3: effort per agent (F019), the first trade-off

- **Field.** An effort field on the agent profile (`--effort` at launch;
  `programArgs` works today). Default unchanged.
- **Trial.** Knowledge agents (hr, gm) at `medium`, one at a time, for a week.
- **What to compare.** Requests per task and the cost shares. You judge the
  quality: the guide's rule is never to trade accuracy for cost silently.

### Step 4: audit instructions that trigger actions (F021)

Count in transcripts what each standing instruction triggers: inbox checks,
self-reviews, re-reads, verification passes. Remove or narrow those that buy
nothing. Our own injections (hook text, AMP notifications, memory recall)
come first.

### Not doing, and why

- **Per-request model routers and mid-session model switches.** They break
  the cache and the reasoning, and take intelligence away. (F018)
- **Pruning stale tool output (F017).** It costs more than it saves, and
  breaks the model's earlier reasoning.
- **The Agent SDK.** Built for API keys, so it means API prices.
- **The scriptwriter tools agent (F018).** Not now: output is 4–6% of the
  cost. Revisit only if steps 1–3 leave it significant.
