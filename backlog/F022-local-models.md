# F022 — Local models for small agents and AI Maestro's own background jobs

**Status:** Blocked (not ready yet; research done 2026-10-01)
**Type:** Feature
**Created:** 2026-10-01

## Description

Run some work on local models (LM Studio or Ollama) instead of the Claude
subscription:
- **AI Maestro's own background model calls:** first the memory summarizer.
- **Small, short-context helper agents:** Claude Code pointed at a local
  server with `ANTHROPIC_BASE_URL`, launched by AI Maestro per agent.

The main agents stay on Claude.

## Why It's Needed

Weekly subscription usage runs out. Background jobs and mechanical helper
work spend the same allowance as the agents that need real intelligence.

## Business Case

- Moves usage off the subscription without making the main agents dumber.
- Private and offline for the jobs that move.
- "Run part of your fleet on your own hardware" is a strong story for a
  local-first product.

## Research (2026-10-01)

Full write-up: `docs/benchmark/local-llm-agents.md`.

- **The plumbing works.** Ollama ≥0.14 and LM Studio ≥0.4.1 serve
  Anthropic's API, so Claude Code, hooks and AMP run unchanged.
- **Models that fit 64 GB:**
  - Qwen 3.6-27B and Qwen3-Coder-Next (58.7% SWE-bench Verified).
  - Qwen 3.6-35B-A3B, a mixture-of-experts that should be faster.
  - Below Opus. The strong open models (Kimi K3, 76.8%) need a cluster.
- **Measured on the M4 Max (64 GB)** with a 24B dense model:
  - 186 s to read a 30k-token prompt the first time;
  - 1.1 s on later steps with the same prefix;
  - writing at 44 tokens/s with a short context, 12–14 tokens/s at 30k.
  - So only small-context agents are practical.
- **Hosts:** mac-mini (Intel, CPU only) and mini-lola (3 GB) cannot run them.

## Implementation Plan (when unblocked)

1. **Summarizer on a local model (S).** Optional local endpoint for
   `lib/memory/summarizer.ts`, with the subscription as fallback. Compare
   the quality of memory cards on the same sessions.
2. **One local agent (S–M).** A per-agent "model host" setting (env
   `ANTHROPIC_BASE_URL` and the model name at launch). Trial
   Qwen 3.6-35B-A3B on a small real task and judge quality and waiting time.
3. **Fleet model host (L, needs hardware).** One capable machine
   (M5 Ultra class) serves local models to agents on all hosts.

**Unblock when:** we want to try it, or a model host machine is available.
