# A2UI pages in the Canvas tab (F114, experimental)

An agent can write an [A2UI](https://a2ui.org) v1.0 page to its canvas folder in place of an HTML page. A2UI is JSON
that names components; the dashboard draws them with its own components. There is no iframe and no code from the agent.

## Files

```
~/.aimaestro/agents/<id>/canvas/approvals.a2ui.json    # a JSON list of A2UI messages, or { "messages": [...] }
~/.aimaestro/agents/<id>/canvas/live.a2ui.jsonl        # one message per line
```

HTML pages work as before. A complete example: [`docs/examples/approvals.a2ui.json`](examples/approvals.a2ui.json).

A page is a `createSurface`, an `updateComponents` with a flat list of components (one has the id `root`), and
an `updateDataModel` with the data that components bind to with `{"@path": "/pointer"}`. Use the basic catalog id
`https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json`.

## What a page can use

Text, Icon, Row, Column, List, Card, Tabs, Modal, Divider, Button, TextField, CheckBox, ChoicePicker, Slider,
DateTimeInput, and the basic catalog functions except `openUrl`.

Text takes simple Markdown (headings, bold, italic, lists, code). Icons use the basic catalog names (`check`,
`warning`, `lock`...), drawn from a Material Icons font bundled with the dashboard.

Not available: Image, Video and AudioPlayer (they load outside URLs) and `openUrl` (it leaves the dashboard). Markdown images and links are not drawn either; they show as plain text.
A page that uses them, or has more than 2000 components or 500 messages, shows an error that names the place, and
nothing of it is drawn.

## Actions

A button's `action.event` is recorded like a `maestro.send()` call from an HTML page:

| A2UI action | Interaction record |
|---|---|
| `name` | `action` |
| `sourceComponentId` | `element` |
| `context` (bindings resolved) | `data` |

The agent gets the same `[CANVAS]` notification and the same file in `canvas/interactions/`.

## Code

- `lib/a2ui-canvas.ts`: file names, reading the file, the check, action to interaction.
- `lib/a2ui-catalog.ts`: the locked component set.
- `lib/a2ui-markdown.ts`: Markdown for Text (markdown-it, no images, links or raw HTML).
- `components/canvas/A2uiCanvasView.tsx`: the renderer (`@a2ui/react`), loaded only when an A2UI page is opened.
- `tests/a2ui-canvas.test.ts`.

## Open

- The agent-actions skill does not teach A2UI yet (it comes from the upstream agentmessaging repo).
- The phone app has no A2UI renderer.
- Whether AAP names A2UI as a page format (agentactions.org) is a separate decision.
