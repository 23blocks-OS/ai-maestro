/**
 * Long-Term Memory Module
 *
 * Exports the complete memory consolidation and retrieval system.
 */

// Types
export * from './types'

// Schema
export {
  initializeMemorySchema,
  createMemory,
  storeMemoryEmbedding,
  reinforceMemory,
  linkMemories,
  getMemoryStats,
  promoteMemory,
  getConsolidationRuns
} from '../cozo-schema-memory'

// Schema types (must use export type with isolatedModules)
export type {
  MemoryCategory,
  MemoryTier,
  MemorySystem,
  RelationshipType
} from '../cozo-schema-memory'

// Providers
export { OllamaProvider, createOllamaProvider } from './ollama-provider'
export { ClaudeProvider, createClaudeProvider } from './claude-provider'

// Consolidation
export {
  consolidateMemories,
  promoteMemories,
  pruneShortTermMemory
} from './consolidate'

// Search
export {
  searchMemories,
  getMemoriesByType,
  getFacts,
  getPreferences,
  getPatterns,
  getDecisions,
  getInsights,
  getStats,
  getRecentMemories,
  getMostReinforcedMemories,
  buildMemoryContext,
  getMemoryById
} from './search'
