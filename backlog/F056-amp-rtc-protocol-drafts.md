# F056 - The AMP-RTC protocol drafts (agentmessaging/protocol #22-#24, #26-#31)

**Status:** Todo (review done; position needed before the protocol repo merges anything)
**Type:** Feature
**Created:** 2026-10-29

## Description

The same workstream as F050 also opened, in `agentmessaging/protocol`, three issues (#22 capability and schema, #23 state machine and arbitration, #24 human and device identities) and six draft PRs that add spec sections 13 to 18: #26 real-time sessions `rtc:v1` (base: main), #27 human endpoints and two-way calls (14), #28 media negotiation profile (15), #29 conformance matrix (16), #30 rooms extension `rtc-room:v1` (17), #31 wire fixtures and harness (18). #27 and #28 are stacked on #26's branch; #29-#31 target that same branch, not main. All were opened on 2026-10-29 by the same account and none has had an outside review. Nothing else in the AMP organization (reference server, TypeScript SDK, plugin, AID) has changes for this.

## Why It's Needed

We need to know what the protocol side promises before the product side builds to it, and whether standardizing now is wise. This is the 360 view requested with F050.

## Business Case

AMP is our differentiator and an open standard other providers may implement; a bad extension is expensive to retract. The last extension we added (`notify:v1`, section 12) started from a real, observed failure and was marked "proposed". This one starts from a demo goal ("Lola calls an iPhone") with no running implementation.

## Implementation Plan

**What checks out against the existing spec (read in the repo, not assumed).**
- Namespaced custom payload types are allowed (section 04, "Custom Types", example `github:pull_request`), so `rtc:invite` and the rest fit without changing existing clients.
- `expires_at`, `in_reply_to`, `thread_id` and `idempotency_key` exist in section 04. Replay protection (section 07: five-minute timestamp window, recipients track seen ids) works for 30-second invitations.
- Capabilities are already advertised in the provider info and in agent resolution (`notify:v1` is the pattern), so `rtc:v1` follows the established way.
- Good content: media is kept out of AMP; call state is arbitrated by the recipient's provider; accept is not connected; no credentials in push payloads; recording consent separate from consent to answer; a verified agent is not permission to call a person.

**Problems and gaps.**
1. **Wire protocol is not defined.** One example invite and a list of event names. No JSON schema, no examples of the other eight events, no error codes, and the four docs after #26 say so themselves ("not a complete wire-level standard", "not a claim that fixtures exist"). Six documents describe what must be decided more than they decide it.
2. **Real-time signaling over a mailbox.** AMP is store-and-forward with files and queues. Call control needs low latency. #28 itself says SDP and ICE should not travel as durable AMP messages and points at a "short-lived authenticated signaling channel ... separately specified", which does not exist. So the spec cannot yet connect two phones.
3. **Human identity is the unsolved core.** #26, #27 and issue #24 all defer it ("exact interoperable identifier format remains an open question"). #27 requires a provider to run "a distinct authenticated user identity". AI Maestro has no user login by design; it can offer paired devices, not user accounts. If the spec makes human authentication a MUST, AI Maestro cannot be a conforming provider without reversing a stated design decision. Resolve in the spec as "device enrolment attested by the provider", not "user authentication".
4. **No timeout for an accepted call that never connects.** The spec (like PR #701, F051) expires only inviting and ringing calls. Add an accepted-to-connected limit.
5. **Event ids are specified as opaque strings** (`call_opaque_random`, `evt_opaque_random`). The Postgres store in product PR #709 uses UUID columns and would reject them (F051). The spec should state a format or say "opaque, up to N characters, any characters".
6. **Presence is ignored.** AMP 0.3 already defines presence pings (section 05). A caller should be able to see "device reachable" before ringing. Not mentioned.
7. **Completeness of PR #26.** It adds one file. The notify:v1 PR also updated the README index, the API and routing cross-links, the provider checklist and the version history; #26 does none of that.
8. **Neutrality.** #27 names "a registered AI Maestro mobile app" as the human client while claiming vendor neutrality; keep product names in an informative example, not in normative text.
9. **Overlap and bloat.** #29 (matrix) and #31 (fixtures) describe the same tests twice; #30 (rooms) specifies federation for rooms before one-to-one calls work. Spec sections 13 to 18 would be six of the 18 numbered sections.
10. **Process.** One author, one day, no independent implementation, stacked PRs aimed at a branch. The draft itself states the right rule ("keep this document draft until an independent implementation validates interoperability") but that rule is not yet met by anything.

**Update (2026-10-29, Juan).** Humans are members of an AI Maestro, added by the operator, with no authentication (F057). So point 3 resolves on the product side: human identity and device pairing are an AI Maestro feature, not part of AMP, and drafts #27 and #30 can shrink to what two providers must exchange (call signaling between agents and between instances). The spec should not require providers to authenticate humans.

**Recommendation.**
- Do not merge any of them into numbered spec sections yet. If the protocol repo wants them visible, keep one folder `proposals/` with #26 and #27 merged into a single short document, status "experimental", and no section numbers.
- Close or park #28 (media), #30 (rooms) and merge #29 and #31 into one test plan until a prototype exists.
- Answer issues #22-#24 first, in this order: human and device identity (#24), accepted-call timeout and arbitration (#23), then schema (#22). Those answers decide whether the rest is needed.
- Let the product prototype lead (F050 stage 1 and the cheap slice), then write the wire format from what actually ran, the way `notify:v1` was.
- Cross-check list when product and spec are reconciled: accepted timeout (F051, point 4), id format (F051, point 5), human identity as paired device (F050, identity problem).

Related: F050, F051, F053, F055; closed PR #16 (`notify:v1`) in the protocol repo.
