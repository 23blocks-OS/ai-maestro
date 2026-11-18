# F114 — Research: A2UI surfaces in Agent Actions and canvas documents

**Status:** In Progress
**Type:** Feature (research)
**Created:** 2026-11-12

## Description

Find out if AI Maestro can adopt [A2UI](https://a2ui.org) (spec v1.0, Apache 2.0, github.com/a2ui-project/a2ui) as a second page format for the Agent Actions Protocol (AAP, `docs/AGENT-ACTIONS-PROTOCOL.md`) and for canvas documents. HTML canvases stay.

**What A2UI is.** The agent sends declarative JSON, never code. The client renders it with its own components:

- **Messages from the agent:** `createSurface`, `updateComponents`, `updateDataModel` (a JSON Pointer `path` and a `value`), and `deleteSurface`.
- **Components:** a flat list with ids. Containers name their children by id. A `root` component is required.
- **Data binding:** `{"@path": "/pointer"}`, with two-way binding on inputs.
- **Basic catalog:** 18 components (Text, Card, Row, Column, List, Tabs, Modal, Button, TextField, ChoicePicker, Slider, DateTimeInput, …) and functions such as formatting and validation. A host can lock the catalog to its own components.
- **User actions:** the renderer sends an `action` with `name`, `surfaceId`, `sourceComponentId`, `timestamp` and `context` (bindings resolved).
- **Transports:** AG-UI, A2A, MCP, SSE/JSON-RPC, WebSocket, or REST without streaming.
- **Renderers:** React (`@a2ui/react`), Lit, Angular, Flutter, SwiftUI, Compose, and community ones. The protocol does not need an HTML page or an iframe.

**How it maps to AAP:**

| AAP today | A2UI |
|---|---|
| The agent writes a full HTML file into `canvas/` | The agent writes a surface (JSON / JSONL) |
| A sandboxed iframe with the `maestro.send()` bridge | Native React components from our own catalog, with no iframe |
| `maestro.send(action, element, data)` | `action{name, sourceComponentId, context}` |
| `canvas/interactions/*.json` + a `[CANVAS]` notification | Same: this does not change |
| The agent rewrites the file to update the page | `updateDataModel` changes one value without rewriting the page |

## Why It's Needed

- **Tokens and time:** today an agent writes a whole HTML page (CSS, JS, escaping) for a table with two buttons. A surface is a few lines of JSON.
- **Pages look different from agent to agent and break the dashboard theme.** With a locked catalog, every page uses AI Maestro's components and tokens, in light and dark.
- **The pages work only in a browser iframe.** The same surface could render in the phone app, on the kiosk (ADP display), and in the chat as a card. The chat's question, permission, secret and SQL cards are already this kind of UI.
- **Safety:** a surface carries no code. That matters more when pages come from agents on other hosts (F107).

## Business Case

- AAP is our public protocol (agentactions.org). If it speaks A2UI, agents built for A2UI (ADK, CopilotKit, A2A) can show pages in AI Maestro, and our agents' pages can render in other products. This is positioning, not lock-in.
- Lower cost per page and fewer broken pages mean less support load.
- It is one way to render agent UI on every surface we have (dashboard, phone, kiosk, meeting), instead of one renderer for each.

## Implementation Plan

Research first (S, one day), then a prototype only if the answers are good (M).

1. **Read the spec end to end:** v1.0, the A2A extension, and "MCP Apps in A2UI" (it embeds HTML/MCP Apps in a surface, which may be how our HTML canvases live on). Note what v1.1 will change.
2. **Renderer fit:**
   - Does `@a2ui/react` work with React 19 and Next 15?
   - What does it add to the bundle?
   - Can our Tailwind components be the catalog?
   - Is there a React Native renderer for the phone app? None is official, so check the community list.
3. **A prototype on one branch, behind nothing:**
   - `canvas/*.a2ui.json` (or `.jsonl` for a stream) shows in the Canvas tab through `@a2ui/react` and the basic catalog.
   - An `action` posts to the same `/api/agents/:id/canvas/interactions` with `action = name`, `element = sourceComponentId`, `data = context`.
   - One test maps an action to the AAP record.
   - Files: `components/CanvasPanel.tsx`, `services/` canvas service, `app/api/agents/[id]/canvas/`, the headless router.
4. **Agent side:** add an A2UI section to the agent-actions skill (`plugin/src/`). Measure with `plugin/evals` whether agents write valid surfaces more reliably and with fewer tokens than HTML.
5. **Decide and write down:**
   - Does AAP v1.1 name A2UI as a page format?
   - Do canvas documents and meeting documents move to it?
   - Is the change public (agentactions.org)? That is Juan's decision.

**Open questions and risks:**

- The spec is new. v1.0 already renamed the envelopes and the `@` keys, and v1.1 is in requirements, so expect churn.
- Rich pages (charts, custom layouts) may still need HTML. Keep both formats.
- Multi-host: surfaces from agents on other hosts go through `getAgentBaseUrl`, as canvases do now.
- `sendDataModel` sends the whole data model back. Keep it off by default, and never put secrets in it (same rule as `maestro.send` data).
