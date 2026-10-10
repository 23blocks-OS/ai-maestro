# F034 - Compare Google's A2UI with the Agent Actions Protocol (AAP)

**Status:** Todo (research)
**Type:** Research / possible protocol alignment
**Created:** 2026-10-09
**Requested by:** Juan, 2026-10-09 ("save this to check against agent actions protocol")

## What was shared

Pasted by Juan, not yet verified against Google's own spec or repo:

> Google is actively developing A2UI (Agent-to-User Interface), and it looks like we can already experiment with it in Android projects.
>
> In short, A2UI is a protocol that lets AI agents generate interactive interfaces. Instead of interacting with an agent only through text, users of Android, iOS, and web apps can receive generated interactive components.
>
> With A2UI, an agent describes a screen in JSON using components such as Text, Column, TextField, and Button. The client app then renders it with its own native components: Material components on Android, and the platform's native UI elsewhere.
>
> The v1.0 specification is currently a release candidate, and official renderers are available for the web, Flutter, and now Android.
>
> For Android, Google has released the Jetpack library group "androidx.a2ui.compose" (artifacts: compose-runtime, compose-ui, compose-ui-testing) at version 1.0.0-alpha01. It renders A2UI into native Compose components with Material defaults and requires compileSdk 37.1.

## Why it matters to us

AAP (`docs/AGENT-ACTIONS-PROTOCOL.md`, v1.0, agentactions.org) covers the user-to-agent half: an agent draws HTML in a sandboxed canvas, and a click or form submit comes back as a typed interaction record (`maestro.send()`, `POST /api/agents/:id/canvas/interactions`, append-only files, agent notified). A2UI, as described, covers the agent-to-user half with declarative JSON components that the client renders natively. They may be two halves of one loop, or direct competitors for the same slot.

## Questions to answer

1. **Direction.** Does A2UI define only how a screen is described, or also how user actions flow back? If it has an action/event message, how does it compare with an AAP interaction record (element, action, data, metadata)?
2. **Declarative JSON versus HTML.** AAP renders agent-authored HTML in a sandboxed iframe. A2UI describes components and lets the client render them natively. Which is safer for untrusted agents (no script execution), and which fits mobile (the mobile app mirrors web, and F030-style chat features)?
3. **Component vocabulary.** Which components exist (Text, Column, TextField, Button, ...), is there a catalogue or extension mechanism, and could our existing cards (permission, question, approval) be expressed in it?
4. **Transport.** How does an agent deliver an A2UI document (A2A, MCP, streaming, plain HTTP)? How would it ride over AMP or our chat?
5. **Identity and trust.** Does it say anything about who the agent is or what it may render (relation to AID and the Personal Agent Protocol work)?
6. **Maturity and licence.** v1.0 is a release candidate; check the real spec, repo, licence and who else renders it (web, Flutter, Android; iOS?).
7. **Interop options.** (a) AAP stays as is and A2UI is a second renderer, (b) AAP gains an A2UI profile, (c) a translator between A2UI documents and AAP canvases, (d) nothing.

## Deliverable

A short comparison table (like `docs/AID-POPPY-MAPPING.md`) and a recommendation: adopt, bridge, or ignore. Verify everything against Google's spec, not the pasted summary.

## Related

`docs/AGENT-ACTIONS-PROTOCOL.md`, `docs/AID-POPPY-MAPPING.md` (the Poppy `operations` extension also touches action confirmation), F033 (secret entry could use a card format).
