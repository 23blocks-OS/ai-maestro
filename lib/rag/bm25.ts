/**
 * BM25 Lexical Search Module
 * Uses MiniSearch for fast, in-memory full-text search
 * Handles exact term matching (function names, identifiers, error codes)
 */

import MiniSearch, { Options, SearchResult } from 'minisearch';

export interface Bm25Document {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  ts: number;
  text: string;
  symbols: string[]; // Code symbols extracted from message
}

const options: Options = {
  fields: ['text', 'symbols'], // Searchable fields
  storeFields: ['id', 'thread_id', 'role', 'ts'], // Fields to return in results
  searchOptions: {
    boost: { symbols: 2.0 }, // Code symbols are 2x more important
    prefix: true, // Enable prefix matching (e.g., "auth" matches "authenticate")
    fuzzy: 0.1, // Allow small typos
  },
};

let miniSearch = new MiniSearch<Bm25Document>(options);

/**
 * Add documents to the BM25 index
 */
export function bm25Add(docs: Bm25Document[]): void {
  miniSearch.addAll(docs);
}

/**
 * Add a single document to the index
 */
export function bm25AddOne(doc: Bm25Document): void {
  miniSearch.add(doc);
}

/**
 * Remove a document from the index by ID
 */
export function bm25Remove(id: string): void {
  miniSearch.discard(id);
}

/**
 * Search the BM25 index
 * @param query - Search query string
 * @param limit - Maximum number of results (default: 200)
 * @param filter - Optional filter function
 */
export function bm25Search(
  query: string,
  limit = 200,
  filter?: (doc: Bm25Document) => boolean
): SearchResult[] {
  const results = miniSearch.search(query, {
    prefix: true,
    fuzzy: 0.1,
    filter: filter as any, // Cast to any to satisfy MiniSearch types
  });

  return results.slice(0, limit);
}

/**
 * Search with thread filtering
 */
export function bm25SearchInThread(
  query: string,
  threadId: string,
  limit = 200
): SearchResult[] {
  return bm25Search(query, limit, (doc) => doc.thread_id === threadId);
}

/**
 * Search by role (user, assistant, system)
 */
export function bm25SearchByRole(
  query: string,
  role: 'user' | 'assistant' | 'system',
  limit = 200
): SearchResult[] {
  return bm25Search(query, limit, (doc) => doc.role === role);
}

/**
 * Search within a time range
 */
export function bm25SearchTimeRange(
  query: string,
  startTs: number,
  endTs: number,
  limit = 200
): SearchResult[] {
  return bm25Search(query, limit, (doc) => doc.ts >= startTs && doc.ts <= endTs);
}

/**
 * Get suggestions for autocomplete
 */
export function bm25Suggest(query: string, limit = 10): string[] {
  const results = miniSearch.autoSuggest(query, {
    prefix: true,
    fuzzy: 0.2,
  });

  return results.slice(0, limit).map((r) => r.suggestion);
}

/**
 * Get document count in index
 */
export function bm25Count(): number {
  return miniSearch.documentCount;
}

/**
 * Clear the entire index
 */
export function bm25Reset(): void {
  miniSearch = new MiniSearch<Bm25Document>(options);
}

/**
 * Serialize index to JSON for persistence
 */
export function bm25Serialize(): string {
  return JSON.stringify(miniSearch);
}

/**
 * Deserialize index from JSON
 */
export function bm25Deserialize(json: string): void {
  miniSearch = MiniSearch.loadJSON(json, options);
}

/**
 * Get search statistics for a query
 */
export function bm25Stats(query: string): {
  totalResults: number;
  topScore: number;
  avgScore: number;
} {
  const results = miniSearch.search(query);

  if (results.length === 0) {
    return { totalResults: 0, topScore: 0, avgScore: 0 };
  }

  const scores = results.map((r) => r.score);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);

  return {
    totalResults: results.length,
    topScore: scores[0],
    avgScore: totalScore / results.length,
  };
}
