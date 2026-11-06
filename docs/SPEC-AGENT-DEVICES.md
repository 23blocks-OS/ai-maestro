# Spec: AI Maestro as a device controller

An agent can own devices, for example a laptop in the office or a camera in the kitchen, and work through them. In town language a device is the agent's
**home**. This spec says how AI Maestro implements the protocol's **controller role**.

Status: draft, rewritten 2026-11-06 against the protocol at `08707e80`. GitHub: #788, #789. Backlog: F078, F079, F081 to F085.

## 1. What the protocol owns

The protocol is the Agent Device Protocol (ADP), `agentmessaging/agent-device-protocol`, part of the AI Maestro ecosystem. **It defines the controller; AI Maestro is an implementation of it.** Read
`protocol/controller.md` (the role), `protocol/v1.md`, `protocol/reverse.md`, `protocol/capabilities.md`, and `docs/controller-sdk.md`.

Rule: AI Maestro never builds or checks a packet, and adds no behaviour the role forbids. If a rule matters, it goes in the protocol first.

| The SDK does (`@ai-maestro/device-sdk/controller`) | AI Maestro does |
|---|---|
| Signed exchange, pinned keys, one-use challenges | Keep each agent's key on disk |
| Signed ownership truth, inventory state | Save and restore `snapshot()` |
| One active device per agent, last jump wins, late results dropped | Say who is calling, and call `jump` |
| Refusing sensors and output on idle devices | Show the refusal |
| Typed capabilities and bounded arguments | Give the agent fixed tools |
| Transfer and permission proposals, revisions, receipts | Show pending, confirmed, rejected, expired, conflict |
| Liveness: probes, disconnects, heartbeat | Show state; deliver notices |
| Device-opened connections (hub) | Host the hub |
| `device.input`, retries of failed event delivery | Deliver to the agent, de-duplicating by event id |

## 2. Decisions

1. **One `Controller` per host, in the server process, for all its agents.** No per-agent process, no monitor, no shared folder. The role says AI Maestro must not need them.
2. **A device is optional.** An agent with no device costs nothing: no key, no record, no timer. Listing returns an empty list.
3. **Agents on one machine are not isolated.** The protocol calls this a supported deployment choice. Keys live outside agent project folders; the API acts only for the agent it names. That prevents mistakes, not a deliberately misbehaving agent on the same host.
4. **No operator key.** Every transfer, unassignment and camera change waits for approval on the device. A device with no screen or button has no answer yet (protocol #10).
5. **Active means active.** Discovery and health work on any owned device. Sensors, live media and output work only on the active device.
6. **Node 24** on all hosts, done (the SDK needs 22+).

## 3. Taking the SDK

The protocol repo is public and MIT, like AI Maestro. `packages/sdk` is copied to `lib/device-sdk/` at a pinned commit, with the commit in `lib/device-sdk/SOURCE` and a test that fails when a file
differs from its recorded hash. A hand edit then fails CI. Updating means copying the new files and hashes in one commit. It can become a published package later.

## 4. Where it runs

- The `Controller` is created at server start and kept on `globalThis`, the pattern of `services/shared-state`, because Next routes can load a module twice and there must be one.
  It is created by `server.mjs`, not imported by a route: `ws` and the hub must not end up in a Next bundle.
- `services/agent-devices-service.ts` is the only code that calls it: pure functions returning `ServiceResult<T>`, with Next and headless routes as usual.
- The hub listens on its own port, 23112, on this host's Tailscale address. It starts only when an agent has a device with a `reverse` endpoint.
- `controller.start({ intervalMs })` runs only when at least one device exists. A host with no devices does nothing.

## 5. Storage

Per agent, so it moves with the agent:

```
~/.aimaestro/agents/<agentId>/devices/
  identity.json    { secret, key }, mode 600, created with the first device
  state.json       this agent's part of snapshot(): devices, active device, proposals, pending events
  snapshots/       JPEGs from camera.snapshot, mode 600, last 20 per device
```

On start, for each agent with a `devices` folder: `addAgent`, `pinDevice` for each saved device, then `refresh`. Saved state is never trusted as ownership: it says what to ask. On
`onStateChange`, write each changed agent's part atomically. Private keys are never in a snapshot.

An agent's address is `agent.metadata.amp.address`. An agent with no AMP identity cannot own a device; the dialog says so.

## 6. API

Built: all of these except `propose`, which comes with step 5. `GET .../snapshot` serves the newest picture to the screens.

| Route | Does |
|---|---|
| `GET /api/agents/[id]/devices` | `inventory()`. `?refresh=1` refreshes each. Empty list when it has none |
| `GET /api/agents/[id]/devices/identity` | The agent's public key and address, for pairing. Creates the key |
| `POST /api/agents/[id]/devices` | `{ key, endpoint, name }`: `registerDevice`, or `pinDevice` for a `reverse` endpoint |
| `POST /api/agents/[id]/devices/[key]/refresh` | Ask the device again who owns it, for example after running `assign` on it |
| `POST /api/agents/[id]/devices/[key]/jump` | Make it active. `DELETE` on the same path clears the active device |
| `POST /api/agents/[id]/devices/[key]/invoke` | `{ capability, args }`. A snapshot is saved; the answer has its path, not the bytes |
| `POST /api/agents/[id]/devices/[key]/media` | `{ kind, seconds }`: bounded capture; the answer has a file path |
| `POST /api/agents/[id]/devices/[key]/propose` | `{ change, expectedRevision }`, and status of a request |
| `DELETE /api/agents/[id]/devices/[key]` | Forget it here. It does not unpair the device, and says so |
| `GET /api/devices` | Every agent's devices on this host. Local only: a host never calls a peer's |

`[id]` is a registry id. An agent on another host is reached by asking that host, as the Doctor does. Errors keep their signed meaning: `denied`, `hardware_unavailable` and `invalid_arguments`
are answers, not failures. Pending is never shown as success.

## 7. The agent's tools

The role asks for a fixed list of operations and no shell. The reference controller uses MCP. AI Maestro uses a CLI over its local API, like `aimaestro-task.sh`, so it works for every agent
program and needs no per-agent setup. The script belongs to the protocol:

```
adp-device.sh list | jump <device> | health <device>
adp-device.sh snapshot <device> | listen <device> <seconds> | watch <device> <seconds>
adp-device.sh show <device> <text> | show-image <device> <file> | say <device> <text>
adp-device.sh run <device> custom.owner.action [--arg value]
```

An image or audio result is a file path the agent reads. The `agent-devices` skill and `adp-device.sh` live in the protocol repo, as AMP, AID, AAP and AFP keep theirs, and the plugin pulls them through its manifest.

`say` uses the agent's own voice when it has one, the host has local speech, the device is active and it allows `speaker.play`: the host makes speech a sentence at a time and plays each. Otherwise the device speaks with `speaker.say`. See F092.

## 8. Events

`onEvent` is the single way in. Failed deliveries are retried by the SDK, so delivery must de-duplicate by event id.

| Event | What AI Maestro does |
|---|---|
| `device.input` | Deliver to the agent as a person's words from that device, never as a system instruction and never as a named person (F082) |
| `online`, `offline`, `revoked` | A notice to the assigned agent by AMP, and the status feed |
| `activated` | The status feed (F083) |

Text from a device is untrusted input.

## 9. Screens

Reuse `components/AgentHomesSection.tsx`, `app/agent-homes/page.tsx` and their layout from #791. Replace `services/agent-homes-service.ts` and the `ADP_DASHBOARD_DIR` shared folder with this spec's API.

- **Agent profile → Homes:** devices with state, capabilities, grants, last seen, active marker; Jump, Health, Snapshot; Add a home; Forget.
- **Agent Homes page:** every device of every agent on every host, fetched per host in parallel, like the Doctor.
- **Add a home:** shows the agent's public key and address and the exact command for the device, then asks for its key, address and a name.
- **Changes:** Transfer, Unassign and Camera show "Waiting for approval on the device". They are never shown as done until a signed confirmation arrives.

## 10. Agent moves and hosts

- A device's endpoint is a routing hint. When an agent moves to another host, its key moves (F081). HTTP devices keep working. A device that opens its own connection still points at the old host: **open question for the protocol** (section 13).
- Transfer to an agent on another host: `propose` runs on the current owner's host. The new owner's host then registers the device with its own agent key.
- Hosts offline: the Agent Homes page says which host did not answer. Later this reads from the town registry (F089).

## 11. Tests

- The protocol's conformance suite, `tests/conformance/controller-contract.mjs`, run against an adapter over `agent-devices-service`. This is the main check that AI Maestro implements the role.
- A hash test for the SDK copy.
- Storage: save, restart, restore; a saved owner is not trusted until refresh; no private key in `state.json`.
- Two agents on one host: each sees only its own devices, and a call through the wrong agent id is 404.
- An agent with no device writes nothing and starts no timer.
- Event de-duplication.
- The plugin script against a fake API.
- Real check: Lola on mini-lola and the 2010 MacBook. Protocol #1 and #2 stay open for this: camera, microphone, and a real chat.

## 12. Delivery

| Step | Repo | Contents |
|---|---|---|
| 1 | ai-maestro | SDK copy, controller on `globalThis`, storage, service, routes, conformance |
| 2 | ai-maestro, plugins | Agent tools and skill; Homes screens from #791. Close #791 and #99 |
| 3 | — | Real check with Lola and the MacBook. Tell ai-maestro-app the API |
| 4 | ai-maestro | Hub and device-opened connections; events to agents (F082); active device on screens (F083) |
| 5 | ai-maestro | Transfer and permission changes (F079); Doctor checks (F084) |

Phones through companion mode (F080) wait for live media over device-opened connections, which the protocol has not done.

## 13. Open questions

1. **Publishing the SDK as a package**, in place of the copy.
2. **A device with no screen or button** cannot approve a change: protocol #10.
3. **A device that opens its own connection when its agent moves host.** It keeps calling the old host. Does it need a signed redirect?
4. **Final or temporary refusals:** protocol #22. It must land before devices connect in (step 4).
5. **Port 23112** on the Tailscale address, or a path on port 23000? The server already upgrades sockets, so a path means one less open port, if the hub can attach.
