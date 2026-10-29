# RTC integration: Companion, Zoom View and mobile calls

**Status:** implementation design / review checkpoint  
**Related:** #697 #698 #699 #700, draft PR #701; AMP spec PR agentmessaging/protocol#26

## Verified current code

- `app/companion/page.tsx`: FaceTime-style Companion popup uses `useTTS`, `useSpeechLevel`, `useCompanionWebSocket`, `CompanionInput` and an agent terminal. It renders an animated avatar and call controls, but does not establish a media call.
- `components/CompanionInput.tsx`: text input (including WhisperFlow keyboard-style dictation) POSTs to `/api/agents/:id/chat`; it does not capture microphone media.
- `components/MobileCallOverlay.tsx`: current ringing screen advances to connected after a fixed 2.5-second timer, without a real acceptance or media path.
- `app/zoom/page.tsx` and `components/zoom/AgentCardView.tsx`: multi-agent grid, cards and terminal/messages/profile/memory tabs, not a shared audio room.
- `docs/CHAT-ARCHITECTURE.md`: UI terminal WebSocket path differs from REST chat path. RTC must not silently assume these are equivalent.

## Product model

AI Maestro mobile app is the **full human client** for agent conversations, AMP messaging, approvals, status and voice calls; it is not a standalone dialer. Two call directions are first-class:
1. Human taps **Call** in Companion/agent profile to call Lola.
2. Lola sends an authorized AMP-RTC invitation to a registered human client, whose locked iPhone receives a native incoming-call UI through PushKit/CallKit.

No PSTN number or Twilio is required. Do not describe this as replacing the telephone network, Twilio or WhatsApp.

## Shared architecture (one backend)

```
Human app / Companion / Zoom UI
    ↕ authenticated RTC call API and event subscription
Call coordinator: durable state, permissions, device arbitration
    ↕ signed AMP rtc:v1 signaling (cross-provider when available)
Agent voice session controller
    ↕ pluggable media gateway (WebRTC; scoped short-lived credentials)
Audio pipeline: microphone ↔ STT / agent runtime / TTS ↔ playback
```

UI may render `connected` only after authenticated acceptance **and** media establishment. Keep text chat working while voice is unavailable. No new calls should depend on `tmux` terminal scraping for reliable delivery.

## FaceTime / Companion integration

- Extract a reusable `VoiceSession` hook/controller with explicit states: idle, inviting, ringing, accepted, connecting, connected, reconnecting, ended, failed.
- Replace fake call duration / automatic connect transitions with authoritative call state.
- Add real microphone capture, permission prompts, audio level, mute, output routing and end-call teardown.
- Preserve avatar animation, TTS voice settings, text fallback, and agent selection.
- Agent interruption and barge-in require cancellable TTS and turn coordination; do not stream audio directly into a terminal.
- Outbound human-to-agent calls use the same signaling as agent-to-human calls.

## Zoom View integration

- Start with **one human and multiple agents** in a room; later support multiple humans.
- Create `room_id` and participant identities distinct from one-to-one `call_id`; do not overload rtc:v1 one-to-one signaling until a room extension is agreed.
- A moderator/turn coordinator chooses which agent responds; support directed questions ('Lola, ...') and optional hand-raise/queue. Avoid all agents speaking at once.
- Use a selective forwarding unit (SFU) or equivalent scalable room topology, not an N-way peer mesh.
- Add join/leave, participant list, speaking indicator, mute, room teardown, and per-agent audio routing.
- Preserve existing grid, agent cards, status, messages and terminal tabs.

## Staged PR sequence and rollback gates

1. **RTC backend:** durable call coordinator, signed AMP integration, auth and feature flag. Gate: human→agent simulated call + agent→human invite, timeout and cancellation; no fake connected state.
2. **One-to-one media:** WebRTC media adapter + audio pipeline + browser Companion integration. Gate: live microphone/audio in both directions; independent text fallback; disconnect cleans resources.
3. **Mobile native:** device registration, APNs VoIP push, CallKit, background audio and iOS app integration. Gate: locked-screen incoming call, decline, cancel, timeout and audio after answer.
4. **Zoom room model:** room coordinator, participants, turn-taking and SFU adapter. Gate: human and two agents converse without cross-talk, with deterministic mute and teardown.
5. **Cross-provider interoperability:** independent AMP provider, media profile and failure/replay tests. Gate: no assumptions about AI Maestro as remote provider.

## Important open decisions

- Native iOS client framework and where its source lives in the repository.
- Whether to start with LiveKit or another SFU/WebRTC adapter; media is vendor-neutral at the AMP boundary.
- How agent voice turns connect to current agent runtimes without relying on terminal screen scraping.
- Consent, recording/transcription retention and user-level calling permissions.

This is a design checkpoint, **not** evidence that voice calling works yet.
