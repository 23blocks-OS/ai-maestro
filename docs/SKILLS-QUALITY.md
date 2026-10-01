# Skills and prompts: measured, not assumed

*AI Maestro v0.47.0 · plugin 1.2.0 · 2026-10-01*

Every skill AI Maestro ships, and every prompt it injects into agents, was
audited against Anthropic's current guidance and then **measured** with Claude
Code's own eval tool. This page records the method and the numbers.

## What "best" means here

Anthropic's guidance, which this work follows:

- [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
  Claude is already very smart, so only add what it doesn't know. Keep skills
  concise, put detail in references, and make the description say what the
  skill does **and when to use it**.
- [Claude Code skills](https://code.claude.com/docs/en/skills.md): every installed
  skill's description is loaded into every session, within a listing budget.
- [Cost optimization](https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/cost-optimization.md)
  and its companion: cost comes from the **actions an instruction triggers**
  ("verify twice" +48% per task), not from prompt length.
- Independent evidence: human-written, focused skills raise pass rates
  (SkillsBench, [arXiv 2602.12670](https://arxiv.org/abs/2602.12670)).
  Undertriggering is the most common failure
  ([Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)),
  and duplicate or competing skills lower how often the right one is chosen
  ([Coder-Eval](https://coder-eval.com/blog/does-your-claude-skill-trigger)).

## Method

`claude plugin eval` runs each case in a fresh, isolated Claude Code session
with only the plugin loaded.

- **Should-fire cases:** a natural request that names no skill. The grader
  passes when the right skill is invoked.
- **Should-not-fire cases:** unrelated requests. The grader passes when no
  skill is invoked.
- **Settings:** Sonnet, 3 runs per case. Graders are `tool_used` checks: free
  and deterministic.

The suite ships in the plugin repo (`ai-maestro-plugins/evals/triggers`) so
anyone can re-run it.

## Results

**AI Maestro plugin** (8 skills: messaging, identity, canvas, memory, docs,
code graph, agent management, planning), 16 cases:

| Version | Score | Cases passing all 3 runs | Cost of the suite |
|---|---|---|---|
| 1.0.0 (before) | 0.85 | 13 / 16 | $2.30 |
| 1.1.0 (descriptions say when to use each skill) | 0.92 | 14 / 16 | $2.35 |
| **1.2.0 (lean bodies)** | **1.00** | **16 / 16** | **$1.81 (−21%)** |

**lolabot** (4 personal-assistant skills), 7 cases:

| Version | Score | Cases |
|---|---|---|
| Before | 0.71 | 5 / 7 (the memory skill never fired) |
| **After** | **1.00** | **7 / 7** |

**23blocks Auth Block** (25 API skills, a sample of the 206 in the block
plugins), 14 cases:

| Version | Score | Cases |
|---|---|---|
| Before | 0.69 | 8 / 14 |
| After (descriptions 37% shorter) | 0.83 | 10 / 14 |

The block-plugin changes are with the API team for review.

No skill fired on an unrelated request, in any version.

## What changed

- **Descriptions say when to use the skill.** Siblings no longer compete:
  memory-search covers history and what depends on something; docs-search
  covers signatures, arguments and parameters; graph-query covers callers
  before a change.
- **Bodies are written for current models.** The 12 core skills went from
  25,386 to 9,619 tokens (−62%).
  - What Claude already knows was cut.
  - No shouted MUST/ALWAYS rules remain.
  - No instruction to search or verify "on every turn" remains.
  - Rarely needed detail moved to references.
  - Safety rules are kept, stated plainly with the reason.
- **No duplicate skills.** Installer backups used to be loaded as 16 extra
  copies of the 8 skills on every machine. Backups now live outside the
  skills folder.
- **Prompts AI Maestro injects into agents:**
  - The inbox, memory and entity notices that ride on prompts are shorter,
    and no longer tell the agent to re-verify on every recall.
  - Agents are asked to reply to a message only when it needs an answer.
    "Respond to these now" made agents answer each other's
    acknowledgements, each reply waking the other side for another paid turn.
  - References to a command that doesn't exist and to removed scripts are
    gone; a test now checks every command the mesh primer names.

## Re-running

See `ai-maestro-plugins/evals/README.md`. A run of the suite costs about $2 at
list price.
