# Spec: People, calls and meetings

**Status:** Draft for review (2026-10-29). Nothing here is built. Backlog: F050 (umbrella), F051-F057, B019.
**Goal:** several humans and several agents working together, with a real call experience (like FaceTime) and a real meeting experience (like Zoom).

## 1. Where we are

- The "call" in Companion is a simulation: `components/MobileCallOverlay.tsx` switches to "connected" after a fixed 2.5 seconds (B019). Companion has no audio connection.
- What works is a voice loop: the phone turns speech into text (`voice:transcript` over `/companion-ws`), the agent answers in text, the phone speaks it. Useful, but not a call: no ringing, no interruption, several seconds of delay.
- The Zoom View is a grid of agent cards and terminals, not an audio room.
- People were free text: agents have `owner` and `humanManager` strings (`types/agent.ts`). Since 0.106.28 `humanManager` holds a person id from the directory (chosen in the agent profile's Reports to, or linked from old text with `/api/agents/manager-links`); older text still works and is shown as is.
- Other work in flight: seven draft PRs and four issues (#697-#700, #701-#710) and six AMP protocol drafts (agentmessaging/protocol #22-#24, #26-#31). Reviewed in F050-F056. None runs a call.

## 2. Principles

1. **No authentication, by design.** The network is the trust boundary. The operator who adds a person is the authority. Say in the docs that per-person permissions are policy in a trusted network, not a security boundary.
2. **People are not on a host.** A person is in the real world with an app that connects to the hosts they use.
3. **Same cross-host pattern as agents.** Nothing is replicated. Each host keeps its own records; a view asks the peer hosts (as `lib/owning-host.ts` and the Org page do).
4. **Agents come first.** The call and meeting features serve agents and people alike; a tmux session stays optional.
5. **Prove before building.** One cheap slice, measured, before media servers and native apps.
6. **The status has one source.** "Online" for a person comes from one feed, like agent status (`presenceOf`).

## 3. The humans directory (F057)

### 3.1 Record

| Field | Notes |
|---|---|
| `id` | Our own UUID, never reused. Agents' `owner` and `humanManager` migrate to reference it |
| `source`, `externalId` | Where it came from (`manual`, `scim:<tenant>`, `ldap:<name>`) and the directory's stable id. Key on the directory GUID (Entra object id, AD objectGUID, LDAP entryUUID), never on UPN or email |
| `displayName` | Required |
| `givenName`, `familyName`, `email` | Optional (SCIM clients such as Okta require them, so accept them) |
| `phone` | Optional, stored as E.164; used by a later phone integration, not by calls today |
| `title` / `role` | Free text plus an optional role for policy |
| `active`, `deactivatedAt` | Soft delete. A deactivated person stays in the record, loses devices and permissions, and is hidden from calls and meetings |
| local only | Paired devices, per-agent permissions, notes. Never overwritten by a sync |

Each field is marked **synced** or **local**. Synced fields come from the directory and are overwritten by the next sync (edits in the UI are blocked and shown as such).

### 3.2 Where it lives, and how hosts see each other

Each host has a directory. The operator adds or edits a person on the host they work on. Other hosts list people by asking their peers. There is no copying, so no merge or conflict. A person is reachable through whichever hosts their app is connected to now (live presence from the app); with none, they are offline.

### 3.3 Directory providers

A provider interface writes the same records.
- `manual` (open): add, edit, deactivate.
- Paid, later: **SCIM 2.0 server** (`/scim/v2/Users`, `/Groups`) first, because Entra ID and Okta both push to it and it covers the most directories for the least work. Then **LDAPS read sync** for on-prem AD and OpenLDAP. Then **Google Directory API** pull (needs domain-wide delegation; the research on this is secondary-source only).
- Not applicable: SAML/OIDC and just-in-time provisioning, because they need a login.

SCIM requirements recorded by the research (read from vendor docs unless marked): HTTPS; bearer token; PATCH support; filters on `userName`/`externalId`; soft delete with `active` and inactive users still returned by GET; Okta requires `userName`, `name.givenName`, `name.familyName`, `emails`, `active` and a stable case-sensitive `id`. **Tension to note:** the SCIM endpoint is the one place that needs a shared secret, because a cloud directory reaches it. That does not change the rule for the UI.

Sync rules: the directory is the source of truth for synced fields; local fields are never overwritten; a user missing from a **fully read** sync is deactivated, a failed or partial read deactivates nobody; a mass-change threshold needs confirmation (Slack deactivated users wrongly in an April 2024 incident). Keep `lastSyncedAt` and the source per person.

Libraries worth checking before building (versions and licenses to be confirmed on npm): `scimmy` (SCIM toolkit, MIT), `ldapts` (TypeScript LDAP client, MIT), `libphonenumber-js` (E.164 parsing, MIT). The Microsoft Graph client looks dormant; plain `fetch` with a client-credentials token is lighter.

### 3.4 Privacy

Names and phone numbers are personal data. Keep what is needed; make phone optional; on deactivation keep an id and a tombstone, not the phone number; return only needed fields to peers. Retention and lawful basis need legal advice (not provided by the research).

### 3.5 Permissions between people and agents

Who may talk to which agent, and who may see an agent's memory. Model it after lolad's policy file (`CamiloCaceres/lolad`, `org.yaml`): explicit rules in order, first match wins, then defaults, anything else denied **with a reason** shown in the UI ("why was this blocked?"). Defaults: any person may message any agent; memory and approvals are per agent. Not enforcement against a hostile device; policy for a trusted network.

### 3.6 Pairing the app (F057 step 2)

The app is the person's side. It shows People (from `GET /api/people` on each host it uses), the person picks "this is me", and the app tells **every host it is connected to**:

- `PUT /api/people-devices/:deviceId` with `{ personId, personName?, deviceName?, platform?, appVersion? }`. `deviceId` is generated by the app once and kept (8 to 64 letters, digits, `-`, `_`). Send it again every ~30 s as a heartbeat.
- `GET /api/people-devices[?personId=]` lists the devices paired to that host, each with `online` (seen in the last 90 s).
- `DELETE /api/people-devices/:deviceId` unpairs.
- Minimum host version: **0.106.16**.

**Push (host 0.106.17).** The same `PUT` also carries `pushToken` (an Expo push token) and `pushTypes` (`needs_you`, `card_waiting`, `call`). `pushToken: null` or `pushTypes: []` clears the token; leaving both out keeps what is stored, so the heartbeat can omit them. The token is never returned by `GET`; the record shows `pushEnabled` and `pushTypes`. Unpairing removes the token with the device. Only `needs_you` is sent so far: when an agent starts waiting on a person (`broadcastActivityUpdate`, the one place that normalises hook status), the host POSTs to Expo for every device that opted in. The message is the agent's name and a fixed sentence (`"<agent> needs you"`), plus `data: { type, agentId, hostId }`; `channelId: needs_you`, `interruptionLevel: time-sensitive`. Never command text, paths, message bodies or card text. Rules: one push per agent per minute (host side; Expo has no collapse key we rely on); a token Expo reports as `DeviceNotRegistered`, in the ticket or in the receipt checked 15 minutes later, is removed; no retries; a host that cannot reach `exp.host` logs one line and sends nothing. Agent names are visible to Expo, Apple and Google, which the privacy page must say. Not yet routed per person: every opted-in device on the host gets it, until agents have an owner (`owner`/`humanManager` migration, section 8).

Devices are stored per host, not on the person record, because the person's record lives on one host while their app can be connected to several. A host that does not hold the record still accepts the pairing (it keeps the name as a snapshot). A person is online when any host has a recently seen device for them. This is a label in a trusted network, not a login. The heartbeat is replaced by the host's own app connection when calls arrive (F051).

## 4. One-to-one calls (F051, F052, F053, B019)

**Experience:** tap Call on an agent (person to agent) or an agent rings you (agent to person); the other side sees ringing, accepts or declines; you talk with natural turn-taking and can interrupt.

**Call state machine:** `inviting → ringing → accepted → connected → ended`, with `rejected`, `canceled`, `timed_out`, `failed`. Start from draft PR #701 (pure, six tests pass in CI) with two fixes: require the accepting device id on `connected`, and add a timeout for `accepted` that never reaches `connected` (also missing from the protocol draft). First answer wins on one host with a lock per call. Store behind an interface; a file-backed store first (PR #709's Postgres store does not fit a product that needs nothing else running, and its UUID columns would reject the protocol's opaque ids).

**Call API (host 0.106.19, signalling only, no media).** `POST /api/calls { caller, callee, ttlSeconds? }` starts a call (`inviting`, 30 s by default, at most 120). `GET /api/calls` and `GET /api/calls/:id` read it. `POST /api/calls/:id/events { type, eventId, actor, deviceId? }` applies `rtc:ringing | accept | reject | cancel | connected | end | failed`; `deviceId` is required on `accept` and `connected`. The store applies each event one after another, so of two phones answering together the first wins and the second gets 409. Repeating an `eventId` is safe (200, `duplicate: true`). Refusals: 400 bad event, 403 not a party to the call or not allowed to send that event, 409 the call is not in a state that takes it, 410 too late (an unanswered call after its time, an answered call that did not connect within 15 s). `actor` is claimed, not checked: a label in a trusted network, like device pairing. Callers and callees are free-form ids (`person:<id>`, `agent:<id>`, or an AMP address) until agents have an owner. Calls are files in `~/.aimaestro/calls/`; finished calls are deleted a day after they end, and at most 1,000 are kept. A connected call that nobody ends (the phone died, the tab closed) times out after 4 hours. A call whose time ran out can still be ended or failed by its parties until someone reads it. Paired devices not seen for 30 days are forgotten (at most 500 kept).

**Ringing the phone (host 0.106.20).** Starting a call whose callee is `person:<id>` sends one Expo push to that person's paired devices that opted in to `call`: title `"<caller> is calling"`, `data { type: call, callId, hostId }`, `channelId: call`, time-sensitive, with `ttl` set to the seconds of ringing left so Expo does not deliver a stale call. An agent callee has no phone and gets no push. The app then reads `GET /api/calls?callee=person:<id>&active=1` (also `?caller=`) to see the call and answers by posting events. One ring per callee per 15 seconds. The title names the caller only when this host knows them (an agent in its registry, a person in its directory); anything else reads "Someone is calling". A cancel or answer elsewhere does not retract the push yet.

**Signaling:** call control events travel as ordinary signed AMP messages with custom `rtc:*` types between agents and between instances. Between a person's app and its host, a direct connection (the existing `/companion-ws`). The state machine decides; the UI shows `connected` only after the media is up.

**Media, in stages:**
1. Browser to agent, direct WebRTC peer connection (drafts #705/#710 as a base), with a fast **voice layer**. Needs HTTPS for the microphone, which is not available on plain `http://` on the network; use HTTPS (for example Tailscale certificates). Fix the early-ICE-candidate bug in #710 first.
2. The AI Maestro app with native incoming-call screen (iPhone PushKit and CallKit; Android equivalent) in the app repo (`ai-maestro-app`). Check first whether a plain high-priority push gives most of the value without Apple's VoIP-push policy risk.
3. Phone numbers later (section 7).

**The voice layer (the hard part).** An agent running in a terminal answers in seconds. A natural call needs a small fast model that talks with the person and hands real work to the working agent, then reports back. The Cerebellum voice subsystem is the starting point. Also decouple voice from Claude Code's files (issue #237) so any agent can have a voice. Speech to text and text to speech providers and cost per minute are undecided.

**Fallbacks:** if audio is unavailable the text chat keeps working; a call never replaces it.

## 5. Meetings (F054)

**Experience:** a room in the Zoom View with several people and several agents; people talk and hear each other and the agents; invite, join, leave, mute; the room ends cleanly.

- A room is distinct from a one-to-one call (`room_id` vs `call_id`). A call can become a room only with everyone's consent.
- **Turn-taking:** directed requests ("Lola, summarize") go to the named agent; for an undirected question a coordinator picks one agent or queues; human speech cancels queued agent speech; agents never all answer at once.
- **Privacy:** a person in the room does not inherit an agent's tools or memory. A meeting transcript is separate from an agent's private context.
- **Media topology:** a media server (selective forwarding) for more than two participants, not a mesh. Start with one human and several agents, then several humans.
- **Recording and transcription** off unless explicitly agreed by everyone, visible while on.
- Rooms wait until one-to-one calls and the directory ship.

## 6. Relationship to AMP (F056)

- AMP carries signed control between agents and between providers. Media is separate and provider-neutral.
- **Human identity is not an AMP matter.** The directory and device pairing are an AI Maestro feature. The protocol should not require providers to authenticate humans (AI Maestro could not conform).
- The protocol drafts (sections 13-18) lack a wire format, a signaling channel for call setup details, and a timeout for accepted calls; they should not be merged as numbered sections yet. Keep one short experimental proposal and write the wire format from what actually ran, as was done for `notify:v1`.
- Pairing a person's app with a host can borrow lolad's invite-code approach (single-use, expiring, stored hashed, rate limited; see F043) while avoiding its listed weaknesses.

## 7. Phone numbers (later)

Humans already have real numbers; store them now (E.164, via `libphonenumber-js`, default country asked at parse time). A phone provider (SIP trunk or similar) is one more media adapter behind the same interface and a number mapping in the directory. Giving agents numbers and letting them call anybody brings consent, AI-caller disclosure, caller-ID verification and robocall rules that differ by country; settle these before launch. Caller ID is a hint, not proof: do not grant permissions from it.

## 8. Order of work

1. **Directory** with `manual` provider, People page, API, headless router entries, multi-host tests; migrate `owner`/`humanManager` to person ids. (M)
2. **Pairing** of the app with a host (invite code). Attribute chat messages and approvals to people.
3. **Call state machine** (#701 with fixes) and a **simulated call**, feature-flagged; fix B019.
4. **Spike:** one-to-one browser call with the voice layer; measure delay and cost per minute. Decide go or no-go on real audio here.
5. Native incoming call on the app. 6. Rooms. 7. Paid directory sync (SCIM, then LDAP). 8. Phone numbers.

## 9. Open questions

- Delay target for a call that feels natural, and which models reach it at what cost.
- Speech to text and text to speech providers; on-device vs server.
- How a call's audio reaches an agent running in a terminal (the design forbids scraping the terminal; no other path exists yet).
- Apple VoIP-push policy; who builds the iOS side; ownership of the developer account.
- Maximum participants and cost controls for rooms.
- Whether the same app can pair with more than one host at once (assumed yes).

## 10. What is verified and what is not

Verified in this repo: the simulated call timer, the free-text owner fields, the peer fan-out pattern, the organization records that live on their host, the CI results of #701. Verified in the protocol repo: custom types, `expires_at`, idempotency, replay window, capability advertisement. Read from vendor documentation: SCIM requirements of Entra ID and Okta. **Not verified:** Google Directory API details, Graph permission names and delta query, GDPR guidance specific to directories, the current versions and maintenance of the libraries named above, and every cost or latency estimate (none exists yet).
