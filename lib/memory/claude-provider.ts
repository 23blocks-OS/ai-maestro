/**
 * Claude LLM Provider for Memory Extraction
 *
 * Uses Anthropic API as fallback when Ollama is not available.
 * Default model: claude-3-haiku (fast and cheap for extraction)
 *
 * Note: This provider requires @anthropic-ai/sdk to be installed.
 * If the SDK is not available, the provider will gracefully report unavailable.
 */

import {
  LLMProvider,
  MemoryExtractionResult,
  ExtractedMemory,
  MEMORY_EXTRACTION_PROMPT
} from './types'
import { MemoryCategory, RelationshipType } from '../cozo-schema-memory'

// Dynamic import of Anthropic SDK - may not be installed
type AnthropicClient = {
  messages: {
    create: (params: {
      model: string
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }) => Promise<{
      content: Array<{ type: string; text?: string }>
      usage: { input_tokens: number; output_tokens: number }
    }>
  }
}

async function createAnthropicClient(): Promise<AnthropicClient | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.log('[CLAUDE] No ANTHROPIC_API_KEY set')
      return null
    }

    // Use require to avoid webpack static analysis
    // This allows the module to be optional
    const moduleName = '@anthropic-ai/sdk'
    // eslint-disable-next-line
    const Anthropic = require(moduleName).default
    return new Anthropic({ apiKey }) as unknown as AnthropicClient
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string }
    if (err.code === 'MODULE_NOT_FOUND' || (err.message && err.message.includes('Cannot find module'))) {
      console.log('[CLAUDE] @anthropic-ai/sdk not installed - Claude provider unavailable')
    } else {
      console.log('[CLAUDE] Failed to create client:', err.message)
    }
    return null
  }
}

export class ClaudeProvider implements LLMProvider {
  name = 'claude'
  model: string
  private client: AnthropicClient | null = null
  private clientChecked = false

  constructor(options?: { model?: string }) {
    this.model = options?.model || 'claude-3-haiku-20240307'
  }

  /**
   * Get or create Anthropic client
   */
  private async getClient(): Promise<AnthropicClient | null> {
    if (this.clientChecked) return this.client

    this.client = await createAnthropicClient()
    this.clientChecked = true
    return this.client
  }

  /**
   * Check if Anthropic API is available
   */
  async isAvailable(): Promise<boolean> {
    const client = await this.getClient()
    if (!client) {
      return false
    }

    try {
      // Try a minimal API call to verify credentials
      // We'll just check if we can create a message with minimal tokens
      await client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
      return true
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string }
      if (err.status === 401) {
        console.log('[CLAUDE] Invalid API key')
      } else if (err.status === 429) {
        // Rate limited but available
        return true
      } else {
        console.log('[CLAUDE] API error:', err.message)
      }
      return false
    }
  }

  /**
   * Extract memories from conversation text
   */
  async extractMemories(
    conversationText: string,
    options?: {
      maxMemories?: number
      minConfidence?: number
      categories?: MemoryCategory[]
    }
  ): Promise<MemoryExtractionResult> {
    const startTime = Date.now()

    const client = await this.getClient()
    if (!client) {
      throw new Error('Anthropic API not available')
    }

    // Build prompt
    const prompt = MEMORY_EXTRACTION_PROMPT.replace('{conversation_text}', conversationText)

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
        // Note: Claude doesn't have a format: json option like Ollama
        // But Haiku is good at following JSON instructions
      })

      // Extract text from response
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('')

      // Parse the JSON response
      let parsed: { memories: ExtractedMemory[]; conversation_summary?: string }
      try {
        // Try to find JSON in the response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          console.error('[CLAUDE] No JSON found in response:', text.substring(0, 500))
          return {
            memories: [],
            extraction_metadata: {
              model: this.model,
              tokens_used: response.usage.input_tokens + response.usage.output_tokens,
              processing_time_ms: Date.now() - startTime
            }
          }
        }
      } catch (parseError) {
        console.error('[CLAUDE] Failed to parse response:', text.substring(0, 500))
        return {
          memories: [],
          extraction_metadata: {
            model: this.model,
            tokens_used: response.usage.input_tokens + response.usage.output_tokens,
            processing_time_ms: Date.now() - startTime
          }
        }
      }

      // Validate and filter memories
      let memories = (parsed.memories || []).filter(m => {
        // Validate structure
        if (!m.category || !m.content || typeof m.confidence !== 'number') {
          return false
        }
        // Validate category
        const validCategories: MemoryCategory[] = ['fact', 'decision', 'preference', 'pattern', 'insight', 'reasoning']
        if (!validCategories.includes(m.category as MemoryCategory)) {
          return false
        }
        // Filter by min confidence
        if (options?.minConfidence && m.confidence < options.minConfidence) {
          return false
        }
        // Filter by categories
        if (options?.categories && !options.categories.includes(m.category as MemoryCategory)) {
          return false
        }
        return true
      })

      // Limit number of memories
      if (options?.maxMemories && memories.length > options.maxMemories) {
        memories = memories
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, options.maxMemories)
      }

      return {
        memories: memories as ExtractedMemory[],
        conversation_summary: parsed.conversation_summary,
        extraction_metadata: {
          model: this.model,
          tokens_used: response.usage.input_tokens + response.usage.output_tokens,
          processing_time_ms: Date.now() - startTime
        }
      }
    } catch (error: any) {
      console.error('[CLAUDE] Extraction failed:', error.message)
      throw error
    }
  }

  /**
   * Find relationships between a new memory and existing memories
   */
  async findRelationships(
    newMemory: ExtractedMemory,
    existingMemories: Array<{ memory_id: string; content: string; category: string }>
  ): Promise<Array<{
    memory_id: string
    relationship: RelationshipType
    confidence: number
  }>> {
    if (existingMemories.length === 0) {
      return []
    }

    const client = await this.getClient()
    if (!client) {
      return []
    }

    const prompt = `Analyze the relationship between a new memory and existing memories.

NEW MEMORY:
Category: ${newMemory.category}
Content: ${newMemory.content}

EXISTING MEMORIES:
${existingMemories.map((m, i) => `[${i}] (${m.memory_id}) ${m.category}: ${m.content}`).join('\n')}

For each existing memory that has a meaningful relationship with the new memory, identify the relationship type:
- leads_to: The new memory is a consequence or follow-up of the existing one
- contradicts: The new memory contradicts or conflicts with the existing one
- supports: The new memory provides additional evidence for the existing one
- supersedes: The new memory replaces or updates the existing one

Only include relationships with confidence > 0.6. Output valid JSON only:
{
  "relationships": [
    { "index": 0, "relationship": "supports", "confidence": 0.8 }
  ]
}

If no meaningful relationships exist, return: { "relationships": [] }`

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('')

      let parsed: { relationships: Array<{ index: number; relationship: string; confidence: number }> }
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          return []
        }
      } catch {
        return []
      }

      const validRelationships: RelationshipType[] = ['leads_to', 'contradicts', 'supports', 'supersedes']

      return (parsed.relationships || [])
        .filter(r =>
          r.index >= 0 &&
          r.index < existingMemories.length &&
          validRelationships.includes(r.relationship as RelationshipType) &&
          r.confidence > 0.6
        )
        .map(r => ({
          memory_id: existingMemories[r.index].memory_id,
          relationship: r.relationship as RelationshipType,
          confidence: r.confidence
        }))
    } catch (error) {
      console.error('[CLAUDE] Relationship finding failed:', error)
      return []
    }
  }
}

/**
 * Create default Claude provider
 */
export function createClaudeProvider(options?: {
  model?: string
}): ClaudeProvider {
  return new ClaudeProvider(options)
}
