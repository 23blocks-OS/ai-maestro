# File sharing for agents and humans: Syncthing vs Garage

**Decision (2026-10-04): Garage. Syncthing is out.** This document is kept as the decision record. The work continues in `backlog/F024-agent-files-afp.md`, `AGENT-FILES-PROTOCOL-PLAN.md` and `AFP-DEPLOYMENT-OPTIONS.md`.

Status: research, 2026-10-04. Nothing is installed or built. Items marked **(unverified)** came from search results or memory and were not tested on our hosts.

## The problem

Agents and people on several hosts (local Mac, mac-mini, mini-lola, leonidas) need to hand files to each other. The shared-folder attempt failed because macOS drops mounted network folders. Agents then hang or error on a path that has vanished. The mini-lola web file server works for people, but agents on other hosts cannot use it.

AMP already carries attachments with a SHA-256 digest and a scan verdict (`amp-send.sh --attach`, `amp-download.sh`). That covers a file sent to one recipient with one message. It does not cover a file that several agents and people need to find later, a large file, or a folder that stays current.

## The two candidates

### Syncthing: every machine keeps a local copy

Peer-to-peer folder sync. You pair devices, pick folders, and each device holds a full copy. Agents read and write ordinary local files and never know Syncthing exists.

Why people use it for agents:
- **Zero agent code.** The agent writes to `~/shared/x.md`. Nothing to teach it. Reported propagation between machines is about ten seconds ([gist](https://gist.github.com/MickaelV0/aba55c986ab6c04de8cf0e179fc1d03a)).
- **No mount to drop.** The folder is local, so the failure we hit cannot happen. If a host is offline for a day, it catches up when it returns.
- **No server, no open port, no cloud.** Works on networks you do not control ([Ferryman post](https://forum.syncthing.net/t/ferryman-using-a-synced-folder-as-the-coordination-channel-for-ai-agents/27092)).
- **Built-in versioning.** Staggered history in `.stversions` lets you restore an overwritten file.
- **Atomic writes.** An interrupted transfer does not leave a half file.

What goes wrong:
- **Conflicts.** Two edits to one file on two devices produce a `.sync-conflict-<date>-<device>` file. Syncthing does not merge. Someone has to notice and decide ([docs](https://docs.syncthing.net/users/syncing.html)). The Ferryman author avoids this by making every artifact append-only and hash-chained, so a conflict is visible rather than silent.
- **Everything everywhere.** A synced folder is a full copy on every device. A 5 GB file takes 5 GB on all of them.
- **Deletes propagate.** Delete on one host and it disappears from all (versioning softens this).
- **Not for databases or git.** The gist's advice: keep code in git, data in Syncthing, never sync `.git/` or SQLite files that several machines write.
- **Pairing effort.** Each device must approve each other device. With an introducer this is manageable, but it is a setup step per host and per human device.
- **Permissions are per folder, not per agent.** Anyone paired with the folder can read and write it. Send-only and receive-only modes help.
- **No link to hand someone.** There is no URL for a person outside the mesh. A human needs Syncthing on their own device. Android has an official app; iOS has none **(unverified)**.
- **Agent isolation.** Agents on one host share the host's synced folder unless we create a folder per agent.

### Garage: one object store, S3 API

A single Rust binary that stores objects and speaks the S3 API. Runs on 512 MB of RAM and has a single-node mode (`replication_factor = 1`) ([quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)). Replication across hosts is available later.

Strengths:
- **One source of truth.** Upload once, fetch from anywhere. No copy on hosts that do not need the file.
- **Large files and many files** are fine. Multipart upload is supported.
- **Presigned URLs** give a person or an outside tool a time-limited link with no account ([S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)).
- **Per-key, per-bucket permissions.** One key per host or per agent, scoped to a bucket.
- **Expiry rules.** Lifecycle expiration deletes temp files after N days.
- **Any S3 client works:** `rclone`, `aws s3`, Cyberduck, scripts, other products.
- **The license and project are alive.** MinIO archived its community repo in April 2026 ([source](https://sliplane.io/blog/minio-alternatives-for-s3-compatible-storage)), which is why Garage and SeaweedFS are the usual replacements.

Limits:
- **Agents need a tool.** An agent cannot just write a file. It must call an upload/download command, so we have to ship a skill.
- **No object versioning** yet, so an overwrite is final. No quotas. No S3 ACLs or bucket policies (it has its own permission model).
- **Humans need a client.** Garage serves static websites but has no file browser of its own. Third-party web UIs exist **(unverified)**.
- **A host is a single point of failure** until replication is set up. mini-lola would be that host.
- **Not offline-first.** A host cut off from the store has no copy of anything.

## Side by side

| | Syncthing | Garage |
|---|---|---|
| Model | Folder copy on every device | Central store, fetch on demand |
| Agent effort | None, plain files | Needs a skill or CLI |
| Offline host | Keeps working, catches up | No access until reconnected |
| Large files | Copied everywhere | Stored once |
| Concurrent edits | `.sync-conflict` files | Last write wins, no versions |
| Versioning | Yes (staggered) | No |
| Link for an outsider | No | Yes, presigned URL with expiry |
| Auto expiry of temp files | No | Yes, lifecycle rule |
| Per-agent access control | Per folder only | Per key per bucket |
| Human access | Syncthing app on each device | Any S3 client or a web UI |
| Setup per host | Install, pair, share folders | Install client, add a key |
| Central service to run | None | One (single point of failure) |
| Fits | Shared notes, memory, handoff files, small data | Artifacts, builds, exports, media, anything big or temporary |

## What people actually do, and what it means for us

The agent write-ups use Syncthing for **state**: markdown notes, shared memory, config, a coordination folder of small signed files. They do not use it for big artifacts, and they warn against it for code and databases. That matches the strengths above.

Garage solves a different job: handing over an artifact, giving a person a link, expiring temp files.

So the choice is less "which wins" than "which job." Our two jobs are:
1. **A shared place agents read and write without thinking** (notes, working files). Syncthing fits.
2. **Handing off or publishing a file** (build output, report, recording, something for a human). Garage fits.

If we must pick one, the deciding question is whether a fleet-wide shared folder or a hand-off with a link matters more. For the problem as stated (agents cannot reach mini-lola's file server, humans need links, files may be large), Garage is the better single choice. Syncthing is the better single choice only if agents mostly need an always-there folder of small files.

## Letting the user pick

This is feasible if the agent-facing interface does not depend on the backend. Define a small set of operations and implement each backend as a driver:

| Operation | Syncthing driver | Garage (S3) driver |
|---|---|---|
| `put <file> [--space S] [--ttl]` | Copy into the synced folder, write a manifest | Upload object, write manifest object |
| `get <ref> [--dest]` | Read the local path (already there) | Download, verify SHA-256 |
| `ls [--space S]` | List the local folder | List objects |
| `link <ref> [--ttl]` | Not supported | Presigned URL |
| `rm <ref>` | Delete (propagates) | Delete |

Each driver declares capabilities: `link`, `expire`, `versions`, `offline`, `humanUI`. The skill tells the agent what the active backend can do, so an agent never promises a link on a backend that cannot make one.

A host or a space chooses its driver in config. One AI Maestro install could run both: a `shared` space on Syncthing and an `artifacts` space on Garage. The picker is then per space, not global.

Costs of offering the choice: two drivers to test and keep working, and a capability matrix the docs and the UI must explain. The first release can ship one driver and keep the interface open for the second.

## Recommendation

1. Define the interface first (see `AGENT-FILES-PROTOCOL-PLAN.md`).
2. Build the **Garage/S3 driver first**. It covers the stated problem, including humans and outside links.
3. Add a **Syncthing driver** second for the shared-folder job.
4. Before committing, run a two-day spike on mini-lola and mac-mini measuring: setup time per host, propagation or upload time for a 1 MB and a 500 MB file, behavior when a Mac sleeps, and whether a person can use it without help.

## Not verified

- Garage's behavior under restart, disk-full and sleeping-client conditions on our hosts.
- A good web UI for Garage and how hard it is to run.
- Syncthing on iOS and on mac-mini running headless under our node/pm2 setup.
- How well Syncthing handles dozens of per-agent folders on one host.
- Anything about pricing or limits of hosted alternatives such as Cloudflare R2 (left out of scope here).

## Sources

- [Syncthing + AI agents gist](https://gist.github.com/MickaelV0/aba55c986ab6c04de8cf0e179fc1d03a)
- [Ferryman: a synced folder as the coordination channel for AI agents](https://forum.syncthing.net/t/ferryman-using-a-synced-folder-as-the-coordination-channel-for-ai-agents/27092)
- [Syncthing: Understanding synchronization](https://docs.syncthing.net/users/syncing.html)
- [Syncthing conflict resolution thread](https://forum.syncthing.net/t/how-does-conflict-resolution-work/15113)
- [Garage S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/)
- [Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)
- [MinIO alternatives 2026](https://sliplane.io/blog/minio-alternatives-for-s3-compatible-storage)
