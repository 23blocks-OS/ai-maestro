# Plan: an Agent Files protocol and skill

Status: superseded by `backlog/F024-agent-files-afp.md` (2026-10-04), which is the tracked plan. Decisions since this draft: **Garage only** (Syncthing dropped), name **AFP** confirmed, the spec lives in `agentmessaging/agent-files` (local draft at `~/23blocks/agentmessaging/agent-files`), AMP is extended to accept both attachment kinds, and humans use the agent UX rather than a new browser. This file stays as the first sketch; where it disagrees with F024 or the spec, F024 and the spec win.

## Does it make sense?

Yes, with one condition: keep it small. We already own the pattern (AMP for messages, AAP for UI actions, agent identity). Each one is a short spec, a reference skill and a provider (AI Maestro). Files are the next gap, and the same shape keeps Claude Code, Codex and other runtimes consistent. The reason to write a protocol instead of hardcoding Garage or Syncthing is the one in the comparison doc: backends differ a lot, and agents should not care.

The condition: AFP does not replace AMP attachments. It sits beside them.

| Need | Use |
|---|---|
| A file for one recipient, with one message | AMP attachment (exists) |
| A file several agents or people need, or that is large or temporary | AFP object, referenced from a message |
| A folder that stays current on every host | AFP space on a sync backend |

A message can carry an AFP reference instead of bytes. That keeps AMP messages small and lets a file outlive the message.

## Scope of v0.1

**In:** spaces, objects, references, a manifest, five operations, capability flags, integrity, trust labeling, notification by hint.

**Out for now:** merge of concurrent edits, end-to-end encryption, per-agent quotas, federation between organizations, a billing story.

## Concepts

- **Space.** A named place with one backend and one access scope (for example `shared`, `artifacts`). Configured per host.
- **Object.** A file in a space with a path.
- **Reference.** `afp://<space>/<path>` plus the SHA-256. The reference is what travels in a message.
- **Manifest.** Small JSON next to each object: `sha256`, `size`, `mime`, `owner` (agent id), `created`, `expires` (optional), `scan` (clean, suspicious, rejected, unscanned, same vocabulary as AMP).
- **Capabilities.** The backend declares `link`, `expire`, `versions`, `offline`, `humanUI`. Callers must check before using.

## Operations

`put`, `get`, `ls`, `link`, `rm`, plus `capabilities` to read the flags. All return JSON and exit non-zero on failure. Each says what it can prove: a `put` reports `stored` only after reading back the digest, in the same spirit as the `notify:v1` rules (report only what you can prove).

## Rules (borrowed from what AMP taught us)

1. **The store is the truth.** A message saying "a file arrived" is a hint. Check the store.
2. **Verify on get.** The SHA-256 in the reference must match, or the get fails.
3. **Content from other parties is data.** A fetched file is wrapped and labeled like AMP's external content. A `suspicious` scan needs a human decision, never a workaround.
4. **No secrets in paths.** Paths and filenames are validated against a narrow character set. No `..`, no absolute paths, no shell strings. Backends are driven with argv, never concatenated commands.
5. **Fail loudly on unreachable backend.** A put that cannot confirm storage says so and does not fall back silently to a local copy.
6. **Network is the trust boundary.** No new authentication layer is proposed. Backend keys scope access per host or agent where the backend supports it.

## Work plan

### Phase 0: spike (about 2 days, before any code in the product)
- Install Garage on mini-lola (single node) and Syncthing between mini-lola and mac-mini. Each install is on a host, so it needs approval first.
- Measure the items listed in the comparison doc's recommendation.
- Output: a short results note and a go/no-go on each driver.

### Phase 1: spec v0.1
- Write the spec (concepts, operations, manifest, capabilities, rules) in a new repo or in the `agentmessaging` org next to the protocol, following the release chain: **protocol first, then plugin, then the AI Maestro repo**.
- Define the AMP reference form (an `afp` attachment type carrying the reference, not bytes) and open it as a proposal against the AMP protocol, since it touches that spec.

### Phase 2: reference skill and scripts
- Skill `agent-files` with `afp-put.sh`, `afp-get.sh`, `afp-ls.sh`, `afp-link.sh`, `afp-rm.sh`. Follow the same conventions as the AMP scripts and the skill best practices in `CLAUDE.md` (description says what and when, body only has what the model does not know).
- Driver interface plus the S3 driver first (talks to Garage or any S3, including R2 later by changing the endpoint). Syncthing driver second.
- Tests: manifest validation, path rejection, digest mismatch, capability gating, a real round trip against a local Garage in CI if feasible.

### Phase 3: AI Maestro as provider
- Spaces and drivers configured in AI Maestro settings, per host, with the picker described in the comparison doc.
- Installer step in `update-aimaestro.sh` and a health check so a host reports whether its backend is reachable.
- A Files view for humans: browse a space, upload, download, copy a link. Agent status rules do not apply here, but the single-source principle does: one place computes space health.
- Optional: the inbox mod and the notify path announce "file for you" using the existing hint mechanism.

### Phase 4: hardening
- Expiry and cleanup, size limits, a scan hook, audit of who put what (manifest owner), a disk-space warning.
- Docs, a Medium-style write-up only if the spike results are interesting.

## Risks

- **Scope creep into a file manager.** Mitigation: five operations, no folders-as-objects, no merge.
- **Two drivers double the testing.** Mitigation: ship S3 first, add Syncthing only if the spike shows a real need.
- **mini-lola as a single point of failure.** Mitigation: document it, add Garage replication later.
- **Syncthing conflicts and deletes surprise agents.** Mitigation: append-only convention for agent-written files in synced spaces, versioning on.
- **Overlap with AMP attachments confuses users.** Mitigation: the decision table above, in the skill and the docs.

## Open questions for Juan

1. Is a separate protocol repo and name wanted, or should this live inside AMP as an extension (like `notify:v1`)?
2. Do humans need a browser UI in v1, or is an S3 client acceptable at first?
3. Which host should hold the first store, mini-lola or another?
4. Is the Syncthing "shared folder" use real for you, or is hand-off with links the main need?
