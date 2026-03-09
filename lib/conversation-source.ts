/**
 * ConversationSource — abstraction layer for conversation file discovery and parsing.
 * Decouples memory indexing, chat, and voice from Claude Code's specific file format.
 *
 * Each source knows how to:
 *   1. Discover conversation files for a given working directory
 *   2. Extract metadata (sessionId, cwd, timestamps, model names)
 *   3. Parse messages into a normalized format
 *   4. Read recent conversation turns (for voice/chat)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ============================================================================
// Normalized types — all sources produce these
// ============================================================================

export interface ConversationFile {
  path: string
  sessionId: string | null
  cwd: string | null
  mtime: number
}

export interface ConversationMetadata {
  sessionId: string | null
  cwd: string | null
  firstUserMessage: string | null
  gitBranch: string | null
  claudeVersion: string | null
  firstMessageAt: number | null
  lastMessageAt: number | null
  modelNames: string
  messageCount: number
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system'
  text: string
  timestamp?: string
}

export interface ConversationMessage {
  type?: string
  role?: string
  message?: any
  content?: any
  timestamp?: string
  uuid?: string
  sessionId?: string
  cwd?: string
  gitBranch?: string
  version?: string
  [key: string]: any
}

// ============================================================================
// ConversationSource interface
// ============================================================================

export interface ConversationSource {
  /** Source name (e.g., "claude-code", "terminal-logs") */
  readonly name: string

  /**
   * Discover all conversation files, optionally filtered by working directories.
   * Returns files with lightweight metadata extracted from headers.
   */
  discoverFiles(workingDirectories?: string[]): ConversationFile[]

  /**
   * Get the conversation directory for a specific working directory.
   * Returns null if no directory exists.
   */
  getConversationDir(workingDirectory: string): string | null

  /**
   * Find the most recent conversation file for a working directory.
   * Returns null if none found.
   */
  findMostRecentFile(workingDirectory: string): ConversationFile | null

  /**
   * Extract full metadata from a conversation file.
   */
  extractMetadata(filePath: string, projectPath?: string): ConversationMetadata

  /**
   * Read recent conversation turns from a file (for voice/chat context).
   */
  readRecentTurns(filePath: string, maxTurns: number): ConversationTurn[]

  /**
   * Parse raw messages from a file starting at a line offset.
   * Used for delta indexing.
   */
  parseMessages(filePath: string, startLine?: number): ConversationMessage[]
}

// ============================================================================
// Claude Code source — reads ~/.claude/projects/*.jsonl
// ============================================================================

export class ClaudeCodeSource implements ConversationSource {
  readonly name = 'claude-code'

  private get projectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects')
  }

  discoverFiles(workingDirectories?: string[]): ConversationFile[] {
    if (!fs.existsSync(this.projectsDir)) return []

    const allFiles = this.findJsonlRecursive(this.projectsDir)
    const results: ConversationFile[] = []

    for (const filePath of allFiles) {
      const { sessionId, cwd } = this.readFileHeader(filePath)

      if (workingDirectories && workingDirectories.length > 0) {
        if (!cwd || !workingDirectories.includes(cwd)) continue
      }

      let mtime = 0
      try { mtime = fs.statSync(filePath).mtimeMs } catch { /* skip */ }

      results.push({ path: filePath, sessionId, cwd, mtime })
    }

    return results
  }

  getConversationDir(workingDirectory: string): string | null {
    const projectDirName = workingDirectory.replace(/\//g, '-')
    const dir = path.join(this.projectsDir, projectDirName)
    return fs.existsSync(dir) ? dir : null
  }

  findMostRecentFile(workingDirectory: string): ConversationFile | null {
    const dir = this.getConversationDir(workingDirectory)
    if (!dir) return null

    const jsonlPaths = this.findJsonlRecursive(dir)
    if (jsonlPaths.length === 0) return null

    let best: { path: string; mtime: number } | null = null
    for (const p of jsonlPaths) {
      try {
        const mtime = fs.statSync(p).mtimeMs
        if (!best || mtime > best.mtime) best = { path: p, mtime }
      } catch { /* skip */ }
    }

    if (!best) return null

    const { sessionId, cwd } = this.readFileHeader(best.path)
    return { path: best.path, sessionId, cwd, mtime: best.mtime }
  }

  extractMetadata(filePath: string, projectPath?: string): ConversationMetadata {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const allLines = fileContent.split('\n').filter(line => line.trim())

    let sessionId: string | null = null
    let cwd: string | null = null
    let firstUserMessage: string | null = null
    let gitBranch: string | null = null
    let claudeVersion: string | null = null
    let firstMessageAt: number | null = null
    let lastMessageAt: number | null = null
    const modelSet = new Set<string>()

    for (const line of allLines.slice(0, 50)) {
      try {
        const msg = JSON.parse(line)
        if (msg.sessionId && !sessionId) sessionId = msg.sessionId
        if (msg.cwd && !cwd) cwd = msg.cwd
        if (msg.gitBranch && !gitBranch) gitBranch = msg.gitBranch
        if (msg.version && !claudeVersion) claudeVersion = msg.version
        if (msg.timestamp) {
          const ts = new Date(msg.timestamp).getTime()
          if (!firstMessageAt || ts < firstMessageAt) firstMessageAt = ts
        }
        if (msg.type === 'user' && msg.message?.content && !firstUserMessage) {
          const content = msg.message.content
          firstUserMessage = (typeof content === 'string' ? content : JSON.stringify(content))
            .substring(0, 100).replace(/[\n\r]/g, ' ').trim()
        }
        if (msg.type === 'assistant' && msg.message?.model) {
          const model = msg.message.model
          if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
          else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
          else if (model.includes('opus')) modelSet.add('Opus 4.5')
        }
      } catch { /* skip */ }
    }

    for (let i = allLines.length - 1; i >= Math.max(0, allLines.length - 20); i--) {
      try {
        const msg = JSON.parse(allLines[i])
        if (msg.timestamp) {
          lastMessageAt = new Date(msg.timestamp).getTime()
          break
        }
      } catch { /* skip */ }
    }

    return {
      sessionId,
      cwd: cwd || projectPath || null,
      firstUserMessage,
      gitBranch,
      claudeVersion,
      firstMessageAt,
      lastMessageAt,
      modelNames: Array.from(modelSet).join(', '),
      messageCount: allLines.length,
    }
  }

  readRecentTurns(filePath: string, maxTurns: number): ConversationTurn[] {
    let content: string
    try { content = fs.readFileSync(filePath, 'utf-8') } catch { return [] }

    const lines = content.split('\n').filter(line => line.trim())
    const turns: ConversationTurn[] = []

    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        const role = this.normalizeRole(msg)
        if (!role || role === 'system') continue

        const text = this.extractText(msg)
        if (text) {
          turns.push({ role, text: text.substring(0, 400), timestamp: msg.timestamp })
        }
      } catch { /* skip */ }
    }

    return turns.slice(-maxTurns)
  }

  parseMessages(filePath: string, startLine: number = 0): ConversationMessage[] {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const allLines = fileContent.split('\n').filter(line => line.trim())
    const messages: ConversationMessage[] = []

    for (let i = startLine; i < allLines.length; i++) {
      try {
        messages.push(JSON.parse(allLines[i]))
      } catch { /* skip */ }
    }

    return messages
  }

  // --- Private helpers ---

  private findJsonlRecursive(dir: string): string[] {
    const results: string[] = []
    try {
      for (const entry of fs.readdirSync(dir)) {
        const entryPath = path.join(dir, entry)
        try {
          const stat = fs.statSync(entryPath)
          if (stat.isDirectory()) {
            results.push(...this.findJsonlRecursive(entryPath))
          } else if (entry.endsWith('.jsonl')) {
            results.push(entryPath)
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return results
  }

  private readFileHeader(filePath: string): { sessionId: string | null; cwd: string | null } {
    let sessionId: string | null = null
    let cwd: string | null = null
    try {
      const fd = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(4096)
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0)
      fs.closeSync(fd)

      const header = buf.toString('utf-8', 0, bytesRead)
      const firstLine = header.split('\n')[0]
      if (firstLine) {
        const parsed = JSON.parse(firstLine)
        sessionId = parsed.sessionId || null
        cwd = parsed.cwd || null
      }
    } catch { /* skip */ }
    return { sessionId, cwd }
  }

  private normalizeRole(msg: any): 'user' | 'assistant' | 'system' | null {
    if (msg.type === 'human' || msg.role === 'user' || msg.type === 'user') return 'user'
    if (msg.type === 'assistant' || msg.role === 'assistant') return 'assistant'
    if (msg.type === 'system' || msg.role === 'system') return 'system'
    return null
  }

  private extractText(msg: any): string | null {
    if (typeof msg.message === 'string') return msg.message
    if (msg.message?.content) {
      if (typeof msg.message.content === 'string') return msg.message.content
      if (Array.isArray(msg.message.content)) {
        return msg.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join(' ')
      }
    }
    return null
  }
}

// ============================================================================
// Factory — returns source based on agent program
// ============================================================================

const claudeCodeSource = new ClaudeCodeSource()

export function getConversationSource(_program?: string): ConversationSource {
  // Currently only Claude Code is supported.
  // Future: add AiderSource, CursorSource, etc. based on program name.
  return claudeCodeSource
}
