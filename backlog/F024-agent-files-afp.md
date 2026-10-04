# F024 — Agent Files Protocol (AFP) and the agent-files skill, backed by Garage

**Status:** Todo (spec drafted locally, nothing published or installed)
**Type:** Feature (cross-repo: protocol, plugin, AI Maestro)
**Created:** 2026-10-04

## Description

Give agents and people on any number of hosts one reliable way to share files, without mounted folders. Define an open protocol, **AFP (Agent Files Protocol)**, in the same family as AMP (messages), AAP (UI actions) and AID (identity). AI Maestro is the first provider. The reference backend is **Garage** (self-hosted, S3-compatible). Any S3-compatible store also works, so a user can run the store locally, on a VPS or cloud instance, or use a hosted S3 service.

Agents get one skill (`agent-files`) with five operations: `put`, `get`, `ls`, `link`, `rm`, plus `capabilities`. Files are named by reference (`afp://space/path` plus a SHA-256 digest). A message carries the reference, not the bytes. Humans use the agent UI (canvas, file viewer, directory explorer) and, if they want, Garage's own tooling or any S3 client. We do not build a separate browser app for them.

AMP is extended so an attachment can be either what it is today (`storage: provider`, the default) or an AFP reference (`storage: afp`). Existing messages and implementations are unaffected.

## Why It's Needed

- The shared-folder attempt failed: macOS drops mounted folders, and agents hang or error on a path that vanished.
- The web file server on mini-lola works for people, but agents on other hosts cannot use it. Only the host's own agent (lola) can write there.
- AMP attachments cover one file for one message (max 25 MB, expire with the message, nothing to browse later). They do not cover large files, files shared by several parties, files that must outlive a message, or files published for a person.
- Without a protocol, each runtime (Claude Code, Codex, others) and each tool invents its own way, and nothing interoperates. We have solved this before with AMP, AAP and AID.

## Decisions already made (2026-10-04)

- **Syncthing is out.** Researched and rejected. It suits a shared folder of small files with zero agent code, but it copies everything everywhere, deletes propagate, conflicts need a human, and it gives no link for a person outside the mesh. The comparison is kept in `docs/FILE-SHARING-SYNCTHING-VS-GARAGE.md` as the decision record.
- **Garage is the reference backend.** One small binary, S3 API, presigned links, lifecycle expiry, per-key permissions. It lacks versioning, quotas and S3 ACLs, and the protocol does not need them.
- **The store location is a deployment choice, not a protocol choice.** Local only (LAN or Tailscale), self-hosted in the cloud (VPS or instance behind TLS), a hosted S3-compatible service, or multi-node Garage. Details in `docs/AFP-DEPLOYMENT-OPTIONS.md`.
- **Name:** AFP. The domain is not acquired and is not needed now. The website is built but not published and has no CNAME.
- **AMP changes to support both** the current attachments and AFP references. Proposed as a PR to `agentmessaging/protocol`.
- **No browser for humans** in v1. Agent UX first. Humans can also use any S3 client or Garage's tools.
- **Security model unchanged:** no app-level auth; the network is the trust boundary on local setups. A store exposed to the internet needs scoped keys and TLS, and the spec says so. No auth proposals for AI Maestro itself.

## What exists now

- Spec v0.1 draft, committed locally (no remote yet): `~/23blocks/agentmessaging/agent-files` (README, spec/01 to 06: introduction, concepts, operations, backends, AMP integration, security).
- Comparison and plan docs in this repo: `docs/FILE-SHARING-SYNCTHING-VS-GARAGE.md`, `docs/AGENT-FILES-PROTOCOL-PLAN.md`, `docs/AFP-DEPLOYMENT-OPTIONS.md`.
- Local-only drafts, not pushed: the AMP spec change (worktree `~/23blocks/agentmessaging/protocol-afp-wt`, branch `spec/afp-attachments`) and the website (`~/23blocks/agentmessaging/afp-website`).
- **Blocked:** creating the public GitHub repos (`agentmessaging/agent-files`, `agentmessaging/afp-website`) was denied by the permission check. Needs the user to approve or run it.

## Work plan

### Phase 0: publish the drafts (needs user approval for each outward step)
1. Create `agentmessaging/agent-files` and `agentmessaging/afp-website` (public), push the local repos.
2. Push the AMP branch and open the PR against `agentmessaging/protocol`. Do not merge without the user.

### Phase 1: spike on real hosts (about 2 days, needs approval before installing on any host)
- Garage single-node on mini-lola over Tailscale. Measure: install time, upload and download for 1 MB and 500 MB, restart behavior, disk-full behavior, behavior when a Mac client sleeps, presigned link from outside the tailnet (expected to fail on local-only; that is the point of the cloud topology).
- Try one hosted S3-compatible service and one small VPS Garage to compare against the options doc.
- Output: a short results note and updates to `AFP-DEPLOYMENT-OPTIONS.md`. Fix the spec where reality disagrees.

### Phase 2: reference skill and scripts (plugin repo, then the builder)
- Skill `agent-files`: `afp-put.sh`, `afp-get.sh`, `afp-ls.sh`, `afp-link.sh`, `afp-rm.sh`, `afp-capabilities.sh`. JSON in, JSON out. Argv only (no shell strings), path and space validation before any request, digest check on every get, `stored` only after read-back, `unreachable` reported not hidden.
- Home for the scripts: a repo in the agentmessaging org beside `claude-plugin`, pulled by the plugin builder at `ref: main` (like the AMP scripts). Or `plugin/src/` if we decide it is AI Maestro only. Decide in the spike.
- Tests: manifest validation, path rejection (including `%2F`), digest mismatch, capability gating, a real round trip against a Garage container in CI if feasible.
- Release chain: protocol, then plugin (bump `plugin.manifest.json` and `.claude-plugin/marketplace.json`), then the AI Maestro repo.

### Phase 3: AI Maestro as provider
- Settings: spaces and their endpoint and keys, per host, with a store health check. Garage install helper in `update-aimaestro.sh` (optional, off by default).
- Agent UX: use the existing canvas, file viewer and directory explorer to browse a space, open a file, upload, download, copy a link. No separate file browser.
- AMP: send and receive `storage: afp` attachments. A message announcing a file is a hint (follow `notify:v1`); the store is the truth. The inbox mod and notices say "file for you" without including content.
- One place computes space health, same single-source principle as agent status.

### Phase 4: hardening
- Expiry and cleanup, size limits, a scan hook (manifest `scan`), an audit of who put what, disk-space and key-expiry warnings, backups guidance, key rotation.
- Docs and, only if the spike is interesting, a write-up.

## Risks and open questions

- **Overlap with AMP attachments confuses users.** Mitigation: a short decision table in the skill and docs (one file for one message under 25 MB: attachment; anything else: AFP).
- **Single point of failure.** One Garage host going down stops file access. Mitigation: documented, replication later, hosted option.
- **Internet-exposed stores change the trust model.** Scoped keys, TLS, short presigned links, and documentation. Not a reason to add app-level auth.
- **Scope creep into a file manager.** Mitigation: five operations, no folders as objects, no merge, no versions in v0.1.
- **Garage lacks versioning,** so an overwrite is final. Objects are immutable by convention, and `put` refuses to overwrite without `force`.
- **No end-to-end encryption in v0.1.** The store operator can read objects. Fine for local; call it out for cloud stores.
- **Cross-host key distribution.** How a new host or agent gets its access key. Decide in Phase 3 (likely host config plus per-agent scope).
- **Open:** a separate skill repo or `plugin/src/`? Does a hosted-S3 space need capability probing at setup? Should `endpoint` be advertised via AMP provider info?
- Not verified: Garage behavior under restart and disk-full on our hosts, a good UI for Garage, how the S3 profile behaves with each hosted provider.

## Success criteria

- An agent on mac-mini puts a 500 MB file, a message carries the reference, an agent on mini-lola fetches it and the digest verifies, with no mounted folder involved.
- A human opens the same file from the agent UI without help.
- Killing the store makes `put` and `get` fail with `unreachable`, and nothing reports success.
- The same skill works unchanged against Garage local, Garage on a VPS and one hosted S3 service.

Effort: L overall (spec S, spike S, skill M, provider and UX M to L).

Sources and detail: `docs/AGENT-FILES-PROTOCOL-PLAN.md`, `docs/FILE-SHARING-SYNCTHING-VS-GARAGE.md`, `docs/AFP-DEPLOYMENT-OPTIONS.md`, the AFP spec repo.
