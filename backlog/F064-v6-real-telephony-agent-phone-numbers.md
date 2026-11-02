# F064 - V6: Real telephony, each agent has its own phone number

**Status:** Todo (after V1; shares the SIP plumbing with F063 way A)
**Type:** Feature
**Created:** 2026-11-02

Stage 6 in F050.

## Description

An agent gets a real phone number. Anyone can call it from any phone, with no app; the agent can also place calls to phone numbers. "Call Lola at +1 305 555 0123" works the same as calling a colleague.

| Step | Protocol | Options (user brings the key) | Status |
|---|---|---|---|
| The number | a DID rented from a phone provider, one per agent | Twilio ($1.15/month local, $2.15 toll-free), Telnyx (about $1/month), LiveKit (one free US number) | Not built |
| Phone network to the provider | PSTN | the provider | — |
| Provider to the voice layer | SIP + RTP (G.711, 8 kHz), or the provider's media WebSocket | OpenAI Realtime SIP (`sip:<project>@sip.api.openai.com`), LiveKit SIP, Twilio Media Streams, ElevenLabs/Vapi/Retell SIP | Not built |
| Which agent answers | the dialled number maps to an agent on the host | ours | Not built |
| The conversation | the V1 voice layer and the `ask_agent` hand-off | V1 providers | Built in V1 (F059) |
| Outbound call | the provider's call API, then the same path | the provider | Not built |

## Why It's Needed

Not everyone has the app, and many of the people an agent works for or with (customers, suppliers, a colleague on the road) only have a phone. A number makes an agent reachable by anyone, and lets an agent make the calls a person would: confirm an appointment, chase a supplier, call the operator when the app is not installed. The same numbers can later receive text messages.

## Business Case

- Turns an agent into something that looks like an employee with a direct line. No other agent orchestrator gives each agent its own number.
- Cost on the user's account: about $1.15 per number per month plus about $0.01 per minute of phone time, plus the V1 voice cost.
- Reuses V1 (the voice layer) and the SIP work of F063 way A; it can be built before V3-V5.

## Implementation Plan

1. **Phone provider key and numbers (S).** Settings > Voice providers gains Twilio and Telnyx; buy or attach a number and assign it to an agent (stored in the agent's registry entry, so it moves with the agent).
2. **Inbound (M).** The provider sends the call to the voice layer over SIP; the dialled number picks the agent; the agent greets with its name and says it is an AI.
3. **Outbound (M).** A skill `call-a-phone` (next to `call-a-person`) places a call through the provider API, with a reason and a time limit.
4. **Who is calling, and what they may ask (S, before anything ships).** Caller ID can be faked, so a phone caller never has operator authority: by default the agent treats what they say as outside content, like an unsigned message. Optional: a list of known numbers per agent plus a PIN for anything that changes things. The operator decides who may reach which agent and at what hours.
5. **Voicemail and transcripts (S).** Missed or after-hours calls are transcribed and delivered to the agent as an AMP message; call summaries go to the operator.
6. **Rules (S).** Outbound AI calls: in the US the FCC treats AI voices as "artificial" under the TCPA (2024), so calling mobile numbers needs prior consent; recording needs all-party consent in about 11-12 states; EU AI Act Art. 50 disclosure. Numbers need caller registration (STIR/SHAKEN attestation, caller name) so calls are not marked as spam. SMS needs A2P 10DLC registration in the US: out of scope here.

Risks: spam and abuse through outbound calls (rate limits, per-agent allow-list of numbers to call); cost runaway (minute caps per day).

Effort: about one 6-day cycle after V1.
