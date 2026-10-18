/**
 * Message Ingestion Pipeline
 * Processes conversation JSONL files and populates RAG indices
 *
 * Pipeline:
 * 1. Parse JSONL conversation file
 * 2. Extract embeddings (transformers.js)
 * 3. Extract keywords and symbols
 * 4. Store in CozoDB (messages, embeddings, terms, symbols)
 *
 * Note: BM25 global index was removed - each agent stores terms in CozoDB
 * for per-agent, portable full-text search.
 */

import * as fs from 'fs'
import * as path from 'path'
import { AgentDatabase } from '@/lib/cozo-db'
import { upsertMessage } from '@/lib/cozo-schema-rag'
import { embedTexts, vectorToBuffer } from './embeddings'
import { extractTerms, extractCodeSymbols } from './keywords'
import { msgId } from './id'
import { isCopilotLine, copilotLineToIndexMessages } from '@/lib/transcript-copilot.mjs'
import { readJsonlLines, summarizeJsonl, readJsonlHeadSync } from '@/lib/jsonl'

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


/**
 * One transcript line as the messages to index. A Claude line is one message as it stands. A
 * Copilot line (`events.jsonl`, dotted event types) maps to zero, one or two messages through
 * the Copilot reader, so a Copilot agent's conversations reach the same index as a Claude
 * agent's. Throws on text that is not JSON, as JSON.parse does (callers count it as skipped).
 * The caller's progress is counted in LINES, not messages, so the delta indexer's
 * append-only semantics are the same for both formats.
 */
export function parseConversationLine(line: string): ConversationMessage[] {
  const parsed = JSON.parse(line)
  if (isCopilotLine(parsed)) return copilotLineToIndexMessages(parsed) as unknown as ConversationMessage[]
  return [parsed as ConversationMessage]
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
  return ingestStream(agentDb, conversationFile, 0, options)
}

/** Stream history or its delta, retaining at most two parsed messages. */
async function ingestStream(
  agentDb: AgentDatabase,
  conversationFile: string,
  skip: number,
  options: { batchSize?: number; onProgress?: (processed: number, total: number) => void },
): Promise<IngestionStats> {
  const startTime = Date.now()
  if (!Number.isInteger(skip) || skip < 0) throw new Error('Invalid transcript offset')
  if (options.batchSize !== undefined && (!Number.isInteger(options.batchSize) || options.batchSize < 1)) {
    throw new Error('Invalid ingestion batch size')
  }
  const batchSize = Math.min(options.batchSize || 2, 2)
  // Count without retaining either raw lines or parsed messages. Bound the
  // second pass to this snapshot; appends will be picked up on the next run.
  const { messageCount } = await summarizeJsonl(conversationFile, 0, 0)
  const stats: IngestionStats = {
    totalMessages: messageCount, processedMessages: 0, skippedMessages: 0,
    embeddingsGenerated: 0, termsExtracted: 0, symbolsExtracted: 0, durationMs: 0,
  }
  if (messageCount <= skip) return { ...stats, durationMs: Date.now() - startTime }
  const batch: Array<{ message: ConversationMessage; lineNumber: number; text: string }> = []
  const flush = async () => {
    if (!batch.length) return
    const embeddings = await embedTexts(batch.map(item => item.text))
    stats.embeddingsGenerated += embeddings.length
    for (let i = 0; i < batch.length; i++) {
      const { message: msg, text, lineNumber } = batch[i]
      const timestamp = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()
      const messageId = msgId.message(timestamp, `${conversationFile}\n${text}`)
      const terms = extractTerms(text)
      const symbols = extractCodeSymbols(text)
      stats.termsExtracted += terms.length
      stats.symbolsExtracted += symbols.length
      await upsertMessage(agentDb, {
        msg_id: messageId, conversation_file: conversationFile,
        role: msg.type, ts: timestamp, text,
      }, vectorToBuffer(embeddings[i]), terms, symbols)
      stats.processedMessages++
      options.onProgress?.(lineNumber, messageCount)
    }
    batch.length = 0
  }
  let lineNumber = 0
  for await (const line of readJsonlLines(conversationFile)) {
    if (++lineNumber > messageCount) break
    if (lineNumber <= skip) continue
    // One line is one message (Claude) or zero to two (Copilot events). Progress stays counted in lines.
    let messages: ConversationMessage[]
    try { messages = parseConversationLine(line) }
    catch { stats.skippedMessages++; continue }
    for (const message of messages) {
      const text = extractTextFromContent(message?.message?.content || '')
      if (!text.trim()) { stats.skippedMessages++; continue }
      batch.push({ message, lineNumber, text })
    }
    if (batch.length >= batchSize) await flush()
  }
  // If the snapshot cannot be read in full, do not advance its saved offset.
  if (lineNumber < messageCount) throw new Error('Transcript changed during indexing; retry')
  await flush()
  stats.durationMs = Date.now() - startTime
  console.log(`[Ingest] ${conversationFile}: ${stats.processedMessages} messages in ${stats.durationMs}ms`)
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
    const lines = readJsonlHeadSync(file, 10)

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
  return ingestStream(agentDb, conversationFile, lastIndexedMessageCount, options)
}
