/**
 * Search Types for Phase 5 Features
 *
 * Defines interfaces for searching agent conversation data using RAG.
 */

/**
 * Search query with filtering options
 */
export interface SearchQuery {
  queryText: string                       // Main search query text
  filters?: SearchFilter                     // Advanced filtering options
}

/**
 * Search filter options for refining results
 */
export interface SearchFilter {
  dateRange?: {
    start: number                           // Start timestamp (unix ms)
    end: number                             // End timestamp (unix ms)
  }
  messageTypes?: Array<'user' | 'assistant' | 'system'>
  sources?: string[]                          // Specific conversation files to search
  minScore?: number                         // Minimum relevance score threshold
  mode?: 'hybrid' | 'semantic' | 'term' | 'symbol'
  limit?: number                             // Max results to return
  useRrf?: boolean                          // Use Reciprocal Rank Fusion
  bm25Weight?: number                        // Weight for BM25 results (0-1)
  semanticWeight?: number                     // Weight for semantic results (0-1)
}

/**
 * Individual search result
 * Note: SearchResult is also defined in lib/rag/search.ts
 * This interface should match that one for consistency
 */
export interface SearchResult {
  msg_id: string                           // Unique message identifier
  text: string                             // Message content
  role: string                             // Message role (user/assistant/system)
  ts: number                               // Timestamp
  conversation_file: string                  // Source conversation file
  score?: number                            // Relevance score
  highlight?: string                        // Highlighted text with search terms
  metadata?: Record<string, any>           // Additional metadata
}

/**
 * Extended search result with highlighting
 */
export interface HighlightedSearchResult extends SearchResult {
  highlightedText: string                  // Text with <mark> tags for highlighted terms
  highlightRanges: Array<{                 // Character ranges of highlights
    start: number
    end: number
  }>
}

/**
 * Search session filter options
 */
export interface SearchSessionFilter {
  startDate?: Date                          // Filter sessions starting after this date
  endDate?: Date                            // Filter sessions ending before this date
  minMessageCount?: number                   // Minimum message count
  maxMessageCount?: number                   // Maximum message count
  activityLevel?: 'high' | 'medium' | 'low'  // Activity level filter
}
