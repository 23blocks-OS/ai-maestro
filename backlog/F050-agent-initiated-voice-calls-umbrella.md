# F050 - Agents that can call a person: the decision and the staging

**Status:** Todo (decision needed before any more RTC code merges)
**Type:** Feature
**Created:** 2026-10-29

## Description

Another team opened a workstream, "AMP-RTC", so an agent can place a voice call to a person's phone (the stated first goal: "Lola calls an iPhone without PSTN"), a person can call an agent from Companion, and later several people and agents can share a voice room. It is four issues (#697-#700) and seven draft PRs (#701, #702, #703, #705, #707, #709, #710), plus a draft protocol spec (agentmessaging/protocol#26). This item holds the review of all of it. Each part has its own item: F051 (call lifecycle), F052 (media and browser audio), F053 (iPhone incoming call), F054 (voice rooms), F055 (interoperability tests), and B019 (the fake "connected" timer that exists today).

## Why It's Needed

The idea that matters: **an agent that needs a person today can only write to an inbox, a chat, or a tmux pane, and the person may not look for hours.** (See the AMP notification work: three paths, none of which rings a person.) A call that rings a locked phone is the strongest "needs you" signal an agent could have. That is the product reason, and it is a good one. It is also the reason to be careful: it is the most expensive way to solve it.

## Business Case

- Positioning: "your agents can ring you" is memorable and no other agent dashboard we know of does it. It fits the mobile app and Companion we already ship.
- Risk: the full scope (media server, TURN, speech in and out, push, native iOS, rooms, federation) is a product of its own. Seven PRs have been opened, none runs a call, and only one (#701) has CI-run tests.
- Recommendation: **do the cheap slice first and prove the value before building media.** Stage 1 is the call state machine and a simulated call (F051). Stage 2 is a spike that does not need WebRTC at all: let an agent trigger an incoming-call screen on the phone for the voice path we already have (on-device speech to text over `/companion-ws`, speech events back; see closed #357/#358). If people use that, then build real audio. If they do not, we saved the media work.

## Implementation Plan

Verdict per item (details in F051-F055):

| Item | Verdict | One line |
|---|---|---|
| #697 coordinator issue | Keep, scope to F051 | Right first step, behind a flag |
| #701 state machine | Merge after two fixes | Pure, small, 6 tests pass in CI |
| #709 Postgres store | Do not merge as is | We have no Postgres in the product; IDs conflict with the spec; no tests |
| #698 media adapter issue | Defer | Depends on stage-1 result; LiveKit is a heavy dependency |
| #705 media interfaces | Hold | Types with no user yet |
| #710 browser audio | Hold, fix list in F052 | Browser microphone needs HTTPS; ICE ordering bug |
| #699 iPhone call issue | Keep as the real prize, other repo | Needs the app repo; Apple VoIP-push rules are a risk |
| #707 native bridge types | Hold | Types with no user yet |
| #700 interop tests | Keep as acceptance criteria | Not a task yet |
| #702 integration design | Merge as a doc after edits | Its claims about current code check out |
| #703 rooms design | Defer | Premature; keep as notes |

Decisions Juan needs to make: (1) go or no-go on the idea at the cheap-slice scope; (2) the identity question (below); (3) where native iOS code lives (the mobile app is a separate repo, `ai-maestro-app`); (4) whether we accept Apple's VoIP push policy risk.

**The identity problem.** Every part assumes "authenticated principals" and "an authenticated route". AI Maestro has no app-level login by design (the network is the boundary). A call needs to know *which person's phone* may be rung and *which device* may answer. That is device pairing (enrol a phone once, over the trusted network), not user login. Do not propose auth; design pairing. The AMP spec lists human and device identity as an open question for the same reason.

Effort for the cheap slice: M. For everything: several L cycles and a decision on infrastructure.
