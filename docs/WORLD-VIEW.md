# World view (beta)

Your whole fleet as a map: every host or organization is an island, its agents stand on it, and you can see at a glance who is working, who needs you and which host is down.

It is an **experiment**, off by default. Turn it on in **Settings → Experiments → World view (beta)**; a **World** button then appears in the header and `/world` opens the map. The switch is stored in this browser only.

## Reading the map

The map has three levels:

1. **The overview**: islands. Each island shows its **skyline**, one building for each of its parts (an org island has a building per host its agents run on; a host island has a building per organization running there), standing in a row across the back, biggest in the middle. A building's height follows how many agents it holds, its front carries bands in the status colours in proportion, and an orange diamond over it means someone there needs you. Dark means its host is offline.
2. **An island** (click it): the camera goes there and you see just its buildings, with their names and agent counts. The other islands dim.
3. **A building** (click it): you are inside, in a room open to the front. The agents are small people laid out back to front: the **away** (offline: standing, greyed, a small zz) at the back, **working** at desks with their screens lit, **ready** standing, and **needs you** at the front, waving, with an orange beacon over their heads. Click one for a ring, its name over its head and a card with its status, host and task, and the ways to reach it: Chat, Terminal, Zoom, Companion (the two call-style views) and, for each team it is in, Meet (a team meeting). Shirts wear the status colours (green working, orange needs you, yellow ready, grey offline). With "reduce motion" on in your system settings they hold their poses.

**Back** with the arrow in the panel or **Escape** (one level up). The **minimap** in the corner shows every island, orange where someone needs you; click one to fly there. Searching for an agent and clicking it takes you straight into its building. Test agents (tagged `org:sandbox`) are not drawn; the header says how many are hidden. **Drag** to orbit, **right-drag** to pan, **scroll** to zoom.

## Two ways to draw it: 3D map or 2D office

The header toggle **3D map | 2D office** picks how the world is drawn; the lenses, the spotlight, the replay and the agent card are the same in both. The choice is remembered in this browser. With no saved choice, a phone-width screen or a browser without WebGL gets the office.

The **2D office** is a floor plan seen from above, in plain SVG: an island is a floor, a building is a room on it (a dot per agent), and a room holds its people at desks, standing, away (greyed, with a "zz") or waving with a speech bubble. It needs no WebGL, so it runs on a phone and on a weak machine, and its islands, rooms and people can be reached with the keyboard. There is no VR in it (that is the 3D map's), and no manual zoom or pan: each level frames what is in it.

## Lenses

The header has three lenses over the same map. They change what is drawn, never where anything stands.

- **Status** (default): who is working, ready, waiting for you or offline.
- **Work**: the open cards on every host. Each agent gets a small tag with its open (and late) cards, each building says how many it holds, and each island's row in the list shows its total. The **Waiting on you** list gathers the cards waiting on you across every host, most urgent first; click one to fly to its agent.
- **Relations**: arcs for who messages whom (amber), who shares cards (blue) or both (violet), thicker for more. Overview: between islands; on an island: between its buildings; inside a building: between its people. The panel lists the busiest pairs and the busiest links between islands, over the last hour, 6 hours or 24 hours, and the **teams** from every host: click one to light it up (everyone else dims and only its relations remain), or press **Meet** to open a team meeting.

In every lens an agent with a card waiting on you has a **speech bubble** with the card's subject over its head and a blue gem on its building. An agent that needs you without a card says "needs you": the status feed does not carry the question, and the view does not guess it.

A search, a status filter and a lit-up team all act as a **spotlight**: islands, buildings and people outside it dim.

## Replay

**Replay** (header) plays the last 1, 6 or 24 hours of messages back as pulses, at 1, 6 or 24 hours per minute, with a time slider; the relations lens follows the replay clock. Without it the pulses are live. The history is `GET /api/world/events?history=1` (up to a day; the default is still a few minutes), re-read every two minutes.

## VR

Browsers that can start an immersive VR session (a Meta Quest's browser, a PC with a headset) show an **Enter VR** button in the corner of the map. In the headset the overview is a **table-top model** of the archipelago in front of you; select an island and you **stand at its doorstep, life-size**, looking at its skyline, and select a building and you **stand at the front of its room** with its agents around you at human scale (the ones who need you wave at you). Point a controller and pull the trigger to select an island, a building or an agent; the agent's name and status float over its head; a floating button ("← back to the island", "← all islands") goes up a level. Exit VR ends the session.

No headset? Open `/world?emulate-vr` for an emulated Meta Quest 3. It has been checked only in that emulator, not on a real headset: comfort and performance on a standalone Quest still need a real device. iOS Safari has no WebXR, so on iPhone and iPad the map stays a normal 3D view.

## Live messages

Every AMP message delivered shows as a gold orb that arcs from the sender's island to the recipient's, and the island list shows the last few as "Live messages". The feed is `GET /api/world/events` (sender name, recipient id, time; never the message), read from the AMP inbox folders and joined across hosts.

## Grouping

| Mode | One island per | Good for |
|---|---|---|
| By org (default) | organization, whatever machines its agents run on | "how is each company doing" |
| By location | host | "what is running where" |

An agent's organization is its first `org:<id>` tag. An agent with none stands on **Personal** (the Org page's default), so tag every agent with its company, or leave it for your own work. Every agent is on exactly one island, so the counts always add up to the fleet.

Select an island and the others dim; the camera flies to it. The search box and status chips narrow the list and dim islands with no match. The orange "N need you" button in the header flies to the next island with an agent waiting for you.

## How it works

- `lib/world/relations.ts` (pure, tested) turns deliveries and cards into ties, lifts them to islands and buildings, and summarises each agent's work; `components/world/WorldPanels.tsx` holds the side panels and the replay bar.
- `lib/world/grouping.ts` partitions the agents (pure, tested); `lib/world/layout.ts` places the islands so none overlaps another; `lib/world/stage.ts` stands the agents on an island; `lib/world/layout.ts` also lays out each island's skyline; `components/world/WorldScene.tsx` and `Character.tsx` draw them (React Three Fiber, client-only, loaded on demand) and `components/world/OfficeView.tsx` draws the same world in 2D (SVG; `lib/world/office.ts` frames it, `lib/world/look.ts` gives each agent its face); `app/world/page.tsx` is the page.
- The data is the same as the Zoom and Org views: `useAgents` (every host), `useHosts`, `useOrgs`, and the one status source, `presenceOf`; plus `useOpenTasks` (cards), `useWorldTeams` and `useWorldHistory`. The only backend change is the `history` option on `/api/world/events`.
- The canvas renders on demand, so an idle map costs no GPU. The scene needs WebGL; without it the list beside the map still works.
- The flag lives in `lib/experiments.ts` (`EXPERIMENT_KEYS`) and is read with `hooks/useExperiment.ts`.

## Not in this first slice

Characters walking between places, subagents as small helpers (the hook does not report them), answering a permission in the scene, pulses drawn agent to agent, hand tracking and walking around in VR, the grouping in the URL.
