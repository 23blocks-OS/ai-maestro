/**
 * Help Search Library
 *
 * Provides semantic search over pre-computed help content embeddings.
 * Uses cosine similarity between query embedding and pre-computed document embeddings.
 */

import { embedTexts, cosine } from './rag/embeddings'

// Type definitions for the pre-computed embeddings file
interface HelpDocument {
  id: string
  type: 'tutorial-intro' | 'tutorial-step' | 'glossary'
  title: string
  text: string
  category?: string
  tutorialId?: string
  stepIndex?: number
  term?: string
  relatedTerms?: string[]
  embedding: number[]
}

interface HelpEmbeddingsFile {
  modelVersion: string
  generatedAt: string
  documentCount: number
  documents: HelpDocument[]
}

// Search result returned by the API
export interface HelpSearchResult {
  id: string
  type: 'tutorial-intro' | 'tutorial-step' | 'glossary'
  title: string
  text: string
  score: number
  category?: string
  tutorialId?: string
  stepIndex?: number
  term?: string
  relatedTerms?: string[]
}

// Cache for loaded embeddings
let embeddingsData: HelpEmbeddingsFile | null = null
let vectorCache: Map<string, Float32Array> | null = null

/**
 * Load and cache the pre-computed embeddings
 */
async function loadEmbeddings(): Promise<HelpEmbeddingsFile> {
  if (embeddingsData) {
    return embeddingsData
  }

  try {
    // Dynamic import of the JSON file
    const data = await import('@/data/help-embeddings.json')
    // Cast to the expected type (JSON types are more permissive)
    embeddingsData = (data.default || data) as unknown as HelpEmbeddingsFile

    // Pre-convert embeddings to Float32Array for faster cosine computation
    vectorCache = new Map()
    for (const doc of embeddingsData.documents) {
      vectorCache.set(doc.id, Float32Array.from(doc.embedding))
    }

    console.log(`[Help Search] Loaded ${embeddingsData.documentCount} documents (generated: ${embeddingsData.generatedAt})`)
    return embeddingsData
  } catch (error) {
    console.error('[Help Search] Failed to load embeddings:', error)
    throw new Error('Help search index not available. Run `yarn prebuild` to generate it.')
  }
}

/**
 * Get cached Float32Array vector for a document
 */
function getVector(id: string): Float32Array | undefined {
  return vectorCache?.get(id)
}

/**
 * Search help content using semantic similarity
 *
 * @param query - Search query text
 * @param limit - Maximum number of results (default: 5)
 * @param minScore - Minimum similarity score threshold (default: 0.3)
 * @returns Array of search results sorted by relevance
 */
export async function searchHelp(
  query: string,
  limit = 5,
  minScore = 0.3
): Promise<HelpSearchResult[]> {
  // Validate query
  const cleanQuery = query.trim()
  if (cleanQuery.length < 2) {
    return []
  }

  // Load embeddings
  const data = await loadEmbeddings()

  // Generate query embedding
  const [queryEmbedding] = await embedTexts([cleanQuery])

  // Compute similarity scores for all documents
  const results: HelpSearchResult[] = []

  for (const doc of data.documents) {
    const docVector = getVector(doc.id)
    if (!docVector) continue

    const score = cosine(queryEmbedding, docVector)

    if (score >= minScore) {
      results.push({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        text: doc.text,
        score,
        category: doc.category,
        tutorialId: doc.tutorialId,
        stepIndex: doc.stepIndex,
        term: doc.term,
        relatedTerms: doc.relatedTerms,
      })
    }
  }

  // Sort by score (highest first) and limit results
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

/**
 * Get the status of the help search index
 */
export async function getHelpSearchStatus(): Promise<{
  available: boolean
  modelVersion?: string
  generatedAt?: string
  documentCount?: number
}> {
  try {
    const data = await loadEmbeddings()
    return {
      available: true,
      modelVersion: data.modelVersion,
      generatedAt: data.generatedAt,
      documentCount: data.documentCount,
    }
  } catch {
    return { available: false }
  }
}
