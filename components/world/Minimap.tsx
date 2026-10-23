'use client'

import { useMemo } from 'react'
import { islandRadius, layoutIslands } from '@/lib/world/layout'
import type { WorldGroup } from '@/lib/world/grouping'

/**
 * The whole archipelago from above, in the corner: one disc per island (sized like the island),
 * orange when someone there needs you, grey when its hosts are down, outlined when selected.
 * Click a disc to fly there. Plain SVG over the canvas, so it costs the 3D scene nothing.
 */
export default function Minimap({ groups, selectedKey, onSelect }: {
  groups: WorldGroup[]
  selectedKey: string | null
  onSelect: (key: string) => void
}) {
  const { positions, extent } = useMemo(() => layoutIslands(groups), [groups])
  if (groups.length < 2) return null
  const reach = Math.max(extent, 6) + 1
  return (
    <svg
      viewBox={`${-reach} ${-reach} ${reach * 2} ${reach * 2}`}
      className="absolute bottom-3 left-3 h-32 w-32 rounded-lg border border-gray-800 bg-gray-950/80 backdrop-blur-sm"
      role="group"
      aria-label="Minimap: click an island to fly to it"
    >
      {groups.map((g, i) => {
        const [x, z] = positions[i]
        const r = islandRadius(g.counts.total)
        const fill = g.offline ? '#374151' : g.counts.needsYou > 0 ? '#f97316' : '#14b8a6'
        const selected = g.key === selectedKey
        return (
          <g key={g.key} onClick={() => onSelect(g.key)} style={{ cursor: 'pointer' }}>
            <title>{`${g.label}: ${g.counts.total} agents${g.counts.needsYou > 0 ? `, ${g.counts.needsYou} need you` : ''}`}</title>
            <circle cx={x} cy={z} r={r} fill={fill} fillOpacity={selected ? 0.95 : 0.45} stroke={selected ? '#e5e7eb' : 'none'} strokeWidth={0.5} />
          </g>
        )
      })}
    </svg>
  )
}
