'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Layers,
  GitBranch,
  Database,
  Box,
  FileCode,
  Component,
  ArrowRight,
  RefreshCw,
  Play,
  AlertCircle,
  CheckCircle2,
  Info,
  Focus,
  X
} from 'lucide-react'

interface GraphNode {
  id: string
  name?: string
  path?: string
  type: 'file' | 'function' | 'component' | 'database' | 'schema' | 'table' | 'column'
  class_type?: string  // For components: model, serializer, controller, etc.
  is_export?: boolean
  lang?: string
  module?: string
  project?: string
  file_id?: string
  data_type?: string
  nullable?: boolean
}

interface GraphEdge {
  source: string
  target: string
  type: 'imports' | 'calls' | 'extends' | 'includes' | 'association' | 'serializes' | 'fk' | 'contains'
  assoc_type?: string  // For associations: belongs_to, has_many, etc.
}

interface GraphData {
  nodes: {
    files?: GraphNode[]
    functions?: GraphNode[]
    components?: GraphNode[]
  }
  edges: {
    imports?: GraphEdge[]
    calls?: GraphEdge[]
  }
}

interface GraphStats {
  files: number
  functions: number
  components: number
  imports: number
  calls: number
  classTypes?: Record<string, number>  // Breakdown by class type
  edges?: {
    extends: number
    includes: number
    associations: number
    serializes: number
  }
}

interface AgentGraphProps {
  sessionName: string
  agentId: string | null | undefined
  isVisible: boolean
  workingDirectory?: string
  hostUrl?: string  // Base URL for remote hosts
}

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  file: { bg: '#3b82f6', border: '#1d4ed8', text: '#ffffff' },
  function: { bg: '#22c55e', border: '#15803d', text: '#ffffff' },
  component: { bg: '#a855f7', border: '#7c3aed', text: '#ffffff' },
}

// Colors for different class types (more specific than just 'component')
const CLASS_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  model: { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },       // red - data models
  serializer: { bg: '#06b6d4', border: '#0891b2', text: '#ffffff' },  // cyan - serializers
  controller: { bg: '#f97316', border: '#ea580c', text: '#ffffff' },  // orange - controllers
  job: { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },         // purple - background jobs
  mailer: { bg: '#ec4899', border: '#db2777', text: '#ffffff' },      // pink - mailers
  service: { bg: '#14b8a6', border: '#0d9488', text: '#ffffff' },     // teal - services
  concern: { bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },     // indigo - concerns/mixins
  helper: { bg: '#84cc16', border: '#65a30d', text: '#ffffff' },      // lime - helpers
  validator: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },   // amber - validators
  middleware: { bg: '#64748b', border: '#475569', text: '#ffffff' }, // slate - middleware
  migration: { bg: '#78716c', border: '#57534e', text: '#ffffff' },   // stone - migrations
  test: { bg: '#22d3ee', border: '#06b6d4', text: '#000000' },        // cyan light - tests
  class: { bg: '#a855f7', border: '#7c3aed', text: '#ffffff' },       // purple - default class
}

const EDGE_COLORS: Record<string, string> = {
  imports: '#94a3b8',
  calls: '#22c55e',
  extends: '#f97316',     // orange - inheritance
  includes: '#8b5cf6',    // purple - mixins
  association: '#ec4899', // pink - model associations
  serializes: '#06b6d4',  // cyan - serializer relationships
}

export default function AgentGraph({ sessionName, agentId, isVisible, workingDirectory, hostUrl }: AgentGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  // Base URL for API calls - empty for local, full URL for remote hosts
  const baseUrl = hostUrl || ''
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [stats, setStats] = useState<GraphStats | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [layout, setLayout] = useState<'dagre' | 'concentric' | 'circle' | 'grid'>('dagre')
  const [nodeFilter, setNodeFilter] = useState<Set<string>>(new Set(['file', 'function', 'component']))
  const [projectPath, setProjectPath] = useState<string>(workingDirectory || '')
  const [showIndexForm, setShowIndexForm] = useState(false)
  const [focusMode, setFocusMode] = useState<{ nodeId: string; data: any } | null>(null)
  const [focusLoading, setFocusLoading] = useState(false)

  // Update project path when workingDirectory prop changes
  useEffect(() => {
    if (workingDirectory && !projectPath) {
      setProjectPath(workingDirectory)
    }
  }, [workingDirectory, projectPath])

  // Fetch graph stats
  const fetchStats = useCallback(async () => {
    if (!agentId) return

    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/graph/code?action=stats`)
      const data = await response.json()

      if (data.success) {
        setStats(data.result)
        return data.result
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
    return null
  }, [agentId, baseUrl])

  // Fetch full graph data
  const fetchGraphData = useCallback(async () => {
    if (!agentId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/graph/code?action=all`)
      const data = await response.json()

      if (data.success) {
        setGraphData(data.result)
      } else {
        setError(data.error || 'Failed to fetch graph')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [agentId, baseUrl])

  // Focus on a specific node - fetch only its relationships
  const handleFocusNode = useCallback(async (nodeId: string) => {
    if (!agentId) return

    setFocusLoading(true)
    setError(null)

    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/graph/code?action=focus&nodeId=${encodeURIComponent(nodeId)}`)
      const data = await response.json()

      if (data.success) {
        setFocusMode({ nodeId, data: data.result })
      } else {
        setError(data.error || 'Failed to focus on node')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setFocusLoading(false)
    }
  }, [agentId, baseUrl])

  // Exit focus mode
  const handleExitFocus = useCallback(() => {
    setFocusMode(null)
    setSelectedNode(null)
  }, [])

  // Try to detect project path from session name
  const detectProjectPath = useCallback(async () => {
    // Try to get project path from session metadata or worktree
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/tracking`)
      const data = await response.json()

      if (data.success && data.projects?.length > 0) {
        // Use the most recent project
        const project = data.projects[0]
        if (project.project_path) {
          setProjectPath(project.project_path)
          return project.project_path
        }
      }
    } catch (err) {
      console.error('Failed to detect project path:', err)
    }
    return null
  }, [agentId, baseUrl])

  // Index project code
  const handleIndexProject = async () => {
    if (!agentId || !projectPath) return

    setIndexing(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/graph/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          clear: true,
          // Don't specify includePatterns - let the backend auto-detect based on project type
        }),
      })

      const data = await response.json()

      if (data.success) {
        const { filesIndexed, functionsIndexed, componentsIndexed, classesIndexed, projectType, framework } = data.stats
        const classOrComponentCount = classesIndexed || componentsIndexed || 0
        const classOrComponentLabel = classesIndexed ? 'classes' : 'components'
        const projectLabel = framework ? `${projectType} (${framework})` : projectType

        setSuccess(`Indexed ${filesIndexed} files, ${functionsIndexed} functions, ${classOrComponentCount} ${classOrComponentLabel} [${projectLabel}]`)
        setStats({
          files: filesIndexed,
          functions: functionsIndexed,
          components: componentsIndexed + (classesIndexed || 0),
          imports: data.stats.importsIndexed,
          calls: data.stats.callsIndexed,
        })
        setShowIndexForm(false)
        // Refresh graph
        await fetchGraphData()
      } else {
        setError(data.error || 'Failed to index project')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIndexing(false)
    }
  }

  // Initial load
  useEffect(() => {
    if (!isVisible || !agentId) return

    const init = async () => {
      const currentStats = await fetchStats()
      await detectProjectPath()

      // If we have data, fetch the full graph
      if (currentStats && currentStats.files > 0) {
        await fetchGraphData()
      } else {
        setLoading(false)
      }
    }

    init()
  }, [isVisible, agentId, fetchStats, detectProjectPath, fetchGraphData])

  // Render graph with Cytoscape
  useEffect(() => {
    // Handle both regular graph data and focus mode data
    const dataToRender = focusMode ? focusMode.data : graphData
    if (!dataToRender || !containerRef.current || !isVisible) return

    const loadCytoscape = async () => {
      const cytoscape = (await import('cytoscape')).default
      const dagre = (await import('cytoscape-dagre')).default

      cytoscape.use(dagre)

      const elements: any[] = []

      // Get nodes based on mode
      let allNodes: GraphNode[]
      let allEdges: GraphEdge[]

      if (focusMode) {
        // Focus mode: use flat arrays from API
        allNodes = focusMode.data.nodes || []
        allEdges = focusMode.data.edges || []
      } else if (graphData) {
        // Regular mode: combine from object structure
        allNodes = [
          ...(graphData.nodes.files || []),
          ...(graphData.nodes.functions || []),
          ...(graphData.nodes.components || []),
        ]
        allEdges = [
          ...(graphData.edges.imports || []),
          ...(graphData.edges.calls || []),
          ...((graphData.edges as any).extends || []),
          ...((graphData.edges as any).includes || []),
          ...((graphData.edges as any).associations || []),
          ...((graphData.edges as any).serializes || []),
        ]
      } else {
        return
      }

      for (const node of allNodes) {
        if (!nodeFilter.has(node.type)) continue

        // Use class_type-specific colors for components
        let color = NODE_COLORS[node.type] || NODE_COLORS.file
        if (node.type === 'component' && node.class_type) {
          color = CLASS_TYPE_COLORS[node.class_type] || CLASS_TYPE_COLORS.class
        }

        const label = node.name || node.path?.split('/').pop() || node.id
        const isFocusNode = focusMode && node.id === focusMode.nodeId

        elements.push({
          group: 'nodes',
          data: {
            ...node,
            label: label.length > 20 ? label.substring(0, 17) + '...' : label,
            fullLabel: label,
            isFocusNode,
          },
          style: {
            'background-color': color.bg,
            'border-color': isFocusNode ? '#fbbf24' : color.border,
            'border-width': isFocusNode ? 4 : 2,
            'color': color.text,
          },
        })
      }

      const nodeIds = new Set(elements.map(e => e.data.id))

      // Debug: count filtered edges by type
      const edgeCounts = { total: 0, filtered: 0, byType: {} as Record<string, { total: number; filtered: number }> }
      for (const edge of allEdges) {
        edgeCounts.total++
        if (!edgeCounts.byType[edge.type]) {
          edgeCounts.byType[edge.type] = { total: 0, filtered: 0 }
        }
        edgeCounts.byType[edge.type].total++

        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          edgeCounts.filtered++
          edgeCounts.byType[edge.type].filtered++
          continue
        }

        elements.push({
          group: 'edges',
          data: {
            id: `${edge.source}-${edge.type}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            edgeType: edge.type,
          },
        })
      }

      console.log('[AgentGraph] Edge statistics:', edgeCounts)
      console.log('[AgentGraph] Node count:', elements.filter(e => e.group === 'nodes').length)
      console.log('[AgentGraph] Edge count:', elements.filter(e => e.group === 'edges').length)

      if (cyRef.current) {
        cyRef.current.destroy()
      }

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
            selector: 'edge',
            style: {
              'width': 1.5,
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 0.8,
              'opacity': 0.7,
              'line-color': '#94a3b8',
              'target-arrow-color': '#94a3b8',
            } as any,
          },
          {
            selector: 'edge[edgeType = "calls"]',
            style: {
              'line-style': 'dashed',
              'width': 1,
              'line-color': '#22c55e',
              'target-arrow-color': '#22c55e',
            } as any,
          },
          {
            selector: 'edge[edgeType = "extends"]',
            style: {
              'width': 2,
              'line-color': '#f97316',
              'target-arrow-color': '#f97316',
            } as any,
          },
          {
            selector: 'edge[edgeType = "includes"]',
            style: {
              'line-style': 'dotted',
              'width': 1.5,
              'line-color': '#8b5cf6',
              'target-arrow-color': '#8b5cf6',
            } as any,
          },
          {
            selector: 'edge[edgeType = "association"]',
            style: {
              'width': 2,
              'line-color': '#ec4899',
              'target-arrow-color': '#ec4899',
            } as any,
          },
          {
            selector: 'edge[edgeType = "serializes"]',
            style: {
              'width': 2,
              'line-color': '#06b6d4',
              'target-arrow-color': '#06b6d4',
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

      cy.on('tap', 'node', (evt: any) => {
        setSelectedNode(evt.target.data())
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, layout, nodeFilter, isVisible, focusMode?.nodeId])

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

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-gray-500">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No agent associated with this session</p>
        </div>
      </div>
    )
  }

  const hasData = stats && stats.files > 0

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-gray-900 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-200">Code Graph</span>

          {/* Focus mode indicator */}
          {focusMode && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-400 text-xs">
              <Focus className="h-3 w-3" />
              <span>Focus Mode</span>
              <button onClick={handleExitFocus} className="hover:text-yellow-200">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {stats && !focusMode && (
            <div className="flex items-center gap-3 ml-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <FileCode className="h-3 w-3 text-blue-400" />
                {stats.files} files
              </span>
              <span className="flex items-center gap-1">
                <Box className="h-3 w-3 text-green-400" />
                {stats.functions} functions
              </span>
              {/* Show class type breakdown if available */}
              {stats.classTypes && Object.keys(stats.classTypes).length > 0 ? (
                <div className="flex items-center gap-2">
                  {Object.entries(stats.classTypes).slice(0, 4).map(([type, count]) => (
                    <span key={type} className="flex items-center gap-1">
                      <div
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: CLASS_TYPE_COLORS[type]?.bg || '#a855f7' }}
                      />
                      {count} {type}s
                    </span>
                  ))}
                  {Object.keys(stats.classTypes).length > 4 && (
                    <span className="text-gray-500">+{Object.keys(stats.classTypes).length - 4} more</span>
                  )}
                </div>
              ) : (
                <span className="flex items-center gap-1">
                  <Component className="h-3 w-3 text-purple-400" />
                  {stats.components} classes
                </span>
              )}
            </div>
          )}

          {/* Focus mode node count */}
          {focusMode && (
            <div className="flex items-center gap-3 ml-4 text-xs text-gray-400">
              <span>{focusMode.data.nodes?.length || 0} connected nodes</span>
              <span>{focusMode.data.edges?.length || 0} relationships</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Layout selector */}
          {hasData && (
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value as any)}
              className="bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600"
            >
              <option value="dagre">Hierarchical</option>
              <option value="concentric">Concentric</option>
              <option value="circle">Circle</option>
              <option value="grid">Grid</option>
            </select>
          )}

          {/* Refresh/Generate button */}
          <button
            onClick={() => {
              if (hasData) {
                fetchGraphData()
              } else if (projectPath) {
                // Auto-generate if we have the project path
                handleIndexProject()
              } else {
                setShowIndexForm(true)
              }
            }}
            disabled={loading || indexing}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
          >
            {indexing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Indexing...
              </>
            ) : hasData ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Generate Graph
              </>
            )}
          </button>

          {/* Zoom controls */}
          {hasData && (
            <div className="flex items-center gap-1 ml-2">
              <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Zoom In">
                <ZoomIn className="h-4 w-4 text-gray-400" />
              </button>
              <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Zoom Out">
                <ZoomOut className="h-4 w-4 text-gray-400" />
              </button>
              <button onClick={handleFit} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Fit to View">
                <Maximize2 className="h-4 w-4 text-gray-400" />
              </button>
              <button onClick={handleReset} className="p-1.5 hover:bg-gray-700 rounded transition-colors" title="Reset View">
                <RotateCcw className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Node type filter */}
      {hasData && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/30 border-b border-gray-700/50 flex-shrink-0">
          <Layers className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-xs text-gray-500 mr-2">Show:</span>
          {['file', 'function', 'component'].map(type => (
            <button
              key={type}
              onClick={() => toggleNodeType(type)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                nodeFilter.has(type)
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {type === 'file' && <FileCode className="h-3 w-3" />}
              {type === 'function' && <Box className="h-3 w-3" />}
              {type === 'component' && <Component className="h-3 w-3" />}
              <span className="capitalize">{type}s</span>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {(error || success) && (
        <div className={`px-4 py-2 flex items-center gap-2 text-sm ${error ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {error || success}
          <button onClick={() => { setError(null); setSuccess(null); }} className="ml-auto text-gray-400 hover:text-gray-300">×</button>
        </div>
      )}

      {/* Index form modal */}
      {showIndexForm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-medium text-gray-100 mb-4">Generate Code Graph</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter the project path to index. This will auto-detect the project type (TypeScript, Ruby, Python) and build a graph of files, functions, classes, and their relationships.
            </p>
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/project"
              className="w-full bg-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowIndexForm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleIndexProject}
                disabled={!projectPath || indexing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
              >
                {indexing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Indexing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Index Project
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
              <span className="text-gray-400 text-sm">Loading graph data...</span>
            </div>
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <GitBranch className="h-16 w-16 mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">No Code Graph Data</h3>
              <p className="text-sm text-gray-500 mb-4">
                Generate a code graph to visualize your project structure, including files, functions, components, and their relationships.
              </p>
              <button
                onClick={() => {
                  if (projectPath) {
                    handleIndexProject()
                  } else {
                    setShowIndexForm(true)
                  }
                }}
                disabled={indexing}
                className="flex items-center gap-2 px-4 py-2 mx-auto text-sm font-medium rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
              >
                {indexing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Generate Code Graph
                  </>
                )}
              </button>
              {projectPath && (
                <p className="text-xs text-gray-500 mt-2">
                  Project: {projectPath}
                </p>
              )}
              <div className="mt-6 p-4 bg-gray-800/50 rounded-lg text-left">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-gray-400">
                    <p className="font-medium text-gray-300 mb-1">How it works:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Auto-detects project type (TypeScript, Ruby, Python)</li>
                      <li>Extracts functions, classes/components, and imports</li>
                      <li>Maps function calls and dependencies</li>
                      <li>Click Refresh to update after code changes</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0" />
        )}
      </div>

      {/* Node details panel */}
      {selectedNode && (
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{
                  backgroundColor: selectedNode.class_type
                    ? CLASS_TYPE_COLORS[selectedNode.class_type]?.bg
                    : NODE_COLORS[selectedNode.type]?.bg || '#64748b'
                }}
              />
              <span className="text-sm font-medium text-gray-200 capitalize">
                {selectedNode.class_type || selectedNode.type}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {focusMode ? (
                <button
                  onClick={handleExitFocus}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
                >
                  <X className="h-3 w-3" />
                  Exit Focus
                </button>
              ) : (
                <button
                  onClick={() => handleFocusNode(selectedNode.id)}
                  disabled={focusLoading}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded transition-colors"
                >
                  {focusLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Focus className="h-3 w-3" />
                  )}
                  Focus
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-gray-500">Name:</span>
              <span className="text-gray-300">{selectedNode.name || selectedNode.path?.split('/').pop()}</span>
            </div>
            {selectedNode.path && (
              <div className="flex gap-2">
                <span className="text-gray-500">Path:</span>
                <span className="text-gray-300 truncate" title={selectedNode.path}>{selectedNode.path}</span>
              </div>
            )}
            {selectedNode.class_type && (
              <div className="flex gap-2">
                <span className="text-gray-500">Type:</span>
                <span className="text-gray-300 capitalize">{selectedNode.class_type}</span>
              </div>
            )}
            {selectedNode.is_export !== undefined && (
              <div className="flex gap-2">
                <span className="text-gray-500">Exported:</span>
                <span className="text-gray-300">{selectedNode.is_export ? 'Yes' : 'No'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-900/50 border-t border-gray-700/50 text-xs flex-shrink-0">
          <span className="text-gray-500">Legend:</span>
          {['file', 'function', 'component'].map(type => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: NODE_COLORS[type]?.bg || '#64748b' }}
              />
              <span className="text-gray-400 capitalize">{type}</span>
            </div>
          ))}
          <span className="text-gray-500 ml-2">Edges:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.imports }} />
            <span className="text-gray-400">imports</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 border-t border-dashed" style={{ borderColor: EDGE_COLORS.calls }} />
            <span className="text-gray-400">calls</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.extends }} />
            <span className="text-gray-400">extends</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 border-t border-dotted" style={{ borderColor: EDGE_COLORS.includes }} />
            <span className="text-gray-400">includes</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.association }} />
            <span className="text-gray-400">assoc</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5" style={{ backgroundColor: EDGE_COLORS.serializes }} />
            <span className="text-gray-400">serializes</span>
          </div>
        </div>
      )}
    </div>
  )
}
