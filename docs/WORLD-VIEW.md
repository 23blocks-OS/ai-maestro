# World view (beta)

Your whole fleet as a map: every host or organization is an island, its agents stand on it, and you can see at a glance who is working, who needs you and which host is down.

It is an **experiment**, off by default. Turn it on in **Settings → Experiments → World view (beta)**; a **World** button then appears in the header and `/world` opens the map. The switch is stored in this browser only.

## Reading the map

The map has three levels:

1. **The overview**: islands. Each island shows its **skyline**, one building for each of its parts (an org island has a building per host its agents run on; a host island has a building per organization running there), standing in a row across the back, biggest in the middle. A building's height follows how many agents it holds, its front carries bands in the status colours in proportion, and an orange diamond over it means someone there needs you. Dark means its host is offline.
2. **An island** (click it): the camera goes there and you see just its buildings, with their names and agent counts. The other islands dim.
3. **A building** (click it): you are inside, in a room open to the front. The agents are small people laid out back to front: the **away** (offline: standing, greyed, a small zz) at the back, **working** at desks with their screens lit, **ready** standing, and **needs you** at the front, waving, with an orange beacon over their heads. Click one for a ring, its name over its head and a card with its status, host and task, and buttons: Open (dashboard), Zoom and Companion. Shirts wear the status colours (green working, orange needs you, yellow ready, grey offline). With "reduce motion" on in your system settings they hold their poses.

**Back** with the arrow in the panel or **Escape** (one level up). The **minimap** in the corner shows every island, orange where someone needs you; click one to fly there. Searching for an agent and clicking it takes you straight into its building. Test agents (tagged `org:sandbox`) are not drawn; the header says how many are hidden. **Drag** to orbit, **right-drag** to pan, **scroll** to zoom.

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

- `lib/world/grouping.ts` partitions the agents (pure, tested); `lib/world/layout.ts` places the islands so none overlaps another; `lib/world/stage.ts` stands the agents on an island; `lib/world/layout.ts` also lays out each island's skyline; `components/world/WorldScene.tsx` and `Character.tsx` draw them (React Three Fiber, client-only, loaded on demand); `app/world/page.tsx` is the page.
- The data is the same as the Zoom and Org views: `useAgents` (every host), `useHosts`, `useOrgs`, and the one status source, `presenceOf`. No backend change.
- The canvas renders on demand, so an idle map costs no GPU. The scene needs WebGL; without it the list beside the map still works.
- The flag lives in `lib/experiments.ts` (`EXPERIMENT_KEYS`) and is read with `hooks/useExperiment.ts`.

## Not in this first slice

Characters walking between places, pulses drawn agent to agent, hand tracking and walking around in VR, the grouping in the URL.
