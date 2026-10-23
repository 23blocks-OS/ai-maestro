# World view (beta)

Your whole fleet as a map: every host or organization is an island, its agents stand on it, and you can see at a glance who is working, who needs you and which host is down.

It is an **experiment**, off by default. Turn it on in **Settings → Experiments → World view (beta)**; a **World** button then appears in the header and `/world` opens the map. The switch is stored in this browser only.

## Reading the map

- **Island** size follows its agent count; the buildings are decoration that grows with it.
- **Orange diamond over an island**: at least one agent there needs you.
- **Dark island**: every host it covers is offline (a host that is disabled, as everywhere else in the UI).
- **Click an island** to select it: its agents stand on it as capsules in the status colours (green working, orange needs you, yellow ready, grey offline) and the panel lists them, needs-you first. Click an agent to open its Zoom view.
- **Drag** to orbit, **right-drag** to pan, **scroll** to zoom.

## Grouping

| Mode | One island per | Good for |
|---|---|---|
| Host | host | "what is running where" |
| Org | organization, hosts pooled | "how is each company doing" |
| Org + Host (default) | organization and host | both: a company's agents on each of its machines |

An agent's organization is its first `org:<id>` tag; an agent with none is on `unassigned`. Every agent is on exactly one island, so the counts always add up to the fleet.

## How it works

- `lib/world/grouping.ts` partitions the agents (pure, tested); `lib/world/layout.ts` places the islands so none overlaps another; `components/world/WorldScene.tsx` draws them (React Three Fiber, client-only, loaded on demand); `app/world/page.tsx` is the page.
- The data is the same as the Zoom and Org views: `useAgents` (every host), `useHosts`, `useOrgs`, and the one status source, `presenceOf`. No backend change.
- The canvas renders on demand, so an idle map costs no GPU. The scene needs WebGL; without it the list beside the map still works.
- The flag lives in `lib/experiments.ts` (`EXPERIMENT_KEYS`) and is read with `hooks/useExperiment.ts`.

## Not in this first slice

Text labels on the islands, message pulses between agents, walking and typing animations, the grouping in the URL.
