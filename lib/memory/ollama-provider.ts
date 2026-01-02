/**
 * Ollama LLM Provider for Memory Extraction
 *
 * Uses local Ollama instance for privacy-first, offline memory consolidation.
 * Default model: llama3.2 (good balance of quality and speed)
 */

import {
  LLMProvider,
  MemoryExtractionResult,
  ExtractedMemory,
  MEMORY_EXTRACTION_PROMPT
} from './types'
import { MemoryCategory, RelationshipType } from '../cozo-schema-memory'

interface OllamaGenerateRequest {
  model: string
  prompt: string
  stream: boolean
  format?: 'json'
  options?: {
    temperature?: number
    num_predict?: number
    top_p?: number
  }
}

interface OllamaGenerateResponse {
  model: string
  response: string
  done: boolean
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaProvider implements LLMProvider {
  name = 'ollama'
  model: string
  endpoint: string

  constructor(options?: { model?: string; endpoint?: string }) {
    this.model = options?.model || 'llama3.2'
    this.endpoint = options?.endpoint || 'http://localhost:11434'
  }

  /**
   * Check if Ollama is running and model is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        console.log('[OLLAMA] Server not responding')
        return false
      }

      const data = await response.json() as { models: Array<{ name: string }> }

      // Check if our model is available
      const modelAvailable = data.models?.some(m =>
        m.name === this.model || m.name.startsWith(`${this.model}:`)
      )

      if (!modelAvailable) {
        console.log(`[OLLAMA] Model ${this.model} not found. Available: ${data.models?.map(m => m.name).join(', ')}`)
        return false
      }

      return true
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        console.log('[OLLAMA] Connection timeout')
      } else {
        console.log('[OLLAMA] Not available:', error.message)
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

    // Build prompt
    const prompt = MEMORY_EXTRACTION_PROMPT.replace('{conversation_text}', conversationText)

    const request: OllamaGenerateRequest = {
      model: this.model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.3,  // Lower for more consistent extraction
        num_predict: 2048,  // Enough for multiple memories
        top_p: 0.9
      }
    }

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(120000)  // 2 minute timeout for extraction
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as OllamaGenerateResponse

      // Parse the JSON response
      let parsed: { memories: ExtractedMemory[]; conversation_summary?: string }
      try {
        parsed = JSON.parse(data.response)
      } catch (parseError) {
        // Try to extract JSON from response if it has extra text
        const jsonMatch = data.response.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          console.error('[OLLAMA] Failed to parse response:', data.response.substring(0, 500))
          return {
            memories: [],
            extraction_metadata: {
              model: this.model,
              processing_time_ms: Date.now() - startTime
            }
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
        // Sort by confidence and take top N
        memories = memories
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, options.maxMemories)
      }

      return {
        memories: memories as ExtractedMemory[],
        conversation_summary: parsed.conversation_summary,
        extraction_metadata: {
          model: this.model,
          tokens_used: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          processing_time_ms: Date.now() - startTime
        }
      }
    } catch (error: any) {
      console.error('[OLLAMA] Extraction failed:', error.message)
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

Only include relationships with confidence > 0.6. Output valid JSON:
{
  "relationships": [
    { "index": 0, "relationship": "supports", "confidence": 0.8 }
  ]
}

If no meaningful relationships exist, return: { "relationships": [] }`

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.2,
            num_predict: 512
          }
        }),
        signal: AbortSignal.timeout(30000)
      })

      if (!response.ok) {
        return []
      }

      const data = await response.json() as OllamaGenerateResponse

      let parsed: { relationships: Array<{ index: number; relationship: string; confidence: number }> }
      try {
        parsed = JSON.parse(data.response)
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
      console.error('[OLLAMA] Relationship finding failed:', error)
      return []
    }
  }
}

/**
 * Create default Ollama provider
 */
export function createOllamaProvider(options?: {
  model?: string
  endpoint?: string
}): OllamaProvider {
  return new OllamaProvider(options)
}
