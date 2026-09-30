# F018 — Research: keep the intelligence, give the tool work to cheap models

**Status:** Todo (research done, nothing built)
**Type:** Feature
**Created:** 2026-09-29

## Description

The expensive model (Opus) keeps the thinking and the decisions. The work of
executing tools (running commands, reading and searching, writing throwaway
scripts, reading their output) goes to cheaper models (Haiku, a local model).
Only the distilled result reaches the expensive model.

Two shapes were identified:

1. **Output distiller (a Claude Code hook).** A `PostToolUse` command hook
   replaces a large tool result with a cheap model's summary before Claude
   sees it (`updatedToolOutput`). Only outputs over ~2k tokens are
   summarised, and the raw output is always saved to a file whose path Claude
   gets, so nothing is lost.
2. **Tools agent (an MCP server).** The expensive model calls tools that take
   an intent, not a script: `run(what_to_find_out)`,
   `search_code(pattern, question)`, `read(file, question)` and
   `search_web(q, question)`. A cheap model writes the script, runs it and
   returns the answer.

## Why It's Needed

The weekly subscription allowance runs out and days of work stop. Per-request
routers change the whole conversation's model, which is not what we want: the
intelligence is the point. What is expensive is the doing.

## Business Case

- Directly stretches the subscription and cuts API spend without making the
  agents dumber.
- A fleet-level feature no single-session tool can offer (AI Maestro launches
  and configures every agent).

## Research so far (2026-09-29)

### Options rejected, and why

- **Per-request routers:**
  - [jev-router](https://github.com/gargpratyush/jev-router) picks Haiku/Sonnet/Opus per turn with the Jev classifier, through a local proxy (`ANTHROPIC_BASE_URL`), and works with the subscription login.
  - [claude-code-router](https://github.com/musistudio/claude-code-router) routes by request type to any provider, but needs API keys and cannot use a subscription.
  - Both swap the model for the whole turn, so the thinking gets dumber.
  - Switching models throws away the prompt cache (caches are per model), so the new model re-reads the whole context.
  - Both depend on undocumented request formats, and a proxy in front of a subscription is a grey area in the terms of service.
- **Static model choice** (`opusplan`, Sonnet by default, Haiku subagents): works today but gives up intelligence or relies on the model choosing to delegate.
- **Agent SDK:** built for API keys, so moving the fleet there means paying API prices.

### Claude Code hook capabilities (verified on the hooks reference, CLI 2.1.283)

- `PostToolUse` → `hookSpecificOutput.updatedToolOutput` replaces the output of **any** tool, built-in or MCP, before Claude sees it.
  - The value must match the tool's output shape. Bash, for example, is `{stdout, stderr, interrupted, isImage}`.
  - A wrong shape is silently ignored and the original output is used, so a mistake is safe.
  - Telemetry still records the original.
- `PreToolUse` → `updatedInput` rewrites a tool's arguments before it runs. The Bash `description` field states the intent and could be the distiller's question.
- `type: "prompt"` and `type: "agent"` hooks call a model directly, but can only allow or block. They cannot return replacement output, so the distiller must be a command hook that calls the cheap model itself.
- Gotchas:
  - A `claude -p` inside the hook loads the same hooks, so it needs a recursion guard (env var).
  - Each summary adds seconds to that tool call.
  - Command hooks time out after 600 s by default.

### Measured on our own transcripts (largest recent sessions on this Mac)

| | vg-64 | IaC | hr |
|---|---|---|---|
| Tool **output**, share of transcript | 37% | 48% | 34% |
| Share of tool output from calls **> 2k tokens** | 7% | 19% | 15% |
| Tool **inputs** (what the agent writes), share of transcript | 41% | 34% | 53% |
| … of which scripts the agent writes (heredocs, python) | 55% | 35% | 64% |

Findings:

- Tool output is spread over thousands of small calls (averaging 180–310 tokens; 1,000–4,700 Bash calls per session). A >2k distiller would shrink context by only about **3–9%**. Summarising every small call adds latency for almost nothing.
- **The larger cost is the expensive model writing throwaway scripts**:
  - 1,669 heredoc/python scripts in vg-64 and 714 in hr, averaging 450–800 tokens each.
  - These are output tokens, the most expensive kind, and they stay in context and are re-read every step.
  - A hook cannot change who writes the command; it only sees it after Opus wrote it. Only shape 2 (the tools agent) addresses this.
- These figures are proportions of transcript size, not the bill. The bill also depends on steps × context at each step, and compactions reset the context. Scripts: `toolshare.py`, `buckets.py`, `inputs.py` (session scratchpad, not kept); they are easy to recreate from this description.

## Implementation Plan

- **Step 1 (S):** the output distiller on one agent.
  - `PostToolUse` command hook in `scripts/claude-hooks/`.
  - Threshold ~2k tokens; raw output saved under the agent's dir, with its path in the summary.
  - Cheap model via `claude -p --model haiku` with a recursion guard, or a local model.
  - Measure with the status line's cost and context numbers against a baseline week.
- **Step 2 (M):** the tools agent as an MCP server, launched with each agent by AI Maestro.
  - Tools that take an intent.
  - A cheap model writes, runs and summarises; the raw result is saved to a file.
  - Nudge the expensive model toward it (skill text, or permission limits on heavy Bash).
  - Measure how much heredoc/script output disappears from the transcripts.
- **Open questions:**
  - Quality: does Opus lose anything it needed? Measure re-reads of the raw files.
  - Latency per call.
  - Which cheap model does the job: Haiku, local, or Jev deciding pass-through vs summarise.
- Related: F016 (compact at a budget; step one, the status line advice, shipped in v0.45.9) and F017 (prune stale tool output).
