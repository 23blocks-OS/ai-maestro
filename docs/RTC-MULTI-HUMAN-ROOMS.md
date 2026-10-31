# Multi-human, multi-agent RTC rooms

**Status:** Draft implementation plan. Companion to `docs/RTC-COMPANION-ZOOM-INTEGRATION.md` (PR #702).

## User story

Two or more authenticated humans can join the same AI Maestro voice room alongside one or more agents. Each person can talk and hear other participants, invite agents, and leave independently. Agents can be addressed by name, speak with interruption support, and continue authorized work during the meeting.

## Separate calls from rooms

A `call_id` tracks a one-to-one invitation and its lifecycle. A `room_id` tracks a shared meeting, its membership, media state and policy. A call MAY be escalated into a room through an explicit invite/consent flow; never silently promote a private call.

## Room model

- Room: `room_id`, owning organization, creator, created/ended timestamps, visibility, retention policy, media adapter reference.
- Participant: human or agent principal, device/session ID, joined/left timestamps, role (host/moderator/member/agent), audio state, capabilities.
- Invitation: invited principal, inviter, expiry, status, one-time or revocable join grant.
- Roles and permissions: room join/invite/mute/remove/moderate permissions are independent of permissions to operate agent tools, read memories or view private messages.
- Rooms can be ad hoc first; scheduled rooms can be added later.

## Shared voice media

Use a pluggable WebRTC SFU adapter for multi-party audio. Clients publish microphone tracks and subscribe to authorized participant tracks. Agent participants use the same media gateway through a server-side agent audio adapter. Never distribute long-lived room credentials in AMP messages or push payloads.

## Meeting UX

- Zoom View becomes the primary multi-participant meeting view, retaining existing agent cards, status and text chat.
- Human participant tiles show identity, mute and speaking state; agents retain avatar animation.
- Show join/leave, participant list, active speaker, invite link (scoped, expiring), mute, hand raise, and leave/end-for-all.
- Companion remains the default one-to-one view; provide **Add people** / **Move to meeting** with explicit participant approval.
- All participants can see who is in the room; recording/transcription indicators are visible and require explicit consent and policy.

## Agent turn-taking

- Directed requests such as “Lola, can you summarize?” route to the named agent.
- For undirected questions, a room coordinator selects a responding agent or queues responses; agents must not all answer simultaneously.
- Human speech and interruption take priority over queued agent TTS.
- Keep a separate meeting transcript and agent-private context; never leak private agent memory to attendees without authorization.

## Protocol boundaries

AMP-RTC `rtc:v1` handles individual call invitations. A future optional `rtc-room:v1` extension should define room invitations, join/leave events and federation semantics, rather than overloading one-to-one state transitions. Media negotiation remains vendor-neutral.

## Rollout and verification gates

1. Two humans in one browser-based room: both hear each other, mute, leave and reconnect. Verify authentication and per-room authorization.
2. Add one agent: speech input, response and interruption work. Verify that private agent context stays private.
3. Two humans and two agents: directed turns and arbitration prevent simultaneous unsolicited agent speech.
4. Invite from another AI Maestro organization: scoped invitation and access policy verified.
5. Mobile join and background audio: native app behavior verified on actual devices.
6. Cross-provider room federation: only after protocol profile and independent implementations exist.

Keep this behind a separate feature flag until tests pass. No PSTN or phone number is required.

## Open decisions

- SFU provider/adapter and deployment model.
- Maximum participant count and cost controls.
- Host moderation, guest identity and invite-link policy.
- Room recording, retention and consent requirements.
- Whether external providers support room membership directly or via a federation bridge.
