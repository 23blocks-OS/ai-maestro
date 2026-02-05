/**
 * Transcript Export Utilities for Phase 5 Features
 *
 * Provides export functionality for conversation transcripts:
 * - Export to JSON format (structured, machine-readable)
 * - Export to Markdown format (human-readable with formatting)
 * - Export to Plain Text format (simple, compatible)
 * - Main export orchestrator with format selection
 */

import { AgentDatabase } from './cozo-db'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Export format types
 */
export type ExportFormat = 'json' | 'markdown' | 'plaintext' | 'csv'

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat
  outputPath?: string
  startDate?: Date
  endDate?: Date
  includeMetadata?: boolean
  includeTimestamps?: boolean
  conversationFile?: string
  maxMessages?: number
}

/**
 * Transcript message
 */
export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  metadata?: Record<string, any>
}

/**
 * Transcript export result
 */
export interface ExportResult {
  success: boolean
  format: ExportFormat
  filePath: string
  messageCount: number
  duration?: number
  error?: string
}

/**
 * Main export orchestrator
 * Exports conversation transcript in specified format
 *
 * @param agentDb - Agent database instance
 * @param agentId - Agent ID for metadata
 * @param sessionId - Session ID for transcript
 * @param format - Export format (json, markdown, plaintext, csv)
 * @param options - Export options
 * @returns Export result with file path and stats
 */
export async function exportTranscript(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId: string,
  format: ExportFormat,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const {
    outputPath,
    startDate,
    endDate,
    includeMetadata = true,
    includeTimestamps = true,
    conversationFile,
    maxMessages
  } = options

  try {
    console.log(`[Transcript Export] Starting export for session ${sessionId} in ${format} format`)

    // Fetch messages from database
    let messages = await fetchMessages(
      agentDb,
      {
        conversationFile,
        startDate,
        endDate,
        maxMessages
      }
    )

    if (messages.length === 0) {
      return {
        success: false,
        format,
        filePath: '',
        messageCount: 0,
        error: 'No messages found matching criteria'
      }
    }

    // Calculate duration if timestamps are available
    const firstTs = messages[0].timestamp
    const lastTs = messages[messages.length - 1].timestamp
    const duration = (firstTs && lastTs) ? lastTs - firstTs : undefined

    // Generate output path if not provided
    const exportPath = outputPath || generateDefaultExportPath(agentId, sessionId, format)

    // Format based on requested format
    let content: string

    switch (format) {
      case 'json':
        content = formatAsJSON(messages, { includeMetadata, includeTimestamps })
        break
      case 'markdown':
        content = formatAsMarkdown(messages, { includeMetadata, includeTimestamps })
        break
      case 'csv':
        content = formatAsCSV(messages, { includeTimestamps })
        break
      case 'plaintext':
      default:
        content = formatAsPlainText(messages, { includeTimestamps })
        break
    }

    // Ensure directory exists
    const dir = path.dirname(exportPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Write to file
    fs.writeFileSync(exportPath, content, 'utf-8')

    console.log(`[Transcript Export] ✅ Exported ${messages.length} messages to ${exportPath}`)

    return {
      success: true,
      format,
      filePath: exportPath,
      messageCount: messages.length,
      duration
    }
  } catch (error) {
    console.error('[Transcript Export] Error:', error)
    return {
      success: false,
      format,
      filePath: '',
      messageCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Format transcript as JSON
 *
 * @param messages - Array of transcript messages
 * @param options - Format options
 * @returns JSON formatted transcript
 */
export function formatAsJSON(
  messages: TranscriptMessage[],
  options: { includeMetadata?: boolean; includeTimestamps?: boolean } = {}
): string {
  const { includeMetadata = true, includeTimestamps = true } = options

  const transcript = {
    format: 'json',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(msg => {
      const formatted: Record<string, any> = {
        role: msg.role,
        content: msg.content
      }

      if (includeTimestamps && msg.timestamp) {
        formatted.timestamp = new Date(msg.timestamp).toISOString()
      }

      if (includeMetadata && msg.metadata) {
        formatted.metadata = msg.metadata
      }

      return formatted
    })
  }

  return JSON.stringify(transcript, null, 2)
}

/**
 * Format transcript as Markdown
 *
 * @param messages - Array of transcript messages
 * @param options - Format options
 * @returns Markdown formatted transcript
 */
export function formatAsMarkdown(
  messages: TranscriptMessage[],
  options: { includeMetadata?: boolean; includeTimestamps?: boolean } = {}
): string {
  const { includeTimestamps = true } = options

  const lines: string[] = []

  // Header
  lines.push('# Conversation Transcript')
  lines.push('')
  lines.push(`**Exported:** ${new Date().toISOString()}`)
  lines.push(`**Message Count:** ${messages.length}`)
  lines.push('')

  // Messages
  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Assistant' : '⚙️ System'
    lines.push(`## ${roleLabel}`)

    if (includeTimestamps && msg.timestamp) {
      const date = new Date(msg.timestamp)
      lines.push(`*${date.toLocaleString()}*`)
    }

    lines.push('')
    lines.push(msg.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format transcript as Plain Text
 *
 * @param messages - Array of transcript messages
 * @param options - Format options
 * @returns Plain text formatted transcript
 */
export function formatAsPlainText(
  messages: TranscriptMessage[],
  options: { includeTimestamps?: boolean } = {}
): string {
  const { includeTimestamps = true } = options

  const lines: string[] = []

  lines.push('CONVERSATION TRANSCRIPT')
  lines.push(`Exported: ${new Date().toISOString()}`)
  lines.push(`Message Count: ${messages.length}`)
  lines.push(''.repeat(60))
  lines.push('')

  for (const msg of messages) {
    const roleLabel = msg.role.toUpperCase()

    lines.push(`${roleLabel}:`)
    if (includeTimestamps && msg.timestamp) {
      lines.push(`  ${new Date(msg.timestamp).toLocaleString()}`)
    }
    lines.push('')
    lines.push(msg.content)
    lines.push('')
    lines.push(''.repeat(60))
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format transcript as CSV
 *
 * @param messages - Array of transcript messages
 * @param options - Format options
 * @returns CSV formatted transcript
 */
export function formatAsCSV(
  messages: TranscriptMessage[],
  options: { includeTimestamps?: boolean } = {}
): string {
  const { includeTimestamps = true } = options

  const lines: string[] = []

  // Header
  const headers = ['Role', 'Content']
  if (includeTimestamps) {
    headers.push('Timestamp')
  }
  lines.push(headers.join(','))

  // Messages
  for (const msg of messages) {
    const row: string[] = [
      msg.role,
      escapeCSVField(msg.content)
    ]

    if (includeTimestamps && msg.timestamp) {
      row.push(new Date(msg.timestamp).toISOString())
    }

    lines.push(row.join(','))
  }

  return lines.join('\n')
}

/**
 * Fetch messages from database with filters
 *
 * @param agentDb - Agent database instance
 * @param options - Fetch options
 * @returns Array of transcript messages
 */
async function fetchMessages(
  agentDb: AgentDatabase,
  options: {
    conversationFile?: string
    startDate?: Date
    endDate?: Date
    maxMessages?: number
  } = {}
): Promise<TranscriptMessage[]> {
  const { conversationFile, startDate, endDate, maxMessages } = options

  const filters: string[] = []
  const params: string[] = []

  if (conversationFile) {
    filters.push(`conversation_file = ?`)
    params.push(conversationFile)
  }

  if (startDate) {
    filters.push(`ts >= ?`)
    params.push(startDate.getTime().toString())
  }

  if (endDate) {
    filters.push(`ts <= ?`)
    params.push(endDate.getTime().toString())
  }

  const whereClause = filters.length > 0 ? `, ${filters.join(' AND ')}` : ''

  let query = `?[msg_id, role, text, ts, metadata] := *messages{msg_id, role, text, ts, metadata}${whereClause} :order ts ASC`

  if (maxMessages) {
    query += ` :limit ${maxMessages}`
  }

  const result = await agentDb.run(query)

  if (!result.rows || result.rows.length === 0) {
    return []
  }

  return result.rows.map((row: unknown[]) => ({
    role: row[1] as 'user' | 'assistant' | 'system',
    content: row[2] as string,
    timestamp: row[3] as number,
    metadata: row[4] as Record<string, any> | undefined
  }))
}

/**
 * Generate default export path for transcript
 *
 * @param agentId - Agent ID
 * @param sessionId - Session ID
 * @param format - Export format
 * @returns Default file path
 */
function generateDefaultExportPath(
  agentId: string,
  sessionId: string,
  format: ExportFormat
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const extension = format === 'json' ? 'json' : format === 'markdown' ? 'md' : format === 'csv' ? 'csv' : 'txt'

  // Store in ~/.aimaestro/exports/
  const exportsDir = path.join(os.homedir(), '.aimaestro', 'exports')

  const filename = `${sessionId}-${timestamp}.${extension}`
  return path.join(exportsDir, filename)
}

/**
 * Escape CSV field value
 * Wraps in quotes and escapes internal quotes
 *
 * @param value - Field value to escape
 * @returns Escaped CSV field
 */
function escapeCSVField(value: string): string {
  if (!value) return '""'

  // If contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}
