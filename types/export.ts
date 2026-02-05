/**
 * Export Types for Phase 5 Features
 *
 * Defines interfaces for exporting transcripts in various formats.
 */

/**
 * Export format types
 */
export type ExportType = 'json' | 'markdown' | 'plaintext' | 'csv'

/**
 * Export job status
 */
export type ExportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Export job - tracks background export operations
 */
export interface ExportJob {
  id: string                                // Unique job identifier
  agentId: string                            // Agent that owns this export job
  agentName: string                          // Agent name for display
  sessionId?: string                          // Session being exported (optional for all sessions)
  type: ExportType                            // Export format type
  status: ExportJobStatus                     // Current job status
  createdAt: string                           // ISO 8601 timestamp when job was created
  startedAt?: string                          // ISO 8601 timestamp when job started processing
  completedAt?: string                       // ISO 8601 timestamp when job completed
  progress: number                            // Progress percentage (0-100)
  filePath?: string                           // Path to exported file (when completed)
  errorMessage?: string                       // Error message if job failed
}

/**
 * Export options - customize export behavior
 */
export interface ExportOptions {
  format: ExportType                         // Export format (required)
  outputPath?: string                        // Custom output file path
  startDate?: Date                           // Export messages after this date
  endDate?: Date                             // Export messages before this date
  includeMetadata?: boolean                  // Include message metadata in export
  includeTimestamps?: boolean               // Include timestamps in export
  conversationFile?: string                  // Export specific conversation file only
  maxMessages?: number                       // Limit number of messages to export
}

/**
 * Export result - result of an export operation
 */
export interface ExportResult {
  success: boolean                          // Whether export succeeded
  format: ExportType                          // Export format used
  filePath: string                           // Path to exported file
  messageCount: number                       // Number of messages exported
  duration?: number                           // Total duration in milliseconds (if timestamps available)
  error?: string                             // Error message if export failed
}

/**
 * Export request - parameters for starting an export
 */
export interface ExportRequest {
  agentId: string                            // Agent to export from
  sessionId?: string                          // Session to export (optional for all sessions)
  format: ExportType                            // Export format
  options?: Partial<ExportOptions>              // Optional export options
}
