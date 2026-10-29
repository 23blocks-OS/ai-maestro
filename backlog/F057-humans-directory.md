# F057 - A directory of humans, owned by hosts the way agents are

**Status:** Todo (design agreed in conversation with Juan on 2026-10-29; nothing built)
**Type:** Feature
**Created:** 2026-10-29

## Description

A directory of the people who work with a team's agents. The operator running AI Maestro adds a person (name, role, optional phone number) and the person runs their own AI Maestro app, which pairs with the instance. This is the base for calls, meetings with several humans and several agents, and "needs you" requests that reach a named person. It is the one decision that unblocks F050-F056.

## Why It's Needed

Today an agent can only write to "the user". There is no model of who the users are. Every part of the voice workstream (F050 to F056) stops at the same question: who is the human, and which phone is theirs. Answering it also helps with no voice at all: messages and approvals attributed to a person, attention routed to the right one, who is online.

## Business Case

- It moves the product toward the future of work Juan describes: several humans and several agents working together, not one user with a fleet.
- It is a clear open/paid line: the manual directory is part of AI Maestro; syncing it from AD and corporate directories (LDAP, SCIM, SSO) is a paid feature, and the model does not change when it is added.
- It removes the hardest part of the protocol drafts (human identity, F056) from the standard and keeps it a product matter.

## Implementation Plan

**Agreed model (Juan, 2026-10-29).**
- No authentication, by design. The local network is the trust boundary, as for everything else in AI Maestro. The operator who adds a person is the authority; the person is expected to run their own AI Maestro app.
- Records: person id, display name, role, optional phone number (E.164, for a later phone-provider integration, not used yet), paired devices, per-agent permissions (who may talk to which agent).
- Directory source is a provider behind an interface: `manual` now; `directory-sync` (AD, LDAP, SCIM) later, in the paid version, writing the same records.
- Say plainly in the docs that, without authentication, an app states who it is and nobody checks; per-person permissions are policy in a trusted network, not a security boundary.

**Across hosts: the same way agents work today.** Agents are not copied between hosts. Each host's registry holds only its own agents; the dashboard fans out to peer hosts to show the rest; requests about a remote agent are forwarded to the host that owns it (`lib/owning-host.ts`, found by asking the peers, cached for a minute). Humans follow the same rules:
- A person is owned by one host, where the operator added them (their home host). Their app pairs with that host.
- Other hosts list people by asking peers, and route calls and approvals for a person to the owning host.
- If the home host is offline the person is unreachable, as an agent on an offline host is.
- Open question: can the same person exist on two hosts? Agents have one owner; start with one owner for people too, and add "move a person to another host" like agent transfer.

**Rules from the repo to follow.** Service in `services/` returning `ServiceResult<T>`, thin API routes, headless router entries, the single status feed for "online", multi-host tests from the start. Reuse the registry pattern (`loadX/saveX/getX/createX/updateX/deleteX`).

**Staging.** (1) Directory and API plus a People page; (2) pairing flow with the mobile app (repo `ai-maestro-app`); (3) attribute chat messages and approvals to people; (4) consume it from F051 (calls) and F054 (rooms). Effort: M for step 1, L for the whole.

**Related.** F043 (federation between people) is a different idea (linking separate teams); check whether it overlaps before starting. F050, F053, F054, F056.
