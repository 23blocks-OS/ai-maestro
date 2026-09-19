# F002 — AWS Lambda MicroVM as an agent deployment mode

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-19

## Description

A fifth deployment mode alongside tmux, Docker, EC2 and ECS Fargate: run an agent
inside an **AWS Lambda MicroVM** — a container inside a Firecracker VM, booting
from a memory+disk snapshot, with suspend/resume, a dedicated TLS endpoint and
port-scoped auth tokens.

From `singledigit/microvm-dev-environment`, which runs Claude Code, Codex and Kiro
this way, one VM per user.

## Why It's Needed

It fills a slot none of our current modes do:

| mode | isolation | idle cost | start |
|---|---|---|---|
| tmux | none (same user) | zero | instant |
| Docker | container | low | seconds |
| EC2 | VM, always on | **full** | minutes |
| ECS Fargate | container, always on | full | ~a minute |
| **MicroVM** | **Firecracker, per tenant** | **suspended** | **snapshot resume** |

Strong isolation without paying for an idle VM. That is exactly the gap for
untrusted or per-customer work.

## Business Case

- **Per-customer isolation** is the thing an agency cannot offer today without
  running an EC2 box per client and paying for it around the clock.
- **Burst work** — a security scan, a migration, an experiment — wants a clean
  environment that disappears, not a long-lived host.
- Competitive: Superset and Conductor sell cloud workspaces. This is the same
  capability with genuine VM isolation underneath.

## Implementation Plan

**Two blockers to settle before any code.**

1. **The 8-hour lifetime ceiling contradicts the ownership model.** Our thesis is
   agents that persist for months and accumulate memory about what they own. A VM
   torn down every 8 hours does not house one. The S3-backed home survives; the
   running session does not.

   ⇒ Scope this as an **ephemeral sandbox mode**, not a home for a standing agent.
   A different product slot, and additive rather than redundant.

2. **Availability is unverified.** The skill frontmatter in that repo reads
   `stages: [preprod]`, and the docs tell you to check regional availability
   first. Neither was confirmable here without AWS credentials. **Verify GA status
   and regions before committing.**

Then, if it clears:

- `MicroVmImage` from a Dockerfile zip in S3 + a managed base image
- `RunMicroVm` per agent with an `idlePolicy` (`maxIdleDurationSeconds`,
  `autoResumeEnabled`)
- `CreateMicroVmAuthToken` (≤60 min, port-scoped) for the WebSocket
- Lifecycle hooks on `:9000` — `/run`, `/resume`, `/suspend`, `/ready`
- Terraform alongside the existing EC2/ECS modules

- Effort: **L**
- Depends on: F001 if the agent's home should persist between VMs
