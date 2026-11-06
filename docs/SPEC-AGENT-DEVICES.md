# Spec: Agent devices (F078, F079)

An agent owns external devices: an "agent home" such as a Linux laptop, or an accessory with its own bridge.
It uses them from its normal session, and the operator sees and manages who owns what from the dashboard.

Status: draft, 2026-11-05. GitHub: #788, #789. Backlog: [F078](../backlog/F078-agent-devices-pair-and-use.md),
[F079](../backlog/F079-agent-devices-transfer-from-dashboard.md).

## 1. AI Maestro implements the device protocol; it does not define it

The protocol is `23blocks-OS/ai-maestro-device-protocol` (private), `protocol/v1.md`, with its SDK
(`packages/sdk`, `@ai-maestro/device-sdk`) and the Linux bridge (`clients/linux`). AI Maestro is a **controller**
in that protocol: the role the reference `apps/controller` CLI plays today. Everything on the wire comes from the
protocol and its SDK. AI Maestro adds only what a controller needs around it: where keys are kept, which agent is
calling, the API, the agent's tool and the screens.

| Concern | Defined by | Used from |
|---|---|---|
| Ed25519 identities, key encoding | protocol v1, Encoding | SDK `identity()`, `publicKey()` |
| Signed packets (`ai-maestro-device/1` domain, base64url) | protocol v1, Encoding | SDK `seal()`, `open()` |
| Challenge, request, correlated reply | protocol v1, Exchange | SDK `call()` |
| Discovery, registration, `assignedAgent` | protocol v1, Exchange | SDK `call(origin, self, device)` |
| Capabilities `device.health`, `camera.snapshot`; errors | protocol v1, table | SDK `call(…, capability)` |
| One owner per endpoint, transfer semantics, 409 while a capture drains | protocol v1, Exclusive ownership | the bridge enforces it |
| Device address rules (loopback or Tailscale IPv4, `http:`) | SDK `privateOrigin()` | every call |
| AMP address format | SDK `agentAddress()` | pairing, events |
| `device.registered` event to the assigned agent | protocol v1, Events | AI Maestro sends it with AMP |
| Signed activity updates for a display | protocol v1, Signed activity updates | SDK `publishActivity()` |
| Remote assign and unassign (F079) | **not in v1**: a proposed v1.1, section 9 | after it lands in the protocol repo |
| Several devices per agent | **required of the protocol** (Juan, 2026-11-05), section 2 decision 5 | v1's wire format allows it; its text and reference controller do not yet say so |
| Where the agent's key and device list are stored | AI Maestro (section 3) | SDK `identity()` |

Rule: AI Maestro never builds or checks a packet itself. A wire change goes to the protocol repo first (spec,
SDK, bridge, tests), then AI Maestro takes the new SDK.

### Taking the SDK

The SDK is private and not published, and `update-aimaestro.sh` must not need GitHub credentials for a private
package. AI Maestro **vendors** it: `lib/device-sdk/index.mjs` and `index.d.ts`, copied byte for byte from a
pinned commit of the protocol repo, with the commit in a header comment and in `lib/device-sdk/SOURCE`. A test
compares the copy with a hash recorded next to it, so an edit by hand fails CI (as the hook copies are guarded).
Updating means copying the new files and the new hash in one commit.

The SDK declares Node 22; it uses only `node:crypto` (Ed25519, JWK) and `fetch`, which Node 20 on our hosts has.
The protocol's own tests run on Node 22; AI Maestro's tests of the vendored copy run on its Node 20 and 22 CI.

## 2. Decisions

1. **No isolation between agents on one machine** (Juan, 2026-11-05). Agents on a host share one system user and
   can read each other's files (B021). The server keeps each agent's device key outside the agent folders, and every
   API call acts only for the agent it names; that prevents one agent using another's device by mistake. It does
   not stop an agent that sets out to read another's key. The #788 requirement of isolated signing on one host is
   out of scope. The protocol repo's runbook (`docs/omarchy.md`, section 3) tells the operator to run each agent's
   controller under its own OS account or container; that advice does not apply to AI Maestro, and F078.3 updates
   the runbook to describe AI Maestro as the controller.
2. **No app-level auth** (by design). "Operator" means anyone who can reach the dashboard, as for every action.
3. **The device is the authority on ownership.** AI Maestro shows the owner from the last verified signed
   registration (or, in F079, the signed confirmation), never from what it asked for.
4. **A call is made from the agent's own host**, which holds the agent's key. Other hosts reach it through their
   configured hosts list, as the Doctor does.

5. **A device is optional; an agent has zero or more** (Juan, 2026-11-05). Most agents have none and are complete
   without one: no key is created, no timer runs and nothing is shown until a device is added. One in the kitchen, one in the office, one in the car; the
   agent jumps between them and is **active on only one at a time** (it never uses two cameras or two devices at
   once). This is a protocol requirement, not an AI Maestro convenience: device-protocol issue #7. The active device
   is one value on the agent's side, held by its controller (here, AI Maestro): the last activation wins, and the
   controller refuses sensors and live media on any other device. `discover` and `device.health` work on every owned
   device. No lease is needed: only the agent's controller can command its devices, so an offline device is simply
   not the active one. Muse does the same for calls: its VM holds the one call and a new call replaces the old one. Each device has at most
   one owner; an agent may own any number of devices, with one key that every one of its devices pins. On the wire
   v1 already allows this, since each device pins its controller key on its own. The protocol repo must change to
   say so and to support it (delivery step P1):
   - `protocol/v1.md`: replace "The MVP supports one controller per device and one device per controller state
     directory" with: an agent may own many endpoints, and each endpoint has zero or one owner.
   - `packages/sdk/state.mjs` and `apps/controller`: keep a list of devices (by device key) in place of the single
     `peer.json`, and take the device as an argument.
   - Tests: one controller key, two bridges, each called independently; moving one device leaves the other
     assigned.

## 3. Storage (per agent, on its host)

```
~/.aimaestro/agents/<agentId>/devices/
  identity.json      { secret: <PKCS8 PEM>, key: <base64url public key> }   mode 600, created on first use
  devices.json       DeviceRecord[]                                         mode 600, written atomically
  snapshots/         <deviceKey>-<timestamp>.jpg                             mode 600, last 20 kept per device
```

One identity per agent, used for all of that agent's devices (each device pins it). It is created with SDK
`identity()` when the agent first opens "Add a device", never sent anywhere except its public key. Deleting an
agent (hard delete) removes the folder with the agent's other files; its devices then reject the old key.

```ts
interface DeviceRecord {
  key: string                // the device's Ed25519 public key (base64url): its stable identity
  origin: string             // e.g. "http://100.70.1.2:7420", validated with SDK privateOrigin()
  label: string              // the operator's name for it: "MacBook (Omarchy)"
  kind: 'home' | 'accessory'
  parentKey?: string         // an accessory attached to a home
  pairedAt: string
  registration?: {           // the last verified signed registration
    assignedAgent: string    // full AMP address
    capabilities: string[]   // e.g. ["device.health", "camera.snapshot"]
    events: string[]         // e.g. ["activity"]
    at: string               // when it was verified
  }
  lastContactAt?: string     // last verified signed reply of any kind
  lastError?: { at: string; message: string }
}
```

The agent's AMP address is `agent.metadata.amp.address` (the address its AMP identity registered). An agent with
no AMP identity cannot own a device; the dialog says to initialise AMP first.

## 4. States

Computed from the record, the same everywhere (server, page, tool):

| State | When |
|---|---|
| `ready` | The last registration names this agent and the last contact succeeded. |
| `offline` | The last call failed to connect or timed out (registration may still name this agent). |
| `owned-by-other` | The last registration names another address: the device was re-paired on the device itself. Calls are refused until a new discovery names this agent again. |
| `not-confirmed` | Paired here, but no signed registration yet (the device has not pinned this agent's key, or never answered). |

Before every invoke the server runs a discovery first (one extra round trip, ~2 signed messages) and refuses
unless it names this agent. Cost is small and it is the protocol's own check; caching the registration would let a
transferred device keep answering the former owner's tool until the cache expired.

## 5. API (Next routes and `services/headless-router.ts`)

Service: `services/agent-devices-service.ts`, pure functions returning `ServiceResult<T>`.

| Route | Does |
|---|---|
| `GET /api/agents/[id]/devices` | The agent's devices with their state. `?refresh=1` runs a discovery on each first (bounded, in parallel, 15 s each). |
| `GET /api/agents/[id]/devices/identity` | The agent's device public key and AMP address (creates the key on first call), for the pairing dialog. |
| `POST /api/agents/[id]/devices` | Pair: `{ key, origin, label, kind?, parentKey? }`. Validates with SDK `publicKey()` and `privateOrigin()`, runs a discovery, saves the record in any state, answers with it. |
| `POST /api/agents/[id]/devices/[key]/invoke` | `{ capability }` from the closed list (`device.health`, `camera.snapshot`). Discovery, then the call. A snapshot is saved under `snapshots/` and the answer carries its path and size, not the bytes. |
| `POST /api/agents/[id]/devices/[key]/announce` | Sends the protocol's `device.registered` event to the assigned agent with AMP (section 7). |
| `DELETE /api/agents/[id]/devices/[key]` | Forgets the device on this side. It does not unpair the device (that needs F079 or the device's own CLI); the answer says so. |
| `GET /api/devices` | Every agent's devices on this host, for the Devices page. Local only: a host never calls a peer's `/api/devices`. |

Errors: 400 for invalid input (key, origin, capability, label over 80 characters); 404 unknown agent or device;
409 `owned-by-other` or `not-confirmed` with the current state; 502 the device did not answer, with the reason;
the protocol's signed errors (`denied`, `hardware_unavailable`) pass through as 200 `{ ok: false, error }`, the
way the protocol returns them. A bridge's 409 (`transfer_draining`, `superseded`) is 409 here, retryable.

`[id]` accepts only a registry id. An agent on another host is reached by the client calling that host directly
(the agent's `hostUrl`), as the Doctor fix buttons do.

## 6. The agent's tool (plugin)

`aimaestro-device.sh` (plugin `src/scripts`), acting as `AIM_AGENT_ID`:

```
aimaestro-device.sh list [--refresh] [--json]
aimaestro-device.sh health <device>
aimaestro-device.sh snapshot <device>          # prints the JPEG path
```

`<device>` is the label or the key. No command takes a URL, a path or a capability name from the caller beyond the
closed list. Exit 1 on a refused or failed call, with the reason on stderr. A short skill, `agent-devices` (or a
section of `ai-maestro-agents-management`; decide by trigger evals), says: use it when asked about your own devices,
a camera picture or the health of your machine; a snapshot needs the camera granted on the device itself.

## 7. Events

`device.registered` (protocol v1, Events): after a verified discovery, an operator click (Announce, on the device
row) sends `{ type, version, key, capabilities, observedRequest }` to the assigned agent with `amp-send` as that
agent's host does today, from AI Maestro's own identity. Only to the address the registration names. An incoming AMP
message never triggers a device call; there is no inbound path in this spec.

## 8. Activity for devices with a display

A device whose registration lists `events: ["activity"]` shows its agent's state (the protocol's kiosk orb). The
reference `watch` command polls AI Maestro and publishes; AI Maestro does it itself instead: every 3 s, for each such
device of a local agent, it maps the agent's presence (`lib/agent-presence.ts`: Working → `working`, Needs you →
`waiting`, Ready → `idle`, otherwise `unknown`) and calls SDK `publishActivity()`. Only the state is sent, never
text. A 409 `superseded` is ignored; three failed publishes in a row mark the device offline until the next
success. It runs only when at least one such device exists, so a host with no devices does no work.

## 9. F079: remote assign and unassign (protocol v1.1, proposed)

Protocol v1 changes the owner only on the device (`pair` with the new key and address). F079 needs a signed remote
change. Proposed for the protocol repo, to be specified, built and tested there first:

- **Operator key.** At pairing, the device also pins an operator key (a new field in its peer file). It may send
  only `assign` and `unassign`; it cannot discover or invoke. AI Maestro keeps one operator key per host in
  `~/.aimaestro/devices/operator.json` (mode 600), outside every agent folder.
- **Requests,** signed by the operator key with a fresh challenge, as every request:
  - `{ type: "assign", id, challenge, to, assignedAgent, agentKey, expectedRevision }`
  - `{ type: "unassign", id, challenge, to, expectedRevision }`
- **Compare and swap.** The device applies the change only when `expectedRevision` equals its current revision.
  It then replaces the grant atomically (the same code path as the local `pair`), turns the camera grant off, starts
  a new revision, and answers with a signed `{ type: "assignment", revision, assignedAgent | null }`. A wrong
  revision is a signed `{ type: "assignment", ok: false, error: "revision_mismatch", revision }`. A capture in
  progress keeps the bridge's existing rule: its data is never released to the former owner.
- **Registration** gains `revision` so a controller learns the current one from discovery.

AI Maestro side, once v1.1 is in the SDK:

- `POST /api/devices/[key]/assign { agentId }` and `/unassign` on the host that holds the operator key pinned on
  the device. It records a pending operation (`~/.aimaestro/devices/pending.json`) before sending, so a restart
  keeps it.
- States add `transfer-pending` (sent, no signed answer), `transfer-failed` (refused or revision mismatch, with the
  reason). An offline device stays pending; Retry sends a new request with a fresh challenge and the revision from
  a new discovery. Two operators: the device's compare and swap lets one win; the other gets `revision_mismatch`.
- The new owner appears only from the signed confirmation. The new agent's device record is created on its host
  from that confirmation; the former agent's record moves to `owned-by-other` at its next discovery.

## 10. Screens

- **Agent profile → Devices:** the agent's devices with state, capabilities, last contact; Health and Snapshot
  buttons (the snapshot shows inline); Add a device (shows the agent's key and AMP address and the exact command for
  the device, `node clients/linux/cli.mjs assign <address> <agentKey>` (add `--camera` to grant the camera), then
  asks for the device key (printed by `cli.mjs init` on the device), its Tailscale address
  (`http://<tailscale ip>:23110`, the bridge's port) and a label); Forget.
- **Devices page** (a top-level page, linked from the sidebar): every device of every agent on every host, fetched
  per host in parallel like the Doctor page, grouped by home with accessories under it, filter by state. F079 adds
  Transfer and Unassign there.
- No `window.confirm`; destructive actions confirm inline.

## 11. Tests

- Vendored SDK: the hash test; seal/open round trip against a packet from the protocol repo's tests.
- Service, against a protocol test double (a loopback bridge like the protocol repo's tests start, with its own keys):
  pair and discover; invoke health; snapshot saved with mode 600 and pruned to 20; `not-confirmed` before the device
  pins the key; re-pairing the double to another agent makes the next invoke 409 `owned-by-other`; a `denied`
  error passes through; an origin that is not loopback or Tailscale is refused before any network call.
- **Two agents on one host:** each lists only its own devices; agent B calling agent A's device through B's id
  gets 404.
- Activity publisher: presence mapping; no timer when no device has `events: ["activity"]`.
- Plugin script against a fake API (as `aimaestro-agent-doctor.test.ts`).
- F079 against the v1.1 double: assign, unassign, transfer during a capture, offline then retry, two conflicting
  requests (one wins, one `revision_mismatch`), restart with a pending operation.
- Real check: Lola on mini-lola and the 2010 MacBook (health; snapshot with the camera granted on the MacBook).

## 12. Delivery

| Step | Repo | Contents |
|---|---|---|
| P1 | ai-maestro-device-protocol | Issue #7: many devices per agent, one active at a time (decision 5). This spec's states and API gain "active" and a jump when #7 lands. |
| P2 | ai-maestro-device-protocol | Issue #8: devices open the connection to the controller; a jump by use; needed by phones (companion mode) |
| F078.1 | ai-maestro | Vendored SDK, storage, service, routes, states, tests |
| F078.2 | ai-maestro, ai-maestro-plugins | Agent profile Devices section, Devices page, `aimaestro-device.sh` and skill, announce, activity publisher |
| F078.3 | — | Real check with Lola and the MacBook; notify ai-maestro-app of the API |
| F079.1 | ai-maestro-device-protocol | Issue #10: operator key, assign and unassign, revision, tests |
| F079.2 | ai-maestro | Operator key, pending operations, Transfer and Unassign, tests |

## 13. Open questions

1. The device's key is printed by `cli.mjs init` on the device and copied by hand. Later: a QR on the device's
   display?
2. Snapshots: keep 20 per device, or delete after the agent reads one?
3. Should Health and Snapshot buttons in the dashboard act as the agent (signed with its key), or be limited to the
   agent's own tool? This spec has them act as the agent, since the operator can do anything the agent can.
