'use client'

/**
 * The agent's memory as an entity graph, rendered with Cytoscape.js (already
 * used for the code graph). Entities are nodes, stated relations are labelled
 * edges (the verb), and "mentioned together" is a dotted edge that can be
 * hidden. Hover highlights a neighbourhood; click focuses an entity, which the
 * parent turns into a neighbourhood query and a detail panel.
 */

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Search } from 'lucide-react'

export interface EntityNode {
  id: string
  name: string
  type: string
  mention_count: number
  hub?: boolean
}

export interface EntityLink {
  source: string
  target: string
  relationship: string
  weight: number
  /** The relation was said to have ended (moved off, removed, replaced) */
  ended?: boolean
}

interface Props {
  nodes: EntityNode[]
  links: EntityLink[]
  colors: Record<string, string>
  focusId: string | null
  onSelect: (name: string) => void
  loading?: boolean
}

export default function MemoryEntityGraph({ nodes, links, colors, focusId, onSelect, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const [showCoMentions, setShowCoMentions] = useState(true)
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const types = [...new Set(nodes.map(n => n.type))].sort()

  useEffect(() => {
    let destroyed = false
    const build = async () => {
      if (!containerRef.current) return
      const cytoscape = (await import('cytoscape')).default
      if (destroyed || !containerRef.current) return
      // Canvas colours come from the page's theme, not hard-coded hex
      const cs = getComputedStyle(containerRef.current)
      const ground = cs.backgroundColor || '#111827'
      const ink = cs.color || '#e5e7eb'
      const muted = getComputedStyle(containerRef.current.parentElement || containerRef.current).borderColor || '#6b7280'

      const visible = nodes.filter(n => !hiddenTypes.has(n.type))
      const ids = new Set(visible.map(n => n.id))
      const maxMentions = Math.max(1, ...visible.map(n => n.mention_count))
      const edges = links.filter(l => ids.has(l.source) && ids.has(l.target) && (showCoMentions || l.relationship !== 'co_mentioned'))

      cyRef.current?.destroy()
      const cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...visible.map(n => ({
            data: {
              id: n.id,
              label: n.name,
              color: colors[n.type] || '#6b7280',
              size: 18 + 26 * Math.sqrt(n.mention_count / maxMentions),
              hub: n.hub ? 1 : 0,
              focus: n.id === focusId ? 1 : 0,
            },
          })),
          ...edges.map((l, i) => ({
            data: {
              id: `e${i}`,
              source: l.source,
              target: l.target,
              label: l.relationship === 'co_mentioned' ? '' : l.relationship.replace(/_/g, ' '),
              co: l.relationship === 'co_mentioned' ? 1 : 0,
              ended: l.ended ? 1 : 0,
            },
          })),
        ],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              width: 'data(size)',
              height: 'data(size)',
              label: 'data(label)',
              color: ink,
              'font-size': 10,
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'text-outline-color': ground,
              'text-outline-width': 2,
              'border-width': 1,
              'border-color': muted,
            },
          },
          { selector: 'node[hub = 1]', style: { 'border-width': 2, 'border-style': 'dashed', 'border-color': ink } },
          { selector: 'node[focus = 1]', style: { 'border-width': 3, 'border-color': ink, 'font-size': 12, 'font-weight': 'bold' } },
          {
            selector: 'edge',
            style: {
              width: 1.5,
              'line-color': muted,
              'target-arrow-color': muted,
              'target-arrow-shape': 'triangle',
              'arrow-scale': 0.8,
              'curve-style': 'bezier',
              label: 'data(label)',
              'font-size': 9,
              color: ink,
              'text-rotation': 'autorotate',
              'text-background-color': ground,
              'text-background-opacity': 1,
              'text-background-padding': '2px',
            },
          },
          {
            selector: 'edge[co = 1]',
            style: { width: 0.8, 'line-style': 'dotted', 'line-color': muted, opacity: 0.5, 'target-arrow-shape': 'none' },
          },
          { selector: 'edge[ended = 1]', style: { 'line-style': 'dashed', opacity: 0.45 } },
          { selector: '.faded', style: { opacity: 0.15 } },
        ],
        layout: focusId
          ? { name: 'concentric', concentric: (n: any) => (n.data('focus') ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 40, animate: false }
          : { name: 'cose', animate: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 90, nodeOverlap: 20, padding: 30 } as any,
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3,
      })

      // Hover: show the neighbourhood, fade the rest
      cy.on('mouseover', 'node', (e: any) => {
        const hood = e.target.closedNeighborhood()
        cy.elements().not(hood).addClass('faded')
      })
      cy.on('mouseout', 'node', () => cy.elements().removeClass('faded'))
      cy.on('tap', 'node', (e: any) => onSelect(e.target.data('label')))
      cyRef.current = cy
    }
    build()
    return () => {
      destroyed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, focusId, showCoMentions, hiddenTypes])

  useEffect(() => () => cyRef.current?.destroy(), [])

  const search = () => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const hit = nodes.find(n => n.name.toLowerCase() === q) || nodes.find(n => n.name.toLowerCase().includes(q))
    if (hit) onSelect(hit.name)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Find an entity…"
            className="pl-7 pr-2 py-1 w-44 bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
          />
        </div>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setHiddenTypes(prev => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next })}
            className={`px-2 py-0.5 rounded-full border ${hiddenTypes.has(t) ? 'opacity-40' : ''}`}
            style={{ borderColor: `${colors[t] || '#6b7280'}80`, color: colors[t] || '#9ca3af' }}
            title={hiddenTypes.has(t) ? 'Show' : 'Hide'}
          >
            {t}
          </button>
        ))}
        <label className="flex items-center gap-1 text-gray-400 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={showCoMentions} onChange={e => setShowCoMentions(e.target.checked)} className="accent-gray-500" />
          mentioned together
        </label>
        <button onClick={() => cyRef.current?.fit(undefined, 30)} className="p-1 text-gray-400 hover:text-gray-200" title="Fit to view">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
      <div className="relative flex-1 min-h-[420px] rounded-lg border border-gray-700 bg-gray-900">
        <div ref={containerRef} className="absolute inset-0 bg-gray-900 text-gray-300" />
        {!loading && nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
            Entities appear once memory cards are written (nightly, or Consolidate now)
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Arrows are stated relations (the verb is on the edge) · dashed arrow: no longer true · dotted: mentioned together · dashed ring: hub · hover to highlight, click to explore, scroll to zoom
      </p>
    </div>
  )
}
