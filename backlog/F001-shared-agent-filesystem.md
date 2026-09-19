# F001 — A shared filesystem agents and humans can both reach

**Status:** Todo
**Type:** Feature
**Created:** 2026-09-19

## Description

Today, moving a file between an agent on one machine and a human on another means
git, a mounted drive, or a manual copy. None of them fit: git is for versioned
source, not a screenshot or a PDF; mounted drives do not survive an agent moving
hosts; and the human ends up as the transport, which is the exact role AI Maestro
exists to remove.

The trigger was `singledigit/microvm-dev-environment`, which mounts each user's
home with:

```
mount -t s3files -o accesspoint=<id> <fs-id> /home/coder
```

**Amazon S3 Files** — a real filesystem type, EFS-like, S3-backed, with access
points scoped to a prefix (`/users/<cognito-sub>`). One filesystem, per-user
isolation, POSIX semantics, survives VM restart and resume.

That is the right shape: **a shared namespace, not another transfer mechanism.**

## Why It's Needed

We already have transfer and keep discovering it is not the same thing:

- **AMP attachments** (v0.38.0) move a file from agent A to agent B. Point to
  point, one hop, no shared view.
- **Agent transfer** clones an agent's repos to a new host. Whole-repo, one-time.
- **Uploads** (`~/.aimaestro/uploads/<agentId>/`) put a browser file on one host.

Every one of those answers "get this file to that agent". None answers "we are all
looking at the same directory". A standing team that owns products needs the
second, and a human working alongside them needs it more.

## Business Case

- **It is a daily tax.** The person running the fleet currently bridges files by
  hand across three machines. That is the bottleneck the product was built to
  remove, reappearing one layer down.
- **It makes the ownership model whole.** An agent that owns a product should own
  its artifacts — deliverables, screenshots, exports — not just its git repo.
- **Nothing in the benchmark has it.** Orca, Paseo, Superset and Conductor all
  assume one machine, so the question never arises for them. herdr aggregates
  machines but shares no storage. rDev has per-user persistence but one VM per
  user and no sharing between them. A shared agent namespace is unclaimed.

## Implementation Plan

**Evaluate before building — the obvious answer probably does not fit our topology.**

S3 Files mount targets live in a VPC. Our agents are on personal machines behind
Tailscale (a MacBook, a Linux box, a Mac Mini), so each host would need a network
path into that VPC, and `mount -t s3files` on macOS is unverified — rDev's stack
is Amazon Linux 2023 throughout. **Do not assume it mounts on a Mac.**

Options, cheapest first:

| option | works off-AWS | POSIX | notes |
|---|---|---|---|
| `mountpoint-s3` (FUSE) | yes | partial | read-optimised, weak on random writes and rename |
| `rclone mount` | yes | partial | mature, same write caveats |
| Syncthing over Tailscale | yes | full | real sync, conflict files, no single source of truth |
| S3 Files + VPC path | needs VPN into VPC | yes | rDev's approach; best inside AWS, heaviest outside |
| AI Maestro shared-drive API over the existing mesh | yes | no | we already have the mesh, auth and host registry |

The last row deserves a serious look before reaching for AWS: we already run a peer
mesh with host identity and an API surface. A `/api/agents/:id/files` namespace
plus a small FUSE or sync client may serve the actual need — "agents and humans see
the same folder" — without a cloud dependency or a VPN.

- Effort: **L** (spike first: M)
- Risks: write semantics under FUSE; conflict handling; who owns a file an agent
  and a human edit at once
- Open question: is the unit of sharing the **agent**, the **team**, or the
  **product**? The ownership model says product, and nothing today is keyed that way.
