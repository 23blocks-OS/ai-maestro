'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  FileText,
  Search,
  RefreshCw,
  Play,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  BookOpen,
  FileCode,
  Lightbulb,
  ScrollText,
  Settings,
  GitBranch,
  Users,
  MapIcon,
  File,
  X,
  ExternalLink,
  Folder,
  FolderOpen,
  LayoutGrid,
  FolderTree
} from 'lucide-react'

interface DocStats {
  documents: number
  sections: number
  chunks: number
  embeddings: number
  byType: Record<string, number>
}

interface DocumentMeta {
  docId: string
  filePath: string
  title: string
  docType: string
  updatedAt?: number
}

interface SearchResult {
  chunkId: string
  docId: string
  filePath: string
  title: string
  docType: string
  heading?: string
  content: string
  similarity?: number
}

interface DocumentationPanelProps {
  sessionName: string
  agentId: string | null | undefined
  isVisible: boolean
  workingDirectory?: string
}

// Document type icons and colors
const DOC_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  adr: { icon: Lightbulb, color: '#f59e0b', label: 'Architecture Decision Records' },
  readme: { icon: BookOpen, color: '#3b82f6', label: 'README Files' },
  design: { icon: FileCode, color: '#8b5cf6', label: 'Design Documents' },
  api: { icon: ScrollText, color: '#06b6d4', label: 'API Documentation' },
  setup: { icon: Settings, color: '#22c55e', label: 'Setup Guides' },
  guide: { icon: MapIcon, color: '#ec4899', label: 'Guides & Tutorials' },
  spec: { icon: FileText, color: '#f97316', label: 'Specifications' },
  changelog: { icon: GitBranch, color: '#64748b', label: 'Changelogs' },
  contributing: { icon: Users, color: '#14b8a6', label: 'Contributing Guidelines' },
  roadmap: { icon: MapIcon, color: '#a855f7', label: 'Roadmaps' },
  doc: { icon: File, color: '#94a3b8', label: 'General Documentation' },
}

export default function DocumentationPanel({ sessionName, agentId, isVisible, workingDirectory }: DocumentationPanelProps) {
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [stats, setStats] = useState<DocStats | null>(null)
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [projectPath, setProjectPath] = useState<string>(workingDirectory || '')
  const [showIndexForm, setShowIndexForm] = useState(false)
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [selectedDoc, setSelectedDoc] = useState<DocumentMeta | null>(null)
  const [docContent, setDocContent] = useState<any | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [activeView, setActiveView] = useState<'browse' | 'search'>('browse')
  const [groupBy, setGroupBy] = useState<'type' | 'folder'>('folder')  // Default to folder view

  // Update project path when workingDirectory prop changes
  useEffect(() => {
    if (workingDirectory && !projectPath) {
      setProjectPath(workingDirectory)
    }
  }, [workingDirectory, projectPath])

  // Fetch documentation stats
  const fetchStats = useCallback(async () => {
    if (!agentId) return

    try {
      const response = await fetch(`/api/agents/${agentId}/docs?action=stats`)
      const data = await response.json()

      if (data.success) {
        setStats(data.result)
        return data.result
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
    return null
  }, [agentId])

  // Fetch document list
  const fetchDocuments = useCallback(async () => {
    if (!agentId) return

    try {
      const response = await fetch(`/api/agents/${agentId}/docs?action=list&limit=200`)
      const data = await response.json()

      if (data.success) {
        setDocuments(data.result || [])
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }, [agentId])

  // Load initial data
  useEffect(() => {
    if (!isVisible || !agentId) return

    const loadData = async () => {
      setLoading(true)
      setError(null)

      const statsResult = await fetchStats()

      if (statsResult && statsResult.documents > 0) {
        await fetchDocuments()
      }

      setLoading(false)
    }

    loadData()
  }, [agentId, isVisible, fetchStats, fetchDocuments])

  // Index documentation
  const indexDocumentation = async () => {
    if (!agentId || !projectPath) return

    setIndexing(true)
    setError(null)
    setSuccess(null)

    try {
      // Long timeout for indexing - it can take minutes for large projects
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000) // 10 min timeout

      const response = await fetch(`/api/agents/${agentId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, clear: true, generateEmbeddings: true }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const data = await response.json()

      if (data.success) {
        setSuccess(`Indexed ${data.stats?.documentsProcessed || data.stats?.documents || '?'} documents with ${data.stats?.chunksCreated || data.stats?.chunks || '?'} searchable chunks`)
        setShowIndexForm(false)
        await fetchStats()
        await fetchDocuments()
      } else {
        setError(data.error || 'Failed to index documentation')
      }
    } catch (err: any) {
      console.error('[DocumentationPanel] Indexing error:', err)
      if (err.name === 'AbortError') {
        // Indexing is still running in background, just timed out on client
        setSuccess('Indexing is running in the background. Refresh in a few minutes to see results.')
        setShowIndexForm(false)
      } else if (err.message === 'Failed to fetch' || err.message === '') {
        // Network error or empty body - indexing might still be running
        setSuccess('Indexing request sent. The operation may still be running - refresh in a few minutes.')
        setShowIndexForm(false)
      } else {
        setError(err.message || 'Failed to connect to indexer')
      }
    } finally {
      setIndexing(false)
    }
  }

  // Search documentation
  const searchDocumentation = async () => {
    if (!agentId || !searchQuery.trim()) return

    setSearching(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/agents/${agentId}/docs?action=search&q=${encodeURIComponent(searchQuery)}&limit=20`
      )
      const data = await response.json()

      if (data.success) {
        setSearchResults(data.result || [])
        setActiveView('search')
      } else {
        setError(data.error || 'Search failed')
      }
    } catch (err) {
      setError('Failed to search documentation')
    } finally {
      setSearching(false)
    }
  }

  // Fetch document content
  const fetchDocContent = async (doc: DocumentMeta) => {
    if (!agentId) return

    setLoadingDoc(true)
    setSelectedDoc(doc)

    try {
      const response = await fetch(`/api/agents/${agentId}/docs?action=get-doc&docId=${doc.docId}`)
      const data = await response.json()

      if (data.success) {
        setDocContent(data.result)
      }
    } catch (err) {
      console.error('Failed to fetch document:', err)
    } finally {
      setLoadingDoc(false)
    }
  }

  // Toggle type expansion
  const toggleType = (type: string) => {
    const newExpanded = new Set(expandedTypes)
    if (newExpanded.has(type)) {
      newExpanded.delete(type)
    } else {
      newExpanded.add(type)
    }
    setExpandedTypes(newExpanded)
  }

  // Group documents by type
  const documentsByType = documents.reduce((acc, doc) => {
    const type = doc.docType || 'doc'
    if (!acc[type]) acc[type] = []
    acc[type].push(doc)
    return acc
  }, {} as Record<string, DocumentMeta[]>)

  // Group documents by folder (relative to working directory)
  const documentsByFolder = documents.reduce((acc, doc) => {
    // Get relative path from working directory
    let relativePath = doc.filePath
    if (workingDirectory && doc.filePath.startsWith(workingDirectory)) {
      relativePath = doc.filePath.slice(workingDirectory.length).replace(/^\//, '')
    }

    // Extract folder path (everything except the filename)
    const parts = relativePath.split('/')
    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)'

    if (!acc[folderPath]) acc[folderPath] = []
    acc[folderPath].push(doc)
    return acc
  }, {} as Record<string, DocumentMeta[]>)

  // Sort folder keys alphabetically
  const sortedFolderKeys = Object.keys(documentsByFolder).sort((a, b) => {
    if (a === '(root)') return -1
    if (b === '(root)') return 1
    return a.localeCompare(b)
  })

  // Handle search on Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      searchDocumentation()
    }
  }

  if (!agentId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No agent selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 h-full w-full flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Documentation</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowIndexForm(!showIndexForm)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              <Play className="w-4 h-4" />
              Index
            </button>
            <button
              onClick={() => { fetchStats(); fetchDocuments(); }}
              className="p-1.5 hover:bg-gray-800 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Index Form */}
        {showIndexForm && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="Project path to index..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={indexDocumentation}
                disabled={indexing || !projectPath}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm transition-colors"
              >
                {indexing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Indexing (may take minutes)...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Index Docs
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Indexes README, ADRs, design docs, and other markdown files for semantic search.
            </p>
          </div>
        )}

        {/* Stats Bar */}
        {stats && stats.documents > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 rounded">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-400">Docs:</span>
              <span className="font-medium">{stats.documents}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 rounded">
              <BookOpen className="w-3.5 h-3.5 text-green-400" />
              <span className="text-gray-400">Sections:</span>
              <span className="font-medium">{stats.sections}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 rounded">
              <Search className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-gray-400">Chunks:</span>
              <span className="font-medium">{stats.chunks}</span>
            </div>
            {/* Group by toggle */}
            <div className="ml-auto flex items-center gap-1 bg-gray-800 rounded p-0.5">
              <button
                onClick={() => setGroupBy('folder')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  groupBy === 'folder' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Group by folder"
              >
                <FolderTree className="w-3.5 h-3.5" />
                Folders
              </button>
              <button
                onClick={() => setGroupBy('type')}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  groupBy === 'type' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
                title="Group by type"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Types
              </button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={searchDocumentation}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
          >
            {searching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
        </div>

        {/* View Toggle */}
        {searchResults.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setActiveView('browse')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                activeView === 'browse' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Browse
            </button>
            <button
              onClick={() => setActiveView('search')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                activeView === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Search Results ({searchResults.length})
            </button>
          </div>
        )}
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex-shrink-0 mx-4 mt-4 p-3 bg-green-900/30 border border-green-800 rounded-lg flex items-center gap-2 text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading documentation...</span>
            </div>
          </div>
        ) : !stats || stats.documents === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium mb-2">No Documentation Indexed</h3>
              <p className="text-gray-400 text-sm mb-4">
                Index your project&apos;s documentation to enable semantic search across README files, ADRs, design documents, and more.
              </p>
              <button
                onClick={() => setShowIndexForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Index Documentation
              </button>
            </div>
          </div>
        ) : activeView === 'search' && searchResults.length > 0 ? (
          /* Search Results View */
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {searchResults.map((result, idx) => {
              const typeConfig = DOC_TYPE_CONFIG[result.docType] || DOC_TYPE_CONFIG.doc
              const Icon = typeConfig.icon
              return (
                <div
                  key={result.chunkId || idx}
                  className="p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex-shrink-0 p-2 rounded"
                      style={{ backgroundColor: `${typeConfig.color}20` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: typeConfig.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{result.title}</span>
                        {result.similarity && (
                          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-400 rounded">
                            {Math.round(result.similarity * 100)}% match
                          </span>
                        )}
                      </div>
                      {result.heading && (
                        <div className="text-sm text-gray-400 mb-2">
                          Section: {result.heading}
                        </div>
                      )}
                      <p className="text-sm text-gray-300 line-clamp-3">{result.content}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        <span className="truncate">{result.filePath}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Browse View */
          <div className="flex-1 flex min-h-0">
            {/* Document List */}
            <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
              {groupBy === 'folder' ? (
                /* Folder-based grouping */
                sortedFolderKeys.map((folderPath) => {
                  const docs = [...documentsByFolder[folderPath]].sort((a, b) => {
                    const nameA = (a.title || a.filePath.split('/').pop() || '').toLowerCase()
                    const nameB = (b.title || b.filePath.split('/').pop() || '').toLowerCase()
                    return nameA.localeCompare(nameB)
                  })
                  const isExpanded = expandedTypes.has(`folder:${folderPath}`)
                  const displayPath = folderPath === '(root)' ? 'Root' : folderPath

                  return (
                    <div key={folderPath} className="border-b border-gray-800">
                      <button
                        onClick={() => toggleType(`folder:${folderPath}`)}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        {isExpanded ? (
                          <FolderOpen className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <Folder className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="flex-1 text-left text-sm font-medium truncate" title={displayPath}>
                          {displayPath}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                          {docs.length}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="bg-gray-850">
                          {docs.map((doc) => {
                            const typeConfig = DOC_TYPE_CONFIG[doc.docType] || DOC_TYPE_CONFIG.doc
                            const TypeIcon = typeConfig.icon
                            return (
                              <button
                                key={doc.docId}
                                onClick={() => fetchDocContent(doc)}
                                className={`w-full flex items-center gap-2 px-4 py-2 pl-10 text-left hover:bg-gray-800 transition-colors ${
                                  selectedDoc?.docId === doc.docId ? 'bg-gray-800 border-l-2 border-blue-500' : ''
                                }`}
                              >
                                <TypeIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: typeConfig.color }} />
                                <span className="text-sm truncate">{doc.title || doc.filePath.split('/').pop()}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                /* Type-based grouping */
                Object.entries(documentsByType).map(([type, docs]) => {
                  const typeConfig = DOC_TYPE_CONFIG[type] || DOC_TYPE_CONFIG.doc
                  const Icon = typeConfig.icon
                  const isExpanded = expandedTypes.has(type)

                  return (
                    <div key={type} className="border-b border-gray-800">
                      <button
                        onClick={() => toggleType(type)}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <Icon className="w-4 h-4" style={{ color: typeConfig.color }} />
                        <span className="flex-1 text-left text-sm font-medium">{typeConfig.label}</span>
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                          {docs.length}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="bg-gray-850">
                          {docs.map((doc) => (
                            <button
                              key={doc.docId}
                              onClick={() => fetchDocContent(doc)}
                              className={`w-full flex items-center gap-2 px-4 py-2 pl-10 text-left hover:bg-gray-800 transition-colors ${
                                selectedDoc?.docId === doc.docId ? 'bg-gray-800 border-l-2 border-blue-500' : ''
                              }`}
                            >
                              <File className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span className="text-sm truncate">{doc.title || doc.filePath.split('/').pop()}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Document Preview */}
            <div className="flex-1 overflow-y-auto">
              {loadingDoc ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : selectedDoc && docContent ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold mb-2">{docContent.title}</h2>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {docContent.docType}
                      </span>
                      <span className="truncate">{docContent.filePath}</span>
                    </div>
                  </div>

                  {/* Sections */}
                  <div className="space-y-4">
                    {docContent.sections?.map((section: any, idx: number) => (
                      <div key={idx} className="p-4 bg-gray-800 rounded-lg">
                        {section.heading && (
                          <h3 className="font-medium mb-2 text-blue-400">{section.heading}</h3>
                        )}
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">
                          {section.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a document to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
