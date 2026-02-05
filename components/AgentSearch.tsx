'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Filter, X, ChevronDown, ChevronUp, AlertCircle, FileText, MessageSquare, Zap } from 'lucide-react'
import { useAgentSearch } from '@/hooks/useAgentSearch'
import type { HighlightedSearchResult } from '@/types/search'

interface AgentSearchProps {
  agentId: string
  agentName?: string
  onResultClick?: (result: HighlightedSearchResult) => void
  className?: string
}

type FilterMode = 'all' | 'messages' | 'code' | 'conversations'

export default function AgentSearch({ agentId, agentName, onResultClick, className = '' }: AgentSearchProps) {
  const [query, setLocalQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [resultsPerPage, setResultsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  const { results, loading, error, setQuery: setHookQuery, clearSearch } = useAgentSearch(agentId)
  
  // Calculate pagination
  const totalPages = results ? Math.ceil(results.total / resultsPerPage) : 0
  const paginatedResults = results?.results.slice(
    (currentPage - 1) * resultsPerPage,
    currentPage * resultsPerPage
  ) || []
  
  // Reset to first page when query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [query])
  
  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalQuery(e.target.value)
    setHookQuery(e.target.value)
  }, [setHookQuery])
  
  // Clear search
  const handleClear = useCallback(() => {
    setLocalQuery('')
    setHookQuery('')
    if (searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [setHookQuery])
  
  // Keyboard shortcut for search (Ctrl/Cmd + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (searchInputRef.current) {
          searchInputRef.current.focus()
          searchInputRef.current.select()
        }
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Get result type icon
  const getResultTypeIcon = (result: HighlightedSearchResult) => {
    const role = result.role
    if (role === 'system') return <Zap className="w-4 h-4 text-purple-400" />
    if (role === 'assistant') return <MessageSquare className="w-4 h-4 text-blue-400" />
    return <FileText className="w-4 h-4 text-green-400" />
  }
  
  // Get result type badge
  const getResultTypeBadge = (result: HighlightedSearchResult) => {
    const role = result.role
    const badges = {
      system: { text: 'System', color: 'bg-purple-100 text-purple-600' },
      assistant: { text: 'Assistant', color: 'bg-blue-100 text-blue-600' },
      user: { text: 'User', color: 'bg-green-100 text-green-600' },
    }
    const badge = badges[role as keyof typeof badges] || badges.user
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
        {badge.text}
      </span>
    )
  }
  
  // Render result card
  const renderResult = (result: HighlightedSearchResult) => (
    <div
      key={result.msg_id}
      onClick={() => onResultClick?.(result)}
      className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {getResultTypeIcon(result)}
          {getResultTypeBadge(result)}
        </div>
        <span className="text-xs text-gray-500">
          {new Date(result.ts * 1000).toLocaleString()}
        </span>
      </div>
      <div
        className="text-sm text-gray-200 mb-2 line-clamp-3"
        dangerouslySetInnerHTML={{ __html: result.highlightedText }}
      />
      <div className="text-xs text-gray-500">
        {result.conversation_file}
      </div>
    </div>
  )
  
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={handleSearchChange}
          placeholder="Search conversations, messages, and code..."
          className="w-full pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-10 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors ${query ? 'right-10' : ''}`}
          title="Toggle filters"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>
      
      {/* Filters Panel */}
      {showFilters && (
        <div className="mt-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-200">Filters</h3>
            <button
              onClick={() => setShowFilters(false)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
            {/* Filter Mode */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Search In
              </label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Content</option>
                <option value="messages">Messages Only</option>
                <option value="code">Code Blocks</option>
                <option value="conversations">Conversations</option>
              </select>
            </div>
            
            {/* Results Per Page */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Results Per Page
              </label>
              <select
                value={resultsPerPage}
                onChange={(e) => setResultsPerPage(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={5}>5 results</option>
                <option value={10}>10 results</option>
                <option value={20}>20 results</option>
                <option value={50}>50 results</option>
              </select>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading State */}
      {loading && query && (
        <div className="mt-4 flex items-center justify-center py-8 text-gray-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mr-2" />
          Searching...
        </div>
      )}
      
      {/* Error State */}
      {error && query && (
        <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error.message}</span>
          </div>
        </div>
      )}
      
      {/* Results */}
      {results && !loading && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400">
              {results.total === 0
                ? 'No results found'
                : `Found ${results.total} result${results.total !== 1 ? 's' : ''}`
              }
            </p>
            {results.total > resultsPerPage && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Filters
              </button>
            )}
          </div>
          
          {results.total === 0 && query ? (
            <div className="text-center py-8 text-gray-500">
              <p>No results found for &quot;{query}&quot;</p>
              <p className="text-sm mt-1">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedResults.map(renderResult)}
            </div>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Previous
              </button>
              
              <span className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Keyboard Shortcut Hint */}
      {!query && (
        <div className="mt-2 text-center text-xs text-gray-500">
          Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700">Ctrl/Cmd + K</kbd> to focus search
        </div>
      )}
    </div>
  )
}
