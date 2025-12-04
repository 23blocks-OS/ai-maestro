'use client'

import React, { useState, useEffect } from 'react'
import { GitBranch, Database, RefreshCw, FolderTree, Search, Play, Trash2, AlertCircle } from 'lucide-react'
import GraphVisualization from '@/components/GraphVisualization'

interface Agent {
  id: string
  alias: string
  displayName: string
}

interface GraphStats {
  files?: number
  functions?: number
  components?: number
  imports?: number
  calls?: number
  databases?: number
  schemas?: number
  tables?: number
  columns?: number
  foreign_keys?: number
  indexes?: number
  views?: number
}

export default function GraphExplorerPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [graphType, setGraphType] = useState<'code' | 'db'>('code')
  const [codeStats, setCodeStats] = useState<GraphStats | null>(null)
  const [dbStats, setDbStats] = useState<GraphStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [connectionString, setConnectionString] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch agents
  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        if (data.agents) {
          setAgents(data.agents)
          if (data.agents.length > 0 && !selectedAgent) {
            setSelectedAgent(data.agents[0].id)
          }
        }
      })
      .catch(err => console.error('Failed to fetch agents:', err))
  }, [])

  // Fetch stats when agent changes
  useEffect(() => {
    if (!selectedAgent) return

    const fetchStats = async () => {
      setLoading(true)
      try {
        const [codeRes, dbRes] = await Promise.all([
          fetch(`/api/agents/${selectedAgent}/graph/code?action=stats`),
          fetch(`/api/agents/${selectedAgent}/graph/db?action=stats`),
        ])

        const codeData = await codeRes.json()
        const dbData = await dbRes.json()

        if (codeData.success) setCodeStats(codeData.result)
        if (dbData.success) setDbStats(dbData.result)
      } catch (err) {
        console.error('Failed to fetch stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [selectedAgent])

  // Index code
  const handleIndexCode = async () => {
    if (!projectPath || !selectedAgent) return

    setIndexing(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/agents/${selectedAgent}/graph/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(`Indexed ${data.stats.filesIndexed} files, ${data.stats.functionsIndexed} functions`)
        setCodeStats({
          files: data.stats.filesIndexed,
          functions: data.stats.functionsIndexed,
          components: data.stats.componentsIndexed,
          imports: data.stats.importsIndexed,
          calls: data.stats.callsIndexed,
        })
      } else {
        setError(data.error || 'Failed to index code')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIndexing(false)
    }
  }

  // Index database
  const handleIndexDb = async () => {
    if (!connectionString || !selectedAgent) return

    setIndexing(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/agents/${selectedAgent}/graph/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString }),
      })

      const data = await res.json()

      if (data.success) {
        setSuccess(`Indexed ${data.stats.tablesIndexed} tables, ${data.stats.columnsIndexed} columns`)
        setDbStats({
          databases: 1,
          schemas: data.stats.schemasIndexed,
          tables: data.stats.tablesIndexed,
          columns: data.stats.columnsIndexed,
          foreign_keys: data.stats.foreignKeysIndexed,
          indexes: data.stats.indexesIndexed,
          views: data.stats.viewsIndexed,
        })
      } else {
        setError(data.error || 'Failed to index database')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIndexing(false)
    }
  }

  // Clear graph
  const handleClearGraph = async () => {
    if (!selectedAgent) return

    const endpoint = graphType === 'code'
      ? `/api/agents/${selectedAgent}/graph/code?project=${encodeURIComponent(projectPath || 'all')}`
      : `/api/agents/${selectedAgent}/graph/db?database=all`

    try {
      const res = await fetch(endpoint, { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setSuccess('Graph cleared successfully')
        if (graphType === 'code') {
          setCodeStats({ files: 0, functions: 0, components: 0, imports: 0, calls: 0 })
        } else {
          setDbStats({ databases: 0, schemas: 0, tables: 0, columns: 0, foreign_keys: 0 })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const hasGraphData = graphType === 'code'
    ? (codeStats?.files || 0) > 0
    : (dbStats?.tables || 0) > 0

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <FolderTree className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl font-semibold">Knowledge Graph Explorer</h1>
        </div>

        {/* Agent selector */}
        <div className="flex items-center gap-4">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-neutral-800 text-neutral-200 rounded-lg px-4 py-2 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Agent</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.displayName || agent.alias}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-80 border-r border-neutral-800 flex flex-col">
          {/* Graph type tabs */}
          <div className="flex border-b border-neutral-800">
            <button
              onClick={() => setGraphType('code')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                graphType === 'code'
                  ? 'bg-neutral-800 text-blue-400 border-b-2 border-blue-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <GitBranch className="h-4 w-4" />
              Code Graph
            </button>
            <button
              onClick={() => setGraphType('db')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                graphType === 'db'
                  ? 'bg-neutral-800 text-orange-400 border-b-2 border-orange-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Database className="h-4 w-4" />
              DB Schema
            </button>
          </div>

          {/* Stats */}
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-sm font-medium text-neutral-400 mb-3">Graph Statistics</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-neutral-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : graphType === 'code' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-400">{codeStats?.files || 0}</div>
                  <div className="text-xs text-neutral-500">Files</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{codeStats?.functions || 0}</div>
                  <div className="text-xs text-neutral-500">Functions</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-400">{codeStats?.components || 0}</div>
                  <div className="text-xs text-neutral-500">Components</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-neutral-400">{codeStats?.calls || 0}</div>
                  <div className="text-xs text-neutral-500">Calls</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-cyan-400">{dbStats?.tables || 0}</div>
                  <div className="text-xs text-neutral-500">Tables</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-neutral-400">{dbStats?.columns || 0}</div>
                  <div className="text-xs text-neutral-500">Columns</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-orange-400">{dbStats?.foreign_keys || 0}</div>
                  <div className="text-xs text-neutral-500">Foreign Keys</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-400">{dbStats?.indexes || 0}</div>
                  <div className="text-xs text-neutral-500">Indexes</div>
                </div>
              </div>
            )}
          </div>

          {/* Indexing controls */}
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="text-sm font-medium text-neutral-400 mb-3">
              {graphType === 'code' ? 'Index Code' : 'Index Database'}
            </h3>

            {graphType === 'code' ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/project"
                  className="w-full bg-neutral-800 text-neutral-200 rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleIndexCode}
                  disabled={indexing || !projectPath || !selectedAgent}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
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
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  placeholder="postgres://user:pass@host:5432/db"
                  className="w-full bg-neutral-800 text-neutral-200 rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={handleIndexDb}
                  disabled={indexing || !connectionString || !selectedAgent}
                  className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  {indexing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Index Database
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Clear button */}
            {hasGraphData && (
              <button
                onClick={handleClearGraph}
                className="w-full flex items-center justify-center gap-2 mt-4 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Clear Graph
              </button>
            )}

            {/* Messages */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400">{success}</p>
              </div>
            )}
          </div>
        </aside>

        {/* Graph visualization area */}
        <main className="flex-1 p-4 min-h-0">
          {selectedAgent && hasGraphData ? (
            <GraphVisualization
              agentId={selectedAgent}
              graphType={graphType}
              onNodeSelect={(node) => console.log('Selected:', node)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <Search className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg mb-2">No graph data available</p>
              <p className="text-sm">
                {!selectedAgent
                  ? 'Select an agent to view its knowledge graph'
                  : graphType === 'code'
                    ? 'Index a project to visualize its code structure'
                    : 'Index a database to visualize its schema'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
