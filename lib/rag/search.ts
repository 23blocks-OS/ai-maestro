/**
 * Hybrid Search with Reciprocal Rank Fusion (RRF)
 * Combines lexical (CozoDB terms) and semantic (embeddings) search
 *
 * Search Strategy:
 * 1. Term search in CozoDB (per-agent, portable)
 * 2. Embedding similarity search (semantic understanding)
 * 3. Merge results using RRF (Reciprocal Rank Fusion)
 * 4. Filter by keywords/symbols/time range
 *
 * Note: Global BM25 was removed - terms are stored per-agent in CozoDB
 */

import { AgentDatabase } from '@/lib/cozo-db'
import { getMessageVectors, getMessagesByIds, searchMessagesByTerm, searchMessagesBySymbol } from '@/lib/cozo-schema-rag'
import { embedTexts, bufferToVector, cosine } from './embeddings'
import { extractTerms } from './keywords'

export interface SearchResult {
  msg_id: string
  score: number
  conversation_file: string
  role: string
  ts: number
  text: string
  matchType: 'lexical' | 'semantic' | 'hybrid'
}

export interface SearchOptions {
  limit?: number // Max results to return (default: 10)
  minScore?: number // Minimum score threshold (default: 0.0)
  useRrf?: boolean // Use Reciprocal Rank Fusion (default: true)
  rrfK?: number // RRF constant (default: 60)
  lexicalWeight?: number // Weight for lexical/term results (default: 0.4)
  semanticWeight?: number // Weight for semantic results (default: 0.6)
  roleFilter?: 'user' | 'assistant' | 'system' // Filter by message role
  conversationFile?: string // Filter by specific conversation file path
  timeRange?: { start: number; end: number } // Filter by timestamp range
  // Legacy alias for backwards compatibility
  bm25Weight?: number
}

const DEFAULT_OPTIONS: Required<Omit<SearchOptions, 'bm25Weight'>> = {
  limit: 10,
  minScore: 0.0,
  useRrf: true,
  rrfK: 60,
  lexicalWeight: 0.4,
  semanticWeight: 0.6,
  roleFilter: undefined as any,
  conversationFile: undefined as any,
  timeRange: undefined as any,
}

/**
 * Reciprocal Rank Fusion
 * Merges multiple ranked lists into a single ranking
 * Formula: score = sum(1 / (k + rank))
 */
function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score?: number }>>,
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>()

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank]
      const currentScore = scores.get(item.id) || 0
      scores.set(item.id, currentScore + 1 / (k + rank + 1))
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Weighted score fusion
 * Combines scores from multiple sources with weights
 */
function weightedScoreFusion(
  scoreLists: Array<{ id: string; score: number; weight: number }[]>
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>()

  for (const list of scoreLists) {
    for (const item of list) {
      const currentScore = scores.get(item.id) || 0
      scores.set(item.id, currentScore + item.score * item.weight)
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Perform hybrid search
 */
export async function hybridSearch(
  agentDb: AgentDatabase,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  // Handle legacy bm25Weight option
  const lexicalWeight = options.lexicalWeight ?? options.bm25Weight ?? DEFAULT_OPTIONS.lexicalWeight
  const opts = { ...DEFAULT_OPTIONS, ...options, lexicalWeight }

  console.log(`[Search] Query: "${query}"`)
  console.log(`[Search] Options:`, opts)

  const startTime = Date.now()

  // ============================================================================
  // 1. Lexical Term Search (per-agent, stored in CozoDB)
  // ============================================================================
  console.log(`[Search] Running lexical term search...`)

  // Extract terms from query
  const queryTerms = extractTerms(query)
  console.log(`[Search] Extracted ${queryTerms.length} terms from query`)

  // Search for each term and collect results with frequency scoring
  const termResults = new Map<string, number>() // msg_id -> count of matching terms

  for (const term of queryTerms) {
    try {
      const matches = await searchMessagesByTerm(agentDb, term.toLowerCase())
      for (const match of matches) {
        const count = termResults.get(match.msg_id) || 0
        termResults.set(match.msg_id, count + 1)
      }
    } catch (e) {
      // Term not found is not an error
    }
  }

  // Sort by number of matching terms (more matches = higher score)
  const lexicalResults = Array.from(termResults.entries())
    .map(([id, count]) => ({ id, score: count / queryTerms.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)

  const lexicalIds = lexicalResults.map((r) => r.id)
  console.log(`[Search] Lexical search found ${lexicalResults.length} results`)

  // ============================================================================
  // 2. Semantic Embedding Search
  // ============================================================================
  console.log(`[Search] Running semantic search...`)

  // Generate query embedding
  const [queryEmbedding] = await embedTexts([query])

  // Get all message vectors from CozoDB
  const allVectors = await getMessageVectors(agentDb)
  console.log(`[Search] Comparing against ${allVectors.length} message vectors`)

  // Compute cosine similarity for all vectors
  const semanticScores: Array<{ id: string; score: number }> = []

  for (const { msg_id, vec } of allVectors) {
    const messageVec = bufferToVector(vec)
    const similarity = cosine(queryEmbedding, messageVec)
    semanticScores.push({ id: msg_id, score: similarity })
  }

  // Sort by similarity (descending)
  semanticScores.sort((a, b) => b.score - a.score)
  const semanticIds = semanticScores.slice(0, 100).map((r) => r.id) // Top 100
  console.log(`[Search] Semantic search complete (top score: ${semanticScores[0]?.score.toFixed(3) || 'N/A'})`)

  // ============================================================================
  // 3. Merge Results with RRF or Weighted Fusion
  // ============================================================================
  let mergedResults: Array<{ id: string; score: number }>

  if (opts.useRrf) {
    console.log(`[Search] Merging with RRF (k=${opts.rrfK})...`)
    mergedResults = reciprocalRankFusion(
      [
        lexicalResults.map((r) => ({ id: r.id })),
        semanticScores.slice(0, 100).map((r) => ({ id: r.id })),
      ],
      opts.rrfK
    )
  } else {
    console.log(`[Search] Merging with weighted fusion...`)
    mergedResults = weightedScoreFusion([
      lexicalResults.map((r) => ({ id: r.id, score: r.score, weight: opts.lexicalWeight })),
      semanticScores.slice(0, 100).map((r) => ({ id: r.id, score: r.score, weight: opts.semanticWeight })),
    ])
  }

  console.log(`[Search] Merged ${mergedResults.length} unique results`)

  // ============================================================================
  // 4. Filter by Score Threshold
  // ============================================================================
  const filteredResults = mergedResults.filter((r) => r.score >= opts.minScore)
  console.log(`[Search] After score filter (>= ${opts.minScore}): ${filteredResults.length} results`)

  // ============================================================================
  // 5. Fetch Message Content
  // ============================================================================
  const topIds = filteredResults.slice(0, opts.limit * 2).map((r) => r.id) // Fetch 2x limit (before role/time filtering)
  const messages = await getMessagesByIds(agentDb, topIds)

  // Create lookup map for scores
  const scoreMap = new Map(mergedResults.map((r) => [r.id, r.score]))

  // ============================================================================
  // 6. Apply Role and Time Filters
  // ============================================================================
  let finalResults: SearchResult[] = messages.map((msg) => ({
    msg_id: msg.msg_id,
    score: scoreMap.get(msg.msg_id) || 0,
    conversation_file: msg.conversation_file,
    role: msg.role,
    ts: msg.ts,
    text: msg.text,
    matchType: (lexicalIds.includes(msg.msg_id) && semanticIds.includes(msg.msg_id)
      ? 'hybrid'
      : lexicalIds.includes(msg.msg_id)
      ? 'lexical'
      : 'semantic') as 'lexical' | 'semantic' | 'hybrid',
  }))

  // Role filter
  if (opts.roleFilter) {
    finalResults = finalResults.filter((r) => r.role === opts.roleFilter)
    console.log(`[Search] After role filter (${opts.roleFilter}): ${finalResults.length} results`)
  }

  // Conversation file filter
  if (opts.conversationFile) {
    finalResults = finalResults.filter((r) => r.conversation_file === opts.conversationFile)
    console.log(`[Search] After conversation file filter: ${finalResults.length} results`)
  }

  // Time range filter
  if (opts.timeRange) {
    finalResults = finalResults.filter(
      (r) => r.ts >= opts.timeRange!.start && r.ts <= opts.timeRange!.end
    )
    console.log(`[Search] After time range filter: ${finalResults.length} results`)
  }

  // ============================================================================
  // 7. Return Top-K Results
  // ============================================================================
  const topK = finalResults.slice(0, opts.limit)

  const durationMs = Date.now() - startTime
  console.log(`[Search] ✅ Returned ${topK.length} results in ${durationMs}ms`)

  return topK
}

/**
 * Search by exact term (keyword-only search)
 */
export async function searchByTerm(
  agentDb: AgentDatabase,
  term: string,
  limit = 10,
  conversationFile?: string
): Promise<SearchResult[]> {
  console.log(`[Search] Term search: "${term}"${conversationFile ? ` in ${conversationFile}` : ''}`)

  const results = await searchMessagesByTerm(agentDb, term.toLowerCase())
  let msgIds = results.map((r) => r.msg_id)

  // Filter by conversation file if specified
  if (conversationFile) {
    const messages = await getMessagesByIds(agentDb, msgIds)
    msgIds = messages
      .filter((msg) => msg.conversation_file === conversationFile)
      .map((msg) => msg.msg_id)
  }

  msgIds = msgIds.slice(0, limit)
  const messages = await getMessagesByIds(agentDb, msgIds)

  return messages.map((msg, idx) => ({
    msg_id: msg.msg_id,
    score: 1.0 - idx * 0.1, // Simple descending score
    conversation_file: msg.conversation_file,
    role: msg.role,
    ts: msg.ts,
    text: msg.text,
    matchType: 'lexical' as const,
  }))
}

/**
 * Search by code symbol
 */
export async function searchBySymbol(
  agentDb: AgentDatabase,
  symbol: string,
  limit = 10,
  conversationFile?: string
): Promise<SearchResult[]> {
  console.log(`[Search] Symbol search: "${symbol}"${conversationFile ? ` in ${conversationFile}` : ''}`)

  const results = await searchMessagesBySymbol(agentDb, symbol)
  let msgIds = results.map((r) => r.msg_id)

  // Filter by conversation file if specified
  if (conversationFile) {
    const messages = await getMessagesByIds(agentDb, msgIds)
    msgIds = messages
      .filter((msg) => msg.conversation_file === conversationFile)
      .map((msg) => msg.msg_id)
  }

  msgIds = msgIds.slice(0, limit)
  const messages = await getMessagesByIds(agentDb, msgIds)

  return messages.map((msg, idx) => ({
    msg_id: msg.msg_id,
    score: 1.0 - idx * 0.1,
    conversation_file: msg.conversation_file,
    role: msg.role,
    ts: msg.ts,
    text: msg.text,
    matchType: 'lexical' as const,
  }))
}

/**
 * Semantic-only search (no lexical)
 */
export async function semanticSearch(
  agentDb: AgentDatabase,
  query: string,
  limit = 10,
  conversationFile?: string
): Promise<SearchResult[]> {
  console.log(`[Search] Semantic-only search: "${query}"${conversationFile ? ` in ${conversationFile}` : ''}`)

  const startTime = Date.now()

  // Generate query embedding
  const [queryEmbedding] = await embedTexts([query])

  // Get all message vectors
  const allVectors = await getMessageVectors(agentDb)

  // Compute similarities
  const scores: Array<{ id: string; score: number }> = []
  for (const { msg_id, vec } of allVectors) {
    const messageVec = bufferToVector(vec)
    const similarity = cosine(queryEmbedding, messageVec)
    scores.push({ id: msg_id, score: similarity })
  }

  // Sort by score
  scores.sort((a, b) => b.score - a.score)

  // Fetch all messages first if we need to filter
  let topIds: string[]
  if (conversationFile) {
    // Fetch more messages to account for filtering
    const candidateIds = scores.slice(0, limit * 5).map((r) => r.id)
    const candidateMessages = await getMessagesByIds(agentDb, candidateIds)

    // Filter by conversation file and take top-K
    topIds = candidateMessages
      .filter((msg) => msg.conversation_file === conversationFile)
      .map((msg) => msg.msg_id)
      .slice(0, limit)
  } else {
    topIds = scores.slice(0, limit).map((r) => r.id)
  }

  // Fetch final messages
  const messages = await getMessagesByIds(agentDb, topIds)
  const scoreMap = new Map(scores.map((r) => [r.id, r.score]))

  const results = messages.map((msg) => ({
    msg_id: msg.msg_id,
    score: scoreMap.get(msg.msg_id) || 0,
    conversation_file: msg.conversation_file,
    role: msg.role,
    ts: msg.ts,
    text: msg.text,
    matchType: 'semantic' as const,
  }))

  const durationMs = Date.now() - startTime
  console.log(`[Search] ✅ Semantic search complete in ${durationMs}ms`)

  return results
}
