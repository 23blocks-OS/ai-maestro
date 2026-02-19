# EPCP Agent Validation Report

**Date:** 2026-02-15
**Plugin:** emasoft-pr-checking-plugin
**Directory:** ~/.claude/plugins/emasoft-pr-checking-plugin/agents/
**Validator:** claude-plugins-validation v1.3.6
**Username filter:** emanuelesabetta

## Summary

| Agent File | Score | CRITICAL | MAJOR | MINOR | INFO | PASSED |
|---|---|---|---|---|---|---|
| epcp-code-correctness-agent.md | 90/100 | 0 | 1 | 0 | 6 | 5 |
| epcp-claim-verification-agent.md | 90/100 | 0 | 1 | 0 | 6 | 5 |
| epcp-skeptical-reviewer-agent.md | 90/100 | 0 | 1 | 0 | 6 | 5 |

**Overall exit code:** 2 (MAJOR issues - should fix)

## MAJOR Issues (all 3 agents share the same issue)

- **No `<example>` blocks found (need at least 2)** -- Each agent file is missing example blocks showing how the agent should be invoked and what output it produces.

## INFO Notes (common to all 3 agents)

1. No `name` field in frontmatter (will use filename as name)
2. Description should indicate WHEN to invoke the agent (e.g., "Use when...")
3. Consider adding `use proactively` to encourage Claude to delegate automatically
4. No `tools` field (agent will inherit default tools)
5. No `model` field (agent will inherit parent model)
6. Consider adding structured sections (## Capabilities, ## Workflow, etc.)

## PASSED Checks (all 3 agents)

1. File is valid UTF-8
2. Valid YAML frontmatter
3. `description` field valid
4. `capabilities` field valid (5-6 capabilities each)
5. Role definition present (`You are...`)

## Recommendations

1. **Add 2+ `<example>` blocks** to each agent file showing input/output interaction patterns
2. Consider adding `name` field to frontmatter for explicit identity
3. Consider prefixing descriptions with "Use when..." for better auto-invocation
4. Consider adding structured sections (## Capabilities, ## Workflow, ## Output Format)
