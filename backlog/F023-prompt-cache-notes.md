# F023 — Prompt-cache notes (low priority, from Anthropic's claude-api skill)

**Status:** Todo (parked, low gain)
**Type:** Feature
**Created:** 2026-10-03

## Description

Notes from `prompt-caching.md` in Anthropic's bundled `claude-api` skill
(`cost-optimization.md` was already folded into `docs/COST-OPTIMIZATION.md`).
Judged low gain for us: most of it is API-side and we mostly run Claude Code
sessions. Kept here so it is not re-researched.

## Notes

- **Prefix match.** Any change early in the prompt re-bills everything after
  it. Do not change effort, thinking or model mid-session (add to F019: set
  effort at launch only). Keep hook context at the tail. A mod must not use
  `prompt.compose` for anything that changes between turns.
- **Cache-health figure.** Healthy loop: each request writes about one turn's
  worth to the cache. A write near the whole context, with no cold gap before
  it, means the prefix broke. Possible extra column in
  `scripts/cost-breakdown.mjs`.
- **Wake policy by idle age.** Wake under an hour idle reads the cache
  cheaply; over an hour with a big context re-writes it all (about 1M
  token-equivalents at 500k). Folds into F020 and the parked delivery triage.
- **Keep-alive ping (unmeasured).** About 50k token-equivalents per ping vs
  about 1M per cold wake, but it spends real turns, keeps the context large
  and its effect on the weekly allowance is unpublished. The skill's
  `max_tokens: 0` trick is API-only. Compacting before idle looks better.
- **Our own Haiku calls** (`lib/memory/claude-provider.ts`, voice): prompts
  are under Haiku 4.5's 4096-token cache minimum, so `cache_control` gains
  nothing. Batch API (50% off) only matters if background jobs move to an
  API key; not verified how the summarizer calls Claude.

Source: `/claude-api` skill, `shared/prompt-caching.md`.
