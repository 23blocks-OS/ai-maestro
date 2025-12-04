'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Layers, GitBranch, Database, Box, FileCode, Component, ArrowRight } from 'lucide-react'

// Types for graph data
interface GraphNode {
  id: string
  name?: string
  path?: string
  type: 'file' | 'function' | 'component' | 'database' | 'schema' | 'table' | 'column'
  is_export?: boolean
  lang?: string
  module?: string
  project?: string
  file_id?: string
  data_type?: string
  nullable?: boolean
  db?: string
  schema?: string
  table?: string
}

interface GraphEdge {
  source: string
  target: string
  type: 'imports' | 'calls' | 'fk' | 'contains'
  source_col?: string
  target_col?: string
  on_delete?: string
  on_update?: string
}

interface GraphData {
  nodes: {
    files?: GraphNode[]
    functions?: GraphNode[]
    components?: GraphNode[]
    databases?: GraphNode[]
    schemas?: GraphNode[]
    tables?: GraphNode[]
    columns?: GraphNode[]
  }
  edges: {
    imports?: GraphEdge[]
    calls?: GraphEdge[]
    foreign_keys?: GraphEdge[]
  }
}

interface GraphVisualizationProps {
  agentId: string
  graphType: 'code' | 'db'
  onNodeSelect?: (node: GraphNode) => void
}

// Node colors by type
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  file: { bg: '#3b82f6', border: '#1d4ed8', text: '#ffffff' },
  function: { bg: '#22c55e', border: '#15803d', text: '#ffffff' },
  component: { bg: '#a855f7', border: '#7c3aed', text: '#ffffff' },
  database: { bg: '#f97316', border: '#c2410c', text: '#ffffff' },
  schema: { bg: '#eab308', border: '#a16207', text: '#000000' },
  table: { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' },
  column: { bg: '#64748b', border: '#475569', text: '#ffffff' },
}

// Edge colors by type
const EDGE_COLORS: Record<string, string> = {
  imports: '#94a3b8',
  calls: '#22c55e',
  fk: '#f97316',
  contains: '#64748b',
}

export function GraphVisualization({ agentId, graphType, onNodeSelect }: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [layout, setLayout] = useState<'dagre' | 'concentric' | 'circle' | 'grid'>('dagre')
  const [nodeFilter, setNodeFilter] = useState<Set<string>>(new Set(['file', 'function', 'component', 'table', 'column']))

  // Fetch graph data
  const fetchGraphData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const endpoint = graphType === 'code'
        ? `/api/agents/${agentId}/graph/code?action=all`
        : `/api/agents/${agentId}/graph/db?action=all`

      const response = await fetch(endpoint)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch graph data')
      }

      setGraphData(data.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [agentId, graphType])

  // Initialize Cytoscape
  useEffect(() => {
    fetchGraphData()
  }, [fetchGraphData])

  // Render graph when data changes
  useEffect(() => {
    if (!graphData || !containerRef.current) return

    const loadCytoscape = async () => {
      // Dynamically import cytoscape to avoid SSR issues
      const cytoscape = (await import('cytoscape')).default
      const dagre = (await import('cytoscape-dagre')).default

      cytoscape.use(dagre)

      // Build elements array
      const elements: any[] = []

      // Add nodes
      const allNodes = [
        ...(graphData.nodes.files || []),
        ...(graphData.nodes.functions || []),
        ...(graphData.nodes.components || []),
        ...(graphData.nodes.databases || []),
        ...(graphData.nodes.schemas || []),
        ...(graphData.nodes.tables || []),
        ...(graphData.nodes.columns || []),
      ]

      for (const node of allNodes) {
        if (!nodeFilter.has(node.type)) continue

        const color = NODE_COLORS[node.type] || NODE_COLORS.file
        const label = node.name || node.path?.split('/').pop() || node.id

        elements.push({
          group: 'nodes',
          data: {
            ...node,
            label: label.length > 20 ? label.substring(0, 17) + '...' : label,
            fullLabel: label,
          },
          style: {
            'background-color': color.bg,
            'border-color': color.border,
            'color': color.text,
          },
        })
      }

      // Add edges
      const allEdges = [
        ...(graphData.edges.imports || []),
        ...(graphData.edges.calls || []),
        ...(graphData.edges.foreign_keys || []),
      ]

      const nodeIds = new Set(elements.map(e => e.data.id))

      for (const edge of allEdges) {
        // Only add edge if both nodes exist in filtered set
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue

        elements.push({
          group: 'edges',
          data: {
            id: `${edge.source}-${edge.type}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.type,
          },
          style: {
            'line-color': EDGE_COLORS[edge.type] || EDGE_COLORS.imports,
            'target-arrow-color': EDGE_COLORS[edge.type] || EDGE_COLORS.imports,
          },
        })
      }

      // Destroy existing instance
      if (cyRef.current) {
        cyRef.current.destroy()
      }

      // Create cytoscape instance
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': '10px',
              'font-weight': 'bold',
              'width': 60,
              'height': 30,
              'shape': 'round-rectangle',
              'text-wrap': 'wrap',
              'text-max-width': '55px',
            } as any,
          },
          {
            selector: 'node[type = "function"]',
            style: {
              'shape': 'ellipse',
              'width': 50,
              'height': 25,
            } as any,
          },
          {
            selector: 'node[type = "component"]',
            style: {
              'shape': 'diamond',
              'width': 45,
              'height': 45,
            } as any,
          },
          {
            selector: 'node[type = "column"]',
            style: {
              'width': 40,
              'height': 20,
              'font-size': '8px',
            } as any,
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 0.8,
              'opacity': 0.7,
            } as any,
          },
          {
            selector: 'edge[edgeType = "calls"]',
            style: {
              'line-style': 'dashed',
              'width': 1,
            } as any,
          },
          {
            selector: ':selected',
            style: {
              'border-width': 3,
              'border-color': '#fbbf24',
              'overlay-opacity': 0.2,
              'overlay-color': '#fbbf24',
            } as any,
          },
        ],
        layout: {
          name: layout,
          ...(layout === 'dagre' ? {
            rankDir: 'TB',
            nodeSep: 50,
            rankSep: 80,
            edgeSep: 20,
          } : {}),
        } as any,
        wheelSensitivity: 0.3,
        minZoom: 0.1,
        maxZoom: 3,
      })

      // Event handlers
      cy.on('tap', 'node', (evt: any) => {
        const node = evt.target.data()
        setSelectedNode(node)
        onNodeSelect?.(node)
      })

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) {
          setSelectedNode(null)
        }
      })

      cyRef.current = cy
    }

    loadCytoscape()

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy()
      }
    }
  }, [graphData, layout, nodeFilter, onNodeSelect])

  // Control handlers
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2)
  const handleFit = () => cyRef.current?.fit(undefined, 50)
  const handleReset = () => {
    cyRef.current?.fit(undefined, 50)
    cyRef.current?.center()
  }

  const toggleNodeType = (type: string) => {
    setNodeFilter(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900/50 rounded-lg">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="text-neutral-400 text-sm">Loading graph data...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-neutral-900/50 rounded-lg">
        <div className="text-center">
          <p className="text-red-400 mb-2">Error loading graph</p>
          <p className="text-neutral-500 text-sm">{error}</p>
          <button
            onClick={fetchGraphData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const nodeTypes = graphType === 'code'
    ? ['file', 'function', 'component']
    : ['table', 'column']

  return (
    <div className="flex flex-col h-full bg-neutral-900/50 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-800/50 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          {graphType === 'code' ? (
            <GitBranch className="h-4 w-4 text-blue-400" />
          ) : (
            <Database className="h-4 w-4 text-orange-400" />
          )}
          <span className="text-sm font-medium text-neutral-200">
            {graphType === 'code' ? 'Code Graph' : 'Database Schema'}
          </span>
        </div>

        {/* Layout selector */}
        <div className="flex items-center gap-2">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as any)}
            className="bg-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-600"
          >
            <option value="dagre">Hierarchical</option>
            <option value="concentric">Concentric</option>
            <option value="circle">Circle</option>
            <option value="grid">Grid</option>
          </select>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4 text-neutral-400" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4 text-neutral-400" />
          </button>
          <button
            onClick={handleFit}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
            title="Fit to View"
          >
            <Maximize2 className="h-4 w-4 text-neutral-400" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-neutral-700 rounded transition-colors"
            title="Reset View"
          >
            <RotateCcw className="h-4 w-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Node type filter */}
      <div className="flex items-center gap-2 px-4 py-2 bg-neutral-800/30 border-b border-neutral-700/50">
        <Layers className="h-3.5 w-3.5 text-neutral-500" />
        <span className="text-xs text-neutral-500 mr-2">Show:</span>
        {nodeTypes.map(type => (
          <button
            key={type}
            onClick={() => toggleNodeType(type)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
              nodeFilter.has(type)
                ? 'bg-neutral-700 text-neutral-200'
                : 'bg-neutral-800 text-neutral-500'
            }`}
          >
            {type === 'file' && <FileCode className="h-3 w-3" />}
            {type === 'function' && <Box className="h-3 w-3" />}
            {type === 'component' && <Component className="h-3 w-3" />}
            {type === 'table' && <Database className="h-3 w-3" />}
            {type === 'column' && <ArrowRight className="h-3 w-3" />}
            <span className="capitalize">{type}s</span>
          </button>
        ))}
      </div>

      {/* Graph container */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Node details panel */}
      {selectedNode && (
        <div className="px-4 py-3 bg-neutral-800/50 border-t border-neutral-700">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: NODE_COLORS[selectedNode.type]?.bg || '#64748b' }}
            />
            <span className="text-sm font-medium text-neutral-200 capitalize">
              {selectedNode.type}
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-neutral-500">Name:</span>
              <span className="text-neutral-300">{selectedNode.name || selectedNode.path?.split('/').pop()}</span>
            </div>
            {selectedNode.path && (
              <div className="flex gap-2">
                <span className="text-neutral-500">Path:</span>
                <span className="text-neutral-300 truncate" title={selectedNode.path}>{selectedNode.path}</span>
              </div>
            )}
            {selectedNode.is_export !== undefined && (
              <div className="flex gap-2">
                <span className="text-neutral-500">Exported:</span>
                <span className="text-neutral-300">{selectedNode.is_export ? 'Yes' : 'No'}</span>
              </div>
            )}
            {selectedNode.data_type && (
              <div className="flex gap-2">
                <span className="text-neutral-500">Type:</span>
                <span className="text-neutral-300">{selectedNode.data_type}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-neutral-900/50 border-t border-neutral-700/50 text-xs">
        <span className="text-neutral-500">Legend:</span>
        {nodeTypes.map(type => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: NODE_COLORS[type]?.bg || '#64748b' }}
            />
            <span className="text-neutral-400 capitalize">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-4">
          <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.imports }} />
          <span className="text-neutral-400">imports</span>
        </div>
        {graphType === 'code' && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 border-t border-dashed" style={{ borderColor: EDGE_COLORS.calls }} />
            <span className="text-neutral-400">calls</span>
          </div>
        )}
        {graphType === 'db' && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.fk }} />
            <span className="text-neutral-400">FK</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default GraphVisualization
