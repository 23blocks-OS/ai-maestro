# F078 — Agent devices, phase 1: an agent's own computers and cameras, paired and usable from its session

**Status:** Todo (spec: [docs/SPEC-AGENT-DEVICES.md](../docs/SPEC-AGENT-DEVICES.md), steps 1 to 3)
**Type:** Feature
**Created:** 2026-11-05

## Description

An agent can own external devices (an "agent home" such as a Linux laptop, or an accessory with its own bridge)
and use them from its normal session: "which devices are mine?", "check the laptop's health", "take a camera
snapshot". The operator pairs a device to an agent from the dashboard and sees every device, its owner and its
state.

The device side exists: `23blocks-OS/ai-maestro-device-protocol` (protocol v1, the SDK in `packages/sdk`, the
Linux bridge in `clients/linux`). It signs every request and reply with Ed25519, uses a one-time challenge per
request, offers only `device.health` and `camera.snapshot` (no shell, no paths), and the bridge's signed
registration names the one assigned agent (`assignedAgent`, a full AMP address). A device is paired by hand on
the device with its CLI (`pair <controller key> --agent <address>`). A pairing exists today: Mini Lola and the
2010 MacBook.

What AI Maestro adds in this phase (GitHub #788, and the read-only half of #789):

1. **A device key per agent, kept by the server** (for example `~/.aimaestro/agents/<id>/device/identity.json`,
   mode 600), created on first use. Its public key is what the operator pins on the device.
2. **Pairing from the dashboard.** In the agent's profile: "Add a device". The dashboard shows the agent's device
   public key and the exact command to run on the device (`node clients/linux/cli.mjs assign <address> <key>`), then
   the operator pastes the device's public key and its address (a Tailscale IPv4 origin, port 23110; the protocol
   accepts only loopback and Tailscale addresses). AI Maestro pins it and runs
   a signed discovery; it saves the device only when the signed registration names this agent.
3. **The agent's tool**, in the plugin: `aimaestro-device.sh list | health <device> | snapshot <device> [-o file]`.
   It calls the local AI Maestro API for the agent it runs as (`AIM_AGENT_ID`); the server signs with that agent's
   key through the SDK and returns the result. A snapshot is saved as a JPEG file and the path returned. A skill
   (or a section of an existing one) says when to use it.
4. **A Devices page (read-only)**: every device on every host, its stable key, its owner (from the last verified
   registration), capabilities, last confirmed contact, and the states unassigned, offline, and owned by another
   agent (the device was re-paired on the device itself). Accessories attached to a home are shown under it.
5. **Events**: the device's `device.registered` notice goes only to the assigned agent, through AMP as today. An
   AMP message never grants device access.

Out of scope: changing the owner from the dashboard (F079), live audio and video (AMP-RTC, F050), devices other
than the Linux bridge.

A device is optional: most agents have none and are complete without one. An agent can have **many devices** (kitchen,
office, car) and jumps between them: **only one is active at a time**, and each
device has at most one owner. This is required of the protocol too (Juan, 2026-11-05): decision 5 in the spec, and
device-protocol issue #7, which comes first.

## Why It's Needed

Agents act only on the host they run on. Giving an agent its own hardware (a laptop to watch, a camera, later a
speaker or a screen) makes it a presence in a place, not only a terminal. Lola checking her own Linux laptop is
the first case.

## Business Case

- Positioning: agents with their own devices, owned and auditable, is a step beyond coding agents in tmux.
- It reuses AMP identity and the signed device protocol already built; the new code is the binding and the UI.

## Implementation Plan

- **Isolation decision (Juan, 2026-11-05): AI Maestro does not isolate agents from each other on the same
  machine.** Agents on one host run as one system user and can read each other's files (as B021 records). The tool
  works only for the agent it is called as, and the server shows a device only to its assigned agent; that
  prevents mistakes, not a deliberately misbehaving agent on the same host. The #788 criteria that ask for
  isolated signing on one host are not part of this feature.
- Server: `services/agent-devices-service.ts` (pure functions, `ServiceResult`); the SDK from the protocol repo
  as a dependency (package or vendored copy, decide when starting; it is ~150 lines with no dependencies). Storage
  per agent next to its other files. Next routes and `services/headless-router.ts`:
  `GET /api/agents/[id]/devices`, `POST /api/agents/[id]/devices` (pair), `POST /api/agents/[id]/devices/[key]/invoke`
  `{capability}` from the closed list, `DELETE` (forget on this side only).
- A call goes from the agent's own host (it holds the agent's key). The Devices page asks each host for its
  agents' devices, as the Doctor page does, never a peer's full report in a loop.
- Before showing or invoking, check that the last signed registration names this agent; when it names another,
  show "owned by <address>" and refuse.
- Tests: two agents on one host, only the assigned one lists and invokes; a device re-paired on the device to
  another agent stops working for the first one at the next call; a test double of the bridge (the protocol repo
  tests already start a loopback bridge). Real check: Lola and the MacBook (health; snapshot only with the camera
  granted on the device).
- Plugin: the script and skill, version bump, as usual.
- GitHub: #788, #789 (read-only part). Related: F079, F050, B021, `types/person-device.ts` (people's devices,
  a different registry; keep them apart).
- Effort: M.

## Update 2026-11-06

The protocol now defines the controller role and ships a host SDK, so the spec was rewritten. Where this item differs from the spec, the spec wins: AI Maestro embeds `Controller`, reuses the screens from #791 and the skill from plugins #99, and the protocol's conformance suite is the main test. Node 24 is done.
