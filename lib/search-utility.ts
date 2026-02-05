/**
 * Search Utility Functions for Phase 5 Features
 *
 * Provides high-level search helpers for:
 * - Searching indexed messages using CozoDB
 * - Filtering sessions by date, activity, message count
 * - Building search responses with term highlighting
 */

import { AgentDatabase } from './cozo-db'
import {
  hybridSearch,
  semanticSearch,
  searchByTerm,
  searchBySymbol,
  type SearchResult
} from './rag/search'

/**
 * Search Options for searchMessages
 */
export interface SearchMessagesOptions {
  limit?: number
  minScore?: number
  useRrf?: boolean
  bm25Weight?: number
  semanticWeight?: number
  roleFilter?: 'user' | 'assistant' | 'system'
  conversationFile?: string
  startTs?: number
  endTs?: number
  mode?: 'hybrid' | 'semantic' | 'term' | 'symbol'
}

/**
 * Session Filter Options
 */
export interface SessionFilter {
  startDate?: Date
  endDate?: Date
  minMessageCount?: number
  maxMessageCount?: number
  activityLevel?: 'high' | 'medium' | 'low'
}

/**
 * Highlighted Search Result
 */
export interface HighlightedSearchResult extends SearchResult {
  highlightedText: string
  highlightRanges: Array<{ start: number; end: number }>
}

/**
 * Search indexed messages using CozoDB
 * Wrapper around existing RAG search functions
 *
 * @param agentDb - Agent database instance
 * @param query - Search query text
 * @param options - Search options (mode, limit, filters, etc.)
 * @returns Array of search results with scores and metadata
 */
export async function searchMessages(
  agentDb: AgentDatabase,
  query: string,
  options: SearchMessagesOptions = {}
): Promise<SearchResult[]> {
  const {
    mode = 'hybrid',
    limit = 10,
    minScore = 0.0,
    useRrf = true,
    bm25Weight = 0.4,
    semanticWeight = 0.6,
    roleFilter,
    conversationFile,
    startTs,
    endTs
  } = options

  const searchOpts: Parameters<typeof hybridSearch>[2] = {
    limit,
    minScore,
    useRrf,
    bm25Weight,
    semanticWeight,
    roleFilter,
    conversationFile,
    timeRange: startTs && endTs ? { start: startTs, end: endTs } : undefined
  }

  // Delegate to appropriate search function based on mode
  switch (mode) {
    case 'semantic':
      return await semanticSearch(agentDb, query, limit, conversationFile)
    case 'term':
      return await searchByTerm(agentDb, query, limit, conversationFile)
    case 'symbol':
      return await searchBySymbol(agentDb, query, limit, conversationFile)
    case 'hybrid':
    default:
      return await hybridSearch(agentDb, query, searchOpts)
  }
}

/**
 * Filter sessions by various criteria
 *
 * @param agentDb - Agent database instance
 * @param filter - Filter options (date range, message count, activity level)
 * @returns Array of session identifiers matching the filter
 */
export async function filterSessions(
  agentDb: AgentDatabase,
  filter: SessionFilter = {}
): Promise<string[]> {
  try {
    // Get all conversation files (each represents a session)
    const result = await agentDb.run(`
      ?[conversation_file, min_ts, max_ts, count(msg_id)] :=
        *messages{conversation_file, ts: min_ts, ts: max_ts, msg_id}
      :group conversation_file
      :order -min_ts
    `)

    if (!result.rows || result.rows.length === 0) {
      return []
    }

    let sessions = result.rows.map((row: unknown[]) => ({
      conversationFile: row[0] as string,
      minTs: row[1] as number,
      maxTs: row[2] as number,
      messageCount: row[3] as number
    }))

    // Apply filters
    if (filter.startDate) {
      const startDateMs = filter.startDate.getTime()
      sessions = sessions.filter((s: typeof sessions[0]) => s.maxTs >= startDateMs)
    }

    if (filter.endDate) {
      const endDateMs = filter.endDate.getTime()
      sessions = sessions.filter((s: typeof sessions[0]) => s.minTs <= endDateMs)
    }

    if (filter.minMessageCount !== undefined) {
      sessions = sessions.filter((s: typeof sessions[0]) => s.messageCount >= filter.minMessageCount!)
    }

    if (filter.maxMessageCount !== undefined) {
      sessions = sessions.filter((s: typeof sessions[0]) => s.messageCount <= filter.maxMessageCount!)
    }

    if (filter.activityLevel) {
      const now = Date.now()
      const oneDayMs = 24 * 60 * 60 * 1000
      const sevenDaysMs = 7 * oneDayMs

      sessions = sessions.filter((s: typeof sessions[0]) => {
        const daysSinceLastActivity = (now - s.maxTs) / oneDayMs

        switch (filter.activityLevel) {
          case 'high':
            return daysSinceLastActivity < 1
          case 'medium':
            return daysSinceLastActivity < 7
          case 'low':
            return daysSinceLastActivity >= 7
          default:
            return true
        }
      })
    }

    return sessions.map((s: typeof sessions[0]) => s.conversationFile)
  } catch (error) {
    console.error('[Search Utility] Error filtering sessions:', error)
    return []
  }
}

/**
 * Build search response with term highlighting
 *
 * @param results - Search results from searchMessages
 * @param highlightTerms - Terms to highlight in result text
 * @returns Array of highlighted search results with ranges
 */
export function buildSearchResponse(
  results: SearchResult[],
  highlightTerms: string[] = []
): HighlightedSearchResult[] {
  return results.map((result) => {
    const text = result.text
    const highlightRanges: Array<{ start: number; end: number }> = []

    // Find and record highlight positions for each term
    for (const term of highlightTerms) {
      const lowerText = text.toLowerCase()
      const lowerTerm = term.toLowerCase()
      let position = lowerText.indexOf(lowerTerm)

      while (position !== -1) {
        highlightRanges.push({ start: position, end: position + term.length })
        position = lowerText.indexOf(lowerTerm, position + term.length)
      }
    }

    // Sort ranges by start position
    highlightRanges.sort((a, b) => a.start - b.start)

    // Build highlighted text with <mark> tags
    let highlightedText = ''
    let lastIndex = 0

    for (const range of highlightRanges) {
      // Add text before this range
      highlightedText += text.substring(lastIndex, range.start)
      // Add highlighted term
      highlightedText += `<mark>${text.substring(range.start, range.end)}</mark>`
      lastIndex = range.end
    }

    // Add remaining text after all highlights
    highlightedText += text.substring(lastIndex)

    return {
      ...result,
      highlightedText,
      highlightRanges
    }
  })
}

/**
 * Extract search terms from query
 * Removes common stop words and punctuation
 *
 * @param query - Search query string
 * @returns Array of normalized search terms
 */
export function extractSearchTerms(query: string): string[] {
  // Remove punctuation and split into words
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2) // Filter out short words

  // Common stop words to exclude
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again'
  ])

  return words.filter(word => !stopWords.has(word))
}
