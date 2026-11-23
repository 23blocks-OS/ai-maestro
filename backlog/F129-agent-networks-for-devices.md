# F129 — An agent's Wi-Fi networks, set up on its devices by AI Maestro

**Status:** Todo
**Type:** Feature
**Category:** Mobile toy (Bruce)
**Created:** 2026-11-23

## Description

An agent's settings get a list of Wi-Fi networks (name and password) for the boards it lives in. AI Maestro puts them on the board in two ways:

1. **Ahead of time:** while the board is connected (at home), AI Maestro sends the list over the encrypted device connection. When the person adds a network in the settings, every board of that agent gets it.
2. **On the spot, from the phone:** when the board finds no known network, it opens a Bluetooth setup mode by itself. The AI Maestro app sees it ("Bruce's toy needs a network"), the person picks a saved network or types a new one, and the app sends it with Espressif's provisioning protocol (BLE, security 2, the setup code from pairing). A new network typed on the phone is also saved to the agent's list.

Protocol work is in the ADP repository: [F010](https://github.com/agentmessaging/agent-device-protocol/blob/main/docs/wiki/backlog/F010-board-wifi-networks.md) (board side and the spec for device network setup).

## Why It's Needed

Juan, 2026-11-23: "the toy will travel with the user (Bruce), so I cannot have it connected to just a single wifi and flash it every time there is a new network"; "instead of using another app, can we make the AI Maestro app set up the agents' networks for their devices? Can we add that network list to the agent properties?"

Today the network is built into the firmware. Espressif's own app would work, but it is one more app, it does not know which agent or board, and it asks for the password each time.

## Business Case

- A board in a toy is only useful if it works outside the house; this is what makes the mobile toy a product.
- One app for the person: the phone that already talks to the agent sets up its body.
- Strategic: no other agent platform sets up an agent's devices from the agent's own settings.

## Implementation Plan

- **Where the list lives (evaluation):** on the agent, as asked. The passwords go in the vault (`aim-secret`), with the agent record keeping only names and vault references. Never write a password to `registry.json`, logs or API answers. A home network is usually shared by all agents: a later step could keep one owner-level list that each agent picks from; start per agent.
- **Settings UI:** a Networks section in the agent's device settings (add, remove, order; the password field is write-only).
- **Push:** a new ADP capability (name set by the spec), sent only over `/v1/secure`, only to boards that declare it, after every change and on connect. The board answers with names only.
- **Phone app:** Bluetooth (a React Native BLE module) and an ESP provisioning client; a "set up a network" screen that the app opens when a board of the person's agents is in setup mode. The setup code comes from pairing (the board's label), kept in the vault.
- Depends on ADP F010 (spec and firmware) and on F130 (a new network does not reach a home controller).
- Effort: L (settings and push M, phone BLE M, plus the firmware in ADP).
