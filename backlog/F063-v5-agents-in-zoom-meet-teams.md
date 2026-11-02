# F063 - V5: Agents join real Zoom, Google Meet and Teams meetings

**Status:** Todo (backlog; after V3)
**Type:** Feature
**Created:** 2026-11-02

Stage 5 of 5 in F050.

## Description

An agent joins a meeting on another platform, listens, answers when spoken to, and takes notes or tasks back to AI Maestro. Three ways in, from simplest to richest:

| Way | Protocol | What the agent can do | Requirements | Status |
|---|---|---|---|---|
| **A. Dial in by phone** | SIP trunk to the PSTN, the meeting's dial-in number, meeting id and passcode as DTMF tones | Listen and speak (audio only, narrow-band phone quality) | A SIP/phone provider key (Twilio about $0.014/min outbound, Telnyx, or LiveKit SIP). Zoom toll dial-in comes with every plan, no add-on (toll-free and call-out need Audio Conferencing); Meet has US/Canada dial-in on all Workspace editions; Teams needs the organizer's Audio Conferencing licence. A waiting room can hold the bot | Not built |
| **B. Meeting bot service** | the provider's API; the bot joins as a participant | Listen, speak, show a video or avatar, read chat | A Recall.ai (or Attendee, self-hosted) key; about $0.50 to $1.50 per hour | Not built |
| **C. Platform app integration** | Zoom Meeting SDK (Linux bot), Teams bot (Azure), Meet (browser bot only) | Join as a named app, raw audio and video. Zoom's room connector (SIP/H.323, $49 per port per month) is for meeting-room hardware; nothing confirms Zoom allows a software agent there, so the SDK is the official route | Each user registers their own Zoom app (BYOK style). Own-account meetings: no review. Other accounts' meetings: OBF token, an authorizing user present, app review (since 2026-03-02). Meet: the Media API closes 2027-01-15; a browser bot is a terms-of-service grey zone. Teams: a Windows VM in Azure | Not built |

## Why It's Needed

Most meetings happen in Zoom, Meet or Teams, not in our app. An agent that can sit in a customer call, answer a technical question and come back with the tasks is useful to every team, without asking anyone to install AI Maestro.

## Business Case

- Way A reuses V1 (same voice layer, the audio comes from a phone line instead of the app) and works with every platform that has dial-in, for cents per minute.
- Way B is the shortcut to video and to platforms without dial-in.
- Way C is the polished product, but needs app review and per-platform work; do it only for Zoom first, and only once A or B shows people use it.

## Implementation Plan

1. **Way A first (M).** Outbound SIP call through the user's provider key; dial the number, send DTMF (Zoom: meeting id `#`, participant `#`, numeric passcode `#`; Meet: PIN `#`); bridge the phone audio (G.711 at 8 kHz) into the V1 voice layer. OpenAI Realtime accepts SIP directly (`sip:<project>@sip.api.openai.com`), so a Twilio trunk can point at it; otherwise LiveKit SIP or Twilio Media Streams (WebSocket, $0.0044/min) do the bridge. An invite parser: paste the Zoom/Meet/Teams invite, the agent finds the number and codes.
2. **Way B (S to M).** A Recall.ai adapter behind the same interface.
3. **Way C, Zoom only (L).** A Zoom Meeting SDK bot on a Linux host, the user's own Zoom app and keys.
4. **Disclosure.** The agent announces itself as an AI and as a note taker when it joins; it does not record without the host's consent.

Effort: A is about one cycle after V3; C is several.
