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

    // Extract text content from messages
    const texts = batch
      .map((msg) => msg.message?.content || '')
      .filter((text) => text.length > 0)

    if (texts.length === 0) {
      stats.skippedMessages += batch.length
      continue
    }

    // Generate embeddings for batch (parallel processing)
    const embeddings = await embedTexts(texts)
    stats.embeddingsGenerated += embeddings.length

    // Process each message in batch
    for (let i = 0; i < batch.length; i++) {
      const msg = batch[i]
      const text = msg.message?.content || ''

      if (text.length === 0) {
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
      const embedding = embeddings[i]
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
