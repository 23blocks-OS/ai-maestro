# emasoft-pr-checking-plugin

Three-phase PR review pipeline for Claude Code. Catches bugs that standard code audits miss by cross-referencing PR claims against actual implementation.

## Installation

Install from the `emasoft-plugins` marketplace:

```text
/install-plugin emasoft-plugins:emasoft-pr-checking-plugin
```

For local development, launch Claude Code with:

```bash
claude --use-plugin /path/to/emasoft-pr-checking-plugin
```

## Agents

| Agent | Role | Spawning |
|-------|------|----------|
| `epcp-code-correctness-agent` | Per-file correctness audit | Swarm (one per domain) |
| `epcp-claim-verification-agent` | PR claim vs code verification | Single instance |
| `epcp-skeptical-reviewer-agent` | Holistic external review | Single instance |

## Usage

Activate the `pr-review-pipeline` skill by asking Claude to review a PR:

```text
review PR 206
```

The skill orchestrates all 3 phases automatically and produces a merged report.

## Pipeline

1. **Phase 1** - Code correctness swarm (parallel, one agent per domain)
2. **Phase 2** - Claim verification (sequential, single agent)
3. **Phase 3** - Skeptical review (sequential, single agent)
4. **Phase 4** - Merge reports via `scripts/epcp-merge-reports.sh`
5. **Phase 5** - Present verdict to user

## License

MIT
