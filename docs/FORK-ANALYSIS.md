# Fork Analysis: swickson/ai-maestro vs 23blocks-OS/ai-maestro

**Date:** 2026-05-12
**Fork:** swickson/ai-maestro
**Upstream:** 23blocks-OS/ai-maestro
**Total PRs analyzed:** 87

This document catalogs every substantive PR in the swickson fork that has NOT been merged upstream. PRs are grouped by theme, with dependency chains and merge-priority noted.

---

## Table of Contents

1. [Cloud Agent / Docker Infrastructure (~40 PRs)](#1-cloud-agent--docker-infrastructure)
2. [AMP Attachments (7 PRs)](#2-amp-attachments)
3. [Meeting Improvements (7 PRs)](#3-meeting-improvements)
4. [Mesh/Host Resilience (6 PRs)](#4-meshhost-resilience)
5. [Multi-Provider / Gemini / Codex (included in Cloud Agent)](#5-multi-provider)
6. [Agent Wake Hooks (2 PRs)](#6-agent-wake-hooks)
7. [General Bug Fixes (5 PRs)](#7-general-bug-fixes)
8. [Documentation (12 PRs)](#8-documentation)
9. [Merge Strategy Recommendations](#9-merge-strategy-recommendations)

---

## 1. Cloud Agent / Docker Infrastructure

This is the largest and most impactful group. It implements the full lifecycle for running AI agents inside Docker containers ("cloud agents"), including creation, heartbeat monitoring, terminal proxying, AMP messaging, authentication bootstrapping, and chat integration.

### Dependency Chain

```
#56 (cloud-wake dispatch)
  -> #58 (sandbox.mounts schema)
    -> #62 (heartbeat-up online status)
      -> #63 (heartbeat before docker in discovery)
        -> #64 (terminal pipe via server.mjs)
          -> #65 (agent name vs UUID routing)
            -> #68 (dashboard renders cloud agents online)
              -> #79 (AMP auto-wiring into docker-create)
                -> #80 (hibernate stops container)
                  -> #81 (locale-gen + multi-runtime CLI)
                    -> #83 (server-side AMP identity bootstrap)
                      -> #86 (bootstrap writes to correct tree)
                        -> #87 (drop wholesale ~/.claude mount)
                          -> #88 (clear heartbeat on hibernate)
                            -> #89 (python3-venv in image)
                              -> #90 (wake replays on-wake hook)
                                -> #91 (sudo + uv + cpython 3.12)
                                  -> #92 (uv to /usr/local/bin)
                                    -> #93 (atomic /recreate endpoint)
                                      -> #96 (claude/gh persistence across recreate)
                                        -> #97 (skip bypass-permissions prompt)
                                          -> #98 (shell-helpers AIMAESTRO_HOST_URL)
                                            -> #100 (CI=true in image)
                                              -> #101 (UUID uniqueness in createAgent)
                                                -> #102 (per-program provisioning seeds)
                                                  -> #103 (operator-driven auth bootstrap)
                                                    -> #104 (seedFromHostFile empty {} fix)
                                                      -> #105 (invert ownership for seedFromHostFile)
                                                        -> #108 (gemini OAuth bootstrap)
                                                          -> #109 (hard-delete tears down container)
                                                            -> #112 (gemini config staleness guard)
                                                              -> #115 (sendKeysToAgent primitive)
                                                                -> #116 (hook resolves maestro host URL)
                                                                  -> #117 (unset CI + defer PTY spawn)
                                                                    -> #118 (meeting CLIs in containers)
                                                                      -> #120 (claude-home.json staleness)
                                                                        -> #121 (reseed pre-#97 agents)
                                                                          -> #129 (cloud-chat readiness gates)
                                                                            -> #130 (JSONL + chat-state bind-mounts)
                                                                              -> #131 (migrate chat dirs on recreate)
                                                                                -> #132 (Gemini conversation JSONL)
```

### PR Details

---

#### PR #58 - feat(sandbox): add sandbox.mounts[] schema + docker plumbing (v0.30.11)
- **Merged:** 2026-04-25
- **Size:** +242/-9, 11 files
- **What it does:** Adds `SandboxMount` and `SandboxConfig` types to `AgentDeployment`. Plumbs mount validation (`validateMounts`) and flag building (`buildMountFlags`) into `createDockerAgent`. Cloud agents can declare host-to-container bind mounts at creation time beyond the hardcoded `/workspace`.
- **Files changed:** `types/agent.ts`, `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, `tests/agent-registry.test.ts`, version files
- **Dependencies:** Builds on #56 (cloud-wake fix)
- **Risk:** Medium - new types added to `AgentDeployment` (additive, backward compatible). Validation includes shell-injection guards.
- **Priority:** CRITICAL - Foundation type for all subsequent cloud agent work

---

#### PR #62 - fix(cloud-agents): heartbeat-up so dashboard shows them online (v0.30.12)
- **Merged:** 2026-04-25
- **Size:** +62/-10, 10 files
- **What it does:** Cloud agents had no host tmux session and no heartbeat emitter, so `listAgents` reported them offline. Adds in-container heartbeat POSTs (every 60s) from `agent-server.js` to the host's `/api/agents/{id}/heartbeat`. Injects `AGENT_ID`, `AIMAESTRO_HOST_URL` env vars and `--add-host=host.docker.internal:host-gateway` into container creation. Adds `--restart unless-stopped` policy.
- **Files changed:** `agent-container/agent-server.js`, `services/agents-docker-service.ts`, `services/sessions-service.ts`, version files
- **Dependencies:** #58
- **Risk:** Medium - requires Docker 20.10+ on Linux for `host-gateway`. Needs image rebuild.
- **Priority:** CRITICAL - without this, cloud agents always appear offline

---

#### PR #63 - fix(sessions-discovery): heartbeat block before docker block (v0.30.13)
- **Merged:** 2026-04-25
- **Size:** +47/-40, 8 files
- **What it does:** Follow-up to #62. The docker discovery block in `sessions-service.ts` ran before the heartbeat-via-standalone block, winning the name-uniqueness race. Cloud agents got the docker block's stale shape (no `agentId`, no `standalone`). Fix: swap block order so heartbeat runs first.
- **Files changed:** `services/sessions-service.ts`, version files
- **Dependencies:** #62
- **Risk:** Low - block reorder only, no new logic
- **Priority:** CRITICAL - companion to #62

---

#### PR #64 - feat(server): cloud-agent terminal pipe via server.mjs (v0.30.14)
- **Merged:** 2026-04-25
- **Size:** +44/-12, 9 files
- **What it does:** Wires the in-container PTY WebSocket to the dashboard. When a WS connection comes in for a cloud agent, dispatches via `handleRemoteWorker(ws, sessionName, containerBaseUrl)`. Cloud agents get full-color, clickable terminal instead of greyed-out "Standalone Agent". Supports cross-host routing (two hops of the same helper).
- **Files changed:** `server.mjs`, `app/page.tsx`, version files
- **Dependencies:** #63
- **Risk:** Low - cloud branch only fires for `deployment.type === 'cloud'`. Non-cloud falls through unchanged.
- **Priority:** CRITICAL - enables interactive terminals for cloud agents

---

#### PR #65 - fix(cloud-agent-routing): use agent name (not UUID) as session identifier (v0.30.15)
- **Merged:** 2026-04-25
- **Size:** +26/-13, 9 files
- **What it does:** Dashboard sent agent UUID as `?name=` on `/term` WS, but in-container `AGENT_ID` was set to agent name. `agentToSession()` now falls back to `agent.name` for cloud agents. Server accepts either UUID or name on inbound.
- **Files changed:** `lib/agent-utils.ts`, `server.mjs`, version files
- **Dependencies:** #64
- **Risk:** Low
- **Priority:** CRITICAL - fixes terminal connection failures for cloud agents

---

#### PR #68 - fix(dashboard): cloud agents render online (not dim) in AgentList (v0.30.16)
- **Merged:** 2026-04-26
- **Size:** +32/-27, 9 files
- **What it does:** Sidebar `AgentList` and `AgentBadge` were reading `agent.sessions?.[0].status` (tmux-derived, always offline for cloud) instead of `agent.session?.status` (heartbeat-derived). Four reading sites switched.
- **Files changed:** `components/AgentList.tsx`, `components/AgentBadge.tsx`, version files
- **Dependencies:** #65
- **Risk:** Low - pure read-path change
- **Priority:** HIGH - visual correctness for cloud agents

---

#### PR #79 - feat(cloud-agent): auto-wire AMP into docker-create + jq base image (v0.30.18-20)
- **Merged:** 2026-04-26
- **Size:** +423/-37, 11 files
- **What it does:** Multi-version PR. Auto-injects AMP mounts (per-agent messaging dirs, `.local/bin` RO, `.claude`) and env vars (`CLAUDE_AGENT_ID`, `AMP_DIR`, `AMP_MAESTRO_URL`) into every cloud agent. Adds `extraEnv` to `DockerCreateRequest` with shell-injection validation. Pre-creates host-side AMP dirs. Adds `jq` and `openssl` to Dockerfile. Adds PATH env to include `.local/bin`.
- **Files changed:** `services/agents-docker-service.ts`, `agent-container/Dockerfile`, `docs/CLOUD-AGENTS.md`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #68
- **Risk:** Medium - image rebuild required. Adds multiple bind mounts.
- **Priority:** HIGH - enables AMP messaging for cloud agents

---

#### PR #80 - fix(cloud-agent): hibernate now actually stops the container (v0.30.22)
- **Merged:** 2026-04-26
- **Size:** +217/-9, 10 files
- **What it does:** `hibernateAgent` had no cloud-agent branch. It checked for host tmux (which doesn't exist for cloud agents), got false, took early-return, marked offline, but left the container running. Now adds cloud branch with `docker stop`. New `stopContainer` helper in `lib/container-utils.ts`.
- **Files changed:** `services/agents-core-service.ts`, `lib/container-utils.ts`, `tests/services/agents-core-service.test.ts`, version files
- **Dependencies:** #79
- **Risk:** Low - symmetric with existing wake cloud branch
- **Priority:** CRITICAL - without this, hibernate is a no-op for cloud agents

---

#### PR #81 - feat(agent-container): locale-gen + multi-runtime CLI install (v0.30.24)
- **Merged:** 2026-04-26
- **Size:** +50/-11, 8 files
- **What it does:** Dockerfile additions: locale-gen for `en_US.UTF-8`, terminal env vars (`TERM=xterm-256color`, `COLORTERM=truecolor`, `SHELL=/bin/zsh`), PATH bake. Replaces single `claude-code` npm install with multi-package install adding `@google/gemini-cli` and `@openai/codex`.
- **Files changed:** `agent-container/Dockerfile`, version files
- **Dependencies:** #80
- **Risk:** Medium - image rebuild required. Increases image size.
- **Priority:** HIGH - enables multi-provider cloud agents

---

#### PR #83 - feat(cloud-agent): server-side AMP identity bootstrap (v0.30.25)
- **Merged:** 2026-04-26
- **Size:** +114/-10, 9 files
- **What it does:** Bootstraps AMP identity server-side at cloud-agent create-time. Generates Ed25519 key pair, registers agent, writes keys and provider registration file. Failures are non-fatal.
- **Files changed:** `services/agents-docker-service.ts`, `services/amp-service.ts`, version files
- **Dependencies:** #81
- **Risk:** Low - non-fatal, skipped when organization not set up
- **Priority:** HIGH - cloud agents ship with working AMP identity

---

#### PR #86 - fix(cloud-agent): bootstrap writes keys/config/IDENTITY to messaging tree (v0.30.26)
- **Merged:** 2026-04-26
- **Size:** +79/-19, 8 files
- **What it does:** PR #83's `saveKeyPair` wrote to `~/.aimaestro/agents` (registry side) but amp-helper reads from `~/.agent-messaging/agents` (messaging side). Fixes three regressions: wrong key tree, wrong tenant in config.json, missing IDENTITY file.
- **Files changed:** `services/agents-docker-service.ts`, version files
- **Dependencies:** #83
- **Risk:** Low - fixes file write paths
- **Priority:** HIGH - companion fix to #83

---

#### PR #87 - fix(cloud-agent): drop wholesale ~/.claude mount, per-container settings.json (v0.30.27)
- **Merged:** 2026-04-26
- **Size:** +191/-22, 10 files
- **What it does:** Removes the `~/.claude` bind-mount from PR #79 (leaked host-absolute hook paths, exposed operator credentials). Replaces with per-container `settings.json` + hook snapshot. Pre-creates `.claude`, `.aimaestro`, `.agent-messaging` in image as claude-owned.
- **Files changed:** `services/agents-docker-service.ts`, `agent-container/Dockerfile`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #86
- **Risk:** Medium - security improvement. Image rebuild required.
- **Priority:** CRITICAL - security fix (credential exposure)

---

#### PR #88 - fix(cloud-agent): clear agentActivity heartbeat on hibernate (v0.30.28)
- **Merged:** 2026-04-26
- **Size:** +86/-8, 9 files
- **What it does:** Clears the in-memory `agentActivity` heartbeat map on hibernate so UI flips to offline immediately instead of waiting 120s for stale timestamp to age out.
- **Files changed:** `services/agents-core-service.ts`, `tests/services/agents-core-service.test.ts`, version files
- **Dependencies:** #87
- **Risk:** Low
- **Priority:** HIGH - UX improvement

---

#### PR #89 - feat(agent-container): bake python3-venv into apt layer (v0.30.29)
- **Merged:** 2026-04-28
- **Size:** +10/-9, 8 files
- **What it does:** Adds `python3-venv` to Dockerfile apt-get install list. Image-level capability.
- **Files changed:** `agent-container/Dockerfile`, version files
- **Dependencies:** #88
- **Risk:** Low - additive
- **Priority:** LOW - convenience for Python-using agents

---

#### PR #90 - fix(cloud-agent): wake replays on-wake hook + bake programArgs at create (v0.30.30)
- **Merged:** 2026-04-28
- **Size:** +296/-9, 11 files
- **What it does:** Cloud-agent wake branch early-returned after `startContainer`, never reaching the on-wake hook. `executeHook` used host-tmux which can't see in-container tmux. Adds `tmuxHasSessionInContainer`, `capturePaneFromContainer` helpers. `createDockerAgent` now bakes `programArgs` into the AI_TOOL env var.
- **Files changed:** `services/agents-core-service.ts`, `services/agents-docker-service.ts`, `lib/container-utils.ts`, `tests/services/agents-core-service.test.ts`, version files
- **Dependencies:** #89
- **Risk:** Medium - modifies wake flow
- **Priority:** HIGH - on-wake hooks are essential for agent autonomy

---

#### PR #91 - feat(agent-container): bake sudo + uv + cpython 3.12 (v0.30.31)
- **Merged:** 2026-04-28
- **Size:** +20/-10, 8 files
- **What it does:** Adds `sudo` binary (NOPASSWD policy already existed), `uv` (Astral Python tooling), and cpython 3.12 to the Docker image.
- **Files changed:** `agent-container/Dockerfile`, version files
- **Dependencies:** #90
- **Risk:** Low - additive
- **Priority:** LOW - dev tooling convenience

---

#### PR #92 - fix(agent-container): install uv to /usr/local/bin (v0.30.32)
- **Merged:** 2026-04-28
- **Size:** +27/-18, 8 files
- **What it does:** Fixes uv being shadowed by the AMP CLI bind-mount of `~/.local/bin`. Moves uv install to `/usr/local/bin`.
- **Files changed:** `agent-container/Dockerfile`, version files
- **Dependencies:** #91
- **Risk:** Low
- **Priority:** LOW - companion fix to #91

---

#### PR #93 - feat(cloud-agent): atomic /api/agents/[id]/recreate (v0.30.33)
- **Merged:** 2026-04-28
- **Size:** +373/-12, 10 files
- **What it does:** New `POST /api/agents/[id]/recreate` endpoint that re-provisions a cloud agent's container while preserving ALL persisted config from registry (programArgs, model, mounts, label, avatar, hooks, tags, etc.). Stops+removes old container, creates new one from registry state.
- **Files changed:** `app/api/agents/[id]/recreate/route.ts` (new), `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #92
- **Risk:** Medium - new API endpoint. Docker stop+rm is destructive but intentional.
- **Priority:** HIGH - critical for container lifecycle management

---

#### PR #96 - feat(cloud-agent): per-agent claude/gh state persistence across /recreate (v0.30.36)
- **Merged:** 2026-04-29
- **Size:** +398/-18, 10 files
- **What it does:** Claude OAuth, gh auth, and onboarding state persist across `/recreate`'s UUID rotation. Four new bind mounts: `claude-home.json`, `claude-credentials.json`, `gh-config/`, `shell-helpers`. `migrateAgentPersistence(from, to)` helper bridges UUID rotation. Bakes `gh` CLI into Docker image.
- **Files changed:** `services/agents-docker-service.ts`, `agent-container/Dockerfile`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #93
- **Risk:** Medium - image rebuild required. New persistence logic.
- **Priority:** HIGH - prevents auth loss on recreate

---

#### PR #97 - fix(cloud-agent): skip bypass-permissions prompt across recreate (v0.30.37)
- **Merged:** 2026-04-29
- **Size:** +39/-11, 9 files
- **What it does:** Seeds `skipDangerousModePermissionPrompt: true` into per-agent `settings.json` for cloud agents launched with `--dangerously-skip-permissions`.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #96
- **Risk:** Low - cloud containers ARE the documented isolated environment for bypass mode
- **Priority:** HIGH - prevents UX friction on every container start

---

#### PR #98 - fix(shell-helpers): cloud-agent containers respect AIMAESTRO_HOST_URL (v0.30.38)
- **Merged:** 2026-04-29
- **Size:** +23/-10, 8 files
- **What it does:** `common.sh:_init_self_host()` probed `localhost:23000` which inside containers is the container's own `agent-server.js`, not the dashboard. Now checks `AIMAESTRO_HOST_URL` env var first.
- **Files changed:** `scripts/shell-helpers/common.sh`, version files
- **Dependencies:** #97
- **Risk:** Low
- **Priority:** HIGH - enables CLI scripts inside cloud agents

---

#### PR #100 - fix(cloud-agent): bake CI=true into image (v0.30.39)
- **Merged:** 2026-04-30
- **Size:** +19/-8, 8 files
- **What it does:** `ENV CI=true` in Dockerfile. Prevents vitest and other tools from defaulting to watch mode inside cloud agents.
- **Files changed:** `agent-container/Dockerfile`, version files
- **Dependencies:** #98
- **Risk:** Low - note: later partially reverted by #117 (unset CI before AI_TOOL launch)
- **Priority:** MEDIUM

---

#### PR #101 - fix(agent-registry): enforce UUID uniqueness in createAgent (v0.30.40)
- **Merged:** 2026-05-01
- **Size:** +38/-9, 9 files
- **What it does:** `createAgent` only enforced name uniqueness, not id uniqueness. Caller-supplied UUIDs could produce duplicate-UUID phantom rows. Now rejects with 409 on UUID collision.
- **Files changed:** `lib/agent-registry.ts`, `tests/agent-registry.test.ts`, version files
- **Dependencies:** #100
- **Risk:** Low - additive validation
- **Priority:** HIGH - data integrity fix

---

#### PR #102 - fix(cloud-agent): consolidated per-program provisioning seeds (v0.30.41)
- **Merged:** 2026-05-01
- **Size:** +331/-25, 10 files
- **What it does:** Eliminates first-run blockers per-program: Claude dark theme seed, Gemini workspace trust + auto-update disable, Codex update-modal suppress.
- **Files changed:** `services/agents-docker-service.ts`, `agent-container/Dockerfile`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #101
- **Risk:** Low - provisioning seeds are conservative defaults
- **Priority:** MEDIUM - UX polish

---

#### PR #103 - fix(cloud-agent): operator-driven auth bootstrap (claude OAuth + codex Device Code) (v0.30.42)
- **Merged:** 2026-05-01
- **Size:** +367/-23, 2 files
- **What it does:** Operator runs `claude /login` and `codex login` once on host; every subsequent cloud-agent create inherits credentials. Per-agent copy (not shared mount) preserves independent rotation.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`
- **Dependencies:** #102
- **Risk:** Low - credentials are copied, not shared. Falls back gracefully.
- **Priority:** HIGH - eliminates manual auth per-agent

---

#### PR #104 - fix(cloud-agent): seedFromHostFile re-bootstraps when dest holds empty {} (v0.30.44)
- **Merged:** 2026-05-01
- **Size:** +68/-13, 9 files
- **What it does:** Agents created before operator auth had empty `{}` placeholders that blocked re-bootstrap. `seedFromHostFile` now treats `{}` / empty as "not yet bootstrapped".
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #103
- **Risk:** Low
- **Priority:** HIGH - fixes auth bootstrap for pre-existing agents

---

#### PR #105 - fix(cloud-agent): invert ownership so seedFromHostFile fires on /recreate (v0.30.45)
- **Merged:** 2026-05-01
- **Size:** +110/-31, 9 files
- **What it does:** Outer `existsSync` guard in provisioning functions short-circuited before `seedFromHostFile` was called. Inverts ownership: `seedFromHostFile` fully owns dest-existence semantics.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #104
- **Risk:** Low - companion fix
- **Priority:** HIGH - makes #104 actually work on /recreate

---

#### PR #108 - fix(cloud-agent): operator-driven gemini OAuth bootstrap (v0.30.48)
- **Merged:** 2026-05-02
- **Size:** +229/-9, 9 files
- **What it does:** Third program in auth-bootstrap series. Copies host `~/.gemini/oauth_creds.json` into per-agent dir. Completes parity: all three CLIs (claude/codex/gemini) follow one consistent operator-driven bootstrap pattern.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #105
- **Risk:** Low
- **Priority:** MEDIUM - Gemini-specific

---

#### PR #109 - fix(cloud-agent): hard-delete tears down container (v0.30.49)
- **Merged:** 2026-05-03
- **Size:** +283/-21, 12 files
- **What it does:** `DELETE /api/agents/{id}?hard=true` was clearing registry but leaving container running. Adds cloud teardown branch: `docker stop` + `docker rm` before registry wipe. New `removeContainer` helper. Clears heartbeat on delete.
- **Files changed:** `services/agents-core-service.ts`, `lib/container-utils.ts`, `app/api/agents/[id]/route.ts`, `tests/services/agents-core-service.test.ts`, `tests/container-utils.test.ts`, version files
- **Dependencies:** #108
- **Risk:** Low - mirrors hibernate cloud branch
- **Priority:** CRITICAL - resource leak fix

---

#### PR #112 - fix(cloud-agent): shape-aware staleness for gemini config (v0.30.52)
- **Merged:** 2026-05-03
- **Size:** +187/-22, 9 files
- **What it does:** On `/recreate`, `migrateAgentPersistence` carries stale-shape `gemini-settings.json` lacking `security.auth.selectedType`. Provisioning's `existsSync` short-circuits. Fix: parses existing file and minimal-merges missing fields.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #109
- **Risk:** Low
- **Priority:** MEDIUM - Gemini recreate edge case

---

#### PR #115 - fix(cloud-agent): extract sendKeysToAgent primitive (v0.30.54)
- **Merged:** 2026-05-05
- **Size:** +353/-95, 13 files
- **What it does:** Three callers were manually re-deriving cloud-vs-host send-keys dispatch. Extracts `sendKeysToAgent` primitive into `services/send-keys-to-agent.ts`. Centralizes the bug class. Migrates 4 callers: `sendChatMessage`, `triggerMeetingAgents`, `injectMeetingPrompt`, `notifyAgent`.
- **Files changed:** `services/send-keys-to-agent.ts` (new), `services/agents-chat-service.ts`, `services/messages-service.ts`, `app/api/meetings/[id]/chat/route.ts`, `tests/services/send-keys-to-agent.test.ts` (new), `tests/services/agents-chat-service.test.ts`, version files
- **Dependencies:** #112
- **Risk:** Medium - refactors multiple callers
- **Priority:** HIGH - architectural improvement, prevents future cloud-agent dispatch bugs

---

#### PR #116 - fix(cloud-agent): hook resolves maestro host URL (v0.30.55)
- **Merged:** 2026-05-05
- **Size:** +44/-21, 8 files
- **What it does:** Claude hooks (`ai-maestro-hook.cjs`) had 6 hardcoded `localhost:23000` fetch URLs. Inside cloud containers, localhost is the container itself. Now resolves from `AIMAESTRO_HOST_URL` || `AMP_MAESTRO_URL` env vars.
- **Files changed:** `scripts/claude-hooks/ai-maestro-hook.cjs`, version files
- **Dependencies:** #115
- **Risk:** Low - backward compatible (falls back to localhost)
- **Priority:** HIGH - critical for hook functionality in cloud agents

---

#### PR #117 - fix(cloud-agent): unset CI before AI_TOOL + defer PTY spawn (v0.30.56)
- **Merged:** 2026-05-06
- **Size:** +149/-75, 8 files
- **What it does:** `CI=true` from PR #100 caused gemini-cli to exit to bash and claude to degrade to basic colors at runtime. Fix: `unset CI &&` before AI_TOOL launch. Build-time CI stays for build steps. Also defers PTY spawn until first WS resize event for correct terminal dimensions.
- **Files changed:** `agent-container/agent-server.js`, version files
- **Dependencies:** #116
- **Risk:** Medium - modifies agent-server.js startup flow
- **Priority:** HIGH - fixes runtime breakage from PR #100

---

#### PR #118 - fix(cloud-agent): provision meeting CLIs into containers (v0.30.57)
- **Merged:** 2026-05-06
- **Size:** +59/-18, 9 files
- **What it does:** Cloud agents had only `meeting-send.sh` (some hosts); `meeting-task.sh` was universally absent. Adds RO bind-mount of repo `scripts/` dir and prepends to CONTAINER_PATH.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #117
- **Risk:** Low
- **Priority:** MEDIUM - enables meeting participation from cloud agents

---

#### PR #120 - fix(cloud-agent): shape-aware staleness for claude-home.json (v0.30.59)
- **Merged:** 2026-05-06
- **Size:** +100/-13, 9 files
- **What it does:** Same pattern as PR #112 but for `claude-home.json`. Predecessor's file pre-dates the `theme=dark` seed. Injects `theme: 'dark'` only if missing, preserves all other operator state.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #118
- **Risk:** Low
- **Priority:** LOW - cosmetic edge case on recreate

---

#### PR #121 - feat(scripts): reseed pre-PR-#97 cloud agents (v0.30.60)
- **Merged:** 2026-05-06
- **Size:** +303/-8, 9 files
- **What it does:** One-shot, idempotent script that reseeds `skipDangerousModePermissionPrompt: true` into pre-PR-#97 cloud agent settings files.
- **Files changed:** `scripts/reseed-skip-dangerous-mode.cjs` (new), `tests/reseed-skip-dangerous-mode.test.ts` (new), version files
- **Dependencies:** #120
- **Risk:** Low - read-modify-write only on cloud agent settings
- **Priority:** LOW - migration utility

---

#### PR #129 - fix(cloud-chat): pre-dispatch gates use agentSessionReady (v0.30.69)
- **Merged:** 2026-05-11
- **Size:** +50/-14, 10 files
- **What it does:** Chat panel showed "Offline" for cloud agents because `agent.sessions?.some(s => s.status === 'online')` reads host-tmux-enumerated status. Switches to `agent.session?.status` (heartbeat-derived) for readiness checks.
- **Files changed:** `services/agents-chat-service.ts`, `components/ChatView.tsx`, `tests/services/agents-chat-service.test.ts`, version files
- **Dependencies:** #121
- **Risk:** Low
- **Priority:** HIGH - enables chat for cloud agents

---

#### PR #130 - fix(cloud-agent): per-agent JSONL + chat-state bind-mounts (v0.30.70)
- **Merged:** 2026-05-11
- **Size:** +315/-36, 13 files
- **What it does:** Chat panel was empty for cloud agents because `getConversationMessages` reads from `~/.claude/projects/` on host, but Claude inside container writes to a different path. Adds two per-agent bind mounts to expose container conversation state to host. Three callsites branch on `deployment.type === 'cloud'`. New `lib/agent-paths.ts` for path resolution.
- **Files changed:** `services/agents-chat-service.ts`, `services/agents-docker-service.ts`, `lib/agent-paths.ts` (new), `lib/container-utils.ts`, `tests/agent-paths.test.ts` (new), `tests/container-utils.test.ts`, version files
- **Dependencies:** #129
- **Risk:** Medium - new bind mounts, new path resolution logic
- **Priority:** HIGH - enables reading chat history for cloud agents

---

#### PR #131 - fix(cloud-agent): migrateAgentPersistence carries chat dirs on recreate (v0.30.71)
- **Merged:** 2026-05-11
- **Size:** +65/-18, 9 files
- **What it does:** PR #130's two new directory mounts weren't in `migrateAgentPersistence`'s asset list. Adds `claude-projects` and `chat-state` to `dirAssets` alongside `gh-config`.
- **Files changed:** `services/agents-docker-service.ts`, `tests/services/agents-docker-service.test.ts`, version files
- **Dependencies:** #130
- **Risk:** Low
- **Priority:** MEDIUM - preserves chat history across recreate

---

#### PR #132 - feat(cloud-agent): Gemini conversation JSONL + normalize-on-read (v0.30.72)
- **Merged:** 2026-05-11
- **Size:** +317/-28, 8 files
- **What it does:** Extends cloud-agent chat support from Claude-only to Gemini. Gemini writes JSONL to a different path with different message shape. Adds Gemini resolver row, bind-mount, and `lib/gemini-message-normalizer.ts` for service-layer normalization.
- **Files changed:** `lib/agent-paths.ts`, `lib/container-utils.ts`, `lib/gemini-message-normalizer.ts` (new), `services/agents-chat-service.ts`, `services/agents-docker-service.ts`, `tests/agent-paths.test.ts`, `tests/gemini-message-normalizer.test.ts` (new), `tests/services/agents-docker-service.test.ts`
- **Dependencies:** #131
- **Risk:** Medium - cross-provider normalization
- **Priority:** MEDIUM - Gemini-specific

---

## 2. AMP Attachments

Implements the AMP attachment spec (issue #48): upload, download, confirm, signed URLs, and cross-host delivery.

### Dependency Chain

```
#114 (canonical JSON for signing) - precursor
  -> #119 (attachment endpoints)
    -> #122 (att_id format fix)
      -> #123 (preserve attachments through inbox writes)
        -> #124 (GET /attachments/[id] alias)
          -> #125 (signed URLs use getSelfHost)
            -> #127 (signature test vectors)
            -> #128 (hard-reject legacy attachment shape)
```

### PR Details

---

#### PR #119 - feat(amp): implement attachment endpoints (v0.30.58)
- **Merged:** 2026-05-06
- **Size:** +1001/-10, 18 files
- **What it does:** Implements 5 AMP attachment spec endpoints: `POST /upload` (initiate), `PUT /[id]` (binary upload with signed URL), `POST /[id]/confirm` (finalize with MIME sniff + executable rejection), `GET /[id]/status` (poll with signed download URL), `GET /[id]/download` (signed download). New libs for filename sanitization, MIME detection, HMAC signing, and storage.
- **Files changed:** `app/api/v1/attachments/upload/route.ts`, `app/api/v1/attachments/[id]/route.ts`, `app/api/v1/attachments/[id]/confirm/route.ts`, `app/api/v1/attachments/[id]/download/route.ts`, `app/api/v1/attachments/[id]/status/route.ts`, `lib/attachment-filename.ts`, `lib/attachment-mime.ts`, `lib/attachment-signer.ts`, `lib/attachment-storage.ts`, `lib/types/amp.ts`, `tests/attachments.test.ts`, version files
- **Dependencies:** #114 (canonical JSON)
- **Risk:** Medium - new API surface. Includes security measures (MIME sniff, executable rejection, HMAC-signed URLs).
- **Priority:** HIGH - major AMP feature

---

#### PR #122 - fix(attachments): att_id format matches client regex (v0.30.62)
- **Merged:** 2026-05-06
- **Size:** +38/-13, 9 files
- **What it does:** Server-issued `att_id` format didn't match amp-helper client's validation regex. Client fell back to local-only delivery silently.
- **Files changed:** `lib/attachment-storage.ts`, `tests/attachments.test.ts`, version files
- **Dependencies:** #119
- **Risk:** Low
- **Priority:** CRITICAL - without this, attachments silently fail

---

#### PR #123 - fix(amp-inbox-writer): preserve payload.attachments (v0.30.63)
- **Merged:** 2026-05-06
- **Size:** +20/-10, 8 files
- **What it does:** `writeToAMPInbox` and `writeToAMPSent` explicitly reconstructed payload as `{ type, message, context }`, silently dropping `attachments`. Now preserves full payload.
- **Files changed:** `lib/amp-inbox-writer.ts`, version files
- **Dependencies:** #122
- **Risk:** Low
- **Priority:** CRITICAL - attachments were silently dropped from inbox

---

#### PR #124 - fix(attachments): GET /api/v1/attachments/[id] alias (v0.30.64)
- **Merged:** 2026-05-06
- **Size:** +57/-9, 8 files
- **What it does:** amp-helper polls `GET /api/v1/attachments/{id}` for scan_status but server only exported `PUT` on that route. Adds GET alias pointing to the status endpoint.
- **Files changed:** `app/api/v1/attachments/[id]/route.ts`, version files
- **Dependencies:** #123
- **Risk:** Low
- **Priority:** CRITICAL - unblocks amp-helper polling

---

#### PR #125 - fix(attachments): signed URLs use getSelfHost().url (v0.30.65)
- **Merged:** 2026-05-06
- **Size:** +25/-12, 10 files
- **What it does:** Signed download URLs had bind-address (0.0.0.0:23000) as host segment instead of canonical Tailscale URL. Cross-host downloads got wrong HMAC. Switches to `getSelfHost().url`.
- **Files changed:** `app/api/v1/attachments/upload/route.ts`, `app/api/v1/attachments/[id]/route.ts`, `app/api/v1/attachments/[id]/status/route.ts`, version files
- **Dependencies:** #124
- **Risk:** Low - depends on getSelfHost() working correctly
- **Priority:** CRITICAL - cross-host attachments broken without this

---

#### PR #127 - test(amp): pinned signature matrix for both attachment shapes (v0.30.67)
- **Merged:** 2026-05-09
- **Size:** +141/-9, 8 files
- **What it does:** Adds 3 pinned signature test vectors covering `AMPAttachmentLegacy` and `AMPAttachmentV1` shapes plus mixed-shape arrays. Guards against future `JSON.stringify` regressions.
- **Files changed:** `tests/amp-canonical-json.test.ts`, version files
- **Dependencies:** #125
- **Risk:** None - tests only
- **Priority:** MEDIUM - test coverage

---

#### PR #128 - feat(amp): federation hard-reject for AMPAttachmentLegacy (v0.30.68)
- **Merged:** 2026-05-09
- **Size:** +134/-8, 10 files
- **What it does:** Hard-rejects any AMP route payload containing `kind: 'legacy'` attachments at `POST /api/v1/route`. Returns 400 with deprecation log.
- **Files changed:** `services/amp-service.ts`, `services/service-errors.ts`, `tests/services/amp-service.test.ts`, version files
- **Dependencies:** #127
- **Risk:** Medium - breaking change for legacy attachment clients (but none exist internally)
- **Priority:** MEDIUM - protocol enforcement

---

## 3. Meeting Improvements

Enhancements to team meeting functionality: structured context injection, CLI tooling, copy-mode resilience, and UI improvements.

### Dependency Chain

```
#25 (additionalContext + wake-ping hybrid injection)
  -> #26 (meeting-task.sh CLI + kanban + avatar fix)
    -> #47 (resolve agent by env var)
      -> #50 (bracketed paste for non-Claude agents)

#94 (cancelCopyMode in chat + notify paths)
  -> #95 (cancelCopyMode handles command-prompt overlays)

#113 (chat focus-mode overlay) - independent
```

### PR Details

---

#### PR #25 - feat(meeting): additionalContext + wake-ping hybrid injection
- **Merged:** 2026-04-20
- **Size:** +258/-10, 13 files
- **What it does:** Migrates meeting injection from raw tmux send-keys to hybrid: server enqueues prompt as structured context, fires bare-Enter wake-ping. Agent's hook drains queue and delivers via `additionalContext` (Claude) or `systemMessage` (Codex/Gemini). Messages never touch a shell, fixing history-expansion metacharacter corruption. Gated by `MAESTRO_MEETING_CONTEXT_KINDS` env var.
- **Files changed:** `app/api/meetings/[id]/chat/route.ts`, `app/api/agents/notify/route.ts`, `app/api/meetings/inject-queue/route.ts` (new), `lib/meeting-inject-queue.ts` (new), `tests/meeting-inject-queue.test.ts` (new), version files
- **Dependencies:** None
- **Risk:** Medium - new injection mechanism, gated by env var
- **Priority:** HIGH - fixes data corruption in meetings with Gemini agents

---

#### PR #26 - fix: meeting-task.sh CLI + Kanban affordance + avatar-path strip
- **Merged:** 2026-04-20
- **Size:** +377/-10, 11 files
- **What it does:** Adds `scripts/meeting-task.sh` CLI wrapping `/api/teams/[id]/tasks` endpoints (create/update/move/list/delete). Adds kanban status affordance to meeting join-context. Strips avatar path prefix.
- **Files changed:** `scripts/meeting-task.sh` (new), `app/api/meetings/[id]/chat/route.ts`, `lib/meeting-inject-utils.ts` (new), `tests/meeting-inject-utils.test.ts` (new), version files
- **Dependencies:** #25
- **Risk:** Low - additive CLI tool
- **Priority:** MEDIUM - tooling for agent meeting participation

---

#### PR #47 - fix(hook): resolve agent by AIM_AGENT_ID/NAME env (v0.30.8)
- **Merged:** 2026-04-24
- **Size:** +41/-46, 8 files
- **What it does:** Meeting-inject drain was starving agents sharing a `workingDirectory`. `resolveAgent` now uses precedence: `AIM_AGENT_ID` env > `AIM_AGENT_NAME` env > cwd exact match (removed `startsWith` parent/child collateral).
- **Files changed:** `scripts/claude-hooks/ai-maestro-hook.cjs`, version files
- **Dependencies:** #26
- **Risk:** Low
- **Priority:** HIGH - fixes multi-agent meeting delivery

---

#### PR #50 - fix(meeting): wrap legacy send-keys as bracketed paste (v0.30.9)
- **Merged:** 2026-04-24
- **Size:** +71/-24, 11 files
- **What it does:** Non-Claude agents (Codex) absorbed the trailing Enter inside their paste-receive window. Fix: wraps body with `\x1b[200~` / `\x1b[201~` bracketed paste escape sequences.
- **Files changed:** `lib/meeting-inject-queue.ts`, `app/api/meetings/[id]/chat/route.ts`, `app/api/agents/notify/route.ts`, `tests/meeting-inject-queue.test.ts`, version files
- **Dependencies:** #47
- **Risk:** Low
- **Priority:** HIGH - fixes meeting chat for Codex agents

---

#### PR #94 - fix(meeting-chat): wire cancelCopyMode into chat + notify (v0.30.34)
- **Merged:** 2026-04-28
- **Size:** +285/-9, 12 files
- **What it does:** Three tmux-input callsites bypassed `cancelCopyMode` before sending keys. When pane was in copy-mode, send-keys hung indefinitely and dropped payload. Wires `runtime.cancelCopyMode` into chat + notify paths. Adds `cancelCopyModeInContainer` for cloud agents.
- **Files changed:** `services/agents-chat-service.ts`, `app/api/agents/notify/route.ts`, `lib/container-utils.ts`, `tests/container-utils.test.ts`, `tests/services/agents-chat-service.test.ts`, version files
- **Dependencies:** None (independent chain)
- **Risk:** Low
- **Priority:** HIGH - fixes silent message loss

---

#### PR #95 - fix(meeting-chat): cancelCopyMode handles command-prompt overlays (v0.30.35)
- **Merged:** 2026-04-29
- **Size:** +226/-20, 11 files
- **What it does:** When pane was in copy-mode with a command-prompt overlay (jump backward, search, etc.), `q` was consumed by the overlay. Fix: two-stage escape - `Escape` (close any overlay) then `q` (exit copy-mode).
- **Files changed:** `lib/agent-runtime.ts`, `lib/container-utils.ts`, `tests/agent-runtime.test.ts`, `tests/container-utils.test.ts`, version files
- **Dependencies:** #94
- **Risk:** Low
- **Priority:** HIGH - companion to #94

---

#### PR #113 - feat(meeting-ui): chat focus-mode overlay + readability (v0.30.53)
- **Merged:** 2026-05-05
- **Size:** +141/-16, 11 files
- **What it does:** Adds "Open in focus mode" toggle to meeting chat that pops chat into centered overlay covering the terminal slot. Right panel auto-switches to Tasks tab. `MeetingRoom` reducer gets `chatOpen` flag.
- **Files changed:** `components/team-meeting/MeetingChatPanel.tsx`, `components/team-meeting/MeetingRightPanel.tsx`, `components/team-meeting/MeetingRoom.tsx`, `types/team.ts`, version files
- **Dependencies:** None (independent)
- **Risk:** Low - UI-only
- **Priority:** MEDIUM - UX improvement

---

## 4. Mesh/Host Resilience

Fixes for multi-host mesh networking, hostname drift, Docker bridge IP conflicts, and registry hygiene.

### Dependency Chain

```
#1 (hostname drift) - independent
#4 (Docker bridge IPs) - independent
#10 (saveHostsToFile missing) - independent
#24 (hosts-config .mjs parity + onnxruntime pin) - depends on upstream PR #17
#106 (registry-sweep-audit) -> #107 (Tailscale IPs + fingerprint fix)
```

### PR Details

---

#### PR #1 - fix: hostname drift breaks mesh connectivity after reboot
- **Merged:** 2026-03-28
- **Size:** +15/-2, 2 files
- **What it does:** `normalizeHostId()` detects stale self-hostnames via `isSelf()` alias/IP matching and migrates them. `createSession()` unsets `TMUX` env to prevent stale parent socket errors after reboot.
- **Files changed:** `lib/agent-registry.ts`, `lib/agent-runtime.ts`
- **Dependencies:** None
- **Risk:** Low
- **Priority:** HIGH - fixes mesh breakage on hostname change

---

#### PR #4 - fix: exclude Docker bridge IPs from host identity detection
- **Merged:** 2026-03-29
- **Size:** +10/-3, 1 file
- **What it does:** `getLocalIPs()` skips Docker bridge IPs (172.16-31.x.x) which are identical on every Docker host. Fixes false `isSelf()` and duplicate host detection.
- **Files changed:** `lib/hosts-config.ts`
- **Dependencies:** None
- **Risk:** Low
- **Priority:** HIGH - fixes mesh identity collision with Docker hosts

---

#### PR #10 - fix: define saveHostsToFile in hosts-config-server.mjs
- **Merged:** 2026-04-11
- **Size:** +43/-0, 1 file
- **What it does:** `hosts-config-server.mjs` called `saveHostsToFile(validHosts)` from auto-hostname-migration but no such function existed. Build failed on any host where stored hostname != current hostname.
- **Files changed:** `lib/hosts-config-server.mjs`
- **Dependencies:** None
- **Risk:** Low
- **Priority:** HIGH - fixes build failure on hostname change

---

#### PR #24 - fix: hosts-config .mjs parity + onnxruntime-node pin
- **Merged:** 2026-04-20
- **Size:** +197/-25, 10 files
- **What it does:** Ports `storedSelfAliasesCache` + `loadStoredSelfAliases()` from `hosts-config.ts` to the `.mjs` twin. Bumps `onnxruntime-node` from 1.17.0 to 1.21.0 to match `@huggingface/transformers` transitive.
- **Files changed:** `lib/hosts-config-server.mjs`, `lib/hosts-config.ts`, `package.json`, `yarn.lock`, version files
- **Dependencies:** Related to upstream PR #17
- **Risk:** Medium - yarn.lock regeneration
- **Priority:** HIGH - fixes mesh + install

---

#### PR #106 - feat(scripts): registry-sweep-audit Phase 1 (v0.30.46)
- **Merged:** 2026-05-01
- **Size:** +402/-8, 8 files
- **What it does:** Read-only audit utility for cross-host agent registry hygiene. Identifies duplicate UUIDs, stale agents, soft-deleted records past retention.
- **Files changed:** `scripts/registry-sweep-audit.mjs` (new), version files
- **Dependencies:** None
- **Risk:** None - read-only
- **Priority:** MEDIUM - operational tooling

---

#### PR #107 - fix(scripts): registry-sweep-audit fixes (v0.30.47)
- **Merged:** 2026-05-01
- **Size:** +22/-11, 8 files
- **What it does:** Fixes two blockers: HOSTS array assumed localhost = Milo (now uses Tailscale IPs), fingerprint drifted on every heartbeat (now uses structural fingerprint excluding volatile fields).
- **Files changed:** `scripts/registry-sweep-audit.mjs`, version files
- **Dependencies:** #106
- **Risk:** None - tooling fix
- **Priority:** MEDIUM

---

## 5. Multi-Provider

Multi-provider support (Gemini/Codex) is embedded within the Cloud Agent group. Key PRs:
- **#81** - Multi-runtime CLI install in Dockerfile (gemini-cli, codex)
- **#102** - Per-program provisioning seeds (Gemini trust, Codex modal)
- **#103** - Operator-driven auth bootstrap (claude OAuth, codex Device Code)
- **#108** - Gemini OAuth bootstrap
- **#117** - Unset CI before AI_TOOL (fixes gemini-cli exit)
- **#132** - Gemini conversation JSONL normalization

---

## 6. Agent Wake Hooks

### Dependency Chain

```
#2 (on-wake hooks + CLI prompt detection) - foundational
  -> #56 (cloud agents dispatch to docker on wake) - cloud-specific
```

### PR Details

---

#### PR #2 - feat: on-wake hooks, cross-host hostname resilience, CLI prompt detection
- **Merged:** 2026-03-29
- **Size:** +908/-64, 31 files
- **What it does:** Large foundational PR. Adds on-wake lifecycle hooks with `hooks["on-wake"]` + `prompt:` prefix. Replaces fixed 3s delay with `capturePane` polling for CLI prompt detection. Adds `isSelfHost()` with URL/alias checking. Auto-migrates stale hostnames on startup. Self-proxy loop prevention. AMP forwarding URL fallback.
- **Files changed:** `services/agents-core-service.ts`, `lib/agent-runtime.ts`, `lib/agent-registry.ts`, `lib/hosts-config.ts`, `lib/hosts-config-server.mjs`, `lib/host-sync.ts`, `services/amp-service.ts`, `services/hosts-service.ts`, `services/sessions-service.ts`, `app/api/agents/[id]/wake/route.ts`, `app/api/agents/[id]/hibernate/route.ts`, `app/page.tsx`, `components/AgentProfile.tsx`, `components/AgentCreationWizard.tsx`, `components/AgentList.tsx`, `components/WakeAgentDialog.tsx`, `types/agent.ts`, `tests/agent-registry.test.ts`, and more
- **Dependencies:** None - foundational
- **Risk:** HIGH - touches 31 files across many subsystems. Mixes multiple concerns (hooks, hostname resilience, AMP fixes).
- **Priority:** CRITICAL - enables autonomous agent behavior. Should be split for upstream.

---

#### PR #56 - fix(wake): cloud agents dispatch to docker (v0.30.10)
- **Merged:** 2026-04-25
- **Size:** +269/-11, 11 files
- **What it does:** Cloud agents were silently woken via host tmux on every wake instead of being dispatched to their docker container. Adds early branch in `wakeAgent()` for `deployment.type === 'cloud'`. New `inspectContainerStatus`, `startContainer`, `sendKeysToContainer` helpers in `lib/container-utils.ts`.
- **Files changed:** `services/agents-core-service.ts`, `lib/container-utils.ts` (new), `app/api/agents/[id]/wake/route.ts`, `tests/services/agents-core-service.test.ts`, version files
- **Dependencies:** #2
- **Risk:** Medium - new container lifecycle management
- **Priority:** CRITICAL - without this, wake defeats the sandbox

---

## 7. General Bug Fixes

Standalone fixes not tied to any major feature group.

### PR Details

---

#### PR #3 - fix: auto-rebuild node-pty when prebuild is incompatible
- **Merged:** 2026-03-29
- **Size:** +52/-0, 2 files
- **What it does:** Adds postinstall script that smoke-tests node-pty after `yarn install`. If prebuild doesn't match Node ABI, rebuilds from source via node-gyp.
- **Files changed:** `package.json`, `scripts/postinstall-node-pty.js` (new)
- **Dependencies:** None
- **Risk:** Low - non-fatal, warns on failure
- **Priority:** MEDIUM - installation resilience

---

#### PR #5 - fix: update plugin submodule + AMP stale UUID cross-check patch
- **Merged:** 2026-03-29
- **Size:** +30/-0, 1 file
- **What it does:** Updates plugin submodule and saves a patch for amp-helper.sh stale UUID cross-check (fixes agents whose UUIDs get recycled).
- **Files changed:** `patches/amp-helper-stale-uuid-crosscheck.patch` (new)
- **Dependencies:** None
- **Risk:** Low
- **Priority:** LOW - patch file only

---

#### PR #19 - fix: restore package.json entries dropped during upstream merge (0.30.1)
- **Merged:** 2026-04-20
- **Size:** +11/-9, 7 files
- **What it does:** Restores `@anthropic-ai/sdk`, `postinstall` script, and `NODE_ENV=production` prefix on build script that were silently dropped during an upstream merge.
- **Files changed:** `package.json`, version files
- **Dependencies:** None
- **Risk:** Low
- **Priority:** HIGH - fixes build and runtime deps

---

#### PR #110 - fix(scripts): bump-version.sh stamps releaseDate in UTC (v0.30.51)
- **Merged:** 2026-05-03
- **Size:** +10/-10, 8 files
- **What it does:** Changes `date +%Y-%m-%d` to `date -u +%Y-%m-%d` in bump-version.sh so `releaseDate` is consistent across all hosts regardless of timezone.
- **Files changed:** `scripts/bump-version.sh`, version files
- **Dependencies:** None
- **Risk:** None
- **Priority:** LOW - cosmetic fix

---

#### PR #114 - fix(amp): canonicalize JSON for signing (v0.30.53)
- **Merged:** 2026-05-05
- **Size:** +145/-13, 12 files
- **What it does:** Three AMP signing sites used bare `JSON.stringify` (insertion-order) instead of spec-required sorted keys. New `lib/amp-canonical-json.ts` with recursive sorted-keys replacer. Migrates 3 signing sites. Pinned regression test.
- **Files changed:** `lib/amp-canonical-json.ts` (new), `lib/message-send.ts`, `lib/message-delivery.ts`, `services/amp-service.ts`, `tests/amp-canonical-json.test.ts` (new), version files
- **Dependencies:** None - precursor to #119 (attachments)
- **Risk:** Medium - changes signing behavior (but old behavior was non-spec-compliant)
- **Priority:** HIGH - spec compliance, interop with external AMP providers

---

## 8. Documentation

Documentation PRs. Most are operator-specific instructions that were later untracked (#99).

### PR Details

---

#### PR #11 - docs: strategic-tier agent pattern and mesh-awareness wake injection
- **Merged:** 2026-04-11
- **Size:** +371/-0, 1 file
- **What it does:** Adds `docs/STRATEGIC-TIER-AND-MESH-PRIMER.md` documenting mesh-awareness wake injection and strategic-tier cohabitation patterns.
- **Files changed:** `docs/STRATEGIC-TIER-AND-MESH-PRIMER.md` (new)
- **Priority:** MEDIUM

---

#### PR #53 - docs: add CLOUD-AGENTS.md
- **Merged:** 2026-04-25
- **Size:** +177/-0, 1 file
- **What it does:** Operator-facing documentation for sandboxed cloud agents. Covers 3-tier MCP/tool flow and mount patterns.
- **Files changed:** `docs/CLOUD-AGENTS.md` (new)
- **Priority:** HIGH - documents cloud agent feature

---

#### PR #54 - docs(ai-team): CelestIA on-wake instructions
- **Merged:** 2026-04-25
- **Size:** +87/-0, 1 file
- **What it does:** Agent-specific on-wake instructions.
- **Files changed:** `ai-team/CelestIA_INSTRUCTIONS.md` (new)
- **Priority:** LOW - operator-private (later untracked by #99)

---

#### PR #55 - docs(ai-team): Watson on-wake instructions
- **Merged:** 2026-04-25
- **Size:** +103/-0, 1 file
- **Files changed:** `ai-team/Watson_INSTRUCTIONS.md` (new)
- **Priority:** LOW - operator-private

---

#### PR #57 - docs(ai-team): KAI on-wake instructions
- **Merged:** 2026-04-25
- **Size:** +116/-0, 1 file
- **Files changed:** `ai-team/KAI_INSTRUCTIONS.md` (new)
- **Priority:** LOW - operator-private

---

#### PR #59 - docs(cloud-agents): MCP server mount strategy decision
- **Merged:** 2026-04-25
- **Size:** +172/-6, 2 files
- **What it does:** Records Option C (hybrid) decision for MCP server mounting: per-container spawn default, host-daemon promotion as exception.
- **Files changed:** `docs/CLOUD-AGENT-MCP-DECISION.md` (new), `docs/CLOUD-AGENTS.md`
- **Priority:** HIGH - architectural decision record

---

#### PR #61 - docs(cloud-agents): migration recipe
- **Merged:** 2026-04-25
- **Size:** +28/-8, 1 file
- **What it does:** Adds 6-step migration recipe for flipping existing agents to Pattern A cloud agents.
- **Files changed:** `docs/CLOUD-AGENTS.md`
- **Priority:** HIGH - operational documentation

---

#### PR #71 - docs(ai-team): task-assignment-authority rule for CelestIA
- **Merged:** 2026-04-26
- **Size:** +15/-0, 1 file
- **Priority:** LOW - operator-private

---

#### PR #72 - docs(ai-team): KAI as explicit code-task assigner
- **Merged:** 2026-04-26
- **Size:** +3/-2, 1 file
- **Priority:** LOW - operator-private

---

#### PR #73 - docs(ai-team): Watson task-assignment rule
- **Merged:** 2026-04-26
- **Size:** +15/-2, 1 file
- **Priority:** LOW - operator-private

---

#### PR #76 - docs(ai-team): Hutch instructions
- **Merged:** 2026-04-26
- **Size:** +128/-0, 1 file
- **Priority:** LOW - operator-private

---

#### PR #99 - chore(gitignore): untrack ai-team/ operator-private instructions
- **Merged:** 2026-04-29
- **Size:** +5/-463, 5 files
- **What it does:** Adds `ai-team/` to `.gitignore` and untracks the 4 agent instruction files containing internal infra context (host roles, UUIDs, file paths).
- **Files changed:** `.gitignore`, 4 `ai-team/*.md` files (removed from tracking)
- **Priority:** LOW - housekeeping

---

## 9. Merge Strategy Recommendations

### Critical Path (must merge in order)

These PRs form the foundational cloud agent infrastructure. They should be merged upstream first:

1. **#2** - On-wake hooks (SPLIT recommended: separate hooks, hostname resilience, AMP fixes)
2. **#1, #4, #10** - Mesh/host resilience fixes (independent, can merge in any order)
3. **#56** - Cloud wake dispatch to docker
4. **#58** - Sandbox mounts schema
5. **#62, #63** - Heartbeat online status
6. **#64, #65** - Terminal pipe
7. **#68** - Dashboard rendering fix
8. **#80** - Hibernate stops container
9. **#87** - Security fix (drop wholesale ~/.claude mount)
10. **#109** - Hard-delete tears down container
11. **#115** - sendKeysToAgent primitive
12. **#101** - UUID uniqueness

### High-Priority Independent PRs

These can be merged independently without the cloud agent chain:

- **#114** - Canonical JSON for AMP signing (spec compliance)
- **#25** - Meeting additionalContext injection
- **#47** - Agent resolution by env var
- **#50** - Bracketed paste for non-Claude agents
- **#94, #95** - cancelCopyMode in chat paths
- **#3** - node-pty auto-rebuild
- **#19** - package.json entry restoration

### Breaking Changes / Migration Needs

| PR | Breaking Change | Migration |
|---|---|---|
| #58 | New types on AgentDeployment | Additive, backward compatible |
| #62 | Container image needs AGENT_ID, AIMAESTRO_HOST_URL env vars | Image rebuild required |
| #81 | Multi-runtime Dockerfile | Image rebuild required |
| #87 | Removes ~/.claude wholesale mount | Image rebuild + re-provision required |
| #93 | New /api/agents/[id]/recreate endpoint | Additive |
| #101 | createAgent rejects duplicate UUIDs | May break if callers rely on dup-UUID acceptance |
| #114 | Changes AMP signing byte representation | May break signature verification with old-format signatures |
| #119 | New attachment API surface | Additive, new endpoints |
| #128 | Hard-rejects legacy attachment shape | Breaking for legacy clients |

### Risk Summary

| Group | Complexity | Files Touched | Test Coverage |
|---|---|---|---|
| Cloud Agent/Docker | Very High | 50+ unique files | 830+ tests total |
| AMP Attachments | High | 18 new files | Good (dedicated test suite) |
| Meeting Improvements | Medium | 20+ files | Moderate |
| Mesh/Host Resilience | Low | 5 files | Low (mostly manual verification) |
| Agent Wake Hooks | High | 31+ files (PR #2) | Moderate |
| Bug Fixes | Low | <10 files each | Varies |

### Recommended Merge Phases for Upstream

**Phase 1 - Foundation (PRs: #1, #3, #4, #10, #19, #24, #110)**
Independent fixes with no dependencies. Low risk.

**Phase 2 - Wake Hooks + Hostname Resilience (PRs: #2 split)**
PR #2 should be split into 3-4 smaller PRs for upstream review.

**Phase 3 - Meeting Improvements (PRs: #25, #26, #47, #50, #94, #95, #113)**
Mostly independent improvements. #25 and #50 are the most impactful.

**Phase 4 - AMP Compliance (PRs: #114, #127, #128)**
Signing canonicalization and protocol enforcement.

**Phase 5 - Cloud Agent Core (PRs: #56, #58, #62, #63, #64, #65, #68, #80, #87, #88, #101, #109, #115)**
The essential cloud agent infrastructure.

**Phase 6 - Cloud Agent Polish (PRs: #79, #81, #83, #86, #89-93, #96-98, #100, #102-105, #108, #112, #116-118, #120-121, #129-132)**
Provisioning, auth bootstrap, multi-provider, chat integration.

**Phase 7 - AMP Attachments (PRs: #119, #122-125)**
Complete attachment feature.

**Phase 8 - Operational Tooling (PRs: #106, #107, #121)**
Audit and migration utilities.

---

*Generated 2026-05-12. Data sourced from `gh api repos/swickson/ai-maestro/pulls/N` for each PR.*
