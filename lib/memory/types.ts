/**
 * Long-Term Memory Types
 *
 * Core interfaces for the memory consolidation system.
 */

import { MemoryCategory, MemoryTier, MemorySystem, RelationshipType } from '../cozo-schema-memory'

/**
 * Extracted memory from LLM analysis
 */
export interface ExtractedMemory {
  category: MemoryCategory
  content: string
  context?: string
  confidence: number  // 0.0-1.0
  related_to?: string[]  // References to other memories in same extraction
}

/**
 * Result of memory extraction from a conversation
 */
export interface MemoryExtractionResult {
  memories: ExtractedMemory[]
  conversation_summary?: string
  extraction_metadata?: {
    model: string
    tokens_used?: number
    processing_time_ms?: number
  }
}

/**
 * LLM Provider interface for memory extraction
 */
export interface LLMProvider {
  name: string
  model: string

  /**
   * Check if the provider is available (API running, key present, etc.)
   */
  isAvailable(): Promise<boolean>

  /**
   * Extract memories from conversation text
   */
  extractMemories(conversationText: string, options?: {
    maxMemories?: number
    minConfidence?: number
    categories?: MemoryCategory[]
  }): Promise<MemoryExtractionResult>

  /**
   * Find relationships between a new memory and existing memories
   */
  findRelationships?(
    newMemory: ExtractedMemory,
    existingMemories: Array<{ memory_id: string; content: string; category: string }>
  ): Promise<Array<{
    memory_id: string
    relationship: RelationshipType
    confidence: number
  }>>
}

/**
 * Consolidation options
 */
export interface ConsolidationOptions {
  provider?: 'ollama' | 'claude' | 'auto'
  dryRun?: boolean
  maxConversations?: number
  minConfidence?: number
  categories?: MemoryCategory[]
  ollamaModel?: string
  claudeModel?: string
}

/**
 * Result of a consolidation run
 */
export interface ConsolidationResult {
  run_id: string
  status: 'completed' | 'failed'
  conversations_processed: number
  memories_created: number
  memories_reinforced: number
  memories_linked: number
  duration_ms: number
  errors: string[]
  provider_used: string
}

/**
 * Memory search options
 */
export interface MemorySearchOptions {
  limit?: number
  categories?: MemoryCategory[]
  minConfidence?: number
  tier?: MemoryTier
  includeRelated?: boolean
  relatedDepth?: number
}

/**
 * Memory search result
 */
export interface MemorySearchResult {
  memory_id: string
  category: MemoryCategory
  content: string
  context: string | null
  confidence: number
  reinforcement_count: number
  similarity: number
  related?: Array<{
    memory_id: string
    relationship: RelationshipType
    content: string
    distance: number
  }>
}

/**
 * Memory settings per agent
 */
export interface MemorySettings {
  consolidation: {
    enabled: boolean
    schedule: 'nightly' | 'weekly' | 'manual'
    nightlyTime: string  // "02:00" format (24h)
    llmProvider: 'ollama' | 'claude' | 'auto'
    ollamaModel: string
    ollamaEndpoint: string
    claudeModel: string
    minConfidence: number
    maxMemoriesPerConversation: number
  }
  retention: {
    shortTermDays: number  // 0 = keep forever
    pruneAfterConsolidation: boolean
    warmToLongPromotionDays: number  // Days before warm -> long
    warmToLongMinReinforcements: number  // Min reinforcements before promotion
  }
  search: {
    defaultLimit: number
    includeRelatedByDefault: boolean
    relatedDepth: number
  }
}

/**
 * Default memory settings
 */
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  consolidation: {
    enabled: true,
    schedule: 'nightly',
    nightlyTime: '02:00',
    llmProvider: 'auto',
    ollamaModel: 'llama3.2',
    ollamaEndpoint: 'http://localhost:11434',
    claudeModel: 'claude-3-haiku-20240307',
    minConfidence: 0.7,
    maxMemoriesPerConversation: 10
  },
  retention: {
    shortTermDays: 30,
    pruneAfterConsolidation: false,
    warmToLongPromotionDays: 7,
    warmToLongMinReinforcements: 3
  },
  search: {
    defaultLimit: 10,
    includeRelatedByDefault: true,
    relatedDepth: 2
  }
}

/**
 * Conversation message for extraction
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  tool_use?: boolean
}

/**
 * Prepared conversation for memory extraction
 */
export interface PreparedConversation {
  file_path: string
  messages: ConversationMessage[]
  message_count: number
  first_message_at?: number
  last_message_at?: number
  project_path?: string
}

/**
 * Memory with full metadata
 */
export interface Memory {
  memory_id: string
  agent_id: string
  tier: MemoryTier
  system: MemorySystem
  category: MemoryCategory
  content: string
  context: string | null
  source_conversations: string[] | null
  source_message_ids: string[] | null
  related_memories: string[] | null
  confidence: number
  created_at: number
  last_reinforced_at: number
  reinforcement_count: number
  access_count: number
  last_accessed_at: number | null
  promoted_at: number | null
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  total_memories: number
  by_category: Record<MemoryCategory, number>
  by_tier: Record<MemoryTier, number>
  by_system: Record<MemorySystem, number>
  avg_confidence: number
  total_reinforcements: number
  total_accesses: number
  last_consolidation?: {
    run_id: string
    timestamp: number
    memories_created: number
  }
}

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  is_duplicate: boolean
  existing_memory_id?: string
  similarity?: number
  action: 'create' | 'reinforce' | 'skip'
}

/**
 * The extraction prompt template
 */
export const MEMORY_EXTRACTION_PROMPT = `You are a memory consolidation system for an AI coding agent. Analyze the following conversation and extract important memories that should be retained long-term.

For each memory, classify it using:

SYSTEM 1 (Knowledge - what was learned):
- fact: Specific pieces of information (URLs, paths, database locations, API keys, server names)
- decision: Choices made with rationale (why React over Vue, why this architecture)
- preference: User or project preferences (coding style, formatting, tools)

SYSTEM 2 (Reasoning - how problems were solved):
- pattern: Recurring workflows or processes (deployment steps, testing patterns)
- insight: Learned understanding about the codebase or project (architecture patterns, code organization)
- reasoning: How a problem was solved (debugging approach, investigation process)

RULES:
1. Only extract truly important information worth remembering permanently
2. Skip routine coding actions (file edits, running commands) unless they reveal patterns
3. Skip temporary details (current branch name, today's date)
4. Be selective - quality over quantity
5. Confidence should reflect how certain you are this is important (0.7+ to include)
6. Group related facts together when possible

Output valid JSON only:
{
  "memories": [
    {
      "category": "fact",
      "content": "The production database is PostgreSQL at db.example.com:5432",
      "context": "Discussed during deployment setup",
      "confidence": 0.95
    },
    {
      "category": "pattern",
      "content": "Always run database migrations before deploying to staging",
      "context": "Learned after a failed deployment",
      "confidence": 0.85
    }
  ],
  "conversation_summary": "Brief 1-2 sentence summary of what was discussed"
}

CONVERSATION:
{conversation_text}`

/**
 * Get system number for a category
 */
export function getCategorySystem(category: MemoryCategory): MemorySystem {
  switch (category) {
    case 'fact':
    case 'decision':
    case 'preference':
      return 1  // Knowledge
    case 'pattern':
    case 'insight':
    case 'reasoning':
      return 2  // Reasoning
    default:
      return 1
  }
}
