'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SearchQuery, SearchResult, HighlightedSearchResult } from '@/types/search'

/**
 * Debounce delay for search queries (in milliseconds)
 */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Interface for search results with highlighting
 */
export interface SearchResults {
  results: HighlightedSearchResult[]
  total: number
  query: string
  highlights: string[]
  timestamp: number
}

/**
 * Hook for searching agent conversation data
 *
 * Provides debounced search, results management, and error handling
 * for searching across agent messages, conversations, and code.
 *
 * @param agentId - Agent ID to search within
 */
export function useAgentSearch(agentId: string) {
  const [query, setQuery] = useState<string>('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')

  // Ref to track debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout>()

  // Ref to track if component is mounted (for async operations)
  const isMountedRef = useRef(true)

  /**
   * Perform search with the current debounced query
   */
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log(`[useAgentSearch] Searching for: "${searchQuery}" in agent ${agentId}`)

      const queryParams = new URLSearchParams({
        q: searchQuery
      })

      const response = await fetch(`/api/agents/${agentId}/search?${queryParams.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (!isMountedRef.current) return

      const searchResults: HighlightedSearchResult[] = data.results || []
      const searchTerms = extractSearchTerms(searchQuery)
      const highlightedResults = highlightResults(searchResults, searchTerms)

      setResults({
        results: highlightedResults,
        total: data.count || highlightedResults.length,
        query: searchQuery,
        highlights: searchTerms,
        timestamp: Date.now()
      })

      console.log(`[useAgentSearch] Found ${data.count} results for query "${searchQuery}"`)
    } catch (err) {
      if (!isMountedRef.current) return

      console.error('[useAgentSearch] Search failed:', err)
      setError(err instanceof Error ? err : new Error('Unknown search error'))
      setResults(null)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [agentId])

  /**
   * Update search query with debouncing
   */
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(query)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [query])

  /**
   * Perform search when debounced query changes
   */
  useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery, performSearch])

  /**
   * Clear search results and query
   */
  const clearSearch = useCallback(() => {
    setQuery('')
    setResults(null)
    setError(null)
    setLoading(false)
  }, [])

  /**
   * Retry the last search
   */
  const retrySearch = useCallback(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery)
    }
  }, [debouncedQuery, performSearch])

  /**
   * Extract search terms from query for highlighting
   * Removes common stop words and punctuation
   */
  function extractSearchTerms(queryText: string): string[] {
    const words = queryText
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)

    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again'
    ])

    return words.filter(word => !stopWords.has(word))
  }

  /**
   * Add highlighting to search results
   */
  function highlightResults(
    searchResults: SearchResult[],
    highlightTerms: string[]
  ): HighlightedSearchResult[] {
    return searchResults.map((result) => {
      const text = result.text
      const highlightRanges: Array<{ start: number; end: number }> = []

      for (const term of highlightTerms) {
        const lowerText = text.toLowerCase()
        const lowerTerm = term.toLowerCase()
        let position = lowerText.indexOf(lowerTerm)

        while (position !== -1) {
          highlightRanges.push({ start: position, end: position + term.length })
          position = lowerText.indexOf(lowerTerm, position + term.length)
        }
      }

      highlightRanges.sort((a, b) => a.start - b.start)

      let highlightedText = ''
      let lastIndex = 0

      for (const range of highlightRanges) {
        highlightedText += text.substring(lastIndex, range.start)
        highlightedText += `<mark>${text.substring(range.start, range.end)}</mark>`
        lastIndex = range.end
      }

      highlightedText += text.substring(lastIndex)

      return {
        ...result,
        highlightedText,
        highlightRanges
      }
    })
  }

  return {
    // State
    query,
    results,
    loading,
    error,

    // Actions
    setQuery,
    clearSearch,
    retrySearch
  }
}
