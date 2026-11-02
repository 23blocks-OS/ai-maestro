# Spec: secrets with a scope, shared across the organization

**Status:** Draft for review (2026-11-02). Nothing here is built. Backlog: F065. Extends F033 (`docs/SECRETS.md`).
**Goal:** a secret entered once can be used by one agent, by a whole host, or by the organization (every host in the mesh), without the value ever being readable from the network, a browser, a chat or a model. Phase 1 is the secret and its scope. Phase 2 adds permissions: which agents may use it.

## 1. What exists today (F033)

- `aim-secret` stores a value in the host's OS keychain (macOS Keychain, libsecret) or, on headless hosts, an encrypted file (`lib/secret-vault.mjs`). The keychain entry is the name only (`OPENAI_API_KEY`).
- An agent uses it with `aim-secret exec --use NAME -- <command>`: the value goes into the child's environment and is scrubbed from the output. The model only ever sees the name.
- An agent asks for one with `aim-secret request NAME`; a card in its chat takes the value and stores it on the agent's host.
- **Every secret is host-wide.** Any agent on that host can use any name. Nothing is shared between hosts.
- **The server's own features do not use the vault (B020).** The memory classifier keeps its key in `~/.aimaestro/memory-settings.json` (0600); the voice narration reads `ANTHROPIC_API_KEY` from the environment; the browser keeps TTS keys in local storage; the iPhone app keeps its ElevenLabs key in its Keychain.
- **Hosts have no keys of their own.** Peers trust each other because they are on the same network (Tailscale or LAN).

## 2. Words

| Word | Meaning |
|---|---|
| Secret | A named value (`OPENAI_API_KEY`) plus a record about it. The value never leaves the keychain of its home host except as described in section 5 |
| Home host | The host whose keychain holds the value. Where it was entered |
| Scope | Who can use it: **agent** (one agent), **host** (every agent on the home host), **org** (every host in the mesh) |
| Kind | **tool** (an agent's commands use it through `aim-secret exec`) or **provider** (AI Maestro's own features use it: voice, memory, phone numbers) |
| Org | The hosts in `hosts.json` that share this AI Maestro organization (the AMP tenant, `rnd23blocks`). Not the people "organizations" of the People page |
| Grant (phase 2) | A permission on a secret: this agent, this team, the agents of these people, this host, or an AI Maestro feature |

## 3. Rules

1. **No value is ever readable.** No API returns a value to a browser, a phone or a peer in plain text. The only ways out: into a child process on the home host (`exec`), into the server's own feature on a host, or sealed to one peer host's key (section 5).
2. **Nothing is copied silently.** An org secret stays on its home host; other hosts ask for it when they use it (the owning-host pattern used for agents and people). Moving an agent does not copy its secrets.
3. **The narrowest scope is the default.** A secret requested by an agent is for that agent unless the person chooses host or org.
4. **Every use is recorded** on the home host: which secret, which host and agent, when, which command or feature. Never the value.
5. **No login.** Section 5 adds keys to hosts, the same way AMP signs messages between agents. That protects one channel, secrets between hosts; it is not user authentication and changes nothing else in the no-auth design.

## 4. Phase 1: the secret and its scope

### 4.1 Record

Stored per home host in `~/.aimaestro/secrets/index.json` (0600). No values.

| Field | Notes |
|---|---|
| `name` | `^[A-Z][A-Z0-9_]{0,63}$`, as today |
| `scope` | `agent`, `host`, `org` |
| `agentId` | Set when scope is `agent` |
| `kind` | `tool` or `provider` |
| `provider` | For `provider` kind: `openai`, `gemini`, `elevenlabs`, `deepgram`, `assemblyai`, `twilio`, `anthropic`, ... (what Settings shows and tests) |
| `homeHostId` | This host |
| `hint` | Last four characters, as Settings > Memory shows today |
| `note`, `createdAt`, `createdVia` (`cli`, `card`, `settings`), `rotatedAt`, `lastUsedAt` | |

Keychain account names gain a prefix so the scopes cannot collide: `NAME` (host, unchanged, so existing secrets keep working), `agent.<agentId>.NAME`, `org.NAME`. Existing secrets become host-scope records on first start: that is what they already are.

### 4.2 Which secret `exec` uses

`aim-secret exec --use NAME` in an agent's session (AI Maestro sets `AIM_AGENT_ID`) looks in this order and takes the first it finds: this agent's secret, then the host's, then the org's. Settings shows when one name exists at several scopes ("Lola's OPENAI_API_KEY hides the org's").

### 4.3 Asking for a secret, with a scope

`aim-secret request NAME --note "..." [--scope agent|host|org]`: the agent can suggest a scope; the card always shows the choice, with **This agent only** selected by default, then **Every agent on this host**, then **The whole organization**. Choosing org shows one more line: "Every agent on every host can use it." The card also says where the value will live (the home host's name).

### 4.4 Settings > Secrets

One page that lists every secret of every host (it asks the peers, as the Org page does): name, scope, owner agent, home host, kind, hint, last used. Actions: add, rotate (new value, same name and scope), change scope (narrowing is immediate; widening asks to confirm), delete. Never a "show value" button.

**Settings > Voice providers** (V1, F059) is the same list filtered to `provider` secrets, with one row per provider, a **Test** button (the server makes one cheap call with the key and says if it works), and a default per feature (voice, memory). The memory classifier key moves here from `memory-settings.json`.

### 4.5 The server's own features

Server code reads a provider secret with `useSecret(name, { feature: 'voice' })`: local if this host is its home, otherwise sealed from the home host (section 5) and kept in memory only, for at most 5 minutes. The voice session endpoint (F059 step 3) mints a short-lived provider token from it; the long-lived key never leaves the server.

## 5. Sharing across hosts securely

### 5.1 Host keys (new)

Each host makes two key pairs on first start and keeps the private halves in its vault: Ed25519 to sign, X25519 to receive sealed values. `GET /api/hosts/identity` returns the public halves and a short fingerprint. When a peer is added in Settings > Hosts, its public keys are stored with it (trust on first use) and its fingerprint is shown, so the operator can compare it on both machines. A peer whose key changes is refused until the operator accepts the new key.

### 5.2 A host uses an org secret

```
host B (needs ORG secret)                         home host A (holds it)
  POST /api/secrets/resolve  ─── signed by B ───►  checks: B is a known peer, signature and time valid,
  {name, agentId?, feature?, nonce, ts}            nonce unseen, scope allows it (phase 2: a grant allows it)
                             ◄── sealed to B ───   value sealed to B's X25519 key (X25519 + HKDF + AES-256-GCM),
                                                   bound to the request nonce; use written to the audit log
  opens it in memory, uses it, drops it
```

- A request replayed or sent by a machine that is not a known peer gets nothing. A recorded answer is useless to anyone but B.
- B never writes the value to disk. `aim-secret exec` on B gets it for one command; a server feature keeps it for at most 5 minutes.
- If A is offline, the secret is unavailable on B, and B says so ("OPENAI_API_KEY lives on mac-mini, which is offline"). Copies on several hosts are a later option (a pinned copy per host, rotated together), not the default.

### 5.3 Why not replicate every org secret to every host

Copies mean every host's keychain holds every org secret, a rotation or revocation must reach every host, and a host that was offline keeps an old or revoked value. Fetch-on-use keeps one copy, so revocation is immediate, and it matches how agents and people already live on one host and are reached from the others.

## 6. Phase 2: permissions (who in the org may use it)

### 6.1 Grants

A secret gets a list of grants. Each grant names who may use it, and optionally how:

| Grant to | Example |
|---|---|
| An agent | Lola |
| A team | the "infra" team (`lib/team-registry`) |
| The agents of a person or of an organization of people | every agent whose `humanManager` is in the 23blocks organization |
| A host | every agent on mini-lola |
| An AI Maestro feature | voice, memory, phone numbers |

Optional limits on a grant: a command pattern (`aws s3 *`), an expiry date, hours of use.

Scope becomes the default grant: agent scope = a grant to that agent; host scope = a grant to the home host; org scope = a grant to everyone, which phase 2 lets the operator narrow. Existing org secrets keep "everyone" until changed.

### 6.2 Asking for access

An agent without a grant gets exit code 3 from `exec` and a sentence: "OPENAI_API_KEY exists in the organization but Lola may not use it. Ask with `aim-secret request-access OPENAI_API_KEY --note ...`." That puts a card in front of the agent's manager (the person in `humanManager`) with **Allow once**, **Always allow**, **No**. The same request goes to the AI Maestro app as a push.

### 6.3 Who may change a grant

Without login, anyone who reaches the dashboard could widen a grant. Phase 2 closes that for the one place it matters: creating an org secret, widening a scope and adding a grant need an approval signed by a person's approved device key (AMP spec 13, already built for person messages), from the agent's manager or a person marked as a secrets admin. The dashboard shows the request; the phone signs it. Narrowing and revoking need no signature.

### 6.4 Audit

Settings > Secrets > History: every use and every change, from every host's log, filterable by secret, agent and host. Logs rotate at 50 MB like the others (B013).

## 7. What this does not protect against

- **Agents on one host are not separated from each other (B021, accepted trade-off).** They run as the same OS user, so any of them can read the vault (the encrypted file keeps its key beside it; the keychain answers that user without a prompt) and every agent's AMP key. Scopes are a policy for agents on a host and a real boundary only for agents in containers, which do not see the host's vault. Isolation means containers.
- An agent that may use a secret can misuse it or copy it out: it runs commands, and scrubbing only stops accidents (`docs/SECRETS.md`). Grants decide who has it; they do not make it safe in the wrong hands. Use narrow keys.
- On a host with the file backend, any process of that user, agents included, can read the vault file.
- Whoever controls a home host controls its secrets.
- In phase 1, anyone who reaches the dashboard can add a secret or widen a scope (it is logged). Phase 2 requires a phone signature for that.
- A value in memory on the host that uses it.

## 8. Order of work

**Phase 1 (about one 6-day cycle):**
0. AI Maestro's own secrets into the vault: `useSecret()`, migrate the memory classifier key, the Claude token and the attachment signing key out of their plain files, `ANTHROPIC_API_KEY` from the vault first (B020) (S).
1. Secret records and scoped keychain names, with migration of existing secrets to host scope; `exec` lookup order (S).
2. Scope on `aim-secret request` and the card (S).
3. Settings > Secrets, listing every host (M).
4. Host keys, `/api/hosts/identity`, pinning in Settings > Hosts (M).
5. `POST /api/secrets/resolve` with signed requests and sealed answers; `useSecret()` for server features; audit log (M).
6. Settings > Voice providers as a filtered view, with Test; move the memory classifier key (S).
7. Tests: a value never appears in any response, log, transcript or file on the requesting host; an unknown or replayed request gets nothing; scope order; offline home host.

**Phase 2 (about one cycle):** grants and their limits, `request-access` and its card and push, signed approvals from the phone, history view.

## 9. Decisions for Juan

1. Org secrets fetched from the home host when used (recommended), or copied to every host.
2. In phase 2, widening a scope or adding a grant needs a phone signature (recommended), or a dashboard confirmation is enough.
3. Existing secrets become host scope (recommended: nothing changes for agents using them today).
