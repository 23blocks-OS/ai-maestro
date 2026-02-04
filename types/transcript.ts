/**
 * Transcript Types for Phase 5 Features
 *
 * Defines interfaces for conversation transcripts used in export and playback.
 */

/**
 * Transcript entity - represents a stored conversation transcript
 */
export interface Transcript {
  id: string                  // Unique transcript identifier
  agentId: string              // Agent that owns this transcript
  sessionId: string            // Session this transcript belongs to
  startTime: number             // Unix timestamp of first message
  endTime: number               // Unix timestamp of last message
  messageCount: number           // Total number of messages
  filePath: string              // File path where transcript is stored
  format: TranscriptFormat       // Export format (json, markdown, plaintext, csv)
  createdAt: number             // Unix timestamp when transcript record was created
  updatedAt: number             // Unix timestamp when transcript record was last updated
}

/**
 * Individual message within a transcript
 */
export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system'  // Message role
  content: string                        // Message content/text
  timestamp?: number                     // Unix timestamp of message
  metadata?: Record<string, any>           // Optional metadata (e.g., model, tokens, etc.)
}

/**
 * Transcript format types (avoids circular dependency with types/export.ts)
 * Note: This duplicates ExportType from types/export.ts but is needed here
 * to avoid circular import issues.
 */
export type TranscriptFormat = 'json' | 'markdown' | 'plaintext' | 'csv'
