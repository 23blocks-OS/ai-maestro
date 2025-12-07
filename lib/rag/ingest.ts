/**
 * Message Ingestion Pipeline
 * Processes conversation JSONL files and populates RAG indices
 *
 * Pipeline:
 * 1. Parse JSONL conversation file
 * 2. Extract embeddings (transformers.js)
 * 3. Extract keywords and symbols
 * 4. Store in CozoDB (messages, embeddings, terms, symbols)
 * 5. Update BM25 in-memory index
 */

import * as fs from 'fs'
import * as path from 'path'
import { AgentDatabase } from '@/lib/cozo-db'
import { upsertMessage } from '@/lib/cozo-schema-rag'
import { embedTexts, vectorToBuffer } from './embeddings'
import { extractTerms, extractCodeSymbols } from './keywords'
import { bm25Add, bm25Count, Bm25Document } from './bm25'
import { msgId } from './id'

/**
 * Extract text from Claude's message content format
 * Content can be:
 * - A plain string
 * - An array of content blocks:
 *   - {type:"text", text:"..."} - regular text
 *   - {type:"thinking", thinking:"..."} - extended thinking/reasoning
 *   - {type:"tool_use", input:{description:"...", prompt:"..."}} - tool calls
 * Returns the extracted text for indexing
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    // Extract text from all content block types
    const texts: string[] = []

    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue

      // Text blocks
      if ('text' in block && typeof (block as any).text === 'string') {
        texts.push((block as any).text)
      }
      // Thinking blocks - valuable reasoning context
      else if ('thinking' in block && typeof (block as any).thinking === 'string') {
        texts.push((block as any).thinking)
      }
      // Tool use blocks - extract description and prompt for context
      else if ('input' in block && typeof (block as any).input === 'object') {
        const input = (block as any).input
        if (input.description) texts.push(input.description)
        if (input.prompt) texts.push(input.prompt)
      }
    }

    return texts.join('\n')
  }
  if (typeof content === 'object' && content !== null && 'text' in content) {
    return (content as { text: string }).text
  }
  // Fallback: stringify but this shouldn't happen often
  return typeof content === 'undefined' ? '' : String(content)
}

export interface ConversationMessage {
  type: 'user' | 'assistant' | 'system'
  timestamp?: string
  message?: {
    content?: string
    model?: string
  }
  sessionId?: string
  cwd?: string
}

export interface IngestionStats {
  totalMessages: number
  processedMessages: number
  skippedMessages: number
  embeddingsGenerated: number
  termsExtracted: number
  symbolsExtracted: number
  durationMs: number
}

/**
 * Ingest a single conversation file
 */
export async function ingestConversation(
  agentDb: AgentDatabase,
  conversationFile: string,
  options: {
    batchSize?: number
    onProgress?: (processed: number, total: number) => void
  } = {}
): Promise<IngestionStats> {
  const startTime = Date.now()
  const stats: IngestionStats = {
    totalMessages: 0,
    processedMessages: 0,
    skippedMessages: 0,
    embeddingsGenerated: 0,
    termsExtracted: 0,
    symbolsExtracted: 0,
    durationMs: 0,
  }

  console.log(`[Ingest] Processing conversation: ${conversationFile}`)

  // Read and parse JSONL file
  const fileContent = fs.readFileSync(conversationFile, 'utf-8')
  const lines = fileContent.split('\n').filter((line) => line.trim())
  stats.totalMessages = lines.length

  console.log(`[Ingest] Found ${stats.totalMessages} messages`)

  // Parse messages
  const messages: ConversationMessage[] = []
  for (const line of lines) {
    try {
      messages.push(JSON.parse(line))
    } catch (err) {
      console.warn(`[Ingest] Failed to parse line: ${line.substring(0, 50)}...`)
      stats.skippedMessages++
    }
  }

  // Process messages in batches
  const batchSize = options.batchSize || 10
  const batches: ConversationMessage[][] = []
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize))
  }

  console.log(`[Ingest] Processing ${batches.length} batches (batch size: ${batchSize})`)

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]

    // Extract text content from messages with their indices (ensure strings)
    const textsWithIndices: Array<{ text: string; index: number }> = []
    batch.forEach((msg, idx) => {
      const content = msg.message?.content || ''
      const text = extractTextFromContent(content)
      if (text.trim().length > 0) {
        textsWithIndices.push({ text, index: idx })
      }
    })

    if (textsWithIndices.length === 0) {
      stats.skippedMessages += batch.length
      continue
    }

    // Generate embeddings for batch (parallel processing)
    const embeddings = await embedTexts(textsWithIndices.map(t => t.text))
    stats.embeddingsGenerated += embeddings.length

    // Create a map of batch index -> embedding
    const embeddingMap = new Map<number, Float32Array>()
    textsWithIndices.forEach((item, embIdx) => {
      embeddingMap.set(item.index, embeddings[embIdx])
    })

    // Process each message in batch
    for (let i = 0; i < batch.length; i++) {
      const msg = batch[i]
      const content = msg.message?.content || ''

      // Extract text from content (handles strings, arrays of content blocks, etc.)
      const text = extractTextFromContent(content)

      if (text.trim().length === 0) {
        stats.skippedMessages++
        continue
      }

      // Get embedding for this message
      const embedding = embeddingMap.get(i)
      if (!embedding) {
        console.error(`[Ingest] No embedding found for message ${i}`)
        stats.skippedMessages++
        continue
      }

      // Generate stable message ID
      const timestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
      const messageId = msgId.message(timestamp, Math.random().toString(36).substring(2, 10))

      // Extract terms and symbols
      const terms = extractTerms(text)
      const symbols = extractCodeSymbols(text)
      stats.termsExtracted += terms.length
      stats.symbolsExtracted += symbols.length

      // Convert embedding to buffer
      const embeddingBuffer = vectorToBuffer(embedding)

      // Store in CozoDB
      await upsertMessage(
        agentDb,
        {
          msg_id: messageId,
          conversation_file: conversationFile,
          role: msg.type,
          ts: timestamp,
          text: text,
        },
        embeddingBuffer,
        terms,
        symbols
      )

      // Add to BM25 index
      const bm25Doc: Bm25Document = {
        id: messageId,
        thread_id: msg.sessionId || 'unknown',
        role: msg.type,
        ts: timestamp,
        text: text,
        symbols: symbols,
      }
      bm25Add([bm25Doc])

      stats.processedMessages++

      // Report progress
      if (options.onProgress) {
        const totalProcessed = batchIdx * batchSize + i + 1
        options.onProgress(totalProcessed, stats.totalMessages)
      }
    }

    console.log(`[Ingest] Batch ${batchIdx + 1}/${batches.length} complete`)
  }

  stats.durationMs = Date.now() - startTime

  console.log(`[Ingest] ✅ Completed in ${stats.durationMs}ms`)
  console.log(`[Ingest] Stats:`, stats)
  console.log(`[Ingest] BM25 index size: ${bm25Count()} documents`)

  return stats
}

/**
 * Ingest all conversations for an agent
 */
export async function ingestAllConversations(
  agentDb: AgentDatabase,
  conversationFiles: string[],
  options: {
    batchSize?: number
    onProgress?: (fileIdx: number, totalFiles: number, stats: IngestionStats) => void
  } = {}
): Promise<IngestionStats> {
  const totalStats: IngestionStats = {
    totalMessages: 0,
    processedMessages: 0,
    skippedMessages: 0,
    embeddingsGenerated: 0,
    termsExtracted: 0,
    symbolsExtracted: 0,
    durationMs: 0,
  }

  console.log(`[Ingest] Starting bulk ingestion of ${conversationFiles.length} conversations`)

  const startTime = Date.now()

  for (let i = 0; i < conversationFiles.length; i++) {
    const file = conversationFiles[i]
    console.log(`\n[Ingest] File ${i + 1}/${conversationFiles.length}: ${path.basename(file)}`)

    const fileStats = await ingestConversation(agentDb, file, {
      batchSize: options.batchSize,
    })

    // Accumulate stats
    totalStats.totalMessages += fileStats.totalMessages
    totalStats.processedMessages += fileStats.processedMessages
    totalStats.skippedMessages += fileStats.skippedMessages
    totalStats.embeddingsGenerated += fileStats.embeddingsGenerated
    totalStats.termsExtracted += fileStats.termsExtracted
    totalStats.symbolsExtracted += fileStats.symbolsExtracted

    // Report progress
    if (options.onProgress) {
      options.onProgress(i + 1, conversationFiles.length, totalStats)
    }
  }

  totalStats.durationMs = Date.now() - startTime

  console.log(`\n[Ingest] ✅ Bulk ingestion complete in ${totalStats.durationMs}ms`)
  console.log(`[Ingest] Final stats:`, totalStats)

  return totalStats
}

/**
 * Find all conversation files for an agent
 */
export function findConversationFiles(agentId: string, workingDirectories: string[]): string[] {
  const conversationFiles: string[] = []

  // Search in .claude/projects directories
  const claudeProjectsDir = path.join(require('os').homedir(), '.claude', 'projects')

  if (!fs.existsSync(claudeProjectsDir)) {
    console.warn(`[Ingest] Claude projects directory not found: ${claudeProjectsDir}`)
    return conversationFiles
  }

  // Recursively find all .jsonl files
  const findJsonlFiles = (dir: string): string[] => {
    const files: string[] = []
    try {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const itemPath = path.join(dir, item)
        try {
          const stats = fs.statSync(itemPath)
          if (stats.isDirectory()) {
            files.push(...findJsonlFiles(itemPath))
          } else if (item.endsWith('.jsonl')) {
            files.push(itemPath)
          }
        } catch (err) {
          // Skip files we can't read
        }
      }
    } catch (err) {
      console.error(`[Ingest] Error reading directory ${dir}:`, err)
    }
    return files
  }

  const allJsonlFiles = findJsonlFiles(claudeProjectsDir)
  console.log(`[Ingest] Found ${allJsonlFiles.length} total conversation files`)

  // Filter by working directories
  for (const file of allJsonlFiles) {
    const fileContent = fs.readFileSync(file, 'utf-8')
    const lines = fileContent.split('\n').filter((line) => line.trim())

    // Check first 10 lines for matching working directory
    for (const line of lines.slice(0, 10)) {
      try {
        const msg = JSON.parse(line)
        if (msg.cwd && workingDirectories.some((dir) => msg.cwd === dir)) {
          conversationFiles.push(file)
          break
        }
      } catch (err) {
        // Skip malformed lines
      }
    }
  }

  console.log(`[Ingest] Found ${conversationFiles.length} conversations for agent ${agentId}`)

  return conversationFiles
}

/**
 * Index only new messages (delta) from a conversation file
 * Compares current message count with last indexed count
 */
export async function indexConversationDelta(
  agentDb: AgentDatabase,
  conversationFile: string,
  lastIndexedMessageCount: number,
  options: {
    batchSize?: number
  } = {}
): Promise<IngestionStats> {
  const batchSize = options.batchSize || 10
  const startTime = Date.now()

  console.log(`[Delta Index] Processing ${conversationFile}`)
  console.log(`[Delta Index] Last indexed: ${lastIndexedMessageCount} messages`)

  // Parse JSONL file
  const fileContent = fs.readFileSync(conversationFile, 'utf-8')
  const allLines = fileContent.split('\n').filter(line => line.trim())

  const currentMessageCount = allLines.length
  const delta = currentMessageCount - lastIndexedMessageCount

  console.log(`[Delta Index] Current messages: ${currentMessageCount}`)
  console.log(`[Delta Index] Delta to index: ${delta}`)

  if (delta <= 0) {
    console.log(`[Delta Index] No new messages to index`)
    return {
      totalMessages: currentMessageCount,
      processedMessages: 0,
      skippedMessages: 0,
      embeddingsGenerated: 0,
      termsExtracted: 0,
      symbolsExtracted: 0,
      durationMs: Date.now() - startTime,
    }
  }

  // Parse only the new messages (starting from lastIndexedMessageCount)
  const messages: ConversationMessage[] = []
  for (let i = lastIndexedMessageCount; i < allLines.length; i++) {
    try {
      const message = JSON.parse(allLines[i]) as ConversationMessage
      messages.push(message)
    } catch (err) {
      console.error(`[Delta Index] Failed to parse line ${i}:`, err)
    }
  }

  console.log(`[Delta Index] Parsed ${messages.length} new messages`)

  const stats: IngestionStats = {
    totalMessages: currentMessageCount,
    processedMessages: 0,
    skippedMessages: 0,
    embeddingsGenerated: 0,
    termsExtracted: 0,
    symbolsExtracted: 0,
    durationMs: 0,
  }

  // Batch process new messages
  const batches: ConversationMessage[][] = []
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize))
  }

  console.log(`[Delta Index] Processing ${batches.length} batches of ${batchSize} messages`)

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    console.log(`[Delta Index] Batch ${batchIdx + 1}/${batches.length}`)

    // Extract texts for embedding with their indices
    const textsWithIndices: Array<{ text: string; index: number }> = []
    batch.forEach((msg, idx) => {
      const content = msg.message?.content || ''
      const text = extractTextFromContent(content)
      if (text.trim().length > 0) {
        textsWithIndices.push({ text, index: idx })
      }
    })

    // Skip batch if no valid texts (all messages had empty content)
    if (textsWithIndices.length === 0) {
      console.log(`[Delta Index] Batch ${batchIdx + 1}/${batches.length} - no valid texts, skipping`)
      stats.skippedMessages += batch.length
      continue
    }

    // Generate embeddings in batch
    const embeddings = await embedTexts(textsWithIndices.map(t => t.text))
    stats.embeddingsGenerated += embeddings.length

    // Create a map of batch index -> embedding
    const embeddingMap = new Map<number, Float32Array>()
    textsWithIndices.forEach((item, embIdx) => {
      embeddingMap.set(item.index, embeddings[embIdx])
    })

    // Process each message
    for (let i = 0; i < batch.length; i++) {
      const msg = batch[i]
      const content = msg.message?.content || ''

      // Extract text from content (handles strings, arrays of content blocks, etc.)
      const text = extractTextFromContent(content)

      if (!text || text.trim().length === 0) {
        stats.skippedMessages++
        continue
      }

      // Get embedding for this message
      const embedding = embeddingMap.get(i)
      if (!embedding) {
        console.error(`[Delta Index] No embedding found for message ${i}`)
        stats.skippedMessages++
        continue
      }

      // Generate message ID
      const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
      const random = Math.random().toString(36).substring(7)
      const id = msgId.message(ts, random)

      // Extract terms and symbols
      const terms = extractTerms(text)
      const symbols = extractCodeSymbols(text)
      stats.termsExtracted += terms.length
      stats.symbolsExtracted += symbols.length

      // Convert embedding to buffer
      const embeddingBuffer = vectorToBuffer(embedding)

      // Upsert message to CozoDB
      await upsertMessage(
        agentDb,
        {
          msg_id: id,
          conversation_file: conversationFile,
          role: msg.type,
          ts,
          text,
        },
        embeddingBuffer,
        terms,
        symbols
      )

      // Add to BM25 index
      const bm25Doc: Bm25Document = {
        id,
        text,
        symbols,
        thread_id: conversationFile,
        role: msg.type,
        ts,
      }
      bm25Add([bm25Doc])

      stats.processedMessages++
    }
  }

  stats.durationMs = Date.now() - startTime

  console.log(`[Delta Index] ✅ Indexed ${stats.processedMessages} new messages in ${stats.durationMs}ms`)

  return stats
}
