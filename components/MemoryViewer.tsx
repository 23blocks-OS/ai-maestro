'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Brain, List, Share2, Search, Filter, Edit2, Trash2, Save, X,
  ChevronDown, RefreshCw, Lightbulb, Settings, FileText, Heart,
  GitBranch, Zap, ArrowRight, Clock, TrendingUp, AlertCircle, Play
} from 'lucide-react'

// Types
interface Memory {
  memory_id: string
  category: string
  tier: string
  content: string
  context?: string | null
  confidence: number
  reinforcement_count: number
  created_at?: number
  access_count?: number
  related?: Array<{
    memory_id: string
    relationship: string
    content: string
    distance: number
  }>
}

interface GraphNode {
  id: string
  category: string
  tier: string
  content: string
  confidence: number
  reinforcement_count: number
  // Physics properties
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphLink {
  source: string
  target: string
  relationship: string
}

interface MemoryStats {
  total_memories: number
  by_category: Record<string, number>
  by_tier: Record<string, number>
  by_system: Record<number, number>
  average_confidence: number
  total_reinforcements: number
  last_consolidation?: {
    run_id: string
    timestamp: number
    memories_created: number
  }
}

interface MemoryViewerProps {
  agentId: string
  hostUrl?: string
  isVisible?: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  fact: '#3b82f6',      // blue
  decision: '#8b5cf6',  // purple
  preference: '#ec4899', // pink
  pattern: '#f59e0b',   // amber
  insight: '#10b981',   // emerald
  reasoning: '#06b6d4'  // cyan
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  fact: <FileText className="w-4 h-4" />,
  decision: <GitBranch className="w-4 h-4" />,
  preference: <Heart className="w-4 h-4" />,
  pattern: <Settings className="w-4 h-4" />,
  insight: <Lightbulb className="w-4 h-4" />,
  reasoning: <Zap className="w-4 h-4" />
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  leads_to: '#22c55e',    // green
  contradicts: '#ef4444', // red
  supports: '#3b82f6',    // blue
  supersedes: '#f59e0b'   // amber
}

export default function MemoryViewer({ agentId, hostUrl = '', isVisible = true }: MemoryViewerProps) {
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [memories, setMemories] = useState<Memory[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [hasInitialized, setHasInitialized] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [consolidating, setConsolidating] = useState(false)
  const [consolidationResult, setConsolidationResult] = useState<{
    success: boolean
    memoriesCreated?: number
    memoriesReinforced?: number
    error?: string
  } | null>(null)

  // Edit state
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [saving, setSaving] = useState(false)

  // Graph state
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] } | null>(null)

  // Fetch memories
  const fetchMemories = useCallback(async () => {
    setLoading(true)
    try {
      let url = `${hostUrl}/api/agents/${agentId}/memory/long-term?limit=100`
      if (searchQuery) {
        url += `&query=${encodeURIComponent(searchQuery)}`
      }
      if (categoryFilter) {
        url += `&category=${categoryFilter}`
      }

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setMemories(data.memories || [])
      }
    } catch (error) {
      console.error('Failed to fetch memories:', error)
    } finally {
      setLoading(false)
    }
  }, [agentId, hostUrl, searchQuery, categoryFilter])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/memory/long-term?view=stats`)
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }, [agentId, hostUrl])

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/memory/long-term?view=graph&limit=100`)
      if (response.ok) {
        const data = await response.json()
        setGraphData(data.graph)
      }
    } catch (error) {
      console.error('Failed to fetch graph:', error)
    }
  }, [agentId, hostUrl])

  // Trigger consolidation
  const triggerConsolidation = async () => {
    setConsolidating(true)
    setConsolidationResult(null)
    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/memory/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await response.json()

      setConsolidationResult({
        success: data.success,
        memoriesCreated: data.memories_created,
        memoriesReinforced: data.memories_reinforced,
        error: data.error
      })

      if (data.success) {
        // Refresh memories and stats after consolidation
        await fetchMemories()
        await fetchStats()
        if (view === 'graph') {
          await fetchGraph()
        }
      }
    } catch (error) {
      setConsolidationResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to consolidate'
      })
    } finally {
      setConsolidating(false)
    }
  }

  // Only fetch when visible and not already initialized
  useEffect(() => {
    if (isVisible && !hasInitialized) {
      setHasInitialized(true)
      fetchMemories()
      fetchStats()
    }
  }, [isVisible, hasInitialized, fetchMemories, fetchStats])

  useEffect(() => {
    if (isVisible && view === 'graph') {
      fetchGraph()
    }
  }, [isVisible, view, fetchGraph])

  // Handle edit
  const startEdit = (memory: Memory) => {
    setEditingMemory(memory)
    setEditContent(memory.content)
    setEditCategory(memory.category)
  }

  const cancelEdit = () => {
    setEditingMemory(null)
    setEditContent('')
    setEditCategory('')
  }

  const saveEdit = async () => {
    if (!editingMemory) return

    setSaving(true)
    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/memory/long-term`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingMemory.memory_id,
          content: editContent,
          category: editCategory
        })
      })

      if (response.ok) {
        await fetchMemories()
        await fetchStats()
        cancelEdit()
      }
    } catch (error) {
      console.error('Failed to save memory:', error)
    } finally {
      setSaving(false)
    }
  }

  // Handle delete
  const deleteMemory = async (memoryId: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return

    try {
      const response = await fetch(`${hostUrl}/api/agents/${agentId}/memory/long-term?id=${memoryId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchMemories()
        await fetchStats()
      }
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }

  const categories = Object.keys(CATEGORY_COLORS)

  return (
    <div className="space-y-4">
      {/* Consolidate Action Bar */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg border border-purple-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-200">Memory Consolidation</div>
            <div className="text-xs text-gray-400">
              Extract long-term memories from your conversations
            </div>
          </div>
        </div>
        <button
          onClick={triggerConsolidation}
          disabled={consolidating}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 text-white rounded-lg font-medium text-sm transition-all"
        >
          {consolidating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Consolidating...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Consolidate Now
            </>
          )}
        </button>
      </div>

      {/* Consolidation Result */}
      {consolidationResult && (
        <div className={`p-3 rounded-lg border ${
          consolidationResult.success
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          {consolidationResult.success ? (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <TrendingUp className="w-4 h-4" />
              <span>
                Created {consolidationResult.memoriesCreated || 0} memories, reinforced {consolidationResult.memoriesReinforced || 0}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span>{consolidationResult.error || 'Consolidation failed'}</span>
            </div>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="text-2xl font-bold text-gray-100">{stats.total_memories}</div>
            <div className="text-xs text-gray-400">Total Memories</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="text-2xl font-bold text-gray-100">{stats.total_reinforcements}</div>
            <div className="text-xs text-gray-400">Reinforcements</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="text-2xl font-bold text-gray-100">{(stats.average_confidence * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-400">Avg Confidence</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="text-2xl font-bold text-gray-100">
              {stats.last_consolidation ? new Date(stats.last_consolidation.timestamp).toLocaleDateString() : 'Never'}
            </div>
            <div className="text-xs text-gray-400">Last Consolidation</div>
          </div>
        </div>
      )}

      {/* View Toggle & Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              view === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <List className="w-4 h-4" />
            List
          </button>
          <button
            onClick={() => setView('graph')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              view === 'graph'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Share2 className="w-4 h-4" />
            Graph
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchMemories()}
              placeholder="Search memories..."
              className="pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 w-64"
            />
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                categoryFilter
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              {categoryFilter || 'All'}
              <ChevronDown className="w-4 h-4" />
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-2">
                <button
                  onClick={() => { setCategoryFilter(null); setShowFilters(false) }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-all ${
                    !categoryFilter ? 'text-blue-400' : 'text-gray-300'
                  }`}
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setCategoryFilter(cat); setShowFilters(false) }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-700 transition-all flex items-center gap-2 ${
                      categoryFilter === cat ? 'text-blue-400' : 'text-gray-300'
                    }`}
                  >
                    <span style={{ color: CATEGORY_COLORS[cat] }}>{CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                    {stats?.by_category[cat] && (
                      <span className="ml-auto text-xs text-gray-500">{stats.by_category[cat]}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => { fetchMemories(); fetchStats(); if (view === 'graph') fetchGraph(); }}
            className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {view === 'list' ? (
        <MemoryList
          memories={memories}
          loading={loading}
          onEdit={startEdit}
          onDelete={deleteMemory}
        />
      ) : (
        <MemoryGraph
          data={graphData}
          loading={loading}
        />
      )}

      {/* Edit Modal */}
      {editingMemory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Edit2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Edit Memory</h3>
                <p className="text-sm text-gray-400">Correct or update this memory</p>
              </div>
            </div>

            {/* Category Selector */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-400 mb-2 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setEditCategory(cat)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                      editCategory === cat
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    <span style={{ color: CATEGORY_COLORS[cat] }}>{CATEGORY_ICONS[cat]}</span>
                    <span className="capitalize">{cat}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-400 mb-2 block">Content</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelEdit}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editContent.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Memory List Component
function MemoryList({
  memories,
  loading,
  onEdit,
  onDelete
}: {
  memories: Memory[]
  loading: boolean
  onEdit: (memory: Memory) => void
  onDelete: (memoryId: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Brain className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">No memories found</p>
        <p className="text-sm">Trigger a consolidation to extract memories from conversations</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
      {memories.map(memory => (
        <div
          key={memory.memory_id}
          className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all group"
        >
          <div className="flex items-start gap-3">
            {/* Category Icon */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${CATEGORY_COLORS[memory.category]}20` }}
            >
              <span style={{ color: CATEGORY_COLORS[memory.category] }}>
                {CATEGORY_ICONS[memory.category] || <Brain className="w-5 h-5" />}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: `${CATEGORY_COLORS[memory.category]}20`,
                    color: CATEGORY_COLORS[memory.category]
                  }}
                >
                  {memory.category}
                </span>
                <span className="text-xs text-gray-500">
                  {memory.tier}
                </span>
                {memory.reinforcement_count > 1 && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {memory.reinforcement_count}x reinforced
                  </span>
                )}
              </div>

              <p className="text-gray-200 text-sm mb-2">{memory.content}</p>

              {memory.context && (
                <p className="text-gray-500 text-xs italic mb-2">
                  Context: {memory.context}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {(memory.confidence * 100).toFixed(0)}% confidence
                </span>
                {memory.created_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(memory.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Related memories */}
              {memory.related && memory.related.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <p className="text-xs text-gray-500 mb-2">Related memories:</p>
                  <div className="space-y-1">
                    {memory.related.slice(0, 3).map(rel => (
                      <div key={rel.memory_id} className="flex items-center gap-2 text-xs">
                        <ArrowRight
                          className="w-3 h-3"
                          style={{ color: RELATIONSHIP_COLORS[rel.relationship] || '#6b7280' }}
                        />
                        <span className="text-gray-500">{rel.relationship}:</span>
                        <span className="text-gray-400 truncate">{rel.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(memory)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-all text-gray-400 hover:text-blue-400"
                title="Edit memory"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(memory.memory_id)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-all text-gray-400 hover:text-red-400"
                title="Delete memory"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Force-Directed Graph Component
function MemoryGraph({
  data,
  loading
}: {
  data: { nodes: GraphNode[], links: GraphLink[] } | null
  loading: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const animationRef = useRef<number>()

  // Initialize nodes with positions
  useEffect(() => {
    if (!data) return

    const width = 800
    const height = 400
    const initializedNodes = data.nodes.map((node, i) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 300,
      y: height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0
    }))
    setNodes(initializedNodes)
  }, [data])

  // Force simulation
  useEffect(() => {
    if (!data || nodes.length === 0) return

    const width = 800
    const height = 400
    const centerX = width / 2
    const centerY = height / 2

    const simulate = () => {
      setNodes(prevNodes => {
        const newNodes = prevNodes.map(node => ({ ...node }))

        // Apply forces
        for (let i = 0; i < newNodes.length; i++) {
          const node = newNodes[i]

          // Center gravity
          node.vx! += (centerX - node.x!) * 0.001
          node.vy! += (centerY - node.y!) * 0.001

          // Node repulsion
          for (let j = i + 1; j < newNodes.length; j++) {
            const other = newNodes[j]
            const dx = node.x! - other.x!
            const dy = node.y! - other.y!
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = 500 / (dist * dist)

            node.vx! += (dx / dist) * force
            node.vy! += (dy / dist) * force
            other.vx! -= (dx / dist) * force
            other.vy! -= (dy / dist) * force
          }
        }

        // Link attraction
        for (const link of data.links) {
          const source = newNodes.find(n => n.id === link.source)
          const target = newNodes.find(n => n.id === link.target)
          if (!source || !target) continue

          const dx = target.x! - source.x!
          const dy = target.y! - source.y!
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - 100) * 0.01

          source.vx! += (dx / dist) * force
          target.vx! -= (dx / dist) * force
          source.vy! += (dy / dist) * force
          target.vy! -= (dy / dist) * force
        }

        // Apply velocity and damping
        for (const node of newNodes) {
          node.vx! *= 0.9
          node.vy! *= 0.9
          node.x! += node.vx!
          node.y! += node.vy!

          // Boundary constraints
          node.x = Math.max(30, Math.min(width - 30, node.x!))
          node.y = Math.max(30, Math.min(height - 30, node.y!))
        }

        return newNodes
      })

      animationRef.current = requestAnimationFrame(simulate)
    }

    // Run simulation for a limited time
    simulate()
    const timeout = setTimeout(() => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }, 3000) // Stop after 3 seconds

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      clearTimeout(timeout)
    }
  }, [data, nodes.length > 0])

  // Draw graph
  useEffect(() => {
    if (!canvasRef.current || !data || nodes.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw links
    for (const link of data.links) {
      const source = nodes.find(n => n.id === link.source)
      const target = nodes.find(n => n.id === link.target)
      if (!source || !target || !source.x || !target.x) continue

      ctx.beginPath()
      ctx.moveTo(source.x, source.y!)
      ctx.lineTo(target.x, target.y!)
      ctx.strokeStyle = RELATIONSHIP_COLORS[link.relationship] || '#4b5563'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Draw nodes
    for (const node of nodes) {
      if (!node.x || !node.y) continue

      const isHovered = hoveredNode?.id === node.id
      const radius = isHovered ? 14 : 10

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = CATEGORY_COLORS[node.category] || '#6b7280'
      ctx.fill()

      // Border
      ctx.strokeStyle = isHovered ? '#ffffff' : '#374151'
      ctx.lineWidth = isHovered ? 2 : 1
      ctx.stroke()

      // Label for hovered node
      if (isHovered) {
        ctx.font = '12px Inter, system-ui'
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        const label = node.content.substring(0, 50) + (node.content.length > 50 ? '...' : '')
        ctx.fillText(label, node.x, node.y - 20)
      }
    }
  }, [nodes, data, hoveredNode])

  // Handle mouse move for hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find hovered node
    const found = nodes.find(node => {
      if (!node.x || !node.y) return false
      const dx = x - node.x
      const dy = y - node.y
      return Math.sqrt(dx * dx + dy * dy) < 15
    })

    setHoveredNode(found || null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 bg-gray-800/30 rounded-lg border border-gray-700">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-gray-800/30 rounded-lg border border-gray-700 text-gray-400">
        <Share2 className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">No graph data</p>
        <p className="text-sm">Memories need relationships to form a graph</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={800}
        height={400}
        onMouseMove={handleMouseMove}
        className="w-full rounded-lg border border-gray-700 cursor-crosshair"
        style={{ background: '#111827' }}
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 border border-gray-700">
        <div className="text-xs font-medium text-gray-400 mb-2">Categories</div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-400 capitalize">{cat}</span>
            </div>
          ))}
        </div>
        <div className="text-xs font-medium text-gray-400 mt-3 mb-2">Relationships</div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(RELATIONSHIP_COLORS).map(([rel, color]) => (
            <div key={rel} className="flex items-center gap-1.5">
              <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-400">{rel.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hovered node info */}
      {hoveredNode && (
        <div className="absolute top-4 right-4 bg-gray-900/90 backdrop-blur-sm rounded-lg p-3 border border-gray-700 max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${CATEGORY_COLORS[hoveredNode.category]}20`,
                color: CATEGORY_COLORS[hoveredNode.category]
              }}
            >
              {hoveredNode.category}
            </span>
            <span className="text-xs text-gray-500">{hoveredNode.tier}</span>
          </div>
          <p className="text-sm text-gray-200">{hoveredNode.content}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>{(hoveredNode.confidence * 100).toFixed(0)}% confidence</span>
            {hoveredNode.reinforcement_count > 1 && (
              <span>{hoveredNode.reinforcement_count}x reinforced</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
