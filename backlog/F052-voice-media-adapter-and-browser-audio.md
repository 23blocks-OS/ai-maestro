# F052 - Real-time audio: media adapter and browser microphone (issue #698, PRs #705 and #710)

**Status:** Todo (deferred until the F050 stage-1 result)
**Type:** Feature
**Created:** 2026-10-29

## Description

An interface for audio sessions with short-lived join grants and an agent voice adapter (PR #705, types only), a browser microphone hook and a WebRTC peer (PR #710), and the issue (#698) that asks for one concrete adapter, LiveKit first. Part of F050.

## Why It's Needed

Real two-way audio is what turns a ringing phone into a conversation. It is the largest and most expensive part of the workstream, so it should follow proof that calls are wanted.

## Business Case

Today's voice path works and is cheap: the phone turns speech to text on the device and sends text over `/companion-ws`; the agent answers with text that is spoken on the device. WebRTC would move speech to text and text to speech to the server: new cost per minute, new latency to tune, barge-in to build. The benefit is hands-free calls from anywhere and a call that is a first-class object. Worth it only if the cheap slice shows demand.

## Implementation Plan

**#705 media interfaces.** Reasonable, but nothing uses them, and they mix one-to-one calls and rooms in one interface (`createCall` and `createRoom`). Hold until there is a consumer; do not merge types ahead of the code that needs them.

**#710 browser audio.** The code is tidy and the cleanup is careful. Problems to fix before it merges:
- **Browsers only give a microphone to secure pages.** AI Maestro is served over plain http on the local network (port 23000, bound to all interfaces). `getUserMedia` fails there except on localhost. Companion calls from another machine need HTTPS (for example Tailscale's certificates), which changes the deployment story. State this in the design.
- ICE candidates that arrive before the remote description is set make `addIceCandidate` throw. Queue them until the description is applied.
- No handling for both sides sending an offer at once, no ICE restart, no TURN configuration (stated in the PR).
- No test; CI ran only the existing suite.

**#698 adapter.** LiveKit pulls in a media server and a vendor. If we go ahead, start with a direct peer connection for one-to-one calls and keep LiveKit for rooms (F054).

Related and independent: issue #237 (voice commentary reads Claude Code files directly) blocks voice for non-Claude agents and is worth doing regardless; any agent voice pipeline here should not repeat that coupling.

Unknown: speech-to-text and text-to-speech provider, cost per minute, and how audio reaches an agent that runs in a terminal (the design says not to scrape the terminal; there is no other path yet).
