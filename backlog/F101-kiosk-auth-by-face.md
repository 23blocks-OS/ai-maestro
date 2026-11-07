# F101 — Kiosk auth: the owner proves it is them with a tap and a picture

**Status:** Todo (later)
**Type:** Feature
**Created:** 2026-11-07

## Description

At a kiosk, a person taps an "It's me" button. The device takes one picture, and the host compares the face with reference pictures of a person stored on the host. When they match, the device is marked as being used by that person for a while, and what is said there carries a verified identity: "Juan, verified at your MacBook by his face, 2 minutes ago" in place of "someone at your MacBook, not verified".

Juan's idea (2026-11-07). It is **not part of the device protocol**. It is a composition of what the protocol already has: `camera.snapshot` (with its camera grant and in-use sign), the device's own screen and controls, and the host. The comparison runs on the host or in the agent.

## Why It's Needed

A device cannot know who is speaking, so everything said at it is untrusted input, and the agent cannot take orders from it. With a verified owner, the agent can act on what the owner says at a device, the way it does for the owner's chat. It is also what F100's hand-off needs to say who asked.

## Business Case

- Agents at devices become useful for real requests from their owner, not only conversation.
- Positioning: a home or office device that knows its owner, with nothing sent to a cloud.

## Implementation Plan

- **Enrolment:** the person adds reference pictures of themselves, taken at a device or uploaded, stored on the host with their record in the People directory (F057). Mode 600, never sent to a peer, a phone or a browser, never in an agent's transcript.
- **The check:** the kiosk's button asks the host; the host takes one `camera.snapshot` (the person sees the in-use sign) and compares face embeddings against the references, locally. Library to choose: an on-device face embedding model under a usable licence; measure it on mini-lola and on the new Mac.
- **The result:** a short-lived "verified as <person> at <device>" state on the host, shown on the kiosk, cleared after a few minutes without input, when another face is seen, or with Stop. Device messages and F100 hand-offs carry it.
- **Limits to state plainly:** a face match is not strong proof. A photo of the person can fool a simple check (liveness is a separate problem), and it is weaker than a key. Use it for convenience-level trust, not for money, secrets or deleting things. The network is still the trust boundary.
- **Biometric data is special:** consent from the person enrolled, a way to delete it, and legal rules on biometrics that differ by country (EU GDPR special category, Illinois BIPA). To check before shipping.
- Related: F057 (people), F078 (devices), F095 (always listening), F100 (who asked). Effort: M, plus the model choice.
